import { Link } from 'react-router-dom';

const PREFILL_KEY = 'shelfengine_prefill';

const exampleQueries = [
  'that article about React hooks',
  'tool I saved for coupon codes',
  'GitHub repo about embeddings',
];

export default function LandingPage() {
  function handleChipClick(text: string) {
    sessionStorage.setItem(PREFILL_KEY, text);
  }

  return (
    <div>
      <section className="hero">
        <h1 className="hero-headline">A search engine for your bookmarks.</h1>
        <p className="hero-subtitle">Type what you remember using keywords or natural language. All on your device.</p>
        <div className="hero-cta">
          <Link to="/import" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Import bookmarks
          </Link>
          <a href="#example-queries" className="hero-link">
            See example queries
          </a>
        </div>
      </section>

      <section id="example-queries" className="landing-card">
        <h2 className="landing-card-title">Try asking:</h2>
        <div className="example-chips">
          {exampleQueries.map((text) => (
            <Link
              key={text}
              to="/chat"
              className="example-chip"
              onClick={() => handleChipClick(text)}
            >
              {text}
            </Link>
          ))}
        </div>
      </section>

      <section className="landing-card">
        <ul className="landing-compact-list">
          <li>1. Import bookmarks.html</li>
          <li>2. Build a local index</li>
          <li>3. Search or ask in plain language</li>
        </ul>
      </section>

      <section className="landing-card">
        <ul className="landing-bullets">
          <li>Data stays in your browser</li>
          <li>No account required</li>
          <li>Find by intent, not folders</li>
        </ul>
      </section>
    </div>
  );
}
