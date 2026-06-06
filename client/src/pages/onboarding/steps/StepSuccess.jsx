/**
 * Step 8 — Activation success (terminal).
 *
 * Calm arrival moment. The headline confirms the activation; the
 * reassurance card asks the mover to wait for fresh matching leads
 * instead of grazing the marketplace. Primary CTA navigates to
 * /dashboard/leads via ctx.onDone().
 */

import { Check } from 'lucide-react';

export default function StepSuccess({ ctx }) {
  const { bonusPath, balance, onDone } = ctx;

  const balanceAmount = bonusPath ? 150 : Math.max(balance, 50);
  const headline = `Your $${balanceAmount} balance is activated and ready to claim leads`;

  return (
    <div className="ow-content ow-success">
      <div className="ow-success-icon" aria-hidden="true">
        <Check size={28} strokeWidth={3} />
      </div>
      <h1 className="ow-h1">{headline}</h1>

      <div className="ow-success-reassurance">
        <p className="ow-success-reassurance-title">
          Fresh leads are on the way
        </p>
        <p className="ow-success-reassurance-body">
          We recommend waiting for fresh matching leads — we&apos;ll send the
          alert the moment they arrive.
        </p>
      </div>

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
