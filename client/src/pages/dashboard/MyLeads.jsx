import { useState, useEffect, useContext, useCallback } from 'react';
import {
  ArrowRight, Truck, Calendar, Phone, Mail, StickyNote,
  Briefcase, ChevronDown, ChevronUp, DollarSign, Search
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';

const STATUSES = ['New', 'Contacted', 'Quoted', 'Booked', 'Lost'];

const STATUS_META = {
  New:       { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  Contacted: { color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' },
  Quoted:    { color: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
  Booked:    { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  Lost:      { color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
};

function RouteCell({ originZip, originCity, destZip, destCity }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', lineHeight: 1.2 }}>{originZip}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.2 }}>{originCity}</div>
      </div>
      <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', lineHeight: 1.2 }}>{destZip}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.2 }}>{destCity}</div>
      </div>
    </div>
  );
}

function Pill({ icon, label, bg = '#f1f5f9', color = '#64748b' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 9999,
      background: bg, color, fontSize: 11, fontWeight: 600,
    }}>
      {icon}{label}
    </span>
  );
}

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.New;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
    }}>
      {status}
    </span>
  );
}

function ExpandedPanel({ purchase, onUpdate, onClose }) {
  const [notes, setNotes]   = useState(purchase.crmNotes || '');
  const [status, setStatus] = useState(purchase.crmStatus || 'New');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const { API_URL, token }  = useContext(AuthContext);
  const lead = purchase.lead;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/leads/${lead._id}/crm-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ crmStatus: status, crmNotes: notes }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(purchase._id, updated.crmStatus, updated.crmNotes);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td colSpan={6} style={{ padding: 0, background: '#fafbfc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* Left: contact info */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Contact Info
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 10, padding: '8px 12px', border: '1px solid #e2e8f0' }}>
                <Phone size={13} color="#94a3b8" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{lead?.customerName}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{lead?.customerPhone}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 10, padding: '8px 12px', border: '1px solid #e2e8f0' }}>
                <Mail size={13} color="#94a3b8" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{lead?.customerEmail}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>${purchase.pricePaid?.toFixed(2)} paid</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: CRM panel */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              CRM Status
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {STATUSES.map(s => {
                const m = STATUS_META[s];
                const active = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.15s',
                      background: active ? m.color : '#f1f5f9',
                      color: active ? '#fff' : '#64748b',
                      border: `1.5px solid ${active ? m.color : '#e2e8f0'}`,
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              <StickyNote size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Internal Notes
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Called, left voicemail. Quoted $1,500 for 3-bed."
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0',
                fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
                outline: 'none', color: '#0f172a', lineHeight: 1.5,
              }}
              onFocus={e => (e.target.style.borderColor = '#3b82f6')}
              onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '7px 18px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  background: saved ? '#16a34a' : 'linear-gradient(135deg,#f59e0b,#d97706)',
                  color: '#fff', transition: 'background 0.3s',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function LeadRow({ purchase, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const lead = purchase.lead;
  if (!lead) return null;

  const status = purchase.crmStatus || 'New';
  const moveDate = lead.moveDate ? new Date(lead.moveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        style={{
          cursor: 'pointer',
          background: expanded ? '#f0f9ff' : 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = '#f8fafc'; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
      >
        <td style={{ padding: '14px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <RouteCell
              originZip={lead.originZip}
              originCity={lead.originCity}
              destZip={lead.destinationZip}
              destCity={lead.destinationCity}
            />
            {(lead.isWarmTransfer || purchase.pricePaid >= 40) && (
              <div style={{ display: 'flex' }}>
                <span className="live-transfer-badge" style={{
                  fontSize: 11, fontWeight: 600,
                  background: 'linear-gradient(135deg,#ff4500,#c2340a)', color: '#fff',
                  padding: '3px 10px', borderRadius: 20, letterSpacing: 0.3,
                  display: 'flex', alignItems: 'center', gap: 4
                }}>
                  🔥 Live Transfer
                </span>
              </div>
            )}
          </div>
        </td>
        <td style={{ padding: '14px 12px' }}>
          <Pill
            icon={<Truck size={11} />}
            label={lead.homeSize}
          />
        </td>
        <td style={{ padding: '14px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}>
            <Calendar size={12} color="#94a3b8" />
            {moveDate}
          </div>
        </td>
        <td style={{ padding: '14px 12px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'Poppins, sans-serif' }}>
            ${purchase.pricePaid?.toFixed(2)}
          </span>
        </td>
        <td style={{ padding: '14px 12px' }}>
          <StatusPill status={status} />
        </td>
        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
          <span style={{ color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </td>
      </tr>
      {expanded && (
        <ExpandedPanel
          purchase={purchase}
          onUpdate={onUpdate}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}

export default function MyLeads() {
  const { API_URL, token } = useContext(AuthContext);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    fetch(`${API_URL}/purchases`, { headers: { 'x-auth-token': token } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPurchases(data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [API_URL, token]);

  const handleUpdate = useCallback((purchaseId, crmStatus, crmNotes) => {
    setPurchases(prev => prev.map(p =>
      p._id === purchaseId ? { ...p, crmStatus, crmNotes } : p
    ));
  }, []);

  const filtered = purchases.filter(p => {
    const l = p.lead;
    if (!l) return false;
    if (statusFilter !== 'All' && (p.crmStatus || 'New') !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.originCity?.toLowerCase().includes(q) ||
        l.destinationCity?.toLowerCase().includes(q) ||
        l.customerName?.toLowerCase().includes(q) ||
        l.originZip?.includes(q) ||
        l.destinationZip?.includes(q)
      );
    }
    return true;
  });

  const statusCounts = STATUSES.reduce((acc, s) => {
    acc[s] = purchases.filter(p => (p.crmStatus || 'New') === s).length;
    return acc;
  }, {});

  return (
    <DashboardLayout>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Briefcase size={22} color="#ea580c" />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', fontFamily: 'Poppins, sans-serif' }}>
            My Leads
          </h1>
          <span style={{
            background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa',
            borderRadius: 9999, fontSize: 12, fontWeight: 700,
            padding: '2px 10px', marginLeft: 4,
          }}>
            {purchases.length} total
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
          Track and manage every lead you've purchased
        </p>
      </div>

      {/* Status summary pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setStatusFilter('All')}
          style={{
            padding: '6px 14px', borderRadius: 9999, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', border: '1.5px solid',
            background: statusFilter === 'All' ? '#0f172a' : '#f1f5f9',
            color: statusFilter === 'All' ? '#fff' : '#64748b',
            borderColor: statusFilter === 'All' ? '#0f172a' : '#e2e8f0',
          }}
        >
          All ({purchases.length})
        </button>
        {STATUSES.map(s => {
          const m = STATUS_META[s];
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 14px', borderRadius: 9999, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', border: '1.5px solid',
                background: active ? m.color : m.bg,
                color: active ? '#fff' : m.color,
                borderColor: active ? m.color : m.border,
              }}
            >
              {s} ({statusCounts[s]})
            </button>
          );
        })}
      </div>

      {/* White card container */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}>
        {/* Search toolbar */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <Search size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search by city, ZIP, or customer name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 13, color: '#0f172a', background: 'transparent',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}
            >
              ✕
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>
            Loading your leads…
          </div>
        ) : purchases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <DollarSign size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>You haven't purchased any leads yet.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>
            No leads match your search.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Route', 'Size', 'Move Date', 'Paid', 'Status', ''].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: i === 0 ? '11px 20px' : i === 5 ? '11px 20px' : '11px 12px',
                        textAlign: i === 5 ? 'right' : 'left',
                        fontSize: 10, fontWeight: 700, color: '#94a3b8',
                        textTransform: 'uppercase', letterSpacing: 0.5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((purchase, idx) => (
                  <LeadRow
                    key={purchase._id}
                    purchase={purchase}
                    onUpdate={handleUpdate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <style>{`
        @keyframes livePulse {
          0%, 100% { box-shadow: 0 0 4px rgba(255,69,0,0.6); }
          50%       { box-shadow: 0 0 12px rgba(255,69,0,0.9); }
        }
        .live-transfer-badge { animation: livePulse 2s ease-in-out infinite; }
      `}</style>
    </DashboardLayout>
  );
}
