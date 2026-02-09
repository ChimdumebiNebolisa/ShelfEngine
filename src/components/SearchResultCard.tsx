import type { SearchResult } from '../search/searchService';

const cardStyle: React.CSSProperties = {
  display: 'block',
  padding: '1rem',
  marginBottom: '0.75rem',
  border: '1px solid #2d2d44',
  borderRadius: 4,
  backgroundColor: 'rgba(255,255,255,0.03)',
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text: string, terms: string[]): React.ReactNode {
  if (!text || terms.length === 0) return text;
  const escaped = terms.map(escapeRegex);
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(re);
  const termsLower = terms.map((t) => t.toLowerCase());
  return parts.map((part, i) =>
    part && termsLower.includes(part.toLowerCase()) ? (
      <mark key={i} style={{ backgroundColor: 'rgba(126, 184, 218, 0.35)', borderRadius: 2 }}>{part}</mark>
    ) : (
      part
    )
  );
}

interface SearchResultCardProps {
  result: SearchResult;
}

function SearchResultCard({ result }: SearchResultCardProps) {
  const { bookmark, whyMatched, matchedTerms, score } = result;
  const title = bookmark.title || bookmark.url;
  const titleContent = matchedTerms?.length ? highlightText(title, matchedTerms) : title;
  const urlContent = matchedTerms?.length ? highlightText(bookmark.url, matchedTerms) : bookmark.url;
  const scorePct = Math.round(Math.min(1, Math.max(0, score)) * 100);

  return (
    <li>
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        className="result-card"
        style={cardStyle}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '1rem', fontWeight: 600, color: '#7eb8da' }}>{titleContent}</span>
          <span style={{ fontSize: '0.8rem', color: '#808090' }}>{scorePct}% match</span>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#a0a0b0', wordBreak: 'break-all' }}>
          {urlContent}
        </div>
        {bookmark.folderPath && (
          <div style={{ fontSize: '0.8rem', color: '#808090', marginTop: '0.2rem' }}>
            {bookmark.folderPath}
          </div>
        )}
        <div style={{ fontSize: '0.8rem', color: '#9ab8c8', marginTop: '0.35rem' }}>
          {whyMatched}
        </div>
      </a>
    </li>
  );
}

export default SearchResultCard;
export { SearchResultCard as ResultCard };
