import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const BL = 'rgba(15,23,42,0.08)';

const NAV_LINKS = [
  { label: 'Features',     href: '/#features' },
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Pricing',      to: '/pricing' },
  { label: 'For Movers',   to: '/for-movers', accent: true },
];

export default function MarketingLayout({ children }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { window.scrollTo(0, 0); setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // Prevent body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <div style={{ fontFamily: F, color: NAVY, overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: `1px solid ${BL}`,
        transition: 'all 0.3s ease',
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 20px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>

          {/* Logo */}
          <Link to="/" style={{ textDecoration: 'none', fontSize: 20, fontWeight: 800, letterSpacing: '-0.4px', fontFamily: F, flexShrink: 0 }}>
            <span style={{ color: NAVY }}>Move</span>
            <span style={{ color: ORANGE }}>Leads</span>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>.cloud</span>
          </Link>

          {/* Desktop links */}
          <div className="ml-nav-links">
            {NAV_LINKS.map(({ label, href, to, accent }) =>
              to ? (
                <Link key={label} to={to} style={{ color: accent ? '#ea580c' : '#475569', fontWeight: accent ? 700 : 500, fontSize: 14, textDecoration: 'none', padding: '8px 12px', borderRadius: 8, transition: 'all 0.18s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = accent ? '#fff7ed' : '#f1f5f9'; if (!accent) e.currentTarget.style.color = NAVY; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; if (!accent) e.currentTarget.style.color = '#475569'; }}
                >{label}</Link>
              ) : (
                <a key={label} href={href} style={{ color: '#475569', fontWeight: 500, fontSize: 14, textDecoration: 'none', padding: '8px 12px', borderRadius: 8, transition: 'all 0.18s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = NAVY; e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.background = 'transparent'; }}
                >{label}</a>
              )
            )}
          </div>

          {/* Desktop auth buttons */}
          <div className="ml-nav-auth">
            <Link to="/login" style={{ color: '#475569', fontSize: 14, fontWeight: 600, textDecoration: 'none', padding: '8px 14px', borderRadius: 8 }}>Log in</Link>
            <Link to="/register" style={{ background: ORANGE, color: '#fff', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', boxShadow: '0 2px 10px rgba(249,115,22,0.35)', whiteSpace: 'nowrap' }}>Get started free</Link>
          </div>

          {/* Mobile hamburger */}
          <button className="ml-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {menuOpen && (
          <div className="ml-mobile-menu">
            <div className="ml-mobile-links">
              {NAV_LINKS.map(({ label, href, to, accent }) =>
                to ? (
                  <Link key={label} to={to} className="ml-mobile-link" style={{ color: accent ? '#ea580c' : NAVY, fontWeight: accent ? 700 : 600 }} onClick={() => setMenuOpen(false)}>{label}</Link>
                ) : (
                  <a key={label} href={href} className="ml-mobile-link" style={{ color: NAVY, fontWeight: 600 }} onClick={() => setMenuOpen(false)}>{label}</a>
                )
              )}
            </div>
            <div className="ml-mobile-auth">
              <Link to="/login" className="ml-mobile-login" onClick={() => setMenuOpen(false)}>Log in</Link>
              <Link to="/register" className="ml-mobile-cta" onClick={() => setMenuOpen(false)}>Get started free →</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Page content ── */}
      <div style={{ paddingTop: 64 }}>
        {children}
      </div>

      {/* ── Footer ── */}
      <footer style={{ background: '#060d1a', padding: '60px 0 28px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <div className="ml-footer-grid">
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
              { title: 'Product', links: [{ l: 'Features', h: '/#features' }, { l: 'Pricing', to: '/pricing' }, { l: 'How It Works', h: '/#how-it-works' }] },
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

        /* Desktop nav */
        .ml-nav-links { display: flex; gap: 2px; align-items: center; }
        .ml-nav-auth  { display: flex; gap: 8px; align-items: center; }
        .ml-hamburger { display: none; background: none; border: none; cursor: pointer; color: ${NAVY}; padding: 6px; border-radius: 8px; }

        /* Mobile menu */
        .ml-mobile-menu { background: #fff; border-top: 1px solid ${BL}; padding: 16px 20px 24px; }
        .ml-mobile-links { display: flex; flex-direction: column; gap: 2px; margin-bottom: 16px; }
        .ml-mobile-link { display: block; padding: 12px 14px; font-size: 15px; text-decoration: none; border-radius: 10px; transition: background 0.15s; }
        .ml-mobile-link:hover { background: #f8fafc; }
        .ml-mobile-auth { display: flex; flex-direction: column; gap: 10px; padding-top: 16px; border-top: 1px solid ${BL}; }
        .ml-mobile-login { display: block; text-align: center; padding: 12px; font-size: 15px; font-weight: 600; color: ${NAVY}; text-decoration: none; border: 1.5px solid #e2e8f0; border-radius: 12px; }
        .ml-mobile-cta   { display: block; text-align: center; padding: 13px; font-size: 15px; font-weight: 700; color: #fff; text-decoration: none; background: ${ORANGE}; border-radius: 12px; box-shadow: 0 4px 14px rgba(249,115,22,0.35); }

        /* Footer */
        .ml-footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 44px; margin-bottom: 48px; }

        @media(max-width: 900px) {
          .ml-nav-links { display: none; }
          .ml-nav-auth  { display: none; }
          .ml-hamburger { display: flex; align-items: center; justify-content: center; }
          .ml-footer-grid { grid-template-columns: 1fr 1fr; gap: 28px; }
        }
        @media(max-width: 600px) {
          .ml-footer-grid { grid-template-columns: 1fr; gap: 24px; }
        }
      `}</style>
    </div>
  );
}
