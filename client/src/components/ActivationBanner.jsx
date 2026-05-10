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
    <div className="activation-banner">
      <div className="activation-banner-text">
        <span className="activation-banner-title">Your dispatch setup is ready</span>
        <span className="activation-banner-highlight">
          {/* TEST MODE: production copy was "$150 onboarding balance" */}
          Activate your <strong>$1 balance (test)</strong>
        </span>
      </div>
      <button
        type="button"
        className="activation-banner-cta"
        onClick={onActivate}
      >
        Activate my balance →
      </button>
    </div>
  );
}
