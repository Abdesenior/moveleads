import Icon from './Icon';

export default function ChoiceCard({ icon, title, sub, selected, onClick, illustration, compact = false }) {
  return (
    <button
      onClick={onClick}
      className="nostroke"
      style={{
        width: '100%', textAlign: 'left',
        padding: compact ? 14 : 16,
        borderRadius: 'var(--r-card)',
        background: 'var(--surface)',
        border: '1.5px solid',
        borderColor: selected ? 'var(--accent)' : 'var(--line)',
        boxShadow: selected ? '0 0 0 4px var(--accent-soft), var(--shadow-sm)' : 'var(--shadow-sm)',
        display: 'flex', alignItems: 'center', gap: 14,
        transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 120ms ease',
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      {illustration || (
        <div style={{
          width: compact ? 42 : 46, height: compact ? 42 : 46, flexShrink: 0,
          borderRadius: 12,
          background: selected ? 'var(--accent-soft)' : 'var(--canvas)',
          color: selected ? 'var(--accent)' : 'var(--ink-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 160ms ease, color 160ms ease',
        }}>
          <Icon name={icon} size={compact ? 19 : 21} stroke={1.7} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: compact ? 14.5 : 15.5,
          fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.012em',
        }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        border: '1.5px solid',
        borderColor: selected ? 'var(--accent)' : 'var(--line-strong)',
        background: selected ? 'var(--accent)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', flexShrink: 0,
        transition: 'all 160ms ease',
      }}>
        {selected && <Icon name="check" size={13} stroke={3} />}
      </div>
    </button>
  );
}
