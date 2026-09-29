// Content for the B2B SEO landing pages (for moving companies).
// Rendered by pages/SeoLanding.jsx. Facts here must match the product:
// pricing rules mirror server/utils/pricingEngine.js calculateAuctionPrice.
// Keep claims verifiable — no invented stats or testimonials.

const PRICE_TABLE = {
  caption: 'Base price by move distance (before adjustments)',
  head: ['Move distance', 'Base lead price'],
  rows: [
    ['Under 100 miles (local)', '$10, capped at $25'],
    ['100 to 500 miles', '$18'],
    ['500 to 1,000 miles', '$25'],
    ['Over 1,000 miles (cross-country)', '$35'],
  ],
  note:
    'The base is then adjusted for move date (x1.5 within 7 days, x1.3 within 14, x1.15 within 30), peak season May to August (x1.15), end-of-month moves (x1.12) and lead grade (A x1.4, B x1.15). Prices round to the nearest $5 and stay between $10 and $150.',
};

const HOW_IT_WORKS = [
  'A homeowner requests a moving quote through our short, mobile-first quote form.',
  'The request is screened, scored (grade A to C) and priced before any mover sees it.',
  'Movers whose dispatch base and pickup and delivery coverage match the move get an alert by SMS, email and on the live dashboard.',
  'The first mover to claim the lead buys it from their prepaid balance. By default no one else can buy it.',
  'The winning mover gets the customer’s contact details and calls first.',
];

export const B2B_PAGES = {
  '/moving-leads': {
    breadcrumb: 'Moving leads',
    eyebrow: 'For moving companies',
    h1: 'Verified moving leads, one buyer by default, from $10',
    answer:
      'MoveLeads sells moving leads one at a time from a prepaid balance. Each lead is screened, graded and priced before you see it, and by default only the first mover to claim it can buy it. Prices start at $10, there is no subscription, and you only pay for the leads you choose.',
    sections: [
      {
        h2: 'What you get with each lead',
        bullets: [
          'Move details: origin, destination, move date and home size.',
          'A grade from A to C and a score, shown before you buy.',
          'The exact price, shown before you buy.',
          'The customer’s name and phone number once you claim it.',
        ],
      },
      { h2: 'How it works', steps: HOW_IT_WORKS },
      {
        h2: 'Moving lead prices',
        text: 'Price depends on distance, how soon the move is, the season and the lead grade. You always see it before you claim.',
        table: PRICE_TABLE,
      },
      {
        h2: 'Shared vs single-buyer leads',
        text: 'Many lead sellers send the same request to several movers at once, so every mover races to call first. MoveLeads sells each lead to one mover by default: the first to claim owns it. That means fewer leads overall, but no bidding war on the phone.',
        link: { to: '/moving-leads/exclusive', label: 'Read about single-buyer (exclusive) leads' },
      },
      {
        h2: 'Leads by move type',
        links: [
          { to: '/moving-leads/long-distance', label: 'Long-distance moving leads' },
          { to: '/moving-leads/local', label: 'Local moving leads' },
          { to: '/moving-leads/exclusive', label: 'Exclusive moving leads' },
          { to: '/resources/how-to-get-moving-leads', label: 'Guide: how to get moving leads' },
          { to: '/resources/best-moving-lead-providers', label: 'Best moving lead providers compared' },
          { to: '/compare/network-leads', label: 'MoveLeads vs Network Leads' },
          { to: '/compare/moveadvisor', label: 'MoveLeads vs MoveAdvisor' },
        ],
      },
    ],
    faq: [
      ['How much do moving leads cost?', 'Leads start at $10 and stay between $10 and $150. Local leads are capped at $25. The price depends on distance, move date, season and lead grade, and you see it before you buy.'],
      ['Are the leads shared?', 'No, not by default. Each lead is sold to the first mover who claims it, and then it is removed from everyone else’s feed.'],
      ['Is there a monthly fee or contract?', 'No. You add balance and pay per lead. Auto-recharge is optional. Your balance does not expire.'],
      ['Which areas do you cover?', 'You set your dispatch base and the states you pick up from and deliver to. You only get alerts for moves that match your coverage.'],
      ['What if the phone number is wrong?', 'Report a disconnected or wrong number within 24 hours for a credit back to your balance.'],
    ],
  },

  '/moving-leads/exclusive': {
    breadcrumb: 'Exclusive moving leads',
    parent: '/moving-leads',
    eyebrow: 'Single-buyer leads',
    h1: 'Exclusive moving leads: one mover per customer',
    answer:
      'An exclusive moving lead is sold to only one moving company. On MoveLeads every lead is single-buyer by default: the first mover to claim it buys it, and it disappears from everyone else’s feed. You are the only company calling that customer from MoveLeads.',
    sections: [
      {
        h2: 'Why exclusive leads close better',
        bullets: [
          'The customer is not answering calls from five movers at once.',
          'You compete on service and price, not on who dials fastest.',
          'You can take time to do a proper survey and estimate.',
        ],
      },
      {
        h2: 'How claiming works',
        text: 'When a lead matches your coverage you get an alert by SMS, email and on your dashboard. The claim is atomic: the first mover to claim is charged and gets the lead, and any second claim is rejected before a charge. You never pay for a lead someone else already owns.',
      },
      { h2: 'Exclusive lead prices', table: PRICE_TABLE },
      {
        h2: 'Shared vs exclusive at a glance',
        table: {
          head: ['', 'Shared leads (typical)', 'MoveLeads (default)'],
          rows: [
            ['Buyers per lead', 'Several movers', 'One mover'],
            ['Who calls the customer', 'Every buyer', 'Only the mover who claimed'],
            ['Price', 'Lower per lead', 'From $10, shown before you buy'],
            ['What wins the job', 'Speed to dial', 'Service and price'],
          ],
        },
      },
    ],
    faq: [
      ['Are MoveLeads leads really exclusive?', 'Yes by default. A lead is sold to the first mover who claims it. The platform can sell a lead to more than one mover, but that is off by default.'],
      ['What happens if two movers claim at the same second?', 'Only one claim succeeds. The claim and the charge happen in a single step, so the second mover is not charged.'],
      ['Do exclusive leads cost more?', 'MoveLeads prices do not change with exclusivity. Price depends on distance, move date, season and grade.'],
    ],
  },

  '/moving-leads/long-distance': {
    breadcrumb: 'Long-distance moving leads',
    parent: '/moving-leads',
    eyebrow: 'Interstate and cross-country',
    h1: 'Long-distance moving leads for interstate movers',
    answer:
      'MoveLeads sends long-distance moving leads to movers whose pickup and delivery states match the route. Leads over 100 miles start at $18, and cross-country moves over 1,000 miles start at $35. You see the route, move date, home size, grade and price before you buy.',
    sections: [
      {
        h2: 'Matched by route, not just by zip code',
        text: 'Interstate movers set the states they pick up from and the states they deliver to. A lead from Illinois to Texas only goes to movers who cover both ends. You do not pay for routes you do not run.',
      },
      {
        h2: 'Long-distance lead prices',
        table: {
          head: ['Distance', 'Base price'],
          rows: [
            ['100 to 500 miles', '$18'],
            ['500 to 1,000 miles', '$25'],
            ['Over 1,000 miles', '$35'],
          ],
        },
        text: 'The base is adjusted for move date, peak season (May to August), end-of-month moves and grade, then rounded to $5. The maximum is $150.',
      },
      { h2: 'How it works', steps: HOW_IT_WORKS },
    ],
    faq: [
      ['Do you sell cross-country moving leads?', 'Yes. Moves over 1,000 miles are priced from $35, before date, season and grade adjustments.'],
      ['Do I need a USDOT number?', 'Interstate moves in the US require FMCSA registration. Set your coverage to the states you are licensed to serve.'],
      ['Can I pick only certain routes?', 'You choose your pickup states and delivery states. Leads outside them are not sent to you.'],
    ],
  },

  '/moving-leads/local': {
    breadcrumb: 'Local moving leads',
    parent: '/moving-leads',
    eyebrow: 'Moves under 100 miles',
    h1: 'Local moving leads from $10',
    answer:
      'Local moving leads on MoveLeads are moves under 100 miles, priced from $10 and capped at $25. They go to movers whose dispatch base covers the move, by SMS, email and on the live dashboard, and each lead is sold to one mover by default.',
    sections: [
      {
        h2: 'Why local leads are capped at $25',
        text: 'Local jobs are smaller tickets, so a local lead never costs more than $25, even for a large home or a rush move. You can buy more of them without watching your margin disappear.',
      },
      {
        h2: 'Local lead prices',
        table: {
          head: ['Lead', 'Price'],
          rows: [
            ['Standard local move', 'From $10'],
            ['Rush move, large home or grade A', 'Up to $25'],
          ],
        },
      },
      { h2: 'How it works', steps: HOW_IT_WORKS },
    ],
    faq: [
      ['What counts as a local move?', 'Any move under 100 miles.'],
      ['What is the most a local lead can cost?', '$25.'],
      ['Can I get leads only near my yard?', 'Yes. Leads are matched to your dispatch base and coverage.'],
    ],
  },

  '/resources/how-to-get-moving-leads': {
    breadcrumb: 'How to get moving leads',
    parent: '/moving-leads',
    eyebrow: 'Guide for moving companies',
    h1: 'How to get moving leads: 8 ways, free and paid',
    answer:
      'Moving companies get leads from four places: their own search presence (Google Business Profile and a website that ranks), referrals from realtors and past customers, paid ads, and lead providers. The cheapest leads come from the first two; lead providers are the fastest way to fill a schedule while those grow.',
    sections: [
      {
        h2: 'Free ways to get moving leads',
        numbered: [
          'Google Business Profile. Fill in every field, add photos of your trucks and crew, and ask every happy customer for a review. Most local moving searches show the map pack first.',
          'Bing Places. Import your Google profile. It takes minutes and Bing also feeds Copilot and ChatGPT search.',
          'Your own website. One page per service and city you serve, a clear quote form, and your USDOT number on the page.',
          'Realtor referrals. Realtors know who is moving months ahead. Offer them a simple way to refer clients.',
          'Past customers. Moving is rare for one family, but they refer friends. A follow-up text after the move asking for a review and referral costs nothing.',
        ],
      },
      {
        h2: 'Paid ways to get moving leads',
        numbered: [
          'Google Ads and Local Services Ads. Fast but expensive in competitive cities; track cost per booked job, not per click.',
          'Lead providers. You pay per lead. Compare them on whether leads are shared, how numbers are checked, refund terms, and whether there is a contract.',
          'Live transfers. A provider calls the customer and connects them to you. Higher cost per lead, higher intent.',
        ],
      },
      {
        h2: 'What to ask any moving lead provider',
        bullets: [
          'How many movers buy the same lead?',
          'How are phone numbers checked, and what happens if one is wrong?',
          'Is there a monthly fee, minimum or contract?',
          'Can I choose the routes and move sizes I get?',
          'Do I see the price before I pay?',
        ],
        link: { to: '/moving-leads', label: 'See how MoveLeads answers each of these' },
      },
    ],
    faq: [
      ['What is the cheapest way to get moving leads?', 'Your Google Business Profile, reviews and referrals cost nothing but time. They take months to build, so many movers buy leads while they grow.'],
      ['Are bought moving leads worth it?', 'They can be if you track cost per booked job. Single-buyer leads usually close at a higher rate than leads shared with several movers.'],
      ['How fast should I call a new lead?', 'As fast as possible. The first mover to reach the customer has the best chance of booking the job.'],
    ],
  },
  '/compare/network-leads': {
    breadcrumb: 'MoveLeads vs Network Leads',
    parent: '/moving-leads',
    eyebrow: 'Comparison',
    h1: 'MoveLeads vs Network Leads: price, exclusivity and terms',
    answer:
      'Both sell moving leads from a prepaid balance with no contract. The main difference is exclusivity and price: MoveLeads sells every lead to one mover by default, from $10 for local moves, while Network Leads charges $45 for an exclusive local lead and $85 for an exclusive interstate lead, or $15 to $20 for a lead shared with up to 4 movers.',
    sections: [
      {
        h2: 'Side-by-side comparison',
        table: {
          head: ['', 'MoveLeads', 'Network Leads'],
          rows: [
            ['Default lead type', 'Single-buyer (one mover)', 'Shared with up to 4 movers'],
            ['Exclusive local lead', 'From $10, capped at $25', '$45'],
            ['Exclusive interstate lead', 'From $18 (over 100 mi) to $35 base, max $150', '$85'],
            ['Shared lead', 'Not offered by default', '$15 local, $20 interstate (up to 4 movers)'],
            ['Contract', 'None, prepaid', 'None, prepaid'],
            ['Bad-lead credit', 'Report within 24 hours', 'Report within 7 days'],
            ['Live call transfers', 'Not offered', '$60 local, $100 interstate'],
            ['Delivery', 'SMS, email, live dashboard', 'Email, SMS, CRM, API and Zapier'],
          ],
          note: 'Network Leads prices and terms as published on their website in September 2026. Check their site for current prices.',
        },
        sources: [{ url: 'https://www.network-leads.com/moving-leads', label: 'Network Leads pricing page' }],
      },
      {
        h2: 'When MoveLeads is the better fit',
        bullets: [
          'You want every lead to be yours alone without paying an exclusive premium.',
          'You run local moves and want lead costs capped at $25.',
          'You want to see the grade and exact price of each lead before you buy.',
        ],
      },
      {
        h2: 'When Network Leads may be the better fit',
        bullets: [
          'You want live call transfers.',
          'You need an API or Zapier connection to your own software.',
          'You prefer a longer 7-day window to report bad leads.',
        ],
      },
    ],
    faq: [
      ['Is MoveLeads cheaper than Network Leads?', 'For exclusive leads, yes: MoveLeads exclusive leads start at $10 local and $18 to $35 long distance before adjustments, against $45 and $85 for Network Leads exclusive leads. Network Leads shared leads cost $15 to $20 but go to up to 4 movers.'],
      ['Do either require a contract?', 'No. Both use a prepaid balance with no contract.'],
      ['Can I use both?', 'Yes. Many movers buy from more than one provider and compare cost per booked job.'],
    ],
  },

  '/compare/moveadvisor': {
    breadcrumb: 'MoveLeads vs MoveAdvisor',
    parent: '/moving-leads',
    eyebrow: 'Comparison',
    h1: 'MoveLeads vs MoveAdvisor: which moving lead provider fits you?',
    answer:
      'MoveAdvisor sends each lead to your company and up to 3 other providers, and covers the US, Canada, the UK, Europe and Australia. MoveLeads focuses on US moves and sells each lead to one mover by default, with the price shown before you buy, from $10.',
    sections: [
      {
        h2: 'Side-by-side comparison',
        table: {
          head: ['', 'MoveLeads', 'MoveAdvisor'],
          rows: [
            ['Movers per lead', 'One by default', 'Up to 4 (you plus up to 3 others)'],
            ['Published prices', 'From $10, shown on every lead', 'Not listed on their leads page'],
            ['Markets', 'United States', 'US, Canada, UK, Europe, Australia, international'],
            ['Bad leads', 'Credit within 24 hours', 'Void process for bad leads'],
            ['Budget controls', 'Prepaid balance, optional auto-recharge', 'Daily lead caps and monthly budget limits'],
            ['Delivery', 'SMS, email, live dashboard', 'Portal, email or your software, SMS, phone leads'],
          ],
          note: 'MoveAdvisor details as published on their website in September 2026.',
        },
        sources: [{ url: 'https://moveadvisor.com/biz/leads', label: 'MoveAdvisor moving leads page' }],
      },
      {
        h2: 'When MoveLeads is the better fit',
        bullets: [
          'You work US moves and want leads that no other mover gets by default.',
          'You want to see each lead’s price before paying.',
        ],
      },
      {
        h2: 'When MoveAdvisor may be the better fit',
        bullets: [
          'You move customers outside the US.',
          'You want leads imported into your own moving software.',
        ],
      },
    ],
    faq: [
      ['Are MoveAdvisor leads shared?', 'Their leads page says a lead can go to your company and up to 3 other providers, though some leads may end up exclusive to you.'],
      ['How much do MoveAdvisor leads cost?', 'Prices are not listed on their leads page; you need to contact them. MoveLeads prices start at $10 and are shown on each lead.'],
    ],
  },

  '/resources/best-moving-lead-providers': {
    breadcrumb: 'Best moving lead providers',
    parent: '/moving-leads',
    eyebrow: 'Buyer’s guide for movers',
    h1: 'Best moving lead providers in 2026: prices and terms compared',
    answer:
      'The right moving lead provider depends on three things: how many movers get each lead, what a lead costs, and what happens when a number is wrong. Below are published prices and terms for four providers, including us, so you can compare them on the same points.',
    sections: [
      {
        h2: 'Providers compared',
        table: {
          head: ['Provider', 'Movers per lead', 'Price', 'Contract'],
          rows: [
            ['MoveLeads', 'One by default', 'From $10 local, $18–$35 base long distance, max $150', 'None'],
            ['Network Leads', 'Up to 4, 2, or exclusive', '$15–$20 shared; $45–$85 exclusive', 'None'],
            ['MoveAdvisor', 'Up to 4', 'Not published', 'Not published'],
            ['99calls', 'Exclusive', '$24.99 organic; $49–$158 paid-ads leads', 'None'],
          ],
          note: 'Competitor details as published on each provider’s website in September 2026. MoveLeads is our own service.',
        },
        sources: [
          { url: 'https://www.network-leads.com/moving-leads', label: 'Network Leads' },
          { url: 'https://moveadvisor.com/biz/leads', label: 'MoveAdvisor' },
          { url: 'https://99calls.com/Moving-Leads.htm', label: '99calls' },
        ],
      },
      {
        h2: 'How to choose',
        numbered: [
          'Exclusivity. A lead shared with 4 movers is cheaper, but you are racing 3 others on the phone. Compare cost per booked job, not cost per lead.',
          'Price transparency. Prefer providers that show the price before you buy.',
          'Bad-lead policy. Check how long you have to report a wrong number and whether you get cash or credit.',
          'Commitment. Avoid contracts and monthly minimums until a provider proves itself.',
          'Coverage control. You should be able to choose routes, distances and move sizes.',
        ],
      },
      {
        h2: 'Compare in detail',
        links: [
          { to: '/compare/network-leads', label: 'MoveLeads vs Network Leads' },
          { to: '/compare/moveadvisor', label: 'MoveLeads vs MoveAdvisor' },
          { to: '/moving-leads/exclusive', label: 'Shared vs exclusive moving leads' },
        ],
      },
    ],
    faq: [
      ['What is the cheapest moving lead provider?', 'Shared leads are cheapest per lead, from about $15 at Network Leads. For exclusive leads, MoveLeads starts at $10 for local moves.'],
      ['Are exclusive moving leads worth the price?', 'Often, because you are the only company calling. Track your booking rate to compare.'],
      ['Should I use more than one provider?', 'Many movers do. Run each for a few weeks and keep the ones with the lowest cost per booked job.'],
    ],
  },
};
