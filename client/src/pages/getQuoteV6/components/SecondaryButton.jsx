export default function SecondaryButton({ children, onClick, full = true }) {
  return (
    <button
      onClick={onClick}
      className="nostroke"
      style={{
        height: 52, width: full ? '100%' : 'auto',
        padding: full ? 0 : '0 22px',
        borderRadius: 14, background: 'transparent',
        color: 'var(--ink)', fontWeight: 600, fontSize: 15,
        border: '1.5px solid var(--line-strong)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
