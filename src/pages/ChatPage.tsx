import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getEmbeddingStats } from '../embeddings/embeddingService';
import { search, getFilterOptions } from '../search/searchService';
import type { SearchFilters, SearchResult } from '../search/searchService';
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
  const [filters, setFilters] = useState<SearchFilters>({ dateRange: 'any' });
  const [filterOptions, setFilterOptions] = useState<{ folders: string[]; domains: string[] }>({ folders: [], domains: [] });
  const [showScore, setShowScore] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionPrefix, setSuggestionPrefix] = useState('');
  const draftRef = useRef('');

  useEffect(() => {
    getEmbeddingStats().then(setStats);
    getFilterOptions().then(setFilterOptions);
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

  useEffect(() => {
    const m = input.match(/(?:folder|site|domain):(.*)$/i);
    if (m) {
      const prefix = m[1].toLowerCase();
      const op = input.slice(0, input.length - m[1].length).toLowerCase();
      const list = op.startsWith('folder') ? filterOptions.folders : filterOptions.domains;
      const filtered = list.filter((s) => s.toLowerCase().includes(prefix)).slice(0, 8);
      setSuggestions(filtered);
      setSuggestionPrefix(m[0].slice(0, -m[1].length));
    } else {
      setSuggestions([]);
    }
  }, [input, filterOptions.folders, filterOptions.domains]);

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
      const results = await search(trimmed, filters);
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

  return (
    <div style={pageStyle}>
      <div style={stickyHeaderStyle}>
        <h1 style={{ marginTop: 0 }}>Chat</h1>
        <p className="page-subtitle">Ask in plain language; you&apos;ll get matching bookmarks with why it matched as well as a similarity score.</p>

        {noBookmarks && (
          <div className="empty-state" style={{ marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.5rem 0' }}>No bookmarks yet. Import your Chrome bookmarks or try sample bookmarks to test the app.</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Link to="/import" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Import</Link>
              <Link to="/import" className="btn btn-secondary" style={{ display: 'inline-block', textDecoration: 'none' }}>Try sample bookmarks</Link>
            </div>
          </div>
        )}

        {stats != null && stats.total > 0 && stats.withEmbedding === 0 && (
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(200,160,80,0.2)', borderRadius: 4, marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.5rem 0' }}>No index yet. Import bookmarks and click &quot;Build index&quot; first.</p>
            <Link to="/import" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Go to Import</Link>
          </div>
        )}

        <details style={{ marginBottom: '0.75rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem' }}>Filters</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <label style={labelStyle}>
              Folder
              <select
                value={filters.folder ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, folder: e.target.value || undefined }))}
                style={selectStyle}
              >
                <option value="">All</option>
                {filterOptions.folders.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Domain
              <select
                value={filters.domain ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, domain: e.target.value || undefined }))}
                style={selectStyle}
              >
                <option value="">All</option>
                {filterOptions.domains.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Date added
              <select
                value={filters.dateRange ?? 'any'}
                onChange={(e) => setFilters((f) => ({ ...f, dateRange: (e.target.value as SearchFilters['dateRange']) ?? 'any' }))}
                style={selectStyle}
              >
                <option value="any">Any</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
          </div>
        </details>
        <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', position: 'relative', flex: 1, maxWidth: 500 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={noBookmarks ? 'Import bookmarks to get started' : (stats != null && stats.withEmbedding > 0 ? 'e.g. that article about React hooks...' : 'Build index on Import to enable search')}
                disabled={noBookmarks || !(stats != null && stats.withEmbedding > 0)}
                style={noBookmarks || !(stats != null && stats.withEmbedding > 0) ? { ...inputStyle, backgroundColor: '#1e1e2e' } : inputStyle}
              />
              {suggestions.length > 0 && (
                <ul style={suggestionsStyle}>
                  {suggestions.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        style={suggestionItemStyle}
                        onClick={() => {
                          setInput(suggestionPrefix + s);
                          setSuggestions([]);
                        }}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="submit" disabled={noBookmarks || !canSend || sending} className="btn btn-primary" title={noBookmarks ? 'Import bookmarks first' : undefined} style={{ flexShrink: 0 }}>
              {sending ? '…' : 'Send'}
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={showScore} onChange={(e) => setShowScore(e.target.checked)} />
            Show similarity score
          </label>
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
                        <SearchResultCard key={r.bookmark.id} result={r} showScore={showScore} />
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

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.9rem',
};

const selectStyle: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  border: '1px solid #2d2d44',
  borderRadius: 4,
  backgroundColor: '#252538',
  color: '#eaeaea',
  minWidth: 120,
};

const suggestionsStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  margin: 0,
  padding: '0.25rem 0',
  listStyle: 'none',
  backgroundColor: '#252538',
  border: '1px solid #2d2d44',
  borderRadius: 4,
  maxHeight: 200,
  overflowY: 'auto',
  zIndex: 10,
};

const suggestionItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.35rem 0.75rem',
  textAlign: 'left',
  border: 'none',
  backgroundColor: 'transparent',
  color: '#eaeaea',
  cursor: 'pointer',
  fontSize: '0.9rem',
};

