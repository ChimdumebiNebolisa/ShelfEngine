import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getEmbeddingStats } from '../embeddings/embeddingService';
import { search } from '../search/searchService';
import type { SearchResult } from '../search/searchService';
import SearchResultCard from '../components/SearchResultCard';

export interface ChatTurn {
  query: string;
  results: SearchResult[] | null;
  loading: boolean;
  error?: string;
}

export default function ChatPage() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [stats, setStats] = useState<{ total: number; withEmbedding: number } | null>(null);

  useEffect(() => {
    getEmbeddingStats().then(setStats);
  }, []);

  useEffect(() => {
    const prefill = sessionStorage.getItem('shelfengine_prefill');
    if (prefill) {
      setInput(prefill);
      sessionStorage.removeItem('shelfengine_prefill');
    }
  }, []);

  async function runQuery(trimmed: string) {
    if (!trimmed || (stats != null && stats.withEmbedding === 0)) return;
    setInput('');
    const newTurn: ChatTurn = { query: trimmed, results: null, loading: true };
    setTurns([newTurn]);

    try {
      const results = await search(trimmed, {});
      setTurns((prev) => {
        const single = prev[0];
        if (single && single.query === trimmed && single.loading) {
          return [{ ...single, results, loading: false }];
        }
        return prev;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setTurns((prev) => {
        const single = prev[0];
        if (single && single.query === trimmed && single.loading) {
          return [{ ...single, results: [], loading: false, error: message }];
        }
        return prev;
      });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    runQuery(trimmed);
  }

  const noBookmarks = stats != null && stats.total === 0;
  const canSend = stats != null && stats.withEmbedding > 0 && input.trim() !== '';
  const sending = turns.some((t) => t.loading);

  return (
    <div style={pageStyle}>
      <div style={stickyHeaderStyle}>
        <h1 style={{ marginTop: 0 }}>Chat</h1>
        <p className="page-subtitle">Ask in plain language; you&apos;ll get matching bookmarks with why it matched as well as a similarity score.</p>

        {noBookmarks && (
          <div className="empty-state" style={{ marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.5rem 0' }}>No bookmarks yet. Import your Chrome bookmarks to get started.</p>
            <Link to="/import" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Import</Link>
          </div>
        )}

        {stats != null && stats.total > 0 && stats.withEmbedding === 0 && (
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(200,160,80,0.2)', borderRadius: 4, marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.5rem 0' }}>No index yet. Import bookmarks and click &quot;Build index&quot; first.</p>
            <Link to="/import" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Go to Import</Link>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={noBookmarks ? 'Import bookmarks to get started' : (stats != null && stats.withEmbedding > 0 ? 'e.g. that article about React hooks...' : 'Build index on Import to enable search')}
              disabled={noBookmarks || !(stats != null && stats.withEmbedding > 0)}
              style={noBookmarks || !(stats != null && stats.withEmbedding > 0) ? { ...inputStyle, backgroundColor: '#1e1e2e' } : inputStyle}
            />
            <button type="submit" disabled={noBookmarks || !canSend || sending} className="btn btn-primary" title={noBookmarks ? 'Import bookmarks first' : undefined}>
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </form>
      </div>

      <div style={turnsAreaStyle}>
        {turns.length === 0 && stats != null && stats.withEmbedding > 0 && (
          <div style={emptyStateStyle}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {['that article about React hooks', 'tutorials I saved'].map((example) => (
                <button
                  key={example}
                  type="button"
                  className="btn btn-secondary"
                  style={{ borderRadius: 9999 }}
                  onClick={() => runQuery(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} style={turnBlockStyle}>
            <div style={userBubbleWrapStyle}>
              <div style={userBubbleStyle}>{turn.query}</div>
            </div>
            {turn.loading && (
              <div style={metaStyle}>
                <span className="spinner" aria-hidden />
                Searching…
              </div>
            )}
            {turn.error && <div style={errorStyle}>{turn.error}</div>}
            {!turn.loading && turn.results !== null && (
              <>
                {turn.results.length === 0 ? (
                  <div className="empty-state" style={{ marginTop: '0.25rem' }}>
                    <p style={{ margin: 0 }}>No bookmarks match your query.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '0.85rem', color: '#808090', marginBottom: '0.35rem' }}>Matches</div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {turn.results.map((r) => (
                        <SearchResultCard key={r.bookmark.id} result={r} />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  flex: 1,
};

const stickyHeaderStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  backgroundColor: '#1a1a2e',
  paddingBottom: '1rem',
  flexShrink: 0,
};

const turnsAreaStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
};

const turnBlockStyle: React.CSSProperties = {
  marginBottom: '1.25rem',
};

const emptyStateStyle: React.CSSProperties = {
  padding: '1.5rem 0',
};

const userBubbleWrapStyle: React.CSSProperties = {
  display: 'flex',
  marginBottom: '0.5rem',
};

const userBubbleStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: 4,
  backgroundColor: 'rgba(126, 184, 218, 0.15)',
  borderLeft: '3px solid #7eb8da',
  maxWidth: '80%',
  marginLeft: 'auto',
  alignSelf: 'flex-end',
};

const metaStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: '#a0a0b0',
  marginTop: '0.25rem',
};

const errorStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: '#e0a0a0',
  marginTop: '0.25rem',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  maxWidth: 400,
  padding: '0.5rem 0.75rem',
  fontSize: '1rem',
  border: '1px solid #2d2d44',
  borderRadius: 4,
  backgroundColor: '#252538',
  color: '#eaeaea',
};

