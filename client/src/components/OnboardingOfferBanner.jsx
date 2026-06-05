/**
 * OnboardingOfferBanner — replaces ActivationBanner (2026-06-05).
 *
 * Slim top bar that prompts movers to claim their $50 onboarding credit.
 * Two states, mutually exclusive, gated client-side:
 *
 *   1. Verify-email (heavy banner with Resend CTA) — when
 *      isEmailVerified !== true. Email verification is a prerequisite
 *      for claiming the credit, so we surface it first.
 *
 *   2. Claim-offer (slim orange bar) — when:
 *        - email is verified
 *        - activatedAt is null (no successful onboarding payment yet)
 *        - bonusClaimedAt is null (no legacy $100-only claim yet)
 *        - balance is 0 (legacy fallback for accounts paid pre-activatedAt)
 *        - AND the mover has either reached or finished the configuration
 *          phase, proven by:
 *            • activationOfferDismissedAt is set (clicked Browse-leads-first), OR
 *            • onboarding.currentStep >= 4 (reached SMS Claim or later;
 *              Location + Delivery + Contact are persisted server-side)
 *
 * The second gate intentionally REPLACES the legacy `!onboarding.complete`
 * check from ActivationBanner. The v2 wizard's Browse-leads-first path
 * never set `onboarding.complete = true` — so under the old gate, the
 * slim bar was silently never shown for that cohort. Tying the gate to
 * "configuration phase finished" matches what the operator originally
 * intended (per the dismiss-activation-offer comment in the v1 wizard).
 *
 * Click → calls `onActivate()` from props. DashboardLayout wires this to
 * `openActivation()` which mounts the wizard at the Activate screen.
 */

import { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';

export default function OnboardingOfferBanner({ onActivate }) {
  const { user, API_URL } = useContext(AuthContext);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  if (!user) return null;
  if (user.role === 'admin' || user.role === 'super_admin') return null;

  // ── Verify-email branch ─────────────────────────────────────────────
  // Email verification is required before the user can claim the $50
  // credit. This banner takes precedence over the slim offer bar.
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

  // ── Claim-offer branch (slim orange bar) ────────────────────────────
  // Hide if any path has already activated the wallet:
  if (user.onboarding?.activatedAt)     return null;
  if (user.onboarding?.bonusClaimedAt)  return null;
  if ((user.balance || 0) > 0)          return null;

  // Don't prompt brand-new movers who haven't configured anything yet —
  // banner click takes them straight to Activate, so they must have
  // saved coverage + contact first. Either "reached SMS Claim step" or
  // "dismissed the wizard" proves the configuration phase ran.
  //
  //   currentStep semantics (server-tracked):
  //     1 = Location saved  (v2 screen 2)
  //     2 = Delivery saved  (v2 screen 3)
  //     3 = Contact saved   (v2 screen 4)
  //     4 = SMS Claim saved (v2 screen 5)
  //     5 = Almost Ready    (v2 screen 6)
  const dismissed   = !!user.onboarding?.activationOfferDismissedAt;
  const finishedCfg = (user.onboarding?.currentStep || 0) >= 4;
  if (!dismissed && !finishedCfg) return null;

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
