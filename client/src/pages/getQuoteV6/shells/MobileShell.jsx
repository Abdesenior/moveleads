// client/src/pages/getQuoteV6/shells/MobileShell.jsx
export default function MobileShell({ children }) {
  return (
    <div style={{ width: '100%', minHeight: '100vh', background: 'var(--canvas)' }}>
      {children}
    </div>
  );
}
