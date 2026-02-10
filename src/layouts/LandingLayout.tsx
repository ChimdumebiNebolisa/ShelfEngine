import { Link } from 'react-router-dom';

interface LandingLayoutProps {
  children: React.ReactNode;
}

export default function LandingLayout({ children }: LandingLayoutProps) {
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <Link to="/" style={styles.brand}>
          ShelfEngine
        </Link>
      </header>
      <main style={styles.main}>{children}</main>
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
    justifyContent: 'space-between',
    paddingLeft: '1rem',
    paddingRight: '1rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  brand: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#eaeaea',
    textDecoration: 'none',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'auto',
    width: '100%',
  },
};
