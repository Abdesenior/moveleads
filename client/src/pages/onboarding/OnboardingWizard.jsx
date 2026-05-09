import { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { AuthContext } from '../../context/AuthContext';
import { US_STATES, filterStates } from '../../data/usStates';
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

const TOTAL_STEPS = 5; // Setup steps shown in the progress bar.
// Internal step states: 1..5 = setup, 6 = processing, 7 = activation, 8 = success.

const REASSURANCE = 'You can change this later from your dashboard.';

const COVERAGE_OPTIONS = [
  { id: 'local',        label: 'Local only',     desc: 'Same city or county' },
  { id: 'regional',     label: 'Regional',       desc: 'Within state' },
  { id: 'longDistance', label: 'Long-distance',  desc: 'Cross-state hauls' },
  { id: 'nationwide',   label: 'Nationwide',     desc: 'Anywhere in the U.S.' },
];

const SERVICE_TYPES = [
  { id: 'apartment',    label: 'Apartments' },
  { id: 'home',         label: 'Homes' },
  { id: 'office',       label: 'Offices' },
  { id: 'longDistance', label: 'Long-distance' },
  { id: 'emergency',    label: 'Emergency moves' },
  { id: 'packing',      label: 'Packing' },
  { id: 'laborOnly',    label: 'Labor-only' },
  { id: 'storage',      label: 'Storage' },
];

const ALERT_CHANNELS = [
  { id: 'sms',   label: 'SMS' },
  { id: 'call',  label: 'Phone call' },
  { id: 'email', label: 'Email' },
];

const DAILY_ALERT_OPTIONS = [
  { id: '1-3',  label: '1–3' },
  { id: '4-7',  label: '4–7' },
  { id: '8-15', label: '8–15' },
  { id: '15+',  label: '15+' },
];

const TIMING_OPTIONS = [
  { id: 'sameDay',     label: 'Same day' },
  { id: 'within7Days', label: 'Within 7 days' },
  { id: 'thisMonth',   label: 'This month' },
  { id: 'any',         label: 'Any timing' },
];

const DAYS = [
  { id: 'mon', label: 'Mon' }, { id: 'tue', label: 'Tue' }, { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' }, { id: 'fri', label: 'Fri' }, { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
];

const TRUST_TIPS = [
  '98% of requests are phone-confirmed before delivery',
  'Duplicate and unreachable requests are filtered automatically',
  'Movers in your category typically book 4–7 jobs per month',
  'Average mover-to-customer connect time: 4–6 minutes',
];

// Setup-status tracker stages — one per setup step (1..5).
const SETUP_STAGES = [
  { id: 1, label: 'Coverage' },
  { id: 2, label: 'Preferences' },
  { id: 3, label: 'Routing' },
  { id: 4, label: 'Flow' },
  { id: 5, label: 'Confirm' },
];

// Build personalized phrasing fragments from the answers object.
function buildPersona(answers, fallback = {}) {
  const market = (answers.primaryMarket || '').trim();
  const coverageLabels = (answers.coveragePreferences || [])
    .map(id => COVERAGE_OPTIONS.find(o => o.id === id)?.label)
    .filter(Boolean);
  const moveLabels = (answers.moveTypes || [])
    .map(id => SERVICE_TYPES.find(o => o.id === id)?.label.toLowerCase())
    .filter(Boolean);
  const channelLabels = (answers.alertChannels || [])
    .map(id => ALERT_CHANNELS.find(o => o.id === id)?.label)
    .filter(Boolean);
  return {
    market: market || fallback.market || 'your market',
    coverageLabels,
    moveLabels,
    channelLabels,
    moveSummary: moveLabels.length
      ? (moveLabels.length <= 2 ? moveLabels.join(' and ') : `${moveLabels.slice(0, 2).join(', ')} and more`)
      : (fallback.moveSummary || 'verified move'),
    channelSummary: channelLabels.length
      ? channelLabels.join(' and ')
      : (fallback.channelSummary || 'your alert channels'),
  };
}

export default function OnboardingWizard({ onClose, initialStep }) {
  const { API_URL, refreshUser, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [step, setStep] = useState(initialStep || 1);
  const [answers, setAnswers] = useState({
    primaryMarket: '',
    coveragePreferences: [],
    additionalMarkets: [],
    moveTypes: [],
    alertChannels: [],
    urgentCallEnabled: false,
    dispatchHoursMode: 'default', // 'default' | 'advanced'
    dispatchDays: [],
    dispatchHoursOpen: '08:00',
    dispatchHoursClose: '19:00',
    dispatchHoursPerDay: {}, // { mon: {open, close}, ... }
    dailyRequestCapacity: '',
    preferredTiming: [],
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
          // Migrate single coveragePreference → coveragePreferences[]
          let coveragePrefs = Array.isArray(a.coveragePreferences) && a.coveragePreferences.length
            ? a.coveragePreferences
            : (a.coveragePreference ? [a.coveragePreference] : []);
          // Build per-day hours from legacy shape if present
          const perDay = (a.dispatchHours && typeof a.dispatchHours === 'object') ? a.dispatchHours : {};
          const dispatchDays = Array.isArray(a.dispatchDays) && a.dispatchDays.length
            ? a.dispatchDays
            : Object.keys(perDay);
          setAnswers(prev => ({
            ...prev,
            primaryMarket:        a.primaryMarket        ?? prev.primaryMarket,
            coveragePreferences:  coveragePrefs,
            additionalMarkets:    a.additionalMarkets    ?? prev.additionalMarkets,
            moveTypes:            a.moveTypes            ?? prev.moveTypes,
            alertChannels:        a.alertChannels        ?? prev.alertChannels,
            urgentCallEnabled:    a.urgentCallEnabled    ?? prev.urgentCallEnabled,
            dispatchHoursMode:    a.dispatchHoursMode    || prev.dispatchHoursMode,
            dispatchDays,
            dispatchHoursOpen:    a.dispatchHoursOpen    ?? prev.dispatchHoursOpen,
            dispatchHoursClose:   a.dispatchHoursClose   ?? prev.dispatchHoursClose,
            dispatchHoursPerDay:  perDay,
            dailyRequestCapacity: a.dailyRequestCapacity ?? prev.dailyRequestCapacity,
            preferredTiming:      a.preferredTiming      ?? prev.preferredTiming,
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
      // Build dispatchHours object based on mode for backend storage
      const dispatchHours = {};
      if (answers.dispatchHoursMode === 'advanced') {
        for (const d of answers.dispatchDays) {
          const perDay = answers.dispatchHoursPerDay[d] || {};
          dispatchHours[d] = {
            open: perDay.open || answers.dispatchHoursOpen,
            close: perDay.close || answers.dispatchHoursClose,
          };
        }
      } else {
        for (const d of answers.dispatchDays) {
          dispatchHours[d] = { open: answers.dispatchHoursOpen, close: answers.dispatchHoursClose };
        }
      }
      await fetch(`${API_URL}/onboarding/save-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({
          step: stepNum,
          answers: {
            primaryMarket: answers.primaryMarket,
            coveragePreferences: answers.coveragePreferences,
            additionalMarkets: answers.additionalMarkets,
            moveTypes: answers.moveTypes,
            alertChannels: answers.alertChannels,
            urgentCallEnabled: answers.urgentCallEnabled,
            dispatchHoursMode: answers.dispatchHoursMode,
            dispatchDays: answers.dispatchDays,
            dispatchHoursOpen: answers.dispatchHoursOpen,
            dispatchHoursClose: answers.dispatchHoursClose,
            dispatchHours,
            dailyRequestCapacity: answers.dailyRequestCapacity,
            preferredTiming: answers.preferredTiming,
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
    else if (step === TOTAL_STEPS) setStep(6); // → processing
  }

  function back() {
    if (step > 1 && step <= TOTAL_STEPS) setStep(step - 1);
  }

  // Skip-with-defaults — only allowed on Step 2 (Service Types) and Step 4
  // (Request Flow). Applies broad defaults the user can edit later from the
  // dashboard; preserves the conversion path for movers who want to rush.
  async function skipWithDefaults() {
    let patched = answers;
    if (step === 2) {
      patched = { ...patched, moveTypes: patched.moveTypes?.length ? patched.moveTypes : ['home', 'apartment'] };
    } else if (step === 4) {
      patched = {
        ...patched,
        dailyRequestCapacity: patched.dailyRequestCapacity || '4-7',
        preferredTiming: patched.preferredTiming?.length ? patched.preferredTiming : ['any'],
      };
    } else {
      return;
    }
    setAnswers(patched);
    // Save with the patched answers immediately, then advance.
    try {
      const dispatchHours = {};
      for (const d of patched.dispatchDays || []) {
        dispatchHours[d] = { open: patched.dispatchHoursOpen, close: patched.dispatchHoursClose };
      }
      await fetch(`${API_URL}/onboarding/save-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({
          step,
          answers: { ...patched, dispatchHours },
        }),
      });
    } catch (err) { /* swallow — UI can advance regardless */ }
    if (step < TOTAL_STEPS) setStep(step + 1);
    else if (step === TOTAL_STEPS) setStep(6);
  }
  const canSkipStep = step === 2 || step === 4;

  // Soft-skip — only used from activation step ("I'll activate later")
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

  function onProcessingDone() { setStep(7); }

  async function onActivationDone() {
    if (refreshUser) await refreshUser();
    setStep(8);
  }

  async function closeAfterSuccess() {
    if (refreshUser) await refreshUser();
    if (onClose) onClose();
    navigate('/dashboard/leads');
  }

  const trustTip = TRUST_TIPS[(step - 1) % TRUST_TIPS.length];

  return (
    <div className="onboarding-wizard" role="dialog" aria-label="Partner activation setup">
      <div className="ow-blur" />
      <div className={`ow-modal${step === 7 ? ' ow-modal-wide' : ''}`}>
        {step <= TOTAL_STEPS && (
          <div className="ow-header">
            <div className="ow-progress">
              <div className="ow-progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
            </div>
            <div className="ow-progress-label">Step {step} of {TOTAL_STEPS} · {trustTip}</div>
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
            {step === 1 && <ScreenMarketCoverage answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} companyName={user?.companyName} />}
            {step === 2 && <ScreenServiceTypes answers={answers} toggleInArray={toggleInArray} />}
            {step === 3 && <ScreenAlertRouting answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
            {step === 4 && <ScreenRequestFlow answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
            {step === 5 && <ScreenConfirmSetup answers={answers} />}
            {step === 6 && <ScreenProcessing onDone={onProcessingDone} answers={answers} />}
            {step === 7 && <ScreenActivation API_URL={API_URL} onDone={onActivationDone} onSkip={dismissSkip} answers={answers} />}
            {step === 8 && <ScreenActivationSuccess onDone={closeAfterSuccess} answers={answers} />}
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
                  title="Apply smart defaults and continue — you can fine-tune this later from your dashboard."
                >
                  Skip — use smart defaults →
                </button>
              )}
            </div>
            <button
              className="ow-next"
              onClick={next}
              type="button"
              disabled={!isStepValid(step, answers)}
            >
              {step < TOTAL_STEPS ? 'Continue →' : 'Confirm setup →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function coverageFeedback(ids) {
  const labels = ids
    .map(id => COVERAGE_OPTIONS.find(o => o.id === id)?.label)
    .filter(Boolean);
  if (labels.length === 1) return `${labels[0]} routing prepared.`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} routing prepared.`;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]} routing prepared.`;
}

function moveTypeFeedback(ids) {
  const n = ids.length;
  if (n === 0) return '';
  if (n === 1) {
    const label = SERVICE_TYPES.find(o => o.id === ids[0])?.label.toLowerCase();
    return `Prioritizing ${label} requests.`;
  }
  return `${n} service types enabled — we'll prioritize matches in these.`;
}

function alertFeedback(ids, urgent) {
  if (!ids.length) return '';
  const labels = ids.map(id => ALERT_CHANNELS.find(o => o.id === id)?.label).filter(Boolean);
  const channelLine = labels.length === 1
    ? `${labels[0]} alerts ready.`
    : `${labels.join(' + ')} alerts ready.`;
  return urgent ? `${channelLine} Urgent calls enabled.` : channelLine;
}

function isStepValid(step, a) {
  if (step === 1) return !!a.primaryMarket && a.coveragePreferences && a.coveragePreferences.length > 0;
  if (step === 2) return a.moveTypes && a.moveTypes.length > 0;
  if (step === 3) return a.alertChannels && a.alertChannels.length > 0;
  if (step === 4) return !!a.dailyRequestCapacity;
  if (step === 5) return true;
  return true;
}

// ── Screen 1: Market coverage ─────────────────────────────────────────────────
function ScreenMarketCoverage({ answers, setAnswer, toggleInArray, companyName }) {
  const primaryMarketRef = useRef(null);
  const dropdownRef = useRef(null);
  const [marketDraft, setMarketDraft] = useState('');
  const [stateQuery, setStateQuery] = useState(answers.primaryMarket || '');
  const [stateOpen, setStateOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);

  // Keep local query in sync with the answer when external state changes
  // (e.g. on resume from server-saved progress).
  useEffect(() => {
    setStateQuery(answers.primaryMarket || '');
  }, [answers.primaryMarket]);

  const filtered = filterStates(stateQuery, 8);

  function pickState(state) {
    setAnswer('primaryMarket', state.name);
    setStateQuery(state.name);
    setStateOpen(false);
    setHighlightIdx(0);
  }

  function handleStateInput(e) {
    const v = e.target.value;
    setStateQuery(v);
    setStateOpen(true);
    setHighlightIdx(0);
    // If the user clears the field, also clear the saved answer.
    if (!v.trim()) setAnswer('primaryMarket', '');
  }

  function handleStateBlur() {
    // Defer so a click on a dropdown item still registers before close.
    setTimeout(() => setStateOpen(false), 120);
    // If they typed an exact match (case-insensitive), commit it.
    const exact = US_STATES.find(s =>
      s.name.toLowerCase() === stateQuery.trim().toLowerCase() ||
      s.code.toLowerCase() === stateQuery.trim().toLowerCase()
    );
    if (exact) {
      setAnswer('primaryMarket', exact.name);
      setStateQuery(exact.name);
    }
  }

  function handleStateKey(e) {
    if (!stateOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = filtered[highlightIdx];
      if (s) pickState(s);
    } else if (e.key === 'Escape') {
      setStateOpen(false);
    }
  }

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

  const greeting = companyName
    ? `${companyName} — let's get your dispatch live and start matching you with verified move opportunities.`
    : `Let's get your dispatch live and start matching you with verified move opportunities.`;

  return (
    <>
      <p className="ow-greeting">{greeting}</p>
      <h1 className="ow-h1">Where should we send move opportunities?</h1>
      <p className="ow-sub">Set your primary market — we'll only route requests inside your service area.</p>

      <div className="ow-field ow-state-field">
        <label className="ow-label" htmlFor="primaryMarket">Primary state</label>
        <input
          id="primaryMarket"
          ref={primaryMarketRef}
          className="ow-input"
          placeholder="Start typing… e.g. Texas"
          value={stateQuery}
          onChange={handleStateInput}
          onFocus={() => setStateOpen(true)}
          onBlur={handleStateBlur}
          onKeyDown={handleStateKey}
          autoComplete="off"
          role="combobox"
          aria-expanded={stateOpen}
          aria-controls="ow-state-dropdown"
          aria-autocomplete="list"
        />
        {stateOpen && filtered.length > 0 && (
          <ul id="ow-state-dropdown" ref={dropdownRef} className="ow-state-dropdown" role="listbox">
            {filtered.map((s, i) => (
              <li
                key={s.code}
                role="option"
                aria-selected={i === highlightIdx}
                className={`ow-state-option${i === highlightIdx ? ' active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); pickState(s); }}
                onMouseEnter={() => setHighlightIdx(i)}
              >
                <span className="ow-state-name">{s.name}</span>
                <span className="ow-state-code">{s.code}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ow-field">
        <label className="ow-label">Coverage preference <span className="ow-label-hint">(select all that apply)</span></label>
        <div className="ow-cards">
          {COVERAGE_OPTIONS.map(opt => {
            const active = answers.coveragePreferences.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                className={`ow-card${active ? ' active' : ''}`}
                onClick={() => toggleInArray('coveragePreferences', opt.id)}
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
        {answers.coveragePreferences.length > 0 && (
          <p className="ow-feedback">
            {coverageFeedback(answers.coveragePreferences)}
          </p>
        )}
      </div>

      <div className="ow-field">
        <label className="ow-label">Additional markets <span className="ow-label-hint">(optional)</span></label>
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
            placeholder={answers.additionalMarkets.length ? 'Add another…' : 'Add Dallas, Austin, San Antonio…'}
            value={marketDraft}
            onChange={e => setMarketDraft(e.target.value)}
            onKeyDown={handleKey}
            onBlur={commitMarket}
          />
        </div>
        <p className="ow-helper">Press Enter or comma to add.</p>
      </div>

      <p className="ow-reassurance">{REASSURANCE}</p>
    </>
  );
}

// ── Screen 2: Service types (multi-select only) ──────────────────────────────
function ScreenServiceTypes({ answers, toggleInArray }) {
  return (
    <>
      <h1 className="ow-h1">What kind of moves fit your crews best?</h1>
      <p className="ow-sub">Select all that apply — we'll prioritize matching requests in these categories.</p>

      <div className="ow-field">
        <label className="ow-label">Service types</label>
        <div className="ow-chips">
          {SERVICE_TYPES.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-chip${answers.moveTypes.includes(opt.id) ? ' active' : ''}`}
              onClick={() => toggleInArray('moveTypes', opt.id)}
            >
              {answers.moveTypes.includes(opt.id) && <span className="ow-chip-check">✓</span>}
              {opt.label}
            </button>
          ))}
        </div>
        {answers.moveTypes.length > 0 && (
          <p className="ow-feedback">{moveTypeFeedback(answers.moveTypes)}</p>
        )}
      </div>

      <p className="ow-reassurance">{REASSURANCE}</p>
    </>
  );
}

// ── Screen 3: Alert routing ──────────────────────────────────────────────────
function ScreenAlertRouting({ answers, setAnswer, toggleInArray }) {
  const isToggleActive = answers.urgentCallEnabled;
  const isAdvanced = answers.dispatchHoursMode === 'advanced';
  const setPerDay = (dayId, field, value) => {
    setAnswer('dispatchHoursPerDay', {
      ...answers.dispatchHoursPerDay,
      [dayId]: {
        open:  field === 'open'  ? value : (answers.dispatchHoursPerDay[dayId]?.open  || answers.dispatchHoursOpen),
        close: field === 'close' ? value : (answers.dispatchHoursPerDay[dayId]?.close || answers.dispatchHoursClose),
      },
    });
  };
  return (
    <>
      <h1 className="ow-h1">How should we route requests to your team?</h1>
      <p className="ow-sub">Pick your alert channels — speed of response usually decides who books the move.</p>

      <div className="ow-field">
        <label className="ow-label">Alert channels (tap to enable)</label>
        <div className="ow-chips">
          {ALERT_CHANNELS.map(c => (
            <button
              key={c.id}
              type="button"
              className={`ow-chip${answers.alertChannels.includes(c.id) ? ' active' : ''}`}
              onClick={() => toggleInArray('alertChannels', c.id)}
            >
              {answers.alertChannels.includes(c.id) && <span className="ow-chip-check">✓</span>}
              {c.label}
            </button>
          ))}
        </div>
        {(answers.alertChannels.length > 0 || answers.urgentCallEnabled) && (
          <p className="ow-feedback">{alertFeedback(answers.alertChannels, answers.urgentCallEnabled)}</p>
        )}
      </div>

      <div className="ow-field">
        <button
          type="button"
          className={`ow-toggle${isToggleActive ? ' active' : ''}`}
          onClick={() => setAnswer('urgentCallEnabled', !isToggleActive)}
        >
          <span className="ow-toggle-track" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
            Call me immediately for urgent requests
          </span>
        </button>
      </div>

      <div className="ow-field">
        <label className="ow-label">Dispatch days <span className="ow-label-hint">(optional)</span></label>
        <div className="ow-chips">
          {DAYS.map(d => {
            const active = answers.dispatchDays.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                className={`ow-chip${active ? ' active' : ''}`}
                onClick={() => toggleInArray('dispatchDays', d.id)}
              >
                {active && <span className="ow-chip-check">✓</span>}
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {answers.dispatchDays.length > 0 && (
        <div className="ow-field">
          <div className="ow-mode-row">
            <label className="ow-label" style={{ marginBottom: 0 }}>Dispatch hours</label>
            <div className="ow-mode-tabs" role="tablist" aria-label="Dispatch hours mode">
              <button
                type="button"
                role="tab"
                aria-selected={!isAdvanced}
                className={`ow-mode-tab${!isAdvanced ? ' active' : ''}`}
                onClick={() => setAnswer('dispatchHoursMode', 'default')}
              >
                Same hours
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isAdvanced}
                className={`ow-mode-tab${isAdvanced ? ' active' : ''}`}
                onClick={() => setAnswer('dispatchHoursMode', 'advanced')}
              >
                Per day
              </button>
            </div>
          </div>

          {!isAdvanced ? (
            <>
              <div className="ow-time-range">
                <input
                  type="time"
                  className="ow-input ow-time-input"
                  value={answers.dispatchHoursOpen}
                  onChange={e => setAnswer('dispatchHoursOpen', e.target.value)}
                  aria-label="Opens at"
                />
                <span className="ow-time-sep">to</span>
                <input
                  type="time"
                  className="ow-input ow-time-input"
                  value={answers.dispatchHoursClose}
                  onChange={e => setAnswer('dispatchHoursClose', e.target.value)}
                  aria-label="Closes at"
                />
              </div>
              <p className="ow-helper">We'll route requests to your team during these hours on selected days.</p>
            </>
          ) : (
            <div className="ow-perday">
              {answers.dispatchDays.map(dayId => {
                const label = DAYS.find(d => d.id === dayId)?.label || dayId;
                const perDay = answers.dispatchHoursPerDay[dayId] || {};
                const open  = perDay.open  ?? answers.dispatchHoursOpen;
                const close = perDay.close ?? answers.dispatchHoursClose;
                return (
                  <div key={dayId} className="ow-perday-row">
                    <span className="ow-perday-label">{label}</span>
                    <input
                      type="time"
                      className="ow-input ow-time-input"
                      value={open}
                      onChange={e => setPerDay(dayId, 'open', e.target.value)}
                      aria-label={`${label} opens at`}
                    />
                    <span className="ow-time-sep">to</span>
                    <input
                      type="time"
                      className="ow-input ow-time-input"
                      value={close}
                      onChange={e => setPerDay(dayId, 'close', e.target.value)}
                      aria-label={`${label} closes at`}
                    />
                  </div>
                );
              })}
              <p className="ow-helper">Set unique hours for each dispatch day.</p>
            </div>
          )}
        </div>
      )}

      <p className="ow-reassurance">{REASSURANCE}</p>
    </>
  );
}

// ── Screen 4: Request flow ───────────────────────────────────────────────────
function ScreenRequestFlow({ answers, setAnswer, toggleInArray }) {
  return (
    <>
      <h1 className="ow-h1">Help us balance request flow for your team</h1>
      <p className="ow-sub">We'll throttle alerts to fit your preferred request volume.</p>

      <div className="ow-field">
        <label className="ow-label">How many new request alerts do you want per day?</label>
        <div className="ow-cards">
          {DAILY_ALERT_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-card${answers.dailyRequestCapacity === opt.id ? ' active' : ''}`}
              onClick={() => setAnswer('dailyRequestCapacity', opt.id)}
            >
              <div style={{ fontWeight: 700 }}>{opt.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="ow-field">
        <label className="ow-label">Most useful timing</label>
        <div className="ow-chips">
          {TIMING_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-chip${answers.preferredTiming.includes(opt.id) ? ' active' : ''}`}
              onClick={() => toggleInArray('preferredTiming', opt.id)}
            >
              {answers.preferredTiming.includes(opt.id) && <span className="ow-chip-check">✓</span>}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <p className="ow-reassurance">{REASSURANCE}</p>
    </>
  );
}

function CoverageRecapSummary({ answers }) {
  const persona = buildPersona(answers);
  if (!answers.primaryMarket && !persona.coverageLabels.length) return null;
  return (
    <p className="ow-summary-tagline">
      Your <strong>{persona.market}</strong> {persona.coverageLabels.length ? <>+ <strong>{persona.coverageLabels.join(', ').toLowerCase()}</strong> </> : null}
      routing is ready.
    </p>
  );
}

// ── Screen 5: Confirm setup (no offer here) ──────────────────────────────────
function ScreenConfirmSetup({ answers }) {
  const moveLabels = answers.moveTypes
    .map(id => SERVICE_TYPES.find(o => o.id === id)?.label).filter(Boolean).join(', ') || '—';
  const channelLabels = answers.alertChannels
    .map(id => ALERT_CHANNELS.find(o => o.id === id)?.label).filter(Boolean).join(' · ') || '—';
  const timingLabels = answers.preferredTiming
    .map(id => TIMING_OPTIONS.find(o => o.id === id)?.label).filter(Boolean).join(', ') || '—';
  const dayLabels = answers.dispatchDays
    .map(id => DAYS.find(o => o.id === id)?.label).filter(Boolean).join(' · ') || '—';
  const coverageLabels = answers.coveragePreferences
    .map(id => COVERAGE_OPTIONS.find(o => o.id === id)?.label).filter(Boolean).join(', ') || '—';

  let dispatchHoursLabel = '—';
  if (answers.dispatchDays.length > 0) {
    if (answers.dispatchHoursMode === 'advanced') {
      dispatchHoursLabel = 'Custom per day';
    } else {
      dispatchHoursLabel = `${formatTime12h(answers.dispatchHoursOpen)} – ${formatTime12h(answers.dispatchHoursClose)}`;
    }
  }

  return (
    <>
      <h1 className="ow-h1">Confirm your dispatch setup</h1>
      <p className="ow-sub">Review your preferences before we activate your request routing.</p>

      <CoverageRecapSummary answers={answers} />

      <div className="ow-summary-recap" style={{ marginBottom: 16 }}>
        <div className="ow-summary-recap-h">Configured</div>
        <RecapRow label="Primary market"        value={answers.primaryMarket || '—'} />
        <RecapRow label="Coverage"              value={coverageLabels} />
        <RecapRow label="Additional markets"    value={answers.additionalMarkets.join(', ') || '—'} />
        <RecapRow label="Service types"         value={moveLabels} />
        <RecapRow label="Alert channels"        value={channelLabels} />
        <RecapRow label="Urgent call alerts"    value={answers.urgentCallEnabled ? 'On' : 'Off'} />
        <RecapRow label="Dispatch days"         value={dayLabels} />
        <RecapRow label="Dispatch hours"        value={dispatchHoursLabel} />
        <RecapRow label="Daily request alerts"  value={answers.dailyRequestCapacity || '—'} />
        <RecapRow label="Most useful timing"    value={timingLabels} />
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
    persona.coverageLabels.length
      ? `Preparing ${persona.coverageLabels.join(' + ').toLowerCase()} preferences`
      : 'Preparing matching preferences',
    persona.channelLabels.length
      ? `Enabling ${persona.channelLabels.join(' + ')} alert routing`
      : 'Enabling alert routing',
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
          Claim your <strong style={{ color: '#ea580c' }}>$50 FREE credit</strong> to start moving.
        </p>
        <button type="button" className="ow-next" onClick={handleContinue}>
          Claim my $50 bonus →
        </button>
      </div>
    );
  }

  return (
    <div className="ow-processing">
      <h1 className="ow-h1">Setting up your request routing…</h1>
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
// ── Screen 7: Activation (Stripe Payment Element, two-column layout) ────────
function ScreenActivation({ API_URL, onSkip, onDone, answers }) {
  const persona = buildPersona(answers || {});
  const personalSub = persona.market !== 'your market' || persona.moveLabels.length
    ? `Activate your balance to start unlocking ${persona.moveSummary} opportunities in ${persona.market}.`
    : 'Your dispatch setup is ready. Activate your balance to start unlocking verified move opportunities.';

  const [tier, setTier] = useState(100);
  const [intent, setIntent] = useState(null);  // { clientSecret, selectedAmount, bonusCredits, totalCredits }
  const [phase, setPhase] = useState('fetching'); // 'fetching' | 'ready' | 'error_init'
  const [initErr, setInitErr] = useState('');

  // Fetch (or refetch on tier change) a PaymentIntent. The clientSecret must
  // be present BEFORE we mount <Elements>.
  useEffect(() => {
    let alive = true;
    setPhase('fetching');
    setInitErr('');
    setIntent(null);
    (async () => {
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
        if (!alive) return;
        if (!res.ok || !data?.clientSecret) {
          console.error('[Activation] create-payment-intent failed', res.status, data);
          setInitErr(data?.msg || `Could not start payment (status ${res.status}).`);
          setPhase('error_init');
          return;
        }
        setIntent(data);
        setPhase('ready');
      } catch (err) {
        if (!alive) return;
        console.error('[Activation] create-payment-intent threw', err);
        setInitErr(err?.message || 'Network error starting payment.');
        setPhase('error_init');
      }
    })();
    return () => { alive = false; };
  }, [API_URL, tier]);

  if (phase === 'error_init') {
    return (
      <div className="ow-pay-init-error">
        <div className="ow-activate-err-msg">{initErr}</div>
        <div className="ow-activate-err-actions" style={{ marginTop: 10 }}>
          <button type="button" className="ow-activate-err-retry" onClick={() => setTier(t => t)}>
            Try again
          </button>
          <button type="button" className="ow-activate-err-link" onClick={onSkip} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            I'll activate later
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'fetching' || !intent) {
    return (
      <div className="ow-pay-loading" role="status" aria-live="polite">
        <span className="ow-spinner" />
        <span className="ow-stripe-loading-text">Preparing secure payment…</span>
      </div>
    );
  }

  // Re-key Elements on tier change so the PaymentIntent secret is always
  // fresh (Stripe requires the clientSecret to match the current intent).
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
        setTier={setTier}
        intent={intent}
        personalSub={personalSub}
        onSkip={onSkip}
        onDone={onDone}
      />
    </Elements>
  );
}

function ActivationPaymentForm({ API_URL, tier, setTier, intent, personalSub, onSkip, onDone }) {
  const stripe = useStripe();
  const elements = useElements();
  const { refreshUser } = useContext(AuthContext);
  const [submitting, setSubmitting] = useState(false);
  const [paymentErr, setPaymentErr] = useState('');
  const [elementReady, setElementReady] = useState(false);

  const ctaLabel = submitting
    ? 'Processing…'
    : tier === 100 ? `Activate my $${intent.totalCredits} balance →` : `Pay $${tier} →`;

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
        // Verify with backend (instant UX path; webhook is the safety net).
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
      // Edge case: redirect-required methods won't reach here in if_required mode.
      setPaymentErr(`Payment ended in unexpected status: ${paymentIntent?.status || 'unknown'}.`);
      setSubmitting(false);
    } catch (err) {
      console.error('[Activation] confirmPayment threw', err);
      setPaymentErr(err?.message || 'Unexpected error during payment.');
      setSubmitting(false);
    }
  }

  return (
    <form className="ow-pay-grid" onSubmit={handlePay}>
      {/* LEFT — offer summary, tier picker, trust */}
      <aside className="ow-pay-left">
        <h1 className="ow-pay-h1">Complete your activation</h1>
        <p className="ow-pay-sub">{personalSub}</p>

        <div
          className={`ow-pay-tier ow-pay-tier-primary${tier === 100 ? ' selected' : ''}`}
          role="radio"
          aria-checked={tier === 100}
          tabIndex={0}
          onClick={() => setTier(100)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTier(100); } }}
        >
          <div className="ow-pay-tier-head">
            <span className="ow-activate-pill">Best value</span>
            <span className="ow-tier-radio" aria-hidden="true" />
          </div>
          <div className="ow-pay-tier-amount"><strong>$100</strong> <span>= $150 balance</span></div>
          <div className="ow-pay-tier-bonus">$50 FREE onboarding credit included</div>
        </div>

        <div
          className={`ow-pay-tier ow-pay-tier-secondary${tier === 50 ? ' selected' : ''}`}
          role="radio"
          aria-checked={tier === 50}
          tabIndex={0}
          onClick={() => setTier(50)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTier(50); } }}
        >
          <div className="ow-pay-tier-head">
            <span className="ow-pay-tier-label">Starter balance</span>
            <span className="ow-tier-radio" aria-hidden="true" />
          </div>
          <div className="ow-pay-tier-amount"><strong>$50</strong> <span>= $50 balance</span></div>
          <div className="ow-pay-tier-bonus muted">No onboarding bonus included</div>
        </div>

        <ul className="ow-activate-trust ow-pay-trust">
          <li>Refundable unused balance</li>
          <li>No subscription</li>
          <li>No contract</li>
          <li>Credits never expire</li>
          <li>Secure card payment</li>
        </ul>
      </aside>

      {/* RIGHT — payment form */}
      <section className="ow-pay-right">
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

        <button
          type="button"
          className="ow-activate-skip"
          onClick={onSkip}
          disabled={submitting}
        >
          I'll activate later
        </button>
      </section>
    </form>
  );
}

// ── Screen 8: Activation success (post-payment) ─────────────────────────────
function ScreenActivationSuccess({ onDone, answers }) {
  const { API_URL } = useContext(AuthContext);
  const persona = buildPersona(answers || {});
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

  const alertLine = persona.channelLabels.length
    ? `${persona.channelLabels.join(' + ')} alerts ready`
    : 'Dispatch alerts ready';

  return (
    <div className="ow-success">
      <div className="ow-success-icon">✓</div>
      <h1 className="ow-h1">Your $150 balance is active</h1>
      <ul className="ow-success-list">
        <li>Onboarding bonus applied: <strong>+$50</strong></li>
        <li>{marketLine}</li>
        <li>{alertLine}</li>
      </ul>
      <button type="button" className="ow-next" style={{ marginTop: 18 }} onClick={onDone}>
        View matching opportunities →
      </button>
    </div>
  );
}
