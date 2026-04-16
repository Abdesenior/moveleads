import { useState, useEffect, useRef } from 'react';
import useCanonical from '../utils/useCanonical';
import { useNavigate, Link, useSearchParams, useParams } from 'react-router-dom';
import {
  CheckCircle, ArrowRight, ArrowLeft, Home, MapPin, Calendar,
  User, Phone, Mail, Shield, Star, Truck, Clock, ChevronRight,
  Building, ParkingCircle, Package, ChevronDown, Zap, Lock, Award
} from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { greatCircle } from '@turf/great-circle';
import { point } from '@turf/helpers';
import zipcodes from 'zipcodes';
import './GetQuote.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

/* ── Constants ─────────────────────────────────────────────── */
const HOME_SIZES = [
  { label: 'Studio', vol: '≤ 350 CF', rooms: 1 },
  { label: '1 Bedroom', vol: '≤ 700 CF', rooms: 2 },
  { label: '2 Bedroom', vol: '≤ 1,100 CF', rooms: 3 },
  { label: '3 Bedroom', vol: '≤ 1,600 CF', rooms: 4 },
  { label: '4 Bedroom', vol: '≤ 2,000 CF', rooms: 5 },
  { label: '5+ Bedroom', vol: '2,000+ CF', rooms: 6 },
];
const ACCESS_OPTIONS = ['Ground Floor', 'Elevator', '2nd Floor', '3rd+ Floor', 'No Stairs'];
const PARKING_OPTIONS = ['Yes – Easy', 'Long Carry', 'Shuttle Required'];
const DEMAND_COLORS = {
  low: { bg: '#dcfce7', fg: '#166534' },
  med: { bg: '#fef9c3', fg: '#854d0e' },
  high: { bg: '#fee2e2', fg: '#991b1b' },
};

const STEPS = [
  { id: 1, label: 'Home Size' },
  { id: 2, label: 'Locations' },
  { id: 3, label: 'Move Date' },
  { id: 4, label: 'Details' },
  { id: 5, label: 'Contact' },
];

/* ── Helpers ────────────────────────────────────────────────── */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function geocodeZip(zip) {
  const r = zipcodes.lookup(zip);
  return r ? { lat: r.latitude, lon: r.longitude, city: r.city, state: r.state } : null;
}

function demandLevel(date) {
  const mo = date.getMonth() + 1, day = date.getDate(), dow = date.getDay();
  if ([5, 6, 7, 8].includes(mo) && (day >= 28 || dow === 0 || dow === 6)) return 'high';
  if ([5, 6, 7, 8].includes(mo) || dow === 0 || dow === 6) return 'med';
  return 'low';
}

/* ── Mapbox Arc ─────────────────────────────────────────────── */
function MapArc({ origin, destination }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!origin || !destination || !ref.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 5000);
    const map = new mapboxgl.Map({ container: ref.current, style: 'mapbox://styles/mapbox/light-v11', center: [-98.58, 39.83], zoom: 2.5, interactive: false, attributionControl: false });
    mapRef.current = map;
    map.on('error', () => { setLoading(false); clearTimeout(t); });
    map.on('load', () => {
      const arc = greatCircle(point([origin.lon, origin.lat]), point([destination.lon, destination.lat]), { npoints: 100 });
      const coords = arc.geometry.coordinates;
      setLoading(false); clearTimeout(t);
      map.addSource('r', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
      map.addLayer({ id: 'rl', type: 'line', source: 'r', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#f97316', 'line-width': 4 } });
      const bds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bds, { padding: 50, duration: 2500, essential: true });
      const mkEl = c => { const el = document.createElement('div'); el.style.cssText = `width:13px;height:13px;background:#fff;border-radius:50%;border:3px solid ${c};box-shadow:0 2px 8px rgba(0,0,0,0.18);`; return el; };
      new mapboxgl.Marker({ element: mkEl('#2d5a9e') }).setLngLat([origin.lon, origin.lat]).addTo(map);
      new mapboxgl.Marker({ element: mkEl('#16a34a') }).setLngLat([destination.lon, destination.lat]).addTo(map);
      let step = 0;
      const anim = () => { if (!mapRef.current || step >= coords.length) return; step += 1.5; map.getSource('r').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords.slice(0, Math.min(Math.floor(step), coords.length)) } }); requestAnimationFrame(anim); };
      requestAnimationFrame(anim);
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } clearTimeout(t); };
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon]); // eslint-disable-line

  return (
    <div className="gq-map-container">
      <div ref={ref} style={{ height: '100%' }} />
      {loading && <div className="gq-map-loading">Loading route map…</div>}
    </div>
  );
}

/* ── Smart Calendar ─────────────────────────────────────────── */
function SmartCalendar({ value, onChange }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [vm, setVm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const sel = value ? new Date(value + 'T00:00:00') : null;
  const firstDay = new Date(vm.y, vm.m, 1).getDay();
  const daysInMonth = new Date(vm.y, vm.m + 1, 0).getDate();
  const monthLabel = new Date(vm.y, vm.m, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const nav = d => setVm(p => { let m = p.m + d, y = p.y; if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; } return { y, m }; });

  return (
    <div className="gq-cal">
      <div className="gq-cal-head">
        <button type="button" className="gq-cal-nav" onClick={() => nav(-1)}>‹</button>
        <span className="gq-cal-month">{monthLabel}</span>
        <button type="button" className="gq-cal-nav" onClick={() => nav(1)}>›</button>
      </div>
      <div className="gq-cal-grid">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} className="gq-cal-day-label">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const date = new Date(vm.y, vm.m, day);
          const past = date <= today;
          const isSel = sel && date.toDateString() === sel.toDateString();
          const isToday = date.toDateString() === today.toDateString();
          const dem = demandLevel(date);
          const { bg, fg } = DEMAND_COLORS[dem];
          const str = `${vm.y}-${String(vm.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return (
            <button key={day} type="button" disabled={past} onClick={() => !past && onChange(str)}
              className={`gq-cal-day${isSel ? ' gq-cal-day--selected' : ''}${isToday ? ' gq-cal-day--today' : ''}${!past && dem !== 'low' ? ' gq-cal-day--peak' : ''}`}
              style={!past && !isSel ? { background: bg, color: fg } : undefined}>
              {day}
            </button>
          );
        })}
      </div>
      <div className="gq-demand-legend">
        {[['low', '#dcfce7', '#166534', 'Best rate'], ['med', '#fef9c3', '#854d0e', 'Peak season'], ['high', '#fee2e2', '#991b1b', 'High demand']].map(([, bg, fg, l]) => (
          <div key={l} className="gq-demand-dot"><span style={{ background: bg, border: `1px solid ${fg}50` }} />{l}</div>
        ))}
      </div>
    </div>
  );
}

/* ── Step Pills ─────────────────────────────────────────────── */
function StepPills({ current }) {
  return (
    <div className="gq-step-pills">
      {STEPS.map((s, i) => {
        const state = s.id < current ? 'done' : s.id === current ? 'active' : 'idle';
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`gq-step-pill gq-step-pill--${state}`}>
              <div className="gq-step-pill-num">
                {s.id < current ? <CheckCircle size={12} /> : s.id}
              </div>
              <span className="gq-step-pill-label">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`gq-step-connector${s.id < current ? ' gq-step-connector--done' : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}

/* ── Live Summary Sidebar ───────────────────────────────────── */
function SummaryCard({ data }) {
  const isLong = (data.miles || 0) > 100;
  const rows = [
    {
      icon: <Package size={16} />, iconBg: '#eff6ff', iconColor: '#2563eb',
      label: 'Home Size', value: data.homeSize || null
    },
    {
      icon: <MapPin size={16} />, iconBg: '#f0fdf4', iconColor: '#16a34a',
      label: 'Route',
      value: data.originCity && data.destCity
        ? `${data.originCity} → ${data.destCity}`
        : data.originCity ? `From ${data.originCity}` : null,
      sub: data.miles ? `${data.miles.toLocaleString()} mi · ${isLong ? 'Long Distance' : 'Local'}` : null
    },
    {
      icon: <Calendar size={16} />, iconBg: '#fff7ed', iconColor: '#f97316',
      label: 'Move Date',
      value: data.moveDate ? new Date(data.moveDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : null
    },
    {
      icon: <Building size={16} />, iconBg: '#f5f3ff', iconColor: '#7c3aed',
      label: 'Access / Parking',
      value: data.access && data.parking ? `${data.access} · ${data.parking}` : null
    },
  ];

  return (
    <div className="gq-summary-card">
      <div className="gq-summary-header">
        <div className="gq-summary-header-icon"><Truck size={16} /></div>
        <div>
          <div className="gq-summary-title">Your Move Summary</div>
          <div className="gq-summary-sub">Updates as you fill in details</div>
        </div>
      </div>
      <div className="gq-summary-body">
        {rows.map((r, i) => (
          <div key={i} className="gq-summary-row">
            <div className="gq-summary-icon" style={{ background: r.iconBg, color: r.iconColor }}>{r.icon}</div>
            <div>
              <div className="gq-summary-label">{r.label}</div>
              {r.value
                ? <><div className="gq-summary-value">{r.value}</div>{r.sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.sub}</div>}</>
                : <div className="gq-summary-value--empty">Not yet filled</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Quote Form ─────────────────────────────────────────── */
function QuoteForm({ prefillOriginZip = '', prefillDestZip = '' }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  // Collected data object
  const [data, setData] = useState({
    homeSize: '', originZip: prefillOriginZip, destZip: prefillDestZip,
    originCity: '', destCity: '', originCoords: null, destCoords: null, miles: 0,
    moveDate: '', access: '', parking: '', specialInstructions: '',
    name: '', email: '', phone: '',
  });

  useCanonical('/get-quote');
  useEffect(() => { document.title = 'Get a Free Moving Quote — MoveLeads.cloud'; }, []);

  // Zip resolution
  const [zipError, setZipError] = useState('');
  useEffect(() => {
    const { originZip, destZip } = data;
    if (originZip.length === 5 && destZip.length === 5) {
      const oc = geocodeZip(originZip), dc = geocodeZip(destZip);
      if (!oc) { setZipError(`Invalid origin zip "${originZip}"`); setData(p => ({ ...p, originCoords: null })); return; }
      if (!dc) { setZipError(`Invalid destination zip "${destZip}"`); setData(p => ({ ...p, destCoords: null })); return; }
      setZipError('');
      const mi = haversine(oc.lat, oc.lon, dc.lat, dc.lon);
      setData(p => ({ ...p, originCoords: oc, destCoords: dc, originCity: oc.city, destCity: dc.city, miles: mi }));
    } else {
      setData(p => ({ ...p, originCoords: null, destCoords: null, originCity: '', destCity: '', miles: 0 }));
      setZipError('');
    }
  }, [data.originZip, data.destZip]); // eslint-disable-line

  const set = (key, val) => setData(p => ({ ...p, [key]: val }));

  const canNext = () => {
    if (step === 1) return !!data.homeSize;
    if (step === 2) return !!(data.originCoords && data.destCoords);
    if (step === 3) return !!data.moveDate;
    if (step === 4) return !!(data.access && data.parking);
    if (step === 5) return !!(data.name && data.email && data.phone && data.phone.replace(/\D/g, '').length === 10);
    return false;
  };

  const handleNext = () => {
    if (step === 2 && !data.originCoords) { setZipError('Please enter valid zip codes for both locations.'); return; }
    if (step < 5) { setStep(s => s + 1); return; }
    submitLead();
  };

  const submitLead = async () => {
    setSubmitting(true); setServerError('');
    const _base = (import.meta.env.VITE_API_URL || 'http://localhost:5005').replace(/\/api$/, '');
    const payload = {
      customerName: data.name,
      customerEmail: data.email,
      customerPhone: data.phone.replace(/\D/g, ''),
      originZip: data.originZip,
      destinationZip: data.destZip,
      originCity: data.originCity,
      destinationCity: data.destCity,
      homeSize: data.homeSize,
      moveDate: new Date(data.moveDate).toISOString(),
      distance: data.miles > 100 ? 'Long Distance' : 'Local',
      miles: data.miles,
      specialInstructions: `Access: ${data.access}. Parking: ${data.parking}. ${data.specialInstructions}`.trim()
    };
    try {
      const res = await fetch(`${_base}/api/leads/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Submission failed. Please try again.');
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', { send_to: 'AW-18096682129', value: 1.0, currency: 'USD' });
      }
      navigate('/thank-you', { state: { homeSize: data.homeSize, originZip: data.originZip, destZip: data.destZip } });
    } catch (err) { setServerError(err.message); }
    finally { setSubmitting(false); }
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;
  const isLong = data.miles > 100;

  const inputSt = (err) => ({
    className: `gq-input${err ? ' gq-input--error' : ''}`
  });

  return (
    <div>
      {/* Card */}
      <div className="gq-card">
        <div className="gq-card-header">
          <div className="gq-card-header-icon"><Home size={17} /></div>
          <div>
            <div className="gq-card-header-title">Free Moving Quote</div>
            <div className="gq-card-header-sub">Licensed carriers only · No brokers · No spam</div>
          </div>
        </div>
        <div className="gq-progress-bar"><div className="gq-progress-fill" style={{ width: `${progress}%` }} /></div>
        <StepPills current={step} />

        {/* ══ STEP 1: Home Size ══ */}
        {step === 1 && (
          <div className="gq-step-body">
            <div className="gq-step-title">What size is your home?</div>
            <div className="gq-step-sub">Select the option that best describes where you're moving from.</div>
            <div className="gq-size-grid">
              {HOME_SIZES.map(s => (
                <button key={s.label} type="button"
                  className={`gq-size-btn${data.homeSize === s.label ? ' gq-size-btn--selected' : ''}`}
                  onClick={() => set('homeSize', s.label)}>
                  <Truck size={20} />
                  <span>{s.label}</span>
                  <span className="gq-vol">{s.vol}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ══ STEP 2: Locations ══ */}
        {step === 2 && (
          <div className="gq-step-body">
            <div className="gq-step-title">Where are you moving?</div>
            <div className="gq-step-sub">Enter your 5-digit zip codes — the route will appear on the map.</div>

            <div className="gq-zip-grid">
              <div className="gq-field">
                <label className="gq-label" style={{ color: '#2563eb' }}>📦 Moving From (ZIP)</label>
                <input className="gq-input" type="text" inputMode="numeric" maxLength={5}
                  placeholder="e.g. 75201" value={data.originZip}
                  onChange={e => set('originZip', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  style={{ borderColor: data.originCoords ? '#2563eb' : undefined }} />
                {data.originCoords && <div className="gq-zip-found" style={{ color: '#2563eb' }}>✓ {data.originCoords.city}, {data.originCoords.state}</div>}
              </div>
              <div className="gq-field">
                <label className="gq-label" style={{ color: '#16a34a' }}>🏠 Moving To (ZIP)</label>
                <input className="gq-input" type="text" inputMode="numeric" maxLength={5}
                  placeholder="e.g. 90210" value={data.destZip}
                  onChange={e => set('destZip', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  style={{ borderColor: data.destCoords ? '#16a34a' : undefined }} />
                {data.destCoords && <div className="gq-zip-found" style={{ color: '#16a34a' }}>✓ {data.destCoords.city}, {data.destCoords.state}</div>}
              </div>
            </div>

            {zipError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '9px 13px', fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{zipError}</div>}

            {data.originCoords && data.destCoords && (
              <>
                <MapArc origin={data.originCoords} destination={data.destCoords} />
                <div className={`gq-dist-pill gq-dist-pill--${isLong ? 'long' : 'local'}`}>
                  <span>{isLong ? '🚛 Long Distance Move' : '📍 Local Move'}</span>
                  <span style={{ fontWeight: 500, fontSize: 12 }}>{data.originCoords.city} → {data.destCoords.city} · {data.miles.toLocaleString()} mi</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ STEP 3: Move Date ══ */}
        {step === 3 && (
          <div className="gq-step-body">
            <div className="gq-step-title">When are you moving?</div>
            <div className="gq-step-sub">Weekdays and off-peak months give you the best rates.</div>
            <SmartCalendar value={data.moveDate} onChange={v => set('moveDate', v)} />
            {data.moveDate && (() => {
              const d = demandLevel(new Date(data.moveDate + 'T00:00:00'));
              const msgs = { low: ['🟢', 'Great choice! This is a low-demand date.'], med: ['🟡', 'Moderate demand — slight price increase.'], high: ['🔴', 'High demand date — peak pricing applies.'] };
              const [icon, text] = msgs[d];
              return (
                <div style={{ marginTop: 12, padding: '9px 14px', borderRadius: 10, background: DEMAND_COLORS[d].bg, color: DEMAND_COLORS[d].fg, fontSize: 13, fontWeight: 600 }}>
                  {icon} {text}
                </div>
              );
            })()}
          </div>
        )}

        {/* ══ STEP 4: Move Details ══ */}
        {step === 4 && (
          <div className="gq-step-body">
            <div className="gq-step-title">A few more details</div>
            <div className="gq-step-sub">These help movers provide an accurate quote.</div>

            <div className="gq-field">
              <label className="gq-label"><Building size={12} style={{ display: 'inline', marginRight: 5 }} />Building Access at Pickup</label>
              <div className="gq-toggle-row">
                {ACCESS_OPTIONS.map(o => (
                  <button key={o} type="button" className={`gq-toggle-btn${data.access === o ? ' gq-toggle-btn--active' : ''}`} onClick={() => set('access', o)}>{o}</button>
                ))}
              </div>
            </div>

            <div className="gq-field">
              <label className="gq-label"><ParkingCircle size={12} style={{ display: 'inline', marginRight: 5 }} />Truck Parking at Pickup</label>
              <div className="gq-toggle-row">
                {PARKING_OPTIONS.map(o => (
                  <button key={o} type="button" className={`gq-toggle-btn${data.parking === o ? ' gq-toggle-btn--active' : ''}`} onClick={() => set('parking', o)}>{o}</button>
                ))}
              </div>
            </div>

            <div className="gq-field">
              <label className="gq-label">Special instructions (optional)</label>
              <textarea className="gq-input" rows={3}
                placeholder="e.g. Grand piano, fragile artwork, storage unit pickup…"
                style={{ resize: 'vertical' }}
                value={data.specialInstructions}
                onChange={e => set('specialInstructions', e.target.value)} />
            </div>
          </div>
        )}

        {/* ══ STEP 5: Contact Info ══ */}
        {step === 5 && (
          <div className="gq-step-body">
            <div className="gq-step-title">Who should movers contact?</div>
            <div className="gq-step-sub">Your info is shared only with the licensed mover matched to your route.</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="gq-field">
                <label className="gq-label"><User size={11} style={{ display: 'inline', marginRight: 4 }} />First Name</label>
                <input {...inputSt(!data.name)} type="text" placeholder="Jane" value={data.name} onChange={e => set('name', e.target.value)} autoComplete="given-name" />
              </div>
              <div className="gq-field">
                <label className="gq-label"><Phone size={11} style={{ display: 'inline', marginRight: 4 }} />Phone Number</label>
                <input {...inputSt(data.phone && data.phone.replace(/\D/g, '').length !== 10)} type="tel" placeholder="(555) 867-5309" value={data.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" />
                {data.phone && data.phone.replace(/\D/g, '').length !== 10 && data.phone.length > 5 && <p className="gq-error">Must be a 10-digit US number</p>}
              </div>
            </div>

            <div className="gq-field">
              <label className="gq-label"><Mail size={11} style={{ display: 'inline', marginRight: 4 }} />Email Address</label>
              <input {...inputSt(!data.email.includes('@'))} type="email" placeholder="jane@example.com" value={data.email} onChange={e => set('email', e.target.value)} autoComplete="email" />
            </div>

            {/* One-mover promise */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'var(--blue-l)', borderRadius: 12, border: '1px solid #bfdbfe', marginBottom: 4 }}>
              <Shield size={16} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 12, color: 'var(--blue)', lineHeight: 1.55, margin: 0 }}>
                <strong>No more than 1 licensed mover</strong> will contact you. We prioritise quality over quantity — no spam, no broker middlemen.
              </p>
            </div>

            {serverError && <div className="gq-server-error">{serverError}</div>}

            <p className="gq-privacy">
              By submitting you agree to our <Link to="/privacy" target="_blank">Privacy Policy</Link>. We never sell your data.
            </p>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="gq-nav-row">
          {step > 1 && (
            <button type="button" className="gq-btn-back" onClick={() => setStep(s => s - 1)}>
              <ArrowLeft size={15} /> Back
            </button>
          )}
          <button type="button" className="gq-btn-next" disabled={!canNext() || submitting} onClick={handleNext}>
            {submitting
              ? <span className="gq-spinner" />
              : step < 5
                ? <>Next Step <ArrowRight size={15} /></>
                : <>Get My Free Quote <CheckCircle size={15} /></>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── FAQ accordion ───────────────────────────────────────────── */
const FAQ_ITEMS = [
  { q: 'Will I get calls from multiple companies?', a: 'No. We match you with 1–3 verified movers who service your exact route. We never sell your information to multiple companies. You\'ll only hear from movers who are genuinely available for your move.' },
  { q: 'Is this service free?', a: 'Yes, completely free for you. You fill out one form, we match you with a verified licensed mover, and you pay nothing to use MoveLeads. The moving company pays a small fee only if you\'re matched to them.' },
  { q: 'How fast will movers respond?', a: 'Most customers receive a call or text within 15 minutes during business hours. For off-hours submissions, expect a response by the next morning. We notify movers immediately when a new lead comes in.' },
  { q: 'Are the movers licensed and insured?', a: 'Yes. Every mover on our network is FMCSA-licensed and carries full liability insurance. We verify USDOT numbers and licenses before any mover is admitted to our network. Unlicensed brokers are never admitted.' },
  { q: 'What if I have a bad experience with a mover?', a: 'We have a built-in Resolution Center. If a mover is unresponsive, unprofessional, or fails to honor their quote, you can report the issue directly through your dashboard. We investigate every complaint and remove bad actors from our network.' },
];

/* ── Sidebar ─────────────────────────────────────────────────── */
function Sidebar({ data }) {
  return (
    <div className="gq-sidebar">
      <SummaryCard data={data} />

      <div className="gq-trust-card">
        <div className="gq-trust-card-title">Why MoveLeads</div>
        {[
          { icon: <CheckCircle size={15} />, bg: '#ecfdf5', c: '#10b981', title: 'Licensed carriers only', sub: 'Every mover is FMCSA-licensed. No unlicensed brokers, ever.' },
          { icon: <Shield size={15} />, bg: '#eff6ff', c: '#3b82f6', title: 'Phone-verified movers', sub: 'All movers on our network pass ID and license verification.' },
          { icon: <Star size={15} />, bg: '#fff7ed', c: '#f59e0b', title: 'One matched mover', sub: 'We match you to one mover — not a flood of strangers calling.' },
          { icon: <Clock size={15} />, bg: '#f5f3ff', c: '#8b5cf6', title: 'Fast response', sub: 'Most customers receive a call within 15–30 minutes.' },
        ].map((t, i) => (
          <div key={i} className="gq-trust-item">
            <div className="gq-trust-item-icon" style={{ background: t.bg, color: t.c }}>{t.icon}</div>
            <div>
              <div className="gq-trust-item-title">{t.title}</div>
              <div className="gq-trust-item-sub">{t.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="gq-rating-card">
        <div className="gq-rating-stars">★★★★★</div>
        <p className="gq-rating-quote">"Got matched in minutes. The mover who called was professional, gave me a binding estimate, and beat every other quote I had."</p>
        <div className="gq-rating-footer">
          <div className="gq-rating-avatar">SR</div>
          <div>
            <div className="gq-rating-name">Sarah R.</div>
            <div className="gq-rating-loc">Dallas → Austin, TX</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE WRAPPER — shared between /get-quote and /move/:from/:to
═══════════════════════════════════════════════════════════════ */
function QuotePage({ prefillOriginZip = '', prefillDestZip = '', heroTitle, heroSub }) {
  const [faqOpen, setFaqOpen] = useState(null);
  // We hold data at page level so Sidebar can read it
  const [data, setData] = useState({
    homeSize: '', originZip: prefillOriginZip, destZip: prefillDestZip,
    originCity: '', destCity: '', originCoords: null, destCoords: null, miles: 0,
    moveDate: '', access: '', parking: '', specialInstructions: '',
    name: '', email: '', phone: '',
  });

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const scrollToWidget = () => document.getElementById('quote-widget')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="gq-page">
      {/* ─── STICKY NAV ─── */}
      <nav className="gq-nav">
        <Link to="/" className="gq-logo">MoveLeads<span>.cloud</span></Link>
        <div className="gq-nav-links">
          <a href="#quote-widget" onClick={e => { e.preventDefault(); scrollToWidget(); }} className="gq-nav-link">Get Quote</a>
          <a href="#how-it-works" onClick={e => { e.preventDefault(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); }} className="gq-nav-link">How It Works</a>
          <a href="#why-moveleads" onClick={e => { e.preventDefault(); document.getElementById('why-moveleads')?.scrollIntoView({ behavior: 'smooth' }); }} className="gq-nav-link">Why Us</a>
          <a href="#reviews" onClick={e => { e.preventDefault(); document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' }); }} className="gq-nav-link">Reviews</a>
          <a href="#faq" onClick={e => { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }); }} className="gq-nav-link">FAQ</a>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <div className="gq-hero">
        <div className="gq-hero-eyebrow">
          <Shield size={12} /> Licensed Movers Only — No Brokers
        </div>
        <h1>{heroTitle || <>Get Matched With a Verified <em>Mover</em> in 60 Seconds</>}</h1>
        <p className="gq-hero-sub">{heroSub || "One verified mover for your route. Transparent pricing. No spam, ever."}</p>
        <div className="gq-hero-cta-wrap">
          <button className="gq-hero-cta" onClick={scrollToWidget}>Get Matched Now <ArrowRight size={16} /></button>
          <span className="gq-hero-cta-note">It's free. No obligation.</span>
        </div>
        <div className="gq-trust-row">
          {[
            { icon: <CheckCircle size={13} />, text: 'Matched to your exact route' },
            { icon: <Shield size={13} />, text: '1 verified mover, not 8 strangers' },
            { icon: <Star size={13} />, text: 'Transparent, upfront pricing' },
          ].map((b, i) => <div key={i} className="gq-trust-chip">{b.icon} {b.text}</div>)}
        </div>

        {/* Trust badge row — like MoveSafe's FMCSA/BBB row but better */}
        <div className="gq-badge-row">
          {[
            { icon: <Shield size={20} />, title: 'Licensed movers only', sub: 'Direct carrier connections — no brokers' },
            { icon: <Award size={20} />, title: 'Free — no obligation', sub: 'Get matched for free in under 60 seconds' },
            { icon: <CheckCircle size={20} />, title: 'Your info is never sold', sub: 'Privacy first — we never sell your data' },
          ].map((b, i) => (
            <div key={i} className="gq-badge">
              <div className="gq-badge-icon">{b.icon}</div>
              <div className="gq-badge-title">{b.title}</div>
              <div className="gq-badge-sub">{b.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── WIDGET ─── */}
      <div id="quote-widget" className="gq-body">
        <QuoteFormStateful prefillOriginZip={prefillOriginZip} prefillDestZip={prefillDestZip} data={data} setData={setData} />
        <Sidebar data={data} />
      </div>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="gq-how-section">
        <div className="gq-section-inner">
          <div className="gq-section-center">
            <div className="gq-section-eyebrow">HOW IT WORKS</div>
            <h2 className="gq-section-h2">Three steps to your matched mover</h2>
            <p className="gq-section-sub-center">No browsing. No callbacks. Three steps to your matched mover.</p>
          </div>
          <div className="gq-how-grid">
            {[
              { n: '1', title: 'Tell us about your move (60 seconds)', body: 'Enter your destination, home size, and move date. Takes just 60 seconds.' },
              { n: '2', title: 'We match you with verified movers', body: 'Our algorithm finds the best licensed carrier for your specific route and area.' },
              { n: '3', title: 'Movers contact you — you choose', body: 'Get a call within minutes with their best price. You choose the one that fits.' },
            ].map((s, i) => (
              <div key={i} className="gq-how-card">
                <div className="gq-how-num-orange">{s.n}</div>
                <div className="gq-how-title">{s.title}</div>
                <div className="gq-how-body">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHY MOVELEADS ─── */}
      <section id="why-moveleads" className="gq-why-section">
        <div className="gq-section-inner">
          {/* Header — left-aligned like MoveSafe */}
          <div className="gq-why-header">
            <h2 className="gq-section-h2-lg">MoveLeads is not another quote site.<br /><em>It's a smarter way to move.</em></h2>
            <p className="gq-why-header-sub">Other sites sell your info and disappear. We match you with one verified mover — and stay with you until the last box is delivered.</p>
          </div>

          {/* Top row — 2 cards */}
          <div className="gq-feature-grid">
            <div className="gq-feature-card">
              <div className="gq-feature-tag">MATCHING</div>
              <h3 className="gq-feature-title">One matched mover, not five strangers</h3>
              <p className="gq-feature-body">Other sites sell your info to 5–8 companies who all call at once. We match you with one verified mover who actually services your route.</p>
            </div>
            <div className="gq-feature-card">
              <div className="gq-feature-tag">TRUST</div>
              <h3 className="gq-feature-title">Licensed carriers only — no brokers, ever</h3>
              <p className="gq-feature-body">Every company in our network is an actual moving carrier — licensed by the FMCSA, fully insured, and phone-verified. No brokers outsourcing to random subcontractors.</p>
            </div>
          </div>

          {/* Featured dark card — full width */}
          <div className="gq-feature-dark">
            <div className="gq-feature-dark-left">
              <div className="gq-feature-dark-label">What sets us apart</div>
              <h3 className="gq-feature-dark-title">We follow up on your move until it's done</h3>
              <p className="gq-feature-dark-body">A dedicated follow-up agent is assigned to your move from booking to delivery — monitoring pickup, transit, and drop-off. If anything goes wrong, we step in.</p>
            </div>
            <div className="gq-feature-dark-right">
              {['Pickup confirmed', 'In transit', 'Delivered safely'].map((s, i) => (
                <span key={i} className="gq-followup-step"><CheckCircle size={15} /> {s}</span>
              ))}
            </div>
          </div>

          {/* Bottom row — 2 cards */}
          <div className="gq-feature-grid">
            <div className="gq-feature-card">
              <div className="gq-feature-tag">PRICING</div>
              <h3 className="gq-feature-title">Matched on price, not just proximity</h3>
              <p className="gq-feature-body">Our algorithm compares real rates across all verified companies on your route and matches you with the best value for your move size and service level.</p>
            </div>
            <div className="gq-feature-card">
              <div className="gq-feature-tag">SPEED</div>
              <h3 className="gq-feature-title">15-minute response time</h3>
              <p className="gq-feature-body">Your matched mover connects with you almost instantly. No waiting hours or days for someone to call back.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── COMPARISON TABLE ─── */}
      <section className="gq-compare-section">
        <div className="gq-section-inner gq-section-narrow">
          <div className="gq-section-center">
            <div className="gq-section-eyebrow">THE DIFFERENCE</div>
            <h2 className="gq-section-h2">One perfect match vs. a flood of strangers</h2>
          </div>
          <table className="gq-compare-table">
            <thead>
              <tr>
                <th></th>
                <th className="gq-col-us">MoveLeads</th>
                <th className="gq-col-them">Other sites</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Phone verified movers', 'Yes',            'Rarely'],
                ['Your info sold',           'Never',          'Always'],
                ['Fake numbers blocked',     'Yes',            'No'],
                ['Response time',            'Under 15 min',   'Hours'],
                ['Cost to get a quote',      'Free',           'Free'],
              ].map(([feat, us, them], i) => (
                <tr key={i}>
                  <td>{feat}</td>
                  <td className="gq-col-us">{us}</td>
                  <td className="gq-col-them">{them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section id="reviews" className="gq-test-section">
        <div className="gq-section-inner">
          <div className="gq-section-center">
            <div className="gq-section-eyebrow">CUSTOMER REVIEWS</div>
            <h2 className="gq-section-h2">Families matched, moves completed</h2>
          </div>
          <div className="gq-test-grid-3col">
            {[
              { stars: 5, q: '"Got 3 quotes within 10 minutes. Saved $400 on my move."', name: 'Sarah M.', loc: 'Dallas, TX' },
              { stars: 5, q: '"So easy. One form and a mover called me in 15 minutes."', name: 'James T.', loc: 'Chicago, IL' },
              { stars: 5, q: '"Finally a site that doesn\'t spam you with 10 calls."', name: 'Maria L.', loc: 'Miami, FL' },
            ].map((t, i) => (
              <div key={i} className="gq-test-card">
                <div className="gq-test-stars">{'★'.repeat(t.stars)}</div>
                <p className="gq-test-quote">{t.q}</p>
                <div className="gq-test-footer">
                  <div className="gq-test-name">{t.name}</div>
                  <div className="gq-test-loc">{t.loc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="gq-faq-section">
        <div className="gq-section-inner gq-section-narrow">
          <div className="gq-section-center">
            <div className="gq-section-eyebrow">FAQ</div>
            <h2 className="gq-section-h2">Common questions</h2>
          </div>
          <div className="gq-faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className={`gq-faq-item${faqOpen === i ? ' gq-faq-item--open' : ''}`}>
                <button className="gq-faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                  <span>{item.q}</span>
                  <ChevronDown size={18} className={`gq-faq-icon${faqOpen === i ? ' gq-faq-icon--open' : ''}`} />
                </button>
                {faqOpen === i && <div className="gq-faq-a">{item.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── BOTTOM CTA ─── */}
      <section className="gq-cta-section">
        <div className="gq-cta-inner">
          <h2 className="gq-cta-h2">Your mover is one form away — it's free and takes 60 seconds.</h2>
          <p className="gq-cta-sub">Tell us your route. Our algorithm matches you with the best verified mover for your specific needs, instantly.</p>
          <div className="gq-hero-cta-wrap">
            <button className="gq-hero-cta" onClick={scrollToWidget}>Get Matched Now <ArrowRight size={16} /></button>
            <span className="gq-hero-cta-note">It's free. Takes 60 seconds. No spam, ever.</span>
          </div>
          <div className="gq-cta-trust">
            <span><CheckCircle size={14} /> Only FMCSA-verified movers</span>
            <span><Lock size={14} /> Your info stays with us, never sold</span>
            <span><Zap size={14} /> Matched in under 60 seconds</span>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="gq-footer">
        <div className="gq-footer-inner">
          <p className="gq-footer-tagline">We match you with the right mover for your route. Verified companies, real prices, one perfect match.</p>
          <div className="gq-footer-grid">
            <div>
              <div className="gq-footer-heading">Quick Links</div>
              <Link to="/get-quote">Get Matched</Link>
              <Link to="/for-movers">For Movers</Link>
              <Link to="/about">About</Link>
            </div>
            <div>
              <div className="gq-footer-heading">Legal</div>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
            </div>
            <div>
              <div className="gq-footer-heading">Contact</div>
              <a href="mailto:support@moveleads.cloud">support@moveleads.cloud</a>
            </div>
          </div>
          <div className="gq-footer-bottom">
            <span>© 2026 MoveLeads.cloud. All rights reserved.</span>
          </div>
        </div>
      </footer>

      {/* ─── STICKY BOTTOM BAR ─── */}
      <div className="gq-sticky-bar">
        <span className="gq-sticky-text"><Zap size={14} /> Matched with a verified mover in 60 seconds</span>
        <button className="gq-sticky-btn" onClick={scrollToWidget}>Get Matched Now — It's Free</button>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .gq-body {
            display: flex !important;
            flex-direction: column !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            padding: 20px !important;
            gap: 40px;
          }
          .gq-card, .gq-sidebar {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            margin: 0 !important;
          }
          .gq-card { order: 1; }
          .gq-sidebar { 
            order: 2; 
            padding: 15px !important;
            margin-top: -20px !important; 
          }
          .gq-sidebar-card {
            box-shadow: none !important;
            border: 1px solid var(--blue-l) !important;
          }
          .gq-nav-links {
            display: none;
          }
          .gq-hero h1 {
            font-size: 34px !important;
          }
          .gq-hero {
            padding: 40px 20px !important;
          }
          .gq-sticky-bar .gq-sticky-text {
            display: none;
          }
          .gq-sticky-bar {
            justify-content: center;
          }
          .gq-how-grid, .gq-feature-grid, .gq-test-grid-3col {
            grid-template-columns: 1fr !important;
          }
          .gq-badge-row, .gq-trust-row {
            display: flex !important;
            flex-direction: column !important;
            align-items: center;
            gap: 12px;
          }
          .gq-zip-grid {
            grid-template-columns: 1fr !important;
          }
          .gq-feature-dark {
            flex-direction: column !important;
          }
        }
      `}</style>
    </div>
  );
}

/* Stateful form that syncs to parent data */
function QuoteFormStateful({ prefillOriginZip, prefillDestZip, data, setData }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [zipError, setZipError] = useState('');

  const set = (key, val) => setData(p => ({ ...p, [key]: val }));

  // Resolve zips
  useEffect(() => {
    const { originZip, destZip } = data;
    if (originZip.length === 5 && destZip.length === 5) {
      const oc = geocodeZip(originZip), dc = geocodeZip(destZip);
      if (!oc) { setZipError(`Invalid origin zip "${originZip}"`); setData(p => ({ ...p, originCoords: null, originCity: '' })); return; }
      if (!dc) { setZipError(`Invalid destination zip "${destZip}"`); setData(p => ({ ...p, destCoords: null, destCity: '' })); return; }
      setZipError('');
      const mi = haversine(oc.lat, oc.lon, dc.lat, dc.lon);
      setData(p => ({ ...p, originCoords: oc, destCoords: dc, originCity: oc.city, destCity: dc.city, miles: mi }));
    } else {
      if (originZip.length < 5 || destZip.length < 5) { setData(p => ({ ...p, originCoords: null, destCoords: null, originCity: '', destCity: '', miles: 0 })); setZipError(''); }
    }
  }, [data.originZip, data.destZip]); // eslint-disable-line

  const canNext = () => {
    if (step === 1) return !!data.homeSize;
    if (step === 2) return !!(data.originCoords && data.destCoords);
    if (step === 3) return !!data.moveDate;
    if (step === 4) return !!(data.access && data.parking);
    if (step === 5) return !!(data.name && data.email?.includes('@') && data.phone?.replace(/\D/g, '').length === 10);
    return false;
  };

  const isLong = data.miles > 100;

  const handleNext = () => {
    if (step === 2 && !data.originCoords) { setZipError('Please enter valid zip codes for both locations.'); return; }
    if (step < 5) { setStep(s => s + 1); return; }
    submitLead();
  };

  const submitLead = async () => {
    setSubmitting(true); setServerError('');
    const _base = (import.meta.env.VITE_API_URL || 'http://localhost:5005').replace(/\/api$/, '');
    const payload = {
      customerName: data.name, customerEmail: data.email,
      customerPhone: data.phone.replace(/\D/g, ''),
      originZip: data.originZip, destinationZip: data.destZip,
      originCity: data.originCity, destinationCity: data.destCity,
      homeSize: data.homeSize, moveDate: new Date(data.moveDate).toISOString(),
      distance: data.miles > 100 ? 'Long Distance' : 'Local', miles: data.miles,
      specialInstructions: `Access: ${data.access}. Parking: ${data.parking}. ${data.specialInstructions}`.trim()
    };
    try {
      const res = await fetch(`${_base}/api/leads/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Submission failed.');
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', { send_to: 'AW-18096682129', value: 1.0, currency: 'USD' });
      }
      navigate('/thank-you', { state: { homeSize: data.homeSize, originZip: data.originZip, destZip: data.destZip } });
    } catch (err) { setServerError(err.message); }
    finally { setSubmitting(false); }
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="gq-card">
      <div className="gq-card-header">
        <div className="gq-card-header-icon"><Home size={17} /></div>
        <div>
          <div className="gq-card-header-title">Free Moving Quote</div>
          <div className="gq-card-header-sub">Licensed carriers only · No brokers · No spam</div>
        </div>
      </div>
      <div className="gq-progress-bar"><div className="gq-progress-fill" style={{ width: `${progress}%` }} /></div>
      <StepPills current={step} />

      {/* STEP 1 */}
      {step === 1 && (
        <div className="gq-step-body">
          <div className="gq-step-title">What size is your home?</div>
          <div className="gq-step-sub">Select the option that best matches your current home.</div>
          <div className="gq-size-grid">
            {HOME_SIZES.map(s => (
              <button key={s.label} type="button"
                className={`gq-size-btn${data.homeSize === s.label ? ' gq-size-btn--selected' : ''}`}
                onClick={() => set('homeSize', s.label)}>
                <Truck size={20} /><span>{s.label}</span><span className="gq-vol">{s.vol}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className="gq-step-body">
          <div className="gq-step-title">Where are you moving?</div>
          <div className="gq-step-sub">Enter your 5-digit zip codes — the map will draw your route automatically.</div>
          <div className="gq-zip-grid">
            <div className="gq-field">
              <label className="gq-label" style={{ color: '#2563eb' }}>📦 From ZIP</label>
              <input className="gq-input" type="text" inputMode="numeric" maxLength={5}
                placeholder="e.g. 75201" value={data.originZip}
                onChange={e => set('originZip', e.target.value.replace(/\D/g, '').slice(0, 5))}
                style={{ borderColor: data.originCoords ? '#2563eb' : undefined }} />
              {data.originCoords && <div className="gq-zip-found" style={{ color: '#2563eb' }}>✓ {data.originCoords.city}, {data.originCoords.state}</div>}
            </div>
            <div className="gq-field">
              <label className="gq-label" style={{ color: '#16a34a' }}>🏠 To ZIP</label>
              <input className="gq-input" type="text" inputMode="numeric" maxLength={5}
                placeholder="e.g. 90210" value={data.destZip}
                onChange={e => set('destZip', e.target.value.replace(/\D/g, '').slice(0, 5))}
                style={{ borderColor: data.destCoords ? '#16a34a' : undefined }} />
              {data.destCoords && <div className="gq-zip-found" style={{ color: '#16a34a' }}>✓ {data.destCoords.city}, {data.destCoords.state}</div>}
            </div>
          </div>
          {zipError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '9px 13px', fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{zipError}</div>}
          {data.originCoords && data.destCoords && (
            <>
              <MapArc origin={data.originCoords} destination={data.destCoords} />
              <div className={`gq-dist-pill gq-dist-pill--${isLong ? 'long' : 'local'}`}>
                <span>{isLong ? '🚛 Long Distance Move' : '📍 Local Move'}</span>
                <span style={{ fontWeight: 500, fontSize: 12 }}>{data.originCoords.city} → {data.destCoords.city} · {data.miles.toLocaleString()} mi</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div className="gq-step-body">
          <div className="gq-step-title">When are you moving?</div>
          <div className="gq-step-sub">Weekdays and off-peak months give you the best rates.</div>
          <SmartCalendar value={data.moveDate} onChange={v => set('moveDate', v)} />
          {data.moveDate && (() => {
            const d = demandLevel(new Date(data.moveDate + 'T00:00:00'));
            const msgs = { low: ['🟢', 'Great choice! Low-demand, best pricing available.'], med: ['🟡', 'Moderate demand — slight price increase.'], high: ['🔴', 'High demand — peak pricing applies.'] };
            const [icon, text] = msgs[d];
            return <div style={{ marginTop: 12, padding: '9px 14px', borderRadius: 10, background: DEMAND_COLORS[d].bg, color: DEMAND_COLORS[d].fg, fontSize: 13, fontWeight: 600 }}>{icon} {text}</div>;
          })()}
        </div>
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <div className="gq-step-body">
          <div className="gq-step-title">A few more details</div>
          <div className="gq-step-sub">This helps movers give you an accurate binding estimate.</div>

          <div className="gq-field">
            <label className="gq-label">Building access at pickup</label>
            <div className="gq-toggle-row">
              {ACCESS_OPTIONS.map(o => (
                <button key={o} type="button" className={`gq-toggle-btn${data.access === o ? ' gq-toggle-btn--active' : ''}`} onClick={() => set('access', o)}>{o}</button>
              ))}
            </div>
          </div>
          <div className="gq-field">
            <label className="gq-label">Truck parking at pickup</label>
            <div className="gq-toggle-row">
              {PARKING_OPTIONS.map(o => (
                <button key={o} type="button" className={`gq-toggle-btn${data.parking === o ? ' gq-toggle-btn--active' : ''}`} onClick={() => set('parking', o)}>{o}</button>
              ))}
            </div>
          </div>
          <div className="gq-field">
            <label className="gq-label">Special items or notes (optional)</label>
            <textarea className="gq-input" rows={3} style={{ resize: 'vertical' }}
              placeholder="e.g. Grand piano, fragile artwork, storage unit pickup…"
              value={data.specialInstructions} onChange={e => set('specialInstructions', e.target.value)} />
          </div>
        </div>
      )}

      {/* STEP 5 */}
      {step === 5 && (
        <div className="gq-step-body">
          <div className="gq-step-title">Who should movers contact?</div>
          <div className="gq-step-sub">Shared only with the one licensed mover matched to your route.</div>

          <div className="gq-contact-grid">
            <div className="gq-field">
              <label className="gq-label">First Name</label>
              <input className="gq-input" type="text" placeholder="Jane" value={data.name} onChange={e => set('name', e.target.value)} autoComplete="given-name" />
            </div>
            <div className="gq-field">
              <label className="gq-label">Phone Number</label>
              <input className={`gq-input${data.phone && data.phone.replace(/\D/g, '').length !== 10 && data.phone.length > 5 ? ' gq-input--error' : ''}`} type="tel" placeholder="(555) 867-5309" value={data.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" />
              {data.phone && data.phone.replace(/\D/g, '').length !== 10 && data.phone.length > 5 && <p className="gq-error">Must be a 10-digit US number</p>}
            </div>
          </div>
          <div className="gq-field">
            <label className="gq-label">Email Address</label>
            <input className="gq-input" type="email" placeholder="jane@example.com" value={data.email} onChange={e => set('email', e.target.value)} autoComplete="email" />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'var(--blue-l)', borderRadius: 12, border: '1px solid #bfdbfe', marginBottom: 4 }}>
            <Shield size={16} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, color: 'var(--blue)', lineHeight: 1.55, margin: 0 }}>
              <strong>No more than 1 licensed mover</strong> will contact you. We prioritise quality over quantity — no spam, no broker middlemen.
            </p>
          </div>
          {serverError && <div className="gq-server-error">{serverError}</div>}
          <p className="gq-privacy">By submitting you agree to our <Link to="/privacy" target="_blank">Privacy Policy</Link>. We never sell your data.</p>
        </div>
      )}

      {/* Nav buttons */}
      <div className="gq-nav-row">
        {step > 1 && (
          <button type="button" className="gq-btn-back" onClick={() => setStep(s => s - 1)}>
            <ArrowLeft size={15} /> Back
          </button>
        )}
        <button type="button" className="gq-btn-next" disabled={!canNext() || submitting} onClick={handleNext}>
          {submitting ? <span className="gq-spinner" /> : step < 5 ? <>Next Step <ArrowRight size={15} /></> : <>Get My Free Quote <CheckCircle size={15} /></>}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EXPORTED ROUTES
═══════════════════════════════════════════════════════════════ */
export default function GetQuote() {
  const [searchParams] = useSearchParams();
  return <QuotePage prefillOriginZip={searchParams.get('from') || ''} prefillDestZip={searchParams.get('to') || ''} />;
}

export function MoveRoute() {
  const { originCity, destCity } = useParams();
  const fmt = s => s?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';
  const from = fmt(originCity), to = fmt(destCity);
  return (
    <QuotePage
      heroTitle={<>Moving from {from} to <em>{to}</em>?<br />Get a Free Quote in 60 Seconds</>}
      heroSub={`We'll match you with a licensed mover who actively services the ${from} to ${to} route — at the best price available.`}
    />
  );
}
