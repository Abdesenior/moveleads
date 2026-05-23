export default function Eyebrow({ children }) {
  return (
    <div style={{
      fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)',
      letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10,
    }}>{children}</div>
  );
}
