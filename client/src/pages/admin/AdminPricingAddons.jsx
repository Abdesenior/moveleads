import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import {
  Plus, Search, X, Edit2, Trash2, Power, TestTube2, Sparkles, Settings2,
  Zap, MapPin, Home, ShieldCheck, Box, CalendarClock, Info,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

/*
 * AdminPricingAddons — operator-facing CRUD for the V2 shadow pricing
 * engine. All raw predicate / tier / flag values are kept exactly as the
 * server expects (hot, phoneVerified, etc.) — every difference between
 * what an operator sees and what the API receives lives in display
 * dictionaries below. Schema, routes, and pricing engine are untouched.
 */

// ── Display dictionaries (label translation only — values unchanged) ─────
const TIER_LABEL = {
  hot:       'Ready-to-Book',
  premium:   'High Intent',
  standard:  'Open Request',
  review:    'Needs Verification',
  rejected:  'Blocked',
};
const TIER_HELP = {
  hot:       'Phone-verified, recent, urgent — first to claim wins',
  premium:   'Verified contact + strong move intent',
  standard:  'Live request, contact not yet verified',
  review:    'Held for manual quality review',
  rejected:  'Blocked from the marketplace — fraud / disqualified',
};
const FLAG_LABEL = {
  phoneVerified: 'Verified phone number',
  mobileLine:    'Mobile line (not VoIP)',
  identityMatch: 'Identity confidence matched',
};
const FLAG_HELP = {
  phoneVerified: 'Twilio Lookup confirmed the number is a real, reachable phone.',
  mobileLine:    'Number is a cellular line, not a VoIP or burner provider.',
  identityMatch: 'Name on file matches identity returned by Twilio Lookup.',
};
const HOME_SIZE_BASIC    = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5+ Bedroom'];
const HOME_SIZE_ADVANCED = ['4+ Bedroom']; // legacy bucket, shown only in advanced

const TIER_BASIC        = ['hot', 'premium', 'standard'];
const TIER_ADVANCED     = ['review', 'rejected'];
const VALIDATION_FLAGS  = ['phoneVerified', 'mobileLine', 'identityMatch'];
const HEAVY_ITEM_PRESETS = ['piano', 'gun_safe', 'pool_table', 'hot_tub', 'safe', 'motorcycle'];

// ── Quick templates (operator-facing) ────────────────────────────────────
const TEMPLATES = [
  {
    id: 'urgent_move', Icon: Zap,
    title: 'Urgent move',
    blurb: 'Within 7 days of move date',
    fill: { code: 'urgent_move', label: 'Urgent move (≤7 days)', amountUsd: 15,
      appliesWhen: { daysToMoveLte: 7 } },
  },
  {
    id: 'same_week', Icon: CalendarClock,
    title: 'Same-week move',
    blurb: 'Books within the next 7 days',
    fill: { code: 'same_week_move', label: 'Same-week move', amountUsd: 12,
      appliesWhen: { daysToMoveLte: 7 } },
  },
  {
    id: 'long_distance', Icon: MapPin,
    title: 'Long distance',
    blurb: '150+ miles',
    fill: { code: 'long_distance', label: 'Long distance (≥150 mi)', amountUsd: 10,
      appliesWhen: { milesGte: 150 } },
  },
  {
    id: 'large_home', Icon: Home,
    title: 'Large home',
    blurb: '4-bedroom or larger',
    fill: { code: 'large_home', label: 'Large home (4+ BR)', amountUsd: 12,
      appliesWhen: { homeSizeIn: ['4 Bedroom', '5+ Bedroom', '4+ Bedroom'] } },
  },
  {
    id: 'verified_customer', Icon: ShieldCheck,
    title: 'Verified customer',
    blurb: 'Phone-verified contacts only',
    fill: { code: 'verified_customer', label: 'Verified customer', amountUsd: 5,
      appliesWhen: { validationFlagsAll: ['phoneVerified'] } },
  },
  {
    id: 'heavy_items', Icon: Box,
    title: 'Heavy items',
    blurb: 'Piano, safe, hot tub, etc.',
    fill: { code: 'heavy_items', label: 'Heavy items surcharge', amountUsd: 8,
      appliesWhen: { heavyItemsAny: ['piano', 'gun_safe', 'pool_table', 'hot_tub', 'safe'] } },
  },
];

const EMPTY_FORM = {
  code: '', label: '', amountUsd: 0, active: true, order: 100, notes: '',
  appliesWhen: {
    milesGte: '', milesLt: '', daysToMoveLte: '', daysToMoveGt: '',
    homeSizeIn: [], heavyItemsAny: [], tierIn: [], validationFlagsAll: [],
  },
};

// ── Plain-English explanation generator ──────────────────────────────────
function explainPredicate(p = {}) {
  const out = [];
  if (p.daysToMoveLte !== '' && p.daysToMoveLte != null) {
    const n = Number(p.daysToMoveLte);
    if (Number.isFinite(n)) out.push(`move is within ${n} day${n === 1 ? '' : 's'}`);
  }
  if (p.daysToMoveGt !== '' && p.daysToMoveGt != null) {
    const n = Number(p.daysToMoveGt);
    if (Number.isFinite(n)) out.push(`move is more than ${n} days away`);
  }
  if (p.milesGte !== '' && p.milesGte != null) {
    const n = Number(p.milesGte);
    if (Number.isFinite(n)) out.push(`distance is ${n}+ miles`);
  }
  if (p.milesLt !== '' && p.milesLt != null) {
    const n = Number(p.milesLt);
    if (Number.isFinite(n)) out.push(`distance is under ${n} miles`);
  }
  if (Array.isArray(p.homeSizeIn) && p.homeSizeIn.length) {
    out.push(`home size is ${p.homeSizeIn.join(' or ')}`);
  }
  if (Array.isArray(p.tierIn) && p.tierIn.length) {
    const labels = p.tierIn.map(t => TIER_LABEL[t] || t);
    out.push(`lead status is ${labels.join(' or ')}`);
  }
  if (Array.isArray(p.heavyItemsAny) && p.heavyItemsAny.length) {
    out.push(`move includes ${p.heavyItemsAny.join(' or ')}`);
  }
  if (Array.isArray(p.validationFlagsAll) && p.validationFlagsAll.length) {
    const labels = p.validationFlagsAll.map(f => (FLAG_LABEL[f] || f).toLowerCase());
    if (labels.length === 1) out.push(`customer has ${labels[0]}`);
    else out.push(`customer has ${labels.join(' AND ')}`);
  }
  return out;
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function AdminPricingAddons() {
  const { API_URL, token } = useContext(AuthContext);
  const toast = useToast();

  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  const [editing, setEditing]   = useState(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving]     = useState(false);

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
    } catch (e) { toast.error('Could not toggle', e.message); }
  }

  async function softDelete(row) {
    if (!window.confirm(`Disable add-on "${row.code}"? Data preserved.`)) return;
    try {
      const res = await fetch(`${API_URL}/admin/pricing-addons/${row._id}`, {
        method: 'DELETE', headers: { 'x-auth-token': token },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.msg || 'Failed');
      toast.success('Add-on disabled');
      fetchRows();
    } catch (e) { toast.error('Could not disable', e.message); }
  }

  async function save(form, id) {
    setSaving(true);
    try {
      const payload = {
        code: form.code, label: form.label,
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
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <AdminLayout>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Pricing Add-Ons</h1>
            <p style={{ fontSize: 13, color: '#52525b', margin: '6px 0 0', maxWidth: 720, lineHeight: 1.5 }}>
              Add a small surcharge or discount when a lead matches certain conditions — urgency, distance, home size, or customer verification.{' '}
              <strong>Shadow only</strong> — live <code style={inlineCode}>buyNowPrice</code> is still computed by the legacy engine. These add-ons show up in the admin V2 breakdown.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setCreating(true); setEditing(null); }}
            style={primaryActionBtn}
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
                <th style={th}>Applies when</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>
                  No add-ons yet. The V2 pricing engine currently contributes only the base lead price — add a template to start shaping breakdowns.
                </td></tr>
              ) : rows.map(row => (
                <tr key={row._id} style={{ borderTop: '1px solid #f4f4f5' }}>
                  <td style={td}>{row.order ?? 100}</td>
                  <td style={td}>
                    <button onClick={() => toggleActive(row)} style={pillStyle(row.active)}
                            title={row.active ? 'Click to disable' : 'Click to enable'}>
                      <Power size={11} style={{ marginRight: 4 }} />
                      {row.active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td style={td}><code style={inlineCode}>{row.code}</code></td>
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
  const [form, setForm]       = useState(initial);
  const [advanced, setAdvanced] = useState(() => hasAdvancedFields(initial));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [sample, setSample]   = useState({ miles: 150, daysToMove: 5, homeSize: '2 Bedroom', tier: 'standard' });

  // Derived: "Verified customer" basic toggle = whether phoneVerified is in flags
  const verifiedCustomerOn = (form.appliesWhen.validationFlagsAll || []).includes('phoneVerified');

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })); }
  function setPred(field, value) {
    setTestResult(null);
    setForm(prev => ({ ...prev, appliesWhen: { ...prev.appliesWhen, [field]: value } }));
  }
  function toggleArr(field, value) {
    setTestResult(null);
    setForm(prev => {
      const cur = prev.appliesWhen[field] || [];
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
      return { ...prev, appliesWhen: { ...prev.appliesWhen, [field]: next } };
    });
  }
  function toggleVerifiedCustomer() {
    setTestResult(null);
    setForm(prev => {
      const cur = prev.appliesWhen.validationFlagsAll || [];
      const next = cur.includes('phoneVerified') ? cur.filter(v => v !== 'phoneVerified') : [...cur, 'phoneVerified'];
      return { ...prev, appliesWhen: { ...prev.appliesWhen, validationFlagsAll: next } };
    });
  }
  function applyTemplate(t) {
    setForm({
      ...EMPTY_FORM,
      code: t.fill.code, label: t.fill.label, amountUsd: t.fill.amountUsd,
      active: true, order: 100, notes: '',
      appliesWhen: {
        ...EMPTY_FORM.appliesWhen,
        ...Object.fromEntries(Object.entries(t.fill.appliesWhen).map(([k, v]) =>
          ['milesGte','milesLt','daysToMoveLte','daysToMoveGt'].includes(k) ? [k, v] : [k, v]
        )),
      },
    });
    setTestResult(null);
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const moveDate = sample.daysToMove !== '' && sample.daysToMove != null
        ? new Date(Date.now() + Number(sample.daysToMove) * 86400000).toISOString()
        : null;
      const sampleLead = {
        miles: Number(sample.miles), moveDate, homeSize: sample.homeSize,
        heavyItems: [], tier: sample.tier, validation: {},
      };
      const res = await fetch(`${API_URL}/admin/pricing-addons/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ appliesWhen: serializePredicate(form.appliesWhen), sampleLead }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || 'Failed');
      setTestResult(json);
    } catch (e) { toast.error('Test failed', e.message); }
    finally { setTesting(false); }
  }

  const explanationBullets = useMemo(() => explainPredicate(form.appliesWhen), [form.appliesWhen]);
  const homeSizeOptions = advanced ? [...HOME_SIZE_BASIC, ...HOME_SIZE_ADVANCED] : HOME_SIZE_BASIC;
  const tierOptions     = advanced ? [...TIER_BASIC, ...TIER_ADVANCED]           : TIER_BASIC;

  return (
    <div onClick={onClose}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()}
           style={{ width: 'min(760px, 100%)', background: '#fff', borderRadius: 14, padding: 24, position: 'relative', boxShadow: '0 24px 60px rgba(15,23,42,0.18)' }}>
        <button onClick={onClose} aria-label="Close"
                style={{ position: 'absolute', right: 12, top: 12, background: 'transparent', border: 0, cursor: 'pointer' }}>
          <X size={18} />
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
          {id ? 'Edit add-on' : 'New add-on'}
        </h2>
        <p style={{ fontSize: 13, color: '#71717a', margin: '0 0 18px' }}>
          {id ? 'Update an existing pricing component.' : 'Start from a template, or build a custom add-on below.'}
        </p>

        {/* ── Quick templates ── */}
        {!id && (
          <section style={{ marginBottom: 24 }}>
            <h3 style={sectionH}><Sparkles size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />Start from a template</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {TEMPLATES.map(t => (
                <button key={t.id} type="button" onClick={() => applyTemplate(t)}
                        style={templateCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={templateIcon}><t.Icon size={14} /></span>
                    <strong style={{ fontSize: 13, color: '#0f172a' }}>{t.title}</strong>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#52525b' }}>{t.blurb}</p>
                  <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11.5, fontWeight: 700, color: '#ea580c' }}>
                    +${t.fill.amountUsd}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Basic identity fields ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Code" hint="Internal id. lowercase, _ or -">
            <input value={form.code} onChange={e => set('code', e.target.value)} style={inputStyle} placeholder="urgent_move" />
          </Field>
          <Field label="Amount (USD)" hint="Typical add-ons range from +$10 to +$25. Negative for discounts.">
            <input type="number" value={form.amountUsd} onChange={e => set('amountUsd', e.target.value)} style={inputStyle} placeholder="15" />
          </Field>
          <Field label="Label" hint="What operators see in the breakdown" wide>
            <input value={form.label} onChange={e => set('label', e.target.value)} style={inputStyle} placeholder="Urgent move (≤7 days)" />
          </Field>
          <Field label="Order" hint="Lower numbers render first in the breakdown">
            <input type="number" value={form.order} onChange={e => set('order', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Active">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#52525b' }}>
              <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
              {form.active ? 'Active' : 'Disabled'}
            </label>
          </Field>
          <Field label="Notes" hint="Optional context for the team" wide>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} style={inputStyle} placeholder="Internal notes (optional)" />
          </Field>
        </div>

        {/* ── Conditions ── */}
        <h3 style={sectionH}>When does this apply?</h3>
        <p style={{ fontSize: 12, color: '#71717a', margin: '0 0 12px' }}>
          The add-on applies when ALL non-empty conditions match. Leave a condition blank for "no constraint".
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Urgency · within how many days" hint="Urgent moves are typically within 7 days">
            <input type="number" value={form.appliesWhen.daysToMoveLte} onChange={e => setPred('daysToMoveLte', e.target.value)} style={inputStyle} placeholder="7" />
          </Field>
          <Field label="Days to move greater than" hint="Far-out moves — usually 30+">
            <input type="number" value={form.appliesWhen.daysToMoveGt} onChange={e => setPred('daysToMoveGt', e.target.value)} style={inputStyle} placeholder="30" />
          </Field>
          <Field label="Distance · at least how many miles" hint="Long-distance moves usually start around 150 miles">
            <input type="number" value={form.appliesWhen.milesGte} onChange={e => setPred('milesGte', e.target.value)} style={inputStyle} placeholder="150" />
          </Field>
          <Field label="Distance · under how many miles" hint="Local moves are typically under 50 miles">
            <input type="number" value={form.appliesWhen.milesLt} onChange={e => setPred('milesLt', e.target.value)} style={inputStyle} placeholder="50" />
          </Field>
        </div>

        <ChipPicker label="Home sizes" hint="Pick all that should match. Empty = any size."
                    options={homeSizeOptions}
                    selected={form.appliesWhen.homeSizeIn}
                    onToggle={v => toggleArr('homeSizeIn', v)} />

        {/* ── "Verified customer" basic toggle (proxy for phoneVerified flag) ── */}
        <div style={{ marginTop: 14, padding: 14, background: '#f8fafc', border: '1px solid #e4e4e7', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <input type="checkbox" checked={verifiedCustomerOn} onChange={toggleVerifiedCustomer} style={{ marginTop: 2 }} id="vc" />
          <label htmlFor="vc" style={{ cursor: 'pointer' }}>
            <strong style={{ fontSize: 13.5, color: '#0f172a' }}>Customer has a verified phone number</strong>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#52525b', lineHeight: 1.45 }}>
              Twilio Lookup confirmed the number is reachable. Verified contacts close at meaningfully higher rates — typical add-on is +$5–$10.
            </p>
          </label>
        </div>

        {/* ── Advanced rules ── */}
        <button type="button"
                onClick={() => setAdvanced(a => !a)}
                style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, padding: 0, color: '#0f172a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Settings2 size={14} /> {advanced ? 'Hide advanced rules' : 'Advanced rules'}
        </button>

        {advanced && (
          <div style={{ marginTop: 14, padding: 16, background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 10 }}>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#71717a', lineHeight: 1.5 }}>
              These conditions are typically reserved for fine-grained pricing. Skip if "Customer has a verified phone number" above already covers what you need.
            </p>

            <ChipPicker
              label="Lead status (any)"
              hint="Default operators should usually leave this blank — applies to any active lead."
              options={tierOptions}
              renderLabel={v => TIER_LABEL[v] || v}
              renderTooltip={v => TIER_HELP[v]}
              selected={form.appliesWhen.tierIn}
              onToggle={v => toggleArr('tierIn', v)}
            />

            <ChipPicker
              label="Customer verification (ALL must match)"
              hint="Use when you need both phone AND identity matched, for example."
              options={VALIDATION_FLAGS}
              renderLabel={v => FLAG_LABEL[v] || v}
              renderTooltip={v => FLAG_HELP[v]}
              selected={form.appliesWhen.validationFlagsAll}
              onToggle={v => toggleArr('validationFlagsAll', v)}
            />

            <ChipPicker
              label="Heavy items (any)"
              hint="Match leads that flagged specialty items. Empty = no constraint."
              options={HEAVY_ITEM_PRESETS}
              selected={form.appliesWhen.heavyItemsAny}
              onToggle={v => toggleArr('heavyItemsAny', v)}
            />
          </div>
        )}

        {/* ── Live English explanation ── */}
        <div style={{ marginTop: 18, padding: 16, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            <Info size={12} /> This add-on applies when:
          </div>
          {explanationBullets.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13.5, color: '#1e3a8a', lineHeight: 1.5 }}>
              No conditions set — this add-on would apply to <strong>every lead</strong>. Add a condition above to narrow it down.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, color: '#1e3a8a', fontSize: 13.5, lineHeight: 1.6 }}>
              {explanationBullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>

        {/* ── Preview matching rules ── */}
        <h3 style={sectionH}><TestTube2 size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />See when this add-on applies</h3>
        <p style={{ fontSize: 12, color: '#71717a', margin: '0 0 12px' }}>
          Imagine a sample lead. Click <em>Run preview</em> to see whether this add-on would apply to it. Doesn't save anything.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, alignItems: 'end' }}>
          <Field label="Sample miles"><input type="number" value={sample.miles} onChange={e => setSample(s => ({...s, miles: e.target.value}))} style={inputStyle} /></Field>
          <Field label="Days to move"><input type="number" value={sample.daysToMove} onChange={e => setSample(s => ({...s, daysToMove: e.target.value}))} style={inputStyle} /></Field>
          <Field label="Home size">
            <select value={sample.homeSize} onChange={e => setSample(s => ({...s, homeSize: e.target.value}))} style={inputStyle}>
              {HOME_SIZE_BASIC.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Lead status">
            <select value={sample.tier} onChange={e => setSample(s => ({...s, tier: e.target.value}))} style={inputStyle}>
              {TIER_BASIC.map(o => <option key={o} value={o}>{TIER_LABEL[o]}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={runTest} disabled={testing}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #d4d4d8', color: '#0f172a', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: testing ? 'wait' : 'pointer' }}>
            <TestTube2 size={14} /> {testing ? 'Checking…' : 'Run preview'}
          </button>
          {testResult && (
            <span style={{ fontSize: 13, fontWeight: 700, color: testResult.match ? '#16a34a' : '#94a3b8' }}>
              {testResult.match
                ? '✓ This sample WOULD match — add-on would apply.'
                : '✗ This sample would NOT match — add-on skipped.'}
            </span>
          )}
        </div>

        {/* ── Save / Cancel ── */}
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

// ── Subcomponents ────────────────────────────────────────────────────────
function Field({ label, hint, wide, children }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'auto' }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#52525b', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#a1a1aa', lineHeight: 1.4 }}>{hint}</p>}
    </div>
  );
}

function ChipPicker({ label, hint, options, selected, onToggle, renderLabel, renderTooltip }) {
  return (
    <div style={{ marginTop: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#52525b', display: 'block', marginBottom: 4 }}>{label}</label>
      {hint && <p style={{ margin: '0 0 6px', fontSize: 11, color: '#a1a1aa', lineHeight: 1.4 }}>{hint}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => {
          const on   = (selected || []).includes(o);
          const text = renderLabel ? renderLabel(o) : o;
          const tip  = renderTooltip ? renderTooltip(o) : '';
          return (
            <button key={o} type="button" onClick={() => onToggle(o)} title={tip || undefined}
                    style={{
                      padding: '4px 10px', borderRadius: 999,
                      background: on ? '#0f172a' : '#fff',
                      color: on ? '#fff' : '#52525b',
                      border: '1px solid ' + (on ? '#0f172a' : '#d4d4d8'),
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
              {text}
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

// Operator-friendly summary for the table. Uses the same plain-English
// engine as the live explanation box.
function predicateSummary(p = {}) {
  const parts = explainPredicate({
    daysToMoveLte: p.daysToMoveLte,
    daysToMoveGt:  p.daysToMoveGt,
    milesGte:      p.milesGte,
    milesLt:       p.milesLt,
    homeSizeIn:    p.homeSizeIn,
    tierIn:        p.tierIn,
    heavyItemsAny: p.heavyItemsAny,
    validationFlagsAll: p.validationFlagsAll,
  });
  return parts.length ? parts.join(' · ') : 'any lead';
}

function hasAdvancedFields(form) {
  const p = form?.appliesWhen || {};
  return (
    (Array.isArray(p.tierIn) && p.tierIn.length > 0) ||
    (Array.isArray(p.heavyItemsAny) && p.heavyItemsAny.length > 0) ||
    // any validation flag other than the basic-mode "phoneVerified" toggle
    (Array.isArray(p.validationFlagsAll) && p.validationFlagsAll.some(f => f !== 'phoneVerified')) ||
    (Array.isArray(p.homeSizeIn) && p.homeSizeIn.includes('4+ Bedroom'))
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
const th = { padding: '12px 14px', fontSize: 12, fontWeight: 600, color: '#52525b', textTransform: 'uppercase', letterSpacing: 0.4 };
const td = { padding: '12px 14px', verticalAlign: 'middle' };
const iconBtn = { background: 'transparent', border: 0, padding: 6, marginLeft: 4, cursor: 'pointer', color: '#52525b' };
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d4d4d8', fontSize: 13, boxSizing: 'border-box' };
const sectionH = { fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#71717a', letterSpacing: 0.4, margin: '24px 0 10px' };
const inlineCode = { background: '#f4f4f5', padding: '2px 6px', borderRadius: 4, fontSize: 12 };
const primaryActionBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8,
  background: '#0f172a', color: '#fff', border: 0,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const templateCard = {
  background: '#fff', border: '1px solid #e4e4e7', borderRadius: 10,
  padding: 12, textAlign: 'left', cursor: 'pointer',
  transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
};
const templateIcon = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 6, background: '#fff7ed', color: '#ea580c',
};

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
