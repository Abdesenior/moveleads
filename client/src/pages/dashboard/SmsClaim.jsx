import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, ArrowRight, Loader2, Zap, Phone, DollarSign, MessageSquare } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import VerifyPhoneModal from '../../components/VerifyPhoneModal';
import { AuthContext } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

/*
 * SMS Claim — launch Beta page (2026-05-30).
 *
 * Replaces the prior "Preview / Early Access" surface. SMS Claim has been
 * functioning in production; the previous page lied to movers by claiming
 * "live SMS claiming launches in a future update." It also exposed five
 * preference controls (maxLeadPrice, dailyClaimCap, residentialOnly,
 * commercialOptIn, asapOnly) that the dispatch path does NOT consult —
 * twilioService.js's claim-eligibility partition reads only optInRequested
 * and balance. Showing controls that do nothing is worse than not shipping
 * the controls at all.
 *
 * This page does one thing: explain SMS Claim in five seconds, show the
 * mover whether they are ready to use it, and provide a single on/off
 * toggle that maps to smsClaim.optInRequested.
 *
 * Server schema is unchanged. The preference fields stay in the User
 * model so a future PR can re-expose them once the dispatch path enforces
 * them. The PATCH endpoint still accepts them — we just don't send them
 * from this UI.
 */

export default function SmsClaim() {
  const { API_URL, token } = useContext(AuthContext);
  const toast = useToast();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
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
    } catch (e) {
      toast.error('Could not load SMS Claim state', e.message);
    } finally { setLoading(false); }
  }, [API_URL, token, toast]);

  useEffect(() => { fetchState(); }, [fetchState]);

  async function toggleActivation() {
    if (!data) return;
    const newVal = !data.optInRequested;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/users/me/sms-claim`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ optInRequested: newVal }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || 'Failed');
      setData(json);
      if (newVal) {
        toast.success('SMS Claim is on', 'You’ll receive a claim code when a matching lead comes in.');
      } else {
        toast.info('SMS Claim turned off');
      }
    } catch (e) {
      toast.error('Could not save', e.message);
    } finally { setSaving(false); }
  }

  if (loading || !data) {
    return (
      <DashboardLayout>
        <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 8, color: '#71717a' }}>
          <Loader2 size={16} className="animate-spin" /> Loading SMS Claim…
        </div>
      </DashboardLayout>
    );
  }

  const r = data.readiness;
  // Single "SMS alerts on" row — folds smsNotif + smsOptOut into one
  // mover-facing requirement. STOP-replied mover fails the row even if
  // smsNotif is true.
  const smsAlertsOn = r.smsNotifEnabled && !r.smsOptOut;
  const isOn        = !!data.optInRequested;
  const canActivate = r.phoneVerified && smsAlertsOn && r.balanceMet && r.coverageConfigured;

  return (
    <DashboardLayout>
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 10 }}>
          <span style={betaBadge}>BETA</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.01em', color: '#0f172a' }}>
          Claim leads by text
        </h1>
        <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.55, margin: 0 }}>
          When a lead matches your service area and you have enough balance, we text you
          the lead summary and a claim code.
        </p>

        {/* ── Example SMS ── */}
        <div style={exampleBox}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Example text you’ll receive
          </div>
          <div style={smsBody}>
            MoveLeads: 3BR | Austin, TX → Dallas, TX{'\n'}
            Jun 12, 2026 | $42{'\n'}
            <strong>Reply SEND ABCD to claim it.</strong>
          </div>
        </div>

        {/* ── What happens after you reply ── */}
        <section style={panel}>
          <h2 style={panelH}>What happens after you reply</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            <Bullet icon={<DollarSign size={14} />}>The lead price is deducted from your balance.</Bullet>
            <Bullet icon={<Zap size={14} />}>The lead is added to <strong>My Leads</strong>.</Bullet>
            <Bullet icon={<MessageSquare size={14} />}>You receive the customer’s contact details.</Bullet>
            <Bullet icon={<Phone size={14} />}>You can call the customer right away.</Bullet>
          </ul>
        </section>

        {/* ── Requirements ── */}
        <section style={panel}>
          <h2 style={panelH}>Before you turn it on</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            <ReadyRow
              ok={r.phoneVerified}
              label="Phone verified"
              cta={!r.phoneVerified && (
                <button onClick={() => setVerifyOpen(true)} style={inlineCta}>Verify →</button>
              )}
            />
            <ReadyRow
              ok={smsAlertsOn}
              label="SMS alerts enabled"
              cta={!smsAlertsOn && <Link to="/dashboard/settings" style={inlineLink}>Settings →</Link>}
            />
            <ReadyRow
              ok={r.balanceMet}
              label={`Enough balance (recommended $${fmt(r.recommendedBalance)})`}
              cta={!r.balanceMet && <Link to="/dashboard/billing" style={inlineLink}>Add funds →</Link>}
            />
            <ReadyRow
              ok={r.coverageConfigured}
              label="Service areas set"
              cta={!r.coverageConfigured && <Link to="/dashboard/settings" style={inlineLink}>Settings →</Link>}
            />
          </div>
        </section>

        {/* ── Single action ── */}
        <section style={{ ...panel, background: isOn ? '#ecfdf5' : '#fff', borderColor: isOn ? '#a7f3d0' : '#e4e4e7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: isOn ? '#047857' : '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                {isOn && <CheckCircle2 size={18} />}
                {isOn ? 'SMS Claim is on' : 'SMS Claim is off'}
              </div>
              {!isOn && !canActivate && (
                <div style={{ fontSize: 12.5, color: '#9a3412', marginTop: 4 }}>
                  Complete the checklist above to turn on SMS Claim.
                </div>
              )}
              {isOn && data.optInAt && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Turned on {new Date(data.optInAt).toLocaleDateString()}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleActivation}
              disabled={saving || (!isOn && !canActivate)}
              data-testid="sms-claim-toggle"
              style={toggleBtn(isOn, !isOn && !canActivate, saving)}
            >
              {saving
                ? 'Saving…'
                : isOn ? 'Turn off' : 'Turn on SMS Claim'}
            </button>
          </div>
        </section>

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
            Edit in <Link to="/dashboard/settings" style={inlineLinkSm}>Settings →</Link>
          </p>
        </section>

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14 }}>
      {ok
        ? <CheckCircle2 size={16} color="#16a34a" />
        : <AlertCircle  size={16} color="#d97706" />}
      <span style={{ color: ok ? '#0f172a' : '#92400e' }}>{label}</span>
      <span style={{ flex: 1 }} />
      {cta && <span>{cta}</span>}
    </div>
  );
}

function Bullet({ icon, children }) {
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: '#0f172a', lineHeight: 1.5 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: 999,
        background: '#fff7ed', color: '#ea580c', flexShrink: 0, marginTop: 1,
      }}>
        {icon}
      </span>
      <span>{children}</span>
    </li>
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

// ── Styles ──────────────────────────────────────────────────────────────
const panel    = { background: '#fff', border: '1px solid #e4e4e7', borderRadius: 14, padding: 20, marginTop: 20 };
const panelH   = { fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#52525b', letterSpacing: 0.4, margin: '0 0 14px' };
const betaBadge = {
  display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
  background: '#fff7ed', color: '#9a3412', fontSize: 10.5, fontWeight: 800,
  border: '1px solid #fdba74', letterSpacing: 0.6,
};
const exampleBox = {
  marginTop: 18, padding: 14, borderRadius: 12,
  background: '#0f172a', color: '#fff',
};
const smsBody = {
  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  fontSize: 13, lineHeight: 1.55, color: '#e2e8f0',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};
const inlineCta = {
  fontSize: 12, fontWeight: 700, color: '#fff',
  background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
  border: 'none', padding: '4px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
};
const inlineLink = { fontSize: 12, fontWeight: 700, color: '#ea580c', textDecoration: 'none' };
const inlineLinkSm = { fontSize: 12, fontWeight: 700, color: '#ea580c', textDecoration: 'none' };

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
    fontFamily: 'inherit',
  };
}
