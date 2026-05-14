import React, { useContext, useEffect, useState, useCallback } from 'react';
import { DollarSign, Settings, ToggleLeft, Save, ShieldCheck } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';

export default function AdminSettings() {
  const { token, API_URL } = useContext(AuthContext);
  const [standardLeadPrice, setStandardLeadPrice] = useState(10);
  const [exclusiveLeadMultiplier, setExclusiveLeadMultiplier] = useState(2.5);
  const [acceptNewUserSignups, setAcceptNewUserSignups] = useState(true);
  const [automatedStripeRefunds, setAutomatedStripeRefunds] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // V5 Phase 2.5: validation toggles (admin layer on top of env flags).
  // `validationData` shape: { toggles, env, effective }.
  const [validationData, setValidationData] = useState(null);
  const [validationSaving, setValidationSaving] = useState(false);

  const fetchValidationToggles = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/settings/validation-toggles`, {
        headers: { 'x-auth-token': token },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to load validation toggles');
      setValidationData(data);
    } catch (err) {
      console.error('[validation-toggles]', err);
    }
  }, [API_URL, token]);

  const saveValidationToggle = useCallback(async (patch) => {
    setValidationSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/settings/validation-toggles`, {
        method: 'PATCH',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to save toggle');
      await fetchValidationToggles();
    } catch (err) {
      console.error('[validation-toggles patch]', err);
      setMsg(err.message || 'Failed to save toggle');
    } finally {
      setValidationSaving(false);
    }
  }, [API_URL, token, fetchValidationToggles]);

  useEffect(() => { fetchValidationToggles(); }, [fetchValidationToggles]);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/settings`, { headers: { 'x-auth-token': token } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to load settings');
      setStandardLeadPrice(Number(data.standardLeadPrice ?? 10));
      setExclusiveLeadMultiplier(Number(data.exclusiveLeadMultiplier ?? 2.5));
      setAcceptNewUserSignups(Boolean(data.acceptNewUserSignups ?? true));
      setAutomatedStripeRefunds(Boolean(data.automatedStripeRefunds ?? false));
    } catch (err) {
      console.error(err);
      setMsg(err.message || 'Failed to load settings');
    }
  };

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line
  }, [API_URL, token]);

  const saveSettings = async (overrides = {}) => {
    setSaving(true);
    setMsg('');
    try {
      const payload = {
        standardLeadPrice: overrides.standardLeadPrice ?? standardLeadPrice,
        exclusiveLeadMultiplier: overrides.exclusiveLeadMultiplier ?? exclusiveLeadMultiplier,
        acceptNewUserSignups: overrides.acceptNewUserSignups ?? acceptNewUserSignups,
        automatedStripeRefunds: overrides.automatedStripeRefunds ?? automatedStripeRefunds
      };

      const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'PUT',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to save settings');

      await fetchSettings();
      setMsg('Settings saved.');
    } catch (err) {
      setMsg(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <header className="dashboard-header">
        <h1 style={{ fontFamily: 'var(--font-heading)' }}>Platform Settings</h1>
        <p>Global configurations and pricing</p>
      </header>

      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={18} color="#f97316" />
          </div>
          <h3 style={{ margin: 0, padding: 0, border: 'none', fontSize: 18 }}>Pricing Configuration</h3>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>Adjust the global parameters for leads on the marketplace.</p>
        <div className="form-grid">
          <div>
            <label className="input-label">Standard Lead Price ($)</label>
            <input
              type="number"
              className="input-field"
              value={standardLeadPrice}
              onChange={(e) => setStandardLeadPrice(Number(e.target.value))}
            />
            <p style={{ fontSize: '12px', color: 'var(--text-light-muted)', marginTop: '6px' }}>Base price for shared leads.</p>
          </div>
          <div>
            <label className="input-label">Exclusive Lead Multiplier</label>
            <input
              type="number"
              step="0.1"
              className="input-field"
              value={exclusiveLeadMultiplier}
              onChange={(e) => setExclusiveLeadMultiplier(Number(e.target.value))}
            />
            <p style={{ fontSize: '12px', color: 'var(--text-light-muted)', marginTop: '6px' }}>E.g. 2.5x base price.</p>
          </div>
        </div>
        <div style={{ marginTop: '24px' }}>
          <button className="primary-btn" onClick={() => saveSettings()} disabled={saving} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center'
          }}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Pricing Settings'}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ToggleLeft size={18} color="#8b5cf6" />
          </div>
          <h3 style={{ margin: 0, padding: 0, border: 'none', fontSize: 18 }}>Platform Toggles</h3>
        </div>
        <div className="toggle-row">
          <div>
            <h4 style={{ color: 'var(--text-dark)', margin: '0 0 4px 0', fontSize: 15, fontWeight: 600 }}>Accept New User Signups</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Turn off to make the platform invite-only.</p>
          </div>
          <div
            className={`toggle-switch ${acceptNewUserSignups ? 'active' : ''}`}
            onClick={() => {
              const next = !acceptNewUserSignups;
              setAcceptNewUserSignups(next);
              saveSettings({ acceptNewUserSignups: next });
            }}
            role="switch"
            aria-checked={acceptNewUserSignups}
            tabIndex={0}
            style={{ userSelect: 'none' }}
          />
        </div>
        <div className="toggle-row">
          <div>
            <h4 style={{ color: 'var(--text-dark)', margin: '0 0 4px 0', fontSize: 15, fontWeight: 600 }}>Automated Stripe Refunds</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Allow customers to request refunds for returned leads automatically.</p>
          </div>
          <div
            className={`toggle-switch ${automatedStripeRefunds ? 'active' : ''}`}
            onClick={() => {
              const next = !automatedStripeRefunds;
              setAutomatedStripeRefunds(next);
              saveSettings({ automatedStripeRefunds: next });
            }}
            role="switch"
            aria-checked={automatedStripeRefunds}
            tabIndex={0}
            style={{ userSelect: 'none' }}
          />
        </div>
        {msg && (
          <div style={{
            marginTop: 16, padding: 14, borderRadius: 12,
            background: msg === 'Settings saved.' ? '#dcfce7' : '#fee2e2',
            color: msg === 'Settings saved.' ? '#16a34a' : '#dc2626',
            fontWeight: 700, fontSize: 14
          }}>
            {msg === 'Settings saved.' ? '✓ ' : ''}{msg}
          </div>
        )}
      </div>

      {/* ── V5 Validation Toggles (Phase 2.5) ─────────────────────────── */}
      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={18} color="#10b981" />
          </div>
          <h3 style={{ margin: 0, padding: 0, border: 'none', fontSize: 18 }}>V5 Validation Toggles</h3>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: 20 }}>
          Admin kill-switches for external validation providers. Layered <strong>on top of</strong> the env-flag deploy gates (<code>ENABLE_*</code>): a service runs only when both env flag AND admin toggle are ON. Disable here for instant cost control without a redeploy.
        </p>

        <ValidationToggleRow
          label="Mapbox Route Validation"
          description="Geocode origin/destination ZIPs, detect suspicious routes (same-zip, non-US, miles divergence)."
          envEnabled={validationData?.env?.mapboxEnabled}
          envName="ENABLE_MAPBOX_VALIDATION"
          toggleEnabled={validationData?.toggles?.mapboxEnabled}
          effective={validationData?.effective?.mapbox}
          disabled={validationSaving}
          onToggle={() => saveValidationToggle({ mapboxEnabled: !validationData?.toggles?.mapboxEnabled })}
        />

        <ValidationToggleRow
          label="Twilio Lookup (Phone Validation)"
          description="Line Type Intelligence + SMS Pumping Risk per phone. ~$0.01/lead. Cached 30 days."
          envEnabled={validationData?.env?.twilioLookupEnabled}
          envName="ENABLE_TWILIO_LOOKUP"
          toggleEnabled={validationData?.toggles?.twilioLookupEnabled}
          effective={validationData?.effective?.twilioLookup}
          disabled={validationSaving}
          onToggle={() => saveValidationToggle({ twilioLookupEnabled: !validationData?.toggles?.twilioLookupEnabled })}
        />

        <ValidationToggleRow
          label="Twilio Identity Match"
          description="Match first/last name against carrier records. Requires Twilio brand approval. Adds ~$0.04/lead on top of Lookup. Only runs when Lookup is also on."
          envEnabled={validationData?.env?.twilioIdentityMatchEnabled}
          envName="ENABLE_TWILIO_IDENTITY_MATCH"
          toggleEnabled={validationData?.toggles?.twilioIdentityMatchEnabled}
          effective={validationData?.effective?.twilioIdentityMatch}
          disabled={validationSaving || !validationData?.toggles?.twilioLookupEnabled}
          onToggle={() => saveValidationToggle({ twilioIdentityMatchEnabled: !validationData?.toggles?.twilioIdentityMatchEnabled })}
          subordinate
          parentDisabledHint={!validationData?.toggles?.twilioLookupEnabled ? 'Turn on Twilio Lookup first.' : null}
        />
      </div>
    </AdminLayout>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * V5 Phase 2.5 — Validation Toggle Row
 *
 * Renders a single toggle with three pieces of visible state:
 *   - the admin toggle itself (clickable)
 *   - the env flag (read-only, shown as a small chip — "ENV: ON/OFF")
 *   - the EFFECTIVE state (the AND result — what actually runs)
 *
 * If env is OFF, the toggle is still clickable but a hint explains the
 * service won't run until the env var is set. Admin tweaking the toggle
 * pre-deploy is intentional — they can stage the toggle state for a
 * future env flip.
 * ───────────────────────────────────────────────────────────────────────── */
function ValidationToggleRow({
  label, description, envEnabled, envName, toggleEnabled, effective,
  disabled, onToggle, subordinate, parentDisabledHint,
}) {
  const effOn = effective === true;
  return (
    <div className="toggle-row" style={{ alignItems: 'flex-start', paddingLeft: subordinate ? 24 : 0 }}>
      <div style={{ flex: 1, paddingRight: 16 }}>
        <h4 style={{ color: 'var(--text-dark)', margin: '0 0 4px 0', fontSize: 15, fontWeight: 600 }}>{label}</h4>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px 0' }}>{description}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
          <span style={{ padding: '3px 8px', borderRadius: 6, background: envEnabled ? '#dcfce7' : '#fee2e2', color: envEnabled ? '#15803d' : '#dc2626', fontWeight: 700, letterSpacing: 0.3 }}>
            ENV {envEnabled ? 'ON' : 'OFF'}
          </span>
          <code style={{ fontSize: 10, color: '#64748b' }}>{envName}</code>
          <span style={{ padding: '3px 8px', borderRadius: 6, background: effOn ? '#dcfce7' : '#f1f5f9', color: effOn ? '#15803d' : '#64748b', fontWeight: 700, letterSpacing: 0.3 }}>
            EFFECTIVE {effOn ? 'ON' : 'OFF'}
          </span>
          {parentDisabledHint && (
            <span style={{ fontSize: 11, color: '#d97706' }}>↳ {parentDisabledHint}</span>
          )}
          {envEnabled === false && toggleEnabled === true && (
            <span style={{ fontSize: 11, color: '#d97706' }}>↳ Toggle is on but env flag is off — service won't run.</span>
          )}
        </div>
      </div>
      <div
        className={`toggle-switch ${toggleEnabled ? 'active' : ''}`}
        onClick={() => { if (!disabled) onToggle(); }}
        role="switch"
        aria-checked={toggleEnabled || false}
        tabIndex={0}
        style={{
          userSelect: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
        }}
      />
    </div>
  );
}
