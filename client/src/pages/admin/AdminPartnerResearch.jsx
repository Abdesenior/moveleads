import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { Search, X, Trash2 } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

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
  const toast = useToast();

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

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);

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

  // Clear stale selections when the list changes (page nav, filter change, refresh).
  useEffect(() => {
    setSelectedIds(prev => {
      if (prev.size === 0) return prev;
      const visible = new Set(submissions.map(s => s._id));
      const next = new Set();
      prev.forEach(id => { if (visible.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [submissions]);

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

  function marketFor(row) {
    if (row.partnerType === 'realtor') return row.mainMarket || '';
    if (Array.isArray(row.popularMarkets) && row.popularMarkets.length) {
      return row.popularMarkets.join(' · ');
    }
    return '';
  }

  function signalFor(row) {
    if (row.partnerType === 'realtor') {
      return row.monthlyMovingClients ? `${row.monthlyMovingClients} clients/mo` : '';
    }
    return [row.groupSize || '', FREQ_LABELS[row.movingHelpFrequency || ''] || ''].filter(Boolean).join(' • ');
  }

  // ───── Selection helpers ──────────────────────────────────────────────
  function toggleRow(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function clearSelection() { setSelectedIds(new Set()); }
  const allVisibleSelected = submissions.length > 0 && submissions.every(s => selectedIds.has(s._id));
  const someVisibleSelected = submissions.some(s => selectedIds.has(s._id)) && !allVisibleSelected;
  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        submissions.forEach(s => next.delete(s._id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        submissions.forEach(s => next.add(s._id));
        return next;
      });
    }
  }

  // ───── Delete handlers ────────────────────────────────────────────────
  async function deleteSingle(id) {
    if (!window.confirm('Delete this submission?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/admin/partner-research/${id}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.msg || 'Delete failed');
      toast.success('Submission deleted');
      if (drawerId === id) setDrawerId(null);
      setSelectedIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev); next.delete(id); return next;
      });
      fetchList();
      fetchStats();
    } catch (e) {
      toast.error(e.message || 'Could not delete');
    } finally {
      setDeleting(false);
    }
  }

  async function deleteBulk() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected submission${ids.length === 1 ? '' : 's'}?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/admin/partner-research/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.msg || 'Delete failed');
      const removed = Number(json.deleted) || 0;
      toast.success(`Deleted ${removed} submission${removed === 1 ? '' : 's'}`);
      if (drawerId && selectedIds.has(drawerId)) setDrawerId(null);
      clearSelection();
      fetchList();
      fetchStats();
    } catch (e) {
      toast.error(e.message || 'Could not delete');
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedCount = selectedIds.size;

  return (
    <AdminLayout>
      {/* Hover affordance for the per-row trash icon — subtle until hovered. */}
      <style>{`
        .apr-row-delete { opacity: 0.35; transition: opacity 0.12s ease, color 0.12s ease; }
        .apr-row:hover .apr-row-delete { opacity: 1; }
        .apr-row-delete:hover { color: #dc2626; }
        .apr-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: #ef4444; }
      `}</style>

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

        {selectedCount > 0 && (
          <div
            style={{
              position: 'sticky', top: 8, zIndex: 5,
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', marginBottom: 10,
              background: '#0f172a', color: '#fff', borderRadius: 10,
              boxShadow: '0 8px 24px -10px rgba(15,23,42,0.45)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedCount} selected</span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={clearSelection}
              style={{
                background: 'transparent', color: '#cbd5e1', border: '1px solid #334155',
                padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
              }}
            >
              Clear selection
            </button>
            <button
              type="button"
              onClick={deleteBulk}
              disabled={deleting}
              style={{
                background: '#ef4444', color: '#fff', border: 0,
                padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Trash2 size={14} /> Delete selected
            </button>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: '#fafafa', textAlign: 'left' }}>
              <tr>
                <th style={{ ...th, width: 40 }}>
                  <input
                    type="checkbox"
                    className="apr-checkbox"
                    aria-label="Select all on this page"
                    checked={allVisibleSelected}
                    ref={el => { if (el) el.indeterminate = someVisibleSelected; }}
                    onChange={toggleSelectAll}
                    disabled={submissions.length === 0}
                  />
                </th>
                <th style={th}>Date</th>
                <th style={th}>Type</th>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Market</th>
                <th style={th}>Signal</th>
                <th style={{ ...th, width: 40 }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>Loading…</td></tr>
              ) : submissions.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>No submissions yet.</td></tr>
              ) : submissions.map(row => {
                const isSelected = selectedIds.has(row._id);
                return (
                  <tr
                    key={row._id}
                    className="apr-row"
                    onClick={() => setDrawerId(row._id)}
                    style={{
                      cursor: 'pointer',
                      borderTop: '1px solid #f4f4f5',
                      background: isSelected ? 'rgba(239, 68, 68, 0.04)' : undefined,
                    }}
                  >
                    <td style={td} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="apr-checkbox"
                        aria-label={`Select ${row.fullName}`}
                        checked={isSelected}
                        onChange={() => toggleRow(row._id)}
                      />
                    </td>
                    <td style={td}>{new Date(row.submittedAt).toLocaleDateString()}</td>
                    <td style={td}>{TYPE_LABELS[row.partnerType] || row.partnerType}</td>
                    <td style={td}>{row.fullName}</td>
                    <td style={td}>{row.email}</td>
                    <td style={{ ...td, color: '#0f172a', maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={marketFor(row)}>
                      {marketFor(row) || <span style={{ color: '#a1a1aa' }}>—</span>}
                    </td>
                    <td style={{ ...td, color: '#52525b' }}>{signalFor(row) || <span style={{ color: '#a1a1aa' }}>—</span>}</td>
                    <td style={td} onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="apr-row-delete"
                        aria-label={`Delete ${row.fullName}`}
                        onClick={() => deleteSingle(row._id)}
                        disabled={deleting}
                        style={{
                          background: 'transparent', border: 0, padding: 4,
                          cursor: deleting ? 'not-allowed' : 'pointer', color: '#71717a',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
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

        {drawerId && (
          <Drawer
            onClose={() => setDrawerId(null)}
            doc={drawerDoc}
            onDelete={() => deleteSingle(drawerId)}
            deleting={deleting}
          />
        )}
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

function Drawer({ onClose, doc, onDelete, deleting }) {
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
                <Row label="Popular markets" value={
                  Array.isArray(doc.popularMarkets) && doc.popularMarkets.length
                    ? doc.popularMarkets.join(' · ')
                    : ''
                } />
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

            <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #e4e4e7' }}>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                style={{
                  background: 'transparent', color: '#dc2626',
                  border: '1px solid #fecaca', padding: '8px 14px',
                  borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                <Trash2 size={14} /> Delete submission
              </button>
            </div>
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
