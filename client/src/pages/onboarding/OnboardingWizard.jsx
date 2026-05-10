import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, ExpressCheckoutElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { US_STATES } from '../../data/usStates';
import PlaceAutocomplete from '../../components/PlaceAutocomplete';
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

// Internal step state numbering:
//   1 = Dispatch base + pickup
//   2 = Delivery coverage
//   3 = Alerts (phone, SMS, email, Live Phone Transfers)
//   4 = Setup-complete celebration interstitial (no progress bar)
//   5 = Activate / balance picker (no Stripe call yet)
//   6 = Secure payment (Stripe Payment Element)
//   7 = Activation success (no progress bar)
//
// The visible progress bar shows 5 stages: Dispatch / Coverage / Alerts /
// Activate / Payment. Step 4 (setup-complete) and Step 7 (success) hide
// the progress chrome since they're celebration screens, not configuration.
const TOTAL_STEPS = 5; // visible progress steps (Dispatch through Payment)

const STEP_MICROCOPY = {
  1: 'Where your crews are based',
  2: 'Where you deliver',
  3: 'How we reach you',
  4: 'Setup complete',
  5: 'Activate your account',
  6: 'Secure payment',
};

const SETUP_STAGES = [
  { id: 1, label: 'Dispatch' },
  { id: 2, label: 'Coverage' },
  { id: 3, label: 'Alerts' },
  { id: 4, label: 'Activate' }, // shown active when internal step === 5
  { id: 5, label: 'Payment'  }, // shown active when internal step === 6
];

// Map internal step → visible-stage id (for the stages bar fill). Step 4
// (setup-complete) and step 7 (success) are interstitials with no stage.
const STEP_TO_STAGE = { 1: 1, 2: 2, 3: 3, 5: 4, 6: 5 };

// CTA labels while saveStep is in flight.
const SAVING_LABEL = {
  1: 'Saving dispatch area…',
  2: 'Preparing coverage…',
  3: 'Saving alerts…',
};

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

// ── US phone helpers ────────────────────────────────────────────────────────
// Strip everything that isn't a digit. Drop a leading "1" if a user pastes
// an E.164-style "+1 555…" so we always end up with exactly the 10 NANP
// digits before formatting.
function normalizeUSDigits(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.slice(0, 10);
}

// Format any phone-ish input as a NANP-style "(555) 555-5555" string. Safe
// to pass partially-typed values through — the user's typing experience is:
//   ""           → ""
//   "5"          → "(5"
//   "555"        → "(555)"
//   "5555"       → "(555) 5"
//   "5555555"    → "(555) 555-5"
//   "5555555555" → "(555) 555-5555"
function formatUSPhone(input) {
  const d = normalizeUSDigits(input);
  if (d.length === 0)  return '';
  if (d.length <= 3)   return `(${d}`;
  if (d.length === 3)  return `(${d})`;
  if (d.length <= 6)   return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// 10 digits + NANP rules: area code and exchange first digits must be 2-9.
function isValidUSPhone(input) {
  const d = normalizeUSDigits(input);
  if (d.length !== 10) return false;
  if (d[0] < '2' || d[3] < '2') return false;
  return true;
}

export default function OnboardingWizard({ onClose, initialStep }) {
  const { API_URL, refreshUser, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [step, setStep] = useState(initialStep || 1);
  const [answers, setAnswers] = useState({
    dispatchBase: { input: '', zip: '', city: '', state: '' },
    pickup:       { mode: '', states: [] },
    delivery:     { mode: 'same', states: [] },
    primaryMarket: '',
    coverageRadius: '',
    additionalMarkets: [],
    phone: user?.phone || '',
    smsNotif:             user?.smsNotif !== undefined ? !!user.smsNotif : true,
    emailNotif:           user?.emailNotif !== undefined ? !!user.emailNotif : true,
    receiveLiveTransfers: !!user?.receiveLiveTransfers,
  });

  const [tier, setTier] = useState(100);
  const [intent, setIntent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // a11y: lock body scroll while the wizard is mounted so the dashboard
  // underneath can't rubber-band on iOS Safari.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // a11y: ESC closes the wizard. Steps 4 (setup-complete) and 5 (activate)
  // already have explicit dismiss controls via `dismissSkip`; steps 1-3
  // (data-entry) and 7 (success) had no close affordance — ESC now provides
  // one. We default to the skip path so the user is never trapped.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      dismissSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the visual viewport on mobile so the modal stays sized correctly
  // when the iOS keyboard opens (keyboard reduces visualViewport.height but
  // does NOT shrink window.innerHeight — without this, the sticky footer
  // would slide behind the keyboard). We expose the live height as a CSS
  // variable so the stylesheet can `calc(var(--ow-vh, 100dvh) - 12px)`.
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const sync = () => {
      document.documentElement.style.setProperty('--ow-vh', `${vv.height}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      document.documentElement.style.removeProperty('--ow-vh');
    };
  }, []);

  // Backfill contact fields from the AuthContext user once it hydrates.
  // The useState initializer above runs synchronously on first mount, when
  // `user` may still be null (the wizard mounts from DashboardLayout before
  // /auth/me returns). Email already works because it's passed as a prop and
  // re-renders pick up the late value. Phone, smsNotif, emailNotif, and
  // receiveLiveTransfers live in `answers` state, so they need an effect.
  // Never overwrites typed input — only fills empty/default fields.
  useEffect(() => {
    if (!user) return;
    setAnswers(prev => {
      const next = { ...prev };
      let changed = false;
      if (!prev.phone && user.phone) {
        next.phone = formatUSPhone(user.phone);
        changed = true;
      }
      if (changed) return next;
      return prev;
    });
  }, [user?.phone]);

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
            phone:                (typeof a.phone === 'string' && a.phone) ? formatUSPhone(a.phone) : prev.phone,
            smsNotif:             (typeof a.smsNotif === 'boolean') ? a.smsNotif : prev.smsNotif,
            emailNotif:           (typeof a.emailNotif === 'boolean') ? a.emailNotif : prev.emailNotif,
            receiveLiveTransfers: (typeof a.receiveLiveTransfers === 'boolean') ? a.receiveLiveTransfers : prev.receiveLiveTransfers,
          }));
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [API_URL, initialStep]);

  const setAnswer = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }));

  async function saveStep(stepNum) {
    const res = await fetch(`${API_URL}/onboarding/save-step`, {
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
          emailNotif: answers.emailNotif,
          receiveLiveTransfers: answers.receiveLiveTransfers,
        },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`save-step ${res.status} ${txt}`.trim());
    }
  }

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
    if (saving) return;
    setSaveError('');
    setSaving(true);
    try {
      await saveStep(step);
      if (step === 3 && !completeCalledRef.current) {
        completeCalledRef.current = true;
        await callComplete();
      }
      if (step < 3) {
        setStep(step + 1);
      } else if (step === 3) {
        setStep(4); // → setup-complete celebration
      }
    } catch (err) {
      console.error('[OnboardingWizard] next() failed:', err);
      setSaveError("We couldn't save that step. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function back() {
    if (saving) return;
    if (step > 1 && step <= TOTAL_STEPS + 1) {
      // Stepping back from Payment (6) to Activate (5) drops the in-flight
      // intent so the next continue triggers a fresh PaymentIntent.
      if (step === 6) setIntent(null);
      // Setup-complete (4) is a celebration — back jumps to Alerts (3).
      setStep(step - 1);
    }
  }

  // Setup-complete → Activate transition. No save needed.
  function continueToActivate() {
    setStep(5);
  }

  // Step 5 → Step 6 transition. Fetch a PaymentIntent for the chosen tier.
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
      setStep(6);
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
    setStep(7);
  }

  async function closeAfterSuccess() {
    if (refreshUser) await refreshUser();
    if (onClose) onClose();
    navigate('/dashboard/leads');
  }

  const stepMicro = STEP_MICROCOPY[step] || '';
  // Global footer is shown only on configurable steps (1..3). All later
  // steps drive themselves with internal CTAs.
  const showFooter = step <= 3;
  // Progress chrome hidden on celebration steps (4 setup-complete, 7 success).
  const visibleStage = STEP_TO_STAGE[step];
  const showProgress = !!visibleStage;

  let nextLabel = 'Continue →';
  if (saving && SAVING_LABEL[step]) nextLabel = SAVING_LABEL[step];
  else if (step === 3) nextLabel = 'Continue →';

  return (
    <div className="onboarding-wizard" role="dialog" aria-label="Partner activation setup">
      <div className="ow-blur" />
      <div className="ow-modal" style={{ position: 'relative' }}>
        <button
          type="button"
          className="ow-close"
          aria-label="Close"
          onClick={dismissSkip}
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(15,23,42,0.06)', border: 'none',
            color: 'rgba(15,23,42,0.7)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <X size={18} />
        </button>
        {showProgress && (
          <div
            className="ow-header"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
            aria-valuenow={visibleStage}
            aria-label={`Step ${visibleStage} of ${TOTAL_STEPS}: ${stepMicro}`}
          >
            <div className="ow-progress">
              <div className="ow-progress-fill" style={{ width: `${(visibleStage / TOTAL_STEPS) * 100}%` }} />
            </div>
          </div>
        )}

        <div className="ow-body">
          <div className="ow-step-anim" key={step}>
            {step === 1 && <ScreenDispatchPickup answers={answers} setAnswer={setAnswer} companyName={user?.companyName} />}
            {step === 2 && <ScreenDeliveryCoverage answers={answers} setAnswer={setAnswer} API_URL={API_URL} />}
            {step === 3 && <ScreenAlerts answers={answers} setAnswer={setAnswer} userEmail={user?.email} />}
            {step === 4 && <ScreenSetupComplete answers={answers} onClaim={continueToActivate} onSkip={dismissSkip} />}
            {step === 5 && <ScreenBalance tier={tier} setTier={setTier} onContinue={continueToPayment} onSkip={dismissSkip} />}
            {step === 6 && intent && <ScreenPayment API_URL={API_URL} tier={tier} intent={intent} onBack={back} onDone={onActivationDone} />}
            {step === 7 && <ScreenActivationSuccess onDone={closeAfterSuccess} answers={answers} />}
          </div>
        </div>

        {showFooter && (
          <div className="ow-footer">
            <div className="ow-footer-left">
              {step > 1 && (
                <button className="ow-back" onClick={back} type="button" disabled={saving}>← Back</button>
              )}
              {saveError && (
                <span className="ow-save-error" role="alert">{saveError}</span>
              )}
            </div>
            <button
              className="ow-next"
              onClick={next}
              type="button"
              disabled={saving || !isStepValid(step, answers)}
              aria-busy={saving}
            >
              {saving && <span className="ow-spinner ow-spinner-on-cta" aria-hidden="true" />}
              <span>{nextLabel}</span>
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
    if (!a.pickup?.mode) return false;
    if (a.pickup?.mode === 'states' && !(a.pickup.states && a.pickup.states.length)) return false;
    return true;
  }
  if (step === 2) {
    if (a.delivery?.mode === 'states' && !(a.delivery.states && a.delivery.states.length)) return false;
    return true;
  }
  if (step === 3) {
    return isValidUSPhone(a.phone);
  }
  return true;
}

// ── Step 1: Dispatch base + pickup ──────────────────────────────────────────
function ScreenDispatchPickup({ answers, setAnswer, companyName }) {
  const dispatchBase = answers.dispatchBase || {};
  const pickup       = answers.pickup   || { mode: '', states: [] };
  const baseReady    = !!dispatchBase.zip;

  // Distinguishes "user has explicitly picked a coverage mode" from
  // "schema default landed here". On first arrival no card should look
  // active; on resume (where the user already advanced past step 1) the
  // saved selection should reappear. We treat a saved mode as explicit
  // only if a dispatch base is also set — that's the lifecycle order.
  const [modeUserPicked, setModeUserPicked] = useState(
    () => !!(answers.pickup && answers.pickup.mode && answers.dispatchBase && answers.dispatchBase.zip)
  );

  function setPickupMode(mode) {
    if (!baseReady) return;
    setModeUserPicked(true);
    const next = { ...pickup, mode };
    if (mode === 'states' && (!next.states || next.states.length === 0) && dispatchBase.state) {
      next.states = [dispatchBase.state];
    }
    setAnswer('pickup', next);
  }

  const PICKUP_OPTIONS = [
    { id: 'near',   label: 'Local around my base',   desc: 'Nearby pickups around your base.' },
    { id: 'state',  label: 'Anywhere in my state',   desc: dispatchBase.state ? `Pickups across ${stateName(dispatchBase.state)}.` : 'Pickups across your state.' },
    { id: 'states', label: 'Multiple states',        desc: 'Pick the states your crews cover.' },
  ];

  // Subtle rotating placeholder examples so the input clearly signals
  // "type a city or ZIP." Pauses on focus to avoid distracting the user.
  const PLACEHOLDER_EXAMPLES = ['Houston, TX', 'Dallas, TX', '77001', 'Phoenix, AZ', '90001'];
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  useEffect(() => {
    if (baseReady) return;
    const t = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_EXAMPLES.length), 2200);
    return () => clearInterval(t);
  }, [baseReady]);

  return (
    <>
      <header className="ow-step-header">
        <h1 className="ow-h1">Enter your main dispatch location</h1>
        <p className="ow-sub">We'll use this to match move requests near your crew base.</p>
      </header>

      <div className={`ow-field ow-dispatch-input-wrap${baseReady ? ' is-confirmed' : ' is-empty'}`}>
        <PlaceAutocomplete
          id="dispatchBaseInput"
          value={baseReady ? dispatchBase : null}
          onSelect={(p) => setAnswer('dispatchBase', { input: p.label, zip: p.zip, city: p.city, state: p.state })}
          onClear={() => { setAnswer('dispatchBase', { input: '', zip: '', city: '', state: '' }); setModeUserPicked(false); }}
          placeholder={`e.g. ${PLACEHOLDER_EXAMPLES[placeholderIdx]}`}
          ariaLabel="Search dispatch base"
          autoFocus={!baseReady}
        />
      </div>

      {baseReady && (
        <aside className="ow-market-open" role="note">
          <span className="ow-market-open-dot" aria-hidden="true" />
          <div>
            <div className="ow-market-open-title">Dispatch base confirmed</div>
            <div className="ow-market-open-body">We're currently onboarding movers in your area.</div>
          </div>
        </aside>
      )}

      <div className="ow-field" aria-disabled={!baseReady}>
        <label className="ow-label">Where do your crews start jobs?</label>
        {!baseReady && (
          <p className="ow-cards-hint" role="note">
            Enter your dispatch location first.
          </p>
        )}
        <div className={`ow-cards${!baseReady ? ' is-disabled' : ''}`}>
          {PICKUP_OPTIONS.map(opt => {
            const active = baseReady && modeUserPicked && pickup.mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`ow-card${active ? ' active' : ''}`}
                onClick={() => setPickupMode(opt.id)}
                aria-pressed={active}
                disabled={!baseReady}
                tabIndex={baseReady ? 0 : -1}
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
        {pickup.mode === 'states' && modeUserPicked && baseReady && (
          <p className="ow-states-note" role="note">
            You can add more operating states later in Settings → Service Areas.
          </p>
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

  // Same pattern as Step 1 pickup — picking "Multiple states" defaults to
  // the dispatch base state and points the user to Settings for expansion.
  function setDeliveryMode(mode) {
    const next = { ...delivery, mode };
    if (mode === 'states' && (!next.states || next.states.length === 0) && dispatchBase.state) {
      next.states = [dispatchBase.state];
    }
    setAnswer('delivery', next);
  }

  const DELIVERY_OPTIONS = [
    { id: 'same',       label: 'Same as pickup',  desc: 'Local moves only.' },
    { id: 'states',     label: 'Multiple states', desc: 'Pick states you deliver to.' },
    { id: 'nationwide', label: 'Nationwide',      desc: 'Long-distance across the U.S.' },
  ];

  return (
    <>
      <header className="ow-step-header">
        <h1 className="ow-h1">Where can your crews deliver?</h1>
        <p className="ow-sub">This narrows the long-distance leads we send you.</p>
      </header>

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
          <p className="ow-states-note" role="note">
            You can add more operating states later in Settings → Service Areas.
          </p>
        )}
      </div>

      {/* Hide the live state-to-state preview when the user picks "Multiple
          states" — the settings note above already tells them they can
          expand later, and showing only their auto-defaulted home state
          here would read as confusing or misleading. */}
      {delivery.mode !== 'states' && (previewing || preview) && (
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

// ── Step 3: Alerts (phone + SMS + email + Live Transfers) ───────────────────
function ScreenAlerts({ answers, setAnswer, userEmail }) {
  // Show inline phone validation only once the user has typed something —
  // empty field is "incomplete", not "invalid".
  const phoneError = answers.phone && !isValidUSPhone(answers.phone)
    ? 'Please enter a valid US phone number.'
    : '';

  return (
    <>
      <header className="ow-step-header">
        <h1 className="ow-h1">How should we send you move opportunities?</h1>
        <p className="ow-sub">Choose how your team should hear about matching requests.</p>
      </header>

      <div className="ow-field">
        <label className="ow-label" htmlFor="notifPhone">Phone number</label>
        <input
          id="notifPhone"
          type="tel"
          className={`ow-input${phoneError ? ' ow-input-err' : ''}`}
          placeholder="(555) 555-5555"
          value={answers.phone || ''}
          onChange={e => setAnswer('phone', formatUSPhone(e.target.value))}
          onBlur={e => setAnswer('phone', formatUSPhone(e.target.value))}
          autoComplete="tel"
          inputMode="numeric"
          maxLength={14}
          aria-invalid={!!phoneError}
          aria-describedby={phoneError ? 'notifPhoneErr' : undefined}
        />
        {phoneError && (
          <p id="notifPhoneErr" className="ow-input-error" role="alert">{phoneError}</p>
        )}
      </div>

      {userEmail && (
        <div className="ow-field">
          <label className="ow-label">Email address</label>
          <div className="ow-readonly-input" aria-label={`Account email: ${userEmail}`}>
            <span>{userEmail}</span>
            <span className="ow-readonly-tag">Account email</span>
          </div>
        </div>
      )}

      <p className="ow-contact-notice">
        You can update your phone number and email anytime from Settings.
      </p>


      <div className="ow-field">
        <button
          type="button"
          className={`ow-toggle${answers.smsNotif ? ' active' : ''}`}
          onClick={() => setAnswer('smsNotif', !answers.smsNotif)}
          aria-pressed={!!answers.smsNotif}
        >
          <span className="ow-toggle-track" />
          <span className="ow-toggle-label">Text me matching move requests</span>
        </button>
      </div>

      <div className="ow-field">
        <button
          type="button"
          className={`ow-toggle${answers.emailNotif ? ' active' : ''}`}
          onClick={() => setAnswer('emailNotif', !answers.emailNotif)}
          aria-pressed={!!answers.emailNotif}
        >
          <span className="ow-toggle-track" />
          <span className="ow-toggle-label">Email me matching move requests</span>
        </button>
      </div>
    </>
  );
}

// ── Step 4: Setup-complete interstitial ─────────────────────────────────────
//
// Two phases:
//   'loading' → progressive checklist that ticks off setup tasks (~4s total).
//               No CTA, no skip — feels like the system is doing real work.
//   'ready'   → vertical status checkpoints + "Claim your $50 FREE credit"
//               primary CTA + "Continue without activating" secondary.
//
// The /onboarding/complete API call already fired before this screen
// mounted (next() in the wizard handler runs it on the 3 → 4 transition),
// so the loading phase is purely a UX moment to legitimize the answers
// the user just gave.
function ScreenSetupComplete({ answers, onClaim, onSkip }) {
  const persona = buildPersona(answers || {});
  const market = persona.market !== 'your market' ? persona.market : 'your service area';

  const enabledChannels = [];
  if (answers.smsNotif) enabledChannels.push('SMS');
  if (answers.emailNotif) enabledChannels.push('Email');
  if (answers.receiveLiveTransfers) enabledChannels.push('Live calls');
  const alertsBody = enabledChannels.length
    ? `${enabledChannels.join(' · ')} alerts prepared`
    : 'In-dashboard alerts prepared';

  const [phase, setPhase] = useState('loading'); // 'loading' | 'ready'
  const [done, setDone] = useState(0);

  const setupItems = [
    'Setting up your dispatch account',
    `Saving your service area · ${market}`,
    'Preparing lead alerts',
    'Matching your coverage preferences',
    'Finalizing your dashboard',
  ];

  useEffect(() => {
    // ~700ms per tick, ~3.5s total + 700ms hold before the reveal.
    const ticks = [700, 1400, 2100, 2800, 3500];
    const timers = ticks.map((ms, i) => setTimeout(() => setDone(i + 1), ms));
    timers.push(setTimeout(() => setPhase('ready'), 4200));
    return () => timers.forEach(clearTimeout);
  }, []);

  if (phase === 'loading') {
    return (
      <div className="ow-setup-loading">
        <h1 className="ow-h1">Setting up your account</h1>
        <p className="ow-sub">A moment while we configure everything based on your answers.</p>
        <ul className="ow-processing-list">
          {setupItems.map((label, i) => {
            const isDone = i < done;
            const isLoading = i === done;
            return (
              <li key={i} className={`ow-processing-item${isDone ? ' done' : ''}${isLoading ? ' loading' : ''}`}>
                <span className="ow-processing-icon">
                  {isDone ? '✓' : isLoading ? <span className="ow-spinner" /> : ''}
                </span>
                <span className="ow-processing-label">{label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="ow-setup-complete">
      <div className="ow-success-icon ow-success-icon-lg" aria-hidden="true">✓</div>
      <h1 className="ow-h1">Your dispatch setup is ready</h1>
      <p className="ow-sub">Your service area, alerts, and dashboard are now prepared.</p>

      <ul className="ow-status-list">
        <li className="ow-status-item">
          <span className="ow-status-check" aria-hidden="true">✓</span>
          <div className="ow-status-text">
            <div className="ow-status-label">Service area saved</div>
            <div className="ow-status-value">{market}</div>
          </div>
        </li>
        <li className="ow-status-item">
          <span className="ow-status-check" aria-hidden="true">✓</span>
          <div className="ow-status-text">
            <div className="ow-status-label">Alerts ready</div>
            <div className="ow-status-value">{alertsBody}</div>
          </div>
        </li>
        <li className="ow-status-item">
          <span className="ow-status-check" aria-hidden="true">✓</span>
          <div className="ow-status-text">
            <div className="ow-status-label">Dashboard prepared</div>
            <div className="ow-status-value">Ready for matching move opportunities</div>
          </div>
        </li>
      </ul>

      <button type="button" className="ow-activate-cta" onClick={onClaim}>
        Claim your $50 FREE credit
      </button>

      <button type="button" className="ow-activate-skip ow-skip-secondary" onClick={onSkip}>
        <span>Continue without activating</span>
        <span className="ow-skip-secondary-sub">Dashboard access stays limited until activation.</span>
      </button>
    </div>
  );
}

// ── Step 5: Activate (balance picker only) ──────────────────────────────────
function ScreenBalance({ tier, setTier, onContinue, onSkip }) {
  const [fetching, setFetching] = useState(false);
  const [initErr, setInitErr] = useState('');

  const ctaLabel = fetching
    ? 'Preparing secure payment…'
    : tier === 100 ? 'Claim Your $150 Balance' : 'Activate $50 Starter Balance';

  async function handleContinue() {
    setFetching(true);
    setInitErr('');
    const res = await onContinue();
    if (!res?.ok) {
      setInitErr(res?.msg || 'Could not start payment.');
      setFetching(false);
    }
  }

  return (
    <div className="ow-choose">
      <header className="ow-step-header">
        <h1 className="ow-h1">Ready To Receive Moving Jobs</h1>
        <p className="ow-sub">Your account is prepared and ready to receive verified move requests.</p>
      </header>

      {/* Account-ready vertical checklist — three checkpoints to keep the
          step feeling like a calm onboarding moment, not a sales page. */}
      <ul className="ow-account-ready" aria-label="Account ready checklist">
        <li className="ow-account-ready-item">
          <span className="ow-account-ready-check" aria-hidden="true">✓</span>
          <span>Coverage area activated</span>
        </li>
        <li className="ow-account-ready-item">
          <span className="ow-account-ready-check" aria-hidden="true">✓</span>
          <span>Lead alerts prepared</span>
        </li>
        <li className="ow-account-ready-item">
          <span className="ow-account-ready-check" aria-hidden="true">✓</span>
          <span>Ready for move requests</span>
        </li>
      </ul>

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
            <span className="ow-tier-pill-recommended">Includes $50 Free Credits</span>
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
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTier(50); } }}
        >
          {tier === 50 && (<span className="ow-tier-badge" aria-hidden="true">✓ Selected</span>)}
          <div className="ow-tier-row-pill">
            <span className="ow-tier-pill-starter">Limited starter balance</span>
          </div>
          <div className="ow-tier-amount-row">
            <span className="ow-tier-pay">$50</span>
            <span className="ow-tier-arrow">→</span>
            <span className="ow-tier-receive ow-tier-receive-muted">$50 balance</span>
          </div>
        </button>
      </div>

      {/* One compact trust line — financial reassurance without re-opening
          a card. Reduced from 4 segments to 3 for less reading effort. */}
      <p className="ow-trust-strip">
        Refundable balance · No subscription · Credits never expire
      </p>

      {initErr && (
        <div className="ow-activate-err" role="alert" aria-live="polite">
          <div className="ow-activate-err-msg">{initErr}</div>
        </div>
      )}

      <button type="button" className="ow-activate-cta" onClick={handleContinue} disabled={fetching}>
        {ctaLabel}
      </button>

      {/* Marketplace realism — small line under CTA, no fake numbers. */}
      <p className="ow-marketplace-footer" aria-live="off">
        Movers are currently activating coverage in your market.
      </p>

      <button type="button" className="ow-activate-skip ow-skip-secondary" onClick={onSkip} disabled={fetching}>
        <span>Continue without activating</span>
        <span className="ow-skip-secondary-sub">Dashboard access stays limited until activation.</span>
      </button>
    </div>
  );
}

// ── Step 6: Secure payment (Stripe Payment Element) ─────────────────────────
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
  // Set true once the ExpressCheckoutElement reports at least one eligible
  // wallet (Apple Pay / Google Pay / Link). Drives the "or pay with card"
  // divider — only shown when the wallet row actually rendered something.
  const [hasExpressMethods, setHasExpressMethods] = useState(false);

  const ctaLabel = submitting
    ? 'Processing payment…'
    : tier === 100
      ? `Pay $100 and activate $${intent.totalCredits} balance →`
      : `Pay $${tier} and activate balance →`;

  // Shared confirmation handler — used by both the card form submit and the
  // ExpressCheckoutElement onConfirm. stripe.confirmPayment with elements
  // automatically uses whichever method the user chose (card or wallet).
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

  function handlePay(e) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    confirmAndComplete();
  }

  // ExpressCheckoutElement event — fires when the user taps an Apple Pay /
  // Google Pay / Link button. We delegate to the same confirm flow.
  function handleExpressConfirm() {
    if (!stripe || !elements || submitting) return;
    confirmAndComplete();
  }

  // onReady reports which express methods are eligible for this user/device.
  // Hide the divider entirely when the row would render empty.
  //
  // Console logging here is intentional and useful in production — the
  // shape `event.availablePaymentMethods` is the single source of truth
  // for "did Stripe deem Apple Pay / Google Pay eligible for this
  // browser+device+domain+PI?". If applePay/googlePay show as undefined or
  // false here while the buttons are forced visible (see options below),
  // the gap is in Stripe Dashboard / domain registration, not in our code.
  function handleExpressReady(event) {
    const methods = event?.availablePaymentMethods;
    // eslint-disable-next-line no-console
    console.log('[ExpressCheckout] onReady — availablePaymentMethods:', methods, 'full event:', event);
    setHasExpressMethods(!!methods && Object.keys(methods).length > 0);
  }

  return (
    <form className="ow-pay" onSubmit={handlePay}>
      <button type="button" className="ow-pay-back" onClick={onBack} disabled={submitting}>
        ← Change balance
      </button>

      <header className="ow-step-header">
        <h1 className="ow-h1">Secure payment</h1>
        <p className="ow-sub">
          {tier === 100
            ? `You'll be charged $100 — your $${intent.totalCredits} balance will be added immediately after payment.`
            : `You'll be charged $${tier} — your $${tier} balance will be added immediately after payment.`}
        </p>
      </header>

      <div className="ow-pay-element-wrap">
        {/* Express wallets (Apple Pay / Google Pay / Link). Renders nothing
            on browsers/devices that don't support any of them — the
            PaymentElement below stays the only payment surface in that case. */}
        <ExpressCheckoutElement
          onConfirm={handleExpressConfirm}
          onReady={handleExpressReady}
          options={{
            buttonHeight: 48,
            buttonTheme: { applePay: 'black', googlePay: 'black' },
            layout: { maxColumns: 2, maxRows: 2 },
            // Force Apple Pay / Google Pay buttons to render. Stripe's
            // default 'auto' silently hides them when domain/account/
            // device eligibility checks fail — which makes diagnosing the
            // root cause hard. With 'always':
            //   - If buttons render but tapping fails → Apple Pay domain
            //     not verified in Stripe Dashboard, OR live-mode method
            //     not enabled for the account.
            //   - If buttons render and tap works → eligibility is fine,
            //     'auto' was a false negative from older browsers.
            //   - If buttons still don't render → SDK / HTTPS / publishable
            //     key issue (check console for stripe.js errors).
            // Link stays on 'auto' since it has no domain-verification
            // dependency and Stripe's heuristic for Link is reliable.
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

// ── Step 7: Activation success (terminal) ───────────────────────────────────
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
