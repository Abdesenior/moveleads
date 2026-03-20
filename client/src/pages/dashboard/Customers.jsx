import React, { useState, useEffect, useContext } from 'react';
import { Users, Search, Download, X, MapPin, Calendar, Phone, Mail, Edit2, FileText, CheckCircle, Clock, AlertCircle, User, MessageSquare } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import TablePagination from '../../components/ui/TablePagination';
import TableSkeleton from '../../components/ui/TableSkeleton';

const STATUS_OPTIONS = ['New', 'Contacted', 'Follow-up', 'Booked', 'Closed', 'Lost'];

const statusColor = (s) => {
  const map = {
    'New': { bg: '#eff6ff', color: '#2563eb' },
    'Contacted': { bg: '#f5f3ff', color: '#7c3aed' },
    'Follow-up': { bg: '#fff7ed', color: '#ea580c' },
    'Booked': { bg: '#f0fdf4', color: '#16a34a' },
    'Closed': { bg: '#dcfce7', color: '#15803d' },
    'Lost': { bg: '#fee2e2', color: '#dc2626' }
  };
  return map[s] || { bg: '#f1f5f9', color: '#64748b' };
};

export default function Customers() {
  const { API_URL, token } = useContext(AuthContext);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailLead, setDetailLead] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [disputingLead, setDisputingLead] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => { fetchPurchases(); }, []);
  useEffect(() => { setPage(1); }, [searchTerm, statusFilter, sortKey, sortDir]);

  const fetchPurchases = async () => {
    try {
      const res = await fetch(`${API_URL}/purchases`, { headers: { 'x-auth-token': token } });
      const data = await res.json();
      if (Array.isArray(data)) setPurchases(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const saveLead = async () => {
    if (!detailLead) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/purchases/${detailLead._id}`, {
        method: 'PUT',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadStatus: editStatus, notes: editNotes })
      });
      if (!res.ok) throw new Error('Failed to update');
      setPurchases(prev => prev.map(p => p._id === detailLead._id ? { ...p, leadStatus: editStatus, notes: editNotes } : p));
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
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const filtered = purchases.filter(p => {
    const matchSearch = !searchTerm ||
      (p.customerName||'').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.originCity||'').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.destinationCity||'').toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !statusFilter || p.leadStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'customerName': return String(a.customerName||'').localeCompare(String(b.customerName||'')) * dir;
      case 'route': return `${a.originCity||''} ${a.destinationCity||''}`.localeCompare(`${b.originCity||''} ${b.destinationCity||''}`) * dir;
      case 'price': return ((a.price||0) - (b.price||0)) * dir;
      case 'leadStatus': return String(a.leadStatus||'').localeCompare(String(b.leadStatus||'')) * dir;
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
        `"${p.customerName||''}"`, `"${p.customerPhone||''}"`, `"${p.customerEmail||''}"`,
        `"${p.originCity||''} to ${p.destinationCity||''}"`,
        `"${new Date(p.moveDate).toLocaleDateString()}"`, `"${p.homeSize||''}"`,
        `"${p.price||''}"`, `"${p.leadStatus||'New'}"`, `"${(p.notes||'').replace(/"/g,'""')}"`
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moveleads_customers_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <DashboardLayout>
      <header className="dashboard-header">
        <h1 style={{ fontFamily: 'Poppins' }}>My Customers</h1>
        <p>Manage your purchased leads and track progress</p>
      </header>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Total</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={16} color="#3b82f6" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28 }}>{purchases.length}</div>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">New</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle size={16} color="#7c3aed" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28, color: '#7c3aed' }}>{purchases.filter(p => !p.leadStatus || p.leadStatus === 'New').length}</div>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Booked</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={16} color="#16a34a" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28, color: '#16a34a' }}>{purchases.filter(p => p.leadStatus === 'Booked').length}</div>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Lost</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={16} color="#ef4444" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28, color: '#ef4444' }}>{purchases.filter(p => p.leadStatus === 'Lost').length}</div>
        </div>
      </div>

      {/* Search / Filter / Export */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input type="text" placeholder="Search customers..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none', fontSize: 13 }}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, minWidth: 140 }}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={exportCSV} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 20px', borderRadius: 12, border: '1px solid #e2e8f0',
          background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', transition: 'all 0.2s'
        }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden', borderRadius: 18 }}>
        <table className="leads-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24 }}>
                <button type="button" onClick={() => toggleSort('customerName')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'customerName' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Customer {sortKey === 'customerName' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('route')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'route' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Route {sortKey === 'route' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>Move Date</th>
              <th>
                <button type="button" onClick={() => toggleSort('price')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'price' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Price {sortKey === 'price' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('leadStatus')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'leadStatus' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Status {sortKey === 'leadStatus' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th style={{ textAlign: 'right', paddingRight: 24 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rowCount={pageSize} colCount={6} />
            ) : sorted.length === 0 ? (
              <tr><td colSpan="6" className="table-empty">No customers found.</td></tr>
            ) : (
              paged.map((p, i) => {
                const sc = statusColor(p.leadStatus || 'New');
                return (
                  <tr key={p._id} style={{ background: i % 2 === 0 ? '#fff' : '#fcfdfe' }}>
                    <td style={{ paddingLeft: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 10,
                          background: `linear-gradient(135deg, ${sc.color}20 0%, ${sc.color}10 100%)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: sc.color, fontSize: 12, fontWeight: 700, flexShrink: 0
                        }}>{getInitials(p.customerName)}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{p.customerName}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.customerPhone}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MapPin size={12} color="#94a3b8" />
                        <span style={{ fontSize: 13, color: '#475569' }}>{p.originCity} → {p.destinationCity}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: '#475569' }}>{p.moveDate ? new Date(p.moveDate).toLocaleDateString() : 'N/A'}</td>
                    <td><strong style={{ color: '#0f172a' }}>${p.price?.toFixed(2)}</strong></td>
                    <td>
                      <span style={{
                        padding: '5px 14px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                        background: sc.bg, color: sc.color, textTransform: 'uppercase', letterSpacing: 0.5
                      }}>{p.leadStatus || 'New'}</span>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 24 }}>
                      <button onClick={() => {
                        setDetailLead(p);
                        setEditStatus(p.leadStatus || 'New');
                        setEditNotes(p.notes || '');
                      }} style={{
                        width: 36, height: 36, borderRadius: 10, background: '#f1f5f9',
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#3b82f6', transition: 'all 0.2s'
                      }}>
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {!loading && totalPages > 1 && (
          <div style={{ padding: '0 24px 24px' }}>
            <TablePagination page={pageSafe} totalPages={totalPages} pageSize={pageSize}
              onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
          </div>
        )}
      </div>

      {/* Detail/Edit Modal */}
      {detailLead && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)',
          zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: 580, borderRadius: 24,
            boxShadow: '0 32px 80px rgba(0,0,0,0.25)', maxHeight: '92vh', overflowY: 'auto',
            animation: 'scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            {/* Dark Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0a192f 0%, #112240 100%)',
              padding: '28px 32px', borderRadius: '24px 24px 0 0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
            }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: 0, fontFamily: 'Poppins' }}>
                  {detailLead.customerName}
                </h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }}>
                  {detailLead.originCity} → {detailLead.destinationCity}
                </p>
              </div>
              <button onClick={() => setDetailLead(null)} style={{
                width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.1)',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)'
              }}><X size={18} /></button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px 32px 32px' }}>
              {/* Contact Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, background: '#f8fafc', borderRadius: 12 }}>
                  <Phone size={16} color="#3b82f6" />
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>PHONE</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{detailLead.customerPhone}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, background: '#f8fafc', borderRadius: 12 }}>
                  <Mail size={16} color="#8b5cf6" />
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>EMAIL</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{detailLead.customerEmail}</div>
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Home Size', value: detailLead.homeSize, icon: <User size={12} /> },
                  { label: 'Move Date', value: detailLead.moveDate ? new Date(detailLead.moveDate).toLocaleDateString() : 'N/A', icon: <Calendar size={12} /> },
                  { label: 'Distance', value: detailLead.distance, icon: <MapPin size={12} /> }
                ].map((item, idx) => (
                  <div key={idx} style={{ textAlign: 'center', padding: 14, background: '#f8fafc', borderRadius: 12 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Status */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>Lead Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, fontFamily: "'Inter', sans-serif", outline: 'none' }}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>Private Notes</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes about this customer..."
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, fontFamily: "'Inter', sans-serif", outline: 'none', minHeight: 100, resize: 'vertical' }} />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid #f1f5f9', paddingTop: 24, marginTop: 10 }}>
                {disputingLead ? (
                  <div style={{ width: '100%' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>DISPUTE REASON (Required)</label>
                    <textarea 
                      value={disputeReason} 
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="Why are you disputing this lead? (e.g. Fake phone number, duplicate)"
                      style={{ 
                        width: '100%', padding: '12px', borderRadius: 12, border: '2px solid #fee2e2', 
                        fontSize: 13, outline: 'none', marginBottom: 12, minHeight: 80
                      }}
                    />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={submitDispute} disabled={!disputeReason.trim() || saving} style={{
                        flex: 1, padding: '12px', borderRadius: 12, border: 'none',
                        background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer'
                      }}>{saving ? 'Submitting...' : 'Submit Dispute'}</button>
                      <button onClick={() => setDisputingLead(false)} style={{
                        padding: '12px 20px', borderRadius: 12, border: '1px solid #e2e8f0',
                        background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                      }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button onClick={() => setDisputingLead(true)} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '12px 20px', borderRadius: 12, border: '1px solid #fee2e2',
                      background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                    }}>
                      <MessageSquare size={14} /> Dispute Lead
                    </button>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => setDetailLead(null)} style={{
                        padding: '12px 24px', borderRadius: 12, border: '1px solid #e2e8f0',
                        background: '#transparent', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                      }}>Cancel</button>
                      <button onClick={saveLead} disabled={saving} style={{
                        padding: '12px 32px', borderRadius: 12, border: 'none',
                        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                        color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(15,23,42,0.2)', opacity: saving ? 0.6 : 1
                      }}>{saving ? 'Saving...' : 'Save Changes'}</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes scaleIn { from { opacity:0; transform:scale(0.9) translateY(20px) } to { opacity:1; transform:scale(1) translateY(0) } }
      `}</style>
    </DashboardLayout>
  );
}
