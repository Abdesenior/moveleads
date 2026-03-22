import { useState, useContext, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, Zap, CreditCard, ArrowRight, CheckCircle,
  Clock, BarChart3, Lock, ChevronDown, ChevronUp, Truck
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import LeadVolumeWidget from '../components/LeadVolumeWidget';
import '../components/LeadVolumeWidget.css';
import './ForMovers.css';

// ─── Static data ────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: <ShieldCheck size={26} />,
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    tag: 'Twilio Lookup V2',
    title: '100% Phone-Verified Leads',
    body: 'Every lead is run through the Twilio Lookup API before it ever reaches your inbox. VoIP numbers, burners, and fake lines are rejected automatically — you only see real mobile and landline customers.'
  },
  {
    icon: <Zap size={26} />,
    color: '#f97316',
    bg: 'rgba(249,115,22,0.12)',
    tag: 'WebSocket Real-Time',
    title: 'Speed-to-Lead in Seconds',
    body: 'The moment a quote form is submitted and verified, our WebSocket engine broadcasts it directly to your dashboard. First mover wins — no email delay, no polling, no missed opportunities.'
  },
  {
    icon: <CreditCard size={26} />,
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.12)',
    tag: 'Stripe Auto-Recharge',
    title: 'Never Miss a Lead to Low Balance',
    body: 'Set a balance threshold and a recharge amount once. When your credit dips below it, we automatically top your account back up — so a big afternoon of leads never finds you empty-handed.'
  }
];

const HOW_IT_WORKS = [
  { n: '01', title: 'Create your account', body: 'Sign up in 60 seconds. Set your coverage zip codes and deposit your first balance.' },
  { n: '02', title: 'Leads hit your dashboard live', body: 'A homeowner fills out our quote form. Twilio verifies their phone. Your screen lights up.' },
  { n: '03', title: 'Claim, call, convert', body: 'Purchase the lead with one click. Our Speed-to-Lead SMS sends you the contact instantly. You call first.' }
];

const TESTIMONIALS = [
  { quote: 'We cut our cost-per-booked-job by 60% in the first month. The phone verification is a game-changer — every number I call actually answers.', name: 'Marcus R.', company: 'BlueStar Moving, Houston TX', rating: 5 },
  { quote: 'The real-time dashboard is insane. I\'m literally watching leads come in and claiming them before my competition even checks their email.', name: 'Daniela F.', company: 'FastMove Co., Miami FL', rating: 5 },
  { quote: 'Auto-recharge means I stopped babysitting my balance. Set it and forget it — leads just keep coming.', name: 'Tony K.', company: 'Apex Relocation, Chicago IL', rating: 5 }
];

const FAQS = [
  { q: 'How are leads priced?', a: 'Leads are priced dynamically based on home size and distance (Local vs. Long Distance). Prices start at $10 for a studio local move and scale up. You see the exact price before you claim any lead.' },
  { q: 'Are leads shared or exclusive?', a: 'Leads are capped at a maximum of 3 buyers. You compete on speed — the faster you claim, the more likely you are the first and only mover the customer hears from.' },
  { q: 'How does phone verification work?', a: 'We use the Twilio Lookup V2 API to check every submitted phone number before a lead is broadcast. Numbers that come back as VoIP, invalid, or unverifiable are automatically rejected.' },
  { q: 'Can I set a coverage area?', a: 'Yes. After signup you\'ll land in your dashboard where you can add as many origin and destination zip codes as you service. You only receive leads that match your coverage.' },
  { q: 'Is there a monthly fee?', a: 'No monthly subscription. You pre-load credits and only pay per lead claimed. Auto-recharge is optional and completely configurable.' }
];

// ─── FAQ accordion item ───────────────────────────────────────────────────
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`fm-faq-item ${open ? 'fm-faq-item--open' : ''}`}>
      <button className="fm-faq-q" onClick={() => setOpen(o => !o)} type="button">
        <span>{q}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <p className="fm-faq-a">{a}</p>}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function ForMovers() {
  const { API_URL } = useContext(AuthContext);
  const formRef = useRef(null);

  const [form, setForm] = useState({ contactName: '', companyName: '', phone: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);

  const set = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) return setError('Password must be at least 6 characters');

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName,
          phone: form.phone,
          email: form.email,
          password: form.password
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Registration failed');
      setIsRegistered(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div className="fm-page">
      {/* ══ Navbar ══ */}
      <nav className="fm-nav">
        <Link to="/" className="fm-logo">MoveLeads<span>.cloud</span></Link>
        <div className="fm-nav-links">
          <a href="#features" className="fm-nav-link">Features</a>
          <a href="#pricing" className="fm-nav-link">Pricing</a>
          <a href="#faq" className="fm-nav-link">FAQ</a>
          <Link to="/login" className="fm-nav-link">Sign In</Link>
          <button onClick={scrollToForm} className="fm-nav-cta">Get Started Free</button>
        </div>
      </nav>

      {/* ══ Hero ══ */}
      <section className="fm-hero">
        <div className="fm-hero-bg-orb fm-orb1" />
        <div className="fm-hero-bg-orb fm-orb2" />

        <div className="fm-hero-inner">
          {/* Left copy */}
          <div className="fm-hero-copy">
            <div className="fm-hero-badge">
              <ShieldCheck size={14} />
              Powered by Twilio · Stripe · WebSockets
            </div>
            <h1 className="fm-hero-h1">
              Stop Paying for<br />
              <span className="fm-h1-accent">Fake Leads.</span>
            </h1>
            <p className="fm-hero-sub">
              100% phone-verified moving leads delivered in real-time. Only pay when you claim. No monthly fees. Cancel any time.
            </p>

            <ul className="fm-hero-checks">
              {['Every phone number verified by Twilio', 'Live WebSocket alerts the second a lead drops', 'Capped at 3 buyers — speed wins', 'Auto-recharge so you never go dark'].map(t => (
                <li key={t}><CheckCircle size={16} /><span>{t}</span></li>
              ))}
            </ul>

            <div className="fm-hero-social">
              <div className="fm-avatars">
                {['M', 'D', 'T', 'J', 'A'].map((l, i) => (
                  <div key={i} className="fm-avatar" style={{ background: ['#f97316', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'][i] }}>{l}</div>
                ))}
              </div>
              <div>
                <div className="fm-social-stars">{'★'.repeat(5)}</div>
                <p className="fm-social-label">500+ movers trust MoveLeads.cloud</p>
              </div>
            </div>
          </div>

          {/* Right — registration card */}
          <div className="fm-hero-form-wrap" ref={formRef}>
            <div className="fm-form-card">
              {isRegistered ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', color: '#22c55e', marginBottom: 24 }}>
                    <CheckCircle size={32} />
                  </div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16, color: 'var(--bg-navy)' }}>Account created!</h2>
                  <p style={{ color: '#475569', fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
                    Please check your email (<strong>{form.email}</strong>) to verify your account before logging in.
                  </p>
                  <Link to="/login" className="fm-submit-btn" style={{ display: 'inline-flex', justifyContent: 'center', textDecoration: 'none' }}>
                    Go to Login <ArrowRight size={16} />
                  </Link>
                </div>
              ) : (
                <>
                  <div className="fm-form-card-header">
                    <Truck size={20} />
                    <span>Create Your Mover Account</span>
                  </div>
                  <p className="fm-form-card-sub">Free to join. First lead as low as $10.</p>

                  {error && <div className="fm-form-error">{error}</div>}

                  <form onSubmit={handleSubmit} noValidate>
                    <div className="fm-field">
                      <label className="fm-label">Your name</label>
                      <input name="contactName" value={form.contactName} onChange={set} type="text"
                        className="fm-input" placeholder="Jane Smith" required autoComplete="name" />
                    </div>
                    <div className="fm-field">
                      <label className="fm-label">Company name</label>
                      <input name="companyName" value={form.companyName} onChange={set} type="text"
                        className="fm-input" placeholder="ACME Moving Co." required autoComplete="organization" />
                    </div>
                    <div className="fm-field">
                      <label className="fm-label">Phone number</label>
                      <input name="phone" value={form.phone} onChange={set} type="tel"
                        className="fm-input" placeholder="(555) 123-4567" autoComplete="tel" />
                    </div>
                    <div className="fm-field">
                      <label className="fm-label">Email address</label>
                      <input name="email" value={form.email} onChange={set} type="email"
                        className="fm-input" placeholder="you@company.com" required autoComplete="email" />
                    </div>
                    <div className="fm-field">
                      <label className="fm-label">Password</label>
                      <input name="password" value={form.password} onChange={set} type="password"
                        className="fm-input" placeholder="Min 6 characters" required autoComplete="new-password" />
                    </div>

                    <button type="submit" className="fm-submit-btn" disabled={loading}>
                      {loading
                        ? <span className="fm-spinner" />
                        : <><span>Create Account & Start Getting Leads</span><ArrowRight size={16} /></>
                      }
                    </button>
                  </form>

                  <div className="fm-form-trust">
                    <Lock size={12} /> SSL Secured &nbsp;·&nbsp; <ShieldCheck size={12} /> No spam &nbsp;·&nbsp; <CreditCard size={12} /> Powered by Stripe
                  </div>
                  <p className="fm-form-signin">
                    Already have an account? <Link to="/login">Sign in</Link>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ Trust strip ══ */}
      <div className="fm-trust-strip">
        {[
          { icon: <ShieldCheck size={18} />, label: 'Twilio-Verified Phones' },
          { icon: <Zap size={18} />, label: 'Real-Time WebSocket Alerts' },
          { icon: <BarChart3 size={18} />, label: 'Dynamic Lead Pricing' },
          { icon: <Clock size={18} />, label: 'Speed-to-Lead SMS' },
          { icon: <CreditCard size={18} />, label: 'Stripe Auto-Recharge' }
        ].map((item, i) => (
          <div key={i} className="fm-trust-item">
            {item.icon}<span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* ══ 3 Pillars ══ */}
      <section id="features" className="fm-section fm-section--light">
        <div className="fm-section-inner">
          <p className="fm-section-eyebrow">Why MoveLeads.cloud</p>
          <h2 className="fm-section-h2">The infrastructure behind every verified lead</h2>
          <p className="fm-section-desc">We built the tech stack from scratch so you don't have to gamble on lead quality.</p>

          <div className="fm-pillars">
            {FEATURES.map((f, i) => (
              <div key={i} className="fm-pillar">
                <div className="fm-pillar-icon" style={{ background: f.bg, color: f.color }}>{f.icon}</div>
                <span className="fm-pillar-tag" style={{ color: f.color }}>{f.tag}</span>
                <h3 className="fm-pillar-title">{f.title}</h3>
                <p className="fm-pillar-body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ How it works ══ */}
      <section className="fm-section fm-section--dark">
        <div className="fm-section-inner">
          <p className="fm-section-eyebrow fm-eyebrow--orange">Simple process</p>
          <h2 className="fm-section-h2 fm-h2--white">From form submission to phone call in under 60 seconds</h2>

          <div className="fm-how-steps">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={i} className="fm-how-step">
                <div className="fm-how-num">{s.n}</div>
                {i < HOW_IT_WORKS.length - 1 && <div className="fm-how-connector" />}
                <h3 className="fm-how-title">{s.title}</h3>
                <p className="fm-how-body">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Lead Volume Widget ══ */}
      <section className="fm-section fm-section--dark fm-section--widget">
        <div className="fm-section-inner">
          <div className="fm-widget-layout">
            <div className="fm-widget-copy">
              <p className="fm-section-eyebrow fm-eyebrow--orange">Live market data</p>
              <h2 className="fm-section-h2 fm-h2--white">See the money you're leaving on the table</h2>
              <p className="fm-widget-desc">
                Type in any zip code and see exactly how many phone-verified moving leads we generated there this week. Real numbers, real demand — right now.
              </p>
              <ul className="fm-widget-bullets">
                <li><CheckCircle size={15} /><span>Data pulled live from our database</span></li>
                <li><CheckCircle size={15} /><span>Only counts verified, distributable leads</span></li>
                <li><CheckCircle size={15} /><span>Zero leads? We show nearby area demand</span></li>
              </ul>
            </div>
            <LeadVolumeWidget onSignupClick={scrollToForm} />
          </div>
        </div>
      </section>

      {/* ══ Pricing ══ */}
      <section id="pricing" className="fm-section fm-section--light">
        <div className="fm-section-inner">
          <p className="fm-section-eyebrow">Pricing</p>
          <h2 className="fm-section-h2">Simple, transparent pricing</h2>
          <p className="fm-section-desc">No subscriptions. No contracts. Just credits you spend on leads you actually want.</p>

          <div className="fm-pricing-grid">
            <div className="fm-pricing-card">
              <div className="fm-pricing-tag">Pay-Per-Lead</div>
              <div className="fm-pricing-from">Starting from</div>
              <div className="fm-pricing-amount">$10<span>/lead</span></div>
              <p className="fm-pricing-note">Price scales with home size &amp; distance. You see the price before you claim.</p>
              <ul className="fm-pricing-list">
                {['No monthly fee', 'Pre-load credits', 'Leads capped at 3 buyers', 'Optional auto-recharge', 'Cancel any time'].map(t => (
                  <li key={t}><CheckCircle size={14} />{t}</li>
                ))}
              </ul>
              <button onClick={scrollToForm} className="fm-pricing-cta">Get Started Free</button>
            </div>

            <div className="fm-pricing-card fm-pricing-card--featured">
              <div className="fm-pricing-badge">Most popular</div>
              <div className="fm-pricing-tag">Auto-Recharge Plan</div>
              <div className="fm-pricing-from">Set once, run forever</div>
              <div className="fm-pricing-amount fm-pa--white">$0<span>/month</span></div>
              <p className="fm-pricing-note fm-pn--white">Configure a minimum balance and recharge amount. We bill your card automatically so you never miss a lead.</p>
              <ul className="fm-pricing-list fm-pl--white">
                {['Everything in Pay-Per-Lead', 'Automatic Stripe billing when balance falls below threshold', 'Email confirmation every recharge', 'Configurable threshold &amp; amount', 'Dispute protection on every lead'].map(t => (
                  <li key={t}><CheckCircle size={14} /><span dangerouslySetInnerHTML={{ __html: t }} /></li>
                ))}
              </ul>
              <button onClick={scrollToForm} className="fm-pricing-cta fm-pricing-cta--white">Create Free Account</button>
            </div>
          </div>
        </div>
      </section>

      {/* ══ Testimonials ══ */}
      <section className="fm-section fm-section--dark">
        <div className="fm-section-inner">
          <p className="fm-section-eyebrow fm-eyebrow--orange">What movers say</p>
          <h2 className="fm-section-h2 fm-h2--white">Real results from real moving companies</h2>

          <div className="fm-testimonials">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="fm-testimonial">
                <div className="fm-t-stars">{'★'.repeat(t.rating)}</div>
                <p className="fm-t-quote">"{t.quote}"</p>
                <div className="fm-t-author">
                  <div className="fm-t-avatar">{t.name[0]}</div>
                  <div>
                    <p className="fm-t-name">{t.name}</p>
                    <p className="fm-t-company">{t.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section id="faq" className="fm-section fm-section--light">
        <div className="fm-section-inner fm-section-inner--narrow">
          <p className="fm-section-eyebrow">FAQ</p>
          <h2 className="fm-section-h2">Common questions</h2>
          <div className="fm-faq-list">
            {FAQS.map((f, i) => <FaqItem key={i} {...f} />)}
          </div>
        </div>
      </section>

      {/* ══ Bottom CTA ══ */}
      <section className="fm-cta-section">
        <div className="fm-cta-inner">
          <h2 className="fm-cta-h2">Ready to stop wasting money on fake leads?</h2>
          <p className="fm-cta-sub">Join 500+ verified moving companies. No monthly fee. Your first lead could arrive today.</p>
          <button onClick={scrollToForm} className="fm-cta-btn">
            Create Free Account <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* ══ Footer ══ */}
      <footer className="fm-footer">
        <div className="fm-footer-inner">
          <div className="fm-footer-logo">MoveLeads<span>.cloud</span></div>
          <div className="fm-footer-links">
            <Link to="/">Home</Link>
            <Link to="/get-quote">Get a Quote</Link>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/login">Sign In</Link>
          </div>
          <p className="fm-footer-copy">© {new Date().getFullYear()} MoveLeads.cloud — All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
