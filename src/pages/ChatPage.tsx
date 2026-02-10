import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getEmbeddingStats } from '../embeddings/embeddingService';
import { search } from '../search/searchService';
import type { SearchResult } from '../search/searchService';
import SearchResultCard from '../components/SearchResultCard';

const QUERY_HISTORY_KEY = 'shelfengine_query_history';
const QUERY_HISTORY_MAX = 20;

function loadQueryHistory(): string[] {
  try {
    const raw = localStorage.getItem(QUERY_HISTORY_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.slice(0, QUERY_HISTORY_MAX) : [];
    }
  } catch { /* ignore */ }
  return [];
}

function saveQueryHistory(history: string[]): void {
  try {
    localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(history));
  } catch { /* ignore */ }
}

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
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef('');

  useEffect(() => {
    getEmbeddingStats().then(setStats);
  }, []);

  useEffect(() => {
    setQueryHistory(loadQueryHistory());
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
    setHistoryIndex(-1);
    const next = [trimmed, ...queryHistory.filter((h) => h !== trimmed)].slice(0, QUERY_HISTORY_MAX);
    setQueryHistory(next);
    saveQueryHistory(next);
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') {
      if (queryHistory.length === 0) return;
      e.preventDefault();
      if (historyIndex < 0) draftRef.current = input;
      const next = historyIndex < queryHistory.length - 1 ? historyIndex + 1 : 0;
      setHistoryIndex(next);
      setInput(queryHistory[next]);
    } else if (e.key === 'ArrowDown') {
      if (historyIndex < 0) return;
      e.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setInput(next < 0 ? draftRef.current : queryHistory[next]);
    } else {
      setHistoryIndex(-1);
    }
  }

  const noBookmarks = stats != null && stats.total === 0;
  const canSend = stats != null && stats.withEmbedding > 0 && input.trim() !== '';
  const sending = turns.some((t) => t.loading);
  const isEmptyState =
    noBookmarks ||
    (stats != null && stats.total > 0 && stats.withEmbedding === 0) ||
    (turns.length === 0 && stats != null && stats.withEmbedding > 0);

  return (
    <div style={chatPageWrapperStyle}>
      <div style={chatboxStyle}>
      <header style={chatHeaderStyle}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Chat</h1>
        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#a0a0b0' }}>Ask in plain language to find your bookmarks</p>
      </header>

      <div style={getTurnsAreaStyle(isEmptyState)}>
        {noBookmarks && (
          <div style={emptyStateStyle}>
            <p style={{ margin: '0 0 0.5rem 0', color: '#a0a0b0' }}>No bookmarks yet. Import your Chrome bookmarks to get started.</p>
            <Link to="/import" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Import bookmarks</Link>
          </div>
        )}
        {stats != null && stats.total > 0 && stats.withEmbedding === 0 && (
          <div style={emptyStateStyle}>
            <p style={{ margin: '0 0 0.5rem 0', color: '#a0a0b0' }}>No index yet. Import bookmarks and click &quot;Build index&quot; first.</p>
            <Link to="/import" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Go to Import</Link>
          </div>
        )}
        {turns.length === 0 && stats != null && stats.withEmbedding > 0 && (
          <div style={emptyStateStyle}>
            <p style={{ margin: '0 0 0.75rem 0', color: '#808090' }}>Try a query:</p>
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
        {!noBookmarks && stats != null && stats.withEmbedding > 0 && turns.map((turn, i) => (
          <div key={i} style={turnBlockStyle}>
            <div style={userBubbleWrapStyle}>
              <div style={userBubbleStyle}>{turn.query}</div>
            </div>
            {turn.loading && (
              <div style={{ ...assistantBubbleStyle, padding: '0.75rem 1rem' }}>
                <span className="spinner" aria-hidden style={{ marginRight: '0.5rem' }} />
                Searching…
              </div>
            )}
            {turn.error && (
              <div style={{ ...assistantBubbleStyle, padding: '0.75rem 1rem', borderColor: 'rgba(224,160,160,0.3)' }}>
                <span style={{ color: '#e0a0a0' }}>{turn.error}</span>
              </div>
            )}
            {!turn.loading && turn.results !== null && (
              <>
                {turn.results.length === 0 ? (
                  <div style={{ ...assistantBubbleStyle, padding: '0.75rem 1rem' }}>
                    <p style={{ margin: 0, color: '#a0a0b0' }}>No bookmarks match your query.</p>
                  </div>
                ) : (
                  <div style={assistantBubbleStyle}>
                    <div style={{ fontSize: '0.8rem', color: '#808090', marginBottom: '0.5rem' }}>Matches</div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {turn.results.map((r) => (
                        <SearchResultCard key={r.bookmark.id} result={r} />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={inputBarStyle}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={noBookmarks ? 'Import bookmarks to get started' : (stats != null && stats.withEmbedding > 0 ? 'Ask about your bookmarks...' : 'Build index on Import to enable search')}
          disabled={noBookmarks || !(stats != null && stats.withEmbedding > 0)}
          style={noBookmarks || !(stats != null && stats.withEmbedding > 0) ? { ...inputFieldStyle, backgroundColor: '#1e1e2e', opacity: 0.8 } : inputFieldStyle}
          autoFocus
        />
        <button type="submit" disabled={noBookmarks || !canSend || sending} className="btn btn-primary" title={noBookmarks ? 'Import bookmarks first' : undefined} style={sendButtonStyle}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
      </div>
    </div>
  );
}

const chatPageWrapperStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  minHeight: 0,
};

const chatboxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  flex: 1,
  width: '100%',
  maxWidth: 800,
  backgroundColor: '#1a1a2e',
  borderRadius: 8,
  border: '1px solid #2d2d44',
  overflow: 'hidden',
};

const chatHeaderStyle: React.CSSProperties = {
  padding: '1rem 1.25rem',
  borderBottom: '1px solid #2d2d44',
  flexShrink: 0,
  backgroundColor: '#1a1a2e',
};

const getTurnsAreaStyle = (isEmptyState: boolean): React.CSSProperties => ({
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: '1rem 1.25rem',
  ...(isEmptyState && {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  }),
});

const turnBlockStyle: React.CSSProperties = {
  marginBottom: '1.25rem',
};

const assistantBubbleStyle: React.CSSProperties = {
  padding: '1rem',
  borderRadius: 12,
  borderBottomLeftRadius: 4,
  backgroundColor: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  maxWidth: '100%',
  marginRight: 'auto',
  alignSelf: 'flex-start',
};

const emptyStateStyle: React.CSSProperties = {
  padding: '1.5rem 1rem',
};

const userBubbleWrapStyle: React.CSSProperties = {
  display: 'flex',
  marginBottom: '0.5rem',
};

const userBubbleStyle: React.CSSProperties = {
  padding: '0.6rem 1rem',
  borderRadius: 12,
  borderBottomRightRadius: 4,
  backgroundColor: 'rgba(126, 184, 218, 0.2)',
  maxWidth: '85%',
  marginLeft: 'auto',
  alignSelf: 'flex-end',
  fontSize: '0.95rem',
};

const inputBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  padding: '1rem 1.25rem',
  borderTop: '1px solid #2d2d44',
  backgroundColor: '#1a1a2e',
  flexShrink: 0,
};

const inputFieldStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.75rem 1rem',
  fontSize: '1rem',
  border: '1px solid #2d2d44',
  borderRadius: 24,
  backgroundColor: '#252538',
  color: '#eaeaea',
  outline: 'none',
};

const sendButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  borderRadius: 24,
  padding: '0.75rem 1.25rem',
};

