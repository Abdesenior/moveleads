import { useEffect, useState, useContext } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, ArrowRight, RefreshCw, Mail } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import '../auth.css';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { API_URL } = useContext(AuthContext);

  const [status, setStatus]       = useState('loading'); // 'loading' | 'success' | 'error' | 'resending' | 'resent'
  const [message, setMessage]     = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendError, setResendError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found. Please check the link in your email.');
      return;
    }

    fetch(`${API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.code) {
          setStatus('error');
          setMessage(data.msg || 'Verification failed. The link may be invalid or expired.');
        } else {
          setStatus('success');
          setMessage(data.msg || 'Email verified successfully!');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Something went wrong. Please try again later.');
      });
  }, [token, API_URL]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResendError('');
    setStatus('resending');

    try {
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      if (res.ok) {
        setStatus('resent');
      } else {
        setStatus('error');
        setResendError('Failed to send. Please try again.');
      }
    } catch {
      setStatus('error');
      setResendError('Network error. Please try again.');
    }
  };

  return (
    <div className="verify-email-wrapper">
      <div className="verify-email-card">
        {/* Logo */}
        <div style={{ marginBottom: 40, fontFamily: 'Poppins' }}>
          <span style={{ fontWeight: 800, fontSize: 28, color: 'var(--bg-navy)' }}>MoveLeads</span>
          <span style={{ fontWeight: 800, fontSize: 28, color: '#f97316' }}>.cloud</span>
        </div>

        {/* ── Loading ── */}
        {status === 'loading' && (
          <div className="verification-success-panel">
            <div className="verification-icon-circle loading">
              <Loader2 size={32} className="spin-animation" />
            </div>
            <h1 style={{ fontSize: 24, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>
              Verifying your account…
            </h1>
            <p style={{ color: '#94a3b8', fontSize: 15 }}>
              Please wait while we confirm your email.
            </p>
          </div>
        )}

        {/* ── Success ── */}
        {status === 'success' && (
          <div className="verification-success-panel">
            <div className="verification-icon-circle success">
              <CheckCircle2 size={32} />
            </div>
            <h1 style={{ fontSize: 24, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>
              Verification Successful!
            </h1>
            <p style={{ color: '#475569', fontSize: 16, lineHeight: 1.7, marginBottom: 32, maxWidth: 380 }}>
              Your email has been verified. You can now log in and start receiving leads.
            </p>
            <Link to="/login" className="auth-btn" style={{ display: 'inline-flex', textDecoration: 'none', maxWidth: 280 }}>
              Go to Login <ArrowRight size={18} />
            </Link>
          </div>
        )}

        {/* ── Error + resend form ── */}
        {status === 'error' && (
          <div className="verification-success-panel">
            <div className="verification-icon-circle error">
              <XCircle size={32} />
            </div>
            <h1 style={{ fontSize: 24, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>
              Verification Failed
            </h1>
            <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, marginBottom: 28, maxWidth: 380 }}>
              {message}
            </p>

            {/* Resend form */}
            <form onSubmit={handleResend} style={{ width: '100%', maxWidth: 360 }}>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 10, textAlign: 'left' }}>
                Request a new verification link:
              </p>
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={resendEmail}
                onChange={e => setResendEmail(e.target.value)}
                className="form-input"
                style={{ marginBottom: 10 }}
              />
              {resendError && (
                <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{resendError}</p>
              )}
              <button type="submit" className="auth-btn" style={{ display: 'inline-flex', gap: 8 }}>
                <RefreshCw size={16} /> Resend Verification Email
              </button>
            </form>

            <Link to="/login" style={{ marginTop: 20, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>
              Back to login
            </Link>
          </div>
        )}

        {/* ── Resending ── */}
        {status === 'resending' && (
          <div className="verification-success-panel">
            <div className="verification-icon-circle loading">
              <Loader2 size={32} className="spin-animation" />
            </div>
            <h1 style={{ fontSize: 24, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>
              Sending…
            </h1>
          </div>
        )}

        {/* ── Resent confirmation ── */}
        {status === 'resent' && (
          <div className="verification-success-panel">
            <div className="verification-icon-circle loading">
              <Mail size={32} />
            </div>
            <h1 style={{ fontSize: 24, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>
              Check your inbox
            </h1>
            <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, marginBottom: 32, maxWidth: 380 }}>
              If that address is registered and unverified, we've sent a new link. It expires in 24 hours.
            </p>
            <Link to="/login" className="auth-btn" style={{ display: 'inline-flex', textDecoration: 'none', maxWidth: 280 }}>
              Back to Login <ArrowRight size={18} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
