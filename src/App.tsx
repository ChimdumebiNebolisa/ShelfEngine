import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { db } from './db';
import Layout from './Layout';
import ImportPage from './pages/ImportPage';
import SearchPage from './pages/SearchPage';

function App() {
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    db.open().catch((err) => setDbError(err?.message ?? 'Failed to open database'));
  }, []);

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
        <Route path="/import" element={<ImportPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
