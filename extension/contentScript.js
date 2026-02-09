"use strict";
/**
 * Content script: runs only on ShelfEngine origin. Requests queued deltas from background,
 * forwards to page via postMessage. Listens for SHELFENGINE_READY from page and SHELFENGINE_ACK to clear queue.
 */
const SOURCE = 'shelfengine-extension';
function postToPage(type, payload) {
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
    }
    if (event.data.type === 'SHELFENGINE_ACK') {
        const count = typeof event.data.payload === 'number' ? event.data.payload : 0;
        chrome.runtime.sendMessage({ type: 'SHELFENGINE_ACK', payload: count });
    }
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SHELFENGINE_DELTAS' && Array.isArray(msg.payload)) {
        postToPage('SHELFENGINE_DELTAS', msg.payload);
    }
    sendResponse();
});
