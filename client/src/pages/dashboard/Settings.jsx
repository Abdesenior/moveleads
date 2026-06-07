import { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Save, Trash2, Filter, Star, ExternalLink, Globe, ShieldCheck, ShieldAlert, Clock } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import VerifyPhoneModal from '../../components/VerifyPhoneModal';
import StatePicker from '../../components/StatePicker';
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

/* 2026-05-26 — PR-C1: Coverage ZIPs tab + manual ZipTagInput removed.
   Service Areas (pickupStates / deliveryStates / deliversNationwide /
   maxDistance) is now the single user-facing coverage surface. The
   CoverageArea collection is still maintained internally by
   regenerateCoverageForUser_v2 on every Service Area save, so socket
   rooms, warm-transfer eligibility, and broadcast candidate queries
   continue to function unchanged. The manual UI was vestigial —
   any ZIPs entered here were wiped on the next Service Area save. */

/* Compare two state-code arrays as unordered sets (e.g. pickup vs delivery
   for the "Same as pickup" radio detection on load). */
function sameSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

const TABS = [
  { id: 'notifications', label: 'Notifications',   icon: Bell },
  { id: 'serviceAreas',  label: 'Service Areas',   icon: Globe },
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
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') !== 'false');
  const [saving, setSaving]         = useState(false);

  /* Dispatch Hours — controls when this mover receives SMS broadcasts.
     Backed by onboarding.answers.{dispatchHoursMode,dispatchHoursOpen,
     dispatchHoursClose,dispatchDays}. Written via the dedicated
     PATCH /api/users/me/dispatch-hours endpoint. dispatchPolicy.is-
     WithinDispatchHours returns permissive 24/7 when mode is unset, so
     toggling OFF here just clears `dispatchHoursMode`.
     v1 limitation: evaluation is in UTC (server clock); a future PR-C2b
     will introduce a per-user timezone field. */
  const _initialDispatchDays = ['sun','mon','tue','wed','thu','fri','sat'];
  const [dispatchEnabled, setDispatchEnabled] = useState(false);
  const [dispatchOpen,    setDispatchOpen]    = useState('09:00');
  const [dispatchClose,   setDispatchClose]   = useState('17:00');
  const [dispatchDays,    setDispatchDays]    = useState(_initialDispatchDays);
  const [dispatchSaving,  setDispatchSaving]  = useState(false);
  const [dispatchMsg,     setDispatchMsg]     = useState('');
  const [utcNow,          setUtcNow]          = useState(() => new Date());

  /* Service Area — Phase 2 unified pickup/delivery/distance settings.
     Reads from new top-level User fields populated by the Phase 1 backfill
     and onboarding mirrors. The save handler writes pickupStates,
     deliveryStates, deliversNationwide, and maxDistance via PUT /users/:id.
     Server-side serviceAreaMirror keeps the legacy serviceStates field in
     sync until Phase 3 cuts the matcher over. */
  const [pickupStates, setPickupStates] = useState(() =>
    Array.isArray(user?.pickupStates) && user.pickupStates.length > 0
      ? user.pickupStates
      : (Array.isArray(user?.serviceStates) ? user.serviceStates : [])
  );
  // deliveryMode is UI-only — derived from the data on load (see effect below).
  // 'same'       → save deliveryStates = pickupStates, deliversNationwide=false
  // 'custom'     → save deliveryStates = deliveryStatesCustom, deliversNationwide=false
  // 'nationwide' → save deliveryStates = [], deliversNationwide=true
  const [deliveryMode, setDeliveryMode]               = useState('same');
  const [deliveryStatesCustom, setDeliveryStatesCustom] = useState([]);
  // moveDistance UI value: '' (Both) | 'Local' | 'Long Distance'
  const [moveDistance, setMoveDistance] = useState(user?.maxDistance || '');
  const [serviceAreaSaving, setServiceAreaSaving] = useState(false);
  const [serviceAreaMsg, setServiceAreaMsg]       = useState('');

  /* Lead Preferences — home size only. Move distance moved into Service Area
     (lives alongside pickup/delivery states; same conceptual surface). */
  const [homeSizePref, setHomeSizePref] = useState(() => {
    const pref = user?.preferredHomeSizes || [];
    if (pref.includes('2 Bedroom')) return '2+ Bedrooms only';
    if (pref.includes('3 Bedroom')) return '3+ Bedrooms only';
    return 'All Sizes';
  });
  const [prefsSaving, setPrefsSaving]   = useState(false);
  const [prefsMsg, setPrefsMsg]         = useState('');

  /* Profile */
  const [googleReviewLink, setGoogleReviewLink] = useState(user?.googleReviewLink || '');
  const [profilePhone, setProfilePhone]         = useState(user?.phone || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg]       = useState('');

  /* Phone verification modal — opened from the SMS Alert Phone row below.
     Reads phoneVerified state directly from AuthContext.user; refreshUser()
     inside the modal flips the badge to "Verified" the moment Twilio
     approves. */
  const [verifyOpen, setVerifyOpen] = useState(false);

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const res = await fetch(`${API_URL}/users/${user._id}`, {
        method: 'PUT',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleReviewLink: googleReviewLink.trim(), phone: profilePhone.trim() }),
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

  /* Dispatch Hours — PATCH /api/users/me/dispatch-hours.
     Single-purpose endpoint; payload shape mirrors the validator on the
     server. Sending { enabled: false } clears the gate (24/7 SMS again);
     { enabled: true, open, close, days } configures the default-mode
     window. */
  const saveDispatchHours = async () => {
    setDispatchSaving(true);
    setDispatchMsg('');
    try {
      const payload = dispatchEnabled
        ? { enabled: true, open: dispatchOpen, close: dispatchClose, days: dispatchDays }
        : { enabled: false };
      const res = await fetch(`${API_URL}/users/me/dispatch-hours`, {
        method: 'PATCH',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to save');
      await refreshUser();
      setDispatchMsg(dispatchEnabled ? 'Dispatch hours saved.' : 'Dispatch hours cleared — SMS alerts are now 24/7.');
      setTimeout(() => setDispatchMsg(''), 3500);
    } catch (err) {
      setDispatchMsg('Failed to save: ' + (err.message || 'unknown error'));
    } finally {
      setDispatchSaving(false);
    }
  };

  const toggleDispatchDay = (code) => {
    setDispatchDays(prev =>
      prev.includes(code) ? prev.filter(d => d !== code) : [...prev, code]
    );
  };

  /* Danger */
  const [dangerDeleting, setDangerDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');

  /* Sync local state from DB whenever user object changes (page load / refresh).
     Service-area fields hydrate from the new top-level User fields populated
     in Phase 1; deliveryMode is INFERRED from the persisted shape: */
  const didInit = useRef(false);
  useEffect(() => {
    if (!user) return;
    setEmailNotif(user.emailNotif ?? true);
    setSmsNotif(user.smsNotif ?? false);
    setProfilePhone(user.phone || '');

    const pickup = Array.isArray(user.pickupStates) && user.pickupStates.length > 0
      ? user.pickupStates
      : (Array.isArray(user.serviceStates) ? user.serviceStates : []);
    const delivery = Array.isArray(user.deliveryStates) ? user.deliveryStates : [];
    setPickupStates(pickup);

    if (user.deliversNationwide) {
      setDeliveryMode('nationwide');
      setDeliveryStatesCustom([]);
    } else if (delivery.length === 0 || sameSet(pickup, delivery)) {
      // Empty delivery (legacy / fresh mover) reads as "Same as pickup" —
      // the existing matcher already treats serviceStates symmetrically.
      setDeliveryMode('same');
      setDeliveryStatesCustom([]);
    } else {
      setDeliveryMode('custom');
      setDeliveryStatesCustom(delivery);
    }

    setMoveDistance(user.maxDistance || '');

    // Dispatch hours hydration. Mode === 'default' → toggle ON;
    // anything else (including null / 'advanced') → toggle OFF.
    // 'advanced' shape is intentionally not surfaced in v1 (decision A1).
    const a = user.onboarding?.answers || {};
    const enabled = a.dispatchHoursMode === 'default';
    setDispatchEnabled(enabled);
    if (typeof a.dispatchHoursOpen === 'string')  setDispatchOpen(a.dispatchHoursOpen);
    if (typeof a.dispatchHoursClose === 'string') setDispatchClose(a.dispatchHoursClose);
    if (Array.isArray(a.dispatchDays) && a.dispatchDays.length > 0) {
      setDispatchDays(a.dispatchDays);
    } else {
      setDispatchDays(_initialDispatchDays);
    }

    didInit.current = true;
  }, [user?._id]); // eslint-disable-line

  /* Live UTC clock for the dispatch-hours helper line. Ticks once a minute —
     enough resolution since dispatch hours are stored in minute granularity,
     and cheap enough to ignore. */
  useEffect(() => {
    const id = setInterval(() => setUtcNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  /* Auto-save notifications — skips the initial sync fire */
  useEffect(() => {
    if (!didInit.current || !user || !API_URL) return;
    setSaving(true);
    fetch(`${API_URL}/users/${user._id}`, {
      method: 'PUT',
      headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailNotif, smsNotif }),
    })
      .then(() => refreshUser())
      .catch(() => {})
      .finally(() => setSaving(false));
  }, [emailNotif, smsNotif]); // eslint-disable-line

  /* Service Area — Phase 2 unified save.
     Writes the new top-level User fields. The server's serviceAreaMirror
     handles legacy serviceStates synchronization + CoverageArea regen,
     so this client just sends pickup/delivery/nationwide + the move
     distance preference. */
  const saveServiceArea = async () => {
    setServiceAreaSaving(true);
    setServiceAreaMsg('');
    try {
      const payload = {
        pickupStates,
        maxDistance: moveDistance, // '' | 'Local' | 'Long Distance'
      };
      if (deliveryMode === 'nationwide') {
        payload.deliversNationwide = true;
        payload.deliveryStates     = [];
      } else if (deliveryMode === 'custom') {
        payload.deliversNationwide = false;
        payload.deliveryStates     = deliveryStatesCustom;
      } else { // 'same'
        payload.deliversNationwide = false;
        payload.deliveryStates     = pickupStates;
      }

      const res = await fetch(`${API_URL}/users/${user._id}`, {
        method: 'PUT',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to save');
      await refreshUser();
      setServiceAreaMsg('Service area saved.');
      setTimeout(() => setServiceAreaMsg(''), 3000);
    } catch (err) {
      setServiceAreaMsg('Failed to save: ' + (err.message || 'unknown error'));
    } finally {
      setServiceAreaSaving(false);
    }
  };

  const saveLeadPreferences = async () => {
    setPrefsSaving(true);
    setPrefsMsg('');
    try {
      const preferredHomeSizes =
        homeSizePref === '2+ Bedrooms only' ? ['2 Bedroom', '3 Bedroom', '4+ Bedroom'] :
        homeSizePref === '3+ Bedrooms only' ? ['3 Bedroom', '4+ Bedroom'] : [];

      const res = await fetch(`${API_URL}/users/${user._id}`, {
        method: 'PUT',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredHomeSizes }),
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
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>
          Account Settings
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Manage notifications, service area, and preferences</p>
      </div>

      {/* Two-column layout: vertical tabs + content */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Left: vertical tab menu ── */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          {TABS.map((tab, idx) => {
            const active   = activeTab === tab.id;
            const isDanger = tab.id === 'danger';
            const TabIcon  = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '13px 16px',
                  background: active ? (isDanger ? '#fef2f2' : '#fff7ed') : '#fff',
                  color: active ? (isDanger ? '#dc2626' : '#ea580c') : (isDanger ? '#ef4444' : '#64748b'),
                  fontWeight: active ? 700 : 500, fontSize: 13,
                  fontFamily: 'inherit',
                  borderLeft: active ? `3px solid ${isDanger ? '#ef4444' : '#ea580c'}` : '3px solid transparent',
                  borderBottom: idx < TABS.length - 1 ? '1px solid #f1f5f9' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <TabIcon size={15} />
                {tab.label}
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
                {
                  label: 'Sound Notifications',
                  desc: 'Play a chime when new leads arrive in your Live Leads feed.',
                  value: soundEnabled,
                  onChange: (val) => {
                    setSoundEnabled(val);
                    localStorage.setItem('soundEnabled', val ? 'true' : 'false');
                  },
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

              <div style={{ padding: '16px 24px' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                  Changes are saved automatically when you toggle.
                </p>
              </div>

              {/* ── Dispatch Hours — SMS-only time window ──────────────────
                  PR-C2: optional window restricting when this mover
                  receives SMS lead alerts. OFF (default) = 24/7 SMS,
                  matching today's behavior for every existing mover.
                  Email broadcasts intentionally bypass this gate, mirroring
                  dispatchPolicy.isWithinDispatchHours (which short-circuits
                  to true for the 'email' and 'socket' channels). */}
              <div style={{ borderTop: '1px solid #f1f5f9', padding: '20px 24px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <Clock size={16} color="#3b82f6" style={{ marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 2 }}>
                        Restrict SMS alerts to a time window
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Off: SMS alerts arrive 24/7. On: only during the hours below. Email alerts are unaffected.
                      </div>
                    </div>
                  </div>
                  <Toggle on={dispatchEnabled} onChange={setDispatchEnabled} />
                </div>
              </div>

              {dispatchEnabled && (
                <div style={{ padding: '6px 24px 6px 50px' }}>
                  {/* Open / Close time inputs */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        From
                      </label>
                      <input
                        type="time"
                        value={dispatchOpen}
                        onChange={e => setDispatchOpen(e.target.value)}
                        style={{
                          padding: '8px 10px', borderRadius: 8,
                          border: '1.5px solid #e2e8f0', fontSize: 13,
                          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                          width: 130, outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        To
                      </label>
                      <input
                        type="time"
                        value={dispatchClose}
                        onChange={e => setDispatchClose(e.target.value)}
                        style={{
                          padding: '8px 10px', borderRadius: 8,
                          border: '1.5px solid #e2e8f0', fontSize: 13,
                          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                          width: 130, outline: 'none',
                        }}
                      />
                    </div>
                    <div style={{ alignSelf: 'flex-end', padding: '10px 8px', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
                      UTC
                    </div>
                  </div>

                  {/* Day checkboxes */}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      Days
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {[
                        { code: 'sun', label: 'Sun' },
                        { code: 'mon', label: 'Mon' },
                        { code: 'tue', label: 'Tue' },
                        { code: 'wed', label: 'Wed' },
                        { code: 'thu', label: 'Thu' },
                        { code: 'fri', label: 'Fri' },
                        { code: 'sat', label: 'Sat' },
                      ].map(({ code, label }) => {
                        const active = dispatchDays.includes(code);
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => toggleDispatchDay(code)}
                            style={{
                              padding: '7px 12px', borderRadius: 8,
                              border: active ? '1.5px solid #3b82f6' : '1.5px solid #e2e8f0',
                              background: active ? '#dbeafe' : '#fff',
                              color: active ? '#1d4ed8' : '#64748b',
                              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                              cursor: 'pointer', transition: 'all 0.15s',
                              minWidth: 52,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* UTC disclosure — explicit about v1 limitation.
                      A future PR-C2b adds per-user timezone support; for
                      now, surface the conversion plainly so movers in
                      non-UTC zones can do the math. */}
                  <div style={{
                    marginTop: 14, padding: '10px 12px', borderRadius: 8,
                    background: '#fef9c3', border: '1px solid #fde68a',
                    fontSize: 12, color: '#854d0e', lineHeight: 1.5,
                  }}>
                    <strong>Heads up:</strong> hours are evaluated in <strong>UTC</strong>. Right now it's{' '}
                    <strong style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>
                      {String(utcNow.getUTCHours()).padStart(2, '0')}:{String(utcNow.getUTCMinutes()).padStart(2, '0')} UTC
                    </strong>
                    {' '}({utcNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} your local time).
                    Convert your intended local window into UTC before saving. Per-timezone support is coming.
                  </div>
                </div>
              )}

              <div style={{ padding: '14px 24px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button"
                  onClick={saveDispatchHours}
                  disabled={dispatchSaving || (dispatchEnabled && dispatchDays.length === 0)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '9px 18px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'var(--font-heading)',
                    boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
                    opacity: (dispatchSaving || (dispatchEnabled && dispatchDays.length === 0)) ? 0.6 : 1,
                  }}
                >
                  <Save size={13} /> {dispatchSaving ? 'Saving…' : 'Save dispatch hours'}
                </button>
                {dispatchEnabled && dispatchDays.length === 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>
                    Select at least one day, or turn the toggle off.
                  </span>
                )}
                {dispatchMsg && (
                  <span style={{
                    fontSize: 12.5, fontWeight: 700,
                    color: dispatchMsg.startsWith('Failed') ? '#dc2626' : '#16a34a',
                  }}>
                    {dispatchMsg.startsWith('Failed') ? '✕' : '✓'} {dispatchMsg}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Service Area tab (Phase 2: pickup + delivery + move distance) ── */}
          {activeTab === 'serviceAreas' && (
            <div
              style={{
                background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                // overflow stays visible so the absolute-positioned StatePicker
                // dropdown isn't clipped by the card's rounded boundary.
                overflow: 'visible',
              }}
            >
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Globe size={16} color="#ea580c" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Service Area</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Where you pick up, where you deliver, and the moves you'll take</div>
                  </div>
                </div>
                {serviceAreaSaving && <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '3px 10px', borderRadius: 6 }}>Saving…</span>}
              </div>

              {/* ── Pickup ───────────────────────────────────────── */}
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Where do you pick up moves?
                </label>
                <StatePicker
                  value={pickupStates}
                  onChange={setPickupStates}
                  emptyHint="Add the states where your trucks start."
                />
                <p style={{ margin: '12px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  We'll only match you with leads originating in these states.
                </p>
              </div>

              {/* ── Delivery ─────────────────────────────────────── */}
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Where do you deliver moves?
                </label>
                <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                  {[
                    { id: 'same',       title: 'Same as pickup states',  hint: 'Local moves only — pickup and delivery in the same states.' },
                    { id: 'custom',     title: 'Choose delivery states', hint: 'Pick the specific states you can deliver to.' },
                    { id: 'nationwide', title: 'Nationwide delivery',    hint: 'You deliver anywhere in the US (no state list required).' },
                  ].map(opt => {
                    const active = deliveryMode === opt.id;
                    return (
                      <label
                        key={opt.id}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                          padding: '12px 14px', borderRadius: 12,
                          border: active ? '2px solid #ea580c' : '1.5px solid #e2e8f0',
                          background: active ? '#fff7ed' : '#fff',
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                      >
                        <input
                          type="radio"
                          name="deliveryMode"
                          value={opt.id}
                          checked={active}
                          onChange={() => setDeliveryMode(opt.id)}
                          style={{ marginTop: 3 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{opt.title}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{opt.hint}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {deliveryMode === 'custom' && (
                  <div style={{ marginTop: 4 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                      Delivery states
                    </label>
                    <StatePicker
                      value={deliveryStatesCustom}
                      onChange={setDeliveryStatesCustom}
                      emptyHint="Add the states you can deliver to."
                    />
                  </div>
                )}
              </div>

              {/* ── Move distance ────────────────────────────────── */}
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Move distance
                </label>
                <div style={{ display: 'grid', gap: 10 }}>
                  {[
                    { id: '',              title: 'Both',                          hint: 'Local and long-distance leads.' },
                    { id: 'Local',         title: 'Local only',                    hint: 'Same-city / short-haul moves only.' },
                    { id: 'Long Distance', title: 'Long distance / interstate',    hint: 'Inter-state and cross-country moves only.' },
                  ].map(opt => {
                    const active = moveDistance === opt.id;
                    return (
                      <label
                        key={opt.id || 'both'}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                          padding: '12px 14px', borderRadius: 12,
                          border: active ? '2px solid #ea580c' : '1.5px solid #e2e8f0',
                          background: active ? '#fff7ed' : '#fff',
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                      >
                        <input
                          type="radio"
                          name="moveDistance"
                          value={opt.id}
                          checked={active}
                          onChange={() => setMoveDistance(opt.id)}
                          style={{ marginTop: 3 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{opt.title}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{opt.hint}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ── Save ─────────────────────────────────────────── */}
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <button
                  type="button"
                  onClick={saveServiceArea}
                  disabled={serviceAreaSaving}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '11px 22px', borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg,#f97316,#ea580c)',
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'var(--font-heading)',
                    boxShadow: '0 4px 12px rgba(234,88,12,0.25)',
                    opacity: serviceAreaSaving ? 0.6 : 1,
                  }}
                >
                  <Save size={14} /> {serviceAreaSaving ? 'Saving…' : 'Save Service Area'}
                </button>
                {serviceAreaMsg && (
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: serviceAreaMsg.startsWith('Failed') ? '#dc2626' : '#16a34a',
                  }}>
                    {serviceAreaMsg.startsWith('Failed') ? '✕' : '✓'} {serviceAreaMsg}
                  </span>
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

              <div style={{ padding: '24px' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Preferred Home Sizes
                </label>
                <select
                  value={homeSizePref}
                  onChange={e => setHomeSizePref(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', maxWidth: 360 }}
                >
                  <option>All Sizes</option>
                  <option>2+ Bedrooms only</option>
                  <option>3+ Bedrooms only</option>
                </select>
                <p style={{ margin: '10px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  Move distance moved to <strong>Service Area</strong> — set it alongside your pickup &amp; delivery states.
                </p>
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
                    fontFamily: 'var(--font-heading)',
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
                  SMS Alert Phone Number
                </label>
                <input
                  type="tel"
                  value={profilePhone}
                  onChange={e => setProfilePhone(e.target.value)}
                  placeholder="e.g. (555) 867-5309"
                  className="input-field"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, marginBottom: 12 }}>
                  Enter your mobile number to receive SMS alerts when new leads match your area. Enable <strong>SMS Notifications</strong> in the Notifications tab to activate.
                </p>

                {/* Phone verification status — required for SMS alerts + SMS Claim.
                    NOT required for email alerts, dashboard access, or onboarding.
                    A verified phone is the operational identity layer for SMS reply
                    matching (SMS Claim) and the TCPA compliance gate for outbound
                    lead-alert SMS. */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '12px 14px', marginBottom: 24,
                  background: user?.phoneVerified ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${user?.phoneVerified ? '#bbf7d0' : '#fde68a'}`,
                  borderRadius: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {user?.phoneVerified
                      ? <ShieldCheck size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                      : <ShieldAlert  size={18} color="#d97706" style={{ flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: user?.phoneVerified ? '#15803d' : '#92400e' }}>
                        {user?.phoneVerified ? 'Phone verified' : 'Phone not verified'}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                        {user?.phoneVerified
                          ? <>Receiving SMS alerts on this number{user.phoneVerifiedAt ? ` · verified ${new Date(user.phoneVerifiedAt).toLocaleDateString()}` : ''}.</>
                          : <>Required to receive SMS lead alerts. Email alerts work without verification.</>}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVerifyOpen(true)}
                    style={{
                      padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                      background: user?.phoneVerified ? '#fff' : 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                      color: user?.phoneVerified ? '#2563eb' : '#fff',
                      boxShadow: user?.phoneVerified ? 'none' : '0 2px 8px rgba(37,99,235,0.25)',
                      border: user?.phoneVerified ? '1px solid #bfdbfe' : 'none',
                    }}>
                    {user?.phoneVerified ? 'Re-verify' : 'Verify Phone'}
                  </button>
                </div>

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
                    fontFamily: 'var(--font-heading)',
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
                    fontFamily: 'var(--font-heading)',
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
        {/* zIndex 13500 — above the mobile fixed app bar (12100 in dashboard.css). */}
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 13500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
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
        @keyframes stateDropdownIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <VerifyPhoneModal
        isOpen={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onSuccess={() => setVerifyOpen(false)}
      />
    </DashboardLayout>
  );
}
