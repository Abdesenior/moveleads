/**
 * Step 7 — Activate.
 *
 * Two internal phases inside one step:
 *
 *   Phase A — tier picker (no Stripe call yet):
 *     The mover sees the two tiers ($100 → $150 / $50 → $50). On Continue,
 *     the controller calls onCreateIntent(tier) which fetches
 *     POST /api/billing/create-payment-intent and hands back
 *     { clientSecret, totalCredits }. On success we flip to Phase B.
 *
 *   Phase B — Stripe Payment Element:
 *     <Elements> mounts with the returned clientSecret. ExpressCheckout
 *     (Apple Pay / Google Pay / Link) renders above the card surface; both
 *     paths share the same confirmAndComplete() handler. On success we
 *     POST /api/billing/verify-payment-intent, refreshUser(), and call
 *     ctx.onPaid() which carries the mover to Step 8 (Success).
 *
 * The "Browse leads first" CTA in Phase A calls
 *   POST /api/onboarding/dismiss-activation-offer
 * via the controller's onBrowseFirst, which navigates the mover to
 * /dashboard/leads with the activation offer dismissed for this session.
 *
 * Port note: this is a direct port of v1's ScreenBalance + ScreenPayment +
 * ActivationPaymentForm trio, condensed into a single component with two
 * phases. The fake card-form inputs in the prototype are removed entirely —
 * the real PaymentElement renders the card surface.
 */

import { useContext, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { AuthContext } from '../../../context/AuthContext';

// Stripe.js loader — memoized at module scope per stripe/react-stripe-js
// docs so multiple Activate mounts share one promise.
const stripePromiseSingleton = (() => {
  let promise = null;
  return () => {
    if (promise) return promise;
    const pubKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    promise = pubKey ? loadStripe(pubKey) : Promise.resolve(null);
    return promise;
  };
})();

function TierPicker({ tier, setTier, fetching, initErr, onContinue, onSkip }) {
  const ctaLabel = fetching
    ? 'Preparing secure payment…'
    : tier === 100
      ? 'Claim Your $150 Balance'
      : 'Activate $50 Starter Balance';

  return (
    <div className="ow-content">
      <div className="ow-header" style={{ textAlign: 'center' }}>
        <h1 className="ow-h1">Ready to receive moving jobs</h1>
        <p className="ow-sub">
          Your account is prepared and ready to receive verified move requests.
        </p>
      </div>

      <p className="ow-wallet-framing">
        This is your <strong>lead-buying wallet</strong> — not a subscription.
        You pay only when you unlock or claim a lead. Your balance stays in
        your account until you use it.
      </p>

      <div className="ow-tiers" role="radiogroup" aria-label="Choose your starting balance">
        <button
          type="button"
          className={`ow-tier-v2 ow-tier-v2-primary${tier === 100 ? ' selected' : ''}`}
          role="radio"
          aria-checked={tier === 100}
          aria-label="Pay $100 and receive $150 balance"
          onClick={() => setTier(100)}
        >
          {tier === 100 && (<span className="ow-tier-badge" aria-hidden="true">✓ Selected</span>)}
          <div className="ow-tier-row-pill">
            <span className="ow-tier-pill-recommended">Includes $50 bonus</span>
          </div>
          <div className="ow-tier-amount-row">
            <span className="ow-tier-pay">$100</span>
            <span className="ow-tier-arrow">→</span>
            <span className="ow-tier-receive">$150 balance</span>
          </div>
          <div className="ow-tier-support">Unlock verified homeowner move requests.</div>
        </button>

        <button
          type="button"
          className={`ow-tier-v2 ow-tier-v2-secondary${tier === 50 ? ' selected' : ''}`}
          role="radio"
          aria-checked={tier === 50}
          aria-label="Pay $50 and receive $50 starter balance"
          onClick={() => setTier(50)}
        >
          {tier === 50 && (<span className="ow-tier-badge" aria-hidden="true">✓ Selected</span>)}
          <div className="ow-tier-row-pill">
            <span className="ow-tier-pill-starter">Starter — no bonus included</span>
          </div>
          <div className="ow-tier-amount-row">
            <span className="ow-tier-pay">$50</span>
            <span className="ow-tier-arrow">→</span>
            <span className="ow-tier-receive ow-tier-receive-muted">$50 balance</span>
          </div>
        </button>
      </div>

      <p className="ow-trust-strip">
        Refundable balance · No subscription · Balance never expires · Pay per lead, never per month
      </p>

      {initErr && (
        <div className="ow-activate-err" role="alert" aria-live="polite">
          <div className="ow-activate-err-msg">{initErr}</div>
        </div>
      )}

      <button
        type="button"
        className="ow-activate-cta"
        onClick={onContinue}
        disabled={fetching}
      >
        {ctaLabel}
      </button>

      <button
        type="button"
        className="ow-activate-skip ow-skip-secondary"
        onClick={onSkip}
        disabled={fetching}
      >
        <span>Browse leads first</span>
        <span className="ow-skip-secondary-sub">
          You can add balance when you're ready to buy.
        </span>
      </button>
    </div>
  );
}

function PaymentForm({ API_URL, tier, intent, onBack, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const { refreshUser } = useContext(AuthContext);
  const [submitting, setSubmitting] = useState(false);
  const [paymentErr, setPaymentErr] = useState('');
  const [elementReady, setElementReady] = useState(false);
  const [hasExpressMethods, setHasExpressMethods] = useState(false);

  const ctaLabel = submitting
    ? 'Processing payment…'
    : tier === 100
      ? `Pay $100 and activate $${intent.totalCredits} balance →`
      : `Pay $${tier} and activate balance →`;

  async function confirmAndComplete() {
    setPaymentErr('');
    setSubmitting(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/dashboard/leads?onboarding=success`,
        },
        redirect: 'if_required',
      });
      if (error) {
        setPaymentErr(error.message || 'Payment could not be completed.');
        setSubmitting(false);
        return;
      }
      if (paymentIntent && paymentIntent.status === 'succeeded') {
        try {
          await fetch(`${API_URL}/billing/verify-payment-intent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-auth-token': localStorage.getItem('token') || '',
            },
            body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
          });
        } catch {
          // Webhook will catch up — no UI block needed.
        }
        if (refreshUser) await refreshUser();
        if (onPaid) onPaid();
        return;
      }
      setPaymentErr(`Payment ended in unexpected status: ${paymentIntent?.status || 'unknown'}.`);
      setSubmitting(false);
    } catch (err) {
      setPaymentErr(err?.message || 'Unexpected error during payment.');
      setSubmitting(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    confirmAndComplete();
  }

  function handleExpressConfirm() {
    if (!stripe || !elements || submitting) return;
    confirmAndComplete();
  }

  function handleExpressReady(event) {
    const methods = event?.availablePaymentMethods;
    setHasExpressMethods(!!methods && Object.keys(methods).length > 0);
  }

  return (
    <form className="ow-pay ow-content" onSubmit={handleSubmit}>
      <button
        type="button"
        className="ow-pay-back"
        onClick={onBack}
        disabled={submitting}
      >
        ← Change balance
      </button>

      <header className="ow-header">
        <h1 className="ow-h1">Secure payment</h1>
        <p className="ow-sub">
          {tier === 100
            ? `You'll be charged $100 — your $${intent.totalCredits} balance will be added immediately after payment.`
            : `You'll be charged $${tier} — your $${tier} balance will be added immediately after payment.`}
        </p>
      </header>

      <div className="ow-pay-element-wrap">
        <ExpressCheckoutElement
          onConfirm={handleExpressConfirm}
          onReady={handleExpressReady}
          options={{
            buttonHeight: 48,
            buttonTheme: { applePay: 'black', googlePay: 'black' },
            layout: { maxColumns: 2, maxRows: 2 },
            paymentMethods: {
              applePay: 'always',
              googlePay: 'always',
              link: 'auto',
            },
          }}
        />
        {hasExpressMethods && (
          <div className="ow-pay-divider" aria-hidden="true">
            <span>or pay with card</span>
          </div>
        )}
        <PaymentElement
          options={{ layout: 'tabs' }}
          onReady={() => setElementReady(true)}
        />
      </div>

      {paymentErr && (
        <div className="ow-activate-err" role="alert" aria-live="polite">
          <div className="ow-activate-err-msg">{paymentErr}</div>
        </div>
      )}

      <button
        type="submit"
        className="ow-activate-cta"
        disabled={!stripe || !elements || !elementReady || submitting}
      >
        {ctaLabel}
      </button>
    </form>
  );
}

export default function StepActivate({ ctx }) {
  const {
    API_URL,
    tier, setTier,
    intent, setIntent,
    onCreateIntent,
    onBrowseFirst,
    onPaid,
  } = ctx;

  const [fetching, setFetching] = useState(false);
  const [initErr, setInitErr] = useState('');

  async function handleContinue() {
    setFetching(true);
    setInitErr('');
    const res = await onCreateIntent(tier);
    setFetching(false);
    if (!res?.ok) {
      setInitErr(res?.msg || 'Could not start payment.');
    }
  }

  function backToTier() {
    setIntent(null);
  }

  if (intent && intent.clientSecret) {
    return (
      <Elements
        key={intent.clientSecret}
        stripe={stripePromiseSingleton()}
        options={{
          clientSecret: intent.clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#ff6a14',
              colorText: '#0f172a',
              colorBackground: '#ffffff',
              colorDanger: '#dc2626',
              fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              borderRadius: '10px',
              spacingUnit: '4px',
            },
          },
        }}
      >
        <PaymentForm
          API_URL={API_URL}
          tier={tier}
          intent={intent}
          onBack={backToTier}
          onPaid={onPaid}
        />
      </Elements>
    );
  }

  return (
    <TierPicker
      tier={tier}
      setTier={setTier}
      fetching={fetching}
      initErr={initErr}
      onContinue={handleContinue}
      onSkip={onBrowseFirst}
    />
  );
}
