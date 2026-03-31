import React, { useEffect, useState, useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, CreditCard, User, Settings,
  Menu, X, LogOut, Briefcase, Zap, Code, MessageSquareWarning
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import ImpersonationBanner from './ImpersonationBanner';
import VerificationBanner from './VerificationBanner';
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
  const [openComplaints, setOpenComplaints] = useState(0);
  const { user, logout, token, API_URL } = useContext(AuthContext);
  const navigate = useNavigate();

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
      <ImpersonationBanner />
      <VerificationBanner />

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
      <aside className="sidebar" aria-hidden={!sidebarOpen}>

        {/* Logo */}
        <div className="logo-container">
          <span className="logo-text">
            <span className="logo-move">Move</span><span className="logo-leads">Leads</span><span className="logo-cloud">.cloud</span>
          </span>
          <p className="logo-tagline">Moving leads marketplace</p>
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
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {icon}
              <span>{label}</span>
              {/* Badge for Resolution Center */}
              {to === '/dashboard/resolution-center' && openComplaints > 0 && (
                <span style={{
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

        {/* ── User profile widget ── */}
        <div className="sidebar-user-section">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div className="sidebar-user-name">{user?.companyName || 'My Company'}</div>
              <div className="sidebar-user-role">Moving Company</div>
            </div>
          </div>

          {/* Balance pill */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 12,
            background: balanceBg, marginBottom: 10,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Balance</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: balanceColor, fontFamily: "'Poppins', sans-serif" }}>
              ${balance.toFixed(2)}
            </span>
          </div>

          <button className="sidebar-logout-btn" onClick={handleLogout}>
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        {children}
      </main>
    </div>
  );
}
