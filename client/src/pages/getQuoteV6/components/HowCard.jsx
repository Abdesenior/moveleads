import Icon from './Icon';

export default function HowCard({ h, compact = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: compact ? '9px 12px' : '11px 13px',
      background: 'var(--bg-white)',
      border: '1px solid',
      borderColor: h.emphasis ? 'var(--border-strong)' : 'var(--border)',
      borderRadius: 12,
      boxShadow: h.emphasis ? '0 1px 2px rgba(15,23,42,0.04)' : 'none',
    }}>
      <div style={{
        width: compact ? 32 : 36, height: compact ? 32 : 36, borderRadius: 9,
        background: h.emphasis ? 'var(--accent-soft)' : 'var(--bg-soft)',
        color: h.emphasis ? 'var(--accent)' : 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon name={h.icon} size={compact ? 14 : 16} stroke={1.8} />
      </div>
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        background: h.emphasis ? 'var(--accent)' : 'var(--bg-soft)',
        color: h.emphasis ? 'white' : 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10.5, fontWeight: 800,
        flexShrink: 0, marginLeft: -4,
      }}>{h.n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--primary)', letterSpacing: '-0.005em' }}>{h.t}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1, lineHeight: 1.35 }}>{h.s}</div>
      </div>
    </div>
  );
}
