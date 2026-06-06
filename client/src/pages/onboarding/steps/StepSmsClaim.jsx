/**
 * Step 5 — SMS Claim showcase + opt-in decision.
 *
 * Right-column refresh (2026-06-06): the phone PNG carries the workflow
 * (what happens). The right side answers WHY enable it and WHAT you
 * need to make it work — never repeats the workflow.
 *
 * Right-column reading order:
 *   1. Headline + tagline + 2-line intro
 *   2. 3 benefit cards (Instant · Exclusive · Qualified)
 *   3. "Keep balance ready" hero callout — heaviest block on the column
 *   4. Compact EXAMPLE CLAIM card — proves the balance rule
 *
 * The opt-in decision happens in the wizard footer (controller renders
 * "I'll enable it later" + "Enable SMS Claim →"). Either path commits via
 * chooseSms(true|false):
 *   PATCH /api/users/me/sms-claim   body: { optInRequested: bool }
 * then advances to Step 6.
 */

import { Zap, Shield, BadgeCheck, Wallet, Check } from 'lucide-react';

export default function StepSmsClaim() {
  return (
    <div className="ow-content ow-content--wide ow-smsclaim-v2">
      <div className="ow-smsclaim-grid">
        <div className="ow-smsclaim-phone-col">
          <img
            src="/onboarding/sms-claim.png"
            alt="A phone showing the SMS Claim flow: lead alert arrives, you reply SEND, customer details land in the thread, and a call kicks off."
            className="ow-smsclaim-phone-img"
            draggable={false}
          />
        </div>

        <div className="ow-smsclaim-copy">
          <h1 className="ow-h1 ow-smsclaim-title">
            Be first to fresh, exclusive leads
          </h1>
          <p className="ow-smsclaim-tagline">Exclusive · Qualified · Fresh</p>

          <p className="ow-sub ow-smsclaim-sub">
            When a matching lead comes in, we text it to you instantly.
            <br />
            Reply <strong className="ow-smsclaim-orange">SEND</strong> to claim
            it and call the customer before anyone else.
          </p>

          <div className="ow-smsclaim-benefits">
            <div className="ow-smsclaim-benefit-card">
              <div className="ow-smsclaim-benefit-icon">
                <Zap size={16} strokeWidth={2.25} />
              </div>
              <div className="ow-smsclaim-benefit-title">Instant</div>
              <div className="ow-smsclaim-benefit-body">
                Delivered the moment the lead is qualified.
              </div>
            </div>

            <div className="ow-smsclaim-benefit-card">
              <div className="ow-smsclaim-benefit-icon">
                <Shield size={16} strokeWidth={2.25} />
              </div>
              <div className="ow-smsclaim-benefit-title">Exclusive</div>
              <div className="ow-smsclaim-benefit-body">
                Once claimed, the lead is yours.
              </div>
            </div>

            <div className="ow-smsclaim-benefit-card">
              <div className="ow-smsclaim-benefit-icon">
                <BadgeCheck size={16} strokeWidth={2.25} />
              </div>
              <div className="ow-smsclaim-benefit-title">Qualified</div>
              <div className="ow-smsclaim-benefit-body">
                Pre-screened homeowners ready to move.
              </div>
            </div>
          </div>

          {/* Hero balance callout — visually heaviest block on the
              right column. Orange gradient, accent left border, wallet
              tile, larger padding, shadow. */}
          <div className="ow-smsclaim-balance-hero">
            <div className="ow-smsclaim-balance-hero-header">
              <div className="ow-smsclaim-balance-hero-icon" aria-hidden="true">
                <Wallet size={18} strokeWidth={2.25} />
              </div>
              <div className="ow-smsclaim-balance-hero-title">
                Keep balance ready
              </div>
            </div>
            <p className="ow-smsclaim-balance-hero-body">
              SMS Claim only works when your balance covers the lead price.
              If a <strong>$42</strong> lead arrives, you&apos;ll need at least{' '}
              <strong>$42</strong> available to claim it instantly.
            </p>
          </div>

          <div className="ow-smsclaim-example">
            <div className="ow-smsclaim-example-label">EXAMPLE CLAIM</div>
            <div className="ow-smsclaim-example-row">
              <span>Lead arrives</span>
              <strong>$42</strong>
            </div>
            <div className="ow-smsclaim-example-row">
              <span>Balance available</span>
              <strong>$42</strong>
            </div>
            <div className="ow-smsclaim-example-row ow-smsclaim-example-row--success">
              <span>You claim instantly</span>
              <Check
                size={15}
                strokeWidth={3}
                className="ow-smsclaim-example-check"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
