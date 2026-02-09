import { useState, useRef, useEffect } from 'react';
import { runImport, clearAllBookmarks, type ImportMode } from '../import/importService';
import { buildIndex, getEmbeddingStats } from '../embeddings/embeddingService';

export default function ImportPage() {
  const [mode, setMode] = useState<ImportMode>('merge');
  const [status, setStatus] = useState<{
    status: 'success' | 'failure' | null;
    counts: { added: number; skipped: number; failed: number };
    error: string | null;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState<{ total: number; withEmbedding: number } | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<{ done: number; total: number; error: string | null } | null>(null);
  const [clearing, setClearing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function refreshStats() {
    getEmbeddingStats().then(setStats);
  }

  useEffect(() => {
    refreshStats();
  }, [status]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setStatus(null);
    try {
      const result = await runImport(file, mode);
      setStatus({
        status: result.status,
        counts: result.counts,
        error: result.error,
      });
    } catch (err) {
      setStatus({
        status: 'failure',
        counts: { added: 0, skipped: 0, failed: 0 },
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  async function handleBuildIndex() {
    setIndexing(true);
    setIndexProgress({ done: 0, total: 1, error: null });
    const result = await buildIndex((p) => setIndexProgress(p));
    setIndexing(false);
    if (!result.error) refreshStats();
  }

  async function handleRemoveAll() {
    if (!window.confirm('Remove all bookmarks and clear the index? This cannot be undone.')) return;
    setClearing(true);
    try {
      await clearAllBookmarks();
      setStatus(null);
      refreshStats();
    } finally {
      setClearing(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Import</h1>
      <p>Upload a Chrome bookmarks export (bookmarks.html).</p>

      <details style={{ marginBottom: '1.5rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>How does this work?</summary>
        <ol style={{ margin: '0.5rem 0 0 1.25rem', padding: 0, color: '#b0b0c0' }}>
          <li>In Chrome, go to bookmarks and export (e.g. bookmarks.html).</li>
          <li>Upload the file here and choose Merge or Replace.</li>
          <li>Click &quot;Build index&quot; to generate embeddings for search.</li>
          <li>Use Search or Chat to find bookmarks by keyword or natural language.</li>
        </ol>
      </details>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Re-import behavior</label>
        <label style={{ marginRight: '1rem' }}>
          <input
            type="radio"
            name="mode"
            checked={mode === 'merge'}
            onChange={() => setMode('merge')}
            disabled={importing}
          />
          {' '}Merge (keep existing, add new, skip duplicates)
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'replace'}
            onChange={() => setMode('replace')}
            disabled={importing}
          />
          {' '}Replace (clear all bookmarks and re-import)
        </label>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".html,text/html"
          onChange={handleFile}
          disabled={importing}
        />
      </div>

      {importing && <p>Importing…</p>}

      {status && !importing && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: status.status === 'failure' ? 'rgba(180,80,80,0.2)' : 'rgba(80,140,80,0.2)',
            borderRadius: 4,
          }}
        >
          {status.status === 'failure' && status.error && (
            <p style={{ margin: '0 0 0.5rem 0', color: '#e0a0a0' }}>{status.error}</p>
          )}
          <p style={{ margin: 0 }}>
            Added: <strong>{status.counts.added}</strong>
            {' · '}
            Skipped (duplicates): <strong>{status.counts.skipped}</strong>
            {' · '}
            Failed: <strong>{status.counts.failed}</strong>
          </p>
        </div>
      )}

      {stats != null && stats.total > 0 && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4 }}>
          <p style={{ margin: '0 0 0.5rem 0' }}>
            Bookmarks: <strong>{stats.total}</strong>
            {' · '}
            Indexed: <strong>{stats.withEmbedding}</strong>
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={handleBuildIndex}
              disabled={indexing || stats.withEmbedding >= stats.total}
            >
              {indexing ? 'Indexing…' : 'Build index'}
            </button>
            <button
              type="button"
              onClick={handleRemoveAll}
              disabled={importing || indexing || clearing}
              style={{ backgroundColor: 'rgba(180,80,80,0.3)', border: '1px solid rgba(180,80,80,0.6)' }}
            >
              {clearing ? 'Removing…' : 'Remove all bookmarks'}
            </button>
          </div>
          {indexing && indexProgress && (
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
              Indexing… {indexProgress.done}/{indexProgress.total}
              {indexProgress.error && (
                <span style={{ color: '#e0a0a0', marginLeft: '0.5rem' }}>{indexProgress.error}</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
