import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';

const TYPE_LABELS = {
  realtor: 'Realtor',
  facebook_group_admin: 'FB Group',
};

const FREQ_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  occasionally: 'Occasionally',
  rarely: 'Rarely',
  '': '—',
};

export default function AdminPartnerResearch() {
  const { API_URL, token } = useContext(AuthContext);

  const [stats, setStats]             = useState({ total: 0, realtor: 0, facebook_group_admin: 0 });
  const [submissions, setSubmissions] = useState([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);

  const [page, setPage]   = useState(1);
  const [pageSize]        = useState(25);
  const [search, setSearch] = useState('');
  const [typeFilter, setType] = useState('');

  const [drawerId, setDrawerId]   = useState(null);
  const [drawerDoc, setDrawerDoc] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/partner-research/stats`, {
        headers: { 'x-auth-token': token },
      });
      const json = await res.json();
      if (res.ok) setStats(json);
    } catch (e) { console.error('[AdminPartnerResearch] stats fetch failed', e); }
  }, [API_URL, token]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      if (typeFilter) params.set('partnerType', typeFilter);
      const res = await fetch(`${API_URL}/admin/partner-research?${params.toString()}`, {
        headers: { 'x-auth-token': token },
      });
      const json = await res.json();
      if (res.ok) {
        setSubmissions(json.submissions || []);
        setTotal(json.total || 0);
      }
    } catch (e) { console.error('[AdminPartnerResearch] list fetch failed', e); }
    finally { setLoading(false); }
  }, [API_URL, token, page, pageSize, search, typeFilter]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { setPage(1); }, [search, typeFilter]);

  useEffect(() => {
    if (!drawerId) { setDrawerDoc(null); return; }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/admin/partner-research/${drawerId}`, {
          headers: { 'x-auth-token': token },
        });
        const json = await res.json();
        if (res.ok) setDrawerDoc(json);
      } catch (e) { console.error(e); }
    })();
  }, [drawerId, API_URL, token]);

  function signalFor(row) {
    if (row.partnerType === 'realtor') {
      return [row.mainMarket || '—', row.monthlyMovingClients ? `${row.monthlyMovingClients} clients/mo` : ''].filter(Boolean).join(' • ');
    }
    return [row.groupSize || '—', FREQ_LABELS[row.movingHelpFrequency || ''] || '—'].filter(Boolean).join(' • ');
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminLayout>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Partner Research</h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total submissions" value={stats.total} />
          <StatCard label="Realtors" value={stats.realtor} />
          <StatCard label="Facebook groups" value={stats.facebook_group_admin} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select
            value={typeFilter}
            onChange={e => setType(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d4d4d8', background: '#fff' }}
          >
            <option value="">All types</option>
            <option value="realtor">Realtors</option>
            <option value="facebook_group_admin">FB Groups</option>
          </select>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name / email / market / group URL"
              style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid #d4d4d8' }}
            />
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: '#fafafa', textAlign: 'left' }}>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Type</th>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Signal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>Loading…</td></tr>
              ) : submissions.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>No submissions yet.</td></tr>
              ) : submissions.map(row => (
                <tr key={row._id} onClick={() => setDrawerId(row._id)} style={{ cursor: 'pointer', borderTop: '1px solid #f4f4f5' }}>
                  <td style={td}>{new Date(row.submittedAt).toLocaleDateString()}</td>
                  <td style={td}>{TYPE_LABELS[row.partnerType] || row.partnerType}</td>
                  <td style={td}>{row.fullName}</td>
                  <td style={td}>{row.email}</td>
                  <td style={{ ...td, color: '#52525b' }}>{signalFor(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
            <span style={{ alignSelf: 'center', fontSize: 13, color: '#52525b' }}>Page {page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
          </div>
        )}

        {drawerId && <Drawer onClose={() => setDrawerId(null)} doc={drawerDoc} />}
      </div>
    </AdminLayout>
  );
}

const th = { padding: '12px 14px', fontSize: 12, fontWeight: 600, color: '#52525b', textTransform: 'uppercase', letterSpacing: 0.4 };
const td = { padding: '12px 14px', verticalAlign: 'middle' };

function StatCard({ label, value }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Drawer({ onClose, doc }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 'min(520px, 100vw)', background: '#fff',
          padding: 24, overflowY: 'auto', boxShadow: '-12px 0 32px rgba(15,23,42,0.18)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          style={{ position: 'absolute', right: 12, top: 12, background: 'transparent', border: 0, cursor: 'pointer' }}
        >
          <X size={18} />
        </button>
        {!doc ? <p>Loading…</p> : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{doc.fullName}</h2>
            <p style={{ color: '#52525b', fontSize: 13, marginBottom: 16 }}>
              {TYPE_LABELS[doc.partnerType]} · {new Date(doc.submittedAt).toLocaleString()}
            </p>

            <Row label="Email" value={doc.email} />
            {doc.partnerType === 'realtor' && (
              <>
                <Row label="Brokerage" value={doc.brokerageName} />
                <Row label="Main market" value={doc.mainMarket} />
                <Row label="Monthly clients" value={doc.monthlyMovingClients} />
              </>
            )}
            {doc.partnerType === 'facebook_group_admin' && (
              <>
                <Row label="Facebook group" value={
                  <a href={doc.facebookGroupUrl} target="_blank" rel="noreferrer">{doc.facebookGroupUrl}</a>
                } />
                <Row label="Group size" value={doc.groupSize} />
                <Row label="Help frequency" value={FREQ_LABELS[doc.movingHelpFrequency || ''] || '—'} />
              </>
            )}

            <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#71717a', marginTop: 20, marginBottom: 8 }}>Metadata</h3>
            <Row label="Source" value={doc.source} />
            <Row label="UTM source" value={doc.utm?.source} />
            <Row label="UTM medium" value={doc.utm?.medium} />
            <Row label="UTM campaign" value={doc.utm?.campaign} />
            <Row label="Completion (s)" value={doc.completionTimeSeconds} />
            <Row label="IP" value={doc.ipAddress} />
            <Row label="User agent" value={doc.userAgent} />
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #f4f4f5', fontSize: 14 }}>
      <div style={{ width: 140, color: '#71717a', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, color: '#0f172a', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}
