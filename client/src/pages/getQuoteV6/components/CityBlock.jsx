export default function CityBlock({ city, st, role, desktop }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--ink-3)',
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
      }}>{role}</div>
      <div style={{
        fontSize: desktop ? 32 : 26,
        fontWeight: 700, letterSpacing: '-0.025em',
        color: 'var(--ink)', lineHeight: 1.05,
      }}>
        {city}<span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>, {st}</span>
      </div>
    </div>
  );
}
