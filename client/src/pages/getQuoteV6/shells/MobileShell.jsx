// client/src/pages/getQuoteV6/shells/MobileShell.jsx
import Footer from '../components/Footer';

export default function MobileShell({ children }) {
  return (
    <div style={{ width: '100%', minHeight: '100vh', background: 'var(--canvas)' }}>
      {children}
      <Footer />
    </div>
  );
}
