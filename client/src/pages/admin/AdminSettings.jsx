import React, { useContext, useEffect, useState } from 'react';
import { DollarSign, Settings, ToggleLeft, Save } from 'lucide-react';
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
        <h1 style={{ fontFamily: 'Poppins' }}>Platform Settings</h1>
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
    </AdminLayout>
  );
}
