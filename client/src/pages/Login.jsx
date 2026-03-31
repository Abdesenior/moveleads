import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Zap, CheckCircle, Lock, Mail, RefreshCw } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ButtonSpinner } from '../components/ui/Loading';
import '../auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  
  const navigate = useNavigate();
  const { login, API_URL } = useContext(AuthContext);
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setUnverified(false);
    setResendSuccess(false);
    
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          setUnverified(true);
          setError(data.msg);
          toast.warning('Email not verified', data.msg);
          return;
        }
        throw new Error(data.msg || 'Login failed');
      }
      
      login(data.token, data.user);
      toast.success('Welcome back!', 'Successfully signed in');
      navigate(data.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.message);
      toast.error('Login failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        setResendSuccess(true);
        toast.success('Email sent', 'Verification link has been sent to your email');
      } else {
        const data = await res.json();
        toast.error('Failed to send', data.msg || 'Please try again');
      }
    } catch {
      toast.error('Failed to send', 'Please try again');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-brand">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 28, fontFamily: "'Poppins', sans-serif", marginBottom: 4 }}>
              <span style={{ fontWeight: 800, color: '#fff' }}>MoveLeads</span>
              <span style={{ fontWeight: 800, color: '#f97316' }}>.cloud</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, margin: 0 }}>Lead Marketplace Platform</p>
          </div>

          <h2 style={{ fontSize: 36, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 16, fontFamily: "'Poppins', sans-serif" }}>
            Grow your moving<br />business with<br />
            <span style={{ color: '#f97316' }}>verified leads</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, lineHeight: 1.7, marginBottom: 48, maxWidth: 420 }}>
            Access fresh, high-intent moving leads matched to your service area. Convert more customers with less effort.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { icon: <Zap size={18} />, title: 'Real-time leads', desc: 'Fresh leads delivered instantly' },
              { icon: <Shield size={18} />, title: 'Verified customers', desc: 'Every lead is pre-screened' },
              { icon: <CheckCircle size={18} />, title: '20% avg. conversion', desc: 'Industry-leading close rates' }
            ].map((feat, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(249,115,22,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#f97316', flexShrink: 0
                }}>{feat.icon}</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{feat.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{feat.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="login-form-side">
        <div className="login-card">
          <div className="logo" style={{ marginBottom: '40px', fontFamily: 'Poppins' }}>
            <span style={{ fontWeight: 800, fontSize: '32px', color: '#0f172a' }}>MoveLeads</span>
            <span style={{ fontWeight: 800, fontSize: '32px', color: '#f97316' }}>.cloud</span>
          </div>
          
          <h2 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '8px', color: 'var(--bg-navy)', fontFamily: 'Poppins' }}>Welcome back</h2>
          <p style={{ color: '#94a3b8', fontSize: 15, marginBottom: 32 }}>Sign in to access your dashboard</p>
          
          {unverified && (
            <div className="verification-warning">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Mail size={18} />
                <strong>Email Not Verified</strong>
              </div>
              <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6 }}>
                {error}
              </p>
              {resendSuccess ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 600, fontSize: 14 }}>
                  <CheckCircle size={16} />
                  A new verification link has been sent to your email.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="resend-btn"
                >
                  {resendLoading ? <ButtonSpinner /> : <RefreshCw size={16} />}
                  {resendLoading ? 'Sending…' : 'Resend Verification Email'}
                </button>
              )}
            </div>
          )}

          {error && !unverified && (
            <div style={{
              background: '#fee2e2', color: '#dc2626',
              padding: '14px 18px', borderRadius: '12px',
              marginBottom: '24px', fontSize: '14px', fontWeight: '600',
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              <span style={{ fontSize: 16 }}>⚠</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="form-input" placeholder="you@movingcompany.com" />
            </div>
            
            <div className="form-group" style={{ marginBottom: '8px' }}>
              <label>Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required className="form-input" placeholder="••••••••" />
            </div>
            
            <div style={{ textAlign: 'right', marginBottom: '32px' }}>
              <Link to="/forgot-password" style={{ fontSize: '13px', color: '#f97316', fontWeight: 600, textDecoration: 'none' }}>Forgot password?</Link>
            </div>
            
            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? <><ButtonSpinner /> Signing in...</> : 'Sign In'}
            </button>
          </form>
          
          <p style={{ marginTop: '32px', textAlign: 'center', fontSize: '14px', color: '#94a3b8' }}>
            Don't have an account? <Link to="/register" style={{ color: 'var(--bg-navy)', fontWeight: 700, textDecoration: 'none' }}>Create account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
