import { useEffect } from 'react';
import { X, CheckCircle } from 'lucide-react';

// One-time reassurance popup shown 3s after the partner's first balance event
// (activation OR top-up). Trigger logic + persistence lives in DashboardLayout;
// this is a presentational component with X-only dismiss (no CTAs).
export default function FirstTopupReassurancePopup({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-topup-popup-title"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,25,47,0.7)', backdropFilter: 'blur(12px)',
        // Sits above the top-up modal (10001) and the dashboard sticky header.
        zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'blFadeIn 0.25s ease',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 22, width: '100%', maxWidth: 460,
          maxHeight: '92vh', overflow: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
          animation: 'blScaleIn 0.3s cubic-bezier(0.16,1,0.3,1)',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          type="button"
          style={{
            position: 'absolute', top: 12, right: 12, width: 44, height: 44, borderRadius: 10,
            background: '#f1f5f9', border: 'none', color: '#475569', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
          }}
        >
          <X size={18} />
        </button>

        <div style={{ padding: '34px 28px 32px' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg,#fff7ed,#ffedd5)',
            border: '1px solid #fed7aa',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <CheckCircle size={26} color="#ea580c" />
          </div>

          <h2
            id="first-topup-popup-title"
            style={{
              margin: '0 0 22px', fontSize: 22, fontWeight: 800, color: '#0f172a',
              fontFamily: 'var(--font-heading)', letterSpacing: -0.3, lineHeight: 1.2,
            }}
          >
            Your balance is ready
          </h2>

          {/* L11 (2026-05-30) — supply-management copy reworded to lean
              on "we'll alert you" framing instead of "we recommend waiting."
              Lead supply is limited; this popup exists to manage expectations
              without dampening intent. Structure preserved per Correction 2. */}
          <p style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.55, color: '#1f2937' }}>
            We'll text and email you the moment a{' '}
            <span style={{ color: '#ea580c', fontWeight: 700 }}>matching move request</span>{' '}
            comes in.
          </p>

          <p style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.55, color: '#1f2937' }}>
            You can also{' '}
            <span style={{ color: '#ea580c', fontWeight: 700 }}>browse the marketplace</span>{' '}
            anytime.
          </p>

          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#475569' }}>
            Your balance stays{' '}
            <span style={{ color: '#ea580c', fontWeight: 700 }}>refundable</span>{' '}
            if a lead becomes unreachable.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes blFadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes blScaleIn { from { opacity:0; transform:scale(0.9) translateY(20px) } to { opacity:1; transform:scale(1) translateY(0) } }
      `}</style>
    </div>
  );
}
