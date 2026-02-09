import type { SearchResult } from '../search/searchService';

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  marginBottom: '0.75rem',
  border: '1px solid #2d2d44',
  borderRadius: 4,
  backgroundColor: 'rgba(255,255,255,0.03)',
};

interface SearchResultCardProps {
  result: SearchResult;
}

export default function SearchResultCard({ result }: SearchResultCardProps) {
  const { bookmark, whyMatched } = result;
  return (
    <li style={cardStyle}>
      <a href={bookmark.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: '#7eb8da' }}>
        {bookmark.title || bookmark.url}
      </a>
      <div style={{ fontSize: '0.85rem', color: '#a0a0b0', marginTop: '0.25rem' }}>
        <a href={bookmark.url} target="_blank" rel="noopener noreferrer" style={{ color: '#8a8aa0', wordBreak: 'break-all' }}>
          {bookmark.url}
        </a>
      </div>
      {bookmark.folderPath && (
        <div style={{ fontSize: '0.8rem', color: '#808090', marginTop: '0.2rem' }}>
          {bookmark.folderPath}
        </div>
      )}
      <div style={{ fontSize: '0.8rem', color: '#9ab8c8', marginTop: '0.35rem' }}>
        {whyMatched}
      </div>
    </li>
  );
}
