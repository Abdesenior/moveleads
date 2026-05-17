import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/**
 * GetQuoteV6 — Conversational qualification funnel.
 *
 * Mobile-first guided flow, posts to POST /api/leads/ingest-v2 (same
 * endpoint V5 uses; payload stamps `funnelVersion: 'v6'`).
 *
 * Architecture: 4 perceived sections wrap a 10-node state machine.
 *   Section 1 — Move Info       (route → route_preview → timing_pivot →
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
 */

const API = import.meta.env.VITE_API_URL || 'https://api.moveleads.cloud';
const STORAGE_KEY = 'moveleads-funnel-v6';

// ── Design tokens (matched to V5 for brand coherence) ──────────────────────
const T = {
  ink: '#0B1F33',
  ink2: '#475569',
  mute: '#94A3B8',
  bg: '#F8FAFC',
  bg2: '#F1F5F9',
  surface: '#FFFFFF',
  line: '#E2E8F0',
  line2: '#EEF2F7',
  accent: '#FF8A00',
  accentSoft: '#FFEDD5',
  ok: '#10B981',
  warn: '#F59E0B',
  danger: '#DC2626',
  trustGreen: '#005541',
  sans: 'Manrope, "DM Sans", -apple-system, system-ui, sans-serif',
  cardShadow: '0 12px 28px rgba(11, 31, 51, 0.06)',
  ctaShadow: '0 6px 18px rgba(255, 138, 0, 0.40)',
};

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

// Section grouping — drives the 4-dot progress indicator.
const SECTION_OF_NODE = {
  [NODE.ROUTE]: 0,
  [NODE.TIMING_PIVOT]: 0,
  [NODE.DATE_PICKER]: 0,
  [NODE.BUCKET_SELECT]: 0,
  [NODE.HOME_TYPE]: 1,
  [NODE.HOME_SIZE]: 1,
  [NODE.STAIRS]: 1,
  [NODE.HEAVY_PIVOT]: 2,
  [NODE.HEAVY_SELECT]: 2,
  [NODE.CONTACT]: 3,
  [NODE.SUCCESS]: 3,
};
const SECTION_LABELS = ['Move info', 'About your home', 'Specialty items', 'Final details'];

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

// Format YYYY-MM-DD → "May 28, 2026"
function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

// Min date for the calendar picker — tomorrow.
function tomorrowISO() {
  const d = daysFromNow(1);
  return d.toISOString().split('T')[0];
}

// US phone validation — matches V5's pattern.
function isValidUSPhone(raw) {
  if (typeof raw !== 'string') return false;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits.slice(1));
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits);
}
function formatUSPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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

  // Resume from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.funnelVersion === 'v6' && saved.node && saved.answers) {
        // Don't resume into the success node — that would skip the actual submit.
        if (saved.node !== NODE.SUCCESS) {
          setNode(saved.node);
          setAnswers({ ...EMPTY_ANSWERS, ...saved.answers });
          setHistory(Array.isArray(saved.history) ? saved.history : []);
        }
      }
    } catch (_e) { /* corrupt storage — start fresh */ }
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

  // ── Section + progress ─────────────────────────────────────────────────
  const sectionIdx = SECTION_OF_NODE[node] ?? 0;
  const sectionLabel = SECTION_LABELS[sectionIdx];
  const canGoBack = history.length > 0 && node !== NODE.SUCCESS;

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div style={brandStyle}>MoveLeads</div>
        {node !== NODE.SUCCESS && <SectionDots active={sectionIdx} />}
      </header>

      <main style={mainStyle}>
        {canGoBack && (
          <button onClick={goBack} style={backBtnStyle}>
            <span aria-hidden="true">←</span> Back
          </button>
        )}

        {node !== NODE.SUCCESS && (
          <div style={sectionLabelStyle}>{sectionLabel}</div>
        )}

        {node === NODE.ROUTE && (
          <RouteStep answers={answers} patch={patch} next={() => goto(NODE.TIMING_PIVOT)} />
        )}
        {node === NODE.TIMING_PIVOT && (
          <TimingPivot
            onYes={() => { patch({ knowsDate: true }); goto(NODE.DATE_PICKER); }}
            onNo={()  => { patch({ knowsDate: false, moveDate: '' }); goto(NODE.BUCKET_SELECT); }}
          />
        )}
        {node === NODE.DATE_PICKER && (
          <DatePicker
            answers={answers}
            patch={patch}
            next={() => goto(NODE.HOME_TYPE)}
          />
        )}
        {node === NODE.BUCKET_SELECT && (
          <BucketSelect
            answers={answers}
            patch={patch}
            next={() => goto(NODE.HOME_TYPE)}
          />
        )}
        {node === NODE.HOME_TYPE && (
          <HomeType answers={answers} patch={patch} next={() => goto(NODE.HOME_SIZE)} />
        )}
        {node === NODE.HOME_SIZE && (
          <HomeSize answers={answers} patch={patch} next={() => goto(NODE.STAIRS)} />
        )}
        {node === NODE.STAIRS && (
          <Stairs answers={answers} patch={patch} next={() => goto(NODE.HEAVY_PIVOT)} />
        )}
        {node === NODE.HEAVY_PIVOT && (
          <HeavyPivot
            onSkip={() => { patch({ heavyItems: [] }); goto(NODE.CONTACT); }}
            onYes={() => goto(NODE.HEAVY_SELECT)}
          />
        )}
        {node === NODE.HEAVY_SELECT && (
          <HeavySelect answers={answers} patch={patch} next={() => goto(NODE.CONTACT)} />
        )}
        {node === NODE.CONTACT && (
          <Contact
            answers={answers}
            patch={patch}
            submit={submit}
            submitting={submitting}
            submitErr={submitErr}
          />
        )}
        {node === NODE.SUCCESS && (
          <SuccessScreen answers={answers} restart={restart} />
        )}
      </main>

      <footer style={footerStyle}>
        <span style={{ fontSize: 11, color: T.mute }}>Your information stays private. Used only to match you with movers.</span>
      </footer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Step components                                                      ║
// ╚══════════════════════════════════════════════════════════════════════╝

function RouteStep({ answers, patch, next }) {
  const [pickupErr, setPickupErr] = useState('');
  const [destErr, setDestErr] = useState('');
  const [enriching, setEnriching] = useState(false);

  // Lazy ZIP-to-city/state via free zippopotam.us (no auth, generous limits).
  // If it fails, we still allow submission; server re-enriches via Mapbox.
  const enrich = useCallback(async (zip, side) => {
    if (!/^\d{5}$/.test(zip)) return;
    setEnriching(true);
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!res.ok) throw new Error('zip not found');
      const json = await res.json();
      const place = json.places && json.places[0];
      if (!place) throw new Error('no place');
      const city = place['place name'];
      const state = place['state abbreviation'];
      if (side === 'pickup') {
        patch({ originCity: city, originState: state });
      } else {
        patch({ destinationCity: city, destinationState: state });
      }
    } catch (_e) {
      // Non-fatal — submission still works; server enriches via Mapbox.
      if (side === 'pickup') patch({ originCity: '', originState: '' });
      else patch({ destinationCity: '', destinationState: '' });
    } finally {
      setEnriching(false);
    }
  }, [patch]);

  const handlePickup = (v) => {
    const cleaned = v.replace(/\D/g, '').slice(0, 5);
    patch({ pickupZip: cleaned });
    setPickupErr('');
    if (cleaned.length === 5) enrich(cleaned, 'pickup');
  };
  const handleDest = (v) => {
    const cleaned = v.replace(/\D/g, '').slice(0, 5);
    patch({ destinationZip: cleaned });
    setDestErr('');
    if (cleaned.length === 5) enrich(cleaned, 'dest');
  };

  const canContinue = answers.pickupZip.length === 5 && answers.destinationZip.length === 5
    && answers.pickupZip !== answers.destinationZip;

  const onContinue = () => {
    if (answers.pickupZip.length !== 5) { setPickupErr('Enter a 5-digit ZIP'); return; }
    if (answers.destinationZip.length !== 5) { setDestErr('Enter a 5-digit ZIP'); return; }
    if (answers.pickupZip === answers.destinationZip) {
      setDestErr('Destination must differ from origin'); return;
    }
    next();
  };

  // Crude client-side miles estimate via cached ZIP centroids. Not authoritative —
  // server recomputes via Mapbox. Only used for the route-preview banner.
  const milesEst = useMemo(() => {
    if (!answers.originCity || !answers.destinationCity) return null;
    // We don't ship a full ZIP→latlng table here. Skip the estimate; server
    // will compute it and display in the response. Showing "miles" depends
    // on server enrichment via the existing Mapbox pipeline.
    return null;
  }, [answers.originCity, answers.destinationCity]);

  const showPreview = answers.originCity && answers.destinationCity;

  return (
    <div style={stepStyle}>
      <h1 style={h1Style}>Where are you moving?</h1>
      <p style={subStyle}>We'll use this to match you with movers who serve your route.</p>

      <div style={fieldStyle}>
        <label style={labelStyle}>Moving from</label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="ZIP code"
          value={answers.pickupZip}
          onChange={e => handlePickup(e.target.value)}
          style={inputStyle}
          aria-invalid={!!pickupErr}
        />
        {answers.originCity && (
          <div style={hintStyle}>{answers.originCity}, {answers.originState}</div>
        )}
        {pickupErr && <div style={errStyle}>{pickupErr}</div>}
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Moving to</label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="ZIP code"
          value={answers.destinationZip}
          onChange={e => handleDest(e.target.value)}
          style={inputStyle}
          aria-invalid={!!destErr}
        />
        {answers.destinationCity && (
          <div style={hintStyle}>{answers.destinationCity}, {answers.destinationState}</div>
        )}
        {destErr && <div style={errStyle}>{destErr}</div>}
      </div>

      {showPreview && (
        <div style={routePreviewStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>
            {answers.originCity}, {answers.originState}
            <span style={{ color: T.accent, margin: '0 10px' }}>→</span>
            {answers.destinationCity}, {answers.destinationState}
          </div>
          {milesEst != null && (
            <div style={{ fontSize: 13, color: T.ink2, marginTop: 4 }}>
              ~{milesEst} miles
            </div>
          )}
        </div>
      )}

      <PrimaryBtn disabled={!canContinue || enriching} onClick={onContinue}>
        Continue
      </PrimaryBtn>
    </div>
  );
}

function TimingPivot({ onYes, onNo }) {
  return (
    <div style={stepStyle}>
      <h1 style={h1Style}>Do you already know your move date?</h1>
      <p style={subStyle}>Either way is fine — we'll match accordingly.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        <BigOption onClick={onYes} title="Yes, I know the date" sub="Pick from a calendar" />
        <BigOption onClick={onNo} title="Not exactly" sub="Choose a rough timeframe" />
      </div>
    </div>
  );
}

function DatePicker({ answers, patch, next }) {
  const min = tomorrowISO();
  const value = answers.moveDate && answers.moveDate.length === 10 ? answers.moveDate : '';

  const onChange = (v) => {
    patch({ moveDate: v, urgencyBucket: '' });
  };

  return (
    <div style={stepStyle}>
      <h1 style={h1Style}>When are you moving?</h1>
      <p style={subStyle}>Pick the day you want to move. Movers prepare accurate quotes around this.</p>

      <input
        type="date"
        value={value}
        min={min}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, fontSize: 18 }}
      />

      {value && (
        <div style={hintStyle}>{fmtDate(value)}</div>
      )}

      <PrimaryBtn disabled={!value} onClick={next}>Continue</PrimaryBtn>
    </div>
  );
}

function BucketSelect({ patch, next }) {
  const options = [
    { value: 'asap',       title: 'Within the next few weeks', sub: 'I need movers soon' },
    { value: 'this_month', title: '1–2 months out',            sub: 'I have some time to plan' },
    { value: 'flexible',   title: '2+ months out',             sub: 'Just exploring options' },
  ];
  const pick = (v) => {
    patch({ urgencyBucket: v, moveDate: '' });
    next();
  };
  return (
    <div style={stepStyle}>
      <h1 style={h1Style}>Roughly when?</h1>
      <p style={subStyle}>We use this to prioritize urgent moves and surface relevant movers.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {options.map(o => (
          <BigOption key={o.value} onClick={() => pick(o.value)} title={o.title} sub={o.sub} />
        ))}
      </div>
    </div>
  );
}

function HomeType({ patch, next }) {
  const options = [
    { value: 'house',      label: 'House' },
    { value: 'apartment',  label: 'Apartment' },
    { value: 'condo',      label: 'Condo' },
    { value: 'townhouse',  label: 'Townhouse' },
    { value: 'storage',    label: 'Storage unit' },
    { value: 'other',      label: 'Other' },
  ];
  const pick = (v) => { patch({ homeType: v }); next(); };
  return (
    <div style={stepStyle}>
      <h1 style={h1Style}>What are you moving out of?</h1>
      <p style={subStyle}>Helps movers plan the right crew and equipment.</p>

      <div style={chipGridStyle}>
        {options.map(o => (
          <ChipBtn key={o.value} onClick={() => pick(o.value)}>{o.label}</ChipBtn>
        ))}
      </div>
    </div>
  );
}

function HomeSize({ patch, next }) {
  const options = [
    'Studio',
    '1 Bedroom',
    '2 Bedroom',
    '3 Bedroom',
    '4 Bedroom',
    '5+ Bedroom',
  ];
  const pick = (v) => { patch({ homeSize: v }); next(); };
  return (
    <div style={stepStyle}>
      <h1 style={h1Style}>About how much are you moving?</h1>
      <p style={subStyle}>Pick the closest match — movers use this to estimate crew size and time.</p>

      <div style={chipGridStyle}>
        {options.map(o => (
          <ChipBtn key={o} onClick={() => pick(o)}>{o}</ChipBtn>
        ))}
      </div>
    </div>
  );
}

function Stairs({ patch, next }) {
  const options = [
    { value: 'ground_floor',   title: 'Ground floor',         sub: 'No stairs' },
    { value: 'walk_up_2',      title: '2nd floor walk-up',     sub: 'One flight of stairs' },
    { value: 'walk_up_3plus',  title: '3rd floor or higher',   sub: 'No elevator' },
    { value: 'elevator',       title: 'Elevator',              sub: 'Building has an elevator' },
  ];
  const pick = (v) => { patch({ stairs: v }); next(); };
  return (
    <div style={stepStyle}>
      <h1 style={h1Style}>Any stairs or an elevator?</h1>
      <p style={subStyle}>Movers use this to plan crew size and time accurately.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {options.map(o => (
          <BigOption key={o.value} onClick={() => pick(o.value)} title={o.title} sub={o.sub} />
        ))}
      </div>
    </div>
  );
}

function HeavyPivot({ onSkip, onYes }) {
  return (
    <div style={stepStyle}>
      <h1 style={h1Style}>Anything heavy or specialty?</h1>
      <p style={subStyle}>Pianos, safes, gym equipment, etc. Most moves don't have these.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        <BigOption onClick={onSkip}
          title="Nothing heavy"
          sub="Skip this — most moves don't need it"
          highlight={true}
        />
        <BigOption onClick={onYes}
          title="Yes, I have something"
          sub="Pick the items"
        />
      </div>
    </div>
  );
}

function HeavySelect({ answers, patch, next }) {
  const options = [
    { value: 'Piano',          label: 'Piano' },
    { value: 'Safe',           label: 'Safe' },
    { value: 'Pool table',     label: 'Pool table' },
    { value: 'Gym equipment',  label: 'Gym equipment' },
    { value: 'Appliances',     label: 'Large appliances' },
    { value: 'Other heavy',    label: 'Other heavy item' },
  ];
  const selected = new Set(answers.heavyItems);
  const toggle = (v) => {
    const s = new Set(selected);
    if (s.has(v)) s.delete(v); else s.add(v);
    patch({ heavyItems: Array.from(s) });
  };
  return (
    <div style={stepStyle}>
      <h1 style={h1Style}>Which items?</h1>
      <p style={subStyle}>Pick any that apply. We'll match movers who handle these.</p>

      <div style={chipGridStyle}>
        {options.map(o => {
          const isOn = selected.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              style={{
                ...chipBtnStyle,
                background: isOn ? T.accent : T.surface,
                color: isOn ? '#fff' : T.ink,
                borderColor: isOn ? T.accent : T.line,
                fontWeight: isOn ? 700 : 600,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <PrimaryBtn disabled={selected.size === 0} onClick={next}>
        Continue
      </PrimaryBtn>
    </div>
  );
}

function Contact({ answers, patch, submit, submitting, submitErr }) {
  const [errs, setErrs] = useState({});

  const validate = () => {
    const e = {};
    if (!answers.firstName.trim()) e.firstName = 'Required';
    if (!answers.customerPhone || !isValidUSPhone(answers.customerPhone)) e.phone = 'Enter a valid US phone';
    // Email is optional; if provided, must be valid shape.
    if (answers.customerEmail && !/^\S+@\S+\.\S+$/.test(answers.customerEmail.trim())) e.email = 'Invalid email';
    setErrs(e);
    return Object.keys(e).length === 0;
  };
  const onSubmit = () => {
    if (validate()) submit();
  };

  return (
    <div style={stepStyle}>
      <h1 style={h1Style}>Where should we send your quotes?</h1>
      <p style={subStyle}>Movers will reach out shortly. We won't share your info beyond matched movers.</p>

      <div style={fieldStyle}>
        <label style={labelStyle}>First name</label>
        <input
          type="text"
          autoComplete="given-name"
          value={answers.firstName}
          onChange={e => patch({ firstName: e.target.value })}
          style={inputStyle}
          aria-invalid={!!errs.firstName}
        />
        {errs.firstName && <div style={errStyle}>{errs.firstName}</div>}
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Phone number</label>
        <input
          type="tel"
          autoComplete="tel"
          inputMode="numeric"
          placeholder="(555) 123-4567"
          value={formatUSPhone(answers.customerPhone)}
          onChange={e => patch({ customerPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
          style={inputStyle}
          aria-invalid={!!errs.phone}
        />
        {errs.phone && <div style={errStyle}>{errs.phone}</div>}
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Email <span style={{ color: T.mute, fontWeight: 400 }}>(optional)</span></label>
        <input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={answers.customerEmail}
          onChange={e => patch({ customerEmail: e.target.value })}
          style={inputStyle}
          aria-invalid={!!errs.email}
        />
        {errs.email && <div style={errStyle}>{errs.email}</div>}
      </div>

      {submitErr && <div style={{ ...errStyle, marginTop: 8 }}>{submitErr}</div>}

      <PrimaryBtn disabled={submitting} onClick={onSubmit}>
        {submitting ? 'Sending…' : 'Get My Moving Quotes'}
      </PrimaryBtn>

      <p style={{ fontSize: 11, color: T.mute, marginTop: 12, lineHeight: 1.5 }}>
        By clicking, you confirm you want movers to contact you about this move. We never sell your info.
      </p>
    </div>
  );
}

function SuccessScreen({ answers, restart }) {
  return (
    <div style={stepStyle}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>✓</div>
      <h1 style={h1Style}>You're all set, {answers.firstName || 'there'}.</h1>
      <p style={subStyle}>Movers serving your route are being notified now. Expect calls or texts within a few hours.</p>

      <div style={{
        background: T.bg2, border: `1px solid ${T.line}`, borderRadius: 14, padding: 18, marginTop: 18,
        textAlign: 'left',
      }}>
        <div style={{ fontWeight: 700, color: T.ink, marginBottom: 8 }}>Your request</div>
        <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.7 }}>
          <div><strong>Route:</strong> {answers.originCity}, {answers.originState} → {answers.destinationCity}, {answers.destinationState}</div>
          {answers.moveDate && <div><strong>Date:</strong> {fmtDate(answers.moveDate)}</div>}
          {!answers.moveDate && answers.urgencyBucket && <div><strong>Timing:</strong> {answers.urgencyBucket.replace(/_/g, ' ')}</div>}
          <div><strong>Size:</strong> {answers.homeSize}</div>
          {answers.heavyItems.length > 0 && (
            <div><strong>Special items:</strong> {answers.heavyItems.join(', ')}</div>
          )}
        </div>
      </div>

      <button type="button" onClick={restart} style={{
        marginTop: 22, background: 'transparent', border: 'none', color: T.ink2,
        fontSize: 13, cursor: 'pointer', fontFamily: T.sans,
      }}>
        Submit another move
      </button>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Shared UI components                                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

function SectionDots({ active }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {SECTION_LABELS.map((_, i) => (
        <span key={i} style={{
          width: i === active ? 22 : 6, height: 6, borderRadius: 3,
          background: i <= active ? T.accent : T.line,
          transition: 'all 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      ))}
    </div>
  );
}

function PrimaryBtn({ disabled, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', marginTop: 22, padding: '15px 18px',
        background: disabled ? T.line : `linear-gradient(135deg, ${T.accent}, #E07000)`,
        color: '#fff', border: 'none', borderRadius: 14,
        fontFamily: T.sans, fontSize: 15, fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : T.ctaShadow,
        transition: 'all 200ms ease',
        letterSpacing: '0.01em',
      }}
    >
      {children}
    </button>
  );
}

function BigOption({ onClick, title, sub, highlight }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '16px 18px',
        background: highlight ? T.accentSoft : T.surface,
        border: `1.5px solid ${highlight ? T.accent : T.line}`,
        borderRadius: 14,
        cursor: 'pointer',
        fontFamily: T.sans,
        boxShadow: T.cardShadow,
        transition: 'all 180ms ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.borderColor = T.accent;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.borderColor = highlight ? T.accent : T.line;
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>{sub}</div>}
    </button>
  );
}

function ChipBtn({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={chipBtnStyle}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.ink; }}
    >
      {children}
    </button>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Styles                                                               ║
// ╚══════════════════════════════════════════════════════════════════════╝

const pageStyle = {
  minHeight: '100vh',
  background: T.bg,
  fontFamily: T.sans,
  color: T.ink,
  display: 'flex', flexDirection: 'column',
};

const headerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '18px 20px',
  background: T.surface,
  borderBottom: `1px solid ${T.line2}`,
};

const brandStyle = {
  fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em',
};

const mainStyle = {
  flex: 1,
  maxWidth: 520,
  width: '100%',
  margin: '0 auto',
  padding: '24px 20px 80px',
};

const backBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: T.ink2,
  fontFamily: T.sans,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '6px 0',
  marginBottom: 12,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const sectionLabelStyle = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: T.mute,
  marginBottom: 16,
};

const stepStyle = {
  background: T.surface,
  border: `1px solid ${T.line2}`,
  borderRadius: 18,
  padding: '28px 24px',
  boxShadow: T.cardShadow,
};

const h1Style = {
  fontSize: 22,
  fontWeight: 800,
  color: T.ink,
  margin: '0 0 8px',
  lineHeight: 1.25,
  letterSpacing: '-0.02em',
};

const subStyle = {
  fontSize: 13.5,
  color: T.ink2,
  margin: '0 0 20px',
  lineHeight: 1.5,
};

const fieldStyle = {
  marginBottom: 14,
};

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: T.ink2,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '13px 14px',
  fontSize: 16,
  fontFamily: T.sans,
  color: T.ink,
  border: `1.5px solid ${T.line}`,
  borderRadius: 12,
  background: T.surface,
  outline: 'none',
  transition: 'border-color 160ms ease',
};

const hintStyle = {
  fontSize: 12.5,
  color: T.ok,
  marginTop: 6,
  fontWeight: 600,
};

const errStyle = {
  fontSize: 12.5,
  color: T.danger,
  marginTop: 6,
  fontWeight: 600,
};

const routePreviewStyle = {
  marginTop: 18,
  padding: '14px 16px',
  background: T.bg2,
  border: `1px solid ${T.line}`,
  borderRadius: 12,
  textAlign: 'center',
};

const chipGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: 10,
  marginTop: 8,
};

const chipBtnStyle = {
  padding: '14px 12px',
  background: T.surface,
  border: `1.5px solid ${T.line}`,
  borderRadius: 12,
  color: T.ink,
  fontFamily: T.sans,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 180ms ease',
};

const footerStyle = {
  padding: '14px 20px',
  textAlign: 'center',
  background: T.surface,
  borderTop: `1px solid ${T.line2}`,
};
