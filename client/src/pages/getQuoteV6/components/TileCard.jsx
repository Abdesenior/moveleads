import Icon from './Icon';

export default function TileCard({ icon, title, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="nostroke"
      style={{
        padding: '14px 12px',
        borderRadius: 14,
        background: 'var(--surface)',
        border: '1.5px solid',
        borderColor: selected ? 'var(--accent)' : 'var(--line)',
        boxShadow: selected ? '0 0 0 3px var(--accent-soft)' : 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        transition: 'all 160ms ease',
        minHeight: 88,
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: selected ? 'var(--accent-soft)' : 'var(--canvas)',
        color: selected ? 'var(--accent)' : 'var(--ink-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={18} />
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.005em', textAlign: 'center', lineHeight: 1.25 }}>
        {title}
      </div>
    </button>
  );
}
