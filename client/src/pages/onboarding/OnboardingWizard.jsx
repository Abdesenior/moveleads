import { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { AuthContext } from '../../context/AuthContext';
import { US_STATES } from '../../data/usStates';
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

const TOTAL_STEPS = 4; // Setup steps shown in the progress bar.
// Internal step states: 1..4 = setup, 5 = processing, 6 = activation, 7 = success.

const REASSURANCE = 'You can change this later from your dashboard.';

// Service-radius options for Step 1. Each value matches the server's
// coverageExpansion.VALID_RADII set.
const RADIUS_OPTIONS = [
  { id: '25',         label: '25 miles',     desc: 'Local jobs around your base' },
  { id: '50',         label: '50 miles',     desc: 'Metro coverage' },
  { id: '100',        label: '100 miles',    desc: 'Wider regional coverage' },
  { id: 'statewide',  label: 'Statewide',    desc: 'Anywhere in your state' },
  { id: 'interstate', label: 'Interstate',   desc: 'Long-distance / cross-state moves' },
];

// Distance-preference options for Step 2. Values match User.maxDistance.
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

// Step-keyed progress microcopy.
const STEP_MICROCOPY = {
  1: 'Set your service area',
  2: 'Pick your move preferences',
  3: 'Notification setup',
  4: 'Review setup',
};

// Setup-status tracker stages — one per setup step (1..4).
const SETUP_STAGES = [
  { id: 1, label: 'Coverage' },
  { id: 2, label: 'Preferences' },
  { id: 3, label: 'Alerts' },
  { id: 4, label: 'Ready' },
];

// Build personalized phrasing fragments from the answers object.
function buildPersona(answers, fallback = {}) {
  const market = (answers.primaryMarket || '').trim();
  const radius = answers.coverageRadius || '';
  const radiusOption = RADIUS_OPTIONS.find(r => r.id === radius);
  const radiusLabel = radiusOption?.label || '';
  const distanceLabel = DISTANCE_OPTIONS.find(d => d.id === (answers.maxDistance || ''))?.label || '';
  const sizes = Array.isArray(answers.preferredHomeSizes) ? answers.preferredHomeSizes : [];
  return {
    market: market || fallback.market || 'your market',
    radius,
    radiusLabel,
    distanceLabel,
    sizes,
    sizesSummary: sizes.length
      ? (sizes.length <= 2 ? sizes.join(' and ') : `${sizes.slice(0, 2).join(', ')} and more`)
      : 'all home sizes',
  };
}

export default function OnboardingWizard({ onClose, initialStep }) {
  const { API_URL, refreshUser, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [step, setStep] = useState(initialStep || 1);
  const [answers, setAnswers] = useState({
    // Step 1
    primaryMarket: '',
    coverageRadius: '',
    additionalMarkets: [],
    // Step 2 (move preferences — also written to top-level User fields)
    maxDistance: '',          // '' | 'Local' | 'Long Distance'
    preferredHomeSizes: [],
    // Step 3 (notifications + live transfers)
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
        // If caller pinned the step (e.g. banner reopens at activation), don't override.
        if (!initialStep && ob.currentStep && ob.currentStep > 0 && ob.currentStep <= TOTAL_STEPS) {
          setStep(ob.currentStep);
        }
        if (ob.answers) {
          const a = ob.answers;
          setAnswers(prev => ({
            ...prev,
            primaryMarket:       a.primaryMarket       ?? prev.primaryMarket,
            coverageRadius:      a.coverageRadius      ?? prev.coverageRadius,
            additionalMarkets:   a.additionalMarkets   ?? prev.additionalMarkets,
            // Step 2 preferences may be in onboarding.answers (mid-wizard) OR
            // already on the top-level User (resumed after save). Prefer
            // onboarding.answers since it's the active draft.
            maxDistance:         (typeof a.maxDistance === 'string' ? a.maxDistance : prev.maxDistance),
            preferredHomeSizes:  Array.isArray(a.preferredHomeSizes) ? a.preferredHomeSizes : prev.preferredHomeSizes,
            // Step 3
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
            // Step 1
            primaryMarket: answers.primaryMarket,
            coverageRadius: answers.coverageRadius,
            additionalMarkets: answers.additionalMarkets,
            // Step 2 (server also writes these to top-level User)
            maxDistance: answers.maxDistance,
            preferredHomeSizes: answers.preferredHomeSizes,
            // Step 3 (server also writes these to top-level User)
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

  async function next() {
    await saveStep(step);
    if (step < TOTAL_STEPS) setStep(step + 1);
    else if (step === TOTAL_STEPS) setStep(5); // → processing
  }

  function back() {
    if (step > 1 && step <= TOTAL_STEPS) setStep(step - 1);
  }

  // No more "use recommended setup" link — the new wizard only asks
  // questions that are real, so there's nothing to default-skip.
  const canSkipStep = false;
  async function skipWithDefaults() { /* no-op — kept for type safety on the footer button */ }

  // Soft-skip — only used from activation step ("Continue without activating")
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

  function onProcessingDone() { setStep(6); }

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
            {step === 1 && <ScreenMarketCoverage answers={answers} setAnswer={setAnswer} companyName={user?.companyName} API_URL={API_URL} />}
            {step === 2 && <ScreenMovePreferences answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
            {step === 3 && <ScreenNotifications answers={answers} setAnswer={setAnswer} />}
            {step === 4 && <ScreenConfirmSetup answers={answers} />}
            {step === 5 && <ScreenProcessing onDone={onProcessingDone} answers={answers} />}
            {step === 6 && <ScreenActivation API_URL={API_URL} onDone={onActivationDone} onSkip={dismissSkip} answers={answers} />}
            {step === 7 && <ScreenActivationSuccess onDone={closeAfterSuccess} answers={answers} />}
          </div>
        </div>

        {step <= TOTAL_STEPS && (
          <div className="ow-footer">
            <div className="ow-footer-left">
              {step > 1 && (
                <button className="ow-back" onClick={back} type="button">← Back</button>
              )}
              {canSkipStep && (
                <button
                  type="button"
                  className="ow-skip-link"
                  onClick={skipWithDefaults}
                  title="Apply recommended defaults and continue — you can fine-tune this later from your dashboard."
                >
                  Use recommended setup →
                </button>
              )}
            </div>
            <button
              className="ow-next"
              onClick={next}
              type="button"
              disabled={!isStepValid(step, answers)}
            >
              {step < TOTAL_STEPS ? 'Continue →' : 'Confirm my setup →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function isStepValid(step, a) {
  // Step 1: a primary service area + radius are required (writes CoverageArea)
  if (step === 1) return !!(a.primaryMarket && a.primaryMarket.trim()) && !!a.coverageRadius;
  // Step 2: distance preference is always present ('' = Both/Any, valid).
  // Preferred sizes are optional. Step is always valid.
  if (step === 2) return true;
  // Step 3: phone is required — it's the dial target for live transfers + SMS.
  if (step === 3) {
    const digits = String(a.phone || '').replace(/\D/g, '');
    return digits.length === 10;
  }
  // Step 4: confirm screen has nothing to validate.
  if (step === 4) return true;
  return true;
}

// ── Screen 1: Service area + dispatch radius ────────────────────────────────
function ScreenMarketCoverage({ answers, setAnswer, companyName, API_URL }) {
  const [marketDraft, setMarketDraft] = useState('');
  const [preview, setPreview] = useState(null);   // { ok, primary, additional, zipCount, msg, capped }
  const [previewing, setPreviewing] = useState(false);

  function commitMarket() {
    const v = marketDraft.trim().replace(/,$/, '');
    if (!v) return;
    if (!answers.additionalMarkets.includes(v)) {
      setAnswer('additionalMarkets', [...answers.additionalMarkets, v]);
    }
    setMarketDraft('');
  }
  function handleKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitMarket();
    } else if (e.key === 'Backspace' && marketDraft === '' && answers.additionalMarkets.length > 0) {
      setAnswer('additionalMarkets', answers.additionalMarkets.slice(0, -1));
    }
  }

  // Debounced live preview — calls /api/onboarding/preview-coverage to surface
  // the resolved metro and the number of ZIPs the wizard will actually write
  // to CoverageArea. No DB writes here; the real generation happens on save.
  useEffect(() => {
    const market = (answers.primaryMarket || '').trim();
    const radius = answers.coverageRadius;
    if (!market || !radius) {
      setPreview(null);
      return;
    }
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/onboarding/preview-coverage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-token': localStorage.getItem('token') || '',
          },
          body: JSON.stringify({
            primaryMarket: market,
            coverageRadius: radius,
            additionalMarkets: answers.additionalMarkets,
          }),
        });
        const data = await res.json();
        setPreview(data);
      } catch {
        setPreview({ ok: false, msg: 'Could not check coverage just now — your selection will still save.' });
      } finally {
        setPreviewing(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [API_URL, answers.primaryMarket, answers.coverageRadius, answers.additionalMarkets]);

  const greeting = companyName
    ? `${companyName} — let's get your dispatch live and start matching you with verified move opportunities.`
    : `Let's get your dispatch live and start matching you with verified move opportunities.`;

  return (
    <>
      <p className="ow-greeting">{greeting}</p>
      <h1 className="ow-h1">Where should we send move opportunities?</h1>
      <p className="ow-sub">Set your service area so we only route requests your crews can actually handle.</p>

      <div className="ow-field">
        <label className="ow-label" htmlFor="primaryMarket">Primary service area</label>
        <input
          id="primaryMarket"
          className="ow-input"
          placeholder="Houston, TX or 77001"
          value={answers.primaryMarket}
          onChange={e => setAnswer('primaryMarket', e.target.value)}
          autoComplete="off"
        />
        <p className="ow-helper">Enter your dispatch base — city/state or a 5-digit ZIP.</p>
      </div>

      <div className="ow-field">
        <label className="ow-label">Service radius</label>
        <div className="ow-cards ow-radius-cards">
          {RADIUS_OPTIONS.map(opt => {
            const active = answers.coverageRadius === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`ow-card${active ? ' active' : ''}`}
                onClick={() => setAnswer('coverageRadius', opt.id)}
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

      {/* Live coverage preview pill — sets expectation BEFORE save. */}
      {(previewing || preview) && (
        <div className={`ow-coverage-preview${preview && preview.ok === false ? ' err' : ''}`} role="status" aria-live="polite">
          {previewing && (
            <>
              <span className="ow-spinner" />
              <span>Checking coverage…</span>
            </>
          )}
          {!previewing && preview?.ok && (
            <>
              <span className="ow-coverage-preview-dot" aria-hidden="true" />
              <span>
                <strong>{preview.primary?.displayName || 'Primary area'}</strong>
                {' • '}
                Approx. <strong>{preview.zipCount.toLocaleString()} ZIPs</strong> covered
                {preview.capped && <em style={{ color: '#94a3b8', marginLeft: 6 }}>(capped at 3,000)</em>}
              </span>
            </>
          )}
          {!previewing && preview && preview.ok === false && (
            <span>{preview.msg || 'Could not resolve service area.'}</span>
          )}
        </div>
      )}
      {!previewing && preview?.ok && preview.failedExtras && preview.failedExtras.length > 0 && (
        <p className="ow-helper" style={{ color: '#b91c1c' }}>
          Couldn't resolve: {preview.failedExtras.map(f => `"${f.input}"`).join(', ')}. They'll be skipped.
        </p>
      )}

      <div className="ow-field">
        <label className="ow-label">Additional service areas <span className="ow-label-hint">(optional)</span></label>
        <div className="ow-chip-input">
          {answers.additionalMarkets.map(m => (
            <span key={m} className="ow-input-chip">
              {m}
              <button
                type="button"
                aria-label={`Remove ${m}`}
                className="ow-input-chip-x"
                onClick={() => setAnswer('additionalMarkets', answers.additionalMarkets.filter(x => x !== m))}
              >×</button>
            </span>
          ))}
          <input
            className="ow-chip-input-text"
            placeholder={answers.additionalMarkets.length ? 'Add another city or ZIP…' : 'Dallas, TX · 78701 · Austin, TX'}
            value={marketDraft}
            onChange={e => setMarketDraft(e.target.value)}
            onKeyDown={handleKey}
            onBlur={commitMarket}
          />
        </div>
        <p className="ow-helper">Add neighboring metros or specific ZIPs your crews also cover. Press Enter or comma to add.</p>
      </div>

      <p className="ow-reassurance">{REASSURANCE}</p>
    </>
  );
}

// ── Screen 2: Service types (multi-select only) ──────────────────────────────
// ── Screen 2: Move preferences (distance + home sizes) ──────────────────────
//
// Both fields write to TOP-LEVEL User fields server-side (User.maxDistance,
// User.preferredHomeSizes), which the matching helper reads. So setting these
// here actually narrows the leads a mover sees in the "Matched for you" tab
// AND the SMS broadcasts they receive.
function ScreenMovePreferences({ answers, setAnswer, toggleInArray }) {
  return (
    <>
      <h1 className="ow-h1">Which move requests fit your crews best?</h1>
      <p className="ow-sub">
        Choose the move types you want us to prioritize when sending alerts. We'll still show all marketplace leads on your dashboard.
      </p>

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

      <p className="ow-reassurance">{REASSURANCE}</p>
    </>
  );
}

// ── Screen 3: Notifications + Live Phone Transfers ──────────────────────────
//
// Writes phone, smsNotif, receiveLiveTransfers to TOP-LEVEL User fields.
// These directly drive broadcastLeadSMS and the voice/warm-transfer
// eligibility filter in routes/voice.js.
function ScreenNotifications({ answers, setAnswer }) {
  return (
    <>
      <h1 className="ow-h1">How should we notify you?</h1>
      <p className="ow-sub">Choose how you want to hear about matching move opportunities.</p>

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
        <p className="ow-helper">We text + dial this number for SMS alerts and live transfers.</p>
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
          ⚠️ You're only charged $40 when you accept the call. Keep your balance above $50 to receive live transfers.
        </div>
      </div>

      <p className="ow-reassurance">{REASSURANCE}</p>
    </>
  );
}

function CoverageRecapSummary({ answers }) {
  const persona = buildPersona(answers);
  if (!answers.primaryMarket && !persona.radiusLabel) return null;
  return (
    <p className="ow-summary-tagline">
      Your <strong>{persona.market}</strong>
      {persona.radiusLabel ? <> service area (<strong>{persona.radiusLabel.toLowerCase()}</strong>)</> : null}
      {' '}routing is ready.
    </p>
  );
}

// ── Screen 5: Confirm setup (no offer here) ──────────────────────────────────
function ScreenConfirmSetup({ answers }) {
  const radiusLabel   = RADIUS_OPTIONS.find(r => r.id === answers.coverageRadius)?.label || '—';
  const distanceLabel = DISTANCE_OPTIONS.find(d => d.id === (answers.maxDistance || ''))?.label || 'Both / Any';
  const sizes         = (answers.preferredHomeSizes || []);
  const sizesValue    = sizes.length ? sizes.join(', ') : 'All sizes';

  return (
    <>
      <h1 className="ow-h1">Your dispatch setup is ready</h1>
      <p className="ow-sub">Review how we'll match and notify your company.</p>

      <CoverageRecapSummary answers={answers} />

      <div className="ow-summary-recap" style={{ marginBottom: 16 }}>
        <div className="ow-summary-recap-h">Service area</div>
        <RecapRow label="Primary service area"      value={answers.primaryMarket || '—'} />
        <RecapRow label="Service radius"            value={radiusLabel} />
        <RecapRow label="Additional service areas"  value={(answers.additionalMarkets || []).join(', ') || '—'} />
      </div>

      <div className="ow-summary-recap" style={{ marginBottom: 16 }}>
        <div className="ow-summary-recap-h">Move preferences</div>
        <RecapRow label="Distance preference"  value={distanceLabel} />
        <RecapRow label="Preferred move sizes" value={sizesValue} />
      </div>

      <div className="ow-summary-recap" style={{ marginBottom: 16 }}>
        <div className="ow-summary-recap-h">Notifications</div>
        <RecapRow label="Phone number"          value={answers.phone || '—'} />
        <RecapRow label="SMS alerts"            value={answers.smsNotif ? 'On' : 'Off'} />
        <RecapRow label="Live Phone Transfers"  value={answers.receiveLiveTransfers ? 'On — $40 per accepted call' : 'Off'} />
      </div>

      <p className="ow-reassurance">{REASSURANCE}</p>
    </>
  );
}

function RecapRow({ label, value }) {
  return (
    <div className="ow-summary-recap-row">
      <span className="ow-summary-recap-label">{label}</span>
      <span className="ow-summary-recap-value">{value}</span>
    </div>
  );
}

function formatTime12h(t) {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return t || '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Screen 6: Processing (5 items, ~5.4s, then transition CTA) ───────────────
function ScreenProcessing({ onDone, answers }) {
  const { API_URL } = useContext(AuthContext);
  const persona = buildPersona(answers || {});
  const items = [
    `Configuring ${persona.market} service area`,
    persona.radiusLabel
      ? `Building ${persona.radiusLabel.toLowerCase()} dispatch coverage`
      : 'Building dispatch coverage',
    'Enabling matching alert routing',
    'Calibrating request flow',
    'Account preferences set',
  ];
  const [done, setDone] = useState(0);
  const [phase, setPhase] = useState('working'); // 'working' | 'transition' | 'completeError'
  const completedRef = useRef(false);

  // Try to mark onboarding complete server-side. Retry once on failure;
  // surface a manual retry CTA if both attempts fail so we don't transition
  // the user with stale server state (which would break the activation
  // banner + recovery deep-links).
  async function callComplete() {
    const url = `${API_URL}/onboarding/complete`;
    const opts = {
      method: 'POST',
      headers: { 'x-auth-token': localStorage.getItem('token') || '' },
    };
    try {
      const r = await fetch(url, opts);
      if (r.ok) return true;
    } catch { /* fall through to retry */ }
    try {
      const r2 = await fetch(url, opts);
      return r2.ok;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    let cancelled = false;
    // Spread to ~5.4 seconds (within 4-7 sec target)
    const t1 = setTimeout(() => setDone(1), 900);
    const t2 = setTimeout(() => setDone(2), 1900);
    const t3 = setTimeout(() => setDone(3), 2900);
    const t4 = setTimeout(() => setDone(4), 3900);
    const t5 = setTimeout(async () => {
      if (cancelled) return;
      setDone(5);
      const ok = await callComplete();
      if (cancelled) return;
      // Hold ~800ms so the final check has visual time, then route.
      setTimeout(() => {
        if (cancelled) return;
        setPhase(ok ? 'transition' : 'completeError');
      }, 800);
    }, 5000);
    return () => { cancelled = true; [t1, t2, t3, t4, t5].forEach(clearTimeout); };
  }, []);

  async function handleRetryComplete() {
    setPhase('working');
    const ok = await callComplete();
    setPhase(ok ? 'transition' : 'completeError');
  }

  function handleContinue() {
    if (completedRef.current) return;
    completedRef.current = true;
    onDone();
  }

  if (phase === 'completeError') {
    return (
      <div className="ow-processing ow-processing-transition">
        <div className="ow-error-icon">!</div>
        <h1 className="ow-h1">We couldn't finalize your setup.</h1>
        <p className="ow-sub" style={{ marginBottom: 18 }}>
          The connection dropped. Your answers are saved — just retry to continue to activation.
        </p>
        <button type="button" className="ow-next" onClick={handleRetryComplete}>
          Retry →
        </button>
      </div>
    );
  }

  if (phase === 'transition') {
    return (
      <div className="ow-processing ow-processing-transition">
        <div className="ow-success-icon ow-success-icon-sm">✓</div>
        <h1 className="ow-h1">Your account preferences are set.</h1>
        <p className="ow-sub" style={{ marginBottom: 18 }}>
          Claim your <strong style={{ color: '#ea580c' }}>$50 FREE credit</strong> to start unlocking requests.
        </p>
        <button type="button" className="ow-next" onClick={handleContinue}>
          Claim my $50 FREE credit →
        </button>
      </div>
    );
  }

  return (
    <div className="ow-processing">
      <h1 className="ow-h1">Preparing your request routing…</h1>
      <p className="ow-sub">Configuring your account based on the preferences you just set.</p>
      <ul className="ow-processing-list">
        {items.map((label, i) => {
          const isDone = i < done;
          const isLoading = i === done;
          return (
            <li key={label} className={`ow-processing-item${isDone ? ' done' : ''}${isLoading ? ' loading' : ''}`}>
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

// ── Screen 7: Activation (light theme — native to onboarding modal) ──────────
// ── Screen 7: Activation — TWO substeps inside one wizard step ───────────────
//   7a "choose"  → tier picker, no PaymentElement, no Stripe API call yet.
//                  CTA "Continue to secure payment →" fetches a PaymentIntent.
//   7b "pay"     → summary banner + Back link + PaymentElement + dynamic CTA.
// Splitting these means the user never sees plan cards and a card form on the
// same screen, and we don't burn a PaymentIntent until the user actually
// commits to a tier.
function ScreenActivation({ API_URL, onSkip, onDone, answers }) {
  const [tier, setTier] = useState(100);
  const [substep, setSubstep] = useState('choose'); // 'choose' | 'pay'
  const [intent, setIntent] = useState(null);       // { clientSecret, selectedAmount, bonusCredits, totalCredits }
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
    // Drop the existing intent — if the user changes tier and continues again,
    // a fresh PI will be created.
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
      />
    );
  }

  // substep === 'pay' — Elements re-keyed on clientSecret so a back-then-tier-change
  // flow remounts cleanly with a fresh PI.
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

// ── 7a — Choose your activation balance ─────────────────────────────────────
function ChooseBalance({ tier, setTier, onContinue, onSkip, fetching, initErr }) {
  const ctaLabel = fetching
    ? 'Preparing secure payment…'
    : tier === 100 ? 'Continue with $150 balance →' : 'Continue with $50 balance →';

  return (
    <div className="ow-choose">
      <h1 className="ow-h1">Claim your onboarding credit</h1>
      <p className="ow-sub">
        Your state is open for new mover partners right now. Activate your balance before partner onboarding closes.
      </p>

      {/* FOMO notice — operational tone, no countdowns, no fake spots. */}
      <aside className="ow-fomo" role="note">
        <span className="ow-fomo-dot" aria-hidden="true" />
        <span>
          Partner spots are limited by state so request quality stays protected. Your <strong>$50 onboarding credit</strong> is available while onboarding remains open in your state.
        </span>
      </aside>

      <div className="ow-choose-heading">Choose your starting balance</div>

      <div className="ow-tiers">
        {/* Primary $100 — visually dominant. */}
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

        {/* Secondary $50 — lighter, still trustworthy. */}
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

      {/* Trust panel — contained, visually tied to the activation flow. */}
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

// ── 7b — Complete secure payment ────────────────────────────────────────────
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

// ── Screen 8: Activation success (post-payment) ─────────────────────────────
function ScreenActivationSuccess({ onDone, answers }) {
  const { API_URL, user } = useContext(AuthContext);
  const persona = buildPersona(answers || {});

  // Tier-aware copy: read the activated balance from the fresh user object
  // (refreshUser was called before transitioning to this step). $100 path
  // shows "$150 balance is active"; $50 path shows "$50 balance is active".
  const balance = Math.round(user?.balance || 0);
  const isBonusPath = !!user?.onboarding?.bonusClaimedAt || balance >= 150;
  const headline = isBonusPath ? 'Your $150 balance is active' : `Your $${balance || 50} balance is active`;
  // primaryMarket is now a US state name (e.g. "Texas"). We also match the
  // 2-letter code so leads stored as "Houston, TX" still count toward the
  // partner's selected state.
  const stateName = (persona.market || '').trim();
  const stateRecord = US_STATES.find(s => s.name.toLowerCase() === stateName.toLowerCase());
  const stateCode = stateRecord?.code || '';
  const [matchCount, setMatchCount] = useState(null);

  useEffect(() => {
    if (!stateName || stateName === 'your market') return;
    let alive = true;
    fetch(`${API_URL}/leads`, {
      headers: { 'x-auth-token': localStorage.getItem('token') || '' },
    })
      .then(r => r.json())
      .then(data => {
        if (!alive || !Array.isArray(data)) return;
        const nameLc = stateName.toLowerCase();
        const codeLc = stateCode.toLowerCase();
        const count = data.filter(l => {
          const o = (l.originCity || '').toLowerCase();
          const d = (l.destinationCity || '').toLowerCase();
          // Match either the state name or the 2-letter code as a token.
          return (
            (nameLc && (o.includes(nameLc) || d.includes(nameLc))) ||
            (codeLc && (o.match(new RegExp(`(?:^|[\\s,])${codeLc}(?:$|[\\s,])`)) || d.match(new RegExp(`(?:^|[\\s,])${codeLc}(?:$|[\\s,])`))))
          );
        }).length;
        setMatchCount(count);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [API_URL, stateName, stateCode]);

  const marketLine = matchCount && matchCount > 0
    ? `${matchCount} active ${matchCount === 1 ? 'request matches' : 'requests match'} your setup near ${persona.market}`
    : (persona.market !== 'your market'
        ? `Market routing enabled for ${persona.market}`
        : 'Market routing enabled');

  // We dropped the old "channels" concept (legacy alertChannels). The success
  // bullet now reflects the actual real notification toggles set via Step 3.
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
