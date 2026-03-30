import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link, useSearchParams, useParams } from 'react-router-dom';
import {
  ArrowRight, ArrowLeft, Home, MapPin, User, CheckCircle,
  Truck, Calendar, Phone, Shield, Clock, ChevronRight
} from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { greatCircle } from '@turf/great-circle';
import { point } from '@turf/helpers';
import zipcodes from 'zipcodes';
import './GetQuote.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

// ── Helpers ────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function geocodeZip(zip) {
  const r = zipcodes.lookup(zip);
  return r ? { lat: r.latitude, lon: r.longitude, city: r.city, state: r.state } : null;
}

// ── Mapbox Arc Map ─────────────────────────────────────────────────────────
function MapArc({ origin, destination }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!origin || !destination || !containerRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 6000);
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-98.5795, 39.8283],
      zoom: 2.5,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on('error', () => { setLoading(false); clearTimeout(timer); });
    map.on('load', () => {
      const arcSource = greatCircle(point([origin.lon, origin.lat]), point([destination.lon, destination.lat]), { npoints: 100 });
      const fullCoords = arcSource.geometry.coordinates;
      setLoading(false); clearTimeout(timer);

      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
      map.addLayer({ id: 'route-main', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ea580c', 'line-width': 4.5, 'line-opacity': 1 } });

      const bds = fullCoords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(fullCoords[0], fullCoords[0]));
      map.fitBounds(bds, { padding: 60, duration: 2500, pitch: 20, essential: true });

      const mkEl = (color) => {
        const el = document.createElement('div');
        el.style.cssText = `width:14px;height:14px;background:#fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.2);border:3px solid ${color};`;
        return el;
      };
      new mapboxgl.Marker({ element: mkEl('#3b82f6') }).setLngLat([origin.lon, origin.lat]).addTo(map);
      new mapboxgl.Marker({ element: mkEl('#10b981') }).setLngLat([destination.lon, destination.lat]).addTo(map);

      let step = 0;
      const animate = () => {
        if (!mapRef.current) return;
        if (step < fullCoords.length) {
          step += 1.5;
          map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: fullCoords.slice(0, Math.min(Math.floor(step), fullCoords.length)) } });
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } clearTimeout(timer); };
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon]); // eslint-disable-line

  return (
    <div style={{ position: 'relative', height: 220, borderRadius: 16, overflow: 'hidden', marginBottom: 16, border: '1px solid #e2e8f0' }}>
      <div ref={containerRef} style={{ height: '100%' }} />
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(248,250,252,0.85)' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Loading map…</span>
        </div>
      )}
    </div>
  );
}

// ── Schemas ────────────────────────────────────────────────────────────────
const step1Schema = z.object({
  homeSize: z.enum(['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4+ Bedroom'], {
    errorMap: () => ({ message: 'Please select your home size' })
  }),
  moveDate: z
    .string({ required_error: 'Move date is required' })
    .min(1, 'Move date is required')
    .refine(d => new Date(d) > new Date(), { message: 'Move date must be in the future' })
});
const step2Schema = z.object({});
const step3Schema = z.object({
  customerName: z.string().min(2, 'Name must be at least 2 characters'),
  customerEmail: z.string().email('Must be a valid email address'),
  customerPhone: z
    .string()
    .transform(v => v.replace(/\D/g, ''))
    .pipe(z.string().length(10, 'Must be a 10-digit phone number'))
});

const STEPS = [
  { id: 1, label: 'Move Details', icon: Home },
  { id: 2, label: 'Locations',   icon: MapPin },
  { id: 3, label: 'Your Info',   icon: User }
];
const HOME_SIZES = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4+ Bedroom'];
const SCHEMA_MAP = { 1: step1Schema, 2: step2Schema, 3: step3Schema };

// ── Quote Form ─────────────────────────────────────────────────────────────
function QuoteForm({ prefillOriginZip = '', prefillDestZip = '' }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  // Step 2: zip state (no Google Maps)
  const [originZip, setOriginZip] = useState(prefillOriginZip);
  const [destZip, setDestZip]     = useState(prefillDestZip);
  const [originCoords, setOriginCoords] = useState(null);
  const [destCoords, setDestCoords]     = useState(null);
  const [zipError, setZipError] = useState('');
  const [miles, setMiles] = useState(0);

  const _base = (import.meta.env.VITE_API_URL || 'http://localhost:5005').replace(/\/api$/, '');

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(SCHEMA_MAP[step]),
    mode: 'onChange',
    defaultValues: formData
  });

  const homeSize = watch('homeSize');

  // Auto-resolve zips as user types
  useEffect(() => {
    if (originZip.length === 5 && destZip.length === 5) {
      const oc = geocodeZip(originZip);
      const dc = geocodeZip(destZip);
      if (!oc) { setZipError(`Couldn't find zip "${originZip}". Please check it.`); setOriginCoords(null); setDestCoords(null); return; }
      if (!dc) { setZipError(`Couldn't find zip "${destZip}". Please check it.`); setDestCoords(null); return; }
      setZipError('');
      setOriginCoords(oc); setDestCoords(dc);
      setMiles(haversine(oc.lat, oc.lon, dc.lat, dc.lon));
    } else {
      setOriginCoords(null); setDestCoords(null); setMiles(0); setZipError('');
    }
  }, [originZip, destZip]);

  const onStepSubmit = (data) => {
    if (step === 2) {
      if (!originCoords || !destCoords) {
        setZipError('Please enter valid 5-digit zip codes for both locations.');
        return;
      }
      setFormData(prev => ({
        ...prev,
        originZip, destinationZip: destZip,
        originCity: originCoords.city, destinationCity: destCoords.city,
        miles
      }));
      setStep(3);
      return;
    }
    const merged = { ...formData, ...data };
    setFormData(merged);
    if (step < 3) { setStep(step + 1); } else { submitLead(merged); }
  };

  const handleContinue = step === 2
    ? (e) => { e.preventDefault(); onStepSubmit({}); }
    : handleSubmit(onStepSubmit);

  const submitLead = async (data) => {
    setSubmitting(true); setServerError('');
    const payload = {
      customerName:    data.customerName,
      customerEmail:   data.customerEmail,
      customerPhone:   data.customerPhone.replace(/\D/g, ''),
      originZip:       data.originZip,
      destinationZip:  data.destinationZip,
      originCity:      data.originCity || '',
      destinationCity: data.destinationCity || '',
      homeSize:        data.homeSize,
      moveDate:        new Date(data.moveDate).toISOString(),
      distance:        (data.miles || 0) > 100 ? 'Long Distance' : 'Local',
      miles:           data.miles || 0,
      specialInstructions: ''
    };
    try {
      const res = await fetch(`${_base}/api/leads/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Something went wrong. Please try again.');
      navigate('/thank-you', { state: { homeSize: data.homeSize, originZip: data.originZip, destZip: data.destinationZip } });
    } catch (err) { setServerError(err.message); }
    finally { setSubmitting(false); }
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;
  const mapReady = !!(originCoords && destCoords);
  const isLong = miles > 100;

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '12px 14px',
    borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 15,
    fontFamily: 'inherit', outline: 'none', color: '#0f172a',
    transition: 'border-color 0.2s, box-shadow 0.2s', background: '#fff'
  };

  return (
    <div className="gq-card">
      {/* Step indicator */}
      <div className="gq-steps">
        {STEPS.map(s => {
          const Icon = s.icon;
          const state = s.id < step ? 'done' : s.id === step ? 'active' : 'idle';
          return (
            <div key={s.id} className={`gq-step gq-step--${state}`}>
              <div className="gq-step-circle">{s.id < step ? <CheckCircle size={14} /> : <Icon size={14} />}</div>
              <span className="gq-step-label">{s.label}</span>
            </div>
          );
        })}
        <div className="gq-step-track"><div className="gq-step-fill" style={{ width: `${progress}%` }} /></div>
      </div>

      <form onSubmit={handleContinue} noValidate>

        {/* ══ Step 1: Move Details ══ */}
        {step === 1 && (
          <div className="gq-step-body">
            <h3 className="gq-step-title">Tell us about your move</h3>
            <p className="gq-step-sub">We'll match you with movers who handle your home size.</p>

            <label className="gq-label">What size is your home?</label>
            <div className="gq-size-grid">
              {HOME_SIZES.map(size => (
                <button key={size} type="button"
                  className={`gq-size-btn ${homeSize === size ? 'gq-size-btn--selected' : ''}`}
                  onClick={() => setValue('homeSize', size, { shouldValidate: true })}>
                  <Truck size={18} /><span>{size}</span>
                </button>
              ))}
            </div>
            <input type="hidden" {...register('homeSize')} />
            {errors.homeSize && <p className="gq-error">{errors.homeSize.message}</p>}

            <label className="gq-label" style={{ marginTop: 24 }}>
              <Calendar size={15} style={{ display: 'inline', marginRight: 6 }} />Planned move date
            </label>
            <input type="date"
              className={`gq-input ${errors.moveDate ? 'gq-input--error' : ''}`}
              min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
              {...register('moveDate')} />
            {errors.moveDate && <p className="gq-error">{errors.moveDate.message}</p>}
          </div>
        )}

        {/* ══ Step 2: Zip codes + Map ══ */}
        {step === 2 && (
          <div className="gq-step-body">
            <h3 className="gq-step-title">Where are you moving?</h3>
            <p className="gq-step-sub">Enter your 5-digit zip codes — the map will load automatically.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="gq-label" style={{ color: '#2563eb' }}>📍 From ZIP</label>
                <input
                  type="text" inputMode="numeric" maxLength={5}
                  placeholder="e.g. 75201"
                  value={originZip}
                  onChange={e => setOriginZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  style={{ ...inputStyle, borderColor: originCoords ? '#2563eb' : '#e2e8f0' }}
                  onFocus={e => { e.target.style.borderColor = '#f97316'; e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.12)'; }}
                  onBlur={e => { e.target.style.borderColor = originCoords ? '#2563eb' : '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                />
                {originCoords && (
                  <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, marginTop: 4 }}>
                    ✓ {originCoords.city}, {originCoords.state}
                  </div>
                )}
              </div>
              <div>
                <label className="gq-label" style={{ color: '#059669' }}>📍 To ZIP</label>
                <input
                  type="text" inputMode="numeric" maxLength={5}
                  placeholder="e.g. 90210"
                  value={destZip}
                  onChange={e => setDestZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  style={{ ...inputStyle, borderColor: destCoords ? '#059669' : '#e2e8f0' }}
                  onFocus={e => { e.target.style.borderColor = '#f97316'; e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.12)'; }}
                  onBlur={e => { e.target.style.borderColor = destCoords ? '#059669' : '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                />
                {destCoords && (
                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 700, marginTop: 4 }}>
                    ✓ {destCoords.city}, {destCoords.state}
                  </div>
                )}
              </div>
            </div>

            {zipError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '9px 13px', fontSize: 12, color: '#dc2626', marginBottom: 12 }}>
                {zipError}
              </div>
            )}

            {mapReady && <MapArc origin={originCoords} destination={destCoords} />}

            {mapReady && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isLong ? '#eff6ff' : '#f0fdf4', borderRadius: 10, padding: '9px 14px', marginBottom: 12, fontSize: 13, fontWeight: 700, color: isLong ? '#1d4ed8' : '#15803d' }}>
                <span>{isLong ? '🚛 Long Distance Move' : '📍 Local Move'}</span>
                <span style={{ fontWeight: 500, fontSize: 12 }}>{originCoords.city} → {destCoords.city} · {miles.toLocaleString()} mi</span>
              </div>
            )}
          </div>
        )}

        {/* ══ Step 3: Contact Info ══ */}
        {step === 3 && (
          <div className="gq-step-body">
            <h3 className="gq-step-title">Almost done — who should movers contact?</h3>
            <p className="gq-step-sub">Your info is shared only with vetted, licensed movers.</p>

            <div className="gq-field">
              <label className="gq-label">Full name</label>
              <input type="text" placeholder="Jane Smith"
                className={`gq-input ${errors.customerName ? 'gq-input--error' : ''}`}
                {...register('customerName')} autoComplete="name" />
              {errors.customerName && <p className="gq-error">{errors.customerName.message}</p>}
            </div>
            <div className="gq-field">
              <label className="gq-label">Email address</label>
              <input type="email" placeholder="jane@example.com"
                className={`gq-input ${errors.customerEmail ? 'gq-input--error' : ''}`}
                {...register('customerEmail')} autoComplete="email" />
              {errors.customerEmail && <p className="gq-error">{errors.customerEmail.message}</p>}
            </div>
            <div className="gq-field">
              <label className="gq-label">Phone number</label>
              <input type="tel" placeholder="(555) 867-5309"
                className={`gq-input ${errors.customerPhone ? 'gq-input--error' : ''}`}
                {...register('customerPhone')} autoComplete="tel" />
              {errors.customerPhone && <p className="gq-error">{errors.customerPhone.message}</p>}
            </div>

            {serverError && <div className="gq-server-error">{serverError}</div>}

            <p className="gq-privacy">
              By submitting, you agree to our <Link to="/privacy" target="_blank">Privacy Policy</Link>.
              We never sell your information.
            </p>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="gq-nav-row">
          {step > 1 && (
            <button type="button" className="gq-btn-back" onClick={() => setStep(s => s - 1)}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <button type="submit" className="gq-btn-next" disabled={submitting}>
            {submitting
              ? <span className="gq-spinner" />
              : step < 3
                ? <>Continue <ArrowRight size={16} /></>
                : <>Get My Free Quotes <CheckCircle size={16} /></>
            }
          </button>
        </div>
      </form>
    </div>
  );
}

// ── /get-quote page ────────────────────────────────────────────────────────
export default function GetQuote() {
  const [searchParams] = useSearchParams();
  const fromZip = searchParams.get('from') || '';
  const toZip   = searchParams.get('to')   || '';
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="gq-page">
      <nav className="gq-nav">
        <Link to="/" className="gq-logo">MoveLeads<span>.cloud</span></Link>
        <span className="gq-nav-tag">Free · No Obligation</span>
      </nav>

      <div className="gq-hero-banner">
        <h1 className="gq-hero-h1">Get Free Moving Quotes in 60 Seconds</h1>
        <p className="gq-hero-sub">
          Compare quotes from licensed, verified movers in your area.<br className="gq-br-hide" />
          No spam. No obligation.
        </p>
        <div className="gq-trust-badges">
          {[
            { icon: <Shield size={14} />, text: 'Phone-verified movers only' },
            { icon: <CheckCircle size={14} />, text: 'Free — no credit card' },
            { icon: <Clock size={14} />, text: 'Quotes in under 2 minutes' },
          ].map((b, i) => <div key={i} className="gq-trust-badge">{b.icon} {b.text}</div>)}
        </div>
      </div>

      <div className="gq-container">
        <aside className="gq-aside">
          <div className="gq-aside-badge">Trusted by 500+ movers</div>
          <h2 className="gq-aside-heading">Get up to 3 free moving quotes in minutes</h2>
          <ul className="gq-trust-list">
            <li><CheckCircle size={16} /><span>100% free, no hidden fees</span></li>
            <li><CheckCircle size={16} /><span>Verified, licensed moving companies</span></li>
            <li><CheckCircle size={16} /><span>Compare prices &amp; choose the best fit</span></li>
            <li><CheckCircle size={16} /><span>Movers contact you — no cold calls</span></li>
          </ul>
          <div className="gq-aside-reviews">
            <div className="gq-stars">★★★★★</div>
            <p className="gq-review-text">"Saved me $400 on my move to Austin. Took 2 minutes to fill out."</p>
            <span className="gq-reviewer">— Sarah K., Dallas TX</span>
          </div>
        </aside>
        <QuoteForm prefillOriginZip={fromZip} prefillDestZip={toZip} />
      </div>

      <section className="gq-how-section">
        <div className="gq-how-inner">
          <h2 className="gq-how-h2">How it works</h2>
          <div className="gq-how-grid">
            {[
              { n: '1', icon: <Home size={22} />, title: 'Tell us about your move', body: 'Fill out our quick 60-second form — home size, dates, and zip codes. No account needed.' },
              { n: '2', icon: <Phone size={22} />, title: 'We match you with local movers', body: 'Your request goes to licensed, verified movers who serve your exact area. Only the best make the cut.' },
              { n: '3', icon: <ChevronRight size={22} />, title: 'Movers contact you with their best price', body: 'Sit back and let movers compete for your job. Compare quotes and choose the one you trust.' },
            ].map((s, i) => (
              <div key={i} className="gq-how-card">
                <div className="gq-how-num">{s.n}</div>
                <div className="gq-how-icon">{s.icon}</div>
                <h3 className="gq-how-title">{s.title}</h3>
                <p className="gq-how-body">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="gq-testimonials">
        <div className="gq-test-inner">
          <div className="gq-test-header">
            <div className="gq-test-stars">★★★★★</div>
            <span className="gq-test-rating">Rated 4.9/5 · 200+ reviews</span>
          </div>
          <div className="gq-test-grid">
            {[
              { q: 'Got 3 quotes within 10 minutes. Saved $400 on my move. The whole thing took less time than making a cup of coffee.', name: 'Sarah M.', loc: 'Dallas, TX' },
              { q: "So easy. Filled out the form and had a mover calling me in 15 minutes. Booked on the spot — couldn't be happier.", name: 'James T.', loc: 'Chicago, IL' },
              { q: "Finally a site that doesn't spam you. Only heard from 2 movers, both were great. Really appreciate how clean this was.", name: 'Maria L.', loc: 'Miami, FL' },
            ].map((t, i) => (
              <div key={i} className="gq-test-card">
                <div className="gq-test-card-stars">★★★★★</div>
                <p className="gq-test-card-quote">"{t.q}"</p>
                <div className="gq-test-card-footer">
                  <div className="gq-test-avatar">{t.name.split(' ').map(x => x[0]).join('')}</div>
                  <div><div className="gq-test-name">{t.name}</div><div className="gq-test-loc">{t.loc}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="gq-footer">
        <p>© 2026 MoveLeads · <Link to="/privacy">Privacy Policy</Link> · <Link to="/get-quote">Terms</Link></p>
      </footer>
    </div>
  );
}

// ── /move/:originCity/:destCity SEO route ──────────────────────────────────
export function MoveRoute() {
  const { originCity, destCity } = useParams();
  const fmt = s => s?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';
  const from = fmt(originCity); const to = fmt(destCity);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="gq-page">
      <nav className="gq-nav">
        <Link to="/" className="gq-logo">MoveLeads<span>.cloud</span></Link>
        <span className="gq-nav-tag">Free · No Obligation</span>
      </nav>
      <div className="gq-hero-banner">
        <h1 className="gq-hero-h1">Moving from {from} to {to}?<br />Get Free Quotes in 60 Seconds</h1>
        <p className="gq-hero-sub">Licensed, verified movers who cover this route.<br className="gq-br-hide" />No spam. No obligation.</p>
        <div className="gq-trust-badges">
          {[
            { icon: <Shield size={14} />, text: 'Phone-verified movers only' },
            { icon: <CheckCircle size={14} />, text: 'Free — no credit card' },
            { icon: <Clock size={14} />, text: 'Quotes in under 2 minutes' },
          ].map((b, i) => <div key={i} className="gq-trust-badge">{b.icon} {b.text}</div>)}
        </div>
      </div>
      <div className="gq-container">
        <aside className="gq-aside">
          <div className="gq-aside-badge">Trusted by 500+ movers</div>
          <h2 className="gq-aside-heading">{from} → {to} moving specialists</h2>
          <ul className="gq-trust-list">
            <li><CheckCircle size={16} /><span>Free, no hidden fees</span></li>
            <li><CheckCircle size={16} /><span>Licensed &amp; insured movers only</span></li>
            <li><CheckCircle size={16} /><span>Compare quotes &amp; pick the best</span></li>
            <li><CheckCircle size={16} /><span>Movers contact you directly</span></li>
          </ul>
          <div className="gq-aside-reviews">
            <div className="gq-stars">★★★★★</div>
            <p className="gq-review-text">"Saved me $400 on my move. Took 2 minutes to fill out."</p>
            <span className="gq-reviewer">— Sarah M., satisfied customer</span>
          </div>
        </aside>
        <QuoteForm />
      </div>
      <footer className="gq-footer">
        <p>© 2026 MoveLeads · <Link to="/privacy">Privacy Policy</Link></p>
      </footer>
    </div>
  );
}
