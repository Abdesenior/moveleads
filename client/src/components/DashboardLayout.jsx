import React, { useEffect, useState, useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, CreditCard, User, Settings, Menu, X, LogOut, Package, Briefcase } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import ImpersonationBanner from './ImpersonationBanner';
import '../dashboard.css';

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

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

  const initials = user?.companyName
    ? user.companyName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'ML';

  return (
    <div className={`dashboard-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <ImpersonationBanner />
      <button
        type="button"
        className="sidebar-toggle"
        aria-label="Open navigation"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu size={22} />
      </button>

      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className="sidebar" aria-hidden={!sidebarOpen}>
        <div className="logo-container">
          <div className="logo" style={{ fontSize: '24px', fontFamily: 'Poppins' }}>
            <span style={{ fontWeight: 800, color: '#fff' }}>MoveLeads</span>
            <span style={{ fontWeight: 800, color: '#f97316' }}>.io</span>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-close"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        >
          <X size={22} />
        </button>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" end onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <LayoutDashboard /> Overview
          </NavLink>
          <NavLink to="/dashboard/leads" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <Package /> Leads
          </NavLink>
          <NavLink to="/dashboard/my-leads" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <Briefcase /> My Leads
          </NavLink>
          <NavLink to="/dashboard/customers" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <Users /> Customers
          </NavLink>
          <NavLink to="/dashboard/billing" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <CreditCard /> Billing
          </NavLink>
          <NavLink to="/dashboard/profile" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <User /> Profile
          </NavLink>
          <NavLink to="/dashboard/settings" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <Settings /> Settings
          </NavLink>
        </nav>

        <div className="sidebar-user-section">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar">{initials}</div>
            <div>
              <div className="sidebar-user-name">{user?.companyName || 'My Company'}</div>
              <div className="sidebar-user-role">Moving Company</div>
            </div>
          </div>
          <button className="sidebar-logout-btn" onClick={handleLogout}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        {children}
      </main>
    </div>
  );
}
