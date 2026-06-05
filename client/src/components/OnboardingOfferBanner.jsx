/**
 * OnboardingOfferBanner — slim top bar that prompts movers to claim
 * their $50 onboarding credit (2026-06-05).
 *
 * Visibility gate:
 *   - non-admin
 *   - activatedAt is null            (no successful onboarding payment yet)
 *   - bonusClaimedAt is null         (no legacy $100-only claim yet)
 *   - balance is 0                   (legacy fallback for accounts paid
 *                                     before activatedAt existed)
 *   - AND the mover has either:
 *       • dismissed the wizard (activationOfferDismissedAt set), or
 *       • reached at least SMS Claim (onboarding.currentStep >= 4),
 *         which proves Location + Delivery + Contact were persisted
 *
 * The currentStep floor protects brand-new movers — banner click takes
 * them straight to Activate, so they must have configured coverage +
 * contact first. The dismissedAt branch covers the explicit
 * Browse-leads-first case.
 *
 * Email-verification is NOT checked here. ProtectedRoute hard-gates
 * non-admin users with unverified emails to /verify-email-pending —
 * the dashboard never receives an unverified user, so a verify-email
 * branch in this banner would be dead code.
 *
 * Click → calls onActivate() from props. DashboardLayout wires this to
 * openActivation() which mounts the wizard at the Activate screen.
 */

import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

export default function OnboardingOfferBanner({ onActivate }) {
  const { user } = useContext(AuthContext);

  if (!user) return null;
  if (user.role === 'admin' || user.role === 'super_admin') return null;

  if (user.onboarding?.activatedAt)    return null;
  if (user.onboarding?.bonusClaimedAt) return null;
  if ((user.balance || 0) > 0)         return null;

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
