import { useState, useRef, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'https://api.moveleads.cloud';

// ── Design tokens ──────────────────────────────────────────────────────────
const ACCENT = '#FF6A3D';
const ACCENT_DARK = '#e0522a';
const BG = '#0E0F13';
const CARD = '#16181F';
const CARD2 = '#1E2029';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#F4F4F5';
const MUTED = '#8B8D98';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600&display=swap');

  .gqv3 * { box-sizing: border-box; }
  .gqv3 {
    min-height: 100vh;
    background: ${BG};
    font-family: 'Manrope', 'DM Sans', -apple-system, sans-serif;
    color: ${TEXT};
    -webkit-font-smoothing: antialiased;
  }

  /* ── Progress bar ── */
  .gqv3-progress {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    height: 3px; background: rgba(255,255,255,0.07);
  }
  .gqv3-progress-fill {
    height: 100%; background: ${ACCENT};
    transition: width 0.4s cubic-bezier(.4,0,.2,1);
  }

  /* ── Nav ── */
  .gqv3-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 99;
    padding: 14px 24px;
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(14,15,19,0.92);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid ${BORDER};
  }
  .gqv3-logo {
    font-size: 17px; font-weight: 800; letter-spacing: -0.3px;
    color: ${TEXT};
    text-decoration: none;
  }
  .gqv3-logo span { color: ${ACCENT}; }
  .gqv3-nav-right {
    font-size: 13px; color: ${MUTED};
  }
  .gqv3-nav-right strong { color: ${TEXT}; }

  /* ── Wrapper ── */
  .gqv3-screen {
    min-height: 100vh;
    padding: 80px 20px 40px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .gqv3-container {
    width: 100%; max-width: 520px;
  }

  /* ── Step label ── */
  .gqv3-step-label {
    font-size: 12px; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: ${ACCENT};
    margin-bottom: 10px;
  }

  /* ── Headline ── */
  .gqv3-headline {
    font-size: clamp(26px, 5vw, 42px);
    font-weight: 800; line-height: 1.15; letter-spacing: -0.5px;
    margin: 0 0 10px;
  }
  .gqv3-sub {
    font-size: 15px; color: ${MUTED}; line-height: 1.55;
    margin: 0 0 28px;
  }

  /* ── Chips ── */
  .gqv3-chips {
    display: grid; gap: 10px;
    grid-template-columns: 1fr 1fr;
    margin-bottom: 24px;
  }
  .gqv3-chips.cols1 { grid-template-columns: 1fr; }
  .gqv3-chips.cols4 { grid-template-columns: 1fr 1fr; }
  .gqv3-chip {
    position: relative;
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px;
    background: ${CARD}; border: 1.5px solid ${BORDER};
    border-radius: 12px; cursor: pointer;
    font-size: 14px; font-weight: 600; color: ${TEXT};
    transition: border-color 0.15s, background 0.15s, transform 0.1s;
    user-select: none;
    text-align: left;
  }
  .gqv3-chip:hover { border-color: rgba(255,106,61,0.4); background: ${CARD2}; }
  .gqv3-chip.active {
    border-color: ${ACCENT}; background: rgba(255,106,61,0.08);
  }
  .gqv3-chip:active { transform: scale(0.98); }
  .gqv3-chip-icon { font-size: 20px; flex-shrink: 0; }
  .gqv3-chip-text { flex: 1; }
  .gqv3-chip-name { display: block; font-weight: 700; font-size: 14px; }
  .gqv3-chip-desc { display: block; font-size: 11px; color: ${MUTED}; font-weight: 500; margin-top: 2px; }
  .gqv3-badge {
    position: absolute; top: -8px; right: 10px;
    background: ${ACCENT}; color: #fff;
    font-size: 9px; font-weight: 800; letter-spacing: 0.8px;
    text-transform: uppercase; padding: 2px 7px; border-radius: 20px;
  }
  .gqv3-chip-check {
    width: 18px; height: 18px; border-radius: 50%;
    background: ${ACCENT}; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; opacity: 0; transition: opacity 0.15s;
  }
  .gqv3-chip.active .gqv3-chip-check { opacity: 1; }

  /* ── Date section ── */
  .gqv3-date-or {
    display: flex; align-items: center; gap: 12px;
    margin: 16px 0;
    font-size: 12px; color: ${MUTED}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;
  }
  .gqv3-date-or::before, .gqv3-date-or::after {
    content: ''; flex: 1; height: 1px; background: ${BORDER};
  }
  .gqv3-date-input {
    width: 100%; padding: 14px 16px;
    background: ${CARD}; border: 1.5px solid ${BORDER};
    border-radius: 12px; color: ${TEXT};
    font-family: inherit; font-size: 14px; font-weight: 600;
    outline: none; transition: border-color 0.15s;
    color-scheme: dark;
  }
  .gqv3-date-input:focus { border-color: ${ACCENT}; }
  .gqv3-date-input::-webkit-calendar-picker-indicator { filter: invert(1) opacity(0.5); cursor: pointer; }

  /* ── ZIP inputs ── */
  .gqv3-zip-wrap {
    display: flex; flex-direction: column; gap: 10px;
    margin-bottom: 20px;
  }
  .gqv3-zip-row {
    position: relative;
  }
  .gqv3-zip-icon {
    position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
    font-size: 16px; pointer-events: none;
  }
  .gqv3-input {
    width: 100%; padding: 14px 16px 14px 40px;
    background: ${CARD}; border: 1.5px solid ${BORDER};
    border-radius: 12px; color: ${TEXT};
    font-family: inherit; font-size: 15px; font-weight: 600;
    outline: none; transition: border-color 0.15s;
  }
  .gqv3-input::placeholder { color: ${MUTED}; font-weight: 500; }
  .gqv3-input:focus { border-color: ${ACCENT}; }
  .gqv3-input.error { border-color: #ef4444; }
  .gqv3-city-label {
    font-size: 12px; color: ${MUTED}; margin-top: 4px; padding-left: 4px;
    min-height: 16px; transition: color 0.2s;
  }
  .gqv3-city-label.found { color: #22c55e; }

  /* ── Contact form ── */
  .gqv3-field { margin-bottom: 12px; }
  .gqv3-field label {
    display: block; font-size: 12px; font-weight: 700;
    color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.8px;
    margin-bottom: 6px;
  }
  .gqv3-field-input {
    width: 100%; padding: 14px 16px;
    background: ${CARD}; border: 1.5px solid ${BORDER};
    border-radius: 12px; color: ${TEXT};
    font-family: inherit; font-size: 15px;
    outline: none; transition: border-color 0.15s;
  }
  .gqv3-field-input::placeholder { color: ${MUTED}; }
  .gqv3-field-input:focus { border-color: ${ACCENT}; }
  .gqv3-field-input.error { border-color: #ef4444; }
  .gqv3-field-error { font-size: 12px; color: #ef4444; margin-top: 4px; padding-left: 2px; }

  /* ── TCPA ── */
  .gqv3-tcpa {
    font-size: 11px; color: ${MUTED}; line-height: 1.55;
    padding: 12px; background: rgba(255,255,255,0.03);
    border-radius: 8px; margin-bottom: 16px;
  }

  /* ── CTA button ── */
  .gqv3-btn {
    width: 100%; padding: 16px;
    background: ${ACCENT}; color: #fff;
    border: none; border-radius: 12px; cursor: pointer;
    font-family: inherit; font-size: 16px; font-weight: 800;
    letter-spacing: -0.2px;
    transition: background 0.15s, transform 0.1s, opacity 0.15s;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .gqv3-btn:hover:not(:disabled) { background: ${ACCENT_DARK}; }
  .gqv3-btn:active:not(:disabled) { transform: scale(0.99); }
  .gqv3-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .gqv3-btn.secondary {
    background: transparent; border: 1.5px solid ${BORDER}; color: ${MUTED};
    font-size: 14px; font-weight: 600; padding: 12px;
    margin-top: 10px;
  }
  .gqv3-btn.secondary:hover:not(:disabled) { border-color: rgba(255,255,255,0.2); color: ${TEXT}; background: transparent; }

  /* ── Back button ── */
  .gqv3-back {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 13px; color: ${MUTED}; font-weight: 600;
    background: none; border: none; cursor: pointer; padding: 0;
    margin-bottom: 20px; transition: color 0.15s;
  }
  .gqv3-back:hover { color: ${TEXT}; }

  /* ── Error banner ── */
  .gqv3-error {
    padding: 12px 14px; background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3); border-radius: 10px;
    font-size: 13px; color: #fca5a5; margin-bottom: 16px;
    line-height: 1.5;
  }

  /* ── Trust strip ── */
  .gqv3-trust {
    display: flex; align-items: center; justify-content: center; gap: 16px;
    flex-wrap: wrap;
    margin-top: 20px;
    padding: 14px;
    background: rgba(255,255,255,0.03); border-radius: 10px;
    border: 1px solid ${BORDER};
  }
  .gqv3-trust-item {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: ${MUTED}; font-weight: 600;
  }
  .gqv3-trust-item span:first-child { font-size: 14px; }

  /* ── Confirm screen ── */
  .gqv3-confirm-icon {
    width: 72px; height: 72px; border-radius: 50%;
    background: rgba(34,197,94,0.15); border: 2px solid rgba(34,197,94,0.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 32px; margin: 0 auto 20px;
  }
  .gqv3-confirm-title {
    font-size: 28px; font-weight: 800; text-align: center; margin: 0 0 8px;
  }
  .gqv3-confirm-sub {
    font-size: 15px; color: ${MUTED}; text-align: center; margin: 0 0 28px; line-height: 1.6;
  }
  .gqv3-steps-list {
    display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;
  }
  .gqv3-step-item {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 14px; background: ${CARD}; border-radius: 10px;
    border: 1px solid ${BORDER};
  }
  .gqv3-step-num {
    width: 26px; height: 26px; border-radius: 50%;
    background: rgba(255,106,61,0.15); border: 1px solid rgba(255,106,61,0.3);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 800; color: ${ACCENT}; flex-shrink: 0;
  }
  .gqv3-step-body strong { display: block; font-size: 14px; font-weight: 700; margin-bottom: 2px; }
  .gqv3-step-body span { font-size: 13px; color: ${MUTED}; }

  /* ── Hero specific ── */
  .gqv3-hero-card {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px;
    background: ${CARD}; border-radius: 10px; border: 1px solid ${BORDER};
    margin-bottom: 24px; width: fit-content;
  }
  .gqv3-stars { color: #FBBF24; font-size: 14px; letter-spacing: 1px; }
  .gqv3-hero-card-text { font-size: 13px; font-weight: 600; }
  .gqv3-hero-card-text span { color: ${MUTED}; font-weight: 500; }

  /* ── Spinner ── */
  @keyframes spin { to { transform: rotate(360deg); } }
  .gqv3-spinner {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  /* ── Fade in ── */
  @keyframes gqv3-fadein { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  .gqv3-fadein { animation: gqv3-fadein 0.3s ease; }

  @media (max-width: 480px) {
    .gqv3-chips { grid-template-columns: 1fr; }
    .gqv3-chips.cols4 { grid-template-columns: 1fr 1fr; }
    .gqv3-headline { font-size: 26px; }
  }
`;

// ── ZIP → city lookup (free public API) ─────────────────────────────────────
const zipCache = {};
async function lookupZip(zip) {
  if (zipCache[zip] !== undefined) return zipCache[zip];
  try {
    const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!r.ok) { zipCache[zip] = null; return null; }
    const data = await r.json();
    const place = data.places?.[0];
    if (!place) { zipCache[zip] = null; return null; }
    const result = { city: place['place name'], state: place['state abbreviation'] };
    zipCache[zip] = result;
    return result;
  } catch {
    zipCache[zip] = null;
    return null;
  }
}

// ── Date helpers ─────────────────────────────────────────────────────────────
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

function dateFromPicker(dateStr) {
  // dateStr is YYYY-MM-DD from <input type="date">
  if (!dateStr) return null;
  return `${dateStr}T12:00:00.000Z`;
}

const URGENCY_OPTIONS = [
  { id: 'asap',  icon: '⚡', label: 'ASAP',          desc: 'Within a few days',  days: 3  },
  { id: '2wks',  icon: '📅', label: 'In 2 weeks',    desc: 'About 2 weeks out',  days: 14 },
  { id: 'month', icon: '🗓️', label: 'In ~1 month',   desc: 'Roughly 4 weeks',    days: 30 },
  { id: 'plan',  icon: '🔭', label: 'Just planning',  desc: 'No rush, 2+ months', days: 60 },
];

const SERVICE_OPTIONS = [
  { id: 'apt',  icon: '🏢', name: 'Local apartment', desc: 'Studio to 2 bed',      homeSize: '1 Bedroom',  distance: 'Local'         },
  { id: 'house',icon: '🏡', name: 'Local house',      desc: '3+ bedrooms',          homeSize: '3 Bedroom',  distance: 'Local'         },
  { id: 'long', icon: '🚛', name: 'Long distance',    desc: 'Cross-state or 100+ mi', homeSize: '2 Bedroom', distance: 'Long Distance', popular: true },
  { id: 'office',icon:'🏗️', name: 'Office / business',desc: 'Commercial move',      homeSize: '2 Bedroom',  distance: 'Local'         },
  { id: 'pack', icon: '📦', name: 'Packing only',     desc: 'No truck needed',      homeSize: '1 Bedroom',  distance: 'Local'         },
  { id: 'spec', icon: '🎨', name: 'Specialty item',   desc: 'Piano, art, safe',     homeSize: '2 Bedroom',  distance: 'Local'         },
];

// ── Phone formatter ──────────────────────────────────────────────────────────
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

function toE164(formatted) {
  const digits = formatted.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+1${digits}`;
}

// ── Today's date string for min attribute ────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
export default function GetQuoteV3() {
  const [step, setStep] = useState(0); // 0=hero, 1=service, 2=date, 3=route, 4=contact, 5=confirm
  const [service, setService] = useState(null);
  const [urgency, setUrgency] = useState(null);
  const [pickerDate, setPickerDate] = useState('');
  const [originZip, setOriginZip] = useState('');
  const [destZip, setDestZip] = useState('');
  const [originInfo, setOriginInfo] = useState(null);
  const [destInfo, setDestInfo] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  const originTimer = useRef(null);
  const destTimer = useRef(null);

  // Inject CSS once
  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'gqv3-style';
    el.textContent = css;
    if (!document.getElementById('gqv3-style')) document.head.appendChild(el);
    return () => { const s = document.getElementById('gqv3-style'); if (s) s.remove(); };
  }, []);

  const totalSteps = 5; // steps 1-5 (hero is step 0, not counted in bar)
  const progressPct = step === 0 ? 0 : Math.round((step / totalSteps) * 100);

  // ZIP debounce lookup
  const handleOriginZip = useCallback((val) => {
    const digits = val.replace(/\D/g, '').slice(0, 5);
    setOriginZip(digits);
    setOriginInfo(null);
    clearTimeout(originTimer.current);
    if (digits.length === 5) {
      originTimer.current = setTimeout(async () => {
        const info = await lookupZip(digits);
        setOriginInfo(info);
      }, 300);
    }
  }, []);

  const handleDestZip = useCallback((val) => {
    const digits = val.replace(/\D/g, '').slice(0, 5);
    setDestZip(digits);
    setDestInfo(null);
    clearTimeout(destTimer.current);
    if (digits.length === 5) {
      destTimer.current = setTimeout(async () => {
        const info = await lookupZip(digits);
        setDestInfo(info);
      }, 300);
    }
  }, []);

  // Resolve move date from urgency or picker
  const resolvedMoveDate = useCallback(() => {
    if (pickerDate) return dateFromPicker(pickerDate);
    const opt = URGENCY_OPTIONS.find(o => o.id === urgency);
    return opt ? futureDate(opt.days) : null;
  }, [pickerDate, urgency]);

  // Step validations
  const canContinueDate = urgency !== null || pickerDate !== '';
  const canContinueRoute = originZip.length === 5 && destZip.length === 5 && originZip !== destZip && originInfo && destInfo;

  function validateContact() {
    const errs = {};
    if (!name.trim() || name.trim().length < 2) errs.name = 'Enter your full name';
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) errs.phone = 'Enter a valid 10-digit US phone number';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email address';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validateContact()) return;
    setSubmitError('');
    setLoading(true);

    const svc = SERVICE_OPTIONS.find(s => s.id === service);
    const moveDate = resolvedMoveDate();

    // Determine distance
    let distance = svc?.distance || 'Local';
    if (originInfo && destInfo && originInfo.state !== destInfo.state) {
      distance = 'Long Distance';
    }

    const payload = {
      customerName: name.trim(),
      customerEmail: email.trim().toLowerCase() || `noemail+${Date.now()}@moveleads.cloud`,
      customerPhone: toE164(phone),
      originCity: originInfo?.city || '',
      originState: originInfo?.state || '',
      originZip,
      destinationCity: destInfo?.city || '',
      destinationState: destInfo?.state || '',
      destinationZip: destZip,
      homeSize: svc?.homeSize || '2 Bedroom',
      moveDate,
      distance,
      miles: 0,
    };

    try {
      const res = await fetch(`${API}/api/leads/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || data.success === false) {
        const msg = data.message || data.errors
          ? Object.values(data.errors || {}).join('. ') || data.message
          : 'Something went wrong. Please try again.';
        setSubmitError(msg);
        setLoading(false);
        return;
      }

      // Google Ads conversion
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', { send_to: 'AW-18096682129' });
      }

      setStep(5);
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function goTo(n) {
    setSubmitError('');
    setFieldErrors({});
    setStep(n);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="gqv3">
      {/* Progress */}
      <div className="gqv3-progress">
        <div className="gqv3-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Nav */}
      <nav className="gqv3-nav">
        <a href="/" className="gqv3-logo">Move<span>Leads</span>.cloud</a>
        {step > 0 && step < 5 && (
          <span className="gqv3-nav-right">Step <strong>{step}</strong> of {totalSteps}</span>
        )}
      </nav>

      {/* ── Step 0: Hero ─────────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="gqv3-screen gqv3-fadein">
          <div className="gqv3-container">
            <div className="gqv3-hero-card">
              <div className="gqv3-stars">★★★★★</div>
              <div className="gqv3-hero-card-text">
                4.9/5 rating · <span>2,400+ happy movers</span>
              </div>
            </div>

            <h1 className="gqv3-headline">
              You're probably <span style={{ color: ACCENT }}>overpaying</span> for your move.
            </h1>
            <p className="gqv3-sub">
              Get matched with 1–3 licensed, vetted movers who compete for your business. Free, fast, no spam.
            </p>

            <button className="gqv3-btn" onClick={() => goTo(1)}>
              Get My Free Quotes →
            </button>

            <div className="gqv3-trust" style={{ marginTop: 20 }}>
              <div className="gqv3-trust-item"><span>💰</span><span>Save up to 40%</span></div>
              <div className="gqv3-trust-item"><span>⚡</span><span>15-min response</span></div>
              <div className="gqv3-trust-item"><span>🔒</span><span>No spam, ever</span></div>
              <div className="gqv3-trust-item"><span>✅</span><span>Licensed movers only</span></div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 1: Service type ──────────────────────────────────────────── */}
      {step === 1 && (
        <div className="gqv3-screen gqv3-fadein">
          <div className="gqv3-container">
            <button className="gqv3-back" onClick={() => goTo(0)}>← Back</button>
            <div className="gqv3-step-label">Step 1 of 5</div>
            <h2 className="gqv3-headline">What are you moving?</h2>
            <p className="gqv3-sub">Pick the option that best describes your move.</p>

            <div className="gqv3-chips">
              {SERVICE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  className={`gqv3-chip${service === opt.id ? ' active' : ''}`}
                  onClick={() => { setService(opt.id); goTo(2); }}
                >
                  {opt.popular && <span className="gqv3-badge">Popular</span>}
                  <span className="gqv3-chip-icon">{opt.icon}</span>
                  <span className="gqv3-chip-text">
                    <span className="gqv3-chip-name">{opt.name}</span>
                    <span className="gqv3-chip-desc">{opt.desc}</span>
                  </span>
                  <span className="gqv3-chip-check">✓</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Move date ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="gqv3-screen gqv3-fadein">
          <div className="gqv3-container">
            <button className="gqv3-back" onClick={() => goTo(1)}>← Back</button>
            <div className="gqv3-step-label">Step 2 of 5</div>
            <h2 className="gqv3-headline">When are you moving?</h2>
            <p className="gqv3-sub">An approximate date helps movers give you better quotes.</p>

            <div className="gqv3-chips cols4">
              {URGENCY_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  className={`gqv3-chip${urgency === opt.id && !pickerDate ? ' active' : ''}`}
                  onClick={() => { setUrgency(opt.id); setPickerDate(''); }}
                >
                  <span className="gqv3-chip-icon">{opt.icon}</span>
                  <span className="gqv3-chip-text">
                    <span className="gqv3-chip-name">{opt.label}</span>
                    <span className="gqv3-chip-desc">{opt.desc}</span>
                  </span>
                  <span className="gqv3-chip-check">✓</span>
                </button>
              ))}
            </div>

            <div className="gqv3-date-or">or pick a date</div>

            <input
              type="date"
              className="gqv3-date-input"
              min={todayStr()}
              value={pickerDate}
              onChange={e => { setPickerDate(e.target.value); setUrgency(null); }}
            />

            <button
              className="gqv3-btn"
              style={{ marginTop: 20 }}
              disabled={!canContinueDate}
              onClick={() => goTo(3)}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Route (ZIPs) ──────────────────────────────────────────── */}
      {step === 3 && (
        <div className="gqv3-screen gqv3-fadein">
          <div className="gqv3-container">
            <button className="gqv3-back" onClick={() => goTo(2)}>← Back</button>
            <div className="gqv3-step-label">Step 3 of 5</div>
            <h2 className="gqv3-headline">Where are you moving?</h2>
            <p className="gqv3-sub">Enter your ZIP codes so we can match you with local movers.</p>

            <div className="gqv3-zip-wrap">
              <div className="gqv3-zip-row">
                <span className="gqv3-zip-icon">📍</span>
                <input
                  className={`gqv3-input${originZip.length === 5 && !originInfo ? ' error' : ''}`}
                  placeholder="Moving from ZIP"
                  value={originZip}
                  maxLength={5}
                  inputMode="numeric"
                  onChange={e => handleOriginZip(e.target.value)}
                />
                <div className={`gqv3-city-label${originInfo ? ' found' : ''}`}>
                  {originInfo ? `✓ ${originInfo.city}, ${originInfo.state}` : originZip.length === 5 ? 'ZIP not found' : ''}
                </div>
              </div>

              <div className="gqv3-zip-row">
                <span className="gqv3-zip-icon">🏁</span>
                <input
                  className={`gqv3-input${destZip.length === 5 && !destInfo ? ' error' : ''}`}
                  placeholder="Moving to ZIP"
                  value={destZip}
                  maxLength={5}
                  inputMode="numeric"
                  onChange={e => handleDestZip(e.target.value)}
                />
                <div className={`gqv3-city-label${destInfo ? ' found' : ''}`}>
                  {destInfo ? `✓ ${destInfo.city}, ${destInfo.state}` : destZip.length === 5 ? 'ZIP not found' : ''}
                </div>
              </div>

              {originZip === destZip && originZip.length === 5 && (
                <div className="gqv3-error">Origin and destination ZIP codes cannot be the same.</div>
              )}
            </div>

            <button
              className="gqv3-btn"
              disabled={!canContinueRoute}
              onClick={() => goTo(4)}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Contact info ──────────────────────────────────────────── */}
      {step === 4 && (
        <div className="gqv3-screen gqv3-fadein">
          <div className="gqv3-container">
            <button className="gqv3-back" onClick={() => goTo(3)}>← Back</button>
            <div className="gqv3-step-label">Step 4 of 5</div>
            <h2 className="gqv3-headline">Where should we send your quotes?</h2>
            <p className="gqv3-sub">Movers will contact you directly. No middlemen, no spam.</p>

            {submitError && <div className="gqv3-error">{submitError}</div>}

            <div className="gqv3-field">
              <label>Full name</label>
              <input
                className={`gqv3-field-input${fieldErrors.name ? ' error' : ''}`}
                placeholder="Jane Smith"
                value={name}
                autoComplete="name"
                onChange={e => setName(e.target.value)}
              />
              {fieldErrors.name && <div className="gqv3-field-error">{fieldErrors.name}</div>}
            </div>

            <div className="gqv3-field">
              <label>Phone number</label>
              <input
                className={`gqv3-field-input${fieldErrors.phone ? ' error' : ''}`}
                placeholder="(555) 123-4567"
                value={phone}
                inputMode="tel"
                autoComplete="tel"
                onChange={e => setPhone(formatPhone(e.target.value))}
              />
              {fieldErrors.phone && <div className="gqv3-field-error">{fieldErrors.phone}</div>}
            </div>

            <div className="gqv3-field">
              <label>Email <span style={{ color: MUTED, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <input
                className={`gqv3-field-input${fieldErrors.email ? ' error' : ''}`}
                type="email"
                placeholder="jane@example.com"
                value={email}
                autoComplete="email"
                onChange={e => setEmail(e.target.value)}
              />
              {fieldErrors.email && <div className="gqv3-field-error">{fieldErrors.email}</div>}
            </div>

            <div className="gqv3-tcpa">
              By submitting this form you agree to receive calls or texts from up to 3 verified moving companies regarding your move. Message & data rates may apply. Reply STOP to opt out.
            </div>

            <button className="gqv3-btn" onClick={handleSubmit} disabled={loading}>
              {loading ? <><span className="gqv3-spinner" /> Getting your quotes…</> : 'Get My Free Quotes →'}
            </button>

            <div className="gqv3-trust" style={{ marginTop: 16 }}>
              <div className="gqv3-trust-item"><span>🔒</span><span>Your info is private</span></div>
              <div className="gqv3-trust-item"><span>✅</span><span>Licensed movers only</span></div>
              <div className="gqv3-trust-item"><span>⚡</span><span>15-min response time</span></div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 5: Confirmation ──────────────────────────────────────────── */}
      {step === 5 && (
        <div className="gqv3-screen gqv3-fadein">
          <div className="gqv3-container">
            <div className="gqv3-confirm-icon">✓</div>
            <h2 className="gqv3-confirm-title">You're all set!</h2>
            <p className="gqv3-confirm-sub">
              Your quote request is live. Verified movers are being matched to your route right now.
            </p>

            <div className="gqv3-steps-list">
              {[
                { n: '1', title: 'Movers are notified',   desc: 'Licensed companies serving your route see your request instantly.' },
                { n: '2', title: 'Expect a call or text', desc: `We'll send your contact info to up to 3 matched movers. Most respond within 15 minutes.` },
                { n: '3', title: 'Compare & choose',      desc: 'You\'re in control. Pick the mover you like best — no pressure, no obligation.' },
              ].map(s => (
                <div className="gqv3-step-item" key={s.n}>
                  <div className="gqv3-step-num">{s.n}</div>
                  <div className="gqv3-step-body">
                    <strong>{s.title}</strong>
                    <span>{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 16, background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Pro tips</div>
              {[
                '📞 Answer unknown numbers — movers respond fast',
                '💬 Ask about in-home estimates for larger moves',
                '📋 Have an inventory list ready to speed up quotes',
              ].map(tip => (
                <div key={tip} style={{ fontSize: 13, color: TEXT, padding: '6px 0', borderBottom: `1px solid ${BORDER}`, lineHeight: 1.5 }}>{tip}</div>
              ))}
            </div>

            <a href="/" className="gqv3-btn" style={{ textDecoration: 'none', display: 'flex' }}>
              Back to MoveLeads.cloud
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
