/**
 * Step 4 — Contact & alerts.
 *
 * Inputs: phone number, email (readonly account email), SMS + email
 * channel toggles.
 *
 * Save shape (controller dispatches on Continue):
 *   POST /api/onboarding/save-step
 *     { step: 3, answers: { phone, smsNotif, emailNotif } }
 *
 * Verification — connects to PR #80's flow:
 *   - On Continue: controller calls saveStep(3) → GET /auth/me → if
 *     phoneVerified=false, opens the production VerifyPhoneModal.
 *   - On inline "Verify now →" CTA (the amber status card): controller
 *     calls saveStep(3) → opens modal in place. Mover stays on Step 4 so
 *     the status card flips green on success.
 *
 * The status card uses the same two visual states locked in by PR #80:
 *   - Green "Phone confirmed" (phoneVerified === true)
 *   - Amber "Confirm your phone…" + "Verify now →" CTA (phoneVerified false)
 *
 * Backend protection: applyPhoneChange on the server resets
 * User.phoneVerified=false whenever the phone digits change, so editing
 * the number invalidates a prior verification — that ripples back through
 * `phoneVerified` after the controller's post-save refreshUser().
 */

import { Phone, Mail, Check, AlertTriangle, ArrowRight } from 'lucide-react';

function formatPhone(d) {
  const x = (d || '').replace(/\D/g, '').slice(0, 10);
  if (x.length < 4) return x;
  if (x.length < 7) return `(${x.slice(0, 3)}) ${x.slice(3)}`;
  return `(${x.slice(0, 3)}) ${x.slice(3, 6)}-${x.slice(6)}`;
}

export default function StepContact({ ctx }) {
  const {
    phone, setPhone,
    email, setEmail,
    phoneVerified,
    channels, setChannel,
    openVerify,
  } = ctx;

  const digits = (phone || '').replace(/\D/g, '');
  const valid = digits.length === 10;

  return (
    <div className="ow-content">
      <div className="ow-header">
        <h1 className="ow-h1">How should we reach you?</h1>
        <p className="ow-sub">
          We'll alert you when a matching homeowner request is published.
        </p>
      </div>

      <label className="ow-label" htmlFor="ow-phone">Phone number</label>
      <div className="ow-field">
        <div className="ow-input-wrap">
          <span className="ow-input-icon"><Phone size={16} /></span>
          <input
            id="ow-phone"
            className="ow-input"
            type="tel"
            inputMode="numeric"
            placeholder="(555) 555-5555"
            value={formatPhone(phone)}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            maxLength={14}
          />
        </div>
      </div>

      {valid && (
        <div
          className="ow-reveal"
          key={phoneVerified ? 'confirmed' : 'pending'}
        >
          {phoneVerified ? (
            <div
              className="ow-verify-status ow-verify-status--confirmed"
              data-testid="onboarding-verify-confirmed"
              role="status"
            >
              <span className="ow-vs-icon">
                <Check size={18} strokeWidth={2.5} />
              </span>
              <div className="ow-vs-body">
                <p className="ow-vs-title">Phone verified</p>
                <p className="ow-vs-text">You're ready to receive text alerts.</p>
              </div>
            </div>
          ) : (
            <div
              className="ow-verify-status ow-verify-status--pending"
              data-testid="onboarding-verify-pending"
              role="status"
            >
              <span className="ow-vs-icon"><AlertTriangle size={18} /></span>
              <div className="ow-vs-body">
                <p className="ow-vs-title">Confirm your phone to receive text alerts</p>
                <p className="ow-vs-text">We'll send you a 6-digit code.</p>
              </div>
              <button
                type="button"
                className="ow-verify-btn"
                onClick={() => openVerify('manual')}
                data-testid="onboarding-verify-inline-cta"
              >
                Verify now <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      <label className="ow-label" style={{ marginTop: 22 }} htmlFor="ow-email">Email address</label>
      <div className="ow-field">
        <div className="ow-input-wrap">
          <span className="ow-input-icon"><Mail size={16} /></span>
          <input
            id="ow-email"
            className="ow-input"
            type="email"
            placeholder="you@yourcompany.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
      </div>

      <div className="ow-toggle-group" style={{ marginTop: 22 }}>
        {[
          { id: 'text',  name: 'Text me matching move requests' },
          { id: 'email', name: 'Email me matching move requests' },
        ].map((row) => (
          <div className="ow-toggle-row" key={row.id}>
            <span className="ow-toggle-name">{row.name}</span>
            <button
              type="button"
              className="ow-toggle"
              data-on={channels[row.id]}
              aria-pressed={channels[row.id]}
              onClick={() => setChannel(row.id, !channels[row.id])}
            >
              <span className="ow-toggle-knob" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
