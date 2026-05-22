export default function Question({ eyebrow, title, sub, size = 'md' }) {
  return (
    <div>
      {eyebrow && (
        <div style={{
          fontSize: 11.5, fontWeight: 600, color: 'var(--accent)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          marginBottom: 10,
        }}>{eyebrow}</div>
      )}
      <h1 style={{
        margin: 0,
        fontSize: size === 'lg' ? 30 : 24,
        fontWeight: 700, letterSpacing: '-0.024em',
        lineHeight: 1.18, color: 'var(--ink)',
        textWrap: 'balance',
      }}>{title}</h1>
      {sub && (
        <p style={{
          margin: '8px 0 0', fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink-3)',
          textWrap: 'pretty',
        }}>{sub}</p>
      )}
    </div>
  );
}
