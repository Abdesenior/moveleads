import { useState, useEffect, useRef, useContext } from 'react';
import { X, ShieldCheck, CheckCircle, AlertCircle, Settings as SettingsIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

/**
 * VerifyPhoneModal — Twilio Verify-backed SMS OTP flow.
 *
 * Two-stage state machine:
 *   'confirm' → display the phone number, "Send code" CTA
 *   'code'    → 6-digit input + resend countdown
 *   'success' → brief checkmark, auto-close
 *
 * Hits the Phase 1 backend routes mounted at /api/users/me/phone/*:
 *   GET  /status              → seed cooldown / verifyConfigured
 *   POST /send-verification   → triggers Twilio SMS
 *   POST /verify-code         → flips User.phoneVerified=true on approval
 *
 * After success: calls refreshUser() so AuthContext.user reflects the new
 * phoneVerified=true on the next render, then invokes onSuccess() (if
 * provided) so the parent can refresh its own state (e.g. SmsClaim
 * readiness panel).
 */
export default function VerifyPhoneModal({ isOpen, onClose, onSuccess }) {
  const { API_URL, token, user, refreshUser } = useContext(AuthContext);
  const phone = user?.phone || '';

  // Stage machine
  const [stage, setStage] = useState('confirm');  // 'confirm' | 'code' | 'success'
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [sendsToday, setSendsToday] = useState(null);
  const [verifyConfigured, setVerifyConfigured] = useState(true);

  const inputRefs = useRef([]);
  const cooldownTimerRef = useRef(null);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // Reset state on open + seed cooldown from /status. If cooldown is
  // already > 0 the user just sent a code from another tab — skip straight
  // to the code-entry stage so they can finish.
  useEffect(() => {
    if (!isOpen) return;
    setStage('confirm');
    setDigits(['', '', '', '', '', '']);
    setError('');
    setSubmitting(false);

    (async () => {
      try {
        const res = await fetch(`${API_URL}/users/me/phone/status`, {
          headers: { 'x-auth-token': token },
        });
        const json = await res.json();
        if (!res.ok) return;
        setVerifyConfigured(json.verifyConfigured !== false);
        const remaining = Number(json.cooldownRemainingSec || 0);
        setSendsToday({ count: json.sendsToday, cap: json.sendsTodayCap });
        if (remaining > 0) {
          setStage('code');
          setCooldownLeft(remaining);
        }
      } catch (_err) {
        // /status is non-critical; modal can still open at confirm stage
      }
    })();
  }, [isOpen, API_URL, token]);

  // Countdown tick
  useEffect(() => {
    if (cooldownLeft <= 0) {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      return;
    }
    cooldownTimerRef.current = setInterval(() => {
      setCooldownLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [cooldownLeft]);

  // Map server error codes to user-facing copy
  const friendlyError = (json, fallback = 'Something went wrong. Please try again.') => {
    if (!json || !json.error) return fallback;
    switch (json.error) {
      case 'no_phone_on_file':       return 'Add a phone number in your profile first.';
      case 'phone_in_use':           return 'This number is already verified on another account. Contact support if this seems wrong.';
      case 'cooldown_active':        return `Please wait ${json.retryAfterSec || 60} seconds before requesting another code.`;
      case 'daily_limit':            return 'We’ve sent the limit of codes today. Try again in 24 hours, or call (307) 204-4792 to verify by phone.';
      case 'verify_service_unavailable': return 'Verification service is briefly unavailable. Please try again shortly.';
      case 'invalid_phone_format':   return 'That phone number doesn’t look valid. Update it in your profile and try again.';
      case 'verification_blocked_by_twilio':
        // Twilio Fraud Guard at the service level / geo-permission gap /
        // carrier block. The mover can't self-resolve — needs operator
        // action in Twilio Console. Tell them so they don't burn retries.
        return 'Couldn’t send the code — your carrier may be blocking it. Call (307) 204-4792 and we’ll verify you by phone.';
      case 'invalid_code':           return 'Code didn’t match. Double-check and try again.';
      case 'invalid_code_format':    return 'Enter the full 6-digit code.';
      case 'verification_expired':   return 'Code expired or too many attempts. Send a new code.';
      case 'no_active_verification': return 'No active code. Send a new one.';
      case 'twilio_rate_limit':      return 'Twilio rate limit reached. Please try again in a few minutes.';
      case 'ip_rate_limit':          return 'Too many requests from your network. Try again later.';
      default:                       return json.message || fallback;
    }
  };

  // ── Step 1: send code ────────────────────────────────────────────────
  const handleSendCode = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/users/me/phone/send-verification`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(friendlyError(json, 'Could not send verification code.'));
        // If the server told us a cooldown is active, still advance to the
        // code stage so the user can enter a previously-sent code.
        if (json.error === 'cooldown_active' && json.retryAfterSec) {
          setCooldownLeft(json.retryAfterSec);
          setStage('code');
        }
        return;
      }
      setSendsToday({ count: json.sendsToday, cap: json.sendsTodayCap });
      setCooldownLeft(60);
      setStage('code');
      // Autofocus first digit input
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 2: code-input handling ──────────────────────────────────────
  const handleDigitChange = (i, val) => {
    const cleaned = val.replace(/\D/g, '');
    if (cleaned.length === 0) {
      const next = [...digits];
      next[i] = '';
      setDigits(next);
      return;
    }
    // Paste support: if user pastes 6 digits into any single box, fill all
    if (cleaned.length >= 6) {
      const six = cleaned.slice(0, 6).split('');
      setDigits(six);
      inputRefs.current[5]?.focus();
      return;
    }
    // Normal single-char advance
    const next = [...digits];
    next[i] = cleaned[0];
    setDigits(next);
    if (i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleDigitKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
    if (e.key === 'Enter') {
      const allFilled = digits.every(d => d.length === 1);
      if (allFilled) handleVerifyCode();
    }
  };

  // ── Step 3: verify code ──────────────────────────────────────────────
  const handleVerifyCode = async () => {
    setError('');
    const code = digits.join('');
    if (code.length !== 6) {
      setError('Enter the full 6-digit code.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/users/me/phone/verify-code`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(friendlyError(json, 'Verification failed.'));
        // On expired/no_active, reset to confirm so they re-send
        if (json.error === 'verification_expired' || json.error === 'no_active_verification') {
          setStage('confirm');
          setDigits(['', '', '', '', '', '']);
        }
        return;
      }
      setStage('success');
      // Refresh AuthContext so user.phoneVerified flips immediately
      try { await refreshUser(); } catch (_e) { /* non-fatal */ }
      // Brief celebration, then close
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Display phone in a friendly format. user.phone is the raw 10-digit string.
  const displayPhone = formatPhone(phone);

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
          <X size={18} />
        </button>

        {/* Stage-specific icon */}
        <div style={{
          width: 64, height: 64,
          borderRadius: '50%',
          background: stage === 'success' ? '#f0fdf4' : '#eff6ff',
          color: stage === 'success' ? '#16a34a' : '#2563eb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          {stage === 'success' ? <CheckCircle size={32} /> : <ShieldCheck size={30} />}
        </div>

        {/* Stage: confirm */}
        {stage === 'confirm' && (
          <>
            <h2 style={titleStyle}>Verify your dispatch phone</h2>
            <p style={subStyle}>
              We'll send a 6-digit code via SMS to:
            </p>
            <div style={phoneDisplayStyle}>
              {displayPhone || <span style={{ color: '#94a3b8' }}>No phone on file</span>}
            </div>
            {!phone && (
              <div style={inlineErrStyle}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>Add a US phone number in your profile first.</span>
              </div>
            )}
            {!verifyConfigured && (
              <div style={inlineErrStyle}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>Verification service temporarily unavailable.</span>
              </div>
            )}
            {error && (
              <div style={inlineErrStyle}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}
            <div style={{ marginTop: 8, marginBottom: 18, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
              Wrong number?{' '}
              <Link to="/dashboard/settings" onClick={onClose} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                <SettingsIcon size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                Update in Settings
              </Link>
            </div>
            <button
              onClick={handleSendCode}
              disabled={submitting || !phone || !verifyConfigured}
              style={primaryBtnStyle(submitting || !phone || !verifyConfigured)}
            >
              {submitting ? 'Sending…' : 'Send code'}
            </button>
          </>
        )}

        {/* Stage: code entry */}
        {stage === 'code' && (
          <>
            <h2 style={titleStyle}>Enter the 6-digit code</h2>
            <p style={subStyle}>
              Sent to <strong>{displayPhone}</strong>
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={d}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(i, e)}
                  style={digitInputStyle}
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>
            {error && (
              <div style={inlineErrStyle}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}
            <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4, marginBottom: 16 }}>
              {cooldownLeft > 0 ? (
                <>Didn't receive it? Resend in <strong>{formatCountdown(cooldownLeft)}</strong></>
              ) : (
                <button onClick={handleSendCode} disabled={submitting} style={resendLinkStyle}>
                  Resend code
                </button>
              )}
            </div>
            {sendsToday && sendsToday.cap && (
              <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginBottom: 12 }}>
                {sendsToday.count} / {sendsToday.cap} sends today
              </div>
            )}
            <button
              onClick={handleVerifyCode}
              disabled={submitting || digits.some(d => !d)}
              style={primaryBtnStyle(submitting || digits.some(d => !d))}
            >
              {submitting ? 'Verifying…' : 'Verify'}
            </button>
          </>
        )}

        {/* Stage: success */}
        {stage === 'success' && (
          <>
            <h2 style={{ ...titleStyle, color: '#16a34a' }}>Phone verified</h2>
            <p style={subStyle}>You'll now receive SMS lead alerts on this number.</p>
          </>
        )}
      </div>

      <style>{`
        @keyframes vpFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vpScaleIn { from { opacity: 0; transform: scale(0.95) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length !== 10) return raw || '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatCountdown(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Styles ───────────────────────────────────────────────────────────────

const overlayStyle = {
  position: 'fixed', inset: 0,
  background: 'rgba(10, 25, 47, 0.7)',
  backdropFilter: 'blur(8px)',
  zIndex: 13500,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
  animation: 'vpFadeIn 0.2s ease',
};

const modalStyle = {
  background: 'white',
  width: '100%', maxWidth: 420,
  borderRadius: 20, padding: '32px 28px',
  boxShadow: '0 24px 64px rgba(0, 0, 0, 0.25)',
  position: 'relative', textAlign: 'center',
  animation: 'vpScaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
};

const closeBtnStyle = {
  position: 'absolute', top: 14, right: 14,
  width: 32, height: 32, borderRadius: 8,
  background: '#f8fafc', border: 'none',
  cursor: 'pointer', color: '#94a3b8',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const titleStyle = {
  fontSize: 20, color: '#0f172a',
  marginBottom: 8, fontWeight: 800,
  fontFamily: 'var(--font-heading)',
};

const subStyle = {
  color: '#64748b', fontSize: 14,
  marginBottom: 14, lineHeight: 1.5,
};

const phoneDisplayStyle = {
  fontSize: 22, fontWeight: 700, color: '#0f172a',
  marginBottom: 4, letterSpacing: '0.02em',
  fontFamily: 'var(--font-heading)',
};

const inlineErrStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: '#fef2f2', color: '#b91c1c',
  border: '1px solid #fecaca', borderRadius: 10,
  padding: '8px 12px', fontSize: 13,
  margin: '10px 0',
  textAlign: 'left',
};

const digitInputStyle = {
  width: 44, height: 52,
  textAlign: 'center',
  fontSize: 22, fontWeight: 700,
  color: '#0f172a',
  border: '1.5px solid #e2e8f0',
  borderRadius: 10,
  outline: 'none',
  fontFamily: 'var(--font-heading)',
};

const resendLinkStyle = {
  background: 'none', border: 'none',
  color: '#2563eb', fontWeight: 600,
  fontSize: 12, cursor: 'pointer',
  padding: 0, fontFamily: 'inherit',
};

function primaryBtnStyle(disabled) {
  return {
    width: '100%', padding: '13px',
    background: disabled ? '#cbd5e1' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    color: '#fff',
    border: 'none', borderRadius: 12,
    fontWeight: 700, fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-heading)',
    boxShadow: disabled ? 'none' : '0 4px 14px rgba(37, 99, 235, 0.25)',
    transition: 'all 0.2s',
  };
}
