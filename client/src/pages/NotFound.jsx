import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const ORANGE = '#f97316';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: F,
      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      padding: '20px'
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: 480,
        padding: '60px 40px',
        background: 'white',
        borderRadius: 24,
        boxShadow: '0 4px 40px rgba(0,0,0,0.06)'
      }}>
        <div style={{
          fontSize: 120,
          fontWeight: 900,
          background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1
        }}>
          404
        </div>
        
        <h1 style={{
          fontSize: 24,
          fontWeight: 700,
          color: '#0b1628',
          marginTop: 16,
          marginBottom: 12
        }}>
          Page Not Found
        </h1>
        
        <p style={{
          fontSize: 15,
          color: '#64748b',
          lineHeight: 1.6,
          marginBottom: 32
        }}>
          The page you're looking for doesn't exist or has been moved.
          Let's get you back on track.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: ORANGE,
            color: 'white',
            textDecoration: 'none',
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 14,
            transition: 'all 0.2s'
          }}>
            <Home size={16} />
            Go Home
          </Link>
          
          <button onClick={() => window.history.back()} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: 'white',
            color: '#0b1628',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}>
            <ArrowLeft size={16} />
            Go Back
          </button>
        </div>

        <div style={{
          marginTop: 40,
          paddingTop: 24,
          borderTop: '1px solid #e2e8f0'
        }}>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>
            If you think this is an error, please contact support.
          </p>
          <Link to="/contact" style={{
            fontSize: 13,
            color: ORANGE,
            textDecoration: 'none',
            fontWeight: 500
          }}>
            Contact Support →
          </Link>
        </div>
      </div>
    </div>
  );
}
