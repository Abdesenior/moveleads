import { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MapPin, AlertTriangle, Save, Trash2, Filter, X, Plus, Star, ExternalLink } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';

/* ── iOS-style toggle switch ── */
function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
        background: on ? 'linear-gradient(135deg,#22c55e,#16a34a)' : '#cbd5e1',
        position: 'relative', transition: 'background 0.3s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: on ? '0 2px 8px rgba(22,197,94,0.35)' : 'none',
        flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 26 : 2,
        width: 24, height: 24, borderRadius: '50%',
        background: '#fff', transition: 'left 0.3s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      }} />
    </button>
  );
}

/* ── ZIP/tag input row ── */
function ZipTagInput({ tags, onAdd, onRemove }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  const add = () => {
    const z = input.trim();
    if (!z || tags.includes(z)) { setInput(''); return; }
    onAdd(z);
    setInput('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    if (e.key === 'Backspace' && !input && tags.length) { onRemove(tags[tags.length - 1]); }
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
        padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0',
        background: '#fafbfc', minHeight: 46, cursor: 'text',
        transition: 'border-color 0.2s',
      }}
      onFocusCapture={e => (e.currentTarget.style.borderColor = '#ea580c')}
      onBlurCapture={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
    >
      {tags.map(tag => (
        <span key={tag} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa',
          borderRadius: 9999, padding: '3px 10px 3px 12px',
          fontSize: 12, fontWeight: 700,
        }}>
          {tag}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onRemove(tag); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fb923c', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        placeholder={tags.length === 0 ? 'Type a ZIP code and press Enter…' : ''}
        style={{
          border: 'none', outline: 'none', background: 'transparent',
          fontSize: 13, color: '#0f172a', minWidth: 140, flex: 1,
          fontFamily: 'inherit',
        }}
      />
      {input && (
        <button type="button" onClick={add} style={{
          background: '#ea580c', border: 'none', borderRadius: 9999, padding: '3px 10px',
          fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Plus size={11} /> Add
        </button>
      )}
    </div>
  );
}

const TABS = [
  { id: 'notifications', label: 'Notifications',   icon: Bell },
  { id: 'coverage',      label: 'Coverage Areas',  icon: MapPin },
  { id: 'preferences',   label: 'Lead Preferences', icon: Filter },
  { id: 'profile',       label: 'Profile',          icon: Star },
  { id: 'danger',        label: 'Danger Zone',      icon: AlertTriangle },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, token, API_URL, logout, refreshUser } = useContext(AuthContext);

  const [activeTab, setActiveTab] = useState('notifications');

  /* Notifications */
  const [emailNotif, setEmailNotif] = useState(user?.emailNotif ?? true);
  const [smsNotif, setSmsNotif]     = useState(user?.smsNotif ?? false);
  const [saving, setSaving]         = useState(false);

  /* Coverage Areas (ZIPs) */
  const [coverageZips, setCoverageZips] = useState(user?.serviceAreas || []);
  const [coverageSaving, setCoverageSaving] = useState(false);
  const [coverageMsg, setCoverageMsg] = useState('');

  /* Lead Preferences */
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
  const [receiveLiveTransfers, setReceiveLiveTransfers] = useState(user?.receiveLiveTransfers ?? false);
  const [liveTransferMsg, setLiveTransferMsg] = useState('');
  const [prefsSaving, setPrefsSaving]   = useState(false);
  const [prefsMsg, setPrefsMsg]         = useState('');

  /* Profile */
  const [googleReviewLink, setGoogleReviewLink] = useState(user?.googleReviewLink || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg]       = useState('');

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const res = await fetch(`${API_URL}/users/${user._id}`, {
        method: 'PUT',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleReviewLink: googleReviewLink.trim() }),
      });
      if (!res.ok) throw new Error('Failed to save');
      await refreshUser();
      setProfileMsg('Profile saved.');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch (err) {
      setProfileMsg(err.message || 'Failed to save.');
    } finally {
      setProfileSaving(false);
    }
  };

  /* Auto-save live transfer toggle on change */
  const handleLiveTransferToggle = async (val) => {
    setReceiveLiveTransfers(val);
    try {
      const res = await fetch(`${API_URL}/users/${user._id}`, {
        method: 'PUT',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiveLiveTransfers: val }),
      });
      if (!res.ok) throw new Error();
      await refreshUser();
      setLiveTransferMsg('Live transfer preference saved');
      setTimeout(() => setLiveTransferMsg(''), 3000);
    } catch {
      setLiveTransferMsg('Failed to save — try again');
      setTimeout(() => setLiveTransferMsg(''), 3000);
    }
  };

  /* Danger */
  const [dangerDeleting, setDangerDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');

  /* Sync local state from DB whenever user object changes (page load / refresh) */
  const didInit = useRef(false);
  useEffect(() => {
    if (!user) return;
    setEmailNotif(user.emailNotif ?? true);
    setSmsNotif(user.smsNotif ?? false);
    setReceiveLiveTransfers(user.receiveLiveTransfers ?? false);
    didInit.current = true;
  }, [user?._id]); // eslint-disable-line

  /* Auto-save notifications — skips the initial sync fire */
  useEffect(() => {
    if (!didInit.current || !user || !API_URL) return;
    setSaving(true);
    fetch(`${API_URL}/users/${user._id}`, {
      method: 'PUT',
      headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailNotif, smsNotif, receiveLiveTransfers }),
    })
      .then(() => refreshUser())
      .catch(() => {})
      .finally(() => setSaving(false));
  }, [emailNotif, smsNotif, receiveLiveTransfers]); // eslint-disable-line

  const saveCoverageZips = async (nextZips) => {
    setCoverageSaving(true);
    setCoverageMsg('');
    try {
      const res = await fetch(`${API_URL}/users/${user._id}`, {
        method: 'PUT',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceAreas: nextZips }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setCoverageMsg('Coverage areas saved.');
      setTimeout(() => setCoverageMsg(''), 3000);
    } catch (err) {
      setCoverageMsg(err.message || 'Failed to save.');
    } finally {
      setCoverageSaving(false);
    }
  };

  const addZip = (zip) => {
    const next = [...coverageZips, zip];
    setCoverageZips(next);
    saveCoverageZips(next);
  };

  const removeZip = (zip) => {
    const next = coverageZips.filter(z => z !== zip);
    setCoverageZips(next);
    saveCoverageZips(next);
  };

  const saveLeadPreferences = async () => {
    setPrefsSaving(true);
    setPrefsMsg('');
    try {
      const preferredHomeSizes =
        homeSizePref === '2+ Bedrooms only' ? ['2 Bedroom', '3 Bedroom', '4+ Bedroom'] :
        homeSizePref === '3+ Bedrooms only' ? ['3 Bedroom', '4+ Bedroom'] : [];

      const maxDistance =
        maxDistancePref === 'Local only (< 50 miles)' ? 'Local' :
        maxDistancePref === 'Long Distance only (> 100 miles)' ? 'Long Distance' : '';

      const res = await fetch(`${API_URL}/users/${user._id}`, {
        method: 'PUT',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredHomeSizes, maxDistance, receiveLiveTransfers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to save preferences');
      setPrefsMsg('Preferences saved.');
      setTimeout(() => setPrefsMsg(''), 3000);
    } catch (err) {
      setPrefsMsg(err.message || 'Failed to save preferences.');
    } finally {
      setPrefsSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm');
      return;
    }
    setDangerDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to delete account');
      logout();
      navigate('/');
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account.');
      setDangerDeleting(false);
    }
  };

  return (
    <DashboardLayout>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins',sans-serif" }}>
          Account Settings
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Manage notifications, coverage areas, and preferences</p>
      </div>

      {/* Two-column layout: vertical tabs + content */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Left: vertical tab menu ── */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          {TABS.map(({ id, label, icon: Icon }, i) => {
            const active = activeTab === id;
            const isDanger = id === 'danger';
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '13px 16px',
                  background: active ? (isDanger ? '#fef2f2' : '#fff7ed') : '#fff',
                  color: active ? (isDanger ? '#dc2626' : '#ea580c') : (isDanger ? '#ef4444' : '#64748b'),
                  fontWeight: active ? 700 : 500, fontSize: 13,
                  fontFamily: 'inherit',
                  borderLeft: active ? `3px solid ${isDanger ? '#ef4444' : '#ea580c'}` : '3px solid transparent',
                  borderBottom: i < TABS.length - 1 ? '1px solid #f1f5f9' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Right: tab content ── */}
        <div>

          {/* ── Notifications tab ── */}
          {activeTab === 'notifications' && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bell size={16} color="#3b82f6" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Notification Preferences</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Control how and when you're alerted</div>
                  </div>
                </div>
                {saving && <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '3px 10px', borderRadius: 6 }}>Saving…</span>}
              </div>

              {[
                {
                  label: 'Email Notifications',
                  desc: 'Receive an email whenever a new lead matches your service area.',
                  value: emailNotif, onChange: setEmailNotif,
                },
                {
                  label: 'SMS Notifications',
                  desc: 'Get a text message for high-value priority leads.',
                  value: smsNotif, onChange: setSmsNotif,
                },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #f1f5f9', gap: 20 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', marginBottom: 2 }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{row.desc}</div>
                  </div>
                  <Toggle on={row.value} onChange={row.onChange} />
                </div>
              ))}

              {/* Live Phone Transfers — third toggle row */}
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Live Phone Transfers</span>
                      <span style={{ fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 20 }}>$40/lead</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                      When a premium lead requests a quote, our system will call your phone directly. Press 1 to accept and instantly connect with the customer.
                    </div>
                  </div>
                  <Toggle on={receiveLiveTransfers} onChange={setReceiveLiveTransfers} />
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 12px' }}>
                  ⚠️ You will be charged $40 per accepted call. Ensure your balance stays above $50.
                </div>
                {liveTransferMsg && (
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: liveTransferMsg.startsWith('Failed') ? '#dc2626' : '#16a34a' }}>
                    ✓ {liveTransferMsg}
                  </div>
                )}
              </div>

              <div style={{ padding: '16px 24px' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                  Changes are saved automatically when you toggle.
                </p>
              </div>
            </div>
          )}

          {/* ── Coverage Areas tab ── */}
          {activeTab === 'coverage' && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MapPin size={16} color="#22c55e" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Coverage ZIP Codes</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Leads from these areas will be matched to you first</div>
                </div>
              </div>

              <div style={{ padding: '24px' }}>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, marginTop: 0 }}>
                  Type a ZIP code and press <kbd style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '1px 6px', fontSize: 11, fontFamily: 'monospace' }}>Enter</kbd> to add it. Click the × on any tag to remove it.
                </p>

                <ZipTagInput tags={coverageZips} onAdd={addZip} onRemove={removeZip} />

                {coverageZips.length === 0 && (
                  <p style={{ margin: '12px 0 0', fontSize: 12, color: '#94a3b8' }}>
                    No coverage ZIPs added yet. Add your first ZIP code above.
                  </p>
                )}

                {coverageMsg && (
                  <div style={{
                    marginTop: 14, padding: '10px 14px', borderRadius: 10,
                    background: coverageMsg.includes('Failed') ? '#fee2e2' : '#dcfce7',
                    color: coverageMsg.includes('Failed') ? '#dc2626' : '#16a34a',
                    fontSize: 13, fontWeight: 700,
                  }}>
                    {coverageMsg.includes('Failed') ? '✕' : '✓'} {coverageMsg}
                  </div>
                )}

                {coverageSaving && (
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: '#94a3b8' }}>Saving…</p>
                )}
              </div>
            </div>
          )}

          {/* ── Lead Preferences tab ── */}
          {activeTab === 'preferences' && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Filter size={16} color="#f97316" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Lead Match Preferences</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Fine-tune which leads are shown to you</div>
                </div>
              </div>

              <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    Preferred Home Sizes
                  </label>
                  <select
                    value={homeSizePref}
                    onChange={e => setHomeSizePref(e.target.value)}
                    className="input-field"
                    style={{ width: '100%' }}
                  >
                    <option>All Sizes</option>
                    <option>2+ Bedrooms only</option>
                    <option>3+ Bedrooms only</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    Maximum Distance
                  </label>
                  <select
                    value={maxDistancePref}
                    onChange={e => setMaxDistancePref(e.target.value)}
                    className="input-field"
                    style={{ width: '100%' }}
                  >
                    <option>Any Distance</option>
                    <option>Local only (&lt; 50 miles)</option>
                    <option>Long Distance only (&gt; 100 miles)</option>
                  </select>
                </div>
              </div>

              {/* Live Transfer Toggle Section */}
              <div style={{ padding: '0 24px 20px' }}>
                <div style={{ 
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                  padding: '16px 20px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' 
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 2 }}>
                      Receive Live Phone Transfers ($40/lead)
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                      When a premium lead requests a quote, our system will call your phone directly. 
                      Press 1 to accept the lead and instantly connect with the customer. Normal balance requirements apply.
                    </div>
                  </div>
                  <Toggle on={receiveLiveTransfers} onChange={handleLiveTransferToggle} />
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                  ⚠️ You will be charged $40 per accepted call. Ensure your balance stays above $50.
                </div>
                {liveTransferMsg && (
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: liveTransferMsg.startsWith('Failed') ? '#dc2626' : '#16a34a' }}>
                    ✓ {liveTransferMsg}
                  </div>
                )}
              </div>

              <div style={{ padding: '0 24px 24px' }}>
                <button
                  type="button"
                  onClick={saveLeadPreferences}
                  disabled={prefsSaving}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '11px 24px', borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Poppins',sans-serif",
                    boxShadow: '0 4px 12px rgba(245,158,11,0.25)',
                    opacity: prefsSaving ? 0.6 : 1,
                  }}
                >
                  <Save size={14} /> {prefsSaving ? 'Saving…' : 'Save Preferences'}
                </button>
                {prefsMsg && (
                  <span style={{ marginLeft: 14, fontSize: 13, fontWeight: 700, color: '#16a34a' }}>✓ {prefsMsg}</span>
                )}
              </div>
            </div>
          )}

          {/* ── Profile tab ── */}
          {activeTab === 'profile' && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#fefce8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Star size={16} color="#ca8a04" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Profile</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Public-facing details used in customer emails</div>
                </div>
              </div>

              <div style={{ padding: '24px' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Google Review Link
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="url"
                    value={googleReviewLink}
                    onChange={e => setGoogleReviewLink(e.target.value)}
                    placeholder="https://g.page/r/your-business/review"
                    className="input-field"
                    style={{ width: '100%', paddingRight: googleReviewLink ? 44 : 16, boxSizing: 'border-box' }}
                  />
                  {googleReviewLink && (
                    <a
                      href={googleReviewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Preview link"
                      style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', display: 'flex' }}
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}
                </div>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, marginBottom: 24 }}>
                  This link is included in automated post-move emails asking customers to leave a review. Find yours at <strong>Google Business Profile → Ask for reviews</strong>.
                </p>

                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={profileSaving}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '11px 24px', borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Poppins',sans-serif",
                    boxShadow: '0 4px 12px rgba(245,158,11,0.25)',
                    opacity: profileSaving ? 0.6 : 1,
                  }}
                >
                  <Save size={14} /> {profileSaving ? 'Saving…' : 'Save Profile'}
                </button>
                {profileMsg && (
                  <span style={{ marginLeft: 14, fontSize: 13, fontWeight: 700, color: profileMsg.startsWith('Failed') ? '#dc2626' : '#16a34a' }}>
                    ✓ {profileMsg}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Danger Zone tab ── */}
          {activeTab === 'danger' && (
            <div style={{ background: 'linear-gradient(135deg,#fff1f2,#fef2f2)', borderRadius: 16, border: '1px solid #fecaca', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={16} color="#ef4444" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#ef4444' }}>Danger Zone</div>
                  <div style={{ fontSize: 12, color: '#f87171' }}>These actions are permanent and cannot be undone</div>
                </div>
              </div>
              <div style={{ padding: '24px' }}>
                <p style={{ fontSize: 14, color: '#991b1b', marginBottom: 20, marginTop: 0, lineHeight: 1.6 }}>
                  Permanently delete your MoveLeads account and wipe all corresponding data including leads, transactions, and customer records.
                </p>
                <button
                  type="button"
                  onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(''); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '11px 24px', borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg,#ef4444,#dc2626)',
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Poppins',sans-serif",
                    boxShadow: '0 4px 12px rgba(239,68,68,0.25)',
                  }}
                >
                  <Trash2 size={14} /> Delete My Account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete Account Modal ── */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={20} color="#ef4444" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: '#0f172a' }}>Delete Account</div>
                <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>This action cannot be undone</div>
              </div>
            </div>
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 20 }}>
              This action is permanent and cannot be undone. All your data, purchased leads, and billing history will be deleted.
            </p>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#b91c1c' }}>
              Type <strong>DELETE</strong> to confirm:
            </div>
            <input
              autoFocus
              value={deleteConfirmText}
              onChange={e => { setDeleteConfirmText(e.target.value); setDeleteError(''); }}
              placeholder="Type DELETE to confirm"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8,
                border: `1.5px solid ${deleteError ? '#ef4444' : '#e2e8f0'}`, fontSize: 14, marginBottom: 8, outline: 'none',
              }}
              onKeyDown={e => { if (e.key === 'Enter' && deleteConfirmText === 'DELETE') deleteAccount(); }}
            />
            {deleteError && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{deleteError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); setDeleteError(''); }}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#64748b' }}
              >
                Cancel
              </button>
              <button
                disabled={deleteConfirmText !== 'DELETE' || dangerDeleting}
                onClick={deleteAccount}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700,
                  cursor: deleteConfirmText === 'DELETE' && !dangerDeleting ? 'pointer' : 'not-allowed',
                  background: deleteConfirmText === 'DELETE' ? '#ef4444' : '#fca5a5',
                  color: '#fff', transition: 'background 0.2s',
                }}
              >
                {dangerDeleting ? 'Deleting…' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 700px) {
          .settings-two-col { grid-template-columns: 1fr !important; }
        }
        select.input-field:focus { border-color: #ea580c !important; box-shadow: 0 0 0 3px rgba(234,88,12,0.12) !important; }
      `}</style>
    </DashboardLayout>
  );
}
