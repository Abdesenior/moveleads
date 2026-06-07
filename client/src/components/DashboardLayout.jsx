import React, { useEffect, useState, useContext } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, CreditCard, User, Settings,
  Menu, X, LogOut, Briefcase, Zap,
  ChevronLeft, ChevronRight, Tag
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import ImpersonationBanner from './ImpersonationBanner';
import VerificationBanner from './VerificationBanner';
import OnboardingOfferBanner from './OnboardingOfferBanner';
import FirstTopupReassurancePopup from './FirstTopupReassurancePopup';
import OnboardingWizard from '../pages/onboarding/OnboardingWizard';
import SidebarTooltip from './SidebarTooltip';
import '../dashboard.css';

// Sidebar nav.
//
// Hidden from the menu (2026-06-03): SMS Claim, "Embed a form" (Widget) and
// "Refunds & Disputes" (Resolution Center). The features are kept — their
// routes still resolve under /dashboard/* in App.jsx and the pages work — but
// they are intentionally not surfaced as mover tabs and are reachable by
// direct URL only. Do not re-add these entries without an explicit ask.
const NAV_ITEMS = [
  { to: '/dashboard',          end: true,  icon: <LayoutDashboard size={18} />, label: 'Overview'           },
  { to: '/dashboard/leads',    end: false, icon: <Zap size={18} />,             label: 'Live Leads'         },
  { to: '/dashboard/deals',    end: false, icon: <Tag size={18} />,             label: 'Discounted Leads'   },
  { to: '/dashboard/my-leads', end: false, icon: <Briefcase size={18} />,       label: 'My Leads'           },
  { to: '/dashboard/customers',end: false, icon: <Users size={18} />,           label: 'Customers'          },
  { to: '/dashboard/billing',  end: false, icon: <CreditCard size={18} />,      label: 'Billing'            },
  { to: '/dashboard/profile',  end: false, icon: <User size={18} />,            label: 'Profile'            },
  { to: '/dashboard/settings', end: false, icon: <Settings size={18} />,        label: 'Settings'           },
];

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  // Live socket status published by pages that own real-time data (e.g.
  // LeadFeed). null = page doesn't have a live connection; we hide the
  // indicator in that case.
  const [liveStatus, setLiveStatus] = useState(null);
  useEffect(() => {
    const handler = (e) => setLiveStatus(e?.detail || null);
    window.addEventListener('moveleads:socket-status', handler);
    return () => window.removeEventListener('moveleads:socket-status', handler);
  }, []);
  const { user, logout, token, API_URL, refreshUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [showWizard, setShowWizard] = useState(false);
  const [wizardInitialStep, setWizardInitialStep] = useState(null);
  const [showActivationSuccess, setShowActivationSuccess] = useState(false);

  // First-balance-event reassurance popup. Triggered by the user's onboarding
  // state (firstTopupAt set, firstTopupPopupShownAt null) — fires once per
  // user across activation OR top-up. Once it mounts we mark it seen
  // server-side so refresh/relog/future top-ups never re-trigger.
  const [showFirstTopupPopup, setShowFirstTopupPopup] = useState(false);
  const firstTopupHandledRef = React.useRef(false);

  // Show wizard for partner users who haven't completed onboarding. Delay
  // the auto-mount by ~3s so the dashboard has a moment to render and the
  // user sees their account land before the wizard takes over. Deep-link
  // mounts (banner CTA, ?activate=1, ?onboarding=resume) are NOT delayed —
  // those are explicit user intent and should appear immediately.
  // Also auto-collapse the sidebar on first arrival so onboarding takes focus.
  useEffect(() => {
    if (!user) return;
    if (user.role === 'admin' || user.role === 'super_admin') return;
    if (user.onboarding?.complete) return;
    // WP-A4 — gate auto-mount on email verification. Unverified users see
    // the dashboard (Lead Feed, Settings, Profile) but the activation wizard
    // must NOT auto-mount — they have to verify their email first. The
    // OnboardingOfferBanner handles the verification CTA in this state.
    if (user.isEmailVerified !== true) return;
    // Partner finished setup and explicitly dismissed the activation offer.
    // Don't auto-mount the wizard again — that feels paywalled. The
    // OnboardingOfferBanner CTA still drives explicit re-engagement, and deep
    // links (?activate=1, ?onboarding=resume) still open the wizard
    // because they signal explicit user intent.
    if (user.onboarding?.activationOfferDismissedAt) return;

    // First-time visit: no stored preference yet → start collapsed.
    if (localStorage.getItem('sidebarCollapsed') === null) {
      setCollapsed(true);
      localStorage.setItem('sidebarCollapsed', 'true');
    }

    const t = setTimeout(() => setShowWizard(true), 3000);
    return () => clearTimeout(t);
  }, [user]);

  // First-balance-event popup trigger. Fires 3s after the dashboard renders
  // for a user whose onboarding has firstTopupAt stamped but no
  // firstTopupPopupShownAt. The mark-seen POST happens at the same instant
  // we open the popup so a refresh during the 3s window won't double-trigger
  // and a refresh AFTER the popup is open won't re-show it.
  useEffect(() => {
    if (firstTopupHandledRef.current) return;
    if (!user) return;
    if (user.role === 'admin' || user.role === 'super_admin') return;
    const ob = user.onboarding;
    if (!ob?.firstTopupAt) return;
    if (ob.firstTopupPopupShownAt) return;

    firstTopupHandledRef.current = true;
    const timer = setTimeout(async () => {
      setShowFirstTopupPopup(true);
      try {
        await fetch(`${API_URL}/onboarding/mark-first-topup-popup-seen`, {
          method: 'POST',
          headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        });
        if (refreshUser) refreshUser();
      } catch (_err) { /* non-blocking — server is the source of truth */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [user, API_URL, token, refreshUser]);

  const dismissFirstTopupPopup = () => setShowFirstTopupPopup(false);

  // Banner CTA → reopen wizard at the Activate screen (v2 SCREENS.ACTIVATE = 7).
  // v2 wizard's 8-screen model: Welcome=1, Location=2, Delivery=3, Contact=4,
  // SmsClaim=5, AlmostReady=6, Activate=7, Success=8. The Activate screen
  // renders the tier picker; payment is its second phase, reached after the
  // mover picks a tier and a fresh PaymentIntent is created.
  const openActivation = () => {
    setWizardInitialStep(7);
    setShowWizard(true);
  };

  // Custom-event channel so deep children (e.g. PreviewModal inside LeadFeed)
  // can request the activation wizard without prop-drilling. Anyone in the
  // tree can fire `window.dispatchEvent(new CustomEvent('moveleads:open-activation'))`.
  useEffect(() => {
    const handler = () => openActivation();
    window.addEventListener('moveleads:open-activation', handler);
    return () => window.removeEventListener('moveleads:open-activation', handler);
  }, []);

  // Detect post-payment return from Stripe Embedded Checkout AND deep-links
  // from recovery emails (?onboarding=resume / ?activate=1).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const onboardingParam = params.get('onboarding');
    const activateParam = params.get('activate');

    if (onboardingParam === 'success') {
      setShowActivationSuccess(true);
      params.delete('onboarding');
      params.delete('session_id');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      if (refreshUser) refreshUser();
      return;
    }

    // Recovery email deep-links — only act once user is loaded.
    if (!user) return;
    if (user.role === 'admin' || user.role === 'super_admin') return;

    if (onboardingParam === 'resume') {
      // Mid-wizard abandoner: map the saved server-tracked currentStep into
      // the v2 8-screen model and drop the mover at the corresponding screen.
      //   server 1 → Location (2)
      //   server 2 → Delivery (3)
      //   server 3 → Contact  (4)
      //   server 4 → SmsClaim (5)
      //   server 5 → AlmostReady (6)
      // Anything outside that range → start at Welcome (1). If onboarding is
      // already marked complete, drop them on Activate (7).
      const SERVER_TO_V2 = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 };
      const savedStep = user.onboarding?.currentStep || 0;
      const mapped = SERVER_TO_V2[savedStep] || 1;
      const target = !user.onboarding?.complete ? mapped : 7;
      setWizardInitialStep(target);
      setShowWizard(true);
      params.delete('onboarding');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    } else if (activateParam === '1') {
      // Post-skip recovery: open the Activate screen (v2 SCREENS.ACTIVATE = 7).
      setWizardInitialStep(7);
      setShowWizard(true);
      params.delete('activate');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [refreshUser, user]);

  const handleCloseWizard = async () => {
    setShowWizard(false);
    setWizardInitialStep(null);
    if (refreshUser) await refreshUser();
  };

  const handleCloseActivationSuccess = () => {
    setShowActivationSuccess(false);
    navigate('/dashboard/leads');
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
  };

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const handleLogout = () => { logout(); navigate('/'); };

  const initials = user?.companyName
    ? user.companyName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'ML';

  const balance = user?.balance ?? 0;
  const balanceColor = balance > 0 ? '#16a34a' : '#ef4444';
  const balanceBg   = balance > 0 ? '#f0fdf4'  : '#fef2f2';

  return (
    <div className={`dashboard-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {/* Mobile sticky app bar — hamburger + brand on the left, live status
          on the right. Hidden on desktop. */}
      <div className="mobile-header">
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(prev => !prev)}
        >
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div className="mobile-brand">
          <span className="mobile-brand-mark" aria-hidden="true" />
          <span className="mobile-brand-text">MoveLeads</span>
        </div>
        {liveStatus && (
          <span className={`mobile-live-status mobile-live-${liveStatus}`} role="status" aria-live="polite">
            <span className="mobile-live-dot" aria-hidden="true" />
            <span className="mobile-live-label">
              {liveStatus === 'connected'
                ? 'Live'
                : liveStatus === 'reconnecting'
                  ? 'Reconnecting'
                  : 'Connecting'}
            </span>
          </span>
        )}
      </div>

      <OnboardingOfferBanner onActivate={openActivation} />
      <ImpersonationBanner />
      <VerificationBanner />

      <div className="dashboard-shell" inert={showWizard ? '' : undefined}>

        {/* Backdrop */}
        <div
          className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* ── Sidebar ── */}
        <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-hidden={!sidebarOpen}>

          {/* Logo — clickable, routes to /dashboard/leads */}
          <SidebarTooltip label="Go to Live Leads" enabled={collapsed}>
            <Link to="/dashboard/leads" className="logo-container" aria-label="MoveLeads — Live Leads">
              <span className="logo-text">
                <span className="logo-move">Move</span><span className="logo-leads">Leads</span><span className="logo-cloud">.cloud</span>
              </span>
              <p className="logo-tagline">Moving leads marketplace</p>
              {/* Collapsed icon fallback */}
              <span className="logo-icon" style={{ display: 'none', fontSize: 20, fontWeight: 800, color: '#ea580c', fontFamily: 'var(--font-heading)' }}>M</span>
            </Link>
          </SidebarTooltip>

          {/* Mobile close */}
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>

          {/* Mobile-only balance card — sits between the logo and the nav so
              the user can see + top up their balance without scrolling to
              the bottom of the drawer. Hidden on desktop where the bottom
              user section already carries the balance pill. */}
          <div className="mobile-balance-card">
            <div className="mobile-balance-card-row">
              <div className="mobile-balance-card-text">
                <span className="mobile-balance-card-label">Balance</span>
                <span className="mobile-balance-card-amount" style={{ color: balanceColor }}>
                  ${balance.toFixed(2)}
                </span>
              </div>
              <Link
                to="/dashboard/billing"
                onClick={() => setSidebarOpen(false)}
                className="mobile-balance-card-cta"
              >
                Add funds
              </Link>
            </div>
          </div>

          {/* Nav */}
          <nav className="sidebar-nav">
            {NAV_ITEMS.map(({ to, end, icon, label }) => (
              <SidebarTooltip key={to} label={label} enabled={collapsed}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => {
                    const base = `nav-item${isActive ? ' active' : ''}`;
                    return to === '/dashboard/leads' ? `${base} nav-item-leads` : base;
                  }}
                >
                  {icon}
                  <span className="nav-label">{label}</span>
                </NavLink>
              </SidebarTooltip>
            ))}
          </nav>

          {/* ── Collapse toggle (desktop only) ── */}
          <SidebarTooltip label={collapsed ? 'Expand menu' : 'Collapse menu'} enabled={collapsed}>
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </SidebarTooltip>

          {/* ── User profile widget ── */}
          <div className="sidebar-user-section">
            <div className="sidebar-user-info">
              <div className="sidebar-avatar">{initials}</div>
              <div style={{ minWidth: 0 }}>
                <div className="sidebar-user-name">{user?.companyName || 'My Company'}</div>
                <div className="sidebar-user-role">Moving Company</div>
              </div>
            </div>

            {/* Balance — full pill when expanded, compact dot when collapsed */}
            <div
              className="balance-pill"
              style={{ background: balanceBg, marginBottom: 10 }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Balance</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: balanceColor, fontFamily: 'var(--font-heading)' }}>
                ${balance.toFixed(2)}
              </span>
            </div>
            <SidebarTooltip label={`Available balance · $${balance.toFixed(2)}`} enabled={collapsed}>
              <div
                className="balance-compact"
                style={{ background: balanceBg, color: balanceColor }}
                aria-label={`Available balance: $${balance.toFixed(2)}`}
              >
                ${Math.round(balance)}
              </div>
            </SidebarTooltip>

            <SidebarTooltip label="Sign Out" enabled={collapsed}>
              <button className="sidebar-logout-btn" onClick={handleLogout} aria-label="Sign Out">
                <LogOut size={15} /> <span className="btn-label">Sign Out</span>
              </button>
            </SidebarTooltip>
          </div>
        </aside>

      <main className="dashboard-main">
        {children}
      </main>
      </div>

      {showWizard && <OnboardingWizard onClose={handleCloseWizard} initialStep={wizardInitialStep} />}
      {showActivationSuccess && <ActivationSuccessModal user={user} onClose={handleCloseActivationSuccess} />}
      {showFirstTopupPopup && <FirstTopupReassurancePopup onClose={dismissFirstTopupPopup} />}
    </div>
  );
}

function ActivationSuccessModal({ user, onClose }) {
  // Headline + bonus row are driven by the live AuthContext user (passed
  // in from DashboardLayout). refreshUser() fires right before this mounts,
  // so the credited balance is usually here within one tick; the $50 floor
  // matches StepSuccess.jsx and protects against a brief stale-context
  // render that would otherwise flash "$0 balance is active". Bonus row
  // only appears when the server stamped onboarding.bonusClaimedAt — same
  // gate used by OnboardingOfferBanner and the in-wizard StepSuccess.
  const balance = Math.round(user?.balance || 0);
  const displayBalance = Math.max(balance, 50);
  const bonusApplied = !!user?.onboarding?.bonusClaimedAt;
  const rows = [];
  if (bonusApplied) rows.push(['Onboarding bonus applied', '+$50']);
  rows.push(['Dispatch alerts enabled', null]);
  rows.push(['Market coverage configured', null]);

  return (
    <div style={{
      // 13500 — above the mobile fixed app bar (12100 in dashboard.css).
      // Matches the standard modal layer convention.
      position: 'fixed', inset: 0, zIndex: 13500,
      background: 'rgba(7, 17, 31, 0.55)',
      backdropFilter: 'blur(8px)',
      display: 'grid', placeItems: 'center',
      padding: 16,
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: 22,
        padding: '36px 32px',
        maxWidth: 440, width: '100%',
        boxShadow: '0 30px 80px rgba(0, 0, 0, 0.32)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, margin: '0 auto 20px',
          borderRadius: '50%',
          background: 'linear-gradient(180deg, #22c55e, #16a34a)',
          color: '#fff', fontSize: 32, fontWeight: 800,
          display: 'grid', placeItems: 'center',
          boxShadow: '0 14px 32px rgba(34, 197, 94, 0.35)',
        }}>✓</div>
        <h1 style={{
          fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em',
          color: '#0f172a', margin: '0 0 8px', lineHeight: 1.2,
        }}>Your ${displayBalance} balance is active</h1>
        <ul style={{
          listStyle: 'none', padding: 0,
          margin: '18px 0 0',
          display: 'flex', flexDirection: 'column', gap: 8,
          fontSize: 14.5, color: '#475569', textAlign: 'left',
        }}>
          {rows.map(([label, value]) => (
            <li key={label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '10px 14px',
              background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 10,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#22c55e', fontWeight: 800 }}>✓</span>
                {label}
              </span>
              {value && <strong style={{ color: '#ea580c', fontWeight: 800 }}>{value}</strong>}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 22,
            background: '#ff6a14', color: '#fff', border: 'none',
            height: 48, padding: '0 24px', borderRadius: 12,
            fontFamily: 'inherit', fontWeight: 800, fontSize: 15,
            cursor: 'pointer',
            boxShadow: '0 10px 26px rgba(255, 106, 20, 0.32)',
          }}
        >
          View matching opportunities →
        </button>
      </div>
    </div>
  );
}
