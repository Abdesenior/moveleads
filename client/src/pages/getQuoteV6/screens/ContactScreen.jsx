// client/src/pages/getQuoteV6/screens/ContactScreen.jsx
import { useState } from 'react';
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import FieldInput from '../components/FieldInput';
import FieldError from '../components/FieldError';
import PrimaryButton from '../components/PrimaryButton';

function isValidUSPhone(raw) {
  if (typeof raw !== 'string') return false;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits.slice(1));
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits);
}
function formatUSPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function ContactScreen({ answers, patch, submit, submitting, submitErr, onBack, onClose, section, total, desktop, safeTop }) {
  const [touched, setTouched] = useState({});
  const firstNameOk = (answers.firstName?.trim().length || 0) >= 2;
  const phoneOk = isValidUSPhone(answers.customerPhone || '');
  const emailOk = !answers.customerEmail || /^\S+@\S+\.\S+$/.test(answers.customerEmail.trim());
  const canSubmit = firstNameOk && phoneOk && emailOk && !submitting;

  const onPrimary = () => {
    setTouched({ firstName: true, phone: true, email: true });
    if (canSubmit) submit();
  };

  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Contact" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 4 · You' : 'Almost done'}
          title="Who should the movers call?"
          sub="Up to 3 vetted movers will reach out directly. Your info is never sold."
          size={desktop ? 'lg' : 'md'}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FieldInput icon="user" label="First name" placeholder="Your name" value={answers.firstName} onChange={v => patch({ firstName: v })} autoComplete="given-name" autoFocus />
          {touched.firstName && !firstNameOk && <FieldError>Please enter your first name.</FieldError>}

          <FieldInput
            icon="phone" label="Mobile number" placeholder="(555) 123-4567"
            value={formatUSPhone(answers.customerPhone)}
            onChange={v => patch({ customerPhone: v.replace(/\D/g, '').slice(0, 10) })}
            type="tel" inputMode="numeric" autoComplete="tel"
          />
          {touched.phone && !phoneOk && <FieldError>Enter a valid US mobile number.</FieldError>}

          <FieldInput icon="mail" label="Email (optional)" placeholder="you@email.com" value={answers.customerEmail} onChange={v => patch({ customerEmail: v })} type="email" autoComplete="email" />
          {touched.email && !emailOk && <FieldError>Enter a valid email or leave blank.</FieldError>}
        </div>

        {submitErr && (
          <div style={{
            padding: 14, borderRadius: 14,
            background: '#fef2f2', border: '1px solid #fecaca',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--danger)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontSize: 13, fontWeight: 700,
            }}>!</div>
            <div style={{ flex: 1, fontSize: 13.5, color: '#7f1d1d', lineHeight: 1.4 }}>
              <div style={{ fontWeight: 600 }}>Couldn't reach our movers.</div>
              <div style={{ marginTop: 2 }}>{submitErr} Your details are saved — tap below to try again.</div>
            </div>
          </div>
        )}

        <PrimaryButton onClick={onPrimary} disabled={!canSubmit} loading={submitting}>
          {submitting ? 'Sending…' : 'See my movers'}
        </PrimaryButton>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.5, padding: '0 8px' }}>
          By continuing, you agree to receive a call or text from up to 3 licensed movers regarding your request. Standard rates apply.
        </div>
      </ScreenWrap>
    </>
  );
}
