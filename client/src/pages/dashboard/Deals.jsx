import { useContext, useEffect, useState, useCallback } from 'react';
import { Tag, MapPin, Calendar, Home, RefreshCw, AlertCircle, X } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import { toMoverLabel } from '../../utils/tierLabels';

/**
 * Deal Room — secondary discounted inventory (V1).
 *
 * Mover-facing browse surface. NOT real-time. Pulls inventoryChannel='deal_room'
 * leads from GET /api/leads/deals (env-gated by ENABLE_DEAL_ROOM on the server).
 * Unlock CTA hits the existing POST /api/bids/:leadId/buy-now path — no new
 * money path; same atomic claim + balance debit + PurchasedLead + Transaction
 * as the Live Feed.
 *
 * Page intentionally minimal for V1:
 *   - No packs (V2)
 *   - No auctions (V3)
 *   - No filters beyond a basic search input
 *   - No sort options (server sorts by updatedAt desc — most recently moved
 *     to Deal Room appears first, which matches admin intent for "showcase
 *     what was just added")
 *   - No socket "new deal" emit — page is poll-on-refresh
 */

export default function Deals() {
  const { API_URL, token, user, refreshUser } = useContext(AuthContext);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [unlockError, setUnlockError] = useState(null);
  // V1.6 — unlock confirmation modal. Click "Unlock" → opens this modal
  // showing lead/price/balance details. The actual purchase happens only
  // after the user clicks "Confirm Unlock".
  const [confirmLead, setConfirmLead] = useState(null);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/leads/deals`, {
        headers: { 'x-auth-token': token },
      });
      if (res.status === 404) {
        // Feature is gated off on the server — render the empty state, not an error.
        setLeads([]);
        return;
      }
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
      // Success → close modal, refresh balance in AuthContext, refresh deals.
      // The purchased lead moves to status='Purchased' and drops out of the
      // /deals query naturally; it appears in My Leads via /api/purchases.
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

  const filtered = !search ? leads : leads.filter(l => {
    const s = search.toLowerCase();
    return (l.originCity || '').toLowerCase().includes(s)
        || (l.destinationCity || '').toLowerCase().includes(s)
        || (l.homeSize || '').toLowerCase().includes(s);
  });

  return (
    <DashboardLayout>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Tag size={22} color="#d97706" />
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Deal Room</h1>
        </div>
        <p style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>
          Discounted secondary inventory. These leads are <strong>not real-time</strong>.
          They've been hand-picked and discounted by our team. Unlock works the same way as Live Leads.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by city or home size…"
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

      {!loading && !error && filtered.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 16 }}>
          <Tag size={32} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: '#475569' }}>No deals available right now</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Check back soon — new discounted inventory is added regularly.</div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {filtered.map(lead => <DealCard key={lead._id} lead={lead} onUnlock={openConfirm} busy={busyId === lead._id} />)}
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

function DealCard({ lead, onUnlock, busy }) {
  const price = Number(lead.buyNowPrice) || 0;
  const original = Number(lead.originalPrice) || 0;
  const pct = lead.discountPercent || (original > 0 && price < original ? Math.round((1 - price / original) * 100) : 0);

  const moveDateStr = lead.moveDate
    ? new Date(lead.moveDate).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #fde68a',
      boxShadow: '0 2px 8px rgba(245,158,11,0.08)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Discount badge top-right */}
      {pct > 0 && (
        <div style={{
          alignSelf: 'flex-end',
          padding: '4px 10px', borderRadius: 100,
          background: '#fef3c7', color: '#92400e',
          fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
        }}>−{pct}% OFF</div>
      )}

      {/* Route */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MapPin size={16} color="#d97706" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
            {lead.originCity || '—'} → {lead.destinationCity || '—'}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            {lead.distance || '—'} · {lead.miles || 0} mi
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#475569' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Home size={12} /> {lead.homeSize || '—'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Calendar size={12} /> {moveDateStr}
        </span>
      </div>

      {/* Price + unlock */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 10 }}>
        <div>
          {original > price && (
            <div style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>${original}</div>
          )}
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>${price}</div>
        </div>
        <button onClick={() => onUnlock(lead)} disabled={busy}
          style={{
            padding: '11px 18px', borderRadius: 6, border: 'none',
            background: busy ? '#cbd5e1' : '#0f766e',
            color: '#fff', fontWeight: 700, fontSize: 13, cursor: busy ? 'wait' : 'pointer',
            letterSpacing: 0.2,
          }}>
          {busy ? 'Unlocking…' : `Unlock $${price}`}
        </button>
      </div>
    </div>
  );
}
