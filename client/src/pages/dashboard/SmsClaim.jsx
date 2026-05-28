import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Zap, BellRing, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import VerifyPhoneModal from '../../components/VerifyPhoneModal';
import { AuthContext } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

/*
 * Instant Jobs / SMS Claim — preview activation surface.
 *
 * IMPORTANT: this page does NOT enable live claim. It writes a preference
 * subdoc on the user (smsClaim.optInRequested + preferences). The server
 * derives status from optInRequested AND current balance vs. the
 * recommended threshold.
 *
 * Normal SMS alerts are a SEPARATE system — controlled by smsNotif in
 * Settings. This page explains the distinction up front.
 */

export default function SmsClaim() {
  const { API_URL, token } = useContext(AuthContext);
  const toast = useToast();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [draft, setDraft]     = useState(null);   // local copy of preferences for the form
  const [verifyOpen, setVerifyOpen] = useState(false);

  const fetchState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/users/me/sms-claim`, {
        headers: { 'x-auth-token': token },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || 'Failed to load');
      setData(json);
      setDraft({ ...json.preferences });
    } catch (e) {
      toast.error('Could not load Instant Jobs state', e.message);
    } finally { setLoading(false); }
  }, [API_URL, token, toast]);

  useEffect(() => { fetchState(); }, [fetchState]);

  async function patch(payload) {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/users/me/sms-claim`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || 'Failed');
      setData(json);
      setDraft({ ...json.preferences });
      return json;
    } catch (e) {
      toast.error('Could not save', e.message);
      throw e;
    } finally { setSaving(false); }
  }

  async function toggleActivation() {
    if (!data) return;
    const newVal = !data.optInRequested;
    try {
      const next = await patch({ optInRequested: newVal });
      if (newVal && next.status === 'preview_enabled') {
        toast.success('Instant Jobs preview activated', 'Live claim launches with the next product update.');
      } else if (newVal && next.status === 'needs_balance') {
        toast.warning('Top up to activate', `Add funds to reach $${next.readiness.recommendedBalance}.`);
      } else {
        toast.info('Instant Jobs interest cleared');
      }
    } catch { /* toast already shown */ }
  }

  async function savePreferences() {
    if (!draft) return;
    try {
      await patch({
        maxLeadPrice:    Number(draft.maxLeadPrice) || 100,
        residentialOnly: !!draft.residentialOnly,
        commercialOptIn: !!draft.commercialOptIn,
        asapOnly:        !!draft.asapOnly,
        dailyClaimCap:   Number(draft.dailyClaimCap) || 0,
      });
      toast.success('Preferences saved');
    } catch { /* */ }
  }

  if (loading || !data) {
    return (
      <DashboardLayout>
        <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 8, color: '#71717a' }}>
          <Loader2 size={16} className="animate-spin" /> Loading Instant Jobs…
        </div>
      </DashboardLayout>
    );
  }

  const r = data.readiness;
  const balanceOk = r.balanceMet;
  const isPreviewEnabled = data.status === 'preview_enabled';
  const isNeedsBalance   = data.status === 'needs_balance';

  return (
    <DashboardLayout>
      <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
        {/* ── Hero ── */}
        <div style={{ marginBottom: 8 }}>
          <span style={badgePreview}>
            <ShieldCheck size={11} /> {data.copy?.badgeText || 'Preview / Early Access'}
          </span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
          Instant Jobs — claim ready-to-book moves by SMS
        </h1>
        <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.55, maxWidth: 700, margin: 0 }}>
          Be first to claim urgent, high-intent moves matching your coverage.
          Reply <code style={code}>SEND</code> + a one-time token from your phone to win the job before competitors.
          Balance is deducted automatically. Full customer details land in your inbox within seconds.
        </p>

        {/* ── Distinction panel ── */}
        <section style={panel}>
          <h2 style={panelH}>How this differs from Normal SMS Alerts</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={subPanel('#f8fafc', '#cbd5e1')}>
              <div style={subPanelTag('#64748b')}><BellRing size={12} /> NORMAL SMS ALERTS</div>
              <p style={subPanelP}>You get a heads-up text when a matching lead is posted. You log into the dashboard to buy it manually. <strong>No balance gate</strong>. No token, no claim race. Toggle in <Link to="/dashboard/settings" style={link}>Settings</Link>.</p>
            </div>
            <div style={subPanel('#fff7ed', '#fdba74')}>
              <div style={subPanelTag('#ea580c')}><Zap size={12} /> INSTANT JOBS (this page)</div>
              <p style={subPanelP}>Premium real-time claim mode. SMS contains a one-time token. <strong>First eligible mover to reply <code style={code}>SEND</code> wins.</strong> Balance is deducted instantly. Requires a <strong>$500 working balance</strong> to activate.</p>
            </div>
          </div>
        </section>

        {/* ── Balance gate banner ── */}
        <section style={balanceOk ? banner('#ecfdf5', '#a7f3d0', '#047857') : banner('#fff7ed', '#fdba74', '#9a3412')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {balanceOk ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {balanceOk
                  ? `Balance ready — $${fmt(r.balance)} available.`
                  : `Top up to $${fmt(r.recommendedBalance)} to activate Instant Jobs.`}
              </div>
              <div style={{ fontSize: 12.5, marginTop: 2 }}>
                {balanceOk
                  ? `You're eligible to activate Instant Jobs preview.`
                  : `Current balance: $${fmt(r.balance)} · need $${fmt(r.recommendedBalance - r.balance)} more.`}
              </div>
            </div>
          </div>
          {!balanceOk && (
            <Link to="/dashboard/billing" style={addFundsBtn}>
              Add Funds <ArrowRight size={14} />
            </Link>
          )}
        </section>

        {/* ── Readiness checklist ── */}
        <section style={panel}>
          <h2 style={panelH}>Readiness</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            <ReadyRow ok={r.balanceMet}              label={`Balance ≥ $${fmt(r.recommendedBalance)}`} cta={!r.balanceMet && <Link to="/dashboard/billing" style={linkSm}>Add Funds →</Link>} />
            <ReadyRow
              ok={r.phoneVerified}
              label="Phone verified"
              cta={!r.phoneVerified && (
                <button onClick={() => setVerifyOpen(true)} style={ctaBtnStyle}>
                  Verify →
                </button>
              )}
            />
            <ReadyRow ok={!r.smsOptOut}              label="SMS not opted out (no STOP keyword)" />
            <ReadyRow ok={r.smsNotifEnabled}         label="SMS alerts channel enabled" cta={!r.smsNotifEnabled && <Link to="/dashboard/settings" style={linkSm}>Settings →</Link>} />
            <ReadyRow ok={r.coverageConfigured}      label="Coverage area set" />
            <ReadyRow ok={r.dispatchHoursConfigured} label="Dispatch hours set" />
            {/* 2026-05-28 — PR-C4: "Move types selected" row dropped. The
                dispatch filter it tracked has been retired (matchesMoveTypes
                is now permissive); surfacing it here would imply it still
                affects readiness when it doesn't. */}
          </div>
        </section>

        {/* ── Activation toggle ── */}
        <section style={{ ...panel, background: isPreviewEnabled ? '#ecfdf5' : '#fff', borderColor: isPreviewEnabled ? '#a7f3d0' : '#e4e4e7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ ...panelH, marginBottom: 4 }}>{data.copy?.activationLabel || 'Activate Instant Jobs (preview)'}</h2>
              <p style={{ fontSize: 13, color: '#52525b', margin: 0, maxWidth: 540, lineHeight: 1.5 }}>
                Preview mode saves your interest and preferences. <strong>Live SMS claiming launches in a future update</strong> — you'll be notified.
              </p>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={statusChip(data.status)}>{statusLabel(data.status)}</span>
                {data.optInAt && (
                  <span style={{ color: '#71717a' }}>opted in {new Date(data.optInAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={toggleActivation}
              disabled={saving || (!balanceOk && !data.optInRequested)}
              title={!balanceOk && !data.optInRequested ? `Add $${fmt(r.recommendedBalance - r.balance)} to your balance to activate.` : ''}
              style={toggleBtn(data.optInRequested, !balanceOk && !data.optInRequested, saving)}
            >
              {saving
                ? 'Saving…'
                : data.optInRequested
                  ? 'Deactivate'
                  : isNeedsBalance
                    ? 'Activate (needs balance)'
                    : 'Activate'}
            </button>
          </div>
        </section>

        {/* ── Preferences ── */}
        {data.optInRequested && (
          <section style={panel}>
            <h2 style={panelH}>Preferences</h2>
            <p style={{ fontSize: 12.5, color: '#71717a', margin: '0 0 16px' }}>
              These shape which Instant Jobs you'd receive once live claiming launches. Coverage and hours come from your onboarding setup.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={prefLabel}>Maximum lead price</label>
                <input type="number" min={10} max={500} value={draft?.maxLeadPrice ?? 100}
                       onChange={e => setDraft(d => ({...d, maxLeadPrice: e.target.value}))}
                       style={inputStyle} />
                <p style={hint}>USD cap per claim. 10–500.</p>
              </div>
              <div>
                <label style={prefLabel}>Daily claim cap</label>
                <input type="number" min={0} max={100} value={draft?.dailyClaimCap ?? 0}
                       onChange={e => setDraft(d => ({...d, dailyClaimCap: e.target.value}))}
                       style={inputStyle} />
                <p style={hint}>0 = unlimited. Capped at 100/day.</p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              <Toggle label="Residential only"        checked={!!draft?.residentialOnly} onChange={v => setDraft(d => ({...d, residentialOnly: v}))} />
              <Toggle label="Allow commercial moves"  checked={!!draft?.commercialOptIn} onChange={v => setDraft(d => ({...d, commercialOptIn: v}))} />
              <Toggle label="ASAP / this week only"   checked={!!draft?.asapOnly}        onChange={v => setDraft(d => ({...d, asapOnly: v}))}        helper="Restricts to urgent moves only" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={savePreferences} disabled={saving} style={primaryBtn}>
                {saving ? 'Saving…' : 'Save preferences'}
              </button>
            </div>
          </section>
        )}

        {/* ── Current alert coverage ──
            2026-05-28 — coverage source-of-truth fix.
            Previously this section read user.onboarding.answers.coverageMode
            / .coverageStates / .primaryMarket / .coverageRadius — legacy
            onboarding-wizard fields that Settings → Service Areas does NOT
            write. A mover who configured pickup=AL in Settings would see
            stale or empty values here even though dispatch matched them
            correctly. Now reads the canonical fields directly:
              pickupStates / deliveryStates / deliversNationwide / maxDistance
            (with dispatch hours unchanged — that's still onboarding.answers,
            but it's the PR-C2 canonical storage location, intentionally). */}
        <section style={panel}>
          <h2 style={panelH}>Current alert coverage</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            <Row label="Pickup states"
                 value={formatStateList(data.coveragePreview.pickupStates)} />
            <Row label="Delivery"
                 value={data.coveragePreview.deliversNationwide
                   ? 'Nationwide'
                   : formatStateList(data.coveragePreview.deliveryStates)} />
            <Row label="Max distance"
                 value={data.coveragePreview.maxDistance || '—'} />
            <Row label="Dispatch hours"
                 value={(data.coveragePreview.dispatchHoursOpen && data.coveragePreview.dispatchHoursClose)
                   ? `${data.coveragePreview.dispatchHoursOpen} – ${data.coveragePreview.dispatchHoursClose}`
                   : '—'} />
          </div>
          {/* 2026-05-28 — PR-D5: link target + label corrected.
            Prior copy said "Manage in the Onboarding wizard →" but linked
            to /dashboard/profile (company identity), not the onboarding
            wizard (which lives in DashboardLayout as a modal). The data
            shown above is editable in Settings, NOT Profile — so the link
            points there and the label matches the destination. */}
          <p style={{ marginTop: 12, fontSize: 12, color: '#71717a' }}>
            Edit in <Link to="/dashboard/settings" style={linkSm}>Settings →</Link>
          </p>
        </section>

        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 28, textAlign: 'center' }}>
          Live SMS claiming launches with the next product update. No contract — disable anytime.
        </p>
      </div>

      <VerifyPhoneModal
        isOpen={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onSuccess={() => { setVerifyOpen(false); fetchState(); }}
      />
    </DashboardLayout>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────
function ReadyRow({ ok, label, cta }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13.5 }}>
      {ok
        ? <CheckCircle2 size={16} color="#16a34a" />
        : <AlertCircle  size={16} color="#d97706" />}
      <span style={{ color: ok ? '#0f172a' : '#92400e' }}>{label}</span>
      <span style={{ flex: 1 }} />
      {cta && <span>{cta}</span>}
    </div>
  );
}

function Toggle({ label, checked, onChange, helper }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: '#0f172a', cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        {helper && <span style={{ fontSize: 11.5, color: '#71717a' }}>{helper}</span>}
      </span>
    </label>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ width: 140, color: '#71717a' }}>{label}</div>
      <div style={{ flex: 1, color: '#0f172a', fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function fmt(n) { const v = Number(n) || 0; return v.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function formatStateList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '—';
  return arr.join(', ');
}
function statusLabel(s) { return s === 'preview_enabled' ? 'Preview enabled' : s === 'needs_balance' ? 'Needs balance' : 'Inactive'; }
function statusChip(s) {
  const base = { display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 };
  if (s === 'preview_enabled') return { ...base, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' };
  if (s === 'needs_balance')   return { ...base, background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74' };
  return                              { ...base, background: '#f4f4f5', color: '#52525b', border: '1px solid #d4d4d8' };
}

// ── Styles ──────────────────────────────────────────────────────────────
const panel    = { background: '#fff', border: '1px solid #e4e4e7', borderRadius: 14, padding: 20, marginTop: 20 };
const panelH   = { fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: '#52525b', letterSpacing: 0.4, margin: '0 0 14px' };
const subPanel = (bg, br) => ({ background: bg, border: `1px solid ${br}`, borderRadius: 10, padding: 14 });
const subPanelTag = (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 });
const subPanelP = { fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 };
const code     = { background: '#0f172a', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 12, fontWeight: 700 };
const link     = { color: '#0f172a', textDecoration: 'underline' };
const linkSm   = { fontSize: 12, fontWeight: 700, color: '#ea580c', textDecoration: 'none' };
const ctaBtnStyle = { fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', border: 'none', padding: '4px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' };
const badgePreview = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, background: '#fff7ed', color: '#9a3412', fontSize: 11, fontWeight: 800, border: '1px solid #fdba74', textTransform: 'uppercase', letterSpacing: 0.4 };
const banner = (bg, br, color) => ({ background: bg, border: `1px solid ${br}`, borderRadius: 14, padding: 16, marginTop: 20, color, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' });
const addFundsBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ea580c', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' };
const prefLabel = { fontSize: 12, fontWeight: 600, color: '#52525b', display: 'block', marginBottom: 4 };
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d4d4d8', fontSize: 13, boxSizing: 'border-box' };
const hint = { margin: '4px 0 0', fontSize: 11, color: '#a1a1aa' };
const primaryBtn = { background: '#0f172a', color: '#fff', border: 0, padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' };

function toggleBtn(on, disabled, saving) {
  return {
    padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700,
    border: 0,
    background: disabled ? '#e4e4e7' : on ? '#fff' : '#ea580c',
    color: disabled ? '#a1a1aa' : on ? '#0f172a' : '#fff',
    boxShadow: disabled ? 'none' : on ? 'inset 0 0 0 1.5px #cbd5e1' : '0 4px 12px rgba(234,88,12,0.25)',
    cursor: disabled || saving ? 'not-allowed' : 'pointer',
    opacity: saving ? 0.7 : 1,
    minWidth: 180,
  };
}
