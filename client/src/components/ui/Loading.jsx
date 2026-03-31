import React from 'react';

const ORANGE = '#f97316';

export function Spinner({ size = 24, color = ORANGE }) {
  return (
    <div style={{
      width: size,
      height: size,
      border: `${size / 6}px solid ${color}20`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite'
    }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export function LoadingScreen({ message = 'Loading...' }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      background: '#f8fafc'
    }}>
      <Spinner size={40} />
      <span style={{
        fontSize: 14,
        color: '#64748b',
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }}>
        {message}
      </span>
    </div>
  );
}

export function ButtonSpinner({ size = 16 }) {
  return (
    <div style={{
      width: size,
      height: size,
      border: '2px solid currentColor',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      display: 'inline-block'
    }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export function Skeleton({ width = '100%', height = 16, style = {} }) {
  return (
    <div style={{
      width,
      height,
      background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      borderRadius: 6,
      ...style
    }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div style={{
      background: 'white',
      borderRadius: 12,
      padding: 20,
      border: '1px solid #e2e8f0'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Skeleton width={40} height={40} style={{ borderRadius: '50%' }} />
        <div style={{ flex: 1 }}>
          <Skeleton width="60%" height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
      <Skeleton width="100%" height={12} style={{ marginBottom: 8 }} />
      <Skeleton width="80%" height={12} style={{ marginBottom: 16 }} />
      <Skeleton width="100%" height={36} />
    </div>
  );
}

export default Spinner;
