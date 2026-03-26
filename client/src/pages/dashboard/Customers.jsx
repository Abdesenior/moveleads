import { useState, useEffect, useContext } from 'react';
import {
  Users, Search, Download, X, MapPin, Calendar, Phone, Mail,
  FileText, CheckCircle, AlertCircle, MessageSquare, Eye,
  ArrowRight, Truck
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import TablePagination from '../../components/ui/TablePagination';
import TableSkeleton from '../../components/ui/TableSkeleton';

const STATUS_OPTIONS = ['New', 'Contacted', 'Follow-up', 'Booked', 'Closed', 'Lost'];

const STATUS_META = {
  'New':       { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  'Contacted': { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
  'Follow-up': { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  'Booked':    { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  'Closed':    { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  'Lost':      { bg: '#fee2e2', color: '#dc2626', border: '#fecaca' },
};

const statusMeta = (s) => STATUS_META[s] || { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };

/* ── Visual route cell ── */
function RouteCell({ originCity, originZip, destCity, destZip }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a', lineHeight: 1.2 }}>{originZip || '—'}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{originCity}</div>
      </div>
      <ArrowRight size={12} color="#cbd5e1" strokeWidth={2.5} style={{ flexShrink: 0 }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a', lineHeight: 1.2 }}>{destZip || '—'}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{destCity}</div>
      </div>
    </div>
  );
}

/* ── Inline status dropdown styled as pill ── */
function StatusDropdown({ value, onChange }) {
  const meta = statusMeta(value);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        onClick={e => e.stopPropagation()}
        style={{
          appearance: 'none', WebkitAppearance: 'none',
          padding: '5px 28px 5px 12px', borderRadius: 9999,
          border: `1.5px solid ${meta.border}`,
          background: meta.bg, color: meta.color,
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit', outline: 'none',
        }}
      >
        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <div style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: meta.color }}>
        ▾
      </div>
    </div>
  );
}

/* ── Icon action button ── */
function IconBtn({ icon, title, onClick, color = '#64748b', hoverColor = '#0f172a', hoverBg = '#f1f5f9' }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 32, height: 32, borderRadius: 8,
        border: '1px solid #e2e8f0',
        background: hovered ? hoverBg : '#fff',
        color: hovered ? hoverColor : color,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {icon}
    </button>
  );
}

export default function Customers() {
  const { API_URL, token } = useContext(AuthContext);
  const [purchases, setPurchases]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailLead, setDetailLead] = useState(null);
  const [editNotes, setEditNotes]   = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [disputingLead, setDisputingLead] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [saving, setSaving]         = useState(false);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [sortKey, setSortKey]       = useState('createdAt');
  const [sortDir, setSortDir]       = useState('desc');

  useEffect(() => { fetchPurchases(); }, []);
  useEffect(() => { setPage(1); }, [searchTerm, statusFilter, sortKey, sortDir]);

  const fetchPurchases = async () => {
    try {
      const res = await fetch(`${API_URL}/purchases`, { headers: { 'x-auth-token': token } });
      const data = await res.json();
      if (Array.isArray(data)) setPurchases(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  /* Inline status update (from table row dropdown) */
  const updateStatusInline = async (purchaseId, leadId, newStatus) => {
    setPurchases(prev => prev.map(p => p._id === purchaseId ? { ...p, crmStatus: newStatus } : p));
    try {
      await fetch(`${API_URL}/leads/${leadId}/crm-status`, {
        method: 'PATCH',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ crmStatus: newStatus }),
      });
    } catch (err) { console.error(err); }
  };

  const saveLead = async () => {
    if (!detailLead) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/leads/${detailLead.lead._id}/crm-status`, {
        method: 'PATCH',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ crmStatus: editStatus, crmNotes: editNotes })
      });
      if (!res.ok) throw new Error('Failed to update');
      setPurchases(prev => prev.map(p => p._id === detailLead._id ? { ...p, crmStatus: editStatus, crmNotes: editNotes } : p));
      setDetailLead(null);
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  const submitDispute = async () => {
    if (!disputeReason.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/disputes`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: detailLead.lead, reason: disputeReason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Failed to submit dispute');
      alert('Dispute submitted successfully. Admin will review it shortly.');
      setDetailLead(null);
      setDisputingLead(false);
      setDisputeReason('');
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const filtered = purchases.filter(p => {
    const matchSearch = !searchTerm ||
      (p.lead?.customerName||'').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.lead?.originCity||'').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.lead?.destinationCity||'').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.lead?.customerPhone||'').includes(searchTerm);
    const matchStatus = !statusFilter || p.crmStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'customerName': return String(a.lead?.customerName||'').localeCompare(String(b.lead?.customerName||'')) * dir;
      case 'route': return `${a.lead?.originCity||''} ${a.lead?.destinationCity||''}`.localeCompare(`${b.lead?.originCity||''} ${b.lead?.destinationCity||''}`) * dir;
      case 'price': return ((a.pricePaid||0) - (b.pricePaid||0)) * dir;
      case 'leadStatus': return String(a.crmStatus||'').localeCompare(String(b.crmStatus||'')) * dir;
      default: {
        const av = new Date(a.createdAt).getTime(); const bv = new Date(b.createdAt).getTime();
        return ((Number.isFinite(av) ? av : 0) - (Number.isFinite(bv) ? bv : 0)) * dir;
      }
    }
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = sorted.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const rows = [
      ['Name', 'Phone', 'Email', 'Route', 'Move Date', 'Home Size', 'Price', 'Status', 'Notes'],
      ...filtered.map(p => [
        `"${p.lead?.customerName||''}"`, `"${p.lead?.customerPhone||''}"`, `"${p.lead?.customerEmail||''}"`,
        `"${p.lead?.originCity||''} to ${p.lead?.destinationCity||''}"`,
        `"${new Date(p.lead?.moveDate).toLocaleDateString()}"`, `"${p.lead?.homeSize||''}"`,
        `"${p.pricePaid||''}"`, `"${p.crmStatus||'New'}"`, `"${(p.crmNotes||'').replace(/"/g,'""')}"`
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moveleads_customers_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const SortBtn = ({ k, label }) => (
    <button type="button" onClick={() => toggleSort(k)} style={{
      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
      fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
      letterSpacing: '0.05em', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {label}
      {sortKey === k && <span style={{ color: '#ea580c' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );

  return (
    <DashboardLayout>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Users size={22} color="#ea580c" />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>
            My Customers
          </h1>
          <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: 9999, fontSize: 12, fontWeight: 700, padding: '2px 10px', marginLeft: 4 }}>
            {purchases.length} total
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Manage your purchased leads and track ROI</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total', value: purchases.length, icon: <Users size={15} />, bg: '#eff6ff', color: '#2563eb' },
          { label: 'New', value: purchases.filter(p => !p.crmStatus || p.crmStatus === 'New').length, icon: <AlertCircle size={15} />, bg: '#f5f3ff', color: '#7c3aed' },
          { label: 'Booked', value: purchases.filter(p => p.crmStatus === 'Booked').length, icon: <CheckCircle size={15} />, bg: '#f0fdf4', color: '#16a34a' },
          { label: 'Lost', value: purchases.filter(p => p.crmStatus === 'Lost').length, icon: <X size={15} />, bg: '#fee2e2', color: '#dc2626' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins',sans-serif", marginTop: 2 }}>{s.value}</div>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
              {s.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Search / Filter / Export */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
          <input
            type="text" placeholder="Search by name, phone, city…" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 10px 10px 36px', borderRadius: 10, border: '1px solid #e2e8f0', outline: 'none', fontSize: 13, fontFamily: 'inherit' }}
            onFocus={e => (e.target.style.borderColor = '#ea580c')}
            onBlur={e  => (e.target.style.borderColor = '#e2e8f0')}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', minWidth: 150 }}
          onFocus={e => (e.target.style.borderColor = '#ea580c')}
          onBlur={e  => (e.target.style.borderColor = '#e2e8f0')}
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          onClick={exportCSV}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '12px 12px 12px 20px', textAlign: 'left' }}><SortBtn k="customerName" label="Customer" /></th>
              <th style={{ padding: '12px', textAlign: 'left' }}><SortBtn k="route" label="Route" /></th>
              <th style={{ padding: '12px', textAlign: 'left' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Move Date</span>
              </th>
              <th style={{ padding: '12px', textAlign: 'left' }}><SortBtn k="price" label="Price" /></th>
              <th style={{ padding: '12px', textAlign: 'left' }}><SortBtn k="leadStatus" label="Status" /></th>
              <th style={{ padding: '12px 20px 12px 12px', textAlign: 'right' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rowCount={pageSize} colCount={6} />
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                      <Users size={24} color="#cbd5e1" />
                    </div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15, marginBottom: 6 }}>
                      {purchases.length === 0 ? "No customers yet" : "No matches found"}
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>
                      {purchases.length === 0 ? "Purchase leads from the Live Leads Market to see them here." : "Try adjusting your search or filter."}
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((p) => {
                const meta = statusMeta(p.crmStatus || 'New');
                return (
                  <tr
                    key={p._id}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s', cursor: 'default' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Customer */}
                    <td style={{ padding: '14px 12px 14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          background: `linear-gradient(135deg,${meta.color}20,${meta.color}10)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: meta.color, fontSize: 12, fontWeight: 800, fontFamily: "'Poppins',sans-serif",
                        }}>
                          {getInitials(p.lead?.customerName)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{p.lead?.customerName || '—'}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{p.lead?.customerPhone || '—'}</div>
                        </div>
                      </div>
                    </td>

                    {/* Route */}
                    <td style={{ padding: '14px 12px' }}>
                      <RouteCell
                        originCity={p.lead?.originCity} originZip={p.lead?.originZip}
                        destCity={p.lead?.destinationCity} destZip={p.lead?.destinationZip}
                      />
                    </td>

                    {/* Move Date */}
                    <td style={{ padding: '14px 12px', fontSize: 12, color: '#64748b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Calendar size={12} color="#94a3b8" />
                        {p.lead?.moveDate ? new Date(p.lead.moveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                      </div>
                    </td>

                    {/* Price */}
                    <td style={{ padding: '14px 12px' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>
                        ${p.pricePaid?.toFixed(2) || '—'}
                      </span>
                    </td>

                    {/* Status — interactive dropdown pill */}
                    <td style={{ padding: '14px 12px' }}>
                      <StatusDropdown
                        value={p.crmStatus || 'New'}
                        onChange={newStatus => updateStatusInline(p._id, p.lead?._id, newStatus)}
                      />
                    </td>

                    {/* Quick Actions */}
                    <td style={{ padding: '14px 20px 14px 12px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <IconBtn
                          icon={<Phone size={13} />}
                          title="Call customer"
                          onClick={() => window.open(`tel:${p.lead?.customerPhone}`, '_self')}
                          hoverColor="#16a34a"
                          hoverBg="#f0fdf4"
                        />
                        <IconBtn
                          icon={<MessageSquare size={13} />}
                          title="Send SMS"
                          onClick={() => window.open(`sms:${p.lead?.customerPhone}`, '_self')}
                          hoverColor="#3b82f6"
                          hoverBg="#eff6ff"
                        />
                        <IconBtn
                          icon={<Eye size={13} />}
                          title="View details"
                          onClick={() => {
                            setDetailLead(p);
                            setEditStatus(p.crmStatus || 'New');
                            setEditNotes(p.crmNotes || '');
                            setDisputingLead(false);
                            setDisputeReason('');
                          }}
                          hoverColor="#ea580c"
                          hoverBg="#fff7ed"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {!loading && totalPages > 1 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9' }}>
            <TablePagination
              page={pageSafe} totalPages={totalPages} pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={n => { setPageSize(n); setPage(1); }}
            />
          </div>
        )}
      </div>

      {/* ── Detail / Edit Modal ── */}
      {detailLead && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)',
          zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'custFadeIn 0.3s ease',
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: 640, borderRadius: 24,
            boxShadow: '0 32px 80px rgba(0,0,0,0.25)', maxHeight: '92vh', overflowY: 'auto',
            animation: 'custScaleIn 0.35s cubic-bezier(0.16,1,0.3,1)',
          }}>
            {/* Dark Header */}
            <div style={{
              background: 'linear-gradient(135deg,#0a192f,#112240)',
              padding: '24px 28px', borderRadius: '24px 24px 0 0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: '-30%', right: '-5%', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle,rgba(234,88,12,0.12),transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 4px', fontFamily: "'Poppins',sans-serif" }}>
                  {detailLead.lead?.customerName}
                </h2>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
                  {detailLead.lead?.originCity} → {detailLead.lead?.destinationCity}
                </p>
              </div>
              <button onClick={() => setDetailLead(null)} style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', position: 'relative' }}>
                <X size={16} />
              </button>
            </div>

            {/* Two-column body */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '24px 28px', gap: 24, borderBottom: '1px solid #f1f5f9' }}>
              {/* Contact */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Contact</div>
                {[
                  { icon: <Phone size={14} color="#3b82f6" />, bg: '#eff6ff', label: detailLead.lead?.customerPhone, sub: 'Phone' },
                  { icon: <Mail size={14} color="#8b5cf6" />, bg: '#f5f3ff', label: detailLead.lead?.customerEmail, sub: 'Email' },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.icon}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{r.label || '—'}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.sub}</div>
                    </div>
                  </div>
                ))}
                {/* Quick actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <a href={`tel:${detailLead.lead?.customerPhone}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                    <Phone size={13} /> Call
                  </a>
                  <a href={`sms:${detailLead.lead?.customerPhone}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                    <MessageSquare size={13} /> SMS
                  </a>
                </div>
              </div>

              {/* Move details */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Move Details</div>
                {[
                  { icon: <MapPin size={12} />, label: 'Route', value: `${detailLead.lead?.originCity || '—'} → ${detailLead.lead?.destinationCity || '—'}` },
                  { icon: <Calendar size={12} />, label: 'Move Date', value: detailLead.lead?.moveDate ? new Date(detailLead.lead.moveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A' },
                  { icon: <Truck size={12} />, label: 'Home Size', value: detailLead.lead?.homeSize || '—' },
                  { icon: <FileText size={12} />, label: 'Price Paid', value: `$${detailLead.pricePaid?.toFixed(2) || '—'}` },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 3 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                      {item.icon} {item.label}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CRM section */}
            <div style={{ padding: '20px 28px 28px' }}>
              {disputingLead ? (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Dispute Reason (Required)</div>
                  <textarea
                    value={disputeReason}
                    onChange={e => setDisputeReason(e.target.value)}
                    placeholder="Why are you disputing this lead? (e.g. Fake phone number, duplicate)"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 12, border: '2px solid #fee2e2', fontSize: 13, outline: 'none', marginBottom: 12, minHeight: 80, fontFamily: 'inherit', resize: 'vertical' }}
                    onFocus={e => (e.target.style.borderColor = '#ef4444')}
                    onBlur={e  => (e.target.style.borderColor = '#fee2e2')}
                  />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={submitDispute} disabled={!disputeReason.trim() || saving} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                      {saving ? 'Submitting…' : 'Submit Dispute'}
                    </button>
                    <button onClick={() => setDisputingLead(false)} style={{ padding: '11px 20px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Status */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Lead Status</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {STATUS_OPTIONS.map(s => {
                        const m = statusMeta(s);
                        const active = editStatus === s;
                        return (
                          <button key={s} type="button" onClick={() => setEditStatus(s)} style={{
                            padding: '6px 14px', borderRadius: 9999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            background: active ? m.color : m.bg,
                            color: active ? '#fff' : m.color,
                            border: `1.5px solid ${active ? m.color : m.border}`,
                          }}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notes */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Private Notes</label>
                    <textarea
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      placeholder="Add notes about this customer…"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
                      onFocus={e => (e.target.style.borderColor = '#ea580c')}
                      onBlur={e  => (e.target.style.borderColor = '#e2e8f0')}
                    />
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <button onClick={() => setDisputingLead(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 12, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      <MessageSquare size={13} /> Dispute Lead
                    </button>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setDetailLead(null)} style={{ padding: '11px 22px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button onClick={saveLead} disabled={saving} style={{ padding: '11px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#0f172a,#1e293b)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(15,23,42,0.2)', opacity: saving ? 0.6 : 1 }}>
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes custFadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes custScaleIn { from { opacity:0; transform:scale(0.9) translateY(20px) } to { opacity:1; transform:scale(1) translateY(0) } }
      `}</style>
    </DashboardLayout>
  );
}
