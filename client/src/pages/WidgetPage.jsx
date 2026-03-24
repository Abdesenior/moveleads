import { useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { greatCircle } from '@turf/great-circle';
import { point } from '@turf/helpers';
import zipcodes from 'zipcodes';
import {
  Zap, ShieldCheck, Code, CheckCircle, Copy,
  Mail, ChevronRight, Home, Phone, User
} from 'lucide-react';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

/* ── Constants ──────────────────────────────────────────── */
const HOME_SIZES = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5 Bedroom'];

const BASE_PRICES = {
  'Studio': 299, '1 Bedroom': 449, '2 Bedroom': 649,
  '3 Bedroom': 899, '4 Bedroom': 1199, '5 Bedroom': 1599,
};

/* ── Haversine distance (miles) ─────────────────────────── */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* ── Quote calculator ───────────────────────────────────── */
function calcQuote(size, miles) {
  const base = BASE_PRICES[size] || 649;
  const distFee = Math.min(Math.round(miles * 0.35), 800);
  return { base, distFee, total: base + distFee };
}

/* ── ZIP geocoder — bundled data, zero API calls ────────── */
function geocodeZip(zip) {
  const r = zipcodes.lookup(zip);
  if (!r) return null;
  return { lat: r.latitude, lon: r.longitude, city: r.city, state: r.state };
}

/* ── House SVG icon ─────────────────────────────────────── */
function HouseIcon({ size = 36, selected = false }) {
  const c = selected ? '#1e3a8a' : '#94a3b8';
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 16L18 4L32 16V32H23V22H13V32H4V16Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/* ── 5-step progress bar ────────────────────────────────── */
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

/* ══════════════════════════════════════════════════════════
   MAP ARC COMPONENT
   ══════════════════════════════════════════════════════════ */
function MapArc({ origin, destination }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!origin || !destination || !containerRef.current) return;

    // Clean up previous instance
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [(origin.lon + destination.lon) / 2, (origin.lat + destination.lat) / 2],
      zoom: 4,
      interactive: false,
      attributionControl: false,
      logoPosition: 'bottom-right',
    });

    mapRef.current = map;

    map.on('load', () => {
      // Fit to show both points
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([origin.lon, origin.lat]);
      bounds.extend([destination.lon, destination.lat]);
      map.fitBounds(bounds, { padding: 80, duration: 500 });

      // Build great-circle arc coordinates
      let coords;
      try {
        const arcFeature = greatCircle(
          point([origin.lon, origin.lat]),
          point([destination.lon, destination.lat]),
          { npoints: 100 }
        );
        coords = arcFeature.geometry
          ? arcFeature.geometry.coordinates
          : arcFeature.features[0].geometry.coordinates;
      } catch {
        // Fallback: straight line if turf fails
        coords = [[origin.lon, origin.lat], [destination.lon, destination.lat]];
      }

      // Empty source — we'll animate by adding coords
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
      });

      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#3B8BD4', 'line-width': 2.5, 'line-opacity': 0.9 },
      });

      // Animate arc over 1200ms
      const DURATION = 1200;
      const startTime = performance.now();
      let markersAdded = false;

      function animate(now) {
        if (!mapRef.current) return;
        const progress = Math.min((now - startTime) / DURATION, 1);
        const visibleCount = Math.max(Math.ceil(progress * coords.length), 1);

        try {
          map.getSource('route').setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords.slice(0, visibleCount) },
          });
        } catch { return; }

        // Add pins when arc is 80% drawn
        if (progress >= 0.8 && !markersAdded) {
          markersAdded = true;

          const mkEl = (color, glow) => {
            const el = document.createElement('div');
            el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 0 7px ${glow};cursor:default;`;
            return el;
          };

          new mapboxgl.Marker({ element: mkEl('#3B8BD4', 'rgba(59,139,212,0.15)') })
            .setLngLat([origin.lon, origin.lat]).addTo(map);

          new mapboxgl.Marker({ element: mkEl('#1D9E75', 'rgba(29,158,117,0.15)') })
            .setLngLat([destination.lon, destination.lat]).addTo(map);
        }

        if (progress < 1) requestAnimationFrame(animate);
      }

      requestAnimationFrame(animate);
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon]); // eslint-disable-line

  return (
    <div
      ref={containerRef}
      style={{ height: 200, borderRadius: 12, overflow: 'hidden', border: '0.5px solid #e0e0e0', marginBottom: 10 }}
    />
  );
}

/* ── Distance info pill ─────────────────────────────────── */
function DistancePill({ miles, origin, destination }) {
  if (!miles || !origin || !destination) return null;
  const hrs = Math.round(miles / 55);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#E6F1FB', borderRadius: 20, padding: '7px 14px', marginBottom: 16 }}>
      <span style={{ color: '#185FA5', fontSize: 12, fontWeight: 700 }}>
        {miles.toLocaleString()} miles — ~{hrs} hrs drive
      </span>
      <span style={{ color: '#185FA5', fontSize: 11, opacity: 0.7 }}>
        {origin.city}, {origin.state} → {destination.city}, {destination.state}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   THE INTERACTIVE DEMO WIDGET
   ══════════════════════════════════════════════════════════ */
function DemoWidget() {
  const [step, setStep] = useState(1);
  const [size, setSize] = useState('');
  const [originZip, setOriginZip] = useState('');
  const [destZip, setDestZip] = useState('');
  const [originCoords, setOriginCoords] = useState(null);
  const [destCoords, setDestCoords] = useState(null);
  const [miles, setMiles] = useState(0);
  const [zipError, setZipError] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Auto-geocode when both zips are 5 digits — instant, no API call
  useEffect(() => {
    if (originZip.length === 5 && destZip.length === 5) {
      const oc = geocodeZip(originZip);
      const dc = geocodeZip(destZip);
      if (!oc) { setZipError(`Couldn't find "${originZip}". Please check and try again.`); setOriginCoords(null); setDestCoords(null); return; }
      if (!dc) { setZipError(`Couldn't find "${destZip}". Please check and try again.`); setDestCoords(null); return; }
      setZipError('');
      setOriginCoords(oc);
      setDestCoords(dc);
      setMiles(haversine(oc.lat, oc.lon, dc.lat, dc.lon));
    } else {
      setOriginCoords(null);
      setDestCoords(null);
      setMiles(0);
      setZipError('');
    }
  }, [originZip, destZip]);

  const { base, distFee, total } = calcQuote(size, miles);
  const mapReady = !!(originCoords && destCoords);
  const canProceedStep2 = mapReady && !zipError;

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid #e2e8f0', fontSize: 14,
    fontFamily: 'inherit', outline: 'none', color: '#0f172a',
    marginBottom: 10,
  };
  const focusStyle = { borderColor: '#ea580c', boxShadow: '0 0 0 3px rgba(234,88,12,0.1)' };

  const nextBtn = (label, onClick, disabled) => (
    <button
      type="button" onClick={onClick} disabled={disabled}
      style={{
        flex: 1, padding: '13px', borderRadius: 12, border: 'none',
        background: !disabled ? 'linear-gradient(135deg,#ea580c,#c2410c)' : '#e2e8f0',
        color: !disabled ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700,
        cursor: !disabled ? 'pointer' : 'not-allowed',
        fontFamily: "'Poppins',sans-serif",
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        transition: 'all 0.2s',
      }}
    >
      {label} <ChevronRight size={16} />
    </button>
  );

  const backBtn = (onClick) => (
    <button type="button" onClick={onClick} style={{ padding: '13px 20px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
      Back
    </button>
  );

  const handleReset = () => {
    setStep(1); setSize(''); setOriginZip(''); setDestZip('');
    setOriginCoords(null); setDestCoords(null); setMiles(0);
    setZipError(''); setName(''); setPhone(''); setEmail('');
  };

  return (
    <div style={{
      background: '#fff', borderRadius: 20,
      boxShadow: '0 24px 64px rgba(0,0,0,0.14), 0 8px 24px rgba(0,0,0,0.08)',
      width: '100%', maxWidth: 540, overflow: 'hidden',
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
                    key={s} type="button" onClick={() => setSize(s)}
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
              type="button" onClick={() => size && setStep(2)} disabled={!size}
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

        {/* ── Step 2: Zip codes + map ── */}
        {step === 2 && (
          <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
            <StepHeading>Where Are You Moving?</StepHeading>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#3B8BD4', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>
                  From ZIP
                </label>
                <input
                  type="text" placeholder="e.g. 90210" maxLength={5}
                  value={originZip} onChange={e => setOriginZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  style={{ ...inputStyle, marginBottom: 0, borderColor: originCoords ? '#3B8BD4' : '#e2e8f0' }}
                  onFocus={e => Object.assign(e.target.style, focusStyle)}
                  onBlur={e => { e.target.style.borderColor = originCoords ? '#3B8BD4' : '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                />
                {originCoords && (
                  <div style={{ fontSize: 11, color: '#3B8BD4', fontWeight: 600, marginTop: 4 }}>
                    {originCoords.city}, {originCoords.state}
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>
                  To ZIP
                </label>
                <input
                  type="text" placeholder="e.g. 10001" maxLength={5}
                  value={destZip} onChange={e => setDestZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  style={{ ...inputStyle, marginBottom: 0, borderColor: destCoords ? '#1D9E75' : '#e2e8f0' }}
                  onFocus={e => Object.assign(e.target.style, focusStyle)}
                  onBlur={e => { e.target.style.borderColor = destCoords ? '#1D9E75' : '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                />
                {destCoords && (
                  <div style={{ fontSize: 11, color: '#1D9E75', fontWeight: 600, marginTop: 4 }}>
                    {destCoords.city}, {destCoords.state}
                  </div>
                )}
              </div>
            </div>

            {/* Error state */}
            {zipError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
                {zipError}
              </div>
            )}

            {/* Map + distance pill */}
            {mapReady && (
              <>
                <MapArc origin={originCoords} destination={destCoords} />
                <DistancePill miles={miles} origin={originCoords} destination={destCoords} />
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              {backBtn(() => setStep(1))}
              {nextBtn(
                mapReady ? 'See My Quote' : 'Enter ZIP Codes',
                () => canProceedStep2 && setStep(3),
                !canProceedStep2
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Quote with map ── */}
        {step === 3 && (
          <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
            <StepHeading>Your Instant Quote</StepHeading>

            {/* Map (already loaded, replays from same coords) */}
            {mapReady && <MapArc origin={originCoords} destination={destCoords} />}
            {mapReady && <DistancePill miles={miles} origin={originCoords} destination={destCoords} />}

            {/* Quote breakdown */}
            <div style={{ background: '#f8fafc', borderRadius: 14, padding: '16px', marginBottom: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginBottom: 8 }}>
                <span>{size} move</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>${base.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginBottom: 12, paddingBottom: 12, borderBottom: '1px dashed #e2e8f0' }}>
                <span>Distance ({miles.toLocaleString()} mi)</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>+${distFee.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                <span>Estimated total</span>
                <span style={{ color: '#ea580c' }}>${total.toLocaleString()}</span>
              </div>
            </div>

            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginBottom: 16 }}>
              Final price confirmed by your mover. No obligation.
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              {backBtn(() => setStep(2))}
              {nextBtn('Claim This Quote', () => setStep(4), false)}
            </div>
          </div>
        )}

        {/* ── Step 4: Contact form ── */}
        {step === 4 && (
          <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
            <StepHeading>Your Contact Details</StepHeading>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <User size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
              <input
                type="text" placeholder="Full Name" value={name}
                onChange={e => setName(e.target.value)}
                style={inputStyle}
                onFocus={e => Object.assign(e.target.style, focusStyle)}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Phone size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
              <input
                type="tel" placeholder="Phone Number" value={phone}
                onChange={e => setPhone(e.target.value)}
                style={inputStyle}
                onFocus={e => Object.assign(e.target.style, focusStyle)}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Mail size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
              <input
                type="email" placeholder="Email Address" value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ ...inputStyle, marginBottom: 0 }}
                onFocus={e => Object.assign(e.target.style, focusStyle)}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {backBtn(() => setStep(3))}
              {nextBtn('Send Details', () => (name && phone) && setStep(5), !name || !phone)}
            </div>
          </div>
        )}

        {/* ── Step 5: Confirmation with map ── */}
        {step === 5 && (
          <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <CheckCircle size={28} color="#16a34a" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>Quote Confirmed!</h3>
              <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.6, margin: '0 0 4px' }}>
                Thanks, <strong>{name}</strong>! Your quote has been sent to <strong>{phone}</strong>.<br />
                A local mover will contact you shortly.
              </p>
            </div>

            {mapReady && <MapArc origin={originCoords} destination={destCoords} />}

            <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '12px 16px', textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                ${total.toLocaleString()} estimated — {size} move, {miles.toLocaleString()} mi
              </div>
            </div>

            <button type="button" onClick={handleReset}
              style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: '#ea580c', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
              ↺ Restart Demo
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes wgFadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */
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
              background: '#fff', padding: '28px', borderRadius: 18,
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
          3. LIVE DEMO
          ══════════════════════════════════ */}
      <div id="demo-section" style={{
        background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 40%, #fdf4ff 70%, #fff7ed 100%)',
        padding: '80px 24px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 220, height: 160, background: 'rgba(134,239,172,0.5)', filter: 'blur(40px)', borderRadius: '0 80% 0 0', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 220, height: 160, background: 'rgba(251,146,60,0.35)', filter: 'blur(40px)', borderRadius: '80% 0 0 0', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 0, right: '10%', width: 160, height: 120, background: 'rgba(167,139,250,0.2)', filter: 'blur(30px)', borderRadius: '0 0 80% 80%', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', color: '#64748b', padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              LIVE DEMO
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: '#0f172a', margin: '0 0 12px', fontFamily: "'Poppins',sans-serif", letterSpacing: '-0.02em' }}>
              Test drive the widget
            </h2>
            <p style={{ fontSize: 16, color: '#64748b', maxWidth: 500, margin: '0 auto' }}>
              Type two real ZIP codes — watch the map animate live.
            </p>
          </div>

          {/* Left: embed code / Right: live demo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>

            <div>
              <h3 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 14, fontFamily: "'Poppins',sans-serif" }}>
                Your embed snippet
              </h3>
              <p style={{ fontSize: 15, color: '#475569', marginBottom: 28, lineHeight: 1.65 }}>
                {user
                  ? "Your personalized snippet is ready. Copy it and paste it into any page on your website."
                  : "Sign up free to get your personalized embed snippet with your company ID pre-filled."}
              </p>

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
              {/* Ghost cards */}
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

    </div>
  );
}
