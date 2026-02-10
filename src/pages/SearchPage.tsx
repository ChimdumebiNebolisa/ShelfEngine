import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getEmbeddingStats } from '../embeddings/embeddingService';
import { search, getFilterOptions } from '../search/searchService';
import type { SearchFilters, SearchResult } from '../search/searchService';
import SearchResultCard from '../components/SearchResultCard';

const DEBOUNCE_MS = 380;
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

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ dateRange: 'any' });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<{ folders: string[]; domains: string[] }>({ folders: [], domains: [] });
  const [stats, setStats] = useState<{ total: number; withEmbedding: number } | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionPrefix, setSuggestionPrefix] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    setQueryHistory(loadQueryHistory());
  }, []);

  useEffect(() => {
    getFilterOptions().then(setFilterOptions);
    getEmbeddingStats().then(setStats);
  }, []);

  useEffect(() => {
    const m = query.match(/(?:folder|site|domain):(.*)$/i);
    if (m) {
      const prefix = m[1].toLowerCase();
      const op = query.slice(0, query.length - m[1].length).toLowerCase();
      const list = op.startsWith('folder') ? filterOptions.folders : filterOptions.domains;
      const filtered = list.filter((s) => s.toLowerCase().includes(prefix)).slice(0, 8);
      setSuggestions(filtered);
      setSuggestionPrefix(m[0].slice(0, -m[1].length));
    } else {
      setSuggestions([]);
    }
  }, [query, filterOptions.folders, filterOptions.domains]);

  const canSearch = stats != null && stats.total > 0;
  const queryNonEmpty = query.trim() !== '';
  const hasFilters = (filters.folder != null && filters.folder !== '') ||
    (filters.domain != null && filters.domain !== '') ||
    (filters.dateRange != null && filters.dateRange !== 'any');
  const shouldSearch = canSearch && (queryNonEmpty || hasFilters);

  useEffect(() => {
    if (!shouldSearch) return;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const version = ++requestVersionRef.current;
      setLoading(true);
      setError(null);
      search(query, filters).then(
        (list) => {
          if (version === requestVersionRef.current) {
            setResults(list);
            setHasSearched(true);
          }
        },
        (err) => {
          if (version === requestVersionRef.current) {
            setError(err instanceof Error ? err.message : 'Search failed');
            setResults([]);
            setHasSearched(true);
          }
        }
      ).finally(() => {
        if (version === requestVersionRef.current) setLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current != null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query, filters, shouldSearch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!shouldSearch) return;
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const q = query.trim();
    if (q && queryNonEmpty) {
      const next = [q, ...queryHistory.filter((h) => h !== q)].slice(0, QUERY_HISTORY_MAX);
      setQueryHistory(next);
      saveQueryHistory(next);
    }
    setHistoryIndex(-1);
    setLoading(true);
    setHasSearched(false);
    const version = ++requestVersionRef.current;
    try {
      const list = await search(query, filters);
      if (version === requestVersionRef.current) setResults(list);
    } catch (err) {
      if (version === requestVersionRef.current) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      }
    } finally {
      if (version === requestVersionRef.current) {
        setLoading(false);
        setHasSearched(true);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') {
      if (queryHistory.length === 0) return;
      e.preventDefault();
      if (historyIndex < 0) draftRef.current = query;
      const next = historyIndex < queryHistory.length - 1 ? historyIndex + 1 : 0;
      setHistoryIndex(next);
      setQuery(queryHistory[next]);
    } else if (e.key === 'ArrowDown') {
      if (historyIndex < 0) return;
      e.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setQuery(next < 0 ? draftRef.current : queryHistory[next]);
    } else {
      setHistoryIndex(-1);
    }
  }

  const noBookmarks = stats != null && stats.total === 0;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Search</h1>
      <p className="page-subtitle">Find bookmarks by keyword or natural-language query.</p>

      {noBookmarks && (
        <div className="empty-state" style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem 0' }}>No bookmarks yet. Import your Chrome bookmarks to get started.</p>
          <Link to="/import" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Import</Link>
        </div>
      )}

      {stats != null && stats.total > 0 && stats.withEmbedding === 0 && (
        <div style={{ padding: '0.75rem', backgroundColor: 'rgba(200,160,80,0.2)', borderRadius: 4, marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem 0' }}>Keyword-only until you build the index. Import then &quot;Build index&quot; for natural-language search.</p>
          <Link to="/import" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Go to Import</Link>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '0.75rem', position: 'relative', display: 'inline-block' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={canSearch ? 'Search by keyword or phrase...' : 'Build index on Import to enable search'}
            disabled={!canSearch}
            style={canSearch ? inputStyle : { ...inputStyle, backgroundColor: '#1e1e2e' }}
            autoFocus
          />
          {suggestions.length > 0 && (
            <ul style={suggestionsStyle}>
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    style={suggestionItemStyle}
                    onClick={() => {
                      setQuery(suggestionPrefix + s);
                      setSuggestions([]);
                    }}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {canSearch && !queryNonEmpty && !hasSearched && (
            <p style={{ fontSize: '0.85rem', color: '#808090', marginTop: '0.35rem' }}>Type to search or enter a keyword or phrase.</p>
          )}
        </div>
        <details style={{ marginBottom: '0.75rem' }} open>
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
        <button type="submit" disabled={noBookmarks || !shouldSearch || loading} className="btn btn-primary" title={noBookmarks ? 'Import bookmarks first' : undefined}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && (
        <p style={{ color: '#e0a0a0', marginBottom: '1rem' }}>{error}</p>
      )}

      {hasSearched && !loading && (
        <p style={{ fontSize: '0.9rem', color: '#a0a0b0', marginBottom: '0.5rem' }}>
          {results.length > 0 ? `${results.length} bookmark${results.length === 1 ? '' : 's'}` : 'No results'}
        </p>
      )}

      {results.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {results.map((r) => (
            <SearchResultCard key={r.bookmark.id} result={r} />
          ))}
        </ul>
      )}

      {hasSearched && !loading && results.length === 0 && canSearch && !error && (
        <div className="empty-state">
          <p style={{ margin: 0 }}>{queryNonEmpty ? 'No bookmarks match your query.' : 'No bookmarks match your filters.'}</p>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
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
  margin: 0,
  padding: '0.25rem 0',
  listStyle: 'none',
  backgroundColor: '#252538',
  border: '1px solid #2d2d44',
  borderRadius: 4,
  maxHeight: 200,
  overflowY: 'auto',
  zIndex: 10,
  minWidth: 300,
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

