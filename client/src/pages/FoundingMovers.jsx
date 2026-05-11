import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './FoundingMovers.css';

// ── API base ─────────────────────────────────────────────────────────────
const RAW_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE}/api`;

// ── Storage key / TTL ────────────────────────────────────────────────────
const STORAGE_KEY = 'ml_founder_v2';
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ── Option catalogues ───────────────────────────────────────────────────
const MOVE_TYPES = [
  'Local residential moves',
  'Long-distance moves',
  'Office / commercial moves',
  'Same-day / urgent moves',
];
const JOB_SIZES = [
  'Studio / 1-bedroom',
  '2-bedroom',
  '3-bedroom',
  '4+ bedroom',
  'Office / commercial',
  'Specialty-item moves',
];
const VALUE_SIGNALS = [
  'Customer answers the phone',
  'Move date is close',
  'Inventory is explained properly',
  'Customer sounds serious about moving',
  'Request reaches us quickly',
  'Exclusive access to the request',
];
const REQUIRED_CONFIRMATIONS = [
  'Pickup location',
  'Delivery location',
  'Move date',
  'Move size',
  'Inventory / heavy items',
  'Customer availability',
  'Whether the customer is ready to move forward',
];
const SHARED_ACCEPTABLE_CONDITIONS = [
  'If only a few movers receive the request',
  'If the request cost is lower',
  'If the customer is verified',
  'If it\'s a long-distance move',
];
const SHARED_MAX_MOVERS = ['2 movers max', '3 movers max', '4+ movers'];
const EXCLUSIVE_TRIGGERS = [
  'Long-distance moves',
  'Commercial jobs',
  'High-intent customers',
];
const EXCLUSIVE_TRIGGERS_DEPENDS = [
  'Long-distance moves',
  'Commercial jobs',
  'High-intent customers',
];
const SCENARIOS = [
  {
    id: 'exclusive_4br_long_distance',
    label: 'Exclusive 4-bedroom long-distance move',
    details: [
      'Houston → Denver, customer ready within 7 days',
      'Yours alone — no other movers see it',
      'Verified, high-intent',
    ],
  },
  {
    id: 'verified_same_day_local',
    label: 'Verified same-day local move',
    details: [
      'Customer needs trucks today',
      'Phone-verified, ready to book',
      'Shared with one other crew',
    ],
  },
  {
    id: 'commercial_office_relocation',
    label: 'Commercial office relocation',
    details: [
      'Mid-size office, weekend timeline',
      'Decision-maker already on the call',
      'Exclusive request',
    ],
  },
];
const SPEED_OPTIONS = [
  { value: '5min',    label: 'First 5 minutes' },
  { value: '15min',   label: 'First 15 minutes' },
  { value: '1hour',   label: 'First hour' },
  { value: 'sameday', label: 'Same day is fine' },
];
const OVERPRICED_SIGNALS = [
  'Customer doesn\'t answer',
  'Too many movers received it',
  'Move details are incomplete',
  'Customer is not ready to move',
  'Wrong service area',
  'Request delivered too slowly',
];
const BIDDING_TRIGGERS = [
  'Long-distance moves',
  'Large house moves',
  'Commercial jobs',
  'Same-day / urgent moves',
  'Verified high-intent customers',
  'Specialty-item moves',
];
const FRUSTRATIONS = [
  'Requests sent to too many movers',
  'Fake or unreachable customers',
  'Wrong move details',
  'Low-quality requests',
  'Requests delivered too slowly',
  'Paying too much for small jobs',
];
const RETENTION_DRIVERS = [
  'Customers answer the phone',
  'Accurate move details',
  'Fair pricing',
  'Requests are not overshared',
  'Fast delivery',
  'Better request matching',
];

// ── Step descriptors ────────────────────────────────────────────────────
const STEPS = [
  { id: 'intro', type: 'intro', nextStep: 'moveTypes' },

  { id: 'moveTypes', type: 'multi', field: 'desiredMoveTypes',
    question: 'What jobs do your crews run most?',
    helper: 'Pick up to 3 — the type of work you actually want more of.',
    options: MOVE_TYPES, max: 3,
    nextStep: 'jobSizes' },

  { id: 'jobSizes', type: 'multi', field: 'preferredJobSizes',
    question: 'What size jobs fit your crews?',
    helper: 'The jobs you can handle without thinking twice.',
    options: JOB_SIZES, nextStep: 'valueSignals' },

  { id: 'valueSignals', type: 'multi', field: 'valueSignals',
    question: 'What makes your dispatch team jump on a request immediately?',
    helper: 'Pick what actually moves the needle for your crews.',
    options: VALUE_SIGNALS, nextStep: 'confirmations' },

  { id: 'confirmations', type: 'multi', field: 'requiredConfirmations',
    question: 'What should already be locked in before a request hits your team?',
    helper: 'The basics that save dispatch from chasing the customer.',
    options: REQUIRED_CONFIRMATIONS, nextStep: 'sharedOrExclusive' },

  { id: 'sharedOrExclusive', type: 'single', field: 'sharedExclusivePreference',
    question: 'Shared or exclusive — how does your company prefer to buy?',
    helper: 'No wrong answer. We\'re figuring out the right balance.',
    options: [
      { value: 'shared',    label: 'Lower-cost shared requests' },
      { value: 'exclusive', label: 'Higher-cost exclusive requests' },
      { value: 'depends',   label: 'Depends on the move' },
    ],
    nextStep: (a) => {
      if (a.sharedExclusivePreference === 'shared')    return 'sharedConditions';
      if (a.sharedExclusivePreference === 'exclusive') return 'exclusiveTriggers';
      return 'dependsTriggers';
    } },

  { id: 'sharedConditions', type: 'multi', field: 'sharedAcceptableConditions',
    question: 'When is sharing OK?',
    helper: 'Pick everything that fits how your team thinks about it.',
    options: SHARED_ACCEPTABLE_CONDITIONS, nextStep: 'sharedMaxMovers' },

  { id: 'sharedMaxMovers', type: 'single', field: 'sharedMaxMovers',
    question: 'How many movers max should see the same request?',
    options: SHARED_MAX_MOVERS.map(v => ({ value: v, label: v })),
    nextStep: 'priorityScenario' },

  { id: 'exclusiveTriggers', type: 'multi', field: 'exclusiveTriggers',
    question: 'Which requests are worth paying more to get exclusively?',
    options: EXCLUSIVE_TRIGGERS, nextStep: 'priorityScenario' },

  { id: 'dependsTriggers', type: 'multi', field: 'exclusiveTriggersDepends',
    question: 'Which requests should always stay exclusive?',
    options: EXCLUSIVE_TRIGGERS_DEPENDS, nextStep: 'priorityScenario' },

  { id: 'priorityScenario', type: 'cards', field: 'priorityScenario',
    question: 'Which request would your dispatch grab first?',
    helper: 'Pretend all three landed in your inbox right now.',
    options: SCENARIOS, nextStep: 'speedExpectation' },

  { id: 'speedExpectation', type: 'single', field: 'speedExpectation',
    question: 'How fast does your team need to hit a fresh request?',
    helper: 'After the customer submits — when does it matter most?',
    options: SPEED_OPTIONS, nextStep: 'overpricedSignals' },

  { id: 'overpricedSignals', type: 'multi', field: 'overpricedSignals',
    question: 'What makes a request feel like a waste of credits?',
    helper: 'Pick what kills the deal for your crews.',
    options: OVERPRICED_SIGNALS, nextStep: 'marketplacePref' },

  { id: 'marketplacePref', type: 'single', field: 'marketplacePreference',
    question: 'How would you want premium requests handled?',
    helper: 'What feels fair and profitable for your operation?',
    options: [
      { value: 'mostly_exclusive', label: 'Mostly exclusive requests' },
      { value: 'mostly_shared',    label: 'Mostly shared requests' },
      { value: 'mixed',            label: 'Mix of both depending on the move' },
      { value: 'bidding',          label: 'Bidding for premium requests' },
    ],
    nextStep: (a) => a.marketplacePreference === 'bidding' ? 'biddingTriggers' : 'brokerExperience' },

  { id: 'biddingTriggers', type: 'multi', field: 'biddingTriggers',
    question: 'Which requests would your team actually fight for?',
    helper: 'Where competing makes sense.',
    options: BIDDING_TRIGGERS, nextStep: 'brokerExperience' },

  { id: 'brokerExperience', type: 'single', field: 'leadProviderExperience',
    question: 'Have you bought leads or worked with a broker before?',
    helper: 'Honest is best — we won\'t sell you anything based on this.',
    options: [
      { value: 'regularly',    label: 'Yes, regularly' },
      { value: 'occasionally', label: 'Yes, occasionally' },
      { value: 'interested',   label: 'No, but we\'re interested' },
      { value: 'no',           label: 'No' },
    ],
    nextStep: (a) => {
      const v = a.leadProviderExperience;
      if (v === 'regularly' || v === 'occasionally') return 'brokerFrustrations';
      return 'retentionDrivers';
    } },

  { id: 'brokerFrustrations', type: 'multi', field: 'leadProviderFrustrations',
    question: 'Where do lead providers usually let movers down?',
    helper: 'Pick everything you\'ve actually run into.',
    options: FRUSTRATIONS, nextStep: 'platformWish' },

  { id: 'platformWish', type: 'textarea', field: 'platformWish',
    question: 'If you could fix one thing about lead providers, what would it be?',
    helper: 'Optional — every answer here shapes how we route requests.',
    placeholder: 'Share anything that comes to mind…',
    optional: true, nextStep: 'retentionDrivers' },

  { id: 'retentionDrivers', type: 'multi', field: 'retentionDrivers',
    question: 'What would keep your company buying from us long-term?',
    helper: 'Pick up to 3 — the things that actually keep movers loyal.',
    options: RETENTION_DRIVERS, max: 3,
    nextStep: 'biggestProblem' },

  { id: 'biggestProblem', type: 'textarea', field: 'biggestProblem',
    question: 'What\'s the biggest headache your crews face with move requests today?',
    helper: 'Optional — be as honest as you\'d like.',
    placeholder: 'Share anything that comes to mind…',
    optional: true, nextStep: 'contact' },

  { id: 'contact', type: 'contact', nextStep: 'done' },

  { id: 'done', type: 'done' },
];

const STEP_BY_ID = STEPS.reduce((acc, s) => { acc[s.id] = s; return acc; }, {});

// ── Default answers (full schema-compatible shape) ──────────────────────
const DEFAULT_ANSWERS = {
  firstName: '',
  companyName: '',
  mainStateOrMarket: '',
  email: '',
  phone: '',

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

  retentionDrivers: [],
  biggestProblem: '',

  utm: { source: '', medium: '', campaign: '', term: '', content: '' },
};

// ── Helpers ─────────────────────────────────────────────────────────────
function toggleInArr(arr, value, max) {
  if (arr.includes(value)) return arr.filter(v => v !== value);
  if (typeof max === 'number' && arr.length >= max) return arr;
  return [...arr, value];
}
function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

// Estimate total steps based on current branch for smooth progress bar
function estimateTotal(answers) {
  let total = 1; // intro
  total += 4;    // moveTypes, jobSizes, valueSignals, confirmations
  total += 1;    // sharedOrExclusive
  if (answers.sharedExclusivePreference === 'shared') total += 2;
  else total += 1;
  total += 1;    // priorityScenario
  total += 1;    // speedExpectation
  total += 1;    // overpricedSignals
  total += 1;    // marketplacePref
  if (answers.marketplacePreference === 'bidding') total += 1;
  total += 1;    // brokerExperience
  if (answers.leadProviderExperience === 'regularly' ||
      answers.leadProviderExperience === 'occasionally') total += 2;
  total += 1;    // retentionDrivers
  total += 1;    // biggestProblem
  total += 1;    // contact
  return total;
}

// ── Component ───────────────────────────────────────────────────────────
export default function FoundingMovers() {
  const [stepId, setStepId] = useState('intro');
  const [stepHistory, setStepHistory] = useState([]);
  const [answers, setAnswers] = useState(DEFAULT_ANSWERS);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const startedAtRef = useRef(null);
  const restoredRef = useRef(false);

  // ── Restore from localStorage + UTM capture ───────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.savedAt && (Date.now() - parsed.savedAt) < STORAGE_TTL_MS) {
          if (parsed.answers) setAnswers(prev => ({ ...prev, ...parsed.answers }));
          if (parsed.stepId && STEP_BY_ID[parsed.stepId]) setStepId(parsed.stepId);
          if (Array.isArray(parsed.stepHistory)) setStepHistory(parsed.stepHistory);
          if (parsed.startedAt) startedAtRef.current = parsed.startedAt;
          restoredRef.current = true;
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {/* corrupted — ignore */}

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
        setAnswers(prev => ({ ...prev, utm: { ...prev.utm, ...utm } }));
      }
    } catch {/* noop */}
  }, []);

  // Persist on changes (skip done state — that should clear)
  useEffect(() => {
    if (stepId === 'done') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        savedAt: Date.now(),
        startedAt: startedAtRef.current,
        stepId, stepHistory, answers,
      }));
    } catch {/* quota — ignore */}
  }, [stepId, stepHistory, answers]);

  // Lazy-set startedAt the first time the user leaves intro
  useEffect(() => {
    if (!startedAtRef.current && stepId !== 'intro' && stepId !== 'done') {
      startedAtRef.current = Date.now();
    }
  }, [stepId]);

  // Scroll to top on step change
  useEffect(() => { window.scrollTo(0, 0); }, [stepId]);

  // ── Setters ───────────────────────────────────────────────────────────
  const setField = useCallback((field, value) => {
    setAnswers(prev => ({ ...prev, [field]: value }));
  }, []);
  const toggleField = useCallback((field, value, max) => {
    setAnswers(prev => ({ ...prev, [field]: toggleInArr(prev[field] || [], value, max) }));
  }, []);

  // ── Navigation ────────────────────────────────────────────────────────
  const advance = useCallback(() => {
    const step = STEP_BY_ID[stepId];
    if (!step) return;
    const next = typeof step.nextStep === 'function' ? step.nextStep(answers) : step.nextStep;
    if (!next) return;
    setStepHistory(h => [...h, stepId]);
    setStepId(next);
  }, [stepId, answers]);

  const goBack = useCallback(() => {
    setStepHistory(h => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setStepId(prev);
      return h.slice(0, -1);
    });
  }, []);

  // ── Validation per step ───────────────────────────────────────────────
  const canContinue = useMemo(() => {
    const step = STEP_BY_ID[stepId];
    if (!step) return false;
    switch (step.type) {
      case 'intro':
        return Boolean(
          answers.firstName.trim() &&
          answers.companyName.trim() &&
          answers.mainStateOrMarket.trim()
        );
      case 'multi':
        return (answers[step.field] || []).length > 0;
      case 'single':
        return Boolean(answers[step.field]);
      case 'cards':
        return Boolean(answers[step.field]);
      case 'textarea':
        return true; // optional — skip-or-continue
      case 'contact':
        return Boolean(isEmail(answers.email) && answers.phone.trim());
      default:
        return true;
    }
  }, [stepId, answers]);

  // ── Progress (smooth) ─────────────────────────────────────────────────
  const progressPct = useMemo(() => {
    if (stepId === 'done') return 100;
    const total = estimateTotal(answers);
    const idx = stepHistory.length; // current step is idx-th in path
    const pct = Math.round(((idx + 1) / total) * 100);
    return Math.min(Math.max(pct, 3), 100);
  }, [stepId, stepHistory, answers]);

  // ── Submit ────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const completionTimeSeconds = startedAtRef.current
        ? Math.round((Date.now() - startedAtRef.current) / 1000)
        : null;

      const payload = {
        companyName: answers.companyName,
        contactName: answers.firstName,
        email: answers.email,
        phone: answers.phone,
        mainStateOrMarket: answers.mainStateOrMarket,

        desiredMoveTypes: answers.desiredMoveTypes,
        preferredJobSizes: answers.preferredJobSizes,
        valueSignals: answers.valueSignals,
        requiredConfirmations: answers.requiredConfirmations,

        sharedExclusivePreference: answers.sharedExclusivePreference,
        sharedAcceptableConditions: answers.sharedAcceptableConditions,
        sharedMaxMovers: answers.sharedMaxMovers,
        exclusiveTriggers: answers.exclusiveTriggers,
        exclusiveTriggersDepends: answers.exclusiveTriggersDepends,

        priorityScenario: answers.priorityScenario,

        speedExpectation: answers.speedExpectation,
        overpricedSignals: answers.overpricedSignals,

        marketplacePreference: answers.marketplacePreference,
        biddingTriggers: answers.biddingTriggers,

        leadProviderExperience: answers.leadProviderExperience,
        leadProviderFrustrations: answers.leadProviderFrustrations,
        platformWish: answers.platformWish,

        retentionDrivers: answers.retentionDrivers,
        biggestProblem: answers.biggestProblem,

        utm: answers.utm,
        completionTimeSeconds,
        source: 'founding-movers-v2',
      };

      const res = await fetch(`${API_URL}/founding-movers/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && !body.alreadySubmitted) {
        setErrorMsg(body.msg || 'Could not submit. Please try again.');
        setSubmitting(false);
        return;
      }
      try { localStorage.removeItem(STORAGE_KEY); } catch {/* noop */}
      setStepHistory(h => [...h, stepId]);
      setStepId('done');
    } catch (e) {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [answers, stepId, submitting]);

  // ── Render ────────────────────────────────────────────────────────────
  const step = STEP_BY_ID[stepId];
  const showBack = stepId !== 'intro' && stepId !== 'done' && stepHistory.length > 0;

  return (
    <div className="fm-root">
      {stepId !== 'done' && (
        <div className="fm-progress" aria-hidden="true">
          <div className="fm-progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {showBack && (
        <button type="button" className="fm-back" onClick={goBack} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      <div className="fm-step" key={stepId}>
        <div className="fm-step-inner">
          <StepRenderer
            step={step}
            answers={answers}
            setField={setField}
            toggleField={toggleField}
            onAdvance={advance}
            onSubmit={submit}
            submitting={submitting}
            errorMsg={errorMsg}
            canContinue={canContinue}
          />
        </div>
      </div>
    </div>
  );
}

// ── Step renderer dispatcher ────────────────────────────────────────────
function StepRenderer(props) {
  const { step } = props;
  if (!step) return null;
  switch (step.type) {
    case 'intro':    return <IntroStep {...props} />;
    case 'multi':    return <MultiStep {...props} />;
    case 'single':   return <SingleStep {...props} />;
    case 'cards':    return <CardsStep {...props} />;
    case 'textarea': return <TextareaStep {...props} />;
    case 'contact':  return <ContactStep {...props} />;
    case 'done':     return <DoneStep {...props} />;
    default:         return null;
  }
}

// ── Continue button (shared) ────────────────────────────────────────────
function ContinueBar({ disabled, onClick, label = 'Continue', secondary }) {
  return (
    <div className="fm-actions">
      {secondary}
      <button
        type="button"
        className="fm-continue"
        onClick={onClick}
        disabled={disabled}
      >
        {label} →
      </button>
    </div>
  );
}

// ── Step: intro (3 stacked fields) ──────────────────────────────────────
function IntroStep({ answers, setField, onAdvance, canContinue }) {
  return (
    <>
      <h1 className="fm-question">First, who are we talking to?</h1>
      <p className="fm-helper">Three quick fields and we'll get straight to the questions.</p>

      <div className="fm-stack">
        <input
          className="fm-input"
          type="text"
          value={answers.firstName}
          onChange={e => setField('firstName', e.target.value)}
          placeholder="First name"
          autoComplete="given-name"
        />
        <input
          className="fm-input"
          type="text"
          value={answers.companyName}
          onChange={e => setField('companyName', e.target.value)}
          placeholder="Company name"
          autoComplete="organization"
        />
        <input
          className="fm-input"
          type="text"
          value={answers.mainStateOrMarket}
          onChange={e => setField('mainStateOrMarket', e.target.value)}
          placeholder="Main state (e.g., Texas)"
        />
      </div>

      <ContinueBar disabled={!canContinue} onClick={onAdvance} />
    </>
  );
}

// ── Step: multi-select ──────────────────────────────────────────────────
function MultiStep({ step, answers, toggleField, onAdvance, canContinue }) {
  const selected = answers[step.field] || [];
  return (
    <>
      <h1 className="fm-question">{step.question}</h1>
      {step.helper && <p className="fm-helper">{step.helper}</p>}

      <div className="fm-choices">
        {step.options.map(opt => {
          const isSelected = selected.includes(opt);
          const capReached = typeof step.max === 'number' && selected.length >= step.max && !isSelected;
          return (
            <button
              key={opt}
              type="button"
              className={`fm-choice${isSelected ? ' selected' : ''}${capReached ? ' disabled' : ''}`}
              onClick={capReached ? undefined : () => toggleField(step.field, opt, step.max)}
              aria-pressed={isSelected}
              disabled={capReached}
            >
              <span className="fm-choice-label">{opt}</span>
              <span className="fm-choice-check">{isSelected ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>

      <ContinueBar disabled={!canContinue} onClick={onAdvance} />
    </>
  );
}

// ── Step: single-select ─────────────────────────────────────────────────
function SingleStep({ step, answers, setField, onAdvance, canContinue }) {
  const value = answers[step.field];
  return (
    <>
      <h1 className="fm-question">{step.question}</h1>
      {step.helper && <p className="fm-helper">{step.helper}</p>}

      <div className="fm-choices">
        {step.options.map(opt => {
          const v = opt.value;
          const label = opt.label;
          const isSelected = value === v;
          return (
            <button
              key={v}
              type="button"
              className={`fm-choice${isSelected ? ' selected' : ''}`}
              onClick={() => setField(step.field, v)}
              aria-pressed={isSelected}
            >
              <span className="fm-choice-label">{label}</span>
              <span className="fm-choice-check">{isSelected ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>

      <ContinueBar disabled={!canContinue} onClick={onAdvance} />
    </>
  );
}

// ── Step: cards (priority scenario) ─────────────────────────────────────
function CardsStep({ step, answers, setField, onAdvance, canContinue }) {
  const value = answers[step.field];
  return (
    <>
      <h1 className="fm-question">{step.question}</h1>
      {step.helper && <p className="fm-helper">{step.helper}</p>}

      <div className="fm-cards">
        {step.options.map(opt => {
          const isSelected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={`fm-card${isSelected ? ' selected' : ''}`}
              onClick={() => setField(step.field, opt.id)}
              aria-pressed={isSelected}
            >
              <div className="fm-card-head">
                <span className="fm-card-title">{opt.label}</span>
                <span className="fm-choice-check">{isSelected ? '✓' : ''}</span>
              </div>
              {opt.details && (
                <ul className="fm-card-bullets">
                  {opt.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      <ContinueBar disabled={!canContinue} onClick={onAdvance} />
    </>
  );
}

// ── Step: textarea (optional, with Skip) ────────────────────────────────
function TextareaStep({ step, answers, setField, onAdvance }) {
  const v = answers[step.field] || '';
  const skip = () => {
    setField(step.field, '');
    onAdvance();
  };
  return (
    <>
      <h1 className="fm-question">{step.question}</h1>
      {step.helper && <p className="fm-helper">{step.helper}</p>}

      <textarea
        className="fm-textarea"
        value={v}
        onChange={e => setField(step.field, e.target.value)}
        placeholder={step.placeholder || ''}
        rows={5}
      />

      <ContinueBar
        disabled={false}
        onClick={onAdvance}
        secondary={
          <button type="button" className="fm-skip" onClick={skip}>
            Skip →
          </button>
        }
      />
    </>
  );
}

// ── Step: contact (reward unlock) ───────────────────────────────────────
function ContactStep({ answers, setField, onSubmit, submitting, errorMsg, canContinue }) {
  return (
    <>
      <h1 className="fm-question">You're in 🎯</h1>
      <p className="fm-helper">
        Where should we send your early access and $50 onboarding credit when your market opens?
      </p>

      <div className="fm-stack">
        <input
          className="fm-input"
          type="email"
          value={answers.email}
          onChange={e => setField('email', e.target.value)}
          placeholder="Work email"
          autoComplete="email"
          required
        />
        <input
          className="fm-input"
          type="tel"
          value={answers.phone}
          onChange={e => setField('phone', e.target.value)}
          placeholder="Phone number"
          autoComplete="tel"
          required
        />
      </div>

      <p className="fm-finetext">
        We'll only use this to contact you about early access and your onboarding credit.
      </p>

      {errorMsg && <div className="fm-error">{errorMsg}</div>}

      <div className="fm-actions">
        <button
          type="button"
          className="fm-continue"
          onClick={onSubmit}
          disabled={!canContinue || submitting}
        >
          {submitting ? 'Sending…' : 'Lock in my founder access →'}
        </button>
      </div>
    </>
  );
}

// ── Step: done (thank-you) ──────────────────────────────────────────────
function DoneStep() {
  return (
    <>
      <h1 className="fm-question">You're on the founding partner list</h1>
      <p className="fm-helper">
        Your answers help us improve request quality, matching, and pricing — before we
        open more markets.
      </p>

      <ul className="fm-trust">
        <li><span className="fm-trust-check">✓</span> Early marketplace access</li>
        <li><span className="fm-trust-check">✓</span> Priority market availability</li>
        <li><span className="fm-trust-check">✓</span> $50 onboarding credit when your market opens</li>
      </ul>

      <div className="fm-actions">
        <a href="https://moveleads.cloud" className="fm-soft-link">
          Back to moveleads.cloud
        </a>
      </div>
    </>
  );
}
