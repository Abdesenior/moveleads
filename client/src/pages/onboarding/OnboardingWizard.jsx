import { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../../context/AuthContext';
import './Onboarding.css';

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

export default function OnboardingWizard({ onClose }) {
  const { API_URL, refreshUser } = useContext(AuthContext);
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState({
    primaryMarket: '',
    coveragePreference: '',
    additionalMarkets: [],
    moveTypes: [],
    alertChannels: [],
    urgentCallEnabled: false,
    dispatchDays: [],
    dispatchHoursOpen: '08:00',
    dispatchHoursClose: '19:00',
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
        if (ob.currentStep && ob.currentStep > 0 && ob.currentStep <= TOTAL_STEPS) {
          setStep(ob.currentStep);
        }
        if (ob.answers) {
          // Migrate old per-day dispatchHours to new shape if present
          const a = ob.answers;
          const dispatchDays = Array.isArray(a.dispatchDays)
            ? a.dispatchDays
            : (a.dispatchHours && typeof a.dispatchHours === 'object'
                ? Object.keys(a.dispatchHours)
                : []);
          setAnswers(prev => ({
            ...prev,
            primaryMarket:        a.primaryMarket        ?? prev.primaryMarket,
            coveragePreference:   a.coveragePreference   ?? prev.coveragePreference,
            additionalMarkets:    a.additionalMarkets    ?? prev.additionalMarkets,
            moveTypes:            a.moveTypes            ?? prev.moveTypes,
            alertChannels:        a.alertChannels        ?? prev.alertChannels,
            urgentCallEnabled:    a.urgentCallEnabled    ?? prev.urgentCallEnabled,
            dispatchDays,
            dispatchHoursOpen:    a.dispatchHoursOpen    ?? prev.dispatchHoursOpen,
            dispatchHoursClose:   a.dispatchHoursClose   ?? prev.dispatchHoursClose,
            dailyRequestCapacity: a.dailyRequestCapacity ?? prev.dailyRequestCapacity,
            preferredTiming:      a.preferredTiming      ?? prev.preferredTiming,
          }));
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [API_URL]);

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
      // Server expects dispatchHours as {dayId: {open, close}}; build it from new shape
      const dispatchHours = {};
      for (const d of answers.dispatchDays) {
        dispatchHours[d] = { open: answers.dispatchHoursOpen, close: answers.dispatchHoursClose };
      }
      await fetch(`${API_URL}/onboarding/save-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({
          step: stepNum,
          answers: { ...answers, dispatchHours },
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

  // After processing screen, advance to activation
  function onProcessingDone() { setStep(7); }

  // After successful activation
  async function onActivationDone() {
    if (refreshUser) await refreshUser();
    setStep(8);
  }

  async function closeAfterSuccess() {
    if (refreshUser) await refreshUser();
    onClose && onClose();
  }

  const trustTip = TRUST_TIPS[(step - 1) % TRUST_TIPS.length];

  return (
    <div className="onboarding-wizard" role="dialog" aria-label="Partner activation setup">
      <div className="ow-blur" />
      <div className="ow-modal">
        {step <= TOTAL_STEPS && (
          <>
            <div className="ow-progress">
              <div className="ow-progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
            </div>
            <div className="ow-progress-label">Step {step} of {TOTAL_STEPS} · {trustTip}</div>
          </>
        )}

        <div className="ow-body">
          {step === 1 && <ScreenMarketCoverage answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
          {step === 2 && <ScreenServiceTypes answers={answers} toggleInArray={toggleInArray} />}
          {step === 3 && <ScreenAlertRouting answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
          {step === 4 && <ScreenRequestFlow answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
          {step === 5 && <ScreenConfirmSetup answers={answers} />}
          {step === 6 && <ScreenProcessing onDone={onProcessingDone} />}
          {step === 7 && <ScreenActivation API_URL={API_URL} onDone={onActivationDone} onSkip={dismissSkip} />}
          {step === 8 && <ScreenActivationSuccess onDone={closeAfterSuccess} />}
        </div>

        {step <= TOTAL_STEPS && (
          <div className="ow-footer">
            {step > 1
              ? <button className="ow-back" onClick={back} type="button">← Back</button>
              : <button className="ow-back" onClick={dismissSkip} type="button">Skip setup</button>
            }
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

function isStepValid(step, a) {
  if (step === 1) return !!a.primaryMarket && !!a.coveragePreference;
  if (step === 2) return a.moveTypes && a.moveTypes.length > 0;
  if (step === 3) return a.alertChannels && a.alertChannels.length > 0;
  if (step === 4) return !!a.dailyRequestCapacity;
  if (step === 5) return true;
  return true;
}

// ── Screen 1: Market coverage ─────────────────────────────────────────────────
function ScreenMarketCoverage({ answers, setAnswer, toggleInArray }) {
  const [marketDraft, setMarketDraft] = useState('');
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

  return (
    <>
      <h1 className="ow-h1">Where should we send move opportunities?</h1>
      <p className="ow-sub">Set your primary market — we'll only route requests inside your service area.</p>

      <div className="ow-field">
        <label className="ow-label" htmlFor="primaryMarket">Primary market</label>
        <input
          id="primaryMarket"
          className="ow-input"
          placeholder="Houston, TX"
          value={answers.primaryMarket}
          onChange={e => setAnswer('primaryMarket', e.target.value)}
        />
      </div>

      <div className="ow-field">
        <label className="ow-label">Coverage preference</label>
        <div className="ow-cards">
          {COVERAGE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-card${answers.coveragePreference === opt.id ? ' active' : ''}`}
              onClick={() => setAnswer('coveragePreference', opt.id)}
            >
              <div style={{ fontWeight: 700 }}>{opt.label}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 500 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="ow-field">
        <label className="ow-label">Additional markets <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span></label>
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
      </div>

      <p className="ow-reassurance">{REASSURANCE}</p>
    </>
  );
}

// ── Screen 3: Alert routing ──────────────────────────────────────────────────
function ScreenAlertRouting({ answers, setAnswer, toggleInArray }) {
  const isToggleActive = answers.urgentCallEnabled;
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
        <label className="ow-label">Dispatch days <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span></label>
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
          <label className="ow-label">Dispatch hours</label>
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
  const dispatchHoursLabel = answers.dispatchDays.length > 0
    ? `${formatTime12h(answers.dispatchHoursOpen)} – ${formatTime12h(answers.dispatchHoursClose)}`
    : '—';
  return (
    <>
      <h1 className="ow-h1">Confirm your dispatch setup</h1>
      <p className="ow-sub">Review your preferences before we activate your request routing.</p>

      <div className="ow-summary-recap" style={{ marginBottom: 16 }}>
        <div className="ow-summary-recap-h">Configured</div>
        <RecapRow label="Primary market"      value={answers.primaryMarket || '—'} />
        <RecapRow label="Coverage"            value={COVERAGE_OPTIONS.find(o => o.id === answers.coveragePreference)?.label || '—'} />
        <RecapRow label="Additional markets"  value={answers.additionalMarkets.join(', ') || '—'} />
        <RecapRow label="Service types"       value={moveLabels} />
        <RecapRow label="Alert channels"      value={channelLabels} />
        <RecapRow label="Urgent call alerts"  value={answers.urgentCallEnabled ? 'On' : 'Off'} />
        <RecapRow label="Dispatch days"       value={dayLabels} />
        <RecapRow label="Dispatch hours"      value={dispatchHoursLabel} />
        <RecapRow label="Daily request alerts" value={answers.dailyRequestCapacity || '—'} />
        <RecapRow label="Most useful timing"  value={timingLabels} />
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

// ── Screen 6: Processing (operational checkmarks 3-5s) ───────────────────────
function ScreenProcessing({ onDone }) {
  const items = [
    'Configuring service area',
    'Preparing matching preferences',
    'Enabling alert routing',
    'Preparing onboarding balance',
  ];
  const [done, setDone] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    const t1 = setTimeout(() => setDone(1), 700);
    const t2 = setTimeout(() => setDone(2), 1500);
    const t3 = setTimeout(() => setDone(3), 2400);
    const t4 = setTimeout(() => {
      setDone(4);
      // Mark onboarding complete server-side, then advance
      fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'x-auth-token': localStorage.getItem('token') || '' },
      }).catch(() => {});
      setTimeout(() => {
        if (!completedRef.current) {
          completedRef.current = true;
          onDone();
        }
      }, 800);
    }, 3300);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
  }, [onDone]);

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

// ── Screen 7: Activation (Stripe redirect — embedded checkout is a follow-up) ─
function ScreenActivation({ API_URL, onSkip }) {
  const [loading, setLoading] = useState(false);

  async function handleActivate() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/billing/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({ amount: 100 }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setLoading(false);
        alert('Could not start checkout. Try again or contact support.');
      }
    } catch (err) {
      console.error('[ActivationStep] checkout failed', err);
      setLoading(false);
    }
  }

  return (
    <div className="ow-activate">
      <h1 className="ow-activate-h1">Activate your onboarding balance</h1>
      <p className="ow-activate-sub">
        Your dispatch setup is ready. Activate your balance to start unlocking verified move opportunities.
      </p>

      <div className="ow-activate-card">
        <span className="ow-activate-pill">Limited first-time onboarding credit</span>

        <div className="ow-activate-bonus">
          <span className="ow-activate-bonus-currency">$</span>
          <span className="ow-activate-bonus-num">50</span>
          <span className="ow-activate-bonus-tag">FREE</span>
        </div>
        <p className="ow-activate-label">unlock credit on us</p>
        <p className="ow-activate-plus">+ 50% extra buying power on your first $100</p>

        <div className="ow-activate-summary">
          <div className="ow-activate-summary-row">
            <span>You pay</span>
            <span className="ow-activate-summary-pay">$100</span>
          </div>
          <div className="ow-activate-summary-row">
            <span>You receive</span>
            <span className="ow-activate-summary-receive">$150 total balance</span>
          </div>
        </div>

        <button type="button" className="ow-activate-cta" onClick={handleActivate} disabled={loading}>
          {loading ? 'Opening checkout…' : 'Activate my $150 balance →'}
        </button>

        <ul className="ow-activate-trust">
          <li>Refundable unused balance</li>
          <li>No subscription</li>
          <li>No contract</li>
          <li>Credits never expire</li>
          <li>Secure Stripe payment</li>
        </ul>
      </div>

      <button type="button" className="ow-activate-skip" onClick={onSkip}>
        I'll activate later
      </button>
    </div>
  );
}

// ── Screen 8: Activation success (post-payment) ─────────────────────────────
function ScreenActivationSuccess({ onDone }) {
  return (
    <div className="ow-success">
      <div className="ow-success-icon">✓</div>
      <h1 className="ow-h1">Your $150 balance is active</h1>
      <ul className="ow-success-list">
        <li>Onboarding bonus applied: <strong>+$50</strong></li>
        <li>Dispatch alerts enabled</li>
        <li>Market coverage configured</li>
      </ul>
      <button type="button" className="ow-next" style={{ marginTop: 18 }} onClick={onDone}>
        Go to dashboard →
      </button>
    </div>
  );
}
