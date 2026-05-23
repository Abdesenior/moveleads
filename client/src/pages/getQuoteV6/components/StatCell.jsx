import Icon from './Icon';

export default function StatCell({ label, value, suffix, border = true, title }) {
  return (
    <div title={title} style={{
      padding: '14px 16px',
      borderRight: border ? '1px solid var(--line-2)' : 'none',
      position: 'relative',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--ink-3)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        {label}
        {title && <Icon name="info" size={11} color="var(--ink-3)" stroke={2} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          {value}
        </span>
        {suffix && <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 500 }}>{suffix}</span>}
      </div>
    </div>
  );
}
