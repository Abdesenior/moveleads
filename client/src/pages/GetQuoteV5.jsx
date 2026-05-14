import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

/**
 * GetQuoteV5 — Phase 3 funnel.
 *
 * Mobile-first 8-step lead funnel, posts to POST /api/leads/ingest-v2.
 * V4 remains the production funnel; V5 lives at `/get-quote-v5` and is not
 * advertised yet. The two coexist with zero shared state.
 *
 * Funnel structure (low-commitment first, intent last):
 *   1. Pickup ZIP
 *   2. Destination ZIP
 *   3. Move date + urgency chip (auto-suggests sensible date)
 *   4. Move size (visual cards, auto-advance)
 *   5. Heavy items (multi-select chips, skippable)
 *   6. First name + phone (email optional, collapsed)
 *   7. Intent confirmation (explicit consent CTA — populates intentConfirmed)
 *   8. Success
 *
 * Why this order: ZIPs first feel like an availability check, not a form.
 * Each subsequent step asks for slightly more commitment. Intent is the
 * last gate so users who don't really want quotes drop out before we send
 * SMS notifications to movers.
 */

const API = import.meta.env.VITE_API_URL || 'https://api.moveleads.cloud';

// ── Design tokens (copied from V4 so brand stays coherent) ─────────────────
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

// ── SVG icons (small, stroke-based, match V4 set) ──────────────────────────
const Ico = {
  arrow: (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
  back: (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 19l-7-7 7-7"/></svg>,
  check: (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>,
  pin: (s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  cal: (s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  studio: (s = 28) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  apt: (s = 28) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 9h16M4 15h16M9 3v18M15 3v18"/></svg>,
  house: (s = 28) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 01-1 1H4a1 1 0 01-1-1z"/><path d="M9 21v-7h6v7"/></svg>,
  office: (s = 28) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/></svg>,
  shield: (s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  bolt: (s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  star: (s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

const STEPS_TOTAL = 7; // 7 input steps + success; "step / total" displays based on input steps only
const HOME_SIZES = [
  { value: 'Studio', label: 'Studio', sub: '~250 sqft', icon: Ico.studio },
  { value: '1 Bedroom', label: '1 Bedroom', sub: 'compact apartment', icon: Ico.apt },
  { value: '2 Bedroom', label: '2 Bedroom', sub: 'apartment / condo', icon: Ico.apt },
  { value: '3 Bedroom', label: '3 Bedroom', sub: 'house / large apt', icon: Ico.house },
  { value: '4 Bedroom', label: '4 Bedroom', sub: 'family home', icon: Ico.house },
  { value: '4+ Bedroom', label: '5+ Bedroom', sub: 'large home', icon: Ico.house },
  { value: 'Office / Commercial', label: 'Office', sub: 'commercial space', icon: Ico.office },
];
const URGENCY_CHIPS = [
  { value: 'asap',       label: 'ASAP',         daysOffset: 3,  hint: 'Within a week' },
  { value: 'this_week',  label: 'This week',    daysOffset: 5,  hint: 'Within 7 days' },
  { value: 'this_month', label: 'This month',   daysOffset: 21, hint: 'Within 30 days' },
  { value: 'flexible',   label: "I'm flexible", daysOffset: 60, hint: '2+ months out' },
];
const HEAVY_ITEMS = [
  'Piano', 'Pool table', 'Safe', 'Hot tub', 'Gym equipment',
  'Antiques', 'Artwork', 'Large appliances', 'Vehicle / motorcycle',
];

/* ──────────────────────────────────────────────────────────────────────── */
export default function GetQuoteV5() {
  // Step machine — 1..7 input steps, 8 = success
  const [step, setStep] = useState(1);
  // direction: 1 = forward, -1 = back. drives transition animation
  const [direction, setDirection] = useState(1);

  // Form state
  const [pickupZip, setPickupZip] = useState('');
  const [destinationZip, setDestinationZip] = useState('');
  const [urgencyBucket, setUrgencyBucket] = useState('');
  const [moveDate, setMoveDate] = useState(''); // YYYY-MM-DD
  const [moveSize, setMoveSize] = useState('');
  const [heavyItems, setHeavyItems] = useState([]);
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState(''); // formatted "xxx-xxx-xxxx"
  const [email, setEmail] = useState(''); // optional
  const [showEmailField, setShowEmailField] = useState(false);
  const [intentConfirmed, setIntentConfirmed] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedLead, setSubmittedLead] = useState(null);

  // Stable per-session identifier — generated once, survives re-renders
  const clientSubmissionIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `v5-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  // Per-step input focus
  const firstFieldRef = useRef(null);
  useEffect(() => {
    if (firstFieldRef.current && step <= 7) {
      // Slight delay so the transition completes before focus, prevents iOS keyboard glitches
      const t = setTimeout(() => firstFieldRef.current?.focus(), 240);
      return () => clearTimeout(t);
    }
  }, [step]);

  /* ── Validation per step (memoized, gates Continue button) ──────────── */
  const stepValid = useMemo(() => {
    switch (step) {
      case 1: return /^\d{5}$/.test(pickupZip);
      case 2: return /^\d{5}$/.test(destinationZip) && destinationZip !== pickupZip;
      case 3: return Boolean(urgencyBucket) && Boolean(moveDate) && (new Date(moveDate) > new Date());
      case 4: return Boolean(moveSize);
      case 5: return true; // heavy items optional
      case 6: {
        const digits = phone.replace(/\D/g, '');
        const okPhone = digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
        const okName = firstName.trim().length >= 1;
        const okEmail = !email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
        return okName && okPhone && okEmail;
      }
      case 7: return intentConfirmed === true;
      default: return false;
    }
  }, [step, pickupZip, destinationZip, urgencyBucket, moveDate, moveSize, phone, firstName, email, intentConfirmed]);

  /* ── Navigation ────────────────────────────────────────────────────── */
  const goNext = useCallback(() => {
    if (!stepValid) return;
    if (step < 7) {
      setDirection(1);
      setStep(s => s + 1);
    } else {
      void submit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, stepValid]);

  const goBack = useCallback(() => {
    if (step <= 1) return;
    setDirection(-1);
    setStep(s => s - 1);
  }, [step]);

  // Enter key — advances any time the step is valid
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Enter' && step >= 1 && step <= 7 && stepValid && !submitting) {
        e.preventDefault();
        goNext();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, stepValid, submitting, goNext]);

  /* ── Submission ───────────────────────────────────────────────────── */
  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');

    const digits = phone.replace(/\D/g, '');
    const phoneE164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;

    // Move-date as ISO at noon UTC (matches V4 / cutoff conventions)
    const isoDate = moveDate ? new Date(`${moveDate}T12:00:00.000Z`).toISOString() : null;

    const payload = {
      firstName: firstName.trim(),
      customerPhone: phoneE164,
      ...(email && { customerEmail: email.trim().toLowerCase() }),
      pickupZip,
      destinationZip,
      moveDate: isoDate,
      urgencyBucket,
      moveSize,
      heavyItems,
      intentConfirmed,
      clientSubmissionId: clientSubmissionIdRef.current,
      funnelVersion: 'v5',
    };

    try {
      const res = await fetch(`${API}/api/leads/ingest-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        const msg = data.errors
          ? Object.values(data.errors).join('. ')
          : data.message || 'Something went wrong. Please try again.';
        setSubmitError(msg);
        setSubmitting(false);
        return;
      }
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', { send_to: 'AW-18096682129', funnel: 'v5' });
      }
      setSubmittedLead(data.lead);
      setStep(8);
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Phone live formatting ────────────────────────────────────────── */
  function onPhoneChange(e) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
    // Strip leading 1 for display so the formatter doesn't show "1-xxx-..."
    const digits = raw.startsWith('1') && raw.length === 11 ? raw.slice(1) : raw;
    let formatted = digits;
    if (digits.length >= 4 && digits.length <= 6) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else if (digits.length >= 7) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
    setPhone(formatted);
  }

  /* ── ZIP input with auto-advance ──────────────────────────────────── */
  function onZipChange(setter, value) {
    const cleaned = String(value).replace(/\D/g, '').slice(0, 5);
    setter(cleaned);
  }

  /* ── Urgency chip click — auto-fills a sensible date ──────────────── */
  function onUrgencyClick(bucket) {
    setUrgencyBucket(bucket.value);
    const d = new Date(Date.now() + bucket.daysOffset * 86400000);
    const iso = d.toISOString().slice(0, 10);
    setMoveDate(iso);
  }

  /* ── Heavy items toggle ───────────────────────────────────────────── */
  function toggleHeavy(item) {
    setHeavyItems(curr => curr.includes(item) ? curr.filter(i => i !== item) : [...curr, item]);
  }

  /* ── Step title for the header ────────────────────────────────────── */
  const stepTitle = {
    1: 'Where are you moving from?',
    2: 'Where are you headed?',
    3: 'When are you moving?',
    4: 'How big is your move?',
    5: 'Any heavy or special items?',
    6: 'Quick — your name & phone',
    7: 'One last thing.',
    8: 'You\'re all set!',
  }[step];

  const stepSubtitle = {
    1: 'Just a ZIP code. We\'ll find nearby movers.',
    2: 'Long distance? Local? We handle both.',
    3: 'Pick the closest fit. You can refine the exact date.',
    4: 'Helps movers send accurate quotes.',
    5: 'Skip if none. We won\'t pad the quote.',
    6: 'So movers can text you their quotes.',
    7: 'Confirm you want quotes — we\'ll match you with up to 4 movers.',
    8: 'Movers in your area are being notified.',
  }[step];

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(180deg, ${T.bg} 0%, ${T.bg2} 100%)`,
      fontFamily: T.sans, color: T.ink,
      display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top, 0)',
      paddingBottom: 'env(safe-area-inset-bottom, 0)',
    }}>
      <style>{baseStyles}</style>

      <Header step={step} goBack={goBack} />

      <ProgressBar step={step} total={STEPS_TOTAL} />

      <main className="v5-main">
        <div className="v5-card" key={step} data-direction={direction}>
          <div className="v5-step-head">
            <h1 className="v5-h1">{stepTitle}</h1>
            <p className="v5-sub">{stepSubtitle}</p>
          </div>

          <div className="v5-step-body">
            {step === 1 && (
              <ZipStep
                value={pickupZip}
                onChange={v => onZipChange(setPickupZip, v)}
                placeholder="ZIP code"
                fieldRef={firstFieldRef}
                onComplete={v => { if (/^\d{5}$/.test(v)) setTimeout(() => goNext(), 280); }}
              />
            )}
            {step === 2 && (
              <ZipStep
                value={destinationZip}
                onChange={v => onZipChange(setDestinationZip, v)}
                placeholder="Destination ZIP"
                fieldRef={firstFieldRef}
                onComplete={v => { if (/^\d{5}$/.test(v) && v !== pickupZip) setTimeout(() => goNext(), 280); }}
                errorIfSame={destinationZip && destinationZip === pickupZip ? 'Destination ZIP must differ from pickup ZIP.' : null}
              />
            )}
            {step === 3 && (
              <DateStep
                urgencyChips={URGENCY_CHIPS}
                urgencyBucket={urgencyBucket}
                onUrgencyClick={onUrgencyClick}
                moveDate={moveDate}
                setMoveDate={setMoveDate}
                fieldRef={firstFieldRef}
              />
            )}
            {step === 4 && (
              <SizeStep
                options={HOME_SIZES}
                value={moveSize}
                onSelect={v => { setMoveSize(v); setTimeout(() => goNext(), 240); }}
              />
            )}
            {step === 5 && (
              <HeavyStep
                options={HEAVY_ITEMS}
                selected={heavyItems}
                onToggle={toggleHeavy}
              />
            )}
            {step === 6 && (
              <ContactStep
                firstName={firstName}
                setFirstName={setFirstName}
                phone={phone}
                onPhoneChange={onPhoneChange}
                email={email}
                setEmail={setEmail}
                showEmailField={showEmailField}
                setShowEmailField={setShowEmailField}
                fieldRef={firstFieldRef}
              />
            )}
            {step === 7 && (
              <IntentStep
                checked={intentConfirmed}
                onCheck={setIntentConfirmed}
                summary={{
                  route: `${pickupZip} → ${destinationZip}`,
                  date: moveDate,
                  size: HOME_SIZES.find(h => h.value === moveSize)?.label || moveSize,
                }}
              />
            )}
            {step === 8 && (
              <SuccessStep lead={submittedLead} firstName={firstName} pickupZip={pickupZip} destinationZip={destinationZip} />
            )}
          </div>

          {/* Error reserved zone — keeps layout stable */}
          <div className="v5-error-zone" aria-live="polite">
            {submitError && <span className="v5-error">{submitError}</span>}
          </div>

          {/* CTA — hidden on success */}
          {step <= 7 && (
            <button
              type="button"
              onClick={goNext}
              disabled={!stepValid || submitting}
              className="v5-cta"
            >
              {submitting
                ? 'Confirming…'
                : step === 7 ? 'Get my quotes' : 'Continue'}
              {!submitting && <span style={{ marginLeft: 8, display: 'inline-flex' }}>{Ico.arrow(16)}</span>}
            </button>
          )}

          {/* Trust strip — hidden on success */}
          {step <= 7 && (
            <div className="v5-trust">
              <span><span style={{ color: T.ok }}>{Ico.shield(12)}</span> Encrypted</span>
              <span className="v5-trust-dot">·</span>
              <span><span style={{ color: T.accent }}>{Ico.bolt(12)}</span> Free quotes in 60s</span>
              <span className="v5-trust-dot">·</span>
              <span><span style={{ color: T.warn }}>{Ico.star(12)}</span> No card required</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ─── Subcomponents ─────────────────────────────────────────────────── */

function Header({ step, goBack }) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'saturate(180%) blur(8px)',
      WebkitBackdropFilter: 'saturate(180%) blur(8px)',
      borderBottom: `1px solid ${T.line}`,
      paddingTop: 'env(safe-area-inset-top, 0)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', maxWidth: 720, margin: '0 auto', height: 56, boxSizing: 'border-box',
      }}>
        <button onClick={goBack} disabled={step <= 1 || step === 8} aria-label="Back" style={{
          width: 40, height: 40, borderRadius: 12, border: 'none',
          background: step <= 1 || step === 8 ? 'transparent' : T.bg2,
          color: step <= 1 || step === 8 ? T.mute : T.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: step <= 1 || step === 8 ? 'default' : 'pointer',
          opacity: step <= 1 || step === 8 ? 0.4 : 1,
          transition: 'background 0.2s, opacity 0.2s',
        }}>
          {Ico.back(18)}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, letterSpacing: -0.2 }}>
          <span style={{ color: T.ink, fontSize: 16 }}>MoveLeads</span>
        </div>
        <div style={{ width: 40 }} />
      </div>
    </header>
  );
}

function ProgressBar({ step, total }) {
  const pct = step >= 8 ? 100 : Math.round(((step - 1) / total) * 100);
  return (
    <div style={{ background: T.line2, height: 3 }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: T.accent,
        transition: 'width 320ms cubic-bezier(0.4, 0, 0.2, 1)',
      }} />
    </div>
  );
}

function ZipStep({ value, onChange, placeholder, fieldRef, onComplete, errorIfSame }) {
  return (
    <div className="v5-zip-wrap">
      <div className="v5-zip-icon">{Ico.pin(22)}</div>
      <input
        ref={fieldRef}
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        pattern="[0-9]*"
        maxLength={5}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (onComplete) onComplete(e.target.value.replace(/\D/g, ''));
        }}
        className="v5-input v5-input-zip"
        aria-label={placeholder}
      />
      {errorIfSame && <div className="v5-inline-error">{errorIfSame}</div>}
    </div>
  );
}

function DateStep({ urgencyChips, urgencyBucket, onUrgencyClick, moveDate, setMoveDate, fieldRef }) {
  // Calendar input — min = today + 1 day.
  // Computed in state init (effectful) to satisfy purity rules; date doesn't
  // change during the lifetime of this step.
  const [minDate] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    return d.toISOString().slice(0, 10);
  });
  return (
    <div className="v5-stack">
      <div className="v5-chip-grid">
        {urgencyChips.map(b => (
          <button
            key={b.value}
            type="button"
            onClick={() => onUrgencyClick(b)}
            className={`v5-chip ${urgencyBucket === b.value ? 'is-active' : ''}`}
          >
            <div className="v5-chip-label">{b.label}</div>
            <div className="v5-chip-hint">{b.hint}</div>
          </button>
        ))}
      </div>
      <div>
        <label className="v5-label">Exact move date {urgencyBucket && <span style={{ color: T.mute, fontWeight: 500 }}>(refine if needed)</span>}</label>
        <input
          ref={fieldRef}
          type="date"
          value={moveDate}
          min={minDate}
          onChange={(e) => setMoveDate(e.target.value)}
          className="v5-input"
        />
      </div>
    </div>
  );
}

function SizeStep({ options, value, onSelect }) {
  return (
    <div className="v5-size-grid">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={`v5-size-card ${value === opt.value ? 'is-active' : ''}`}
          aria-pressed={value === opt.value}
        >
          <div className="v5-size-icon">{opt.icon(26)}</div>
          <div className="v5-size-label">{opt.label}</div>
          <div className="v5-size-sub">{opt.sub}</div>
        </button>
      ))}
    </div>
  );
}

function HeavyStep({ options, selected, onToggle }) {
  return (
    <div>
      <div className="v5-heavy-grid">
        {options.map(item => {
          const active = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              className={`v5-heavy-chip ${active ? 'is-active' : ''}`}
              aria-pressed={active}
            >
              {active && <span style={{ display: 'inline-flex', marginRight: 6, color: T.accent }}>{Ico.check(14)}</span>}
              {item}
            </button>
          );
        })}
      </div>
      <p style={{ marginTop: 12, color: T.mute, fontSize: 13, textAlign: 'center' }}>
        {selected.length > 0 ? `${selected.length} selected` : 'Skip if none apply'}
      </p>
    </div>
  );
}

function ContactStep({ firstName, setFirstName, phone, onPhoneChange, email, setEmail, showEmailField, setShowEmailField, fieldRef }) {
  return (
    <div className="v5-stack">
      <div>
        <label className="v5-label" htmlFor="v5-firstname">First name</label>
        <input
          id="v5-firstname"
          ref={fieldRef}
          type="text"
          autoComplete="given-name"
          autoCapitalize="words"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="v5-input"
          placeholder="Your name"
          maxLength={40}
        />
      </div>
      <div>
        <label className="v5-label" htmlFor="v5-phone">Mobile number</label>
        <input
          id="v5-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={onPhoneChange}
          className="v5-input"
          placeholder="(555) 123-4567"
        />
        <p style={{ marginTop: 8, fontSize: 12, color: T.mute, lineHeight: 1.5 }}>
          We text quotes to this number. No spam — only the movers you choose to talk to.
        </p>
      </div>
      {showEmailField ? (
        <div>
          <label className="v5-label" htmlFor="v5-email">Email <span style={{ color: T.mute, fontWeight: 500 }}>(optional)</span></label>
          <input
            id="v5-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="v5-input"
            placeholder="you@example.com"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowEmailField(true)}
          style={{
            background: 'none', border: 'none', color: T.accent,
            fontFamily: T.sans, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', padding: 0, alignSelf: 'flex-start',
          }}
        >
          + Add email (optional)
        </button>
      )}
    </div>
  );
}

function IntentStep({ checked, onCheck, summary }) {
  return (
    <div className="v5-stack">
      <div style={{
        background: T.bg, border: `1px solid ${T.line2}`, borderRadius: 14,
        padding: 16,
      }}>
        <div className="v5-summary-row"><span style={{ color: T.mute }}>Route</span><strong>{summary.route}</strong></div>
        <div className="v5-summary-row"><span style={{ color: T.mute }}>Date</span><strong>{summary.date}</strong></div>
        <div className="v5-summary-row"><span style={{ color: T.mute }}>Size</span><strong>{summary.size}</strong></div>
      </div>
      <label className="v5-consent">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          style={{ width: 22, height: 22, accentColor: T.accent, flexShrink: 0, marginTop: 2 }}
        />
        <span>
          Yes, I want free quotes from up to <strong>4 vetted movers</strong>. I agree to receive calls/texts about my move at the number provided. Standard rates apply. <span style={{ color: T.mute }}>You can opt out anytime.</span>
        </span>
      </label>
    </div>
  );
}

function SuccessStep({ lead, firstName, pickupZip, destinationZip }) {
  return (
    <div className="v5-success">
      <div className="v5-success-badge">{Ico.check(28)}</div>
      <h2 className="v5-success-h2">Thanks, {firstName}!</h2>
      <p className="v5-success-p">
        We're notifying movers near <strong>{pickupZip}</strong>. You should get a text from up to <strong>4 vetted movers</strong> within the hour.
      </p>
      <div style={{
        background: T.bg, border: `1px solid ${T.line2}`, borderRadius: 14,
        padding: 16, marginTop: 16, textAlign: 'left', width: '100%', boxSizing: 'border-box',
      }}>
        <div className="v5-summary-row"><span style={{ color: T.mute }}>Confirmation</span><strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{lead?.id ? String(lead.id).slice(-8).toUpperCase() : '—'}</strong></div>
        <div className="v5-summary-row"><span style={{ color: T.mute }}>Route</span><strong>{pickupZip} → {destinationZip}</strong></div>
        <div className="v5-summary-row"><span style={{ color: T.mute }}>Status</span><strong style={{ color: T.warn }}>{lead?.status || 'Pending'}</strong></div>
      </div>
      <p style={{ color: T.mute, fontSize: 12, marginTop: 16 }}>
        Tip: save our number in your contacts so quote texts don't get filtered.
      </p>
    </div>
  );
}

/* ── Inline styles ───────────────────────────────────────────────────── */
const baseStyles = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; }

  .v5-main {
    flex: 1 1 auto; display: flex; align-items: flex-start; justify-content: center;
    padding: 20px 16px 32px;
  }
  .v5-card {
    width: 100%; max-width: 480px;
    background: ${T.surface}; border-radius: 20px;
    box-shadow: ${T.cardShadow}; border: 1px solid ${T.line};
    padding: 24px 20px;
    display: flex; flex-direction: column;
    animation: v5-fade-in 240ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @media (min-width: 640px) {
    .v5-main { padding: 32px 24px 48px; }
    .v5-card { padding: 32px 28px; }
  }

  @keyframes v5-fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .v5-card[data-direction="-1"] {
    animation-name: v5-fade-in-back;
  }
  @keyframes v5-fade-in-back {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .v5-step-head { margin-bottom: 20px; }
  .v5-h1 {
    margin: 0 0 6px 0;
    font-size: 22px; font-weight: 800; letter-spacing: -0.4px;
    color: ${T.ink}; line-height: 1.25;
  }
  @media (min-width: 640px) {
    .v5-h1 { font-size: 26px; }
  }
  .v5-sub {
    margin: 0; color: ${T.ink2}; font-size: 14px; line-height: 1.5;
  }
  .v5-step-body { flex: 1; min-height: 60px; }

  .v5-input {
    width: 100%;
    font-family: ${T.sans};
    font-size: 16px; /* prevents iOS zoom-on-focus */
    color: ${T.ink}; background: ${T.surface};
    border: 1.5px solid ${T.line};
    border-radius: 12px;
    padding: 14px 16px;
    transition: border-color 180ms, box-shadow 180ms;
    outline: none;
    -webkit-appearance: none;
  }
  .v5-input:focus {
    border-color: ${T.accent};
    box-shadow: 0 0 0 4px ${T.accentSoft};
  }
  .v5-label {
    display: block; margin-bottom: 8px;
    font-size: 13px; font-weight: 700; color: ${T.ink};
  }

  .v5-zip-wrap { position: relative; }
  .v5-zip-icon {
    position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
    color: ${T.mute};
    pointer-events: none;
  }
  .v5-input-zip {
    padding-left: 48px;
    font-size: 24px; font-weight: 700; letter-spacing: 4px;
    text-align: center;
  }
  .v5-input-zip:focus { border-color: ${T.accent}; }
  .v5-inline-error {
    margin-top: 10px; color: ${T.danger}; font-size: 13px; font-weight: 500;
    text-align: center;
  }

  .v5-stack { display: flex; flex-direction: column; gap: 14px; }
  .v5-chip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .v5-chip {
    background: ${T.surface}; border: 1.5px solid ${T.line};
    border-radius: 14px; padding: 14px 12px;
    cursor: pointer; transition: all 160ms;
    text-align: left; font-family: ${T.sans};
  }
  .v5-chip:hover { border-color: ${T.mute}; }
  .v5-chip.is-active {
    background: ${T.accentSoft}; border-color: ${T.accent};
  }
  .v5-chip-label { font-weight: 700; font-size: 14px; color: ${T.ink}; }
  .v5-chip-hint { margin-top: 2px; color: ${T.ink2}; font-size: 12px; }

  .v5-size-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  }
  .v5-size-card {
    background: ${T.surface}; border: 1.5px solid ${T.line};
    border-radius: 14px; padding: 16px 12px;
    cursor: pointer; transition: all 160ms;
    text-align: center; font-family: ${T.sans};
    display: flex; flex-direction: column; align-items: center; gap: 6px;
  }
  .v5-size-card:hover { border-color: ${T.mute}; }
  .v5-size-card.is-active {
    background: ${T.accentSoft}; border-color: ${T.accent};
  }
  .v5-size-icon { color: ${T.ink2}; }
  .v5-size-card.is-active .v5-size-icon { color: ${T.accent}; }
  .v5-size-label { font-weight: 700; font-size: 14px; color: ${T.ink}; }
  .v5-size-sub { color: ${T.ink2}; font-size: 11px; }

  .v5-heavy-grid {
    display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
  }
  .v5-heavy-chip {
    background: ${T.surface}; border: 1.5px solid ${T.line};
    border-radius: 100px; padding: 10px 16px;
    cursor: pointer; font-family: ${T.sans};
    font-size: 13px; font-weight: 600; color: ${T.ink};
    transition: all 160ms;
  }
  .v5-heavy-chip:hover { border-color: ${T.mute}; }
  .v5-heavy-chip.is-active {
    background: ${T.accentSoft}; border-color: ${T.accent}; color: ${T.ink};
  }

  .v5-summary-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 0; font-size: 14px; color: ${T.ink};
  }
  .v5-summary-row + .v5-summary-row { border-top: 1px solid ${T.line2}; }

  .v5-consent {
    display: flex; gap: 12px; align-items: flex-start;
    font-size: 13px; color: ${T.ink}; line-height: 1.5;
    background: ${T.bg}; border: 1px solid ${T.line2};
    border-radius: 14px; padding: 14px;
    cursor: pointer;
  }

  .v5-error-zone {
    min-height: 20px; margin: 14px 0 4px;
    display: flex; align-items: center; justify-content: center;
  }
  .v5-error {
    color: ${T.danger}; font-size: 13px; font-weight: 500; text-align: center;
  }

  .v5-cta {
    width: 100%;
    background: ${T.accent}; color: white;
    border: none; border-radius: 14px;
    padding: 16px 20px;
    font-family: ${T.sans}; font-size: 16px; font-weight: 700;
    cursor: pointer;
    box-shadow: ${T.ctaShadow};
    transition: transform 120ms, opacity 160ms;
    display: flex; align-items: center; justify-content: center;
  }
  .v5-cta:disabled {
    opacity: 0.4; cursor: not-allowed; box-shadow: none; transform: none;
  }
  .v5-cta:not(:disabled):active { transform: scale(0.985); }

  .v5-trust {
    margin-top: 14px;
    display: flex; align-items: center; justify-content: center;
    gap: 8px; color: ${T.mute}; font-size: 11px;
  }
  .v5-trust-dot { color: ${T.line}; }
  .v5-trust span { display: inline-flex; align-items: center; gap: 4px; }

  .v5-success { text-align: center; padding: 12px 0; }
  .v5-success-badge {
    width: 64px; height: 64px; border-radius: 50%;
    background: ${T.ok}; color: white;
    display: inline-flex; align-items: center; justify-content: center;
    margin-bottom: 16px;
  }
  .v5-success-h2 {
    margin: 0 0 6px; font-size: 22px; font-weight: 800; color: ${T.ink};
  }
  .v5-success-p {
    margin: 0; color: ${T.ink2}; font-size: 14px; line-height: 1.5;
  }
`;
