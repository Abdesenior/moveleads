import { useState, useEffect, useContext, useCallback } from 'react';
import { RefreshCw, Inbox, Target, CheckCircle, DollarSign } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import MetricCard from '../../components/admin/MetricCard';

/**
 * /admin/lead-sources — which channels and landing pages produce leads,
 * and how many of those leads sold. Reads GET /api/admin/lead-sources
 * (first-touch attribution stored on each lead at ingest). Read-only.
 */

const RANGE_PRESETS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 365, label: '1y' },
];

const CHANNEL_LABELS = {
  organic_search: 'Organic search (Google, Bing…)',
  ai_assistant: 'AI assistants (ChatGPT, Perplexity…)',
  social: 'Social',
  referral: 'Other websites',
  campaign: 'Tagged campaigns (UTM)',
  paid: 'Paid ads',
  direct: 'Direct / no referrer',
  untracked: 'Untracked (before tracking started)',
};

const usd = (n) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export default function AdminLeadSources() {
  const { API_URL, token } = useContext(AuthContext);
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/lead-sources?days=${days}`, { headers: { 'x-auth-token': token } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err.message || 'Failed to load lead sources');
    } finally {
      setLoading(false);
    }
  }, [API_URL, token, days]);

  useEffect(() => { load(); }, [load]);

  const t = data?.totals;

  return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Lead Sources</h1>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Where each lead first arrived on the site, and how many of those leads sold.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: '#f1f5f9', borderRadius: 10 }}>
            {RANGE_PRESETS.map((p) => (
              <button key={p.days} onClick={() => setDays(p.days)} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                background: days === p.days ? '#0f172a' : 'transparent',
                color: days === p.days ? '#fff' : '#475569',
                border: 'none', cursor: 'pointer',
              }}>{p.label}</button>
            ))}
          </div>
          <button onClick={load} disabled={loading} style={{
            padding: '8px 14px', borderRadius: 10, background: '#eff6ff', color: '#1e40af',
            border: '1px solid #bfdbfe', fontSize: 12, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}><RefreshCw size={13} /> {loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 14, background: '#fef2f2', color: '#b91c1c', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          Lead sources unavailable: {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
        <MetricCard label="Leads" value={t?.leads} sub={`Last ${days} days`} icon={<Inbox size={14} />} />
        <MetricCard label="Tracked" value={t ? pct(t.tracked, t.leads) : null} sub={t ? `${t.tracked} with a known source` : ''} tone="info" icon={<Target size={14} />} />
        <MetricCard label="Sold" value={t?.sold} sub={t ? `${pct(t.sold, t.leads)} of leads` : ''} tone="success" icon={<CheckCircle size={14} />} />
        <MetricCard label="Revenue" value={t ? usd(t.revenue) : null} sub="Non-refunded purchases" icon={<DollarSign size={14} />} />
      </div>

      <SourceTable title="By channel" rows={data?.byChannel} label={(k) => CHANNEL_LABELS[k] || k} loading={loading} />
      <SourceTable
        title="By landing page (top 50)"
        rows={data?.byLandingPage}
        label={(k) => <a href={k} target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', textDecoration: 'none' }}>{k}</a>}
        loading={loading}
      />
      <SourceTable title="By referring site (top 20)" rows={data?.byReferrer} label={(k) => k} loading={loading} />

      <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
        Source = the first page a visitor landed on in this browser (kept 90 days). Leads created before tracking started
        show as untracked. Sold = at least one non-refunded purchase.
      </p>
    </AdminLayout>
  );
}

function SourceTable({ title, rows, label, loading }) {
  const th = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, borderBottom: '1px solid #e2e8f0' };
  const td = { padding: '10px 14px', fontSize: 13, color: '#0f172a', borderBottom: '1px solid #f1f5f9' };
  const num = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, marginBottom: 18, overflowX: 'auto' }}>
      <div style={{ padding: '14px 14px 6px', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            <th style={th}>Source</th>
            <th style={{ ...th, textAlign: 'right' }}>Leads</th>
            <th style={{ ...th, textAlign: 'right' }}>Sold</th>
            <th style={{ ...th, textAlign: 'right' }}>Sell rate</th>
            <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r) => (
            <tr key={r.key}>
              <td style={td}>{label(r.key)}</td>
              <td style={num}>{r.leads}</td>
              <td style={num}>{r.sold}</td>
              <td style={num}>{pct(r.sold, r.leads)}</td>
              <td style={num}>{usd(r.revenue)}</td>
            </tr>
          ))}
          {(!rows || rows.length === 0) && (
            <tr><td colSpan={5} style={{ ...td, color: '#64748b' }}>{loading ? 'Loading…' : 'No leads in this period yet.'}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
