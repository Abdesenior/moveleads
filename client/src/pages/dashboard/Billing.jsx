import React, { useState, useEffect, useContext, useRef } from 'react';
import { DollarSign, Clock, ArrowUpCircle, ShoppingBag, CreditCard, Plus, Search, ArrowDownCircle, Wallet, X, CheckCircle } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TablePagination from '../../components/ui/TablePagination';
import TableSkeleton from '../../components/ui/TableSkeleton';

const cleanDescription = (desc) => {
  if (!desc) return '';
  return desc.replace(/\s*\(Session:.*?\)/gi, '').trim();
};

export default function Billing() {
  const { user, token, API_URL } = useContext(AuthContext);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(user?.balance ?? 0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [balancePulse, setBalancePulse] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  // Credit confirmation modal
  const [confirmAmount, setConfirmAmount] = useState(null);
  const [redirecting, setRedirecting] = useState(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const processedRef = useRef(false);

  useEffect(() => {
    fetchBilling();

    // Handle Stripe return — only process once
    const sid = searchParams.get('session_id');
    const success = searchParams.get('success');
    if (sid && success === 'true' && !processedRef.current) {
      processedRef.current = true;
      confirmPayment(sid);
      // Clear query params to prevent re-triggering on refresh
      navigate('/dashboard/billing', { replace: true });
    } else if (success === 'true' && !sid) {
      // success=true but no session_id, just clear params
      navigate('/dashboard/billing', { replace: true });
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sortKey, sortDir]);

  const fetchBilling = async () => {
    try {
      const headers = { 'x-auth-token': token };
      const [txRes, balRes] = await Promise.all([
        fetch(`${API_URL}/billing/transactions`, { headers }),
        fetch(`${API_URL}/billing/balance`, { headers })
      ]);
      const txData = await txRes.json();
      const balData = await balRes.json();
      if (Array.isArray(txData)) setTransactions(txData);
      if (balData.balance !== undefined) setBalance(balData.balance);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const confirmPayment = async (sessionId) => {
    try {
      const res = await fetch(`${API_URL}/billing/confirm-payment`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      const data = await res.json();

      // Only show success toast if actually processed (not a duplicate)
      if (!data.alreadyProcessed && (data.balance !== undefined || data.msg?.includes('confirmed'))) {
        setShowSuccess(true);
        setBalancePulse(true);
        setTimeout(() => setShowSuccess(false), 5000);
        setTimeout(() => setBalancePulse(false), 3000);
      }
      // Always refresh billing data
      fetchBilling();
    } catch (err) { console.error(err); }
  };

  const addCredits = async (amount) => {
    setRedirecting(true);
    try {
      const res = await fetch(`${API_URL}/billing/create-checkout-session`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.msg || 'Failed to create checkout session');
      }
    } catch (err) {
      alert(err.message);
      setRedirecting(false);
      setConfirmAmount(null);
    }
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const filtered = transactions.filter(tx => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (tx.type||'').toLowerCase().includes(q) ||
           (tx.description||'').toLowerCase().includes(q) ||
           (tx.status||'').toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'amount') return ((a.amount||0) - (b.amount||0)) * dir;
    if (sortKey === 'type') return String(a.type||'').localeCompare(String(b.type||'')) * dir;
    const av = new Date(a.date).getTime(); const bv = new Date(b.date).getTime();
    return ((Number.isFinite(av) ? av : 0) - (Number.isFinite(bv) ? bv : 0)) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = sorted.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const creditPacks = [
    { amount: 50, label: '$50', popular: false },
    { amount: 100, label: '$100', popular: true },
    { amount: 200, label: '$200', popular: false },
    { amount: 500, label: '$500', popular: false }
  ];

  return (
    <DashboardLayout>
      {showSuccess && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 20000,
          padding: '16px 24px', borderRadius: 16,
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          color: '#fff', fontWeight: 700, fontSize: 14,
          boxShadow: '0 10px 30px rgba(22,197,94,0.35)',
          animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <ArrowUpCircle size={18} /> Credits added to your account!
        </div>
      )}

      <header className="dashboard-header">
        <h1 style={{ fontFamily: 'Poppins' }}>Billing & Credits</h1>
        <p>Manage your balance and view transaction history</p>
      </header>

      {/* Balance Card */}
      <div className="balance-card">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px 0' }}>Available Balance</p>
          <div className="balance-amount" style={{ animation: balancePulse ? 'pulse 0.5s' : 'none' }}>
            ${balance.toFixed(2)}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: '8px 0 0' }}>
            <Wallet size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            MoveLeads Credits
          </p>
        </div>
        <button onClick={() => setConfirmAmount(100)} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: '#fff', border: 'none', borderRadius: 14, padding: '14px 28px',
          fontSize: 15, fontWeight: 700, fontFamily: "'Poppins', sans-serif",
          cursor: 'pointer', boxShadow: '0 6px 20px rgba(245,158,11,0.35)',
          transition: 'all 0.25s', position: 'relative', zIndex: 1
        }}>
          <Plus size={18} /> Add Credits
        </button>
      </div>

      {/* Quick Credit Packages */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {creditPacks.map(pkg => (
          <button key={pkg.amount} onClick={() => setConfirmAmount(pkg.amount)} style={{
            padding: '22px 20px', borderRadius: 16,
            background: pkg.popular ? 'linear-gradient(135deg, #0a192f 0%, #112240 100%)' : '#fff',
            color: pkg.popular ? '#fff' : '#0f172a',
            border: pkg.popular ? 'none' : '1px solid #e2e8f0',
            cursor: 'pointer', transition: 'all 0.25s',
            fontFamily: "'Poppins', sans-serif",
            position: 'relative', overflow: 'hidden',
            boxShadow: pkg.popular ? '0 8px 24px rgba(10,25,47,0.2)' : '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            {pkg.popular && (
              <span style={{
                position: 'absolute', top: 8, right: 8,
                fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                background: '#f59e0b', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5
              }}>Popular</span>
            )}
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{pkg.label}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: pkg.popular ? 'rgba(255,255,255,0.5)' : '#94a3b8' }}>Add credits</div>
          </button>
        ))}
      </div>

      {/* Transaction History */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden', borderRadius: 18 }}>
        <div style={{ padding: '24px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={16} color="#3b82f6" />
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--bg-navy)', margin: 0, fontFamily: "'Poppins', sans-serif" }}>Transaction History</h2>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input type="text" placeholder="Search transactions..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '10px 10px 10px 36px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none', fontSize: 13, width: 240 }} />
          </div>
        </div>
        <table className="leads-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24 }}>
                <button type="button" onClick={() => toggleSort('date')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'date' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Date {sortKey === 'date' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
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
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rowCount={pageSize} colCount={5} />
            ) : paged.length === 0 ? (
              <tr><td colSpan="5" className="table-empty">No transactions found.</td></tr>
            ) : (
              paged.map(tx => (
                <tr key={tx._id}>
                  <td style={{ paddingLeft: 24, color: '#64748b', fontSize: 13 }}>{new Date(tx.date).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                        background: tx.type === 'Credit Deposit' ? '#f0fdf4' : '#eff6ff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {tx.type === 'Credit Deposit' ?
                          <ArrowUpCircle size={14} color="#16a34a" /> :
                          <ShoppingBag size={14} color="#3b82f6" />
                        }
                      </div>
                      <strong style={{ fontSize: 13 }}>{tx.type}</strong>
                    </div>
                  </td>
                  <td style={{ color: '#475569', fontSize: 13 }}>{cleanDescription(tx.description)}</td>
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

      {/* ═══ Credit Confirmation Modal ═══ */}
      {confirmAmount !== null && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,25,47,0.7)', backdropFilter: 'blur(12px)',
          zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'cmFadeIn 0.25s ease'
        }}>
          <div style={{
            background: 'white', borderRadius: 24, width: '100%', maxWidth: 460,
            overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
            animation: 'cmScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
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
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0 }}>You are about to add credits to your account</p>
                </div>
                <button onClick={() => { setConfirmAmount(null); setRedirecting(false); }} style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '28px 32px' }}>
              {/* Amount display */}
              <div style={{ textAlign: 'center', marginBottom: 24, padding: '20px', background: '#f8fafc', borderRadius: 16 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Adding to your account</div>
                <div style={{ fontSize: 48, fontWeight: 800, color: '#0a192f', fontFamily: "'Poppins', sans-serif", letterSpacing: -1 }}>${confirmAmount}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>credits</div>
              </div>

              {/* Balance breakdown */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 14, color: '#64748b' }}>Current Balance</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>${balance.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', marginBottom: 28 }}>
                <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>New Balance</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#16a34a', fontFamily: "'Poppins', sans-serif" }}>${(balance + confirmAmount).toFixed(2)}</span>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => { setConfirmAmount(null); setRedirecting(false); }} className="secondary-btn" style={{ flex: 1, padding: 14, justifyContent: 'center' }}>Cancel</button>
                <button
                  onClick={() => addCredits(confirmAmount)}
                  disabled={redirecting}
                  style={{
                    flex: 2, padding: 14,
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#fff', border: 'none', borderRadius: 14,
                    fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    fontFamily: "'Poppins', sans-serif",
                    boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
                    opacity: redirecting ? 0.6 : 1,
                    transition: 'all 0.25s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}>
                  <CreditCard size={16} /> {redirecting ? 'Redirecting to Stripe...' : 'Proceed to Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes cmFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cmScaleIn { from { opacity: 0; transform: scale(0.9) translateY(20px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
    </DashboardLayout>
  );
}
