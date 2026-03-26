import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  ZapOff, X, CheckCircle, User, Phone as PhoneIcon, Truck,
  Gavel, TrendingUp, ShoppingBag
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './LeadFeed.css';

const FEED_STATUSES = new Set(['Available', 'READY_FOR_DISTRIBUTION']);
const isDistributable = (l) => FEED_STATUSES.has(l.status) && l.auctionStatus !== 'sold' && l.auctionStatus !== 'expired';

/* ─── Countdown timer ──────────────────────────────────────────────────────── */
function CountdownTimer({ endsAt }) {
  const calc = useCallback(() => {
    const diff = new Date(endsAt) - Date.now();
    if (diff <= 0) return null;
    return { m: Math.floor(diff / 60000), s: Math.floor((diff % 60000) / 1000), total: diff };
  }, [endsAt]);

  const [t, setT] = useState(calc);
  useEffect(() => {
    setT(calc());
    const iv = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(iv);
  }, [calc]);

  if (!t) return <div style={{ textAlign: 'right' }}><span style={{ fontSize: 26, fontWeight: 800, color: '#ef4444', fontFamily: 'monospace' }}>00:00</span><div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>remaining</div></div>;
  const urgent = t.total < 5 * 60 * 1000;
  return (
    <div style={{ textAlign: 'right' }}>
      <span style={{ fontSize: 26, fontWeight: 800, color: urgent ? '#ef4444' : '#f1f5f9', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
        {String(t.m).padStart(2, '0')}:{String(t.s).padStart(2, '0')}
      </span>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>remaining</div>
    </div>
  );
}

/* ─── Grade badge ──────────────────────────────────────────────────────────── */
function GradeBadge({ grade }) {
  const MAP = {
    A: { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
    B: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
    C: { bg: 'rgba(148,163,184,0.15)',color: '#94a3b8', border: 'rgba(148,163,184,0.3)' },
    D: { bg: 'rgba(148,163,184,0.1)', color: '#64748b', border: 'rgba(148,163,184,0.2)' },
  };
  if (!grade) return null;
  const s = MAP[grade] || MAP.C;
  return <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>Grade {grade}</span>;
}

/* ─── Bid modal ────────────────────────────────────────────────────────────── */
function BidModal({ lead, balance, onClose, onBid }) {
  const minBid = (lead.currentBidPrice || lead.startingBidPrice || 9) + 5;
  const [amount, setAmount] = useState(minBid);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async () => {
    if (amount < minBid) { setErr(`Minimum bid is $${minBid}`); return; }
    if (amount > balance) { setErr('Insufficient balance'); return; }
    setSubmitting(true);
    try { await onBid(amount); } finally { setSubmitting(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div style={{ background: '#1a2234', borderRadius: 20, padding: 28, width: '100%', maxWidth: 420, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', fontFamily: "'Poppins',sans-serif" }}>
            <Gavel size={16} style={{ marginRight: 8, verticalAlign: 'middle', color: '#ea580c' }} />Place a Bid
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#94a3b8' }}>
          {lead.originCity} → {lead.destinationCity} · {lead.homeSize}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
          <span>Current bid</span><span style={{ color: '#22c55e', fontWeight: 700 }}>${lead.currentBidPrice || lead.startingBidPrice || 9}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          <span>Your balance</span><span style={{ color: '#f1f5f9', fontWeight: 700 }}>${balance.toFixed(2)}</span>
        </div>

        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Your Bid ($)</label>
        <input
          type="number" min={minBid} step={5} value={amount}
          onChange={e => { setAmount(Number(e.target.value)); setErr(''); }}
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 14px', color: '#f1f5f9', fontSize: 18, fontWeight: 800, outline: 'none', fontFamily: 'monospace' }}
        />
        {err && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: submitting ? '#334155' : 'linear-gradient(135deg,#ea580c,#c2410c)', color: '#fff', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: "'Poppins',sans-serif" }}>
            {submitting ? 'Placing…' : `Bid $${amount}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Auction lead card ────────────────────────────────────────────────────── */
function AuctionCard({ lead, balance, onBuyNow, onBid, index }) {
  const [claimed, setClaimed] = useState(lead.auctionStatus === 'sold' || lead.auctionStatus === 'expired');
  const [currentBid, setCurrentBid] = useState(lead.currentBidPrice || 0);
  const [endsAt, setEndsAt] = useState(lead.auctionEndsAt);
  const [totalBids, setTotalBids] = useState(lead.bids?.length || 0);
  const [bidModal, setBidModal] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);

  // Listen for real-time updates via parent-supplied callback refs
  useEffect(() => {
    lead._onBidUpdate = (d) => { setCurrentBid(d.currentBidPrice); setEndsAt(d.auctionEndsAt); setTotalBids(d.totalBids); };
    lead._onSold      = () => setClaimed(true);
    lead._onSettled   = () => setClaimed(true);
  });

  const days = endsAt ? (new Date(endsAt) - Date.now()) / 86400000 : 60;
  const isUrgent  = lead.moveDate && (new Date(lead.moveDate) - Date.now()) / 86400000 <= 7;
  const isSurge   = (lead.buyNowPrice || 0) > 30;
  const displayBid = currentBid > 0 ? currentBid : null;

  const handleBuyNow = async () => {
    setBuyingNow(true);
    try { await onBuyNow(lead); } finally { setBuyingNow(false); }
  };

  const handleBid = async (amount) => {
    await onBid(lead, amount);
    setBidModal(false);
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD';

  return (
    <>
      <div style={{
        background: claimed ? '#111827' : '#1a2234',
        borderRadius: 18, border: `1px solid ${claimed ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}`,
        padding: 22, position: 'relative', overflow: 'hidden',
        animationDelay: `${index * 0.05}s`, animation: 'slideIn 0.35s ease both',
        opacity: claimed ? 0.5 : 1, transition: 'opacity 0.4s',
        boxShadow: claimed ? 'none' : '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        {/* ── Row 1: Route + Timer ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', fontFamily: "'Poppins',sans-serif", letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {lead.originCity}, {lead.originZip?.slice(0,2) ? lead.originState || '' : ''} → {lead.destinationCity}
            </div>
            {/* ── Badges ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <GradeBadge grade={lead.grade} />
              {isSurge && (
                <span style={{ background: 'rgba(234,88,12,0.15)', color: '#f97316', border: '1px solid rgba(234,88,12,0.3)', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700, animation: 'surgePulse 2s ease-in-out infinite' }}>
                  ⚡ Surge Pricing
                </span>
              )}
              {isUrgent && (
                <span style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                  🔥 Urgent Move
                </span>
              )}
            </div>
          </div>
          {!claimed && endsAt ? (
            <div style={{ flexShrink: 0 }}><CountdownTimer endsAt={endsAt} /></div>
          ) : claimed ? (
            <div style={{ background: '#374151', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#94a3b8', flexShrink: 0 }}>Claimed</div>
          ) : null}
        </div>

        {/* ── Row 2: Stats tiles ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Distance',  value: lead.miles ? `${lead.miles.toLocaleString()} mi` : '—' },
            { label: 'Home size', value: lead.homeSize || '—' },
            { label: 'Move date', value: fmtDate(lead.moveDate) },
          ].map(t => (
            <div key={t.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{t.value}</div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* ── Row 3: Pricing box ── */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          {displayBid !== null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 14, color: '#94a3b8' }}>Current bid</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', fontFamily: 'monospace' }}>${displayBid}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 14, color: '#94a3b8' }}>Starting bid</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', fontFamily: 'monospace' }}>${lead.startingBidPrice || 9}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: totalBids > 0 ? 10 : 0 }}>
            <span style={{ fontSize: 14, color: '#94a3b8' }}>Buy now price</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa', fontFamily: 'monospace' }}>${lead.buyNowPrice || 25}</span>
          </div>
          {totalBids > 0 && (
            <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
              {totalBids} mover{totalBids > 1 ? 's have' : ' has'} bid on this lead
            </div>
          )}
        </div>

        {/* ── Row 4: Action buttons ── */}
        {!claimed && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setBidModal(true)} style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#f1f5f9', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Poppins',sans-serif", transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              Place Bid
            </button>
            <button onClick={handleBuyNow} disabled={buyingNow} style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: 'none', background: buyingNow ? '#334155' : 'rgba(96,165,250,0.15)', color: buyingNow ? '#94a3b8' : '#60a5fa', fontWeight: 700, fontSize: 14, cursor: buyingNow ? 'not-allowed' : 'pointer', fontFamily: "'Poppins',sans-serif", border: '1px solid rgba(96,165,250,0.25)' }}>
              {buyingNow ? 'Claiming…' : `Buy Now $${lead.buyNowPrice || 25}`}
            </button>
          </div>
        )}
      </div>

      {bidModal && (
        <BidModal lead={{ ...lead, currentBidPrice: currentBid }} balance={balance} onClose={() => setBidModal(false)} onBid={handleBid} />
      )}

      <style>{`
        @keyframes slideIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes surgePulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
      `}</style>
    </>
  );
}

/* ─── Legacy lead card (no auction fields) ─────────────────────────────────── */
function LegacyLeadCard({ lead, onClaim, index }) {
  const [claiming, setClaiming] = useState(false);
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD';

  const handleClaim = async () => {
    setClaiming(true);
    try { await onClaim(lead); } finally { setClaiming(false); }
  };

  return (
    <div style={{
      background: '#1e293b',
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.08)',
      padding: 22,
      animationDelay: `${index * 0.05}s`,
      animation: 'slideIn 0.35s ease both',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    }}>
      {/* Row 1: Route + price */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', fontFamily: "'Poppins',sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {lead.originCity} → {lead.destinationCity}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            <GradeBadge grade={lead.grade} />
            <span style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
              {lead.distance || 'Long Distance'}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa', fontFamily: 'monospace' }}>${lead.price || lead.buyNowPrice || 25}</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>flat rate</div>
        </div>
      </div>

      {/* Row 2: Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Distance',  value: lead.miles ? `${lead.miles.toLocaleString()} mi` : '—' },
          { label: 'Home size', value: lead.homeSize || '—' },
          { label: 'Move date', value: fmtDate(lead.moveDate) },
        ].map(t => (
          <div key={t.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{t.value}</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Row 3: Claim button */}
      <button
        onClick={handleClaim}
        disabled={claiming}
        style={{
          width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
          background: claiming ? '#334155' : 'linear-gradient(135deg,#3b82f6,#2563eb)',
          color: claiming ? '#94a3b8' : '#fff',
          fontWeight: 700, fontSize: 14, cursor: claiming ? 'not-allowed' : 'pointer',
          fontFamily: "'Poppins',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <ShoppingBag size={15} />
        {claiming ? 'Claiming…' : `Claim Lead — $${lead.price || lead.buyNowPrice || 25}`}
      </button>
    </div>
  );
}

/* ─── Success modal (kept from original) ───────────────────────────────────── */
function SuccessModal({ data, onClose, onNavigate }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content success-modal">
        <div className="success-icon-box"><CheckCircle size={48} /></div>
        <h2>Lead Unlocked!</h2>
        <p>You now have full access to the customer's contact details.</p>
        <div className="contact-details-box">
          <div className="detail-item"><User size={18} /><div><label>Customer Name</label><span>{data.lead.customerName}</span></div></div>
          <div className="detail-item"><PhoneIcon size={18} /><div><label>Phone Number</label><span>{data.lead.customerPhone}</span></div></div>
          <div className="detail-item"><Truck size={18} /><div><label>Move Target</label><span>{data.lead.originCity} to {data.lead.destinationCity}</span></div></div>
        </div>
        <div className="modal-actions">
          <button className="view-btn" onClick={onNavigate}>Go to My Customers</button>
          <button className="close-success-btn" onClick={onClose}>Continue Feeding</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main feed ────────────────────────────────────────────────────────────── */
export default function LeadFeed() {
  const { API_URL, SOCKET_URL, token, user, refreshUser } = useContext(AuthContext);
  const navigate  = useNavigate();
  const [leads, setLeads]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [successData, setSuccessData]   = useState(null);
  const audioRef  = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'));
  const pollRef   = useRef(null);
  const cardRefs  = useRef({});  // leadId → card element (for bid updates)

  const fetchLeads = useCallback(async () => {
    try {
      const res  = await fetch(`${API_URL}/leads`, { headers: { 'x-auth-token': token } });
      const data = await res.json();
      if (Array.isArray(data)) setLeads(data.filter(isDistributable));
    } catch (e) { console.error('[LeadFeed]', e); }
    finally { setLoading(false); }
  }, [API_URL, token]);

  const startPolling = useCallback(() => {
    if (!pollRef.current) pollRef.current = setInterval(fetchLeads, 30_000);
  }, [fetchLeads]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    fetchLeads();

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnection: true, reconnectionAttempts: Infinity,
      reconnectionDelay: 2000, reconnectionDelayMax: 30_000, timeout: 20_000,
    });

    socket.on('connect',    () => { setSocketStatus('connected');    stopPolling(); fetchLeads(); });
    socket.on('disconnect', () => { setSocketStatus('reconnecting'); startPolling(); });
    socket.on('connect_error', () => { setSocketStatus('reconnecting'); startPolling(); });

    socket.on('NEW_LEAD_AVAILABLE', (lead) => {
      if (!isDistributable(lead)) return;
      audioRef.current.play().catch(() => {});
      setLeads(prev => [lead, ...prev.filter(l => (l._id || l.id) !== (lead._id || lead.id))]);
    });

    // Live bid update — patch the matching card's state via attached callback
    socket.on('bid_update', (d) => {
      setLeads(prev => prev.map(l =>
        (l._id || l.id)?.toString() === d.leadId?.toString()
          ? { ...l, currentBidPrice: d.currentBidPrice, auctionEndsAt: d.auctionEndsAt, bids: Array(d.totalBids).fill(null) }
          : l
      ));
    });

    // Lead claimed via Buy Now
    socket.on('lead_sold', (d) => {
      setLeads(prev => prev.map(l =>
        (l._id || l.id)?.toString() === d.leadId?.toString()
          ? { ...l, auctionStatus: 'sold' }
          : l
      ));
    });

    // Auction timer expired
    socket.on('auction_settled', (d) => {
      setLeads(prev => prev.map(l =>
        (l._id || l.id)?.toString() === d.leadId?.toString()
          ? { ...l, auctionStatus: 'sold', finalPrice: d.finalPrice }
          : l
      ));
    });

    return () => { stopPolling(); socket.disconnect(); };
  }, [SOCKET_URL, token, fetchLeads, startPolling, stopPolling]);

  const handleBuyNow = async (lead) => {
    const res  = await fetch(`${API_URL}/bids/${lead._id || lead.id}/buy-now`, {
      method: 'POST',
      headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed to claim lead'); return; }
    setLeads(prev => prev.map(l => (l._id || l.id)?.toString() === (lead._id || lead.id)?.toString() ? { ...l, auctionStatus: 'sold' } : l));
    setSuccessData({ lead: data.lead || lead });
    refreshUser();
  };

  const handleClaim = async (lead) => {
    const res  = await fetch(`${API_URL}/leads/${lead._id || lead.id}/claim`, {
      method: 'POST',
      headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) { alert(data.msg || 'Failed to claim lead'); return; }
    setLeads(prev => prev.filter(l => (l._id || l.id)?.toString() !== (lead._id || lead.id)?.toString()));
    setSuccessData({ lead: data.lead || lead });
    refreshUser();
  };

  const handleBid = async (lead, amount) => {
    const res  = await fetch(`${API_URL}/bids/${lead._id || lead.id}`, {
      method: 'POST',
      headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed to place bid'); return; }
    setLeads(prev => prev.map(l =>
      (l._id || l.id)?.toString() === (lead._id || lead.id)?.toString()
        ? { ...l, currentBidPrice: data.currentBidPrice, auctionEndsAt: data.auctionEndsAt }
        : l
    ));
  };

  const balance = user?.balance || 0;

  return (
    <DashboardLayout>
      <div className="lead-feed-container">
        {/* ── Header ── */}
        <header className="feed-header">
          <div className="header-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <TrendingUp size={22} color="#ea580c" />
              <h1 className="feed-title" style={{ margin: 0 }}>Live Auction Feed</h1>
            </div>
            <p className="feed-subtitle">Bid on leads in real time — highest bidder wins or Buy Now instantly</p>
          </div>
          <div className={`connection-badge ${socketStatus === 'connected' ? 'online' : socketStatus === 'reconnecting' ? 'reconnecting' : 'offline'}`}>
            <div className="pulse-dot" />
            <span>{socketStatus === 'connected' ? 'Live' : socketStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</span>
          </div>
        </header>

        {/* ── Balance pill ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
            Balance: ${balance.toFixed(2)}
          </div>
        </div>

        {loading ? (
          <div className="feed-loading"><div className="spinner" /><span>Scanning for live opportunities…</span></div>
        ) : leads.length === 0 ? (
          <div className="empty-feed">
            <div className="empty-icon-box"><ZapOff size={32} /></div>
            <h3>No Live Auctions Right Now</h3>
            <p>We'll notify you with a sound as soon as a new lead hits your territory.</p>
          </div>
        ) : (
          <div className="leads-grid">
            {leads.map((lead, i) => lead.auctionStatus === 'active' ? (
              <AuctionCard
                key={lead._id || lead.id}
                lead={lead}
                balance={balance}
                onBuyNow={handleBuyNow}
                onBid={handleBid}
                index={i}
              />
            ) : (
              <LegacyLeadCard
                key={lead._id || lead.id}
                lead={lead}
                onClaim={handleClaim}
                index={i}
              />
            ))}
          </div>
        )}
      </div>

      {successData && (
        <SuccessModal
          data={successData}
          onClose={() => setSuccessData(null)}
          onNavigate={() => { setSuccessData(null); navigate('/dashboard/customers'); }}
        />
      )}
    </DashboardLayout>
  );
}
