import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

export default function ActivationBanner({ onActivate }) {
  const { user } = useContext(AuthContext);

  // Show only for users who finished/skipped the wizard AND have not yet
  // activated their balance via any paid path. We hide the banner if ANY of:
  //  - onboarding.activatedAt is stamped (new field, set on $50 OR $100)
  //  - onboarding.bonusClaimedAt is stamped (legacy, $100-only)
  //  - balance > 0 (legacy fallback for accounts paid before activatedAt existed)
  if (!user) return null;
  if (user.role === 'admin' || user.role === 'super_admin') return null;
  if (!user.onboarding?.complete) return null;
  if (user.onboarding?.activatedAt) return null;
  if (user.onboarding?.bonusClaimedAt) return null;
  if ((user.balance || 0) > 0) return null;

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, lineHeight: 1.3 }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>Your dispatch setup is ready</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.78)' }}>
          Activate your <strong style={{ color: '#ff6a14', fontWeight: 800 }}>$150 onboarding balance</strong> to start unlocking verified move opportunities.
        </span>
      </div>
      <button
        type="button"
        onClick={onActivate}
        style={{
          background: '#ff6a14', color: '#fff', border: 'none',
          height: 38, padding: '0 18px', borderRadius: 10,
          fontFamily: 'inherit', fontWeight: 800, fontSize: 13.5,
          cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(255, 106, 20, 0.32)',
        }}
      >
        Activate my balance →
      </button>
    </div>
  );
}
