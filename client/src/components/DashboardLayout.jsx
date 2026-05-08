import React, { useEffect, useState, useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, CreditCard, User, Settings,
  Menu, X, LogOut, Briefcase, Zap, Code, MessageSquareWarning,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import ImpersonationBanner from './ImpersonationBanner';
import VerificationBanner from './VerificationBanner';
import ActivationBanner from './ActivationBanner';
import OnboardingWizard from '../pages/onboarding/OnboardingWizard';
import '../dashboard.css';

const NAV_ITEMS = [
  { to: '/dashboard',          end: true,  icon: <LayoutDashboard size={18} />, label: 'Overview'   },
  { to: '/dashboard/leads',    end: false, icon: <Zap size={18} />,             label: 'Live Leads'  },
  { to: '/dashboard/my-leads', end: false, icon: <Briefcase size={18} />,       label: 'My Leads'    },
  { to: '/dashboard/customers',end: false, icon: <Users size={18} />,           label: 'Customers'   },
  { to: '/dashboard/billing',  end: false, icon: <CreditCard size={18} />,      label: 'Billing'     },
  { to: '/dashboard/profile',  end: false, icon: <User size={18} />,            label: 'Profile'     },
  { to: '/dashboard/settings', end: false, icon: <Settings size={18} />,        label: 'Settings'    },
  { to: '/dashboard/widget',   end: false, icon: <Code size={18} />,            label: 'Widget'      },
  { to: '/dashboard/resolution-center', end: false, icon: <MessageSquareWarning size={18} />, label: 'Resolution' },
];

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const [openComplaints, setOpenComplaints] = useState(0);
  const { user, logout, token, API_URL, refreshUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [showWizard, setShowWizard] = useState(false);
  const [wizardInitialStep, setWizardInitialStep] = useState(null);
  const [showActivationSuccess, setShowActivationSuccess] = useState(false);

  // Show wizard once for partner users who haven't completed onboarding.
  // Also auto-collapse the sidebar on first arrival so onboarding takes focus.
  useEffect(() => {
    if (!user) return;
    if (user.role === 'admin' || user.role === 'super_admin') return;
    if (!user.onboarding?.complete) {
      setShowWizard(true);
      // First-time visit: no stored preference yet → start collapsed.
      if (localStorage.getItem('sidebarCollapsed') === null) {
        setCollapsed(true);
        localStorage.setItem('sidebarCollapsed', 'true');
      }
    }
  }, [user]);

  // Banner CTA → reopen wizard at the activation step (step 7).
  const openActivation = () => {
    setWizardInitialStep(7);
    setShowWizard(true);
  };

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
      // Mid-wizard abandoner: reopen at saved step (or 1 if missing).
      const savedStep = user.onboarding?.currentStep || 1;
      const target = !user.onboarding?.complete ? Math.min(Math.max(savedStep, 1), 5) : 7;
      setWizardInitialStep(target);
      setShowWizard(true);
      params.delete('onboarding');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    } else if (activateParam === '1') {
      // Post-skip recovery: jump to activation step.
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

  // Silently poll for open/in-progress complaints to drive the nav badge
  useEffect(() => {
    const fetchBadge = async () => {
      if (!token || !API_URL) return;
      try {
        const res = await fetch(`${API_URL}/complaints`, { headers: { 'x-auth-token': token } });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) {
          setOpenComplaints(data.filter(c => c.status === 'Open' || c.status === 'In Progress').length);
        }
      } catch { /* silent */ }
    };
    fetchBadge();
    const interval = setInterval(fetchBadge, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [token, API_URL]);

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
      <ActivationBanner onActivate={openActivation} />
      <ImpersonationBanner />
      <VerificationBanner />

      <div className="dashboard-shell">
      {/* Mobile hamburger */}
        <button
          type="button"
          className="sidebar-toggle"
          aria-label="Open navigation"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={20} />
        </button>

        {/* Backdrop */}
        <div
          className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* ── Sidebar ── */}
        <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-hidden={!sidebarOpen}>

          {/* Logo */}
          <div className="logo-container">
            <span className="logo-text">
              <span className="logo-move">Move</span><span className="logo-leads">Leads</span><span className="logo-cloud">.cloud</span>
            </span>
            <p className="logo-tagline">Moving leads marketplace</p>
            {/* Collapsed icon fallback */}
            <span className="logo-icon" style={{ display: 'none', fontSize: 20, fontWeight: 800, color: '#ea580c', fontFamily: 'Poppins, sans-serif' }}>M</span>
          </div>

          {/* Mobile close */}
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>

          {/* Nav */}
          <nav className="sidebar-nav">
            {NAV_ITEMS.map(({ to, end, icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={collapsed ? label : undefined}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                {icon}
                <span className="nav-label">{label}</span>
                {to === '/dashboard/resolution-center' && openComplaints > 0 && (
                  <span className="nav-badge" style={{
                    marginLeft: 'auto',
                    background: '#ef4444', color: '#fff',
                    fontSize: 10, fontWeight: 800,
                    padding: '2px 6px', borderRadius: 10,
                    minWidth: 18, textAlign: 'center',
                    lineHeight: '14px',
                  }}>
                    {openComplaints}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* ── Collapse toggle (desktop only) ── */}
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

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
              <span style={{ fontSize: 14, fontWeight: 800, color: balanceColor, fontFamily: "'Poppins', sans-serif" }}>
                ${balance.toFixed(2)}
              </span>
            </div>
            <div
              className="balance-compact"
              style={{ background: balanceBg, color: balanceColor }}
              title={`Balance: $${balance.toFixed(2)}`}
              aria-label={`Balance: $${balance.toFixed(2)}`}
            >
              ${Math.round(balance)}
            </div>

            <button className="sidebar-logout-btn" onClick={handleLogout}>
              <LogOut size={15} /> <span className="btn-label">Sign Out</span>
            </button>
          </div>
        </aside>

      <main className="dashboard-main">
        {children}
      </main>
      </div>

      {showWizard && <OnboardingWizard onClose={handleCloseWizard} initialStep={wizardInitialStep} />}
      {showActivationSuccess && <ActivationSuccessModal onClose={handleCloseActivationSuccess} />}
    </div>
  );
}

function ActivationSuccessModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
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
        }}>Your $150 balance is active</h1>
        <ul style={{
          listStyle: 'none', padding: 0,
          margin: '18px 0 0',
          display: 'flex', flexDirection: 'column', gap: 8,
          fontSize: 14.5, color: '#475569', textAlign: 'left',
        }}>
          {[
            ['Onboarding bonus applied', '+$50'],
            ['Dispatch alerts enabled', null],
            ['Market coverage configured', null],
          ].map(([label, value]) => (
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
