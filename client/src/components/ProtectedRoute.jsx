import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

// ── ProtectedRoute ─────────────────────────────────────────────────────────
// Three layers of gating:
//   1. No token              → /login
//   2. requireAdmin + non-admin → /dashboard
//   3. Unverified (non-admin) → /verify-email-pending  (the hard gate)
//
// `skipVerificationCheck` is the escape hatch for the verification-pending
// page itself (else we'd loop). Admin / super_admin always bypass the
// verification check — this mirrors the server-side bypass in
// requireEmailVerified middleware and prevents seed admin accounts from
// locking the platform out of itself.
export default function ProtectedRoute({ children, requireAdmin = false, skipVerificationCheck = false }) {
  const { user, token, loading } = useContext(AuthContext);

  if (loading) return <div style={{padding:'40px', textAlign:'center', fontFamily:'var(--font-body)'}}>Authorizing Session...</div>;

  if (!token) return <Navigate to="/login" replace />;

  if (requireAdmin && !['admin','super_admin'].includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Email-verification gate. Admins bypass (mirrors server). The
  // verification-pending page passes skipVerificationCheck to avoid a loop.
  if (!skipVerificationCheck && user) {
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    if (!isAdmin && user.isEmailVerified !== true) {
      return <Navigate to="/verify-email-pending" replace />;
    }
  }

  return children;
}
