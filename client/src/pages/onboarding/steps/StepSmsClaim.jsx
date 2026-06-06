/**
 * Step 5 — SMS Claim showcase + opt-in decision.
 *
 * Layout (promoted from sandbox 2026-06-06):
 *   Left column   — phone-as-tutorial PNG (the mechanic)
 *   Right column  — headline + tagline + sub + compact Example callout
 *
 * Mobile collapses to single column: title → tagline → sub → phone
 * → Example. CSS lives in pages/onboarding/Onboarding.css under
 * .ow-smsclaim-v2 / .ow-smsclaim-* selectors.
 *
 * The opt-in decision happens in the wizard footer (controller renders
 * "I'll enable it later" + "Enable SMS Claim →"). Either path commits
 * via chooseSms(true|false):
 *   PATCH /api/users/me/sms-claim   body: { optInRequested: bool }
 * then advances to Step 6.
 */

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
            Reply <strong className="ow-smsclaim-orange">SEND</strong> to claim them instantly.
          </p>

          <div className="ow-smsclaim-balance">
            <div className="ow-smsclaim-balance-label">Example</div>
            <div className="ow-smsclaim-balance-row">
              <span>Lead price</span>
              <strong>$42</strong>
            </div>
            <div className="ow-smsclaim-balance-row">
              <span>Balance needed</span>
              <strong>$42</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
