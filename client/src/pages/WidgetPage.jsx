import { useState, useRef } from 'react';
import {
  Zap, ShieldCheck, Code, CheckCircle, Copy,
  Mail, ChevronRight, Home, MapPin, DollarSign,
  Phone, User, ArrowRight
} from 'lucide-react';

/* ── Quote lookup ─────────────────────────────────────── */
const QUOTES = {
  'Studio':     { low: 199, high: 349 },
  '1 Bedroom':  { low: 299, high: 499 },
  '2 Bedroom':  { low: 549, high: 799 },
  '3 Bedroom':  { low: 749, high: 1099 },
  '4 Bedroom':  { low: 999, high: 1499 },
  '5 Bedroom':  { low: 1299, high: 1899 },
};

const HOME_SIZES = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5 Bedroom'];

/* ── House SVG icon (line-art, scales with size prop) ── */
function HouseIcon({ size = 36, selected = false }) {
  const c = selected ? '#1e3a8a' : '#94a3b8';
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 16L18 4L32 16V32H23V22H13V32H4V16Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/* ── 5-step progress bar ─────────────────────────────── */
function StepProgress({ current, total = 5 }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 5, borderRadius: 999,
            background: i < current ? '#1e3a8a' : '#e2e8f0',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 18 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1e3a8a', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
          Step {current} of {total}
        </span>
      </div>
    </div>
  );
}

/* ── Step heading with orange underline ─────────────────── */
function StepHeading({ children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px', fontFamily: "'Poppins',sans-serif", lineHeight: 1.2 }}>
        {children}
      </h3>
      <div style={{ width: 44, height: 3, background: '#ea580c', borderRadius: 999 }} />
    </div>
  );
}

/* ══════════════════════════════════════
   THE INTERACTIVE DEMO WIDGET
   ══════════════════════════════════════ */
function DemoWidget() {
  const [step, setStep] = useState(1);
  const [size, setSize] = useState('');
  const [originZip, setOriginZip] = useState('');
  const [destZip, setDestZip] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const quote = QUOTES[size] || { low: 299, high: 499 };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid #e2e8f0', fontSize: 14,
    fontFamily: 'inherit', outline: 'none', color: '#0f172a',
    marginBottom: 10,
  };

  const focusStyle = { borderColor: '#ea580c', boxShadow: '0 0 0 3px rgba(234,88,12,0.1)' };

  return (
    <div style={{
      background: '#fff', borderRadius: 20,
      boxShadow: '0 24px 64px rgba(0,0,0,0.14), 0 8px 24px rgba(0,0,0,0.08)',
      width: '100%', maxWidth: 540,
      overflow: 'hidden',
    }}>
      {/* Widget header */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Home size={16} color="#fff" />
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: "'Poppins',sans-serif" }}>Get a Moving Quote</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>Free • Instant • No commitment</div>
        </div>
      </div>

      {/* Step content */}
      <div style={{ padding: '24px' }}>
        <StepProgress current={step} />

        {/* ── Step 1: Move size ── */}
        {step === 1 && (
          <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
            <StepHeading>Select Your Move Size</StepHeading>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {HOME_SIZES.map(s => {
                const selected = size === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    style={{
                      padding: '16px 12px', borderRadius: 12, cursor: 'pointer',
                      border: `1.5px solid ${selected ? '#1e3a8a' : '#e2e8f0'}`,
                      background: selected ? '#f0f4ff' : '#fafbfc',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                      position: 'relative', transition: 'all 0.15s',
                    }}
                  >
                    {selected && (
                      <div style={{ position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: '50%', background: '#1e3a8a' }} />
                    )}
                    <HouseIcon size={34} selected={selected} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: selected ? '#1e3a8a' : '#475569' }}>{s}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => size && setStep(2)}
              disabled={!size}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                background: size ? 'linear-gradient(135deg,#ea580c,#c2410c)' : '#e2e8f0',
                color: size ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700,
                cursor: size ? 'pointer' : 'not-allowed',
                fontFamily: "'Poppins',sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.2s',
              }}
            >
              Next Step <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step 2: Zip codes ── */}
        {step === 2 && (
          <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
            <StepHeading>Where Are You Moving?</StepHeading>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 6 }}>
              Moving From (ZIP Code)
            </label>
            <input
              type="text" placeholder="e.g. 90210" maxLength={10}
              value={originZip} onChange={e => setOriginZip(e.target.value)}
              style={inputStyle}
              onFocus={e => Object.assign(e.target.style, focusStyle)}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
            />
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 6 }}>
              Moving To (ZIP Code)
            </label>
            <input
              type="text" placeholder="e.g. 10001" maxLength={10}
              value={destZip} onChange={e => setDestZip(e.target.value)}
              style={{ ...inputStyle, marginBottom: 20 }}
              onFocus={e => Object.assign(e.target.style, focusStyle)}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setStep(1)} style={{ padding: '13px 20px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Back
              </button>
              <button
                type="button"
                onClick={() => (originZip && destZip) && setStep(3)}
                disabled={!originZip || !destZip}
                style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', background: (originZip && destZip) ? 'linear-gradient(135deg,#ea580c,#c2410c)' : '#e2e8f0', color: (originZip && destZip) ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700, cursor: (originZip && destZip) ? 'pointer' : 'not-allowed', fontFamily: "'Poppins',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                Calculate Quote <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Quote reveal ── */}
        {step === 3 && (
          <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
            <StepHeading>Your Instant Quote</StepHeading>
            <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderRadius: 16, padding: '24px', textAlign: 'center', marginBottom: 16, border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Estimated Price</div>
              <div style={{ fontSize: 38, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins',sans-serif", letterSpacing: -1 }}>
                ${quote.low} – ${quote.high}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>for a {size} move</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              {[
                { icon: <MapPin size={13} />, label: 'From', value: originZip },
                { icon: <ArrowRight size={13} />, label: 'To', value: destZip },
              ].map(r => (
                <div key={r.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#94a3b8' }}>{r.icon}</span>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{r.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{r.value}</div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setStep(4)} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#ea580c,#c2410c)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Poppins',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              Claim This Quote <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step 4: Contact form ── */}
        {step === 4 && (
          <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
            <StepHeading>Your Contact Details</StepHeading>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <User size={14} color="#94a3b8" />
              <input
                type="text" placeholder="Full Name" value={name}
                onChange={e => setName(e.target.value)}
                style={inputStyle}
                onFocus={e => Object.assign(e.target.style, focusStyle)}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Phone size={14} color="#94a3b8" />
              <input
                type="tel" placeholder="Phone Number" value={phone}
                onChange={e => setPhone(e.target.value)}
                style={inputStyle}
                onFocus={e => Object.assign(e.target.style, focusStyle)}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Mail size={14} color="#94a3b8" />
              <input
                type="email" placeholder="Email Address" value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
                onFocus={e => Object.assign(e.target.style, focusStyle)}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setStep(3)} style={{ padding: '13px 20px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Back
              </button>
              <button
                type="button"
                onClick={() => (name && phone) && setStep(5)}
                disabled={!name || !phone}
                style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', background: (name && phone) ? 'linear-gradient(135deg,#ea580c,#c2410c)' : '#e2e8f0', color: (name && phone) ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700, cursor: (name && phone) ? 'pointer' : 'not-allowed', fontFamily: "'Poppins',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                Send Details <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Confirmation ── */}
        {step === 5 && (
          <div style={{ animation: 'wgFadeIn 0.3s ease', textAlign: 'center', padding: '20px 0 8px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <CheckCircle size={36} color="#16a34a" />
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 8, fontFamily: "'Poppins',sans-serif" }}>Quote Confirmed!</h3>
            <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
              Thanks, <strong>{name}</strong>! Your quote has been sent to <strong>{phone}</strong>.<br />
              A local mover will contact you shortly.
            </p>
            <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '12px 16px', marginBottom: 24, display: 'inline-block' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                ${quote.low} – ${quote.high} for your {size} move
              </span>
            </div>
            <br />
            <button type="button" onClick={() => {
              setStep(1); setSize(''); setOriginZip(''); setDestZip('');
              setName(''); setPhone(''); setEmail('');
            }} style={{ background: 'none', border: 'none', color: '#ea580c', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              ↺ Restart Demo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════ */
export default function WidgetPage({ user, insideDashboard = false }) {
  const [copied, setCopied] = useState(false);
  const embedRef = useRef(null);

  const companyId = user?._id || 'YOUR-COMPANY-ID';
  const embedCode = `<div id="moveleads-widget" data-company="${companyId}"></div>\n<script src="https://moveleads.cloud/widget.js" defer></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const scrollToEmbed = () => {
    embedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div style={{ background: '#fff', minHeight: '100vh', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* ══════════════════════════════════
          1. HERO
          ══════════════════════════════════ */}
      <div style={{
        textAlign: 'center', padding: insideDashboard ? '64px 20px 80px' : '100px 20px 100px',
        background: 'linear-gradient(180deg, #fff 0%, #f8fafc 100%)',
        borderBottom: '1px solid #e2e8f0',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle bg circles */}
        <div style={{ position: 'absolute', top: -80, right: '10%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(234,88,12,0.06),transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, left: '5%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle,rgba(59,130,246,0.05),transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff7ed', color: '#ea580c', padding: '6px 16px', borderRadius: 999, fontSize: 13, fontWeight: 700, marginBottom: 28, border: '1px solid #fed7aa' }}>
            <Zap size={14} fill="#ea580c" /> Free for MoveLeads members
          </div>
          <h1 style={{ fontSize: insideDashboard ? 40 : 52, fontWeight: 900, color: '#0f172a', marginBottom: 22, letterSpacing: '-0.03em', lineHeight: 1.1, fontFamily: "'Poppins',sans-serif" }}>
            Turn your website into<br />a lead machine
          </h1>
          <p style={{ fontSize: 18, color: '#475569', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.7 }}>
            Add our booking widget to your website in under 2 minutes. Capture more leads, show instant quotes, and sync everything to your MoveLeads dashboard automatically.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={scrollToEmbed} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#ea580c,#c2410c)', color: '#fff', padding: '14px 28px', borderRadius: 12, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', boxShadow: '0 6px 20px rgba(234,88,12,0.3)', fontFamily: "'Poppins',sans-serif" }}>
              Get Your Embed Code <ChevronRight size={16} />
            </button>
            <a href="#demo-section" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#f1f5f9', color: '#0f172a', padding: '14px 28px', borderRadius: 12, fontWeight: 700, fontSize: 14, border: '1px solid #e2e8f0', cursor: 'pointer', textDecoration: 'none' }}>
              See Live Demo
            </a>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════
          2. FEATURE CARDS
          ══════════════════════════════════ */}
      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          {[
            {
              icon: <Zap size={22} />, bg: '#fff7ed', color: '#ea580c',
              title: '5-Step Quote Flow',
              text: 'Guides customers from move size to confirmed quote seamlessly on mobile and desktop.',
            },
            {
              icon: <ShieldCheck size={22} />, bg: '#f0fdf4', color: '#16a34a',
              title: 'Phone Verified Leads',
              text: 'Every lead is verified. No fake numbers, no VoIP, just real homeowners ready to move.',
            },
            {
              icon: <Code size={22} />, bg: '#eff6ff', color: '#3b82f6',
              title: 'One Line of Code',
              text: 'Paste a single snippet into your website. Works on WordPress, Wix, Squarespace, and custom sites.',
            },
          ].map((f, i) => (
            <div key={i} style={{
              background: '#fff', padding: '28px 28px', borderRadius: 18,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}
            >
              <div style={{ width: 46, height: 46, background: f.bg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: f.color, marginBottom: 18 }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 10, fontFamily: "'Poppins',sans-serif" }}>{f.title}</h3>
              <p style={{ color: '#64748b', lineHeight: 1.65, fontSize: 14, margin: 0 }}>{f.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════
          3. LIVE DEMO (browser frame)
          ══════════════════════════════════ */}
      <div id="demo-section" style={{
        background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 40%, #fdf4ff 70%, #fff7ed 100%)',
        padding: '80px 24px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Colorful corner blobs */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 220, height: 160, background: 'rgba(134,239,172,0.5)', filter: 'blur(40px)', borderRadius: '0 80% 0 0', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 220, height: 160, background: 'rgba(251,146,60,0.35)', filter: 'blur(40px)', borderRadius: '80% 0 0 0', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 0, right: '10%', width: 160, height: 120, background: 'rgba(167,139,250,0.2)', filter: 'blur(30px)', borderRadius: '0 0 80% 80%', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          {/* Section header */}
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', color: '#64748b', padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              LIVE DEMO
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: '#0f172a', margin: '0 0 12px', fontFamily: "'Poppins',sans-serif", letterSpacing: '-0.02em' }}>
              Test drive the widget
            </h2>
            <p style={{ fontSize: 16, color: '#64748b', maxWidth: 500, margin: '0 auto' }}>
              Click through the interactive demo to experience exactly what your customers will see.
            </p>
          </div>

          {/* Browser frame + widget side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>

            {/* Left: description + embed code */}
            <div>
              <h3 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 14, fontFamily: "'Poppins',sans-serif" }}>
                Your embed snippet
              </h3>
              <p style={{ fontSize: 15, color: '#475569', marginBottom: 28, lineHeight: 1.65 }}>
                {user
                  ? "Your personalized snippet is ready. Copy it and paste it into any page on your website."
                  : "Sign up free to get your personalized embed snippet with your company ID pre-filled."}
              </p>

              {/* Steps list */}
              <div style={{ marginBottom: 32 }}>
                {[
                  { num: 1, text: 'Copy your embed snippet below' },
                  { num: 2, text: 'Paste it anywhere in your website HTML' },
                  { num: 3, text: 'The widget appears instantly for your visitors' },
                ].map(s => (
                  <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{s.num}</div>
                    <span style={{ fontSize: 14, color: '#475569', fontWeight: 500 }}>{s.text}</span>
                  </div>
                ))}
              </div>

              {/* Embed code block */}
              <div ref={embedRef} style={{ background: '#1e293b', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 32px rgba(15,23,42,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 18px', background: '#0f172a', borderBottom: '1px solid #334155' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fc5f5f' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c741' }} />
                  </div>
                  <button onClick={handleCopy} style={{ color: copied ? '#22c55e' : '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                    {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
                <pre style={{ margin: 0, padding: '18px 20px', color: '#e2e8f0', fontSize: 13, lineHeight: 1.7, overflowX: 'auto', fontFamily: "'Fira Code', 'Consolas', monospace" }}>
                  <span style={{ color: '#94a3b8' }}>&lt;</span><span style={{ color: '#7dd3fc' }}>div</span>{' '}
                  <span style={{ color: '#fca5a5' }}>id</span><span style={{ color: '#94a3b8' }}>="</span><span style={{ color: '#86efac' }}>moveleads-widget</span><span style={{ color: '#94a3b8' }}>"</span>{' '}
                  <span style={{ color: '#fca5a5' }}>data-company</span><span style={{ color: '#94a3b8' }}>="</span><span style={{ color: '#fde68a' }}>{companyId}</span><span style={{ color: '#94a3b8' }}>{">&lt;/"}</span><span style={{ color: '#7dd3fc' }}>div</span><span style={{ color: '#94a3b8' }}>&gt;</span>{'\n'}
                  <span style={{ color: '#94a3b8' }}>&lt;</span><span style={{ color: '#7dd3fc' }}>script</span>{' '}
                  <span style={{ color: '#fca5a5' }}>src</span><span style={{ color: '#94a3b8' }}>="</span><span style={{ color: '#86efac' }}>https://moveleads.cloud/widget.js</span><span style={{ color: '#94a3b8' }}>"</span>{' '}
                  <span style={{ color: '#fca5a5' }}>defer</span><span style={{ color: '#94a3b8' }}>&gt;&lt;/</span><span style={{ color: '#7dd3fc' }}>script</span><span style={{ color: '#94a3b8' }}>&gt;</span>
                </pre>
              </div>

              {user && (
                <p style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
                  Your company ID <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{companyId}</code> is pre-filled above.
                </p>
              )}
            </div>

            {/* Right: stacked widget demo */}
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 560 }}>
              {/* Background stacked card — left tilt */}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-7deg) translateX(-18px) translateY(12px)', opacity: 0.28, pointerEvents: 'none', width: '85%', filter: 'grayscale(0.3)' }}>
                <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', padding: 20, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{ flex: 1, height: 5, borderRadius: 999, background: i === 0 ? '#6366f1' : '#e2e8f0' }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Select Your Move Size</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom'].map(s => (
                      <div key={s} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 8px', textAlign: 'center', border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
                        <HouseIcon size={24} /> <br />{s}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Background stacked card — right tilt */}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(7deg) translateX(18px) translateY(12px)', opacity: 0.28, pointerEvents: 'none', width: '85%', filter: 'grayscale(0.3)' }}>
                <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', padding: 20, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{ flex: 1, height: 5, borderRadius: 999, background: i < 2 ? '#a855f7' : '#e2e8f0' }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Select Your Move Size</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom'].map(s => (
                      <div key={s} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 8px', textAlign: 'center', border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
                        <HouseIcon size={24} /> <br />{s}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Main interactive widget */}
              <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 460 }}>
                <DemoWidget />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════
          4. HOW IT WORKS
          ══════════════════════════════════ */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, color: '#0f172a', marginBottom: 12, fontFamily: "'Poppins',sans-serif" }}>
          How to get started
        </h2>
        <p style={{ color: '#64748b', fontSize: 16, marginBottom: 52, maxWidth: 500, margin: '0 auto 52px' }}>
          You can be live in under 2 minutes.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 40 }}>
          {[
            { num: '1', title: 'Sign up free', text: 'Create your MoveLeads account in seconds. No credit card required.', color: '#ea580c' },
            { num: '2', title: 'Get your snippet', text: 'Copy your personalized embed code from the Widget tab in your dashboard.', color: '#3b82f6' },
            { num: '3', title: 'Paste & go live', text: 'Drop the code into your website. The widget appears instantly for every visitor.', color: '#16a34a' },
          ].map(s => (
            <div key={s.num} style={{ position: 'relative' }}>
              <div style={{ width: 52, height: 52, background: s.color, color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, margin: '0 auto 18px', boxShadow: `0 6px 20px ${s.color}40`, fontFamily: "'Poppins',sans-serif" }}>
                {s.num}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8, fontFamily: "'Poppins',sans-serif" }}>{s.title}</h3>
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.65, margin: 0 }}>{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════
          5. CTA
          ══════════════════════════════════ */}
      <div style={{ padding: '0 24px 80px' }}>
        <div style={{
          maxWidth: 860, margin: '0 auto',
          background: 'linear-gradient(135deg,#0a192f 0%,#112240 60%,#1e3a5f 100%)',
          borderRadius: 24, padding: '52px 48px', textAlign: 'center',
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(10,25,47,0.25)',
        }}>
          <div style={{ position: 'absolute', top: '-30%', right: '-5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle,rgba(234,88,12,0.12),transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '5px 16px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 22, border: '1px solid rgba(255,255,255,0.15)' }}>
              Free while in beta
            </div>
            <h2 style={{ fontSize: 34, fontWeight: 800, color: '#fff', marginBottom: 14, fontFamily: "'Poppins',sans-serif", letterSpacing: '-0.02em' }}>
              Want this widget on your website?
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 16, marginBottom: 36, maxWidth: 520, margin: '0 auto 36px' }}>
              Contact us and we'll set everything up for you — no technical knowledge needed.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href="mailto:support@moveleads.cloud?subject=Widget%20Setup%20Request"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#ea580c,#c2410c)', color: '#fff', padding: '14px 28px', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none', boxShadow: '0 6px 20px rgba(234,88,12,0.4)', fontFamily: "'Poppins',sans-serif" }}>
                <Mail size={16} /> Contact us to get started
              </a>
              <button
                onClick={scrollToEmbed}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '14px 28px', borderRadius: 12, fontWeight: 700, fontSize: 14, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontFamily: "'Poppins',sans-serif" }}>
                <Code size={16} /> See the embed code
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wgFadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  );
}
