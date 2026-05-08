import { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';

export default function ActivationBanner() {
  const { API_URL, user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);

  // Show only for users who finished/skipped the wizard but haven't claimed bonus
  if (!user) return null;
  if (user.role === 'admin' || user.role === 'super_admin') return null;
  if (!user.onboarding?.complete) return null;
  if (user.onboarding?.bonusClaimedAt) return null;

  async function handleActivate() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/billing/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({ amount: 100 }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setLoading(false);
        alert('Could not start checkout. Try again or contact support.');
      }
    } catch (err) {
      console.error('[ActivationBanner] checkout failed', err);
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: 'linear-gradient(180deg, #07111f 0%, #06101d 100%)',
      borderBottom: '1px solid rgba(255, 106, 20, 0.18)',
      padding: '12px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      flexWrap: 'wrap',
      color: '#fff',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontSize: 14,
    }}>
      <span style={{
        background: '#ff6a14', color: '#fff',
        padding: '4px 10px', borderRadius: 999,
        fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
      }}>LIMITED</span>
      <span>
        Claim your <strong style={{ color: '#ff6a14', fontWeight: 800 }}>free $50 unlock credit</strong>
        {' · '}onboarding spots in your area are limited
      </span>
      <button
        type="button"
        onClick={handleActivate}
        disabled={loading}
        style={{
          background: '#ff6a14', color: '#fff', border: 'none',
          height: 36, padding: '0 16px', borderRadius: 10,
          fontFamily: 'inherit', fontWeight: 800, fontSize: 13.5,
          cursor: loading ? 'wait' : 'pointer',
          boxShadow: '0 6px 18px rgba(255, 106, 20, 0.32)',
        }}
      >
        {loading ? 'Opening…' : 'Activate $150 →'}
      </button>
    </div>
  );
}
