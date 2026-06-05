/**
 * Step 5 — SMS Claim showcase + opt-in decision.
 *
 * Two variants live in this file. The controller picks via `ctx.sandbox`:
 *
 *   • Production (sandbox=false) — existing 2-column showcase with the
 *     static phone-mock, 4 explainer steps, separate balance note. PR
 *     #79/#82 lock-ins assert structure pieces here; do not break.
 *
 *   • Sandbox (sandbox=true) — REDESIGN (2026-06-05): phone-as-tutorial.
 *     Left column carries the headline, sub, and 3 benefit lines.
 *     Right column carries a static PNG mockup showing the entire SMS
 *     Claim flow with numbered annotations (lead arrives → reply →
 *     customer details → calling). A compact balance card sits beneath.
 *     Asset: client/public/onboarding/sms-claim.png. CSS lives in
 *     pages/dev/OnboardingSandbox.css, scoped to .ow-sandbox-mode.
 *
 * The opt-in decision happens in the wizard footer (the controller
 * renders "I'll enable it later" + "Enable SMS Claim →"). Either path
 * commits via the controller's chooseSms(true|false) which calls:
 *   PATCH /api/users/me/sms-claim   body: { optInRequested: bool }
 * and advances to Step 6.
 */

import { useEffect, useState } from 'react';
import { Check, Phone, PhoneCall, Wallet, Zap } from 'lucide-react';

// ── Production showcase (unchanged) ────────────────────────────────────────
function SmsDemo({ origin, dest }) {
  return (
    <div className="ow-phone-mock">
      <div className="ow-phone-notch" />
      <div className="ow-phone-hdr">
        <span className="ow-phone-avatar">ML</span>
        <div>
          <div className="ow-phone-name">MoveLeads</div>
          <div className="ow-phone-time">now</div>
        </div>
      </div>
      <div className="ow-phone-thread ow-phone-thread--static">
        <div className="ow-sms-bubble">
          <div className="ow-sms-meta">New matching lead · 3BR Move</div>
          <div style={{ margin: '3px 0' }}>
            <strong>{origin} → {dest}</strong> · <span className="ow-sms-price">$42</span>
          </div>
          Reply <strong>SEND ABCD</strong> to claim it.
        </div>
        <div className="ow-sms-reply"><span className="ow-send-callout">SEND ABCD</span></div>
        <div className="ow-sms-claimed">
          <Check size={13} strokeWidth={3} /> Lead claimed — you won this lead
        </div>
        <div className="ow-sms-bubble">
          <div className="ow-sms-meta">Customer details</div>
          Sarah M.<br />(555) 014-2231<br />Pickup: 4BR home, 2nd floor
        </div>
        <div className="ow-sms-reply">
          <span className="ow-call-callout">
            <PhoneCall size={14} /> Call customer
          </span>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  'Matching lead arrives',
  'Reply SEND to claim',
  'Lead claimed',
  'Customer details received',
];

// Two title-only chips — the phone PNG carries the rest of the explanation.
const BENEFITS = [
  { Icon: Zap,   title: 'First to reply wins' },
  { Icon: Phone, title: 'Customer details sent immediately' },
];

export default function StepSmsClaim({ ctx }) {
  const r = ctx.smsRoute;
  const sandbox = !!ctx.sandbox;

  // Production keeps the legacy tick logic for STEPS-length progress.
  // Sandbox uses a static PNG so no tick state needed there.
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (sandbox) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setActive(STEPS.length - 1);
      return;
    }
    setActive(0);
    const timers = [];
    for (let i = 1; i < STEPS.length; i++) {
      timers.push(setTimeout(() => setActive(i), 600 + i * 850));
    }
    return () => timers.forEach(clearTimeout);
  }, [sandbox]);

  // ── Sandbox: phone-as-tutorial layout (static PNG) ──────────────────
  if (sandbox) {
    return (
      <div className="ow-content ow-content--wide ow-smsclaim-v2">
        <div className="ow-smsclaim-grid">
          <div className="ow-smsclaim-copy">
            <h1 className="ow-h1 ow-smsclaim-title">Claim leads by text</h1>
            <p className="ow-sub ow-smsclaim-sub">
              Reply <strong className="ow-smsclaim-orange">SEND</strong> to claim matching leads instantly.
            </p>

            <ul className="ow-smsclaim-benefits">
              {BENEFITS.map((b) => (
                <li key={b.title} className="ow-smsclaim-benefit">
                  <span className="ow-smsclaim-benefit-icon" aria-hidden="true">
                    <b.Icon size={16} strokeWidth={2.4} />
                  </span>
                  <span className="ow-smsclaim-benefit-title">{b.title}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="ow-smsclaim-phone-col">
            <img
              src="/onboarding/sms-claim.png"
              alt="A phone showing the SMS Claim flow: lead alert arrives, you reply SEND, customer details land in the thread, and a call kicks off."
              className="ow-smsclaim-phone-img"
              draggable={false}
            />
          </div>

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
    );
  }

  // ── Production layout (unchanged) ────────────────────────────────────
  return (
    <div className="ow-content ow-content--wide">
      <div className="ow-header">
        <h1 className="ow-h1">Want to claim opportunities by text?</h1>
        <p className="ow-sub">
          We'll text you the moment a matching lead is available — reply
          SEND to claim it.
        </p>
      </div>

      <div className="ow-sms-showcase">
        <div className="ow-sms-phone-col">
          <SmsDemo origin={r.origin} dest={r.dest} />
        </div>

        <div className="ow-sms-right-col">
          <div className="ow-balance-note">
            <Wallet size={16} style={{ color: 'var(--ow-orange)', flex: '0 0 auto', marginTop: 1 }} />
            <div>
              <div>To claim by text, your available balance must cover the lead price.</div>
              <div className="ow-balance-eg">
                <span>Lead price <b>$42</b></span>
                <span className="ow-balance-eg-sep" />
                <span>Required balance <b>$42</b></span>
              </div>
            </div>
          </div>

          <div className="ow-claim-steps">
            {STEPS.map((t, i) => {
              const st = i < active ? 'done' : i === active ? 'active' : 'upcoming';
              return (
                <div className={'ow-claim-step ow-claim-step--' + st} key={t}>
                  <span className="ow-claim-num">
                    {st === 'done' ? <Check size={14} strokeWidth={3} /> : (i + 1)}
                  </span>
                  <span className="ow-claim-text">{t}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
