import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Zap, Heart, Users, TrendingUp, Star, CheckCircle } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const BL = 'rgba(15,23,42,0.08)';
const NOISE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`;

function useReveal() {
  const ref = useRef();
  const [v, setV] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true); }, { threshold: 0.08 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, v];
}
function Reveal({ children, delay = 0 }) {
  const [ref, v] = useReveal();
  return (
    <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: `opacity 0.6s ease ${delay}s, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>
      {children}
    </div>
  );
}

const TEAM = [
  { name: 'Alex Rivera', role: 'CEO & Co-Founder', bio: 'Former VP at a national moving company. Built MoveLeads after watching competitors win jobs because they called leads first.', avatar: 'AR', color: '#1e3a8a' },
  { name: 'Mia Chen', role: 'CTO & Co-Founder', bio: '10 years building data platforms. Designed our real-time lead verification engine that screens out fake and recycled leads.', avatar: 'MC', color: '#065f46' },
  { name: 'Jordan Smith', role: 'Head of Operations', bio: 'Former logistics director. Manages our network of lead sources and quality assurance to keep conversion rates high.', avatar: 'JS', color: '#7c3aed' },
  { name: 'Priya Patel', role: 'Head of Customer Success', bio: 'Helps moving companies get maximum ROI from their leads. Has onboarded 200+ companies personally.', avatar: 'PP', color: '#c2410c' },
];

const VALUES = [
  { icon: <Shield size={22} />, c: '#22c55e', bg: '#f0fdf4', title: 'Quality over quantity', desc: 'We\'d rather send you 10 verified leads than 100 recycled ones. Every lead is phone-checked before it hits your dashboard.' },
  { icon: <Zap size={22} />, c: '#3b82f6', bg: '#eff6ff', title: 'Speed is everything', desc: 'The moving industry is won in the first call. Our systems are built so you\'re always first to the phone.' },
  { icon: <Heart size={22} />, c: ORANGE, bg: '#fff7ed', title: 'Built for movers', desc: 'We\'re not a generic lead company. Every feature, every filter, every report was designed specifically for moving companies.' },
  { icon: <Users size={22} />, c: '#8b5cf6', bg: '#f5f3ff', title: 'Partner, not vendor', desc: 'Our success depends on yours. When you close more jobs, we grow too. That alignment drives everything we build.' },
];

export default function About() {
  useEffect(() => { document.title = 'About Us — MoveLeads.cloud'; }, []);

  return (
    <MarketingLayout>

      {/* HERO */}
      <section style={{
        background: `${NOISE}, linear-gradient(155deg, #070e1b 0%, #0b1628 55%, #0d1f38 100%)`,
        position: 'relative', overflow: 'hidden', padding: '90px 0 100px',
      }}>
        <div style={{ position: 'absolute', top: '-10%', right: '5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.09), transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.022) 1px,transparent 1px)', backgroundSize: '52px 52px', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 28px', textAlign: 'center', position: 'relative' }}>
          <Reveal>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', marginBottom: 24 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8 }}>Our story</span>
            </div>
          </Reveal>
          <Reveal delay={0.07}>
            <h1 style={{ fontFamily: F, fontSize: 54, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', color: '#fff', marginBottom: 20 }}>
              We built the platform<br />we wished existed.
            </h1>
          </Reveal>
          <Reveal delay={0.14}>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, maxWidth: 580, margin: '0 auto' }}>
              MoveLeads was born out of frustration. Too many moving companies were wasting money on recycled, low-quality lead lists while the best jobs went to whoever called first. We decided to fix that.
            </p>
          </Reveal>
        </div>
      </section>

      {/* MISSION SPLIT */}
      <section style={{ padding: '100px 0', background: '#fff' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>
            <Reveal>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: '#f1f5f9', marginBottom: 20 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.8 }}>Our mission</span>
                </div>
                <h2 style={{ fontFamily: F, fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: NAVY, lineHeight: 1.12, marginBottom: 18 }}>
                  Give every moving company access to real, exclusive leads.
                </h2>
                <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.78, marginBottom: 24 }}>
                  Before MoveLeads, getting good moving leads meant either paying a fortune to a big aggregator (who sold the same lead to 5 competitors) or cold-calling with no context. Neither worked well for small and mid-size moving companies.
                </p>
                <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.78, marginBottom: 32 }}>
                  We built a system where leads are verified, exclusive, and delivered the moment someone requests a moving quote — so you can be first to call every single time.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {['Phone-verified leads only — no form submissions', 'Exclusive delivery — no competitor sees your lead', 'Real-time — you\'re called within seconds of submission', 'Pay per lead — zero long-term commitment'].map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <CheckCircle size={13} color="#22c55e" />
                      </div>
                      <span style={{ fontSize: 14, color: '#475569', fontWeight: 500 }}>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.12}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { v: '2022', l: 'Founded', c: NAVY, bg: NAVY },
                  { v: '500+', l: 'Companies served', c: ORANGE, bg: '#fff7ed' },
                  { v: '10k+', l: 'Leads delivered', c: '#3b82f6', bg: '#eff6ff' },
                  { v: '98%', l: 'Satisfaction rate', c: '#22c55e', bg: '#f0fdf4' },
                ].map((s, i) => (
                  <div key={i} style={{
                    background: i === 0 ? NAVY : s.bg,
                    borderRadius: 18, padding: '28px 24px',
                    border: i !== 0 ? `1px solid ${BL}` : 'none',
                  }}>
                    <div style={{ fontSize: 36, fontWeight: 800, color: i === 0 ? '#fff' : s.c, letterSpacing: '-0.03em', fontFamily: F, marginBottom: 6 }}>{s.v}</div>
                    <div style={{ fontSize: 13, color: i === 0 ? 'rgba(255,255,255,0.45)' : '#64748b', fontWeight: 500 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section style={{ padding: '100px 0', background: '#f8fafc', borderTop: `1px solid ${BL}`, borderBottom: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
              <h2 style={{ fontFamily: F, fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: NAVY, marginBottom: 12 }}>What we stand for</h2>
              <p style={{ fontSize: 16, color: '#64748b', maxWidth: 440, margin: '0 auto' }}>The principles that drive every decision we make.</p>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
            {VALUES.map((v, i) => (
              <Reveal key={i} delay={i * 0.07}>
                <div style={{
                  background: '#fff', border: `1px solid ${BL}`, borderRadius: 18, padding: '32px 28px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.22s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.07)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 13, background: v.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: v.c, flexShrink: 0 }}>{v.icon}</div>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 8, fontFamily: F }}>{v.title}</h3>
                      <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, margin: 0 }}>{v.desc}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section style={{ padding: '100px 0', background: '#fff' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
              <h2 style={{ fontFamily: F, fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: NAVY, marginBottom: 12 }}>Meet the team</h2>
              <p style={{ fontSize: 16, color: '#64748b', maxWidth: 420, margin: '0 auto' }}>People obsessed with helping moving companies grow.</p>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 22 }}>
            {TEAM.map((m, i) => (
              <Reveal key={i} delay={i * 0.07}>
                <div style={{
                  background: '#fff', border: `1px solid ${BL}`, borderRadius: 18, padding: '28px 22px',
                  textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.22s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.07)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
                >
                  <div style={{ width: 64, height: 64, borderRadius: 18, background: m.color, color: '#fff', fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontFamily: F }}>{m.avatar}</div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4, fontFamily: F }}>{m.name}</h3>
                  <p style={{ fontSize: 12, color: ORANGE, fontWeight: 600, marginBottom: 12 }}>{m.role}</p>
                  <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.65, margin: 0 }}>{m.bio}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PRESS / MILESTONES */}
      <section style={{ padding: '80px 0', background: '#f8fafc', borderTop: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, textAlign: 'center' }}>
              {[
                { v: '2022', l: 'Year founded', icon: '🚀' },
                { v: '50 states', l: 'Lead coverage', icon: '🗺️' },
                { v: '$2M+', l: 'Revenue for customers', icon: '💰' },
                { v: '4.9★', l: 'Average rating', icon: '⭐' },
              ].map((s, i) => (
                <div key={i} style={{ padding: '32px 20px', background: '#fff', borderRadius: 16, border: `1px solid ${BL}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{s.icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: NAVY, letterSpacing: '-0.03em', fontFamily: F, marginBottom: 6 }}>{s.v}</div>
                  <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ea6c0a 100%)`, padding: '80px 0', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `${NOISE}`, opacity: 0.4, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 540, margin: '0 auto', padding: '0 28px', position: 'relative' }}>
          <Reveal>
            <h2 style={{ fontFamily: F, fontSize: 40, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: 12, lineHeight: 1.1 }}>Ready to grow?</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.75)', marginBottom: 34, lineHeight: 1.65 }}>Join 500+ moving companies and start closing more jobs today.</p>
            <Link to="/register" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#fff', color: ORANGE, padding: '14px 30px', borderRadius: 13,
              fontSize: 15, fontWeight: 800, textDecoration: 'none',
              boxShadow: '0 8px 28px rgba(0,0,0,0.14)', transition: 'all 0.18s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 36px rgba(0,0,0,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.14)'; }}
            >Get started free <ArrowRight size={17} /></Link>
          </Reveal>
        </div>
      </section>
    </MarketingLayout>
  );
}
