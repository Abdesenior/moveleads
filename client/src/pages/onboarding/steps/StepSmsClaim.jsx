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
 *     Right column carries an auto-looping phone animation through 5
 *     states (lead arrives → SEND reply → claimed → customer details →
 *     calling). A compact balance card sits beneath, full-width.
 *     No numbered checklist — the phone teaches the flow on its own.
 *     CSS lives in pages/dev/OnboardingSandbox.css, scoped to
 *     .ow-sandbox-mode.
 *
 * The opt-in decision happens in the wizard footer (the controller
 * renders "I'll enable it later" + "Enable SMS Claim →"). Either path
 * commits via the controller's chooseSms(true|false) which calls:
 *   PATCH /api/users/me/sms-claim   body: { optInRequested: bool }
 * and advances to Step 6.
 */

import { useEffect, useState } from 'react';
import { Check, Phone, PhoneCall, Wallet, Zap, Trophy, ChevronLeft, Mic, Plus } from 'lucide-react';

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

// ── Sandbox phone — auto-looping 5-state thread ────────────────────────────
// active values:
//   -1 → empty thread (between loops)
//    0 → state 1 (lead alert) visible
//    1 → states 1 + 2 visible (+ SEND reply)
//    2 → 1 + 2 + 3 (claimed)
//    3 → 1 + 2 + 3 + 4 (customer details)
//    4 → 1 + 2 + 3 + 4 + 5 (calling — final hold state)
function SmsClaimPhone({ active }) {
  const shown = (i) => (active >= i ? ' is-shown' : '');

  return (
    <div className="ow-smsclaim-phone-frame" aria-hidden="true">
      <div className="ow-smsclaim-phone-statusbar">
        <span className="ow-smsclaim-phone-time">9:41</span>
        <span className="ow-smsclaim-phone-icons">
          <span className="ow-smsclaim-phone-dot" />
          <span className="ow-smsclaim-phone-dot" />
          <span className="ow-smsclaim-phone-dot" />
        </span>
      </div>

      <div className="ow-smsclaim-phone-notch" />

      <div className="ow-smsclaim-phone-screen">
        <div className="ow-smsclaim-phone-header">
          <ChevronLeft size={18} className="ow-smsclaim-phone-back" />
          <span className="ow-smsclaim-phone-avatar">ML</span>
          <span className="ow-smsclaim-phone-name">MoveLeads ›</span>
        </div>

        <div className="ow-smsclaim-phone-day">Today 9:41 AM</div>

        <div className="ow-smsclaim-thread">
          {/* 1 — Lead alert (incoming) */}
          <div className={'ow-smsclaim-bub ow-smsclaim-bub--in ow-smsclaim-reveal' + shown(0)}>
            <div className="ow-smsclaim-bub-title">New matching lead</div>
            <div>Chicago → Texas</div>
            <div>Lead price: $42</div>
            <div>
              Reply <strong className="ow-smsclaim-orange">SEND ABCD</strong>
            </div>
          </div>

          {/* 2 — SEND reply (outgoing green) */}
          <div className={'ow-smsclaim-bub ow-smsclaim-bub--out ow-smsclaim-reveal' + shown(1)}>
            <span className="ow-smsclaim-bub-time">9:41 AM</span>
            SEND ABCD
          </div>

          {/* 3 — Lead claimed (incoming) */}
          <div className={'ow-smsclaim-bub ow-smsclaim-bub--in ow-smsclaim-bub--celebrate ow-smsclaim-reveal' + shown(2)}>
            <div className="ow-smsclaim-bub-title">
              Lead claimed! <span aria-hidden="true">🎉</span>
            </div>
            <div>You've claimed this lead.</div>
            <span className="ow-smsclaim-bub-time">9:41 AM</span>
          </div>

          {/* 4 — Customer details (incoming) */}
          <div className={'ow-smsclaim-bub ow-smsclaim-bub--in ow-smsclaim-reveal' + shown(3)}>
            <div className="ow-smsclaim-bub-title">Customer details</div>
            <div>Sarah M.</div>
            <div>(555) 014-2231</div>
            <div>Pickup: 4BR home, 2nd floor</div>
            <span className="ow-smsclaim-bub-time">9:41 AM</span>
          </div>

          {/* 5 — Calling Sarah M. (outgoing green pill with phone icon) */}
          <div className={'ow-smsclaim-bub ow-smsclaim-bub--call ow-smsclaim-reveal' + shown(4)}>
            <div className="ow-smsclaim-bub-call-text">
              <div className="ow-smsclaim-bub-call-title">Calling Sarah M.</div>
              <div>Good luck!</div>
            </div>
            <span className="ow-smsclaim-bub-call-icon" aria-hidden="true">
              <PhoneCall size={16} strokeWidth={2.4} />
            </span>
          </div>
        </div>

        <div className="ow-smsclaim-phone-input" aria-hidden="true">
          <span className="ow-smsclaim-phone-input-plus">
            <Plus size={14} />
          </span>
          <span className="ow-smsclaim-phone-input-placeholder">Text Message</span>
          <span className="ow-smsclaim-phone-input-mic">
            <Mic size={14} />
          </span>
        </div>
      </div>
    </div>
  );
}

const BENEFITS = [
  {
    Icon: Zap,
    title: 'Instant notifications',
    text: 'Get notified the moment a matching lead arrives.',
  },
  {
    Icon: Trophy,
    title: 'First mover wins',
    text: 'The first mover to reply claims the lead.',
  },
  {
    Icon: Phone,
    title: 'Connect faster',
    text: 'Receive customer details immediately and call while the lead is hot.',
  },
];

export default function StepSmsClaim({ ctx }) {
  const r = ctx.smsRoute;
  const sandbox = !!ctx.sandbox;

  // ── Sandbox tick state ───────────────────────────────────────────────
  // The phone auto-loops: tick through 5 states (0..4), hold the final
  // calling state for ~2.4s, briefly clear (~500ms), then loop. Total
  // cycle ≈ 8.5s. Each state visible for 1.2s — ~25% slower than the
  // previous animated variant per operator spec.
  const [active, setActive] = useState(sandbox ? -1 : 0);

  useEffect(() => {
    // Production keeps the legacy tick logic for STEPS-length progress.
    if (!sandbox) {
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
    }

    // Sandbox: looping phone tutorial.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      // Reduced motion — jump to the final terminal state, no loop.
      setActive(4);
      return;
    }

    let timerId;
    const STEP_MS = 1200;       // gap between reveals
    const HOLD_MS = 2400;       // hold on final calling state
    const EMPTY_MS = 500;       // brief empty thread before loop restart
    const INITIAL_MS = 800;     // pause before first reveal

    function reveal(value) {
      setActive(value);
      if (value < 4) {
        timerId = setTimeout(() => reveal(value + 1), STEP_MS);
      } else {
        // Final state held, then loop back through empty.
        timerId = setTimeout(() => {
          setActive(-1);
          timerId = setTimeout(() => reveal(0), EMPTY_MS);
        }, HOLD_MS);
      }
    }

    timerId = setTimeout(() => reveal(0), INITIAL_MS);
    return () => clearTimeout(timerId);
  }, [sandbox]);

  // ── Sandbox: phone-as-tutorial layout ───────────────────────────────
  if (sandbox) {
    return (
      <div className="ow-content ow-content--wide ow-smsclaim-v2">
        <div className="ow-smsclaim-grid">
          <div className="ow-smsclaim-copy">
            <h1 className="ow-h1 ow-smsclaim-title">Claim leads by text</h1>
            <p className="ow-sub ow-smsclaim-sub">
              Get a text when a matching lead arrives.
              <br />
              Reply <strong className="ow-smsclaim-orange">SEND</strong> to claim it instantly.
            </p>

            <ul className="ow-smsclaim-benefits">
              {BENEFITS.map((b) => (
                <li key={b.title} className="ow-smsclaim-benefit">
                  <span className="ow-smsclaim-benefit-icon" aria-hidden="true">
                    <b.Icon size={18} strokeWidth={2.2} />
                  </span>
                  <div>
                    <div className="ow-smsclaim-benefit-title">{b.title}</div>
                    <div className="ow-smsclaim-benefit-text">{b.text}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="ow-smsclaim-phone-col">
            <SmsClaimPhone active={active} />
          </div>
        </div>

        <div className="ow-smsclaim-balance">
          <span className="ow-smsclaim-balance-icon" aria-hidden="true">
            <Wallet size={18} strokeWidth={2.2} />
          </span>
          <div className="ow-smsclaim-balance-copy">
            <strong>To claim a lead by text,</strong>
            <span> your balance must cover the lead price.</span>
          </div>
          <div className="ow-smsclaim-balance-eg">
            <div className="ow-smsclaim-balance-eg-col">
              <div className="ow-smsclaim-balance-eg-label">Lead price</div>
              <div className="ow-smsclaim-balance-eg-value">$42</div>
            </div>
            <div className="ow-smsclaim-balance-eg-col">
              <div className="ow-smsclaim-balance-eg-label">Balance needed</div>
              <div className="ow-smsclaim-balance-eg-value">$42</div>
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
