import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const SIDEBAR_BREAKPOINT = 768;

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(typeof window !== 'undefined' && window.innerWidth < SIDEBAR_BREAKPOINT);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${SIDEBAR_BREAKPOINT - 1}px)`);
    const handler = () => setIsNarrow(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  const isSearch = location.pathname.startsWith('/search');
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const sidebarStyle: React.CSSProperties = isNarrow
    ? {
        ...styles.sidebar,
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 20,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.2s ease',
      }
    : styles.sidebar;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        {isNarrow && (
          <button
            type="button"
            className="btn btn-secondary"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
            style={{ marginRight: '0.5rem', fontSize: '1.25rem', lineHeight: 1 }}
          >
            &#9776;
          </button>
        )}
        <span style={styles.headerBrand}>ShelfEngine</span>
      </header>
      {isNarrow && sidebarOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSidebarOpen(false); } }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 15,
            backgroundColor: 'rgba(0,0,0,0.4)',
            transition: 'opacity 0.2s ease',
          }}
        />
      )}
      <div style={styles.contentRow}>
        <aside style={sidebarStyle}>
          <nav style={styles.nav}>
            <Link to="/" style={styles.brandLink}>
              ShelfEngine
            </Link>
            <Link
              to="/import"
              style={{ ...styles.navLink, ...(isActive('/import') ? styles.navLinkActive : {}) }}
            >
              Import
            </Link>
            <Link
              to="/search"
              style={{ ...styles.navLink, ...(isSearch ? styles.navLinkActive : {}) }}
            >
              Search
            </Link>
            <Link
              to="/chat"
              style={{ ...styles.navLink, ...(isActive('/chat') ? styles.navLinkActive : {}) }}
            >
              Chat
            </Link>
            {isNarrow && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSidebarOpen(false)}
                style={{ marginTop: '1rem', width: '100%' }}
              >
                Close
              </button>
            )}
          </nav>
        </aside>
        <main style={{ ...styles.main, ...(isNarrow ? { paddingLeft: '4.25rem' } : {}) }}>{children}</main>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
  },
  header: {
    flexShrink: 0,
    height: 48,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '1rem',
    paddingRight: '1rem',
    backgroundColor: '#1a1a2e',
    borderBottom: '1px solid #2d2d44',
  },
  headerBrand: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#eaeaea',
  },
  contentRow: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    width: 200,
    flexShrink: 0,
    borderRight: '1px solid #2d2d44',
    padding: '1rem 1.5rem',
    backgroundColor: '#1a1a2e',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  brandLink: {
    padding: '0.5rem 1rem',
    marginBottom: '0.5rem',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#eaeaea',
    textDecoration: 'none',
  },
  navLink: {
    padding: '0.5rem 1rem',
    color: '#a0a0b0',
  },
  navLinkActive: {
    color: '#eaeaea',
    fontWeight: 600,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderLeft: '3px solid #7eb8da',
    marginLeft: '-3px',
    paddingLeft: 'calc(1rem + 3px)',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    padding: '1.5rem',
    overflow: 'auto',
    maxWidth: 800,
  },
};
