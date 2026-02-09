import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isSearch = location.pathname === '/' || location.pathname.startsWith('/search');
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <nav style={styles.nav}>
          <Link
            to="/"
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
          <Link
            to="/import"
            style={{ ...styles.navLink, ...(isActive('/import') ? styles.navLinkActive : {}) }}
          >
            Import
          </Link>
        </nav>
      </aside>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    minHeight: '100vh',
  },
  sidebar: {
    width: 200,
    flexShrink: 0,
    borderRight: '1px solid #2d2d44',
    padding: '1rem 0',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  navLink: {
    padding: '0.5rem 1rem',
    color: '#a0a0b0',
  },
  navLinkActive: {
    color: '#eaeaea',
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
  },
};
