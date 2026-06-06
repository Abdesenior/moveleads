/**
 * Step 8 — Activation success (terminal).
 *
 * Renders a personalized post-activation checklist plus a small
 * SMS Claim heads-up card (kept as an aside, not a CTA — primary action
 * stays "View matching opportunities →"). The CTA calls ctx.onDone() which
 * navigates to /dashboard/leads.
 *
 * Personalized lines:
 *   - Headline reflects bonus path ($150) vs starter ($50) — derived from
 *     ctx.bonusPath / ctx.balance (set by the controller after refreshUser).
 *   - Market line — "N active requests match your setup near {market}" if
 *     the controller's match-count fetch returned a positive count; else
 *     "Routing enabled for {market}" as a calmer fallback.
 *
 * Locked-in test surface: aside carries `data-testid` =
 * `onboarding-success-sms-claim-aside` (preserves PR #79's selector so the
 * existing "Claim leads by text" / "Beta" / claim-code text assertions
 * keep passing under v2).
 */

import { Check } from 'lucide-react';

export default function StepSuccess({ ctx }) {
  const {
    bonusPath,
    balance,
    marketLabel,
    matchCount,
    onDone,
  } = ctx;

  const headline = bonusPath
    ? 'Your $150 balance is active'
    : `Your $${Math.max(balance, 50)} balance is active`;

  const marketLine = matchCount && matchCount > 0
    ? `${matchCount} active ${matchCount === 1 ? 'lead matches' : 'leads match'} your setup near ${marketLabel}`
    : (marketLabel && marketLabel !== 'your market'
        ? `Routing enabled for ${marketLabel}`
        : 'Routing enabled');

  return (
    <div className="ow-content ow-success">
      <div className="ow-success-icon" aria-hidden="true">
        <Check size={28} strokeWidth={3} />
      </div>
      <h1 className="ow-h1">{headline}</h1>

      <ul className="ow-success-list">
        {bonusPath
          ? <li>Onboarding bonus applied: <strong>+$50</strong></li>
          : <li>Starter balance activated</li>}
        <li>{marketLine}</li>
        <li>Notifications ready for matching leads</li>
      </ul>

      {/* Operator-approved 2026-06-06: replaces the SMS Claim BETA aside.
          Success screen is an arrival moment — reassurance over feature
          pitch. SMS Claim awareness lives in the sidebar tab. */}
      <p className="ow-success-reassurance">
        <strong>Fresh leads are on the way.</strong> We're actively bringing
        new requests into the platform — watch for matching alerts.
      </p>

      <button
        type="button"
        className="ow-next"
        style={{ marginTop: 18 }}
        onClick={onDone}
      >
        View matching leads →
      </button>
    </div>
  );
}
