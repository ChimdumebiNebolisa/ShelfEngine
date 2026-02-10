import type { ReactNode } from 'react';

const QUERY_TERMS = ['pasta', 'recipe'];

function highlight(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text;
  const lower = text.toLowerCase();
  const term = terms.find((t) => lower.includes(t.toLowerCase()));
  if (!term) return text;
  const idx = lower.indexOf(term.toLowerCase());
  const len = term.length;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + len)}</mark>
      {highlight(text.slice(idx + len), terms)}
    </>
  );
}

export default function HeroPreview() {
  const results = [
    { title: 'One-Pot Lemon Herb Chicken', domain: 'epicurious.com', snippet: 'Bright, tender chicken with herbs and a quick pan sauce.', match: 62 },
    { title: 'Creamy Garlic Pasta', domain: 'bonappetit.com', snippet: 'Simple weeknight pasta with garlic, olive oil, and parmesan.', match: 78 },
    { title: 'Quick Weeknight Carbonara', domain: 'seriouseats.com', snippet: 'No cream, just egg, cheese, and guanciale for this classic pasta.', match: 85 },
    { title: '30-Minute Pasta Recipe', domain: 'allrecipes.com', snippet: 'A simple pasta recipe with pantry staples, ready in half an hour.', match: 94 },
  ].sort((a, b) => b.match - a.match);

  return (
    <div className="landing-hero-preview-card">
      <div className="landing-hero-preview-bar">
        <span className="landing-hero-pill landing-hero-pill-live">Live</span>
        <span className="landing-hero-pill landing-hero-pill-local">Local only</span>
      </div>
      <div className="landing-hero-preview-search-wrap">
        <input
          type="text"
          className="landing-hero-preview-search"
          placeholder="that pasta recipe I saved"
          defaultValue="that pasta recipe I saved"
          readOnly
          aria-hidden
          tabIndex={-1}
        />
      </div>
      <ul className="landing-hero-preview-results">
        {results.map((r, i) => (
          <li key={i} className="landing-hero-preview-row">
            <span className="landing-hero-preview-meta">
              <span className="landing-hero-preview-domain">{r.domain}</span>
              <span className="landing-hero-preview-match">{r.match}%</span>
            </span>
            <span className="landing-hero-preview-title">{highlight(r.title, QUERY_TERMS)}</span>
            <p className="landing-hero-preview-snippet">{highlight(r.snippet, QUERY_TERMS)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
