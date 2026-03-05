const DELTA_QUEUE_KEY = 'shelfengine_delta_queue';
const PENDING_RESYNC_KEY = 'shelfengine_pending_resync';
const LAST_SYNC_TIME_KEY = 'shelfengine_last_sync_time';
const SHELF_ORIGINS = [
  'https://shelf-engine.vercel.app',
  'http://localhost',
  'http://127.0.0.1'
];

function formatTime(ms) {
  if (ms == null) return '—';
  const d = new Date(ms);
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function updateStatus() {
  Promise.all([
    chrome.tabs.query({}),
    chrome.storage.local.get([DELTA_QUEUE_KEY, PENDING_RESYNC_KEY, LAST_SYNC_TIME_KEY])
  ]).then(([tabs, storage]) => {
    const connected = tabs.some((tab) => {
      if (!tab.url) return false;
      try {
        const origin = new URL(tab.url).origin;
        return SHELF_ORIGINS.some((o) => tab.url.startsWith(o + '/') || origin === o);
      } catch {
        return false;
      }
    });
    const queue = Array.isArray(storage[DELTA_QUEUE_KEY]) ? storage[DELTA_QUEUE_KEY].length : 0;
    const pendingResync = Array.isArray(storage[PENDING_RESYNC_KEY]) ? storage[PENDING_RESYNC_KEY].length : 0;
    const lastSync = storage[LAST_SYNC_TIME_KEY] ?? null;
    const lines = [
      'Connected: ' + (connected ? 'Yes' : 'No'),
      'Queue: ' + queue,
      'Pending resync: ' + pendingResync,
      'Last sync: ' + formatTime(lastSync)
    ];
    document.getElementById('status').textContent = lines.join(' · ');
  });
}

document.getElementById('open').addEventListener('click', function () {
  chrome.tabs.create({ url: 'https://shelf-engine.vercel.app' });
});

document.getElementById('resync').addEventListener('click', function () {
  const btn = this;
  btn.disabled = true;
  chrome.runtime.sendMessage({ type: 'RESYNC_ALL' }, (response) => {
    btn.disabled = false;
    updateStatus();
    if (response?.ok) {
      console.log('[ShelfEngine] Resync started', response.count);
    } else if (response?.error) {
      console.error('[ShelfEngine] Resync error', response.error);
    }
  });
});

updateStatus();
