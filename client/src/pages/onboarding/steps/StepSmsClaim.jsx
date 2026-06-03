/**
 * Step 5 — SMS Claim showcase + opt-in decision.
 *
 * Visual showcase: a phone-style mockup of an incoming MoveLeads SMS with
 * a SEND ABCD callout, then a 4-item animated explainer alongside.
 *
 * The opt-in decision happens in the footer (the controller renders two
 * CTAs: "I'll enable it later" and "Enable SMS Claim →"). Either path
 * commits via the controller's chooseSms(true|false) which calls:
 *   PATCH /api/users/me/sms-claim  body: { optInRequested: true|false }
 * and advances to Step 6.
 *
 * Balance requirement note (operator-approved verbatim from spec):
 *   $42 lead → $42 required balance.
 */

import { useEffect, useState } from 'react';
import { Check, PhoneCall, Wallet } from 'lucide-react';

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

export default function StepSmsClaim({ ctx }) {
  const r = ctx.smsRoute;
  const [active, setActive] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setActive(STEPS.length - 1);
      return;
    }
    const timers = [];
    for (let i = 1; i < STEPS.length; i++) {
      timers.push(setTimeout(() => setActive(i), 600 + i * 850));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

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
