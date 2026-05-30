import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, AlertCircle, Loader2, DollarSign,
  Briefcase, UserCheck, Phone, MapPin, Bell,
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import VerifyPhoneModal from '../../components/VerifyPhoneModal';
import { AuthContext } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

/*
 * SMS Claim — visual polish pass (2026-05-30).
 *
 * Frontend-only refresh of the launch-Beta page. No backend, no dispatch,
 * no route, no schema changes. Feature behavior is unchanged.
 *
 * What changed visually:
 *   - 2-column hero with an inline SVG phone/notification illustration
 *   - Example SMS rendered as a real-looking message bubble; SEND ABCD is
 *     the focal point (orange + bold + monospace)
 *   - "What happens after you reply" lifted into a sibling card next to
 *     the Example SMS (2-col content row on desktop, stacked on mobile)
 *   - Requirements: 4-column horizontal status-badge strip ("you're ready")
 *   - Active-state card scales to full width with a bigger icon + helper
 *     line + opt-in date; Turn off stays right-aligned
 *   - Current alert coverage shows ONLY Pickup states + Delivery (real
 *     data only). Max distance + Dispatch hours rows removed.
 *   - Empty-state strings replace "—" placeholders so the page never
 *     invents values.
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
  const smsAlertsOn = r.smsNotifEnabled && !r.smsOptOut;
  const isOn        = !!data.optInRequested;
  // 2026-05-30 — Balance is a RECOMMENDATION, not a gate. A mover with
  // $100 balance can still claim a $42 lead (per-claim eligibility in
  // twilioService.js is `balance >= buyNowPrice`, not against the UI
  // recommendation). Gating activation on r.balanceMet meant pilot
  // movers at $100 saw the toggle disabled despite being eligible to
  // claim. The "Enough balance" requirement badge still shows amber +
  // "Add funds →" when under the recommendation — the hint stays, the
  // block goes away.
  const canActivate = r.phoneVerified && smsAlertsOn && r.coverageConfigured;

  return (
    <DashboardLayout>
      <div style={{ padding: '24px clamp(20px, 4vw, 40px) 48px', maxWidth: 1120, margin: '0 auto' }}>

        {/* ── HERO ── 2 columns on desktop, stacked on mobile ────────────── */}
        <section style={heroGrid}>
          <div>
            <span style={betaBadge}>BETA</span>
            <h1 style={heroH1}>Claim leads by text</h1>
            <p style={heroP}>
              When a lead matches your service area and you have enough balance,
              we text you the lead summary and a claim code.
            </p>
          </div>
          <PhoneIllustration />
        </section>

        {/* ── EXAMPLE + BENEFITS ── 2-col content row ────────────────────── */}
        <section style={twoColGrid}>
          <Card>
            <CardLabel>Example text you'll receive</CardLabel>
            <SmsBubble />
          </Card>
          <Card>
            <CardLabel>What happens after you reply</CardLabel>
            <div style={{ display: 'grid', gap: 14, marginTop: 4 }}>
              <Benefit
                icon={<DollarSign size={15} />}
                title="Balance deducted"
                desc="The lead price is deducted from your balance."
              />
              <Benefit
                icon={<Briefcase size={15} />}
                title="Added to My Leads"
                desc="The lead is added to My Leads instantly."
              />
              <Benefit
                icon={<UserCheck size={15} />}
                title="Contact details delivered"
                desc="You receive the customer's contact details."
              />
              <Benefit
                icon={<Phone size={15} />}
                title="Call customer immediately"
                desc="You can call the customer right away."
              />
            </div>
          </Card>
        </section>

        {/* ── REQUIREMENTS ── 4-col horizontal status strip ──────────────── */}
        <h2 style={sectionH}>Before you turn it on</h2>
        <section style={requirementsGrid}>
          <RequirementBadge
            ok={r.phoneVerified}
            label="Phone verified"
            helper={r.phoneVerified ? 'Your phone is verified' : 'Verify now'}
            action={!r.phoneVerified && (
              <button onClick={() => setVerifyOpen(true)} style={badgeAction}>Verify →</button>
            )}
          />
          <RequirementBadge
            ok={smsAlertsOn}
            label="SMS alerts enabled"
            helper={smsAlertsOn ? "You'll receive texts" : 'Enable in Settings'}
            action={!smsAlertsOn && <Link to="/dashboard/settings" style={badgeAction}>Settings →</Link>}
          />
          <RequirementBadge
            ok={r.balanceMet}
            label="Enough balance"
            helper={`Recommended $${fmt(r.recommendedBalance)}+`}
            action={!r.balanceMet && <Link to="/dashboard/billing" style={badgeAction}>Add funds →</Link>}
          />
          <RequirementBadge
            ok={r.coverageConfigured}
            label="Service areas set"
            helper={r.coverageConfigured ? "We'll match by area" : 'Add in Settings'}
            action={!r.coverageConfigured && <Link to="/dashboard/settings" style={badgeAction}>Settings →</Link>}
          />
        </section>

        {/* ── ACTIVE STATE ── Full-width emphasis card ───────────────────── */}
        <section style={isOn ? activeCardOn : activeCardOff}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
            <div style={isOn ? activeIconOn : activeIconOff}>
              {isOn ? <CheckCircle2 size={22} /> : <Bell size={22} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: isOn ? '#047857' : '#0f172a', letterSpacing: '-0.01em' }}>
                {isOn ? 'SMS Claim is on' : 'SMS Claim is off'}
              </div>
              <div style={{ fontSize: 13.5, color: isOn ? '#065f46' : '#64748b', marginTop: 3, lineHeight: 1.4 }}>
                {isOn
                  ? "You're all set! We'll text you matching leads automatically."
                  : (canActivate
                      ? 'Turn it on to start receiving claim codes by text.'
                      : 'Complete the checklist above to turn on SMS Claim.')}
              </div>
              {isOn && data.optInAt && (
                <div style={{ fontSize: 12, color: '#65a30d', marginTop: 4, fontWeight: 600 }}>
                  Turned on {new Date(data.optInAt).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleActivation}
            disabled={saving || (!isOn && !canActivate)}
            data-testid="sms-claim-toggle"
            style={toggleBtn(isOn, !isOn && !canActivate, saving)}
          >
            {saving ? 'Saving…' : isOn ? 'Turn off' : 'Turn on SMS Claim'}
          </button>
        </section>

        {/* ── CURRENT ALERT COVERAGE ──
            2026-05-30 — Visual-polish pass. Reduced from 4 rows (pickup,
            delivery, max distance, dispatch hours) to ONLY 2 (pickup,
            delivery). Max distance + dispatch hours were rendering with
            "—" placeholder when unset, which the operator flagged as
            inventing values. Removed from the UI; backend payload is
            unchanged, the page just doesn't read those keys here.
            ----
            2026-05-28 — Coverage source-of-truth fix.
            Previously this section read user.onboarding.answers.coverageMode
            / .coverageStates / .primaryMarket / .coverageRadius — legacy
            onboarding-wizard fields that Settings → Service Areas does NOT
            write. Now reads the canonical fields directly via coveragePreview:
              pickupStates / deliveryStates / deliversNationwide. */}
        <section>
          <h2 style={sectionH}>Current alert coverage</h2>
          <p style={sectionSubP}>
            SMS opportunities are sent based on your current coverage settings.
          </p>
          <div style={coverageGrid}>
            <CoverageCard
              icon={<MapPin size={15} />}
              label="Pickup states"
              value={renderStateList(data.coveragePreview.pickupStates)}
              empty={emptyStatesIs(data.coveragePreview.pickupStates)}
            />
            <CoverageCard
              icon={<MapPin size={15} />}
              label="Delivery"
              value={
                data.coveragePreview.deliversNationwide
                  ? <span style={statePill('nationwide')}>Nationwide</span>
                  : renderStateList(data.coveragePreview.deliveryStates)
              }
              empty={!data.coveragePreview.deliversNationwide && emptyStatesIs(data.coveragePreview.deliveryStates)}
            />
          </div>
          {/* 2026-05-28 — PR-D5: link target + label corrected.
              Prior copy said "Manage in the Onboarding wizard →" but linked
              to /dashboard/profile (company identity), not the onboarding
              wizard (which lives in DashboardLayout as a modal). The data
              shown above is editable in Settings, NOT Profile — so the link
              points there and the label matches the destination. */}
          <p style={{ marginTop: 14, fontSize: 13, color: '#71717a' }}>
            Edit in <Link to="/dashboard/settings" style={editLink}>Settings →</Link>
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

/* ── Hero illustration ─────────────────────────────────────────────────────
   Inline SVG so no external asset is shipped. Phone outline + chat bubble
   + small notification bell — communicates "text message + alert" without
   leaning on emoji or a stock photo. */
function PhoneIllustration() {
  return (
    <div style={illustrationWrap} aria-hidden="true">
      <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
        {/* Soft background blob */}
        <circle cx="125" cy="80" r="68" fill="url(#smsGlow)" />
        {/* Phone outline */}
        <rect x="98" y="38" width="56" height="100" rx="11"
              fill="#fff" stroke="#0f172a" strokeWidth="2" />
        <rect x="106" y="50" width="40" height="68" rx="3" fill="#0f172a" />
        <circle cx="126" cy="129" r="3" fill="#cbd5e1" />
        {/* Bell on phone screen */}
        <g transform="translate(116 70)">
          <circle cx="10" cy="10" r="10" fill="#ea580c" />
          <path d="M10 5.5a3.5 3.5 0 0 0-3.5 3.5v2.5l-1 1.5h9l-1-1.5V9A3.5 3.5 0 0 0 10 5.5Z"
                fill="#fff" />
          <circle cx="10" cy="15.5" r="1.2" fill="#fff" />
        </g>
        {/* Floating message bubble — top-left */}
        <g transform="translate(28 30)">
          <rect x="0" y="0" width="70" height="36" rx="10"
                fill="#fff" stroke="#fde68a" strokeWidth="1.5" />
          <rect x="8" y="10" width="40" height="3" rx="1.5" fill="#fcd34d" />
          <rect x="8" y="18" width="28" height="3" rx="1.5" fill="#fde68a" />
          <path d="M62 28 L68 36 L58 34 Z" fill="#fff" stroke="#fde68a" strokeWidth="1.5" />
        </g>
        <defs>
          <radialGradient id="smsGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fde68a" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}

/* ── SMS bubble — the focal point of the page ────────────────────────────── */
function SmsBubble() {
  return (
    <div style={smsBubble}>
      <div style={smsLine}>
        <span style={smsMuted}>MoveLeads:</span> 3BR | Austin, TX → Dallas, TX
      </div>
      <div style={smsLine}>
        Jun 12, 2026  |  <strong style={{ color: '#fff' }}>$42</strong>
      </div>
      <div style={smsReplyLine}>
        <span style={smsMuted}>Reply</span>{' '}
        <span style={smsCallout}>SEND ABCD</span>{' '}
        <span style={smsMuted}>to claim it.</span>
      </div>
    </div>
  );
}

/* ── Reusable bits ─────────────────────────────────────────────────────── */
function Card({ children }) {
  return <div style={card}>{children}</div>;
}
function CardLabel({ children }) {
  return <div style={cardLabel}>{children}</div>;
}

function Benefit({ icon, title, desc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={benefitIcon}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{title}</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
      </div>
    </div>
  );
}

function RequirementBadge({ ok, label, helper, action }) {
  return (
    <div style={requirementCard(ok)}>
      <div style={requirementCheck(ok)}>
        {ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: ok ? '#0f172a' : '#92400e', marginTop: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: ok ? '#64748b' : '#9a3412', marginTop: 3, lineHeight: 1.35 }}>
        {helper}
      </div>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

function CoverageCard({ icon, label, value, empty }) {
  return (
    <div style={coverageCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 12, fontWeight: 700, marginBottom: 10, letterSpacing: 0.3, textTransform: 'uppercase' }}>
        {icon}
        <span>{label}</span>
      </div>
      {empty ? (
        <div style={emptyValue}>Not set — add in <Link to="/dashboard/settings" style={editLink}>Settings →</Link></div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{value}</div>
      )}
    </div>
  );
}

function renderStateList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.map(s => (
    <span key={s} style={statePill()}>{s}</span>
  ));
}

function emptyStatesIs(arr) {
  return !Array.isArray(arr) || arr.length === 0;
}

function fmt(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/* ── Styles ───────────────────────────────────────────────────────────── */

const heroGrid = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 200px',
  gap: 24,
  alignItems: 'center',
  marginBottom: 28,
};
const heroH1 = {
  fontSize: 30, fontWeight: 800, letterSpacing: '-0.015em',
  margin: '12px 0 10px', color: '#0f172a', lineHeight: 1.15,
};
const heroP = {
  fontSize: 15.5, color: '#475569', lineHeight: 1.55, margin: 0, maxWidth: 540,
};
const betaBadge = {
  display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
  background: '#fff7ed', color: '#9a3412', fontSize: 10.5, fontWeight: 800,
  border: '1px solid #fdba74', letterSpacing: 0.6,
};
const illustrationWrap = {
  display: 'flex', justifyContent: 'center', alignItems: 'center',
};

const twoColGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 16,
  marginBottom: 28,
};
const card = {
  background: '#fff', border: '1px solid #e4e4e7', borderRadius: 16,
  padding: 22, boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
};
const cardLabel = {
  fontSize: 11.5, fontWeight: 800, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 14,
};

const smsBubble = {
  background: '#0f172a', borderRadius: 14, padding: '18px 18px 20px',
  color: '#cbd5e1', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  fontSize: 13.5, lineHeight: 1.6, position: 'relative',
  boxShadow: '0 8px 20px rgba(15,23,42,0.15)',
};
const smsLine = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const smsReplyLine = {
  marginTop: 14, paddingTop: 14, borderTop: '1px dashed rgba(255,255,255,0.12)',
  fontSize: 14, color: '#e2e8f0',
};
const smsMuted = { color: '#94a3b8' };
const smsCallout = {
  display: 'inline-block', background: '#ea580c', color: '#fff',
  padding: '2px 10px', borderRadius: 6, fontWeight: 800, letterSpacing: 0.6,
  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 14,
};

const benefitIcon = {
  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
  background: '#fff7ed', color: '#ea580c',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const sectionH = {
  fontSize: 14, fontWeight: 800, textTransform: 'uppercase',
  color: '#52525b', letterSpacing: 0.5, margin: '0 0 12px',
};
const sectionSubP = {
  fontSize: 13, color: '#64748b', margin: '-4px 0 14px', lineHeight: 1.5,
};

const requirementsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
  marginBottom: 28,
};
function requirementCard(ok) {
  return {
    background: '#fff',
    border: `1px solid ${ok ? '#dcfce7' : '#fde68a'}`,
    borderRadius: 14, padding: '16px 16px 18px',
    boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
  };
}
function requirementCheck(ok) {
  return {
    width: 32, height: 32, borderRadius: 999,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: ok ? '#dcfce7' : '#fef3c7',
    color: ok ? '#16a34a' : '#d97706',
  };
}
const badgeAction = {
  display: 'inline-block', padding: '4px 10px', borderRadius: 8,
  background: 'linear-gradient(135deg, #ea580c, #c2410c)', color: '#fff',
  fontSize: 12, fontWeight: 700, textDecoration: 'none', border: 'none',
  cursor: 'pointer', fontFamily: 'inherit',
};

const activeCardOn = {
  background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)',
  border: '1px solid #a7f3d0', borderRadius: 16,
  padding: '20px 22px', marginBottom: 28,
  display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
  justifyContent: 'space-between',
  boxShadow: '0 4px 14px rgba(22,163,74,0.10)',
};
const activeCardOff = {
  background: '#fff', border: '1px solid #e4e4e7', borderRadius: 16,
  padding: '20px 22px', marginBottom: 28,
  display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
  justifyContent: 'space-between',
  boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
};
const activeIconOn = {
  width: 44, height: 44, borderRadius: 999, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: '#16a34a', color: '#fff',
  boxShadow: '0 6px 16px rgba(22,163,74,0.30)',
};
const activeIconOff = {
  width: 44, height: 44, borderRadius: 999, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: '#f1f5f9', color: '#64748b',
};

const coverageGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 12,
};
const coverageCard = {
  background: '#fff', border: '1px solid #e4e4e7', borderRadius: 14,
  padding: '14px 16px 16px',
};
function statePill(kind) {
  const isNationwide = kind === 'nationwide';
  return {
    display: 'inline-flex', alignItems: 'center',
    padding: '4px 10px', borderRadius: 999,
    background: isNationwide ? '#dcfce7' : '#f1f5f9',
    color: isNationwide ? '#15803d' : '#0f172a',
    border: `1px solid ${isNationwide ? '#bbf7d0' : '#e2e8f0'}`,
    fontSize: 12.5, fontWeight: 700, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  };
}
const emptyValue = {
  fontSize: 13, color: '#a1a1aa', fontStyle: 'italic',
};
const editLink = {
  color: '#ea580c', fontWeight: 700, textDecoration: 'none',
};

function toggleBtn(on, disabled, saving) {
  return {
    padding: '11px 22px', borderRadius: 10, fontSize: 14, fontWeight: 700,
    border: 0,
    background: disabled ? '#e4e4e7' : on ? '#fff' : '#ea580c',
    color: disabled ? '#a1a1aa' : on ? '#0f172a' : '#fff',
    boxShadow: disabled ? 'none' : on ? 'inset 0 0 0 1.5px #cbd5e1' : '0 4px 12px rgba(234,88,12,0.25)',
    cursor: disabled || saving ? 'not-allowed' : 'pointer',
    opacity: saving ? 0.7 : 1,
    minWidth: 160,
    fontFamily: 'inherit',
    flexShrink: 0,
  };
}
