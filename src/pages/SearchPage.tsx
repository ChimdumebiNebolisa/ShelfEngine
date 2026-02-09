import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getEmbeddingStats } from '../embeddings/embeddingService';
import { search, getFilterOptions } from '../search/searchService';
import type { SearchFilters, SearchResult } from '../search/searchService';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ dateRange: 'any' });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<{ folders: string[]; domains: string[] }>({ folders: [], domains: [] });
  const [stats, setStats] = useState<{ total: number; withEmbedding: number } | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    getFilterOptions().then(setFilterOptions);
    getEmbeddingStats().then(setStats);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (stats != null && stats.withEmbedding === 0) {
      setError('Build the index first (Import page → Build index).');
      return;
    }
    setLoading(true);
    setHasSearched(false);
    try {
      const list = await search(query, filters);
      setResults(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  }

  const canSearch = stats != null && stats.withEmbedding > 0;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Search</h1>
      <p>Find bookmarks by keyword or natural-language query.</p>

      {stats != null && stats.total > 0 && stats.withEmbedding === 0 && (
        <p style={{ padding: '0.75rem', backgroundColor: 'rgba(200,160,80,0.2)', borderRadius: 4 }}>
          No index yet. <Link to="/import">Import bookmarks</Link> and click &quot;Build index&quot; to search.
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by keyword or phrase..."
            disabled={!canSearch}
            style={inputStyle}
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
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
        <button type="submit" disabled={!canSearch || loading} style={buttonStyle}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && (
        <p style={{ color: '#e0a0a0', marginBottom: '1rem' }}>{error}</p>
      )}

      {results.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {results.map((r) => (
            <li key={r.bookmark.id} style={cardStyle}>
              <a href={r.bookmark.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: '#7eb8da' }}>
                {r.bookmark.title || r.bookmark.url}
              </a>
              <div style={{ fontSize: '0.85rem', color: '#a0a0b0', marginTop: '0.25rem' }}>
                <a href={r.bookmark.url} target="_blank" rel="noopener noreferrer" style={{ color: '#8a8aa0', wordBreak: 'break-all' }}>
                  {r.bookmark.url}
                </a>
              </div>
              {r.bookmark.folderPath && (
                <div style={{ fontSize: '0.8rem', color: '#808090', marginTop: '0.2rem' }}>
                  {r.bookmark.folderPath}
                </div>
              )}
              <div style={{ fontSize: '0.8rem', color: '#9ab8c8', marginTop: '0.35rem' }}>
                {r.whyMatched}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasSearched && !loading && results.length === 0 && canSearch && query.trim() !== '' && !error && (
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

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  marginBottom: '0.75rem',
  border: '1px solid #2d2d44',
  borderRadius: 4,
  backgroundColor: 'rgba(255,255,255,0.03)',
};
