import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import './Onboarding.css';

const TOTAL_STEPS = 5;

const COVERAGE_OPTIONS = [
  { id: 'local',        label: 'Local only',     desc: 'Same city or county' },
  { id: 'regional',     label: 'Regional',       desc: 'Within state' },
  { id: 'longDistance', label: 'Long-distance',  desc: 'Cross-state hauls' },
  { id: 'nationwide',   label: 'Nationwide',     desc: 'Anywhere in the U.S.' },
];

const MOVE_TYPE_OPTIONS = [
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

const DAILY_CAPACITY_OPTIONS = [
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

const CREW_COUNT_OPTIONS = [
  { id: '1',   label: '1 crew' },
  { id: '2-3', label: '2–3 crews' },
  { id: '4-6', label: '4–6 crews' },
  { id: '7+',  label: '7+ crews' },
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
    avoidMoveTypes: [],
    alertChannels: [],
    urgentCallEnabled: false,
    dispatchHours: {},
    dailyRequestCapacity: '',
    preferredTiming: [],
    crewCount: '',
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
          setStep(ob.currentStep + 1 <= TOTAL_STEPS ? ob.currentStep : TOTAL_STEPS);
        }
        if (ob.answers) {
          setAnswers(prev => ({ ...prev, ...ob.answers }));
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
      await fetch(`${API_URL}/onboarding/save-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({ step: stepNum, answers }),
      });
    } catch (err) {
      console.error('[OnboardingWizard] save-step failed:', err);
    }
  }

  async function next() {
    await saveStep(step);
    if (step < TOTAL_STEPS) setStep(step + 1);
  }

  function back() {
    if (step > 1) setStep(step - 1);
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

  const trustTip = TRUST_TIPS[(step - 1) % TRUST_TIPS.length];

  return (
    <div className="onboarding-wizard" role="dialog" aria-label="Partner activation setup">
      <div className="ow-blur" />
      <div className="ow-modal">
        <div className="ow-progress">
          <div className="ow-progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
        </div>
        <div className="ow-progress-label">Step {step} of {TOTAL_STEPS} · {trustTip}</div>

        <div className="ow-body">
          {step === 1 && <ScreenMarketCoverage answers={answers} setAnswer={setAnswer} />}
          {step === 2 && <ScreenMovePreferences answers={answers} toggleInArray={toggleInArray} />}
          {step === 3 && <ScreenDispatchSetup answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
          {step === 4 && <ScreenCapacity answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
          {step === 5 && <ScreenSetupSummary answers={answers} />}
        </div>

        <div className="ow-footer">
          {step > 1
            ? <button className="ow-back" onClick={back} type="button">← Back</button>
            : <button className="ow-back" onClick={dismissSkip} type="button">Skip setup</button>
          }
          {step < TOTAL_STEPS && (
            <button
              className="ow-next"
              onClick={next}
              type="button"
              disabled={!isStepValid(step, answers)}
            >
              Continue →
            </button>
          )}
          {step === TOTAL_STEPS && (
            <button className="ow-back" onClick={dismissSkip} type="button">I'll activate later</button>
          )}
        </div>
      </div>
    </div>
  );
}

function isStepValid(step, a) {
  if (step === 1) return !!a.primaryMarket && !!a.coveragePreference;
  if (step === 2) return a.moveTypes && a.moveTypes.length > 0;
  if (step === 3) return a.alertChannels && a.alertChannels.length > 0;
  if (step === 4) return !!a.dailyRequestCapacity && !!a.crewCount;
  if (step === 5) return true;
  return true;
}

// ── Screen 1 ─────────────────────────────────────────────────────────────────
function ScreenMarketCoverage({ answers, setAnswer }) {
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
        <input
          className="ow-input"
          placeholder="Add cities separated by commas"
          value={(answers.additionalMarkets || []).join(', ')}
          onChange={e => setAnswer('additionalMarkets', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
        />
      </div>
    </>
  );
}

// ── Screen 2 ─────────────────────────────────────────────────────────────────
function ScreenMovePreferences({ answers, toggleInArray }) {
  return (
    <>
      <h1 className="ow-h1">What kind of moves fit your crews best?</h1>
      <p className="ow-sub">Select all that apply — we'll prioritize matching requests in these categories.</p>

      <div className="ow-field">
        <label className="ow-label">Move types you take</label>
        <div className="ow-chips">
          {MOVE_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-chip${answers.moveTypes.includes(opt.id) ? ' active' : ''}`}
              onClick={() => toggleInArray('moveTypes', opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ow-field">
        <label className="ow-label">Move types to avoid <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span></label>
        <div className="ow-chips">
          {MOVE_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-chip${answers.avoidMoveTypes.includes(opt.id) ? ' active' : ''}`}
              onClick={() => toggleInArray('avoidMoveTypes', opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Screen 3 ─────────────────────────────────────────────────────────────────
function ScreenDispatchSetup({ answers, setAnswer, toggleInArray }) {
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
        <label className="ow-label">Dispatch hours <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DAYS.map(d => {
            const active = !!answers.dispatchHours?.[d.id];
            return (
              <button
                key={d.id}
                type="button"
                className={`ow-chip${active ? ' active' : ''}`}
                onClick={() => {
                  const next = { ...answers.dispatchHours };
                  if (active) {
                    delete next[d.id];
                  } else {
                    next[d.id] = { open: '07:00', close: '19:00' };
                  }
                  setAnswer('dispatchHours', next);
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
          We'll only route requests during these hours by default.
        </p>
      </div>
    </>
  );
}

// ── Screen 4 ─────────────────────────────────────────────────────────────────
function ScreenCapacity({ answers, setAnswer, toggleInArray }) {
  return (
    <>
      <h1 className="ow-h1">Help us balance request flow for your team</h1>
      <p className="ow-sub">We'll throttle alerts to fit your crews' real capacity.</p>

      <div className="ow-field">
        <label className="ow-label">How many new requests per day can your crews realistically handle?</label>
        <div className="ow-cards">
          {DAILY_CAPACITY_OPTIONS.map(opt => (
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
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ow-field">
        <label className="ow-label">Crews usually available</label>
        <div className="ow-cards">
          {CREW_COUNT_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-card${answers.crewCount === opt.id ? ' active' : ''}`}
              onClick={() => setAnswer('crewCount', opt.id)}
            >
              <div style={{ fontWeight: 700 }}>{opt.label}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Screen 5: Setup Summary + activation pane ────────────────────────────────
function ScreenSetupSummary({ answers }) {
  const moveLabels = answers.moveTypes
    .map(id => MOVE_TYPE_OPTIONS.find(o => o.id === id)?.label)
    .filter(Boolean)
    .join(', ');
  const channelLabels = answers.alertChannels
    .map(id => ALERT_CHANNELS.find(o => o.id === id)?.label)
    .filter(Boolean)
    .join(' · ') || '—';
  return (
    <>
      <h1 className="ow-h1">Your dispatch setup is ready</h1>
      <p className="ow-sub">Everything's configured. Activate your balance to start unlocking verified move requests.</p>

      <div className="ow-summary-grid">
        <div className="ow-summary-recap">
          <div className="ow-summary-recap-h">Configured</div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Primary market</span>
            <span className="ow-summary-recap-value">{answers.primaryMarket || '—'}</span>
          </div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Coverage</span>
            <span className="ow-summary-recap-value">{COVERAGE_OPTIONS.find(o => o.id === answers.coveragePreference)?.label || '—'}</span>
          </div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Move types</span>
            <span className="ow-summary-recap-value">{moveLabels || '—'}</span>
          </div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Alerts</span>
            <span className="ow-summary-recap-value">{channelLabels}</span>
          </div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Daily capacity</span>
            <span className="ow-summary-recap-value">{answers.dailyRequestCapacity || '—'}</span>
          </div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Crews</span>
            <span className="ow-summary-recap-value">{CREW_COUNT_OPTIONS.find(o => o.id === answers.crewCount)?.label || '—'}</span>
          </div>
        </div>

        <ActivationPanel />
      </div>
    </>
  );
}

// ── Activation panel ──────────────────────────────────────────────────────────
function ActivationPanel() {
  const { API_URL } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);

  async function handleActivate() {
    setLoading(true);
    try {
      // Mark onboarding as complete (idempotent on the server)
      await fetch(`${API_URL}/onboarding/complete`, {
        method: 'POST',
        headers: { 'x-auth-token': localStorage.getItem('token') || '' },
      });
      // Create Stripe checkout session for $100 (will become $150 via bonus)
      const res = await fetch(`${API_URL}/billing/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({ amount: 100 }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert('Could not start checkout. Try again or contact support.');
        setLoading(false);
      }
    } catch (err) {
      console.error('[ActivationPanel] checkout failed', err);
      setLoading(false);
    }
  }

  return (
    <div className="ow-activate">
      <span className="ow-activate-pill">Limited onboarding spots in your area</span>

      <div className="ow-activate-bonus">
        <span className="ow-activate-bonus-currency">$</span>
        <span className="ow-activate-bonus-num">50</span>
        <span className="ow-activate-bonus-tag">FREE</span>
      </div>
      <p className="ow-activate-label">unlock credit on us</p>
      <p className="ow-activate-plus">+ 50% extra buying power on your first $100</p>

      <button type="button" className="ow-activate-cta" onClick={handleActivate} disabled={loading}>
        {loading ? 'Opening checkout…' : 'Activate my $150 balance →'}
      </button>

      <div className="ow-activate-trust">
        <span>Refundable balance</span><span>·</span>
        <span>No subscription</span><span>·</span>
        <span>Credits never expire</span><span>·</span>
        <span>Stripe</span>
      </div>

      <div className="ow-activate-urgency">
        <span className="ow-activate-urgency-dot" />
        <span>Onboarding remains open in your service area for now</span>
      </div>
    </div>
  );
}
