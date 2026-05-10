import { useState, useRef, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'https://api.moveleads.cloud';

// ── Design tokens ───────────────────────────────────────────────────────────
const T = {
  ink: '#0B1F33',
  ink2: '#475569',
  mute: '#94A3B8',
  bg: '#F8FAFC',
  bg2: '#F1F5F9',
  surface: '#FFFFFF',
  line: '#E2E8F0',
  line2: '#EEF2F7',
  accent: '#FF8A00',
  accentSoft: '#FFEDD5',
  ok: '#10B981',
  warn: '#F59E0B',
  danger: '#DC2626',
  trustGreen: '#005541',
  sans: 'Manrope, "DM Sans", -apple-system, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  cardShadow: '0 12px 28px rgba(11, 31, 51, 0.06)',
  ctaShadow: '0 6px 18px rgba(255, 138, 0, 0.40)',
};

// ── Inline SVG icons (24×24, stroke 1.6) ────────────────────────────────────
const Ico = {
  apt: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M4 9h16M4 15h16M9 3v18M15 3v18" />
    </svg>
  ),
  house: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
      <path d="M9 21v-7h6v7" />
    </svg>
  ),
  truck: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="2" y="7" width="11" height="9" />
      <path d="M13 10h5l3 3v3h-8z" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  ),
  office: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2" />
    </svg>
  ),
  box: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  ),
  piano: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="3" y="6" width="18" height="12" rx="1" />
      <path d="M8 6v8M12 6v8M16 6v8M3 14h18" />
    </svg>
  ),
  bolt: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  ),
  cal: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  cal2: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <circle cx="12" cy="15" r="1.5" fill={c} />
    </svg>
  ),
  clock: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  phone: (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
      <path d="M5 3h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A18 18 0 013 5a2 2 0 012-2z" />
    </svg>
  ),
  shield: (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  pin: (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  ),
  arrow: (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  back: (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  ),
  chev: (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  check: (s = 14, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5 9-11" />
    </svg>
  ),
  spark: (s = 14, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c}>
      <path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2z" />
    </svg>
  ),
  star: (s = 14, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c}>
      <path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7-6.3-3.8L5.7 21.3l1.6-7L2 9.6l7-.6z" />
    </svg>
  ),
};

// ── CSS (single injected sheet with media queries) ──────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

  .gqv4 *, .gqv4 *::before, .gqv4 *::after { box-sizing: border-box; }
  .gqv4 {
    min-height: 100vh; background: ${T.bg};
    font-family: ${T.sans}; color: ${T.ink};
    -webkit-font-smoothing: antialiased;
  }
  @keyframes gqv4-spin { to { transform: rotate(360deg); } }
  @keyframes gqv4-pulse { 0% { box-shadow: 0 0 0 0 currentColor; opacity: 0.55; } 70% { box-shadow: 0 0 0 14px transparent; opacity: 0; } 100% { box-shadow: 0 0 0 0 transparent; opacity: 0; } }
  @keyframes gqv4-fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .gqv4-fadein { animation: gqv4-fadein 280ms cubic-bezier(0.2, 0.8, 0.2, 1); }

  /* ── Top bar ── */
  .gqv4-top {
    height: 60px; padding: 0 20px; display: flex;
    align-items: center; justify-content: space-between;
    background: ${T.surface}; border-bottom: 1px solid ${T.line};
  }
  .gqv4-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; }
  .gqv4-logo-mark { width: 34px; height: 34px; object-fit: contain; display: block; }
  .gqv4-logo-text { font-weight: 800; font-size: 18px; color: ${T.ink}; letter-spacing: -0.025em; }
  .gqv4-top-call {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: 999px;
    background: ${T.surface}; color: ${T.accent};
    border: 1.5px solid ${T.accent};
    font-weight: 700; font-size: 14px; letter-spacing: -0.01em;
    text-decoration: none; cursor: pointer;
    transition: background 160ms ease;
  }
  .gqv4-top-call:hover { background: ${T.accentSoft}; }
  @media (min-width: 768px) {
    .gqv4-top { height: 64px; padding: 0 28px; }
    .gqv4-logo-text { font-size: 20px; }
  }

  /* ── Trust strip ── */
  .gqv4-trust {
    background: rgba(0, 85, 65, 0.08); padding: 10px 16px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    font-size: 13px; font-weight: 500; color: ${T.trustGreen};
    border-bottom: 1px solid ${T.line};
  }
  .gqv4-trust-cta {
    background: none; border: none; padding: 0; margin: 0;
    font-family: inherit; font-size: inherit; line-height: inherit;
    color: ${T.trustGreen}; font-weight: 800; letter-spacing: -0.01em;
    text-decoration: underline; text-underline-offset: 3px;
    cursor: pointer;
  }
  .gqv4-trust-cta:hover { color: #003d2f; }
  @media (min-width: 768px) {
    .gqv4-trust { padding: 12px 28px; font-size: 14px; gap: 10px; }
  }

  /* ── Hero ── */
  .gqv4-hero { background: ${T.bg}; }
  .gqv4-hero-grid { display: block; }
  .gqv4-hero-photo-mobile {
    position: relative; height: 220px; overflow: hidden;
  }
  .gqv4-hero-photo-mobile img {
    width: 100%; height: 100%; object-fit: cover; object-position: center 40%;
  }
  .gqv4-hero-photo-mobile::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(11,31,51,0) 40%, ${T.bg} 100%);
  }
  .gqv4-hero-photo-desktop { display: none; }
  .gqv4-hero-copy { padding: 20px 20px 40px; }

  .gqv4-h1 {
    margin: 0; font-weight: 800; line-height: 1.05; letter-spacing: -0.025em;
    color: ${T.ink}; font-size: 34px;
  }
  .gqv4-h1-accent { color: ${T.accent}; }
  .gqv4-sub {
    margin: 12px 0 0; font-size: 15px; font-weight: 500;
    color: ${T.ink2}; line-height: 1.45;
  }
  @media (min-width: 768px) {
    .gqv4-hero {
      position: relative; overflow: hidden; min-height: 640px;
      background: ${T.ink};
    }
    .gqv4-hero-grid { display: block; }
    .gqv4-hero-photo-mobile { display: none; }
    .gqv4-hero-photo-desktop {
      display: block; position: absolute; inset: 0; z-index: 0;
      background: ${T.surface}; overflow: hidden;
    }
    .gqv4-hero-photo-desktop img {
      width: 100%; height: 100%; object-fit: cover;
      display: block; position: absolute; inset: 0;
    }
    .gqv4-hero-photo-desktop::before { display: none; }
    .gqv4-hero-photo-desktop::after {
      content: ''; position: absolute; inset: 0; pointer-events: none;
      z-index: 1;
      background: linear-gradient(90deg, rgba(11,31,51,0.92) 0%, rgba(11,31,51,0.78) 42%, rgba(11,31,51,0.32) 75%, rgba(11,31,51,0) 100%);
    }
    .gqv4-hero-copy {
      position: relative; z-index: 1;
      max-width: 1280px; margin: 0 auto;
      padding: 80px 56px;
    }
    .gqv4-h1 { font-size: 60px; line-height: 1.0; max-width: 560px; color: #fff; }
    .gqv4-sub { margin-top: 20px; font-size: 18px; max-width: 480px; line-height: 1.5; color: rgba(255,255,255,0.88); }
    .gqv4-trusted-row { border-top-color: rgba(255,255,255,0.18); }
    .gqv4-trusted-label { color: rgba(255,255,255,0.62); }
    .gqv4-trusted-list { color: rgba(255,255,255,0.62); }
  }

  /* ── Hero CTA wrap ── */
  /* ── Google review card ── */
  .gqv4-review {
    background: ${T.surface}; border: 1px solid ${T.line};
    border-radius: 12px; padding: 16px;
  }
  .gqv4-review-head { display: flex; align-items: center; gap: 12px; }
  .gqv4-review-avatar {
    width: 40px; height: 40px; border-radius: 999px;
    background: #0F9D58; color: #fff;
    display: grid; place-items: center; font-weight: 600; font-size: 17px;
  }
  .gqv4-review-name { font-weight: 500; font-size: 14px; color: #202124; line-height: 1.2; }
  .gqv4-review-meta { font-size: 12px; font-weight: 400; color: #5F6368; margin-top: 2px; }
  .gqv4-review-stars { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
  .gqv4-review-stars-when { font-size: 12px; font-weight: 400; color: #5F6368; }
  .gqv4-review-body { margin: 10px 0 0; font-size: 14px; font-weight: 400; color: #202124; line-height: 1.55; }

  /* ── Hero secondary blocks ── */
  .gqv4-trusted-row { padding-top: 24px; border-top: 1px solid ${T.line}; margin-top: 32px; }
  .gqv4-trusted-label {
    font-family: ${T.mono}; font-size: 10px; font-weight: 600;
    letter-spacing: 0.14em; color: ${T.mute}; text-transform: uppercase;
    margin-bottom: 10px;
  }
  .gqv4-trusted-list {
    display: flex; gap: 28px; align-items: center; flex-wrap: wrap;
    font-weight: 700; font-size: 14px; color: ${T.mute}; letter-spacing: -0.01em;
  }
  @media (max-width: 767px) {
    .gqv4-trusted-list { gap: 16px; justify-content: space-between; font-size: 13px; }
  }

  /* ── Hero lead form (unified ZIPs + primary CTA) ── */
  .gqv4-leadform {
    margin-top: 18px;
    display: flex; flex-direction: column; gap: 12px;
    max-width: 480px;
  }
  .gqv4-leadform-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  }
  .gqv4-leadform-field { display: flex; flex-direction: column; min-width: 0; }
  .gqv4-leadform-label {
    font-size: 11px; font-weight: 700; color: ${T.ink2};
    margin-bottom: 5px; letter-spacing: 0.06em; text-transform: uppercase;
  }
  .gqv4-leadform-input {
    display: flex; align-items: center; gap: 8px;
    padding: 0 12px; height: 52px; border-radius: 12px;
    background: ${T.surface}; border: 1.5px solid ${T.line};
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  .gqv4-leadform-input:focus-within { border-color: ${T.accent}; box-shadow: 0 0 0 3px rgba(255,138,0,0.15); }
  .gqv4-leadform-input.found { border-color: ${T.accent}; }
  .gqv4-leadform-input.error { border-color: ${T.danger}; }
  .gqv4-leadform-input input {
    flex: 1; min-width: 0;
    border: none; outline: none; background: transparent;
    font-family: inherit; font-size: 15px; font-weight: 600;
    color: ${T.ink}; letter-spacing: 0.04em;
  }
  .gqv4-leadform-input input::placeholder { color: ${T.mute}; font-weight: 500; letter-spacing: 0; }
  .gqv4-leadform-warn {
    font-size: 12px; font-weight: 500; color: ${T.danger};
    padding: 0 2px;
  }
  .gqv4-leadform-cta {
    width: 100%; height: 56px; border: none;
    border-radius: 14px; background: ${T.accent}; color: #fff;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    font-family: inherit; font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
    box-shadow: ${T.ctaShadow};
    cursor: pointer;
    transition: background 160ms ease, transform 100ms ease;
    margin-top: 4px;
  }
  .gqv4-leadform-cta:hover:not(:disabled) { background: #E67C00; }
  .gqv4-leadform-cta:active:not(:disabled) { transform: scale(0.99); }
  .gqv4-leadform-cta:disabled {
    background: ${T.line}; color: ${T.mute};
    cursor: not-allowed; box-shadow: none;
  }

  /* ── CTA bullets (Free estimate · No obligation · Fast Quote) ── */
  .gqv4-cta-bullets {
    margin-top: 4px;
    display: flex; flex-wrap: wrap; align-items: center;
    justify-content: center; gap: 8px;
    font-size: 13px; font-weight: 500;
    color: ${T.ink2};
  }
  .gqv4-cta-bullets-dot { color: ${T.mute}; opacity: 0.7; }
  .gqv4-cta-bullets-accent { color: ${T.ok}; font-weight: 600; }

  /* ── Service chips (5 quick-pick services) ── */
  .gqv4-service-chips {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin-top: 18px; max-width: 480px;
  }
  .gqv4-service-chip {
    display: inline-flex; align-items: center;
    padding: 8px 14px; border-radius: 999px;
    background: ${T.surface}; border: 1px solid ${T.line};
    font-family: inherit; font-size: 13px; font-weight: 600;
    color: ${T.ink}; cursor: pointer; line-height: 1.2;
    transition: border-color 160ms ease, background 160ms ease, transform 100ms ease;
  }
  .gqv4-service-chip:hover { border-color: ${T.accent}; background: ${T.accentSoft}; }
  .gqv4-service-chip:active { transform: scale(0.98); }

  /* ── Testimonial wrap ── */
  .gqv4-testimonial-wrap { margin-top: 16px; max-width: 540px; }

  @media (min-width: 768px) {
    .gqv4-cta-bullets {
      justify-content: flex-start;
      font-size: 13.5px;
      color: rgba(255, 255, 255, 0.85);
    }
    .gqv4-cta-bullets-dot { color: rgba(255, 255, 255, 0.4); }
    .gqv4-cta-bullets-accent { color: #34D399; }
    .gqv4-service-chips { margin-top: 22px; }
    .gqv4-service-chip {
      background: rgba(255, 255, 255, 0.95);
      border-color: rgba(255, 255, 255, 0.25);
    }
    .gqv4-service-chip:hover {
      background: ${T.surface};
      border-color: ${T.accent};
    }
    .gqv4-testimonial-wrap { margin-top: 22px; }
    .gqv4-leadform { margin-top: 28px; }
    .gqv4-leadform-label { color: rgba(255,255,255,0.78); }
  }

  /* ── Step shell ── */
  .gqv4-step-wrap {
    padding: 32px 16px 60px; min-height: calc(100vh - 60px);
  }
  .gqv4-step-card {
    max-width: 540px; margin: 0 auto;
    background: ${T.surface}; border-radius: 20px;
    box-shadow: ${T.cardShadow}; border: 1px solid ${T.line};
    overflow: hidden;
  }
  @media (min-width: 768px) { .gqv4-step-wrap { padding: 56px 24px 80px; } }

  .gqv4-progress {
    padding: 14px 16px; background: ${T.surface};
    display: flex; align-items: center; gap: 10px;
    border-bottom: 1px solid ${T.line2};
  }
  .gqv4-back-btn {
    width: 32px; height: 32px; border: none; cursor: pointer;
    background: transparent; color: ${T.ink2};
    display: grid; place-items: center; border-radius: 8px;
  }
  .gqv4-back-btn:hover { background: ${T.bg}; }
  .gqv4-progress-track { flex: 1; height: 4px; border-radius: 2px; background: ${T.line}; overflow: hidden; }
  .gqv4-progress-fill {
    height: 100%; background: ${T.accent};
    transition: width 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .gqv4-progress-num {
    font-family: ${T.mono}; font-size: 11px; font-weight: 600;
    color: ${T.ink2}; letter-spacing: 0.05em;
    min-width: 28px; text-align: right;
  }

  .gqv4-step-head { padding: 20px 20px 8px; }
  .gqv4-step-head h2 {
    margin: 0; font-weight: 800; font-size: 24px;
    line-height: 1.15; letter-spacing: -0.015em; color: ${T.ink};
  }
  .gqv4-step-head p {
    margin: 8px 0 0; font-size: 14px; font-weight: 500;
    color: ${T.ink2}; line-height: 1.45;
  }
  .gqv4-step-body { padding: 12px 20px 24px; }

  /* ── Chip ── */
  .gqv4-chips { display: flex; flex-direction: column; gap: 10px; }
  .gqv4-chip {
    position: relative; width: 100%; text-align: left;
    background: ${T.surface}; border: 1px solid ${T.line};
    border-radius: 12px; padding: 16px 15px;
    display: flex; align-items: center; gap: 14px; cursor: pointer;
    transition: all 160ms ease-out; min-height: 64px;
  }
  .gqv4-chip:hover { box-shadow: 0 4px 12px rgba(11,31,51,0.05); }
  .gqv4-chip.active {
    background: ${T.accentSoft}; border: 2px solid ${T.accent};
    padding: 15px 14px; box-shadow: ${T.ctaShadow}; transform: scale(1.01);
  }
  .gqv4-chip-icon {
    position: relative; width: 40px; height: 40px; flex-shrink: 0;
    border-radius: 10px; background: ${T.bg2};
    display: grid; place-items: center; color: ${T.ink};
  }
  .gqv4-chip.active .gqv4-chip-icon { background: ${T.surface}; }
  .gqv4-chip-text { flex: 1; min-width: 0; }
  .gqv4-chip-title { font-weight: 700; font-size: 16px; color: ${T.ink}; letter-spacing: -0.01em; line-height: 1.2; }
  .gqv4-chip-sub { margin-top: 3px; font-weight: 500; font-size: 13px; color: ${T.ink2}; line-height: 1.35; }
  .gqv4-chip-chev { color: ${T.mute}; margin-left: auto; flex-shrink: 0; }
  .gqv4-chip-badge {
    position: absolute; top: 10px; right: 10px;
    font-weight: 700; font-size: 10px; letter-spacing: 0.06em;
    padding: 4px 8px; border-radius: 999px;
    background: ${T.accentSoft}; color: ${T.accent};
  }
  .gqv4-chip-badge.warn { background: #FEF3C7; color: #92400E; }
  .gqv4-chip-pulse {
    position: absolute; inset: 0; border-radius: 10px;
    color: ${T.warn}; animation: gqv4-pulse 1.6s ease-in-out infinite;
  }

  /* ── Date picker ── */
  .gqv4-date-or { font-size: 13px; font-weight: 600; color: ${T.ink2}; margin: 16px 0 8px; }
  .gqv4-date-input-wrap {
    display: flex; align-items: center; gap: 10px;
    padding: 14px; border-radius: 12px;
    border: 1px solid ${T.line}; background: ${T.surface}; cursor: pointer;
  }
  .gqv4-date-input-wrap input {
    flex: 1; border: none; outline: none; background: transparent;
    font-family: inherit; font-size: 15px; color: ${T.ink}; min-width: 0;
  }

  /* ── ZIP field ── */
  .gqv4-zip-label { font-size: 13px; font-weight: 600; color: ${T.ink2}; margin-bottom: 6px; letter-spacing: -0.005em; }
  .gqv4-zip-box {
    display: flex; align-items: center; gap: 10px;
    padding: 0 14px; height: 52px; border-radius: 12px;
    background: ${T.surface}; border: 1.5px solid ${T.line};
    transition: border-color 160ms ease;
  }
  .gqv4-zip-box.found { border-color: ${T.accent}; }
  .gqv4-zip-box.error { border-color: ${T.danger}; }
  .gqv4-zip-box input {
    flex: 1; border: none; outline: none; background: transparent;
    font-family: inherit; font-size: 16px; font-weight: 600;
    color: ${T.ink}; letter-spacing: 0.04em; min-width: 0;
  }
  .gqv4-zip-helper {
    margin-top: 6px; font-size: 12px; font-weight: 500;
    color: ${T.ink2}; padding-left: 4px; min-height: 16px;
  }
  .gqv4-zip-helper strong { color: ${T.ink}; font-weight: 600; }
  .gqv4-zip-helper.error { color: ${T.danger}; }

  .gqv4-same-warn {
    font-size: 13px; font-weight: 500; color: ${T.ink2};
    background: ${T.bg2}; padding: 10px 12px; border-radius: 10px;
  }

  /* ── Form fields ── */
  .gqv4-field { display: flex; flex-direction: column; }
  .gqv4-field-label { font-size: 13px; font-weight: 600; color: ${T.ink2}; margin-bottom: 6px; }
  .gqv4-field-input {
    width: 100%; height: 52px; padding: 0 14px;
    border-radius: 12px; border: 1.5px solid ${T.line};
    background: ${T.surface}; font-family: inherit; font-size: 16px; font-weight: 600;
    color: ${T.ink}; outline: none; transition: border-color 160ms ease;
  }
  .gqv4-field-input::placeholder { color: ${T.mute}; font-weight: 500; }
  .gqv4-field-input:focus { border-color: ${T.accent}; }
  .gqv4-field-input.error { border-color: ${T.danger}; }
  .gqv4-field-helper { margin-top: 6px; font-size: 12px; font-weight: 500; color: ${T.mute}; padding-left: 4px; }
  .gqv4-field-error { margin-top: 6px; font-size: 12px; font-weight: 500; color: ${T.danger}; padding-left: 4px; }

  /* ── TCPA ── */
  .gqv4-tcpa { margin: 0; font-size: 11.5px; font-weight: 500; color: ${T.mute}; line-height: 1.5; }
  .gqv4-tcpa a { color: ${T.ink2}; text-decoration: underline; }

  /* ── Primary CTA ── */
  .gqv4-cta {
    width: 100%; height: 56px; border: none;
    border-radius: 14px; background: ${T.accent}; color: #fff;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    font-family: inherit; font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
    box-shadow: ${T.ctaShadow}; cursor: pointer;
    transition: all 160ms ease;
  }
  .gqv4-cta:hover:not(:disabled) { background: #E67C00; }
  .gqv4-cta:active:not(:disabled) { transform: scale(0.99); }
  .gqv4-cta:disabled { background: ${T.line}; color: ${T.mute}; cursor: not-allowed; box-shadow: none; }
  .gqv4-spinner {
    width: 16px; height: 16px; border-radius: 99px;
    border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff;
    animation: gqv4-spin 0.8s linear infinite;
  }

  /* ── Reassurance row under step card ── */
  .gqv4-reassure {
    max-width: 540px; margin: 20px auto 0;
    display: flex; align-items: center; justify-content: center; gap: 14px;
    font-size: 12.5px; font-weight: 500; color: ${T.ink2}; flex-wrap: wrap;
  }
  .gqv4-reassure span { display: inline-flex; align-items: center; gap: 6px; }
  .gqv4-reassure-sep { width: 1px; height: 12px; background: ${T.line}; }

  /* ── Submit error banner ── */
  .gqv4-submit-error {
    padding: 12px 14px; background: rgba(220, 38, 38, 0.08);
    border: 1px solid rgba(220, 38, 38, 0.22); border-radius: 10px;
    font-size: 13px; color: #b91c1c; margin-bottom: 12px; line-height: 1.5;
  }

  /* ── Confirm screen ── */
  .gqv4-confirm-wrap { padding: 32px 20px 60px; }
  .gqv4-confirm-inner { max-width: 600px; margin: 0 auto; text-align: center; }
  .gqv4-confirm-icon-outer {
    width: 84px; height: 84px; margin: 0 auto; border-radius: 999px;
    background: ${T.accentSoft};
    display: grid; place-items: center;
    box-shadow: 0 8px 24px rgba(255, 138, 0, 0.25);
  }
  .gqv4-confirm-icon-inner {
    width: 60px; height: 60px; border-radius: 999px; background: ${T.accent};
    display: grid; place-items: center;
  }
  .gqv4-confirm-h1 { margin: 20px 0 0; font-weight: 800; font-size: 26px; letter-spacing: -0.02em; color: ${T.ink}; line-height: 1.15; }
  .gqv4-confirm-sub { margin: 10px auto 0; max-width: 460px; font-size: 15px; font-weight: 500; color: ${T.ink2}; line-height: 1.45; }
  .gqv4-confirm-card {
    margin: 24px auto 0; max-width: 600px;
    background: ${T.surface}; border: 1px solid ${T.line};
    border-radius: 20px; padding: 18px; box-shadow: ${T.cardShadow};
  }
  .gqv4-confirm-card-label {
    font-family: ${T.mono}; font-size: 11px; font-weight: 600;
    letter-spacing: 0.1em; color: ${T.accent};
    text-transform: uppercase; margin-bottom: 12px;
  }
  .gqv4-confirm-step { display: flex; gap: 12px; padding: 10px 0; }
  .gqv4-confirm-step + .gqv4-confirm-step { border-top: 1px solid ${T.line2}; }
  .gqv4-confirm-step-num {
    width: 26px; height: 26px; flex-shrink: 0;
    border-radius: 999px; background: ${T.accentSoft}; color: ${T.accent};
    font-weight: 800; font-size: 13px;
    display: grid; place-items: center;
  }
  .gqv4-confirm-step-title { font-weight: 700; font-size: 14px; color: ${T.ink}; line-height: 1.3; }
  .gqv4-confirm-step-body { margin-top: 2px; font-size: 13px; font-weight: 500; color: ${T.ink2}; line-height: 1.4; }

  .gqv4-eta {
    margin: 14px auto 0; max-width: 600px; padding: 12px 14px;
    background: ${T.bg2}; border-radius: 12px;
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; font-weight: 600; color: ${T.ink2};
  }
  .gqv4-eta strong { color: ${T.ink}; font-weight: 800; }

  .gqv4-tips { margin: 24px auto 0; max-width: 600px; }
  .gqv4-tips-divider { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .gqv4-tips-divider span {
    font-family: ${T.mono}; font-size: 9.5px; font-weight: 600;
    letter-spacing: 0.14em; color: ${T.mute}; text-transform: uppercase;
  }
  .gqv4-tips-divider .gqv4-rule { flex: 1; height: 1px; background: ${T.line}; }
  .gqv4-tips-list { display: flex; flex-direction: column; gap: 8px; }
  .gqv4-tip-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-radius: 10px;
    background: ${T.surface}; border: 1px solid ${T.line};
    font-size: 14px; font-weight: 600; color: ${T.ink};
    text-decoration: none;
  }
  .gqv4-tip-row span:first-child { display: inline-flex; align-items: center; gap: 9px; }

  @media (min-width: 768px) {
    .gqv4-tips-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .gqv4-tip-row { display: block; padding: 14px; }
    .gqv4-tip-row-meta { font-size: 12px; font-weight: 500; color: ${T.mute}; margin-top: 2px; }
  }
`;

// ── Helpers ─────────────────────────────────────────────────────────────────
const zipCache = {};
async function lookupZip(zip) {
  if (zipCache[zip] !== undefined) return zipCache[zip];
  try {
    const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!r.ok) { zipCache[zip] = null; return null; }
    const data = await r.json();
    const place = data.places?.[0];
    if (!place) { zipCache[zip] = null; return null; }
    const result = { city: place['place name'], state: place['state abbreviation'] };
    zipCache[zip] = result;
    return result;
  } catch {
    zipCache[zip] = null;
    return null;
  }
}

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

function dateFromPicker(dateStr) {
  if (!dateStr) return null;
  return `${dateStr}T12:00:00.000Z`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatPhone(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function toE164(formatted) {
  const d = formatted.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return `+1${d}`;
}

// ── Step option lists ───────────────────────────────────────────────────────
const SERVICE_OPTIONS = [
  { id: 'apt',    icon: 'apt',    title: 'Local apartment',   sub: 'Studio – 2 bedroom',                homeSize: '1 Bedroom',  distance: 'Local' },
  { id: 'house',  icon: 'house',  title: 'Local house',       sub: '3+ bedroom, single city or county',  homeSize: '3 Bedroom',  distance: 'Local' },
  { id: 'long',   icon: 'truck',  title: 'Long distance',     sub: 'Cross-state or cross-country',       homeSize: '2 Bedroom',  distance: 'Long Distance', badge: 'POPULAR' },
  { id: 'office', icon: 'office', title: 'Office / business', sub: 'Commercial move',                    homeSize: '2 Bedroom',  distance: 'Local' },
  { id: 'pack',   icon: 'box',    title: 'Packing only',      sub: 'We pack, you move',                  homeSize: '1 Bedroom',  distance: 'Local' },
  { id: 'spec',   icon: 'piano',  title: 'Specialty',         sub: 'Piano, safe, art, antiques',         homeSize: '2 Bedroom',  distance: 'Local' },
];

const URGENCY_OPTIONS = [
  { id: 'asap',  icon: 'bolt',  title: 'ASAP — this week', sub: "We'll match you in under an hour", days: 3,  badge: 'URGENT', badgeTone: 'warn', pulse: true, accent: true },
  { id: '2wks',  icon: 'cal',   title: 'Within 2 weeks',   sub: 'Standard timeline',                  days: 14 },
  { id: 'month', icon: 'cal2',  title: 'Within a month',   sub: 'Plenty of time to plan',             days: 30 },
  { id: 'plan',  icon: 'clock', title: 'Just planning',    sub: 'Not booked yet',                     days: 60 },
];

// ── Sub-components ──────────────────────────────────────────────────────────
function TopBar() {
  return (
    <div className="gqv4-top">
      <a href="/" className="gqv4-logo">
        <img src="/movesmart-logo.webp" alt="MoveSmart" className="gqv4-logo-mark" />
        <span className="gqv4-logo-text">MoveSmart</span>
      </a>
      <a href="tel:+13072044792" className="gqv4-top-call" aria-label="Call MoveSmart">
        {Ico.phone(14, T.accent)}
        <span>Call</span>
      </a>
    </div>
  );
}

function TrustStrip({ onCheckPrice }) {
  return (
    <div className="gqv4-trust">
      <svg width="18" height="18" viewBox="0 0 24 24" style={{ color: T.trustGreen, flexShrink: 0 }}>
        <path fill="currentColor" d="m20.34 12-8.67-8.67c-.21-.21-.5-.33-.8-.33H4.14A1.13 1.13 0 0 0 3 4.13v6.75c0 .3.12.58.33.8L12 20.33a2.25 2.25 0 0 0 3.18 0l5.16-5.16a2.25 2.25 0 0 0 0-3.18ZM8.63 10.31a1.69 1.69 0 1 1 0-3.37 1.69 1.69 0 0 1 0 3.37Z" />
      </svg>
      <span>Save up to 40%</span>
      <span>—</span>
      <button type="button" className="gqv4-trust-cta" onClick={onCheckPrice}>
        Check your price
      </button>
    </div>
  );
}

function ProgressBar({ step, total, onBack }) {
  const pct = (step / total) * 100;
  return (
    <div className="gqv4-progress">
      <button className="gqv4-back-btn" onClick={onBack} aria-label="Back">
        {Ico.back(18, T.ink2)}
      </button>
      <div className="gqv4-progress-track">
        <div className="gqv4-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="gqv4-progress-num">{step}/{total}</span>
    </div>
  );
}

function StepHead({ title, sub }) {
  return (
    <div className="gqv4-step-head">
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}

function Chip({ icon, title, sub, badge, badgeTone, pulse, selected, onClick }) {
  const iconColor = pulse ? T.accent : T.ink;
  const iconNode = Ico[icon] ? Ico[icon](22, iconColor) : null;
  return (
    <button className={`gqv4-chip${selected ? ' active' : ''}`} onClick={onClick} type="button">
      <span className="gqv4-chip-icon">
        {iconNode}
        {pulse && <span className="gqv4-chip-pulse" style={{ color: T.warn }} />}
      </span>
      <span className="gqv4-chip-text">
        <span className="gqv4-chip-title">{title}</span>
        {sub && <span className="gqv4-chip-sub">{sub}</span>}
      </span>
      {badge && <span className={`gqv4-chip-badge${badgeTone === 'warn' ? ' warn' : ''}`}>{badge}</span>}
      <span className="gqv4-chip-chev">{Ico.chev(18, T.mute)}</span>
    </button>
  );
}

function ZipField({ label, value, onChange, info, error, autoFocusRef }) {
  const showError = value.length === 5 && !info;
  const found = !!info;
  return (
    <div>
      <div className="gqv4-zip-label">{label}</div>
      <div className={`gqv4-zip-box${found ? ' found' : ''}${(error || showError) ? ' error' : ''}`}>
        {Ico.pin(18, found ? T.accent : T.mute)}
        <input
          ref={autoFocusRef}
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="ZIP code"
          value={value}
          onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
        />
        {found && Ico.check(13, T.accent)}
      </div>
      <div className={`gqv4-zip-helper${showError ? ' error' : ''}`}>
        {info ? <>Detected: <strong>{info.city}, {info.state}</strong></> : showError ? 'ZIP not found' : ''}
      </div>
    </div>
  );
}

function HeroLeadForm({ originZip, destZip, originInfo, destInfo, onOriginChange, onDestChange, onSubmit, destRef }) {
  const sameZip = originZip.length === 5 && destZip.length === 5 && originZip === destZip;
  const ready = originZip.length === 5 && destZip.length === 5 && !!originInfo && !!destInfo && !sameZip;
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!ready) return;
    onSubmit();
  };
  return (
    <form className="gqv4-leadform" onSubmit={handleSubmit} noValidate>
      <div className="gqv4-leadform-row">
        <div className="gqv4-leadform-field">
          <label className="gqv4-leadform-label">Moving from</label>
          <div className={`gqv4-leadform-input${originInfo ? ' found' : ''}${originZip.length === 5 && !originInfo ? ' error' : ''}`}>
            {Ico.pin(16, originInfo ? T.accent : T.mute)}
            <input
              type="text" inputMode="numeric" maxLength={5}
              placeholder="From ZIP" value={originZip}
              autoComplete="postal-code"
              onChange={e => onOriginChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
            />
            {originInfo && Ico.check(14, T.accent)}
          </div>
        </div>
        <div className="gqv4-leadform-field">
          <label className="gqv4-leadform-label">Moving to</label>
          <div className={`gqv4-leadform-input${destInfo ? ' found' : ''}${destZip.length === 5 && !destInfo ? ' error' : ''}`}>
            {Ico.pin(16, destInfo ? T.accent : T.mute)}
            <input
              ref={destRef}
              type="text" inputMode="numeric" maxLength={5}
              placeholder="To ZIP" value={destZip}
              autoComplete="postal-code"
              onChange={e => onDestChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
            />
            {destInfo && Ico.check(14, T.accent)}
          </div>
        </div>
      </div>
      {sameZip && (
        <div className="gqv4-leadform-warn">Origin and destination must differ.</div>
      )}
      <button type="submit" className="gqv4-leadform-cta" disabled={!ready} aria-disabled={!ready}>
        Check my moving price {Ico.arrow(18, ready ? '#fff' : 'currentColor')}
      </button>
      <div className="gqv4-cta-bullets">
        <span>Free estimate</span>
        <span className="gqv4-cta-bullets-dot">·</span>
        <span>No obligation</span>
        <span className="gqv4-cta-bullets-dot">·</span>
        <span className="gqv4-cta-bullets-accent">Fast Quote</span>
      </div>
    </form>
  );
}

function GoogleReviewCard() {
  return (
    <div className="gqv4-review">
      <div className="gqv4-review-head">
        <div className="gqv4-review-avatar">J</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="gqv4-review-name">James Marshall</div>
          <div className="gqv4-review-meta">Local Guide · 24 reviews</div>
        </div>
      </div>
      <div className="gqv4-review-stars">
        <div style={{ display: 'flex', gap: 1 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="#FBBC04">
              <path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7-6.3-3.8L5.7 21.3l1.6-7L2 9.6l7-.6z" />
            </svg>
          ))}
        </div>
        <span className="gqv4-review-stars-when">2 weeks ago</span>
      </div>
      <p className="gqv4-review-body">
        Saved over $600 vs the first quote I got. Three movers reached out within an hour — picked the best one and they showed up on time. No spam calls after. Honestly didn't expect it to be this easy.
      </p>
    </div>
  );
}

function PrimaryCTA({ label, onClick, disabled, loading, withIcon = true }) {
  return (
    <button className="gqv4-cta" onClick={onClick} disabled={disabled || loading} type="button">
      {loading ? (
        <>
          <span className="gqv4-spinner" />
          <span>Matching you with movers…</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          {withIcon && Ico.arrow(18, '#fff')}
        </>
      )}
    </button>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function GetQuoteV4() {
  const [step, setStep] = useState(0); // 0=hero, 1=service, 2=date, 3=route, 4=contact, 5=confirm
  const [service, setService] = useState(null);
  const [urgency, setUrgency] = useState(null);
  const [pickerDate, setPickerDate] = useState('');
  const [originZip, setOriginZip] = useState('');
  const [destZip, setDestZip] = useState('');
  const [originInfo, setOriginInfo] = useState(null);
  const [destInfo, setDestInfo] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  const originTimer = useRef(null);
  const destTimer = useRef(null);
  const destInputRef = useRef(null);
  const heroDestRef = useRef(null);

  // Inject CSS once
  useEffect(() => {
    if (document.getElementById('gqv4-style')) return;
    const el = document.createElement('style');
    el.id = 'gqv4-style';
    el.textContent = css;
    document.head.appendChild(el);
    return () => {
      const s = document.getElementById('gqv4-style');
      if (s) s.remove();
    };
  }, []);

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const goTo = useCallback((n) => {
    setSubmitError('');
    setFieldErrors({});
    setStep(n);
  }, []);

  const handleOriginZip = useCallback((digits) => {
    setOriginZip(digits);
    setOriginInfo(null);
    clearTimeout(originTimer.current);
    if (digits.length === 5) {
      originTimer.current = setTimeout(async () => {
        const info = await lookupZip(digits);
        setOriginInfo(info);
      }, 300);
    }
  }, []);

  const handleDestZip = useCallback((digits) => {
    setDestZip(digits);
    setDestInfo(null);
    clearTimeout(destTimer.current);
    if (digits.length === 5) {
      destTimer.current = setTimeout(async () => {
        const info = await lookupZip(digits);
        setDestInfo(info);
      }, 300);
    }
  }, []);

  // Auto-focus dest after origin is detected (in current view)
  useEffect(() => {
    if (!originInfo || destZip) return;
    if (step === 0 && heroDestRef.current) heroDestRef.current.focus();
    else if (step === 1 && destInputRef.current) destInputRef.current.focus();
  }, [originInfo, destZip, step]);

  function handlePickServiceChip(id) {
    setService(id);
    handleStartFunnel();
  }

  function handleStartFunnel() {
    // Smart route: if both ZIPs are valid and resolved, skip the location step.
    if (
      originZip.length === 5 && destZip.length === 5 &&
      originInfo && destInfo && originZip !== destZip
    ) {
      goTo(2);
    } else {
      goTo(1);
    }
  }

  const resolvedMoveDate = useCallback(() => {
    if (pickerDate) return dateFromPicker(pickerDate);
    const opt = URGENCY_OPTIONS.find(o => o.id === urgency);
    return opt ? futureDate(opt.days) : null;
  }, [pickerDate, urgency]);

  const canContinueRoute = originZip.length === 5 && destZip.length === 5 && originZip !== destZip && originInfo && destInfo;

  function validateContact() {
    const errs = {};
    if (!name.trim() || name.trim().length < 2) errs.name = 'Enter your full name';
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) errs.phone = 'Enter a valid 10-digit US phone number';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email address';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validateContact()) return;
    setSubmitError('');
    setLoading(true);

    const svc = SERVICE_OPTIONS.find(s => s.id === service);
    const moveDate = resolvedMoveDate();

    let distance = svc?.distance || 'Local';
    if (originInfo && destInfo && originInfo.state !== destInfo.state) {
      distance = 'Long Distance';
    }

    const payload = {
      customerName: name.trim(),
      customerEmail: email.trim().toLowerCase() || `noemail+${Date.now()}@moveleads.cloud`,
      customerPhone: toE164(phone),
      originCity: originInfo?.city || '',
      originState: originInfo?.state || '',
      originZip,
      destinationCity: destInfo?.city || '',
      destinationState: destInfo?.state || '',
      destinationZip: destZip,
      homeSize: svc?.homeSize || '2 Bedroom',
      moveDate,
      distance,
      miles: 0,
    };

    try {
      const res = await fetch(`${API}/api/leads/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || data.success === false) {
        const errMsg = data.errors
          ? Object.values(data.errors).join('. ')
          : data.message || 'Something went wrong. Please try again.';
        setSubmitError(errMsg);
        setLoading(false);
        return;
      }

      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', { send_to: 'AW-18096682129' });
      }

      setStep(5);
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function handlePickService(id) {
    setService(id);
    goTo(4);
  }

  function handlePickUrgency(id) {
    setUrgency(id);
    setPickerDate('');
    goTo(3);
  }

  function handlePickDate(dateStr) {
    if (!dateStr) return;
    setPickerDate(dateStr);
    setUrgency(null);
    goTo(3);
  }

  return (
    <div className="gqv4">
      <TopBar />

      {/* ── Step 0: Hero ─────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="gqv4-fadein">
          <TrustStrip onCheckPrice={handleStartFunnel} />
          <div className="gqv4-hero">
            <div className="gqv4-hero-grid">
              <div className="gqv4-hero-photo-mobile">
                <img src="/hero-moving.webp" alt="MoveSmart truck and a happy family at their new home" />
              </div>

              <div className="gqv4-hero-copy">
                <h1 className="gqv4-h1">You're probably <span className="gqv4-h1-accent">overpaying for your move.</span></h1>
                <p className="gqv4-sub">
                  Check prices before booking. We match you with the right mover — no spam, no hassle.
                </p>

                <HeroLeadForm
                  originZip={originZip}
                  destZip={destZip}
                  originInfo={originInfo}
                  destInfo={destInfo}
                  onOriginChange={handleOriginZip}
                  onDestChange={handleDestZip}
                  onSubmit={handleStartFunnel}
                  destRef={heroDestRef}
                />

                <div className="gqv4-service-chips">
                  {[
                    ['long',   'Long-distance move'],
                    ['apt',    'Local apartment'],
                    ['house',  'Local house'],
                    ['office', 'Office move'],
                    ['pack',   'Packing only'],
                  ].map(([id, label]) => (
                    <button key={id} type="button" className="gqv4-service-chip" onClick={() => handlePickServiceChip(id)}>
                      {label}
                    </button>
                  ))}
                </div>

                <div className="gqv4-testimonial-wrap">
                  <GoogleReviewCard />
                </div>

                <div className="gqv4-trusted-row">
                  <div className="gqv4-trusted-label">Trusted by</div>
                  <div className="gqv4-trusted-list">
                    <span>Yelp</span>
                    <span>Google</span>
                    <span>BBB</span>
                    <span>Angi</span>
                    <span>ProMover</span>
                  </div>
                </div>
              </div>

              <div className="gqv4-hero-photo-desktop">
                <img src="/hero-moving.webp" alt="MoveSmart truck and a happy family at their new home" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 1: Location ──────────────────────────────────────────── */}
      {step === 1 && (
        <div className="gqv4-fadein">
          <div className="gqv4-step-wrap">
            <div className="gqv4-step-card">
              <ProgressBar step={1} total={4} onBack={() => goTo(0)} />
              <StepHead title="Where are you moving?" sub="ZIP codes only — we'll ask for the full address later." />
              <div className="gqv4-step-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <ZipField label="Moving from" value={originZip} onChange={handleOriginZip} info={originInfo} />
                <ZipField label="Moving to" value={destZip} onChange={handleDestZip} info={destInfo} autoFocusRef={destInputRef} />
                {originZip === destZip && originZip.length === 5 && (
                  <div className="gqv4-same-warn">Origin and destination ZIP cannot be the same.</div>
                )}
                <PrimaryCTA label="Continue" disabled={!canContinueRoute} onClick={() => goTo(2)} />
              </div>
            </div>
            <Reassurance />
          </div>
        </div>
      )}

      {/* ── Step 2: Date ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="gqv4-fadein">
          <div className="gqv4-step-wrap">
            <div className="gqv4-step-card">
              <ProgressBar step={2} total={4} onBack={() => goTo(1)} />
              <StepHead title="How soon do you need help?" sub="Approximate is fine." />
              <div className="gqv4-step-body">
                <div className="gqv4-chips">
                  {URGENCY_OPTIONS.map(o => (
                    <Chip key={o.id} icon={o.icon} title={o.title} sub={o.sub}
                      badge={o.badge} badgeTone={o.badgeTone} pulse={o.pulse}
                      selected={urgency === o.id && !pickerDate}
                      onClick={() => handlePickUrgency(o.id)} />
                  ))}
                </div>
                <div className="gqv4-date-or">Or pick a date</div>
                <label className="gqv4-date-input-wrap">
                  {Ico.cal(20, T.ink2)}
                  <input type="date" min={todayStr()} value={pickerDate}
                    onChange={e => handlePickDate(e.target.value)} />
                </label>
              </div>
            </div>
            <Reassurance />
          </div>
        </div>
      )}

      {/* ── Step 3: Move details ──────────────────────────────────────── */}
      {step === 3 && (
        <div className="gqv4-fadein">
          <div className="gqv4-step-wrap">
            <div className="gqv4-step-card">
              <ProgressBar step={3} total={4} onBack={() => goTo(2)} />
              <StepHead title="Tell us about your move" sub="Pick one — we'll tailor the quote." />
              <div className="gqv4-step-body">
                <div className="gqv4-chips">
                  {SERVICE_OPTIONS.map(o => (
                    <Chip key={o.id} icon={o.icon} title={o.title} sub={o.sub}
                      badge={o.badge} selected={service === o.id}
                      onClick={() => handlePickService(o.id)} />
                  ))}
                </div>
              </div>
            </div>
            <Reassurance />
          </div>
        </div>
      )}

      {/* ── Step 4: Contact ───────────────────────────────────────────── */}
      {step === 4 && (
        <div className="gqv4-fadein">
          <div className="gqv4-step-wrap">
            <div className="gqv4-step-card">
              <ProgressBar step={4} total={4} onBack={() => goTo(3)} />
              <StepHead title="Get your best price"
                sub="We'll only share your contact info with movers matched to your route." />
              <div className="gqv4-step-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {submitError && <div className="gqv4-submit-error">{submitError}</div>}

                <div className="gqv4-field">
                  <label className="gqv4-field-label">Your name</label>
                  <input
                    className={`gqv4-field-input${fieldErrors.name ? ' error' : ''}`}
                    type="text" placeholder="First name" value={name}
                    autoComplete="given-name"
                    onChange={e => setName(e.target.value)} />
                  {fieldErrors.name && <div className="gqv4-field-error">{fieldErrors.name}</div>}
                </div>

                <div className="gqv4-field">
                  <label className="gqv4-field-label">Phone number</label>
                  <input
                    className={`gqv4-field-input${fieldErrors.phone ? ' error' : ''}`}
                    type="tel" inputMode="tel" placeholder="(___) ___-____" value={phone}
                    autoComplete="tel"
                    onChange={e => setPhone(formatPhone(e.target.value))} />
                  {fieldErrors.phone
                    ? <div className="gqv4-field-error">{fieldErrors.phone}</div>
                    : <div className="gqv4-field-helper">Movers will call you with quotes</div>}
                </div>

                <div className="gqv4-field">
                  <label className="gqv4-field-label">
                    Email <span style={{ color: T.mute, fontWeight: 500 }}>(optional)</span>
                  </label>
                  <input
                    className={`gqv4-field-input${fieldErrors.email ? ' error' : ''}`}
                    type="email" placeholder="you@email.com" value={email}
                    autoComplete="email"
                    onChange={e => setEmail(e.target.value)} />
                  {fieldErrors.email && <div className="gqv4-field-error">{fieldErrors.email}</div>}
                </div>

                <PrimaryCTA label="Get my best price" onClick={handleSubmit} loading={loading}
                  disabled={!name.trim() || phone.replace(/\D/g, '').length !== 10}
                  withIcon={!loading} />

                <p className="gqv4-tcpa">
                  By tapping the button you agree to be contacted by up to 3 movers about your move.
                  Standard message &amp; data rates apply. See <a href="/terms">Terms</a> &amp; <a href="/privacy">Privacy</a>.
                </p>
              </div>
            </div>
            <Reassurance />
          </div>
        </div>
      )}

      {/* ── Step 5: Confirm ───────────────────────────────────────────── */}
      {step === 5 && (
        <div className="gqv4-fadein gqv4-confirm-wrap">
          <div className="gqv4-confirm-inner">
            <div className="gqv4-confirm-icon-outer">
              <div className="gqv4-confirm-icon-inner">{Ico.check(28, '#fff')}</div>
            </div>
            <h1 className="gqv4-confirm-h1">You're all set, {name || 'there'}!</h1>
            <p className="gqv4-confirm-sub">
              Three vetted movers near <strong style={{ color: T.ink, fontWeight: 700 }}>{originInfo?.city || originZip}</strong> are
              reviewing your move. Expect calls or texts within 30 minutes.
            </p>
          </div>

          <div className="gqv4-confirm-card">
            <div className="gqv4-confirm-card-label">What happens next</div>
            {[
              ['Movers review your move', "They'll see your dates, ZIPs, and service type."],
              ['They text or call you with quotes', 'Usually within 30 minutes during business hours.'],
              ['You pick the best one — done', 'No commitment until you say yes.'],
            ].map(([title, body], i) => (
              <div key={i} className="gqv4-confirm-step">
                <div className="gqv4-confirm-step-num">{i + 1}</div>
                <div>
                  <div className="gqv4-confirm-step-title">{title}</div>
                  <div className="gqv4-confirm-step-body">{body}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="gqv4-eta">
            {Ico.clock(18, T.accent)}
            <span>Most quotes back in <strong>under 30 minutes</strong>.</span>
          </div>

          <div className="gqv4-tips">
            <div className="gqv4-tips-divider">
              <div className="gqv4-rule" />
              <span>Tips while you wait</span>
              <div className="gqv4-rule" />
            </div>
            <div className="gqv4-tips-list">
              {[
                ['Moving checklist', 'PDF · 2 pages'],
                ['How quotes work', 'Read · 3 min'],
                ['Avoiding moving scams', 'Read · 5 min'],
              ].map(([title, meta]) => (
                <a key={title} className="gqv4-tip-row" href="#">
                  <span>{Ico.spark(14, T.accent)} {title}</span>
                  <span className="gqv4-tip-row-meta">{meta}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Reassurance() {
  return (
    <div className="gqv4-reassure">
      <span>{Ico.shield(13, T.ok)} Your info is encrypted</span>
      <span className="gqv4-reassure-sep" />
      <span>{Ico.check(13, T.ok)} No obligation</span>
      <span className="gqv4-reassure-sep" />
      <span>{Ico.clock(13, T.ok)} Quotes in 30 min</span>
    </div>
  );
}
