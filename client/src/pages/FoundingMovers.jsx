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
  'Large house moves',
  'Apartment / small moves',
];
const JOB_SIZES = [
  'Studio / 1-bedroom',
  '2-bedroom',
  '3-bedroom',
  '4+ bedroom',
  'Small house moves',
  'Medium house moves',
  'Large house moves',
  'Office / commercial',
  'Specialty-item moves',
];
const VALUE_SIGNALS = [
  'Customer answers the phone',
  'Move date is close',
  'Pickup and delivery details are clear',
  'Inventory is explained properly',
  'Customer sounds serious about moving',
  'Long-distance route',
  'Large move size',
  'Commercial move',
  'Heavy / specialty items',
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
  'Budget expectations',
  'Stairs / elevator access',
  'Whether the customer is comparing movers',
  'Whether the customer is ready to move forward',
];
const SHARED_ACCEPTABLE_CONDITIONS = [
  'If only a few movers receive the request',
  'If the request cost is lower',
  'If the move is large enough',
  'If the customer is verified',
  'If it\'s a long-distance move',
  'If the customer is moving soon',
];
const SHARED_MAX_MOVERS = ['2 movers max', '3 movers max', '4+ movers'];
const EXCLUSIVE_TRIGGERS = [
  'Long-distance moves',
  '3+ bedroom moves',
  'Commercial jobs',
  'Same-day / urgent moves',
  'High-intent customers',
  'Any well-qualified request',
];
const EXCLUSIVE_TRIGGERS_DEPENDS = [
  'Long-distance moves',
  'Large house moves',
  'Commercial moves',
  'Same-day / urgent requests',
  'High-intent customers',
];
const SCENARIOS = [
  {
    id: 'verified_2br_local_shared',
    label: 'Verified 2-bedroom local move',
    details: ['Shared with 2 movers', 'Customer moving this week'],
  },
  {
    id: 'exclusive_4br_long_distance',
    label: 'Exclusive 4-bedroom long-distance move',
    details: ['Customer ready to move within 7 days'],
  },
  {
    id: 'verified_same_day_local',
    label: 'Verified same-day local move',
    details: ['Customer ready to book quickly'],
  },
  {
    id: 'commercial_office_relocation',
    label: 'Commercial office relocation',
    details: ['Flexible timeline'],
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
  'Small move size',
  'Customer is not ready to move',
  'Wrong service area',
  'Move date is too far away',
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
  'Customers only shopping for the cheapest quote',
  'Poor refund handling',
  'Too much competition',
  'Requests outside our service area',
];
const RETENTION_DRIVERS = [
  'Customers answer the phone',
  'Accurate move details',
  'Fair pricing',
  'Requests are not overshared',
  'Fast delivery',
  'Better request matching',
  'Exclusive request options',
  'Easy refunds for bad requests',
];

// ── Step descriptors ────────────────────────────────────────────────────
const STEPS = [
  { id: 'intro', type: 'intro', nextStep: 'moveTypes' },

  { id: 'moveTypes', type: 'multi', field: 'desiredMoveTypes',
    question: 'Which move requests does your company want most?',
    helper: 'Pick up to 3.', options: MOVE_TYPES, max: 3,
    nextStep: 'jobSizes' },

  { id: 'jobSizes', type: 'multi', field: 'preferredJobSizes',
    question: 'Which jobs fit your crews best?',
    options: JOB_SIZES, nextStep: 'valueSignals' },

  { id: 'valueSignals', type: 'multi', field: 'valueSignals',
    question: 'What makes a request worth jumping on?',
    options: VALUE_SIGNALS, nextStep: 'confirmations' },

  { id: 'confirmations', type: 'multi', field: 'requiredConfirmations',
    question: 'Before a request reaches your dispatch team, what should already be confirmed?',
    options: REQUIRED_CONFIRMATIONS, nextStep: 'sharedOrExclusive' },

  { id: 'sharedOrExclusive', type: 'single', field: 'sharedExclusivePreference',
    question: 'Shared or exclusive requests?',
    helper: 'Pick what your company usually prefers.',
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
    question: 'When are shared requests acceptable for your company?',
    options: SHARED_ACCEPTABLE_CONDITIONS, nextStep: 'sharedMaxMovers' },

  { id: 'sharedMaxMovers', type: 'single', field: 'sharedMaxMovers',
    question: 'How many movers should receive the same request?',
    options: SHARED_MAX_MOVERS.map(v => ({ value: v, label: v })),
    nextStep: 'priorityScenario' },

  { id: 'exclusiveTriggers', type: 'multi', field: 'exclusiveTriggers',
    question: 'Which requests are worth paying more for exclusively?',
    options: EXCLUSIVE_TRIGGERS, nextStep: 'priorityScenario' },

  { id: 'dependsTriggers', type: 'multi', field: 'exclusiveTriggersDepends',
    question: 'Which requests should stay exclusive?',
    options: EXCLUSIVE_TRIGGERS_DEPENDS, nextStep: 'priorityScenario' },

  { id: 'priorityScenario', type: 'cards', field: 'priorityScenario',
    question: 'Which request would your dispatch team jump on first?',
    options: SCENARIOS, nextStep: 'speedExpectation' },

  { id: 'speedExpectation', type: 'single', field: 'speedExpectation',
    question: 'When does speed matter most?',
    helper: 'After a customer submits a request, when does it feel critical to act?',
    options: SPEED_OPTIONS, nextStep: 'overpricedSignals' },

  { id: 'overpricedSignals', type: 'multi', field: 'overpricedSignals',
    question: 'What usually makes a request feel overpriced?',
    options: OVERPRICED_SIGNALS, nextStep: 'marketplacePref' },

  { id: 'marketplacePref', type: 'single', field: 'marketplacePreference',
    question: 'How should premium requests be handled?',
    options: [
      { value: 'mostly_exclusive', label: 'Mostly exclusive requests' },
      { value: 'mostly_shared',    label: 'Mostly shared requests' },
      { value: 'mixed',            label: 'Mix of both depending on the move' },
      { value: 'bidding',          label: 'Bidding for premium requests' },
    ],
    nextStep: (a) => a.marketplacePreference === 'bidding' ? 'biddingTriggers' : 'brokerExperience' },

  { id: 'biddingTriggers', type: 'multi', field: 'biddingTriggers',
    question: 'Which requests would movers compete hardest for?',
    options: BIDDING_TRIGGERS, nextStep: 'brokerExperience' },

  { id: 'brokerExperience', type: 'single', field: 'leadProviderExperience',
    question: 'Have you worked with lead providers or moving brokers before?',
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
    question: 'What frustrations have you had with lead providers or brokers?',
    options: FRUSTRATIONS, nextStep: 'platformWish' },

  { id: 'platformWish', type: 'textarea', field: 'platformWish',
    question: 'What do you wish moving request platforms did better?',
    helper: 'Optional — anything that would help your dispatch team.',
    placeholder: 'Share anything that comes to mind…',
    optional: true, nextStep: 'retentionDrivers' },

  { id: 'retentionDrivers', type: 'multi', field: 'retentionDrivers',
    question: 'What would keep you buying requests from the same platform?',
    helper: 'Pick up to 3.', options: RETENTION_DRIVERS, max: 3,
    nextStep: 'biggestProblem' },

  { id: 'biggestProblem', type: 'textarea', field: 'biggestProblem',
    question: 'What\'s the biggest problem you face with move requests today?',
    helper: 'Optional — be as candid as you\'d like.',
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
      <h1 className="fm-question">Tell us about your crew</h1>
      <p className="fm-helper">Founding access for the first movers in your market.</p>

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
        Your feedback helps us improve request quality, matching, routing, and pricing
        fairness before opening more markets.
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
