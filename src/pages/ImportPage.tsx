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
  const [dropZoneHover, setDropZoneHover] = useState(false);
  const [removeConfirmValue, setRemoveConfirmValue] = useState('');
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function refreshStats() {
    getEmbeddingStats().then(setStats);
  }

  useEffect(() => {
    refreshStats();
  }, [status]);

  async function processFile(file: File | null) {
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
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    processFile(e.target.files?.[0] ?? null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropZoneHover(false);
    processFile(e.dataTransfer.files?.[0] ?? null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDropZoneHover(true);
  }

  function handleDragLeave() {
    setDropZoneHover(false);
  }

  async function handleBuildIndex() {
    setIndexing(true);
    setIndexProgress({ done: 0, total: 1, error: null });
    const result = await buildIndex((p) => setIndexProgress(p));
    setIndexing(false);
    if (!result.error) refreshStats();
  }

  async function handleRemoveAll() {
    if (removeConfirmValue.trim().toUpperCase() !== 'DELETE') return;
    setShowRemoveConfirm(false);
    setRemoveConfirmValue('');
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
          <li>In Chrome, go to bookmarks, select bookmark manager and export (bookmarks.html).</li>
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

      <div style={{ marginBottom: '1rem', position: 'relative' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".html,text/html"
          onChange={handleFile}
          disabled={importing}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
          aria-hidden
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => { if (!importing) inputRef.current?.click(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            padding: '2rem',
            border: `2px dashed ${dropZoneHover ? '#7eb8da' : '#2d2d44'}`,
            borderRadius: 8,
            backgroundColor: dropZoneHover ? 'rgba(126, 184, 218, 0.08)' : 'rgba(255,255,255,0.03)',
            textAlign: 'center',
            cursor: importing ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s ease, border-color 0.15s ease',
          }}
        >
          {importing ? 'Importing…' : 'Drop bookmarks.html here or click to choose'}
        </div>
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
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem', alignItems: 'flex-start' }}>
            <button
              type="button"
              className="btn"
              onClick={handleBuildIndex}
              disabled={indexing || stats.withEmbedding >= stats.total}
              style={primaryButtonStyle}
            >
              {indexing ? 'Indexing…' : 'Build index'}
            </button>
            {!showRemoveConfirm ? (
              <button
                type="button"
                className="btn"
                onClick={() => setShowRemoveConfirm(true)}
                disabled={importing || indexing || clearing}
                style={dangerButtonStyle}
              >
                {clearing ? 'Removing…' : 'Remove all bookmarks'}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.9rem' }}>
                  Type DELETE to confirm:
                  <input
                    type="text"
                    value={removeConfirmValue}
                    onChange={(e) => setRemoveConfirmValue(e.target.value)}
                    placeholder="DELETE"
                    style={{ marginLeft: '0.5rem', padding: '0.35rem 0.5rem', width: 120, border: '1px solid #2d2d44', borderRadius: 4, backgroundColor: '#252538', color: '#eaeaea' }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowRemoveConfirm(false); setRemoveConfirmValue(''); } }}
                    autoFocus
                  />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn" style={primaryButtonStyle} onClick={handleRemoveAll} disabled={removeConfirmValue.trim().toUpperCase() !== 'DELETE'}>
                    Confirm
                  </button>
                  <button type="button" className="btn" style={dangerButtonStyle} onClick={() => { setShowRemoveConfirm(false); setRemoveConfirmValue(''); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          {indexing && indexProgress && indexProgress.total > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ height: 6, backgroundColor: '#2d2d44', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(indexProgress.done / indexProgress.total) * 100}%`,
                    backgroundColor: '#7eb8da',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.9rem' }}>
                Indexing… {indexProgress.done}/{indexProgress.total}
                {indexProgress.error && (
                  <span style={{ color: '#e0a0a0', marginLeft: '0.5rem' }}>{indexProgress.error}</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '1rem',
  border: '1px solid #3d5a80',
  borderRadius: 4,
  backgroundColor: '#2d4a6a',
  color: '#eaeaea',
  cursor: 'pointer',
};

const dangerButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '1rem',
  border: '1px solid rgba(180,80,80,0.6)',
  borderRadius: 4,
  backgroundColor: 'rgba(180,80,80,0.3)',
  color: '#eaeaea',
  cursor: 'pointer',
};
