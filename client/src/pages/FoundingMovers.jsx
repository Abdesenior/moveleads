import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './FoundingMovers.css';

// ── API base ─────────────────────────────────────────────────────────────
// Mirror the AuthContext convention so we work the same in dev + prod
// without coupling this public page to the AuthProvider.
const RAW_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE}/api`;

// ── Storage key / TTL ────────────────────────────────────────────────────
const STORAGE_KEY = 'ml_founder_form_v1';
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ── Option catalogues ────────────────────────────────────────────────────
// Centralised so each step renders from a single source of truth.
const MOVE_TYPES = [
  'Local moves (under 50 miles)',
  'Long-distance moves',
  'Same-day / urgent moves',
  'Large house moves',
  'Apartment / small moves',
  'Office / commercial moves',
  'Packing-only / labor-only jobs',
];
const JOB_SIZES = [
  'Studio / 1 bedroom',
  '2 bedroom',
  '3 bedroom',
  '4+ bedroom',
  'Large house moves',
  'Office / commercial',
  'Packing labor only',
];
const VALUE_SIGNALS = [
  'Customer answers the phone',
  'Verified phone number',
  'Verified email',
  'Realistic budget range stated',
  'Confirmed move date',
  'Confirmed inventory / home size',
  'Customer requested a quote in the last 48h',
  'No history of refund disputes',
];
const REQUIRED_CONFIRMATIONS = [
  'Move date',
  'Origin address / ZIP',
  'Destination address / ZIP',
  'Home / inventory size',
  'Budget range',
  'Best time to call',
];
const SHARED_ACCEPTABLE_CONDITIONS = [
  'Capped to 2 movers max',
  'Lower price per request',
  'Customer requested multiple quotes',
  'Refund if first to call books the job',
  'Never — I always prefer exclusive',
];
const SHARED_MAX_MOVERS = [
  '2 movers max',
  '3 movers max',
  '4+ movers',
];
const EXCLUSIVE_TRIGGERS = [
  'Long-distance moves',
  'Large house moves (3+ bedroom)',
  'Office / commercial moves',
  'Same-day / urgent moves',
  'High-value or premium jobs',
  'Any verified phone-confirmed request',
];
const EXCLUSIVE_TRIGGERS_DEPENDS = [
  'Price difference between shared and exclusive',
  'Time of day request comes in',
  'Distance from my main service area',
  'Whether customer has been called recently',
];
const SCENARIOS = [
  {
    id: 'verified_2br_local_shared',
    title: 'Verified 2BR local move — shared with 2 movers',
    desc: 'Phone-confirmed, today, 12 miles away. Sent to you and 1 other mover.',
  },
  {
    id: 'exclusive_4br_long_distance',
    title: 'Exclusive 4BR long-distance move',
    desc: 'Sent only to you. 850 miles, move in 3 weeks.',
  },
  {
    id: 'verified_same_day_local',
    title: 'Verified same-day local urgent move',
    desc: 'Customer needs movers in 4 hours. Phone confirmed. Small apartment.',
  },
  {
    id: 'commercial_office_relocation',
    title: 'Commercial office relocation',
    desc: '15-person office, weekend move, $4-8k range, exclusive.',
  },
];
const OVERPRICED_SIGNALS = [
  'Customer doesn\'t answer the phone',
  'Phone number is a landline / VOIP',
  'Move date is more than 60 days away',
  'Inventory is vague or missing',
  'Same lead was offered as shared yesterday',
  'Distance is well outside my service area',
  'No budget range provided',
  'Customer has requested 5+ quotes already',
];
const BIDDING_TRIGGERS = [
  'Premium / luxury jobs',
  'Long-distance interstate moves',
  'Office / commercial jobs',
  'Slow days when I have crew sitting',
  'Only on exclusive requests',
];
const FRUSTRATIONS = [
  'Bad / fake phone numbers',
  'Sold to too many companies',
  'No refund policy',
  'Old / recycled requests',
  'Prices keep going up',
  'Hard to reach support',
  'Wrong service area',
  'Customer never answers',
  'Pricing isn\'t transparent',
];
const RETENTION_DRIVERS = [
  'Fair pricing',
  'High close rate',
  'Easy refunds for bad requests',
  'Exclusive requests available',
  'Verified phone numbers',
  'Real-time delivery (under 5 min)',
  'Good support team',
  'Transparent rules + pricing',
];

// ── Steps definition ─────────────────────────────────────────────────────
// Each entry is a "key" we use to drive logic in renderStep().
// Sub-steps (e.g. 4a, 4b) live inside the same logical step here as
// branching is straightforward.
const STEPS = [
  'contact',
  'crews',
  'quality',
  'shared_vs_exclusive',
  'scenario',
  'speed_and_pricing',
  'marketplace',
  'experience',
  'retention',
];

const DEFAULT_DATA = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  mainStateOrMarket: '',

  desiredMoveTypes: [],
  preferredJobSizes: [],

  valueSignals: [],
  requiredConfirmations: [],

  sharedExclusivePreference: '',
  sharedAcceptableConditions: [],
  sharedMaxMovers: '',
  exclusiveTriggers: [],
  exclusiveTriggersDepends: [],

  priorityScenario: '',

  speedExpectation: '',
  overpricedSignals: [],

  marketplacePreference: '',
  biddingTriggers: [],

  leadProviderExperience: '',
  leadProviderFrustrations: [],
  platformWish: '',
  paidRequestReason: '',
  trustToTry: '',

  retentionDrivers: [],
  biggestProblem: '',

  source: 'founding-movers',
  utm: { source: '', medium: '', campaign: '', term: '', content: '' },
};

// ── Helpers ─────────────────────────────────────────────────────────────
function toggleInArr(arr, value, max) {
  if (arr.includes(value)) return arr.filter(v => v !== value);
  if (typeof max === 'number' && arr.length >= max) return arr; // ignore beyond cap
  return [...arr, value];
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

// ── Component ───────────────────────────────────────────────────────────
export default function FoundingMovers() {
  const [mode, setMode] = useState('intro');   // 'intro' | 'form' | 'done' | 'already'
  const [stepIdx, setStepIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const startedAtRef = useRef(null);

  const [data, setData] = useState(DEFAULT_DATA);

  // ── Restore from localStorage on mount ────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.savedAt && (Date.now() - parsed.savedAt) < STORAGE_TTL_MS) {
          if (parsed.data) setData(prev => ({ ...prev, ...parsed.data }));
          if (typeof parsed.stepIdx === 'number') setStepIdx(parsed.stepIdx);
          if (parsed.mode === 'form') setMode('form');
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (e) {
      // Corrupted storage — ignore.
    }

    // UTM capture
    try {
      const qs = new URLSearchParams(window.location.search);
      const utm = {
        source:   qs.get('utm_source')   || '',
        medium:   qs.get('utm_medium')   || '',
        campaign: qs.get('utm_campaign') || '',
        term:     qs.get('utm_term')     || '',
        content:  qs.get('utm_content')  || '',
      };
      if (Object.values(utm).some(Boolean)) {
        setData(prev => ({ ...prev, utm: { ...prev.utm, ...utm } }));
      }
    } catch {/* noop */}
  }, []);

  // ── Persist on changes (form mode only) ───────────────────────────────
  useEffect(() => {
    if (mode !== 'form') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        savedAt: Date.now(),
        mode,
        stepIdx,
        data,
      }));
    } catch {/* quota error — ignore */}
  }, [data, stepIdx, mode]);

  // ── Single-value setter, returns a closure ─────────────────────────────
  const setField = useCallback((key, value) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleField = useCallback((key, value, max) => {
    setData(prev => ({ ...prev, [key]: toggleInArr(prev[key] || [], value, max) }));
  }, []);

  // ── Start the form ────────────────────────────────────────────────────
  const startForm = () => {
    startedAtRef.current = Date.now();
    setMode('form');
    setStepIdx(0);
    window.scrollTo(0, 0);
  };

  // ── Progress ──────────────────────────────────────────────────────────
  const progressPct = useMemo(() => {
    return Math.round(((stepIdx + 1) / STEPS.length) * 100);
  }, [stepIdx]);

  // ── Step validity ─────────────────────────────────────────────────────
  const canContinue = useMemo(() => {
    const k = STEPS[stepIdx];
    switch (k) {
      case 'contact':
        return Boolean(data.companyName && isEmail(data.email));
      case 'crews':
        return data.desiredMoveTypes.length > 0;
      case 'quality':
        return data.valueSignals.length > 0;
      case 'shared_vs_exclusive':
        return Boolean(data.sharedExclusivePreference);
      case 'scenario':
        return Boolean(data.priorityScenario);
      case 'speed_and_pricing':
        return Boolean(data.speedExpectation);
      case 'marketplace':
        return Boolean(data.marketplacePreference);
      case 'experience':
        return Boolean(data.leadProviderExperience);
      case 'retention':
        return data.retentionDrivers.length > 0;
      default:
        return true;
    }
  }, [stepIdx, data]);

  // ── Navigation ────────────────────────────────────────────────────────
  const goBack = () => {
    if (stepIdx === 0) {
      setMode('intro');
      return;
    }
    setStepIdx(stepIdx - 1);
    window.scrollTo(0, 0);
  };

  const goNext = async () => {
    if (!canContinue || submitting) return;
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(stepIdx + 1);
      window.scrollTo(0, 0);
      return;
    }
    // Final step — submit
    await submit();
  };

  // ── Submit ────────────────────────────────────────────────────────────
  const submit = async () => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      const completionTimeSeconds = startedAtRef.current
        ? Math.round((Date.now() - startedAtRef.current) / 1000)
        : null;

      const payload = { ...data, completionTimeSeconds };
      const res = await fetch(`${API_URL}/founding-movers/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(body.msg || 'Could not submit. Please try again.');
        setSubmitting(false);
        return;
      }
      try { localStorage.removeItem(STORAGE_KEY); } catch {/* noop */}
      if (body.alreadySubmitted) setMode('already');
      else setMode('done');
    } catch (e) {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render: intro mode ────────────────────────────────────────────────
  if (mode === 'intro') {
    return (
      <div className="fm-root">
        <section className="fm-hero">
          <div className="fm-hero-inner">
            <span className="fm-eyebrow">
              <span className="fm-eyebrow-dot" />
              Founding Mover Program
            </span>
            <h1 className="fm-headline">
              Help us build the moving marketplace <span className="accent">you actually want.</span>
            </h1>
            <p className="fm-subheadline">
              We're hand-picking a small group of moving companies to shape how
              requests are scored, priced, and delivered. In return: early access
              and pricing reserved for founding members only.
            </p>
            <ul className="fm-trust">
              <li><span className="fm-trust-check">+</span> Direct input into how requests are matched and priced</li>
              <li><span className="fm-trust-check">+</span> First access before public launch — locked-in founder rates</li>
              <li><span className="fm-trust-check">+</span> 7 minutes. No sales call. We review every application personally.</li>
            </ul>
            <button type="button" className="fm-cta" onClick={startForm}>
              Start founder form →
            </button>
            <div className="fm-cta-meta">No account required. Your responses stay private.</div>
          </div>
        </section>
      </div>
    );
  }

  // ── Render: done ──────────────────────────────────────────────────────
  if (mode === 'done') {
    return (
      <div className="fm-root">
        <div className="fm-done">
          <div className="fm-done-icon">✓</div>
          <h1>You're in.</h1>
          <p>Thanks for applying to the Founding Mover Program. Here's what happens next:</p>
          <ul>
            <li>We review every application personally — usually within 2 business days.</li>
            <li>If you're a fit, you'll get an email with founder rates and early access.</li>
            <li>Your responses directly shape how we score, price, and deliver requests.</li>
          </ul>
        </div>
      </div>
    );
  }

  // ── Render: already submitted ────────────────────────────────────────
  if (mode === 'already') {
    return (
      <div className="fm-root">
        <div className="fm-done">
          <div className="fm-done-icon">✓</div>
          <h1>You're already on the list.</h1>
          <p>We've got your application on file. Here's what happens next:</p>
          <ul>
            <li>We review every application personally — usually within 2 business days.</li>
            <li>If you're a fit, you'll get an email with founder rates and early access.</li>
            <li>Your responses directly shape how we score, price, and deliver requests.</li>
          </ul>
        </div>
      </div>
    );
  }

  // ── Render: form mode ────────────────────────────────────────────────
  return (
    <div className="fm-root">
      <div className="fm-form-shell">
        <div className="fm-progress" aria-hidden="true">
          <div className="fm-progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="fm-form-inner">
          {renderStep(STEPS[stepIdx], { data, setField, toggleField })}
          {errorMsg && (
            <div style={{
              marginTop: 18, padding: 12, borderRadius: 10,
              background: '#fef2f2', color: '#991b1b',
              border: '1px solid #fecaca', fontSize: 14,
            }}>{errorMsg}</div>
          )}
        </div>
        <div className="fm-footer">
          <div className="fm-footer-inner">
            <button type="button" className="fm-back" onClick={goBack}>← Back</button>
            <button
              type="button"
              className="fm-continue"
              onClick={goNext}
              disabled={!canContinue || submitting}
            >
              {stepIdx === STEPS.length - 1
                ? (submitting ? 'Sending…' : 'Submit application →')
                : 'Continue →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step rendering ──────────────────────────────────────────────────────
function renderStep(key, ctx) {
  switch (key) {
    case 'contact':              return <StepContact {...ctx} />;
    case 'crews':                return <StepCrews {...ctx} />;
    case 'quality':              return <StepQuality {...ctx} />;
    case 'shared_vs_exclusive':  return <StepSharedExclusive {...ctx} />;
    case 'scenario':             return <StepScenario {...ctx} />;
    case 'speed_and_pricing':    return <StepSpeedPricing {...ctx} />;
    case 'marketplace':          return <StepMarketplace {...ctx} />;
    case 'experience':           return <StepExperience {...ctx} />;
    case 'retention':            return <StepRetention {...ctx} />;
    default: return null;
  }
}

// ── Reusable choice tile ────────────────────────────────────────────────
function ChoiceTile({ selected, disabled, onClick, title, desc }) {
  return (
    <button
      type="button"
      className={`fm-choice${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      aria-pressed={selected}
    >
      <span className="fm-choice-check">✓</span>
      <span className="fm-choice-body">
        <span className="fm-choice-title">{title}</span>
        {desc && <span className="fm-choice-desc">{desc}</span>}
      </span>
    </button>
  );
}

function MultiChoiceGroup({ options, selected, onToggle, max }) {
  return (
    <div className="fm-choices">
      {options.map(opt => {
        const isSelected = selected.includes(opt);
        const capReached = typeof max === 'number' && selected.length >= max && !isSelected;
        return (
          <ChoiceTile
            key={opt}
            title={opt}
            selected={isSelected}
            disabled={capReached}
            onClick={() => onToggle(opt)}
          />
        );
      })}
    </div>
  );
}

function SingleChoiceGroup({ options, selected, onSelect }) {
  return (
    <div className="fm-choices">
      {options.map(opt => (
        <ChoiceTile
          key={opt.value || opt}
          title={opt.title || opt}
          desc={opt.desc}
          selected={selected === (opt.value || opt)}
          onClick={() => onSelect(opt.value || opt)}
        />
      ))}
    </div>
  );
}

// ── Step 1: contact ─────────────────────────────────────────────────────
function StepContact({ data, setField }) {
  return (
    <div>
      <h2 className="fm-step-title">First, a quick intro</h2>
      <p className="fm-step-sub">Tell us about your moving company. This is how we'll reach you about founder access.</p>

      <label className="fm-field-label">Company name *</label>
      <input className="fm-input" value={data.companyName}
             onChange={e => setField('companyName', e.target.value)}
             placeholder="Acme Moving Co." />

      <label className="fm-field-label">Your name</label>
      <input className="fm-input" value={data.contactName}
             onChange={e => setField('contactName', e.target.value)}
             placeholder="Full name" />

      <label className="fm-field-label">Best email *</label>
      <input className="fm-input" type="email" value={data.email}
             onChange={e => setField('email', e.target.value)}
             placeholder="you@company.com" />

      <label className="fm-field-label">Phone</label>
      <input className="fm-input" type="tel" value={data.phone}
             onChange={e => setField('phone', e.target.value)}
             placeholder="(555) 123-4567" />

      <label className="fm-field-label">Main state or market</label>
      <input className="fm-input" value={data.mainStateOrMarket}
             onChange={e => setField('mainStateOrMarket', e.target.value)}
             placeholder="e.g. Florida, Dallas TX" />
    </div>
  );
}

// ── Step 2: crews + move types ─────────────────────────────────────────
function StepCrews({ data, toggleField }) {
  return (
    <div>
      <h2 className="fm-step-title">What kind of moves do you want?</h2>
      <p className="fm-step-sub">Pick up to 3 move types you'd most like to receive. We'll use this to filter what reaches you.</p>

      <label className="fm-field-label">Desired move types (max 3)</label>
      <MultiChoiceGroup options={MOVE_TYPES} selected={data.desiredMoveTypes}
                        onToggle={v => toggleField('desiredMoveTypes', v, 3)} max={3} />

      <label className="fm-field-label" style={{ marginTop: 28 }}>Preferred job sizes</label>
      <MultiChoiceGroup options={JOB_SIZES} selected={data.preferredJobSizes}
                        onToggle={v => toggleField('preferredJobSizes', v)} />
    </div>
  );
}

// ── Step 3: request quality ────────────────────────────────────────────
function StepQuality({ data, toggleField }) {
  return (
    <div>
      <h2 className="fm-step-title">What makes a request worth paying for?</h2>
      <p className="fm-step-sub">The signals that, when present, would make you confident enough to pay full price for a request.</p>

      <label className="fm-field-label">Value signals</label>
      <MultiChoiceGroup options={VALUE_SIGNALS} selected={data.valueSignals}
                        onToggle={v => toggleField('valueSignals', v)} />

      <label className="fm-field-label" style={{ marginTop: 28 }}>What MUST be confirmed before delivery?</label>
      <MultiChoiceGroup options={REQUIRED_CONFIRMATIONS} selected={data.requiredConfirmations}
                        onToggle={v => toggleField('requiredConfirmations', v)} />
    </div>
  );
}

// ── Step 4: shared vs exclusive ────────────────────────────────────────
function StepSharedExclusive({ data, setField, toggleField }) {
  const pref = data.sharedExclusivePreference;
  return (
    <div>
      <h2 className="fm-step-title">Shared or exclusive — what do you prefer?</h2>
      <p className="fm-step-sub">Same request sent to a few movers vs. sent only to you. Pick the model you'd buy more of.</p>

      <SingleChoiceGroup
        options={[
          { value: 'shared',    title: 'Mostly shared',    desc: 'Lower cost. I\'m fine competing with 1-2 others.' },
          { value: 'exclusive', title: 'Mostly exclusive', desc: 'Only sent to me. Higher cost, higher close rate.' },
          { value: 'depends',   title: 'It depends',       desc: 'Depends on the move type, size, or price.' },
        ]}
        selected={pref}
        onSelect={v => setField('sharedExclusivePreference', v)}
      />

      {pref === 'shared' && (
        <>
          <label className="fm-field-label" style={{ marginTop: 28 }}>What conditions make shared acceptable?</label>
          <MultiChoiceGroup options={SHARED_ACCEPTABLE_CONDITIONS}
                            selected={data.sharedAcceptableConditions}
                            onToggle={v => toggleField('sharedAcceptableConditions', v)} />

          <label className="fm-field-label" style={{ marginTop: 28 }}>Max movers per shared request</label>
          <SingleChoiceGroup options={SHARED_MAX_MOVERS}
                             selected={data.sharedMaxMovers}
                             onSelect={v => setField('sharedMaxMovers', v)} />
        </>
      )}

      {pref === 'exclusive' && (
        <>
          <label className="fm-field-label" style={{ marginTop: 28 }}>Which requests should be exclusive?</label>
          <MultiChoiceGroup options={EXCLUSIVE_TRIGGERS}
                            selected={data.exclusiveTriggers}
                            onToggle={v => toggleField('exclusiveTriggers', v)} />
        </>
      )}

      {pref === 'depends' && (
        <>
          <label className="fm-field-label" style={{ marginTop: 28 }}>What does it depend on?</label>
          <MultiChoiceGroup options={EXCLUSIVE_TRIGGERS_DEPENDS}
                            selected={data.exclusiveTriggersDepends}
                            onToggle={v => toggleField('exclusiveTriggersDepends', v)} />
        </>
      )}
    </div>
  );
}

// ── Step 5: scenario card ──────────────────────────────────────────────
function StepScenario({ data, setField }) {
  return (
    <div>
      <h2 className="fm-step-title">Which of these would you buy first?</h2>
      <p className="fm-step-sub">If all four landed in your inbox at the same price, which is the one you'd take?</p>

      <div className="fm-scenarios">
        {SCENARIOS.map(s => (
          <button
            key={s.id}
            type="button"
            className={`fm-scenario${data.priorityScenario === s.id ? ' selected' : ''}`}
            onClick={() => setField('priorityScenario', s.id)}
            aria-pressed={data.priorityScenario === s.id}
          >
            <span className="fm-scenario-title">{s.title}</span>
            <span className="fm-scenario-desc">{s.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 6: speed + overpriced signals ─────────────────────────────────
function StepSpeedPricing({ data, setField, toggleField }) {
  return (
    <div>
      <h2 className="fm-step-title">Speed and pricing</h2>
      <p className="fm-step-sub">How fast you need requests, and what would make a request feel overpriced to you.</p>

      <label className="fm-field-label">How fast should a fresh request reach you?</label>
      <SingleChoiceGroup
        options={[
          { value: '5min',    title: 'Under 5 minutes',  desc: 'I want it while the customer is still warm.' },
          { value: '15min',   title: 'Within 15 minutes' },
          { value: '1hour',   title: 'Within an hour' },
          { value: 'sameday', title: 'Same day is fine' },
        ]}
        selected={data.speedExpectation}
        onSelect={v => setField('speedExpectation', v)}
      />

      <label className="fm-field-label" style={{ marginTop: 28 }}>What would make a request feel overpriced?</label>
      <MultiChoiceGroup options={OVERPRICED_SIGNALS} selected={data.overpricedSignals}
                        onToggle={v => toggleField('overpricedSignals', v)} />
    </div>
  );
}

// ── Step 7: marketplace model ──────────────────────────────────────────
function StepMarketplace({ data, setField, toggleField }) {
  const pref = data.marketplacePreference;
  return (
    <div>
      <h2 className="fm-step-title">Pick your marketplace model</h2>
      <p className="fm-step-sub">How should requests be priced and matched on the marketplace?</p>

      <SingleChoiceGroup
        options={[
          { value: 'mostly_exclusive', title: 'Mostly exclusive',       desc: 'Premium price, sent only to me.' },
          { value: 'mostly_shared',    title: 'Mostly shared',          desc: 'Lower price, I compete with 1-2 others.' },
          { value: 'mixed',            title: 'Mix of both',            desc: 'Depends on the move.' },
          { value: 'bidding',          title: 'Let me bid on requests', desc: 'I want to set my own price per job.' },
        ]}
        selected={pref}
        onSelect={v => setField('marketplacePreference', v)}
      />

      {pref === 'bidding' && (
        <>
          <label className="fm-field-label" style={{ marginTop: 28 }}>When does bidding make sense?</label>
          <MultiChoiceGroup options={BIDDING_TRIGGERS}
                            selected={data.biddingTriggers}
                            onToggle={v => toggleField('biddingTriggers', v)} />
        </>
      )}
    </div>
  );
}

// ── Step 8: experience ─────────────────────────────────────────────────
function StepExperience({ data, setField, toggleField }) {
  const exp = data.leadProviderExperience;
  return (
    <div>
      <h2 className="fm-step-title">Have you used a request provider before?</h2>
      <p className="fm-step-sub">Even rough experience helps us build something better than what's out there.</p>

      <SingleChoiceGroup
        options={[
          { value: 'regularly',    title: 'Yes — regularly' },
          { value: 'occasionally', title: 'Yes — occasionally' },
          { value: 'interested',   title: 'No — but interested' },
          { value: 'no',           title: 'No — not interested in paid requests' },
        ]}
        selected={exp}
        onSelect={v => setField('leadProviderExperience', v)}
      />

      {(exp === 'regularly' || exp === 'occasionally') && (
        <>
          <label className="fm-field-label" style={{ marginTop: 28 }}>Biggest frustrations with current providers</label>
          <MultiChoiceGroup options={FRUSTRATIONS}
                            selected={data.leadProviderFrustrations}
                            onToggle={v => toggleField('leadProviderFrustrations', v)} />

          <label className="fm-field-label" style={{ marginTop: 28 }}>If you could fix one thing about every provider you've used, what would it be?</label>
          <textarea className="fm-textarea" value={data.platformWish}
                    onChange={e => setField('platformWish', e.target.value)}
                    placeholder="Write your honest answer here..." />

          <label className="fm-field-label" style={{ marginTop: 16 }}>What's the #1 thing that would make a paid request worth it to you?</label>
          <textarea className="fm-textarea" value={data.paidRequestReason}
                    onChange={e => setField('paidRequestReason', e.target.value)}
                    placeholder="The signal or feature that changes everything..." />
        </>
      )}

      {(exp === 'interested' || exp === 'no') && (
        <>
          <label className="fm-field-label" style={{ marginTop: 28 }}>What would it take for you to try a paid-request platform?</label>
          <textarea className="fm-textarea" value={data.trustToTry}
                    onChange={e => setField('trustToTry', e.target.value)}
                    placeholder="What proof / guarantee / pricing would get you in?" />
        </>
      )}
    </div>
  );
}

// ── Step 9: retention ──────────────────────────────────────────────────
function StepRetention({ data, setField, toggleField }) {
  return (
    <div>
      <h2 className="fm-step-title">Last question — what keeps you on a platform?</h2>
      <p className="fm-step-sub">Pick the 3 things that matter most. And tell us the single biggest problem in your business right now.</p>

      <label className="fm-field-label">Top retention drivers (pick up to 3)</label>
      <MultiChoiceGroup options={RETENTION_DRIVERS}
                        selected={data.retentionDrivers}
                        onToggle={v => toggleField('retentionDrivers', v, 3)} max={3} />

      <label className="fm-field-label" style={{ marginTop: 28 }}>What's the single biggest problem in your moving business right now?</label>
      <textarea className="fm-textarea" value={data.biggestProblem}
                onChange={e => setField('biggestProblem', e.target.value)}
                placeholder="Be specific — this directly shapes what we build first." />
    </div>
  );
}
