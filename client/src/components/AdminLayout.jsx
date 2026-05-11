import React, { useEffect, useState, useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Package, DollarSign, Settings, Menu, X, LogOut, Shield, AlertCircle, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import '../dashboard.css';

export default function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('adminSidebarCollapsed') === 'true');
  const [pendingDisputes, setPendingDisputes] = useState(0);
  const { user, logout, API_URL, token } = useContext(AuthContext);
  const navigate = useNavigate();

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('adminSidebarCollapsed', String(next));
  };

  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const res = await fetch(`${API_URL}/disputes/admin`, {
          headers: { 'x-auth-token': token }
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          setPendingDisputes(data.length);
        }
      } catch (err) {
        console.error('Failed to fetch pending disputes count:', err);
      }
    };
    fetchPendingCount();
  }, [API_URL, token]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className={`dashboard-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {/* Mobile sticky app bar — hamburger + brand on the left, ADMIN
          pill on the right. Hidden on desktop where the sidebar nav
          handles everything. Same pattern as DashboardLayout so the
          two surfaces share one app-shell vocabulary. */}
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
        <span className="mobile-admin-pill" role="status">
          <Shield size={11} aria-hidden="true" />
          <span>Admin</span>
        </span>
      </div>

      {/* Inner row: sidebar + main side-by-side. Without this wrapper the
          parent .dashboard-layout (flex-direction: column) stacks the
          sidebar above the main content vertically — exactly the bug
          where Platform Overview was sliding to the bottom of the
          viewport. */}
      <div className="dashboard-shell">
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-hidden={!sidebarOpen}>
        <div className="logo-container">
          <div className="logo" style={{ fontSize: '24px', fontFamily: 'var(--font-heading)' }}>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>MoveLeads</span>
            <span style={{ fontWeight: 800, color: '#f97316' }}>.cloud</span>
          </div>
          <div className="admin-portal-badge" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 10, padding: '4px 12px', borderRadius: 6,
            background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)'
          }}>
            <Shield size={12} color="#f97316" />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: 1 }}>Admin Portal</span>
          </div>
          <span className="logo-icon" style={{ display: 'none', fontSize: 20, fontWeight: 800, color: '#f97316', fontFamily: 'var(--font-heading)' }}>A</span>
        </div>
        <button
          type="button"
          className="sidebar-close"
          aria-label="Close admin navigation"
          onClick={() => setSidebarOpen(false)}
        >
          <X size={22} />
        </button>
        <nav className="sidebar-nav">
          <NavLink to="/admin" end title={collapsed ? 'Dashboard' : undefined} onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <LayoutDashboard size={18} /> <span className="nav-label">Dashboard</span>
          </NavLink>
          <NavLink to="/admin/users" title={collapsed ? 'Users' : undefined} onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <Users size={18} /> <span className="nav-label">Users</span>
          </NavLink>
          <NavLink to="/admin/leads" title={collapsed ? 'Leads' : undefined} onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <Package size={18} /> <span className="nav-label">Leads</span>
          </NavLink>
          <NavLink to="/admin/revenue" title={collapsed ? 'Revenue' : undefined} onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <DollarSign size={18} /> <span className="nav-label">Revenue</span>
          </NavLink>
          <NavLink to="/admin/disputes" title={collapsed ? 'Disputes' : undefined} onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <AlertCircle size={18} />
            <span className="nav-label">Disputes</span>
            {pendingDisputes > 0 && (
              <span className="nav-badge" style={{
                marginLeft: 'auto', background: '#ef4444', color: '#fff',
                fontSize: 10, fontWeight: 800, padding: '2px 6px',
                borderRadius: 10, minWidth: 18, textAlign: 'center'
              }}>{pendingDisputes}</span>
            )}
          </NavLink>
          <NavLink to="/admin/pricing" title={collapsed ? 'Pricing Rules' : undefined} onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <DollarSign size={18} /> <span className="nav-label">Pricing Rules</span>
          </NavLink>
          <NavLink to="/admin/mover-research" title={collapsed ? 'Mover Research' : undefined} onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <ClipboardList size={18} /> <span className="nav-label">Mover Research</span>
          </NavLink>
          <NavLink to="/admin/settings" title={collapsed ? 'Settings' : undefined} onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <Settings size={18} /> <span className="nav-label">Settings</span>
          </NavLink>
        </nav>

        {/* Collapse toggle (desktop only) */}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <div className="sidebar-user-section">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
              {user?.companyName ? user.companyName[0].toUpperCase() : 'A'}
            </div>
            <div>
              <div className="sidebar-user-name">{user?.companyName || 'Admin'}</div>
              <div className="sidebar-user-role">Administrator</div>
            </div>
          </div>
          <button className="sidebar-logout-btn" onClick={handleLogout}>
            <LogOut size={16} /> <span className="btn-label">Sign Out</span>
          </button>
        </div>
      </aside>
      <main className="dashboard-main">
        {children}
      </main>
      </div>
    </div>
  );
}
