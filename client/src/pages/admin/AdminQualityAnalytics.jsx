import { useState, useEffect, useContext, useCallback } from 'react';
import {
  RefreshCw, BarChart2, PhoneCall, DollarSign, Activity,
  AlertTriangle, CheckCircle, XCircle, Clock, Zap,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import MetricCard from '../../components/admin/MetricCard';

/**
 * /admin/quality-analytics — read-only visibility dashboard.
 *
 * Four tabs:
 *   1. Overview              — tier distribution, distribution-readiness,
 *                              cap reasons, review queue ops, V5 vs V4 quality
 *   2. Carrier               — provider suspicion analytics (over-flag detector)
 *   3. Pricing Intelligence  — legacy vs simple-engine price drift across
 *                              tiers, home sizes, distance classes + rule
 *                              frequency. Ongoing marketplace observability.
 *   4. API Costs             — Twilio/Mapbox call counts + estimated cost
 *
 * Default range: 7 days. Each tab fetches lazily.
 */

const TABS = [
  { key: 'overview', label: 'Overview',              icon: BarChart2 },
  { key: 'carrier',  label: 'Carrier',               icon: PhoneCall },
  { key: 'pricing',  label: 'Pricing Intelligence',  icon: DollarSign },
  { key: 'costs',    label: 'API Costs',             icon: Activity },
];

const RANGE_PRESETS = [
  { days: 1,  label: '24h' },
  { days: 7,  label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

export default function AdminQualityAnalytics() {
  const { API_URL, token } = useContext(AuthContext);
  const [tab, setTab] = useState('overview');
  const [days, setDays] = useState(7);

  const [overview, setOverview] = useState(null);
  const [carrier, setCarrier] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [costs, setCosts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTab = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { 'x-auth-token': token };
      let url;
      if (tab === 'overview') url = `${API_URL}/admin/quality-analytics?days=${days}`;
      else if (tab === 'carrier') url = `${API_URL}/admin/carrier-analytics?days=${days}`;
      else if (tab === 'pricing') url = `${API_URL}/admin/pricing-analytics?days=${days}`;
      else url = `${API_URL}/admin/validation-costs?days=${days}`;
      const res = await fetch(url, { headers });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.msg || `HTTP ${res.status}`);
      if (tab === 'overview') setOverview(json);
      else if (tab === 'carrier') setCarrier(json);
      else if (tab === 'pricing') setPricing(json);
      else setCosts(json);
    } catch (err) {
      setError(err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [API_URL, token, tab, days]);

  useEffect(() => { fetchTab(); }, [fetchTab]);

  return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Quality &amp; Marketplace Analytics</h1>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Read-only visibility. No production behavior changes.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: '#f1f5f9', borderRadius: 10 }}>
            {RANGE_PRESETS.map(p => (
              <button key={p.days} onClick={() => setDays(p.days)} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                background: days === p.days ? '#0f172a' : 'transparent',
                color: days === p.days ? '#fff' : '#475569',
                border: 'none', cursor: 'pointer',
              }}>{p.label}</button>
            ))}
          </div>
          <button onClick={fetchTab} disabled={loading} style={{
            padding: '8px 14px', borderRadius: 10, background: '#eff6ff', color: '#1e40af',
            border: '1px solid #bfdbfe', fontSize: 12, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}><RefreshCw size={13} /> {loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700,
              background: active ? '#0f172a' : '#fff',
              color: active ? '#fff' : '#0f172a',
              border: active ? 'none' : '1px solid #e2e8f0',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}><Icon size={14} /> {t.label}</button>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: 14, background: '#fef2f2', color: '#b91c1c', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          Analytics unavailable: {error}
        </div>
      )}

      {tab === 'overview' && <OverviewTab data={overview} loading={loading} />}
      {tab === 'carrier'  && <CarrierTab data={carrier} loading={loading} />}
      {tab === 'pricing'  && <PricingTab data={pricing} loading={loading} />}
      {tab === 'costs'    && <CostsTab data={costs} loading={loading} />}
    </AdminLayout>
  );
}

/* ─── Overview ─────────────────────────────────────────────────────────── */
function OverviewTab({ data, loading }) {
  if (loading && !data) return <Loading />;
  if (!data) return <Empty />;

  const reviewSlow = (data.reviewQueue?.oldestAgeHours || 0) > 48;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Top metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <MetricCard label="Total leads" value={data.totalLeads} sub={`Last ${data.range.days}d`} tone="default" icon={<BarChart2 size={12} />} />
        <MetricCard label="Ready" value={data.distributionStatus.Ready} tone="success" icon={<CheckCircle size={12} />} />
        <MetricCard label="Review Required" value={data.distributionStatus['Review Required']} tone="warning" icon={<AlertTriangle size={12} />} />
        <MetricCard label="Blocked" value={data.distributionStatus.Blocked} tone="danger" icon={<XCircle size={12} />} />
        <MetricCard label="Rejected" value={data.distributionStatus.Rejected} tone="default" icon={<XCircle size={12} />} />
      </div>

      {/* Tier distribution (mover-facing labels) */}
      <Section title="Tier distribution (mover-facing labels)">
        <BarTable rows={Object.entries(data.tierDistribution.moverFacing).map(([k, v]) => ({ key: k, value: v }))} />
      </Section>

      {/* Top cap reasons */}
      <Section title={`Top "why not Ready" reasons`}>
        {data.capReasons.length === 0
          ? <Muted>No cap reasons in window.</Muted>
          : <BarTable rows={data.capReasons.map(r => ({ key: r.key, value: r.count }))} maxRows={20} />}
      </Section>

      {/* Phone trust + route status + fraud signals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <Section title="Phone trust"><BarTable rows={Object.entries(data.phoneTrust).map(([k, v]) => ({ key: k, value: v }))} /></Section>
        <Section title="Route status"><BarTable rows={Object.entries(data.routeStatus).map(([k, v]) => ({ key: k, value: v }))} /></Section>
        <Section title="Fraud signals"><BarTable rows={Object.entries(data.fraudSignals).map(([k, v]) => ({ key: k, value: v }))} /></Section>
      </div>

      {/* Review queue ops + actions today */}
      <Section title="Review queue ops">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <MetricCard label="Open review leads" value={data.reviewQueue.openReviewCount} tone={data.reviewQueue.openReviewCount > 0 ? 'warning' : 'success'} icon={<AlertTriangle size={12} />} />
          <MetricCard label="Avg age (hours)" value={data.reviewQueue.averageAgeHours} tone={reviewSlow ? 'danger' : 'default'} icon={<Clock size={12} />} />
          <MetricCard label="Oldest open (hours)" value={data.reviewQueue.oldestAgeHours} tone={reviewSlow ? 'danger' : 'default'} sub={reviewSlow ? 'SLA warning: > 48h' : null} icon={<Clock size={12} />} />
          <MetricCard label="Moving in 7d" value={data.reviewQueue.movingWithin7d} tone={data.reviewQueue.movingWithin7d > 0 ? 'warning' : 'default'} icon={<Zap size={12} />} />
          <MetricCard label="Moving in 3d" value={data.reviewQueue.movingWithin3d} tone={data.reviewQueue.movingWithin3d > 0 ? 'danger' : 'default'} sub={data.reviewQueue.movingWithin3d > 0 ? 'URGENT' : null} icon={<Zap size={12} />} />
        </div>
      </Section>

      <Section title="Admin actions today">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <MetricCard label="Approved" value={data.actionsToday.approved} tone="success" />
          <MetricCard label="Rejected" value={data.actionsToday.rejected} tone="danger" />
          <MetricCard label="Rescored" value={data.actionsToday.rescored} tone="info" />
          <MetricCard label="Overrides set" value={data.actionsToday.overrides_set} tone="info" />
          <MetricCard label="Overrides cleared" value={data.actionsToday.overrides_cleared} tone="default" />
          <MetricCard label="Marked reviewed" value={data.actionsToday.marked_reviewed} tone="default" />
        </div>
      </Section>

      {/* V5 vs V4 quality split */}
      <Section title="V5 vs V4 quality split">
        <table className="leads-table" style={{ background: '#fff' }}>
          <thead><tr><th>Funnel</th><th>Total</th><th>Ready</th><th>Review/Blocked</th><th>Rejected</th></tr></thead>
          <tbody>
            <tr><td>V4 (legacy)</td><td>{data.v5VsV4.v4.count}</td><td>{data.v5VsV4.v4.ready}</td><td>{data.v5VsV4.v4.review}</td><td>{data.v5VsV4.v4.rejected}</td></tr>
            <tr><td>V5</td><td>{data.v5VsV4.v5.count}</td><td>{data.v5VsV4.v5.ready}</td><td>{data.v5VsV4.v5.review}</td><td>{data.v5VsV4.v5.rejected}</td></tr>
          </tbody>
        </table>
      </Section>

      {/* Funnel + source breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <Section title="Funnel version"><BarTable rows={Object.entries(data.funnelBreakdown).map(([k, v]) => ({ key: k, value: v }))} /></Section>
        <Section title="Source"><BarTable rows={Object.entries(data.sourceBreakdown).map(([k, v]) => ({ key: k, value: v }))} /></Section>
      </div>
    </div>
  );
}

/* ─── Carrier ──────────────────────────────────────────────────────────── */
function CarrierTab({ data, loading }) {
  if (loading && !data) return <Loading />;
  if (!data) return <Empty />;

  const high = data.suspicionByOutcome?.high || { reviewed: 0, rejected: 0, approved: 0, untouched: 0 };
  const totalHigh = high.reviewed + high.rejected + high.approved + high.untouched;
  const overFlagPct = totalHigh > 0 ? Math.round((high.approved / totalHigh) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <MetricCard label="Leads with carrier" value={data.totalLeadsWithCarrier} sub={`Last ${data.range.days}d`} />
        <MetricCard label="Suspicion: high" value={data.suspicionDistribution.high} tone="danger" icon={<AlertTriangle size={12} />} />
        <MetricCard label="Suspicion: medium" value={data.suspicionDistribution.medium} tone="warning" />
        <MetricCard label="Suspicion: low" value={data.suspicionDistribution.low} tone="success" />
        <MetricCard label="Suspicion: unknown" value={data.suspicionDistribution.unknown} />
        <MetricCard
          label="High → admin approved"
          value={`${overFlagPct}%`}
          tone={overFlagPct > 30 ? 'danger' : overFlagPct > 15 ? 'warning' : 'success'}
          sub={overFlagPct > 30 ? 'Likely over-flagging' : overFlagPct > 15 ? 'Watch' : 'Healthy'}
        />
      </div>

      <Section title="Top carriers seen">
        <BarTable rows={data.topCarriers.map(c => ({ key: c.key, value: c.count }))} maxRows={25} />
      </Section>

      <Section title="High-suspicion outcomes (over-flag detector)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <MetricCard label="Approved (false-positive)" value={high.approved} tone={high.approved > 0 ? 'warning' : 'default'} />
          <MetricCard label="Rejected (true-positive)" value={high.rejected} tone="success" />
          <MetricCard label="Reviewed" value={high.reviewed} />
          <MetricCard label="Untouched" value={high.untouched} />
        </div>
      </Section>

      <Section title="Carrier table">
        <div style={{ overflow: 'auto' }}>
          <table className="leads-table" style={{ background: '#fff' }}>
            <thead>
              <tr><th>Carrier</th><th>Category</th><th>Seen</th><th>Reviewed</th><th>Approved</th><th>Rejected</th><th>Last seen</th></tr>
            </thead>
            <tbody>
              {data.carrierTable.map((c, i) => (
                <tr key={i}>
                  <td>{c.carrierName}</td>
                  <td><CategoryBadge category={c.category} /></td>
                  <td>{c.seen}</td><td>{c.reviewed}</td><td>{c.approved}</td><td>{c.rejected}</td>
                  <td style={{ color: '#94a3b8', fontSize: 11 }}>{c.lastSeen ? new Date(c.lastSeen).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function CategoryBadge({ category }) {
  const map = {
    high:    { bg: '#fef2f2', fg: '#b91c1c' },
    medium:  { bg: '#fffbeb', fg: '#b45309' },
    low:     { bg: '#ecfdf5', fg: '#047857' },
    unknown: { bg: '#f1f5f9', fg: '#64748b' },
  };
  const s = map[category] || map.unknown;
  return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: s.bg, color: s.fg }}>{category}</span>;
}

/* ─── Pricing Intelligence ─────────────────────────────────────────────────
   Ongoing marketplace observability — compares the active claim price
   (Lead.buyNowPrice) against simple-engine shadow (Lead.priceShadowSimple)
   to surface pricing drift across tiers, home sizes, distance classes, and
   individual rules. Sample is restricted to leads still priced by the legacy
   engine; simple-stamped leads have no meaningful delta. As legacy retires
   over time, this sample naturally shrinks. */
function PricingTab({ data, loading }) {
  if (loading && !data) return <Loading />;
  if (!data) return <Empty />;

  const dollar = (n) => n == null ? '—' : `$${Math.round(n * 100) / 100}`;
  const signedDollar = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}$${Math.round(n * 100) / 100}`;

  // Empty-state guard. Fires when the query returns zero comparable leads —
  // for instance when the window contains only simple-stamped leads (the
  // expected steady state once legacy fully retires).
  if (data.compared === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        No comparable leads in this window.<br/>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Comparison runs only against legacy-priced leads (pricingEngineVersion ≠ 'simple').</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Muted helper — clarifies why the sample size is smaller than total
          lead volume, and why it shrinks over time as legacy retires. */}
      <div style={{ fontSize: 12, color: '#94a3b8', padding: '4px 2px' }}>
        Comparison runs only against legacy-priced leads. Simple-stamped leads are excluded — their delta is zero by construction.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <MetricCard label="Compared leads" value={data.compared} sub={`Last ${data.range.days}d · legacy-priced`} />
        <MetricCard label="Avg legacy" value={dollar(data.legacyAvg)} tone="default" />
        <MetricCard label="Avg simple engine" value={dollar(data.simpleAvg)} tone="info" />
        <MetricCard label="Avg delta" value={signedDollar(data.deltaAvg)} tone={data.deltaAvg > 0 ? 'success' : data.deltaAvg < 0 ? 'warning' : 'default'} />
        <MetricCard label="Median delta" value={signedDollar(data.deltaMedian)} />
        <MetricCard label="Simple higher" value={data.counts.simpleHigher} tone="success" />
        <MetricCard label="Simple lower" value={data.counts.simpleLower} tone="warning" />
        <MetricCard label="Same" value={data.counts.same} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {data.maxPositiveDelta && (
          <Section title="Biggest positive delta (simple engine higher)">
            <div style={{ fontSize: 13 }}>
              <strong>{signedDollar(data.maxPositiveDelta.value)}</strong>
              <div style={{ color: '#64748b', marginTop: 4 }}>{data.maxPositiveDelta.lead.route} · {data.maxPositiveDelta.lead.customerName}</div>
            </div>
          </Section>
        )}
        {data.maxNegativeDelta && (
          <Section title="Biggest negative delta (simple engine lower)">
            <div style={{ fontSize: 13 }}>
              <strong>{signedDollar(data.maxNegativeDelta.value)}</strong>
              <div style={{ color: '#64748b', marginTop: 4 }}>{data.maxNegativeDelta.lead.route} · {data.maxNegativeDelta.lead.customerName}</div>
            </div>
          </Section>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <Section title="By tier (mover label)"><BreakdownTable rows={data.byTier} /></Section>
        <Section title="By home size"><BreakdownTable rows={data.byHomeSize} /></Section>
        <Section title="By distance class"><BreakdownTable rows={data.byDistance} /></Section>
      </div>

      <Section title="Rule frequency (add-ons and discounts)">
        <div style={{ overflow: 'auto' }}>
          <table className="leads-table" style={{ background: '#fff' }}>
            <thead><tr><th>Category</th><th>Match</th><th>Type</th><th>Applied</th><th>Total $</th><th>Avg $</th></tr></thead>
            <tbody>
              {data.ruleFrequency.length === 0 && <tr><td colSpan={6} style={{ color: '#94a3b8', textAlign: 'center', padding: 16 }}>No pricing rules fired on leads in this window.</td></tr>}
              {data.ruleFrequency.map((r, i) => (
                <tr key={i}>
                  <td><code style={{ fontSize: 11 }}>{r.category}</code></td>
                  <td>{r.matchValue || '—'}</td>
                  <td><span style={{ padding: '2px 6px', fontSize: 10, fontWeight: 700, borderRadius: 4, background: r.type === 'discount' ? '#fef3c7' : '#dbeafe', color: r.type === 'discount' ? '#92400e' : '#1e40af' }}>{r.type}</span></td>
                  <td>{r.applied}</td>
                  <td>${Math.round(r.totalUsd * 100) / 100}</td>
                  <td>${Math.round((r.totalUsd / r.applied) * 100) / 100}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`Top ${Math.min(data.table.length, 200)} surprising rows (sorted by |delta|)`}>
        <div style={{ overflow: 'auto', maxHeight: 480 }}>
          <table className="leads-table" style={{ background: '#fff' }}>
            <thead><tr><th>Lead</th><th>Tier</th><th>Legacy</th><th>Simple</th><th>Δ</th><th>Surcharges</th><th>Discounts</th></tr></thead>
            <tbody>
              {data.table.map((r, i) => (
                <tr key={i}>
                  <td><div style={{ fontSize: 12, fontWeight: 600 }}>{r.route}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>{r.customerName}</div></td>
                  <td style={{ fontSize: 11 }}>{r.tier}</td>
                  <td>{dollar(r.legacy)}</td>
                  <td style={{ color: '#1e40af', fontWeight: 700 }}>{dollar(r.simple)}</td>
                  <td style={{ color: r.delta > 0 ? '#047857' : r.delta < 0 ? '#b45309' : '#64748b', fontWeight: 700 }}>{signedDollar(r.delta)}</td>
                  <td style={{ fontSize: 10, color: '#1e40af' }}>{r.surcharges.join(', ') || '—'}</td>
                  <td style={{ fontSize: 10, color: '#92400e' }}>{r.discounts.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function BreakdownTable({ rows }) {
  if (!rows || rows.length === 0) return <Muted>No data.</Muted>;
  return (
    <table className="leads-table" style={{ background: '#fff', fontSize: 12 }}>
      <thead><tr><th>Group</th><th>Count</th><th>Legacy avg</th><th>Simple avg</th><th>Δ avg</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.key}</td><td>{r.count}</td>
            <td>${r.legacyAvg}</td><td>${r.simpleAvg}</td>
            <td style={{ color: r.deltaAvg > 0 ? '#047857' : r.deltaAvg < 0 ? '#b45309' : '#64748b' }}>{r.deltaAvg >= 0 ? '+' : ''}${r.deltaAvg}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Costs ────────────────────────────────────────────────────────────── */
function CostsTab({ data, loading }) {
  if (loading && !data) return <Loading />;
  if (!data) return <Empty />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <MetricCard label="Calls today" value={data.today.totalCalls} tone="info" />
        <MetricCard label="Cost today" value={`$${data.today.totalCost.toFixed(4)}`} tone="info" sub="estimate" />
        <MetricCard label="Errors today" value={data.today.errored} tone={data.today.errored > 0 ? 'danger' : 'default'} />
        <MetricCard label="Skipped today" value={data.today.skipped} />
        <MetricCard label={`Calls last ${data.range.days}d`} value={data.window.totalCalls} />
        <MetricCard label={`Cost last ${data.range.days}d`} value={`$${data.window.totalCost.toFixed(4)}`} sub="estimate" />
        <MetricCard label={`Errors ${data.range.days}d`} value={data.window.errored} tone={data.window.errored > 0 ? 'warning' : 'default'} />
        <MetricCard label={`Skipped ${data.range.days}d`} value={data.window.skipped} />
      </div>

      <Section title="By provider (window)">
        <table className="leads-table" style={{ background: '#fff' }}>
          <thead><tr><th>Provider</th><th>Calls</th><th>Cost</th><th>Errors</th><th>Skipped</th></tr></thead>
          <tbody>
            {Object.entries(data.window.byProvider).map(([p, v]) => (
              <tr key={p}>
                <td><code style={{ fontSize: 11 }}>{p}</code></td>
                <td>{v.calls}</td><td>${v.cost.toFixed(4)}</td>
                <td style={{ color: v.errors > 0 ? '#b91c1c' : undefined }}>{v.errors}</td>
                <td style={{ color: '#64748b' }}>{v.skipped}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="By type (window)">
        <BarTable rows={Object.entries(data.window.byType).map(([k, v]) => ({ key: k, value: v }))} />
      </Section>

      <Muted>Costs are <em>estimates</em> based on per-call defaults. Twilio Lookup ≈ $0.005 per package, identity_match ≈ $0.04. No billing automation.</Muted>
    </div>
  );
}

/* ─── Generic helpers ─────────────────────────────────────────────────── */
function Section({ title, children }) {
  return (
    <div className="panel" style={{ padding: 16, borderRadius: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function BarTable({ rows, maxRows = 50 }) {
  if (!rows || rows.length === 0) return <Muted>No data.</Muted>;
  const sorted = [...rows].sort((a, b) => b.value - a.value).slice(0, maxRows);
  const max = sorted[0]?.value || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <div style={{ flex: '0 0 200px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.key}>{r.key}</div>
          <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: '#2563eb' }} />
          </div>
          <div style={{ flex: '0 0 60px', textAlign: 'right', color: '#0f172a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.value}</div>
        </div>
      ))}
    </div>
  );
}

function Loading() { return <div style={{ color: '#64748b', fontSize: 13, padding: 24 }}>Loading…</div>; }
function Empty()   { return <div style={{ color: '#94a3b8', fontSize: 13, padding: 24 }}>No data.</div>; }
function Muted({ children }) { return <div style={{ color: '#94a3b8', fontSize: 12 }}>{children}</div>; }
