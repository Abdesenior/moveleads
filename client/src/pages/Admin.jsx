import React, { useState, useEffect, useContext, useCallback } from 'react';
import { TrendingUp, Plus, UserX, DollarSign, Package, Users, UserPlus, ArrowUpRight, Clock } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { AuthContext } from '../context/AuthContext';

const cleanDescription = (desc) => {
  if (!desc) return '';
  return desc.replace(/\s*\(Session:.*?\)/gi, '').trim();
};

export default function Admin() {
  const { API_URL, token } = useContext(AuthContext);
  const [stats, setStats] = useState({
    todayRevenue: 0,
    activeMovers: 0,
    leadVolume: { ingested: 0, sold: 0 },
    stripeBalance: 0
  });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAdminData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const headers = { 'x-auth-token': token };
      
      const [statsRes, txRes] = await Promise.all([
        fetch(`${API_URL}/admin/stats`, { headers }),
        fetch(`${API_URL}/billing/transactions`, { headers })
      ]);
      
      const statsData = await statsRes.json();
      const txs = await txRes.json();

      if (statsRes.ok) setStats(statsData);
      if (Array.isArray(txs)) setTransactions(txs.slice(0, 8));
      
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [API_URL, token]);

  useEffect(() => {
    fetchAdminData();
    
    // Poll every 60 seconds for real-time updates
    const interval = setInterval(() => fetchAdminData(true), 60000);
    return () => clearInterval(interval);
  }, [fetchAdminData]);

  if (loading) return (
    <AdminLayout>
      <div style={{ padding: '60px 40px', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid #f1f5f9', borderTopColor: '#f97316', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
        <p style={{ color: '#64748b', fontSize: 15 }}>Loading platform overview...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  const statCards = [
    { 
      title: "Today's Revenue", 
      value: `$${stats.todayRevenue.toFixed(2)}`, 
      desc: 'Sum of purchases today', 
      icon: <DollarSign size={20} />, 
      color: '#22c55e', 
      bg: '#f0fdf4',
      gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
    },
    { 
      title: 'Active Movers', 
      value: stats.activeMovers, 
      desc: 'Movers with active balance', 
      icon: <Users size={20} />, 
      color: '#3b82f6', 
      bg: '#eff6ff',
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
    },
    { 
      title: 'Lead Volume', 
      value: `${stats.leadVolume.sold}/${stats.leadVolume.ingested}`, 
      desc: 'Sold vs. Ingested (Today)', 
      icon: <TrendingUp size={20} />, 
      color: '#f59e0b', 
      bg: '#fffbeb',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
    },
    { 
      title: 'Stripe Balance', 
      value: `$${stats.stripeBalance.toFixed(2)}`, 
      desc: 'Available for payout', 
      icon: <ArrowUpRight size={20} />, 
      color: '#8b5cf6', 
      bg: '#f5f3ff',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
    }
  ];

  return (
    <AdminLayout>
      <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontFamily: 'Poppins' }}>Platform Overview</h1>
          <p>Real-time metrics and operations health</p>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </header>

      <div className="stats-grid">
        {statCards.map((card, i) => (
          <div key={i} className="stat-card" style={{ 
            background: '#fff',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: 0, left: 0, right: 0, height: 4, 
              background: card.gradient 
            }} />
            <div className="stat-header">
              <span className="stat-title" style={{ fontWeight: 600 }}>{card.title}</span>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: card.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: card.color
              }}>{card.icon}</div>
            </div>
            <div className="stat-value" style={{ fontSize: 28, fontWeight: 800 }}>{card.value}</div>
            <span className="stat-desc" style={{ color: '#94a3b8', fontSize: 12 }}>{card.desc}</span>
          </div>
        ))}
      </div>

      <div className="dashboard-content-grid">
        {/* Transactions Table */}
        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={16} color="#3b82f6" />
            </div>
            <span>Recent Transactions</span>
          </div>
          <table className="leads-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 && <tr><td colSpan="4" className="table-empty">No transactions yet.</td></tr>}
              {transactions.map(tx => (
                <tr key={tx._id}>
                  <td style={{ color: '#64748b', fontSize: 13 }}>{new Date(tx.date).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                        background: tx.type === 'Credit Deposit' ? '#f0fdf4' : '#eff6ff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {tx.type === 'Credit Deposit' ?
                          <DollarSign size={14} color="#16a34a" /> :
                          <Package size={14} color="#3b82f6" />
                        }
                      </div>
                      <div>
                        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{tx.type}</span>
                        <span style={{ display: 'block', fontSize: 12, color: '#94a3b8' }}>{cleanDescription(tx.description)}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{
                      fontWeight: 700, fontSize: 13,
                      color: tx.amount > 0 ? '#16a34a' : '#0f172a',
                      background: tx.amount > 0 ? '#f0fdf4' : '#f8fafc',
                      padding: '4px 10px', borderRadius: 8
                    }}>
                      {tx.amount > 0 ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                    </span>
                  </td>
                  <td><span className="badge purchased" style={{ fontSize: 10 }}>{tx.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Quick Actions */}
        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} color="#f97316" />
            </div>
            <span>Quick Actions</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={() => window.location.href = '/admin/leads'} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#fff', border: 'none', borderRadius: 14, padding: '18px 22px',
              fontSize: 14, fontWeight: 700, fontFamily: "'Poppins', sans-serif",
              cursor: 'pointer', transition: 'all 0.25s',
              boxShadow: '0 4px 16px rgba(245,158,11,0.3)'
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={18} />
              </div>
              Add New Lead
              <ArrowUpRight size={14} style={{ marginLeft: 'auto', opacity: 0.7 }} />
            </button>

            <button onClick={() => window.location.href = '/admin/users'} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: '#fff', color: '#0f172a',
              border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px 22px',
              fontSize: 14, fontWeight: 600, fontFamily: "'Poppins', sans-serif",
              cursor: 'pointer', transition: 'all 0.25s'
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={16} color="#3b82f6" />
              </div>
              Manage Users
              <ArrowUpRight size={14} style={{ marginLeft: 'auto', opacity: 0.4 }} />
            </button>

            <button onClick={() => window.location.href = '/admin/revenue'} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: '#fff', color: '#0f172a',
              border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px 22px',
              fontSize: 14, fontWeight: 600, fontFamily: "'Poppins', sans-serif",
              cursor: 'pointer', transition: 'all 0.25s'
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={16} color="#22c55e" />
              </div>
              Revenue Details
              <ArrowUpRight size={14} style={{ marginLeft: 'auto', opacity: 0.4 }} />
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
