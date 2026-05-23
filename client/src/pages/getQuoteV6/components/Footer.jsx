export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer style={{
      width: '100%',
      padding: '20px 24px 24px',
      textAlign: 'center',
      background: 'transparent',
      fontSize: 11.5,
      color: 'var(--text-muted)',
      letterSpacing: '-0.005em',
    }}>
      <span>© {year} MoveSmart</span>
      <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
      <a href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Privacy</a>
      <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
      <a href="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Terms</a>
    </footer>
  );
}
