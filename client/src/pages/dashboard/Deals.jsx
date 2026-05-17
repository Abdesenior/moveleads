import { useContext, useEffect, useState, useCallback } from 'react';
import { Tag, MapPin, Calendar, Home, RefreshCw, AlertCircle } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';

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
  const { API_URL, token } = useContext(AuthContext);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [unlockError, setUnlockError] = useState(null);

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

  const handleUnlock = async (leadId, price) => {
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
      // Refresh after successful purchase — the lead moves to "Purchased"
      // status and no longer matches the deals endpoint filter, so it drops
      // out of the list naturally.
      await fetchDeals();
    } catch (err) {
      setUnlockError(`Unlock failed for $${price}: ${err.message}`);
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
          {filtered.map(lead => <DealCard key={lead._id} lead={lead} onUnlock={handleUnlock} busy={busyId === lead._id} />)}
        </div>
      )}
    </DashboardLayout>
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
        <button onClick={() => onUnlock(lead._id, price)} disabled={busy}
          style={{
            padding: '12px 18px', borderRadius: 10, border: 'none',
            background: busy ? '#cbd5e1' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: '#fff', fontWeight: 800, fontSize: 13, cursor: busy ? 'wait' : 'pointer',
            boxShadow: busy ? 'none' : '0 4px 12px rgba(245,158,11,0.3)',
          }}>
          {busy ? 'Unlocking…' : `Unlock $${price}`}
        </button>
      </div>
    </div>
  );
}
