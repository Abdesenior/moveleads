import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { US_STATES } from '../data/usStates';
import './FoundingMovers.css';

// ── API base ─────────────────────────────────────────────────────────────
const RAW_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE}/api`;

// ── Storage key / TTL ────────────────────────────────────────────────────
const STORAGE_KEY = 'ml_founder_v2';
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ── Option catalogues ───────────────────────────────────────────────────
// All options are { value, label, subline? }. `value` is the stable schema
// string (the tagger keys on it — don't rename). `label` is the short visible
// title. `subline` is an optional one-line clarifier.
const MOVE_TYPES = [
  { value: 'Local residential moves',   label: 'Local residential' },
  { value: 'Long-distance moves',       label: 'Long-distance' },
  { value: 'Office / commercial moves', label: 'Office / commercial' },
  { value: 'Same-day / urgent moves',   label: 'Same-day / urgent' },
];
const JOB_SIZES = [
  { value: 'Studio / 1-bedroom',  label: 'Studio / 1-bedroom' },
  { value: '2-bedroom',           label: '2-bedroom' },
  { value: '3-bedroom',           label: '3-bedroom' },
  { value: '4+ bedroom',          label: '4+ bedroom' },
  { value: 'Office / commercial', label: 'Office / commercial' },
  { value: 'Specialty-item moves', label: 'Specialty items' },
];
const VALUE_SIGNALS = [
  { value: 'Customer answers the phone',         label: 'Customer picks up' },
  { value: 'Move date is close',                 label: 'Move date is close' },
  { value: 'Inventory is explained properly',    label: 'Clear inventory details' },
  { value: 'Customer sounds serious about moving', label: 'Serious customer' },
  { value: 'Request reaches us quickly',         label: 'Fast request delivery' },
  { value: 'Exclusive access to the request',    label: 'Exclusive access' },
];
const REQUIRED_CONFIRMATIONS = [
  { value: 'Pickup location',                                label: 'Pickup location' },
  { value: 'Delivery location',                              label: 'Delivery location' },
  { value: 'Move date',                                      label: 'Move date' },
  { value: 'Move size',                                      label: 'Move size' },
  { value: 'Inventory / heavy items',                        label: 'Inventory / heavy items' },
  { value: 'Customer availability',                          label: 'Customer availability confirmed' },
  { value: 'Whether the customer is ready to move forward',  label: 'Ready to book' },
];
const SHARED_ACCEPTABLE_CONDITIONS = [
  { value: 'If only a few movers receive the request', label: 'Only a few movers see it' },
  { value: 'If the request cost is lower',             label: 'Lower request cost' },
  { value: 'If the customer is verified',              label: 'Verified customer' },
  { value: 'If it\'s a long-distance move',            label: 'Long-distance move' },
];
const SHARED_MAX_MOVERS = [
  { value: '2 movers max', label: '2 movers max' },
  { value: '3 movers max', label: '3 movers max' },
  { value: '4+ movers',    label: '4+ movers' },
];
const EXCLUSIVE_TRIGGERS = [
  { value: 'Long-distance moves', label: 'Long-distance moves' },
  { value: 'Commercial jobs',     label: 'Commercial jobs' },
  { value: 'High-intent customers', label: 'High-intent customers' },
];
const EXCLUSIVE_TRIGGERS_DEPENDS = [
  { value: 'Long-distance moves', label: 'Long-distance moves' },
  { value: 'Commercial jobs',     label: 'Commercial jobs' },
  { value: 'High-intent customers', label: 'High-intent customers' },
];
const SCENARIOS = [
  {
    id: 'exclusive_4br_long_distance',
    label: 'Exclusive 4-bedroom long-distance move',
    details: [
      'Houston → Denver, customer ready in 7 days',
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
      'Decision-maker on the call',
      'Exclusive request',
    ],
  },
];
const SPEED_OPTIONS = [
  { value: '5min',    label: 'First 5 minutes',  subline: 'Critical urgency' },
  { value: '15min',   label: 'First 15 minutes', subline: 'Still hot' },
  { value: '1hour',   label: 'First hour',       subline: 'Solid window' },
  { value: 'sameday', label: 'Same day',         subline: 'Flexible' },
];
const OVERPRICED_SIGNALS = [
  { value: 'Customer doesn\'t answer',       label: 'Customer doesn\'t pick up' },
  { value: 'Move details are incomplete',    label: 'Incomplete move details' },
  { value: 'Wrong service area',             label: 'Wrong service area' },
  { value: 'Too many movers received it',    label: 'Sent to too many movers' },
  { value: 'Request delivered too slowly',   label: 'Delivered too slowly' },
  { value: 'Customer is not ready to move',  label: 'Customer not ready' },
];
const FRUSTRATIONS = [
  { value: 'Requests sent to too many movers', label: 'Sent to too many movers' },
  { value: 'Fake or unreachable customers',    label: 'Fake or unreachable customers' },
  { value: 'Wrong move details',               label: 'Wrong move details' },
  { value: 'Low-quality requests',             label: 'Low-quality requests' },
  { value: 'Requests delivered too slowly',    label: 'Delivered too slowly' },
  { value: 'Paying too much for small jobs',   label: 'Overpaying for small jobs' },
];
const RETENTION_DRIVERS = [
  { value: 'Customers answer the phone',  label: 'Customers pick up' },
  { value: 'Accurate move details',       label: 'Accurate move details' },
  { value: 'Fair pricing',                label: 'Fair pricing' },
  { value: 'Requests are not overshared', label: 'Not overshared' },
  { value: 'Fast delivery',               label: 'Fast delivery' },
  { value: 'Better request matching',     label: 'Better matching' },
];

// ── Step descriptors ────────────────────────────────────────────────────
const STEPS = [
  { id: 'intro', type: 'intro', nextStep: 'moveTypes' },

  { id: 'moveTypes', type: 'multi', field: 'desiredMoveTypes',
    question: 'What jobs do your crews run most?',
    helper: 'Pick up to 3.',
    options: MOVE_TYPES, max: 3,
    nextStep: 'jobSizes' },

  { id: 'jobSizes', type: 'multi', field: 'preferredJobSizes',
    question: 'What size jobs fit your crews?',
    options: JOB_SIZES, nextStep: 'valueSignals' },

  { id: 'valueSignals', type: 'multi', field: 'valueSignals',
    question: 'What makes your dispatch jump on a request?',
    options: VALUE_SIGNALS, nextStep: 'confirmations' },

  { id: 'confirmations', type: 'multi', field: 'requiredConfirmations',
    question: 'Before your team calls, what should be confirmed?',
    helper: 'The details that save your crews time.',
    options: REQUIRED_CONFIRMATIONS, nextStep: 'sharedOrExclusive' },

  { id: 'sharedOrExclusive', type: 'single', field: 'sharedExclusivePreference',
    question: 'Shared or exclusive?',
    helper: 'Pick what your company usually prefers.',
    options: [
      { value: 'shared',    label: 'Shared requests',    subline: 'Lower cost · more competition' },
      { value: 'exclusive', label: 'Exclusive requests', subline: 'Only your company receives it' },
      { value: 'depends',   label: 'Depends on the job', subline: 'Varies by route and size' },
    ],
    nextStep: (a) => {
      if (a.sharedExclusivePreference === 'shared')    return 'sharedConditions';
      if (a.sharedExclusivePreference === 'exclusive') return 'exclusiveTriggers';
      return 'dependsTriggers';
    } },

  { id: 'sharedConditions', type: 'multi', field: 'sharedAcceptableConditions',
    question: 'When is sharing OK?',
    options: SHARED_ACCEPTABLE_CONDITIONS, nextStep: 'sharedMaxMovers' },

  { id: 'sharedMaxMovers', type: 'single', field: 'sharedMaxMovers',
    question: 'How many movers max per request?',
    options: SHARED_MAX_MOVERS,
    nextStep: 'priorityScenario' },

  { id: 'exclusiveTriggers', type: 'multi', field: 'exclusiveTriggers',
    question: 'Which requests are worth paying more for?',
    options: EXCLUSIVE_TRIGGERS, nextStep: 'priorityScenario' },

  { id: 'dependsTriggers', type: 'multi', field: 'exclusiveTriggersDepends',
    question: 'Which should always stay exclusive?',
    options: EXCLUSIVE_TRIGGERS_DEPENDS, nextStep: 'priorityScenario' },

  { id: 'priorityScenario', type: 'cards', field: 'priorityScenario',
    question: 'Which request would your dispatch grab first?',
    helper: 'Pretend all three just landed.',
    options: SCENARIOS, nextStep: 'speedExpectation' },

  { id: 'speedExpectation', type: 'single', field: 'speedExpectation',
    question: 'How fast does your team need to hit a fresh request?',
    options: SPEED_OPTIONS, nextStep: 'platformQuality' },

  // Merged step: writes to retentionDrivers (Group A) AND overpricedSignals
  // (Group B) from a single screen.
  { id: 'platformQuality', type: 'grouped-multi',
    question: 'Good platform vs bad platform — what matters?',
    helper: 'Pick what matters most.',
    groups: [
      {
        label: 'What makes one great',
        field: 'retentionDrivers',
        options: RETENTION_DRIVERS,
      },
      {
        label: 'What makes one painful',
        field: 'overpricedSignals',
        options: OVERPRICED_SIGNALS,
      },
    ],
    nextStep: 'brokerExperience' },

  { id: 'brokerExperience', type: 'single', field: 'leadProviderExperience',
    question: 'Bought leads or used a broker before?',
    helper: 'Honest is best.',
    options: [
      { value: 'regularly',    label: 'Yes, regularly',     subline: 'Multiple platforms' },
      { value: 'occasionally', label: 'Yes, occasionally',  subline: 'Tried a few' },
      { value: 'interested',   label: 'Not yet — interested', subline: 'Considering it' },
      { value: 'no',           label: 'No',                 subline: 'First time looking' },
    ],
    nextStep: (a) => {
      const v = a.leadProviderExperience;
      if (v === 'regularly' || v === 'occasionally') return 'brokerFrustrations';
      return 'biggestProblem';
    } },

  { id: 'brokerFrustrations', type: 'multi', field: 'leadProviderFrustrations',
    question: 'Where do lead providers let movers down?',
    helper: 'Pick anything that applies.',
    options: FRUSTRATIONS, nextStep: 'platformWish' },

  { id: 'platformWish', type: 'textarea', field: 'platformWish',
    question: 'If you could fix one thing about lead providers?',
    helper: 'Optional.',
    placeholder: 'Share anything that comes to mind…',
    optional: true, nextStep: 'biggestProblem' },

  { id: 'biggestProblem', type: 'textarea', field: 'biggestProblem',
    question: 'Biggest headache with move requests today?',
    helper: 'Optional.',
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

// ── US phone helpers ───────────────────────────────────────────────────
// Storage = digits-only string (up to 10 NANP digits, "+1" prefix stripped).
// Display = "(XXX) XXX-XXXX" with progressive masking as the user types.
function normalizePhoneDigits(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.slice(0, 10);
}
function formatUSPhone(digitsOrRaw) {
  const d = normalizePhoneDigits(digitsOrRaw);
  if (d.length === 0)  return '';
  if (d.length <= 3)   return `(${d}`;
  if (d.length <= 6)   return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
function isValidUSPhone(s) {
  return normalizePhoneDigits(s).length === 10;
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
  total += 1;    // platformQuality (merged)
  total += 1;    // brokerExperience
  if (answers.leadProviderExperience === 'regularly' ||
      answers.leadProviderExperience === 'occasionally') total += 2;
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
      case 'grouped-multi': {
        // At least one option selected across any group
        const groups = step.groups || [];
        return groups.some(g => (answers[g.field] || []).length > 0);
      }
      case 'single':
        return Boolean(answers[step.field]);
      case 'cards':
        return Boolean(answers[step.field]);
      case 'textarea':
        return true; // optional — skip-or-continue
      case 'contact':
        return Boolean(isEmail(answers.email) && isValidUSPhone(answers.phone));
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
        screensSeen: stepHistory.length + 1,
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
  }, [answers, stepId, stepHistory, submitting]);

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
    case 'multi':          return <MultiStep {...props} />;
    case 'grouped-multi':  return <GroupedMultiStep {...props} />;
    case 'single':         return <SingleStep {...props} />;
    case 'cards':          return <CardsStep {...props} />;
    case 'textarea':       return <TextareaStep {...props} />;
    case 'contact':        return <ContactStep {...props} />;
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

// ── Step: intro (3 stacked fields + bullets above) ──────────────────────
function IntroStep({ answers, setField, onAdvance, canContinue }) {
  return (
    <>
      <h1 className="fm-question">Early access for serious movers</h1>
      <p className="fm-helper">
        We're building MoveLeads to match your crews with real moving jobs — not
        overshared broker leads. Answer a few quick questions and we'll tailor your access.
      </p>

      <ul className="fm-intro-bullets">
        <li><span className="fm-trust-check">✓</span> Real moving jobs</li>
        <li><span className="fm-trust-check">✓</span> Verified customers ready to move</li>
        <li><span className="fm-trust-check">✓</span> $50 free credit to start</li>
      </ul>

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
        <StateAutocomplete
          value={answers.mainStateOrMarket}
          onChange={(code) => setField('mainStateOrMarket', code)}
        />
      </div>

      <ContinueBar disabled={!canContinue} onClick={onAdvance} />
    </>
  );
}

// ── State autocomplete (50 US states, name + abbrev match) ──────────────
function StateAutocomplete({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);

  // The current selection rendered as a chip; when set, the input is hidden.
  const selected = useMemo(() => {
    if (!value) return null;
    return US_STATES.find(s => s.code === value || s.name === value) || null;
  }, [value]);

  // Filtered + prefix-priority sorted results, capped to 6.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return US_STATES.slice(0, 6);
    const matches = US_STATES.filter(s =>
      s.name.toLowerCase().includes(q) || s.code.toLowerCase().startsWith(q)
    );
    return matches.sort((a, b) => {
      const aPref = a.name.toLowerCase().startsWith(q) || a.code.toLowerCase().startsWith(q) ? 0 : 1;
      const bPref = b.name.toLowerCase().startsWith(q) || b.code.toLowerCase().startsWith(q) ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
      return a.name.localeCompare(b.name);
    }).slice(0, 6);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function commit(state) {
    onChange(state.code);
    setQuery('');
    setOpen(false);
    setActiveIdx(0);
  }

  function handleKey(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter')     {
      e.preventDefault();
      const pick = filtered[activeIdx] || filtered[0];
      if (pick) commit(pick);
    }
    else if (e.key === 'Escape')    { setOpen(false); }
  }

  if (selected) {
    return (
      <div className="fm-state-chip-row">
        <span className="fm-state-chip">
          {selected.name} <span className="fm-state-chip-code">({selected.code})</span>
          <button
            type="button"
            className="fm-state-chip-x"
            aria-label={`Remove ${selected.name}`}
            onClick={() => onChange('')}
          >×</button>
        </span>
      </div>
    );
  }

  return (
    <div className="fm-state-wrap" ref={wrapRef}>
      <input
        className="fm-input"
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIdx(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder="Main operating state"
        aria-autocomplete="list"
        aria-expanded={open}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="fm-state-dropdown" role="listbox">
          {filtered.map((s, i) => (
            <button
              key={s.code}
              type="button"
              role="option"
              aria-selected={i === activeIdx}
              className={`fm-state-option${i === activeIdx ? ' active' : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => commit(s)}
            >
              <span className="fm-state-name">{s.name}</span>
              <span className="fm-state-code">({s.code})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step: grouped multi-select (two labeled groups on one screen) ──────
function GroupedMultiStep({ step, answers, toggleField, onAdvance, canContinue }) {
  return (
    <>
      <h1 className="fm-question">{step.question}</h1>
      {step.helper && <p className="fm-helper">{step.helper}</p>}

      {step.groups.map((group, idx) => {
        const selected = answers[group.field] || [];
        return (
          <div key={group.field} className={`fm-group${idx > 0 ? ' fm-group-spaced' : ''}`}>
            <div className="fm-group-label">{group.label}</div>
            <div className="fm-choices">
              {group.options.map(opt => {
                const v = opt.value;
                const label = opt.label;
                const isSelected = selected.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    className={`fm-choice${isSelected ? ' selected' : ''}`}
                    onClick={() => toggleField(group.field, v)}
                    aria-pressed={isSelected}
                  >
                    <span className="fm-choice-label">{label}</span>
                    <span className="fm-choice-check">{isSelected ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

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
          const v = opt.value;
          const label = opt.label;
          const isSelected = selected.includes(v);
          const capReached = typeof step.max === 'number' && selected.length >= step.max && !isSelected;
          return (
            <button
              key={v}
              type="button"
              className={`fm-choice${isSelected ? ' selected' : ''}${capReached ? ' disabled' : ''}`}
              onClick={capReached ? undefined : () => toggleField(step.field, v, step.max)}
              aria-pressed={isSelected}
              disabled={capReached}
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
          const subline = opt.subline;
          const isSelected = value === v;
          return (
            <button
              key={v}
              type="button"
              className={`fm-choice${isSelected ? ' selected' : ''}`}
              onClick={() => setField(step.field, v)}
              aria-pressed={isSelected}
            >
              <span className="fm-choice-text">
                <span className="fm-choice-label">{label}</span>
                {subline && <span className="fm-choice-subline">{subline}</span>}
              </span>
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
      <h1 className="fm-question">You're on the list 🎯</h1>
      <p className="fm-helper">
        Where should we send your founding access and onboarding credit?
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
          value={formatUSPhone(answers.phone)}
          onChange={e => setField('phone', normalizePhoneDigits(e.target.value))}
          placeholder="(555) 555-5555"
          autoComplete="tel"
          inputMode="numeric"
          maxLength={14}
          required
        />
      </div>

      <ul className="fm-unlock-list">
        <li><span className="fm-trust-check">✓</span> Real moving jobs</li>
        <li><span className="fm-trust-check">✓</span> Verified customers ready to move</li>
        <li><span className="fm-trust-check">✓</span> $50 free credit to start</li>
      </ul>

      <p className="fm-finetext">
        We'll only use this to contact you about founding access and your onboarding credit.
      </p>

      {errorMsg && <div className="fm-error">{errorMsg}</div>}

      <div className="fm-actions">
        <button
          type="button"
          className="fm-continue"
          onClick={onSubmit}
          disabled={!canContinue || submitting}
        >
          {submitting ? 'Sending…' : 'Lock in my founding access →'}
        </button>
      </div>
    </>
  );
}

// ── Step: done — momentum + invite to explore the platform ─────────────
function DoneStep() {
  return (
    <>
      <h1 className="fm-question">You're early. Now see how it works.</h1>
      <p className="fm-helper">
        We'll tailor your marketplace access around how your crews actually operate —
        smarter matching, fewer overshared requests, better request quality. In the
        meantime, here's a look inside MoveLeads.
      </p>

      <ul className="fm-trust">
        <li><span className="fm-trust-check">✓</span> Tailored matching around how your crews operate</li>
        <li><span className="fm-trust-check">✓</span> Fewer overshared requests — quality over quantity</li>
        <li><span className="fm-trust-check">✓</span> Verified customers ready to move</li>
      </ul>

      <div className="fm-actions">
        <a
          href="https://moveleads.cloud/partners?utm_source=founder_form&utm_medium=funnel"
          className="fm-continue fm-continue-link"
        >
          See how MoveLeads works →
        </a>
      </div>
    </>
  );
}
