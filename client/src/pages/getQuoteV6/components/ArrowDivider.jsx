export default function ArrowDivider({ desktop }) {
  return (
    <div style={{
      width: desktop ? 44 : 36, height: 2,
      background: 'var(--accent)',
      position: 'relative', flexShrink: 0,
      alignSelf: 'center',
      marginTop: desktop ? 20 : 16,
    }}>
      <div style={{
        position: 'absolute', right: -1, top: '50%',
        transform: 'translate(0, -50%)',
        width: 0, height: 0,
        borderLeft: '7px solid var(--accent)',
        borderTop: '5px solid transparent',
        borderBottom: '5px solid transparent',
      }} />
    </div>
  );
}
