import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { Users2, Search, Download, X, ChevronRight, Tag as TagIcon } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';

/**
 * AdminMoverResearch — analytics + table for /api/admin/mover-research.
 *
 * Layout:
 *   • Analytics cards (totals, breakdowns, top tag, top frustration)
 *   • Filters bar (search + tag + state + Export CSV)
 *   • Table of submissions, click-row → slide-in detail drawer
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

export default function AdminMoverResearch() {
  const { API_URL, token } = useContext(AuthContext);

  const [analytics, setAnalytics]       = useState(null);
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

  // ─── Fetch analytics + initial list ───────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const headers = { 'x-auth-token': token };
        const res = await fetch(`${API_URL}/admin/mover-research/analytics`, { headers });
        const json = await res.json();
        if (res.ok) setAnalytics(json);
      } catch (e) { console.error('[AdminMoverResearch] analytics fetch failed', e); }
    })();
  }, [API_URL, token]);

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

  // ─── Drawer: load detail when an id is selected ───────────────────────
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

  // ─── Tag / state options derived from analytics ───────────────────────
  const tagOptions = useMemo(() => {
    if (!analytics || !Array.isArray(analytics.topTags)) return [];
    return analytics.topTags.map(t => t.value);
  }, [analytics]);
  const stateOptions = useMemo(() => {
    if (!analytics || !Array.isArray(analytics.stateBreakdown)) return [];
    return analytics.stateBreakdown.map(s => s.value).filter(Boolean);
  }, [analytics]);

  // ─── Top-level summary numbers ────────────────────────────────────────
  const sharedPct = useMemo(() => {
    if (!analytics || !analytics.totalSubmissions) return { shared: 0, exclusive: 0, depends: 0 };
    const t = analytics.totalSubmissions;
    const find = (val) => (analytics.sharedExclusiveBreakdown.find(s => s.value === val) || {}).count || 0;
    return {
      shared:    Math.round((find('shared')    / t) * 100),
      exclusive: Math.round((find('exclusive') / t) * 100),
      depends:   Math.round((find('depends')   / t) * 100),
    };
  }, [analytics]);

  const topMoveType = analytics?.topDesiredMoveTypes?.[0]?.value || '—';
  const topFrustration = analytics?.topFrustrations?.[0]?.value || '—';

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminLayout>
      <div style={{ padding: 28, maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.25)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#f97316',
          }}>
            <Users2 size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Mover Research</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Founding Mover Program submissions and aggregate insights.</p>
          </div>
        </div>

        {/* ── Analytics row ── */}
        <div style={cardRow}>
          <Card title="Total submissions" value={analytics?.totalSubmissions ?? '—'} />
          <Card title="Shared / Exclusive / Depends" value={
            <span style={{ fontSize: 18 }}>
              <span style={{ color: '#0f172a' }}>{sharedPct.shared}%</span>
              <span style={{ color: '#94a3b8' }}> / </span>
              <span style={{ color: '#f97316' }}>{sharedPct.exclusive}%</span>
              <span style={{ color: '#94a3b8' }}> / </span>
              <span style={{ color: '#0f172a' }}>{sharedPct.depends}%</span>
            </span>
          } />
          <Card title="Bidding interest" value={`${analytics?.biddingInterestedPercent ?? 0}%`} />
          <Card title="Top requested move type" value={<span style={{ fontSize: 15 }}>{topMoveType}</span>} />
          <Card title="Top frustration" value={<span style={{ fontSize: 15 }}>{topFrustration}</span>} />
        </div>

        {/* ── Filters bar ── */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24, marginBottom: 16,
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

        {/* ── Table ── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                {['Company', 'Email', 'State/Market', 'Shared/Exclusive', 'Marketplace', 'Tags', 'Submitted'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
              )}
              {!loading && submissions.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>No submissions match these filters.</td></tr>
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
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <ChevronRight size={16} color="#cbd5e1" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 13, color: '#475569' }}>
            <span>Page {page} of {totalPages} · {total} total</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pagerBtn}>Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pagerBtn}>Next</button>
            </div>
          </div>
        )}

        {/* ── Detail drawer ── */}
        {drawerId && (
          <Drawer onClose={() => setDrawerId(null)}>
            {drawerLoading || !drawerDoc ? (
              <div style={{ padding: 24, color: '#64748b' }}>Loading…</div>
            ) : (
              <DetailView doc={drawerDoc} />
            )}
          </Drawer>
        )}
      </div>
    </AdminLayout>
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
function DetailView({ doc }) {
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
    </div>
  );
}

// ── Small atoms ─────────────────────────────────────────────────────────
function Card({ title, value }) {
  return (
    <div style={{
      flex: '1 1 200px', minWidth: 180,
      background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
      padding: 16,
    }}>
      <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  );
}
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
const cardRow = { display: 'flex', flexWrap: 'wrap', gap: 12 };
const thStyle = { textAlign: 'left', padding: '12px 14px', fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 };
const tdStyle = { padding: '12px 14px', color: '#0f172a' };
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
