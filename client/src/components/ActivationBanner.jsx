import { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';

export default function ActivationBanner({ onActivate }) {
  const { user, API_URL } = useContext(AuthContext);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  // Show only for non-admin users.
  if (!user) return null;
  if (user.role === 'admin' || user.role === 'super_admin') return null;

  // ── Unverified branch ──
  // Email verification is required before the user can claim the $50
  // onboarding credit. Keep the original (heavier) banner style here
  // because it carries the Resend Verification button — distinct UX
  // surface from the post-onboarding slim offer bar.
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

  // ── Slim offer bar (verified users, post-onboarding, no activation yet) ──
  // Hide if user has already activated through any path:
  //  - onboarding.activatedAt is stamped (new field, set on $50 OR $100)
  //  - onboarding.bonusClaimedAt is stamped (legacy, $100-only)
  //  - balance > 0 (legacy fallback for accounts paid before activatedAt existed)
  if (!user.onboarding?.complete) return null;
  if (user.onboarding?.activatedAt) return null;
  if (user.onboarding?.bonusClaimedAt) return null;
  if ((user.balance || 0) > 0) return null;

  return (
    <button
      type="button"
      className="ml-offer-bar"
      onClick={onActivate}
      aria-label="Claim your free $50 unlock credit"
    >
      <div className="ml-offer-bar-inner">
        <span className="ml-offer-bar-pulse" aria-hidden="true" />
        <span className="ml-offer-bar-pill">LIMITED</span>

        <span className="ml-offer-bar-text-full">
          Claim your <span className="ml-offer-bar-accent">free $50 unlock credit</span> before onboarding closes in your area <span className="ml-offer-bar-arrow" aria-hidden="true">→</span>
        </span>

        <div className="ml-offer-bar-text-mobile">
          <div className="ml-offer-bar-line-main">
            Claim your <span className="ml-offer-bar-accent">free $50 unlock credit</span>
          </div>
          <div className="ml-offer-bar-line-sub">
            before onboarding closes in your area <span className="ml-offer-bar-arrow" aria-hidden="true">→</span>
          </div>
        </div>
      </div>
    </button>
  );
}
