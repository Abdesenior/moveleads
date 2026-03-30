import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const BL = 'rgba(15,23,42,0.08)';

export default function MarketingLayout({ children }) {
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div style={{ fontFamily: F, color: NAVY, overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: scrolled ? 'rgba(255,255,255,0.93)' : 'rgba(255,255,255,0.93)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: `1px solid ${BL}`,
        transition: 'all 0.3s ease',
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px', height: 66, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ textDecoration: 'none', fontSize: 21, fontWeight: 800, letterSpacing: '-0.4px', fontFamily: F }}>
            <span style={{ color: NAVY }}>Move</span>
            <span style={{ color: ORANGE }}>Leads</span>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>.cloud</span>
          </Link>

          <div style={{ display: 'flex', gap: 2 }} className="lp-links">
            {[['Features', '/#features'], ['How It Works', '/#how-it-works']].map(([t, h]) => (
              <a key={t} href={h} style={{
                color: '#475569', fontSize: 14, fontWeight: 500, textDecoration: 'none',
                padding: '8px 13px', borderRadius: 8, transition: 'all 0.18s',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = NAVY; e.currentTarget.style.background = '#f1f5f9'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.background = 'transparent'; }}
              >{t}</a>
            ))}
            <Link to="/pricing" style={{
              color: '#475569', fontSize: 14, fontWeight: 500, textDecoration: 'none',
              padding: '8px 13px', borderRadius: 8, transition: 'all 0.18s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color = NAVY; e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.background = 'transparent'; }}
            >Pricing</Link>
            <Link to="/for-movers" style={{
              color: '#ea580c', fontSize: 14, fontWeight: 700, textDecoration: 'none',
              padding: '8px 13px', borderRadius: 8, transition: 'all 0.18s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fff7ed'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >For Movers</Link>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link to="/login" style={{ color: '#475569', fontSize: 14, fontWeight: 600, textDecoration: 'none', padding: '8px 14px', borderRadius: 8, transition: 'color 0.18s' }}>Log in</Link>
            <Link to="/register" style={{
              background: ORANGE, color: '#fff', padding: '9px 20px', borderRadius: 10,
              fontSize: 14, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 2px 10px rgba(249,115,22,0.38)', transition: 'all 0.18s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 5px 18px rgba(249,115,22,0.48)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 10px rgba(249,115,22,0.38)'; }}
            >Get started free</Link>
          </div>
        </div>
      </nav>

      {/* ── Page content ── */}
      <div style={{ paddingTop: 66 }}>
        {children}
      </div>

      {/* ── Footer ── */}
      <footer style={{ background: '#060d1a', padding: '60px 0 28px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 44, marginBottom: 48 }}>
            <div>
              <Link to="/" style={{ textDecoration: 'none', fontFamily: F, fontSize: 21, fontWeight: 800, letterSpacing: '-0.4px', display: 'inline-block', marginBottom: 12 }}>
                <span style={{ color: '#fff' }}>Move</span><span style={{ color: ORANGE }}>Leads</span><span style={{ color: 'rgba(255,255,255,0.28)', fontWeight: 600 }}>.cloud</span>
              </Link>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.32)', lineHeight: 1.75, maxWidth: 240, marginBottom: 22 }}>
                Verified moving leads delivered instantly. Pay only for what you buy.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9, width: 'fit-content' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'lpPulse 2s infinite' }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>Leads available now</span>
              </div>
            </div>
            {[
              { title: 'Product', links: [{ l: 'Features', h: '/#features' }, { l: 'Pricing', h: '/#pricing' }, { l: 'How It Works', h: '/#how-it-works' }] },
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
        .lp-links { display: flex; }
        @media(max-width:900px){ .lp-links{display:none} }
      `}</style>
    </div>
  );
}
