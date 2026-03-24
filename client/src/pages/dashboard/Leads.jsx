import React, { useState, useEffect, useContext } from 'react';
import {
  ArrowRight, Truck, Clock, Search, ShoppingBag,
  X, CheckCircle, User, Phone as PhoneIcon, MapPin,
  Zap, Filter, MessageSquare, Calendar, Lock, ChevronRight,
  Star
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import TablePagination from '../../components/ui/TablePagination';
import TableSkeleton from '../../components/ui/TableSkeleton';

/* ── helpers ─────────────────────────────────────────── */
const timeAgo = (dateStr) => {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const urgency = (moveDateStr) => {
  if (!moveDateStr) return null;
  const days = Math.ceil((new Date(moveDateStr) - Date.now()) / 86400000);
  if (days <= 0) return { label: 'Today!',      color: '#ef4444', bg: '#fef2f2' };
  if (days <= 2) return { label: `${days}d left`, color: '#ef4444', bg: '#fef2f2' };
  if (days <= 5) return { label: `${days}d left`, color: '#f59e0b', bg: '#fffbeb' };
  return null;
};

const truckSuggestion = (homeSize) => {
  if (!homeSize) return '20–22 ft truck';
  const s = homeSize.toLowerCase();
  if (s.includes('studio') || s.includes('1 bed')) return '10–12 ft truck';
  if (s.includes('2 bed')) return '14–17 ft truck';
  if (s.includes('3 bed')) return '20–22 ft truck';
  return '24–26 ft truck';
};

/* ── Pill badge ──────────────────────────────────────── */
function Pill({ icon, label, color = '#475569', bg = '#f1f5f9' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 9999,
      background: bg, color, fontSize: 12, fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {icon} {label}
    </span>
  );
}

/* ── Visual route cell ───────────────────────────────── */
function RouteCell({ lead }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', lineHeight: 1.2 }}>
          {lead.originZip || '—'}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{lead.originCity}</div>
      </div>
      <ArrowRight size={14} color="#cbd5e1" strokeWidth={2.5} style={{ flexShrink: 0 }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', lineHeight: 1.2 }}>
          {lead.destinationZip || '—'}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{lead.destinationCity}</div>
      </div>
    </div>
  );
}

/* ── Deep Dive Detail Modal ──────────────────────────── */
function LeadDetailModal({ lead, user, onClose, onBuy }) {
  const badge = urgency(lead.moveDate);
  const truck = truckSuggestion(lead.homeSize);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,25,47,0.65)',
      backdropFilter: 'blur(10px)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      animation: 'mlFadeIn 0.2s ease',
    }}>
      <div style={{
        background: '#fff', borderRadius: 22, width: '100%', maxWidth: 680,
        overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.22)',
        animation: 'mlScaleIn 0.28s cubic-bezier(0.16,1,0.3,1)',
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg,#0f172a,#1e3a5f)',
          padding: '22px 28px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: '-30%', right: '-6%', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle,rgba(234,88,12,0.18),transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: 9999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                  <Zap size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />Live Lead
                </span>
                {badge && (
                  <span style={{ background: badge.bg, color: badge.color, borderRadius: 9999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                    {badge.label}
                  </span>
                )}
              </div>
              <h2 style={{ color: '#fff', fontSize: 19, fontWeight: 800, margin: 0, fontFamily: "'Poppins',sans-serif" }}>
                {lead.originCity} → {lead.destinationCity}
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, margin: '3px 0 0' }}>Listed {timeAgo(lead.createdAt)}</p>
            </div>
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Two-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

          {/* ── Left: Logistics ── */}
          <div style={{ padding: '24px 24px', borderRight: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>
              Logistics
            </div>

            {/* Visual route */}
            <div style={{ background: '#f8fafc', borderRadius: 14, padding: '16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                {/* Origin */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Origin</div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', fontFamily: "'Poppins',sans-serif", lineHeight: 1 }}>{lead.originZip || '—'}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{lead.originCity}</div>
                </div>

                {/* Arrow */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 12px' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ArrowRight size={14} color="#64748b" strokeWidth={2.5} />
                  </div>
                  <div style={{ width: 1, height: 0, background: '#e2e8f0' }} />
                </div>

                {/* Destination */}
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Destination</div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', fontFamily: "'Poppins',sans-serif", lineHeight: 1 }}>{lead.destinationZip || '—'}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{lead.destinationCity}</div>
                </div>
              </div>
            </div>

            {/* Info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Distance Type', value: lead.distance || 'N/A', icon: <MapPin size={14} color="#3b82f6" />, bg: '#eff6ff' },
                { label: 'Suggested Truck', value: truck, icon: <Truck size={14} color="#f97316" />, bg: '#fff7ed' },
                { label: 'Move Date', value: formatDate(lead.moveDate), icon: <Calendar size={14} color="#8b5cf6" />, bg: '#f5f3ff' },
                { label: 'Home Size', value: lead.homeSize || '—', icon: <ShoppingBag size={14} color="#16a34a" />, bg: '#f0fdf4' },
              ].map(item => (
                <div key={item.label} style={{ background: item.bg, borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {item.icon}
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{item.label}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Customer Info (locked) + Purchase ── */}
          <div style={{ padding: '24px 24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>
              Customer Info
            </div>

            {/* Locked info */}
            <div style={{ background: '#f8fafc', borderRadius: 14, padding: '16px', marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(248,250,252,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, zIndex: 2, borderRadius: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Lock size={16} color="#94a3b8" />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Purchase to unlock</span>
              </div>
              <div style={{ opacity: 0.15 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#e2e8f0' }} />
                  <div>
                    <div style={{ height: 12, width: 100, background: '#cbd5e1', borderRadius: 6, marginBottom: 4 }} />
                    <div style={{ height: 10, width: 70, background: '#e2e8f0', borderRadius: 6 }} />
                  </div>
                </div>
                <div style={{ height: 10, width: '80%', background: '#e2e8f0', borderRadius: 6, marginBottom: 6 }} />
                <div style={{ height: 10, width: '60%', background: '#e2e8f0', borderRadius: 6 }} />
              </div>
            </div>

            {/* Call/SMS (disabled) */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button disabled style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#cbd5e1', fontSize: 12, fontWeight: 600, cursor: 'not-allowed' }}>
                <PhoneIcon size={14} /> Call
              </button>
              <button disabled style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#cbd5e1', fontSize: 12, fontWeight: 600, cursor: 'not-allowed' }}>
                <MessageSquare size={14} /> SMS
              </button>
            </div>

            {/* Price */}
            <div style={{ flex: 1 }} />
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Lead Price</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>
                  ${(lead.price || 25).toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Your Balance</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: (user?.balance ?? 0) >= (lead.price || 25) ? '#16a34a' : '#ef4444' }}>
                  ${(user?.balance ?? 0).toFixed(2)}
                </span>
              </div>
            </div>

            {(user?.balance ?? 0) < (lead.price || 25) && (
              <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>
                ⚠ Insufficient balance — add credits in Billing.
              </div>
            )}

            <button
              onClick={onBuy}
              disabled={(user?.balance ?? 0) < (lead.price || 25)}
              style={{
                width: '100%', padding: '13px', border: 'none', borderRadius: 12,
                fontWeight: 800, fontSize: 14, cursor: 'pointer',
                fontFamily: "'Poppins',sans-serif",
                background: 'linear-gradient(135deg,#ea580c,#c2410c)',
                color: '#fff', boxShadow: '0 4px 14px rgba(234,88,12,0.30)',
                opacity: (user?.balance ?? 0) < (lead.price || 25) ? 0.5 : 1,
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              <ShoppingBag size={15} /> Buy Lead — ${(lead.price || 25).toFixed(2)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════ */
export default function Leads() {
  const { API_URL, token, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [leads, setLeads]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [searchTerm, setSearchTerm]     = useState('');
  const [distanceFilter, setDistanceFilter] = useState('');
  const [detailLead, setDetailLead]     = useState(null);
  const [confirmLead, setConfirmLead]   = useState(null);
  const [purchasing, setPurchasing]     = useState(false);
  const [successData, setSuccessData]   = useState(null);
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(15);
  const [sortKey, setSortKey]           = useState('createdAt');
  const [sortDir, setSortDir]           = useState('desc');

  useEffect(() => { fetchLeads(); }, []);
  useEffect(() => { setPage(1); }, [searchTerm, distanceFilter, sortKey, sortDir]);

  const fetchLeads = async () => {
    try {
      const res  = await fetch(`${API_URL}/leads`, { headers: { 'x-auth-token': token } });
      const data = await res.json();
      if (Array.isArray(data)) {
        setLeads(data.filter(l => l.status === 'Available' || l.status === 'READY_FOR_DISTRIBUTION'));
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const purchaseLead = async (lead) => {
    setPurchasing(true);
    try {
      const res  = await fetch(`${API_URL}/leads/${lead._id}/claim`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Failed to purchase lead');
      setConfirmLead(null);
      setSuccessData({ lead: data.lead || lead });
      setLeads(prev => prev.filter(l => l._id !== lead._id));
    } catch (err) {
      alert(err.message);
    } finally {
      setPurchasing(false);
    }
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = leads.filter(l => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q ||
      l.originCity?.toLowerCase().includes(q) ||
      l.destinationCity?.toLowerCase().includes(q) ||
      l.originZip?.includes(q) || l.destinationZip?.includes(q);
    return matchSearch && (!distanceFilter || l.distance === distanceFilter);
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const v = (l) => {
      if (sortKey === 'price')     return Number(l.price || 0);
      if (sortKey === 'moveDate')  return new Date(l.moveDate).getTime() || 0;
      if (sortKey === 'createdAt') return new Date(l.createdAt).getTime() || 0;
      if (sortKey === 'homeSize')  return l.homeSize || '';
      return '';
    };
    const av = v(a); const bv = v(b);
    return (typeof av === 'number' ? (av - bv) : String(av).localeCompare(String(bv))) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe   = Math.min(page, totalPages);
  const paged      = sorted.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const SortBtn = ({ k, label }) => (
    <button type="button" onClick={() => toggleSort(k)} style={{
      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
      fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
      letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: 'inherit',
    }}>
      {label}
      {sortKey === k && <span style={{ color: '#ea580c' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );

  return (
    <DashboardLayout>

      {/* ── Page header ──────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>
            Live Leads Market
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
            Real-time, phone-verified homeowners moving in your area.
          </p>
        </div>
        {!loading && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#fff7ed', color: '#ea580c', border: '1.5px solid #fed7aa',
            borderRadius: 9999, padding: '7px 16px', fontSize: 13, fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            <Zap size={14} fill="#ea580c" /> {leads.length} Available
          </span>
        )}
      </div>

      {/* ── Filter bar ───────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap',
        background: '#fff', borderRadius: 14, padding: '14px 16px',
        border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
      }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
          <input
            type="text" placeholder="Search city, ZIP…" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 9px 9px 36px', borderRadius: 10, border: '1px solid #e2e8f0', outline: 'none', fontSize: 13, fontFamily: 'inherit', color: '#0f172a' }}
            onFocus={e => (e.target.style.borderColor = '#ea580c')}
            onBlur={e  => (e.target.style.borderColor = '#e2e8f0')}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={14} color="#94a3b8" />
          <select value={distanceFilter} onChange={e => setDistanceFilter(e.target.value)}
            style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', color: '#334155', outline: 'none', cursor: 'pointer' }}
            onFocus={e => (e.target.style.borderColor = '#ea580c')}
            onBlur={e  => (e.target.style.borderColor = '#e2e8f0')}
          >
            <option value="">All Distances</option>
            <option value="Local">Local</option>
            <option value="Long Distance">Long Distance</option>
          </select>
        </div>
      </div>

      {/* ── Data Grid ────────────────────────────────── */}
      <div style={{
        background: '#fff', borderRadius: 16,
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 12px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {[
                { key: null,         label: 'Route',     pl: 24 },
                { key: 'homeSize',   label: 'Est. Size',       },
                { key: 'moveDate',   label: 'Move Date',       },
                { key: 'createdAt',  label: 'Listed',          },
                { key: 'price',      label: 'Price',           },
                { key: null,         label: 'Action', pr: 24   },
              ].map(({ key, label, pl, pr }) => (
                <th key={label} style={{
                  padding: `12px ${pr ?? 12}px 12px ${pl ?? 12}px`,
                  textAlign: 'left',
                }}>
                  {key ? <SortBtn k={key} label={label} /> : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {label}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rowCount={pageSize} colCount={6} />
            ) : leads.length === 0 ? (
              /* Premium empty state */
              <tr>
                <td colSpan={6}>
                  <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff7ed', border: '2px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <Zap size={28} color="#ea580c" />
                    </div>
                    <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>
                      No live leads right now
                    </h3>
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8' }}>
                      New leads are verified and distributed in real-time.
                    </p>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9999, padding: '6px 14px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', animation: 'mlPulse 1.4s ease-in-out infinite', display: 'inline-block' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>Listening for new leads…</span>
                    </div>
                  </div>
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '56px 24px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  <Search size={32} style={{ opacity: 0.25, display: 'block', margin: '0 auto 10px' }} />
                  No leads match your filters.
                </td>
              </tr>
            ) : paged.map((lead) => {
              const badge = urgency(lead.moveDate);
              return (
                <tr
                  key={lead._id}
                  onClick={() => setDetailLead(lead)}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Route */}
                  <td style={{ padding: '14px 12px 14px 24px' }}>
                    <RouteCell lead={lead} />
                    <div style={{ marginTop: 5, display: 'flex', gap: 5 }}>
                      <Pill
                        icon={null}
                        label={lead.distance || 'N/A'}
                        bg={lead.distance === 'Local' ? '#f0fdf4' : '#fff7ed'}
                        color={lead.distance === 'Local' ? '#16a34a' : '#ea580c'}
                      />
                      {badge && <Pill label={badge.label} bg={badge.bg} color={badge.color} />}
                      {lead.grade === 'A' && (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 9999,
                          background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                          color: '#fff', fontSize: 11, fontWeight: 800,
                          boxShadow: '0 2px 6px rgba(234, 88, 12, 0.2)'
                        }}>
                          <Star size={11} fill="currentColor" /> Premium Lead
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Home size */}
                  <td style={{ padding: '14px 12px' }}>
                    <Pill icon={<Truck size={12} />} label={lead.homeSize || '—'} />
                  </td>

                  {/* Move date */}
                  <td style={{ padding: '14px 12px', fontSize: 13, color: '#475569', fontWeight: 500 }}>
                    {formatDate(lead.moveDate)}
                  </td>

                  {/* Time listed */}
                  <td style={{ padding: '14px 12px' }}>
                    <Pill
                      icon={<Clock size={12} />}
                      label={timeAgo(lead.createdAt)}
                      bg="#eff6ff" color="#3b82f6"
                    />
                  </td>

                  {/* Price */}
                  <td style={{ padding: '14px 12px' }}>
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>
                      ${(lead.price || 25).toFixed(2)}
                    </span>
                  </td>

                  {/* Action */}
                  <td style={{ padding: '14px 24px 14px 12px' }}>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setDetailLead(lead); }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'linear-gradient(135deg,#ea580c,#c2410c)',
                        color: '#fff', border: 'none', borderRadius: 9,
                        padding: '8px 14px', fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', fontFamily: "'Poppins',sans-serif",
                        boxShadow: '0 2px 8px rgba(234,88,12,0.30)',
                        whiteSpace: 'nowrap',
                      }}>
                      View <ChevronRight size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!loading && totalPages > 1 && (
          <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9' }}>
            <TablePagination
              page={pageSafe} totalPages={totalPages} pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={n => { setPageSize(n); setPage(1); }}
            />
          </div>
        )}
      </div>

      {/* ── Deep Dive Detail Modal ────────────────────── */}
      {detailLead && (
        <LeadDetailModal
          lead={detailLead}
          user={user}
          onClose={() => setDetailLead(null)}
          onBuy={() => { setDetailLead(null); setConfirmLead(detailLead); }}
        />
      )}

      {/* ── Purchase Confirmation Modal ───────────────── */}
      {confirmLead && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,25,47,0.65)',
          backdropFilter: 'blur(10px)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'mlFadeIn 0.2s ease',
        }}>
          <div style={{
            background: '#fff', borderRadius: 22, width: '100%', maxWidth: 440,
            overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.2)',
            animation: 'mlScaleIn 0.28s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', padding: '24px 28px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '-30%', right: '-8%', width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle,rgba(234,88,12,0.2),transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '0 0 3px', fontFamily: "'Poppins',sans-serif" }}>Confirm Purchase</h2>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, margin: 0 }}>Review before you buy</p>
                </div>
                <button onClick={() => setConfirmLead(null)} style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={{ padding: '24px 28px' }}>
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin size={18} color="#3b82f6" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{confirmLead.originCity} → {confirmLead.destinationCity}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{confirmLead.homeSize} • {confirmLead.distance} • {formatDate(confirmLead.moveDate)}</div>
                </div>
              </div>
              {[
                { label: 'Lead Price',      value: `$${(confirmLead.price||25).toFixed(2)}`, bold: true },
                { label: 'Current Balance', value: `$${(user?.balance??0).toFixed(2)}`,      color: '#16a34a' },
                { label: 'Balance After',   value: `$${((user?.balance??0)-(confirmLead.price||25)).toFixed(2)}`, color: (user?.balance??0)<(confirmLead.price||25)?'#ef4444':'#0f172a' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{r.label}</span>
                  <span style={{ fontSize: r.bold ? 17 : 13, fontWeight: r.bold ? 800 : 600, color: r.color||'#0f172a', fontFamily: r.bold ? "'Poppins',sans-serif" : 'inherit' }}>{r.value}</span>
                </div>
              ))}
              {(user?.balance??0) < (confirmLead.price||25) && (
                <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, marginTop: 12, textAlign: 'center' }}>
                  ⚠ Insufficient balance — top up in Billing.
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button onClick={() => setConfirmLead(null)} className="secondary-btn" style={{ flex: 1, padding: 12, justifyContent: 'center' }}>Cancel</button>
                <button
                  onClick={() => purchaseLead(confirmLead)}
                  disabled={purchasing || (user?.balance??0) < (confirmLead.price||25)}
                  style={{
                    flex: 2, padding: 12, border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 13,
                    cursor: 'pointer', fontFamily: "'Poppins',sans-serif",
                    background: 'linear-gradient(135deg,#ea580c,#c2410c)',
                    color: '#fff', boxShadow: '0 4px 14px rgba(234,88,12,0.3)',
                    opacity: purchasing||(user?.balance??0)<(confirmLead.price||25) ? 0.5 : 1,
                    transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  <ShoppingBag size={15} /> {purchasing ? 'Processing…' : 'Confirm Purchase'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Modal ─────────────────────────────── */}
      {successData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'mlFadeIn 0.25s ease' }}>
          <div style={{ background: '#fff', borderRadius: 22, padding: '36px 32px', width: '100%', maxWidth: 460, textAlign: 'center', boxShadow: '0 32px 80px rgba(0,0,0,0.2)', animation: 'mlScaleIn 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle size={34} color="#16a34a" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>Lead Unlocked!</h2>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>Contact details revealed. Reach out fast for the best chance to convert.</p>
            <div style={{ background: '#f8fafc', borderRadius: 14, padding: '18px 20px', marginBottom: 20, textAlign: 'left' }}>
              {[
                { icon: <User size={16} color="#3b82f6" />, bg: '#eff6ff', label: 'Customer', value: successData.lead?.customerName },
                { icon: <PhoneIcon size={16} color="#16a34a" />, bg: '#f0fdf4', label: 'Phone', value: successData.lead?.customerPhone },
                { icon: <MapPin size={16} color="#ea580c" />, bg: '#fff7ed', label: 'Route', value: `${successData.lead?.originCity} → ${successData.lead?.destinationCity}` },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.icon}</div>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{r.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{r.value || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setSuccessData(null); navigate('/dashboard/my-leads'); }} style={{ flex: 1, padding: 12, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Poppins',sans-serif" }}>View My Leads</button>
              <button onClick={() => setSuccessData(null)} style={{ flex: 1, padding: 12, background: 'linear-gradient(135deg,#ea580c,#c2410c)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Poppins',sans-serif", boxShadow: '0 4px 14px rgba(234,88,12,0.3)' }}>Keep Browsing</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes mlFadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes mlScaleIn { from { opacity:0; transform:scale(0.92) translateY(16px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes mlPulse   { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:0.4; transform:scale(0.85) } }
      `}</style>
    </DashboardLayout>
  );
}
