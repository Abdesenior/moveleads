import { useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Tag, MapPin, Calendar, Home, RefreshCw, AlertCircle, X, CheckCircle, Clock } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import { toMoverLabel } from '../../utils/tierLabels';
import './Deals.css';

/**
 * Deal Room — exchange-style discounted secondary inventory (DRX-1).
 *
 * Mover-facing browse surface. NOT real-time. Pulls inventoryChannel='deal_room'
 * leads from GET /api/leads/deals (env-gated by ENABLE_DEAL_ROOM on the server).
 * Unlock CTA hits the existing POST /api/bids/:leadId/buy-now path — no new
 * money path; same atomic claim + balance debit + PurchasedLead + Transaction
 * as the Live Feed. (PR-D1 + PR-D2 + PR-D3 + scenario tests verified this.)
 *
 * DRX-1 (2026-05-29) replaces the card grid with a single 7-column table
 * mirroring LeadFeed.jsx structure: Route / Size / Move date / Listed /
 * Was / Now / Action. The same JSX serves the desktop table layout and
 * the mobile stacked-card layout via CSS media queries in Deals.css.
 *
 * Future-readiness: the render path iterates an `items` array of shape
 * `{ type: 'lead' | 'pack', ... }`. Today `items` is always
 * `leads.map(l => ({ type: 'lead', lead: l }))`. A future PR can add
 * `type: 'pack'` rows without restructuring this file. See
 * docs/audits/deal-room-exchange-redesign/00-ux-audit-and-wireframe.md
 * §2.3 for the planned pack-row shape.
 *
 * Surface posture (unchanged from PR-D1/D2/D3):
 *   - No packs (post-pilot)
 *   - No auctions (auction infra dormant)
 *   - No socket "new deal" emit — page is poll-on-refresh
 *   - No coverage filter on /deals — discount-catalog model (documented S4.3)
 */

export default function Deals() {
  const { API_URL, token, user, refreshUser } = useContext(AuthContext);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [unlockError, setUnlockError] = useState(null);
  // PR-D1 (2026-05-29) — disambiguate "feature disabled" from "feature enabled
  // but no inventory right now". Server returns 404 with msg "Deal Room is not
  // enabled" when ENABLE_DEAL_ROOM is off; that case maps to this flag and
  // renders a distinct banner. A 200 with an empty array continues to render
  // the existing "No deals available right now" empty state (UX preserved).
  const [featureDisabled, setFeatureDisabled] = useState(false);
  // V1.6 — unlock confirmation modal. Click "Unlock" → opens this modal
  // showing lead/price/balance details. The actual purchase happens only
  // after the user clicks "Confirm Unlock".
  const [confirmLead, setConfirmLead] = useState(null);
  // V1.8 — success banner after a confirmed unlock. Tells the mover the
  // purchase succeeded and directs them to My Leads. Without this, the deal
  // just silently disappears from the list, which is disorienting (matches
  // the production confusion where admin/movers thought "lead went missing"
  // after a successful purchase).
  const [lastUnlocked, setLastUnlocked] = useState(null); // { route, price }

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/leads/deals`, {
        headers: { 'x-auth-token': token },
      });
      if (res.status === 404) {
        // PR-D1 — feature is gated off on the server. Render a DISTINCT
        // "Deal Room temporarily unavailable" banner, NOT the empty state.
        // The empty state means "feature on, no inventory"; this banner
        // means "feature off". The two must be visually distinguishable so
        // movers don't silently see a permanently-empty page if the env
        // flag is ever misconfigured, and so operators have a single
        // screenshot that disambiguates the two failure modes.
        setLeads([]);
        setFeatureDisabled(true);
        return;
      }
      // 200 → feature is on. Clear any prior disabled state in case the
      // operator just flipped the flag on between page loads.
      setFeatureDisabled(false);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setLeads(Array.isArray(json) ? json : []);
    } catch (err) {
      setError(err.message || 'Failed to load Deal Room');
    } finally {
      setLoading(false);
    }
  }, [API_URL, token]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  // Step 1: open the confirmation modal. Pure UI — no charge yet.
  const openConfirm = (lead) => {
    setUnlockError(null);
    setConfirmLead(lead);
  };

  // Step 2: actual purchase. Runs only after the user clicks "Confirm Unlock"
  // in the modal. Uses the existing atomic POST /api/bids/:id/buy-now path —
  // same balance debit, same PurchasedLead row, same Transaction ledger as
  // the Live Feed unlock. Money path is unchanged.
  const submitConfirmedUnlock = async () => {
    if (!confirmLead) return;
    const leadId = confirmLead._id;
    const price = Number(confirmLead.buyNowPrice) || 0;
    setBusyId(leadId);
    setUnlockError(null);
    try {
      const res = await fetch(`${API_URL}/bids/${leadId}/buy-now`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || json.msg || `HTTP ${res.status}`);
      }
      // Success → close modal, surface a confirmation banner so the mover
      // knows the purchase landed (lead disappears from the list otherwise
      // and the silence is disorienting), refresh balance, refresh deals.
      const route = `${confirmLead.originCity || '—'} → ${confirmLead.destinationCity || '—'}`;
      setLastUnlocked({ route, price });
      setConfirmLead(null);
      if (typeof refreshUser === 'function') {
        refreshUser().catch(() => { /* non-fatal */ });
      }
      await fetchDeals();
    } catch (err) {
      // Keep the modal open so the user can read the error and either
      // retry or cancel. Don't auto-close on failure.
      setUnlockError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  // Filtered list — single text search over city / zip / size today.
  // DRX-2 adds Distance / Discount / Move date dropdowns; the future
  // pack-row case will require filtering on item.type as well.
  const filtered = useMemo(() => {
    if (!search) return leads;
    const s = search.toLowerCase();
    return leads.filter(l =>
      (l.originCity || '').toLowerCase().includes(s)
      || (l.destinationCity || '').toLowerCase().includes(s)
      || (l.homeSize || '').toLowerCase().includes(s)
      || (l.originZip || '').toLowerCase().includes(s)
      || (l.destinationZip || '').toLowerCase().includes(s)
    );
  }, [leads, search]);

  // Discriminated-union item shape — future-pack-ready. Today every
  // item is { type: 'lead', lead: leadDoc }. A future pack-aware feed
  // will push { type: 'pack', pack: packDoc } items into the same
  // array; the table renders one row per item.
  const items = useMemo(
    () => filtered.map(lead => ({ type: 'lead', lead })),
    [filtered]
  );

  return (
    <DashboardLayout>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Tag size={22} color="#0d9488" />
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Deal Room</h1>
        </div>
        <p style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>
          Discounted secondary inventory. These leads are <strong>not real-time</strong>.
          They've been hand-picked and discounted by our team. Unlock works the same way as Live Leads.
        </p>
      </div>

      {lastUnlocked && (
        <div style={{
          padding: '12px 16px', marginBottom: 14, borderRadius: 6,
          background: '#ecfdf5', border: '1px solid #a7f3d0',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <CheckCircle size={18} color="#047857" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: '#064e3b' }}>
            <strong>Unlocked ${lastUnlocked.price}.</strong>{' '}
            <span style={{ color: '#065f46' }}>{lastUnlocked.route}</span>{' '}
            is now in your My Leads.
          </div>
          <Link to="/dashboard/my-leads"
            style={{ padding: '7px 14px', borderRadius: 4, background: '#047857', color: '#fff', fontWeight: 600, fontSize: 12, textDecoration: 'none', letterSpacing: 0.2 }}>
            View in My Leads
          </Link>
          <button onClick={() => setLastUnlocked(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#065f46', padding: 4 }}
            aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by city, ZIP, or home size…"
          style={{ flex: 1, minWidth: 220, padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
        />
        <button onClick={fetchDeals} disabled={loading}
          style={{ padding: '10px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
          <RefreshCw size={14} /> {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 14, marginBottom: 14, background: '#fef2f2', color: '#b91c1c', borderRadius: 10, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {unlockError && (
        <div style={{ padding: 14, marginBottom: 14, background: '#fffbeb', color: '#92400e', borderRadius: 10, fontSize: 13 }}>{unlockError}</div>
      )}

      {/* PR-D1 — distinct banner when ENABLE_DEAL_ROOM=false (server 404).
          MUST be rendered BEFORE the empty-state branch so the empty state
          never paints when the feature is off. */}
      {!loading && !error && featureDisabled && (
        <div data-testid="deal-room-disabled-banner"
             style={{ padding: 48, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 16, border: '1px dashed #cbd5e1' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 12px', color: '#94a3b8' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: '#475569' }}>Deal Room is currently unavailable</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>This feature is temporarily disabled. Please check back later or contact support if this persists.</div>
        </div>
      )}

      {!loading && !error && !featureDisabled && items.length === 0 && (
        <div data-testid="deal-room-empty-state"
             style={{ padding: 48, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 16 }}>
          <Tag size={32} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: '#475569' }}>No deals available right now</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Check back soon — new discounted inventory is added regularly.</div>
        </div>
      )}

      {!loading && !featureDisabled && items.length > 0 && (
        <div className="deals-table-wrap" data-testid="deals-table-wrap">
          <table className="deals-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Size</th>
                <th>Move date</th>
                <th>Listed</th>
                <th>Was</th>
                <th>Now</th>
                <th className="col-action-h">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item =>
                item.type === 'lead'
                  ? <DealsLeadRow key={item.lead._id} lead={item.lead}
                                  busy={busyId === item.lead._id} onUnlock={openConfirm} />
                  // Future: item.type === 'pack' → <DealsPackRow pack={item.pack} ... />
                  : null
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* V1.6 — unlock confirmation modal. Opens BEFORE the actual purchase
          so the mover sees full details + balance math + finality warning
          and explicitly clicks "Confirm Unlock" to charge. */}
      {confirmLead && (
        <UnlockConfirmModal
          lead={confirmLead}
          balance={Number(user?.balance) || 0}
          busy={busyId === confirmLead._id}
          error={unlockError}
          onCancel={() => { setConfirmLead(null); setUnlockError(null); }}
          onConfirm={submitConfirmedUnlock}
        />
      )}
    </DashboardLayout>
  );
}

/* ── DRX-1: per-lead table row ──────────────────────────────────────────
 * Renders one <tr> with the 7-column exchange layout. On mobile (≤700px
 * via Deals.css media queries) the same <tr> collapses into a stacked
 * card with route header + meta row + price+CTA block.
 * ───────────────────────────────────────────────────────────────────── */
function DealsLeadRow({ lead, busy, onUnlock }) {
  const price = Number(lead.buyNowPrice) || 0;
  const original = Number(lead.originalPrice) || 0;
  const discountPct = lead.discountPercent
    || (original > 0 && price < original ? Math.round((1 - price / original) * 100) : 0);
  const hasDiscount = original > price && discountPct > 0;

  const moveDateStr = lead.moveDate
    ? new Date(lead.moveDate).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
    : '—';

  const listedStr = timeAgo(lead.updatedAt);

  return (
    <tr className="deals-row" data-testid="deals-lead-row">
      {/* Route */}
      <td className="col-route">
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
          {fmtRoutePart(lead.originCity, lead.originState)}
          <span style={{ color: '#cbd5e1', fontWeight: 300, margin: '0 6px' }}>→</span>
          {fmtRoutePart(lead.destinationCity, lead.destinationState)}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
          {(lead.originZip || '—')} → {(lead.destinationZip || '—')}
          {lead.distance ? ` · ${lead.distance}` : ''}
          {Number.isFinite(Number(lead.miles)) && Number(lead.miles) > 0 ? ` · ${lead.miles} mi` : ''}
        </div>
      </td>

      {/* Size */}
      <td className="col-size" style={{ whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#475569', fontSize: 13, fontWeight: 600 }}>
          <Home size={13} color="#94a3b8" />
          {lead.homeSize || '—'}
        </span>
      </td>

      {/* Move date */}
      <td className="col-date" style={{ whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#475569', fontSize: 13 }}>
          <Calendar size={13} color="#94a3b8" />
          {moveDateStr}
        </span>
      </td>

      {/* Listed (hidden on mobile via CSS) */}
      <td className="col-listed" style={{ whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#94a3b8', fontSize: 13 }}>
          <Clock size={13} />
          {listedStr}
        </span>
      </td>

      {/* Was — strikethrough original (hidden on mobile, merged into action cell) */}
      <td className="col-was" style={{ whiteSpace: 'nowrap' }}>
        {hasDiscount
          ? <span style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>${original}</span>
          : <span style={{ fontSize: 13, color: '#cbd5e1' }}>—</span>}
      </td>

      {/* Now — discounted price + discount badge */}
      <td className="col-now" style={{ whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>${price}</span>
          {hasDiscount && (
            <span style={{ fontSize: 11, fontWeight: 800, color: '#047857' }}>−{discountPct}%</span>
          )}
        </div>
      </td>

      {/* Action — Unlock CTA. On mobile, the price block reappears INSIDE
          this cell above the button via the .price-unlock-mobile element. */}
      <td className="col-action" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div className="price-unlock-mobile">
          <span className="price-now">${price}</span>
          {hasDiscount && <span className="price-was">${original}</span>}
          {hasDiscount && <span className="price-discount">−{discountPct}%</span>}
        </div>
        <button onClick={() => onUnlock(lead)} disabled={busy} className="deals-cta"
          style={{
            padding: '10px 18px', borderRadius: 6, border: 'none',
            background: busy ? '#cbd5e1' : '#0d9488',
            color: '#fff', fontWeight: 700, fontSize: 13,
            cursor: busy ? 'wait' : 'pointer',
            letterSpacing: 0.2,
          }}>
          {busy ? 'Unlocking…' : `Unlock $${price}`}
        </button>
      </td>
    </tr>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function fmtRoutePart(city, state) {
  if (!city) return '—';
  return state ? `${city}, ${state}` : city;
}

function timeAgo(dateLike) {
  if (!dateLike) return '—';
  const then = new Date(dateLike);
  if (Number.isNaN(then.getTime())) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  return `${wk}w ago`;
}

/* ── V1.6 — Unlock confirmation modal ───────────────────────────────────────
 * Shows the mover everything they need to decide BEFORE the atomic charge
 * fires: route, move details, pricing math (discount + original), quality
 * tags from validation data, balance before/after, and a "purchase is final"
 * warning. Reuses the same buy-now endpoint on Confirm — no new money path.
 * ───────────────────────────────────────────────────────────────────────── */
function UnlockConfirmModal({ lead, balance, busy, error, onCancel, onConfirm }) {
  const price = Number(lead.buyNowPrice) || 0;
  const original = Number(lead.originalPrice) || 0;
  const discountPct = (original > 0 && price < original)
    ? Math.round((1 - price / original) * 100) : 0;
  const balanceAfter = balance - price;
  const insufficientBalance = balanceAfter < 0;

  const moveDateStr = lead.moveDate
    ? new Date(lead.moveDate).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  // Quality tags pulled from the redacted lead the /deals endpoint returns.
  const phone = (lead.validation && lead.validation.phone) || {};
  const isMobile = phone.lineType === 'mobile';
  const isVoip = phone.isVoip === true;
  const phoneUnverified = !phone.checkedAt;
  const tierLabel = toMoverLabel(lead.shadowTier);

  return (
    <div onClick={() => !busy && onCancel()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 10, padding: 0, maxWidth: 460, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#6b7280', textTransform: 'uppercase' }}>Confirm purchase</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>Unlock Deal Room lead</div>
          </div>
          <button onClick={onCancel} disabled={busy}
            style={{ background: 'transparent', border: 'none', cursor: busy ? 'wait' : 'pointer', color: '#9ca3af', padding: 4 }}
            aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Lead details */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            {lead.originCity || '—'} → {lead.destinationCity || '—'}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap', fontSize: 12, color: '#475569' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Home size={12} /> {lead.homeSize || '—'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={12} /> {moveDateStr}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={12} /> {lead.miles || 0} mi
            </span>
          </div>

          {/* Quality tags */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {tierLabel && <QualityTag tone="info" label={tierLabel} />}
            {isMobile && !isVoip && <QualityTag tone="ok" label="Mobile phone" />}
            {isVoip && <QualityTag tone="warn" label="VoIP line" />}
            {phoneUnverified && <QualityTag tone="muted" label="Phone unverified" />}
          </div>
        </div>

        {/* Pricing */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Price</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>${price}</div>
            {original > price && (
              <>
                <div style={{ fontSize: 14, color: '#9ca3af', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>${original}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#047857' }}>−{discountPct}%</div>
              </>
            )}
          </div>
        </div>

        {/* Balance math */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Account</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151', marginBottom: 4 }}>
            <span>Current balance</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>${balance.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: insufficientBalance ? '#b91c1c' : '#374151' }}>
            <span>After unlock</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>${balanceAfter.toFixed(2)}</span>
          </div>
        </div>

        {/* Warning */}
        <div style={{ padding: '12px 20px', background: '#fffbeb', borderBottom: '1px solid #fde68a', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertCircle size={16} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
            Purchase is final. Once you unlock, the lead's full contact details become available in My Leads. Refunds require admin approval through the Resolution Center.
          </div>
        </div>

        {error && (
          <div style={{ padding: '12px 20px', background: '#fef2f2', color: '#991b1b', fontSize: 13, borderBottom: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: '14px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={busy}
            style={{ padding: '10px 18px', borderRadius: 6, background: '#fff', border: '1px solid #d1d5db', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy || insufficientBalance}
            title={insufficientBalance ? 'Insufficient balance' : undefined}
            style={{
              padding: '10px 22px', borderRadius: 6, border: 'none',
              background: insufficientBalance ? '#cbd5e1' : '#0f766e',
              color: '#fff', fontWeight: 700, fontSize: 13,
              cursor: (busy || insufficientBalance) ? 'not-allowed' : 'pointer',
            }}>
            {busy ? 'Unlocking…' : insufficientBalance ? 'Insufficient balance' : `Confirm Unlock — $${price}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function QualityTag({ tone, label }) {
  const tones = {
    info:  { bg: '#eef2ff', fg: '#3730a3', border: '#c7d2fe' },
    ok:    { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
    warn:  { bg: '#fffbeb', fg: '#92400e', border: '#fde68a' },
    muted: { bg: '#f3f4f6', fg: '#6b7280', border: '#e5e7eb' },
  };
  const t = tones[tone] || tones.muted;
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
    }}>{label}</span>
  );
}
