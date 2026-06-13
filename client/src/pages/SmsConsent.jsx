import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/MarketingLayout';
import useCanonical from '../utils/useCanonical';
import { MessageSquare, ShieldCheck, Info } from 'lucide-react';

/**
 * /sms-consent — public A2P 10DLC opt-in demonstration page.
 *
 * Twilio + carrier reviewers ask for a publicly-accessible URL that shows
 * the EXACT opt-in flow end users go through. This page mirrors the SMS
 * consent step of the mover registration form at /register (same field,
 * same checkbox, same consent language) and adds the program disclosures
 * in one place: use cases, frequency, rates, STOP/HELP, and links to the
 * Terms of Service and Privacy Policy.
 *
 * The form here is a DEMONSTRATION — it does not submit anywhere. Real
 * opt-in happens during registration (client/src/pages/Register.jsx) and
 * is recorded server-side as smsConsent + smsConsentAt + smsConsentIp
 * (server/routes/auth.js).
 */

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';

const CONSENT_TEXT =
  'I agree to receive SMS from MoveLeads LLC. Msg frequency varies. ' +
  'Msg & data rates may apply. Reply STOP to opt out or HELP for help. ' +
  'Consent not required to purchase.';

export default function SmsConsent() {
  useCanonical('/sms-consent');
  useEffect(() => { document.title = 'SMS Opt-In & Consent — MoveLeads.cloud'; }, []);

  // Demo-only local state so the reviewer can interact with the controls.
  const [phone, setPhone] = useState('');
  const [checked, setChecked] = useState(false);

  const formatPhone = (raw) => {
    let d = (raw || '').replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
    d = d.slice(0, 10);
    if (d.length < 4) return d;
    if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  };

  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{
        background: `linear-gradient(160deg, ${NAVY} 0%, #0f2447 100%)`,
        padding: '90px 0 70px', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', position: 'relative' }}>
          <div style={{ display: 'inline-block', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.22)', borderRadius: 100, padding: '5px 16px', marginBottom: 20 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: ORANGE, letterSpacing: 1, textTransform: 'uppercase' }}>SMS Program</span>
          </div>
          <h1 style={{ fontFamily: F, fontSize: 40, fontWeight: 900, color: '#fff', margin: '0 0 16px', letterSpacing: '-0.8px', lineHeight: 1.15 }}>
            SMS Opt-In &amp; Consent
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.6 }}>
            How moving companies opt in to text messages from MoveLeads LLC.
          </p>
        </div>
      </section>

      <section style={{ padding: '64px 0 100px', background: '#fff' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 28px' }}>

          {/* Program summary */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '22px 26px', marginBottom: 36 }}>
            <p style={{ margin: 0, fontSize: 15, color: '#475569', lineHeight: 1.75 }}>
              <strong style={{ color: NAVY }}>MoveLeads LLC</strong> (https://moveleads.cloud), a
              lead marketplace for moving companies registered in Wyoming, USA, sends SMS for{' '}
              <strong style={{ color: NAVY }}>verification, lead alerts, and account updates</strong>.
              Movers opt in during registration via the flow shown below, and can reply STOP to
              opt out at any time without losing access to their account.
            </p>
          </div>

          {/* ── Opt-in flow demonstration ── */}
          <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>
            The opt-in flow
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 18px' }}>
            This is the same phone field and consent checkbox shown on our{' '}
            <Link to="/register" style={{ color: ORANGE, fontWeight: 600 }}>registration page</Link>.
            The checkbox is unchecked by default — opting in requires an affirmative action.
          </p>

          <div style={{
            border: '1px solid #e2e8f0', borderRadius: 16, padding: '26px 26px 22px',
            boxShadow: '0 2px 12px rgba(15,23,42,0.06)', marginBottom: 40, background: '#fff',
          }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
              Phone Number
            </label>
            <input
              type="tel"
              inputMode="tel"
              maxLength={14}
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              placeholder="(555) 123-4567"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '12px 14px',
                borderRadius: 10, border: '1px solid #e2e8f0', outline: 'none',
                fontSize: 16, fontFamily: 'inherit',
              }}
            />
            <small style={{ display: 'block', marginTop: 6, color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>
              Used for verification, lead alerts, and account updates.
            </small>

            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              marginTop: 16, padding: '12px 14px', borderRadius: 10,
              background: 'rgba(15,23,42,0.03)', border: '1px solid rgba(15,23,42,0.08)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setChecked(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: ORANGE, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12.5, lineHeight: 1.6, color: '#475569' }}>
                {CONSENT_TEXT}
              </span>
            </label>

            <small style={{ display: 'block', marginTop: 10, fontSize: 12, color: '#64748b' }}>
              By signing up, you agree to our{' '}
              <Link to="/terms" style={{ color: ORANGE, fontWeight: 600 }}>Terms of Service</Link>
              {' '}and{' '}
              <Link to="/privacy" style={{ color: ORANGE, fontWeight: 600 }}>Privacy Policy</Link>.
            </small>

            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Info size={15} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                This form is a demonstration of our opt-in flow. Actual opt-in happens
                during account registration at moveleads.cloud/register.
              </span>
            </div>
          </div>

          {/* ── Program disclosures ── */}
          <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 18px' }}>
            Program details
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
            {[
              { icon: <MessageSquare size={17} />, title: 'What you will receive', body: 'Lead notifications when a moving job matches your service area, account notifications (verification codes, purchase confirmations, balance updates), onboarding information, and occasional promotional offers.' },
              { icon: <Info size={17} />, title: 'Message frequency varies', body: 'Frequency depends on lead activity in your service area and your notification preferences. Message and data rates may apply per your mobile carrier plan.' },
              { icon: <ShieldCheck size={17} />, title: 'Your number stays private', body: 'Mobile numbers are never sold, rented, or shared with third parties for marketing purposes. Opt-in data is shared only with our SMS delivery provider (Twilio) to deliver the messages you requested.' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, padding: '16px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fff7ed', color: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 3 }}>{item.title}</div>
                  <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.65 }}>{item.body}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── STOP / HELP ── */}
          <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 18px' }}>
            Opting out &amp; getting help
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 40 }}>
            <div style={{ padding: '18px 20px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#b91c1c', marginBottom: 6 }}>Reply STOP</div>
              <div style={{ fontSize: 13.5, color: '#7f1d1d', lineHeight: 1.6 }}>
                Text <strong>STOP</strong> to any message to unsubscribe at any time. You will
                receive one final confirmation and no further messages. Reply START to re-subscribe.
              </div>
            </div>
            <div style={{ padding: '18px 20px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>Reply HELP</div>
              <div style={{ fontSize: 13.5, color: '#1e3a8a', lineHeight: 1.6 }}>
                Text <strong>HELP</strong> to any message for assistance, or email{' '}
                <a href="mailto:support@moveleads.cloud" style={{ color: '#1d4ed8', fontWeight: 700 }}>support@moveleads.cloud</a>.
              </div>
            </div>
          </div>

          {/* ── Footer / company ── */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 24, fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>
            <strong style={{ color: NAVY }}>MoveLeads LLC</strong> — technology platform and
            lead marketplace for moving companies. Registered in Wyoming, United States.<br />
            Website: <a href="https://moveleads.cloud" style={{ color: ORANGE, fontWeight: 600 }}>https://moveleads.cloud</a>{' · '}
            Support: <a href="mailto:support@moveleads.cloud" style={{ color: ORANGE, fontWeight: 600 }}>support@moveleads.cloud</a><br />
            See our <Link to="/terms" style={{ color: ORANGE, fontWeight: 600 }}>Terms of Service</Link>{' '}
            and <Link to="/privacy" style={{ color: ORANGE, fontWeight: 600 }}>Privacy Policy</Link> for the full SMS program terms.
          </div>

        </div>
      </section>
    </MarketingLayout>
  );
}
