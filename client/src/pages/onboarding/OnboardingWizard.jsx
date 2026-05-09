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

// Visible setup steps in the progress bar:
//   1 = Dispatch base + pickup
//   2 = Delivery
//   3 = Preferences + notifications
//   4 = Activation (live transfers + balance picker → secure payment)
// Internal-only post-flow steps (no progress bar):
//   5 = Activation success
const TOTAL_STEPS = 4;

const REASSURANCE = 'You can change this later from your dashboard.';

// Distance-preference options. Values match User.maxDistance.
const DISTANCE_OPTIONS = [
  { id: '',              label: 'Both / Any',     desc: 'Send me both local and long-distance moves' },
  { id: 'Local',         label: 'Local moves',    desc: 'Same-city / under-100mi jobs only' },
  { id: 'Long Distance', label: 'Long-distance',  desc: 'Cross-state / 100mi+ jobs only' },
];

// Lead.homeSize enum (as written by the admin form + ingest pipeline).
// Keep these strings in sync with HOME_SIZES in client/src/pages/admin/AdminLeads.jsx.
const HOME_SIZE_OPTIONS = [
  'Studio',
  '1 Bedroom',
  '2 Bedroom',
  '3 Bedroom',
  '4+ Bedroom',
  'House (Small)',
  'House (Medium)',
  'House (Large)',
  'Office/Commercial',
];

const STEP_MICROCOPY = {
  1: 'Dispatch base & pickup',
  2: 'Delivery coverage',
  3: 'Preferences & alerts',
  4: 'Activate your account',
};

const SETUP_STAGES = [
  { id: 1, label: 'Dispatch' },
  { id: 2, label: 'Delivery' },
  { id: 3, label: 'Setup' },
  { id: 4, label: 'Activate' },
];

// Build personalized phrasing fragments from the answers object.
function buildPersona(answers, fallback = {}) {
  const db = answers.dispatchBase || {};
  const market = (db.city && db.state)
    ? `${db.city}, ${db.state}`
    : (answers.primaryMarket || '').trim() || fallback.market || 'your market';
  const distanceLabel = DISTANCE_OPTIONS.find(d => d.id === (answers.maxDistance || ''))?.label || '';
  const sizes = Array.isArray(answers.preferredHomeSizes) ? answers.preferredHomeSizes : [];
  return {
    market,
    base: db,
    pickupMode:   answers.pickup?.mode   || 'near',
    deliveryMode: answers.delivery?.mode || 'same',
    distanceLabel,
    sizes,
    sizesSummary: sizes.length
      ? (sizes.length <= 2 ? sizes.join(' and ') : `${sizes.slice(0, 2).join(', ')} and more`)
      : 'all home sizes',
    radiusLabel: '',
  };
}

// Convert "TX" → "Texas" for friendlier helper text.
function stateName(code) {
  const found = US_STATES.find(s => s.code === code);
  return found ? found.name : code;
}

export default function OnboardingWizard({ onClose, initialStep }) {
  const { API_URL, refreshUser, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [step, setStep] = useState(initialStep || 1);
  const [answers, setAnswers] = useState({
    dispatchBase: { input: '', zip: '', city: '', state: '' },
    pickup:   { mode: 'near', states: [] },
    delivery: { mode: 'same', states: [] },
    // Legacy back-compat (resume only; not asked in new UI)
    primaryMarket: '',
    coverageRadius: '',
    additionalMarkets: [],
    // Step 3 (also written to top-level User fields)
    maxDistance: '',
    preferredHomeSizes: [],
    phone: user?.phone || '',
    smsNotif: !!user?.smsNotif,
    receiveLiveTransfers: !!user?.receiveLiveTransfers,
  });

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
            maxDistance:         (typeof a.maxDistance === 'string' ? a.maxDistance : prev.maxDistance),
            preferredHomeSizes:  Array.isArray(a.preferredHomeSizes) ? a.preferredHomeSizes : prev.preferredHomeSizes,
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

  const toggleInArray = (key, value) => {
    setAnswers(prev => {
      const arr = prev[key] || [];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value],
      };
    });
  };

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
            maxDistance: answers.maxDistance,
            preferredHomeSizes: answers.preferredHomeSizes,
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

  // Mark wizard as complete server-side. Called when user lands on activation
  // step (step 4) — past that point they're "done with setup", whether or not
  // they activate.
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

  const completeCalledRef = useRef(false);
  async function next() {
    await saveStep(step);
    if (step < 3) {
      setStep(step + 1);
    } else if (step === 3) {
      // Transition into activation. Mark wizard complete (idempotent).
      if (!completeCalledRef.current) {
        completeCalledRef.current = true;
        await callComplete();
      }
      setStep(4);
    }
    // Step 4 (activation) and step 5 (success) handle their own progression internally.
  }

  function back() {
    if (step > 1 && step <= TOTAL_STEPS) setStep(step - 1);
  }

  // Soft-skip — used from activation step ("Continue without activating")
  async function dismissSkip() {
    try {
      await fetch(`${API_URL}/onboarding/skip`, {
        method: 'POST',
        headers: { 'x-auth-token': localStorage.getItem('token') || '' },
      });
    } catch (err) { /* swallow */ }
    if (refreshUser) await refreshUser();
    onClose && onClose();
  }

  async function onActivationDone() {
    if (refreshUser) await refreshUser();
    setStep(5);
  }

  async function closeAfterSuccess() {
    if (refreshUser) await refreshUser();
    if (onClose) onClose();
    navigate('/dashboard/leads');
  }

  const stepMicro = STEP_MICROCOPY[step] || '';
  // Global footer is hidden during activation (step 4 has its own CTAs) and
  // during the post-payment success screen (step 5).
  const showFooter = step <= 3;

  return (
    <div className="onboarding-wizard" role="dialog" aria-label="Partner activation setup">
      <div className="ow-blur" />
      <div className="ow-modal">
        {step <= TOTAL_STEPS && (
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
            {step === 3 && <ScreenPreferencesAndAlerts answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
            {step === 4 && <ScreenActivation API_URL={API_URL} onDone={onActivationDone} onSkip={dismissSkip} answers={answers} setAnswer={setAnswer} />}
            {step === 5 && <ScreenActivationSuccess onDone={closeAfterSuccess} answers={answers} />}
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
  // Step 1: dispatch base required; pickup mode 'states' requires ≥1 state.
  if (step === 1) {
    if (!a.dispatchBase || !a.dispatchBase.zip) return false;
    if (a.pickup?.mode === 'states' && !(a.pickup.states && a.pickup.states.length)) return false;
    return true;
  }
  // Step 2: delivery mode 'states' requires ≥1 state. Otherwise valid.
  if (step === 2) {
    if (a.delivery?.mode === 'states' && !(a.delivery.states && a.delivery.states.length)) return false;
    return true;
  }
  // Step 3: phone is required (10 digits).
  if (step === 3) {
    const digits = String(a.phone || '').replace(/\D/g, '');
    return digits.length === 10;
  }
  return true;
}

// ── Step 1: Dispatch base + pickup coverage ─────────────────────────────────
function ScreenDispatchPickup({ answers, setAnswer, companyName }) {
  const dispatchBase = answers.dispatchBase || {};
  const pickup       = answers.pickup   || { mode: 'near', states: [] };
  const baseReady    = !!dispatchBase.zip;

  function setPickupMode(mode) { setAnswer('pickup', { ...pickup, mode }); }
  function setPickupStates(s)  { setAnswer('pickup', { ...pickup, states: s }); }

  const PICKUP_OPTIONS = [
    { id: 'near',   label: 'Local around my base',   desc: 'Best for nearby pickup jobs around your dispatch base. Roughly 50 miles.' },
    { id: 'state',  label: 'Anywhere in my state',   desc: dispatchBase.state ? `Receive pickup opportunities across ${stateName(dispatchBase.state)}.` : 'Receive pickup opportunities across your main state.' },
    { id: 'states', label: 'Multiple states',        desc: 'Choose the states where your crews can pick up moves.' },
  ];

  const greeting = companyName
    ? `${companyName} — let's set up your dispatch.`
    : `Let's set up your dispatch.`;

  return (
    <>
      <p className="ow-greeting">{greeting}</p>
      <h1 className="ow-h1">Set up your dispatch base</h1>
      <p className="ow-sub">Tell us where your crews start jobs. We'll use this to route nearby pickup requests to your team.</p>

      {/* FOMO note — operational, no fake counts */}
      <aside className="ow-setup-fomo" role="note">
        <span className="ow-setup-fomo-dot" aria-hidden="true" />
        <span>We limit active mover partners per market so request quality stays protected. Your spot is held until you finish setup.</span>
      </aside>

      {/* ── Question 1: Dispatch base ───────────────────────────────────── */}
      <div className="ow-field">
        <label className="ow-label" htmlFor="dispatchBaseInput">Where are your crews based?</label>
        <PlaceAutocomplete
          id="dispatchBaseInput"
          value={baseReady ? dispatchBase : null}
          onSelect={(p) => setAnswer('dispatchBase', { input: p.label, zip: p.zip, city: p.city, state: p.state })}
          onClear={() => setAnswer('dispatchBase', { input: '', zip: '', city: '', state: '' })}
          placeholder="Houston, TX or 77001"
          ariaLabel="Search dispatch base"
        />
        <p className="ow-helper">Choose your main dispatch base. You can fine-tune later in Settings.</p>
        {baseReady && (
          <p className="ow-feedback">{dispatchBase.city}, {dispatchBase.state} confirmed as your dispatch base.</p>
        )}
      </div>

      {/* ── Question 2: Pickup ──────────────────────────────────────────── */}
      <div className="ow-field" aria-disabled={!baseReady}>
        <label className="ow-label">Where do your crews usually start jobs?</label>
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
                style={!baseReady ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <div className="ow-card-row">
                  <div>
                    <div style={{ fontWeight: 700 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 500 }}>{opt.desc}</div>
                  </div>
                  {active && <span className="ow-card-check">✓</span>}
                </div>
              </button>
            );
          })}
        </div>
        {pickup.mode === 'states' && baseReady && (
          <div style={{ marginTop: 10 }}>
            <p className="ow-helper" style={{ marginTop: 0, marginBottom: 6 }}>Choose the states where your crews can start moves.</p>
            <StateMultiSelect
              value={pickup.states || []}
              onChange={setPickupStates}
              placeholder="Type a pickup state…"
              ariaLabel="Select pickup states"
            />
          </div>
        )}
        {pickup.mode === 'near' && baseReady && (
          <p className="ow-feedback">Local pickup coverage enabled around {dispatchBase.city}.</p>
        )}
        {pickup.mode === 'state' && baseReady && (
          <p className="ow-feedback">Statewide pickup coverage enabled in {stateName(dispatchBase.state)}.</p>
        )}
        {pickup.mode === 'states' && (pickup.states || []).length > 0 && (
          <p className="ow-feedback">Pickup coverage enabled in {pickup.states.length === 1 ? '1 state' : `${pickup.states.length} states`}.</p>
        )}
      </div>

      <p className="ow-reassurance">{REASSURANCE}</p>
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

  // Live coverage preview against /preview-coverage-v2 — runs once we have
  // a complete dispatch+pickup+delivery shape so the user sees the operational
  // result of the choices they made on Step 1 + Step 2.
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
        setPreview({ ok: false, msg: 'Preview unavailable — your selection will still save.' });
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
    { id: 'same',       label: 'Same as pickup',  desc: 'Best for local moves where pickup and delivery stay in your service area.' },
    { id: 'states',     label: 'Multiple states', desc: 'Choose the states where your crews can deliver moves.' },
    { id: 'nationwide', label: 'Nationwide',      desc: 'Receive long-distance delivery opportunities across the U.S.' },
  ];

  const baseLabel = (dispatchBase.city && dispatchBase.state)
    ? `${dispatchBase.city}, ${dispatchBase.state}`
    : 'your dispatch base';

  return (
    <>
      <h1 className="ow-h1">Set up delivery coverage</h1>
      <p className="ow-sub">Tell us where your crews can move customers to. This narrows the long-distance leads we send you.</p>

      <div className="ow-progression-row" aria-label="Setup so far">
        <span className="ow-progression-chip">✓ Dispatch base · {baseLabel}</span>
        <span className="ow-progression-chip">✓ Pickup coverage · {pickupLabelShort(answers)}</span>
      </div>

      {/* ── Question: Delivery ──────────────────────────────────────────── */}
      <div className="ow-field">
        <label className="ow-label">Where do you usually move customers to?</label>
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
                    <div style={{ fontWeight: 700 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 500 }}>{opt.desc}</div>
                  </div>
                  {active && <span className="ow-card-check">✓</span>}
                </div>
              </button>
            );
          })}
        </div>
        {delivery.mode === 'states' && (
          <div style={{ marginTop: 10 }}>
            <p className="ow-helper" style={{ marginTop: 0, marginBottom: 6 }}>Choose the states where your crews can deliver customers.</p>
            <StateMultiSelect
              value={delivery.states || []}
              onChange={setDeliveryStates}
              placeholder="Type a delivery state…"
              ariaLabel="Select delivery states"
            />
          </div>
        )}
        {delivery.mode === 'same' && (
          <p className="ow-feedback">Local delivery coverage enabled around your service area.</p>
        )}
        {delivery.mode === 'nationwide' && (
          <p className="ow-feedback">Nationwide long-distance delivery interest enabled.</p>
        )}
        {delivery.mode === 'states' && (delivery.states || []).length > 0 && (
          <p className="ow-feedback">Delivery coverage enabled in {delivery.states.length === 1 ? '1 state' : `${delivery.states.length} states`}.</p>
        )}
      </div>

      {/* Live preview pill — operational copy, ZIP count is secondary. */}
      {(previewing || preview) && (
        <div className={`ow-coverage-preview${preview && preview.ok === false ? ' err' : ''}`} role="status" aria-live="polite">
          {previewing && (
            <>
              <span className="ow-spinner" />
              <span>Checking coverage…</span>
            </>
          )}
          {!previewing && preview?.ok && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <span className="ow-coverage-preview-dot" aria-hidden="true" />
                <span>{previewMessage(preview)}</span>
              </div>
              <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 500, paddingLeft: 18 }}>
                Internal coverage: {preview.counts.total.toLocaleString()} ZIP areas
                {(preview.counts.rawOrigin > 3000 || (preview.counts.rawDestination !== null && preview.counts.rawDestination > 3000)) && ' · capped at 3,000'}
                {' · Fine-tune later in Settings.'}
              </span>
            </div>
          )}
          {!previewing && preview && preview.ok === false && (
            <span>{preview.msg || 'Could not resolve service area.'}</span>
          )}
        </div>
      )}

      <p className="ow-reassurance">{REASSURANCE}</p>
    </>
  );
}

// Operational preview-pill copy. ZIP count is intentionally secondary.
function previewMessage(p) {
  const baseCity = p.base?.city || 'Your dispatch base';
  const baseState = p.base?.state || '';
  const baseLabel = baseState ? `${baseCity}, ${baseState}` : baseCity;
  const pmode = p.pickup?.mode;
  const dmode = p.delivery?.mode;

  if (p.nationwide) {
    return <span><strong>{baseLabel}</strong> pickup · <strong>Nationwide</strong> delivery interest saved</span>;
  }
  if (pmode === 'near' && dmode === 'same') {
    return <span><strong>{baseLabel}</strong> local dispatch coverage ready</span>;
  }
  if (pmode === 'state' && dmode === 'same') {
    return <span><strong>{stateName(baseState)}</strong> pickup + delivery coverage ready</span>;
  }
  if (pmode === 'states' && dmode === 'same') {
    const list = (p.pickup.states || []).map(stateName).join(' · ');
    return <span><strong>{list || 'Multi-state'}</strong> pickup + delivery coverage ready</span>;
  }
  if (dmode === 'states') {
    const pLabel = pmode === 'near'
      ? baseLabel
      : pmode === 'state'
        ? stateName(baseState)
        : (p.pickup.states || []).map(stateName).join(' · ');
    const dLabel = (p.delivery.states || []).map(stateName).join(' · ');
    return <span><strong>{pLabel}</strong> pickup · <strong>{dLabel}</strong> delivery ready</span>;
  }
  return <span>Coverage ready</span>;
}

// Compact pickup label for the progression chip on Step 2.
function pickupLabelShort(answers) {
  const m = answers.pickup?.mode || 'near';
  const db = answers.dispatchBase || {};
  if (m === 'near')   return 'Local';
  if (m === 'state')  return db.state ? stateName(db.state) : 'Statewide';
  if (m === 'states') {
    const s = answers.pickup?.states || [];
    if (!s.length) return 'Multiple states';
    return s.length === 1 ? stateName(s[0]) : `${s.length} states`;
  }
  return '—';
}

// ── Step 3: Move preferences + notifications (no live transfers here) ───────
//
// Top-level User fields written server-side: maxDistance, preferredHomeSizes,
// phone, smsNotif. Live Transfers moves to Step 4 (activation) so the user
// makes that decision in the same context as funding the balance.
function ScreenPreferencesAndAlerts({ answers, setAnswer, toggleInArray }) {
  return (
    <>
      <h1 className="ow-h1">Match preferences & alerts</h1>
      <p className="ow-sub">
        Tell us which moves fit your crews and how to reach you. We'll narrow alerts to matching opportunities.
      </p>

      <section className="ow-section">
        <div className="ow-section-h">Match preferences</div>

        <div className="ow-field">
          <label className="ow-label">Distance preference</label>
          <div className="ow-cards">
            {DISTANCE_OPTIONS.map(opt => {
              const active = (answers.maxDistance || '') === opt.id;
              return (
                <button
                  key={opt.id || 'any'}
                  type="button"
                  className={`ow-card${active ? ' active' : ''}`}
                  onClick={() => setAnswer('maxDistance', opt.id)}
                  aria-pressed={active}
                >
                  <div className="ow-card-row">
                    <div>
                      <div style={{ fontWeight: 700 }}>{opt.label}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 500 }}>{opt.desc}</div>
                    </div>
                    {active && <span className="ow-card-check">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="ow-field">
          <label className="ow-label">
            Preferred move sizes
            <span className="ow-label-hint">(optional — leave empty to receive all sizes)</span>
          </label>
          <div className="ow-chips">
            {HOME_SIZE_OPTIONS.map(size => {
              const active = (answers.preferredHomeSizes || []).includes(size);
              return (
                <button
                  key={size}
                  type="button"
                  className={`ow-chip${active ? ' active' : ''}`}
                  onClick={() => toggleInArray('preferredHomeSizes', size)}
                >
                  {active && <span className="ow-chip-check">✓</span>}
                  {size}
                </button>
              );
            })}
          </div>
          {(answers.preferredHomeSizes || []).length > 0 && (
            <p className="ow-feedback">
              {answers.preferredHomeSizes.length === 1
                ? `${answers.preferredHomeSizes[0]} requests prioritized.`
                : `${answers.preferredHomeSizes.length} sizes prioritized for matching.`}
            </p>
          )}
        </div>
      </section>

      <section className="ow-section">
        <div className="ow-section-h">Alerts</div>

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
          <p className="ow-helper">We text + dial this number for SMS alerts and (optionally) live transfers.</p>
        </div>

        <div className="ow-field">
          <button
            type="button"
            className={`ow-toggle${answers.smsNotif ? ' active' : ''}`}
            onClick={() => setAnswer('smsNotif', !answers.smsNotif)}
            aria-pressed={!!answers.smsNotif}
          >
            <span className="ow-toggle-track" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              Text me when a request matches my setup
            </span>
          </button>
          <p className="ow-helper">SMS fires only on leads matching your service area, distance, and size preferences.</p>
        </div>
      </section>

      <p className="ow-reassurance">{REASSURANCE}</p>
    </>
  );
}

// ── Step 4: Activation — Live Transfers + Balance + Payment ──────────────────
//   Substeps:
//     'choose' → Live Transfers card + ChooseBalance picker (no Stripe call yet)
//     'pay'    → PaymentElement form
function ScreenActivation({ API_URL, onSkip, onDone, answers, setAnswer }) {
  const [tier, setTier] = useState(100);
  const [substep, setSubstep] = useState('choose');
  const [intent, setIntent] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [initErr, setInitErr] = useState('');

  async function handleContinue() {
    setFetching(true);
    setInitErr('');
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
        console.error('[Activation] create-payment-intent failed', res.status, data);
        setInitErr(data?.msg || `Could not start payment (status ${res.status}).`);
        setFetching(false);
        return;
      }
      setIntent(data);
      setSubstep('pay');
      setFetching(false);
    } catch (err) {
      console.error('[Activation] create-payment-intent threw', err);
      setInitErr(err?.message || 'Network error starting payment.');
      setFetching(false);
    }
  }

  function handleBackToChoose() {
    setIntent(null);
    setSubstep('choose');
  }

  if (substep === 'choose') {
    return (
      <ChooseBalance
        tier={tier}
        setTier={setTier}
        onContinue={handleContinue}
        onSkip={onSkip}
        fetching={fetching}
        initErr={initErr}
        answers={answers}
        setAnswer={setAnswer}
        API_URL={API_URL}
      />
    );
  }

  if (!intent) return null;
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
        onBack={handleBackToChoose}
        onDone={onDone}
      />
    </Elements>
  );
}

// ── Step 4 substep 'choose' — Live Transfers + balance picker ───────────────
function ChooseBalance({ tier, setTier, onContinue, onSkip, fetching, initErr, answers, setAnswer, API_URL }) {
  const ctaLabel = fetching
    ? 'Preparing secure payment…'
    : tier === 100 ? 'Continue with $150 balance →' : 'Continue with $50 balance →';

  // When the user toggles live transfers here, persist immediately so closing
  // the wizard mid-activation doesn't lose the choice.
  async function setLiveTransfers(value) {
    setAnswer('receiveLiveTransfers', value);
    try {
      await fetch(`${API_URL}/onboarding/save-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({
          step: 4,
          answers: {
            receiveLiveTransfers: value,
          },
        }),
      });
    } catch { /* swallow — user can toggle again */ }
  }

  return (
    <div className="ow-choose">
      <h1 className="ow-h1">Activate your account</h1>
      <p className="ow-sub">
        Add your starting balance and pick whether you want premium live phone transfers. You'll only be charged for what you accept.
      </p>

      {/* FOMO notice — operational tone */}
      <aside className="ow-fomo" role="note">
        <span className="ow-fomo-dot" aria-hidden="true" />
        <span>
          Partner spots are limited per state so request quality stays protected. Your <strong>$50 onboarding credit</strong> is available while onboarding remains open in your state.
        </span>
      </aside>

      {/* Live phone transfers — opt-in here so the choice is paired with funding */}
      <section className="ow-live-transfer-field" aria-label="Live phone transfers">
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
            onClick={() => setLiveTransfers(!answers.receiveLiveTransfers)}
            aria-pressed={!!answers.receiveLiveTransfers}
            aria-label="Enable Live Phone Transfers"
          >
            <span className="ow-toggle-track" />
          </button>
        </div>
        <div className="ow-live-transfer-warn">
          ⚠️ You're only charged $40 when you accept the call. Keep your balance above $50 to receive live transfers.
        </div>
      </section>

      <div className="ow-choose-heading">Choose your starting balance</div>

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
          {tier === 100 && (
            <span className="ow-tier-badge" aria-hidden="true">✓ Selected</span>
          )}
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
          {tier === 50 && (
            <span className="ow-tier-badge" aria-hidden="true">✓ Selected</span>
          )}
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
        <span>Continue without activating</span>
        <span className="ow-skip-secondary-sub">Dashboard access stays limited until activation.</span>
      </button>
    </div>
  );
}

// ── Step 4 substep 'pay' — Complete secure payment ───────────────────────────
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

      <h1 className="ow-h1">Complete secure payment</h1>
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

// ── Step 5: Activation success ──────────────────────────────────────────────
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
        ? `Market routing enabled for ${persona.market}`
        : 'Market routing enabled');

  const alertLine = 'Notifications ready for matching requests';

  return (
    <div className="ow-success">
      <div className="ow-success-icon">✓</div>
      <h1 className="ow-h1">{headline}</h1>
      <ul className="ow-success-list">
        {isBonusPath
          ? <li>Onboarding bonus applied: <strong>+$50</strong></li>
          : <li>Starter balance activated</li>}
        <li>{marketLine}</li>
        <li>{alertLine}</li>
      </ul>
      <button type="button" className="ow-next" style={{ marginTop: 18 }} onClick={onDone}>
        View matching opportunities →
      </button>
    </div>
  );
}
