export function LogoMark({ size = 30 }) {
  return (
    <img
      src="/movesmart-logo.webp"
      alt=""
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
    />
  );
}

export default function Logo({ size = 24, light = false, withMark = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      {withMark && <LogoMark size={Math.round(size * 1.45)} />}
      <span style={{
        fontFamily: 'var(--font-heading)',
        fontSize: Math.round(size * 0.85),
        fontWeight: 800,
        letterSpacing: '-0.02em',
        color: light ? '#ffffff' : 'var(--primary)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        MoveSmart
      </span>
    </div>
  );
}
