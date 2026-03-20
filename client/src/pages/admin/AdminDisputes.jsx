import React, { useState, useEffect, useContext, useCallback } from 'react';
import { AlertCircle, CheckCircle, XCircle, Clock, Search, MessageSquare, Filter, ArrowLeft, Loader } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import TablePagination from '../../components/ui/TablePagination';
import TableSkeleton from '../../components/ui/TableSkeleton';

export default function AdminDisputes() {
  const { API_URL, token } = useContext(AuthContext);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null); // ID of dispute being resolved
  const [adminNotes, setAdminNotes] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchDisputes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/disputes/admin`, {
        headers: { 'x-auth-token': token }
      });
      const data = await res.json();
      if (Array.isArray(data)) setDisputes(data);
    } catch (err) {
      console.error('Error fetching disputes:', err);
    } finally {
      setLoading(false);
    }
  }, [API_URL, token]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const resolveDispute = async (id, approve) => {
    setResolving(id);
    try {
      const res = await fetch(`${API_URL}/disputes/admin/${id}/resolve`, {
        method: 'POST',
        headers: { 
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ approve, adminNotes })
      });
      
      if (!res.ok) throw new Error('Failed to resolve dispute');
      
      // Update local state: remove the resolved dispute
      setDisputes(prev => prev.filter(d => d._id !== id));
      setAdminNotes('');
    } catch (err) {
      alert(err.message);
    } finally {
      setResolving(null);
    }
  };

  const filtered = disputes.filter(d => {
    const q = searchTerm.toLowerCase();
    return (d.company?.companyName || '').toLowerCase().includes(q) ||
           (d.reason || '').toLowerCase().includes(q) ||
           (d.lead?.customerName || '').toLowerCase().includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <AdminLayout>
      <header className="dashboard-header">
        <h1 style={{ fontFamily: 'Poppins' }}>Dispute Resolution</h1>
        <p>Review and resolve lead refund requests from movers</p>
      </header>

      {/* Info Box */}
      <div style={{ 
        background: '#fffbeb', borderLeft: '4px solid #f59e0b', 
        padding: '16px 20px', borderRadius: 12, marginBottom: 28,
        display: 'flex', alignItems: 'center', gap: 14
      }}>
        <AlertCircle size={20} color="#d97706" />
        <p style={{ margin: 0, fontSize: 13, color: '#92400e', fontWeight: 500 }}>
          <strong>Note:</strong> Approving a dispute will automatically refund the lead cost to the mover's balance and create a refund transaction log.
        </p>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input 
          type="text" 
          placeholder="Search by company, customer or reason..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', maxWidth: 400, padding: '12px 12px 12px 40px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none', fontSize: 13 }}
        />
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden', borderRadius: 18 }}>
        <table className="leads-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24 }}>Company</th>
              <th>Lead Info</th>
              <th>Dispute Reason</th>
              <th>Price</th>
              <th style={{ textAlign: 'right', paddingRight: 24 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rowCount={5} colCount={5} />
            ) : paged.length === 0 ? (
              <tr><td colSpan="5" className="table-empty">No pending disputes found.</td></tr>
            ) : (
              paged.map((d, i) => (
                <tr key={d._id} style={{ background: i % 2 === 0 ? '#fff' : '#fcfdfe' }}>
                  <td style={{ paddingLeft: 24 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{d.company?.companyName}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.company?.email}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      <strong>{d.lead?.customerName || 'N/A'}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {d.lead?.originCity} → {d.lead?.destinationCity}
                    </div>
                  </td>
                  <td style={{ maxWidth: 300 }}>
                    <div style={{ 
                      fontSize: 12, color: '#444', background: '#f8fafc', 
                      padding: '8px 12px', borderRadius: 8, border: '1px solid #f1f5f9',
                      whiteSpace: 'normal', lineHeight: 1.4
                    }}>
                      "{d.reason}"
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                      Submitted {new Date(d.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td><strong style={{ color: '#0f172a' }}>${(d.purchasedLead?.pricePaid ?? 0).toFixed(2)}</strong></td>
                  <td style={{ textAlign: 'right', paddingRight: 10 }}>
                    {resolving === d._id ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                         <Loader size={16} className="spinner" />
                         <span style={{ fontSize: 12, color: '#94a3b8' }}>Resolving...</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => resolveDispute(d._id, true)}
                          title="Approve Refund"
                          style={{ 
                            padding: '8px 14px', borderRadius: 8, border: 'none', 
                            background: '#dcfce7', color: '#16a34a', fontWeight: 700, 
                            fontSize: 12, cursor: 'pointer', transition: 'all 0.2s'
                          }}
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => resolveDispute(d._id, false)}
                          title="Deny Refund"
                          style={{ 
                            padding: '8px 14px', borderRadius: 8, border: 'none', 
                            background: '#fee2e2', color: '#dc2626', fontWeight: 700, 
                            fontSize: 12, cursor: 'pointer', transition: 'all 0.2s'
                          }}
                        >
                          Deny
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && totalPages > 1 && (
          <div style={{ padding: '0 24px 24px' }}>
            <TablePagination 
              page={pageSafe} 
              totalPages={totalPages} 
              pageSize={pageSize}
              onPageChange={setPage} 
              onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} 
            />
          </div>
        )}
      </div>

      <style>{`
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </AdminLayout>
  );
}
