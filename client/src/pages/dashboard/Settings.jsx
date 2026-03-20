import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Filter, Trash2, AlertTriangle, Save } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, token, API_URL, logout } = useContext(AuthContext);
  const [emailNotif, setEmailNotif] = useState(user?.emailNotif ?? true);
  const [smsNotif, setSmsNotif] = useState(user?.smsNotif ?? false);
  const [saving, setSaving] = useState(false);

  const [homeSizePref, setHomeSizePref] = useState(() => {
    const pref = user?.preferredHomeSizes || [];
    if (pref.includes('2 Bedroom')) return '2+ Bedrooms only';
    if (pref.includes('3 Bedroom')) return '3+ Bedrooms only';
    return 'All Sizes';
  });

  const [maxDistancePref, setMaxDistancePref] = useState(() => {
    if (user?.maxDistance === 'Local') return 'Local only (< 50 miles)';
    if (user?.maxDistance === 'Long Distance') return 'Long Distance only (> 100 miles)';
    return 'Any Distance';
  });

  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState('');
  const [dangerDeleting, setDangerDeleting] = useState(false);

  useEffect(() => {
    if (user && API_URL) saveSettings();
    // eslint-disable-next-line
  }, [emailNotif, smsNotif]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch(`${API_URL}/users/${user._id}`, {
        method: 'PUT',
        headers: {
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emailNotif, smsNotif })
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const saveLeadPreferences = async () => {
    setPrefsSaving(true);
    setPrefsMsg('');
    try {
      const preferredHomeSizes =
        homeSizePref === '2+ Bedrooms only'
          ? ['2 Bedroom', '3 Bedroom', '4+ Bedroom']
          : homeSizePref === '3+ Bedrooms only'
            ? ['3 Bedroom', '4+ Bedroom']
            : [];

      const maxDistance =
        maxDistancePref === 'Local only (< 50 miles)'
          ? 'Local'
          : maxDistancePref === 'Long Distance only (> 100 miles)'
            ? 'Long Distance'
            : '';

      const res = await fetch(`${API_URL}/users/${user._id}`, {
        method: 'PUT',
        headers: {
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ preferredHomeSizes, maxDistance })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to save preferences');

      setPrefsMsg('Preferences saved.');
    } catch (err) {
      setPrefsMsg(err.message || 'Failed to save preferences.');
    } finally {
      setPrefsSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm('Permanently delete your MoveLeads account and wipe all corresponding data?')) return;
    setDangerDeleting(true);
    try {
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to delete account');

      logout();
      navigate('/');
    } catch (err) {
      alert(err.message || 'Failed to delete account.');
    } finally {
      setDangerDeleting(false);
    }
  };

  return (
    <DashboardLayout>
      <header className="dashboard-header">
        <h1 style={{ fontFamily: 'Poppins' }}>Account Settings</h1>
        <p>Manage notifications and lead preferences</p>
      </header>

      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={18} color="#3b82f6" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, padding: 0, border: 'none', fontSize: 18 }}>Notification Preferences</h3>
          </div>
          {saving && <span style={{ fontSize: '12px', color: 'var(--text-muted)', background: '#f1f5f9', padding: '4px 10px', borderRadius: 6 }}>Saving...</span>}
        </div>
        
        <div className="toggle-row">
          <div>
            <h4 style={{ color: 'var(--text-dark)', margin: '0 0 4px 0', fontSize: 15, fontWeight: 600 }}>Email Notifications</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Receive an email whenever a new lead matches your service area.</p>
          </div>
          <div className={`toggle-switch ${emailNotif ? 'active' : ''}`} onClick={() => setEmailNotif(!emailNotif)}></div>
        </div>
        <div className="toggle-row">
          <div>
            <h4 style={{ color: 'var(--text-dark)', margin: '0 0 4px 0', fontSize: 15, fontWeight: 600 }}>SMS Notifications</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Get a text message for high-value priority leads.</p>
          </div>
          <div className={`toggle-switch ${smsNotif ? 'active' : ''}`} onClick={() => setSmsNotif(!smsNotif)}></div>
        </div>
      </div>

      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Filter size={18} color="#f97316" />
          </div>
          <h3 style={{ margin: 0, padding: 0, border: 'none', fontSize: 18 }}>Lead Match Preferences</h3>
        </div>
        <div className="form-grid">
          <div>
            <label className="input-label">Preferred Home Sizes</label>
            <select className="input-field" value={homeSizePref} onChange={(e) => setHomeSizePref(e.target.value)}>
              <option>All Sizes</option>
              <option>2+ Bedrooms only</option>
              <option>3+ Bedrooms only</option>
            </select>
          </div>
          <div>
            <label className="input-label">Maximum Distance</label>
            <select className="input-field" value={maxDistancePref} onChange={(e) => setMaxDistancePref(e.target.value)}>
              <option>Any Distance</option>
              <option>Local only (&lt; 50 miles)</option>
              <option>Long Distance only (&gt; 100 miles)</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: '24px' }}>
          <button className="primary-btn" onClick={saveLeadPreferences} disabled={prefsSaving} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center'
          }}>
            <Save size={16} /> {prefsSaving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
        {prefsMsg && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: 14 }}>
            ✓ {prefsMsg}
          </div>
        )}
      </div>

      <div className="settings-section" style={{ borderColor: '#fecaca', background: 'linear-gradient(135deg, #fff1f2 0%, #fef2f2 100%)', border: '1px solid #fecaca' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #fecaca' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={18} color="#ef4444" />
          </div>
          <h3 style={{ margin: 0, padding: 0, border: 'none', fontSize: 18, color: '#ef4444' }}>Danger Zone</h3>
        </div>
        <p style={{ fontSize: '14px', color: '#991b1b', marginBottom: '16px' }}>Permanently delete your MoveLeads account and wipe all corresponding data.</p>
        <button className="primary-btn" style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', width: '100%',
          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(239,68,68,0.25)'
        }} onClick={deleteAccount} disabled={dangerDeleting}>
          <Trash2 size={16} /> {dangerDeleting ? 'Deleting...' : 'Delete Account'}
        </button>
      </div>

    </DashboardLayout>
  );
}
