import React, { useState, useEffect, useContext } from 'react';
import { MapPin, Search, Calendar, DollarSign, Package, Eye, ShoppingBag, Filter, Truck, X, CheckCircle, User, Phone as PhoneIcon } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import TablePagination from '../../components/ui/TablePagination';
import TableSkeleton from '../../components/ui/TableSkeleton';

export default function Leads() {
  const { API_URL, token, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [distanceFilter, setDistanceFilter] = useState('');

  // Purchase flow state
  const [confirmLead, setConfirmLead] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [successData, setSuccessData] = useState(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState('moveDate');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => { fetchLeads(); }, []);
  useEffect(() => { setPage(1); }, [searchTerm, distanceFilter, sortKey, sortDir]);

  const fetchLeads = async () => {
    try {
      const res = await fetch(`${API_URL}/leads`, { headers: { 'x-auth-token': token } });
      const data = await res.json();
      if (Array.isArray(data)) {
        setLeads(data.filter(l => l.status === 'Available'));
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const purchaseLead = async (lead) => {
    setPurchasing(true);
    try {
      const res = await fetch(`${API_URL}/purchases/${lead._id}`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Failed to purchase lead');
      
      setConfirmLead(null);
      setSuccessData({ lead: data.lead || lead, balance: data.balance });
      setLeads(prev => prev.filter(l => l._id !== lead._id));
    } catch (err) {
      alert(err.message);
    } finally {
      setPurchasing(false);
    }
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const filtered = leads.filter(l => {
    const matchSearch = !searchTerm ||
      l.originCity?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.destinationCity?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchDistance = !distanceFilter || l.distance === distanceFilter;
    return matchSearch && matchDistance;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const getValue = (lead) => {
      switch (sortKey) {
        case 'route': return `${lead.originCity||''} -> ${lead.destinationCity||''}`.toLowerCase();
        case 'homeSize': return (lead.homeSize||'').toLowerCase();
        case 'moveDate': { const t = new Date(lead.moveDate).getTime(); return Number.isFinite(t) ? t : 0; }
        case 'price': return Number(lead.price || 0);
        default: return '';
      }
    };
    const av = getValue(a); const bv = getValue(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = sorted.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <DashboardLayout>
      <header className="dashboard-header">
        <h1 style={{ fontFamily: 'Poppins' }}>Lead Marketplace</h1>
        <p>Browse and purchase verified moving leads</p>
      </header>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Available</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={16} color="#3b82f6" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28 }}>{leads.length}</div>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Local Leads</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={16} color="#22c55e" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28 }}>{leads.filter(l => l.distance === 'Local').length}</div>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Long Distance</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={16} color="#f97316" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28 }}>{leads.filter(l => l.distance === 'Long Distance').length}</div>
        </div>
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input type="text" placeholder="Search by city or contact..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none', fontSize: 13 }}
          />
        </div>
        <select value={distanceFilter} onChange={(e) => setDistanceFilter(e.target.value)}
          style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, minWidth: 150 }}>
          <option value="">All Distances</option>
          <option value="Local">Local</option>
          <option value="Long Distance">Long Distance</option>
        </select>
      </div>

      {/* Leads Table */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden', borderRadius: 18 }}>
        <table className="leads-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24 }}>
                <button type="button" onClick={() => toggleSort('route')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'route' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Route {sortKey === 'route' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>Contact</th>
              <th>
                <button type="button" onClick={() => toggleSort('homeSize')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'homeSize' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Home Size {sortKey === 'homeSize' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('moveDate')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'moveDate' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Move Date {sortKey === 'moveDate' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('price')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'price' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Price {sortKey === 'price' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th style={{ textAlign: 'right', paddingRight: 24 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rowCount={pageSize} colCount={6} />
            ) : sorted.length === 0 ? (
              <tr><td colSpan="6" className="table-empty">No leads match your filters.</td></tr>
            ) : (
              paged.map((lead, i) => (
                <tr key={lead._id} style={{ background: i % 2 === 0 ? '#fff' : '#fcfdfe' }}>
                  <td style={{ paddingLeft: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MapPin size={16} color="#3b82f6" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{lead.originCity} → {lead.destinationCity}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: lead.distance === 'Local' ? '#f0fdf4' : '#fff7ed', color: lead.distance === 'Local' ? '#16a34a' : '#f97316', fontSize: 10, fontWeight: 600 }}>
                            {lead.distance}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>
                      <span className="blur-text">{lead.customerName || 'Hidden'}</span>
                      <div className="blur-text" style={{ fontSize: 11, color: '#94a3b8' }}>{lead.customerPhone || '(xxx) xxx-xxxx'}</div>
                    </div>
                  </td>
                  <td><span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>{lead.homeSize}</span></td>
                  <td><span style={{ fontSize: 12, color: '#475569' }}>{new Date(lead.moveDate).toLocaleDateString()}</span></td>
                  <td><strong style={{ color: '#0f172a', fontSize: 14 }}>${lead.price?.toFixed(2)}</strong></td>
                  <td style={{ textAlign: 'right', paddingRight: 24 }}>
                    <button
                      type="button"
                      onClick={() => setConfirmLead(lead)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: '#fff', border: 'none', borderRadius: 10,
                        padding: '9px 18px', fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', transition: 'all 0.25s',
                        boxShadow: '0 2px 8px rgba(245,158,11,0.25)'
                      }}>
                      <ShoppingBag size={14} /> Buy
                    </button>
                  </td>
                </tr>
              ))
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

      {/* ═══ Purchase Confirmation Modal ═══ */}
      {confirmLead && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,25,47,0.7)', backdropFilter: 'blur(12px)',
          zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'fadeIn 0.25s ease'
        }}>
          <div style={{
            background: 'white', borderRadius: 24, width: '100%', maxWidth: 460,
            overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
            animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0a192f 0%, #112240 100%)',
              padding: '28px 32px', position: 'relative', overflow: 'hidden'
            }}>
              <div style={{ position: 'absolute', top: '-30%', right: '-10%', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 800, margin: '0 0 4px', fontFamily: "'Poppins', sans-serif" }}>Confirm Purchase</h2>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0 }}>Review lead details before buying</p>
                </div>
                <button onClick={() => setConfirmLead(null)} style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '28px 32px' }}>
              {/* Route info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: '16px 18px', background: '#f8fafc', borderRadius: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin size={20} color="#3b82f6" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{confirmLead.originCity} → {confirmLead.destinationCity}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{confirmLead.homeSize} • {confirmLead.distance} • {new Date(confirmLead.moveDate).toLocaleDateString()}</div>
                </div>
              </div>

              {/* Price breakdown */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 14, color: '#64748b' }}>Lead Price</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins', sans-serif" }}>${confirmLead.price?.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 14, color: '#64748b' }}>Current Balance</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#16a34a' }}>${(user?.balance ?? 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', marginBottom: 24 }}>
                <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Balance After</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: (user?.balance ?? 0) >= (confirmLead.price || 0) ? '#0f172a' : '#ef4444' }}>
                  ${((user?.balance ?? 0) - (confirmLead.price || 0)).toFixed(2)}
                </span>
              </div>

              {(user?.balance ?? 0) < (confirmLead.price || 0) && (
                <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>
                  ⚠ Insufficient balance. Please add credits first.
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setConfirmLead(null)} className="secondary-btn" style={{ flex: 1, padding: 14, justifyContent: 'center' }}>Cancel</button>
                <button
                  onClick={() => purchaseLead(confirmLead)}
                  disabled={purchasing || (user?.balance ?? 0) < (confirmLead.price || 0)}
                  style={{
                    flex: 2, padding: 14,
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#fff', border: 'none', borderRadius: 14,
                    fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    fontFamily: "'Poppins', sans-serif",
                    boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
                    opacity: purchasing || (user?.balance ?? 0) < (confirmLead.price || 0) ? 0.5 : 1,
                    transition: 'all 0.25s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}>
                  <ShoppingBag size={16} /> {purchasing ? 'Processing...' : 'Confirm Purchase'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Success Modal ═══ */}
      {successData && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)',
          zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            background: 'white', borderRadius: 24, padding: '40px 36px', width: '100%', maxWidth: 480,
            textAlign: 'center', boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
            animation: 'scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle size={36} color="#16a34a" />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8, fontFamily: "'Poppins', sans-serif" }}>Lead Purchased!</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>Contact details are now available. Reach out quickly for the best results!</p>

            {/* Revealed contact info */}
            <div style={{ background: '#f8fafc', borderRadius: 16, padding: '20px 24px', marginBottom: 24, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={18} color="#3b82f6" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer Name</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{successData.lead?.customerName || 'N/A'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PhoneIcon size={18} color="#22c55e" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{successData.lead?.customerPhone || 'N/A'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MapPin size={18} color="#f97316" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Route</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{successData.lead?.originCity} → {successData.lead?.destinationCity}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => { setSuccessData(null); navigate('/dashboard/customers'); }}
                style={{
                  flex: 1, padding: 14,
                  background: 'var(--bg-navy)', color: '#fff',
                  border: 'none', borderRadius: 14,
                  fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  fontFamily: "'Poppins', sans-serif"
                }}>View in My Customers</button>
              <button onClick={() => setSuccessData(null)}
                style={{
                  flex: 1, padding: 14,
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#fff', border: 'none', borderRadius: 14,
                  fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  fontFamily: "'Poppins', sans-serif",
                  boxShadow: '0 4px 16px rgba(245,158,11,0.3)'
                }}>Continue Browsing</button>
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
