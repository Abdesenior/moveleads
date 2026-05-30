import { useState, useEffect, useMemo, useContext, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  ZapOff, X,
  Gavel, Clock, Package, Search, SlidersHorizontal, Zap
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import ConfirmPurchaseModal from '../../components/ConfirmPurchaseModal';
import PurchaseSuccessModal from '../../components/PurchaseSuccessModal';
// 2026-05-26 — leadDisplay helpers (formatHomeType / formatStairs /
// formatUrgency / heavyItemTone) were only consumed by the removed
// PreviewModal. They remain in client/src/utils/leadDisplay.js because
// MyLeads ExpandedPanel + PurchaseSuccessModal still use them.
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

/* ─── PreviewModal — REMOVED 2026-05-26 ─────────────────────────────────────
   The row-click → PreviewModal entry point was a duplicate of the Unlock
   button → ConfirmPurchaseModal flow. The buy-flow architecture now has
   exactly ONE entry: clicking the Unlock CTA on a marketplace row opens
   ConfirmPurchaseModal, which posts on confirm. Legacy admin-imported
   leads (auctionStatus !== 'active') use the same Unlock CTA — labeled
   "Get Details" — which auto-routes inside executePurchase to the
   /leads/:id/claim endpoint via the existing isClaimable branch.

   PreviewModal's entire purpose (route + size + homeType + access +
   urgency + distance + miles + grade + heavy-items indicator + locked
   contact teaser + price + duplicate Unlock CTA) was a second
   pre-purchase details surface that overlapped the marketplace row's
   visible cells. The architecture trilogy (PRs #25/#26/#27) consolidated
   operational-details rendering into MyLeads ExpandedPanel as the sole
   comprehensive workspace; this PR closes the loop by removing the
   marketplace's secondary modal entry point.
*/
// (no stub kept — the comment block above is the sole audit-trail marker)


/* ─── Success modal — instant unlock confirmation ────────────────────────────
   Phase D removed the auction-win variant (Gavel icon + "Auction Won!" copy +
   "won the auction with a bid of $X" paragraph). The only path that set
   data.fromAuction was the auction_settled socket listener, also removed.
   When Deal Room adds back auction settlement on its own page, it can extend
   this modal or fork its own variant. */
// Legacy SuccessModal removed 2026-05-26. The post-purchase confirmation
// now uses ../../components/PurchaseSuccessModal which mirrors the visual
// language of ConfirmPurchaseModal (same overlay chrome, header, route
// card, button styling) so the buy flow looks consistent from Confirm →
// Success. The old component depended on .modal-overlay / .success-modal /
// .contact-details-box CSS classes in LeadFeed.css; those classes are
// still used by PreviewModal so they remain in the stylesheet.

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
  : 'TBD';

// ── Platform freshness rule (read before editing any "Listed" / age display) ─
//
// Freshness is a BUSINESS concept, not a database timestamp. Every mover-facing
// freshness indicator must answer the same question:
//
//     "When did the homeowner submit this request?"
//
// Anchor preference, in order:
//   1. Lead.createdAt              ← homeowner submission moment (default)
//   2. Lead.distributionDecisionAt ← admin-only / observability surfaces
//   3. Lead.dealRoomListedAt       ← reserved if/when added
//
// Lead.updatedAt is NEVER a freshness signal. It reflects the last DB mutation,
// which includes admin re-pricing, status flips, and unrelated field edits.
// ──────────────────────────────────────────────────────────────────────────────
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
  // 2026-05-26 — `previewLead` / `claimError` state removed alongside the
  // PreviewModal. The Unlock CTA opens ConfirmPurchaseModal directly, and
  // buy errors live inside it via `confirmError` + `confirmErrorKind`.
  const [confirmLead, setConfirmLead]   = useState(null);
  const [confirmError, setConfirmError] = useState('');
  const [confirmErrorKind, setConfirmErrorKind] = useState('generic'); // 'generic'|'race'|'insufficient'
  const [claimingId, setClaimingId]     = useState(null);
  const [search, setSearch]             = useState('');
  const [distFilter, setDistFilter]     = useState('all');
  const [dateFilter, setDateFilter]     = useState('all');
  const [customDate, setCustomDate]     = useState('');
  // DEFAULT SORT = 'listed' (Recently Listed, descending). This is the
  // expected default — pilot movers must see freshest homeowner requests
  // first. Tied to the freshness rule near `timeAgo` above: 'listed' anchors
  // on Lead.createdAt. Do not change this default without explicit operator
  // approval; it is the single most influential decision the mover never
  // makes consciously.
  const [sortBy, setSortBy]             = useState('listed');
  // Server-supplied _matchesPreferences flag drives this. Default to "Matched
  // for you" when the mover has any preferences set; otherwise "All leads".
  //
  // hasPrefs is computed on every render. The Phase 1+2 pickup/delivery
  // fields are now considered preferences too — a mover who only configured
  // pickup states (no maxDistance/homeSize yet) should still default to the
  // matched tab.
  const hasPrefs = !!(
    user?.maxDistance ||
    (user?.preferredHomeSizes && user.preferredHomeSizes.length) ||
    (user?.pickupStates && user.pickupStates.length) ||
    (user?.deliveryStates && user.deliveryStates.length) ||
    user?.deliversNationwide
  );
  const [feedScope, setFeedScope] = useState('all');
  // Promote scope to 'matched' once the user object loads with prefs.
  // Without this, the initial render (before AuthContext resolves) locks
  // scope to 'all' and the filter never engages — the symptom: tab badge
  // shows the matched count but the table renders unmatched rows. Only
  // fires while the user hasn't manually picked a tab yet.
  const scopeUserPickedRef = useRef(false);
  useEffect(() => {
    if (!scopeUserPickedRef.current && hasPrefs && feedScope === 'all') {
      setFeedScope('matched');
    }
  }, [hasPrefs, feedScope]);
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

  // Purchase flow is a two-step process:
  //   openPurchaseConfirm(lead)   — opens ConfirmPurchaseModal; no POST fires
  //   executePurchase(lead)       — runs the actual POST after user confirms
  // Every Unlock surface (desktop table, mobile card) goes through
  // openPurchaseConfirm. The old single-click-charges-instantly path is
  // gone — no money moves without an explicit Confirm click.
  const openPurchaseConfirm = (lead) => {
    if (!lead) return;
    setConfirmError('');
    setConfirmErrorKind('generic');
    setConfirmLead(lead);
  };

  const cancelPurchaseConfirm = () => {
    setConfirmLead(null);
    setConfirmError('');
    setConfirmErrorKind('generic');
  };

  const executePurchase = async () => {
    const lead = confirmLead;
    if (!lead) return;
    const id    = (lead._id || lead.id)?.toString();
    const price = getLeadPrice(lead);
    // Endpoint selection mirrors the pre-Phase-B split:
    //   /bids/:id/buy-now  → modern instant-dispatch path (atomic, refunds-on-fail,
    //                        emits lead_sold socket event)
    //   /leads/:id/claim   → legacy multi-buyer / non-active auctionStatus path
    // The ConfirmModal UX is identical for both — only the API URL differs.
    const isClaimable = lead.auctionStatus === 'active';
    const url = isClaimable
      ? `${API_URL}/bids/${id}/buy-now`
      : `${API_URL}/leads/${id}/claim`;

    setClaimingId(id);
    setConfirmError('');
    setConfirmErrorKind('generic');
    try {
      const res  = await fetch(url, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Race-loss (400 "Lead no longer available") and already-claimed (409)
        // both mean the lead was just bought by someone else (or by us in a
        // duplicate tab). Treat them as the "race" UI state — graceful,
        // non-scary copy in the modal; lead is removed from the dashboard.
        const msg = String((data && (data.error || data.msg)) || '').toLowerCase();
        const isRace =
          res.status === 400 ||
          res.status === 409 ||
          /no longer available|already (claimed|purchased|owned)/.test(msg);

        if (isRace) {
          setConfirmErrorKind('race');
          setConfirmError('This lead was just purchased by another mover.');
          // Drop the lead from the local feed so the user doesn't see it
          // sitting there with no Unlock affordance after they dismiss.
          setLeads(prev => prev.filter(l => (l._id || l.id)?.toString() !== id));
          return;
        }

        // 402 insufficient balance (rare — pre-flight catches it). Surface
        // the server message; ConfirmModal will show the Add Funds CTA
        // because balance < price.
        if (res.status === 402) {
          setConfirmErrorKind('insufficient');
          setConfirmError(data.error || data.msg || 'Insufficient balance.');
          return;
        }

        // Generic 5xx / network. Stay in the modal so the user can retry
        // or cancel — never silently swallow.
        setConfirmErrorKind('generic');
        setConfirmError(data.error || data.msg || `Purchase failed (${res.status}). Please try again.`);
        return;
      }

      // ── Success ──────────────────────────────────────────────────────
      // Optimistic local removal — Phase A server change makes this
      // permanent: even a hard refresh won't bring the lead back to the
      // marketplace feed. Kept here for instant UI snap (avoids waiting
      // on the socket round-trip).
      setLeads(prev => prev.filter(l => (l._id||l.id)?.toString() !== id));
      setConfirmLead(null);
      setSuccessData({ lead: data.lead || lead });
      refreshUser();
    } catch (err) {
      setConfirmErrorKind('generic');
      setConfirmError(err && err.message ? err.message : 'Network error. Please try again.');
    } finally {
      setClaimingId(null);
    }
  };

  // Every Unlock surface in the JSX routes through openPurchaseConfirm.
  // executePurchase auto-selects the right endpoint (/bids/:id/buy-now
  // vs /leads/:id/claim) based on the lead's auctionStatus. No code path
  // triggers an immediate POST. `handleClaim` alias removed 2026-05-26
  // when the row-click + PreviewModal entry point was deleted.
  const handleBuyNow = openPurchaseConfirm;

  // Client-side filters + sort
  const q = search.toLowerCase();
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);

  // Helper — strict matched check. Uses `=== true` so server payloads where
  // the field is missing/undefined/null/object don't accidentally leak
  // unmatched leads into the Matched-for-you tab. Socket-pushed leads in
  // particular arrive without _matchesPreferences (server emits a generic
  // payload; per-user matching only happens on REST fetch). Treating those
  // as NOT matched is the safe default.
  const isExplicitlyMatched = (l) => l && l._matchesPreferences === true;

  // Memoize so the filter runs in a single pass per dependency change.
  // Previously a fresh closure ran on every render; the new useMemo makes
  // the relationship between feedScope and the rendered rows deterministic
  // and easier to debug.
  const visible = useMemo(() => {
    const matchedScope = feedScope === 'matched';
    return leads.filter(l => {
      if (matchedScope) {
        // STRICT contract for the Matched-for-you tab:
        //   row passes iff the server explicitly flagged it.
        //
        // Previously the filter also passed leads the mover had already
        // PURCHASED. That made sense when "Matched" meant "leads you might
        // care about". The operator's Phase 3.1 spec is sharper:
        //   In Matched for you, show ONLY leads where
        //   _matchesPreferences === true.
        // Purchased leads still live in All marketplace leads (and in the
        // mover's purchases history). Conflating purchased with matched
        // produced confusing pill counts (e.g. 6 displayed but tab
        // badge shows 2 because 4 of those 6 were old test purchases
        // from states outside the mover's current pickup/delivery).
        if (!isExplicitlyMatched(l)) return false;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, feedScope, user?._id, distFilter, q, dateFilter, customDate]);

  const displayedLeads = useMemo(() => {
    return [...visible].sort((a, b) => {
      if (sortBy === 'moveDate_asc')  return new Date(a.moveDate) - new Date(b.moveDate);
      if (sortBy === 'moveDate_desc') return new Date(b.moveDate) - new Date(a.moveDate);
      if (sortBy === 'price_asc')     return (a.buyNowPrice || a.price || 0) - (b.buyNowPrice || b.price || 0);
      if (sortBy === 'price_desc')    return (b.buyNowPrice || b.price || 0) - (a.buyNowPrice || a.price || 0);
      // 'listed' (default) — anchor on Lead.createdAt (homeowner submission).
      // Explicit client sort, NOT trusting server order, so the visible "Listed"
      // column timestamp matches the row's position regardless of how the
      // server orders the response. updatedAt is NEVER a freshness signal.
      const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bT - aT; // desc: freshest homeowner request first
    });
  }, [visible, sortBy]);

  // Runtime invariant — catches the exact bug the operator reported:
  // unmatched leads leaking into the Matched-for-you tab. Logs the offender
  // so the problem can never go silent again. Mirrors the strict filter
  // predicate so purchased-but-not-matched leads now count as leaks too.
  useEffect(() => {
    if (feedScope !== 'matched') return;
    const leaks = displayedLeads.filter(l => !isExplicitlyMatched(l));
    if (leaks.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `[LeadFeed] Matched-tab filter leak: ${leaks.length} unmatched lead(s) rendered. ` +
        `Examples: ${leaks.slice(0, 3).map(l => `${l.originCity || l.originZip}→${l.destinationCity || l.destinationZip} (_matchesPreferences=${JSON.stringify(l._matchesPreferences)})`).join('; ')}`
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedLeads, feedScope, user?._id]);

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
            // Strict `=== true` here too — same predicate the filter uses, so
            // the tab badge count can never drift from the actual matched row
            // count. (Was `l._matchesPreferences` truthy check, which would
            // accept any non-falsy value.)
            const matchedCount = leads.filter(l => l._matchesPreferences === true).length;
            const showCount = tab.id === 'matched' && hasPrefs;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => { scopeUserPickedRef.current = true; setFeedScope(tab.id); }}
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
            {/* Fr6 — active-monitoring reassurance. Grounds the alert promise
                so the mover sitting at an empty screen understands the
                system is continuously checking, not idle. */}
            {!(search || distFilter !== 'all' || dateFilter !== 'all') && (
              <p style={{ marginTop: 8, fontSize: 13, color: '#94a3b8' }}>
                We check continuously — alerts fire within seconds of a verified match.
              </p>
            )}
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
                      // No row-onClick — the marketplace row is a passive list
                      // surface. The Unlock CTA is the ONLY entry into the
                      // buy flow. Mouse hover stays for affordance so the
                      // row feels alive; the cursor reverts to default so
                      // the row no longer reads as a click target.
                      style={{ borderBottom: i < displayedLeads.length - 1 ? '1px solid #f8fafc' : 'none', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafbff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
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
                          {/* Freshness anchor = Lead.createdAt (homeowner
                              submission time). Mover trust depends on the
                              displayed age answering "when did the homeowner
                              ask for help?" — not "when did the dispatcher
                              decide to show it to me?" Pre-2026-05-30 this
                              read distributionDecisionAt; the change to
                              createdAt aligns the entire platform on a single
                              freshness rule. updatedAt is NEVER used here. */}
                          {timeAgo(lead.createdAt)}
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

                      {/* ── Action ── single Unlock CTA. Active leads route
                          through /bids/:id/buy-now; non-active legacy admin
                          imports route through /api/leads/:id/claim — both
                          paths flow through openPurchaseConfirm →
                          ConfirmPurchaseModal, which gates on the user's
                          explicit Confirm click before any POST. The
                          executePurchase auto-selects the endpoint based
                          on lead.auctionStatus. The `e.stopPropagation()`
                          is vestigial (the row no longer has its own
                          onClick) but kept defensively in case future
                          row-level handlers are added. */}
                      <td className="col-action" style={{ padding: '18px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isClaimable ? (
                          <button
                            className="cta-buy"
                            onClick={(e) => { e.stopPropagation(); handleBuyNow(lead); }}
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
                            onClick={(e) => { e.stopPropagation(); handleBuyNow(lead); }}
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
                  /* No card-onClick — the Unlock CTA below is the ONLY
                     entry into the buy flow. Matches the desktop row's
                     passive-list-surface semantics. */
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
                    onClick={(e) => { e.stopPropagation(); handleBuyNow(lead); }}
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

      {confirmLead && (
        <ConfirmPurchaseModal
          lead={confirmLead}
          balance={balance}
          isProcessing={claimingId === (confirmLead._id || confirmLead.id)?.toString()}
          error={confirmError}
          errorKind={confirmErrorKind}
          onConfirm={executePurchase}
          onCancel={cancelPurchaseConfirm}
        />
      )}
      {successData && (
        <PurchaseSuccessModal
          lead={successData.lead}
          onClose={() => setSuccessData(null)}
          onView={() => {
            // Deep-link the purchased lead inside MyLeads. MyLeads reads
            // ?highlight=<id>, auto-expands the row, scrolls it into view,
            // and gives it a brief orange pulse so the user lands directly
            // on what they just bought.
            const leadId = successData?.lead?._id || successData?.lead?.id;
            setSuccessData(null);
            navigate(leadId ? `/dashboard/my-leads?highlight=${leadId}` : '/dashboard/my-leads');
          }}
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
