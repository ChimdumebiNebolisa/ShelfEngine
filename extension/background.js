"use strict";
/**
 * ShelfEngine extension background: listen for bookmark events, normalize to deltas,
 * queue in chrome.storage.local when app is closed, send to content script when app is open.
 */
const STORAGE_KEY = 'shelfengine_delta_queue';
const PENDING_RESYNC_BATCH_KEY = 'shelfengine_pending_resync';
const LAST_SYNC_TIME_KEY = 'shelfengine_last_sync_time';
const RESYNC_CHUNK_SIZE = 500;
const SHELF_ORIGINS = [
    'http://localhost',
    'http://127.0.0.1',
    'https://localhost',
    'https://127.0.0.1',
    'https://shelf-engine.vercel.app',
];
function getDomain(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    }
    catch {
        return '';
    }
}
function normalizeUrl(url) {
    try {
        const u = new URL(url);
        u.hash = '';
        const path = u.pathname.replace(/\/+$/, '') || '/';
        return `${u.protocol}//${u.hostname.toLowerCase()}${path}`;
    }
    catch {
        return url;
    }
}
async function getFolderPath(parentId) {
    if (!parentId || parentId === '0' || parentId === '1' || parentId === '2')
        return '';
    const path = [];
    let currentId = parentId;
    while (currentId && currentId !== '1' && currentId !== '2') {
        const nodes = await chrome.bookmarks.get(currentId);
        const node = nodes[0];
        if (!node)
            break;
        path.unshift(node.title || '');
        currentId = node.parentId;
    }
    return path.filter(Boolean).join('/');
}
/** Flatten bookmark tree to list of ResyncItems with folderPath (URL-canonical, lossy dedupe by url). */
function flattenBookmarkTree(nodes, folderPrefix) {
    const items = [];
    for (const node of nodes) {
        const segment = (node.title || '').trim();
        const nextPrefix = folderPrefix ? (segment ? folderPrefix + '/' + segment : folderPrefix) : segment;
        if (node.url) {
            items.push({
                url: normalizeUrl(node.url),
                title: (node.title || node.url).trim() || node.url,
                folderPath: folderPrefix,
                addDate: node.dateAdded != null ? Math.floor(node.dateAdded / 1000) : null,
                domain: getDomain(node.url),
            });
        }
        if (node.children?.length) {
            items.push(...flattenBookmarkTree(node.children, nextPrefix));
        }
    }
    return items;
}
async function nodeToUpsert(node) {
    if (!node.url)
        return null;
    const parentId = node.parentId;
    const folderPath = await getFolderPath(parentId);
    return {
        url: normalizeUrl(node.url),
        title: node.title || node.url,
        folderPath,
        addDate: node.dateAdded != null ? Math.floor(node.dateAdded / 1000) : null,
        domain: getDomain(node.url),
    };
}
async function pushDelta(delta) {
    const raw = await chrome.storage.local.get(STORAGE_KEY);
    const list = Array.isArray(raw[STORAGE_KEY]) ? raw[STORAGE_KEY] : [];
    list.push(delta);
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
}
async function getQueue() {
    const raw = await chrome.storage.local.get(STORAGE_KEY);
    const list = raw[STORAGE_KEY];
    return Array.isArray(list) ? [...list] : [];
}
async function clearQueue() {
    await chrome.storage.local.remove(STORAGE_KEY);
}
/** Remove the first n items from the queue (used after app acks a batch). */
async function removeFromQueueFront(n) {
    if (n <= 0)
        return;
    const list = await getQueue();
    const remaining = list.slice(n);
    if (remaining.length > 0) {
        await chrome.storage.local.set({ [STORAGE_KEY]: remaining });
    }
    else {
        await chrome.storage.local.remove(STORAGE_KEY);
    }
}
async function getPendingResyncBatch() {
    const raw = await chrome.storage.local.get(PENDING_RESYNC_BATCH_KEY);
    const list = raw[PENDING_RESYNC_BATCH_KEY];
    return Array.isArray(list) ? [...list] : [];
}
async function setPendingResyncBatch(items) {
    if (items.length === 0) {
        await chrome.storage.local.remove(PENDING_RESYNC_BATCH_KEY);
    }
    else {
        await chrome.storage.local.set({ [PENDING_RESYNC_BATCH_KEY]: items });
    }
}
async function clearPendingResyncBatch() {
    await chrome.storage.local.remove(PENDING_RESYNC_BATCH_KEY);
}
async function getLastSyncTime() {
    const raw = await chrome.storage.local.get(LAST_SYNC_TIME_KEY);
    const v = raw[LAST_SYNC_TIME_KEY];
    return typeof v === 'number' ? v : null;
}
async function setLastSyncTime(ms) {
    await chrome.storage.local.set({ [LAST_SYNC_TIME_KEY]: ms });
}
async function sendDeltasToApp(deltas) {
    if (deltas.length === 0)
        return;
    const tabs = await getShelfTabs();
    for (const tab of tabs) {
        if (!tab.id)
            continue;
        try {
            await chrome.tabs.sendMessage(tab.id, { type: 'SHELFENGINE_DELTAS', payload: deltas });
        }
        catch {
            // Tab might not have content script ready
        }
    }
}
async function getShelfTabs() {
    const tabs = await chrome.tabs.query({});
    return tabs.filter((tab) => {
        if (!tab.url)
            return false;
        try {
            const origin = new URL(tab.url).origin;
            return SHELF_ORIGINS.some((o) => origin === o || tab.url?.startsWith(o + '/'));
        }
        catch {
            return false;
        }
    });
}
/** Send resync batch to app in chunks. Does not clear pending; cleared on RESYNC_ACK. */
async function sendResyncToApp(batch) {
    if (batch.length === 0)
        return;
    const tabs = await getShelfTabs();
    if (tabs.length === 0)
        return;
    const chunks = [];
    for (let i = 0; i < batch.length; i += RESYNC_CHUNK_SIZE) {
        chunks.push(batch.slice(i, i + RESYNC_CHUNK_SIZE));
    }
    for (let i = 0; i < chunks.length; i++) {
        const payload = { items: chunks[i], lastChunk: i === chunks.length - 1 };
        for (const tab of tabs) {
            if (!tab.id)
                continue;
            try {
                await chrome.tabs.sendMessage(tab.id, { type: 'SHELFENGINE_RESYNC', payload });
            }
            catch {
                // Tab might not have content script ready
            }
        }
    }
    console.log('[ShelfEngine] resync sent to app', batch.length, 'items in', chunks.length, 'chunks');
}
async function notifyApp() {
    const deltas = await getQueue();
    if (deltas.length > 0)
        await sendDeltasToApp(deltas);
}
chrome.bookmarks.onCreated.addListener(async (_id, node) => {
    console.log('[ShelfEngine] bookmark onCreated', node.title ?? node.url);
    const upsert = await nodeToUpsert(node);
    if (!upsert)
        return;
    await pushDelta({ upsert });
    await notifyApp();
});
chrome.bookmarks.onChanged.addListener(async (id) => {
    console.log('[ShelfEngine] bookmark onChanged', id);
    const nodes = await chrome.bookmarks.get(id);
    const node = nodes[0];
    if (!node?.url)
        return;
    const upsert = await nodeToUpsert(node);
    if (!upsert)
        return;
    await pushDelta({ upsert });
    await notifyApp();
});
chrome.bookmarks.onMoved.addListener(async (id) => {
    console.log('[ShelfEngine] bookmark onMoved', id);
    const nodes = await chrome.bookmarks.get(id);
    const node = nodes[0];
    if (!node?.url)
        return;
    const upsert = await nodeToUpsert(node);
    if (!upsert)
        return;
    await pushDelta({ upsert });
    await notifyApp();
});
chrome.bookmarks.onRemoved.addListener(async (_id, removeInfo) => {
    console.log('[ShelfEngine] bookmark onRemoved', removeInfo.node?.title ?? removeInfo.node?.url);
    if (removeInfo.node?.url) {
        const url = normalizeUrl(removeInfo.node.url);
        await pushDelta({ remove: { url } });
        await notifyApp();
    }
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SHELFENGINE_GET_QUEUE') {
        getQueue().then((deltas) => {
            sendResponse({ deltas });
        });
        return true;
    }
    if (msg.type === 'SHELFENGINE_ACK') {
        const count = typeof msg.payload === 'number' ? msg.payload : 0;
        removeFromQueueFront(count).then(() => sendResponse({ ok: true }));
        return true;
    }
    if (msg.type === 'SHELFENGINE_GET_PENDING_RESYNC') {
        getPendingResyncBatch().then((batch) => {
            sendResponse({ batch });
        });
        return true;
    }
    if (msg.type === 'SHELFENGINE_RESYNC_ACK') {
        const count = typeof msg.payload === 'number' ? msg.payload : 0;
        clearPendingResyncBatch()
            .then(() => setLastSyncTime(Date.now()))
            .then(() => {
            console.log('[ShelfEngine] resync acked', count);
            sendResponse({ ok: true });
        });
        return true;
    }
    if (msg.type === 'RESYNC_ALL') {
        (async () => {
            try {
                console.log('[ShelfEngine] RESYNC_ALL started');
                const tree = await chrome.bookmarks.getTree();
                const roots = tree[0]?.children ?? [];
                const flat = [];
                for (const root of roots) {
                    flat.push(...flattenBookmarkTree(root.children ?? [], root.title ?? ''));
                }
                const deduped = Array.from(new Map(flat.map((item) => [item.url, item])).values());
                console.log('[ShelfEngine] RESYNC_ALL flattened', deduped.length, 'bookmarks');
                await setPendingResyncBatch(deduped);
                const shelfTabs = await getShelfTabs();
                if (shelfTabs.length > 0) {
                    await sendResyncToApp(deduped);
                }
                else {
                    console.log('[ShelfEngine] RESYNC_ALL queued (no ShelfEngine tab open)');
                }
                sendResponse({ ok: true, count: deduped.length });
            }
            catch (err) {
                console.error('[ShelfEngine] RESYNC_ALL error', err);
                sendResponse({ ok: false, error: String(err) });
            }
        })();
        return true;
    }
    return false;
});
