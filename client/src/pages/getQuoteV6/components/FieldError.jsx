export default function FieldError({ children }) {
  return (
    <div style={{
      fontSize: 12.5, color: 'var(--danger)',
      display: 'inline-flex', alignItems: 'center', gap: 6,
      marginTop: -4, marginLeft: 4,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--danger)' }} />
      {children}
    </div>
  );
}
