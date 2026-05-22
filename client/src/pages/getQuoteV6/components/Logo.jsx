export function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
      <ellipse cx="16" cy="29" rx="9" ry="1.2" fill="rgba(15,23,42,0.18)" />
      <path d="M3.5 10.2 L16 16.4 L16 29 L3.5 22.8 Z" fill="#ea6c0a" />
      <path d="M28.5 10.2 L16 16.4 L16 29 L28.5 22.8 Z" fill="#c2410c" />
      <path d="M16 3.5 L28.5 10.2 L16 16.4 L3.5 10.2 Z" fill="#f97316" />
      <path d="M16 3.5 L16 16.4" stroke="#fdba74" strokeWidth="0.9" opacity="0.7" />
      <path d="M16 3.5 L28.5 10.2 L28.5 22.8 L16 29 L3.5 22.8 L3.5 10.2 Z" stroke="#7c2d12" strokeWidth="0.8" strokeLinejoin="round" fill="none" opacity="0.35" />
      <path d="M16 16.4 L16 29" stroke="#7c2d12" strokeWidth="0.6" opacity="0.3" />
    </svg>
  );
}

export default function Logo({ size = 24, light = false, withMark = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      {withMark && <LogoMark size={Math.round(size * 1.25)} />}
      <span style={{
        fontFamily: 'var(--font-heading)',
        fontSize: Math.round(size * 0.82),
        fontWeight: 800,
        letterSpacing: '-0.02em',
        color: light ? '#ffffff' : 'var(--primary)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        MoveLeads<span style={{ color: 'var(--accent)' }}>.cloud</span>
      </span>
    </div>
  );
}
