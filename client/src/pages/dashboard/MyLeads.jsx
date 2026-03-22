import { useState, useEffect, useContext, useCallback } from 'react';
import { MapPin, Phone, Mail, Calendar, Home, DollarSign, StickyNote, ChevronDown, ChevronUp } from 'lucide-react';
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

function LeadCard({ purchase, onUpdate }) {
  const [expanded, setExpanded]   = useState(false);
  const [notes, setNotes]         = useState(purchase.crmNotes || '');
  const [status, setStatus]       = useState(purchase.crmStatus || 'New');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const { API_URL, token }        = useContext(AuthContext);

  const lead = purchase.lead;
  if (!lead) return null;

  const meta = STATUS_META[status];

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
    <div style={{
      background: '#fff',
      border: `1.5px solid ${expanded ? meta.border : '#e2e8f0'}`,
      borderRadius: 14,
      marginBottom: 10,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
      boxShadow: expanded ? '0 4px 16px rgba(0,0,0,0.07)' : '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Card header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          padding: '14px 16px', cursor: 'pointer', display: 'flex',
          alignItems: 'center', gap: 12,
        }}
      >
        {/* Route icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MapPin size={16} color={meta.color} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {lead.originCity} → {lead.destinationCity}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            {lead.homeSize} · {new Date(lead.moveDate).toLocaleDateString()}
          </div>
        </div>

        {/* Status pill */}
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {status}
        </span>

        {expanded ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f1f5f9' }}>

          {/* Contact info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '14px 0' }}>
            {[
              { icon: <Phone size={13} />, label: lead.customerName, sub: lead.customerPhone },
              { icon: <Mail size={13} />,  label: lead.customerEmail, sub: `$${purchase.pricePaid?.toFixed(2)} paid` },
            ].map((row, i) => (
              <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#94a3b8', marginTop: 2, flexShrink: 0 }}>{row.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{row.label}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{row.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Status selector */}
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Status
          </label>
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
                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
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

          {/* Notes */}
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            <StickyNote size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Internal Notes
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Called, left voicemail. Quoted $1,500 for 3-bed."
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0',
              fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
              outline: 'none', color: '#0f172a', lineHeight: 1.5,
            }}
            onFocus={e => (e.target.style.borderColor = '#3b82f6')}
            onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
          />

          {/* Save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '9px 22px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700,
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
      )}
    </div>
  );
}

export default function MyLeads() {
  const { API_URL, token } = useContext(AuthContext);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');

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

  // Filter by search across route / customer name
  const filtered = purchases.filter(p => {
    if (!search) return true;
    const l = p.lead;
    if (!l) return false;
    const q = search.toLowerCase();
    return (
      l.originCity?.toLowerCase().includes(q) ||
      l.destinationCity?.toLowerCase().includes(q) ||
      l.customerName?.toLowerCase().includes(q)
    );
  });

  // Group by status
  const columns = STATUSES.map(s => ({
    status: s,
    cards: filtered.filter(p => (p.crmStatus || 'New') === s),
  }));

  const totalLeads = purchases.length;

  return (
    <DashboardLayout>
      <header className="dashboard-header">
        <h1 style={{ fontFamily: 'Poppins' }}>My Leads</h1>
        <p>Track and manage leads you've purchased</p>
      </header>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUSES.map(s => {
          const count = purchases.filter(p => (p.crmStatus || 'New') === s).length;
          const m = STATUS_META[s];
          return (
            <div key={s} style={{
              flex: '1 1 120px', padding: '12px 16px', borderRadius: 12,
              background: m.bg, border: `1px solid ${m.border}`,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: m.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s}</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', fontFamily: 'Poppins' }}>{count}</span>
            </div>
          );
        })}
        <div style={{
          flex: '1 1 120px', padding: '12px 16px', borderRadius: 12,
          background: '#f8fafc', border: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', fontFamily: 'Poppins' }}>{totalLeads}</span>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by city or customer name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box', marginBottom: 20,
          padding: '12px 16px', borderRadius: 12, border: '1.5px solid #e2e8f0',
          fontSize: 14, outline: 'none',
        }}
        onFocus={e => (e.target.style.borderColor = '#3b82f6')}
        onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading your leads…</div>
      ) : totalLeads === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <DollarSign size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <p>You haven't purchased any leads yet.</p>
        </div>
      ) : (
        /* Kanban columns */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 12,
          alignItems: 'start',
        }}>
          {columns.map(({ status, cards }) => {
            const m = STATUS_META[status];
            return (
              <div key={status}>
                {/* Column header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: '12px 12px 0 0',
                  background: m.bg, border: `1.5px solid ${m.border}`,
                  borderBottom: 'none', marginBottom: 0,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: m.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{status}</span>
                  <span style={{
                    minWidth: 22, height: 22, borderRadius: 11, background: m.color,
                    color: '#fff', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{cards.length}</span>
                </div>

                {/* Cards */}
                <div style={{
                  minHeight: 80, padding: '10px 0 4px',
                  borderLeft: `1.5px solid ${m.border}`,
                  borderRight: `1.5px solid ${m.border}`,
                  borderBottom: `1.5px solid ${m.border}`,
                  borderRadius: '0 0 12px 12px',
                  paddingLeft: 8, paddingRight: 8,
                }}>
                  {cards.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#cbd5e1', fontSize: 12 }}>
                      No leads
                    </div>
                  ) : (
                    cards.map(p => (
                      <LeadCard key={p._id} purchase={p} onUpdate={handleUpdate} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Responsive: collapse to list on small screens */}
      <style>{`
        @media (max-width: 1024px) {
          .myleads-kanban { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
