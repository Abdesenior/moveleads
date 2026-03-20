import React, { useState, useContext } from 'react';
import { Building2, Mail, Hash, Phone, Shield, MapPin, Lock, Key, Save } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';

export default function Profile() {
  const { user, token, API_URL } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    companyName: user?.companyName || '',
    email: user?.email || '',
    dotNumber: user?.dotNumber || '',
    mcNumber: user?.mcNumber || '',
    phone: user?.phone || ''
  });
  const [saving, setSaving] = useState(false);

  const [cpForm, setCpForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [cpSaving, setCpSaving] = useState(false);
  const [cpError, setCpError] = useState('');
  const [cpSuccess, setCpSuccess] = useState('');

  const [serviceAreas, setServiceAreas] = useState(user?.serviceAreas || []);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceMsg, setServiceMsg] = useState('');

  const handleInput = (e) => setFormData({...formData, [e.target.name]: e.target.value});

  const saveProfile = async () => {
    setSaving(true);
    setCpError('');
    setCpSuccess('');
    try {
      const res = await fetch(`${API_URL}/users/${user._id}`, {
        method: 'PUT',
        headers: {
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error('Failed to save profile');
      alert('Profile successfully updated!');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setCpError('');
    setCpSuccess('');

    const { currentPassword, newPassword, confirmPassword } = cpForm;
    if (!currentPassword || !newPassword || !confirmPassword) {
      setCpError('Please fill in all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setCpError('New password and confirm password do not match.');
      return;
    }

    setCpSaving(true);
    try {
      const res = await fetch(`${API_URL}/users/${user._id}/password`, {
        method: 'PUT',
        headers: {
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to update password');

      setCpSuccess('Password updated successfully.');
      setCpForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setCpError(err.message);
    } finally {
      setCpSaving(false);
    }
  };

  const updateServiceAreas = async (nextAreas) => {
    setServiceSaving(true);
    setServiceMsg('');
    try {
      const unique = Array.from(new Set(nextAreas.map((s) => String(s).trim()).filter(Boolean)));
      const res = await fetch(`${API_URL}/users/${user._id}`, {
        method: 'PUT',
        headers: {
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ serviceAreas: unique })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to update service areas');
      setServiceAreas(unique);
      setServiceMsg('Service areas updated.');
    } catch (err) {
      setServiceMsg(err.message || 'Failed to update service areas');
    } finally {
      setServiceSaving(false);
    }
  };

  const initials = user?.companyName
    ? user.companyName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'ML';

  return (
    <DashboardLayout>
      <header className="dashboard-header">
        <h1 style={{ fontFamily: 'Poppins' }}>Company Profile</h1>
        <p>Update your business information and credentials</p>
      </header>

      {/* Profile Header Card */}
      <div style={{
        background: 'linear-gradient(135deg, #0a192f 0%, #112240 100%)',
        borderRadius: 20, padding: '32px 36px', marginBottom: 28,
        display: 'flex', alignItems: 'center', gap: 24,
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(10,25,47,0.2)'
      }}>
        <div style={{ position: 'absolute', top: '-30%', right: '-5%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 24, fontWeight: 800, fontFamily: "'Poppins', sans-serif",
          flexShrink: 0, boxShadow: '0 8px 24px rgba(249,115,22,0.3)'
        }}>{initials}</div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 0 4px', fontFamily: "'Poppins', sans-serif" }}>
            {user?.companyName || 'Your Company'}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>{user?.email || 'your@email.com'}</p>
        </div>
      </div>

      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={18} color="#3b82f6" />
          </div>
          <h3 style={{ margin: 0, padding: 0, border: 'none', fontSize: 18 }}>Company Details</h3>
        </div>
        <div className="form-grid">
          <div>
            <label className="input-label">Company Name</label>
            <input type="text" name="companyName" value={formData.companyName} onChange={handleInput} className="input-field" />
          </div>
          <div>
            <label className="input-label">Email Address</label>
            <input type="email" name="email" value={formData.email} onChange={handleInput} className="input-field" disabled style={{ background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' }} />
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Contact support to change email</span>
          </div>
          <div>
            <label className="input-label">DOT Number</label>
            <input type="text" name="dotNumber" value={formData.dotNumber} onChange={handleInput} className="input-field" />
          </div>
          <div>
            <label className="input-label">MC Number</label>
            <input type="text" name="mcNumber" value={formData.mcNumber} onChange={handleInput} className="input-field" />
          </div>
          <div>
            <label className="input-label">Phone Number</label>
            <input type="tel" name="phone" value={formData.phone} onChange={handleInput} className="input-field" />
          </div>
        </div>
        <div style={{ marginTop: '24px' }}>
          <button className="primary-btn" onClick={saveProfile} disabled={saving} style={{
            display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center'
          }}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Company Details'}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={18} color="#22c55e" />
          </div>
          <h3 style={{ margin: 0, padding: 0, border: 'none', fontSize: 18 }}>Service Areas</h3>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>Define the states where you actively operate to get matched with relevant leads.</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
          {serviceAreas.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No service areas yet. Add a state to start receiving matching leads.</p>
          ) : (
            serviceAreas.map((st) => (
              <span
                key={st}
                style={{
                  display: 'flex', gap: 8, alignItems: 'center',
                  padding: '8px 16px', fontSize: 13,
                  background: '#f0fdf4', color: '#16a34a', borderRadius: 100,
                  fontWeight: 600
                }}
              >
                {st}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => updateServiceAreas(serviceAreas.filter((x) => x !== st))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') updateServiceAreas(serviceAreas.filter((x) => x !== st));
                  }}
                  style={{ cursor: 'pointer', fontSize: '16px', lineHeight: 1, opacity: 0.7 }}
                  aria-label={`Remove ${st}`}
                >
                  ×
                </span>
              </span>
            ))
          )}
          <button
            className="secondary-btn"
            style={{ padding: '6px 16px', fontSize: '13px', borderRadius: '100px' }}
            onClick={() => {
              const next = window.prompt('Enter a state name (e.g. New York):');
              if (!next) return;
              updateServiceAreas([...serviceAreas, next]);
            }}
            disabled={serviceSaving}
            type="button"
          >
            {serviceSaving ? 'Updating...' : '+ Add State'}
          </button>
        </div>
        {serviceMsg && (
          <div style={{ marginTop: 8, padding: 14, borderRadius: 12, background: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: 14 }}>
            ✓ {serviceMsg}
          </div>
        )}
      </div>

      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={18} color="#ef4444" />
          </div>
          <h3 style={{ margin: 0, padding: 0, border: 'none', fontSize: 18 }}>Change Password</h3>
        </div>
        <div className="form-grid">
          <div>
            <label className="input-label">Current Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={cpForm.currentPassword}
              onChange={(e) => setCpForm({ ...cpForm, currentPassword: e.target.value })}
            />
          </div>
          <div style={{ visibility: 'hidden' }}></div>
          <div>
            <label className="input-label">New Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={cpForm.newPassword}
              onChange={(e) => setCpForm({ ...cpForm, newPassword: e.target.value })}
            />
          </div>
          <div>
            <label className="input-label">Confirm New Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={cpForm.confirmPassword}
              onChange={(e) => setCpForm({ ...cpForm, confirmPassword: e.target.value })}
            />
          </div>
        </div>
        {cpError && (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: 14 }}>
            {cpError}
          </div>
        )}
        {cpSuccess && (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: 14 }}>
            ✓ {cpSuccess}
          </div>
        )}
        <div style={{ marginTop: 20 }}>
          <button className="primary-btn" onClick={changePassword} disabled={cpSaving} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center'
          }}>
            <Key size={16} /> {cpSaving ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
