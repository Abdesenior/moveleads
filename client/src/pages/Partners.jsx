import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import useCanonical from '../utils/useCanonical';
import JsonLd from '../components/JsonLd';
import { useMoverFunnelPixel } from '../hooks/useMoverFunnelPixel';
import './Partners.css';

// ── Data ────────────────────────────────────────────────────────────────────
const STEPS = [
  {
    n: '01', title: 'Customer requests movers',
    body: 'They submit route, move size, timeline, and contact details.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 L2 12 v6 a2 2 0 002 2 h16 a2 2 0 002-2 v-6 l-3.45-6.89 A2 2 0 0016.76 4 H7.24 a2 2 0 00-1.79 1.11 z" />
      </svg>
    ),
  },
  {
    n: '02', title: 'We verify the customer',
    body: 'We check phone quality, move details, timing, and duplicates.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    n: '03', title: 'You unlock the jobs you want',
    body: 'Choose by route, job size, urgency, and service area.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 019.9-1" />
      </svg>
    ),
  },
  {
    n: '04', title: 'Call first and book the move',
    body: 'Contact the customer fast before competitors reach them.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
      </svg>
    ),
  },
];

const PAIN = [
  'Dead numbers and fake names',
  'Customers who never pick up',
  'The same request sold to too many movers',
  'Paying before seeing job details',
  'No control over which jobs you get',
];

const SOLN = [
  'Phone-checked move requests',
  'Review route, size, and timing first',
  'Unlock only jobs that fit your crews',
  'No monthly subscription',
  'Fresh requests pushed fast',
];

const LEADS = [
  {
    kind: 'Local move', pillKind: 'verified', pillText: 'Verified',
    from: 'Tampa, FL', to: 'St. Petersburg, FL',
    submitted: 'SUBMITTED 12 MIN AGO · 23 MI',
    rows: [
      ['Move size', '2 Bedroom'],
      ['Timeline',  'Within 7 days'],
      ['Service',   'Moving only'],
      ['Phone',     '✓ Verified'],
    ],
    credits: 35,
  },
  {
    kind: 'Long distance', pillKind: 'hot', pillText: 'Hot move',
    from: 'Los Angeles, CA', to: 'Las Vegas, NV',
    submitted: 'SUBMITTED 2 MIN AGO · 270 MI',
    rows: [
      ['Move size', '3+ Bedroom'],
      ['Timeline',  'ASAP'],
      ['Service',   'Moving + packing'],
      ['Intent',    '✓ High intent'],
    ],
    credits: 75,
  },
  {
    kind: 'Small apartment', pillKind: 'new', pillText: 'Fresh',
    from: 'Brooklyn, NY', to: 'Queens, NY',
    submitted: 'SUBMITTED 18 MIN AGO · 11 MI',
    rows: [
      ['Move size', '1 Bedroom'],
      ['Timeline',  'Within 2 weeks'],
      ['Service',   'Moving only'],
      ['Request',   '✓ Verified'],
    ],
    credits: 25,
  },
];

const WHO = [
  {
    title: 'Fill local routes',
    body:  'Find customers moving inside your service area and keep local crews busy.',
    tag:   '→ 25–60 credits per move',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    title: 'Win higher-ticket interstate jobs',
    body:  'Unlock long-distance moves with bigger job values and stronger booking potential.',
    tag:   '→ 60–120 credits per move',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    title: 'Keep trucks and crews booked',
    body:  'Add jobs when you have capacity without signing monthly contracts.',
    tag:   '→ Pay only for what fits',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
        <path d="M9 15l2 2 4-4" />
      </svg>
    ),
  },
];

const FAQS = [
  { q: 'Do I need a monthly subscription?',           a: "No. MoveLeads runs on a simple credit system. You buy credits and use them to unlock moves — no recurring fee, no contract, no minimum spend.", open: true },
  { q: 'Can I choose which move requests to unlock?', a: "Yes. You preview every move's route, size, timeline, service type and verification status before unlocking the customer's contact information. You're never charged credits for a move you don't want." },
  { q: 'Are the customers phone-verified?',           a: 'Every move request is phone-checked and scored before being pushed to the dashboard. Verified requests are clearly marked, and high-intent or hot moves carry a separate badge.' },
  { q: 'What do I see before unlocking a job?',       a: "You see the route, move size, timeline, service type (move only / move + pack), verification status, and the credit cost. The customer's phone number and email are unlocked once you spend the credits." },
  { q: 'Is the same request sold to every mover?',    a: "No. We cap the number of movers who can unlock a single move so customers don't get bombarded and you don't compete with five other crews. First-mover advantage is real on this platform." },
  { q: 'What happens after I unlock a request?',      a: "The customer's contact details are unlocked instantly. You call them directly to qualify, quote, and book the move. Most movers reach the customer inside 5 minutes." },
  { q: 'Is there a contract?',                        a: "No long-term contract. Buy a credit pack, test the platform, and walk away if it doesn't work for your business. Credits never expire." },
];

const PHONE = '+13072044792';
const PHONE_DISPLAY = '+1 (307) 204-4792';

// ── Sub-components ──────────────────────────────────────────────────────────

function HLOC({ onUnlock }) {
  return (
    <div className="hloc-shell">
      <div className="hloc-glow" />
      <svg className="hloc-route-bg" viewBox="0 0 500 360" fill="none" aria-hidden="true">
        <path d="M40 280 Q 180 80 460 100" stroke="#f97316" strokeWidth="2" strokeDasharray="4 8" strokeLinecap="round" opacity="0.5" />
        <circle cx="40" cy="280" r="6" fill="#f97316" opacity="0.7" />
        <circle cx="460" cy="100" r="6" fill="#4ade80" opacity="0.7" />
      </svg>

      <div className="hloc">
        <div className="hloc-top">
          <span className="hloc-pill hloc-pill-live"><span className="hloc-pulse" />Live move request</span>
          <span className="hloc-pill hloc-pill-verified">✓ Phone verified</span>
        </div>

        <div className="hloc-route">
          <span>Dallas, TX</span><span className="hloc-arr">→</span><span>Austin, TX</span>
        </div>

        <div className="hloc-grid">
          <div className="hloc-cell">
            <div className="hloc-lab">Move size</div>
            <div className="hloc-val">3 Bedroom</div>
          </div>
          <div className="hloc-cell">
            <div className="hloc-lab">Timeline</div>
            <div className="hloc-val">Needs movers this week</div>
          </div>
          <div className="hloc-cell">
            <div className="hloc-lab">Service</div>
            <div className="hloc-val">Move + packing</div>
          </div>
          <div className="hloc-cell">
            <div className="hloc-lab">Phone</div>
            <div className="hloc-val">Verified customer</div>
          </div>
        </div>

        <div className="hloc-money">
          <div className="hloc-money-est">
            <div className="hloc-lab">Estimated move value</div>
            <div className="hloc-money-val hloc-money-est-v">$4,200</div>
          </div>
          <div className="hloc-money-sep" />
          <div className="hloc-money-cost">
            <div className="hloc-lab">Unlock cost</div>
            <div className="hloc-money-val hloc-money-cost-v">$32</div>
          </div>
        </div>

        <button type="button" className="hloc-cta" onClick={onUnlock}>Unlock this move &nbsp;→</button>

        <div className="hloc-foot">3 moving companies viewing now · only pay if you unlock</div>
      </div>

      <div className="hloc-unlocked">
        <div className="hloc-unlocked-lab">Just unlocked</div>
        <div className="hloc-unlocked-val">Houston mover · 4m ago</div>
      </div>
    </div>
  );
}

function LeadCard({ lead, onBuy }) {
  return (
    <div className="lead-card">
      <div className="head">
        <span className="kind">{lead.kind}</span>
        <span className={`pill-l ${lead.pillKind}`}>{lead.pillText}</span>
      </div>
      <div className="route">
        <span className="from">{lead.from}</span>
        <span className="arr">→</span>
        <span className="to">{lead.to}</span>
      </div>
      <div className="submitted">{lead.submitted}</div>
      <dl>
        {lead.rows.map(([dt, dd]) => (
          <div key={dt}>
            <dt>{dt}</dt>
            <dd>{dd.startsWith('✓ ')
              ? <><span className="ck">✓</span> {dd.slice(2)}</>
              : dd}</dd>
          </div>
        ))}
      </dl>
      <div className="cta-row">
        <div className="credits">
          <span className="num">{lead.credits}</span>
          <span className="lab">credits to unlock</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={onBuy}>Unlock job</button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Partners() {
  useMoverFunnelPixel();
  useCanonical('/partners');

  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const goToSignup  = () => navigate(user ? '/dashboard/leads'   : '/register');
  const goToBilling = () => navigate(user ? '/dashboard/billing' : '/register');

  return (
    <div className="partners-page">
      <title>MoveLeads — Verified move requests for moving companies. Pay-as-you-go.</title>
      <meta name="description" content="See real customers requesting movers in your service area. Unlock only the moves you want, call first, and book more jobs before competitors do. Pay-as-you-go credits, no subscription." />
      <JsonLd schema={{
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: 'MoveLeads Partner Marketplace',
        serviceType: 'Verified move-request marketplace for moving companies',
        provider: {
          '@type': 'Organization',
          name: 'MoveLeads.cloud',
          url: 'https://moveleads.cloud',
        },
        areaServed: 'United States',
        description: 'Pay-as-you-go credits for verified move requests. No subscription. No contract.',
        offers: {
          '@type': 'Offer',
          description: 'Free $50 unlock credit + 50% extra buying power for first-time movers',
          priceCurrency: 'USD',
        },
      }} />

      {/* ── Sticky offer bar (dark, premium, clickable) ── */}
      <a href="#offer" className="offer-bar">
        <div className="inner">
          <div className="offer-bar-head">
            <span className="offer-bar-pulse" aria-hidden="true" />
            <span className="offer-bar-pill">LIMITED</span>
          </div>

          <span className="offer-bar-text-full">
            Claim your <span className="offer-bar-accent">free $50 unlock credit</span> before onboarding closes in your area <span className="offer-bar-arrow" aria-hidden="true">→</span>
          </span>

          <div className="offer-bar-text-mobile">
            <div className="offer-bar-line-main">
              Claim your <span className="offer-bar-accent">free $50 unlock credit</span>
            </div>
            <div className="offer-bar-line-sub">
              before onboarding closes in your area <span className="offer-bar-arrow" aria-hidden="true">→</span>
            </div>
          </div>
        </div>
      </a>

      {/* ── Nav ── */}
      <div className="nav-shell">
        <div className="wrap">
          <nav className="nav">
            <div className="brand">
              <span style={{ color: '#fff' }}>Move</span>
              <span style={{ color: 'var(--orange)' }}>Leads</span>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>.cloud</span>
            </div>
            <div className="nav-links">
              <a href="#how">How it works</a>
              <a href="#leads">Sample leads</a>
              <a href="#offer">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="nav-cta">
              <button type="button" className="btn btn-primary" onClick={goToSignup}>See live moves</button>
            </div>
          </nav>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div>
              <h1 className="hero-h">
                Stop wasting dispatcher time on quote requests that <span className="accent">never answer.</span>
              </h1>
              <p className="hero-sub">
                See real customers actively looking for movers in your service area. Unlock the jobs you want, call customers fast, and keep your crews booked.
              </p>
              <ul className="hero-bullets">
                {[
                  'Verified requests only',
                  'No contracts',
                  'No monthly fees',
                  'Money-back guarantee',
                ].map((text) => (
                  <li key={text}>
                    <span className="check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 12 10 18 20 6" />
                      </svg>
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
              <div className="hero-cta">
                <button type="button" className="btn btn-primary btn-xl" onClick={goToSignup}>See available moves &nbsp;→</button>
                <a href="#how" className="btn btn-ghost-dark btn-lg">Watch platform demo</a>
              </div>
            </div>

            <HLOC onUnlock={goToSignup} />
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="block" id="how">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">How it works</div>
            <h2 className="section-h">From move request to booked job in 4 steps</h2>
            <p className="section-sub">Real customers. Verified details. You control every credit you spend.</p>
          </div>

          <div className="steps timeline">
            {STEPS.map((step) => (
              <div key={step.n} className="step">
                <div className="step-iconwrap">{step.icon}</div>
                <div className="step-num-row">
                  <span className="step-pill">STEP {step.n}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pain vs Solution ── */}
      <section className="block pain-bg">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">Why MoveLeads</div>
            <h2 className="section-h">Tired of quote requests that waste your dispatcher's time?</h2>
            <p className="section-sub">Most quote sellers send the same request to too many movers. We focus on verified customers you can review before spending a credit.</p>
          </div>

          <div className="compare">
            <div className="col bad">
              <h3>
                <span className="ic">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </span>
                What movers are tired of
              </h3>
              <ul>
                {PAIN.map((item) => (
                  <li key={item}>
                    <span className="mark">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="col good">
              <h3>
                <span className="ic">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 12 10 18 20 6" />
                  </svg>
                </span>
                Why movers switch to MoveLeads
              </h3>
              <ul>
                {SOLN.map((item) => (
                  <li key={item}>
                    <span className="mark">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 12 10 18 20 6" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why speed matters ── */}
      <section className="block">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">Why speed matters</div>
            <h2 className="section-h">The first mover to call usually books the job.</h2>
            <p className="section-sub">Fresh move requests lose value fast. Speed matters when customers are comparing quotes.</p>
          </div>

          <div className="speed-grid">
            {[
              {
                title: 'Fresh requests move fast',
                body: 'Customers are looking for movers right now, not next week.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2.5 1.5" />
                    <path d="M9 2h6" />
                  </svg>
                ),
              },
              {
                title: 'Competitors are calling too',
                body: 'Waiting gives another mover the chance to book first.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="8" width="11" height="8" />
                    <path d="M12 11h4l3 3v2h-7z" />
                    <circle cx="5" cy="18" r="1.6" />
                    <circle cx="15" cy="18" r="1.6" />
                    <path d="M16 4l3 2-3 2" />
                  </svg>
                ),
              },
              {
                title: 'Unlock and call immediately',
                body: 'See the job, unlock it, and get the customer on the phone.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                  </svg>
                ),
              },
            ].map((card) => (
              <div key={card.title} className="speed-card">
                <div className="speed-card-ic" aria-hidden="true">{card.icon}</div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Credit offer ── */}
      <section className="block offer-bg" id="offer">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">Onboarding bonus</div>
            <h2 className="section-h">Claim your free $50 unlock credit before your market fills up</h2>
            <p className="section-sub">First-time moving companies receive 50% extra buying power to unlock verified move requests in their service area.</p>
          </div>

          <div className="offer-card">
            <div>
              <span className="offer-pill">Limited first-time mover credit</span>
              <div className="offer-bonus">
                <div className="offer-bonus-amount">
                  <span className="offer-bonus-amount-currency">$</span>
                  <span className="offer-bonus-amount-num">50</span>
                  <span className="offer-bonus-amount-tag">FREE</span>
                </div>
                <div className="offer-bonus-label">unlock credit on us</div>
                <div className="offer-bonus-plus">+ 50% extra buying power on your first top-up</div>
              </div>
              <p className="support">Drop straight into your partner dashboard. Use it to unlock the move requests that fit your crews — no obligation, no recurring fee.</p>
            </div>
            <div className="offer-rhs">
              <ul>
                {[
                  'Free $50 unlock credit',
                  '+50% extra buying power on first top-up',
                  'Onboarding open in your service area',
                  'No monthly subscription, no contract',
                ].map((text) => (
                  <li key={text}>
                    <span className="check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 12 10 18 20 6" />
                      </svg>
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary btn-xl btn-block" onClick={goToBilling}>Claim my $50 credit &nbsp;→</button>
              <div className="offer-trust-row">
                <span>Secure checkout</span>
                <span className="offer-trust-sep">·</span>
                <span>No subscription</span>
                <span className="offer-trust-sep">·</span>
                <span>Credits never expire</span>
              </div>
              <div className="offer-microcopy">
                Offer may close once your service area fills up. Limited to first-time movers.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sample move requests ── */}
      <section className="block" id="leads">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">Sample move requests</div>
            <h2 className="section-h">See the type of moves you can unlock</h2>
            <p className="section-sub">Preview every move's route, size, timeline, and verification status before you unlock the customer's phone number.</p>
          </div>

          <div className="leads-grid">
            {LEADS.map((lead) => (
              <LeadCard key={`${lead.from}-${lead.to}`} lead={lead} onBuy={goToSignup} />
            ))}
          </div>

          <div className="moves-microcopy">
            Fresh requests lose value fast. The first mover to respond usually wins.
          </div>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button type="button" className="btn btn-ghost-light btn-lg" onClick={goToSignup}>
              See how unlocking works in dashboard &nbsp;→
            </button>
          </div>
        </div>
      </section>

      {/* ── Who it's for ── */}
      <section className="block pain-bg">
        <div className="wrap">
          <div className="section-head section-head-left">
            <div className="eyebrow">Who it's for</div>
            <h2 className="section-h">Built for movers who want more booked jobs</h2>
            <p className="section-sub">Whether you run two trucks or twenty, unlock only the moves that fit your crews and your calendar.</p>
          </div>

          <div className="who-grid">
            {WHO.map((card) => (
              <div key={card.title} className="who-card">
                <div className="icon">{card.icon}</div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <div className="tag">{card.tag}</div>
              </div>
            ))}
          </div>

          {/* photo strip — intentionally omitted per spec Q4 = A */}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="block faq-bg" id="faq">
        <div className="wrap">
          <div className="faq-grid">
            <div className="faq-side">
              <div className="eyebrow">FAQ</div>
              <h2 className="section-h">Questions moving companies ask</h2>
              <p className="section-sub">Straight answers. No fine print.</p>
              <div className="helper">
                <span className="lab">Talk to a partner rep</span>
                <span className="val">Mon–Sat · 8am–8pm CT</span>
                <a href={`tel:${PHONE}`}>{PHONE_DISPLAY} →</a>
              </div>
            </div>

            <div className="faq-list">
              {FAQS.map((faq) => (
                <details key={faq.q} className="faq-item" open={!!faq.open}>
                  <summary>{faq.q} <span className="plus">+</span></summary>
                  <div className="answer">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="final-cta" id="signup">
        <div className="wrap">
          <div className="final-cta-inner">
            <h2>Ready to stop losing booked moves to faster competitors?</h2>
            <p>Unlock only the jobs that fit your trucks and crews. No contracts. No subscriptions. Just real moving customers.</p>
            <div className="ctas">
              <button type="button" className="btn btn-primary btn-xl" onClick={goToSignup}>See available moves &nbsp;→</button>
              <a href="#leads" className="btn btn-ghost-dark btn-lg">See how unlocking works</a>
            </div>
            <div className="final-cta-urgency">
              Claim your <strong>free $50 unlock credit</strong> while onboarding is open in your area.
            </div>
            <div className="note">$50 FREE UNLOCK CREDIT · FIRST-TIME MOVERS ONLY</div>
          </div>
        </div>
      </section>

      {/* ── Footer (matches homepage) ── */}
      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <div className="brand" style={{ marginBottom: 12 }}>
                <span style={{ color: '#fff' }}>Move</span>
                <span style={{ color: 'var(--orange)' }}>Leads</span>
                <span style={{ color: 'rgba(255,255,255,0.28)', fontWeight: 600 }}>.cloud</span>
              </div>
              <p>Verified moving leads delivered instantly. Pay only for what you buy.</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9, width: 'fit-content', marginTop: 18 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'partnersFootPulse 2s infinite' }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>Leads available now</span>
              </div>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li><a href="#how">How it works</a></li>
                <li><a href="#leads">Sample leads</a></li>
                <li><a href="#offer">Pricing</a></li>
                <li><a href="#faq">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4>Company</h4>
              <ul>
                <li><a href="/about">About Us</a></li>
                <li><a href="/contact">Contact</a></li>
                <li><a href="/for-movers">For Movers</a></li>
                <li><a href="/privacy">Privacy Policy</a></li>
              </ul>
            </div>
            <div>
              <h4>Account</h4>
              <ul>
                <li><a href="/register">Sign up free</a></li>
                <li><a href="/login">Log in</a></li>
                <li><a href="/feedback">Feedback</a></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 MoveLeads.cloud. All rights reserved.</span>
            <span>Built for the moving industry.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
