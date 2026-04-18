import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  ZapOff, X, CheckCircle, User, Phone as PhoneIcon, Truck,
  Gavel, Clock, Package, Search, SlidersHorizontal, Zap
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './LeadFeed.css';
import { playNewLeadSound } from '../../utils/sound';

const FEED_STATUSES = new Set(['Available', 'READY_FOR_DISTRIBUTION']);
const isDistributable = (l) =>
  FEED_STATUSES.has(l.status) &&
  l.auctionStatus !== 'sold' &&
  l.auctionStatus !== 'expired';

/* ─── Inline countdown tag ─────────────────────────────────────────────────── */
function TimeLeftTag({ endsAt }) {
  const calc = useCallback(() => {
    const diff = new Date(endsAt) - Date.now();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (h >= 24) return { label: `${Math.floor(h / 24)}d left`, urgent: false };
    if (h >= 1)  return { label: `${h}h left`,  urgent: false };
    return { label: `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} left`, urgent: true };
  }, [endsAt]);

  const [t, setT] = useState(calc);
  useEffect(() => {
    setT(calc());
    const iv = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(iv);
  }, [calc]);

  if (!t) return null;
  return (
    <span style={{
      display: 'inline-block',
      background: t.urgent ? '#fef2f2' : '#fff7ed',
      color: t.urgent ? '#dc2626' : '#ea580c',
      border: `1px solid ${t.urgent ? '#fecaca' : '#fed7aa'}`,
      borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700,
    }}>
      {t.label}
    </span>
  );
}

/* ─── Bid modal ────────────────────────────────────────────────────────────── */
function BidModal({ lead, balance, onClose, onBid }) {
  const minBid = (lead.currentBidPrice || lead.startingBidPrice || 9) + 5;
  const [amount, setAmount] = useState(minBid);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (amount < minBid)  { setErr(`Minimum bid is $${minBid}`); return; }
    if (amount > balance) { setErr('Insufficient balance'); return; }
    setSubmitting(true);
    try { await onBid(amount); } finally { setSubmitting(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Gavel size={16} color="#ea580c" /> Place a Bid
          </h3>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#475569' }}>
            {lead.originCity} → {lead.destinationCity} · {lead.homeSize}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 4 }}>
            <span>Current bid</span>
            <strong style={{ color: '#16a34a' }}>${lead.currentBidPrice || lead.startingBidPrice || 9}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            <span>Your balance</span><strong>${balance.toFixed(2)}</strong>
          </div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Your Bid ($)</label>
          <input
            type="number" min={minBid} step={5} value={amount}
            onChange={e => { setAmount(Number(e.target.value)); setErr(''); }}
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '11px 14px', fontSize: 18, fontWeight: 800, outline: 'none', color: '#0f172a' }}
          />
          {err && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{err}</div>}
          <div className="modal-actions" style={{ marginTop: 18 }}>
            <button className="cancel-btn" onClick={onClose}>Cancel</button>
            <button className="confirm-btn" onClick={submit} disabled={submitting}
              style={{ background: 'linear-gradient(135deg,#ea580c,#c2410c)' }}>
              {submitting ? 'Placing…' : `Bid $${amount}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared price helper — single source of truth ─────────────────────────── */
const getLeadPrice = (lead) => lead.buyNowPrice || lead.price || 0;

/* ─── Preview modal (read-only — no purchase happens here) ─────────────────── */
function PreviewModal({ lead, balance, onClose, onClaim, onBid, onBuyNow, claiming, error }) {
  const isAuction   = lead.auctionStatus === 'active';
  const currentBid  = lead.currentBidPrice || 0;
  const buyNowPrice = getLeadPrice(lead);
  const displayPrice = isAuction
    ? (currentBid > 0 ? currentBid : lead.startingBidPrice || buyNowPrice)
    : buyNowPrice;
  const isLD        = lead.distance === 'Long Distance';
  const daysToMove  = lead.moveDate ? (new Date(lead.moveDate) - Date.now()) / 86400000 : 99;

  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 700, color: '#0f172a' }}>{value}</span>
    </div>
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 480 }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#0a192f,#112240)', padding: '22px 28px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Lead Preview</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
              {lead.originZip} → {lead.destinationZip}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
              {lead.originCity} → {lead.destinationCity}
            </div>
          </div>
          <button className="close-btn" onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: 'rgba(255,255,255,0.7)', borderRadius: 9, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '22px 28px' }}>
          {/* Lead details */}
          <Row label="Home Size"  value={lead.homeSize || '—'} />
          <Row label="Move Date"  value={lead.moveDate ? new Date(lead.moveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'} />
          <Row label="Distance"   value={isLD ? 'Long Distance' : 'Local'} />
          {lead.miles > 0 && <Row label="Miles" value={`${lead.miles} mi`} />}
          {lead.grade && <Row label="Lead Grade" value={lead.grade === 'A' ? '⭐ A — Premium' : lead.grade} />}
          {daysToMove <= 7 && daysToMove > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '8px 14px', marginTop: 12, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
              ⚡ Moving {daysToMove <= 1 ? 'today' : `in ${Math.ceil(daysToMove)} days`} — act fast!
            </div>
          )}

          {/* Locked contact teaser */}
          <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: '14px 16px', marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={18} color="#94a3b8" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: 4, marginBottom: 2 }}>••••• ••••••••</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Name & contact info unlocked after claiming</div>
            </div>
          </div>

          {/* Price + actions */}
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isAuction ? (currentBid > 0 ? 'Current Bid' : 'Starting Bid') : 'Price'}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>${displayPrice.toFixed ? displayPrice.toFixed(2) : displayPrice}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Balance</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: balance >= displayPrice ? '#16a34a' : '#dc2626' }}>${balance.toFixed(2)}</div>
              </div>
            </div>

            {/* Inline error — shown when claim/buy fails */}
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: error.includes('balance') || error.includes('Insufficient') ? 8 : 0 }}>
                  {error}
                </div>
                {(error.includes('balance') || error.includes('Insufficient')) && (
                  <button
                    onClick={() => window.open('/dashboard/billing', '_blank')}
                    style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Add Funds →
                  </button>
                )}
              </div>
            )}

            {isAuction ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { onClose(); onBid(lead); }}
                  style={{ flex: 1, ...BTN_OUTLINE, borderRadius: 12, padding: '12px' }}>
                  Place Bid
                </button>
                <button
                  onClick={() => onBuyNow(lead)}
                  disabled={claiming}
                  style={{ flex: 2, ...BTN_PRIMARY, borderRadius: 12, padding: '12px', opacity: claiming ? 0.6 : 1 }}>
                  {claiming ? 'Claiming…' : `Buy Now $${buyNowPrice.toFixed(2)} ›`}
                </button>
              </div>
            ) : (
              <button
                onClick={() => onClaim(lead)}
                disabled={claiming}
                style={{ width: '100%', ...BTN_PRIMARY, borderRadius: 12, padding: '13px', fontSize: 14, opacity: claiming ? 0.6 : 1 }}>
                {claiming ? 'Claiming…' : `Claim Lead — $${buyNowPrice.toFixed(2)} ›`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Success modal (buy-now + auction win) ─────────────────────────────────── */
function SuccessModal({ data, onClose, onNavigate }) {
  const fromAuction = data.fromAuction;
  const hasContact  = data.lead?.customerName && data.lead?.customerPhone;
  return (
    <div className="modal-overlay">
      <div className="modal-content success-modal">
        <div className="success-icon-box">
          {fromAuction ? <Gavel size={48} /> : <CheckCircle size={48} />}
        </div>
        <h2>{fromAuction ? 'Auction Won!' : 'Lead Unlocked!'}</h2>
        {fromAuction ? (
          <p>
            You won the auction with a bid of <strong>${data.finalPrice}</strong>.
            The amount has been deducted from your balance and the lead is now in your customers.
          </p>
        ) : (
          <p>You now have full access to the customer's contact details.</p>
        )}
        {hasContact && (
          <div className="contact-details-box">
            <div className="detail-item"><User size={18} /><div><label>Customer Name</label><span>{data.lead.customerName}</span></div></div>
            <div className="detail-item"><PhoneIcon size={18} /><div><label>Phone Number</label><span>{data.lead.customerPhone}</span></div></div>
            <div className="detail-item"><Truck size={18} /><div><label>Move Target</label><span>{data.lead.originCity} to {data.lead.destinationCity}</span></div></div>
          </div>
        )}
        <div className="modal-actions">
          <button className="view-btn" onClick={onNavigate}>Go to My Customers</button>
          <button className="close-success-btn" onClick={onClose}>Continue Feeding</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : 'TBD';

const timeAgo = (d) => {
  if (!d) return '—';
  const diff = Date.now() - new Date(d);
  if (diff < 60000)    return 'Just now';
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

/* ─── Main ─────────────────────────────────────────────────────────────────── */
export default function LeadFeed() {
  const { API_URL, SOCKET_URL, token, user, refreshUser } = useContext(AuthContext);
  const navigate   = useNavigate();
  const [leads, setLeads]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [successData, setSuccessData]   = useState(null);
  const [previewLead, setPreviewLead]   = useState(null);
  const [claimError, setClaimError]     = useState('');
  const [bidLead, setBidLead]           = useState(null);
  const [claimingId, setClaimingId]     = useState(null);
  const [search, setSearch]             = useState('');
  const [distFilter, setDistFilter]     = useState('all');
  const [outbidToast, setOutbidToast]   = useState(''); // "you were outbid" banner
  const audioRef  = useRef(null); // kept for compatibility; sound now via playNewLeadSound()
  const pollRef   = useRef(null);
  const myBidsRef = useRef(new Set()); // lead IDs the current user has bid on

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
      auth: { token }, transports: ['polling', 'websocket'],
      reconnection: true, reconnectionAttempts: Infinity,
      reconnectionDelay: 2000, reconnectionDelayMax: 30_000, timeout: 20_000,
    });
    socket.on('connect',       () => { setSocketStatus('connected');    stopPolling(); fetchLeads(); });
    socket.on('disconnect',    () => { setSocketStatus('reconnecting'); startPolling(); });
    socket.on('connect_error', () => { setSocketStatus('reconnecting'); startPolling(); });
    socket.on('NEW_LEAD_AVAILABLE', (lead) => {
      console.log('[Sound] NEW_LEAD_AVAILABLE received, distributable:', isDistributable(lead));
      if (!isDistributable(lead)) return;
      playNewLeadSound();
      setLeads(prev => [lead, ...prev.filter(l => (l._id||l.id) !== (lead._id||lead.id))]);
    });
    socket.on('bid_update', (d) => {
      setLeads(prev => prev.map(l =>
        (l._id||l.id)?.toString() === d.leadId?.toString()
          ? { ...l, currentBidPrice: d.currentBidPrice, auctionEndsAt: d.auctionEndsAt, bids: Array(d.totalBids).fill(null) }
          : l
      ));
    });
    socket.on('lead_sold', (d) => {
      // Guard: skip if this was our own buy-now purchase — handleBuyNow already updated state
      if (d.buyerId && d.buyerId === user?._id?.toString()) return;
      setLeads(prev => prev.filter(l => (l._id||l.id)?.toString() !== d.leadId?.toString()));
    });
    socket.on('auction_settled', (d) => {
      const winnerId = d.winnerId?.toString();
      const leadId   = d.leadId?.toString();
      const isWinner = winnerId && winnerId === user?._id?.toString();

      setLeads(prev => {
        const wonLead = prev.find(l => (l._id||l.id)?.toString() === leadId);

        if (isWinner) {
          // Cron settled this auction in our favour — show success + refresh balance
          setTimeout(() => {
            setSuccessData({ lead: wonLead || { _id: leadId }, finalPrice: d.finalPrice, fromAuction: true });
            refreshUser();
          }, 0);
        } else if (myBidsRef.current.has(leadId)) {
          // We bid on this lead but someone else won
          myBidsRef.current.delete(leadId);
          setTimeout(() => {
            setOutbidToast('You were outbid — this lead was claimed by another mover.');
          }, 0);
        }

        return prev.filter(l => (l._id||l.id)?.toString() !== leadId);
      });
    });
    return () => { stopPolling(); socket.disconnect(); };
  }, [SOCKET_URL, token, fetchLeads, startPolling, stopPolling]);

  const handleBuyNow = async (lead) => {
    const id      = (lead._id || lead.id)?.toString();
    const balance = user?.balance || 0;
    const price   = getLeadPrice(lead);

    // Pre-flight: catch insufficient balance before hitting the server
    if (balance < price) {
      setClaimError('Insufficient balance. Please add funds to your account.');
      setPreviewLead(lead); // Open modal so the error + "Add Funds" button are visible
      return;
    }

    setClaimingId(id);
    try {
      const res  = await fetch(`${API_URL}/bids/${id}/buy-now`, { method: 'POST', headers: { 'x-auth-token': token, 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) {
        setClaimError(data.error || 'Failed to claim lead. Please try again.');
        setPreviewLead(lead); // Ensure modal is open so error is visible
        return;
      }
      setPreviewLead(null);
      setClaimError('');
      setLeads(prev => prev.filter(l => (l._id||l.id)?.toString() !== id));
      setSuccessData({ lead: data.lead || lead });
      refreshUser();
    } finally { setClaimingId(null); }
  };

  const handleBid = async (amount) => {
    if (!bidLead) return;
    const id  = (bidLead._id || bidLead.id)?.toString();
    const res = await fetch(`${API_URL}/bids/${id}`, { method: 'POST', headers: { 'x-auth-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed to place bid'); return; }
    myBidsRef.current.add(id); // Track that we have an active bid on this lead
    setLeads(prev => prev.map(l => (l._id||l.id)?.toString() === id ? { ...l, currentBidPrice: data.currentBidPrice, auctionEndsAt: data.auctionEndsAt } : l));
    setBidLead(null);
  };

  const handleClaim = async (lead) => {
    const id = (lead._id || lead.id)?.toString();
    setClaimingId(id);
    setClaimError('');
    try {
      const res  = await fetch(`${API_URL}/leads/${id}/claim`, { method: 'POST', headers: { 'x-auth-token': token, 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) {
        setClaimError(data.msg || 'Failed to claim lead. Please try again.');
        return;
      }
      setPreviewLead(null);
      setClaimError('');
      setLeads(prev => prev.filter(l => (l._id||l.id)?.toString() !== id));
      setSuccessData({ lead: data.lead || lead });
      refreshUser();
    } finally { setClaimingId(null); }
  };

  // Client-side filter
  const q = search.toLowerCase();
  const visible = leads.filter(l => {
    if (distFilter === 'local' && l.distance !== 'Local') return false;
    if (distFilter === 'long'  && l.distance !== 'Long Distance') return false;
    if (!q) return true;
    return (
      l.originCity?.toLowerCase().includes(q) ||
      l.destinationCity?.toLowerCase().includes(q) ||
      l.originZip?.includes(q) ||
      l.destinationZip?.includes(q)
    );
  });

  const balance = user?.balance || 0;

  return (
    <DashboardLayout>
      <div className="lead-feed-container">

        {/* ── Page header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
              Live Leads Market
            </h1>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
              Real-time, phone-verified homeowners moving in your area.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {visible.length > 0 && (
              <div style={{ background: 'linear-gradient(135deg,#f59e0b,#ea580c)', color: 'white', borderRadius: 20, padding: '7px 16px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={13} /> {visible.length} Available
              </div>
            )}
            <div className={`connection-badge ${socketStatus === 'connected' ? 'online' : socketStatus === 'reconnecting' ? 'reconnecting' : 'offline'}`}>
              <div className="pulse-dot" />
              <span>{socketStatus === 'connected' ? 'Live' : socketStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</span>
            </div>
          </div>
        </div>

        {/* ── Search + filter bar ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search city, ZIP..."
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 38, paddingRight: 16, height: 42, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#0f172a', outline: 'none', background: 'white' }}
            />
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <SlidersHorizontal size={14} style={{ position: 'absolute', left: 12, color: '#94a3b8', pointerEvents: 'none' }} />
            <select
              value={distFilter}
              onChange={e => setDistFilter(e.target.value)}
              style={{ paddingLeft: 32, paddingRight: 16, height: 42, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#0f172a', outline: 'none', background: 'white', cursor: 'pointer', appearance: 'none', minWidth: 140 }}
            >
              <option value="all">All Distances</option>
              <option value="local">Local</option>
              <option value="long">Long Distance</option>
            </select>
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="feed-loading"><div className="spinner" /><span>Scanning for live opportunities…</span></div>
        ) : visible.length === 0 ? (
          <div className="empty-feed">
            <div className="empty-icon-box"><ZapOff size={32} /></div>
            <h3>{search || distFilter !== 'all' ? 'No results match your filter' : 'No Live Leads Right Now'}</h3>
            <p>{search || distFilter !== 'all' ? 'Try a different search or filter.' : "We'll notify you with a sound as soon as a new lead hits your territory."}</p>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {[
                    { label: 'Route',     style: { minWidth: 220 } },
                    { label: 'Est. Size', style: {} },
                    { label: 'Move Date', style: {} },
                    { label: 'Listed ↓',  style: {} },
                    { label: 'Price',     style: {} },
                    { label: 'Action',    style: { textAlign: 'right' } },
                  ].map(h => (
                    <th key={h.label} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', background: '#fafafa', ...h.style }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((lead, i) => {
                  const id        = (lead._id || lead.id)?.toString();
                  const isAuction = lead.auctionStatus === 'active';
                  const isLD      = lead.distance === 'Long Distance';
                  const daysToMove = lead.moveDate ? (new Date(lead.moveDate) - Date.now()) / 86400000 : 99;
                  const isToday   = lead.moveDate ? new Date(lead.moveDate).toDateString() === new Date().toDateString() : false;
                  const isUrgent  = daysToMove > 1 && daysToMove <= 7;
                  const isPremium = lead.grade === 'A';
                  const currentBid = lead.currentBidPrice || 0;
                  const buyNowPrice  = getLeadPrice(lead);
                  const displayPrice = isAuction
                    ? (currentBid > 0 ? currentBid : lead.startingBidPrice || buyNowPrice)
                    : buyNowPrice;

                  return (
                    <tr
                      key={id}
                      style={{ borderBottom: i < visible.length - 1 ? '1px solid #f8fafc' : 'none', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafbff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* ── Route ── */}
                      <td style={{ padding: '18px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{lead.originZip || '—'}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{lead.originCity}</div>
                          </div>
                          <div style={{ color: '#cbd5e1', fontSize: 16, fontWeight: 300, margin: '0 2px' }}>→</div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{lead.destinationZip || '—'}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{lead.destinationCity}</div>
                          </div>
                        </div>
                        {/* Tags */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          <span style={{ ...TAG_BASE, background: isLD ? '#f0f4ff' : '#f0fdf4', color: isLD ? '#3b5bdb' : '#16a34a', border: `1px solid ${isLD ? '#c5d3ff' : '#bbf7d0'}` }}>
                            {isLD ? 'Long Distance' : 'Local'}
                          </span>
                          {isAuction && lead.auctionEndsAt && <TimeLeftTag endsAt={lead.auctionEndsAt} />}
                          {isToday  && <span style={{ ...TAG_BASE, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>Today!</span>}
                          {isUrgent && <span style={{ ...TAG_BASE, background: '#fff7ed', color: '#d97706', border: '1px solid #fde68a' }}>Urgent</span>}
                          {isPremium && (
                            <span style={{ ...TAG_BASE, background: 'linear-gradient(135deg,#f59e0b,#ea580c)', color: 'white', border: 'none' }}>
                              ⭐ Premium Lead
                            </span>
                          )}
                        </div>
                      </td>

                      {/* ── Est. Size ── */}
                      <td style={{ padding: '18px 20px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 13, fontWeight: 600 }}>
                          <Package size={14} color="#94a3b8" />
                          {lead.homeSize || '—'}
                        </div>
                      </td>

                      {/* ── Move Date ── */}
                      <td style={{ padding: '18px 20px', fontSize: 13, color: '#475569', whiteSpace: 'nowrap' }}>
                        {fmtDate(lead.moveDate)}
                      </td>

                      {/* ── Listed ── */}
                      <td style={{ padding: '18px 20px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8', fontSize: 13 }}>
                          <Clock size={13} />
                          {timeAgo(lead.createdAt)}
                        </div>
                      </td>

                      {/* ── Price ── */}
                      <td style={{ padding: '18px 20px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                          ${displayPrice.toFixed ? displayPrice.toFixed(2) : displayPrice}
                        </div>
                        {isAuction && currentBid > 0 && (
                          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginTop: 2 }}>current bid</div>
                        )}
                        {isAuction && currentBid === 0 && (
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>starting bid</div>
                        )}
                      </td>

                      {/* ── Action ── */}
                      <td style={{ padding: '18px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isAuction ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => { setClaimError(''); setPreviewLead(lead); setBidLead(lead); }}
                              style={{ ...BTN_OUTLINE, padding: '8px 14px', fontSize: 12 }}>
                              <Gavel size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Bid
                            </button>
                            <button
                              onClick={() => { setClaimError(''); handleBuyNow(lead); }}
                              disabled={claimingId === id}
                              style={{ ...BTN_PRIMARY, opacity: claimingId === id ? 0.6 : 1 }}>
                              {claimingId === id ? 'Claiming…' : `Buy $${buyNowPrice.toFixed ? buyNowPrice.toFixed(0) : buyNowPrice} ›`}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setClaimError(''); setPreviewLead(lead); }}
                            style={{ ...BTN_PRIMARY }}>
                            View ›
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewLead && (
        <PreviewModal
          lead={previewLead}
          balance={balance}
          claiming={claimingId === (previewLead._id || previewLead.id)?.toString()}
          error={claimError}
          onClose={() => { setPreviewLead(null); setClaimError(''); }}
          onClaim={handleClaim}
          onBid={(lead) => setBidLead(lead)}
          onBuyNow={handleBuyNow}
        />
      )}
      {bidLead && (
        <BidModal lead={bidLead} balance={balance} onClose={() => setBidLead(null)} onBid={handleBid} />
      )}
      {successData && (
        <SuccessModal
          data={successData}
          onClose={() => setSuccessData(null)}
          onNavigate={() => { setSuccessData(null); navigate('/dashboard/customers'); }}
        />
      )}

      {/* ── Outbid toast ─────────────────────────────────────────────────── */}
      {outbidToast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#f1f5f9', borderRadius: 12,
          padding: '14px 22px', fontSize: 14, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 9999,
          animation: 'fadeInUp 0.2s ease',
        }}>
          <ZapOff size={16} color="#f59e0b" />
          {outbidToast}
          <button
            onClick={() => setOutbidToast('')}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 0 0 8px', fontSize: 16, lineHeight: 1 }}>
            ×
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}

/* ─── Shared button styles ─────────────────────────────────────────────────── */
const BTN_PRIMARY = {
  padding: '8px 18px', borderRadius: 20, border: 'none',
  background: 'linear-gradient(135deg,#f59e0b,#ea580c)',
  color: 'white', fontWeight: 700, fontSize: 13,
  cursor: 'pointer', whiteSpace: 'nowrap',
};

const BTN_OUTLINE = {
  padding: '8px 16px', borderRadius: 20,
  border: '1.5px solid #e2e8f0', background: 'white',
  color: '#475569', fontWeight: 600, fontSize: 13,
  cursor: 'pointer', whiteSpace: 'nowrap',
};

const TAG_BASE = {
  display: 'inline-block', borderRadius: 20,
  padding: '2px 8px', fontSize: 11, fontWeight: 700,
};
