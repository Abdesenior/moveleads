/**
 * /dev/onboarding-sandbox — super_admin-only test harness for the v2
 * onboarding wizard. Two controls:
 *
 *   1. "Reset & start fresh" — POSTs /api/admin/onboarding/sandbox-reset
 *      which wipes the caller's onboarding state server-side (NOT balance),
 *      then mounts the wizard at Welcome.
 *
 *   2. "Jump to screen" — mounts the wizard at any of the 8 screens
 *      directly via the initialStep prop. Useful for eyeballing one
 *      specific screen without walking through the whole flow.
 *
 * Stripe + Twilio Verify run against the real production endpoints with
 * the existing test-mode keys. Backend API behavior is unchanged — the
 * sandbox just gives a quick way to re-enter the flow.
 *
 * Access — gated by ProtectedRoute requireAdmin (admin OR super_admin
 * can load the page). The reset endpoint enforces super_admin server-
 * side, so a regular admin can still preview the JumpTo screens but
 * cannot wipe state. (Defense in depth.)
 */

import { useContext, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import OnboardingWizard from '../onboarding/OnboardingWizard';
import { useToast } from '../../components/ui/Toast';
// Sandbox-scoped iteration layer. Any CSS in this file only matches
// when the wizard mounts inside .ow-sandbox-mode (the wrapper below),
// so we can preview design tweaks here before promoting them to the
// production Onboarding.css. Tweaks that look good in sandbox get
// ported over by removing the .ow-sandbox-mode prefix from the rule.
import './OnboardingSandbox.css';

const SCREENS = [
  { id: 1, label: 'Welcome' },
  { id: 2, label: 'Location' },
  { id: 3, label: 'Delivery' },
  { id: 4, label: 'Contact' },
  { id: 5, label: 'SMS Claim' },
  { id: 6, label: 'Almost Ready' },
  { id: 7, label: 'Activate' },
  { id: 8, label: 'Success' },
];

function StateRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
      <span style={{ minWidth: 220, color: '#64748b', fontSize: 13 }}>{label}</span>
      <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 13, color: '#0f172a', wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  );
}

export default function OnboardingSandbox() {
  const { user, API_URL, refreshUser } = useContext(AuthContext);
  const toast = useToast();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [initialStep, setInitialStep] = useState(null);
  const [resetting, setResetting] = useState(false);

  const ob = user?.onboarding || {};

  async function resetAndStart() {
    if (resetting) return;
    setResetting(true);
    try {
      const res = await fetch(`${API_URL}/admin/onboarding/sandbox-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': localStorage.getItem('token') || '',
        },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast?.error?.(data?.msg || `status ${res.status}`, 'Reset failed');
        return;
      }
      if (refreshUser) await refreshUser();
      toast?.success?.('Mounting wizard at Welcome…', 'Onboarding state wiped');
      setInitialStep(1);
      setWizardOpen(true);
    } catch (err) {
      toast?.error?.(err?.message || 'network error', 'Reset threw');
    } finally {
      setResetting(false);
    }
  }

  function jumpTo(screenId) {
    setInitialStep(screenId);
    setWizardOpen(true);
  }

  function closeWizard() {
    setWizardOpen(false);
    setInitialStep(null);
    if (refreshUser) refreshUser().catch(() => {});
  }

  return (
    <div style={{ maxWidth: 920, margin: '40px auto', padding: '0 24px', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#0f172a' }}>
        Onboarding Sandbox
      </h1>
      <p style={{ marginTop: 8, fontSize: 14, color: '#64748b', lineHeight: 1.55 }}>
        Test the v2 onboarding wizard end-to-end without registering a new
        account. Reset clears your onboarding state server-side (balance is
        preserved). Jump-to mounts the wizard at any of the 8 screens directly.
      </p>

      {/* Controls */}
      <div style={{ marginTop: 24, padding: 18, border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={resetAndStart}
            disabled={resetting}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderRadius: 10,
              background: resetting ? '#cbd5e1' : 'linear-gradient(180deg, #ff6a14, #cf4b00)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: resetting ? 'not-allowed' : 'pointer',
              boxShadow: resetting ? 'none' : '0 8px 18px rgba(255,106,20,0.28)',
            }}
          >
            {resetting ? 'Resetting…' : 'Reset & start fresh'}
          </button>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            Wipes onboarding state, phone-verified, sms-claim opt-in, coverage. Keeps balance.
          </span>
        </div>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 10 }}>
            Jump to screen
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SCREENS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpTo(s.id)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 999,
                  background: '#fff',
                  color: '#0f172a',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {s.id}. {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Current onboarding state — quick snapshot of what the wizard will read */}
      <div style={{ marginTop: 24, padding: 18, border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Current state</h2>
          <button
            type="button"
            onClick={() => refreshUser && refreshUser()}
            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <StateRow label="user.role"                                value={user?.role || '—'} />
          <StateRow label="user.balance"                             value={`$${user?.balance ?? 0}`} />
          <StateRow label="user.phoneVerified"                       value={String(!!user?.phoneVerified)} />
          <StateRow label="user.phone"                               value={user?.phone || '—'} />
          <StateRow label="onboarding.complete"                      value={String(!!ob.complete)} />
          <StateRow label="onboarding.currentStep"                   value={ob.currentStep ?? 0} />
          <StateRow label="onboarding.activatedAt"                   value={ob.activatedAt || '—'} />
          <StateRow label="onboarding.bonusClaimedAt"                value={ob.bonusClaimedAt || '—'} />
          <StateRow label="onboarding.activationOfferDismissedAt"    value={ob.activationOfferDismissedAt || '—'} />
          <StateRow label="onboarding.answers.dispatchBase"          value={JSON.stringify(ob.answers?.dispatchBase || null)} />
          <StateRow label="onboarding.answers.pickup"                value={JSON.stringify(ob.answers?.pickup || null)} />
          <StateRow label="onboarding.answers.delivery"              value={JSON.stringify(ob.answers?.delivery || null)} />
          <StateRow label="user.pickupStates"                        value={JSON.stringify(user?.pickupStates || [])} />
          <StateRow label="user.deliveryStates"                      value={JSON.stringify(user?.deliveryStates || [])} />
          <StateRow label="user.deliversNationwide"                  value={String(!!user?.deliversNationwide)} />
          <StateRow label="smsClaim.optInRequested"                  value={String(!!user?.smsClaim?.optInRequested)} />
        </div>
      </div>

      <p style={{ marginTop: 22, fontSize: 12, color: '#94a3b8', lineHeight: 1.55 }}>
        Stripe runs against the real <code>VITE_STRIPE_PUBLISHABLE_KEY</code> (test mode if dev env).
        Twilio Verify sends a real SMS to your phone. All backend endpoints are
        the same as production.
      </p>

      {wizardOpen && (
        <div className="ow-sandbox-mode">
          <OnboardingWizard onClose={closeWizard} initialStep={initialStep} />
        </div>
      )}
    </div>
  );
}
