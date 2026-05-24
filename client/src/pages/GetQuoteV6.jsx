import { useState, useEffect, useCallback } from 'react';
import './getQuoteV6/styles.css';
import useCanonical from '../utils/useCanonical';
import useMedia from './getQuoteV6/useMedia';
import RouteScreen from './getQuoteV6/screens/RouteScreen';
import TimingPivotScreen from './getQuoteV6/screens/TimingPivotScreen';
import DatePickerScreen from './getQuoteV6/screens/DatePickerScreen';
import BucketSelectScreen from './getQuoteV6/screens/BucketSelectScreen';
import HomeTypeScreen from './getQuoteV6/screens/HomeTypeScreen';
import HomeSizeScreen from './getQuoteV6/screens/HomeSizeScreen';
import StairsScreen from './getQuoteV6/screens/StairsScreen';
import HeavyPivotScreen from './getQuoteV6/screens/HeavyPivotScreen';
import HeavySelectScreen from './getQuoteV6/screens/HeavySelectScreen';
import ContactScreen from './getQuoteV6/screens/ContactScreen';
import SuccessScreen from './getQuoteV6/screens/SuccessScreen';
import MobileShell from './getQuoteV6/shells/MobileShell';
import DesktopShell from './getQuoteV6/shells/DesktopShell';

/**
 * GetQuoteV6 — Conversational qualification funnel.
 *
 * Mobile-first guided flow, posts to POST /api/leads/ingest-v2 (same
 * endpoint V5 uses; payload stamps `funnelVersion: 'v6'`).
 *
 * Architecture: 4 perceived sections wrap an 11-node state machine.
 *   Section 1 — Move Info       (route → timing_pivot →
 *                                date_picker | bucket_select)
 *   Section 2 — About Your Home (home_type → home_size → stairs)
 *   Section 3 — Specialty       (heavy_pivot → heavy_select | skip)
 *   Section 4 — Contact & Intent (contact → submit → success)
 *
 * State machine rules (per the architecture review):
 *   - One binary fork only: `timing_pivot` (date known? → calendar / bucket)
 *   - All branches converge at `home_type`
 *   - Every node stores a known field into a canonical answers shape
 *   - localStorage persists `currentNode` + `answers` so refresh resumes
 *
 * Backend contract (validator: server/validators/leadIngestV2.js):
 *   moveDate (ISO 8601, REQUIRED — bucket branch derives a sensible date)
 *   urgencyBucket (REQUIRED — calendar branch derives it from moveDate
 *                  client-side; server also derives if missing)
 *   homeSize, heavyItems[] (existing)
 *   homeType, stairs (V6 additive — operational difficulty signals)
 *   intentConfirmed (set true by the submit CTA)
 *   clientSubmissionId (UUID for ingest idempotency)
 *   funnelVersion: 'v6'
 *
 * Scoring, pricing, tier router, Twilio validation, marketplace filtering
 * all consume the same fields they always have. V6 changes UX delivery,
 * NOT the data contract.
 *
 * Visual rendering is delegated to the components under
 * client/src/pages/getQuoteV6/. The orchestrator owns: state, persistence,
 * navigation, payload assembly, and submission. Nothing else.
 */

const API = import.meta.env.VITE_API_URL || 'https://api.moveleads.cloud';
const STORAGE_KEY = 'moveleads-funnel-v6';

// ── Node IDs ────────────────────────────────────────────────────────────────
const NODE = {
  ROUTE: 'route',
  TIMING_PIVOT: 'timing_pivot',
  DATE_PICKER: 'date_picker',
  BUCKET_SELECT: 'bucket_select',
  HOME_TYPE: 'home_type',
  HOME_SIZE: 'home_size',
  STAIRS: 'stairs',
  HEAVY_PIVOT: 'heavy_pivot',
  HEAVY_SELECT: 'heavy_select',
  CONTACT: 'contact',
  SUCCESS: 'success',
};

// Section grouping — drives the progress indicator. 1-indexed to match the
// FunnelHeader / DesktopTopBar consumers (which expect section numbers
// starting at 1). Route/Success are not part of a numbered section.
const SECTION_OF_NODE = {
  [NODE.ROUTE]: 0,
  [NODE.TIMING_PIVOT]: 1,
  [NODE.DATE_PICKER]: 1,
  [NODE.BUCKET_SELECT]: 1,
  [NODE.HOME_TYPE]: 2,
  [NODE.HOME_SIZE]: 2,
  [NODE.STAIRS]: 2,
  [NODE.HEAVY_PIVOT]: 3,
  [NODE.HEAVY_SELECT]: 3,
  [NODE.CONTACT]: 4,
  [NODE.SUCCESS]: 4,
};

// ── Bucket → representative date mapping. The validator requires moveDate
//    even on the bucket branch. We synthesize a sensible date that matches
//    the bucket's semantic so existing scoring + dispatch stays consistent.
const BUCKET_TO_DAYS = {
  asap: 5,          // <= 7 days → asap urgency
  this_week: 7,
  this_month: 21,
  flexible: 45,
};

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);  // noon avoids timezone-edge drift
  return d;
}

// Derive urgencyBucket from a Date — mirrors server-side deriveUrgencyBucket
// in routes/leadIngestV2.js so client and server agree on bucket assignment.
function deriveUrgencyBucket(date) {
  if (!date) return undefined;
  const daysAway = Math.round((new Date(date).getTime() - Date.now()) / 86400000);
  if (daysAway <= 7) return 'asap';
  if (daysAway <= 14) return 'this_week';
  if (daysAway <= 30) return 'this_month';
  return 'flexible';
}

// Crude UUID v4 — only for idempotency token; no security claim.
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Empty initial answers shape ────────────────────────────────────────────
const EMPTY_ANSWERS = {
  pickupZip: '',
  destinationZip: '',
  originCity: '',  // populated client-side via ZIP enrichment
  originState: '',
  destinationCity: '',
  destinationState: '',
  miles: 0,
  // Timing — at least one of (moveDate, urgencyBucket) is populated by the
  // pivot fork. Submit handler ensures BOTH are present in the payload.
  moveDate: '',           // ISO date string (YYYY-MM-DD); empty on bucket branch
  urgencyBucket: '',      // empty on calendar branch
  knowsDate: null,        // true | false — drives the pivot branch
  // Home section
  homeType: '',
  homeSize: '',
  stairs: '',
  // Specialty
  heavyItems: [],
  // Contact + intent
  firstName: '',
  lastName: '',
  customerPhone: '',
  customerEmail: '',
  intentConfirmed: false,
  // Meta
  clientSubmissionId: '',
};

export default function GetQuoteV6() {
  // ── State machine root ──────────────────────────────────────────────────
  const [node, setNode] = useState(NODE.ROUTE);
  const [answers, setAnswers] = useState(EMPTY_ANSWERS);
  const [history, setHistory] = useState([]);          // back-button stack
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  // SEO canonical for the route this funnel is mounted at. Both /get-quote
  // and /get-quote-v6 render this component; /get-quote is canonical.
  useCanonical('/get-quote');

  // Computed once and threaded down so every screen and the desktop shell
  // agree on the viewport class (avoids each screen re-reading the media
  // query — single source of truth).
  const desktop = useMedia('(min-width: 1100px)');

  // Resume from localStorage on mount. If no saved session exists, apply
  // V1-compatibility ZIP prefill from ?from= / ?to= query params. Saved
  // session always wins over URL prefill — a user mid-funnel shouldn't
  // have their progress wiped by a stale campaign link.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.funnelVersion === 'v6' && saved.node && saved.answers) {
          // Don't resume into the success node — that would skip the actual submit.
          if (saved.node !== NODE.SUCCESS) {
            setNode(saved.node);
            setAnswers({ ...EMPTY_ANSWERS, ...saved.answers });
            setHistory(Array.isArray(saved.history) ? saved.history : []);
            return;
          }
        }
      }
    } catch (_e) { /* corrupt storage — fall through to URL prefill */ }

    // No usable saved state — check for V1-style ?from= / ?to= ZIP prefill.
    try {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const from = (params.get('from') || '').replace(/\D/g, '').slice(0, 5);
      const to = (params.get('to') || '').replace(/\D/g, '').slice(0, 5);
      const prefill = {};
      if (from.length === 5) prefill.pickupZip = from;
      if (to.length === 5) prefill.destinationZip = to;
      if (Object.keys(prefill).length > 0) {
        setAnswers(a => ({ ...a, ...prefill }));
      }
    } catch { /* malformed URL — ignore */ }
  }, []);

  // Persist on every state change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        funnelVersion: 'v6',
        node,
        answers,
        history,
        savedAt: Date.now(),
      }));
    } catch (_e) { /* quota or private mode — non-fatal */ }
  }, [node, answers, history]);

  // ── Navigation helpers ──────────────────────────────────────────────────
  const goto = useCallback((nextNode) => {
    setHistory(h => [...h, node]);
    setNode(nextNode);
    setSubmitErr('');
  }, [node]);

  const goBack = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setNode(prev);
      setSubmitErr('');
      return h.slice(0, -1);
    });
  }, []);

  const patch = useCallback((updates) => {
    setAnswers(a => ({ ...a, ...updates }));
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitErr('');
    try {
      // Synthesize a moveDate when only bucket was provided (validator requires it).
      let moveDateISO = answers.moveDate;
      let urgencyBucket = answers.urgencyBucket;
      if (!moveDateISO && urgencyBucket) {
        const days = BUCKET_TO_DAYS[urgencyBucket] || 30;
        moveDateISO = daysFromNow(days).toISOString();
      } else if (moveDateISO && !urgencyBucket) {
        urgencyBucket = deriveUrgencyBucket(moveDateISO);
        // Convert plain YYYY-MM-DD to full ISO with time
        if (moveDateISO.length === 10) {
          const d = new Date(moveDateISO + 'T12:00:00');
          moveDateISO = d.toISOString();
        }
      } else if (moveDateISO && moveDateISO.length === 10) {
        const d = new Date(moveDateISO + 'T12:00:00');
        moveDateISO = d.toISOString();
      }

      const submissionId = answers.clientSubmissionId || uuid();
      const payload = {
        firstName: answers.firstName.trim(),
        ...(answers.lastName.trim() && { lastName: answers.lastName.trim() }),
        ...(answers.customerEmail.trim() && { customerEmail: answers.customerEmail.trim() }),
        customerPhone: answers.customerPhone.replace(/\D/g, ''),
        pickupZip: answers.pickupZip,
        destinationZip: answers.destinationZip,
        moveDate: moveDateISO,
        urgencyBucket,
        homeSize: answers.homeSize,
        homeType: answers.homeType,
        ...(answers.stairs && { stairs: answers.stairs }),
        moveType: 'residential',
        heavyItems: answers.heavyItems,
        intentConfirmed: true,
        clientSubmissionId: submissionId,
        funnelVersion: 'v6',
        miles: answers.miles || 0,
      };

      const res = await fetch(`${API}/api/leads/ingest-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json.msg || json.message || `Submission failed (${res.status})`);
      }

      patch({ clientSubmissionId: submissionId, intentConfirmed: true });
      setNode(NODE.SUCCESS);
      setHistory([]);
      // Wipe storage so a refresh after success starts a fresh funnel.
      try { localStorage.removeItem(STORAGE_KEY); } catch (_e) {}
    } catch (err) {
      setSubmitErr(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [answers, patch]);

  // Restart from scratch (used by the success screen).
  const restart = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_e) {}
    setAnswers(EMPTY_ANSWERS);
    setHistory([]);
    setNode(NODE.ROUTE);
  }, []);

  // ── Build the active screen ────────────────────────────────────────────
  // `common` is the standard prop bundle every mid-funnel screen receives.
  // Section is 1-indexed to match FunnelHeader (mobile) and the desktop
  // shell's section bar.
  const common = {
    answers,
    patch,
    onBack: goBack,
    onClose: restart,
    section: SECTION_OF_NODE[node],
    total: 4,
    desktop,
    safeTop: desktop ? 16 : 56,
  };

  let screen;
  switch (node) {
    case NODE.ROUTE:
      // RouteScreen owns its own layout (full-bleed hero) and reads its own
      // viewport internally; no shell props passed.
      screen = <RouteScreen answers={answers} patch={patch} onContinue={() => goto(NODE.TIMING_PIVOT)} />;
      break;
    case NODE.TIMING_PIVOT:
      // The pivot calls onContinue(knowsDate) AFTER the patch is applied, so
      // we branch on the picked value (not on the still-stale answers.knowsDate
      // closure that the screen was rendered with).
      screen = <TimingPivotScreen {...common} onContinue={(knowsDate) => goto(knowsDate ? NODE.DATE_PICKER : NODE.BUCKET_SELECT)} />;
      break;
    case NODE.DATE_PICKER:
      screen = <DatePickerScreen {...common} onContinue={() => goto(NODE.HOME_TYPE)} />;
      break;
    case NODE.BUCKET_SELECT:
      screen = <BucketSelectScreen {...common} onContinue={() => goto(NODE.HOME_TYPE)} />;
      break;
    case NODE.HOME_TYPE:
      screen = <HomeTypeScreen {...common} onContinue={() => goto(NODE.HOME_SIZE)} />;
      break;
    case NODE.HOME_SIZE:
      screen = <HomeSizeScreen {...common} onContinue={() => goto(NODE.STAIRS)} />;
      break;
    case NODE.STAIRS:
      screen = <StairsScreen {...common} onContinue={() => goto(NODE.HEAVY_PIVOT)} />;
      break;
    case NODE.HEAVY_PIVOT:
      screen = <HeavyPivotScreen {...common} onYes={() => goto(NODE.HEAVY_SELECT)} onSkip={() => goto(NODE.CONTACT)} />;
      break;
    case NODE.HEAVY_SELECT:
      screen = <HeavySelectScreen {...common} onContinue={() => goto(NODE.CONTACT)} />;
      break;
    case NODE.CONTACT:
      screen = <ContactScreen {...common} submit={submit} submitting={submitting} submitErr={submitErr} />;
      break;
    case NODE.SUCCESS:
      screen = <SuccessScreen answers={answers} onRestart={restart} desktop={desktop} />;
      break;
    default:
      screen = null;
  }

  // The .glq-v6 wrapper activates the scoped styles in
  // ./getQuoteV6/styles.css. DesktopShell internally early-returns plain
  // children when step === 'route' so we don't need to bypass it here.
  return (
    <div className="glq-v6">
      {desktop ? (
        <DesktopShell
          step={node}
          answers={answers}
          onBack={goBack}
          canGoBack={history.length > 0}
        >{screen}</DesktopShell>
      ) : (
        <MobileShell>{screen}</MobileShell>
      )}
    </div>
  );
}
