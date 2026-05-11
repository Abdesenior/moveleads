import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { Users2, Search, Download, X, ChevronRight, Tag as TagIcon, Trash2, AlertTriangle, Lightbulb } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';

/**
 * AdminMoverResearch — marketplace intelligence dashboard built on
 * /api/admin/mover-research.
 *
 * Top of the page is a stack of intelligence sections (funnel health,
 * market insights, valuable traits, trust killers, want-vs-hate,
 * archetypes, state breakdown, operational recommendations) computed
 * server-side by computeIntel(). The bottom of the page keeps the
 * original submissions table, filters, search, CSV export, and detail
 * drawer fully intact — they're the operator's day-to-day surface and
 * must not regress.
 */

const SHARED_LABELS = {
  shared:    'Mostly shared',
  exclusive: 'Mostly exclusive',
  depends:   'Depends',
  '':        '—',
};
const MARKETPLACE_LABELS = {
  mostly_exclusive: 'Mostly exclusive',
  mostly_shared:    'Mostly shared',
  mixed:            'Mixed',
  bidding:          'Bidding',
  '':               '—',
};
const SPEED_LABELS = {
  '5min':    'Under 5 min',
  '15min':   'Within 15 min',
  '1hour':   'Within an hour',
  'sameday': 'Same day',
  '':        '—',
};
const SCENARIO_LABELS = {
  verified_2br_local_shared:    'Verified 2BR local (shared)',
  exclusive_4br_long_distance:  'Exclusive 4BR long-distance',
  verified_same_day_local:      'Verified same-day local',
  commercial_office_relocation: 'Commercial office relocation',
};

const ARCHETYPE_LABELS = {
  exclusive_first:       'Exclusive-first',
  shared_volume:         'Shared / high volume',
  long_distance_focused: 'Long-distance focused',
  commercial_focused:    'Commercial focused',
  speed_sensitive:       'Speed sensitive',
  quality_sensitive:     'Quality sensitive',
  price_sensitive:       'Price sensitive',
  local_focus:           'Local focus',
};

export default function AdminMoverResearch() {
  const { API_URL, token } = useContext(AuthContext);

  const [intel, setIntel]               = useState(null);
  const [submissions, setSubmissions]   = useState([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);

  const [page, setPage]         = useState(1);
  const [pageSize]              = useState(25);
  const [search, setSearch]     = useState('');
  const [tagFilter, setTag]     = useState('');
  const [stateFilter, setState] = useState('');

  const [drawerId, setDrawerId]       = useState(null);
  const [drawerDoc, setDrawerDoc]     = useState(null);
  const [drawerLoading, setDLoading]  = useState(false);

  // Per-state intel slice (loaded on demand by MarketBreakdown). Keyed by
  // state code so we don't re-fetch the same state twice in a session.
  const [stateIntelCache, setStateIntelCache] = useState({});
  const [stateIntelLoading, setStateIntelLoading] = useState(false);
  const [selectedBreakdownState, setSelectedBreakdownState] = useState('');

  // ─── Fetch overall intel ──────────────────────────────────────────────
  const fetchIntel = useCallback(async () => {
    try {
      const headers = { 'x-auth-token': token };
      const res = await fetch(`${API_URL}/admin/mover-research/analytics`, { headers });
      const json = await res.json();
      if (res.ok) setIntel(json);
    } catch (e) { console.error('[AdminMoverResearch] analytics fetch failed', e); }
  }, [API_URL, token]);

  useEffect(() => { fetchIntel(); }, [fetchIntel]);

  // ─── Fetch list ───────────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      if (tagFilter) params.set('tag', tagFilter);
      if (stateFilter) params.set('state', stateFilter);
      const headers = { 'x-auth-token': token };
      const res = await fetch(`${API_URL}/admin/mover-research?${params.toString()}`, { headers });
      const json = await res.json();
      if (res.ok) {
        setSubmissions(json.submissions || []);
        setTotal(json.total || 0);
      }
    } catch (e) { console.error('[AdminMoverResearch] list fetch failed', e); }
    finally { setLoading(false); }
  }, [API_URL, token, page, pageSize, search, tagFilter, stateFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, tagFilter, stateFilter]);

  // ─── Drawer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!drawerId) { setDrawerDoc(null); return; }
    setDLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API_URL}/admin/mover-research/${drawerId}`, {
          headers: { 'x-auth-token': token },
        });
        const json = await res.json();
        if (res.ok) setDrawerDoc(json);
      } catch (e) { console.error(e); }
      finally { setDLoading(false); }
    })();
  }, [drawerId, API_URL, token]);

  // ─── Per-state intel fetcher (used by MarketBreakdown) ────────────────
  const fetchStateIntel = useCallback(async (st) => {
    if (!st) return;
    if (stateIntelCache[st]) return; // already cached
    setStateIntelLoading(true);
    try {
      const headers = { 'x-auth-token': token };
      const res = await fetch(`${API_URL}/admin/mover-research/analytics?state=${encodeURIComponent(st)}`, { headers });
      const json = await res.json();
      if (res.ok) setStateIntelCache(prev => ({ ...prev, [st]: json }));
    } catch (e) { console.error('[AdminMoverResearch] state intel fetch failed', e); }
    finally { setStateIntelLoading(false); }
  }, [API_URL, token, stateIntelCache]);

  // ─── Tag / state options derived from intel ───────────────────────────
  const tagOptions = useMemo(() => {
    // Tags aren't part of the new intel payload; harvest from current list.
    const set = new Set();
    for (const s of submissions) (s.autoTags || []).forEach(t => set.add(t));
    return Array.from(set).sort();
  }, [submissions]);
  const stateOptions = useMemo(() => {
    if (!intel || !Array.isArray(intel.stateBreakdown)) return [];
    return intel.stateBreakdown.map(s => s.state).filter(Boolean);
  }, [intel]);

  // ─── CSV export ───────────────────────────────────────────────────────
  const exportCsv = async () => {
    const params = new URLSearchParams();
    if (search)     params.set('search', search);
    if (tagFilter)  params.set('tag',    tagFilter);
    if (stateFilter)params.set('state',  stateFilter);
    try {
      const res = await fetch(`${API_URL}/admin/mover-research/export.csv?${params.toString()}`, {
        headers: { 'x-auth-token': token },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mover-research-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Could not export CSV.'); }
  };

  // ─── Delete handler ───────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    if (!id) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm('Delete this submission? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API_URL}/admin/mover-research/${id}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.msg || 'Could not delete.');
        return;
      }
      setSubmissions(prev => prev.filter(s => s._id !== id));
      setTotal(t => Math.max(0, t - 1));
      if (drawerId === id) setDrawerId(null);
      // Refresh aggregate intel + clear any state caches that might shift.
      fetchIntel();
      setStateIntelCache({});
    } catch (e) {
      alert('Network error deleting submission.');
    }
  }, [API_URL, token, drawerId, fetchIntel]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminLayout>
      <div className="adminMR-root" style={{ padding: 28, maxWidth: 1280, margin: '0 auto' }}>
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.25)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#f97316',
          }}>
            <Users2 size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Mover Research</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Marketplace intelligence and operational decisions for the Founding Mover Program.</p>
          </div>
        </div>

        {/* ── Intelligence stack ── */}
        <FunnelHealth intel={intel} />
        <MarketInsightsRow intel={intel} />
        <TopValuableTraits intel={intel} />
        <BiggestTrustKillers intel={intel} />
        <WantVsHate intel={intel} />
        <MoverArchetypes intel={intel} />
        <MarketBreakdown
          intel={intel}
          stateIntelCache={stateIntelCache}
          loading={stateIntelLoading}
          selectedState={selectedBreakdownState}
          onSelectState={(st) => { setSelectedBreakdownState(st); fetchStateIntel(st); }}
        />
        <OperationalRecommendations intel={intel} />

        <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '32px 0 24px' }} />

        {/* ── EXISTING — preserved: filters / table / CSV / drawer ── */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16,
          alignItems: 'center', background: '#fff', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0',
        }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 220 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              placeholder="Search company or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={inputStyle}
            />
          </div>
          <select value={tagFilter} onChange={e => setTag(e.target.value)} style={selectStyle}>
            <option value="">All tags</option>
            {tagOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={stateFilter} onChange={e => setState(e.target.value)} style={selectStyle}>
            <option value="">All states/markets</option>
            {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={exportCsv} style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#0f172a', color: '#fff', border: 'none', padding: '10px 16px',
            borderRadius: 10, fontWeight: 600, cursor: 'pointer',
          }}>
            <Download size={16} /> Export CSV
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                {['Company', 'Email', 'State/Market', 'Shared/Exclusive', 'Marketplace', 'Tags', 'Submitted'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
                <th style={thStyle} />
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
              )}
              {!loading && submissions.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>No submissions match these filters.</td></tr>
              )}
              {!loading && submissions.map(s => (
                <tr key={s._id}
                    onClick={() => setDrawerId(s._id)}
                    style={{ cursor: 'pointer', borderTop: '1px solid #e2e8f0' }}>
                  <td style={tdStyle}><b>{s.companyName}</b></td>
                  <td style={tdStyle}>{s.email}</td>
                  <td style={tdStyle}>{s.mainStateOrMarket || '—'}</td>
                  <td style={tdStyle}>{SHARED_LABELS[s.sharedExclusivePreference] || '—'}</td>
                  <td style={tdStyle}>{MARKETPLACE_LABELS[s.marketplacePreference] || '—'}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(s.autoTags || []).slice(0, 4).map(t => <TagChip key={t} text={t} />)}
                      {(s.autoTags || []).length > 4 && (
                        <span style={{ fontSize: 11, color: '#64748b' }}>+{s.autoTags.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>{s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', width: 36 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(s._id); }}
                      title="Delete submission"
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: 6, borderRadius: 6, color: '#cbd5e1',
                        display: 'inline-flex', alignItems: 'center',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#cbd5e1'; }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <ChevronRight size={16} color="#cbd5e1" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 13, color: '#475569' }}>
            <span>Page {page} of {totalPages} · {total} total</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pagerBtn}>Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pagerBtn}>Next</button>
            </div>
          </div>
        )}

        {drawerId && (
          <Drawer onClose={() => setDrawerId(null)}>
            {drawerLoading || !drawerDoc ? (
              <div style={{ padding: 24, color: '#64748b' }}>Loading…</div>
            ) : (
              <DetailView doc={drawerDoc} onDelete={() => handleDelete(drawerDoc._id)} />
            )}
          </Drawer>
        )}
      </div>
    </AdminLayout>
  );
}

// ─── Section components ──────────────────────────────────────────────────

function SectionCard({ title, subtitle, children, style }) {
  return (
    <section style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
      padding: 24, marginBottom: 24, ...style,
    }}>
      {(title || subtitle) && (
        <div style={{ marginBottom: 16 }}>
          {title && <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: -0.1 }}>{title}</h2>}
          {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function StatBlock({ label, value, sub }) {
  return (
    <div style={{ flex: '1 1 160px', minWidth: 140 }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{value}</div>
      {sub && <div style={{ marginTop: 2, fontSize: 12, color: '#64748b' }}>{sub}</div>}
    </div>
  );
}

function FunnelHealth({ intel }) {
  const f = intel?.funnel || { totalSubmissions: 0, avgCompletionSeconds: 0, avgScreensSeen: 0, firstSubmissionAt: null, lastSubmissionAt: null };
  const fmtDate = (s) => s ? new Date(s).toLocaleDateString() : '—';
  return (
    <SectionCard title="Funnel health" subtitle="How many founding movers have completed the intake and how engaged they were.">
      {f.totalSubmissions === 0 ? (
        <EmptyState text="No submissions yet." />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <StatBlock label="Total submissions" value={f.totalSubmissions} />
          <StatBlock label="Avg completion" value={f.avgCompletionSeconds ? `${f.avgCompletionSeconds}s` : '—'} />
          <StatBlock label="Avg screens seen" value={f.avgScreensSeen || '—'} />
          <StatBlock label="First submission" value={fmtDate(f.firstSubmissionAt)} />
          <StatBlock label="Latest submission" value={fmtDate(f.lastSubmissionAt)} />
        </div>
      )}
    </SectionCard>
  );
}

function MarketInsightsRow({ intel }) {
  if (!intel) return null;
  const prm = intel.preferredRequestModel || {};
  const st = intel.sharedTolerance || {};
  const sp = intel.speedExpectation || {};

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 24, marginBottom: 24,
    }}>
      <SectionCard title="Preferred request model" style={{ marginBottom: 0 }}>
        <SegmentList
          rows={[
            { label: 'Exclusive', count: prm.exclusive?.count, percent: prm.exclusive?.percent },
            { label: 'Shared',    count: prm.shared?.count,    percent: prm.shared?.percent },
            { label: 'Depends',   count: prm.depends?.count,   percent: prm.depends?.percent },
            { label: 'Unknown',   count: prm.unknown?.count,   percent: prm.unknown?.percent, muted: true },
          ]}
        />
      </SectionCard>
      <SectionCard title="Shared tolerance" style={{ marginBottom: 0 }}>
        <SegmentList
          rows={[
            { label: '2 movers max',  count: st.two?.count,      percent: st.two?.percent },
            { label: '3 movers max',  count: st.three?.count,    percent: st.three?.percent },
            { label: '4+ movers',     count: st.fourPlus?.count, percent: st.fourPlus?.percent },
            { label: 'Unknown',       count: st.unknown?.count,  percent: st.unknown?.percent, muted: true },
          ]}
        />
      </SectionCard>
      <SectionCard title="Speed expectation" style={{ marginBottom: 0 }}>
        <SegmentList
          rows={[
            { label: 'Under 5 min',   count: sp['5min']?.count,   percent: sp['5min']?.percent },
            { label: 'Within 15 min', count: sp['15min']?.count,  percent: sp['15min']?.percent },
            { label: 'Within 1 hour', count: sp['1hour']?.count,  percent: sp['1hour']?.percent },
            { label: 'Same day',      count: sp.sameday?.count,   percent: sp.sameday?.percent },
            { label: 'Unknown',       count: sp.unknown?.count,   percent: sp.unknown?.percent, muted: true },
          ]}
        />
      </SectionCard>
    </div>
  );
}

function TopValuableTraits({ intel }) {
  const rows = intel?.topValuableTraits || [];
  return (
    <SectionCard title="Top valuable traits" subtitle="What founding movers say makes a request worth paying for.">
      {rows.length === 0 ? <EmptyState text="No valuable-trait data yet." /> : <RankedBars rows={rows} />}
    </SectionCard>
  );
}

function BiggestTrustKillers({ intel }) {
  const rows = intel?.topTrustKillers || [];
  return (
    <SectionCard title="Biggest trust killers" subtitle="What makes a request feel overpriced or broken.">
      {rows.length === 0 ? <EmptyState text="No trust-killer data yet." /> : <RankedBars rows={rows} />}
    </SectionCard>
  );
}

function WantVsHate({ intel }) {
  const wants = intel?.topValuableTraits || [];
  const hates = intel?.topTrustKillers || [];
  return (
    <SectionCard title="Want vs hate" subtitle="Side-by-side ranking of what they value and what kills the deal.">
      {wants.length === 0 && hates.length === 0 ? (
        <EmptyState text="Not enough data yet." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>What they want</div>
            <RankedBars rows={wants.slice(0, 8)} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>What they hate</div>
            <RankedBars rows={hates.slice(0, 8)} />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function MoverArchetypes({ intel }) {
  const a = intel?.archetypes;
  const items = a ? Object.entries(a).map(([key, v]) => ({ key, label: ARCHETYPE_LABELS[key] || key, ...v })) : [];
  const anyData = items.some(i => i.count > 0);
  return (
    <SectionCard title="Mover archetypes" subtitle="How the founding cohort breaks down by behavior profile.">
      {!anyData ? <EmptyState text="No archetype data yet." /> : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}>
          {items.map(i => (
            <div key={i.key} style={{
              background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
              padding: 14,
            }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{i.label}</div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{i.count}</span>
                <span style={{ fontSize: 13, color: '#ea580c', fontWeight: 700 }}>{i.percent}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function MarketBreakdown({ intel, stateIntelCache, loading, selectedState, onSelectState }) {
  const states = intel?.stateBreakdown || [];
  const detail = selectedState ? stateIntelCache[selectedState] : null;

  return (
    <SectionCard title="State / market breakdown" subtitle="Top markets ranked by submission volume. Click a state to drill into its archetype mix.">
      {states.length === 0 ? <EmptyState text="No state data yet." /> : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={mbTh}>State</th>
                  <th style={mbTh}>Count</th>
                  <th style={mbTh}>Share</th>
                  <th style={mbTh}>Top archetype</th>
                  <th style={mbTh}>Top trait</th>
                  <th style={mbTh}>Top trust killer</th>
                </tr>
              </thead>
              <tbody>
                {states.map(s => {
                  const isSel = selectedState === s.state;
                  return (
                    <tr
                      key={s.state}
                      onClick={() => onSelectState(s.state)}
                      style={{
                        cursor: 'pointer',
                        background: isSel ? 'rgba(249,115,22,0.06)' : 'transparent',
                        borderBottom: '1px solid #f1f5f9',
                      }}
                    >
                      <td style={mbTd}><b>{s.state}</b></td>
                      <td style={mbTd}>{s.count}</td>
                      <td style={mbTd}>{s.percent}%</td>
                      <td style={mbTd}>
                        {s.topArchetype
                          ? <span><b>{ARCHETYPE_LABELS[s.topArchetype.key] || s.topArchetype.key}</b> · {s.topArchetype.percent}%</span>
                          : '—'}
                      </td>
                      <td style={mbTd}>
                        {s.topValuableTrait
                          ? <span>{s.topValuableTrait.label} · {s.topValuableTrait.percent}%</span>
                          : '—'}
                      </td>
                      <td style={mbTd}>
                        {s.topTrustKiller
                          ? <span>{s.topTrustKiller.label} · {s.topTrustKiller.percent}%</span>
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedState && (
            <div style={{
              marginTop: 16, padding: 16,
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Drill-down · {selectedState}</div>
                <button
                  onClick={() => onSelectState('')}
                  style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}
                >Clear</button>
              </div>
              {loading && !detail ? <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div> : detail ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <MiniBlock title="Total in state" value={detail.funnel?.totalSubmissions ?? 0} />
                  <MiniBlock title="Top valuable trait"
                    value={detail.topValuableTraits?.[0]
                      ? `${detail.topValuableTraits[0].label} (${detail.topValuableTraits[0].percent}%)`
                      : '—'} />
                  <MiniBlock title="Top trust killer"
                    value={detail.topTrustKillers?.[0]
                      ? `${detail.topTrustKillers[0].label} (${detail.topTrustKillers[0].percent}%)`
                      : '—'} />
                  <MiniBlock title="Speed sensitive"
                    value={`${(detail.speedExpectation?.['5min']?.percent || 0) + (detail.speedExpectation?.['15min']?.percent || 0)}%`} />
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

function MiniBlock({ title, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

function OperationalRecommendations({ intel }) {
  const recs = intel?.recommendations || [];
  return (
    <SectionCard title="Operational recommendations" subtitle="Rule-based playbook derived from current cohort signals.">
      {recs.length === 0 ? (
        <EmptyState text="No recommendations fire on current data." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recs.map(r => (
            <div key={r.id} style={{
              background: '#fff', border: '1px solid #e2e8f0', borderLeft: '4px solid #ea580c',
              borderRadius: 10, padding: '14px 16px',
              display: 'flex', alignItems: 'flex-start', gap: 12,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: 'rgba(234,88,12,0.10)', color: '#ea580c',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {r.severity === 'high' ? <AlertTriangle size={15} /> : <Lightbulb size={15} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.5 }}>{r.message}</div>
                <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                  {r.id} · {r.severity || 'low'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Bar/segment primitives ──────────────────────────────────────────────

function RankedBars({ rows }) {
  if (!rows || rows.length === 0) return <EmptyState text="No data yet." />;
  const max = Math.max(...rows.map(r => r.count || 0), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r, i) => {
        const w = Math.max(2, Math.round(((r.count || 0) / max) * 100));
        return (
          <div key={(r.label || '') + '_' + i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
                <span style={{
                  fontSize: 13, color: '#0f172a', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={r.label}>{r.label}</span>
                <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>
                  <b style={{ color: '#0f172a' }}>{r.count}</b> · {r.percent}%
                </span>
              </div>
              <div style={{ background: '#f1f5f9', height: 6, borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  width: `${w}%`, height: '100%',
                  background: '#ff6a14',
                  transition: 'width 200ms ease',
                }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SegmentList({ rows }) {
  const total = rows.reduce((s, r) => s + (r.count || 0), 0);
  if (total === 0) return <EmptyState text="No data yet." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => {
        const w = Math.max(2, r.percent || 0);
        return (
          <div key={(r.label || '') + '_' + i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: r.muted ? '#94a3b8' : '#0f172a', fontWeight: 600 }}>{r.label}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                <b style={{ color: r.muted ? '#94a3b8' : '#0f172a' }}>{r.count || 0}</b> · {r.percent || 0}%
              </span>
            </div>
            <div style={{ background: '#f1f5f9', height: 6, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                width: `${w}%`, height: '100%',
                background: r.muted ? '#cbd5e1' : '#ff6a14',
                transition: 'width 200ms ease',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{
      padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13,
      background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0',
    }}>{text}</div>
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────
function Drawer({ children, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 100,
      }} />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(560px, 100vw)', background: '#fff',
        boxShadow: '-20px 0 60px -20px rgba(15,23,42,0.25)',
        zIndex: 101, overflowY: 'auto',
      }}>
        <button onClick={onClose} style={{
          position: 'sticky', top: 12, left: 'calc(100% - 48px)', float: 'right',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          padding: 8, cursor: 'pointer',
        }}><X size={16} /></button>
        {children}
      </aside>
    </>
  );
}

// ── Detail view (drawer body) ───────────────────────────────────────────
function DetailView({ doc, onDelete }) {
  return (
    <div style={{ padding: 28 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{doc.companyName}</h2>
      <div style={{ color: '#64748b', fontSize: 14, marginTop: 2 }}>
        {doc.contactName && <span>{doc.contactName} · </span>}
        <a href={`mailto:${doc.email}`} style={{ color: '#f97316', textDecoration: 'none' }}>{doc.email}</a>
        {doc.phone && <span> · {doc.phone}</span>}
      </div>

      {(doc.autoTags || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          {doc.autoTags.map(t => <TagChip key={t} text={t} />)}
        </div>
      )}

      <Section title="Contact & market">
        <KV k="Main state / market" v={doc.mainStateOrMarket} />
        <KV k="Source" v={doc.source} />
        <KV k="Submitted" v={doc.submittedAt ? new Date(doc.submittedAt).toLocaleString() : ''} />
        <KV k="Completion time" v={doc.completionTimeSeconds ? `${doc.completionTimeSeconds}s` : ''} />
        <KV k="Screens seen" v={doc.screensSeen ? `${doc.screensSeen}` : ''} />
      </Section>

      <Section title="Crews & move types">
        <KV k="Desired move types" v={(doc.desiredMoveTypes || []).join(', ')} />
        <KV k="Preferred job sizes" v={(doc.preferredJobSizes || []).join(', ')} />
      </Section>

      <Section title="Request quality">
        <KV k="Value signals" v={(doc.valueSignals || []).join(', ')} />
        <KV k="Required confirmations" v={(doc.requiredConfirmations || []).join(', ')} />
      </Section>

      <Section title="Shared vs exclusive">
        <KV k="Preference" v={SHARED_LABELS[doc.sharedExclusivePreference]} />
        {doc.sharedExclusivePreference === 'shared' && <>
          <KV k="Conditions for shared" v={(doc.sharedAcceptableConditions || []).join(', ')} />
          <KV k="Max movers" v={doc.sharedMaxMovers} />
        </>}
        {doc.sharedExclusivePreference === 'exclusive' && (
          <KV k="Should be exclusive" v={(doc.exclusiveTriggers || []).join(', ')} />
        )}
        {doc.sharedExclusivePreference === 'depends' && (
          <KV k="Depends on" v={(doc.exclusiveTriggersDepends || []).join(', ')} />
        )}
      </Section>

      <Section title="Priority scenario">
        <KV k="First pick" v={SCENARIO_LABELS[doc.priorityScenario] || doc.priorityScenario} />
      </Section>

      <Section title="Speed & pricing">
        <KV k="Speed expectation" v={SPEED_LABELS[doc.speedExpectation]} />
        <KV k="Overpriced signals" v={(doc.overpricedSignals || []).join(', ')} />
      </Section>

      <Section title="Marketplace preferences">
        <KV k="Model" v={MARKETPLACE_LABELS[doc.marketplacePreference]} />
        {doc.marketplacePreference === 'bidding' && (
          <KV k="Bidding triggers" v={(doc.biddingTriggers || []).join(', ')} />
        )}
      </Section>

      <Section title="Provider experience">
        <KV k="Experience" v={doc.leadProviderExperience} />
        <KV k="Frustrations" v={(doc.leadProviderFrustrations || []).join(', ')} />
        <Quote label="Wishlist" text={doc.platformWish} />
        <Quote label="What makes a paid request worth it" text={doc.paidRequestReason} />
        <Quote label="What would it take to try" text={doc.trustToTry} />
      </Section>

      <Section title="Retention">
        <KV k="Top drivers" v={(doc.retentionDrivers || []).join(', ')} />
        <Quote label="Biggest problem right now" text={doc.biggestProblem} />
      </Section>

      {(doc.utm && (doc.utm.source || doc.utm.medium || doc.utm.campaign)) && (
        <Section title="UTM">
          <KV k="Source"   v={doc.utm.source} />
          <KV k="Medium"   v={doc.utm.medium} />
          <KV k="Campaign" v={doc.utm.campaign} />
        </Section>
      )}

      {onDelete && (
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
          <button
            onClick={onDelete}
            style={{
              background: 'transparent', border: 'none', color: '#dc2626',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Trash2 size={14} /> Delete submission
          </button>
        </div>
      )}
    </div>
  );
}

// ── Small atoms ─────────────────────────────────────────────────────────
function TagChip({ text }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'rgba(249,115,22,0.10)', color: '#c2410c',
      borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 700,
      border: '1px solid rgba(249,115,22,0.25)',
    }}>
      <TagIcon size={10} /> {text}
    </span>
  );
}
function Section({ title, children }) {
  return (
    <section style={{ marginTop: 26 }}>
      <h3 style={{
        margin: '0 0 10px', fontSize: 12, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: 1, fontWeight: 800,
      }}>{title}</h3>
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, border: '1px solid #e2e8f0' }}>
        {children}
      </div>
    </section>
  );
}
function KV({ k, v }) {
  if (!v) return null;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', fontSize: 14 }}>
      <span style={{ width: 180, color: '#64748b', flexShrink: 0 }}>{k}</span>
      <span style={{ color: '#0f172a' }}>{v}</span>
    </div>
  );
}
function Quote({ label, text }) {
  if (!text) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <blockquote style={{
        margin: 0, padding: '10px 12px', background: '#fff',
        borderLeft: '3px solid #f97316', borderRadius: 6,
        color: '#0f172a', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
      }}>“{text}”</blockquote>
    </div>
  );
}

// ── Inline styles for table chrome ──────────────────────────────────────
const thStyle = { textAlign: 'left', padding: '12px 14px', fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 };
const tdStyle = { padding: '12px 14px', color: '#0f172a' };
const mbTh    = { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 };
const mbTd    = { padding: '10px 12px', color: '#0f172a' };
const inputStyle = {
  width: '100%', padding: '10px 12px 10px 36px',
  borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, background: '#fff',
};
const selectStyle = {
  padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0',
  fontSize: 14, background: '#fff', minWidth: 160,
};
const pagerBtn = {
  padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
};
