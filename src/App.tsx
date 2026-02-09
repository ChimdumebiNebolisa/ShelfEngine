import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { db } from './db';
import Layout from './Layout';
import ChatPage from './pages/ChatPage';
import ImportPage from './pages/ImportPage';
import SearchPage from './pages/SearchPage';
import { ingestDeltas } from './sync/ingestDeltas';

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
    const handler = async (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== EXTENSION_SOURCE) return;
      if (event.data.type === 'SHELFENGINE_DELTAS' && Array.isArray(event.data.payload)) {
        const deltas = event.data.payload;
        await ingestDeltas(deltas);
        window.postMessage({ source: APP_SOURCE, type: 'SHELFENGINE_ACK', payload: deltas.length }, window.location.origin);
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
          className="btn"
          style={{
            padding: '0.5rem 1rem',
            fontSize: '1rem',
            border: '1px solid #3d5a80',
            borderRadius: 4,
            backgroundColor: '#2d4a6a',
            color: '#eaeaea',
            cursor: 'pointer',
          }}
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
    <Layout>
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/import" element={<ImportPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
