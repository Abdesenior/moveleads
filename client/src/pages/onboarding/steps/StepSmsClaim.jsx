/**
 * Step 5 — SMS Claim showcase + opt-in decision.
 *
 * Right-column tighten (2026-06-06): drops the 3 benefit cards and the
 * 2-sentence intro. The phone PNG carries the workflow; the right side
 * answers only what is required to enable it. Mobile reorders so the
 * phone is the visual hero between the short line and the cards.
 *
 * The opt-in decision happens in the wizard footer (controller renders
 * "I'll enable it later" + "Enable SMS Claim →"). Either path commits via
 * chooseSms(true|false):
 *   PATCH /api/users/me/sms-claim   body: { optInRequested: bool }
 * then advances to Step 6.
 */

import { Wallet, Check } from 'lucide-react';

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
          <p className="ow-smsclaim-tagline">Exclusive • Qualified • Fresh</p>

          <p className="ow-sub ow-smsclaim-sub">
            Reply <strong className="ow-smsclaim-orange">SEND</strong> to claim
            it before anyone else.
          </p>

          <div className="ow-smsclaim-example">
            <div className="ow-smsclaim-example-header">
              <div className="ow-smsclaim-example-icon" aria-hidden="true">
                <Wallet size={18} strokeWidth={2.25} />
              </div>
              <div className="ow-smsclaim-example-title">
                Keep balance ready
              </div>
            </div>

            <div className="ow-smsclaim-example-label">EXAMPLE</div>
            <div className="ow-smsclaim-example-row">
              <span>Lead</span>
              <strong>$42</strong>
            </div>
            <div className="ow-smsclaim-example-row">
              <span>Balance</span>
              <strong>$42</strong>
            </div>
            <div className="ow-smsclaim-example-row ow-smsclaim-example-row--success">
              <Check
                size={15}
                strokeWidth={3}
                className="ow-smsclaim-example-check"
              />
              <span>Ready to claim</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
