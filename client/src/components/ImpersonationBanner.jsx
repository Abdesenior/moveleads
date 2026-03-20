import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ShieldAlert, LogOut } from 'lucide-react';

export default function ImpersonationBanner() {
  const { user, isImpersonating, stopImpersonating } = useContext(AuthContext);

  if (!isImpersonating) return null;

  return (
    <div style={{
      background: 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)',
      color: 'white',
      padding: '10px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 11000,
      boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
      fontFamily: 'Poppins, sans-serif'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ShieldAlert size={20} />
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          GOD MODE: You are currently impersonating <span style={{ textDecoration: 'underline' }}>{user?.companyName}</span> ({user?.email})
        </div>
      </div>
      
      <button 
        onClick={stopImpersonating}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          borderRadius: 8,
          color: 'white',
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 800,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'all 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
      >
        <LogOut size={14} /> Exit Impersonation
      </button>

      <style>{`
        body { margin-top: 0 !important; } /* Reset if layout adds margin */
      `}</style>
    </div>
  );
}
