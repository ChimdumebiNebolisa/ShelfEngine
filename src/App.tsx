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
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Could not open database: {dbError}</p>
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
