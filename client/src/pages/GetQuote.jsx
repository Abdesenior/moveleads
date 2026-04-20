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

/* ── FAQ Items ──────────────────────────────────────────────── */
const FAQ_ITEMS = [
  { q: 'Is this free?', a: 'Yes, completely free for homeowners and renters. You fill out one form, we match you with a verified licensed mover, and you pay nothing to use MoveLeads. The moving company pays a small fee only if they are matched to you.' },
  { q: 'Will I get spam calls?', a: 'No. We send your information to no more than 1–3 licensed movers who actively service your exact route. We never sell your data to lead brokers or third parties. You will only hear from movers who are genuinely available for your move.' },
  { q: 'How fast will movers respond?', a: 'Within 15 minutes on average during business hours. For after-hours submissions, expect a response by the next morning. We notify movers the instant a new matching lead arrives.' },
  { q: 'Are movers licensed?', a: 'Yes. Every mover on our network is FMCSA-licensed and carries full liability insurance. We verify USDOT numbers and licenses before any mover is admitted to our platform. Unlicensed brokers are never allowed.' },
  { q: 'What if something goes wrong?', a: 'Use our Resolution Center (available in your dashboard after submitting) to report any issue — unresponsive movers, pricing disputes, or damage claims. We investigate every complaint and remove bad actors from our network.' },
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
  const [data, setData] = useState({
    homeSize: '', originZip: prefillOriginZip, destZip: prefillDestZip,
    originCity: '', destCity: '', originCoords: null, destCoords: null, miles: 0,
    moveDate: '', access: '', parking: '', specialInstructions: '',
    name: '', email: '', phone: '',
  });

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Intersection Observer — fade-in animations as sections enter view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('gq2-visible'); }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    const els = document.querySelectorAll('.gq2-animate');
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollToWidget = () => document.getElementById('quote-widget')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="gq-page">

      {/* ── STICKY NAV ── */}
      <nav className="gq-nav">
        <Link to="/" className="gq-logo">MoveLeads<span>.cloud</span></Link>
        <div className="gq-nav-links">
          {[
            { label: 'Get Quote',    id: 'quote-widget' },
            { label: 'How It Works', id: 'how-it-works' },
            { label: 'Why Us',       id: 'why-moveleads' },
            { label: 'Reviews',      id: 'reviews' },
            { label: 'FAQ',          id: 'faq' },
          ].map(({ label, id }) => (
            <a key={id} href={`#${id}`}
              onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }}
              className="gq-nav-link">{label}</a>
          ))}
        </div>
      </nav>

      {/* ════════════════════════════════════════════
          1. HERO — full-width photo + widget
      ════════════════════════════════════════════ */}
      <section
        className="gq2-hero"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=1800&q=80&auto=format&fit=crop)' }}
      >
        <div className="gq2-hero-overlay" />
        <div className="gq2-hero-inner">

          {/* Left: headline + trust chips */}
          <div className="gq2-hero-left">
            <div className="gq2-hero-eyebrow">
              <Shield size={13} /> Licensed &amp; verified movers only
            </div>
            <h1 className="gq2-hero-h1">
              {heroTitle || <>Get Free Moving<br />Quotes in 60 Seconds</>}
            </h1>
            <p className="gq2-hero-sub">
              {heroSub || 'Compare quotes from licensed movers in your area. Free, no obligation, no spam.'}
            </p>
            <div className="gq2-hero-trust">
              {['Licensed & verified movers', 'Free — no credit card', 'Get quotes in minutes'].map((t, i) => (
                <div key={i} className="gq2-hero-trust-item">
                  <span className="gq2-check-dot">✓</span> {t}
                </div>
              ))}
            </div>
          </div>

          {/* Right: the widget */}
          <div id="quote-widget" className="gq2-hero-widget">
            <QuoteFormStateful
              prefillOriginZip={prefillOriginZip}
              prefillDestZip={prefillDestZip}
              data={data}
              setData={setData}
            />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          2. SOCIAL PROOF BAR
      ════════════════════════════════════════════ */}
      <div className="gq2-proof-bar">
        {[
          { num: '10,000+', label: 'Moves completed' },
          { num: '4.9★',    label: 'Average rating' },
          { num: '15 min',  label: 'Avg response time' },
        ].map((s, i) => (
          <div key={i} className="gq2-proof-stat">
            <span className="gq2-proof-num">{s.num}</span>
            <span className="gq2-proof-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════
          3. HOW IT WORKS
      ════════════════════════════════════════════ */}
      <section id="how-it-works" className="gq2-sec gq2-sec--gray">
        <div className="gq2-inner">
          <div className="gq2-animate gq2-sec-hd">
            <p className="gq2-eyebrow">HOW IT WORKS</p>
            <h2 className="gq2-h2">Simple. Fast. Free.</h2>
            <p className="gq2-sec-sub">No browsing. No spam. Three steps to quotes from real, licensed movers.</p>
          </div>

          <div className="gq2-how-layout">
            <div className="gq2-how-steps">
              {[
                { emoji: '📋', n: 1, title: 'Tell us about your move', body: '60 seconds to fill out. Home size, route, and move date — that\'s it.' },
                { emoji: '🔍', n: 2, title: 'We match you with movers', body: 'Verified, licensed movers in your area get notified and review your request instantly.' },
                { emoji: '📞', n: 3, title: 'Movers contact you', body: 'Get quotes and choose the best offer. No pressure, zero obligation.' },
              ].map((s, i) => (
                <div key={i} className="gq2-animate gq2-how-card" style={{ transitionDelay: `${i * 0.12}s` }}>
                  <div className="gq2-how-emoji">{s.emoji}</div>
                  <div>
                    <p className="gq2-how-step-lbl">Step {s.n}</p>
                    <h3 className="gq2-how-title">{s.title}</h3>
                    <p className="gq2-how-body">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="gq2-animate gq2-how-photo-wrap">
              <img
                src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=700&q=75&auto=format&fit=crop"
                alt="Couple packing boxes for their move"
                className="gq2-how-photo"
                loading="lazy"
              />
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 44 }}>
            <button className="gq2-btn-orange" onClick={scrollToWidget}>
              Start My Free Quote <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          4. WHY CHOOSE US
      ════════════════════════════════════════════ */}
      <section id="why-moveleads" className="gq2-sec gq2-sec--white">
        <div className="gq2-inner">
          <div className="gq2-why-layout">

            <div className="gq2-animate gq2-why-photo-wrap">
              <img
                src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700&q=75&auto=format&fit=crop"
                alt="Professional movers carrying furniture"
                className="gq2-why-photo"
                loading="lazy"
              />
            </div>

            <div className="gq2-animate gq2-why-content">
              <p className="gq2-eyebrow">WHY CHOOSE US</p>
              <h2 className="gq2-h2" style={{ textAlign: 'left', marginBottom: 32 }}>
                Moving done right,<br />every time.
              </h2>
              {[
                { title: 'All movers are phone-verified and licensed', body: 'Every carrier in our network is FMCSA-licensed and passes our phone verification process before they can receive leads.' },
                { title: 'Your info is never sold to third parties', body: 'Unlike other quote sites, we never sell your data. Your information is shared only with matched movers on your route.' },
                { title: 'No spam calls — only matched movers contact you', body: 'We send your info to 1–3 movers max who actively service your exact route. No cold calls from random brokers.' },
                { title: 'Free resolution center if anything goes wrong', body: 'Report any issue through our Resolution Center. We investigate every complaint and remove bad actors.' },
              ].map((b, i) => (
                <div key={i} className="gq2-why-bullet">
                  <div className="gq2-why-check">✓</div>
                  <div>
                    <p className="gq2-why-bullet-title">{b.title}</p>
                    <p className="gq2-why-bullet-body">{b.body}</p>
                  </div>
                </div>
              ))}
              <button className="gq2-btn-orange" style={{ marginTop: 28 }} onClick={scrollToWidget}>
                Get My Free Quotes <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          5. TESTIMONIALS
      ════════════════════════════════════════════ */}
      <section id="reviews" className="gq2-sec gq2-sec--gray">
        <div className="gq2-inner">
          <div className="gq2-animate gq2-sec-hd">
            <p className="gq2-eyebrow">REAL REVIEWS</p>
            <h2 className="gq2-h2">Thousands of happy movers</h2>
          </div>
          <div className="gq2-test-grid">
            {[
              {
                name: 'Sarah M.', loc: 'Dallas, TX',
                quote: '"Got 3 quotes in 10 minutes. Saved $400 on my move and the mover was incredibly professional!"',
                img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&q=80&auto=format&fit=crop&crop=face',
              },
              {
                name: 'James T.', loc: 'Chicago, IL',
                quote: '"One form, one call, done. No spam from 10 different companies. This is exactly how it should work."',
                img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&q=80&auto=format&fit=crop&crop=face',
              },
              {
                name: 'Maria L.', loc: 'Miami, FL',
                quote: '"Finally a moving site that doesn\'t sell your number to everyone. Got a great quote in minutes!"',
                img: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=80&h=80&q=80&auto=format&fit=crop&crop=face',
              },
            ].map((t, i) => (
              <div key={i} className="gq2-animate gq2-test-card" style={{ transitionDelay: `${i * 0.12}s` }}>
                <div className="gq2-test-stars">★★★★★</div>
                <p className="gq2-test-q">{t.quote}</p>
                <div className="gq2-test-footer">
                  <img src={t.img} alt={t.name} className="gq2-test-img" loading="lazy" />
                  <div>
                    <p className="gq2-test-name">{t.name}</p>
                    <p className="gq2-test-loc">{t.loc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          6. MOVING TIPS
      ════════════════════════════════════════════ */}
      <section className="gq2-sec gq2-sec--white">
        <div className="gq2-inner">
          <div className="gq2-animate gq2-sec-hd">
            <p className="gq2-eyebrow">EXPERT ADVICE</p>
            <h2 className="gq2-h2">Moving tips from our experts</h2>
          </div>
          <div className="gq2-tips-grid">
            {[
              { emoji: '📅', tip: 'Book your mover 4–6 weeks in advance for the best rates and to lock in your preferred move date.' },
              { emoji: '☀️', tip: 'Moving in summer? Expect 20–30% higher prices. Book early to secure off-peak rates before they spike.' },
              { emoji: '🔍', tip: 'Always verify your mover\'s license on FMCSA.dot.gov before signing anything or paying a deposit.' },
            ].map((t, i) => (
              <div key={i} className="gq2-animate gq2-tip-card" style={{ transitionDelay: `${i * 0.12}s` }}>
                <div className="gq2-tip-emoji">{t.emoji}</div>
                <p className="gq2-tip-text">{t.tip}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          7. FAQ
      ════════════════════════════════════════════ */}
      <section id="faq" className="gq2-sec gq2-sec--gray">
        <div className="gq2-inner gq2-inner--narrow">
          <div className="gq2-animate gq2-sec-hd">
            <p className="gq2-eyebrow">FAQ</p>
            <h2 className="gq2-h2">Common questions</h2>
          </div>
          <div className="gq2-faq">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className={`gq2-faq-row${faqOpen === i ? ' gq2-faq-row--open' : ''}`}>
                <button className="gq2-faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                  <span>{item.q}</span>
                  <ChevronDown size={18} className={`gq-faq-icon${faqOpen === i ? ' gq-faq-icon--open' : ''}`} />
                </button>
                {faqOpen === i && <div className="gq2-faq-a">{item.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          8. BOTTOM CTA
      ════════════════════════════════════════════ */}
      <section className="gq2-cta-sec">
        <div className="gq2-cta-inner">
          <h2 className="gq2-cta-h2">Ready to get moving?<br />It's free and takes 60 seconds</h2>
          <p className="gq2-cta-sub">One form. Licensed movers. No spam. No obligation.</p>
          <button className="gq2-cta-white-btn" onClick={scrollToWidget}>
            Get My Free Quotes Now →
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
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

      {/* ── STICKY BOTTOM BAR ── */}
      <div className="gq-sticky-bar">
        <span className="gq-sticky-text"><Zap size={14} /> Matched with a verified mover in 60 seconds</span>
        <button className="gq-sticky-btn" onClick={scrollToWidget}>Get Free Quotes — It's Free</button>
      </div>

      {/* ════════════════════════════════════════════
          GQ2 STYLES — scoped to this page
      ════════════════════════════════════════════ */}
      <style>{`
        /* ── Hero ──────────────────────────────────── */
        .gq2-hero {
          position: relative;
          background-size: cover;
          background-position: center top;
          background-repeat: no-repeat;
          padding-top: 64px;
        }
        .gq2-hero-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(120deg,rgba(26,39,68,0.83) 0%,rgba(26,39,68,0.62) 55%,rgba(26,39,68,0.48) 100%);
        }
        .gq2-hero-inner {
          position: relative; z-index: 1;
          max-width: 1240px; margin: 0 auto;
          padding: 60px 32px 72px;
          display: grid;
          grid-template-columns: 1fr 500px;
          gap: 52px;
          align-items: start;
        }
        .gq2-hero-left { padding-top: 28px; }
        .gq2-hero-eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(255,255,255,0.14); color: #fff;
          padding: 7px 16px; border-radius: 100px;
          font-size: 12px; font-weight: 600; margin-bottom: 22px;
          border: 1px solid rgba(255,255,255,0.22);
          backdrop-filter: blur(6px);
        }
        .gq2-hero-h1 {
          font-size: 54px; font-weight: 900; color: #fff;
          line-height: 1.08; margin: 0 0 18px;
          font-family: 'Poppins', sans-serif;
        }
        .gq2-hero-sub {
          font-size: 18px; color: rgba(255,255,255,0.88);
          line-height: 1.6; margin: 0 0 30px;
        }
        .gq2-hero-trust { display: flex; flex-direction: column; gap: 11px; }
        .gq2-hero-trust-item {
          display: flex; align-items: center; gap: 10px;
          color: rgba(255,255,255,0.92); font-size: 15px; font-weight: 500;
        }
        .gq2-check-dot {
          width: 22px; height: 22px; border-radius: 50%;
          background: #FF6B35; color: #fff;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 900; flex-shrink: 0;
        }

        /* ── Social proof bar ──────────────────────── */
        .gq2-proof-bar {
          background: #FFF7F0; border-bottom: 1px solid #fde8d6;
          display: flex; justify-content: center;
        }
        .gq2-proof-stat {
          display: flex; flex-direction: column; align-items: center;
          padding: 22px 60px; gap: 4px;
          border-right: 1px solid #fde8d6;
        }
        .gq2-proof-stat:last-child { border-right: none; }
        .gq2-proof-num {
          font-size: 30px; font-weight: 900; color: #FF6B35;
          font-family: 'Poppins', sans-serif; line-height: 1;
        }
        .gq2-proof-label { font-size: 13px; color: #64748b; }

        /* ── Sections ───────────────────────────────── */
        .gq2-sec { padding: 88px 0; }
        .gq2-sec--gray { background: #F8FAFC; }
        .gq2-sec--white { background: #fff; }
        .gq2-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
        .gq2-inner--narrow { max-width: 780px; }
        .gq2-sec-hd { text-align: center; margin-bottom: 52px; }
        .gq2-eyebrow {
          font-size: 11px; font-weight: 800; letter-spacing: 1.6px;
          color: #FF6B35; text-transform: uppercase; margin: 0 0 10px;
        }
        .gq2-h2 {
          font-size: 38px; font-weight: 800; color: #1a2744; margin: 0;
          font-family: 'Poppins', sans-serif; line-height: 1.15; text-align: center;
        }
        .gq2-sec-sub {
          font-size: 16px; color: #64748b; margin: 12px 0 0; line-height: 1.55;
        }

        /* ── Scroll animations ─────────────────────── */
        .gq2-animate {
          opacity: 0; transform: translateY(28px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .gq2-visible { opacity: 1 !important; transform: translateY(0) !important; }

        /* ── How it works ──────────────────────────── */
        .gq2-how-layout {
          display: grid; grid-template-columns: 1fr 420px;
          gap: 56px; align-items: center;
        }
        .gq2-how-steps { display: flex; flex-direction: column; gap: 16px; }
        .gq2-how-card {
          background: #fff; border-radius: 16px; padding: 22px 24px;
          border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          display: flex; align-items: flex-start; gap: 18px;
        }
        .gq2-how-emoji { font-size: 28px; flex-shrink: 0; margin-top: 2px; }
        .gq2-how-step-lbl {
          font-size: 10px; font-weight: 800; color: #FF6B35;
          text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px;
        }
        .gq2-how-title {
          font-size: 16px; font-weight: 700; color: #1a2744;
          font-family: 'Poppins', sans-serif; margin: 0 0 5px;
        }
        .gq2-how-body { font-size: 13px; color: #64748b; line-height: 1.55; margin: 0; }
        .gq2-how-photo-wrap {
          border-radius: 20px; overflow: hidden;
          box-shadow: 0 20px 60px rgba(0,0,0,0.14);
        }
        .gq2-how-photo { width: 100%; height: 440px; object-fit: cover; display: block; }

        /* ── Why choose us ─────────────────────────── */
        .gq2-why-layout {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 64px; align-items: center;
        }
        .gq2-why-photo-wrap {
          border-radius: 20px; overflow: hidden;
          box-shadow: 0 20px 60px rgba(0,0,0,0.12);
        }
        .gq2-why-photo { width: 100%; height: 520px; object-fit: cover; display: block; }
        .gq2-why-bullet {
          display: flex; gap: 14px; align-items: flex-start; margin-bottom: 20px;
        }
        .gq2-why-bullet:last-of-type { margin-bottom: 0; }
        .gq2-why-check {
          width: 26px; height: 26px; border-radius: 50%;
          background: #FF6B35; color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 900; flex-shrink: 0; margin-top: 3px;
        }
        .gq2-why-bullet-title { font-size: 15px; font-weight: 700; color: #1a2744; margin: 0 0 3px; }
        .gq2-why-bullet-body { font-size: 13px; color: #64748b; line-height: 1.5; margin: 0; }

        /* ── Orange button ─────────────────────────── */
        .gq2-btn-orange {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 13px 26px; border-radius: 100px; border: none;
          background: #FF6B35; color: #fff;
          font-size: 14px; font-weight: 700; cursor: pointer;
          font-family: 'Poppins', sans-serif;
          box-shadow: 0 8px 24px rgba(255,107,53,0.32);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .gq2-btn-orange:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(255,107,53,0.42); }

        /* ── Testimonials ──────────────────────────── */
        .gq2-test-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
        }
        .gq2-test-card {
          background: #fff; border-radius: 18px; padding: 28px;
          border: 1px solid #e2e8f0; box-shadow: 0 4px 18px rgba(0,0,0,0.06);
        }
        .gq2-test-stars { color: #f59e0b; font-size: 18px; margin-bottom: 14px; }
        .gq2-test-q {
          font-size: 14px; color: #334155; line-height: 1.65;
          margin: 0 0 22px; font-style: italic;
        }
        .gq2-test-footer { display: flex; align-items: center; gap: 12px; }
        .gq2-test-img {
          width: 46px; height: 46px; border-radius: 50%;
          object-fit: cover; flex-shrink: 0; border: 2px solid #f1f5f9;
        }
        .gq2-test-name { font-size: 14px; font-weight: 700; color: #1a2744; margin: 0; }
        .gq2-test-loc  { font-size: 12px; color: #94a3b8; margin: 0; }

        /* ── Moving tips ───────────────────────────── */
        .gq2-tips-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
        }
        .gq2-tip-card {
          background: #FFF7F0; border: 1px solid #fde8d6;
          border-radius: 18px; padding: 30px 24px; text-align: center;
        }
        .gq2-tip-emoji { font-size: 36px; margin-bottom: 14px; }
        .gq2-tip-text { font-size: 15px; color: #1a2744; line-height: 1.6; margin: 0; font-weight: 500; }

        /* ── FAQ ───────────────────────────────────── */
        .gq2-faq {
          border: 1px solid #e2e8f0; border-radius: 16px;
          overflow: hidden; background: #fff;
        }
        .gq2-faq-row { border-bottom: 1px solid #f1f5f9; }
        .gq2-faq-row:last-child { border-bottom: none; }
        .gq2-faq-q {
          width: 100%; text-align: left; background: none; border: none;
          padding: 20px 24px; font-size: 15px; font-weight: 600;
          color: #1a2744; cursor: pointer;
          display: flex; justify-content: space-between;
          align-items: center; gap: 16px; font-family: inherit;
          transition: background 0.15s;
        }
        .gq2-faq-q:hover { background: #fafbfc; }
        .gq2-faq-row--open .gq2-faq-q { color: #FF6B35; background: #FFF7F0; }
        .gq2-faq-a { padding: 0 24px 20px; font-size: 14px; color: #64748b; line-height: 1.65; }

        /* ── Bottom CTA ────────────────────────────── */
        .gq2-cta-sec { background: #FF6B35; padding: 84px 24px; }
        .gq2-cta-inner { max-width: 680px; margin: 0 auto; text-align: center; }
        .gq2-cta-h2 {
          font-size: 38px; font-weight: 900; color: #fff;
          margin: 0 0 16px; font-family: 'Poppins', sans-serif; line-height: 1.15;
        }
        .gq2-cta-sub {
          color: rgba(255,255,255,0.88); font-size: 17px; margin: 0 0 34px; line-height: 1.5;
        }
        .gq2-cta-white-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 16px 38px; border-radius: 100px; border: none;
          background: #fff; color: #FF6B35;
          font-size: 16px; font-weight: 800; cursor: pointer;
          font-family: 'Poppins', sans-serif;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .gq2-cta-white-btn:hover { transform: translateY(-2px); box-shadow: 0 14px 40px rgba(0,0,0,0.2); }

        /* ── RESPONSIVE ────────────────────────────── */
        @media (max-width: 960px) {
          /* Keep existing widget mobile fixes */
          .gq-body {
            display: flex !important; flex-direction: column !important;
            height: auto !important; min-height: auto !important;
            overflow: visible !important; padding: 20px !important; gap: 40px;
          }
          .gq-card, .gq-sidebar {
            width: 100% !important; max-width: 100% !important;
            min-width: 100% !important; margin: 0 !important;
          }
          .gq-card { order: 1; }
          .gq-sidebar { order: 2; padding: 15px !important; margin-top: -20px !important; }
          .gq-nav-links { display: none; }
          .gq-sticky-bar .gq-sticky-text { display: none; }
          .gq-sticky-bar { justify-content: center; }
          .gq-how-grid, .gq-feature-grid, .gq-test-grid-3col { grid-template-columns: 1fr !important; }
          .gq-badge-row, .gq-trust-row { display: flex !important; flex-direction: column !important; align-items: center; gap: 12px; }
          .gq-zip-grid { grid-template-columns: 1fr !important; }
          .gq-feature-dark { flex-direction: column !important; }

          /* New hero */
          .gq2-hero-inner { grid-template-columns: 1fr; gap: 28px; padding: 88px 16px 40px; }
          .gq2-hero-h1 { font-size: 34px; }
          .gq2-hero-sub { font-size: 16px; }
          .gq2-hero-left { padding-top: 0; }

          /* Proof bar */
          .gq2-proof-bar { flex-wrap: wrap; }
          .gq2-proof-stat {
            padding: 16px 24px; flex: 1; min-width: 130px;
            border-right: none; border-bottom: 1px solid #fde8d6;
          }
          .gq2-proof-stat:last-child { border-bottom: none; }
          .gq2-proof-num { font-size: 24px; }

          /* Sections */
          .gq2-sec { padding: 60px 0; }
          .gq2-h2 { font-size: 28px; }
          .gq2-sec-hd { margin-bottom: 36px; }

          /* How it works */
          .gq2-how-layout { grid-template-columns: 1fr; gap: 32px; }
          .gq2-how-photo-wrap { order: -1; }
          .gq2-how-photo { height: 220px; }

          /* Why choose us */
          .gq2-why-layout { grid-template-columns: 1fr; gap: 36px; }
          .gq2-why-photo { height: 260px; }

          /* Testimonials */
          .gq2-test-grid { grid-template-columns: 1fr; }

          /* Tips */
          .gq2-tips-grid { grid-template-columns: 1fr; }

          /* CTA */
          .gq2-cta-h2 { font-size: 26px; }
          .gq2-cta-sub { font-size: 15px; }
        }

        @media (max-width: 600px) {
          .gq2-hero-h1 { font-size: 28px; }
          .gq2-proof-stat { flex: 0 0 50%; }
          .gq2-proof-num { font-size: 22px; }
          .gq2-cta-white-btn { font-size: 14px; padding: 14px 28px; }
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
