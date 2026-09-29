// Single source of truth for per-route SEO metadata.
// Used by <RouteSeo /> at runtime and by scripts/prerender.mjs at build
// time (the pre-render list + sitemap are derived from INDEXABLE_ROUTES).
// Keep this file plain JS with no Vite-only imports so Node can load it.

export const SITE_URL = 'https://moveleads.cloud';
export const SITE_NAME = 'MoveLeads.cloud';
export const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

const DEFAULT_DESCRIPTION =
  'Phone-verified moving leads for moving companies. Pay per lead from $10, no subscription, no contract.';

// Indexable public pages. `changefreq`/`priority` feed the sitemap.
export const INDEXABLE_ROUTES = {
  '/': {
    title: 'Verified Moving Leads for Moving Companies, from $10 | MoveLeads',
    description:
      'Buy phone-verified moving leads one at a time, from $10. Single-buyer by default, no subscription, no contract. Homeowners: get a free moving quote.',
    changefreq: 'weekly',
    priority: 1.0,
  },
  '/for-movers': {
    title: 'Moving Company Lead Generation: How MoveLeads Works',
    description:
      'Every lead is phone-checked, scored and priced before you see it. Get instant SMS alerts for moves in your service area and pay only for the leads you claim.',
    changefreq: 'weekly',
    priority: 0.9,
  },
  '/pricing': {
    title: 'Moving Lead Pricing: Pay per Lead from $10, No Subscription | MoveLeads',
    description:
      'Moving leads from $10. Price scales with home size, distance and move date, and you see it before you buy. No monthly fee, no contract, balance never expires.',
    changefreq: 'monthly',
    priority: 0.9,
  },
  '/partners': {
    title: 'Verified Move Requests for Moving Companies, Pay-as-You-Go | MoveLeads',
    description:
      'See real customers requesting movers in your service area. Unlock only the moves you want, call first, and book more jobs. Pay-as-you-go credits, no subscription.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/founding-movers': {
    title: 'Founding Movers Program: Early Access to Verified Leads | MoveLeads',
    description:
      'Apply to join MoveLeads as a founding mover in your market and get early access to phone-verified moving leads.',
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
      'Add a free quote form to your moving company website and capture more booking requests.',
    changefreq: 'monthly',
    priority: 0.6,
  },
  '/founding-realtors': {
    title: 'Realtor Partner Program: Trusted Movers for Your Clients | MoveLeads',
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
      'MoveLeads connects people who are moving with verified moving companies, one checked lead at a time.',
    changefreq: 'monthly',
    priority: 0.5,
  },
  '/contact': {
    title: 'Contact MoveLeads',
    description: 'Questions about moving leads, billing or a quote request? Contact the MoveLeads team.',
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
