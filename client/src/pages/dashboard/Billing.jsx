import { useState, useEffect, useContext, useRef } from 'react';
import {
  Clock, ArrowUpCircle, ShoppingBag, CreditCard,
  Plus, Search, Wallet, X, CheckCircle, Zap
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TablePagination from '../../components/ui/TablePagination';
import TableSkeleton from '../../components/ui/TableSkeleton';

const cleanDescription = (desc) => {
  if (!desc) return '';
  return desc.replace(/\s*\(Session:.*?\)/gi, '').trim();
};

const CREDIT_PACKS = [
  { amount: 10,  label: '$10'  },
  { amount: 50,  label: '$50'  },
  { amount: 100, label: '$100', popular: true },
  { amount: 200, label: '$200' },
  { amount: 500, label: '$500' },
];

export default function Billing() {
  const { user, token, API_URL } = useContext(AuthContext);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [balance, setBalance]           = useState(user?.balance ?? 0);
  const [showSuccess, setShowSuccess]   = useState(false);
  const [balancePulse, setBalancePulse] = useState(false);
  const [searchTerm, setSearchTerm]     = useState('');
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(10);
  const [sortKey, setSortKey]           = useState('date');
  const [sortDir, setSortDir]           = useState('desc');
  const [confirmAmount, setConfirmAmount] = useState(null);
  const [redirecting, setRedirecting]   = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(100);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const processedRef = useRef(false);

  useEffect(() => {
    fetchBilling();
    const sid = searchParams.get('session_id');
    const success = searchParams.get('success');
    if (sid && success === 'true' && !processedRef.current) {
      processedRef.current = true;
      confirmPayment(sid);
      navigate('/dashboard/billing', { replace: true });
    } else if (success === 'true' && !sid) {
      navigate('/dashboard/billing', { replace: true });
    }
  }, []); // eslint-disable-line

  useEffect(() => { setPage(1); }, [searchTerm, sortKey, sortDir]);

  const fetchBilling = async () => {
    try {
      const headers = { 'x-auth-token': token };
      const [txRes, balRes] = await Promise.all([
        fetch(`${API_URL}/billing/transactions`, { headers }),
        fetch(`${API_URL}/billing/balance`, { headers }),
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
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (!data.alreadyProcessed && (data.balance !== undefined || data.msg?.includes('confirmed'))) {
        setShowSuccess(true);
        setBalancePulse(true);
        setTimeout(() => setShowSuccess(false), 5000);
        setTimeout(() => setBalancePulse(false), 3000);
      }
      fetchBilling();
    } catch (err) { console.error(err); }
  };

  const addCredits = async (amount) => {
    setRedirecting(true);
    try {
      const res = await fetch(`${API_URL}/billing/create-checkout-session`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
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
    else { setSortKey(key); setSortDir('asc'); }
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

      {/* Success toast */}
      {showSuccess && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 20000,
          padding: '14px 22px', borderRadius: 14,
          background: 'linear-gradient(135deg,#22c55e,#16a34a)',
          color: '#fff', fontWeight: 700, fontSize: 14,
          boxShadow: '0 10px 30px rgba(22,197,94,0.35)',
          animation: 'blSlideIn 0.4s cubic-bezier(0.16,1,0.3,1)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <CheckCircle size={18} /> Credits added to your account!
        </div>
      )}

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>
          Billing & Credits
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Manage your balance and view transaction history</p>
      </div>

      {/* ══════════════════════════════════════════════
          PREMIUM BALANCE CARD — balance + top-up inline
          ══════════════════════════════════════════════ */}
      <div style={{
        background: 'linear-gradient(135deg,#0a192f 0%,#112240 60%,#0d2240 100%)',
        borderRadius: 20, padding: '32px 36px', marginBottom: 28,
        boxShadow: '0 12px 36px rgba(10,25,47,0.28)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative glows */}
        <div style={{ position: 'absolute', top: '-30%', right: '-8%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle,rgba(249,115,22,0.14),transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-30%', left: '8%', width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle,rgba(59,130,246,0.08),transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'start' }}>

          {/* Left: balance */}
          <div>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>
              Available Balance
            </p>
            <div style={{
              fontSize: 52, fontWeight: 800, color: '#fff', fontFamily: "'Poppins',sans-serif",
              lineHeight: 1, letterSpacing: -1, marginBottom: 8,
              animation: balancePulse ? 'blPulse 0.5s ease' : 'none',
            }}>
              ${balance.toFixed(2)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
              <Wallet size={12} /> MoveLeads Credits
            </div>
          </div>

          {/* Right: quick top-up */}
          <div style={{ minWidth: 280 }}>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px' }}>
              Quick Top Up
            </p>

            {/* Amount selector pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {CREDIT_PACKS.map(pkg => {
                const active = selectedAmount === pkg.amount;
                return (
                  <button
                    key={pkg.amount}
                    type="button"
                    onClick={() => setSelectedAmount(pkg.amount)}
                    style={{
                      padding: '6px 14px', borderRadius: 9999, fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', border: '1.5px solid',
                      background: active ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                      color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                      borderColor: active ? '#f59e0b' : 'rgba(255,255,255,0.15)',
                      transition: 'all 0.15s',
                      position: 'relative',
                    }}
                  >
                    {pkg.label}
                    {pkg.popular && !active && (
                      <span style={{ position: 'absolute', top: -6, right: -4, background: '#f59e0b', color: '#fff', fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 4 }}>★</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Checkout button */}
            <button
              onClick={() => setConfirmAmount(selectedAmount)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                color: '#fff', border: 'none', borderRadius: 12, padding: '13px 20px',
                fontSize: 14, fontWeight: 700, fontFamily: "'Poppins',sans-serif",
                cursor: 'pointer', boxShadow: '0 6px 20px rgba(245,158,11,0.35)',
                transition: 'all 0.25s',
              }}
            >
              <Plus size={16} /> Add ${selectedAmount} Credits
            </button>
          </div>
        </div>
      </div>

      {/* ── Transaction History ── */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', overflow: 'hidden' }}>

        {/* Table header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={15} color="#3b82f6" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>Transaction History</span>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              type="text" placeholder="Search transactions…" value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '9px 9px 9px 34px', borderRadius: 10, border: '1px solid #e2e8f0', outline: 'none', fontSize: 13, width: 220, fontFamily: 'inherit' }}
              onFocus={e => (e.target.style.borderColor = '#ea580c')}
              onBlur={e  => (e.target.style.borderColor = '#e2e8f0')}
            />
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '11px 12px 11px 20px', textAlign: 'left' }}><SortBtn k="date" label="Date" /></th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}><SortBtn k="type" label="Type" /></th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</span>
              </th>
              <th style={{ padding: '11px 12px', textAlign: 'left' }}><SortBtn k="amount" label="Amount" /></th>
              <th style={{ padding: '11px 20px 11px 12px', textAlign: 'left' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rowCount={pageSize} colCount={5} />
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div style={{ padding: '52px 24px', textAlign: 'center' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                      <Zap size={22} color="#cbd5e1" />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>No transactions yet</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Add credits to get started</div>
                  </div>
                </td>
              </tr>
            ) : (
              paged.map(tx => (
                <tr
                  key={tx._id}
                  style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '14px 12px 14px 20px', fontSize: 12, color: '#64748b' }}>
                    {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '14px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: tx.type === 'Credit Deposit' ? '#f0fdf4' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {tx.type === 'Credit Deposit'
                          ? <ArrowUpCircle size={13} color="#16a34a" />
                          : <ShoppingBag size={13} color="#3b82f6" />}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{tx.type}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 12px', fontSize: 12, color: '#64748b' }}>
                    {cleanDescription(tx.description)}
                  </td>
                  <td style={{ padding: '14px 12px' }}>
                    <span style={{
                      fontWeight: 700, fontSize: 13,
                      color: tx.amount > 0 ? '#16a34a' : '#0f172a',
                      background: tx.amount > 0 ? '#f0fdf4' : '#f8fafc',
                      padding: '3px 10px', borderRadius: 8,
                    }}>
                      {Number(tx.amount) > 0 ? '+' : '-'}${Math.abs(Number(tx.amount) || 0).toFixed(2)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px 14px 12px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
                      background: tx.status === 'Completed' ? '#dcfce7' : '#fee2e2',
                      color: tx.status === 'Completed' ? '#16a34a' : '#dc2626',
                    }}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))
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

      {/* ── Confirm Purchase Modal ── */}
      {confirmAmount !== null && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,25,47,0.7)', backdropFilter: 'blur(12px)',
          zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'blFadeIn 0.25s ease',
        }}>
          <div style={{
            background: 'white', borderRadius: 24, width: '100%', maxWidth: 460,
            overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
            animation: 'blScaleIn 0.3s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <div style={{
              background: 'linear-gradient(135deg,#0a192f,#112240)',
              padding: '26px 30px', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: '-30%', right: '-10%', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle,rgba(249,115,22,0.15),transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ color: '#fff', fontSize: 19, fontWeight: 800, margin: '0 0 4px', fontFamily: "'Poppins',sans-serif" }}>Confirm Top Up</h2>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, margin: 0 }}>You're adding credits to your account</p>
                </div>
                <button
                  onClick={() => { setConfirmAmount(null); setRedirecting(false); }}
                  style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div style={{ padding: '26px 30px' }}>
              {/* Amount display */}
              <div style={{ textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: 16, marginBottom: 22 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Adding to your account</div>
                <div style={{ fontSize: 48, fontWeight: 800, color: '#0a192f', fontFamily: "'Poppins',sans-serif", letterSpacing: -1 }}>${confirmAmount}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>credits</div>
              </div>

              {/* Balance breakdown */}
              {[
                { label: 'Current Balance', value: `$${balance.toFixed(2)}`, color: '#0f172a' },
                { label: 'New Balance',     value: `$${(balance + confirmAmount).toFixed(2)}`, color: '#16a34a', bold: true },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{r.label}</span>
                  <span style={{ fontSize: r.bold ? 16 : 13, fontWeight: r.bold ? 800 : 600, color: r.color, fontFamily: r.bold ? "'Poppins',sans-serif" : 'inherit' }}>{r.value}</span>
                </div>
              ))}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
                <button
                  onClick={() => { setConfirmAmount(null); setRedirecting(false); }}
                  className="secondary-btn"
                  style={{ flex: 1, padding: 13, justifyContent: 'center' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => addCredits(confirmAmount)}
                  disabled={redirecting}
                  style={{
                    flex: 2, padding: 13, border: 'none', borderRadius: 14, fontWeight: 700, fontSize: 14,
                    cursor: 'pointer', fontFamily: "'Poppins',sans-serif",
                    background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                    color: '#fff', boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
                    opacity: redirecting ? 0.6 : 1, transition: 'all 0.25s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <CreditCard size={16} /> {redirecting ? 'Redirecting…' : 'Proceed to Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blSlideIn  { from { opacity:0; transform:translateX(40px) } to { opacity:1; transform:translateX(0) } }
        @keyframes blPulse    { 0%,100% { transform:scale(1) } 50% { transform:scale(1.04) } }
        @keyframes blFadeIn   { from { opacity:0 } to { opacity:1 } }
        @keyframes blScaleIn  { from { opacity:0; transform:scale(0.9) translateY(20px) } to { opacity:1; transform:scale(1) translateY(0) } }
      `}</style>
    </DashboardLayout>
  );
}
