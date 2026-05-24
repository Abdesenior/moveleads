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

// Phase 3 cutover — the client no longer second-guesses the server. The
// `/api/leads` response IS the authoritative mover feed; visibility is
// gated server-side by distributionDecision + status + moveDate +
// inventoryChannel. Sold-removal is handled via the `lead_sold` socket
// event below, not by a status filter.
//
// One narrow guard remains: NEW_LEAD_AVAILABLE socket events must arrive
// for leads that ARE currently distributable. The server's broadcast path
// re-checks isHiddenFromMovers before emit, so we trust the socket and
// just verify the status is one the feed actually surfaces (defensive
// against stale events after server restart).
const FEED_RENDERABLE_STATUSES = new Set(['Available', 'READY_FOR_DISTRIBUTION']);
const isFeedRenderable = (l) => FEED_RENDERABLE_STATUSES.has(l && l.status);

/* ─── DORMANT — Distribution-model predicates (Deal Room reuse) ─────────────
   Phase D removed the main feed's bid surface; these predicates no longer
   gate any rendering in this file. Kept as the canonical classifiers paired
   with the dormant BidModal / TimeLeftTag below — the future Deal Room page
   will import the same predicates to decide which leads render auction UI
   vs. instant UI. Do NOT delete — see docs/marketplace-architecture.md. */
// eslint-disable-next-line no-unused-vars
const isInstantLead = (lead) => lead?.distributionModel === 'instant';
// eslint-disable-next-line no-unused-vars
const isAuctionLead = (lead) =>
  lead?.auctionStatus === 'active' && lead?.distributionModel !== 'instant';

/* ─── DORMANT — TimeLeftTag (Deal Room reuse) ───────────────────────────────
   Phase D removed all main-feed call sites for this component. It is kept in
   this file as the canonical countdown badge for the future Deal Room page
   (auction inventory layer). Do NOT delete without coordinating with the
   Deal Room implementation plan — see docs/marketplace-architecture.md. */
// eslint-disable-next-line no-unused-vars
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
    const iv = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(iv);
  }, [calc]);

  if (!t) return null;
  return (
    <span className="lead-tag tag-time-left" style={{
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

/* ─── Body scroll lock — used by all lead modals so opening a modal on
       mobile prevents the dashboard from scrolling behind it and keeps
       the sticky app bar from competing for taps. ───────────────────────── */
function useBodyScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
}

/* ─── DORMANT — BidModal (Deal Room reuse) ──────────────────────────────────
   Phase D removed the main feed's bid surface entirely; no entry point in
   this file opens this modal anymore. It is preserved here as the canonical
   bid-placement UI for the future Deal Room page (auction inventory layer,
   admin-curated stale leads, regional bundles). Do NOT delete without
   coordinating with the Deal Room implementation plan — see
   docs/marketplace-architecture.md. */
// eslint-disable-next-line no-unused-vars
function BidModal({ lead, balance, onClose, onBid }) {
  useBodyScrollLock();
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

/* ─── Shared detail row ─────────────────────────────────────────────────────── */
function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 700, color: '#0f172a' }}>{value}</span>
    </div>
  );
}

/* ─── Preview modal (read-only — no purchase happens here) ─────────────────── */
function PreviewModal({ lead, balance, onClose, onClaim, onBuyNow, claiming, error }) {
  useBodyScrollLock();
  // Phase D — main feed is instant-only. The bid surface was removed from this
  // modal; what remains is a single Unlock CTA. We still distinguish "active"
  // leads (use the atomic /buy-now route via onBuyNow) from non-active legacy
  // admin-imports (use the older /api/leads/:id/claim route via onClaim).
  const isClaimable = lead.auctionStatus === 'active';
  const buyNowPrice = getLeadPrice(lead);
  const displayPrice = buyNowPrice;
  const isLD           = lead.distance === 'Long Distance';
  const [openedAt]     = useState(() => Date.now());
  const daysToMove     = lead.moveDate ? (new Date(lead.moveDate) - openedAt) / 86400000 : 99;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 480 }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#0a192f,#112240)', padding: '22px 28px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Move Opportunity</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
              {fmtRoutePart(lead.originCity, lead.originState)} → {fmtRoutePart(lead.destinationCity, lead.destinationState)}
            </div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', marginTop: 3, letterSpacing: '0.02em' }}>
              {lead.originZip} → {lead.destinationZip}
            </div>
          </div>
          <button className="close-btn" onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: 'rgba(255,255,255,0.7)', borderRadius: 9, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '22px 28px' }}>
          <p style={{ fontSize: 12.5, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.5 }}>
            Review the route, timing, and move size before unlocking.
          </p>
          {/* Lead details */}
          <Row label="Home Size"  value={lead.homeSize || '—'} />
          <Row label="Move Date"  value={lead.moveDate ? new Date(lead.moveDate).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'} />
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
                  Price
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>${displayPrice.toFixed ? displayPrice.toFixed(2) : displayPrice}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Balance</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: balance >= displayPrice ? '#16a34a' : '#dc2626' }}>${balance.toFixed(2)}</div>
              </div>
            </div>

            {/* Inline error — shown when claim/buy fails (other than the
                insufficient-balance case, which is handled inline below). */}
            {error && !(error.includes('balance') || error.includes('Insufficient')) && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                  {error}
                </div>
              </div>
            )}

            {balance < displayPrice ? (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>
                  Insufficient balance. Please add funds to your account.
                </div>
                <button
                  onClick={() => window.open('/dashboard/billing', '_blank')}
                  style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Add Funds →
                </button>
              </div>
            ) : (
              /* Single Unlock CTA. /buy-now is the canonical claim endpoint
                 for any lead in auctionStatus='active' (instant leads and
                 legacy auction leads alike); onClaim handles the older
                 admin-imported lead path where auctionStatus !== 'active'. */
              <button
                onClick={() => isClaimable ? onBuyNow(lead) : onClaim(lead)}
                disabled={claiming}
                style={{ width: '100%', ...BTN_PRIMARY, borderRadius: 12, padding: '13px', fontSize: 14, opacity: claiming ? 0.6 : 1 }}>
                {claiming ? 'Claiming…' : `Unlock Lead — $${buyNowPrice.toFixed(2)} ›`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Success modal — instant unlock confirmation ────────────────────────────
   Phase D removed the auction-win variant (Gavel icon + "Auction Won!" copy +
   "won the auction with a bid of $X" paragraph). The only path that set
   data.fromAuction was the auction_settled socket listener, also removed.
   When Deal Room adds back auction settlement on its own page, it can extend
   this modal or fork its own variant. */
function SuccessModal({ data, onClose, onNavigate }) {
  useBodyScrollLock();
  const hasContact = data.lead?.customerName && data.lead?.customerPhone;
  return (
    <div className="modal-overlay">
      <div className="modal-content success-modal">
        <div className="success-icon-box">
          <CheckCircle size={48} />
        </div>
        <h2>Lead Unlocked!</h2>
        <p>You now have full access to the customer's contact details.</p>
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
  ? new Date(d).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
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

  // Bridge socket-status up to DashboardLayout's mobile sticky app bar via
  // a window CustomEvent. This keeps the socket lifecycle owned by the page
  // (LeadFeed is the only component that opens the socket), while letting
  // the global mobile app bar render a live indicator on the right side.
  // On unmount we clear by dispatching null so the indicator hides on
  // pages that don't have a live socket.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('moveleads:socket-status', { detail: socketStatus }));
  }, [socketStatus]);
  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('moveleads:socket-status', { detail: null }));
  }, []);
  const [successData, setSuccessData]   = useState(null);
  const [previewLead, setPreviewLead]   = useState(null);
  const [claimError, setClaimError]     = useState('');
  const [claimingId, setClaimingId]     = useState(null);
  const [search, setSearch]             = useState('');
  const [distFilter, setDistFilter]     = useState('all');
  const [dateFilter, setDateFilter]     = useState('all');
  const [customDate, setCustomDate]     = useState('');
  const [sortBy, setSortBy]             = useState('listed');
  // Server-supplied _matchesPreferences flag drives this. Default to "Matched
  // for you" when the mover has any preferences set; otherwise "All leads".
  const hasPrefs = !!(user?.maxDistance || (user?.preferredHomeSizes && user.preferredHomeSizes.length));
  const [feedScope, setFeedScope]       = useState(hasPrefs ? 'matched' : 'all');
  const pollRef   = useRef(null);

  const fetchLeads = useCallback(async () => {
    try {
      const res  = await fetch(`${API_URL}/leads`, { headers: { 'x-auth-token': token } });
      const data = await res.json();
      // Phase 3 — trust the server. /api/leads already gates on
      // distributionDecision + status + moveDate + inventoryChannel.
      if (Array.isArray(data)) setLeads(data);
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
      // Defensive — drop stale events whose status doesn't render in the
      // feed. Server already filters by distributionDecision before emit,
      // so this is belt-and-suspenders for the lifecycle axis only.
      if (!isFeedRenderable(lead)) return;
      playNewLeadSound();
      setLeads(prev => [lead, ...prev.filter(l => (l._id||l.id) !== (lead._id||lead.id))]);
    });
    // Phase D — bid_update / auction_settled listeners removed from the main
    // feed. The main marketplace is instant-only; server never emits those
    // events for instant leads. Future Deal Room page will subscribe to them
    // in its own listener block.
    socket.on('lead_sold', (d) => {
      // Guard: skip if this was our own buy-now purchase — handleBuyNow already updated state
      if (d.buyerId && d.buyerId === user?._id?.toString()) return;
      setLeads(prev => prev.filter(l => (l._id||l.id)?.toString() !== d.leadId?.toString()));
    });
    return () => { stopPolling(); socket.disconnect(); };
  }, [SOCKET_URL, token, fetchLeads, startPolling, stopPolling, user?._id]);

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

  // Client-side filters + sort
  const q = search.toLowerCase();
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);

  const visible = leads.filter(l => {
    // "Matched for you" tab — narrow to leads the server flagged as matching
    // this mover's coverage + preferences. Purchased leads always pass through.
    if (feedScope === 'matched') {
      const isMine = (l.buyers || []).some(b => String(b.company) === String(user?._id));
      if (!isMine && !l._matchesPreferences) return false;
    }
    if (distFilter === 'local' && l.distance !== 'Local') return false;
    if (distFilter === 'long'  && l.distance !== 'Long Distance') return false;
    if (q && !(
      l.originCity?.toLowerCase().includes(q) ||
      l.destinationCity?.toLowerCase().includes(q) ||
      l.originZip?.includes(q) ||
      l.destinationZip?.includes(q)
    )) return false;

    if (dateFilter !== 'all' && l.moveDate) {
      const d = new Date(l.moveDate);
      if (dateFilter === 'today') {
        if (d.toDateString() !== todayMidnight.toDateString()) return false;
      } else if (dateFilter === '3days') {
        const cap = new Date(todayMidnight); cap.setDate(cap.getDate() + 3);
        if (d < todayMidnight || d > cap) return false;
      } else if (dateFilter === 'week') {
        const cap = new Date(todayMidnight); cap.setDate(cap.getDate() + 7);
        if (d < todayMidnight || d > cap) return false;
      } else if (dateFilter === 'month') {
        const cap = new Date(todayMidnight); cap.setMonth(cap.getMonth() + 1);
        if (d < todayMidnight || d > cap) return false;
      } else if (dateFilter === 'custom') {
        if (!customDate) return true;
        const custom = new Date(customDate + 'T12:00:00.000Z');
        if (d.toDateString() !== custom.toDateString()) return false;
      }
    }
    return true;
  });

  const displayedLeads = [...visible].sort((a, b) => {
    if (sortBy === 'moveDate_asc')  return new Date(a.moveDate) - new Date(b.moveDate);
    if (sortBy === 'moveDate_desc') return new Date(b.moveDate) - new Date(a.moveDate);
    if (sortBy === 'price_asc')     return (a.buyNowPrice || a.price || 0) - (b.buyNowPrice || b.price || 0);
    if (sortBy === 'price_desc')    return (b.buyNowPrice || b.price || 0) - (a.buyNowPrice || a.price || 0);
    return 0; // 'listed' = API order preserved
  });

  const balance = user?.balance || 0;

  return (
    <DashboardLayout>
      <div className="lead-feed-container">

        {/* Mobile-only marketplace metric — sits below the activation banner
            and above the page hero. Compact stat with a live pulse. */}
        {displayedLeads.length > 0 && (
          <div className="lead-count-mobile" role="status" aria-live="polite">
            <div className="lead-count-number">{displayedLeads.length}</div>
            <div className="lead-count-meta">
              <span className="lead-count-label">Available Leads</span>
              <span className="lead-count-status">
                <span className="lead-count-status-dot" aria-hidden="true" />
                Updated live
              </span>
            </div>
          </div>
        )}

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
            {displayedLeads.length > 0 && (
              <div className="hero-available-pill" style={{ background: 'linear-gradient(135deg,#f59e0b,#ea580c)', color: 'white', borderRadius: 20, padding: '7px 16px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={13} /> {displayedLeads.length} Available
              </div>
            )}
            <div className={`connection-badge ${socketStatus === 'connected' ? 'online' : socketStatus === 'reconnecting' ? 'reconnecting' : 'offline'}`}>
              <div className="pulse-dot" />
              <span>{socketStatus === 'connected' ? 'Live' : socketStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</span>
            </div>
          </div>
        </div>

        {/* ── Matched / All tabs ── */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#f1f5f9', padding: 4, borderRadius: 12,
          marginBottom: 14,
        }} role="tablist" aria-label="Lead scope">
          {[
            { id: 'matched', label: 'Matched for you' },
            { id: 'all',     label: 'All marketplace leads' },
          ].map(tab => {
            const active = feedScope === tab.id;
            const matchedCount = leads.filter(l => l._matchesPreferences).length;
            const showCount = tab.id === 'matched' && hasPrefs;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setFeedScope(tab.id)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 9,
                  border: 'none',
                  cursor: 'pointer',
                  background: active ? '#fff' : 'transparent',
                  color: active ? '#ea580c' : '#64748b',
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '-0.005em',
                  boxShadow: active ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
                  transition: 'all 160ms ease',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                {tab.label}
                {showCount && matchedCount > 0 && (
                  <span style={{
                    background: active ? 'rgba(255,106,20,0.12)' : 'rgba(100,116,139,0.16)',
                    color: active ? '#ea580c' : '#64748b',
                    fontSize: 11, fontWeight: 800,
                    padding: '1px 7px', borderRadius: 999,
                  }}>{matchedCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Search + filter bar ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
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
          <select
            value={dateFilter}
            onChange={e => { setDateFilter(e.target.value); setCustomDate(''); }}
            style={{ height: 42, paddingLeft: 14, paddingRight: 16, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#0f172a', outline: 'none', background: 'white', cursor: 'pointer', appearance: 'none', minWidth: 140 }}
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="3days">Next 3 Days</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Date</option>
          </select>
          {dateFilter === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
              style={{ height: 42, paddingLeft: 14, paddingRight: 14, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#0f172a', outline: 'none', background: 'white' }}
            />
          )}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ height: 42, paddingLeft: 14, paddingRight: 16, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#0f172a', outline: 'none', background: 'white', cursor: 'pointer', appearance: 'none', minWidth: 170 }}
          >
            <option value="listed">Recently Listed</option>
            <option value="moveDate_asc">Move Date (Soonest)</option>
            <option value="moveDate_desc">Move Date (Latest)</option>
            <option value="price_asc">Price (Low → High)</option>
            <option value="price_desc">Price (High → Low)</option>
          </select>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="feed-loading"><div className="spinner" /><span>Scanning for live opportunities…</span></div>
        ) : displayedLeads.length === 0 ? (
          <div className="empty-feed">
            <div className="empty-icon-box"><ZapOff size={32} /></div>
            <h3>{search || distFilter !== 'all' || dateFilter !== 'all' ? 'No results match your filter' : 'Your markets are active'}</h3>
            <p>{search || distFilter !== 'all' || dateFilter !== 'all' ? 'Try a different search or filter.' : "We'll alert you the moment a verified request matches your setup."}</p>
          </div>
        ) : (
          <>
          <div className="leads-table-wrap" style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
            <table className="leads-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                {displayedLeads.map((lead, i) => {
                  const id          = (lead._id || lead.id)?.toString();
                  const isClaimable = lead.auctionStatus === 'active';
                  const isLD        = lead.distance === 'Long Distance';
                  const daysToMove  = lead.moveDate ? (new Date(lead.moveDate) - Date.now()) / 86400000 : 99;
                  const isToday     = lead.moveDate ? new Date(lead.moveDate).toDateString() === new Date().toDateString() : false;
                  const isUrgent    = daysToMove > 1 && daysToMove <= 7;
                  const isPremium   = lead.grade === 'A';
                  const buyNowPrice = getLeadPrice(lead);
                  const displayPrice = buyNowPrice;

                  return (
                    <tr
                      key={id}
                      className="leads-row"
                      style={{ borderBottom: i < displayedLeads.length - 1 ? '1px solid #f8fafc' : 'none', transition: 'background 0.12s', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafbff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { setClaimError(''); setPreviewLead(lead); }}
                    >
                      {/* ── Route ── city-first hierarchy: movers think in
                          markets, not ZIPs. "City, ST" reads big, ZIP is
                          the subtle reference number underneath. State is
                          surfaced when present on the lead doc; otherwise
                          city stands alone. */}
                      <td className="col-route" style={{ padding: '18px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', lineHeight: 1.15, letterSpacing: '-0.005em' }}>{fmtRoutePart(lead.originCity, lead.originState)}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>{lead.originZip || ''}</div>
                          </div>
                          <div style={{ color: '#cbd5e1', fontSize: 16, fontWeight: 300, margin: '0 2px' }}>→</div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', lineHeight: 1.15, letterSpacing: '-0.005em' }}>{fmtRoutePart(lead.destinationCity, lead.destinationState)}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>{lead.destinationZip || ''}</div>
                          </div>
                        </div>
                        {/* Tags */}
                        <div className="lead-tags-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          <span className="lead-tag tag-distance" style={{ ...TAG_BASE, background: isLD ? '#f0f4ff' : '#f0fdf4', color: isLD ? '#3b5bdb' : '#16a34a', border: `1px solid ${isLD ? '#c5d3ff' : '#bbf7d0'}` }}>
                            {isLD ? 'Long Distance' : 'Local'}
                          </span>
                          {isToday  && <span className="lead-tag tag-today" style={{ ...TAG_BASE, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>Today!</span>}
                          {isUrgent && <span className="lead-tag tag-urgent" style={{ ...TAG_BASE, background: '#fff7ed', color: '#d97706', border: '1px solid #fde68a' }}>Urgent</span>}
                          {isPremium && (
                            <span className="lead-tag tag-premium" style={{ ...TAG_BASE, background: 'linear-gradient(135deg,#f59e0b,#ea580c)', color: 'white', border: 'none' }}>
                              ⭐ High-Value Move
                            </span>
                          )}
                          {lead._matchesPreferences && (
                            <span className="lead-tag tag-match" style={{ ...TAG_BASE, background: 'rgba(255,106,20,0.10)', color: '#ea580c', border: '1px solid rgba(255,106,20,0.30)', fontWeight: 800 }}>
                              ✓ Matches your setup
                            </span>
                          )}
                        </div>
                      </td>

                      {/* ── Est. Size ── */}
                      <td className="col-size" style={{ padding: '18px 20px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 13, fontWeight: 600 }}>
                          <Package size={14} color="#94a3b8" />
                          {lead.homeSize || '—'}
                        </div>
                      </td>

                      {/* ── Move Date ── */}
                      <td className="col-date" style={{ padding: '18px 20px', fontSize: 13, color: '#475569', whiteSpace: 'nowrap' }}>
                        {fmtDate(lead.moveDate)}
                        {/* Mobile-only inline urgency — replaces the urgency
                            badges that get hidden in the tags row at <=700px. */}
                        <span className="mobile-urgency-inline" aria-hidden="true">
                          {(() => {
                            if (isToday) return ' · Today';
                            if (isUrgent) return ' · Urgent';
                            return '';
                          })()}
                        </span>
                      </td>

                      {/* ── Listed ── */}
                      <td className="col-listed" style={{ padding: '18px 20px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8', fontSize: 13 }}>
                          <Clock size={13} />
                          {/* "Listed" = when this lead became visible on the mover
                              dashboard, not when the homeowner submitted. Falls
                              back to createdAt only for legacy rows that somehow
                              lack distributionDecisionAt (shouldn't happen for
                              anything that passes moverVisibilityFilter). */}
                          {timeAgo(lead.distributionDecisionAt || lead.createdAt)}
                        </div>
                      </td>

                      {/* ── Price ── */}
                      <td className="col-price" style={{ padding: '18px 20px', whiteSpace: 'nowrap' }}>
                        <div className="price-desktop">
                          <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                            ${displayPrice.toFixed ? displayPrice.toFixed(2) : displayPrice}
                          </div>
                        </div>
                        <div className="price-mobile">
                          <div className="price-unlock-row">
                            <span className="price-unlock-amount">${buyNowPrice.toFixed ? buyNowPrice.toFixed(2) : buyNowPrice}</span>
                            <span className="price-unlock-label">unlock</span>
                          </div>
                        </div>
                      </td>

                      {/* ── Action ── single Unlock CTA. Active leads claim
                          via the atomic /buy-now route; non-active legacy
                          admin-imports open the preview modal where the
                          older /api/leads/:id/claim path is used. */}
                      <td className="col-action" style={{ padding: '18px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isClaimable ? (
                          <button
                            className="cta-buy"
                            onClick={(e) => { e.stopPropagation(); setClaimError(''); handleBuyNow(lead); }}
                            disabled={claimingId === id}
                            style={{ ...BTN_PRIMARY, opacity: claimingId === id ? 0.6 : 1 }}>
                            {claimingId === id ? 'Claiming…' : (
                              <>
                                <span className="cta-text-desktop">Unlock ${buyNowPrice.toFixed ? buyNowPrice.toFixed(0) : buyNowPrice} ›</span>
                                <span className="cta-text-mobile">Unlock for ${buyNowPrice.toFixed ? buyNowPrice.toFixed(0) : buyNowPrice}</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            className="cta-view"
                            onClick={(e) => { e.stopPropagation(); setClaimError(''); setPreviewLead(lead); }}
                            style={{ ...BTN_PRIMARY }}>
                            <span className="cta-text-desktop">Get Details ›</span>
                            <span className="cta-text-mobile">Get details</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list — completely separate from the desktop table.
              CSS hides one or the other per breakpoint so neither layout
              has to fight inherited <td> rules. Buying/bidding actions
              call the exact same handlers as the desktop table rows. */}
          <div className="leads-mobile-list" role="list">
            {displayedLeads.map((lead) => {
              const id          = (lead._id || lead.id)?.toString();
              const isLD        = lead.distance === 'Long Distance';
              const daysToMove  = lead.moveDate ? (new Date(lead.moveDate) - Date.now()) / 86400000 : 99;
              const isToday     = lead.moveDate ? new Date(lead.moveDate).toDateString() === new Date().toDateString() : false;
              const isUrgent    = daysToMove > 1 && daysToMove <= 7;
              const buyNowPrice = getLeadPrice(lead);

              // Inline urgency text (replaces the urgency badges).
              let urgencyText = '';
              if (isToday) urgencyText = 'Today';
              else if (isUrgent) urgencyText = 'Urgent';

              return (
                <article
                  key={id}
                  role="listitem"
                  className="lm-card"
                  onClick={() => { setClaimError(''); setPreviewLead(lead); }}
                >
                  {/* Route — city is the primary signal, ZIP is the
                      reference. Order matches the desktop table. State
                      surfaces when present on the lead. */}
                  <div className="lm-route-row">
                    <div className="lm-route-zip">
                      <span className="lm-city">{fmtRoutePart(lead.originCity, lead.originState)}</span>
                      <span className="lm-zip">{lead.originZip || ''}</span>
                    </div>
                    <span className="lm-arrow" aria-hidden="true">→</span>
                    <div className="lm-route-zip">
                      <span className="lm-city">{fmtRoutePart(lead.destinationCity, lead.destinationState)}</span>
                      <span className="lm-zip">{lead.destinationZip || ''}</span>
                    </div>
                  </div>

                  {/* Badges (max 2) */}
                  <div className="lm-tags">
                    <span className={`lm-tag${isLD ? ' lm-tag-ld' : ' lm-tag-local'}`}>
                      {isLD ? 'Long Distance' : 'Local'}
                    </span>
                    {lead._matchesPreferences && (
                      <span className="lm-tag lm-tag-match">✓ Matches your setup</span>
                    )}
                  </div>

                  {/* Specs row */}
                  <div className="lm-specs">
                    <Package size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
                    <span>{lead.homeSize || '—'}</span>
                    <span className="lm-sep">·</span>
                    <span>{fmtDate(lead.moveDate)}</span>
                    {urgencyText && (
                      <>
                        <span className="lm-sep">·</span>
                        <span className="lm-urgency">{urgencyText}</span>
                      </>
                    )}
                  </div>

                  {/* Price */}
                  <div className="lm-price">
                    <span className="lm-price-amount">${buyNowPrice.toFixed ? buyNowPrice.toFixed(0) : buyNowPrice}</span>
                    <span className="lm-price-label">unlock</span>
                  </div>

                  {/* Single Unlock CTA. */}
                  <button
                    type="button"
                    className="lm-cta-primary"
                    onClick={(e) => { e.stopPropagation(); setClaimError(''); handleBuyNow(lead); }}
                    disabled={claimingId === id}
                  >
                    {claimingId === id
                      ? 'Claiming…'
                      : `Unlock for $${buyNowPrice.toFixed ? buyNowPrice.toFixed(0) : buyNowPrice}`}
                  </button>
                </article>
              );
            })}
          </div>
          </>
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
          onBuyNow={handleBuyNow}
        />
      )}
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

/* ─── Route formatter ──────────────────────────────────────────────────────
   Mover-friendly "City, ST" formatting. Falls back to city-only when the
   state isn't on the lead document. No backend assumption — if originState
   / destinationState exist (admin lead-edit accepts them today), they show
   up; otherwise the city stands alone. */
function fmtRoutePart(city, state) {
  const c = (city || '').trim();
  if (!c) return '—';
  const s = (state || '').trim();
  return s ? `${c}, ${s.toUpperCase()}` : c;
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
  display: 'inline-flex', alignItems: 'center', borderRadius: 999,
  padding: '3px 10px', fontSize: 11, fontWeight: 700,
  letterSpacing: '0.01em', lineHeight: 1.45,
};
