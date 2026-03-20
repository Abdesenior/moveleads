import React from 'react';
import { X, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';

export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText, type = 'danger' }) {
  if (!isOpen) return null;

  const colors = {
    danger: { bg: '#fef2f2', icon: '#ef4444', btn: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', shadow: 'rgba(239,68,68,0.3)' },
    warning: { bg: '#fff7ed', icon: '#f59e0b', btn: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', shadow: 'rgba(245,158,11,0.3)' },
    success: { bg: '#f0fdf4', icon: '#22c55e', btn: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', shadow: 'rgba(34,197,94,0.3)' }
  };

  const c = colors[type] || colors.danger;

  const IconComponent = type === 'danger' ? AlertTriangle : type === 'warning' ? AlertCircle : CheckCircle;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10, 25, 47, 0.7)',
      backdropFilter: 'blur(12px)',
      zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
      animation: 'cmFadeIn 0.25s ease'
    }}>
      <div style={{
        background: 'white',
        width: '100%', maxWidth: 460,
        borderRadius: 24, padding: '36px 32px',
        boxShadow: '0 32px 80px rgba(0, 0, 0, 0.25)',
        position: 'relative', textAlign: 'center',
        animation: 'cmScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16,
          width: 36, height: 36, borderRadius: 10,
          background: '#f8fafc', border: 'none',
          cursor: 'pointer', color: '#94a3b8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s'
        }}>
          <X size={18} />
        </button>

        <div style={{ 
          width: 68, height: 68, 
          background: c.bg, color: c.icon,
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px'
        }}>
          <IconComponent size={32} />
        </div>

        <h2 style={{ fontSize: 22, color: '#0f172a', marginBottom: 12, fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>{title}</h2>
        <p style={{ color: '#64748b', marginBottom: 32, fontSize: 15, lineHeight: 1.6 }}>{message}</p>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onClose} className="secondary-btn" style={{ flex: 1, padding: 14, justifyContent: 'center' }}>Cancel</button>
          <button 
            onClick={() => { onConfirm(); onClose(); }} 
            style={{
              flex: 1, padding: 14,
              background: c.btn, color: '#fff',
              border: 'none', borderRadius: 14,
              fontWeight: 700, fontSize: 14,
              cursor: 'pointer',
              fontFamily: "'Poppins', sans-serif",
              boxShadow: `0 4px 14px ${c.shadow}`,
              transition: 'all 0.25s'
            }}
          >
            {confirmText || 'Confirm'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes cmFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cmScaleIn { from { opacity: 0; transform: scale(0.9) translateY(20px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
    </div>
  );
}
