import React from 'react';
import { X, ShieldCheck, Zap } from 'lucide-react';

const PACKAGES = [
  { amount: 50, credits: 50, description: 'Starter Pack - Buy ~5 leads' },
  { amount: 100, credits: 100, description: 'Pro Pack - Buy ~10 leads', popular: true },
  { amount: 200, credits: 200, description: 'Growth Pack - Buy ~20 leads' },
  { amount: 500, credits: 500, description: 'Enterprise Pack - Buy ~50 leads' }
];

export default function CreditsModal({ isOpen, onClose, onSelect }) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10, 25, 47, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(8px)' }}>
      <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '24px', padding: '40px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '24px', right: '24px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
          <X size={24} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: '#f0f9ff', borderRadius: '16px', color: '#0369a1', marginBottom: '16px' }}>
            <Zap size={32} />
          </div>
          <h2 style={{ fontSize: '28px', color: '#0f172a', fontWeight: 800, fontFamily: 'Poppins', margin: '0 0 8px 0' }}>Add Credits</h2>
          <p style={{ color: '#64748b', fontSize: '16px' }}>Select a package to top up your balance instantly</p>
        </div>

        <div style={{ display: 'grid', gap: '12px', marginBottom: '32px' }}>
          {PACKAGES.map((pkg) => (
            <button 
              key={pkg.amount} 
              onClick={() => onSelect(pkg.amount)}
              style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', 
                borderRadius: '16px', border: pkg.popular ? '2px solid var(--accent-orange)' : '1px solid #e2e8f0', 
                background: pkg.popular ? '#fff7ed' : 'white', cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'left',
                position: 'relative'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '18px', color: '#0f172a' }}>${pkg.amount}</div>
                <div style={{ color: '#64748b', fontSize: '13px' }}>{pkg.description}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: '20px', color: 'var(--accent-orange)' }}>{pkg.credits} Credits</div>
              </div>
              {pkg.popular && <span style={{ position: 'absolute', top: '-10px', right: '20px', background: 'var(--accent-orange)', color: 'white', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>Most Popular</span>}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12px', justifyContent: 'center' }}>
          <ShieldCheck size={14} /> Secure payment via Stripe
        </div>
      </div>
    </div>
  );
}
