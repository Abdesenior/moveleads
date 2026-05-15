import React, { useState, useEffect, useContext, useCallback, useMemo, useRef } from 'react';
import { Plus, Sparkles, Trash2, Power, Check, X, Info, RefreshCcw, AlertTriangle, Wand2, Calculator, ChevronDown, ChevronRight } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

/*
 * AdminPricing — Phase 2 of the simplified pricing migration.
 *
 * Flat-table editor on the unified PricingRule collection. Operators edit
 * a single USD amount per rule. No multipliers, no predicates, no
 * templates, no "1.5×" / "stacking" copy.
 *
 * Live charges still come from the legacy multiplier engine until Phase 3
 * cutover — banner at the top makes this explicit.
 */

const CATEGORIES = [
  { key: 'BASE',         label: 'Base price',     blurb: 'Universal base — every lead starts here.' },
  { key: 'DISTANCE',     label: 'Distance',       blurb: 'Local / Long Distance / Cross Country.' },
  { key: 'HOME_SIZE',    label: 'Home size',      blurb: 'Studio through 5+ Bedroom.' },
  { key: 'URGENCY',      label: 'Urgency',        blurb: 'How soon the move date is.' },
  { key: 'VERIFICATION', label: 'Verification',   blurb: 'Phone / identity confidence signals.' },
  { key: 'HEAVY_ITEM',   label: 'Heavy items',    blurb: 'Specialty items the customer flagged.' },
];

const NEW_RULE_DEFAULTS = {
  BASE:         { matchValue: '', amountUsd: 20 },
  DISTANCE:     { matchValue: '', amountUsd: 0 },
  HOME_SIZE:    { matchValue: '', amountUsd: 0 },
  URGENCY:      { matchValue: '', amountUsd: 0 },
  VERIFICATION: { matchValue: '', amountUsd: 0 },
  HEAVY_ITEM:   { matchValue: '', amountUsd: 0 },
};

// Suggested match values for each category — pre-fills the modal datalist
// but admin can type anything. We never enforce these on the server; the
// engine matches by exact string, so typos = silent no-match (operators
// see this instantly in the shadow comparison panel below).
const MATCH_SUGGESTIONS = {
  DISTANCE:     ['Local', 'Long Distance', 'Cross Country'],
  HOME_SIZE:    ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5+ Bedroom'],
  URGENCY:      ['Standard', 'Soon', 'Urgent'],
  VERIFICATION: ['phone_verified', 'mobile_line', 'identity_match'],
  HEAVY_ITEM:   ['piano', 'safe', 'pool_table', 'hot_tub', 'motorcycle'],
};

export default function AdminPricing() {
  const { API_URL, token } = useContext(AuthContext);
  const toast = useToast();

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [compareRows, setCompareRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [audit, setAudit] = useState(null);
  const [normalizing, setNormalizing] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/pricing`, { headers: { 'x-auth-token': token } });
      const json = await res.json();
      if (res.ok) setRules(json);
      else toast.error('Could not load rules');
    } catch (e) { toast.error('Could not load rules'); }
    finally { setLoading(false); }
  }, [API_URL, token, toast]);

  const fetchCompare = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/pricing/shadow-compare?limit=15`, { headers: { 'x-auth-token': token } });
      const json = await res.json();
      if (res.ok) setCompareRows(json.rows || []);
    } catch (e) { console.error('shadow-compare failed', e); }
  }, [API_URL, token]);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/pricing/audit`, { headers: { 'x-auth-token': token } });
      const json = await res.json();
      if (res.ok) setAudit(json);
    } catch (e) { console.error('audit failed', e); }
  }, [API_URL, token]);

  async function normalizeDescriptions() {
    if (!window.confirm('Rewrite legacy multiplier-style descriptions into USD language? Only rows with an USD amount set are touched.')) return;
    setNormalizing(true);
    try {
      const res = await fetch(`${API_URL}/admin/pricing/normalize-descriptions`, {
        method: 'POST', headers: { 'x-auth-token': token },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || 'Normalize failed');
      toast.success(`Rewrote ${json.rewritten.length} description${json.rewritten.length === 1 ? '' : 's'}`);
      fetchRules(); fetchAudit();
    } catch (e) { toast.error(e.message); }
    finally { setNormalizing(false); }
  }

  useEffect(() => { fetchRules(); fetchCompare(); fetchAudit(); }, [fetchRules, fetchCompare, fetchAudit]);

  async function saveAmount(rule, nextAmountUsd) {
    const n = Number(nextAmountUsd);
    if (!Number.isFinite(n)) { toast.error('Enter a number'); return; }
    try {
      const res = await fetch(`${API_URL}/admin/pricing/${rule._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ amountUsd: n }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || 'Save failed');
      toast.success(`${rule.category} · ${rule.matchValue || '—'} → $${n}`);
      setEditingId(null);
      fetchRules(); fetchAudit();
    } catch (e) { toast.error(e.message); }
  }

  async function toggleActive(rule) {
    try {
      const res = await fetch(`${API_URL}/admin/pricing/${rule._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || 'Toggle failed');
      toast.success(`${json.category} · ${json.matchValue || '—'} ${json.isActive ? 'enabled' : 'disabled'}`);
      fetchRules(); fetchAudit();
    } catch (e) { toast.error(e.message); }
  }

  async function remove(rule) {
    if (!window.confirm(`Delete rule "${rule.category} · ${rule.matchValue || '—'}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/admin/pricing/${rule._id}`, {
        method: 'DELETE', headers: { 'x-auth-token': token },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || 'Delete failed');
      toast.success('Rule deleted');
      fetchRules(); fetchAudit();
    } catch (e) { toast.error(e.message); }
  }

  async function create(category, matchValue, amountUsd, description) {
    try {
      const res = await fetch(`${API_URL}/admin/pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ category, matchValue, amountUsd: Number(amountUsd), description }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || 'Create failed');
      toast.success('Rule created');
      setCreating(null);
      fetchRules(); fetchAudit();
    } catch (e) { toast.error(e.message); }
  }

  async function seedDefaults() {
    if (!window.confirm('Seed missing default rules? Existing rules will not be overwritten.')) return;
    try {
      const res = await fetch(`${API_URL}/admin/pricing/seed-defaults`, {
        method: 'POST', headers: { 'x-auth-token': token },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || 'Seed failed');
      toast.success(`Seeded ${json.created.length} rule${json.created.length === 1 ? '' : 's'}`,
                    `${json.skipped.length} already existed`);
      fetchRules(); fetchAudit();
    } catch (e) { toast.error(e.message); }
  }

  const grouped = useMemo(() => {
    const m = new Map(CATEGORIES.map(c => [c.key, []]));
    for (const r of rules) {
      const bucket = m.get(r.category) || [];
      bucket.push(r);
      m.set(r.category, bucket);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => String(a.matchValue || '').localeCompare(String(b.matchValue || '')));
    }
    return m;
  }, [rules]);

  return (
    <AdminLayout>
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>Pricing Rules</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px', lineHeight: 1.5, maxWidth: 760 }}>
          Each rule is a simple USD amount added to the lead's final price. Click any dollar value to edit. Rules within the same category stack additively.
        </p>

        <div style={shadowBanner}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>USD pricing is currently running in shadow.</div>
            <div style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
              Live charges (<code style={inlineCode}>buyNowPrice</code>) still come from the legacy engine until the operator-approved cutover. Edits here are persisted but only affect the shadow column <code style={inlineCode}>priceShadowSimple</code> for now. Use the comparison panel below to verify alignment before cutover.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button onClick={seedDefaults} style={secondaryBtn}>
            <Sparkles size={14} /> Seed missing defaults
          </button>
          <button onClick={() => setComparing(c => !c)} style={secondaryBtn}>
            <RefreshCcw size={14} /> {comparing ? 'Hide' : 'Show'} shadow comparison
          </button>
        </div>

        {audit && (audit.missingAmountUsd.length > 0 || audit.legacyDescriptions.length > 0 || audit.suspiciousMatch.length > 0) && (
          <AuditPanel
            audit={audit}
            onNormalize={normalizeDescriptions}
            normalizing={normalizing}
            onDelete={remove}
          />
        )}

        <SimulatorPanel API_URL={API_URL} token={token} />

        {comparing && <ComparePanel rows={compareRows} onRefresh={fetchCompare} />}

        {loading ? (
          <div style={{ padding: 24, color: '#71717a', textAlign: 'center' }}>Loading…</div>
        ) : CATEGORIES.map(cat => (
          <CategorySection
            key={cat.key}
            category={cat}
            rules={grouped.get(cat.key) || []}
            editingId={editingId}
            editValue={editValue}
            onStartEdit={(r) => { setEditingId(r._id); setEditValue(String(r.amountUsd ?? 0)); }}
            onCancelEdit={() => setEditingId(null)}
            onSetEditValue={setEditValue}
            onSaveAmount={saveAmount}
            onToggleActive={toggleActive}
            onDelete={remove}
            onNew={() => setCreating(cat.key)}
          />
        ))}

        {creating && (
          <CreateModal
            category={creating}
            onClose={() => setCreating(null)}
            onCreate={create}
          />
        )}
      </div>
    </AdminLayout>
  );
}

function CategorySection({ category, rules, editingId, editValue, onStartEdit, onCancelEdit, onSetEditValue, onSaveAmount, onToggleActive, onDelete, onNew }) {
  return (
    <section style={section}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
        <div>
          <h2 style={sectionH}>{category.label}</h2>
          <p style={{ fontSize: 12, color: '#71717a', margin: 0 }}>{category.blurb}</p>
        </div>
        <button onClick={onNew} style={addRowBtn}>
          <Plus size={12} /> Add rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div style={emptyState}>No rules in this category yet. Click <strong>Add rule</strong> or use <strong>Seed missing defaults</strong>.</div>
      ) : (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: '#fafafa', textAlign: 'left' }}>
              <tr>
                <th style={th}>Match</th>
                <th style={{ ...th, width: 160 }}>Amount (USD)</th>
                <th style={{ ...th, width: 80 }}>Active</th>
                <th style={th}>Description</th>
                <th style={{ ...th, width: 60, textAlign: 'right' }}>Delete</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => {
                const isEditing = editingId === rule._id;
                const has = Number.isFinite(rule.amountUsd);
                return (
                  <tr key={rule._id} style={{ borderTop: '1px solid #f4f4f5' }}>
                    <td style={td}>
                      {rule.matchValue
                        ? <code style={matchChip}>{rule.matchValue}</code>
                        : <span style={{ color: '#71717a', fontStyle: 'italic' }}>(singleton)</span>}
                    </td>
                    <td style={td}>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>$</span>
                          <input
                            type="number"
                            value={editValue}
                            onChange={e => onSetEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') onSaveAmount(rule, editValue);
                              if (e.key === 'Escape') onCancelEdit();
                            }}
                            autoFocus
                            style={amountInput}
                          />
                          <button onClick={() => onSaveAmount(rule, editValue)} style={miniBtn('#16a34a')}><Check size={12} /></button>
                          <button onClick={onCancelEdit} style={miniBtn('#71717a')}><X size={12} /></button>
                        </div>
                      ) : (
                        <button onClick={() => onStartEdit(rule)} style={amountButton(has)}>
                          {has ? `$${rule.amountUsd}` : '— set USD —'}
                        </button>
                      )}
                    </td>
                    <td style={td}>
                      <button onClick={() => onToggleActive(rule)} style={activePill(rule.isActive)} title={rule.isActive ? 'Click to disable' : 'Click to enable'}>
                        <Power size={11} /> {rule.isActive ? 'Active' : 'Off'}
                      </button>
                    </td>
                    <td style={{ ...td, color: '#52525b', fontSize: 12.5 }}>{rule.description || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button onClick={() => onDelete(rule)} style={trashBtn} aria-label="Delete rule"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ComparePanel({ rows, onRefresh }) {
  const [expanded, setExpanded] = useState(new Set());
  function toggle(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  if (!rows.length) {
    return (
      <section style={section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={sectionH}>Shadow comparison</h2>
          <button onClick={onRefresh} style={{ ...secondaryBtn, padding: '4px 10px', fontSize: 12 }}><RefreshCcw size={11} /> Refresh</button>
        </div>
        <p style={{ fontSize: 13, color: '#71717a', margin: 0 }}>
          No leads have shadow USD pricing yet. Seed some rules and wait for fresh ingest to populate <code style={inlineCode}>priceShadowSimple</code>.
        </p>
      </section>
    );
  }
  return (
    <section style={section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={sectionH}>Shadow comparison — recent leads</h2>
        <button onClick={onRefresh} style={{ ...secondaryBtn, padding: '4px 10px', fontSize: 12 }}><RefreshCcw size={11} /> Refresh</button>
      </div>
      <p style={{ fontSize: 12, color: '#71717a', margin: '0 0 10px' }}>
        Side-by-side legacy vs USD shadow on the latest leads. Click a row to expand the breakdown. Calibrate rule amounts until Δ trends toward zero.
      </p>
      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#fafafa', textAlign: 'left' }}>
            <tr>
              <th style={{ ...th, width: 28 }} aria-label="Expand" />
              <th style={th}>Route</th>
              <th style={th}>Miles</th>
              <th style={th}>Home</th>
              <th style={th}>Legacy buyNow</th>
              <th style={th}>USD shadow</th>
              <th style={th}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const legacy = Number(r.buyNowPrice) || 0;
              const shadow = Number(r.priceShadowSimple) || 0;
              const delta  = shadow - legacy;
              const deltaColor = delta > 0 ? '#dc2626' : delta < 0 ? '#16a34a' : '#71717a';
              const isOpen = expanded.has(r._id);
              const lines  = Array.isArray(r.pricingBreakdownSimple) ? r.pricingBreakdownSimple : [];
              return (
                <React.Fragment key={r._id}>
                  <tr onClick={() => toggle(r._id)} style={{ borderTop: '1px solid #f4f4f5', cursor: 'pointer' }}>
                    <td style={td}>{isOpen ? <ChevronDown size={14} color="#71717a" /> : <ChevronRight size={14} color="#71717a" />}</td>
                    <td style={td}>{r.originCity} → {r.destinationCity}</td>
                    <td style={td}>{r.miles}</td>
                    <td style={td}>{r.homeSize}</td>
                    <td style={td}>${legacy}</td>
                    <td style={{ ...td, fontWeight: 700 }}>${shadow}</td>
                    <td style={{ ...td, fontWeight: 700, color: deltaColor }}>
                      {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}$${delta}`}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: '#f8fafc' }}>
                      <td />
                      <td colSpan={6} style={{ padding: '10px 14px' }}>
                        {lines.length === 0 ? (
                          <span style={{ fontSize: 12, color: '#71717a' }}>No breakdown captured — lead may pre-date the simple engine.</span>
                        ) : (
                          <BreakdownTable lines={lines} total={shadow} />
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Shared breakdown render — used by both ComparePanel (per-row) and
// SimulatorPanel. Keeps the visual model identical.
function BreakdownTable({ lines, total }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td style={{ padding: '4px 0', color: '#52525b', width: '40%' }}>{labelForCategory(l.category)}</td>
            <td style={{ padding: '4px 0', color: '#52525b', width: '40%' }}>{l.matchValue || '(singleton)'}</td>
            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700, color: (Number(l.amountUsd) || 0) < 0 ? '#16a34a' : '#0f172a' }}>
              {(Number(l.amountUsd) || 0) >= 0 ? `+$${l.amountUsd}` : `-$${Math.abs(l.amountUsd)}`}
            </td>
          </tr>
        ))}
        {total != null && (
          <tr style={{ borderTop: '1px solid #e4e4e7' }}>
            <td style={{ padding: '6px 0 0', fontWeight: 700, color: '#0f172a' }}>Final shadow price</td>
            <td />
            <td style={{ padding: '6px 0 0', textAlign: 'right', fontWeight: 800, color: '#0f172a', fontSize: 14 }}>${total}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function labelForCategory(c) {
  switch (c) {
    case 'BASE':         return 'Base';
    case 'DISTANCE':     return 'Distance';
    case 'HOME_SIZE':    return 'Home size';
    case 'URGENCY':      return 'Urgency';
    case 'VERIFICATION': return 'Verification';
    case 'HEAVY_ITEM':   return 'Heavy item';
    default:             return c || '';
  }
}

// ── Audit panel ──────────────────────────────────────────────────────────
// Surfaces rows that need operator attention: missing USD amount, legacy
// multiplier-style descriptions, and matchValues that look mis-categorized.
function AuditPanel({ audit, onNormalize, normalizing, onDelete }) {
  return (
    <section style={{ ...section, background: '#fff7ed', borderColor: '#fdba74' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <AlertTriangle size={16} color="#c2410c" />
        <h2 style={{ ...sectionH, color: '#9a3412', margin: 0 }}>Rules needing attention</h2>
      </div>
      <p style={{ fontSize: 12.5, color: '#9a3412', margin: '0 0 12px', lineHeight: 1.5 }}>
        These flags exist because the rule set was migrated from the legacy multiplier engine. Resolve them before cutover to keep the breakdown clean.
      </p>

      {audit.legacyDescriptions.length > 0 && (
        <div style={{ marginBottom: 14, padding: 12, background: '#fff', border: '1px solid #fed7aa', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
              {audit.legacyDescriptions.length} description{audit.legacyDescriptions.length === 1 ? '' : 's'} use legacy multiplier language
            </div>
            <button onClick={onNormalize} disabled={normalizing}
                    style={{ ...secondaryBtn, background: '#0f172a', color: '#fff', border: 0, opacity: normalizing ? 0.6 : 1 }}>
              <Wand2 size={13} /> {normalizing ? 'Rewriting…' : 'Rewrite to USD language'}
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: '#71717a', margin: '0 0 8px' }}>
            Examples below. Click <em>Rewrite to USD language</em> to convert all of them based on the current amount.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#52525b', lineHeight: 1.6 }}>
            {audit.legacyDescriptions.slice(0, 5).map(r => (
              <li key={r._id}>
                <code style={inlineCode}>{r.category} · {r.matchValue || '—'}</code>{' '}
                <span style={{ color: '#a1a1aa' }}>{r.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {audit.missingAmountUsd.length > 0 && (
        <div style={{ marginBottom: 14, padding: 12, background: '#fff', border: '1px solid #fed7aa', borderRadius: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 6 }}>
            {audit.missingAmountUsd.length} active rule{audit.missingAmountUsd.length === 1 ? '' : 's'} without a USD amount
          </div>
          <p style={{ fontSize: 11.5, color: '#71717a', margin: '0 0 8px' }}>
            The simple engine ignores rules without an amount. Click the red "— set USD —" button in the category table below to assign a value.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#52525b', lineHeight: 1.6 }}>
            {audit.missingAmountUsd.slice(0, 8).map(r => (
              <li key={r._id}>
                <code style={inlineCode}>{r.category} · {r.matchValue || '—'}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {audit.suspiciousMatch.length > 0 && (
        <div style={{ padding: 12, background: '#fff', border: '1px solid #fed7aa', borderRadius: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 6 }}>
            {audit.suspiciousMatch.length} rule{audit.suspiciousMatch.length === 1 ? '' : 's'} look mis-categorized
          </div>
          <p style={{ fontSize: 11.5, color: '#71717a', margin: '0 0 8px' }}>
            These match values aren't in the canonical set for their category — most commonly a legacy mistake (e.g. an <code style={inlineCode}>HOME_SIZE</code> row with <code style={inlineCode}>Urgent</code>). Review and delete or recreate under the correct category.
          </p>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {audit.suspiciousMatch.map(r => (
              <li key={r._id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0' }}>
                <code style={{ ...inlineCode, background: '#fee2e2', color: '#991b1b' }}>{r.category} · {r.matchValue}</code>
                <span style={{ color: '#71717a' }}>${Number.isFinite(r.amountUsd) ? r.amountUsd : '—'}</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => onDelete(r)} style={{ ...trashBtn, color: '#dc2626' }} aria-label="Delete suspect rule">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ── Simulator panel ──────────────────────────────────────────────────────
// Operator picks lead attributes; the server runs the REAL
// pricingEngineSimple.compute() on a synthetic lead and returns the
// breakdown. Frontend duplicates no pricing logic.
function SimulatorPanel({ API_URL, token }) {
  const [distance, setDistance] = useState('Long Distance');
  const [homeSize, setHomeSize] = useState('2 Bedroom');
  const [urgency, setUrgency]   = useState('Urgent');
  const [flags, setFlags]       = useState(['phone_verified']);
  const [heavyItems, setHeavyItems] = useState(['piano']);
  const [result, setResult]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const debRef = useRef(null);

  // Distance + urgency presets map to miles + daysToMove that exercise the
  // classifier. classifyLead lives server-side; we just pick values that
  // land in the right bucket.
  const milesFor = { 'Local': 50, 'Long Distance': 500, 'Cross Country': 2000 }[distance] || 0;
  const daysFor  = { 'Urgent': 3, 'Soon': 10, 'Standard': 30 }[urgency] || 30;

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/admin/pricing/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
          body: JSON.stringify({ miles: milesFor, daysToMove: daysFor, homeSize, verifications: flags, heavyItems }),
        });
        const json = await res.json();
        if (res.ok) setResult(json);
      } catch (_e) { /* */ }
      finally { setLoading(false); }
    }, 250);
    return () => debRef.current && clearTimeout(debRef.current);
  }, [API_URL, token, milesFor, daysFor, homeSize, flags, heavyItems]);

  function toggleFlag(f) {
    setFlags(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }
  function toggleItem(i) {
    setHeavyItems(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  }

  return (
    <section style={section}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Calculator size={15} />
        <h2 style={sectionH}>Live price simulator</h2>
      </div>
      <p style={{ fontSize: 12, color: '#71717a', margin: '0 0 14px' }}>
        Pick lead attributes — the server runs the real shadow engine and shows the breakdown. Use this to calibrate rule amounts.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Controls */}
        <div>
          <PickerRow label="Distance" options={['Local', 'Long Distance', 'Cross Country']} value={distance} onChange={setDistance} />
          <PickerRow label="Home size" options={['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5+ Bedroom']} value={homeSize} onChange={setHomeSize} />
          <PickerRow label="Urgency" options={['Standard', 'Soon', 'Urgent']} value={urgency} onChange={setUrgency} />
          <div style={{ marginTop: 12 }}>
            <div style={pickerLabel}>Verification flags</div>
            <div style={chipRow}>
              {['phone_verified', 'mobile_line', 'identity_match'].map(f => (
                <button key={f} type="button" onClick={() => toggleFlag(f)} style={chipStyle(flags.includes(f))}>{f}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={pickerLabel}>Heavy items</div>
            <div style={chipRow}>
              {['piano', 'safe', 'pool_table', 'hot_tub'].map(i => (
                <button key={i} type="button" onClick={() => toggleItem(i)} style={chipStyle(heavyItems.includes(i))}>{i}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Result */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            Shadow engine result {loading ? '· computing…' : ''}
          </div>
          {!result ? (
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Pick attributes to see the breakdown.</p>
          ) : result.skipped ? (
            <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>
              Engine reported <code style={inlineCode}>skipped: {result.reason}</code>. Check ENABLE_PRICING_SIMPLE_SHADOW.
            </p>
          ) : (
            <BreakdownTable lines={result.breakdown} total={result.total} />
          )}
          {result?.buckets && (
            <p style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
              Engine classified: distance=<strong>{result.buckets.distance}</strong>, urgency=<strong>{result.buckets.urgency}</strong>, verifications=<strong>{result.buckets.verifications.join(', ') || 'none'}</strong>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function PickerRow({ label, options, value, onChange }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={pickerLabel}>{label}</div>
      <div style={chipRow}>
        {options.map(o => (
          <button key={o} type="button" onClick={() => onChange(o)} style={chipStyle(value === o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function CreateModal({ category, onClose, onCreate }) {
  const defaults = NEW_RULE_DEFAULTS[category] || NEW_RULE_DEFAULTS.HOME_SIZE;
  const [matchValue, setMatchValue]   = useState(defaults.matchValue);
  const [amountUsd, setAmountUsd]     = useState(defaults.amountUsd);
  const [description, setDescription] = useState('');
  const suggestions = MATCH_SUGGESTIONS[category] || [];
  const requiresMatch = category !== 'BASE';

  function submit() {
    if (requiresMatch && !matchValue.trim()) return;
    onCreate(category, matchValue.trim(), amountUsd, description);
  }

  return (
    <div onClick={onClose}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '60px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()}
           style={{ width: 'min(440px, 100%)', background: '#fff', borderRadius: 14, padding: 24, position: 'relative', boxShadow: '0 24px 60px rgba(15,23,42,0.18)' }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', right: 12, top: 12, background: 'transparent', border: 0, cursor: 'pointer' }}><X size={18} /></button>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 14px' }}>New {category.toLowerCase().replace('_', ' ')} rule</h2>

        {requiresMatch && (
          <div style={{ marginBottom: 12 }}>
            <label style={fieldLabel}>Match value</label>
            <input
              value={matchValue}
              onChange={e => setMatchValue(e.target.value)}
              style={input}
              placeholder={suggestions[0] || 'e.g. Local'}
              list={suggestions.length ? `suggestions-${category}` : undefined}
              autoFocus
            />
            {suggestions.length > 0 && (
              <datalist id={`suggestions-${category}`}>
                {suggestions.map(s => <option key={s} value={s} />)}
              </datalist>
            )}
            {suggestions.length > 0 && (
              <p style={hint}>Suggestions: {suggestions.join(', ')}</p>
            )}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={fieldLabel}>Amount (USD)</label>
          <input type="number" value={amountUsd} onChange={e => setAmountUsd(e.target.value)} style={input} placeholder="0" />
          <p style={hint}>Range: -200 to 500. Use negative values for discounts.</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} style={input} placeholder="Internal note" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button onClick={submit} disabled={requiresMatch && !matchValue.trim()} style={primaryBtn(requiresMatch && !matchValue.trim())}>Create rule</button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
const section    = { background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, padding: 16, marginBottom: 14 };
const sectionH   = { fontSize: 15, fontWeight: 700, margin: '0 0 4px', color: '#0f172a' };
const th         = { padding: '10px 12px', fontSize: 11, fontWeight: 600, color: '#52525b', textTransform: 'uppercase', letterSpacing: 0.4 };
const td         = { padding: '10px 12px', verticalAlign: 'middle' };
const tableWrap  = { background: '#fff', borderRadius: 8, border: '1px solid #e4e4e7', overflow: 'hidden' };
const emptyState = { padding: 14, fontSize: 13, color: '#71717a', background: '#fafafa', borderRadius: 8, border: '1px dashed #e4e4e7' };
const inlineCode = { background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontSize: 12 };
const matchChip  = { background: '#f4f4f5', padding: '2px 8px', borderRadius: 6, fontSize: 12.5, color: '#0f172a', fontWeight: 600 };
const trashBtn   = { background: 'transparent', border: 0, color: '#71717a', cursor: 'pointer', padding: 4 };
const fieldLabel = { fontSize: 12, fontWeight: 600, color: '#52525b', display: 'block', marginBottom: 4 };
const input      = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d4d4d8', fontSize: 13, boxSizing: 'border-box' };
const hint       = { fontSize: 11, color: '#a1a1aa', margin: '4px 0 0' };
const amountInput = { width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid #d4d4d8', fontSize: 14, fontWeight: 700 };
const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, background: '#fff', color: '#0f172a', border: '1px solid #d4d4d8', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const shadowBanner = { display: 'flex', alignItems: 'flex-start', gap: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', borderRadius: 10, padding: 14, marginBottom: 16 };
const addRowBtn  = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: '#fff', color: '#0f172a', border: '1px solid #d4d4d8', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const pickerLabel = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 };
const chipRow     = { display: 'flex', flexWrap: 'wrap', gap: 5 };

function chipStyle(active) {
  return {
    padding: '4px 10px', borderRadius: 999,
    background: active ? '#0f172a' : '#fff',
    color:      active ? '#fff'    : '#52525b',
    border:     '1px solid ' + (active ? '#0f172a' : '#d4d4d8'),
    fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
  };
}

function amountButton(has) {
  return {
    background: has ? '#ecfdf5' : '#fef2f2',
    color:      has ? '#047857' : '#991b1b',
    border:     '1px solid ' + (has ? '#a7f3d0' : '#fecaca'),
    padding:    '4px 12px',
    borderRadius: 8,
    fontWeight: 800,
    fontSize: 14,
    cursor: 'pointer',
    minWidth: 80,
    textAlign: 'left',
  };
}
function activePill(active) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 9px', borderRadius: 999,
    background: active ? '#ecfdf5' : '#fef2f2',
    color: active ? '#047857' : '#991b1b',
    border: '1px solid ' + (active ? '#a7f3d0' : '#fecaca'),
    fontSize: 11, fontWeight: 700, cursor: 'pointer',
  };
}
function miniBtn(color) { return { background: 'transparent', border: 0, padding: 4, cursor: 'pointer', color }; }
function primaryBtn(disabled) {
  return {
    padding: '8px 18px', borderRadius: 8,
    background: disabled ? '#cbd5e1' : '#0f172a', color: '#fff', border: 0,
    fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
