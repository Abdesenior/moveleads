import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ButtonSpinner } from '../components/ui/Loading';
import { CheckCircle2, Zap, Shield, Clock, ArrowRight, Lock, ShieldCheck, CreditCard, Mail } from 'lucide-react';
import '../auth.css';

export default function Register() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ companyName: '', dotNumber: '', mcNumber: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const navigate = useNavigate();
  const { login, API_URL } = useContext(AuthContext);
  const toast = useToast();

  const handleInput = (e) => setFormData({...formData, [e.target.name]: e.target.value});

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
            <div style={{ fontSize: 28, fontFamily: "'Poppins', sans-serif", marginBottom: 4 }}>
              <span style={{ fontWeight: 800, color: '#fff' }}>MoveLeads</span>
              <span style={{ fontWeight: 800, color: '#f97316' }}>.cloud</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, margin: 0 }}>Lead Marketplace Platform</p>
          </div>

          <div style={{ marginBottom: 48 }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 8 }}>Simple pricing</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 56, fontWeight: 800, color: '#fff', lineHeight: 1, fontFamily: "'Poppins', sans-serif" }}>$10</span>
              <span style={{ paddingBottom: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 16 }}>per lead</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, lineHeight: 1.6, marginBottom: 0 }}>
              No monthly fees. Only pay when you get a lead.
            </p>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 32 }}>
            <h3 style={{ fontSize: 18, color: '#fff', marginBottom: 24, fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}>What you get</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                { icon: <CheckCircle2 size={18} />, title: 'Turnkey Booking Platform', desc: 'Customers build their own quotes' },
                { icon: <Zap size={18} />, title: 'Sales Funnel Built to Convert', desc: 'Scalable funnel for ad campaigns' },
                { icon: <Clock size={18} />, title: 'AI Speed to Call', desc: 'Instant contact & automated follow-up' },
                { icon: <ShieldCheck size={18} />, title: 'Instant Payments', desc: 'Stripe integration for direct payouts' }
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
              <h1 style={{ fontSize: 26, marginBottom: 12, color: 'var(--bg-navy)', fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>
                Account Created!
              </h1>
              <p style={{ color: '#475569', fontSize: 16, lineHeight: 1.7, marginBottom: 8, maxWidth: 380 }}>
                Please check your email to verify your account before logging in.
              </p>
              <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 32 }}>
                We sent a verification link to <strong style={{ color: '#0f172a' }}>{formData.email}</strong>
              </p>
              <Link to="/login" className="auth-btn" style={{ display: 'inline-flex', textDecoration: 'none', maxWidth: 280 }}>
                Go to Login <ArrowRight size={18} />
              </Link>
            </div>
          ) : (
            <>
          <h1 style={{ fontSize: 28, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>Create your account</h1>
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
                background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
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
                    <label>DOT Number</label>
                    <input type="text" name="dotNumber" value={formData.dotNumber} onChange={handleInput} className="form-input" placeholder="123456" />
                  </div>
                  <div className="form-group">
                    <label>MC Number</label>
                    <input type="text" name="mcNumber" value={formData.mcNumber} onChange={handleInput} className="form-input" placeholder="654321" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input type="tel" name="phone" value={formData.phone} onChange={handleInput} required className="form-input" placeholder="+1 (555) 123-4567" />
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
                  <input type="password" name="password" value={formData.password} onChange={handleInput} required className="form-input" placeholder="••••••••" />
                </div>
                <div className="form-group">
                  <label>Confirm Password</label>
                  <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleInput} required className="form-input" placeholder="••••••••" />
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
