import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { db } from './db';
import AppLayout from './layouts/AppLayout';
import LandingLayout from './layouts/LandingLayout';
import ChatPage from './pages/ChatPage';
import ImportPage from './pages/ImportPage';
import LandingPage from './pages/LandingPage';
import SearchPage from './pages/SearchPage';
import { ingestDeltas, ingestResyncBatch, type ResyncItem } from './sync/ingestDeltas';

const EXTENSION_SOURCE = 'shelfengine-extension';
const APP_SOURCE = 'shelfengine-app';

function App() {
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    db.open()
      .then(() => {
        window.postMessage({ source: APP_SOURCE, type: 'SHELFENGINE_READY' }, window.location.origin);
      })
      .catch((err) => setDbError(err?.message ?? 'Failed to open database'));
  }, []);

  useEffect(() => {
    if (dbError) return;
    let resyncAccum: ResyncItem[] = [];
    const handler = async (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== EXTENSION_SOURCE) return;
      if (event.data.type === 'SHELFENGINE_DELTAS' && Array.isArray(event.data.payload)) {
        const deltas = event.data.payload;
        await ingestDeltas(deltas);
        window.postMessage({ source: APP_SOURCE, type: 'SHELFENGINE_ACK', payload: deltas.length }, window.location.origin);
      }
      if (event.data.type === 'SHELFENGINE_RESYNC' && event.data.payload != null) {
        const { items, lastChunk } = event.data.payload as { items?: ResyncItem[]; lastChunk?: boolean };
        if (Array.isArray(items)) resyncAccum.push(...items);
        if (lastChunk && resyncAccum.length > 0) {
          const batch = resyncAccum;
          resyncAccum = [];
          const { applied } = await ingestResyncBatch(batch);
          window.postMessage({ source: APP_SOURCE, type: 'SHELFENGINE_RESYNC_ACK', payload: applied }, window.location.origin);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [dbError]);

  if (dbError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', maxWidth: 800, margin: '0 auto' }}>
        <p style={{ marginBottom: '1rem' }}>Something went wrong opening local storage.</p>
        <p style={{ fontSize: '0.9rem', color: '#a0a0b0', marginBottom: '1.5rem' }}>{dbError}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            db.open()
              .then(() => setDbError(null))
              .catch((err) => setDbError(err?.message ?? 'Failed to open database'));
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingLayout><LandingPage /></LandingLayout>} />
      <Route path="/import" element={<AppLayout><ImportPage /></AppLayout>} />
      <Route path="/search" element={<AppLayout><SearchPage /></AppLayout>} />
      <Route path="/chat" element={<AppLayout><ChatPage /></AppLayout>} />
    </Routes>
  );
}

export default App;
