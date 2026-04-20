import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { DemoWidget } from './WidgetPage';
import './GetQuoteV2.css';

/* ─── Activity ticker data ───────────────────────────────── */
const ACTIVITIES = [
  '📦 Someone in Dallas just requested a quote',
  '📦 Someone in Miami just requested a quote',
  '📦 Someone in Chicago just requested a quote',
  '📦 Someone in New York just requested a quote',
  '📦 Someone in Houston just requested a quote',
  '📦 Someone in Phoenix just requested a quote',
  '📦 Someone in Los Angeles just requested a quote',
  '📦 Someone in Seattle just requested a quote',
];

const FAQ_ITEMS = [
  {
    q: 'Is this service free?',
    a: 'Yes — completely free for homeowners. No credit card required. We earn a small referral fee from movers only when they win your business.',
  },
  {
    q: 'Will I get spam calls?',
    a: 'No. Only 1–3 verified movers who service your exact route will contact you. We strictly limit contacts to prevent the overwhelming call blitzes common on other sites.',
  },
  {
    q: 'How fast will movers respond?',
    a: 'Most movers respond within 15 minutes of your request. You\'ll typically have your first call within minutes of submitting.',
  },
  {
    q: 'Are the movers licensed?',
    a: 'Yes — all movers in our network are phone-verified and DOT/FMCSA licensed before joining. We check credentials continuously.',
  },
  {
    q: 'What if I have a bad experience?',
    a: 'Use our free Resolution Center to resolve issues privately and directly before they hit public review sites. Our team mediates every dispute.',
  },
];

/* ─── Intersection observer hook for animations ─────────── */
function useVisible(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ─── FAQ Accordion Item ─────────────────────────────────── */
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`gqv2-faq-item ${open ? 'gqv2-faq-item--open' : ''}`}>
      <button className="gqv2-faq-q" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>{q}</span>
        <span className="gqv2-faq-icon">{open ? '−' : '+'}</span>
      </button>
      <div className="gqv2-faq-a" style={{ maxHeight: open ? 200 : 0 }}>
        <p>{a}</p>
      </div>
    </div>
  );
}

/* ─── Animated section wrapper ──────────────────────────── */
function AnimSection({ children, className = '', delay = 0 }) {
  const [ref, visible] = useVisible();
  return (
    <div
      ref={ref}
      className={`gqv2-anim ${visible ? 'gqv2-anim--in' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────── */
export default function GetQuoteV2() {
  const [activityIdx, setActivityIdx] = useState(0);
  const [activityVisible, setActivityVisible] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef(null);

  /* Activity ticker rotation */
  useEffect(() => {
    const interval = setInterval(() => {
      setActivityVisible(false);
      setTimeout(() => {
        setActivityIdx(i => (i + 1) % ACTIVITIES.length);
        setActivityVisible(true);
      }, 400);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  /* Sticky header on scroll */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* SEO */
  useEffect(() => {
    document.title = 'Get Free Moving Quotes in 60 Seconds | MoveLeads';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', 'Compare quotes from verified local movers. Free, instant, no spam. Only 1-3 movers contact you.');
  }, []);

  const scrollToHero = () => heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="gqv2-root">

      {/* ═══════════════════════════════════════
          STICKY HEADER
      ═══════════════════════════════════════ */}
      <header className={`gqv2-sticky-header ${scrolled ? 'gqv2-sticky-header--visible' : ''}`}>
        <div className="gqv2-sticky-inner">
          <Link to="/" className="gqv2-sticky-logo">
            <span className="gqv2-logo-ml">Move</span><span className="gqv2-logo-leads">Leads</span>
            <span className="gqv2-logo-dot">.cloud</span>
          </Link>
          <a href="tel:+13072044792" className="gqv2-sticky-phone">
            📞 +1 (307) 204-4792
          </a>
          <button className="gqv2-sticky-cta" onClick={scrollToHero}>
            Get Free Quote
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════
          SECTION 1 — HERO
      ═══════════════════════════════════════ */}
      <section className="gqv2-hero" ref={heroRef}>
        {/* Background photo + overlay */}
        <div
          className="gqv2-hero-bg"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=1920&q=80')`,
          }}
        />
        <div className="gqv2-hero-overlay" />

        {/* Nav bar inside hero */}
        <nav className="gqv2-hero-nav">
          <Link to="/" className="gqv2-hero-logo">
            <span className="gqv2-logo-ml">Move</span><span className="gqv2-logo-leads">Leads</span><span className="gqv2-logo-dot">.cloud</span>
          </Link>
          <a href="tel:+13072044792" className="gqv2-hero-phone">
            📞 +1 (307) 204-4792
          </a>
        </nav>

        {/* Hero content */}
        <div className="gqv2-hero-content">
          {/* Left: copy */}
          <div className="gqv2-hero-copy">
            <div className="gqv2-hero-badge">⚡ Licensed &amp; Verified Movers Only</div>
            <h1 className="gqv2-hero-h1">
              Get Free Moving<br />Quotes in 60 Seconds
            </h1>
            <p className="gqv2-hero-sub">
              Compare quotes from verified movers in your area. Free, no obligation, no spam calls.
            </p>
            <div className="gqv2-hero-trust-row">
              <span className="gqv2-trust-item">✓ Phone-verified movers</span>
              <span className="gqv2-trust-item">✓ Free — no credit card</span>
              <span className="gqv2-trust-item">✓ Quotes in minutes</span>
            </div>
          </div>

          {/* Right: Widget card */}
          <div className="gqv2-hero-widget-wrap">
            <div className="gqv2-hero-widget-card">
              <div className="gqv2-widget-card-header">
                <div className="gqv2-widget-card-title">Get Your Free Quote</div>
                <div className="gqv2-widget-card-stars">⭐⭐⭐⭐⭐ <span>4.9/5 Rating</span></div>
              </div>
              <DemoWidget companyId={null} />
              <div className="gqv2-widget-card-footer">
                🔒 Your info is never sold or shared
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 2 — SOCIAL PROOF BAR
      ═══════════════════════════════════════ */}
      <section className="gqv2-proof-bar">
        <div className="gqv2-proof-stats">
          <div className="gqv2-proof-stat">
            <span className="gqv2-proof-icon">⭐</span>
            <div>
              <div className="gqv2-proof-value">4.9/5.0 Rating</div>
              <div className="gqv2-proof-label">Based on 3,400+ reviews</div>
            </div>
          </div>
          <div className="gqv2-proof-divider" />
          <div className="gqv2-proof-stat">
            <span className="gqv2-proof-icon">📦</span>
            <div>
              <div className="gqv2-proof-value">10,000+ Moves</div>
              <div className="gqv2-proof-label">Completed nationwide</div>
            </div>
          </div>
          <div className="gqv2-proof-divider" />
          <div className="gqv2-proof-stat">
            <span className="gqv2-proof-icon">⚡</span>
            <div>
              <div className="gqv2-proof-value">15 Min Avg Response</div>
              <div className="gqv2-proof-label">From verified movers</div>
            </div>
          </div>
          <div className="gqv2-proof-divider" />
          <div className="gqv2-proof-stat">
            <span className="gqv2-proof-icon">🔒</span>
            <div>
              <div className="gqv2-proof-value">Phone-Verified</div>
              <div className="gqv2-proof-label">All movers in our network</div>
            </div>
          </div>
        </div>

        <div className="gqv2-activity-ticker">
          <span className="gqv2-ticker-dot" />
          <span className={`gqv2-ticker-text ${activityVisible ? 'gqv2-ticker-text--in' : 'gqv2-ticker-text--out'}`}>
            {ACTIVITIES[activityIdx]}
          </span>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 3 — HOW IT WORKS
      ═══════════════════════════════════════ */}
      <section className="gqv2-how">
        <AnimSection>
          <div className="gqv2-section-label">Simple Process</div>
          <h2 className="gqv2-section-h2">How It Works</h2>
          <p className="gqv2-section-sub">Get matched with a verified mover in 3 simple steps</p>
        </AnimSection>

        <div className="gqv2-how-cards">
          <AnimSection delay={0}>
            <div className="gqv2-how-card">
              <div className="gqv2-how-num">1</div>
              <div className="gqv2-how-icon">📋</div>
              <h3>Tell Us About Your Move</h3>
              <p>Takes 60 seconds. Home size, route, and date.</p>
            </div>
          </AnimSection>
          <div className="gqv2-how-arrow">→</div>
          <AnimSection delay={120}>
            <div className="gqv2-how-card">
              <div className="gqv2-how-num">2</div>
              <div className="gqv2-how-icon">🔍</div>
              <h3>We Match You With Movers</h3>
              <p>Verified, licensed movers who service your exact route.</p>
            </div>
          </AnimSection>
          <div className="gqv2-how-arrow">→</div>
          <AnimSection delay={240}>
            <div className="gqv2-how-card">
              <div className="gqv2-how-num">3</div>
              <div className="gqv2-how-icon">📞</div>
              <h3>Movers Contact You Directly</h3>
              <p>Expect a call within 15 minutes. You choose the best offer.</p>
            </div>
          </AnimSection>
        </div>

        <AnimSection>
          <div className="gqv2-how-photo-wrap">
            <img
              src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80"
              alt="Professional movers carrying furniture"
              className="gqv2-how-photo"
              loading="lazy"
            />
          </div>
        </AnimSection>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 4 — WHY MOVELEADS
      ═══════════════════════════════════════ */}
      <section className="gqv2-why">
        <div className="gqv2-why-inner">
          <AnimSection className="gqv2-why-photo-col">
            <img
              src="https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&q=80"
              alt="Movers loading a truck"
              className="gqv2-why-photo"
              loading="lazy"
            />
          </AnimSection>

          <AnimSection delay={100} className="gqv2-why-copy-col">
            <div className="gqv2-section-label">Our Commitment</div>
            <h2 className="gqv2-section-h2 gqv2-left">Why Thousands Choose MoveLeads</h2>
            <ul className="gqv2-why-list">
              <li>✅ All movers are phone-verified and licensed</li>
              <li>✅ Your info is never sold to third parties</li>
              <li>✅ Only 1–3 matched movers contact you — no spam</li>
              <li>✅ Free Resolution Center if anything goes wrong</li>
              <li>✅ Real-time matching — movers notified instantly</li>
            </ul>
            <button className="gqv2-cta-btn" onClick={scrollToHero}>
              Get My Free Quotes →
            </button>
          </AnimSection>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 5 — TESTIMONIALS
      ═══════════════════════════════════════ */}
      <section className="gqv2-testimonials">
        <AnimSection>
          <div className="gqv2-section-label">Customer Stories</div>
          <h2 className="gqv2-section-h2">What Our Customers Say</h2>
          <p className="gqv2-section-sub">Real reviews from homeowners who used MoveLeads</p>
        </AnimSection>

        <div className="gqv2-test-cards">
          {[
            {
              stars: 5,
              quote: 'Got 3 quotes in 10 minutes. Saved over $400 on my move. So much better than getting bombarded by calls from random companies.',
              name: 'Sarah M.',
              location: 'Dallas, TX → Austin, TX',
              avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
              delay: 0,
            },
            {
              stars: 5,
              quote: 'One form, one call, done. No spam from 10 different companies. The mover showed up on time and handled everything professionally.',
              name: 'James T.',
              location: 'Chicago, IL → Miami, FL',
              avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
              delay: 100,
            },
            {
              stars: 5,
              quote: "Finally a moving site that doesn't sell your number to everyone. Got exactly 2 calls from verified movers. Booked the same day.",
              name: 'Maria L.',
              location: 'Miami, FL → New York, NY',
              avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80',
              delay: 200,
            },
          ].map(({ stars, quote, name, location, avatar, delay }) => (
            <AnimSection key={name} delay={delay} className="gqv2-test-card-wrap">
              <div className="gqv2-test-card">
                <div className="gqv2-test-stars">{'⭐'.repeat(stars)}</div>
                <p className="gqv2-test-quote">"{quote}"</p>
                <div className="gqv2-test-author">
                  <img src={avatar} alt={name} className="gqv2-test-avatar" loading="lazy" />
                  <div>
                    <div className="gqv2-test-name">{name}</div>
                    <div className="gqv2-test-loc">{location}</div>
                  </div>
                </div>
              </div>
            </AnimSection>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 6 — MOVING TIPS
      ═══════════════════════════════════════ */}
      <section className="gqv2-tips">
        <AnimSection>
          <div className="gqv2-section-label">Expert Advice</div>
          <h2 className="gqv2-section-h2">Moving Tips From Our Experts</h2>
        </AnimSection>

        <div className="gqv2-tips-cards">
          {[
            { icon: '📅', tip: 'Book 4–6 weeks in advance for the best rates — especially in summer.' },
            { icon: '🌞', tip: 'Summer is peak season (May–Aug). Book early or expect higher prices.' },
            { icon: '📋', tip: "Always verify your mover's license before signing anything." },
          ].map(({ icon, tip }, i) => (
            <AnimSection key={i} delay={i * 100} className="gqv2-tip-card-wrap">
              <div className="gqv2-tip-card">
                <div className="gqv2-tip-icon">{icon}</div>
                <p>{tip}</p>
              </div>
            </AnimSection>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 7 — FAQ
      ═══════════════════════════════════════ */}
      <section className="gqv2-faq">
        <AnimSection>
          <div className="gqv2-section-label">Got Questions?</div>
          <h2 className="gqv2-section-h2">Common Questions</h2>
        </AnimSection>

        <AnimSection className="gqv2-faq-list">
          {FAQ_ITEMS.map(item => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </AnimSection>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 8 — BOTTOM CTA
      ═══════════════════════════════════════ */}
      <section className="gqv2-bottom-cta">
        <AnimSection>
          <h2 className="gqv2-bottom-h2">Your Mover is One Form Away</h2>
          <p className="gqv2-bottom-sub">Free. Takes 60 seconds. No spam, ever.</p>
          <button className="gqv2-cta-btn gqv2-cta-btn--lg" onClick={scrollToHero}>
            Get My Free Quotes Now →
          </button>
          <div className="gqv2-bottom-trust">
            <span>✓ Licensed movers only</span>
            <span>✓ Your info never sold</span>
            <span>✓ Free, no obligation</span>
          </div>
          <a href="tel:+13072044792" className="gqv2-bottom-phone">
            📞 +1 (307) 204-4792
          </a>
        </AnimSection>
      </section>

      {/* ═══════════════════════════════════════
          SECTION 9 — FOOTER
      ═══════════════════════════════════════ */}
      <footer className="gqv2-footer">
        <div className="gqv2-footer-inner">
          <div className="gqv2-footer-brand">
            <div className="gqv2-footer-logo">
              <span className="gqv2-logo-ml">Move</span><span className="gqv2-logo-leads">Leads</span><span className="gqv2-logo-dot">.cloud</span>
            </div>
            <p className="gqv2-footer-tagline">Verified moving leads. Real movers. Real results.</p>
          </div>

          <div className="gqv2-footer-links">
            <div className="gqv2-footer-col-title">Quick Links</div>
            <Link to="/">Home</Link>
            <Link to="/get-quote-v2">Get Quote</Link>
            <Link to="/for-movers">For Movers</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>

          <div className="gqv2-footer-contact">
            <div className="gqv2-footer-col-title">Contact</div>
            <a href="mailto:support@moveleads.cloud">support@moveleads.cloud</a>
            <a href="tel:+13072044792">+1 (307) 204-4792</a>
          </div>
        </div>

        <div className="gqv2-footer-bottom">
          © 2026 MoveLeads LLC. All rights reserved. Wyoming LLC.
        </div>
      </footer>
    </div>
  );
}
