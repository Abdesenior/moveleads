import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { AuthContext } from '../../context/AuthContext';
import { US_STATES } from '../../data/usStates';
import PlaceAutocomplete from '../../components/PlaceAutocomplete';
import StateMultiSelect from '../../components/StateMultiSelect';
import './Onboarding.css';

// Single Stripe.js loader memoized at module scope per @stripe/react-stripe-js docs.
const stripePromiseSingleton = (() => {
  let promise = null;
  return () => {
    if (promise) return promise;
    const pubKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    promise = pubKey ? loadStripe(pubKey) : Promise.resolve(null);
    return promise;
  };
})();

// Visible steps in the progress bar:
//   1 = Dispatch base + pickup       → "Where are your crews based?"
//   2 = Delivery coverage            → "Where can your crews deliver?"
//   3 = Alerts                       → phone + SMS + Live Phone Transfers
//   4 = Activate                     → balance picker only (no Stripe call yet)
//   5 = Payment                      → Stripe Payment Element only
// Internal-only post-flow step (no progress bar):
//   6 = Activation success
const TOTAL_STEPS = 5;

// Compact mover-language microcopy for the progress label.
const STEP_MICROCOPY = {
  1: 'Where your crews are based',
  2: 'Where you deliver',
  3: 'How we reach you',
  4: 'Activate your account',
  5: 'Secure payment',
};

const SETUP_STAGES = [
  { id: 1, label: 'Dispatch' },
  { id: 2, label: 'Coverage' },
  { id: 3, label: 'Alerts' },
  { id: 4, label: 'Activate' },
  { id: 5, label: 'Payment' },
];

// Build personalized phrasing fragments from the answers object.
function buildPersona(answers, fallback = {}) {
  const db = answers.dispatchBase || {};
  const market = (db.city && db.state)
    ? `${db.city}, ${db.state}`
    : (answers.primaryMarket || '').trim() || fallback.market || 'your market';
  return {
    market,
    base: db,
    pickupMode:   answers.pickup?.mode   || 'near',
    deliveryMode: answers.delivery?.mode || 'same',
  };
}

function stateName(code) {
  const found = US_STATES.find(s => s.code === code);
  return found ? found.name : code;
}

export default function OnboardingWizard({ onClose, initialStep }) {
  const { API_URL, refreshUser, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [step, setStep] = useState(initialStep || 1);
  const [answers, setAnswers] = useState({
    // Step 1
    dispatchBase: { input: '', zip: '', city: '', state: '' },
    pickup:       { mode: 'near', states: [] },
    // Step 2
    delivery:     { mode: 'same', states: [] },
    // Legacy back-compat (resume only — not asked in the new UI)
    primaryMarket: '',
    coverageRadius: '',
    additionalMarkets: [],
    // Step 3
    phone: user?.phone || '',
    smsNotif: !!user?.smsNotif,
    receiveLiveTransfers: !!user?.receiveLiveTransfers,
  });

  // Tier picked in Step 4 + PaymentIntent fetched on the 4 → 5 transition.
  const [tier, setTier] = useState(100);
  const [intent, setIntent] = useState(null);

  // Restore prior progress on mount
  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/onboarding/status`, {
      headers: { 'x-auth-token': localStorage.getItem('token') || '' },
    })
      .then(r => r.json())
      .then(data => {
        if (!alive || !data?.onboarding) return;
        const ob = data.onboarding;
        if (!initialStep && ob.currentStep && ob.currentStep > 0 && ob.currentStep <= TOTAL_STEPS) {
          setStep(ob.currentStep);
        }
        if (ob.answers) {
          const a = ob.answers;
          setAnswers(prev => ({
            ...prev,
            dispatchBase:        (a.dispatchBase && a.dispatchBase.zip) ? a.dispatchBase : prev.dispatchBase,
            pickup:              (a.pickup   && typeof a.pickup.mode === 'string')   ? { mode: a.pickup.mode,   states: Array.isArray(a.pickup.states)   ? a.pickup.states   : [] } : prev.pickup,
            delivery:            (a.delivery && typeof a.delivery.mode === 'string') ? { mode: a.delivery.mode, states: Array.isArray(a.delivery.states) ? a.delivery.states : [] } : prev.delivery,
            primaryMarket:       a.primaryMarket       ?? prev.primaryMarket,
            coverageRadius:      a.coverageRadius      ?? prev.coverageRadius,
            additionalMarkets:   a.additionalMarkets   ?? prev.additionalMarkets,
            phone:                (typeof a.phone === 'string' && a.phone) ? a.phone : prev.phone,
            smsNotif:             (typeof a.smsNotif === 'boolean') ? a.smsNotif : prev.smsNotif,
            receiveLiveTransfers: (typeof a.receiveLiveTransfers === 'boolean') ? a.receiveLiveTransfers : prev.receiveLiveTransfers,
          }));
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [API_URL, initialStep]);

  const setAnswer = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }));

  async function saveStep(stepNum) {
    try {
      await fetch(`${API_URL}/onboarding/save-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({
          step: stepNum,
          answers: {
            dispatchBase: answers.dispatchBase,
            pickup: answers.pickup,
            delivery: answers.delivery,
            primaryMarket: answers.primaryMarket,
            coverageRadius: answers.coverageRadius,
            additionalMarkets: answers.additionalMarkets,
            phone: answers.phone,
            smsNotif: answers.smsNotif,
            receiveLiveTransfers: answers.receiveLiveTransfers,
          },
        }),
      });
    } catch (err) {
      console.error('[OnboardingWizard] save-step failed:', err);
    }
  }

  // Mark wizard complete server-side. Called once on the 3 → 4 transition —
  // past that point the user is "done with setup", whether or not they
  // activate. Idempotent on the server.
  const completeCalledRef = useRef(false);
  async function callComplete() {
    try {
      await fetch(`${API_URL}/onboarding/complete`, {
        method: 'POST',
        headers: { 'x-auth-token': localStorage.getItem('token') || '' },
      });
    } catch (err) {
      console.error('[OnboardingWizard] complete failed:', err);
    }
  }

  async function next() {
    await saveStep(step);
    if (step < 3) {
      setStep(step + 1);
    } else if (step === 3) {
      if (!completeCalledRef.current) {
        completeCalledRef.current = true;
        await callComplete();
      }
      setStep(4);
    }
    // Steps 4 + 5 + 6 progress via their own internal CTAs.
  }

  function back() {
    if (step > 1 && step <= TOTAL_STEPS) {
      // Stepping back from Payment to Balance also drops the in-flight intent
      // so the next continue triggers a fresh PaymentIntent.
      if (step === 5) setIntent(null);
      setStep(step - 1);
    }
  }

  // Step 4 → Step 5 transition. Fetch a PaymentIntent for the chosen tier.
  async function continueToPayment() {
    try {
      const res = await fetch(`${API_URL}/billing/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': localStorage.getItem('token') || '',
        },
        body: JSON.stringify({ amount: tier, source: 'onboarding_activation' }),
      });
      const data = await res.json();
      if (!res.ok || !data?.clientSecret) {
        return { ok: false, msg: data?.msg || `Could not start payment (status ${res.status}).` };
      }
      setIntent(data);
      setStep(5);
      return { ok: true };
    } catch (err) {
      console.error('[Activation] create-payment-intent threw', err);
      return { ok: false, msg: err?.message || 'Network error starting payment.' };
    }
  }

  async function dismissSkip() {
    try {
      await fetch(`${API_URL}/onboarding/skip`, {
        method: 'POST',
        headers: { 'x-auth-token': localStorage.getItem('token') || '' },
      });
    } catch { /* swallow */ }
    if (refreshUser) await refreshUser();
    onClose && onClose();
  }

  async function onActivationDone() {
    if (refreshUser) await refreshUser();
    setStep(6);
  }

  async function closeAfterSuccess() {
    if (refreshUser) await refreshUser();
    if (onClose) onClose();
    navigate('/dashboard/leads');
  }

  const stepMicro = STEP_MICROCOPY[step] || '';
  // Global footer is hidden during activation (step 4 has its own CTAs),
  // payment (step 5 has the Stripe form), and the success screen (step 6).
  const showFooter = step <= 3;
  const showProgress = step <= TOTAL_STEPS;

  return (
    <div className="onboarding-wizard" role="dialog" aria-label="Partner activation setup">
      <div className="ow-blur" />
      <div className="ow-modal">
        {showProgress && (
          <div className="ow-header">
            <div className="ow-progress">
              <div className="ow-progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
            </div>
            <div className="ow-progress-label">Step {step} of {TOTAL_STEPS} · {stepMicro}</div>
            <div className="ow-stages" aria-label="Setup progress">
              {SETUP_STAGES.map(stage => {
                const state = stage.id < step ? 'done' : stage.id === step ? 'active' : 'future';
                return (
                  <span key={stage.id} className={`ow-stage ow-stage-${state}`}>
                    <span className="ow-stage-dot">
                      {state === 'done' ? '✓' : stage.id}
                    </span>
                    <span className="ow-stage-label">{stage.label}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="ow-body">
          <div className="ow-step-anim" key={step}>
            {step === 1 && <ScreenDispatchPickup answers={answers} setAnswer={setAnswer} companyName={user?.companyName} />}
            {step === 2 && <ScreenDeliveryCoverage answers={answers} setAnswer={setAnswer} API_URL={API_URL} />}
            {step === 3 && <ScreenAlerts answers={answers} setAnswer={setAnswer} />}
            {step === 4 && <ScreenBalance tier={tier} setTier={setTier} onContinue={continueToPayment} onSkip={dismissSkip} />}
            {step === 5 && intent && <ScreenPayment API_URL={API_URL} tier={tier} intent={intent} onBack={back} onDone={onActivationDone} />}
            {step === 6 && <ScreenActivationSuccess onDone={closeAfterSuccess} answers={answers} />}
          </div>
        </div>

        {showFooter && (
          <div className="ow-footer">
            <div className="ow-footer-left">
              {step > 1 && (
                <button className="ow-back" onClick={back} type="button">← Back</button>
              )}
            </div>
            <button
              className="ow-next"
              onClick={next}
              type="button"
              disabled={!isStepValid(step, answers)}
            >
              {step === 3 ? 'Continue to activation →' : 'Continue →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function isStepValid(step, a) {
  if (step === 1) {
    if (!a.dispatchBase || !a.dispatchBase.zip) return false;
    if (a.pickup?.mode === 'states' && !(a.pickup.states && a.pickup.states.length)) return false;
    return true;
  }
  if (step === 2) {
    if (a.delivery?.mode === 'states' && !(a.delivery.states && a.delivery.states.length)) return false;
    return true;
  }
  if (step === 3) {
    const digits = String(a.phone || '').replace(/\D/g, '');
    return digits.length === 10;
  }
  return true;
}

// ── Step 1: Dispatch base + pickup ──────────────────────────────────────────
function ScreenDispatchPickup({ answers, setAnswer, companyName }) {
  const dispatchBase = answers.dispatchBase || {};
  const pickup       = answers.pickup   || { mode: 'near', states: [] };
  const baseReady    = !!dispatchBase.zip;

  function setPickupMode(mode) { setAnswer('pickup', { ...pickup, mode }); }
  function setPickupStates(s)  { setAnswer('pickup', { ...pickup, states: s }); }

  const PICKUP_OPTIONS = [
    { id: 'near',   label: 'Local around my base',   desc: 'Nearby pickups around your base.' },
    { id: 'state',  label: 'Anywhere in my state',   desc: dispatchBase.state ? `Pickups across ${stateName(dispatchBase.state)}.` : 'Pickups across your state.' },
    { id: 'states', label: 'Multiple states',        desc: 'Pick the states your crews cover.' },
  ];

  return (
    <>
      {companyName && <p className="ow-hello">Hi {companyName} —</p>}
      <h1 className="ow-h1">Where are your crews based?</h1>
      <p className="ow-sub">We'll send you move requests near your dispatch base.</p>

      {/* Dispatch base autocomplete */}
      <div className="ow-field">
        <PlaceAutocomplete
          id="dispatchBaseInput"
          value={baseReady ? dispatchBase : null}
          onSelect={(p) => setAnswer('dispatchBase', { input: p.label, zip: p.zip, city: p.city, state: p.state })}
          onClear={() => setAnswer('dispatchBase', { input: '', zip: '', city: '', state: '' })}
          placeholder="Houston, TX or 77001"
          ariaLabel="Search dispatch base"
        />
      </div>

      {/* Value reassurance — appears once the user picks a base */}
      {baseReady && (
        <aside className="ow-market-open" role="note">
          <span className="ow-market-open-dot" aria-hidden="true" />
          <div>
            <div className="ow-market-open-title">Your market is open</div>
            <div className="ow-market-open-body">We're currently onboarding movers in your area.</div>
          </div>
        </aside>
      )}

      {/* Pickup areas */}
      <div className="ow-field" aria-disabled={!baseReady}>
        <label className="ow-label">Where do your crews start jobs?</label>
        <div className="ow-cards">
          {PICKUP_OPTIONS.map(opt => {
            const active = pickup.mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`ow-card${active ? ' active' : ''}`}
                onClick={() => baseReady && setPickupMode(opt.id)}
                aria-pressed={active}
                disabled={!baseReady}
              >
                <div className="ow-card-row">
                  <div>
                    <div className="ow-card-title">{opt.label}</div>
                    <div className="ow-card-desc">{opt.desc}</div>
                  </div>
                  {active && <span className="ow-card-check">✓</span>}
                </div>
              </button>
            );
          })}
        </div>
        {pickup.mode === 'states' && baseReady && (
          <div style={{ marginTop: 10 }}>
            <StateMultiSelect
              value={pickup.states || []}
              onChange={setPickupStates}
              placeholder="Type a pickup state…"
              ariaLabel="Select pickup states"
            />
          </div>
        )}
      </div>
    </>
  );
}

// ── Step 2: Delivery coverage ───────────────────────────────────────────────
function ScreenDeliveryCoverage({ answers, setAnswer, API_URL }) {
  const dispatchBase = answers.dispatchBase || {};
  const pickup       = answers.pickup   || { mode: 'near', states: [] };
  const delivery     = answers.delivery || { mode: 'same', states: [] };
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!dispatchBase.zip) { setPreview(null); return; }
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/onboarding/preview-coverage-v2`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-token': localStorage.getItem('token') || '',
          },
          body: JSON.stringify({ dispatchBase, pickup, delivery }),
        });
        setPreview(await res.json());
      } catch {
        setPreview({ ok: false, msg: 'Preview unavailable.' });
      } finally {
        setPreviewing(false);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_URL, dispatchBase.zip, pickup.mode, pickup.states.join(','), delivery.mode, delivery.states.join(',')]);

  function setDeliveryMode(mode) { setAnswer('delivery', { ...delivery, mode }); }
  function setDeliveryStates(s)  { setAnswer('delivery', { ...delivery, states: s }); }

  const DELIVERY_OPTIONS = [
    { id: 'same',       label: 'Same as pickup',  desc: 'Local moves only.' },
    { id: 'states',     label: 'Multiple states', desc: 'Pick states you deliver to.' },
    { id: 'nationwide', label: 'Nationwide',      desc: 'Long-distance across the U.S.' },
  ];

  return (
    <>
      <h1 className="ow-h1">Where can your crews deliver?</h1>
      <p className="ow-sub">This narrows the long-distance leads we send you.</p>

      <div className="ow-field">
        <div className="ow-cards">
          {DELIVERY_OPTIONS.map(opt => {
            const active = delivery.mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`ow-card${active ? ' active' : ''}`}
                onClick={() => setDeliveryMode(opt.id)}
                aria-pressed={active}
              >
                <div className="ow-card-row">
                  <div>
                    <div className="ow-card-title">{opt.label}</div>
                    <div className="ow-card-desc">{opt.desc}</div>
                  </div>
                  {active && <span className="ow-card-check">✓</span>}
                </div>
              </button>
            );
          })}
        </div>
        {delivery.mode === 'states' && (
          <div style={{ marginTop: 10 }}>
            <StateMultiSelect
              value={delivery.states || []}
              onChange={setDeliveryStates}
              placeholder="Type a delivery state…"
              ariaLabel="Select delivery states"
            />
          </div>
        )}
      </div>

      {/* Operational coverage preview — short, no ZIP count in the headline. */}
      {(previewing || preview) && (
        <div className={`ow-coverage-preview${preview && preview.ok === false ? ' err' : ''}`} role="status" aria-live="polite">
          {previewing && (
            <>
              <span className="ow-spinner" />
              <span>Checking coverage…</span>
            </>
          )}
          {!previewing && preview?.ok && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span className="ow-coverage-preview-dot" aria-hidden="true" />
              <span>{previewMessage(preview)}</span>
            </div>
          )}
          {!previewing && preview && preview.ok === false && (
            <span>{preview.msg || 'Could not resolve service area.'}</span>
          )}
        </div>
      )}
    </>
  );
}

function previewMessage(p) {
  const baseCity = p.base?.city || 'Your dispatch';
  const baseState = p.base?.state || '';
  const baseLabel = baseState ? `${baseCity}, ${baseState}` : baseCity;
  const pmode = p.pickup?.mode;
  const dmode = p.delivery?.mode;

  if (p.nationwide) {
    return <span><strong>{baseLabel}</strong> pickup · <strong>Nationwide</strong> delivery</span>;
  }
  if (pmode === 'near' && dmode === 'same') {
    return <span><strong>{baseLabel}</strong> dispatch area ready</span>;
  }
  if (pmode === 'state' && dmode === 'same') {
    return <span><strong>{stateName(baseState)}</strong> pickup + delivery ready</span>;
  }
  if (pmode === 'states' && dmode === 'same') {
    const list = (p.pickup.states || []).map(stateName).join(' · ');
    return <span><strong>{list || 'Multi-state'}</strong> pickup + delivery ready</span>;
  }
  if (dmode === 'states') {
    const pLabel = pmode === 'near'
      ? baseLabel
      : pmode === 'state'
        ? stateName(baseState)
        : (p.pickup.states || []).map(stateName).join(' · ');
    const dLabel = (p.delivery.states || []).map(stateName).join(' · ');
    return <span><strong>{pLabel}</strong> → <strong>{dLabel}</strong></span>;
  }
  return <span>Coverage ready</span>;
}

// ── Step 3: Alerts (phone + SMS + Live Transfers) ───────────────────────────
function ScreenAlerts({ answers, setAnswer }) {
  return (
    <>
      <h1 className="ow-h1">How should we send you move opportunities?</h1>
      <p className="ow-sub">Choose how your team should hear about matching requests.</p>

      <div className="ow-field">
        <label className="ow-label" htmlFor="notifPhone">Phone number</label>
        <input
          id="notifPhone"
          type="tel"
          className="ow-input"
          placeholder="(555) 123-4567"
          value={answers.phone || ''}
          onChange={e => setAnswer('phone', e.target.value)}
          autoComplete="tel"
        />
      </div>

      <div className="ow-field">
        <button
          type="button"
          className={`ow-toggle${answers.smsNotif ? ' active' : ''}`}
          onClick={() => setAnswer('smsNotif', !answers.smsNotif)}
          aria-pressed={!!answers.smsNotif}
        >
          <span className="ow-toggle-track" />
          <span className="ow-toggle-label">Text me when a request matches my service area</span>
        </button>
      </div>

      <div className="ow-field ow-live-transfer-field">
        <div className="ow-live-transfer-head">
          <div>
            <div className="ow-live-transfer-title">
              <span>Live Phone Transfers</span>
              <span className="ow-live-transfer-pill">$40 per accepted call</span>
            </div>
            <p className="ow-live-transfer-copy">
              When a premium lead requests a quote, our system calls your phone directly. Press 1 to accept and instantly connect with the customer.
            </p>
          </div>
          <button
            type="button"
            className={`ow-toggle${answers.receiveLiveTransfers ? ' active' : ''}`}
            onClick={() => setAnswer('receiveLiveTransfers', !answers.receiveLiveTransfers)}
            aria-pressed={!!answers.receiveLiveTransfers}
            aria-label="Enable Live Phone Transfers"
          >
            <span className="ow-toggle-track" />
          </button>
        </div>
        <div className="ow-live-transfer-warn">
          You're only charged $40 when you accept the call. Keep your balance above $50 to receive live transfers.
        </div>
      </div>
    </>
  );
}

// ── Step 4: Activate (balance picker only — no Stripe call yet) ─────────────
function ScreenBalance({ tier, setTier, onContinue, onSkip }) {
  const [fetching, setFetching] = useState(false);
  const [initErr, setInitErr] = useState('');

  const ctaLabel = fetching
    ? 'Preparing secure payment…'
    : tier === 100 ? 'Continue with $150 balance →' : 'Continue with $50 balance →';

  async function handleContinue() {
    setFetching(true);
    setInitErr('');
    const res = await onContinue();
    if (!res?.ok) {
      setInitErr(res?.msg || 'Could not start payment.');
      setFetching(false);
    }
    // Success path: parent flips to step 5; this component will unmount.
  }

  return (
    <div className="ow-choose">
      <h1 className="ow-h1">Activate your account</h1>
      <p className="ow-sub">Add your starting balance to unlock verified move requests.</p>

      <aside className="ow-fomo" role="note">
        <span className="ow-fomo-dot" aria-hidden="true" />
        <span>Active markets are opened gradually to protect request quality. Your <strong>$50 onboarding credit</strong> is available while onboarding remains open in your state.</span>
      </aside>

      <div className="ow-tiers">
        <button
          type="button"
          className={`ow-tier-v2 ow-tier-v2-primary${tier === 100 ? ' selected' : ''}`}
          role="radio"
          aria-checked={tier === 100}
          aria-label="Pay $100 and receive $150 balance"
          onClick={() => setTier(100)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTier(100); } }}
        >
          {tier === 100 && (<span className="ow-tier-badge" aria-hidden="true">✓ Selected</span>)}
          <div className="ow-tier-row-pill">
            <span className="ow-tier-pill-recommended">Recommended</span>
            <span className="ow-tier-supporting">Most partners start here</span>
          </div>
          <div className="ow-tier-amount-row">
            <span className="ow-tier-pay">$100</span>
            <span className="ow-tier-arrow">→</span>
            <span className="ow-tier-receive">$150 balance</span>
          </div>
          <div className="ow-tier-bonus-line">
            <span className="ow-tier-bonus-tag">+ $50 FREE</span>
            <span>onboarding credit included</span>
          </div>
        </button>

        <button
          type="button"
          className={`ow-tier-v2 ow-tier-v2-secondary${tier === 50 ? ' selected' : ''}`}
          role="radio"
          aria-checked={tier === 50}
          aria-label="Pay $50 and receive $50 starter balance"
          onClick={() => setTier(50)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTier(50); } }}
        >
          {tier === 50 && (<span className="ow-tier-badge" aria-hidden="true">✓ Selected</span>)}
          <div className="ow-tier-row-pill">
            <span className="ow-tier-pill-starter">Starter balance</span>
          </div>
          <div className="ow-tier-amount-row">
            <span className="ow-tier-pay">$50</span>
            <span className="ow-tier-arrow">→</span>
            <span className="ow-tier-receive ow-tier-receive-muted">$50 balance</span>
          </div>
          <div className="ow-tier-bonus-line muted">
            No bonus · Test the marketplace with a smaller balance.
          </div>
        </button>
      </div>

      <section className="ow-trust-panel" aria-label="Included with your balance">
        <div className="ow-trust-panel-title">Included with your balance</div>
        <ul className="ow-trust-panel-list">
          <li>Refundable unused balance</li>
          <li>No subscription or contract</li>
          <li>Credits never expire</li>
          <li>Secure card payment</li>
        </ul>
      </section>

      {initErr && (
        <div className="ow-activate-err" role="alert" aria-live="polite">
          <div className="ow-activate-err-msg">{initErr}</div>
        </div>
      )}

      <button type="button" className="ow-activate-cta" onClick={handleContinue} disabled={fetching}>
        {ctaLabel}
      </button>

      <button type="button" className="ow-activate-skip ow-skip-secondary" onClick={onSkip} disabled={fetching}>
        <span>Continue without activating</span>
        <span className="ow-skip-secondary-sub">Dashboard access stays limited until activation.</span>
      </button>
    </div>
  );
}

// ── Step 5: Secure payment (Stripe Payment Element only) ────────────────────
function ScreenPayment({ API_URL, tier, intent, onBack, onDone }) {
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
      <ActivationPaymentForm
        API_URL={API_URL}
        tier={tier}
        intent={intent}
        onBack={onBack}
        onDone={onDone}
      />
    </Elements>
  );
}

function ActivationPaymentForm({ API_URL, tier, intent, onBack, onDone }) {
  const stripe = useStripe();
  const elements = useElements();
  const { refreshUser } = useContext(AuthContext);
  const [submitting, setSubmitting] = useState(false);
  const [paymentErr, setPaymentErr] = useState('');
  const [elementReady, setElementReady] = useState(false);

  const ctaLabel = submitting
    ? 'Processing payment…'
    : tier === 100
      ? `Pay $100 and activate $${intent.totalCredits} balance →`
      : `Pay $${tier} and activate balance →`;

  const summaryRight = tier === 100
    ? `$${intent.selectedAmount} → $${intent.totalCredits} balance`
    : `$${intent.selectedAmount} → $${intent.selectedAmount} balance`;

  async function handlePay(e) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    setPaymentErr('');
    setSubmitting(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/dashboard/leads?payment=success`,
        },
        redirect: 'if_required',
      });
      if (error) {
        console.error('[Activation] confirmPayment error', error);
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
        } catch (verifyErr) {
          console.error('[Activation] verify failed (webhook will catch up):', verifyErr);
        }
        if (refreshUser) await refreshUser();
        if (onDone) onDone();
        return;
      }
      setPaymentErr(`Payment ended in unexpected status: ${paymentIntent?.status || 'unknown'}.`);
      setSubmitting(false);
    } catch (err) {
      console.error('[Activation] confirmPayment threw', err);
      setPaymentErr(err?.message || 'Unexpected error during payment.');
      setSubmitting(false);
    }
  }

  return (
    <form className="ow-pay" onSubmit={handlePay}>
      <button type="button" className="ow-pay-back" onClick={onBack} disabled={submitting}>
        ← Change balance
      </button>

      <h1 className="ow-h1">Secure payment</h1>
      <p className="ow-sub">Your selected balance will be added immediately after payment.</p>

      <div className="ow-pay-summary">
        <span className="ow-pay-summary-label">Selected</span>
        <span className="ow-pay-summary-value">{summaryRight}</span>
      </div>

      <div className="ow-pay-element-wrap">
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

// ── Step 6: Activation success (terminal) ───────────────────────────────────
function ScreenActivationSuccess({ onDone, answers }) {
  const { API_URL, user } = useContext(AuthContext);
  const persona = buildPersona(answers || {});

  const balance = Math.round(user?.balance || 0);
  const isBonusPath = !!user?.onboarding?.bonusClaimedAt || balance >= 150;
  const headline = isBonusPath ? 'Your $150 balance is active' : `Your $${balance || 50} balance is active`;
  const stateLabel = (persona.market || '').trim();
  const stateRecord = US_STATES.find(s => s.name.toLowerCase() === stateLabel.toLowerCase());
  const stateCode = stateRecord?.code || '';
  const [matchCount, setMatchCount] = useState(null);

  useEffect(() => {
    if (!stateLabel || stateLabel === 'your market') return;
    let alive = true;
    fetch(`${API_URL}/leads`, {
      headers: { 'x-auth-token': localStorage.getItem('token') || '' },
    })
      .then(r => r.json())
      .then(data => {
        if (!alive || !Array.isArray(data)) return;
        const nameLc = stateLabel.toLowerCase();
        const codeLc = stateCode.toLowerCase();
        const count = data.filter(l => {
          const o = (l.originCity || '').toLowerCase();
          const d = (l.destinationCity || '').toLowerCase();
          return (
            (nameLc && (o.includes(nameLc) || d.includes(nameLc))) ||
            (codeLc && (o.match(new RegExp(`(?:^|[\\s,])${codeLc}(?:$|[\\s,])`)) || d.match(new RegExp(`(?:^|[\\s,])${codeLc}(?:$|[\\s,])`))))
          );
        }).length;
        setMatchCount(count);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [API_URL, stateLabel, stateCode]);

  const marketLine = matchCount && matchCount > 0
    ? `${matchCount} active ${matchCount === 1 ? 'request matches' : 'requests match'} your setup near ${persona.market}`
    : (persona.market !== 'your market'
        ? `Routing enabled for ${persona.market}`
        : 'Routing enabled');

  return (
    <div className="ow-success">
      <div className="ow-success-icon">✓</div>
      <h1 className="ow-h1">{headline}</h1>
      <ul className="ow-success-list">
        {isBonusPath
          ? <li>Onboarding bonus applied: <strong>+$50</strong></li>
          : <li>Starter balance activated</li>}
        <li>{marketLine}</li>
        <li>Notifications ready for matching requests</li>
      </ul>
      <button type="button" className="ow-next" style={{ marginTop: 18 }} onClick={onDone}>
        View matching opportunities →
      </button>
    </div>
  );
}
