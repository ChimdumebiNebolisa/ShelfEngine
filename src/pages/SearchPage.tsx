import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getEmbeddingStats } from '../embeddings/embeddingService';
import { search, getFilterOptions } from '../search/searchService';
import type { SearchFilters, SearchResult } from '../search/searchService';
import SearchResultCard from '../components/SearchResultCard';

const DEBOUNCE_MS = 380;

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ dateRange: 'any' });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<{ folders: string[]; domains: string[] }>({ folders: [], domains: [] });
  const [stats, setStats] = useState<{ total: number; withEmbedding: number } | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    getFilterOptions().then(setFilterOptions);
    getEmbeddingStats().then(setStats);
  }, []);

  const canSearch = stats != null && stats.total > 0;
  const queryNonEmpty = query.trim() !== '';

  useEffect(() => {
    if (!queryNonEmpty || !canSearch) return;
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
  }, [query, filters, canSearch, queryNonEmpty]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSearch || !queryNonEmpty) return;
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
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

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Search</h1>
      <p>Find bookmarks by keyword or natural-language query.</p>

      {stats != null && stats.total > 0 && stats.withEmbedding === 0 && (
        <div style={{ padding: '0.75rem', backgroundColor: 'rgba(200,160,80,0.2)', borderRadius: 4 }}>
          <p style={{ margin: '0 0 0.5rem 0' }}>Keyword-only until you build the index. Import then &quot;Build index&quot; for natural-language search.</p>
          <Link to="/import" className="btn" style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none' }}>Go to Import</Link>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={canSearch ? 'Search by keyword or phrase...' : 'Build index on Import to enable search'}
            disabled={!canSearch}
            style={canSearch ? inputStyle : { ...inputStyle, backgroundColor: '#1e1e2e' }}
            autoFocus
          />
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
        <button type="submit" disabled={!canSearch || loading || !queryNonEmpty} className="btn" style={buttonStyle}>
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

      {hasSearched && !loading && results.length === 0 && canSearch && queryNonEmpty && !error && (
        <p style={{ color: '#a0a0b0' }}>No bookmarks match your query.</p>
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

const buttonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '1rem',
  border: '1px solid #3d5a80',
  borderRadius: 4,
  backgroundColor: '#2d4a6a',
  color: '#eaeaea',
  cursor: 'pointer',
};
