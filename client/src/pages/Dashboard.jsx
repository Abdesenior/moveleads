import React, { useState, useEffect, useContext } from 'react';
import { TrendingUp, ArrowUpCircle, ShoppingBag, CreditCard, Clock, Zap, Target, BarChart3 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { AuthContext } from '../context/AuthContext';

const cleanDescription = (desc) => {
  if (!desc) return '';
  return desc.replace(/\s*\(Session:.*?\)/gi, '').trim();
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function Dashboard() {
  const { API_URL, token, user } = useContext(AuthContext);
  const [stats, setStats] = useState({ monthlyLeads: 0, monthlySpend: 0, conversionRate: 0, totalLeads: 0 });
  const [chartData, setChartData] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = { 'x-auth-token': token };
        const [purchasesRes, txRes, totalLeadsRes] = await Promise.all([
          fetch(`${API_URL}/purchases`, { headers }),
          fetch(`${API_URL}/billing/transactions`, { headers }),
          fetch(`${API_URL}/leads`, { headers })
        ]);
        
        const purchases = await purchasesRes.json();
        const transactions = await txRes.json();
        const allLeads = await totalLeadsRes.json();

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const thisMonthPurchases = purchases.filter(p => {
          const d = new Date(p.createdAt);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        const monthlySpend = thisMonthPurchases.reduce((acc, p) => acc + p.price, 0);
        const availableCount = allLeads.filter(l => l.status === 'Available').length;
        const totalOpportunities = purchases.length + availableCount;
        const conversion = totalOpportunities > 0 ? (purchases.length / totalOpportunities) * 100 : 0;

        setStats({
          monthlyLeads: thisMonthPurchases.length,
          monthlySpend,
          conversionRate: conversion.toFixed(1),
          totalLeads: availableCount
        });

        const days = [...Array(7)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          return d.toISOString().split('T')[0];
        }).reverse();

        const data = days.map(day => {
          const count = purchases.filter(p => p.createdAt.startsWith(day)).length;
          return { day: day.split('-').slice(1).join('/'), count };
        });
        setChartData(data);

        if (transactions.length >= 0) setActivity(transactions.slice(0, 6));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [API_URL, token]);

  if (loading) return (
    <DashboardLayout>
      <div style={{ padding: '60px 40px', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid #f1f5f9', borderTopColor: '#f97316', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
        <p style={{ color: '#64748b', fontSize: 15 }}>Loading dashboard analytics...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </DashboardLayout>
  );

  const maxVal = Math.max(...chartData.map(d => d.count), 1);

  const statCards = [
    { title: 'Monthly Leads', value: stats.monthlyLeads, desc: 'Purchased this month', icon: <ShoppingBag size={20} />, color: '#3b82f6', bg: '#eff6ff' },
    { title: 'Monthly Spend', value: `$${stats.monthlySpend.toFixed(2)}`, desc: 'Investment this month', icon: <CreditCard size={20} />, color: '#22c55e', bg: '#f0fdf4' },
    { title: 'Conversion Rate', value: `${stats.conversionRate}%`, desc: 'Leads vs marketplace', icon: <Target size={20} />, color: '#8b5cf6', bg: '#f5f3ff' },
    { title: 'Available Leads', value: stats.totalLeads, desc: 'Waiting in marketplace', icon: <Zap size={20} />, color: '#f59e0b', bg: '#fffbeb', valueColor: '#f59e0b' }
  ];

  return (
    <DashboardLayout>
      <header className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontFamily: 'Poppins', margin: 0 }}>
            {getGreeting()}{user?.companyName ? `, ${user.companyName.split(' ')[0]}` : ''} 👋
          </h1>
        </div>
        <p>Here's your real-time business analytics</p>
      </header>

      <div className="stats-grid">
        {statCards.map((card, i) => (
          <div key={i} className="stat-card" style={{ animationDelay: `${i * 0.08}s` }}>
            <div className="stat-header">
              <span className="stat-title">{card.title}</span>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: card.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: card.color
              }}>{card.icon}</div>
            </div>
            <div className="stat-value" style={{ color: card.valueColor || 'var(--bg-navy)' }}>{card.value}</div>
            <span className="stat-desc">{card.desc}</span>
          </div>
        ))}
      </div>

      <div className="dashboard-content-grid">
        <div className="panel" style={{ flex: 1.5 }}>
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart3 size={16} color="#22c55e" />
              </div>
              <span>Purchase Analytics</span>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 600, color: '#64748b',
              background: '#f1f5f9', padding: '5px 12px', borderRadius: 8
            }}>Last 7 Days</span>
          </div>
          
          <div style={{ padding: '32px 16px 16px', height: '260px', display: 'flex', alignItems: 'flex-end', gap: '16px' }}>
            {chartData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ 
                  width: '100%', 
                  maxWidth: '48px',
                  background: d.count > 0 ? 'linear-gradient(180deg, #4ade80 0%, #16a34a 100%)' : '#f1f5f9',
                  height: d.count > 0 ? `${Math.max((d.count / maxVal) * 100, 8)}%` : '4px',
                  borderRadius: '10px 10px 4px 4px',
                  transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  position: 'relative',
                  boxShadow: d.count > 0 ? '0 4px 12px rgba(22, 163, 74, 0.2)' : 'none'
                }}>
                  {d.count > 0 && <span style={{ position: 'absolute', top: '-24px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', fontWeight: 800, color: '#15803d', background: '#f0fdf4', padding: '1px 6px', borderRadius: 6 }}>{d.count}</span>}
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={16} color="#3b82f6" />
            </div>
            <span>Recent Activity</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {activity.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#94a3b8' }}>
                  <Clock size={22} />
                </div>
                <p style={{ color: '#94a3b8', fontSize: 14 }}>No recent activity yet.</p>
              </div>
            ) : activity.map(tx => (
              <div key={tx._id} style={{
                padding: '14px 0',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s'
              }}>
                <div style={{ 
                  width: 40, height: 40,
                  borderRadius: 12,
                  background: tx.type === 'Credit Deposit' ? '#f0fdf4' : '#eff6ff',
                  color: tx.type === 'Credit Deposit' ? '#16a34a' : '#3b82f6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {tx.type === 'Credit Deposit' ? <ArrowUpCircle size={18} /> : <ShoppingBag size={18} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, margin: 0, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cleanDescription(tx.description)}
                  </h4>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={10} /> {new Date(tx.date).toLocaleDateString()}
                  </p>
                </div>
                <span style={{
                  fontSize: '14px', fontWeight: 700,
                  color: tx.type === 'Credit Deposit' ? '#16a34a' : '#0f172a',
                  flexShrink: 0,
                  background: tx.type === 'Credit Deposit' ? '#f0fdf4' : '#f8fafc',
                  padding: '4px 10px', borderRadius: 8
                }}>
                  {tx.type === 'Credit Deposit' ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
