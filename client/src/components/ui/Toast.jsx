import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const toastStyles = {
  success: {
    bg: '#ecfdf5',
    border: '#10b981',
    icon: CheckCircle,
    iconColor: '#10b981'
  },
  error: {
    bg: '#fef2f2',
    border: '#ef4444',
    icon: AlertCircle,
    iconColor: '#ef4444'
  },
  warning: {
    bg: '#fffbeb',
    border: '#f59e0b',
    icon: AlertTriangle,
    iconColor: '#f59e0b'
  },
  info: {
    bg: '#eff6ff',
    border: '#3b82f6',
    icon: Info,
    iconColor: '#3b82f6'
  }
};

function Toast({ toast, onRemove }) {
  const style = toastStyles[toast.type] || toastStyles.info;
  const Icon = style.icon;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '14px 16px',
      background: style.bg,
      border: `1px solid ${style.border}`,
      borderRadius: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      minWidth: 300,
      maxWidth: 420,
      animation: 'slideIn 0.3s ease'
    }}>
      <Icon size={20} color={style.iconColor} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <div style={{
            fontWeight: 600,
            fontSize: 14,
            color: '#0b1628',
            marginBottom: toast.message ? 4 : 0
          }}>
            {toast.title}
          </div>
        )}
        {toast.message && (
          <div style={{
            fontSize: 13,
            color: '#64748b',
            lineHeight: 1.5
          }}>
            {toast.message}
          </div>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          color: '#94a3b8',
          flexShrink: 0
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ type = 'info', title, message, duration = 4000 }) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, title, message }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (message, title) => addToast({ type: 'success', title, message }),
    error: (message, title) => addToast({ type: 'error', title, message }),
    warning: (message, title) => addToast({ type: 'warning', title, message }),
    info: (message, title) => addToast({ type: 'info', title, message })
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        zIndex: 99999
      }}>
        {toasts.map(t => (
          <Toast key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
