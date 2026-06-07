import { useEffect, useState, useContext } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, ArrowRight, RefreshCw, Mail } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { useMoverFunnelPixel } from '../hooks/useMoverFunnelPixel';
import { trackMoverCompleteRegistration } from '../utils/metaPixelMovers';
import '../auth.css';

export default function VerifyEmail() {
  useMoverFunnelPixel();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { API_URL, login, user, refreshUser } = useContext(AuthContext);
  const navigate = useNavigate();

  const [status, setStatus]       = useState('loading'); // 'loading' | 'success' | 'error' | 'resending' | 'resent'
  const [message, setMessage]     = useState('');
  const [redirectTarget, setRedirectTarget] = useState('/dashboard/leads');
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
      .then(async data => {
        if (data.code) {
          setStatus('error');
          setMessage(data.msg || 'Verification failed. The link may be invalid or expired.');
          return;
        }
        setStatus('success');
        setMessage('Email verified! Redirecting to your dashboard…');
        // Mover Pixel: CompleteRegistration. event_id matches the server CAPI
        // event so Meta dedups browser vs CAPI. Only fires on real success.
        if (data.metaEventId) trackMoverCompleteRegistration(data.metaEventId);

        // ── WP-A5 — Post-verification redirect ──
        // Server issues a JWT alongside verification. Three cases:
        //  1. Server returned token+user → log in fresh; redirect to dashboard.
        //  2. Already logged in (token in localStorage) → refresh user state
        //     so isEmailVerified flips locally; redirect to dashboard.
        //  3. Not logged in, no token returned → redirect to /login.
        if (data.token && data.user) {
          login(data.token, data.user);
          // /auth/verify-email's JWT response payload doesn't include
          // isEmailVerified, but the server DID flip it to true (line 188
          // of routes/auth.js). Pull fresh user state so ProtectedRoute
          // sees isEmailVerified=true before we navigate — otherwise the
          // guard bounces us right back to /verify-email-pending.
          if (refreshUser) {
            try { await refreshUser(); } catch { /* non-fatal */ }
          }
          setRedirectTarget('/dashboard/leads');
          setTimeout(() => navigate('/dashboard/leads'), 800);
        } else if (user) {
          // Logged in via existing token — pull fresh user state so
          // isEmailVerified flips locally before navigating.
          if (refreshUser) {
            try { await refreshUser(); } catch { /* non-fatal */ }
          }
          setRedirectTarget('/dashboard/leads');
          setTimeout(() => navigate('/dashboard/leads'), 800);
        } else {
          setMessage('Email verified! Please log in to continue.');
          setRedirectTarget('/login');
          setTimeout(() => navigate('/login', {
            state: { message: 'Email verified — please log in.' }
          }), 1200);
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Something went wrong. Please try again later.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div style={{ marginBottom: 40, fontFamily: 'var(--font-heading)' }}>
          <span style={{ fontWeight: 800, fontSize: 28, color: 'var(--bg-navy)' }}>MoveLeads</span>
          <span style={{ fontWeight: 800, fontSize: 28, color: '#f97316' }}>.cloud</span>
        </div>

        {/* ── Loading ── */}
        {status === 'loading' && (
          <div className="verification-success-panel">
            <div className="verification-icon-circle loading">
              <Loader2 size={32} className="spin-animation" />
            </div>
            <h1 style={{ fontSize: 24, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
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
            <h1 style={{ fontSize: 24, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
              Email verified!
            </h1>
            <p style={{ color: '#475569', fontSize: 16, lineHeight: 1.7, marginBottom: 32, maxWidth: 380 }}>
              {message}
            </p>
            <Link to={redirectTarget} className="auth-btn" style={{ display: 'inline-flex', textDecoration: 'none', maxWidth: 280 }}>
              {redirectTarget === '/login' ? 'Go to login' : 'Continue to dashboard'} <ArrowRight size={18} />
            </Link>
          </div>
        )}

        {/* ── Error + resend form ── */}
        {status === 'error' && (
          <div className="verification-success-panel">
            <div className="verification-icon-circle error">
              <XCircle size={32} />
            </div>
            <h1 style={{ fontSize: 24, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
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
            <h1 style={{ fontSize: 24, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
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
            <h1 style={{ fontSize: 24, marginBottom: 8, color: 'var(--bg-navy)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
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
