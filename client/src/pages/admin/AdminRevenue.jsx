import React, { useState, useEffect, useContext } from 'react';
import { BarChart2, DollarSign, Package, TrendingUp, Download, Search, Clock } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import TablePagination from '../../components/ui/TablePagination';
import TableSkeleton from '../../components/ui/TableSkeleton';

const cleanDescription = (desc) => {
  if (!desc) return '';
  return desc.replace(/\s*\(Session:.*?\)/gi, '').trim();
};

export default function AdminRevenue() {
  const { API_URL, token } = useContext(AuthContext);
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState({ revenueYTD: 0, currentMonth: 0 });
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    const fetchFinance = async () => {
      try {
        const headers = { 'x-auth-token': token };
        const [txRes, revRes] = await Promise.all([
          fetch(`${API_URL}/billing/transactions`, { headers }),
          fetch(`${API_URL}/billing/admin/revenue-stats`, { headers })
        ]);
        
        const data = await txRes.json();
        const revData = await revRes.json();
        
        if (Array.isArray(data)) {
          setTransactions(data);
          setStats({ 
            revenueYTD: revData.totalRevenue || 0, 
            currentMonth: revData.monthlyRevenue || 0 
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchFinance();
  }, [API_URL, token]);

  useEffect(() => { setPage(1); }, [searchTerm, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (tx.type || '').toLowerCase().includes(q) ||
           (tx.description || '').toLowerCase().includes(q) ||
           (tx.status || '').toLowerCase().includes(q);
  });

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'amount': return ((a.amount || 0) - (b.amount || 0)) * dir;
      case 'type': return String(a.type || '').localeCompare(String(b.type || '')) * dir;
      case 'status': return String(a.status || '').localeCompare(String(b.status || '')) * dir;
      default: {
        const av = new Date(a.date).getTime(); const bv = new Date(b.date).getTime();
        return ((Number.isFinite(av) ? av : 0) - (Number.isFinite(bv) ? bv : 0)) * dir;
      }
    }
  });

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pagedTransactions = sortedTransactions.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const exportToCSV = () => {
    if (filteredTransactions.length === 0) return;
    const headers = ['Date & Time', 'Type', 'Description', 'Amount', 'Status'];
    const rows = filteredTransactions.map((tx) => [
      `"${new Date(tx.date).toLocaleString()}"`, `"${tx.type}"`,
      `"${cleanDescription(tx.description).replace(/"/g, '""')}"`,
      `"${tx.amount}"`, `"${tx.status}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `moveleads_admin_tx_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AdminLayout>
      <header className="dashboard-header">
        <h1 style={{ fontFamily: 'Poppins' }}>Revenue Analytics</h1>
        <p>Monitor platform-wide financial performance</p>
      </header>

      {/* Revenue Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        <div className="balance-card" style={{ padding: '32px 36px', marginBottom: 0 }}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '12px', fontWeight: 600, margin: '0 0 10px 0' }}>Total Revenue YTD</p>
            <div className="balance-amount" style={{ fontSize: 40, margin: 0 }}>${stats.revenueYTD.toFixed(2)}</div>
          </div>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
            <TrendingUp size={24} color="rgba(255,255,255,0.7)" />
          </div>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: 'white', padding: '32px 36px', borderRadius: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: '0 10px 30px rgba(245,158,11,0.25)', position: 'relative', overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', top: '-30%', right: '-5%', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '12px', fontWeight: 600, margin: '0 0 10px 0' }}>Est. Current Month</p>
            <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "'Poppins', sans-serif", letterSpacing: -1 }}>${stats.currentMonth.toFixed(2)}</div>
          </div>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
            <DollarSign size={24} color="rgba(255,255,255,0.8)" />
          </div>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden', borderRadius: 18 }}>
        <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={16} color="#3b82f6" />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--bg-navy)', margin: 0, fontFamily: 'Poppins' }}>All Transactions</h2>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search transactions..."
                style={{ padding: '10px 10px 10px 36px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none', fontSize: 13, width: 260 }}
              />
            </div>
            <button onClick={exportToCSV} type="button"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 12, border: '1px solid #e2e8f0',
                background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s'
              }}>
              <Download size={14} /> Export
            </button>
          </div>
        </div>
        <table className="leads-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24 }}>
                <button type="button" onClick={() => toggleSort('date')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'date' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Date & Time {sortKey === 'date' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('type')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'type' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Type {sortKey === 'type' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>Description</th>
              <th>
                <button type="button" onClick={() => toggleSort('amount')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'amount' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Amount {sortKey === 'amount' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('status')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'status' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Status {sortKey === 'status' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rowCount={pageSize} colCount={5} />
            ) : pagedTransactions.length === 0 ? (
              <tr><td colSpan="5" className="table-empty">No transactions found.</td></tr>
            ) : (
              pagedTransactions.map((tx, i) => (
                <tr key={tx._id} style={{ background: i % 2 === 0 ? '#fff' : '#fcfdfe' }}>
                  <td style={{ paddingLeft: 24, color: '#64748b', fontSize: 13 }}>{new Date(tx.date).toLocaleDateString()} {new Date(tx.date).toLocaleTimeString()}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                        background: tx.type === 'Credit Deposit' ? '#f0fdf4' : '#eff6ff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {tx.type === 'Credit Deposit' ? <DollarSign size={14} color="#16a34a" /> : <Package size={14} color="#3b82f6" />}
                      </div>
                      <strong style={{ fontSize: 13 }}>{tx.type}</strong>
                    </div>
                  </td>
                  <td style={{ fontSize: 13, color: '#475569' }}>{cleanDescription(tx.description)}</td>
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
                  <td><span className={`badge ${tx.status === 'Completed' ? 'purchased' : 'expired'}`}>{tx.status}</span></td>
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
    </AdminLayout>
  );
}
