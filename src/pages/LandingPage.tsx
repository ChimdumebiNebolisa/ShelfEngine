import { Link } from 'react-router-dom';
import HeroPreview from '../components/HeroPreview';

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
      <section className="landing-hero" aria-label="Hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-content">
            <span className="landing-hero-badge">Privacy-first bookmark search</span>
            <h1 className="landing-hero-headline">Local-first semantic search for your bookmarks.</h1>
            <p className="landing-hero-subheadline">Stop losing links you know you saved. Import bookmarks once, then search by keyword or natural language, all in your browser.</p>
            <div className="landing-hero-cta">
              <Link to="/import" className="btn hero2-btn-primary">
                Import bookmarks →
              </Link>
              <Link to="/import" className="btn hero2-btn-secondary">
                Try sample bookmarks
              </Link>
            </div>
            <div className="landing-hero-trust">
              <span className="landing-hero-trust-item">IndexedDB storage</span>
              <span className="landing-hero-trust-item">Embeddings in a Web Worker</span>
              <span className="landing-hero-trust-item">No account, no server</span>
            </div>
          </div>
          <div className="landing-hero-preview">
            <HeroPreview />
          </div>
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
