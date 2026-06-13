import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useMoverFunnelPixel } from '../hooks/useMoverFunnelPixel';
import { useToast } from '../components/ui/Toast';
import { ButtonSpinner } from '../components/ui/Loading';
import { CheckCircle2, Zap, Shield, Clock, ArrowRight, Lock, ShieldCheck, CreditCard, Mail, Eye, EyeOff, RefreshCw } from 'lucide-react';
import '../auth.css';

export default function Register() {
  useMoverFunnelPixel();
  const [step, setStep] = useState(1);
  // smsConsent starts UNCHECKED — A2P 10DLC requires affirmative opt-in
  // (no pre-checked boxes). Consent is optional; registration proceeds
  // either way and the value + timestamp + IP are recorded server-side.
  const [formData, setFormData] = useState({ companyName: '', dotNumber: '', mcNumber: '', phone: '', email: '', password: '', confirmPassword: '', smsConsent: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const navigate = useNavigate();
  const { login, API_URL } = useContext(AuthContext);
  const toast = useToast();

  const handleInput = (e) => setFormData({...formData, [e.target.name]: e.target.value});

  const handleNumericInput = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    setFormData(prev => ({ ...prev, [e.target.name]: digits }));
  };

  const formatPhone = (raw) => {
    let d = (raw || '').replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
    d = d.slice(0, 10);
    if (d.length === 0) return '';
    if (d.length <= 3) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  };

  const handlePhoneInput = (e) => {
    setFormData(prev => ({ ...prev, phone: formatPhone(e.target.value) }));
  };

  const handleResend = async () => {
    if (!formData.email || resendLoading) return;
    setResendLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      });
      if (res.ok) {
        setResendSuccess(true);
        toast.success('Email sent', 'Verification link has been re-sent to your inbox');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error('Failed to send', data.msg || 'Please try again in a few minutes');
      }
    } catch {
      toast.error('Failed to send', 'Please try again');
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      toast.warning('Passwords do not match', 'Please make sure both passwords are the same');
      return;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      toast.warning('Password too short', 'Password must be at least 8 characters');
      return;
    }
    if (formData.dotNumber && (formData.dotNumber.length < 5 || formData.dotNumber.length > 8)) {
      setError('USDOT Number must be 5–8 digits');
      toast.warning('Invalid USDOT Number', 'USDOT Number must be 5–8 digits');
      return;
    }
    if (formData.mcNumber && (formData.mcNumber.length < 4 || formData.mcNumber.length > 8)) {
      setError('MC Number must be 4–8 digits');
      toast.warning('Invalid MC Number', 'MC Number must be 4–8 digits');
      return;
    }
    const phoneDigits = (formData.phone || '').replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      setError('Phone number must be a valid 10-digit US number');
      toast.warning('Invalid phone number', 'Please enter a valid 10-digit US phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.msg || 'Registration failed');
      
      if (data.user && data.user.role === 'admin') {
        login(data.token, data.user);
        toast.success('Welcome!', 'Successfully logged in as admin');
        navigate('/admin');
        return;
      }

      // Auto-login: backend now issues a JWT at register so the new partner
      // is authenticated immediately. We DON'T navigate yet — instead we show
      // a "check your inbox" splash so they understand verification is required
      // for activation. They CAN proceed to dashboard (token is set), but the
      // wizard auto-mount + activation are gated on isEmailVerified.
      if (data.token && data.user) {
        login(data.token, data.user);
        setRegistrationSuccess(true);
        toast.success('Account created!', 'Please check your email to verify your account');
        return;
      }

      // Fallback (server in old behavior, no auto-login): show same splash.
      setRegistrationSuccess(true);
      toast.success('Account created!', 'Please check your email to verify your account');
    } catch (err) {
      setError(err.message);
      toast.error('Registration failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split">
      <div className="auth-left">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 28, fontFamily: 'var(--font-heading)', marginBottom: 4 }}>
              <span style={{ fontWeight: 800, color: '#fff' }}>MoveLeads</span>
              <span style={{ fontWeight: 800, color: '#f97316' }}>.cloud</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, margin: 0 }}>Lead Marketplace Platform</p>
          </div>

          <div style={{ marginBottom: 36 }}>
            {/* Eyebrow with pulse dot */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 22 }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#f97316',
                boxShadow: '0 0 0 4px rgba(249,115,22,0.18)',
              }} />
              <span style={{
                color: '#fb923c', fontSize: 12, fontWeight: 800,
                letterSpacing: '0.14em', textTransform: 'uppercase',
              }}>First-time mover bonus</span>
            </div>

            {/* Claim your free / $50 [FREE] / unlock credit — tight typographic stack */}
            <p style={{
              color: 'rgba(255,255,255,0.55)',
              fontSize: 20, fontWeight: 500, lineHeight: 1.1,
              margin: '0 0 4px',
              fontFamily: 'var(--font-heading)',
              letterSpacing: '-0.005em',
            }}>
              Claim your free
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 68, fontWeight: 900, color: '#f97316',
                lineHeight: 1, fontFamily: 'var(--font-heading)',
                letterSpacing: '-0.04em',
              }}>$50</span>
              <span style={{
                background: 'linear-gradient(180deg, #fb923c 0%, #f97316 100%)',
                color: '#fff',
                fontSize: 10.5, fontWeight: 800,
                letterSpacing: '0.14em',
                padding: '5px 9px',
                borderRadius: 6,
                boxShadow: '0 6px 18px rgba(249,115,22,0.35)',
              }}>FREE</span>
            </div>
            <p style={{
              color: '#fff', fontSize: 22, fontWeight: 700,
              margin: '0 0 26px',
              fontFamily: 'var(--font-heading)',
              letterSpacing: '-0.01em', lineHeight: 1.2,
            }}>
              unlock credit
            </p>

          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 28 }}>
            <h3 style={{ fontSize: 18, color: '#fff', marginBottom: 24, fontFamily: 'var(--font-heading)', fontWeight: 700 }}>What you get</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* T5 (2026-05-30) — left rail rewritten for the moving-company
                  audience. Pre-Phase-1 copy ("Turnkey Booking Platform",
                  "Sales Funnel Built to Convert", "AI Speed to Call",
                  "Instant Payments") was written for B2B partners/marketing
                  agencies and bounced moving operators on day zero. */}
              {[
                { icon: <CheckCircle2 size={18} />, title: 'Verified moving leads', desc: 'Homeowners in your service area' },
                { icon: <Zap size={18} />, title: 'Pay only for unlocks', desc: 'No subscription, no contract' },
                { icon: <Clock size={18} />, title: 'Text + email alerts', desc: 'The moment a matching request comes in' },
                { icon: <ShieldCheck size={18} />, title: 'Refundable balance', desc: 'If a customer is unreachable, request a refund' }
              ].map((feat, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: 'rgba(249,115,22,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#f97316', flexShrink: 0
                  }}>{feat.icon}</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{feat.title}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{feat.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 40, display: 'flex', gap: 24, fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
            <span><Lock size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }}/> SSL Secured</span>
            <span><Shield size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }}/> GDPR Compliant</span>
            <span><CreditCard size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }}/> Powered by Stripe</span>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div style={{ maxWidth: 480, width: '100%', margin: '0 auto' }}>
          {registrationSuccess ? (
            <div className="verification-success-panel">
              <div className="verification-icon-circle success">
                <Mail size={32} />
              </div>
              <h1 style={{ fontSize: 26, marginBottom: 12, color: 'var(--bg-navy)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
                Check your inbox
              </h1>
              <p style={{ color: '#475569', fontSize: 16, lineHeight: 1.7, marginBottom: 10, maxWidth: 420 }}>
                We sent a verification link to <strong style={{ color: '#0f172a' }}>{formData.email}</strong>.
                Click it to claim your <strong style={{ color: '#ea580c' }}>$50 onboarding credit</strong> and unlock activation.
              </p>
              <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, marginBottom: 24, maxWidth: 420 }}>
                Don't see it? Check your <strong>spam</strong> or <strong>promotions</strong> folder.
                Still nothing? Email <a href="mailto:support@moveleads.cloud" style={{ color: '#ea580c', textDecoration: 'none', fontWeight: 600 }}>support@moveleads.cloud</a>.
              </p>
              {resendSuccess ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 600, fontSize: 14, marginBottom: 20 }}>
                  <CheckCircle2 size={16} />
                  Verification link re-sent — check your inbox.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="resend-btn"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: 'transparent', border: '1px solid #ea580c', color: '#ea580c',
                    padding: '10px 18px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    cursor: resendLoading ? 'wait' : 'pointer', marginBottom: 20,
                  }}
                >
                  {resendLoading ? <ButtonSpinner /> : <RefreshCw size={16} />}
                  {resendLoading ? 'Sending…' : 'Resend verification email'}
                </button>
              )}
              <div style={{ marginTop: 4 }}>
                <Link
                  to="/login"
                  style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}
                >
                  Already verified? Log in →
                </Link>
              </div>
            </div>
          ) : (
            <>
          <h1 style={{ fontSize: 28, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>Create your account</h1>
          <p style={{ color: '#94a3b8', fontSize: 15, marginBottom: 32 }}>Get started with qualified moving leads</p>

          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
              <span>Step {step} of 2</span>
              <span>{step === 1 ? '50%' : '100%'} complete</span>
            </div>
            <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: step === 1 ? '50%' : '100%',
                background: 'linear-gradient(90deg, #ff6a14 0%, #d97706 100%)',
                transition: 'width 0.4s ease',
                borderRadius: 2
              }} />
            </div>
          </div>

          {error && (
            <div style={{
              background: '#fee2e2', color: '#dc2626',
              padding: '14px 18px', borderRadius: 12,
              marginBottom: 24, fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              <span style={{ fontSize: 16 }}>⚠</span> {error}
            </div>
          )}

          <form onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); setStep(2); }}>
            {step === 1 ? (
              <div>
                <div className="form-group">
                  <label>Company Name</label>
                  <input type="text" name="companyName" value={formData.companyName} onChange={handleInput} required className="form-input" placeholder="ACME Moving Company" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label>USDOT Number</label>
                    <input
                      type="text"
                      name="dotNumber"
                      value={formData.dotNumber}
                      onChange={handleNumericInput}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      autoComplete="off"
                      className="form-input"
                      placeholder="1234567"
                    />
                    <small style={{ display: 'block', marginTop: 6, color: 'rgba(15,23,42,0.55)', fontSize: 12, lineHeight: 1.45 }}>
                      Used to help verify licensed moving companies.
                    </small>
                  </div>
                  <div className="form-group">
                    <label>MC Number <span style={{ color: 'rgba(15,23,42,0.45)', fontWeight: 500 }}>(optional)</span></label>
                    <input
                      type="text"
                      name="mcNumber"
                      value={formData.mcNumber}
                      onChange={handleNumericInput}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      autoComplete="off"
                      className="form-input"
                      placeholder="654321"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handlePhoneInput}
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={14}
                    className="form-input"
                    placeholder="(555) 123-4567"
                  />
                  <small style={{ display: 'block', marginTop: 6, color: 'rgba(15,23,42,0.55)', fontSize: 12, lineHeight: 1.45 }}>
                    Used for verification, lead alerts, and account updates.
                  </small>

                  {/* A2P 10DLC consent — UNCHECKED by default (carrier
                     requirement: affirmative opt-in only). Required to
                     continue: the box must be actively checked, so the
                     server always records consent + timestamp + IP. */}
                  <label style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    marginTop: 14, padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(15,23,42,0.03)', border: '1px solid rgba(15,23,42,0.08)',
                    cursor: 'pointer', fontWeight: 400,
                  }}>
                    <input
                      type="checkbox"
                      name="smsConsent"
                      checked={formData.smsConsent}
                      onChange={e => setFormData(prev => ({ ...prev, smsConsent: e.target.checked }))}
                      required
                      style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: '#f97316', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, lineHeight: 1.55, color: 'rgba(15,23,42,0.7)' }}>
                      I agree to receive SMS from MoveLeads LLC. Msg frequency varies.
                      Msg &amp; data rates may apply. Reply STOP to opt out or HELP for help.
                      Consent not required to purchase.
                    </span>
                  </label>
                  <small style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'rgba(15,23,42,0.55)' }}>
                    By signing up, you agree to our{' '}
                    <Link to="/terms" target="_blank" style={{ color: '#f97316', fontWeight: 600 }}>Terms of Service</Link>
                    {' '}and{' '}
                    <Link to="/privacy" target="_blank" style={{ color: '#f97316', fontWeight: 600 }}>Privacy Policy</Link>.
                  </small>
                </div>
                <button type="submit" className="auth-btn">
                  Continue <ArrowRight size={18} />
                </button>
              </div>
            ) : (
              <div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInput} required className="form-input" placeholder="you@company.com" />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleInput}
                      required
                      className="form-input"
                      placeholder="••••••••"
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(s => !s)}
                      aria-label={showPwd ? 'Hide password' : 'Show password'}
                      style={{
                        position: 'absolute', right: 12, top: '50%',
                        transform: 'translateY(-50%)', background: 'transparent',
                        border: 'none', cursor: 'pointer', color: '#94a3b8',
                        display: 'inline-flex', alignItems: 'center',
                        justifyContent: 'center', padding: 4,
                      }}
                    >
                      {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirmPwd ? 'text' : 'password'}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleInput}
                      required
                      className="form-input"
                      placeholder="••••••••"
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPwd(s => !s)}
                      aria-label={showConfirmPwd ? 'Hide password' : 'Show password'}
                      style={{
                        position: 'absolute', right: 12, top: '50%',
                        transform: 'translateY(-50%)', background: 'transparent',
                        border: 'none', cursor: 'pointer', color: '#94a3b8',
                        display: 'inline-flex', alignItems: 'center',
                        justifyContent: 'center', padding: 4,
                      }}
                    >
                      {showConfirmPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <button type="button" className="secondary-btn" onClick={() => setStep(1)} style={{ flex: 1, padding: 14, justifyContent: 'center' }}>Back</button>
                  <button type="submit" disabled={loading} className="auth-btn" style={{ flex: 2 }}>
                    {loading ? <><ButtonSpinner /> Creating...</> : 'Create Account'}
                  </button>
                </div>
              </div>
            )}
          </form>

          <p style={{ marginTop: 32, textAlign: 'center', fontSize: 14, color: '#94a3b8' }}>
            Already have an account? <Link to="/login" style={{ color: 'var(--bg-navy)', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
