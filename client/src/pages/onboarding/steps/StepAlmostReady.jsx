/**
 * Step 6 — Almost Ready (interstitial).
 *
 * No inputs, no save. Renders a staggered 4-item readiness checklist
 * followed by a soft "$50 free credit" tease. The Continue CTA in the
 * footer carries the mover into Step 7 (Activate).
 *
 * NOTE: the controller writes onboarding.currentStep=5 immediately after
 * the Step 5 SMS Claim PATCH succeeds — so a refresh on this screen
 * resumes here, not back at Welcome.
 */

import { useEffect, useState } from 'react';
import { Check, Sparkle } from 'lucide-react';

export default function StepAlmostReady({ ctx }) {
  const items = [
    'Company location saved',
    'Delivery area configured',
    'Alerts ready',
    ctx.smsEnabled ? 'SMS Claim ready' : 'SMS Claim can be enabled later',
  ];

  const [shown, setShown] = useState(0);
  const [credit, setCredit] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(items.length);
      setCredit(true);
      return;
    }
    const timers = [];
    items.forEach((_, i) =>
      timers.push(setTimeout(() => setShown((s) => Math.max(s, i + 1)), 350 + i * 280))
    );
    timers.push(setTimeout(() => setCredit(true), 350 + items.length * 280 + 150));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ow-content">
      <div className="ow-header" style={{ textAlign: 'center' }}>
        <h1 className="ow-h1">Your account is almost ready</h1>
        <p className="ow-sub">
          We've set up your coverage, alerts, and lead preferences.
        </p>
      </div>

      <div className="ow-setup-list">
        {items.map((t, i) => (
          <div key={t} className={'ow-setup-item' + (shown > i ? ' is-in' : '')}>
            <span className="ow-setup-check"><Check size={13} strokeWidth={3} /></span>
            {t}
          </div>
        ))}
      </div>

      <div className={'ow-credit' + (credit ? ' is-in' : '')}>
        <span className="ow-credit-spark"><Sparkle size={15} /></span>
        <div>
          <div className="ow-credit-title">Claim your $50 free credit</div>
          <div className="ow-credit-sub">
            Add your starting balance to unlock or claim moving opportunities
            when they arrive.
          </div>
        </div>
      </div>
    </div>
  );
}
