import React, { useEffect, useState, useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Package, DollarSign, Settings, Menu, X, LogOut, Shield, AlertCircle } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import '../dashboard.css';

export default function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingDisputes, setPendingDisputes] = useState(0);
  const { user, logout, API_URL, token } = useContext(AuthContext);
  const navigate = useNavigate();

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
      <button
        type="button"
        className="sidebar-toggle"
        aria-label="Open admin navigation"
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
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 10, padding: '4px 12px', borderRadius: 6,
            background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)'
          }}>
            <Shield size={12} color="#f97316" />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: 1 }}>Admin Portal</span>
          </div>
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
          <NavLink to="/admin" end onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <LayoutDashboard /> Dashboard
          </NavLink>
          <NavLink to="/admin/users" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <Users /> Users
          </NavLink>
          <NavLink to="/admin/leads" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <Package /> Leads
          </NavLink>
          <NavLink to="/admin/revenue" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <DollarSign /> Revenue
          </NavLink>
          <NavLink to="/admin/disputes" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AlertCircle size={18} /> Disputes
              </div>
              {pendingDisputes > 0 && (
                <span style={{ 
                  background: '#ef4444', color: '#fff', fontSize: 10, 
                  fontWeight: 800, padding: '2px 6px', borderRadius: 10,
                  minWidth: 18, textAlign: 'center'
                }}>{pendingDisputes}</span>
              )}
            </div>
          </NavLink>
          <NavLink to="/admin/pricing" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <DollarSign /> Pricing Rules
          </NavLink>
          <NavLink to="/admin/settings" onClick={() => setSidebarOpen(false)} className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            <Settings /> Settings
          </NavLink>
        </nav>

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
