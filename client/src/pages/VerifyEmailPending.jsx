import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, RefreshCw, CheckCircle2, LogOut, Phone } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ButtonSpinner } from '../components/ui/Loading';
import { useMoverFunnelPixel } from '../hooks/useMoverFunnelPixel';
import '../auth.css';

// ── VerifyEmailPending ─────────────────────────────────────────────────────
// The hard-gate landing page that ProtectedRoute redirects authenticated-
// but-unverified users to. Mirrors the post-register splash but is
// reachable from anywhere (e.g. when a user resumes a session and finds
// they still haven't clicked the link).
//
// Auth-required (no token → /login) but verification-NOT-required (else
// infinite redirect). App.jsx wraps this in a token-only ProtectedRoute by
// virtue of the user being inside AuthProvider; we double-check below.
export default function VerifyEmailPending() {
  useMoverFunnelPixel();
  const { user, token, API_URL, logout, refreshUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const toast = useToast();

  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Edge case: someone hits /verify-email-pending without a token. Send
  // them to /login. We can't use a route-level guard here because that
  // would defeat the purpose of this page existing.
  if (!token) {
    navigate('/login', { replace: true });
    return null;
  }

  // Edge case: the user IS verified but landed here anyway (e.g. they
  // verified in another tab and the local state already refreshed).
  // Bounce them to the dashboard so they don't get stuck.
  if (user?.isEmailVerified === true) {
    navigate('/dashboard/leads', { replace: true });
    return null;
  }

  const email = user?.email || '';

  const handleResend = async () => {
    if (!email || resendLoading) return;
    setResendLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setResendSuccess(true);
        toast.success('Email sent', 'Verification link sent to your inbox');
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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshUser();
      // If verification flipped, ProtectedRoute on /dashboard/leads will let
      // them in. If still unverified, the user/role check above re-renders.
      toast.success('Refreshed', 'Account status updated');
    } catch {
      toast.error('Could not refresh', 'Please try again');
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="verify-email-wrapper">
      <div className="verify-email-card">
        <div style={{ marginBottom: 40, fontFamily: 'var(--font-heading)' }}>
          <span style={{ fontWeight: 800, fontSize: 28, color: 'var(--bg-navy)' }}>MoveLeads</span>
          <span style={{ fontWeight: 800, fontSize: 28, color: '#f97316' }}>.cloud</span>
        </div>

        <div className="verification-success-panel">
          <div className="verification-icon-circle success">
            <Mail size={32} />
          </div>
          <h1 style={{ fontSize: 26, marginBottom: 12, color: 'var(--bg-navy)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
            Check your inbox
          </h1>
          <p style={{ color: '#475569', fontSize: 16, lineHeight: 1.7, marginBottom: 10, maxWidth: 420 }}>
            We sent a verification link to{' '}
            <strong style={{ color: '#0f172a' }}>{email || 'your email address'}</strong>.
            Click it to unlock your dashboard.
          </p>
          <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, marginBottom: 24, maxWidth: 420 }}>
            Don't see it? Check your <strong>spam</strong> or <strong>promotions</strong> folder.
            Still nothing? Email{' '}
            <a href="mailto:support@moveleads.cloud" style={{ color: '#ea580c', textDecoration: 'none', fontWeight: 600 }}>
              support@moveleads.cloud
            </a>
            {' '}or call{' '}
            <a href="tel:+13072044792" style={{ color: '#ea580c', textDecoration: 'none', fontWeight: 600 }}>
              <Phone size={12} style={{ verticalAlign: 'text-bottom', marginRight: 2 }}/>+1 (307) 204-4792
            </a>.
          </p>

          {/* Resend */}
          {resendSuccess ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 600, fontSize: 14, marginBottom: 20 }}>
              <CheckCircle2 size={16} />
              Verification link re-sent — check your inbox.
            </div>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resendLoading || !email}
              className="resend-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#ea580c', border: '1px solid #ea580c', color: '#fff',
                padding: '12px 22px', borderRadius: 10, fontWeight: 700, fontSize: 15,
                cursor: resendLoading ? 'wait' : 'pointer', marginBottom: 20,
              }}
            >
              {resendLoading ? <ButtonSpinner /> : <RefreshCw size={16} />}
              {resendLoading ? 'Sending…' : 'Resend verification email'}
            </button>
          )}

          {/* Already verified? Refresh */}
          <div style={{ marginTop: 4, marginBottom: 14 }}>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                background: 'transparent', border: 'none',
                color: '#0f172a', fontSize: 14, fontWeight: 600,
                textDecoration: 'underline', cursor: refreshing ? 'wait' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {refreshing ? <ButtonSpinner /> : null}
              {refreshing ? 'Refreshing…' : 'Already verified? Refresh'}
            </button>
          </div>

          {/* Logout escape hatch — for wrong-email situations */}
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: 'transparent', border: 'none',
                color: '#94a3b8', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <LogOut size={13} />
              Wrong email? Log out and re-register
            </button>
          </div>

          <div style={{ marginTop: 24, fontSize: 12, color: '#94a3b8' }}>
            <Link to="/login" style={{ color: '#94a3b8', textDecoration: 'none' }}>
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
