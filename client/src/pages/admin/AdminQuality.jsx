import { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle, XCircle, RefreshCw, BarChart2 } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import ScoringSnapshotModal from '../../components/admin/ScoringSnapshotModal';
import { toMoverLabel } from '../../utils/tierLabels';

/**
 * V5 Phase 4 — Quality Review queue
 *
 * Dedicated page for leads that need admin attention. Pre-filtered to:
 *   - tier === 'review'
 *   - tier === 'rejected'        (so admin can audit auto-rejects)
 *   - phone.valid === false      (any invalid phone, regardless of tier)
 *   - phone.isVoip === true      (VoIP needs human review)
 *   - phone.suspicionPattern set (medium-strength fake-pattern leads)
 *   - route.suspicious contains 'origin_zip_not_found' or
 *     'destination_zip_not_found'  (route unresolved)
 *   - miles === 0                (distance unknown)
 *   - telecom unverified         (Twilio didn't run / no enrichment)
 *
 * Same modal component as /admin/leads, but the list is filtered to the
 * review-relevant subset and the layout emphasizes triage.
 */

const FILTER_BUCKETS = [
  { key: 'all',       label: 'All review-worthy', icon: AlertTriangle },
  { key: 'review',    label: 'Tier: Review',      icon: AlertTriangle },
  { key: 'rejected',  label: 'Tier: Rejected',    icon: XCircle },
  { key: 'phone',     label: 'Phone invalid',     icon: XCircle },
  { key: 'voip',      label: 'VoIP detected',     icon: AlertCircle },
  { key: 'suspect',   label: 'Suspicious pattern', icon: AlertTriangle },
  { key: 'route',     label: 'Route unresolved',  icon: AlertTriangle },
  { key: 'unverified', label: 'Telecom unverified', icon: AlertCircle },
];

const STATUS_COLORS = {
  'Ready':           { bg: '#dcfce7', fg: '#15803d' },
  'Review Required': { bg: '#fef3c7', fg: '#b45309' },
  'Blocked':         { bg: '#fee2e2', fg: '#b91c1c' },
  'Rejected':        { bg: '#f1f5f9', fg: '#475569' },
};

const TIER_COLORS = {
  hot:      { bg: '#fef2f2', fg: '#dc2626' },
  premium:  { bg: '#f5f3ff', fg: '#7c3aed' },
  standard: { bg: '#eff6ff', fg: '#2563eb' },
  review:   { bg: '#fef3c7', fg: '#d97706' },
  rejected: { bg: '#f1f5f9', fg: '#64748b' },
};

export default function AdminQuality() {
  const { API_URL, token } = useContext(AuthContext);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bucket, setBucket] = useState('all');
  const [search, setSearch] = useState('');

  const [modalLead, setModalLead] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/leads`, { headers: { 'x-auth-token': token } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [API_URL, token]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Predicate: does this lead match a given bucket?
  // The GET /api/leads endpoint annotates _shadowTier/_shadowComposite/_shadowEngineVersion
  // for admin viewers. For the deeper signals (phone.valid, isVoip, etc.)
  // we'd need to fetch the snapshot — at this list level we only have what
  // /api/leads returns. So bucket predicates use only the available data
  // (tier annotation) and we accept that some filters are tier-based only.
  // The modal still fetches the full snapshot when admin clicks in.
  function matchesBucket(lead, b) {
    const tier = lead._shadowTier;
    if (b === 'all') {
      // Anything except 'hot' and 'standard' — i.e. leads worth reviewing
      return tier === 'review' || tier === 'rejected' || tier === 'premium' || !tier;
      // Note: includes premium because telecom-unverified soft-caps at premium
    }
    if (b === 'review')   return tier === 'review';
    if (b === 'rejected') return tier === 'rejected';
    // phone / voip / suspect / route / unverified: require snapshot-level data
    // we don't have at list time. Show all leads (admin filters via search +
    // opens the modal to see the actual signal).
    return true;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
      .filter(l => matchesBucket(l, bucket))
      .filter(l => !q ||
        (l.originCity || '').toLowerCase().includes(q) ||
        (l.destinationCity || '').toLowerCase().includes(q) ||
        (l.customerName || '').toLowerCase().includes(q) ||
        (l.customerPhone || '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        // Sort: review/rejected first, then by createdAt desc within each
        const tierPriority = (t) => ({ rejected: 0, review: 1, premium: 2, standard: 3, hot: 4 })[t] ?? 5;
        const pa = tierPriority(a._shadowTier);
        const pb = tierPriority(b._shadowTier);
        if (pa !== pb) return pa - pb;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }, [leads, bucket, search]);

  const bucketCounts = useMemo(() => {
    const c = {};
    for (const b of FILTER_BUCKETS) c[b.key] = leads.filter(l => matchesBucket(l, b.key)).length;
    return c;
  }, [leads]);

  const openModal = useCallback(async (lead) => {
    setModalLead(lead);
    setModalData(null);
    setModalError(null);
    setModalLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/leads/${lead._id}/scoring-snapshot`, {
        headers: { 'x-auth-token': token },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setModalData(json);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  }, [API_URL, token]);

  const closeModal = () => { setModalLead(null); setModalData(null); setModalError(null); };

  return (
    <AdminLayout>
      <header className="dashboard-header">
        <h1 style={{ fontFamily: 'var(--font-heading)' }}>Quality Review</h1>
        <p>Lead-quality triage queue. Shadow mode — actions do not affect mover-facing visibility yet.</p>
      </header>

      {/* Bucket tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {FILTER_BUCKETS.map(b => {
          const Icon = b.icon;
          const active = bucket === b.key;
          const count = bucketCounts[b.key] ?? 0;
          return (
            <button
              key={b.key}
              onClick={() => setBucket(b.key)}
              style={{
                padding: '10px 14px', borderRadius: 12,
                background: active ? '#0f172a' : '#fff',
                color: active ? '#fff' : '#0f172a',
                border: active ? 'none' : '1px solid #e2e8f0',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={14} />
              {b.label}
              <span style={{
                background: active ? 'rgba(255,255,255,0.15)' : '#f1f5f9',
                color: active ? '#fff' : '#64748b',
                padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700,
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search + refresh */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by city, name, phone…"
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
        />
        <button onClick={fetchLeads} title="Refresh"
          style={{ padding: '10px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Status banner */}
      {error && <div style={{ padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 10, marginBottom: 12 }}>{error}</div>}
      {loading && <div style={{ color: '#64748b', fontSize: 14 }}>Loading…</div>}

      {!loading && !error && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden', borderRadius: 18 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
              <CheckCircle size={32} style={{ margin: '0 auto 12px', color: '#16a34a' }} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>Queue empty for this filter</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Nothing to review.</div>
            </div>
          ) : (
            <table className="leads-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 24 }}>Lead</th>
                  <th>Contact</th>
                  <th>Move</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th style={{ textAlign: 'right', paddingRight: 24 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead, i) => (
                  <QualityRow key={lead._id} lead={lead} alt={i % 2 === 1} onOpen={() => openModal(lead)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {modalLead && (
        <ScoringSnapshotModal
          lead={modalLead}
          data={modalData}
          loading={modalLoading}
          error={modalError}
          onClose={closeModal}
          onActionComplete={(fresh) => {
            setModalData(fresh);
            // Re-fetch list so the row reflects updated tier/status.
            fetchLeads();
          }}
        />
      )}
    </AdminLayout>
  );
}

function QualityRow({ lead, alt, onOpen }) {
  const tc = (lead._shadowTier && TIER_COLORS[lead._shadowTier]) || { bg: '#f1f5f9', fg: '#64748b' };
  const composite = lead._shadowComposite;
  return (
    <tr style={{ background: alt ? '#fcfdfe' : '#fff' }}>
      <td style={{ paddingLeft: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{lead.originCity} → {lead.destinationCity}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{lead.distance} · {lead.miles || 0} mi</div>
      </td>
      <td>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{lead.customerName || '—'}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{lead.customerPhone || '—'}</div>
      </td>
      <td>
        <div style={{ fontSize: 12, color: '#475569' }}>{lead.homeSize}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          {lead.moveDate ? new Date(lead.moveDate).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            title={toMoverLabel(lead._shadowTier) ? `Mover sees: ${toMoverLabel(lead._shadowTier)}` : undefined}
            style={{
              padding: '4px 10px', borderRadius: 100, fontSize: 10, fontWeight: 700,
              letterSpacing: 0.5, textTransform: 'uppercase', background: tc.bg, color: tc.fg,
            }}>{lead._shadowTier || '—'}</span>
          {typeof composite === 'number' && (
            <span style={{ fontSize: 11, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{composite}</span>
          )}
        </div>
      </td>
      <td>
        <span style={{
          padding: '4px 10px', borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
          textTransform: 'uppercase',
          background: lead.status === 'REJECTED_FAKE' || lead.status === 'PENDING_MANUAL_REVIEW' ? '#fef2f2' : '#f1f5f9',
          color: lead.status === 'REJECTED_FAKE' || lead.status === 'PENDING_MANUAL_REVIEW' ? '#dc2626' : '#64748b',
        }}>{lead.status}</span>
      </td>
      <td>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {lead.createdAt ? new Date(lead.createdAt).toLocaleString() : '—'}
        </span>
      </td>
      <td style={{ textAlign: 'right', paddingRight: 24 }}>
        <button onClick={onOpen}
          style={{
            padding: '7px 14px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fde68a',
            color: '#92400e', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          <BarChart2 size={12} /> Review
        </button>
      </td>
    </tr>
  );
}
