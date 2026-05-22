import Icon from './Icon';

export default function PivotCard({ label, sub, icon, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="nostroke"
      style={{
        flex: 1, minHeight: 130,
        padding: 18,
        borderRadius: 'var(--r-card)',
        background: selected ? 'var(--accent)' : 'var(--surface)',
        color: selected ? 'white' : 'var(--ink)',
        border: '1.5px solid',
        borderColor: selected ? 'var(--accent)' : 'var(--line-strong)',
        boxShadow: selected ? '0 12px 30px -10px rgba(249,115,22,0.35)' : 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        gap: 10, textAlign: 'left',
        transition: 'all 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: selected ? 'rgba(255,255,255,0.16)' : 'var(--accent-soft)',
        color: selected ? 'white' : 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={18} />
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{label}</div>
        <div style={{
          fontSize: 13, marginTop: 4,
          color: selected ? 'rgba(255,255,255,0.78)' : 'var(--ink-3)',
          lineHeight: 1.4,
        }}>{sub}</div>
      </div>
    </button>
  );
}
