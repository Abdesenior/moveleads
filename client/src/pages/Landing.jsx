import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle, Zap, Shield, ArrowRight, Star,
  MapPin, Clock, Users, TrendingUp,
  ChevronDown, Lock, BarChart2, Bell,
  Home, Warehouse, Menu, X
} from 'lucide-react';
import JsonLd, { organizationSchema, softwareAppSchema, landingPageFaqSchema } from '../components/JsonLd';
import useCanonical from '../utils/useCanonical';
import '../phone-mockup.css';
import './Landing.css';

function useReveal() {
  const ref = useRef();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.08 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}
function Reveal({ children, delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(20px)',
      transition: `opacity 0.6s ease ${delay}s, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}s`
    }}>{children}</div>
  );
}

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const BL = 'rgba(15,23,42,0.08)';
const NOISE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`;

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [faqOpen, setFaqOpen] = useState(null);
  const [tick, setTick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useCanonical('/');

  useEffect(() => {
    document.title = 'MoveLeads.cloud — Verified Moving Leads for Moving Companies';
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => {
    const t = setInterval(() => setTick(x => (x + 1) % 3), 3600);
    return () => clearInterval(t);
  }, []);

  const liveLeads = [
    { name: 'Sarah M.', route: 'NYC → Miami', val: '$2,450', ago: 'Just now' },
    { name: 'James K.', route: 'Dallas → Houston', val: '$890', ago: '12s ago' },
    { name: 'Linda R.', route: 'Chicago → Denver', val: '$1,650', ago: '28s ago' },
  ];
  const live = liveLeads[tick];

  return (
    <div style={{ fontFamily: F, color: NAVY, overflowX: 'hidden' }}>
      <JsonLd schema={organizationSchema} />
      <JsonLd schema={softwareAppSchema} />
      <JsonLd schema={landingPageFaqSchema} />

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: (scrolled || menuOpen) ? 'rgba(255,255,255,0.97)' : 'transparent',
        backdropFilter: (scrolled || menuOpen) ? 'blur(20px) saturate(180%)' : 'none',
        borderBottom: (scrolled || menuOpen) ? `1px solid ${BL}` : 'none',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 20px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>

          {/* Logo */}
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.4px', fontFamily: F, flexShrink: 0 }}>
            <span style={{ color: (scrolled || menuOpen) ? NAVY : '#fff' }}>Move</span>
            <span style={{ color: ORANGE }}>Leads</span>
            <span style={{ color: (scrolled || menuOpen) ? '#94a3b8' : 'rgba(255,255,255,0.45)', fontWeight: 600 }}>.cloud</span>
          </div>

          {/* Desktop links */}
          <div className="lp-links" style={{ gap: 2 }}>
            {['Features', 'How It Works'].map(t => (
              <a key={t} href={`#${t.toLowerCase().replace(/ /g, '-')}`} style={{ color: scrolled ? '#475569' : 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500, textDecoration: 'none', padding: '8px 12px', borderRadius: 8, transition: 'all 0.18s' }}
                onMouseEnter={e => { e.currentTarget.style.color = scrolled ? NAVY : '#fff'; e.currentTarget.style.background = scrolled ? '#f1f5f9' : 'rgba(255,255,255,0.07)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = scrolled ? '#475569' : 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'transparent'; }}
              >{t}</a>
            ))}
            <Link to="/pricing" style={{ color: scrolled ? '#475569' : 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500, textDecoration: 'none', padding: '8px 12px', borderRadius: 8, transition: 'all 0.18s' }}
              onMouseEnter={e => { e.currentTarget.style.color = scrolled ? NAVY : '#fff'; e.currentTarget.style.background = scrolled ? '#f1f5f9' : 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = scrolled ? '#475569' : 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'transparent'; }}
            >Pricing</Link>
            <Link to="/for-movers" style={{ color: scrolled ? '#ea580c' : '#fb923c', fontSize: 14, fontWeight: 700, textDecoration: 'none', padding: '8px 12px', borderRadius: 8, transition: 'all 0.18s' }}
              onMouseEnter={e => { e.currentTarget.style.background = scrolled ? '#fff7ed' : 'rgba(249,115,22,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >For Movers</Link>
            <Link to="/widget-page" style={{ color: scrolled ? '#475569' : 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500, textDecoration: 'none', padding: '8px 12px', borderRadius: 8, transition: 'all 0.18s' }}
              onMouseEnter={e => { e.currentTarget.style.color = scrolled ? NAVY : '#fff'; e.currentTarget.style.background = scrolled ? '#f1f5f9' : 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = scrolled ? '#475569' : 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'transparent'; }}
            >Booking Widget</Link>
          </div>

          {/* Desktop auth */}
          <div className="lp-auth" style={{ gap: 8, alignItems: 'center' }}>
            <Link to="/login" style={{ color: scrolled ? '#475569' : 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 600, textDecoration: 'none', padding: '8px 14px', borderRadius: 8 }}>Log in</Link>
            <Link to="/register" style={{ background: ORANGE, color: '#fff', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', boxShadow: '0 2px 10px rgba(249,115,22,0.38)', whiteSpace: 'nowrap' }}>Get started free</Link>
          </div>

          {/* Mobile hamburger */}
          <button className="lp-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: (scrolled || menuOpen) ? NAVY : '#fff' }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div style={{ background: '#fff', borderTop: `1px solid ${BL}`, padding: '16px 20px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
              {[['Features', '#features'], ['How It Works', '#how-it-works']].map(([label, href]) => (
                <a key={label} href={href} onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '12px 14px', fontSize: 15, fontWeight: 600, color: NAVY, textDecoration: 'none', borderRadius: 10 }}>{label}</a>
              ))}
              <Link to="/pricing" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '12px 14px', fontSize: 15, fontWeight: 600, color: NAVY, textDecoration: 'none', borderRadius: 10 }}>Pricing</Link>
              <Link to="/for-movers" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '12px 14px', fontSize: 15, fontWeight: 700, color: '#ea580c', textDecoration: 'none', borderRadius: 10 }}>For Movers</Link>
              <Link to="/widget-page" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '12px 14px', fontSize: 15, fontWeight: 600, color: NAVY, textDecoration: 'none', borderRadius: 10 }}>Booking Widget</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16, borderTop: `1px solid ${BL}` }}>
              <Link to="/login" onClick={() => setMenuOpen(false)} style={{ display: 'block', textAlign: 'center', padding: 12, fontSize: 15, fontWeight: 600, color: NAVY, textDecoration: 'none', border: '1.5px solid #e2e8f0', borderRadius: 12 }}>Log in</Link>
              <Link to="/register" onClick={() => setMenuOpen(false)} style={{ display: 'block', textAlign: 'center', padding: 13, fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', background: ORANGE, borderRadius: 12, boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}>Get started free →</Link>
            </div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="lp-hero-section" style={{
        background: `${NOISE}, linear-gradient(155deg, #070e1b 0%, #0b1628 50%, #0d1f38 100%)`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-15%', right: '0%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.09) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '52px 52px', pointerEvents: 'none' }} />

        <div className="lp-hero-grid" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <div>
            <Reveal>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 8px', borderRadius: 100, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', marginBottom: 26 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(249,115,22,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: ORANGE }} />
                </div>
                <span style={{ color: '#fb923c', fontSize: 13, fontWeight: 600 }}>Trusted by 500+ moving companies</span>
              </div>
            </Reveal>
            <Reveal delay={0.07}>
              <h1 className="lp-hero-h1" style={{ fontFamily: F, fontWeight: 800, lineHeight: 1.07, letterSpacing: '-0.03em', color: '#fff', marginBottom: 20 }}>
                Verified moving leads.<br />
                <span style={{ color: ORANGE }}>Close more deals.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.14}>
              <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, marginBottom: 34, maxWidth: 460 }}>
                Stop buying recycled lists. Get exclusive, high-intent leads delivered to your dashboard in real time — pay only for what you buy.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="lp-hero-buttons">
                <Link to="/register" style={{
                  background: ORANGE, color: '#fff', padding: '14px 28px', borderRadius: 12,
                  fontSize: 15, fontWeight: 700, textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 8,
                  boxShadow: '0 4px 20px rgba(249,115,22,0.42)', transition: 'all 0.2s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(249,115,22,0.52)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(249,115,22,0.42)'; }}
                >Start free trial <ArrowRight size={16} /></Link>
                <a href="#how-it-works" style={{
                  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)',
                  padding: '14px 24px', borderRadius: 12, fontSize: 15, fontWeight: 600,
                  textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)', transition: 'all 0.18s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.09)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >See how it works →</a>
              </div>
            </Reveal>
            <Reveal delay={0.26}>
              <div style={{ display: 'flex', gap: 28, paddingTop: 26, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                {[{ v: '10k+', l: 'Leads delivered' }, { v: '$10', l: 'Per lead' }, { v: '98%', l: 'Satisfaction' }].map((s, i) => (
                  <div key={i} style={{ paddingLeft: i > 0 ? 28 : 0, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', fontFamily: F }}>{s.v}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 500, marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Dashboard mockup */}
          <div className="lp-hero-mockup">
          <Reveal delay={0.18}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', inset: '-24px', background: 'radial-gradient(circle at 50% 50%, rgba(249,115,22,0.07), transparent 70%)', borderRadius: 40, pointerEvents: 'none' }} />
              <div style={{
                background: 'rgba(255,255,255,0.035)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 22, padding: 22,
                backdropFilter: 'blur(28px) saturate(160%)',
                boxShadow: '0 28px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
                position: 'relative',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
                  {['#ef4444', '#eab308', '#22c55e'].map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
                  <div style={{ flex: 1, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.05)', marginLeft: 8, display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontFamily: 'monospace' }}>moveleads.cloud/dashboard</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 14 }}>
                  {[{ l: "Today's leads", v: '12', c: '#fff' }, { l: 'Revenue', v: '$4,200', c: '#22c55e' }, { l: 'Conversion', v: '24%', c: ORANGE }].map((s, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 11, padding: '13px 13px 11px' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>{s.l}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.c, letterSpacing: '-0.02em', fontFamily: F }}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 13, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11, transition: 'all 0.35s' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(34,197,94,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bell size={15} color="#22c55e" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 2 }}>New lead — {live.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>{live.route} · {live.val}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'lpPulse 1.8s infinite' }} />
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontWeight: 500 }}>{live.ago}</span>
                  </div>
                </div>
                {[
                  { n: 'James K.', r: 'Dallas → Houston', s: '3 bed', p: '$890', hot: false },
                  { n: 'Linda R.', r: 'Chicago → Denver', s: '2 bed', p: '$1,650', hot: true },
                  { n: 'Tom W.', r: 'LA → Phoenix', s: '4 bed', p: '$2,100', hot: true },
                ].map((l, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.045)' : 'none' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.055)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', flexShrink: 0 }}>{l.n.split(' ').map(x => x[0]).join('')}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>{l.n}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>{l.r} · {l.s}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ fontSize: 10, padding: '3px 7px', borderRadius: 5, background: l.hot ? 'rgba(249,115,22,0.13)' : 'rgba(34,197,94,0.09)', color: l.hot ? ORANGE : '#22c55e', fontWeight: 700 }}>{l.hot ? 'Hot' : 'New'}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: ORANGE }}>{l.p}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          </div>
        </div>
      </section>

      {/* LOGOS */}
      <section style={{ padding: '42px 0', background: '#fff', borderBottom: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <p style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 26 }}>Trusted by leading moving companies</p>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 52, animation: 'lpMarquee 22s linear infinite', width: 'max-content' }}>
              {['Atlas Moving Co', 'SafeMove USA', 'Premier Movers', 'Elite Relocation', 'FastMove Pro', 'AllState Moving', 'CityMove Group', 'ProMover', 'Atlas Moving Co', 'SafeMove USA', 'Premier Movers', 'Elite Relocation', 'FastMove Pro', 'AllState Moving'].map((n, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.38, flexShrink: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#64748b' }}>{n.split(' ').map(x => x[0]).join('').slice(0, 2)}</div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="lp-section" style={{ background: '#fff' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.14)', marginBottom: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8 }}>Platform</span>
              </div>
              <h2 style={{ fontFamily: F, fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: NAVY, marginBottom: 12 }}>
                Everything you need to<br />win more moving jobs
              </h2>
              <p style={{ fontSize: 16, color: '#64748b', maxWidth: 480, margin: '0 auto', lineHeight: 1.72 }}>A complete lead system built for modern moving companies.</p>
            </div>
          </Reveal>
          <div className="lp-features-grid">
            {[
              { icon: <Shield size={20} />, c: '#22c55e', bg: '#f0fdf4', bc: 'rgba(34,197,94,0.14)', title: 'Verified Quality', desc: 'Every lead is phone-verified and high-intent. Real people, real moves — no bots, no spam.' },
              { icon: <Zap size={20} />, c: '#3b82f6', bg: '#eff6ff', bc: 'rgba(59,130,246,0.14)', title: 'Real-Time Delivery', desc: 'Leads hit your dashboard in seconds. Be the first to call and win every job.' },
              { icon: <BarChart2 size={20} />, c: ORANGE, bg: '#fff7ed', bc: 'rgba(249,115,22,0.14)', title: 'Full Analytics', desc: 'Track your conversion rate, ROI, and pipeline from one clean dashboard.' },
              { icon: <MapPin size={20} />, c: '#8b5cf6', bg: '#f5f3ff', bc: 'rgba(139,92,246,0.14)', title: 'Location Filters', desc: 'Filter by zip, city, or radius. Only see leads in your actual service area.' },
              { icon: <TrendingUp size={20} />, c: '#ec4899', bg: '#fdf2f8', bc: 'rgba(236,72,153,0.14)', title: 'Pay Per Lead', desc: 'No monthly fees, no contracts. Buy exactly what you need and stop any time.' },
              { icon: <Clock size={20} />, c: '#0ea5e9', bg: '#f0f9ff', bc: 'rgba(14,165,233,0.14)', title: '24/7 Lead Flow', desc: 'Leads come in around the clock. Your pipeline never stops filling up.' },
            ].map((f, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <div style={{
                  background: '#fff', border: `1px solid ${BL}`, borderRadius: 18, padding: '26px 24px',
                  transition: 'all 0.22s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: 'default',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.07)'; e.currentTarget.style.borderColor = f.bc; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = BL; }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: f.c, marginBottom: 16 }}>{f.icon}</div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 7, fontFamily: F, letterSpacing: '-0.01em' }}>{f.title}</h3>
                  <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65 }}>{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* REPUTATION MANAGEMENT */}
      <section className="lp-section" style={{ background: '#f8fafc', borderTop: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: '#eff6ff', border: '1px solid rgba(59,130,246,0.14)', marginBottom: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 1.8 }}>New</span>
              </div>
              <h2 style={{ fontFamily: F, fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: NAVY, marginBottom: 12 }}>
                Protect & Build Your Reputation
              </h2>
              <p style={{ fontSize: 16, color: '#64748b', maxWidth: 520, margin: '0 auto', lineHeight: 1.72 }}>
                MoveLeads is more than a lead source. It's your automated growth and reputation management platform.
              </p>
            </div>
          </Reveal>
          <div className="lp-two-grid">
            <Reveal delay={0.05}>
              <div style={{
                background: '#fff', border: `1px solid ${BL}`, borderRadius: 18, padding: '30px 28px',
                transition: 'all 0.22s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', height: '100%'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                    <Shield size={22} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: NAVY, fontFamily: F, letterSpacing: '-0.01em' }}>
                    Prevent Bad Reviews
                  </h3>
                </div>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, marginBottom: 24 }}>
                  Our internal Resolution Center gives unhappy customers a private channel to complain. Solve issues before they hit Google, protecting your 5-star rating.
                </p>
                <div style={{ background: '#f8fafc', border: `1px solid ${BL}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Open Ticket: Damage</div>
                  <div style={{ background: '#fff', border: `1px solid #e2e8f0`, borderRadius: '0 10px 10px 10px', padding: '10px 12px', marginBottom: 8 }}>
                    <p style={{ fontSize: 12, color: '#334155', margin: 0 }}>"The movers scratched my new hardwood floor..."</p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ background: '#3b82f6', color: '#fff', borderRadius: '10px 0 10px 10px', padding: '10px 12px' }}>
                      <p style={{ fontSize: 12, margin: 0 }}>"I am so sorry to hear that! We've issued a $100 refund for the repair."</p>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div style={{
                background: '#fff', border: `1px solid ${BL}`, borderRadius: 18, padding: '30px 28px',
                transition: 'all 0.22s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', height: '100%'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                    <Star size={22} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: NAVY, fontFamily: F, letterSpacing: '-0.01em' }}>
                    Automate 5-Star Reviews
                  </h3>
                </div>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, marginBottom: 24 }}>
                  When you mark a job 'Completed', we automatically email happy customers asking them to leave a review on your Google Business Profile. Build your reputation on autopilot.
                </p>
                <div style={{ background: '#f8fafc', border: `1px solid ${BL}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px dashed #e2e8f0` }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle size={16} color="#22c55e" /></div><div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Status changed to <span style={{ color: '#22c55e' }}>Completed</span></div></div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderBottom: `1px dashed #e2e8f0` }}><ArrowRight size={16} color="#94a3b8" /><div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Trigger: Send Review Request Email</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 12 }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Star size={16} color="#f59e0b" /></div><div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>New 5-Star Review on Google!</div></div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* PHONE SECTION */}
      <section className="lp-section" style={{ background: '#f8fafc', borderTop: `1px solid ${BL}`, borderBottom: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <div className="lp-phone-grid">
            <div className="lp-phone-side">
            <Reveal>
              <div className="phone-mockup-wrapper">
                <div className="floating-stat float-revenue">
                  <span className="sc-label">WEEKLY REVENUE</span>
                  <span className="sc-val">$12,450</span>
                  <span className="sc-sub">↑ 18% vs last week</span>
                </div>
                <div className="floating-stat float-booking">
                  <div className="bg-green-light"><CheckCircle className="text-green" size={14} /></div>
                  <div><span className="sc-title">Booking confirmed</span><span className="sc-time">Just now</span></div>
                </div>
                <div className="floating-stat float-calls">
                  <span className="sc-label">TODAY'S CALLS</span>
                  <div className="sc-val-row"><span className="sc-val">47</span><span className="sc-trend text-green">↑ 23%</span></div>
                </div>

                <div className="phone-frame">
                  <div className="phone-dynamic-island">
                    <div className="island-camera" /><div className="island-sensor" />
                  </div>
                  <div className="phone-glare" />
                  <div className="phone-status-bar">
                    <span className="status-time">9:41</span>
                    <div className="status-right">
                      <svg width="16" height="12" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="4" width="3" height="8" rx="1" opacity="0.4" /><rect x="4.5" y="2.5" width="3" height="9.5" rx="1" opacity="0.65" /><rect x="9" y="0.5" width="3" height="11.5" rx="1" /><rect x="13.5" y="1" width="3" height="10" rx="1.5" fillOpacity="0.3" stroke="currentColor" strokeWidth="0.8" /></svg>
                      <svg width="15" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.5C10.1 2.5 12 3.4 13.3 4.8L14.7 3.4C13 1.3 10.6 0 8 0C5.4 0 3 1.3 1.3 3.4L2.7 4.8C4 3.4 5.9 2.5 8 2.5Z" opacity="0.5" /><path d="M8 5.5C9.4 5.5 10.6 6.1 11.5 7L12.9 5.6C11.6 4.3 9.9 3.5 8 3.5C6.1 3.5 4.4 4.3 3.1 5.6L4.5 7C5.4 6.1 6.6 5.5 8 5.5Z" opacity="0.75" /><circle cx="8" cy="11" r="1.4" /></svg>
                      <div className="battery-icon"><div className="battery-fill" /><div className="battery-tip" /></div>
                    </div>
                  </div>

                  <div className="phone-content">
                    {/* AI active badge */}
                    <div className="ai-call-badge"><div className="ai-badge-dot" /><span>MoveLeads AI · Active call</span></div>

                    {/* Avatar — flat circle, no rings */}
                    <div className="caller-avatar-ring">
                      <div className="caller-avatar">SJ</div>
                    </div>

                    <h3 className="caller-name">Sarah Johnson</h3>
                    <p className="caller-route">NYC → Miami · $2,450</p>

                    {/* Waveform */}
                    <div className="audio-waveform">
                      {[6, 11, 19, 30, 44, 54, 44, 30, 54, 44, 19, 11, 6].map((h, i) => (
                        <div key={i} className="bar" style={{ '--bh': `${h}px`, animationDelay: `${i * 0.09}s` }} />
                      ))}
                    </div>

                    {/* Green pill timer */}
                    <div className="call-timer"><span className="rec-dot" /><span>00:47</span></div>

                    {/* AI bubble — Zap lightning bolt icon */}
                    <div className="call-bubble">
                      <div className="bubble-ai-icon"><Zap size={16} /></div>
                      <p>"Great! I've confirmed your move for January 15th. You'll receive a confirmation email shortly..."</p>
                    </div>
                  </div>
                  <div className="phone-btn-right" /><div className="phone-btn-vol-up" /><div className="phone-btn-vol-dn" /><div className="phone-home-bar" />
                </div>
              </div>
            </Reveal>
            </div>

            <div>
              <Reveal>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.14)', marginBottom: 18 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8 }}>Coming soon</span>
                </div>
              </Reveal>
              <Reveal delay={0.07}>
                <h2 style={{ fontFamily: F, fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: NAVY, lineHeight: 1.12, marginBottom: 16 }}>
                  Your AI sales rep.<br />
                  <span style={{ color: '#64748b' }}>Calls leads in 30 seconds.</span>
                </h2>
              </Reveal>
              <Reveal delay={0.14}>
                <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.75, marginBottom: 34, maxWidth: 420 }}>
                  When a lead submits a quote, our AI calls them instantly, qualifies the job, and books the move — before your competition even opens the notification.
                </p>
              </Reveal>
              <Reveal delay={0.2}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {[
                    { icon: <Zap size={17} />, c: ORANGE, bg: '#fff7ed', title: '30-second speed-to-lead', desc: 'First contact wins every time. Leads get called before they move on.' },
                    { icon: <Clock size={17} />, c: '#3b82f6', bg: '#eff6ff', title: '24/7 availability', desc: "Midnight inquiries, weekend requests — never miss another lead." },
                    { icon: <TrendingUp size={17} />, c: '#8b5cf6', bg: '#f5f3ff', title: 'Campaign mode', desc: 'Re-engage dormant leads automatically with smart follow-up sequences.' },
                  ].map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: f.c, flexShrink: 0 }}>{f.icon}</div>
                      <div>
                        <h4 style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 3, fontFamily: F }}>{f.title}</h4>
                        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>
              <Reveal delay={0.27}>
                <div style={{ marginTop: 32, padding: '15px 18px', background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.13)', borderRadius: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(249,115,22,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Bell size={15} color={ORANGE} /></div>
                  <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.5 }}><strong style={{ color: NAVY }}>Join the waitlist</strong> — early access launching Q2 2026. Free for existing customers.</p>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* CAPTURE MORE LEADS (WIDGET SHOWCASE) */}
      <section className="lp-section" style={{ background: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 70% 50%, rgba(249,115,22,0.03), transparent 70%)', pointerEvents: 'none' }} />
        <div className="lp-widget-grid" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <div>
            <Reveal>
              <h2 style={{ fontFamily: F, fontSize: 44, fontWeight: 800, letterSpacing: '-0.025em', color: NAVY, marginBottom: 8 }}>
                Capture More Leads.
              </h2>
              <p style={{ fontSize: 32, color: '#94a3b8', fontWeight: 600, lineHeight: 1.15, marginBottom: 44, letterSpacing: '-0.015em' }}>
                Respond Instantly, Follow Up<br />Automatically & Boost Conversions.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginBottom: 48 }}>
                {[
                  { t: 'CRM Auto-Sync', d: 'Real-time quotes based on your actual tariffs' },
                  { t: 'Fully Branded For Your Company', d: 'Service Area & Pricing Integration' },
                  { t: 'Custom Rates & Routes', d: 'Upload your rates and routes so customers can reserve online' },
                  { t: 'Accept Online Payments', d: 'PCI-compliant payment processing' },
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <CheckCircle size={15} color="#22c55e" strokeWidth={3} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 3, fontFamily: F }}>{f.t}</h4>
                      <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{f.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <Link to="/widget-page" style={{ fontSize: 16, fontWeight: 700, color: NAVY, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, paddingBottom: 4, borderBottom: `2px solid transparent`, transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.color = ORANGE; e.currentTarget.style.borderBottomColor = ORANGE; }}
                onMouseLeave={e => { e.currentTarget.style.color = NAVY; e.currentTarget.style.borderBottomColor = 'transparent'; }}
              >
                See the widget in action <ArrowRight size={18} />
              </Link>
            </Reveal>
          </div>

          {/* Right side - 3D Stacked Widget Mockups */}
          <div className="lp-widget-side">
          <Reveal delay={0.15}>
            <div style={{ position: 'relative', height: 540, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* Back Mockups (faded) */}
              <div style={{
                position: 'absolute', transform: 'translateX(-80px) translateY(20px) rotate(-8deg)',
                width: 260, height: 500, background: '#fff', borderRadius: 32,
                boxShadow: '0 20px 40px rgba(0,0,0,0.06)', zIndex: 1, opacity: 0.4, border: '1px solid #f1f5f9'
              }} />
              <div style={{
                position: 'absolute', transform: 'translateX(80px) translateY(-20px) rotate(8deg)',
                width: 260, height: 500, background: '#fff', borderRadius: 32,
                boxShadow: '0 20px 40px rgba(0,0,0,0.06)', zIndex: 1, opacity: 0.4, border: '1px solid #f1f5f9'
              }} />

              {/* Main Phone Frame */}
              <div style={{
                position: 'relative', width: 290, height: 560, background: '#fff', borderRadius: 40,
                padding: 10, boxShadow: '0 40px 80px rgba(15,23,42,0.15), 0 0 0 1px rgba(15,23,42,0.05)',
                zIndex: 10,
              }}>
                <div style={{ height: '100%', background: '#fff', borderRadius: 32, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #f1f5f9' }}>
                  {/* Widget Header Area */}
                  <div style={{ background: NAVY, padding: '32px 24px 20px', color: '#fff', position: 'relative' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                      <Home size={18} color="#fff" />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: F, letterSpacing: '-0.01em' }}>Get a Moving Quote</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>Free · Instant · No commitment</div>
                  </div>

                  {/* Widget Content Area */}
                  <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: NAVY }} />
                      <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Step 1 of 5</div>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#f1f5f9' }}>
                        <div style={{ width: '20%', height: '100%', background: NAVY, borderRadius: 2 }} />
                      </div>
                    </div>

                    <h5 style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 20, fontFamily: F }}>Select Your Move Size</h5>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                      {[
                        { l: 'Studio', i: <Home size={18} />, active: false },
                        { l: '1 Bedroom', i: <Home size={20} />, active: true },
                        { l: '2 Bedroom', i: <Home size={22} />, active: false },
                        { l: '3 Bedroom', i: <Home size={24} />, active: false },
                        { l: '4 Bedroom', i: <Warehouse size={22} />, active: false },
                        { l: '5 Bedroom', i: <Warehouse size={24} />, active: false },
                      ].map((item, idx) => (
                        <div key={idx} style={{
                          height: 76, padding: 12, borderRadius: 12, background: '#fff',
                          border: `1.5px solid ${item.active ? NAVY : '#f1f5f9'}`,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                          boxShadow: item.active ? '0 4px 12px rgba(15,23,42,0.08)' : 'none',
                          position: 'relative'
                        }}>
                          {item.active && <div style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: NAVY }} />}
                          <div style={{ color: item.active ? NAVY : '#94a3b8' }}>{item.i}</div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: item.active ? NAVY : '#475569' }}>{item.l}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{
                      marginTop: 'auto', background: ORANGE, height: 48, borderRadius: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(249,115,22,0.35)'
                    }}>
                      Next Step <ArrowRight size={16} style={{ marginLeft: 6 }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="lp-section" style={{ background: '#fff' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: '#f1f5f9', marginBottom: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.8 }}>How it works</span>
              </div>
              <h2 style={{ fontFamily: F, fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: NAVY, marginBottom: 12 }}>Up and running in minutes</h2>
              <p style={{ fontSize: 16, color: '#64748b', maxWidth: 440, margin: '0 auto', lineHeight: 1.72 }}>No complex setup. Start buying leads in under 10 minutes.</p>
            </div>
          </Reveal>
          <div className="lp-how-grid">
            <div style={{ position: 'absolute', top: 34, left: '21%', right: '21%', height: 1, background: 'linear-gradient(90deg, rgba(249,115,22,0.25), rgba(59,130,246,0.25))', zIndex: 0 }} />
            {[
              { n: '01', icon: <Users size={24} />, c: '#3b82f6', bg: '#eff6ff', title: 'Create your account', desc: 'Sign up in 2 minutes. No credit card. Dashboard access is instant.' },
              { n: '02', icon: <MapPin size={24} />, c: '#8b5cf6', bg: '#f5f3ff', title: 'Set your service area', desc: 'Filter by city, zip, or radius. Only see leads you can serve.' },
              { n: '03', icon: <TrendingUp size={24} />, c: '#22c55e', bg: '#f0fdf4', title: 'Buy leads, close jobs', desc: 'Purchase with one click, call instantly, track your pipeline.' },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div style={{
                  background: '#fff', border: `1px solid ${BL}`, borderRadius: 18, padding: '34px 26px',
                  textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'all 0.22s ease', position: 'relative', zIndex: 1,
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 14px 36px rgba(0,0,0,0.07)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
                >
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.c, margin: '0 auto 18px' }}>{s.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: s.c, letterSpacing: 2, marginBottom: 9 }}>{s.n}</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: F, color: NAVY, marginBottom: 9, letterSpacing: '-0.01em' }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* LEAD PREVIEW */}
      <section className="lp-section" style={{ background: '#f8fafc', borderTop: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 44 }}>
              <h2 style={{ fontFamily: F, fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: NAVY, marginBottom: 10 }}>Leads available right now</h2>
              <p style={{ fontSize: 16, color: '#64748b', maxWidth: 400, margin: '0 auto' }}>Real leads waiting to be claimed. Sign up to unlock contact info.</p>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div style={{ background: '#fff', border: `1px solid ${BL}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', position: 'relative' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${BL}`, background: '#f8fafc' }}>
                    {['Customer', 'From', 'To', 'Home Size', 'Move Date', 'Value', 'Status'].map((h, i) => (
                      <th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {[
                      { n: 'Sarah M.', fr: 'New York, NY', to: 'Miami, FL', sz: '3 bed', dt: 'Jan 22', v: '$2,450', hot: true },
                      { n: 'James K.', fr: 'Dallas, TX', to: 'Houston, TX', sz: '2 bed', dt: 'Jan 24', v: '$890', hot: false },
                      { n: 'Linda R.', fr: 'Chicago, IL', to: 'Denver, CO', sz: '2 bed', dt: 'Jan 26', v: '$1,650', hot: true },
                      { n: '████ ██.', fr: '██████, ██', to: '████, ██', sz: '4 bed', dt: 'Jan 28', v: '$████', blur: true },
                      { n: '████ ██.', fr: '██████, ██', to: '████, ██', sz: '1 bed', dt: 'Jan 29', v: '$████', blur: true },
                    ].map((l, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${BL}`, filter: l.blur ? 'blur(4px)' : 'none', userSelect: l.blur ? 'none' : 'auto' }}>
                        <td style={{ padding: '13px 16px', fontWeight: 600, color: NAVY }}>{l.n}</td>
                        <td style={{ padding: '13px 16px', color: '#475569' }}>{l.fr}</td>
                        <td style={{ padding: '13px 16px', color: '#475569' }}>{l.to}</td>
                        <td style={{ padding: '13px 16px', color: '#475569' }}>{l.sz}</td>
                        <td style={{ padding: '13px 16px', color: '#475569' }}>{l.dt}</td>
                        <td style={{ padding: '13px 16px', fontWeight: 700, color: ORANGE }}>{l.v}</td>
                        <td style={{ padding: '13px 16px' }}>
                          {!l.blur && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, background: l.hot ? 'rgba(249,115,22,0.07)' : 'rgba(34,197,94,0.07)', border: `1px solid ${l.hot ? 'rgba(249,115,22,0.18)' : 'rgba(34,197,94,0.18)'}`, fontSize: 11, fontWeight: 700, color: l.hot ? ORANGE : '#16a34a' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                            {l.hot ? 'Hot' : 'Available'}
                          </div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '24px', background: 'linear-gradient(0deg,#fff 55%,rgba(255,255,255,0))', textAlign: 'center', marginTop: -48 }}>
                <Link to="/register" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: NAVY, color: '#fff', padding: '12px 26px', borderRadius: 11,
                  fontSize: 14, fontWeight: 700, textDecoration: 'none',
                  boxShadow: '0 4px 18px rgba(11,22,40,0.2)', transition: 'all 0.18s',
                }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                ><Lock size={14} />Unlock all leads — free signup</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* STATS */}
      <section className="lp-section-stats" style={{ background: `${NOISE}, linear-gradient(135deg,#070e1b 0%,#0b1628 100%)` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <div className="lp-stats-grid">
            {[['10,000+', 'Leads delivered'], ['500+', 'Moving companies'], ['98%', 'Satisfaction rate'], ['$10', 'Average lead cost']].map(([v, l], i) => (
              <Reveal key={i} delay={i * 0.07}>
                <div>
                  <div className="lp-stat-val" style={{ fontSize: 46, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', fontFamily: F, marginBottom: 7 }}>{v}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', fontWeight: 500 }}>{l}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="lp-section" style={{ background: '#fff' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 52 }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 10 }}>
                {[1, 2, 3, 4, 5].map(s => <Star key={s} size={18} color="#f59e0b" fill="#f59e0b" />)}
              </div>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Rated 4.9/5 from 200+ reviews</p>
              <h2 style={{ fontFamily: F, fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: NAVY }}>Trusted across America</h2>
            </div>
          </Reveal>
          <div className="lp-test-grid">
            {[
              { n: 'Mike Thompson', co: 'Atlas Moving Co', loc: 'Phoenix, AZ', q: 'MoveLeads doubled our bookings in 3 months. We closed $47,000 in new business. The quality is unlike anything we\'ve tried.', stat: '+$47k revenue' },
              { n: 'Sarah Chen', co: 'Premier Movers', loc: 'Seattle, WA', q: 'Conversion jumped from 8% to 22% after switching to MoveLeads. Every dollar we spend returns 15x. Absolute game changer.', stat: '22% close rate' },
              { n: 'David Rodriguez', co: 'Elite Relocation', loc: 'Austin, TX', q: 'The pay-per-lead model is perfect. No wasted spend, zero contracts. We\'re buying 30 leads a week and growing fast.', stat: '30 leads/week' },
            ].map((t, i) => (
              <Reveal key={i} delay={i * 0.09}>
                <div style={{
                  background: '#fff', border: `1px solid ${BL}`, borderRadius: 18, padding: '30px 26px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.22s ease',
                  display: 'flex', flexDirection: 'column',
                }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.07)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ display: 'flex', gap: 3, marginBottom: 18 }}>{[1, 2, 3, 4, 5].map(s => <Star key={s} size={14} color="#f59e0b" fill="#f59e0b" />)}</div>
                  <p style={{ fontSize: 15, color: '#334155', lineHeight: 1.75, marginBottom: 22, flex: 1 }}>"{t.q}"</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 11, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>{t.n.split(' ').map(x => x[0]).join('')}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{t.n}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.co} · {t.loc}</div>
                      </div>
                    </div>
                    <div style={{ padding: '4px 11px', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 7, fontSize: 11, fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>{t.stat}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* FAQ */}
      <section className="lp-section" style={{ background: '#fff', borderTop: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 52 }}>
              <h2 style={{ fontFamily: F, fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: NAVY, marginBottom: 10 }}>Frequently asked questions</h2>
              <p style={{ fontSize: 15, color: '#64748b' }}>Can't find an answer? <a href="mailto:support@moveleads.cloud" style={{ color: ORANGE, fontWeight: 600 }}>Email our team</a></p>
            </div>
          </Reveal>
          {[
            ['How are your leads verified?', 'Every lead goes through email confirmation, phone number validation, and intent scoring. We only accept leads that have actively submitted a moving quote in the last 24 hours.'],
            ['What information is included with each lead?', 'Full name, phone number, email, origin city/state, destination city/state, home size, estimated move date, and a lead quality score (1–10).'],
            ['Can I filter leads by location?', 'Yes. Filter by state, city, zip code radius, or draw a custom service area. You\'ll only see leads that match your coverage.'],
            ['What if a lead turns out to be invalid?', 'If a lead has an invalid phone number or is a clear duplicate, contact us within 48 hours for a full credit — no questions asked.'],
            ['Is there a monthly commitment?', 'None. Pay-per-lead means you buy exactly what you want, when you want. Pause or stop any time with no penalties.'],
            ['How quickly do leads arrive after I sign up?', 'Most customers receive their first lead within minutes of signing up and setting their service area.'],
            ['Do you offer exclusive leads?', 'Yes — exclusive leads are available on the Pro Bundle plan. Sent to one company only, no competition.'],
          ].map((item, i) => (
            <Reveal key={i} delay={i * 0.03}>
              <div style={{ borderBottom: `1px solid ${BL}`, overflow: 'hidden' }}>
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '20px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 16,
                }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: NAVY, fontFamily: F }}>{item[0]}</span>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: faqOpen === i ? ORANGE : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.18s' }}>
                    <ChevronDown size={14} color={faqOpen === i ? '#fff' : '#64748b'} style={{ transform: faqOpen === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.22s ease' }} />
                  </div>
                </button>
                <div style={{ maxHeight: faqOpen === i ? 180 : 0, overflow: 'hidden', transition: 'max-height 0.28s ease', paddingBottom: faqOpen === i ? 18 : 0 }}>
                  <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.75 }}>{item[1]}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="lp-section-cta" style={{ background: `linear-gradient(135deg,${ORANGE} 0%,#ea6c0a 100%)`, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: NOISE, opacity: 0.4, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)', width: 700, height: 450, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 580, margin: '0 auto', padding: '0 28px', position: 'relative' }}>
          <Reveal>
            <h2 style={{ fontFamily: F, fontSize: 44, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: 12, lineHeight: 1.1 }}>
              Start growing your<br />moving business today.
            </h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.72)', marginBottom: 38, lineHeight: 1.65 }}>
              Join 500+ moving companies getting exclusive leads. No credit card required.
            </p>
            <div className="lp-cta-buttons">
              <Link to="/register" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#fff', color: ORANGE, padding: '14px 30px', borderRadius: 13,
                fontSize: 15, fontWeight: 800, textDecoration: 'none',
                boxShadow: '0 8px 28px rgba(0,0,0,0.14)', transition: 'all 0.18s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 36px rgba(0,0,0,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.14)'; }}
              >Get started free <ArrowRight size={17} /></Link>
              <Link to="/login" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.13)', color: '#fff', padding: '14px 26px', borderRadius: 13,
                fontSize: 14, fontWeight: 700, textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', transition: 'all 0.18s',
              }}>Already have an account? Log in</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#060d1a', padding: '60px 0 28px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <div className="lp-footer-grid">
            <div>
              <div style={{ fontFamily: F, fontSize: 21, fontWeight: 800, letterSpacing: '-0.4px', marginBottom: 12 }}>
                <span style={{ color: '#fff' }}>Move</span><span style={{ color: ORANGE }}>Leads</span><span style={{ color: 'rgba(255,255,255,0.28)', fontWeight: 600 }}>.cloud</span>
              </div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.32)', lineHeight: 1.75, maxWidth: 240, marginBottom: 22 }}>Verified moving leads delivered instantly. Pay only for what you buy.</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9, width: 'fit-content' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'lpPulse 2s infinite' }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>Leads available now</span>
              </div>
            </div>
            {[
              { title: 'Product', links: [{ l: 'Features', h: '#features' }, { l: 'Pricing', to: '/pricing' }, { l: 'How It Works', h: '#how-it-works' }] },
              { title: 'Company', links: [{ l: 'About Us', to: '/about' }, { l: 'Contact', to: '/contact' }, { l: 'For Movers', to: '/for-movers' }, { l: 'Privacy Policy', to: '/privacy' }] },
              { title: 'Account', links: [{ l: 'Sign up free', to: '/register' }, { l: 'Log in', to: '/login' }, { l: 'Feedback', to: '/feedback' }] },
            ].map((col, i) => (
              <div key={i}>
                <h4 style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 18 }}>{col.title}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                  {col.links.map((lnk, j) => (
                    lnk.to
                      ? <Link key={j} to={lnk.to} style={{ color: 'rgba(255,255,255,0.42)', fontSize: 13, fontWeight: 500, textDecoration: 'none', transition: 'color 0.18s' }} onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.42)'}>{lnk.l}</Link>
                      : <a key={j} href={lnk.h} style={{ color: 'rgba(255,255,255,0.42)', fontSize: 13, fontWeight: 500, textDecoration: 'none', transition: 'color 0.18s' }} onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.42)'}>{lnk.l}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.055)', paddingTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>© 2026 MoveLeads.cloud. All rights reserved.</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Built for the moving industry.</p>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes lpPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(1.35)} }
        @keyframes lpMarquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .lp-links { display:flex; }
        .lp-auth { display:flex; }
        .lp-hamburger { display:none; }
        @media(max-width:900px){
          .lp-links { display:none; }
          .lp-auth  { display:none; }
          .lp-hamburger { display:flex; align-items:center; justify-content:center; }
        }
      `}</style>
    </div>
  );
}
