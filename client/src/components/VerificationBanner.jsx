import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, X, RefreshCw } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { ButtonSpinner } from './ui/Loading';

const ORANGE = '#f97316';

export default function VerificationBanner() {
  const { user, API_URL } = useContext(AuthContext);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  if (!user || user.isVerified || dismissed) return null;

  const handleResend = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email })
      });
      if (res.ok) {
        setSent(true);
      }
    } catch (err) {
      console.error('Failed to resend:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
      borderBottom: '1px solid #fed7aa',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      flexWrap: 'wrap'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Mail size={18} color={ORANGE} />
        <span style={{ fontSize: 14, color: '#0b1628', fontWeight: 500 }}>
          Please verify your email to access all features.
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {sent ? (
          <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>
            Verification email sent!
          </span>
        ) : (
          <button
            onClick={handleResend}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              background: ORANGE,
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? <ButtonSpinner size={12} /> : <RefreshCw size={12} />}
            Resend Email
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          style={{
            padding: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
