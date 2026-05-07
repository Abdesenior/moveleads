import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import useCanonical from '../utils/useCanonical';
import './Partners.css';

// ── Data ────────────────────────────────────────────────────────────────────
const STATS = [
  { num: '240k+', accent: true,  label: 'Verified moving leads delivered' },
  { num: '1,800+', accent: false, label: 'Moving companies on the platform' },
  { num: '98%',   accent: false, label: 'Phone-verified before delivery' },
  { num: '$0',    accent: false, label: 'Pay-as-you-go. Cancel any time.', suffix: ' / month' },
];

const STEPS = [
  { n: '01', title: 'Customer requests a mover',     body: 'People looking for movers submit their move details through our ads, funnels and partner sites.' },
  { n: '02', title: 'We qualify the lead',           body: 'We check move details, timeline, and phone quality. Junk and duplicates get filtered before delivery.' },
  { n: '03', title: 'You buy the leads you want',    body: 'Use credits to unlock leads that fit your service area, job size and schedule. Skip the rest.' },
  { n: '04', title: 'You call and close the job',    body: 'Contact the customer fast and turn real moving requests into booked jobs on your calendar.' },
];

const PAIN = [
  'Same lead sold to 4–5 movers at once',
  'Wrong numbers, fake names, fake requests',
  'Customers who never pick up the phone',
  'Monthly fees before you see a single job',
  'No control over what leads you buy',
];

const SOLN = [
  'Every lead is checked before delivery',
  'See full move details before you spend a credit',
  'Fresh leads pushed to your dashboard fast',
  'Pay-as-you-go credits — no subscription',
  'You choose every single lead you unlock',
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
    kind: 'Long distance', pillKind: 'hot', pillText: 'Hot lead',
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
    title: 'Local moving companies',
    body:  'Find customers moving inside your service area. Filter by ZIP, distance, and job size before you spend a credit.',
    tag:   '→ 25–60 credits per lead',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    title: 'Long-distance movers',
    body:  'Unlock higher-value interstate and long-haul jobs with bigger ticket sizes and longer booking windows.',
    tag:   '→ 60–120 credits per lead',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    title: 'Growing crews',
    body:  "Fill your calendar without committing to monthly contracts. Buy more credits when you have capacity, pause when you don't.",
    tag:   '→ Pay only for what fits',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

const FAQS = [
  { q: 'Do I need a monthly subscription?',     a: "No. MoveLeads runs on a simple credit system. You buy credits and use them to unlock leads — there's no recurring fee, no contract, and no minimum spend.", open: true },
  { q: 'Can I choose which leads to buy?',      a: "Yes. You preview every move's route, size, timeline, service type and verification status before unlocking the customer's contact information. You're never charged credits for a lead you don't want." },
  { q: 'Are the leads verified?',               a: 'Every lead is checked and scored before being pushed to the dashboard. Phone-verified leads are clearly marked, and high-intent or hot leads carry a separate badge so you know what you’re buying.' },
  { q: 'What do I see before buying a lead?',   a: "You see the route, move size, timeline, service type (move only / move + pack), verification status, and the credit price. The customer's phone number and email are unlocked once you spend the credits." },
  { q: 'What happens after I buy a lead?',      a: 'The customer’s contact details are unlocked instantly. You call them directly to qualify, quote, and close the job. Most partners reach the customer inside 5 minutes.' },
  { q: 'Is there a contract?',                  a: "No long-term contract. Buy a credit pack, test the platform, and walk away if it doesn't work for your business. Credits never expire." },
];

const PHONE = '+18005550199';
const PHONE_DISPLAY = '+1 (800) 555-0199';

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

        <div className="hloc-microcopy">
          <span className="hloc-livedot" />
          Customer requested quotes 2 min ago · most book the first mover that responds
        </div>

        <div className="hloc-foot">3 moving companies viewing now · only pay if you unlock</div>
      </div>

      <div className="hloc-unlocked">
        <div className="hloc-unlocked-lab">Just booked</div>
        <div className="hloc-unlocked-val">+$2.4k job</div>
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
          <span className="lab">credits</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={onBuy}>Buy lead</button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Partners() {
  useCanonical('/partners');

  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const goToSignup  = () => navigate(user ? '/dashboard/leads'   : '/register');
  const goToBilling = () => navigate(user ? '/dashboard/billing' : '/register');

  return (
    <div className="partners-page">
      {/* ── Sticky offer bar ── */}
      <div className="offer-bar">
        <div className="inner">
          <span className="pill">LIMITED</span>
          <span><strong>$100 = $150 in credits</strong> &nbsp;·&nbsp; First-time partners get 50% bonus on their first credit purchase</span>
          <span className="dot" />
          <a href="#offer" className="cta-link" onClick={(e) => { e.preventDefault(); goToBilling(); }}>Claim now →</a>
        </div>
      </div>

      {/* ── Nav ── */}
      <div className="nav-shell">
        <div className="wrap">
          <nav className="nav">
            <div className="brand">
              <span className="mark">M</span>
              <span>Move<span className="dot-cloud">Leads</span><span style={{ color: 'var(--orange)' }}>.cloud</span></span>
            </div>
            <div className="nav-links">
              <a href="#how">How it works</a>
              <a href="#leads">Sample leads</a>
              <a href="#offer">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="nav-cta">
              <a className="btn btn-ghost-dark" href="/login">Partner login</a>
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
              <div className="badge badge-lg"><span className="pulse" />Live verified move requests · USA</div>
              <h1 className="hero-h">
                Stop paying for move requests<br />that <span className="accent">never answer.</span>
              </h1>
              <p className="hero-sub">
                Access live customers actively requesting movers in your service area. Unlock only the jobs you want, call verified customers instantly, and keep your trucks and crews booked — without wasting dispatcher time.
              </p>
              <ul className="hero-bullets">
                {[
                  'Verified move requests, real customers',
                  'Only pay for jobs you unlock',
                  'Real phone numbers with active move intent',
                  'See live move requests in your service area',
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
                <button type="button" className="btn btn-primary btn-xl" onClick={goToSignup}>See live move requests &nbsp;→</button>
                <a href="#how" className="btn btn-ghost-dark btn-lg">Watch platform demo</a>
              </div>
              <div className="hero-trust">
                <span><span className="tick">✓</span> Used by moving companies in major U.S. cities</span>
                <span><span className="tick">✓</span> Only verified move requests</span>
                <span><span className="tick">✓</span> Pay only for jobs you unlock</span>
              </div>
            </div>

            <HLOC onUnlock={goToSignup} />
          </div>
        </div>
      </section>
    </div>
  );
}
