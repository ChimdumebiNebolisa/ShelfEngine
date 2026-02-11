"use strict";
/**
 * Content script: runs only on ShelfEngine origin. Requests queued deltas from background,
 * forwards to page via postMessage. Listens for SHELFENGINE_READY from page and SHELFENGINE_ACK to clear queue.
 */
const SOURCE = 'shelfengine-extension';
const RESYNC_CHUNK_SIZE_RESYNC = 500;
console.log('[ShelfEngine] content script injected on', window.location.href);
function postToPage(type, payload) {
    console.log('[ShelfEngine] content script posting to page', type, payload != null ? '(payload)' : '');
    window.postMessage({ source: SOURCE, type, payload }, window.location.origin);
}
window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'shelfengine-app')
        return;
    if (event.data.type === 'SHELFENGINE_READY') {
        chrome.runtime.sendMessage({ type: 'SHELFENGINE_GET_QUEUE' }, (response) => {
            const deltas = response?.deltas ?? [];
            if (deltas.length > 0) {
                postToPage('SHELFENGINE_DELTAS', deltas);
            }
        });
        chrome.runtime.sendMessage({ type: 'SHELFENGINE_GET_PENDING_RESYNC' }, (response) => {
            const batch = response?.batch ?? [];
            if (batch.length === 0)
                return;
            for (let i = 0; i < batch.length; i += RESYNC_CHUNK_SIZE_RESYNC) {
                const chunk = batch.slice(i, i + RESYNC_CHUNK_SIZE_RESYNC);
                const lastChunk = i + RESYNC_CHUNK_SIZE_RESYNC >= batch.length;
                postToPage('SHELFENGINE_RESYNC', { items: chunk, lastChunk });
            }
        });
    }
    if (event.data.type === 'SHELFENGINE_ACK') {
        const count = typeof event.data.payload === 'number' ? event.data.payload : 0;
        chrome.runtime.sendMessage({ type: 'SHELFENGINE_ACK', payload: count });
    }
    if (event.data.type === 'SHELFENGINE_RESYNC_ACK') {
        const count = typeof event.data.payload === 'number' ? event.data.payload : 0;
        chrome.runtime.sendMessage({ type: 'SHELFENGINE_RESYNC_ACK', payload: count });
    }
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SHELFENGINE_DELTAS' && Array.isArray(msg.payload)) {
        postToPage('SHELFENGINE_DELTAS', msg.payload);
    }
    if (msg.type === 'SHELFENGINE_RESYNC' && msg.payload != null && typeof msg.payload === 'object') {
        const pl = msg.payload;
        postToPage('SHELFENGINE_RESYNC', pl);
    }
    sendResponse();
});
