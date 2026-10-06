import { useState, useEffect, useContext, useCallback } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { AuthContext } from '../../context/AuthContext';

/**
 * Growth trends for the admin overview: last N days vs the N days before.
 * Reads GET /api/admin/trends. Leads and outcomes are by lead created date;
 * sales and revenue are by purchase date, refunds excluded.
 */

const RANGES = [7, 30, 90];

const usd = (n) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

function change(cur, prev) {
  if (!prev) return cur ? { text: 'new', color: '#16a34a' } : null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return { text: `${d > 0 ? '+' : ''}${d}% vs previous`, color: d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#64748b' };
}

function Stat({ label, value, delta, note }) {
  return (
    <div style={{ padding: 16, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{value}</div>
      {delta && <div style={{ fontSize: 12, fontWeight: 600, color: delta.color, marginTop: 2 }}>{delta.text}</div>}
      {note && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{note}</div>}
    </div>
  );
}

export default function TrendsPanel() {
  const { API_URL, token } = useContext(AuthContext);
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/trends?days=${days}`, { headers: { 'x-auth-token': token } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err.message || 'Failed to load trends');
    }
  }, [API_URL, token, days]);

  useEffect(() => { load(); }, [load]);

  const c = data?.current;
  const p = data?.previous;
  const sellThrough = c ? pct(c.sold, c.leads) : null;
  const prevSellThrough = p ? pct(p.sold, p.leads) : null;
  const unsold = c ? c.open + c.expired : 0;
  const outcomes = c ? [
    { k: 'Sold', n: c.sold, color: '#16a34a' },
    { k: 'Still open', n: c.open, color: '#3b82f6' },
    { k: 'Expired unsold', n: c.expired, color: '#f97316' },
    { k: 'In review', n: c.review, color: '#a855f7' },
    { k: 'Rejected', n: c.rejected, color: '#94a3b8' },
  ] : [];

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <span>Growth: last {days} days vs the {days} days before</span>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: '#f1f5f9', borderRadius: 10 }}>
          {RANGES.map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
              background: days === d ? '#0f172a' : 'transparent', color: days === d ? '#fff' : '#475569',
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {error && <div style={{ padding: 14, color: '#b91c1c', fontSize: 13 }}>Trends unavailable: {error}</div>}

      {c && (
        <div style={{ padding: '4px 20px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Stat label="Leads in" value={c.leads} delta={change(c.leads, p.leads)} />
            <Stat label="Sell-through" value={sellThrough == null ? '—' : `${sellThrough}%`} note={prevSellThrough == null ? 'No leads before' : `${prevSellThrough}% previous period`} />
            <Stat label="Revenue" value={usd(c.revenue)} delta={change(c.revenue, p.revenue)} />
            <Stat label="Avg price per sale" value={c.sales ? usd(c.revenue / c.sales) : '—'} note={`${c.sales} sales`} />
            <Stat label="Unsold" value={unsold} note={`${c.expired} expired, ${c.open} still open`} />
          </div>

          <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: '#f1f5f9', marginBottom: 8 }}>
            {outcomes.filter((o) => o.n).map((o) => (
              <div key={o.k} title={`${o.k}: ${o.n}`} style={{ width: `${(o.n / c.leads) * 100}%`, background: o.color }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12, color: '#475569', marginBottom: 18 }}>
            {outcomes.map((o) => (
              <span key={o.k}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: o.color, marginRight: 6 }} />{o.k}: <strong>{o.n}</strong></span>
            ))}
          </div>

          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <ComposedChart data={data.daily} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} minTickGap={16} />
                <YAxis yAxisId="n" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="usd" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v, name) => (name === 'Revenue' ? usd(v) : v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="n" dataKey="leads" name="Leads in" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="n" dataKey="sales" name="Sales" fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Line yAxisId="usd" dataKey="revenue" name="Revenue" stroke="#f97316" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            Days are UTC. Leads and outcomes by lead created date; sales and revenue by purchase date, refunds excluded.
          </div>
        </div>
      )}
    </div>
  );
}
