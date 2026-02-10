"use strict";
/**
 * ShelfEngine extension background: listen for bookmark events, normalize to deltas,
 * queue in chrome.storage.local when app is closed, send to content script when app is open.
 */
const STORAGE_KEY = 'shelfengine_delta_queue';
const SHELF_ORIGINS = [
    'http://localhost',
    'http://127.0.0.1',
    'https://localhost',
    'https://127.0.0.1',
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
async function sendDeltasToApp(deltas) {
    if (deltas.length === 0)
        return;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (!tab.id || !tab.url)
            continue;
        const origin = new URL(tab.url).origin;
        if (!SHELF_ORIGINS.some((o) => origin === o || tab.url?.startsWith(o + '/')))
            continue;
        try {
            await chrome.tabs.sendMessage(tab.id, { type: 'SHELFENGINE_DELTAS', payload: deltas });
        }
        catch {
            // Tab might not have content script ready
        }
    }
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
    return false;
});
