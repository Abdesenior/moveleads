import { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';

export default function ActivationBanner({ onActivate }) {
  const { user, API_URL } = useContext(AuthContext);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  // Show only for non-admin users.
  if (!user) return null;
  if (user.role === 'admin' || user.role === 'super_admin') return null;

  // ── WP-A4 — Unverified branch ──
  // Email verification is required before the user can claim the $50 onboarding
  // credit. Show a different message + a Resend Verification button. Hides the
  // existing activation copy.
  const isUnverified = user.isEmailVerified !== true;

  if (isUnverified) {
    const handleResend = async () => {
      if (resendLoading || !user.email) return;
      setResendLoading(true);
      try {
        const res = await fetch(`${API_URL}/auth/resend-verification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });
        if (res.ok) setResendSent(true);
      } catch { /* swallow — banner stays visible */ }
      finally {
        setResendLoading(false);
      }
    };

    return (
      <div className="activation-banner">
        <div className="activation-banner-text">
          <span className="activation-banner-title">Verify your email</span>
          <span className="activation-banner-highlight">
            Verify your email to claim your <strong>$50 onboarding credit</strong>.
          </span>
        </div>
        {resendSent ? (
          <span style={{ color: '#bbf7d0', fontSize: 14, fontWeight: 700, padding: '0 16px' }}>
            ✓ Link re-sent — check your inbox
          </span>
        ) : (
          <button
            type="button"
            className="activation-banner-cta"
            onClick={handleResend}
            disabled={resendLoading}
          >
            {resendLoading ? 'Sending…' : 'Resend verification email →'}
          </button>
        )}
      </div>
    );
  }

  // ── Original activation banner (verified users only) ──
  // Hide if user has already activated through any path:
  //  - onboarding.activatedAt is stamped (new field, set on $50 OR $100)
  //  - onboarding.bonusClaimedAt is stamped (legacy, $100-only)
  //  - balance > 0 (legacy fallback for accounts paid before activatedAt existed)
  if (!user.onboarding?.complete) return null;
  if (user.onboarding?.activatedAt) return null;
  if (user.onboarding?.bonusClaimedAt) return null;
  if ((user.balance || 0) > 0) return null;

  return (
    <div className="activation-banner">
      <div className="activation-banner-text">
        <span className="activation-banner-title">Your dispatch setup is ready</span>
        <span className="activation-banner-highlight">
          Claim your <strong>$50 onboarding credit</strong> before your market fills up
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
