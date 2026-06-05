/**
 * OnboardingVerifyModal — required phone verification popup for the v2
 * onboarding wizard. Distinct from the production VerifyPhoneModal:
 *
 *   - Single-stage: code entry only. Sends verification automatically on
 *     mount (no "Send code" confirm step). User just types the 6 digits.
 *   - No close X. Only two ways out:
 *       • Verify code        → onSuccess()
 *       • Wrong number?      → onClose() (back to phone input)
 *   - Visual chrome matches the operator-approved design:
 *       phone icon tile → headline → subtitle with formatted phone →
 *       6 digit boxes → orange CTA → "Wrong number?" text link
 *
 * Backend endpoints reused from PR #80 (Twilio Verify):
 *   POST /api/users/me/phone/send-verification   (fires on mount)
 *   POST /api/users/me/phone/verify-code         (on submit)
 *
 * After verify-code success: refreshUser() so user.phoneVerified flips
 * immediately in AuthContext, then onSuccess() (which the wizard wires
 * to advance to SMS Claim).
 */

import { useState, useEffect, useRef, useContext } from 'react';
import { Phone } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

function formatUSPhone(input) {
  const d = String(input || '').replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return input || '';
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function OnboardingVerifyModal({ isOpen, onClose, onSuccess }) {
  const { API_URL, token, user, refreshUser } = useContext(AuthContext);
  const phone = user?.phone || '';

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRefs = useRef([]);
  const sentForRef = useRef(null);  // phone digits we've already triggered send for
  const cooldownTimerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setDigits(['', '', '', '', '', '']);
    setError('');
    setSubmitting(false);
    setTimeout(() => inputRefs.current[0]?.focus(), 80);
  }, [isOpen]);

  // Auto-send on open (per-phone guard so re-open with same phone doesn't
  // spam). The send-verification endpoint already enforces a 60s cooldown
  // server-side; this client-side guard just avoids the round-trip.
  useEffect(() => {
    if (!isOpen || !phone) return;
    if (sentForRef.current === phone) return;
    sentForRef.current = phone;
    (async () => {
      setSending(true);
      setError('');
      try {
        const res = await fetch(`${API_URL}/users/me/phone/send-verification`, {
          method: 'POST',
          headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          if (json.error === 'rate_limited' || json.error === 'cooldown_active') {
            setResendCooldown(Number(json.cooldownRemainingSec) || 60);
          } else {
            setError(json.message || 'Could not send code. Try again in a moment.');
          }
        } else {
          setResendCooldown(60);
        }
      } catch {
        setError('Network error sending code. Check your connection.');
      } finally {
        setSending(false);
      }
    })();
  }, [isOpen, phone, API_URL, token]);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [resendCooldown]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  function handleDigitChange(i, value) {
    const cleaned = (value || '').replace(/\D/g, '');
    if (!cleaned) {
      const next = [...digits];
      next[i] = '';
      setDigits(next);
      return;
    }
    // Paste support — if 6 digits dropped into one box, fill all 6
    if (cleaned.length >= 6) {
      const six = cleaned.slice(0, 6).split('');
      setDigits(six);
      inputRefs.current[5]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = cleaned[0];
    setDigits(next);
    if (i < 5) inputRefs.current[i + 1]?.focus();
  }

  function handleDigitKeyDown(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    } else if (e.key === 'Enter') {
      if (digits.every((d) => d.length === 1)) handleVerify();
    }
  }

  async function handleVerify() {
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
        if (json.error === 'verification_expired' || json.error === 'no_active_verification') {
          setError('Code expired. Tap "Send a new code" to try again.');
          setDigits(['', '', '', '', '', '']);
          inputRefs.current[0]?.focus();
          sentForRef.current = null; // allow auto-resend or manual resend
        } else {
          setError(json.message || 'That code didn\'t work. Please try again.');
        }
        return;
      }
      try { await refreshUser(); } catch { /* non-fatal */ }
      if (onSuccess) onSuccess();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || sending) return;
    setSending(true);
    setError('');
    setDigits(['', '', '', '', '', '']);
    try {
      const res = await fetch(`${API_URL}/users/me/phone/send-verification`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.message || 'Could not send code. Try again later.');
      } else {
        setResendCooldown(60);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError('Network error sending code.');
    } finally {
      setSending(false);
    }
  }

  if (!isOpen) return null;

  const allFilled = digits.every((d) => d.length === 1);

  return (
    <div className="ow-verify-popup-backdrop" role="dialog" aria-modal="true" aria-label="Phone verification">
      <div className="ow-verify-popup">
        <div className="ow-verify-popup-icon" aria-hidden="true">
          <Phone size={26} strokeWidth={2} />
        </div>

        <h2 className="ow-verify-popup-title">
          We just need to text you a code.
        </h2>
        <p className="ow-verify-popup-sub">
          Enter the 6-digit code we sent to {formatUSPhone(phone)}.
        </p>

        <div className="ow-verify-popup-digits" role="group" aria-label="6-digit verification code">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              className="ow-verify-popup-digit"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={d}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleDigitKeyDown(i, e)}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>

        {error && (
          <p className="ow-verify-popup-err" role="alert">{error}</p>
        )}

        <button
          type="button"
          className="ow-verify-popup-cta"
          onClick={handleVerify}
          disabled={submitting || !allFilled}
        >
          {submitting ? 'Verifying…' : 'Verify code'}
        </button>

        <div className="ow-verify-popup-foot">
          {resendCooldown > 0 ? (
            <span className="ow-verify-popup-resend-cool">
              Send a new code in {resendCooldown}s
            </span>
          ) : (
            <button
              type="button"
              className="ow-verify-popup-resend"
              onClick={handleResend}
              disabled={sending}
            >
              {sending ? 'Sending…' : 'Send a new code'}
            </button>
          )}
          <span className="ow-verify-popup-foot-sep" aria-hidden="true">·</span>
          <button
            type="button"
            className="ow-verify-popup-wrong"
            onClick={onClose}
          >
            Wrong number?
          </button>
        </div>
      </div>
    </div>
  );
}
