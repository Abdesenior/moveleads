import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { greatCircle } from '@turf/great-circle';
import { point } from '@turf/helpers';
import zipcodes from 'zipcodes';
import {
    Zap, ShieldCheck, Code, CheckCircle, Copy,
    Mail, ChevronRight, Home, Phone, User,
    Users, Activity, DollarSign, TrendingUp
} from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';
import './WidgetPage.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

/* ─── Constants ──────────────────────────────────────────── */
const HOME_SIZES = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5 Bedroom'];
const BASE_PRICES = { 'Studio': 299, '1 Bedroom': 449, '2 Bedroom': 649, '3 Bedroom': 899, '4 Bedroom': 1199, '5 Bedroom': 1599 };
const DEMAND_COLORS = {
    low: { bg: '#dcfce7', fg: '#166534' },
    medium: { bg: '#fef9c3', fg: '#854d0e' },
    high: { bg: '#fee2e2', fg: '#991b1b' },
};

/* ─── Helpers ────────────────────────────────────────────── */
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

function getDemandLevel(date) {
    const mo = date.getMonth() + 1;
    const day = date.getDate();
    const dow = date.getDay();
    const isPeak = [5, 6, 7, 8].includes(mo);
    if (day >= 28 || (isPeak && (dow === 0 || dow === 6))) return 'high';
    if (isPeak || dow === 0 || dow === 6) return 'medium';
    return 'low';
}

function smartQuote(size, miles, moveDate) {
    const base = BASE_PRICES[size] || 649;
    const distFee = Math.min(Math.round(miles * 0.35), 800);
    if (!moveDate || !miles) return { base, distFee, dateAdj: 0, total: base + distFee, warnings: [] };

    const d = new Date(moveDate + 'T00:00:00');
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    const dow = d.getDay();
    const isPeak = [5, 6, 7, 8].includes(mo);
    const isEOM = day >= 28;
    const isWknd = dow === 0 || dow === 6;
    const isLong = miles > 500;

    const mult = (isPeak ? 1.15 : 1) * (isEOM ? 1.12 : 1) * (isWknd ? 1.10 : 1) * (isLong ? 1.08 : 1);
    const sub = base + distFee;
    const dateAdj = mult > 1 ? Math.round(sub * (mult - 1)) : 0;
    const total = Math.round(sub * mult);

    const warnings = [
        isPeak && { icon: '🔥', text: 'Peak season — summer prices are higher' },
        isEOM && { icon: '📅', text: 'End of month — very high demand' },
        isWknd && { icon: '💡', text: 'Move midweek to save up to 10%' },
        isLong && { icon: '🚛', text: 'Long-distance fee applied (500+ miles)' },
    ].filter(Boolean);

    return { base, distFee, dateAdj, total, warnings };
}

/* ─── HouseIcon ──────────────────────────────────────────── */
function HouseIcon({ size = 36, selected = false }) {
    const c = selected ? '#1e3a8a' : '#94a3b8';
    return (
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
            <path d="M4 16L18 4L32 16V32H23V22H13V32H4V16Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
        </svg>
    );
}

/* ─── StepProgress ───────────────────────────────────────── */
function StepProgress({ current, total = 5 }) {
    return (
        <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {Array.from({ length: total }).map((_, i) => (
                    <div key={i} style={{ flex: 1, height: 5, borderRadius: 999, background: i < current ? '#1e3a8a' : '#e2e8f0', transition: 'background 0.3s' }} />
                ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 18 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1e3a8a', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Step {current} of {total}</span>
            </div>
        </div>
    );
}

/* ─── StepHeading ────────────────────────────────────────── */
function StepHeading({ children }) {
    return (
        <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 7px', fontFamily: "'Poppins',sans-serif", lineHeight: 1.2 }}>{children}</h3>
            <div style={{ width: 40, height: 3, background: '#ea580c', borderRadius: 999 }} />
        </div>
    );
}

/* ─── SmartCalendar ──────────────────────────────────────── */
function SmartCalendar({ value, onChange }) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [vm, setVm] = useState({ y: today.getFullYear(), m: today.getMonth() });
    const selected = value ? new Date(value + 'T00:00:00') : null;

    const firstDay = new Date(vm.y, vm.m, 1).getDay();
    const daysInMonth = new Date(vm.y, vm.m + 1, 0).getDate();
    const monthLabel = new Date(vm.y, vm.m, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

    const nav = (delta) => setVm(prev => {
        let m = prev.m + delta, y = prev.y;
        if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
        return { y, m };
    });

    const navBtnStyle = { background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', color: '#475569', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <button type="button" style={navBtnStyle} onClick={() => nav(-1)}>‹</button>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>{monthLabel}</span>
                <button type="button" style={navBtnStyle} onClick={() => nav(1)}>›</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 3 }}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: 9, color: '#94a3b8', fontWeight: 700, paddingBottom: 2 }}>{d}</div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                {cells.map((day, i) => {
                    if (!day) return <div key={`e${i}`} />;
                    const date = new Date(vm.y, vm.m, day);
                    const isPast = date <= today;
                    const isSel = selected && date.toDateString() === selected.toDateString();
                    const isToday = date.toDateString() === today.toDateString();
                    const dem = getDemandLevel(date);
                    const { bg, fg } = DEMAND_COLORS[dem];
                    return (
                        <button
                            key={day} type="button" disabled={isPast}
                            onClick={() => !isPast && onChange(`${vm.y}-${String(vm.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)}
                            style={{
                                borderRadius: 5, padding: '4px 1px', textAlign: 'center',
                                border: isSel ? '2px solid #1e3a8a' : isToday ? '1.5px solid #64748b' : '1px solid transparent',
                                background: isPast ? 'transparent' : isSel ? '#1e3a8a' : bg,
                                color: isPast ? '#e2e8f0' : isSel ? '#fff' : fg,
                                fontSize: 10, fontWeight: isSel ? 800 : 500,
                                cursor: isPast ? 'default' : 'pointer', transition: 'all 0.1s',
                            }}
                        >{day}</button>
                    );
                })}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 9, justifyContent: 'center' }}>
                {[['low', 'Best rate'], ['medium', 'Moderate'], ['high', 'Peak pricing']].map(([level, label]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: DEMAND_COLORS[level].bg, border: `1px solid ${DEMAND_COLORS[level].fg}50` }} />
                        <span style={{ fontSize: 9, color: '#64748b' }}>{label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─── MapArc ─────────────────────────────────────────────── */
function MapArc({ origin, destination }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!origin || !destination || !containerRef.current) return;
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        // No longer needed as we use 'key' to reset component state on coordinates change

        // Safety timeout: don't let the spinner stay forever if Mapbox fails (e.g. bad token)
        const timer = setTimeout(() => setLoading(false), 6000);

        const map = new mapboxgl.Map({
            container: containerRef.current,
            style: 'mapbox://styles/mapbox/light-v11',
            center: [-98.5795, 39.8283], // Center on US for the start
            zoom: 2.5, // Start zoomed out for the fly-in
            interactive: false,
            attributionControl: false,
            logoPosition: 'bottom-right',
        });
        mapRef.current = map;

        const stopLoading = () => { setLoading(false); clearTimeout(timer); };

        map.on('error', (e) => {
            console.error('[Mapbox Error]', e.error?.message || e.message);
            stopLoading();
        });

        map.on('load', async () => {
            // Create a smooth curved arc for any move to make it look "premium"
            const arcSource = greatCircle(point([origin.lon, origin.lat]), point([destination.lon, destination.lat]), { npoints: 100 });
            const fullCoords = arcSource.geometry.coordinates;

            setLoading(false);
            clearTimeout(timer);

            // Add Sources
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
            map.addSource('point', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: origin } } });

            // Solid Brand Orange Path
            map.addLayer({
                id: 'route-main',
                type: 'line',
                source: 'route',
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                    'line-color': '#ea580c',
                    'line-width': 4.5,
                    'line-opacity': 1
                }
            });

            // Premium Markers


            // Fit bounds with animation
            // Fit bounds with 3D Cinematic Perspective
            const coordinates = arcSource.geometry.coordinates;
            const bds = coordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
            map.fitBounds(bds, { padding: 60, duration: 3000, pitch: 30, essential: true });

            // Clean White Markers
            const createMarkerEl = (color) => {
                const el = document.createElement('div');
                el.style.cssText = `
          width: 16px; height: 16px; background: #fff; border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 3px solid ${color};
        `;
                return el;
            };

            new mapboxgl.Marker({ element: createMarkerEl('#3b82f6') }).setLngLat([origin.lon, origin.lat]).addTo(map);
            new mapboxgl.Marker({ element: createMarkerEl('#10b981') }).setLngLat([destination.lon, destination.lat]).addTo(map);

            // Animation Loop
            let step = 0;
            // dashOffset is unused, previously set to 0 here

            const animate = () => {
                if (!mapRef.current) return;

                // Smooth Line Drawing Animation
                if (step < fullCoords.length) {
                    step += 1.5; // Slightly slower for elegance
                    const currentPath = fullCoords.slice(0, Math.min(Math.floor(step), fullCoords.length));
                    map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: currentPath } });
                    requestAnimationFrame(animate);
                }
            };
            requestAnimationFrame(animate);
        });

        return () => {
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
            clearTimeout(timer);
        };
    }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon]); // eslint-disable-line

    return (
        <div style={{
            position: 'relative',
            height: 380,
            background: '#f8fafc',
            borderRadius: 24,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            marginBottom: 24,
            boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.1)'
        }}>
            <div ref={containerRef} style={{ height: '100%' }} />
            {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(248,250,252,0.85)' }}>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Loading route…</span>
                </div>
            )}
        </div>
    );
}

/* ─── DistancePill ───────────────────────────────────────── */
function DistancePill({ miles, hours, origin, destination }) {
    if (!miles || !origin || !destination) return null;
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#E6F1FB', borderRadius: 20, padding: '6px 14px', marginBottom: 14 }}>
            <span style={{ color: '#185FA5', fontSize: 12, fontWeight: 700 }}>
                {miles.toLocaleString()} mi — ~{Math.round(hours)} hrs drive
            </span>
            <span style={{ color: '#185FA5', fontSize: 11, opacity: 0.7 }}>
                {origin.city}, {origin.state} → {destination.city}, {destination.state}
            </span>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════
   DEMO WIDGET
   ══════════════════════════════════════════════════════════ */
export function DemoWidget({ companyId }) {
    const [step, setStep] = useState(1);
    const [size, setSize] = useState('');
    const [originZip, setOriginZip] = useState('');
    const [destZip, setDestZip] = useState('');
    const [originCoords, setOriginCoords] = useState(null);
    const [destCoords, setDestCoords] = useState(null);
    const [miles, setMiles] = useState(0);
    // These were previously updated by MapArc but are now derived from direct ZIP distance
    const effectiveMiles = miles;
    const effectiveHours = miles / 55;
    const [zipError, setZipError] = useState('');
    const [moveDate, setMoveDate] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Send height to parent iframe for auto-resizing
    useEffect(() => {
        const height = document.body.scrollHeight;
        window.parent.postMessage({ type: 'resize', height }, '*');
    }, [step]);

    const mapReady = !!(originCoords && destCoords);
    const canProceed2 = mapReady && !zipError && !!moveDate;
    const q = smartQuote(size, effectiveMiles, moveDate);

    // Instant ZIP lookup from bundled data
    useEffect(() => {
        if (originZip.length === 5 && destZip.length === 5) {
            if (originZip === destZip) { setZipError('Origin and destination zip codes cannot be the same. Please enter your current and new address.'); setOriginCoords(null); setDestCoords(null); return; }
            const oc = geocodeZip(originZip);
            const dc = geocodeZip(destZip);
            if (!oc) { setZipError(`Couldn't find "${originZip}". Please check and try again.`); setOriginCoords(null); setDestCoords(null); return; }
            if (!dc) { setZipError(`Couldn't find "${destZip}". Please check and try again.`); setDestCoords(null); return; }
            setZipError('');
            setOriginCoords(oc); setDestCoords(dc);
            setMiles(haversine(oc.lat, oc.lon, dc.lat, dc.lon));
        } else {
            setOriginCoords(null); setDestCoords(null);
            setMiles(0); setZipError('');
        }
    }, [originZip, destZip]);

    const handleSubmit = async () => {
        if (originZip === destZip && originZip.length === 5) { setZipError('Origin and destination zip codes cannot be the same. Please enter your current and new address.'); return; }
        if (!name || !phone) return;
        setSubmitting(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leads/ingest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerName: name,
                    customerPhone: phone,
                    customerEmail: email || `guest_${Date.now()}@example.com`, // Email is required in schema, providing fallback if empty
                    originCity: originCoords?.city || '',
                    destinationCity: destCoords?.city || '',
                    originZip,
                    destinationZip: destZip,
                    homeSize: size === '4+ Bedroom' ? '4+ Bedroom' : size, // Adjust to match schema enum if needed
                    moveDate: new Date(moveDate).toISOString(),
                    distance: effectiveMiles > 50 ? 'Long Distance' : 'Local',
                    miles: effectiveMiles,
                    sourceCompany: companyId || null
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Submission failed');
            setStep(5);
        } catch (err) {
            alert(`Error submitting lead: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', color: '#0f172a' };
    const focusStyle = { borderColor: '#ea580c', boxShadow: '0 0 0 3px rgba(234,88,12,0.1)' };

    const nextBtn = (label, onClick, disabled) => (
        <button type="button" onClick={onClick} disabled={disabled} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: !disabled ? 'linear-gradient(135deg,#ea580c,#c2410c)' : '#e2e8f0', color: !disabled ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700, cursor: !disabled ? 'pointer' : 'not-allowed', fontFamily: "'Poppins',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}>
            {label} <ChevronRight size={15} />
        </button>
    );
    const backBtn = (onClick) => (
        <button type="button" onClick={onClick} style={{ padding: '12px 18px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Back</button>
    );

    const handleReset = () => {
        setStep(1); setSize(''); setOriginZip(''); setDestZip('');
        setOriginCoords(null); setDestCoords(null); setMiles(0);
        setZipError(''); setMoveDate(''); setName(''); setPhone(''); setEmail('');
    };

    return (
        <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.14), 0 8px 24px rgba(0,0,0,0.08)', width: '100%', maxWidth: 540, overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Home size={15} color="#fff" />
                </div>
                <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: "'Poppins',sans-serif" }}>Get a Moving Quote</div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>Free • Instant • No commitment</div>
                </div>
            </div>

            <div style={{ padding: '20px 22px' }}>
                <StepProgress current={step} />

                {/* ── Step 1: Move size ── */}
                {step === 1 && (
                    <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
                        <StepHeading>Select Your Move Size</StepHeading>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 18 }}>
                            {HOME_SIZES.map(s => {
                                const sel = size === s;
                                return (
                                    <button key={s} type="button" onClick={() => setSize(s)} style={{ padding: '14px 10px', borderRadius: 12, cursor: 'pointer', border: `1.5px solid ${sel ? '#1e3a8a' : '#e2e8f0'}`, background: sel ? '#f0f4ff' : '#fafbfc', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, position: 'relative', transition: 'all 0.15s' }}>
                                        {sel && <div style={{ position: 'absolute', top: 7, right: 7, width: 9, height: 9, borderRadius: '50%', background: '#1e3a8a' }} />}
                                        <HouseIcon size={32} selected={sel} />
                                        <span style={{ fontSize: 11, fontWeight: 600, color: sel ? '#1e3a8a' : '#475569' }}>{s}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <button type="button" onClick={() => size && setStep(2)} disabled={!size} style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: size ? 'linear-gradient(135deg,#ea580c,#c2410c)' : '#e2e8f0', color: size ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700, cursor: size ? 'pointer' : 'not-allowed', fontFamily: "'Poppins',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}>
                            Next Step <ChevronRight size={15} />
                        </button>
                    </div>
                )}

                {/* ── Step 2: ZIPs + map + calendar ── */}
                {step === 2 && (
                    <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
                        <StepHeading>Where & When Are You Moving?</StepHeading>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                            <div>
                                <label style={{ fontSize: 10, fontWeight: 700, color: '#3B8BD4', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>From ZIP</label>
                                <input type="text" placeholder="e.g. 90210" maxLength={5} value={originZip}
                                    onChange={e => setOriginZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                                    style={{ ...inputStyle, borderColor: originCoords ? '#3B8BD4' : '#e2e8f0' }}
                                    onFocus={e => Object.assign(e.target.style, focusStyle)}
                                    onBlur={e => { e.target.style.borderColor = originCoords ? '#3B8BD4' : '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                                {originCoords && <div style={{ fontSize: 10, color: '#3B8BD4', fontWeight: 600, marginTop: 3 }}>{originCoords.city}, {originCoords.state}</div>}
                            </div>
                            <div>
                                <label style={{ fontSize: 10, fontWeight: 700, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>To ZIP</label>
                                <input type="text" placeholder="e.g. 10001" maxLength={5} value={destZip}
                                    onChange={e => setDestZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                                    style={{ ...inputStyle, borderColor: destCoords ? '#1D9E75' : '#e2e8f0' }}
                                    onFocus={e => Object.assign(e.target.style, focusStyle)}
                                    onBlur={e => { e.target.style.borderColor = destCoords ? '#1D9E75' : '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                                {destCoords && <div style={{ fontSize: 10, color: '#1D9E75', fontWeight: 600, marginTop: 3 }}>{destCoords.city}, {destCoords.state}</div>}
                            </div>
                        </div>

                        {zipError && (
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '9px 13px', fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{zipError}</div>
                        )}

                        {mapReady && (
                            <>
                                <MapArc 
                                    key={`${originCoords.lat}-${originCoords.lon}-${destCoords.lat}-${destCoords.lon}`}
                                    origin={originCoords} 
                                    destination={destCoords} 
                                />
                                <DistancePill miles={effectiveMiles} hours={effectiveHours} origin={originCoords} destination={destCoords} />

                                {/* Smart calendar */}
                                <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px', marginBottom: 12, border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>📅 When are you moving?</div>
                                    <SmartCalendar value={moveDate} onChange={setMoveDate} />
                                </div>

                                {moveDate && (() => {
                                    const dem = getDemandLevel(new Date(moveDate + 'T00:00:00'));
                                    const msgs = { low: { icon: '🟢', text: 'Great choice — low demand, best pricing available' }, medium: { icon: '🟡', text: 'Moderate demand — minor price adjustment' }, high: { icon: '🔴', text: 'High demand — peak pricing applies to this date' } };
                                    const { icon, text } = msgs[dem];
                                    return (
                                        <div style={{ background: dem === 'low' ? '#f0fdf4' : dem === 'medium' ? '#fefce8' : '#fef2f2', border: `1px solid ${dem === 'low' ? '#bbf7d0' : dem === 'medium' ? '#fde68a' : '#fecaca'}`, borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: dem === 'low' ? '#166534' : dem === 'medium' ? '#854d0e' : '#991b1b', marginBottom: 12 }}>
                                            {icon} {text}
                                        </div>
                                    );
                                })()}
                            </>
                        )}

                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                            {backBtn(() => setStep(1))}
                            {nextBtn(
                                canProceed2 ? 'See My Quote' : mapReady ? 'Pick a Move Date' : 'Enter ZIP Codes',
                                () => canProceed2 && setStep(3),
                                !canProceed2
                            )}
                        </div>
                    </div>
                )}

                {/* ── Step 3: Quote ── */}
                {step === 3 && (
                    <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
                        <StepHeading>Your Instant Quote</StepHeading>

                        {mapReady && (
                            <>
                                <MapArc 
                                    key={`${originCoords.lat}-${originCoords.lon}-${destCoords.lat}-${destCoords.lon}`}
                                    origin={originCoords} 
                                    destination={destCoords} 
                                />
                                <DistancePill miles={effectiveMiles} hours={effectiveHours} origin={originCoords} destination={destCoords} />
                            </>
                        )}

                        {q.warnings.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                {q.warnings.map((w, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', marginBottom: 5, fontSize: 12, color: '#9a3412', fontWeight: 500 }}>
                                        {w.icon} {w.text}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ background: '#f8fafc', borderRadius: 13, padding: '14px', marginBottom: 12, border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginBottom: 7 }}>
                                <span>{size} move</span>
                                <span style={{ fontWeight: 600, color: '#0f172a' }}>${q.base.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginBottom: q.dateAdj > 0 ? 7 : 0, paddingBottom: q.dateAdj > 0 ? 7 : 11, borderBottom: '1px dashed #e2e8f0' }}>
                                <span>Distance ({effectiveMiles.toLocaleString()} mi)</span>
                                <span style={{ fontWeight: 600, color: '#0f172a' }}>+${q.distFee.toLocaleString()}</span>
                            </div>
                            {q.dateAdj > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9a3412', marginBottom: 0, paddingBottom: 11, borderBottom: '1px dashed #e2e8f0' }}>
                                    <span>Date / season adjustment</span>
                                    <span style={{ fontWeight: 600 }}>+${q.dateAdj.toLocaleString()}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#0f172a', paddingTop: 4 }}>
                                <span>Estimated total</span>
                                <span style={{ color: '#ea580c' }}>${q.total.toLocaleString()}</span>
                            </div>
                        </div>

                        <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginBottom: 14 }}>Final price confirmed by your mover. No obligation.</p>

                        <div style={{ display: 'flex', gap: 10 }}>
                            {backBtn(() => setStep(2))}
                            {nextBtn('Claim This Quote', () => setStep(4), false)}
                        </div>
                    </div>
                )}

                {/* ── Step 4: Contact ── */}
                {step === 4 && (
                    <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
                        <StepHeading>Your Contact Details</StepHeading>
                        {[
                            { icon: <User size={13} color="#94a3b8" />, type: 'text', placeholder: 'Full Name', value: name, set: setName },
                            { icon: <Phone size={13} color="#94a3b8" />, type: 'tel', placeholder: 'Phone Number', value: phone, set: setPhone },
                            { icon: <Mail size={13} color="#94a3b8" />, type: 'email', placeholder: 'Email Address', value: email, set: setEmail },
                        ].map(({ icon, type, placeholder, value, set }, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < 2 ? 10 : 16 }}>
                                <div style={{ flexShrink: 0 }}>{icon}</div>
                                <input type={type} placeholder={placeholder} value={value} onChange={e => set(e.target.value)} style={inputStyle}
                                    onFocus={e => Object.assign(e.target.style, focusStyle)}
                                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: 10 }}>
                            {backBtn(() => setStep(3))}
                            {nextBtn(submitting ? 'Sending...' : 'Send Details', handleSubmit, !name || !phone || submitting)}
                        </div>
                    </div>
                )}

                {/* ── Step 5: Confirmation ── */}
                {step === 5 && (
                    <>
                        <div style={{ animation: 'wgFadeIn 0.3s ease' }}>
                            <div style={{ textAlign: 'center', marginBottom: 14 }}>
                                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                                    <CheckCircle size={26} color="#16a34a" />
                                </div>
                                <h3 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', marginBottom: 5, fontFamily: "'Poppins',sans-serif" }}>Quote Confirmed!</h3>
                                <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                                    Thanks, <strong>{name}</strong>! A local mover will contact <strong>{phone}</strong> shortly.
                                </p>
                            </div>

                            {mapReady && (
                                <MapArc 
                                    key={`${originCoords.lat}-${originCoords.lon}-${destCoords.lat}-${destCoords.lon}`}
                                    origin={originCoords} 
                                    destination={destCoords} 
                                />
                            )}

                            <div style={{ background: '#f0fdf4', borderRadius: 11, padding: '11px 14px', textAlign: 'center', marginBottom: 18 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                                    ${q.total.toLocaleString()} estimated — {size} move, {effectiveMiles.toLocaleString()} mi
                                </div>
                            </div>

                            <button type="button" onClick={handleReset} style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: '#ea580c', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                                ↺ Restart Demo
                            </button>
                        </div>
                        <style>{`@keyframes wgFadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }`}</style>
                    </>
                )}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */
export default function WidgetPage({ user, token, apiUrl, insideDashboard = false }) {
    const { pathname } = useLocation();
    const isPublic = pathname === '/widget-page';
    useEffect(() => {
        if (!insideDashboard) window.scrollTo(0, 0);
    }, [insideDashboard]);

    useEffect(() => {
        if (!insideDashboard) document.title = 'Booking Widget — MoveLeads.cloud';
    }, [insideDashboard]);

    const [copied, setCopied] = useState(false);

    /* ── Widget Analytics ── */
    const [analytics, setAnalytics] = useState(null);
    useEffect(() => {
        if (!user || !token || !apiUrl) return;
        fetch(`${apiUrl}/leads/widget-analytics`, {
            headers: { 'x-auth-token': token },
        })
            .then(r => r.ok ? r.json() : null)
            .then(d => d?.success && setAnalytics(d))
            .catch(() => { });
    }, [user?._id]); // eslint-disable-line

    const embedRef = useRef(null);
    const companyId = user?._id || 'YOUR-COMPANY-ID';
    const embedCode = `<div id="moveleads-widget" data-company="${companyId}"></div>\n<script src="https://moveleads.cloud/widget.js" defer></script>`;

    const handleCopy = () => { navigator.clipboard.writeText(embedCode); setCopied(true); setTimeout(() => setCopied(false), 2500); };
    const scrollToEmbed = () => embedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const content = (
        <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}>

            {/* ── Hero ── */}
            <div style={{ textAlign: 'center', padding: insideDashboard ? '64px 20px 80px' : '100px 20px 100px', background: 'linear-gradient(180deg,#fff 0%,#f8fafc 100%)', borderBottom: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -80, right: '10%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(234,88,12,0.06),transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: -60, left: '5%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle,rgba(59,130,246,0.05),transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff7ed', color: '#ea580c', padding: '6px 16px', borderRadius: 999, fontSize: 13, fontWeight: 700, marginBottom: 28, border: '1px solid #fed7aa' }}>
                        <Zap size={14} fill="#ea580c" /> Free for MoveLeads members
                    </div>
                    <h1 className={insideDashboard ? 'wp-hero-h1sm' : 'wp-hero-h1'} style={{ fontWeight: 900, color: '#0f172a', marginBottom: 22, letterSpacing: '-0.03em', lineHeight: 1.1, fontFamily: "'Poppins',sans-serif" }}>
                        Turn your website into<br />a lead machine
                    </h1>
                    <p style={{ fontSize: 18, color: '#475569', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.7 }}>
                        Add our booking widget to your website in under 2 minutes. Live map, instant quotes, and every lead synced to your dashboard automatically.
                    </p>
                    <div className="wp-hero-btns">
                        <button onClick={scrollToEmbed} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#ea580c,#c2410c)', color: '#fff', padding: '14px 28px', borderRadius: 12, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', boxShadow: '0 6px 20px rgba(234,88,12,0.3)', fontFamily: "'Poppins',sans-serif" }}>
                            Get Your Embed Code <ChevronRight size={16} />
                        </button>
                        <a href="#demo-section" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#f1f5f9', color: '#0f172a', padding: '14px 28px', borderRadius: 12, fontWeight: 700, fontSize: 14, border: '1px solid #e2e8f0', cursor: 'pointer', textDecoration: 'none' }}>
                            See Live Demo
                        </a>
                    </div>
                </div>
            </div>

            {/* ── Analytics ROI Dashboard (dashboard mode only) ── */}
            {insideDashboard && (
                <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '40px 24px 48px' }}>
                    <div style={{ maxWidth: 1140, margin: '0 auto' }}>

                        {/* Header row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#ea580c,#c2410c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(234,88,12,0.25)' }}>
                                    <TrendingUp size={18} color="#fff" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins',sans-serif", letterSpacing: '-0.02em', lineHeight: 1.2 }}>Widget Performance</div>
                                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Leads captured via your embedded widget</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '5px 12px' }}>
                                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.2)', animation: 'wgPulse 2s ease-in-out infinite' }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>Widget Active</span>
                            </div>
                        </div>

                        {/* Empty state */}
                        {analytics?.stats?.totalLeads === 0 && (
                            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Activity size={16} color="#ea580c" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Waiting for your first lead</div>
                                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Your widget is live — stats will appear here once visitors start submitting quotes.</div>
                                </div>
                            </div>
                        )}

                        {/* KPI cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 28 }}>
                            {[
                                {
                                    icon: <Users size={16} />,
                                    label: 'Total Leads Captured',
                                    value: analytics?.stats?.totalLeads ?? '—',
                                    sub: 'All time via your widget',
                                    accent: '#3b82f6',
                                    bg: '#eff6ff',
                                    border: '#bfdbfe',
                                },
                                {
                                    icon: <Activity size={16} />,
                                    label: '30-Day Activity',
                                    value: analytics?.stats?.recentLeadsCount ?? '—',
                                    sub: 'Leads in last 30 days',
                                    accent: '#ea580c',
                                    bg: '#fff7ed',
                                    border: '#fed7aa',
                                },
                                {
                                    icon: <DollarSign size={16} />,
                                    label: 'Estimated Pipeline',
                                    value: analytics?.stats?.pipelineValue != null
                                        ? `$${analytics.stats.pipelineValue.toLocaleString()}`
                                        : '—',
                                    sub: 'Conservative move value estimate',
                                    accent: '#16a34a',
                                    bg: '#f0fdf4',
                                    border: '#bbf7d0',
                                },
                            ].map(card => (
                                <div key={card.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: card.accent, borderRadius: '16px 16px 0 0', opacity: 0.7 }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                        <div style={{ width: 30, height: 30, borderRadius: 8, background: card.bg, border: `1px solid ${card.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.accent }}>
                                            {card.icon}
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{card.label}</span>
                                    </div>
                                    <div style={{ fontSize: 38, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', fontFamily: "'Poppins',sans-serif", lineHeight: 1 }}>{card.value}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{card.sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* Recent leads mini-feed */}
                        {analytics?.recentLeads?.length > 0 && (
                            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                                <div style={{ padding: '14px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent Leads</span>
                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{analytics.recentLeads.length} shown</span>
                                </div>
                                {analytics.recentLeads.map((lead, i) => (
                                    <div key={lead._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 22px', borderBottom: i < analytics.recentLeads.length - 1 ? '1px solid #f8fafc' : 'none', gap: 12, transition: 'background 0.1s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#fafbff'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#fff7ed,#ffedd5)', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <User size={13} color="#ea580c" />
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.customerName}</div>
                                                {(lead.originCity || lead.destinationCity) && (
                                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{lead.originCity} → {lead.destinationCity}</div>
                                                )}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 600, background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>{lead.homeSize}</span>
                                        <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                            {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <style>{`@keyframes wgPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
                </div>
            )}

            {/* ── Feature cards ── */}
            <div style={{ maxWidth: 1140, margin: '0 auto', padding: '80px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 24 }}>
                    {[
                        { icon: <Zap size={22} />, bg: '#fff7ed', color: '#ea580c', title: 'Live Map Arc', text: 'Shows the actual road route between origin and destination. Customers see exactly how far they\'re moving.' },
                        { icon: <ShieldCheck size={22} />, bg: '#f0fdf4', color: '#16a34a', title: 'Smart Pricing', text: 'Quotes adjust for season, day of week, and distance. Peak season warnings nudge customers to flexible dates.' },
                        { icon: <Code size={22} />, bg: '#eff6ff', color: '#3b82f6', title: 'One Line of Code', text: 'Paste a single snippet into your website. Works on WordPress, Wix, Squarespace, and custom sites.' },
                    ].map((f, i) => (
                        <div key={i} style={{ background: '#fff', padding: '28px', borderRadius: 18, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'transform 0.2s, box-shadow 0.2s' }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.08)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}>
                            <div style={{ width: 46, height: 46, background: f.bg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: f.color, marginBottom: 18 }}>{f.icon}</div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 10, fontFamily: "'Poppins',sans-serif" }}>{f.title}</h3>
                            <p style={{ color: '#64748b', lineHeight: 1.65, fontSize: 14, margin: 0 }}>{f.text}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Live demo ── */}
            <div id="demo-section" style={{ background: 'linear-gradient(135deg,#eef2ff 0%,#f5f3ff 40%,#fdf4ff 70%,#fff7ed 100%)', padding: '80px 24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 220, height: 160, background: 'rgba(134,239,172,0.5)', filter: 'blur(40px)', borderRadius: '0 80% 0 0', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 220, height: 160, background: 'rgba(251,146,60,0.35)', filter: 'blur(40px)', borderRadius: '80% 0 0 0', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: 0, right: '10%', width: 160, height: 120, background: 'rgba(167,139,250,0.2)', filter: 'blur(30px)', borderRadius: '0 0 80% 80%', pointerEvents: 'none' }} />

                <div style={{ maxWidth: 1140, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 56 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', color: '#64748b', padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            LIVE DEMO
                        </div>
                        <h2 style={{ fontSize: 36, fontWeight: 800, color: '#0f172a', margin: '0 0 12px', fontFamily: "'Poppins',sans-serif", letterSpacing: '-0.02em' }}>Test drive the widget</h2>
                        <p style={{ fontSize: 16, color: '#64748b', maxWidth: 500, margin: '0 auto' }}>
                            Type two real US ZIP codes — watch the live route animate.
                        </p>
                    </div>

                    <div className="wp-demo-grid">

                        {/* Left: embed code */}
                        <div>
                            <h3 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 14, fontFamily: "'Poppins',sans-serif" }}>Your embed snippet</h3>
                            <p style={{ fontSize: 15, color: '#475569', marginBottom: 28, lineHeight: 1.65 }}>
                                {user ? "Your personalized snippet is ready. Copy and paste it into any page on your website." : "Sign up free to get your personalized embed snippet with your company ID pre-filled."}
                            </p>
                            <div style={{ marginBottom: 32 }}>
                                {[{ num: 1, text: 'Copy your embed snippet below' }, { num: 2, text: 'Paste it anywhere in your website HTML' }, { num: 3, text: 'The widget appears instantly for your visitors' }].map(s => (
                                    <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{s.num}</div>
                                        <span style={{ fontSize: 14, color: '#475569', fontWeight: 500 }}>{s.text}</span>
                                    </div>
                                ))}
                            </div>

                            <div ref={embedRef} className="wp-embed-code" style={{ background: '#1e293b', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 32px rgba(15,23,42,0.2)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 18px', background: '#0f172a', borderBottom: '1px solid #334155' }}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {['#fc5f5f', '#febc2e', '#28c741'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
                                    </div>
                                    <button onClick={handleCopy} style={{ color: copied ? '#22c55e' : '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                                        {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                                        {copied ? 'Copied!' : 'Copy Code'}
                                    </button>
                                </div>
                                <pre style={{ margin: 0, padding: '18px 20px', color: '#e2e8f0', fontSize: 13, lineHeight: 1.7, overflowX: 'auto', fontFamily: "'Fira Code','Consolas',monospace" }}>
                                    <span style={{ color: '#94a3b8' }}>&lt;</span><span style={{ color: '#7dd3fc' }}>div</span>{' '}
                                    <span style={{ color: '#fca5a5' }}>id</span><span style={{ color: '#94a3b8' }}>="</span><span style={{ color: '#86efac' }}>moveleads-widget</span><span style={{ color: '#94a3b8' }}>"</span>{' '}
                                    <span style={{ color: '#fca5a5' }}>data-company</span><span style={{ color: '#94a3b8' }}>="</span><span style={{ color: '#fde68a' }}>{companyId}</span><span style={{ color: '#94a3b8' }}>{">&lt;/"}</span><span style={{ color: '#7dd3fc' }}>div</span><span style={{ color: '#94a3b8' }}>&gt;</span>{'\n'}
                                    <span style={{ color: '#94a3b8' }}>&lt;</span><span style={{ color: '#7dd3fc' }}>script</span>{' '}
                                    <span style={{ color: '#fca5a5' }}>src</span><span style={{ color: '#94a3b8' }}>="</span><span style={{ color: '#86efac' }}>https://moveleads.cloud/widget.js</span><span style={{ color: '#94a3b8' }}>"</span>{' '}
                                    <span style={{ color: '#fca5a5' }}>defer</span><span style={{ color: '#94a3b8' }}>&gt;&lt;/</span><span style={{ color: '#7dd3fc' }}>script</span><span style={{ color: '#94a3b8' }}>&gt;</span>
                                </pre>
                            </div>
                            {user && <p style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>Company ID <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{companyId}</code> is pre-filled.</p>}
                        </div>

                        {/* Right: stacked widget */}
                        <div className="wp-demo-widget-side" style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 560 }}>
                            {[{ rot: -7, tx: -18 }, { rot: 7, tx: 18 }].map(({ rot, tx }, idx) => (
                                <div key={idx} style={{ position: 'absolute', top: '50%', left: '50%', transform: `translate(-50%,-50%) rotate(${rot}deg) translateX(${tx}px) translateY(12px)`, opacity: 0.28, pointerEvents: 'none', width: '85%', filter: 'grayscale(0.3)' }}>
                                    <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', padding: 20, border: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
                                            {Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 999, background: i === idx ? '#6366f1' : '#e2e8f0' }} />)}
                                        </div>
                                        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Select Your Move Size</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                                            {['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom'].map(s => (
                                                <div key={s} style={{ background: '#f8fafc', borderRadius: 9, padding: '10px 6px', textAlign: 'center', border: '1px solid #e2e8f0', fontSize: 10, color: '#64748b' }}>
                                                    <HouseIcon size={22} /><br />{s}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 460 }}>
                                <DemoWidget companyId={companyId} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── How it works ── */}
            <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
                <h2 style={{ fontSize: 36, fontWeight: 800, color: '#0f172a', marginBottom: 12, fontFamily: "'Poppins',sans-serif" }}>How to get started</h2>
                <p style={{ color: '#64748b', fontSize: 16, margin: '0 auto 52px', maxWidth: 500 }}>You can be live in under 2 minutes.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 40 }}>
                    {[{ num: '1', title: 'Sign up free', text: 'Create your MoveLeads account in seconds. No credit card required.', color: '#ea580c' }, { num: '2', title: 'Get your snippet', text: 'Copy your personalized embed code from the Widget tab in your dashboard.', color: '#3b82f6' }, { num: '3', title: 'Paste & go live', text: 'Drop the code into your website. The widget appears instantly for every visitor.', color: '#16a34a' }].map(s => (
                        <div key={s.num}>
                            <div style={{ width: 52, height: 52, background: s.color, color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, margin: '0 auto 18px', boxShadow: `0 6px 20px ${s.color}40`, fontFamily: "'Poppins',sans-serif" }}>{s.num}</div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8, fontFamily: "'Poppins',sans-serif" }}>{s.title}</h3>
                            <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.65, margin: 0 }}>{s.text}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── CTA ── */}
            <div style={{ padding: '0 24px 80px' }}>
                <div className="wp-cta-pad" style={{ maxWidth: 860, margin: '0 auto', background: 'linear-gradient(135deg,#0a192f 0%,#112240 60%,#1e3a5f 100%)', borderRadius: 24, textAlign: 'center', position: 'relative', overflow: 'hidden', boxShadow: '0 20px 60px rgba(10,25,47,0.25)' }}>
                    <div style={{ position: 'absolute', top: '-30%', right: '-5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle,rgba(234,88,12,0.12),transparent 70%)', pointerEvents: 'none' }} />
                    <div style={{ position: 'relative' }}>
                        <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '5px 16px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 22, border: '1px solid rgba(255,255,255,0.15)' }}>Free while in beta</div>
                        <h2 style={{ fontSize: 34, fontWeight: 800, color: '#fff', marginBottom: 14, fontFamily: "'Poppins',sans-serif", letterSpacing: '-0.02em' }}>Want this widget on your website?</h2>
                        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 16, margin: '0 auto 36px', maxWidth: 520 }}>Contact us and we'll set everything up for you — no technical knowledge needed.</p>
                        <div className="wp-cta-btns">
                            <a href="mailto:support@moveleads.cloud?subject=Widget%20Setup%20Request" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#ea580c,#c2410c)', color: '#fff', padding: '14px 28px', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none', boxShadow: '0 6px 20px rgba(234,88,12,0.4)', fontFamily: "'Poppins',sans-serif" }}>
                                <Mail size={16} /> Contact us to get started
                            </a>
                            <button onClick={scrollToEmbed} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '14px 28px', borderRadius: 12, fontWeight: 700, fontSize: 14, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontFamily: "'Poppins',sans-serif" }}>
                                <Code size={16} /> See the embed code
                            </button>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );

    /* ── Render ── */
    // If we're on the public route or insideDashboard is explicitly false, show layout
    if (isPublic && !insideDashboard) {
        return <MarketingLayout>{content}</MarketingLayout>;
    }

    return insideDashboard ? content : <MarketingLayout>{content}</MarketingLayout>;
}
