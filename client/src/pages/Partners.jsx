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

// ── Sub-components (defined below) ──────────────────────────────────────────
// HLOC and LeadCard are added in Task 4.

// ── Main component ─────────────────────────────────────────────────────────
export default function Partners() {
  useCanonical('/partners');

  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const goToSignup  = () => navigate(user ? '/dashboard/leads'   : '/register');
  const goToBilling = () => navigate(user ? '/dashboard/billing' : '/register');

  return (
    <div className="partners-page">
      <h1>Partners (constants and handlers wired)</h1>
    </div>
  );
}
