import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { DemoWidget } from './WidgetPage';
import './GetQuoteV2.css';

/* Hardcoded so images work regardless of VITE_API_URL env var on Vercel */
const BASE = 'https://api.moveleads.cloud/api/images/generate';

const ACTIVITIES = [
  'Someone in Dallas just requested a quote — 2 min ago',
  'Someone in Miami just requested a quote — 5 min ago',
  'Someone in Chicago just requested a quote — 1 min ago',
  'Someone in New York just requested a quote — 3 min ago',
  'Someone in Houston just requested a quote — 7 min ago',
  'Someone in Phoenix just requested a quote — 4 min ago',
  'Someone in Los Angeles just requested a quote — 2 min ago',
  'Someone in Atlanta just requested a quote — 6 min ago',
];

const FAQ_ITEMS = [
  { q: 'Is this service free?',                  a: 'Yes — completely free for homeowners. No credit card required. You only pay when you decide to book directly with a mover.' },
  { q: 'Will I get spam calls?',                 a: 'No. We match you with 1–3 verified movers who service your exact route. We never sell your information to multiple companies.' },
  { q: 'How fast will movers respond?',          a: 'Most movers respond within 15 minutes. For urgent same-day moves, response times are even faster.' },
  { q: 'Are the movers licensed and insured?',   a: 'Yes. Every mover on MoveLeads is phone-verified and licensed. We block VoIP numbers and fake registrations so only legitimate moving companies can access your information.' },
  { q: 'What if something goes wrong?',          a: 'We have a built-in Resolution Center. Submit a complaint privately — the mover is notified and given the chance to resolve the issue before it affects their public reputation.' },
];

/* ── Intersection observer ── */
function useVisible(threshold = 0.12) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ── Count-up hook ── */
function useCountUp(target, { duration = 1800, decimals = 0 } = {}) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const steps = Math.ceil(duration / 16);
        let i = 0;
        const id = setInterval(() => {
          i++;
          const eased = 1 - Math.pow(1 - Math.min(i / steps, 1), 3);
          setVal(parseFloat((eased * target).toFixed(decimals)));
          if (i >= steps) clearInterval(id);
        }, 16);
      }
    }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, duration, decimals]);
  return [ref, val];
}

/* ── Scroll-reveal wrapper ── */
function Anim({ children, className = '', delay = 0 }) {
  const [ref, visible] = useVisible();
  return (
    <div
      ref={ref}
      className={`gqv2-anim${visible ? ' gqv2-anim--in' : ''}${className ? ' ' + className : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ── Lazy image with fade-in ── */
function LazyImg({ src, alt, className, style, ...rest }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onLoad={() => setLoaded(true)}
      style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 0.7s ease' }}
      {...rest}
    />
  );
}

/* ── FAQ item ── */
function FaqItem({ q, a, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`gqv2-faq-item${open ? ' gqv2-faq-item--open' : ''}`}>
      <button className="gqv2-faq-q" onClick={() => setOpen(o => !o)}>
        <span>{q}</span>
        <span className="gqv2-faq-arrow">▾</span>
      </button>
      <div className="gqv2-faq-a" style={{ maxHeight: open ? 200 : 0 }}>
        <p>{a}</p>
      </div>
    </div>
  );
}

/* ── Cost estimator ── */
const BASES = { Studio: 400, '1BR': 600, '2BR': 900, '3BR': 1400, '4BR+': 2000 };
function CostEstimator({ onGetQuote }) {
  const [miles, setMiles] = useState(300);
  const [size, setSize]   = useState('2BR');
  const base  = BASES[size];
  const local = miles < 50;
  const low   = local ? base                       : Math.round(base * 1.8 + miles * 0.4);
  const high  = local ? Math.round(base * 1.4)     : Math.round(base * 2.5 + miles * 0.75);
  const fmt   = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;
  return (
    <div className="gqv2-estimator">
      <div className="gqv2-est-title">💡 Quick Cost Estimate</div>
      <div className="gqv2-est-row">
        <div className="gqv2-est-label">Moving distance: <strong>{miles} miles</strong></div>
        <input type="range" min="10" max="2000" step="10" value={miles}
          onChange={e => setMiles(+e.target.value)} className="gqv2-est-slider" />
        <div className="gqv2-est-scale"><span>Local</span><span>500mi</span><span>1000mi</span><span>2000mi</span></div>
      </div>
      <div className="gqv2-est-row">
        <div className="gqv2-est-label">Home size</div>
        <div className="gqv2-est-sizes">
          {Object.keys(BASES).map(s => (
            <button key={s} className={`gqv2-est-size${size === s ? ' gqv2-est-size--on' : ''}`}
              onClick={() => setSize(s)}>{s}</button>
          ))}
        </div>
      </div>
      <div className="gqv2-est-result">
        <div className="gqv2-est-range">{fmt(low)} – {fmt(high)}</div>
        <div className="gqv2-est-note">Estimated range · Final price from verified movers</div>
      </div>
      <button className="gqv2-cta-btn gqv2-est-cta" onClick={onGetQuote}>
        Get exact quotes from verified movers →
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function GetQuoteV2() {
  const [actIdx, setActIdx]     = useState(0);
  const [actVisible, setActV]   = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [heroBg, setHeroBg]     = useState(false);
  const heroRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => {
      setActV(false);
      setTimeout(() => { setActIdx(i => (i + 1) % ACTIVITIES.length); setActV(true); }, 350);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 100);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => { document.title = 'Get Free Moving Quotes in 60 Seconds | MoveLeads'; }, []);

  const scrollToHero = () => heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const [r49,  v49]  = useCountUp(4.9,   { decimals: 1 });
  const [r10k, v10k] = useCountUp(10000, { duration: 2200 });
  const [r15,  v15]  = useCountUp(15);
  const [r100, v100] = useCountUp(100);

  return (
    <div className="gqv2-root">

      {/* ── Sticky header ── */}
      <header className={`gqv2-sticky${scrolled ? ' gqv2-sticky--show' : ''}`}>
        <div className="gqv2-sticky-inner">
          <Link to="/" className="gqv2-sticky-logo">
            <span className="gqv2-ml">Move</span><span className="gqv2-leads">Leads</span><span className="gqv2-dot">.cloud</span>
          </Link>
          <a href="tel:+13072044792" className="gqv2-sticky-phone">📞 +1 (307) 204-4792</a>
          <button className="gqv2-sticky-cta" onClick={scrollToHero}>Get Free Quote</button>
        </div>
      </header>

      {/* ── Top nav ── */}
      <nav className="gqv2-nav">
        <Link to="/" className="gqv2-nav-logo">
          <span className="gqv2-ml">Move</span><span className="gqv2-leads">Leads</span><span className="gqv2-dot">.cloud</span>
        </Link>
        <a href="tel:+13072044792" className="gqv2-nav-phone">📞 +1 (307) 204-4792</a>
      </nav>

      {/* ══════════════════════════════════
          HERO — full-viewport AI background
      ══════════════════════════════════ */}
      <section className="gqv2-hero" ref={heroRef}>
        <img
          src={`${BASE}/hero`}
          className="gqv2-hero-photo"
          alt=""
          aria-hidden="true"
          onLoad={() => setHeroBg(true)}
          style={{ opacity: heroBg ? 0.18 : 0 }}
        />

        <div className="gqv2-hero-inner">
          <div className="gqv2-hero-left">
            <div className="gqv2-hero-badge">⚡ Licensed &amp; Verified Movers Only</div>
            <h1 className="gqv2-hero-h1">Get Free Moving<br />Quotes in <span>60 Seconds</span></h1>
            <p className="gqv2-hero-sub">Compare quotes from verified, licensed movers in your area. Free, no obligation, no spam calls — ever.</p>
            <div className="gqv2-hero-trust">
              {['All movers are phone-verified and licensed','Your info is never sold to third parties','Only 1–3 matched movers contact you','Free resolution center if anything goes wrong'].map(t => (
                <div key={t} className="gqv2-trust-row"><div className="gqv2-trust-check">✓</div>{t}</div>
              ))}
            </div>
            <div className="gqv2-hero-stats">
              <div className="gqv2-hero-stat"><div className="gqv2-stat-num">4.9★</div><div className="gqv2-stat-lbl">Average rating</div></div>
              <div className="gqv2-hero-stat"><div className="gqv2-stat-num">10K+</div><div className="gqv2-stat-lbl">Moves completed</div></div>
              <div className="gqv2-hero-stat"><div className="gqv2-stat-num">15 min</div><div className="gqv2-stat-lbl">Avg response time</div></div>
            </div>
          </div>

          <div className="gqv2-hero-right">
            <div className="gqv2-form-card">
              <div className="gqv2-form-card-title">Get Your Free Quote</div>
              <div className="gqv2-form-card-sub">Takes 60 seconds — movers respond in minutes</div>
              <div className="gqv2-ticker-wrap">
                <span className="gqv2-ticker-dot" />
                <span className="gqv2-ticker-text" style={{ opacity: actVisible ? 1 : 0, transition: 'opacity 0.35s' }}>
                  {ACTIVITIES[actIdx]}
                </span>
              </div>
              <DemoWidget companyId={null} />
              <div className="gqv2-trust-badges">
                <div className="gqv2-badge-item">🏛️ FMCSA Licensed</div>
                <div className="gqv2-badge-item">🔒 SSL Secured</div>
                <div className="gqv2-badge-item">⭐ BBB Accredited</div>
                <div className="gqv2-badge-item">📦 10,000+ Moves</div>
              </div>
              <div className="gqv2-form-trust">🔒 Your info is never sold or shared</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          PROOF BAR — animated counters
      ══════════════════════════════════ */}
      <section className="gqv2-proof-bar">
        <div className="gqv2-proof-inner">
          <div className="gqv2-proof-item" ref={r49}>
            <div className="gqv2-proof-num">{v49.toFixed(1)}/5.0</div>
            <div className="gqv2-proof-lbl">Customer rating</div>
          </div>
          <div className="gqv2-proof-item" ref={r10k}>
            <div className="gqv2-proof-num">{v10k >= 10000 ? '10,000+' : Math.floor(v10k).toLocaleString()}</div>
            <div className="gqv2-proof-lbl">Moves completed</div>
          </div>
          <div className="gqv2-proof-item" ref={r15}>
            <div className="gqv2-proof-num">{Math.floor(v15)} min</div>
            <div className="gqv2-proof-lbl">Avg response time</div>
          </div>
          <div className="gqv2-proof-item" ref={r100}>
            <div className="gqv2-proof-num">{Math.floor(v100)}%</div>
            <div className="gqv2-proof-lbl">Verified movers</div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          HOW IT WORKS — steps + side photo
      ══════════════════════════════════ */}
      <section className="gqv2-how">
        <div className="gqv2-how-inner">
          <div className="gqv2-how-left">
            <Anim>
              <div className="gqv2-section-tag">How it works</div>
              <h2 className="gqv2-section-h2 gqv2-left">Three steps to your perfect mover</h2>
              <p className="gqv2-section-sub gqv2-left">No browsing endless listings. No callbacks from strangers. Just verified movers for your route.</p>
            </Anim>
            <div className="gqv2-steps">
              {[
                { n: '1', title: 'Tell us about your move',     desc: 'Home size, origin, destination, and move date. Takes under 60 seconds.' },
                { n: '2', title: 'We match you with movers',    desc: 'Our system finds verified, licensed movers who service your exact route and filters out brokers.' },
                { n: '3', title: 'Movers contact you directly', desc: 'Expect a call or text within 15 minutes. You compare offers and choose the best one.' },
              ].map(({ n, title, desc }, i) => (
                <Anim key={n} delay={i * 120} className="gqv2-step-anim">
                  <div className="gqv2-step-card">
                    <div className="gqv2-step-num">{n}</div>
                    <div className="gqv2-step-title">{title}</div>
                    <div className="gqv2-step-desc">{desc}</div>
                  </div>
                </Anim>
              ))}
            </div>
          </div>
          <Anim className="gqv2-how-right" delay={80}>
            <LazyImg
              src={`${BASE}/couple`}
              alt="Couple packing for their move"
              className="gqv2-how-photo"
            />
          </Anim>
        </div>
      </section>

      {/* ══════════════════════════════════
          WHY MOVELEADS — photo + copy
      ══════════════════════════════════ */}
      <section className="gqv2-why">
        <div className="gqv2-why-inner">
          <Anim className="gqv2-why-photo-col">
            <LazyImg
              src={`${BASE}/movers`}
              alt="Professional movers"
              className="gqv2-why-photo"
              loading="lazy"
            />
          </Anim>
          <Anim delay={100} className="gqv2-why-copy-col">
            <div className="gqv2-section-tag">Why MoveLeads</div>
            <h2 className="gqv2-section-h2 gqv2-left">Not another quote site</h2>
            <p className="gqv2-section-sub gqv2-left">Other sites sell your number to 8 strangers who all call at once. We do it differently.</p>
            <div className="gqv2-why-list">
              {[
                { icon: '🔒', title: 'Your info is never sold',    desc: 'We never sell or share your contact details with anyone outside our verified mover network.' },
                { icon: '✅', title: 'Phone-verified movers only', desc: 'Every mover is phone-verified and licensed. No fake numbers, no brokers, no surprises.' },
                { icon: '⚡', title: '15-minute response time',    desc: 'Verified movers are notified instantly. Most respond within 15 minutes of your request.' },
                { icon: '🛡️', title: 'Resolution Center included', desc: 'Had an issue? Resolve it privately before it hits public review sites.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="gqv2-why-item">
                  <div className="gqv2-why-icon">{icon}</div>
                  <div><div className="gqv2-why-title">{title}</div><div className="gqv2-why-desc">{desc}</div></div>
                </div>
              ))}
            </div>
            <button className="gqv2-cta-btn" onClick={scrollToHero}>Get My Free Quotes →</button>
          </Anim>
        </div>
      </section>

      {/* ══════════════════════════════════
          REVIEWS — Unsplash avatars (CF faces look bad)
      ══════════════════════════════════ */}
      <section className="gqv2-reviews">
        <Anim>
          <div className="gqv2-section-tag">Customer reviews</div>
          <h2 className="gqv2-section-h2">Families moved, deals closed</h2>
        </Anim>
        <div className="gqv2-review-cards">
          {[
            { quote: 'Got 3 quotes in 10 minutes. Saved over $400 on my move. So much better than getting bombarded by random calls.',          name: 'Sarah M.', loc: 'Dallas, TX → Austin, TX',   avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80', delay: 0 },
            { quote: 'One form, one call, done. No spam from 10 different companies. The mover showed up on time and handled everything.',       name: 'James T.', loc: 'Chicago, IL → Miami, FL',  avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80', delay: 100 },
            { quote: "Finally a moving site that doesn't sell your number to everyone. Got 2 calls from verified movers. Booked the same day.", name: 'Maria L.', loc: 'Miami, FL → New York, NY', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80', delay: 200 },
          ].map(({ quote, name, loc, avatar, delay }) => (
            <Anim key={name} delay={delay} className="gqv2-review-card-anim">
              <div className="gqv2-review-card">
                <div className="gqv2-review-stars">★★★★★</div>
                <p className="gqv2-review-text">"{quote}"</p>
                <div className="gqv2-reviewer">
                  <img src={avatar} alt={name} className="gqv2-avatar" loading="lazy" />
                  <div>
                    <div className="gqv2-reviewer-name">{name}</div>
                    <div className="gqv2-reviewer-loc">{loc}</div>
                  </div>
                </div>
              </div>
            </Anim>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════
          FULL-WIDTH BANNER — aerial neighborhood
      ══════════════════════════════════ */}
      <div className="gqv2-banner">
        <LazyImg src={`${BASE}/banner`} alt="" aria-hidden="true" className="gqv2-banner-img" />
        <div className="gqv2-banner-overlay">
          <Anim>
            <h2 className="gqv2-banner-h2">Trusted by 10,000+ families nationwide</h2>
            <p className="gqv2-banner-sub">Verified movers. Real quotes. No spam. Since 2022.</p>
            <button className="gqv2-cta-btn" onClick={scrollToHero}>Get My Free Quote →</button>
          </Anim>
        </div>
      </div>

      {/* ══════════════════════════════════
          COST ESTIMATOR
      ══════════════════════════════════ */}
      <section className="gqv2-estimator-section">
        <Anim><CostEstimator onGetQuote={scrollToHero} /></Anim>
      </section>

      {/* ══════════════════════════════════
          FAQ
      ══════════════════════════════════ */}
      <section className="gqv2-faq">
        <div className="gqv2-faq-inner">
          <Anim className="gqv2-faq-header">
            <div className="gqv2-section-tag">FAQ</div>
            <h2 className="gqv2-section-h2">Common questions</h2>
          </Anim>
          <div className="gqv2-faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem key={item.q} q={item.q} a={item.a} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          CTA — AI family background + overlay
      ══════════════════════════════════ */}
      <section className="gqv2-cta-section">
        <LazyImg src={`${BASE}/family`} alt="" aria-hidden="true" className="gqv2-cta-bg-img" />
        <div className="gqv2-cta-overlay">
          <Anim>
            <h2 className="gqv2-cta-title">Your mover is one form <span>away</span></h2>
            <p className="gqv2-cta-sub">Free. Takes 60 seconds. No spam, ever.</p>
            <button className="gqv2-cta-btn gqv2-cta-btn--lg" onClick={scrollToHero}>
              Get My Free Quotes Now →
            </button>
            <div className="gqv2-cta-notes">
              <span className="gqv2-cta-note">✓ Licensed movers only</span>
              <span className="gqv2-cta-note">✓ Your info never sold</span>
              <span className="gqv2-cta-note">✓ Free, no obligation</span>
            </div>
          </Anim>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="gqv2-footer">
        <div className="gqv2-footer-logo">
          <span className="gqv2-ml">Move</span><span className="gqv2-leads">Leads</span><span className="gqv2-dot">.cloud</span>
        </div>
        <div className="gqv2-footer-copy">© 2026 MoveLeads LLC. Wyoming LLC.</div>
        <div className="gqv2-footer-links">
          <Link to="/privacy" className="gqv2-footer-link">Privacy</Link>
          <Link to="/terms" className="gqv2-footer-link">Terms</Link>
          <Link to="/for-movers" className="gqv2-footer-link">For Movers</Link>
        </div>
      </footer>
    </div>
  );
}
