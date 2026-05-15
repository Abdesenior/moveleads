import { useState, useCallback, useContext, useEffect } from 'react';
import { X, CheckCircle, XCircle, RefreshCw, Edit3, Trash2, FileText, AlertTriangle, Clock } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { toMoverLabel } from '../../utils/tierLabels';

/**
 * V5 Phase 4 — Scoring Snapshot Modal with admin actions
 *
 * Shows everything an admin needs to review a lead in one screen:
 *   - Distribution-readiness badge (Ready / Review Required / Blocked / Rejected)
 *   - Tier-cap reasons (why this lead cannot reach hot)
 *   - Legacy score vs shadow tier comparison
 *   - 7 sub-scores
 *   - Tier rationale
 *   - Validation logs (Twilio / Mapbox / fingerprint)
 *   - Admin override + review trail
 *   - 7 admin action buttons (approve, reject, rescore, tier-override,
 *     clear override, mark fake, mark reviewed)
 *
 * Used by both /admin/leads and /admin/quality. Receives `lead` (basic
 * row) + initial `data` (from the snapshot endpoint). The modal re-fetches
 * after every action so the state stays authoritative.
 */

const TIER_COLORS = {
  hot:      { bg: '#fef2f2', fg: '#dc2626', border: '#fecaca' },
  premium:  { bg: '#f5f3ff', fg: '#7c3aed', border: '#ddd6fe' },
  standard: { bg: '#eff6ff', fg: '#2563eb', border: '#bfdbfe' },
  review:   { bg: '#fef3c7', fg: '#d97706', border: '#fde68a' },
  rejected: { bg: '#f1f5f9', fg: '#64748b', border: '#e2e8f0' },
};

const STATUS_COLORS = {
  'Ready':            { bg: '#dcfce7', fg: '#15803d' },
  'Review Required':  { bg: '#fef3c7', fg: '#b45309' },
  'Blocked':          { bg: '#fee2e2', fg: '#b91c1c' },
  'Rejected':         { bg: '#f1f5f9', fg: '#475569' },
};

const SEVERITY_COLORS = {
  high:   { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
  medium: { bg: '#fef3c7', fg: '#b45309', border: '#fde68a' },
  low:    { bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe' },
};

const TIMELINE_COLORS = {
  lead_created:           { bg: '#f8fafc', border: '#e2e8f0', tagBg: '#e2e8f0', tagFg: '#475569' },
  validated:              { bg: '#eff6ff', border: '#bfdbfe', tagBg: '#dbeafe', tagFg: '#1e40af' },
  scored:                 { bg: '#fffbeb', border: '#fde68a', tagBg: '#fef3c7', tagFg: '#92400e' },
  admin_approved:         { bg: '#ecfdf5', border: '#a7f3d0', tagBg: '#dcfce7', tagFg: '#15803d' },
  admin_rejected:         { bg: '#fef2f2', border: '#fecaca', tagBg: '#fee2e2', tagFg: '#b91c1c' },
  rescored:               { bg: '#eff6ff', border: '#bfdbfe', tagBg: '#dbeafe', tagFg: '#1e40af' },
  tier_override_set:      { bg: '#f5f3ff', border: '#ddd6fe', tagBg: '#ede9fe', tagFg: '#6d28d9' },
  tier_override_cleared:  { bg: '#f1f5f9', border: '#cbd5e1', tagBg: '#e2e8f0', tagFg: '#475569' },
  marked_reviewed:        { bg: '#ecfdf5', border: '#a7f3d0', tagBg: '#dcfce7', tagFg: '#047857' },
  _default:               { bg: '#f8fafc', border: '#e2e8f0', tagBg: '#e2e8f0', tagFg: '#475569' },
};

export default function ScoringSnapshotModal({ lead, data, loading, error, onClose, onActionComplete }) {
  const { API_URL, token } = useContext(AuthContext);
  const [busy, setBusy] = useState(null); // current action label or null
  const [actionError, setActionError] = useState(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTier, setOverrideTier] = useState('standard');
  const [overrideReason, setOverrideReason] = useState('');
  const [timeline, setTimeline] = useState(null);
  const [timelineErr, setTimelineErr] = useState(null);

  useEffect(() => {
    if (!lead?._id) return;
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/admin/leads/${lead._id}/action-timeline`, {
          headers: { 'x-auth-token': token },
        });
        const json = await res.json();
        if (cancel) return;
        if (!res.ok || json.ok === false) throw new Error(json.msg || `HTTP ${res.status}`);
        setTimeline(json.events || []);
      } catch (err) {
        if (!cancel) setTimelineErr(err.message || 'Failed to load timeline');
      }
    })();
    return () => { cancel = true; };
  // Re-fetch after each successful admin action via the parent's onActionComplete:
  // we listen to `data` changes (parent re-fetches the snapshot endpoint, which
  // updates `data`). Cheap: timeline endpoint is admin-only, small payload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?._id, data]);

  const snap = data?.snapshot;
  const distribution = data?.distribution;
  const validationLogs = data?.validationLogs || [];
  const leadDetail = data?.lead;
  const triplet = data?.statusTriplet;
  const tier = snap?.tier;
  const tierColor = (tier && TIER_COLORS[tier]) || TIER_COLORS.standard;
  const statusColor = (distribution?.status && STATUS_COLORS[distribution.status]) || STATUS_COLORS['Ready'];

  const callAction = useCallback(async (label, method, path, body) => {
    setBusy(label);
    setActionError(null);
    try {
      const url = `${API_URL}/admin/leads/${lead._id}${path}`;
      const res = await fetch(url, {
        method,
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.msg || `HTTP ${res.status}`);
      }
      // Pass the fresh payload back so the parent re-renders.
      if (onActionComplete) onActionComplete(json);
    } catch (err) {
      setActionError(err.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  }, [API_URL, token, lead._id, onActionComplete]);

  const onApprove = () => callAction('approve', 'POST', '/approve', { reason: 'Admin approved for distribution' });
  const onReject = () => callAction('reject', 'POST', '/reject', { reason: 'Admin marked as fake/rejected' });
  const onRescore = () => callAction('rescore', 'POST', '/rescore', { reason: 'Manual rescore from admin modal' });
  const onClearOverride = () => callAction('clear-override', 'DELETE', '/tier-override');
  const onMarkReviewed = () => callAction('mark-reviewed', 'POST', '/mark-reviewed', { note: reviewNote || undefined });
  const onSubmitOverride = () => {
    if (overrideReason.trim().length < 3) {
      setActionError('Reason is required (min 3 chars)');
      return;
    }
    callAction('tier-override', 'POST', '/tier-override', { tier: overrideTier, reason: overrideReason });
    setOverrideOpen(false);
    setOverrideReason('');
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,20,40,0.65)', backdropFilter: 'blur(14px)',
      zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', width: '100%', maxWidth: 820, maxHeight: '90vh', overflow: 'auto',
        borderRadius: 24, boxShadow: '0 40px 100px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fff 100%)', position: 'sticky', top: 0, zIndex: 2,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#d97706', textTransform: 'uppercase' }}>
              Quality Review · {data?.mode || 'shadow'} mode
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
              {lead.originCity} → {lead.destinationCity}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {lead.customerName} · {lead.homeSize} · {lead.miles || 0} mi
              {leadDetail?.funnelVersion && <span style={{ marginLeft: 8, padding: '2px 6px', background: '#0f172a', color: '#fff', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{leadDetail.funnelVersion.toUpperCase()}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(15,23,42,0.05)', border: 'none', borderRadius: 10,
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }} title="Close"><X size={16} /></button>
        </div>

        <div style={{ padding: 24 }}>
          {loading && <div style={{ color: '#64748b', fontSize: 14 }}>Loading…</div>}
          {error && <div style={{ color: '#dc2626', fontSize: 14 }}>Error: {error}</div>}

          {!loading && !error && data && (
            <>
              {/* ── Status triplet (Phase 6.1) — lifecycle / quality / distribution ── */}
              {triplet && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                  <TripletCard label="Lifecycle status" value={triplet.lifecycle || '—'} hint="Lead.status (legacy)" />
                  <TripletCard label="Quality status" value={triplet.quality || '—'} hint="From distribution status" tone={triplet.quality} />
                  <TripletCard
                    label="Distribution status"
                    value={triplet.distribution || '—'}
                    hint={triplet.routingMode === 'off' ? 'routing mode: off' : `routing mode: ${triplet.routingMode}`}
                    tone={triplet.distribution}
                  />
                </div>
              )}

              {/* ── Distribution status + tier badge ─────────────────── */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{
                  padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  background: statusColor.bg, color: statusColor.fg, border: `1px solid ${statusColor.fg}33`,
                }}>
                  {distribution?.status || '—'}
                </div>
                {tier && (
                  <div style={{
                    padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    background: tierColor.bg, color: tierColor.fg, border: `1px solid ${tierColor.border}`,
                  }}>
                    Tier: {tier}
                    {toMoverLabel(tier) && <span style={{ marginLeft: 6, opacity: 0.75, fontWeight: 600 }}>· {toMoverLabel(tier)}</span>}
                    {snap?.scores?.compositeScore != null && <span style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>(score {snap.scores.compositeScore})</span>}
                  </div>
                )}
                {distribution?.override && (
                  <div style={{ padding: '8px 16px', borderRadius: 10, fontSize: 11, background: '#0f172a', color: '#fff', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Admin Override → {distribution.override}
                  </div>
                )}
                {leadDetail?.reviewedAt && (
                  <div style={{ padding: '8px 12px', borderRadius: 10, fontSize: 11, background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                    ✓ Reviewed {new Date(leadDetail.reviewedAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* ── Tier cap reasons (why not hot) ───────────────────── */}
              {distribution?.capReasons?.length > 0 && (
                <div style={{ marginBottom: 18, padding: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#92400e', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={12} /> Why not hot ({distribution.capReasons.length} {distribution.capReasons.length === 1 ? 'reason' : 'reasons'})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {distribution.capReasons.map((r, i) => {
                      const sev = SEVERITY_COLORS[r.severity] || SEVERITY_COLORS.medium;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: sev.bg, color: sev.fg, border: `1px solid ${sev.border}` }}>
                            {r.severity}
                          </span>
                          <span style={{ color: '#0f172a' }}>{r.message}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Pricing: legacy buyNow vs V2 shadow breakdown ──── */}
              {(leadDetail?.legacy?.buyNowPrice != null || leadDetail?.pricingV2?.priceShadowV2 != null) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                  <div style={{ padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase' }}>Legacy price (charged)</div>
                    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                      {leadDetail?.legacy?.buyNowPrice != null ? `$${leadDetail.legacy.buyNowPrice}` : '—'}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>multiplier engine · used for claim/refund</div>
                  </div>
                  <div style={{ padding: 14, background: '#ecfdf5', borderRadius: 12, border: '1px solid #a7f3d0' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#047857', textTransform: 'uppercase' }}>Shadow V2 price</div>
                    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                      {leadDetail?.pricingV2?.priceShadowV2 != null ? `$${leadDetail.pricingV2.priceShadowV2}` : '—'}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: '#047857' }}>additive add-ons · NOT charged (shadow)</div>
                    {Array.isArray(leadDetail?.pricingV2?.breakdown) && leadDetail.pricingV2.breakdown.length > 0 && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 11, color: '#047857', fontWeight: 600 }}>breakdown ({leadDetail.pricingV2.breakdown.length})</summary>
                        <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 11, color: '#0f172a', lineHeight: 1.6 }}>
                          {leadDetail.pricingV2.breakdown.map((b, i) => (
                            <li key={i}>{b.label || b.code} <span style={{ color: '#64748b', marginLeft: 4 }}>${b.amountUsd}</span></li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              )}

              {/* ── Legacy vs shadow comparison ──────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
                <div style={{ padding: 16, background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase' }}>Legacy (production)</div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{leadDetail?.legacy?.score ?? '—'}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#475569' }}>Grade {leadDetail?.legacy?.grade ?? '—'}</div>
                  </div>
                  {Array.isArray(leadDetail?.legacy?.scoreFactors) && leadDetail.legacy.scoreFactors.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 11, color: '#64748b' }}>
                      {leadDetail.legacy.scoreFactors.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                </div>
                <div style={{ padding: 16, background: '#fffbeb', borderRadius: 14, border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#d97706', textTransform: 'uppercase' }}>Shadow (V5 engine)</div>
                  {snap ? (
                    <>
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{snap.scores?.compositeScore ?? '—'}</div>
                        {/* Phase 6.1 — show capped → raw delta so admin sees the unfiltered score
                            and the cap level that pulled it down. */}
                        {snap.breakdown?.compositeCapApplied && snap.breakdown?.compositeRaw != null && (
                          <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>
                            ↓ capped from <span style={{ textDecoration: 'line-through' }}>{snap.breakdown.compositeRaw}</span>
                            {snap.breakdown.compositeCapValue != null && <span> (cap={snap.breakdown.compositeCapValue})</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: '#92400e' }}>engine {snap.engineVersion}{snap.leadStatusAtScoring && ` · status=${snap.leadStatusAtScoring}`}</div>
                      {Array.isArray(snap.breakdown?.compositeBlockers) && snap.breakdown.compositeBlockers.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#92400e' }}>
                          <strong>{snap.breakdown.compositeBlockers.length}</strong> blocker{snap.breakdown.compositeBlockers.length === 1 ? '' : 's'} active:{' '}
                          {snap.breakdown.compositeBlockers.map(b => `${b.code} (≤${b.cap})`).join(' · ')}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#92400e' }}>No snapshot yet.</div>
                  )}
                </div>
              </div>

              {snap && (
                <>
                  {/* ── Sub-scores ─────────────────────────────────────── */}
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Sub-scores</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      {[
                        ['trustScore', 'Trust'],
                        ['urgencyScore', 'Urgency'],
                        ['leadValueScore', 'Lead Value'],
                        ['routeValueScore', 'Route Value'],
                        ['intentScore', 'Intent'],
                        ['fraudRiskScore', 'Fraud Risk (inv)'],
                        ['moverMatchScore', 'Mover Match'],
                      ].map(([key, label]) => {
                        const v = snap.scores?.[key] ?? 0;
                        return (
                          <div key={key} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#475569' }}>{label}</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{v}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Tier rationale ────────────────────────────────── */}
                  {Array.isArray(snap.tierReason) && snap.tierReason.length > 0 && (
                    <div style={{ marginBottom: 22 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Tier rationale</div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#334155', lineHeight: 1.7 }}>
                        {snap.tierReason.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* ── Validation logs ───────────────────────────────── */}
                  {validationLogs.length > 0 && (
                    <details style={{ marginBottom: 22 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={12} /> Validation logs ({validationLogs.length})
                      </summary>
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {validationLogs.map((log, i) => (
                          <div key={log._id || i} style={{ padding: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
                              <span style={{ fontWeight: 700, textTransform: 'uppercase', color: '#0f172a' }}>{log.type}</span>
                              <span style={{ color: '#64748b' }}>{log.provider}</span>
                              <span style={{
                                padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                                background: log.status === 'ok' ? '#dcfce7' : log.status === 'cached' ? '#dbeafe' : log.status === 'error' ? '#fee2e2' : '#f1f5f9',
                                color: log.status === 'ok' ? '#15803d' : log.status === 'cached' ? '#1e40af' : log.status === 'error' ? '#b91c1c' : '#64748b',
                              }}>{log.status}</span>
                              <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontSize: 10 }}>{new Date(log.checkedAt).toLocaleString()}</span>
                              {log.costUsd > 0 && <span style={{ color: '#94a3b8', fontSize: 10 }}>${log.costUsd.toFixed(4)}</span>}
                            </div>
                            {log.error && <div style={{ marginTop: 4, fontSize: 11, color: '#b91c1c' }}>error: {log.error.message || JSON.stringify(log.error)}</div>}
                            {log.result && (
                              <details style={{ marginTop: 4 }}>
                                <summary style={{ cursor: 'pointer', fontSize: 11, color: '#64748b' }}>result</summary>
                                <pre style={{ margin: '4px 0 0', padding: 8, background: '#0f172a', color: '#e2e8f0', borderRadius: 6, fontSize: 10, overflow: 'auto' }}>{JSON.stringify(log.result, null, 2)}</pre>
                              </details>
                            )}
                            {log.rawRedacted && (
                              <details style={{ marginTop: 4 }}>
                                <summary style={{ cursor: 'pointer', fontSize: 11, color: '#64748b' }}>raw (redacted)</summary>
                                <pre style={{ margin: '4px 0 0', padding: 8, background: '#0f172a', color: '#e2e8f0', borderRadius: 6, fontSize: 10, overflow: 'auto', maxHeight: 200 }}>{log.rawRedacted}</pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* ── Action timeline ───────────────────────────────── */}
                  <details style={{ marginBottom: 22 }} open>
                    <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={12} /> Action timeline {timeline?.length ? `(${timeline.length})` : ''}
                    </summary>
                    {timelineErr && <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c' }}>Timeline unavailable: {timelineErr}</div>}
                    {!timeline && !timelineErr && <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Loading timeline…</div>}
                    {timeline && timeline.length === 0 && <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>No events yet.</div>}
                    {timeline && timeline.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {timeline.map((ev, i) => {
                          const palette = TIMELINE_COLORS[ev.kind] || TIMELINE_COLORS._default;
                          return (
                            <div key={i} style={{ padding: 10, background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: palette.tagBg, color: palette.tagFg }}>{ev.kind.replace(/_/g, ' ')}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{ev.label}</span>
                                {ev.actor && <span style={{ fontSize: 10, color: '#64748b' }}>· {ev.actor}</span>}
                                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{ev.at ? new Date(ev.at).toLocaleString() : '—'}</span>
                              </div>
                              {(ev.reason || ev.note) && <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{ev.reason || ev.note}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </details>

                  {/* ── Raw breakdown ─────────────────────────────────── */}
                  {snap.breakdown && (
                    <details style={{ marginBottom: 22 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase' }}>Raw breakdown</summary>
                      <pre style={{ marginTop: 10, padding: 12, background: '#0f172a', color: '#e2e8f0', borderRadius: 10, fontSize: 11, overflow: 'auto', maxHeight: 280 }}>
                        {JSON.stringify(snap.breakdown, null, 2)}
                      </pre>
                    </details>
                  )}
                </>
              )}

              {/* ── Review trail ─────────────────────────────────────── */}
              {(leadDetail?.adminTierOverride?.reason || leadDetail?.reviewNotes) && (
                <div style={{ marginBottom: 18, padding: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, fontSize: 12 }}>
                  {leadDetail.adminTierOverride?.reason && (
                    <div><strong>Override reason:</strong> {leadDetail.adminTierOverride.reason}</div>
                  )}
                  {leadDetail.reviewNotes && (
                    <div style={{ marginTop: 4 }}><strong>Review notes:</strong> {leadDetail.reviewNotes}</div>
                  )}
                </div>
              )}

              {/* ── Action error display ─────────────────────────────── */}
              {actionError && (
                <div style={{ padding: 12, marginBottom: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
                  {actionError}
                </div>
              )}

              {/* ── Action buttons ───────────────────────────────────── */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <ActionButton
                  label="Approve to dashboard" icon={<CheckCircle size={14} />} color="#15803d"
                  bg="#dcfce7" disabled={busy != null}
                  onClick={onApprove} loading={busy === 'approve'}
                />
                <ActionButton
                  label="Tier override…" icon={<Edit3 size={14} />} color="#7c3aed"
                  bg="#f5f3ff" disabled={busy != null}
                  onClick={() => setOverrideOpen(true)} loading={busy === 'tier-override'}
                />
                {leadDetail?.adminTierOverride?.tier && (
                  <ActionButton
                    label="Clear override" icon={<Trash2 size={14} />} color="#64748b"
                    bg="#f1f5f9" disabled={busy != null}
                    onClick={onClearOverride} loading={busy === 'clear-override'}
                  />
                )}
                <ActionButton
                  label="Rescore" icon={<RefreshCw size={14} />} color="#2563eb"
                  bg="#eff6ff" disabled={busy != null}
                  onClick={onRescore} loading={busy === 'rescore'}
                />
                {!confirmReject ? (
                  <ActionButton
                    label="Mark fake / reject" icon={<XCircle size={14} />} color="#b91c1c"
                    bg="#fef2f2" disabled={busy != null}
                    onClick={() => setConfirmReject(true)}
                  />
                ) : (
                  <>
                    <ActionButton
                      label="CONFIRM reject" icon={<XCircle size={14} />} color="#fff"
                      bg="#b91c1c" disabled={busy != null}
                      onClick={onReject} loading={busy === 'reject'}
                    />
                    <button onClick={() => setConfirmReject(false)} style={{ padding: '8px 12px', fontSize: 12, color: '#64748b', background: 'transparent', border: 'none', cursor: 'pointer' }}>cancel</button>
                  </>
                )}
              </div>

              {/* ── Mark reviewed (with note) ───────────────────────── */}
              <div style={{ marginTop: 14, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>Mark reviewed</div>
                <textarea
                  placeholder="Optional note (e.g. 'spoke with customer — legit relocation')"
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ marginTop: 8 }}>
                  <ActionButton
                    label={busy === 'mark-reviewed' ? 'Saving…' : 'Stamp as reviewed'}
                    icon={<CheckCircle size={14} />} color="#15803d" bg="#dcfce7"
                    disabled={busy != null}
                    onClick={onMarkReviewed} loading={busy === 'mark-reviewed'}
                  />
                </div>
              </div>

              {/* ── Tier override dialog ────────────────────────────── */}
              {overrideOpen && (
                <div style={{ marginTop: 14, padding: 14, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#5b21b6', textTransform: 'uppercase', marginBottom: 8 }}>Tier override</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    {['hot', 'premium', 'standard', 'review', 'rejected'].map(t => (
                      <button
                        key={t}
                        onClick={() => setOverrideTier(t)}
                        title={toMoverLabel(t) ? `Mover sees: ${toMoverLabel(t)}` : undefined}
                        style={{
                          padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          textTransform: 'uppercase',
                          background: overrideTier === t ? TIER_COLORS[t].fg : 'transparent',
                          color: overrideTier === t ? '#fff' : TIER_COLORS[t].fg,
                          border: `1px solid ${TIER_COLORS[t].border}`,
                        }}
                      >{t}</button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Reason (required, min 3 chars)"
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    rows={2}
                    style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <ActionButton
                      label="Save override" icon={<Edit3 size={14} />} color="#fff" bg="#7c3aed"
                      disabled={busy != null} onClick={onSubmitOverride} loading={busy === 'tier-override'}
                    />
                    <button onClick={() => { setOverrideOpen(false); setOverrideReason(''); }} style={{ padding: '8px 12px', fontSize: 12, color: '#64748b', background: 'transparent', border: 'none', cursor: 'pointer' }}>cancel</button>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 18, padding: 12, background: '#eff6ff', borderRadius: 10, fontSize: 11, color: '#1e40af' }}>
                All actions are audit-logged. Shadow mode: tier/override does NOT affect mover-facing visibility, pricing, or broadcast until <code>ENABLE_TIERED_ROUTING=true</code> is flipped.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Phase 6.1 — small card for the three-axis status display.
const TRIPLET_TONES = {
  Ready:             { bg: '#ecfdf5', border: '#a7f3d0', fg: '#047857' },
  Visible:           { bg: '#ecfdf5', border: '#a7f3d0', fg: '#047857' },
  'Review Required': { bg: '#fffbeb', border: '#fde68a', fg: '#b45309' },
  'Manual Review':   { bg: '#fffbeb', border: '#fde68a', fg: '#b45309' },
  Hidden:            { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' },
  Blocked:           { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' },
  Rejected:          { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' },
};

function TripletCard({ label, value, hint, tone }) {
  const t = TRIPLET_TONES[tone] || { bg: '#f8fafc', border: '#e2e8f0', fg: '#475569' };
  return (
    <div style={{ padding: 12, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: t.fg, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: t.fg, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function ActionButton({ label, icon, color, bg, onClick, disabled, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
        background: bg, color: color, border: 'none',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.55 : 1,
        transition: 'all 0.12s',
      }}
    >
      {icon}
      {loading ? `${label}…` : label}
    </button>
  );
}
