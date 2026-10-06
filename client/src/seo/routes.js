// Single source of truth for per-route SEO metadata.
// Used by <RouteSeo /> at runtime and by scripts/prerender.mjs at build
// time (the pre-render list + sitemap are derived from INDEXABLE_ROUTES).
// Keep this file plain JS with no Vite-only imports so Node can load it.

import { ROUTE_SEO, CITY_HUB_SEO } from './routePages.js';
import { STATE_PAIR_SEO, STATE_HUB_SEO } from './statePages.js';

export const SITE_URL = 'https://moveleads.cloud';
export const SITE_NAME = 'MoveLeads.cloud';
export const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

const DEFAULT_DESCRIPTION =
  'Screened moving leads for moving companies. Pay per lead from $10, no subscription, no contract.';

// Indexable public pages. `changefreq`/`priority` feed the sitemap.
export const INDEXABLE_ROUTES = {
  '/': {
    title: 'Moving Leads for Moving Companies from $10, One Buyer | MoveLeads',
    description:
      'Buy screened, graded moving leads one at a time, from $10. Single-buyer by default, no subscription, no contract. Homeowners: get a free moving quote.',
    changefreq: 'weekly',
    priority: 1.0,
  },
  '/for-movers': {
    title: 'Moving Company Leads: How MoveLeads Works for Movers',
    description:
      'Moving company leads that are screened, graded and priced before you see them. Instant SMS alerts for your service area; pay only for the leads you claim.',
    changefreq: 'weekly',
    priority: 0.9,
  },
  '/pricing': {
    title: 'Moving Lead Prices from $10, No Subscription | MoveLeads',
    description:
      'Moving leads from $10: local $10–$25, long distance from $18–$35, max $150. You see the price before you buy. No monthly fee, no contract.',
    changefreq: 'monthly',
    priority: 0.9,
  },
  '/moving-leads': {
    title: 'Verified Moving Leads from $10, One Buyer by Default | MoveLeads',
    description:
      'Buy moving leads one at a time from $10. Screened, graded and priced before you see them, sold to one mover by default. No subscription, no contract.',
    changefreq: 'weekly',
    priority: 1.0,
  },
  '/moving-leads/exclusive': {
    title: 'Exclusive Moving Leads from $10, One Mover Each | MoveLeads',
    description:
      'Exclusive moving leads sold to one moving company only. First mover to claim buys it, no bidding war. From $10, no subscription.',
    changefreq: 'monthly',
    priority: 0.9,
  },
  '/moving-leads/long-distance': {
    title: 'Long-Distance Moving Leads from $18, Pay per Lead | MoveLeads',
    description:
      'Interstate and cross-country moving leads matched to your pickup and delivery states. From $18 over 100 miles, $35 over 1,000 miles. Pay per lead.',
    changefreq: 'monthly',
    priority: 0.9,
  },
  '/moving-leads/local': {
    title: 'Local Moving Leads from $10, Capped at $25 | MoveLeads',
    description:
      'Local moving leads under 100 miles, from $10 and never more than $25. Matched to your dispatch base, sold to one mover by default.',
    changefreq: 'monthly',
    priority: 0.9,
  },
  '/moving-leads/commercial': {
    title: 'Commercial Moving Leads: Office Moves from $10 | MoveLeads',
    description:
      'Office and commercial moving leads, labelled before you buy, sold to one mover by default. From $10, no subscription, no contract.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/resources/how-to-start-a-moving-company': {
    title: 'How to Start a Moving Company: Licenses, Insurance, Trucks',
    description:
      'How to start a moving company step by step: state licenses, USDOT and FMCSA authority for interstate moves, insurance, trucks, pricing and first customers.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/resources/moving-company-marketing': {
    title: 'Moving Company Marketing: 9 Ways to Book More Moves (2026)',
    description:
      'Moving company marketing that books jobs: Google Business Profile, reviews, city pages, realtor referrals, paid leads and ads, compared by cost and speed.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/resources/how-to-get-moving-leads': {
    title: 'How to Get Moving Leads: 8 Free and Paid Ways (2026 Guide)',
    description:
      'The 8 ways moving companies get leads, free and paid: Google Business Profile, referrals, ads and lead providers, plus what to ask any lead provider.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/compare/network-leads': {
    title: 'MoveLeads vs Network Leads: Prices, Exclusivity, Terms (2026)',
    description:
      'Exclusive moving leads from $10 at MoveLeads vs $45–$85 at Network Leads. Compare shared vs exclusive leads, bad-lead credit, contracts and delivery.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/compare/moveadvisor': {
    title: 'MoveLeads vs MoveAdvisor: Moving Leads Compared (2026)',
    description:
      'MoveAdvisor shares leads with up to 3 other movers; MoveLeads sells each lead to one mover by default from $10. Compare pricing, markets and terms.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/resources/best-moving-lead-providers': {
    title: 'Best Moving Lead Providers 2026: Prices and Terms Compared',
    description:
      'Moving lead providers compared on price, how many movers get each lead, contracts and bad-lead policies: MoveLeads, Network Leads, MoveAdvisor, 99calls.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/resources/moving-scams': {
    title: 'How to Avoid Moving Scams: 10 Red Flags (2026 Guide)',
    description:
      'Spot a moving scam before it happens: lowball quotes, big cash deposits, no USDOT number. Your rights under federal rules and how to check a mover.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/resources/moving-checklist': {
    title: 'Moving Checklist: 8 Weeks Out to Move Day, Week by Week',
    description:
      'A week-by-week moving checklist: estimates, booking, utilities, address changes, packing and what to check on moving day.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/resources/moving-out-of-state-checklist': {
    title: 'Moving to Another State Checklist: Week by Week (2026)',
    description:
      'A moving to another state checklist: book an interstate mover, records, utilities and mail, then your new license, car registration and voter registration.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/resources/how-to-choose-a-long-distance-moving-company': {
    title: 'How to Choose a Long-Distance Moving Company (2026 Guide)',
    description:
      'How to find the best long-distance moving company for you: check the USDOT number, compare written estimates, questions to ask and red flags to avoid.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/resources/cheapest-way-to-move-out-of-state': {
    title: 'Cheapest Way to Move Out of State: 3 Options Compared',
    description:
      'Rental truck, moving container or full-service movers: which is cheapest for moving to another state, plus 10 ways to cut the cost of any interstate move.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/resources/top-states-people-are-moving-to': {
    title: 'Top States People Are Moving To in 2026 (Census and Mover Data)',
    description:
      'Where are people moving? North Carolina, Texas and South Carolina gained the most residents from other states. See the 2026 rankings and where Californians go.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/resources/binding-vs-non-binding-moving-estimate': {
    title: 'Binding vs Non-Binding Moving Estimates Explained',
    description:
      'Binding estimates fix your price; non-binding ones depend on weight, capped at 110% at delivery for interstate moves. Which to choose and why.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/resources/how-to-price-a-long-distance-move': {
    title: 'How to Price a Long-Distance Move: A Guide for Movers',
    description:
      'Price long-distance moves by weight, distance and accessorials, choose binding or non-binding estimates, and win more jobs.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/resources/speed-to-lead-for-movers': {
    title: 'Speed to Lead for Moving Companies: Call First, Book More',
    description:
      'Why the first mover to call a new moving lead usually wins the job, and 5 practical ways your crew can respond faster and book more moves.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/moving-cost-calculator': {
    title: 'Moving Cost Calculator 2026: Estimate Your Long-Distance Move',
    description:
      'Free moving cost calculator. Pick your cities and home size to see a typical 2026 price range for a long-distance move, then get a free quote.',
    changefreq: 'monthly',
    priority: 0.9,
  },
  '/moving': {
    title: 'Long-Distance Moving Costs by Route (2026) | MoveLeads',
    description:
      'Distance, typical cost by home size and moving tips for popular US moving routes. Get a free quote for any long-distance move.',
    changefreq: 'weekly',
    priority: 0.9,
  },
  '/moving/state-to-state': {
    title: 'State to State Movers: Cost of Moving to Another State (2026)',
    description:
      'What moving to another state costs in 2026 by distance and home size, how interstate movers charge, cheapest options and costs for 170+ state-to-state moves.',
    changefreq: 'monthly',
    priority: 0.9,
  },
  ...ROUTE_SEO,
  ...CITY_HUB_SEO,
  ...STATE_PAIR_SEO,
  ...STATE_HUB_SEO,
  '/partners': {
    title: 'Verified Move Requests for Movers, Pay-as-You-Go | MoveLeads',
    description:
      'See real customers requesting movers in your service area. Unlock only the moves you want, call first and book more jobs. Pay-as-you-go, no subscription.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/founding-movers': {
    title: 'Founding Movers: Early Access to Verified Leads | MoveLeads',
    description:
      'Apply to join MoveLeads as a founding mover in your market: early access to screened moving leads, pay per lead from $10, no subscription or contract.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/get-quote': {
    title: 'Get a Free Moving Quote in 60 Seconds | MoveSmart by MoveLeads',
    description:
      'Tell us about your move and get a free quote from a licensed mover that serves your route. No spam calls from a dozen companies.',
    changefreq: 'weekly',
    priority: 0.9,
  },
  '/widget-page': {
    title: 'Free Moving Quote Widget for Your Website | MoveLeads',
    description:
      'Add a free moving quote form to your moving company website. Capture more booking requests from your own visitors, with no coding needed.',
    changefreq: 'monthly',
    priority: 0.6,
  },
  '/founding-realtors': {
    title: 'Realtor Partners: Trusted Movers for Your Clients | MoveLeads',
    description:
      'Connect your clients with trusted movers and earn from every referral. Apply to become a MoveLeads realtor partner.',
    changefreq: 'monthly',
    priority: 0.5,
  },
  '/founding-groups': {
    title: 'Community Partner Program | MoveLeads',
    description:
      'Run a local community or Facebook group? Partner with MoveLeads to help members find trusted movers.',
    changefreq: 'monthly',
    priority: 0.4,
  },
  '/about': {
    title: 'About MoveLeads',
    description:
      'MoveLeads connects people who are moving with licensed moving companies, one screened lead at a time. Who we are, how it works and how we check leads.',
    changefreq: 'monthly',
    priority: 0.5,
  },
  '/contact': {
    title: 'Contact MoveLeads',
    description: 'Questions about moving leads, billing, your mover account or a moving quote request? Contact the MoveLeads team and we will get back to you.',
    changefreq: 'yearly',
    priority: 0.4,
  },
  '/privacy': {
    title: 'Privacy Policy | MoveLeads',
    description: 'How MoveLeads collects, uses and protects your information.',
    changefreq: 'yearly',
    priority: 0.2,
  },
  '/terms': {
    title: 'Terms of Service | MoveLeads',
    description: 'The terms that apply to using MoveLeads.',
    changefreq: 'yearly',
    priority: 0.2,
  },
  '/sms-consent': {
    title: 'SMS Opt-In and Consent | MoveLeads',
    description: 'How MoveLeads text messages work, and how to opt in or out.',
    changefreq: 'yearly',
    priority: 0.2,
  },
};

// Public but not worth indexing (auth, transactional, embeds).
const NOINDEX_TITLES = {
  '/login': 'Log In',
  '/register': 'Create a Mover Account',
  '/forgot-password': 'Forgot Password',
  '/reset-password': 'Reset Password',
  '/verify-email': 'Verify Email',
  '/verify-email-pending': 'Verify Email',
  '/thank-you': 'Thank You',
  '/feedback': 'Feedback',
};

const titleCase = (slug = '') =>
  slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Returns { title, description, canonical, robots, image } for a pathname.
export function getSeo(pathname) {
  const path = pathname !== '/' ? pathname.replace(/\/+$/, '') : '/';
  const page = INDEXABLE_ROUTES[path];
  if (page) {
    return {
      title: page.title,
      description: page.description,
      canonical: `${SITE_URL}${path === '/' ? '/' : path}`,
      robots: 'index, follow',
      image: DEFAULT_IMAGE,
    };
  }

  // Legacy route pages: thin today (a quote form only), so kept out of the
  // index until the data-driven route template ships (docs/seo/SITE-STRUCTURE.md).
  const move = path.match(/^\/move\/([^/]+)\/([^/]+)$/);
  if (move) {
    const from = titleCase(move[1]);
    const to = titleCase(move[2]);
    return {
      title: `Moving from ${from} to ${to}: Free Moving Quote | MoveSmart`,
      description: `Get a free quote from a licensed mover that serves the ${from} to ${to} route.`,
      canonical: `${SITE_URL}${path}`,
      robots: 'noindex, follow',
      image: DEFAULT_IMAGE,
    };
  }

  const noindexTitle = NOINDEX_TITLES[path];
  return {
    title: noindexTitle ? `${noindexTitle} | MoveLeads` : SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    canonical: null,
    robots: 'noindex, nofollow',
    image: DEFAULT_IMAGE,
  };
}
