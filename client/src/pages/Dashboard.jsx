import React, { useState, useEffect, useContext } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart
} from 'recharts';
import {
  Wallet, ShoppingBag, Trophy, TrendingDown,
  ArrowUpCircle, Clock, Plus, Zap, MapPin, Truck,
  AlertTriangle, ChevronRight
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

/* ── helpers ──────────────────────────────────────────────── */
const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const cleanDesc = (desc = '') => desc.replace(/\s*\(Session:.*?\)/gi, '').trim();

const daysAgoLabel = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return '1 day ago';
  return `${diff} days ago`;
};

const urgencyBadge = (moveDateStr) => {
  if (!moveDateStr) return null;
  const days = Math.ceil((new Date(moveDateStr) - Date.now()) / 86400000);
  if (days <= 0) return { label: 'Moving today!', color: '#ef4444', bg: '#fef2f2' };
  if (days <= 2) return { label: `Moving in ${days}d!`, color: '#ef4444', bg: '#fef2f2' };
  if (days <= 5) return { label: `${days} days left`, color: '#f59e0b', bg: '#fffbeb' };
  return null;
};

/* ── Glassmorphism KPI card ───────────────────────────────── */
function KpiCard({ title, value, sub, icon, accent, cta, onCta, loading }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      border: '1px solid rgba(255,255,255,0.9)',
      borderRadius: 20,
      padding: '26px 28px',
      boxShadow: '0 4px 24px rgba(15,23,42,0.07), 0 1px 4px rgba(15,23,42,0.04)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      position: 'relative',
      overflow: 'hidden',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 36px rgba(15,23,42,0.12)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(15,23,42,0.07), 0 1px 4px rgba(15,23,42,0.04)'; }}
    >
      {/* accent glow */}
      <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`, pointerEvents: 'none' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, flexShrink: 0 }}>
          {icon}
        </div>
      </div>

      <div style={{ fontSize: 34, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins', sans-serif", lineHeight: 1, letterSpacing: '-1px' }}>
        {loading ? <span style={{ display: 'inline-block', width: 80, height: 32, borderRadius: 8, background: '#f1f5f9', animation: 'pulse 1.4s ease infinite' }} /> : value}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: -4 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>{sub}</span>
        {cta && (
          <button onClick={onCta} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)`,
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '6px 14px', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
            boxShadow: `0 4px 12px ${accent}44`
          }}>
            <Plus size={13} /> {cta}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Custom recharts tooltip ──────────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0f172a', color: '#fff', borderRadius: 12,
      padding: '10px 16px', fontSize: 13, fontWeight: 600,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
    }}>
      <div style={{ color: '#94a3b8', marginBottom: 4, fontSize: 11 }}>{label}</div>
      <div style={{ color: '#4ade80' }}>{payload[0].value} leads</div>
    </div>
  );
};

/* ── Urgency badge ────────────────────────────────────────── */
function UrgencyBadge({ moveDate }) {
  const badge = urgencyBadge(moveDate);
  if (!badge) return null;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 8,
      color: badge.color, background: badge.bg, display: 'inline-flex',
      alignItems: 'center', gap: 4, flexShrink: 0
    }}>
      <AlertTriangle size={10} /> {badge.label}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { API_URL, token, user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [kpi, setKpi] = useState({ balance: 0, totalPurchased: 0, jobsWon: 0, totalSpend: 0 });
  const [chartData, setChartData] = useState([]);
  const [availableLeads, setAvailableLeads] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const h = { 'x-auth-token': token };
        const [purchasesRes, txRes, leadsRes] = await Promise.all([
          fetch(`${API_URL}/purchases`, { headers: h }),
          fetch(`${API_URL}/billing/transactions`, { headers: h }),
          fetch(`${API_URL}/leads`, { headers: h }),
        ]);

        const purchases = await purchasesRes.json();
        const transactions = await txRes.json();
        const allLeads = await leadsRes.json();

        // KPIs
        const totalSpend = Array.isArray(purchases)
          ? purchases.reduce((s, p) => s + (p.pricePaid || p.price || 0), 0) : 0;
        const jobsWon = Array.isArray(purchases)
          ? purchases.filter(p => p.crmStatus === 'Booked').length : 0;

        setKpi({
          balance: user?.balance ?? 0,
          totalPurchased: Array.isArray(purchases) ? purchases.length : 0,
          jobsWon,
          totalSpend,
        });

        // Line chart — purchases per day for last 7 days
        const days = [...Array(7)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return d;
        });
        const chartArr = days.map(d => {
          const key = d.toISOString().split('T')[0];
          const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
          const count = Array.isArray(purchases)
            ? purchases.filter(p => (p.purchasedAt || p.createdAt || '').startsWith(key)).length
            : 0;
          return { label, count };
        });
        setChartData(chartArr);

        // Available leads for the quick-view table
        const available = Array.isArray(allLeads)
          ? allLeads.filter(l => l.status === 'Available' || l.status === 'READY_FOR_DISTRIBUTION').slice(0, 8)
          : [];
        setAvailableLeads(available);

        // Recent activity
        setActivity(Array.isArray(transactions) ? transactions.slice(0, 5) : []);
      } catch (err) {
        console.error('[Dashboard]', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [API_URL, token, user?.balance]);

  const kpiCards = [
    {
      title: 'Current Balance',
      value: `$${(kpi.balance ?? 0).toFixed(2)}`,
      sub: 'Available credits',
      icon: <Wallet size={18} />,
      accent: '#22c55e',
      cta: 'Top Up',
      onCta: () => navigate('/dashboard/billing'),
    },
    {
      title: 'Leads Purchased',
      value: kpi.totalPurchased,
      sub: 'All time',
      icon: <ShoppingBag size={18} />,
      accent: '#3b82f6',
    },
    {
      title: 'Jobs Won',
      value: kpi.jobsWon,
      sub: 'Marked as Booked',
      icon: <Trophy size={18} />,
      accent: '#f59e0b',
    },
    {
      title: 'Total Spend',
      value: `$${(kpi.totalSpend ?? 0).toFixed(2)}`,
      sub: 'Lifetime investment',
      icon: <TrendingDown size={18} />,
      accent: '#8b5cf6',
    },
  ];

  return (
    <DashboardLayout>
      {/* ── Page header ───────────────────────────────── */}
      <header className="dashboard-header" style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Poppins', margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#0f172a' }}>
          {getGreeting()}{user?.companyName ? `, ${user.companyName.split(' ')[0]}` : ''} 👋
        </h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Here's your real-time business overview</p>
      </header>

      {/* ── KPI row ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, marginBottom: 24 }}>
        {kpiCards.map((c, i) => <KpiCard key={i} loading={loading} {...c} />)}
      </div>

      {/* ── Chart + Activity ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 18, marginBottom: 24 }}>

        {/* Line chart */}
        <div style={{
          background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(18px)',
          border: '1px solid rgba(255,255,255,0.9)', borderRadius: 20,
          padding: '24px 28px',
          boxShadow: '0 4px 24px rgba(15,23,42,0.07)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>Lead Volume</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>Your purchases — last 7 days</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '5px 12px', borderRadius: 8, letterSpacing: '0.04em' }}>
              LAST 7 DAYS
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5} fill="url(#areaGrad)" dot={{ fill: '#3b82f6', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#3b82f6' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Recent activity */}
        <div style={{
          background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(18px)',
          border: '1px solid rgba(255,255,255,0.9)', borderRadius: 20,
          padding: '24px 24px',
          boxShadow: '0 4px 24px rgba(15,23,42,0.07)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>Recent Activity</h3>
            <button onClick={() => navigate('/dashboard/billing')} style={{ background: 'none', border: 'none', fontSize: 12, color: '#3b82f6', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ChevronRight size={13} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} style={{ height: 52, borderRadius: 10, background: '#f1f5f9', marginBottom: 8, animation: 'pulse 1.4s ease infinite' }} />
              ))
            ) : activity.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>
                <Clock size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
                <p style={{ margin: 0 }}>No activity yet</p>
              </div>
            ) : activity.map(tx => (
              <div key={tx._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: tx.type === 'Credit Deposit' ? '#f0fdf4' : '#eff6ff', color: tx.type === 'Credit Deposit' ? '#16a34a' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {tx.type === 'Credit Deposit' ? <ArrowUpCircle size={16} /> : <ShoppingBag size={16} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cleanDesc(tx.description)}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{daysAgoLabel(tx.date)}</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, color: tx.type === 'Credit Deposit' ? '#16a34a' : '#0f172a', background: tx.type === 'Credit Deposit' ? '#f0fdf4' : '#f8fafc', padding: '3px 9px', borderRadius: 8 }}>
                  {tx.type === 'Credit Deposit' ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Available Leads Table ─────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.9)', borderRadius: 20,
        boxShadow: '0 4px 24px rgba(15,23,42,0.07)', overflow: 'hidden'
      }}>
        <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={15} color="#f59e0b" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>Available Leads</h3>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>Live marketplace — act fast</p>
            </div>
          </div>
          <button onClick={() => navigate('/dashboard/leads')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: 'linear-gradient(135deg, #0a192f 0%, #1e3a5f 100%)',
            color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Poppins',sans-serif"
          }}>
            View Live Feed <ChevronRight size={13} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>Loading leads...</div>
        ) : availableLeads.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
            <Zap size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p style={{ margin: 0, fontSize: 14 }}>No available leads right now — check back soon.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Route', 'Est. Size', 'Distance', 'Move Date', 'Urgency', 'Price'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {availableLeads.map((lead, i) => {
                const badge = urgencyBadge(lead.moveDate);
                return (
                  <tr key={lead._id} style={{ borderTop: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Truck size={14} color="#3b82f6" />
                        </div>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>{lead.originCity} → {lead.destinationCity}</p>
                          <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{lead.originZip} → {lead.destinationZip}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{lead.homeSize || '—'}</span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b' }}>
                        <MapPin size={12} />
                        <span>{lead.distance || '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px', color: '#64748b' }}>
                      {lead.moveDate ? new Date(lead.moveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {badge ? (
                        <UrgencyBadge moveDate={lead.moveDate} />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', background: '#f0fdf4', padding: '3px 9px', borderRadius: 8 }}>Flexible</span>
                      )}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>${lead.price || 25}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </DashboardLayout>
  );
}
