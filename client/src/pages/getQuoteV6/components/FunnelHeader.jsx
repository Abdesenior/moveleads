import Icon from './Icon';

const iconBtnStyle = {
  width: 38, height: 38, borderRadius: 11,
  background: 'var(--surface)', border: '1.5px solid var(--line)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--ink-2)',
  cursor: 'pointer',
};

export default function FunnelHeader({ section, total, label, onBack, onClose, safeTop = 16 }) {
  const pct = total > 0 ? (section / total) * 100 : 0;
  return (
    <div style={{
      padding: `${safeTop}px 18px 14px`,
      background: 'var(--canvas)',
      position: 'sticky', top: 0, zIndex: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <button onClick={onBack} className="nostroke" style={iconBtnStyle}>
          <Icon name="chevL" size={18} stroke={2.2} />
        </button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--ink-3)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>{label}</div>
        </div>
        <button onClick={onClose} className="nostroke" style={iconBtnStyle}>
          <Icon name="close" size={15} stroke={2.2} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--line-2)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: 'var(--accent)',
            borderRadius: 999, transition: 'width 380ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }} />
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
          {section} / {total}
        </div>
      </div>
    </div>
  );
}
