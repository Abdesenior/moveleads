import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, token, loading } = useContext(AuthContext);

  if (loading) return <div style={{padding:'40px', textAlign:'center', fontFamily:'var(--font-body)'}}>Authorizing Session...</div>;

  if (!token) return <Navigate to="/login" replace />;

  // Block unverified customer accounts from reaching the dashboard
  if (user && user.isEmailVerified === false && user.role === 'customer') {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && user?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return children;
}
