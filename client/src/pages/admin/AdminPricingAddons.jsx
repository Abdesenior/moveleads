import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { Plus, Search, X, Edit2, Trash2, Power, TestTube2 } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

const HOME_SIZE_OPTIONS   = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5+ Bedroom', '4+ Bedroom'];
const TIER_OPTIONS        = ['hot', 'premium', 'standard', 'review', 'rejected'];
const VALIDATION_FLAGS    = ['phoneVerified', 'mobileLine', 'identityMatch'];

const EMPTY_FORM = {
  code: '', label: '', amountUsd: 0, active: true, order: 100, notes: '',
  appliesWhen: {
    milesGte: '', milesLt: '', daysToMoveLte: '', daysToMoveGt: '',
    homeSizeIn: [], heavyItemsAny: [], tierIn: [], validationFlagsAll: [],
  },
};

export default function AdminPricingAddons() {
  const { API_URL, token } = useContext(AuthContext);
  const toast = useToast();

  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  const [editing, setEditing] = useState(null);     // null or { id, form }
  const [creating, setCreating] = useState(false);
  const [saving, setSaving]   = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (activeFilter) params.set('active', activeFilter);
      const res = await fetch(`${API_URL}/admin/pricing-addons?${params.toString()}`, {
        headers: { 'x-auth-token': token },
      });
      const json = await res.json();
      if (res.ok) setRows(json.rows || []);
      else toast.error('Could not load add-ons', json.msg || '');
    } catch (e) {
      console.error('[AdminPricingAddons] list failed', e);
      toast.error('Could not load add-ons');
    } finally { setLoading(false); }
  }, [API_URL, token, search, activeFilter, toast]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function toggleActive(row) {
    try {
      const res = await fetch(`${API_URL}/admin/pricing-addons/${row._id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ active: !row.active }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.msg || 'Failed');
      toast.success(`${json.code || row.code} ${json.active ? 'enabled' : 'disabled'}`);
      fetchRows();
    } catch (e) {
      toast.error('Could not toggle', e.message);
    }
  }

  async function softDelete(row) {
    if (!window.confirm(`Disable add-on "${row.code}"? Active rows pause; data preserved.`)) return;
    try {
      const res = await fetch(`${API_URL}/admin/pricing-addons/${row._id}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.msg || 'Failed');
      toast.success('Add-on disabled');
      fetchRows();
    } catch (e) {
      toast.error('Could not disable', e.message);
    }
  }

  async function save(form, id) {
    setSaving(true);
    try {
      const payload = {
        code: form.code,
        label: form.label,
        amountUsd: Number(form.amountUsd) || 0,
        order: Number(form.order) || 100,
        notes: form.notes || '',
        active: !!form.active,
        appliesWhen: serializePredicate(form.appliesWhen),
      };
      const url    = id ? `${API_URL}/admin/pricing-addons/${id}` : `${API_URL}/admin/pricing-addons`;
      const method = id ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.msg || 'Save failed');
      toast.success(id ? 'Add-on updated' : 'Add-on created');
      setEditing(null);
      setCreating(false);
      fetchRows();
    } catch (e) {
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  return (
    <AdminLayout>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Pricing Add-Ons</h1>
            <p style={{ fontSize: 13, color: '#52525b', margin: '6px 0 0', maxWidth: 720, lineHeight: 1.5 }}>
              Additive USD components for the V2 pricing engine.{' '}
              <strong>Shadow only</strong> — these contribute to <code style={{ background: '#f4f4f5', padding: '1px 5px', borderRadius: 4 }}>Lead.priceShadowV2</code> for admin observability.{' '}
              <strong>Live <code style={{ background: '#f4f4f5', padding: '1px 5px', borderRadius: 4 }}>buyNowPrice</code> is still computed by the legacy multiplier engine.</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setCreating(true); setEditing(null); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              background: '#0f172a', color: '#fff', border: 0,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={14} /> New add-on
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d4d4d8', background: '#fff' }}>
            <option value="">All states</option>
            <option value="true">Active only</option>
            <option value="false">Disabled only</option>
          </select>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code / label"
                   style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid #d4d4d8' }} />
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: '#fafafa', textAlign: 'left' }}>
              <tr>
                <th style={th}>Order</th>
                <th style={th}>Active</th>
                <th style={th}>Code</th>
                <th style={th}>Label</th>
                <th style={th}>Amount</th>
                <th style={th}>Predicate</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>
                  No add-ons configured. Pricing V2 currently runs in shadow mode and contributes only the base lead price. Add an add-on to start populating the V2 shadow breakdown.
                </td></tr>
              ) : rows.map(row => (
                <tr key={row._id} style={{ borderTop: '1px solid #f4f4f5' }}>
                  <td style={td}>{row.order ?? 100}</td>
                  <td style={td}>
                    <button onClick={() => toggleActive(row)}
                            style={pillStyle(row.active)}
                            title={row.active ? 'Click to disable' : 'Click to enable'}>
                      <Power size={11} style={{ marginRight: 4 }} />
                      {row.active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td style={td}><code style={{ background: '#f4f4f5', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{row.code}</code></td>
                  <td style={td}>{row.label}</td>
                  <td style={{ ...td, fontWeight: 700, color: (row.amountUsd ?? 0) < 0 ? '#16a34a' : '#0f172a' }}>
                    {(row.amountUsd ?? 0) >= 0 ? `+$${row.amountUsd}` : `-$${Math.abs(row.amountUsd)}`}
                  </td>
                  <td style={{ ...td, color: '#52525b', fontSize: 12.5 }}>{predicateSummary(row.appliesWhen)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => { setEditing({ id: row._id, form: deserializeRow(row) }); setCreating(false); }}
                            style={iconBtn} aria-label="Edit"><Edit2 size={14} /></button>
                    <button onClick={() => softDelete(row)}
                            style={{ ...iconBtn, color: '#dc2626' }} aria-label="Disable"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(creating || editing) && (
          <AddOnModal
            initial={editing ? editing.form : EMPTY_FORM}
            id={editing?.id}
            saving={saving}
            onClose={() => { setCreating(false); setEditing(null); }}
            onSave={(form) => save(form, editing?.id)}
            API_URL={API_URL}
            token={token}
            toast={toast}
          />
        )}
      </div>
    </AdminLayout>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────
function AddOnModal({ initial, id, saving, onClose, onSave, API_URL, token, toast }) {
  const [form, setForm] = useState(initial);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [sample, setSample] = useState({ miles: 150, daysToMove: 5, homeSize: '2 Bedroom', heavyItems: [], tier: 'standard' });

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })); }
  function setPred(field, value) { setForm(prev => ({ ...prev, appliesWhen: { ...prev.appliesWhen, [field]: value } })); }
  function toggleArr(field, value) {
    setForm(prev => {
      const cur = prev.appliesWhen[field] || [];
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
      return { ...prev, appliesWhen: { ...prev.appliesWhen, [field]: next } };
    });
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const moveDate = sample.daysToMove != null ? new Date(Date.now() + Number(sample.daysToMove) * 86400000).toISOString() : null;
      const sampleLead = { miles: Number(sample.miles), moveDate, homeSize: sample.homeSize, heavyItems: sample.heavyItems, tier: sample.tier, validation: {} };
      const res = await fetch(`${API_URL}/admin/pricing-addons/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ appliesWhen: serializePredicate(form.appliesWhen), sampleLead }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || 'Failed');
      setTestResult(json);
    } catch (e) {
      toast.error('Test failed', e.message);
    } finally { setTesting(false); }
  }

  return (
    <div onClick={onClose}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()}
           style={{ width: 'min(720px, 100%)', background: '#fff', borderRadius: 14, padding: 24, position: 'relative', boxShadow: '0 24px 60px rgba(15,23,42,0.18)' }}>
        <button onClick={onClose} aria-label="Close"
                style={{ position: 'absolute', right: 12, top: 12, background: 'transparent', border: 0, cursor: 'pointer' }}>
          <X size={18} />
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>
          {id ? 'Edit add-on' : 'New add-on'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Code"   hint="lowercase, _ or -">
            <input value={form.code} onChange={e => set('code', e.target.value)} style={inputStyle} placeholder="urgent_move" />
          </Field>
          <Field label="Amount (USD)" hint="negative = discount">
            <input type="number" value={form.amountUsd} onChange={e => set('amountUsd', e.target.value)} style={inputStyle} placeholder="5" />
          </Field>
          <Field label="Label" wide>
            <input value={form.label} onChange={e => set('label', e.target.value)} style={inputStyle} placeholder="Urgent move (≤7 days)" />
          </Field>
          <Field label="Order"  hint="lower = renders first">
            <input type="number" value={form.order} onChange={e => set('order', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Active">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#52525b' }}>
              <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
              {form.active ? 'Active' : 'Disabled'}
            </label>
          </Field>
          <Field label="Notes" wide>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} style={inputStyle} placeholder="Internal context (optional)" />
          </Field>
        </div>

        <h3 style={sectionH}>Conditions</h3>
        <p style={{ fontSize: 12, color: '#71717a', margin: '0 0 12px' }}>
          Empty conditions = no constraint. The add-on applies when ALL non-empty conditions match.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Miles ≥" hint="distance lower bound">
            <input type="number" value={form.appliesWhen.milesGte} onChange={e => setPred('milesGte', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Miles <" hint="distance upper bound">
            <input type="number" value={form.appliesWhen.milesLt} onChange={e => setPred('milesLt', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Days to move ≤">
            <input type="number" value={form.appliesWhen.daysToMoveLte} onChange={e => setPred('daysToMoveLte', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Days to move >">
            <input type="number" value={form.appliesWhen.daysToMoveGt} onChange={e => setPred('daysToMoveGt', e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <ChipPicker label="Home sizes (any)" options={HOME_SIZE_OPTIONS} selected={form.appliesWhen.homeSizeIn} onToggle={v => toggleArr('homeSizeIn', v)} />
        <ChipPicker label="Tiers (any)"     options={TIER_OPTIONS}      selected={form.appliesWhen.tierIn}    onToggle={v => toggleArr('tierIn', v)} />
        <ChipPicker label="Validation flags (ALL must match)" options={VALIDATION_FLAGS} selected={form.appliesWhen.validationFlagsAll} onToggle={v => toggleArr('validationFlagsAll', v)} />

        <h3 style={sectionH}>Predicate test (no save)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, alignItems: 'end' }}>
          <Field label="Sample miles">  <input type="number" value={sample.miles}     onChange={e => setSample(s => ({...s, miles: e.target.value}))} style={inputStyle} /></Field>
          <Field label="Days to move">  <input type="number" value={sample.daysToMove}onChange={e => setSample(s => ({...s, daysToMove: e.target.value}))} style={inputStyle} /></Field>
          <Field label="Home size">
            <select value={sample.homeSize} onChange={e => setSample(s => ({...s, homeSize: e.target.value}))} style={inputStyle}>
              {HOME_SIZE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Tier">
            <select value={sample.tier} onChange={e => setSample(s => ({...s, tier: e.target.value}))} style={inputStyle}>
              {TIER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button onClick={runTest} disabled={testing}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #d4d4d8', color: '#0f172a', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: testing ? 'wait' : 'pointer' }}>
            <TestTube2 size={14} /> {testing ? 'Testing…' : 'Test predicate'}
          </button>
          {testResult && (
            <span style={{ fontSize: 13, fontWeight: 700, color: testResult.match ? '#16a34a' : '#dc2626' }}>
              {testResult.match ? '✓ Matches — add-on would apply' : '✗ Does not match — add-on would NOT apply'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #e4e4e7' }}>
          <button onClick={onClose}
                  style={{ background: '#fff', border: '1px solid #d4d4d8', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => onSave(form)} disabled={saving}
                  style={{ background: '#0f172a', color: '#fff', border: 0, padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : id ? 'Save changes' : 'Create add-on'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, wide, children }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'auto' }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#52525b', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#a1a1aa' }}>{hint}</p>}
    </div>
  );
}

function ChipPicker({ label, options, selected, onToggle }) {
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#52525b', display: 'block', marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => {
          const on = selected.includes(o);
          return (
            <button key={o} type="button" onClick={() => onToggle(o)}
                    style={{
                      padding: '4px 10px', borderRadius: 999,
                      background: on ? '#0f172a' : '#fff',
                      color: on ? '#fff' : '#52525b',
                      border: '1px solid ' + (on ? '#0f172a' : '#d4d4d8'),
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────
function serializePredicate(p) {
  const out = {};
  for (const k of ['milesGte','milesLt','daysToMoveLte','daysToMoveGt']) {
    if (p[k] !== '' && p[k] != null) out[k] = Number(p[k]);
  }
  for (const k of ['homeSizeIn','heavyItemsAny','tierIn','validationFlagsAll']) {
    if (Array.isArray(p[k]) && p[k].length) out[k] = p[k];
  }
  return out;
}

function deserializeRow(row) {
  const p = row.appliesWhen || {};
  return {
    code: row.code || '', label: row.label || '',
    amountUsd: row.amountUsd ?? 0, active: !!row.active,
    order: row.order ?? 100, notes: row.notes || '',
    appliesWhen: {
      milesGte: p.milesGte ?? '', milesLt: p.milesLt ?? '',
      daysToMoveLte: p.daysToMoveLte ?? '', daysToMoveGt: p.daysToMoveGt ?? '',
      homeSizeIn: p.homeSizeIn || [], heavyItemsAny: p.heavyItemsAny || [],
      tierIn: p.tierIn || [], validationFlagsAll: p.validationFlagsAll || [],
    },
  };
}

function predicateSummary(p = {}) {
  const parts = [];
  if (p.milesGte != null)     parts.push(`miles ≥ ${p.milesGte}`);
  if (p.milesLt  != null)     parts.push(`miles < ${p.milesLt}`);
  if (p.daysToMoveLte != null) parts.push(`≤${p.daysToMoveLte} days`);
  if (p.daysToMoveGt  != null) parts.push(`>${p.daysToMoveGt} days`);
  if (Array.isArray(p.homeSizeIn) && p.homeSizeIn.length)               parts.push(`size: ${p.homeSizeIn.join('|')}`);
  if (Array.isArray(p.tierIn) && p.tierIn.length)                       parts.push(`tier: ${p.tierIn.join('|')}`);
  if (Array.isArray(p.heavyItemsAny) && p.heavyItemsAny.length)         parts.push(`heavy: ${p.heavyItemsAny.join('|')}`);
  if (Array.isArray(p.validationFlagsAll) && p.validationFlagsAll.length) parts.push(`flags: ${p.validationFlagsAll.join('+')}`);
  return parts.length ? parts.join(' · ') : 'always';
}

// ── Styles ───────────────────────────────────────────────────────────────
const th = { padding: '12px 14px', fontSize: 12, fontWeight: 600, color: '#52525b', textTransform: 'uppercase', letterSpacing: 0.4 };
const td = { padding: '12px 14px', verticalAlign: 'middle' };
const iconBtn = { background: 'transparent', border: 0, padding: 6, marginLeft: 4, cursor: 'pointer', color: '#52525b' };
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d4d4d8', fontSize: 13, boxSizing: 'border-box' };
const sectionH = { fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#71717a', letterSpacing: 0.4, margin: '24px 0 10px' };

function pillStyle(active) {
  return {
    display: 'inline-flex', alignItems: 'center',
    padding: '3px 10px', borderRadius: 999,
    background: active ? '#ecfdf5' : '#fef2f2',
    color: active ? '#047857' : '#991b1b',
    border: '1px solid ' + (active ? '#a7f3d0' : '#fecaca'),
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
  };
}
