import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/MarketingLayout';
import JsonLd from '../components/JsonLd';
import useCanonical from '../utils/useCanonical';
import {
  CheckCircle, ChevronDown, ArrowRight, Phone,
  Zap, Shield, Star, BarChart2, Clock, CreditCard,
  MapPin, TrendingUp, Gavel, Users
} from 'lucide-react';

const pricingPageFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Do I need a subscription?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Add balance and buy leads whenever you want. There are no monthly fees, no contracts, and no minimums. You only pay when you claim a lead.'
      }
    },
    {
      '@type': 'Question',
      name: 'What if a lead has a bad phone number?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Every lead is verified via Twilio before entering the marketplace. If you receive an invalid or disconnected number, contact support within 24 hours for a full credit.'
      }
    },
    {
      '@type': 'Question',
      name: 'Can I set a territory so I only see local leads?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes — set your coverage zip codes in Settings and only leads that match will appear in your feed. You won\'t see (or be charged for) leads outside your area.'
      }
    },
    {
      '@type': 'Question',
      name: 'What is a Live Warm Transfer?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'When a Grade A lead submits, our system calls the customer immediately. If they press 1, your phone rings. Press 1 to accept and you\'re instantly connected to a live customer ready to book. You\'re charged $40 only if you accept the call.'
      }
    },
    {
      '@type': 'Question',
      name: 'How is Lead Grade calculated?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We score every lead on distance, home size, urgency, and whether the phone number is a real mobile line. Grade A = highest value, long-distance, peak season. Grade C = standard local leads.'
      }
    }
  ]
};

const ORANGE = '#f97316';
const NAVY   = '#0b1628';
const BL     = '#e8edf4';
const F      = "'Poppins', sans-serif";

/* ── Scroll-reveal (simple intersection observer) ─────────────── */
function Reveal({ children, delay = 0 }) {
  const ref = React.useRef(null);
  const [vis, setVis] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(22px)', transition: `opacity 0.55s ${delay}s ease, transform 0.55s ${delay}s ease` }}>
      {children}
    </div>
  );
}

/* ── FAQ Accordion ────────────────────────────────────────────── */
function FAQ({ items }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((item, i) => (
        <Reveal key={i} delay={i * 0.04}>
          <div style={{ borderBottom: `1px solid ${BL}`, overflow: 'hidden' }}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 16 }}
            >
              <span style={{ fontSize: 15, fontWeight: 600, color: NAVY, fontFamily: F }}>{item[0]}</span>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: open === i ? ORANGE : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.18s' }}>
                <ChevronDown size={14} color={open === i ? '#fff' : '#64748b'} style={{ transform: open === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.22s ease' }} />
              </div>
            </button>
            <div style={{ maxHeight: open === i ? 300 : 0, overflow: 'hidden', transition: 'max-height 0.28s ease', paddingBottom: open === i ? 18 : 0 }}>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.75, margin: 0 }}>{item[1]}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────── */
export default function Pricing() {
  useCanonical('/pricing');
  useEffect(() => { document.title = 'Pricing — MoveLeads.cloud'; }, []);
  return (
    <MarketingLayout>
      <JsonLd schema={pricingPageFaqSchema} />
      {/* ── HERO ───────────────────────────────────────────── */}
      <section style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #0f2447 100%)`, padding: '100px 0 80px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.015\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 28px', position: 'relative' }}>
          <Reveal>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', marginBottom: 20 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', letterSpacing: 1.8 }}>Pricing</span>
            </div>
            <h1 style={{ fontFamily: F, fontSize: 48, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', marginBottom: 16, lineHeight: 1.1 }}>
              Simple, transparent<br />pricing
            </h1>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.62)', lineHeight: 1.7, marginBottom: 36, maxWidth: 520, margin: '0 auto 36px' }}>
              Pay only for the leads you want. No subscriptions. No contracts. No hidden fees.
            </p>
            <Link to="/register" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: ORANGE, color: '#fff', padding: '14px 30px', borderRadius: 13,
              fontSize: 15, fontWeight: 800, textDecoration: 'none',
              boxShadow: '0 8px 28px rgba(249,115,22,0.38)', transition: 'all 0.18s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 36px rgba(249,115,22,0.46)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(249,115,22,0.38)'; }}
            >
              Create free account <ArrowRight size={17} />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── SECTION 1: HOW LEADS ARE PRICED ────────────────── */}
      <section style={{ padding: '88px 0', background: '#fff', borderBottom: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 52 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.14)', marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8 }}>Dynamic Pricing</span>
              </div>
              <h2 style={{ fontFamily: F, fontSize: 36, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em', marginBottom: 10 }}>How lead prices are calculated</h2>
              <p style={{ fontSize: 15, color: '#64748b', maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
                Every lead is priced dynamically at the moment it's submitted — based on 5 real factors.
              </p>
            </div>
          </Reveal>

          <div className="pricing-grid-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
            {[
              { icon: <Users size={20} />, c: '#3b82f6', bg: '#eff6ff', bc: 'rgba(59,130,246,0.12)', title: 'Move Size', body: 'Studio from $10\nUp to $75 for 5+ beds' },
              { icon: <MapPin size={20} />, c: '#8b5cf6', bg: '#f5f3ff', bc: 'rgba(139,92,246,0.12)', title: 'Distance', body: 'Local from $10\nLong distance +$35 base' },
              { icon: <Clock size={20} />, c: '#ef4444', bg: '#fef2f2', bc: 'rgba(239,68,68,0.12)', title: 'Urgency', body: 'Moving within 7 days\nup to 1.5× price' },
              { icon: <TrendingUp size={20} />, c: '#f59e0b', bg: '#fffbeb', bc: 'rgba(245,158,11,0.12)', title: 'Season', body: 'Peak May–Aug\n× 1.15 multiplier' },
              { icon: <Star size={20} />, c: '#22c55e', bg: '#f0fdf4', bc: 'rgba(34,197,94,0.12)', title: 'Lead Grade', body: 'Grade A = premium\nGrade C = standard' },
            ].map((f, i) => (
              <Reveal key={i} delay={i * 0.07}>
                <div style={{ background: f.bg, border: `1px solid ${f.bc}`, borderRadius: 16, padding: '22px 18px', textAlign: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: f.c, margin: '0 auto 12px', boxShadow: `0 2px 10px ${f.bc}` }}>
                    {f.icon}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: NAVY, fontFamily: F, marginBottom: 6 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{f.body}</div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.3}>
            <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', border: `1px solid ${BL}`, borderRadius: 12, padding: '14px 20px' }}>
              <BarChart2 size={16} color={ORANGE} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
                <strong style={{ color: NAVY }}>All prices shown in real time</strong> on the Live Leads dashboard before you commit. You always know the price before buying.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── SECTION 2: THREE WAYS TO BUY ───────────────────── */}
      <section style={{ padding: '88px 0', background: '#f8fafc', borderBottom: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 52 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.14)', marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8 }}>Buy Methods</span>
              </div>
              <h2 style={{ fontFamily: F, fontSize: 36, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em', marginBottom: 10 }}>Three ways to buy a lead</h2>
              <p style={{ fontSize: 15, color: '#64748b', maxWidth: 480, margin: '0 auto' }}>Choose the method that fits how you work.</p>
            </div>
          </Reveal>

          <div className="pricing-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, alignItems: 'start' }}>
            {/* Card 1 — Standard */}
            <Reveal delay={0.05}>
              <div style={{ background: '#fff', border: `1px solid ${BL}`, borderRadius: 20, padding: '32px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}><Zap size={20} /></div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, fontFamily: F }}>Standard Lead</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Browse &amp; buy instantly</div>
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <span style={{ fontSize: 40, fontWeight: 800, color: NAVY, fontFamily: F, letterSpacing: '-0.03em' }}>From $10</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
                  {[
                    'Browse Live Leads dashboard',
                    'Click View → then Claim Lead',
                    'Full contact details unlocked instantly',
                    'Price shown before you commit',
                  ].map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                      <CheckCircle size={14} color="#22c55e" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{t}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 10, fontSize: 12, color: '#64748b', borderLeft: `3px solid #3b82f6` }}>
                  <strong>Best for:</strong> Movers who want to browse before committing
                </div>
              </div>
            </Reveal>

            {/* Card 2 — Auction (highlighted) */}
            <Reveal delay={0.12}>
              <div className="pricing-auction-card" style={{ background: NAVY, borderRadius: 20, padding: '36px 28px', boxShadow: '0 24px 56px rgba(11,22,40,0.28)', position: 'relative', overflow: 'hidden', transform: 'scale(1.03)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${ORANGE},#fb923c)` }} />
                <div style={{ position: 'absolute', top: 14, right: 14, background: ORANGE, color: '#fff', padding: '3px 12px', borderRadius: 100, fontSize: 10, fontWeight: 700 }}>Most Popular</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(249,115,22,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fb923c' }}><Gavel size={20} /></div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: F }}>Auction Bid</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Win the best leads</div>
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>Starting bid shown per lead</div>
                  <span style={{ fontSize: 32, fontWeight: 800, color: '#fff', fontFamily: F, letterSpacing: '-0.02em' }}>Bid to win</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
                  {[
                    'Place a bid on any live auction lead',
                    'Highest bid wins when 30-min timer ends',
                    'Anti-sniping: bids in last 2 min extend timer',
                    'You pay your winning bid — nothing more',
                  ].map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                      <CheckCircle size={14} color="#22c55e" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5 }}>{t}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: 10, fontSize: 12, color: 'rgba(255,255,255,0.55)', borderLeft: `3px solid ${ORANGE}` }}>
                  <strong style={{ color: '#fb923c' }}>Best for:</strong> Competitive movers who want the top leads
                </div>
              </div>
            </Reveal>

            {/* Card 3 — Warm Transfer */}
            <Reveal delay={0.19}>
              <div style={{ background: '#fff', border: `1px solid ${BL}`, borderRadius: 20, padding: '32px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ORANGE }}><Phone size={20} /></div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, fontFamily: F }}>Live Warm Transfer</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Live customer on the line</div>
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff7ed', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 8, padding: '4px 10px', marginBottom: 14, fontSize: 12, fontWeight: 700, color: ORANGE }}>
                  🔥 Highest conversion rate
                </div>
                <div style={{ marginBottom: 20 }}>
                  <span style={{ fontSize: 40, fontWeight: 800, color: NAVY, fontFamily: F, letterSpacing: '-0.03em' }}>$40</span>
                  <span style={{ fontSize: 14, color: '#94a3b8', marginLeft: 4 }}>/call accepted</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                  {[
                    'Opt in from your Settings page',
                    'Grade A lead submits → we call them instantly',
                    'They press 1 → your phone rings',
                    'Press 1 to accept — live customer, ready to book',
                  ].map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                      <CheckCircle size={14} color="#22c55e" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{t}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '10px 14px', background: '#fff7ed', borderRadius: 10, fontSize: 12, color: '#92400e', borderLeft: `3px solid ${ORANGE}`, marginBottom: 10 }}>
                  <strong>Best for:</strong> Movers who want instant live connections
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
                  Requires balance ≥ $50. Opt-in required in Settings.
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: ALWAYS INCLUDED ─────────────────────── */}
      <section style={{ padding: '88px 0', background: '#fff', borderBottom: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: '#f0fdf4', border: '1px solid rgba(34,197,94,0.2)', marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 1.8 }}>Always free</span>
              </div>
              <h2 style={{ fontFamily: F, fontSize: 36, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em', marginBottom: 10 }}>Everything included at no extra cost</h2>
              <p style={{ fontSize: 15, color: '#64748b' }}>Every account gets these on day one, forever free.</p>
            </div>
          </Reveal>

          <div className="pricing-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { icon: <Shield size={16} />, text: 'Phone-verified leads — no VoIP, no fake numbers' },
              { icon: <Zap size={16} />, text: 'Real-time dashboard with live lead notifications' },
              { icon: <Phone size={16} />, text: 'Instant SMS alert when a lead matches your area' },
              { icon: <Star size={16} />, text: 'Grade and score shown before you buy' },
              { icon: <BarChart2 size={16} />, text: 'Dynamic price shown before you commit' },
              { icon: <Users size={16} />, text: 'Customer Resolution Center — handle complaints privately' },
              { icon: <TrendingUp size={16} />, text: 'Free embeddable widget for your website' },
              { icon: <MapPin size={16} />, text: 'Coverage area filters by zip code' },
              { icon: <CreditCard size={16} />, text: 'Auto-recharge when balance runs low' },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.04}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', background: '#f8fafc', borderRadius: 12, border: `1px solid ${BL}` }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.55, fontWeight: 500 }}>{item.text}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 4: BALANCE & BILLING ───────────────────── */}
      <section style={{ padding: '88px 0', background: '#f8fafc', borderBottom: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.14)', marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8 }}>Billing</span>
              </div>
              <h2 style={{ fontFamily: F, fontSize: 36, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em', marginBottom: 10 }}>Balance &amp; billing</h2>
              <p style={{ fontSize: 15, color: '#64748b' }}>Simple pre-paid balance, no invoices, no surprises.</p>
            </div>
          </Reveal>

          <div className="pricing-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { icon: <CreditCard size={20} />, c: '#3b82f6', bg: '#eff6ff', title: 'Minimum top-up', body: 'Add balance anytime starting at $50. Balance never expires — use it at your own pace.' },
              { icon: <Zap size={20} />, c: ORANGE, bg: '#fff7ed', title: 'Auto-recharge', body: 'Set a threshold and we top up your balance automatically so you never miss a lead.' },
              { icon: <Shield size={20} />, c: '#22c55e', bg: '#f0fdf4', title: 'Secure payments via Stripe', body: 'All payments are processed securely. We never store your card details on our servers.' },
              { icon: <CheckCircle size={20} />, c: '#8b5cf6', bg: '#f5f3ff', title: 'Invalid lead credit', body: 'If a lead has a disconnected or wrong number, contact support within 24 hours for a full credit. No questions asked.' },
            ].map((c, i) => (
              <Reveal key={i} delay={i * 0.07}>
                <div style={{ background: '#fff', border: `1px solid ${BL}`, borderRadius: 16, padding: '24px 22px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.c, flexShrink: 0 }}>
                    {c.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 5, fontFamily: F }}>{c.title}</div>
                    <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.65 }}>{c.body}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: PRICE EXAMPLES TABLE ────────────────── */}
      <section style={{ padding: '88px 0', background: '#fff', borderBottom: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.14)', marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8 }}>Examples</span>
              </div>
              <h2 style={{ fontFamily: F, fontSize: 36, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em', marginBottom: 10 }}>Real price examples</h2>
              <p style={{ fontSize: 15, color: '#64748b', maxWidth: 440, margin: '0 auto' }}>See what different types of leads typically cost.</p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div style={{ background: '#fff', border: `1px solid ${BL}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 560 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: `2px solid ${BL}` }}>
                      {['Move Type', 'Size', 'Distance', 'Grade', 'Price'].map((h, i) => (
                        <th key={i} style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { type: 'Local same-day', size: 'Studio', dist: '< 50 mi', grade: 'C', price: '$10', highlight: false },
                      { type: 'Local urgent', size: '2 Bedroom', dist: '< 100 mi', grade: 'B', price: '$20', highlight: false },
                      { type: 'Long distance', size: '3 Bedroom', dist: '500+ mi', grade: 'B', price: '$45', highlight: false },
                      { type: 'Long distance peak', size: '4 Bedroom', dist: '1,000+ mi', grade: 'A', price: '$75', highlight: false },
                      { type: 'Live Warm Transfer', size: 'Any', dist: 'Any', grade: 'A only', price: '$40/call', highlight: true },
                    ].map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${BL}`, background: row.highlight ? '#fff7ed' : i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                        <td style={{ padding: '14px 20px', fontWeight: 600, color: NAVY }}>{row.type}</td>
                        <td style={{ padding: '14px 20px', color: '#475569' }}>{row.size}</td>
                        <td style={{ padding: '14px 20px', color: '#475569' }}>{row.dist}</td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{
                            padding: '3px 9px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                            background: row.grade === 'A only' ? '#fef2f2' : row.grade === 'A' ? '#fef9c3' : row.grade === 'B' ? '#eff6ff' : '#f8fafc',
                            color: row.grade === 'A only' ? '#dc2626' : row.grade === 'A' ? '#b45309' : row.grade === 'B' ? '#2563eb' : '#64748b',
                          }}>{row.grade}</span>
                        </td>
                        <td style={{ padding: '14px 20px', fontWeight: 800, color: row.highlight ? ORANGE : '#16a34a', fontSize: 15 }}>{row.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', border: `1px solid ${BL}`, borderRadius: 12, padding: '14px 20px' }}>
              <CheckCircle size={15} color="#22c55e" style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
                Prices are calculated automatically at the moment a lead is submitted. <strong style={{ color: NAVY }}>What you see is what you pay.</strong>
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── SECTION 6: FAQ ─────────────────────────────────── */}
      <section style={{ padding: '88px 0', background: '#f8fafc', borderBottom: `1px solid ${BL}` }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 28px' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 52 }}>
              <h2 style={{ fontFamily: F, fontSize: 36, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em', marginBottom: 10 }}>Frequently asked questions</h2>
              <p style={{ fontSize: 15, color: '#64748b' }}>Can't find an answer? <a href="mailto:support@moveleads.cloud" style={{ color: ORANGE, fontWeight: 600 }}>Email our team</a></p>
            </div>
          </Reveal>
          <FAQ items={[
            ['Do I need a subscription?', 'No. Add balance and buy leads whenever you want. There are no monthly fees, no contracts, and no minimums. You only pay when you claim a lead.'],
            ['What if a lead has a bad phone number?', 'Every lead is verified via Twilio before entering the marketplace. If you receive an invalid or disconnected number, contact support within 24 hours for a full credit.'],
            ["Can I set a territory so I only see local leads?", "Yes — set your coverage zip codes in Settings and only leads that match will appear in your feed. You won't see (or be charged for) leads outside your area."],
            ['What is a Live Warm Transfer?', "When a Grade A lead submits, our system calls the customer immediately. If they press 1, your phone rings. Press 1 to accept and you're instantly connected to a live customer ready to book. You're charged $40 only if you accept the call."],
            ['How is Lead Grade calculated?', 'We score every lead on distance, home size, urgency, and whether the phone number is a real mobile line. Grade A = highest value, long-distance, peak season. Grade C = standard local leads.'],
          ]} />
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────── */}
      <section style={{ background: `linear-gradient(135deg,${ORANGE} 0%,#ea6c0a 100%)`, padding: '90px 0', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)', width: 700, height: 450, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 28px', position: 'relative' }}>
          <Reveal>
            <h2 style={{ fontFamily: F, fontSize: 40, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: 14, lineHeight: 1.1 }}>
              Start buying leads<br />today — free to join.
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.72)', marginBottom: 36, lineHeight: 1.65 }}>
              No subscription. No credit card to sign up. Add balance only when you're ready to buy.
            </p>
            <Link to="/register" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#fff', color: ORANGE, padding: '14px 32px', borderRadius: 13,
              fontSize: 15, fontWeight: 800, textDecoration: 'none',
              boxShadow: '0 8px 28px rgba(0,0,0,0.14)', transition: 'all 0.18s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 36px rgba(0,0,0,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.14)'; }}
            >
              Create free account → Start buying leads <ArrowRight size={17} />
            </Link>
          </Reveal>
        </div>
      </section>

      <style>{`
        @media (max-width: 768px) {
          .pricing-grid-5 { grid-template-columns: repeat(2, 1fr) !important; }
          .pricing-grid-3 { grid-template-columns: 1fr !important; }
          .pricing-grid-2 { grid-template-columns: 1fr !important; }
          .pricing-auction-card { transform: none !important; }
        }
        @media (max-width: 480px) {
          .pricing-grid-5 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </MarketingLayout>
  );
}
