// Data for the homeowner route pages (/moving/:slug), e.g.
// /moving/chicago-to-dallas. Plain JS (no Vite imports): scripts/prerender.mjs
// loads it through seo/routes.js to build the pre-render list and sitemap.
//
// Cost ranges are ESTIMATES derived from published 2026 industry data
// (COST_SOURCE). Never present them as MoveLeads quotes.

export const COST_SOURCE = {
  name: 'myGoodMovers 2026 long-distance moving cost data',
  url: 'https://mygoodmovers.com/moving-guide/long-distance-moving-cost',
};
export const SEASON_SOURCE = {
  name: 'Sirelo long-distance moving cost guide',
  url: 'https://sirelo.com/house-moving/long-distance-moving-costs/',
};

// zip = a central ZIP, used to pre-fill the quote form (?from=&to=).
// tax: true when the state has no personal income tax on wages.
export const CITIES = {
  'new-york': { name: 'New York', state: 'NY', zip: '10001', tax: false,
    note: 'Most New York buildings need a certificate of insurance (COI) from your mover and a booked elevator slot. On narrow streets a full-size truck may not fit, so some moves use a smaller shuttle truck, which can add cost. Ask about this when you get your quote.' },
  miami: { name: 'Miami', state: 'FL', zip: '33130', tax: true,
    note: 'Florida has no state income tax. Hurricane season runs from June 1 to November 30, so leave room in your schedule for weather delays. Many Miami condos ask for a COI and a reserved elevator, so check your building rules before move day.' },
  'los-angeles': { name: 'Los Angeles', state: 'CA', zip: '90012', tax: false,
    note: 'Some Los Angeles streets need a temporary parking permit for a moving truck, and traffic can stretch a load-out day. Book a weekday morning start if you can.' },
  atlanta: { name: 'Atlanta', state: 'GA', zip: '30303', tax: false,
    note: 'Atlanta traffic around the I-285 perimeter can slow a delivery day, so ask your mover about early starts. Summers are hot and humid; protect electronics and anything heat-sensitive.' },
  charlotte: { name: 'Charlotte', state: 'NC', zip: '28202', tax: false,
    note: 'Charlotte is one of the faster-growing cities in the Southeast, so movers book up in summer. Late summer and fall can bring remnants of Atlantic storms.' },
  austin: { name: 'Austin', state: 'TX', zip: '78701', tax: true,
    note: 'Texas has no state income tax. Austin summers are very hot, so plan loading and unloading for early morning, and keep medication, electronics and candles out of the truck.' },
  phoenix: { name: 'Phoenix', state: 'AZ', zip: '85004', tax: false,
    note: 'Phoenix summers are extremely hot. Schedule an early-morning unload, and move heat-sensitive items like electronics, candles, photos and medication in your car, not the truck.' },
  'las-vegas': { name: 'Las Vegas', state: 'NV', zip: '89101', tax: true,
    note: 'Nevada has no state income tax. Summer heat is intense, so early-morning moves are easier on your crew and your belongings.' },
  seattle: { name: 'Seattle', state: 'WA', zip: '98101', tax: true,
    note: 'Washington has no state income tax on wages. The rainy season runs roughly October to April, so ask your mover how they protect furniture and boxes in wet weather. Some streets need a temporary parking permit for a truck.' },
  denver: { name: 'Denver', state: 'CO', zip: '80202', tax: false,
    note: 'Winter snow can close mountain passes like I-70 and delay deliveries from the west. Denver sits at about 5,280 feet, so plan for the altitude during a physical move day.' },
  'san-francisco': { name: 'San Francisco', state: 'CA', zip: '94103', tax: false,
    note: 'Steep hills and narrow streets mean some San Francisco moves need a shuttle truck, and most blocks need a temporary no-parking permit. Book the permit early.' },
  chicago: { name: 'Chicago', state: 'IL', zip: '60601', tax: false,
    note: 'Chicago high-rises usually need a booked freight elevator and a COI. Winter moves can be cheaper, but snow and ice slow loading, so allow extra time.' },
  dallas: { name: 'Dallas', state: 'TX', zip: '75201', tax: true,
    note: 'Texas has no state income tax. The Dallas–Fort Worth area is spread out, so give your mover your exact new address early to get an accurate estimate. Summers are very hot.' },
  nashville: { name: 'Nashville', state: 'TN', zip: '37203', tax: true,
    note: 'Tennessee has no state income tax on wages. Nashville is growing fast and movers book up in summer, so reserve your date early.' },
  boston: { name: 'Boston', state: 'MA', zip: '02108', tax: false,
    note: 'September 1 is the busiest moving day in Boston because so many leases turn over at once. Avoid it if you can. The city requires a street occupancy permit to reserve space for a truck.' },
  tampa: { name: 'Tampa', state: 'FL', zip: '33602', tax: true,
    note: 'Florida has no state income tax. Hurricane season runs from June 1 to November 30, so keep your move date flexible in late summer.' },
  philadelphia: { name: 'Philadelphia', state: 'PA', zip: '19103', tax: false,
    note: 'Many Philadelphia rowhouse streets are narrow. Reserve curb space with a temporary no-parking permit, and ask your mover whether a smaller truck is needed.' },
  orlando: { name: 'Orlando', state: 'FL', zip: '32801', tax: true,
    note: 'Florida has no state income tax. Hurricane season runs from June 1 to November 30, and summer afternoons often bring thunderstorms, so start early.' },
  washington: { name: 'Washington', state: 'DC', zip: '20001', tax: false,
    note: 'In Washington, DC you can reserve curb space for a moving truck with temporary no-parking signs from the city. Many apartment buildings also require a COI and a reserved elevator.' },
  raleigh: { name: 'Raleigh', state: 'NC', zip: '27601', tax: false,
    note: 'Raleigh and the Research Triangle keep growing, so good movers book up in summer. Late summer and fall can bring storm remnants from the coast.' },
};

// [from, to, approximate driving miles]
const ROUTES = [
  ['new-york', 'miami', 1280],
  ['new-york', 'los-angeles', 2790],
  ['new-york', 'atlanta', 870],
  ['new-york', 'charlotte', 630],
  ['los-angeles', 'austin', 1380],
  ['los-angeles', 'phoenix', 370],
  ['los-angeles', 'las-vegas', 270],
  ['los-angeles', 'seattle', 1135],
  ['los-angeles', 'denver', 1020],
  ['san-francisco', 'austin', 1760],
  ['chicago', 'dallas', 925],
  ['chicago', 'phoenix', 1750],
  ['chicago', 'atlanta', 715],
  ['chicago', 'nashville', 470],
  ['boston', 'tampa', 1370],
  ['philadelphia', 'orlando', 990],
  ['washington', 'raleigh', 280],
  ['seattle', 'denver', 1320],
  ['dallas', 'denver', 790],
  ['denver', 'phoenix', 820],
];

// Published ranges (USD) by home size and distance band, from COST_SOURCE.
// Bands: 250-499, 500-999, 1,000-1,499, 1,500-2,499, 2,500+ miles.
// null = not published; filled below by interpolation.
const BAND_LABELS = ['250–499 miles', '500–999 miles', '1,000–1,499 miles', '1,500–2,499 miles', '2,500+ miles'];
const PUBLISHED = {
  Studio: [[1784, 4286], null, null, null, [3087, 6984]],
  '1 bedroom': [[2184, 5584], null, null, null, null],
  '2 bedrooms': [[3284, 6486], [3187, 6286], [3284, 7791], [3884, 10894], [4486, 9986]],
  '3 bedrooms': [[4387, 7791], null, null, [5986, 10894], [6984, 13986]],
  '4+ bedrooms': [[6784, 12486], null, null, [7892, 14884], [9486, 16893]],
};

function interpolate(bands) {
  const out = bands.slice();
  const known = out.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue;
    const lo = Math.max(...known.filter((k) => k < i));
    const hi = Math.min(...known.filter((k) => k > i));
    const t = (i - lo) / (hi - lo);
    out[i] = [0, 1].map((j) => out[lo][j] + (out[hi][j] - out[lo][j]) * t);
  }
  return out;
}

// 1 bedroom has one published band: scale the studio/2-bedroom midpoint
// by the ratio observed in that band.
function oneBedroom(studio, twoBed) {
  const [pub] = PUBLISHED['1 bedroom'];
  const ratio = [0, 1].map((j) => pub[j] / ((studio[0][j] + twoBed[0][j]) / 2));
  return studio.map((s, i) => [0, 1].map((j) => ((s[j] + twoBed[i][j]) / 2) * ratio[j]));
}

const COST_TABLE = (() => {
  const studio = interpolate(PUBLISHED.Studio);
  const two = PUBLISHED['2 bedrooms'];
  return {
    Studio: studio,
    '1 bedroom': oneBedroom(studio, two),
    '2 bedrooms': two,
    '3 bedrooms': interpolate(PUBLISHED['3 bedrooms']),
    '4+ bedrooms': interpolate(PUBLISHED['4+ bedrooms']),
  };
})();

const bandFor = (miles) => (miles < 500 ? 0 : miles < 1000 ? 1 : miles < 1500 ? 2 : miles < 2500 ? 3 : 4);
const round100 = (n) => Math.round(n / 100) * 100;
export const usd = (n) => `$${n.toLocaleString('en-US')}`;

export function costRows(miles) {
  const band = bandFor(miles);
  return Object.entries(COST_TABLE).map(([size, bands]) => ({
    size,
    low: round100(bands[band][0]),
    high: round100(bands[band][1]),
  }));
}

export const bandLabel = (miles) => BAND_LABELS[bandFor(miles)];
export const driveHours = (miles) => Math.round(miles / 60);
export const cityLabel = (c) => `${c.name}, ${c.state}`;

export const routeSlug = (from, to) => `${from}-to-${to}`;

// Every route in both directions.
const ALL_ROUTES = ROUTES.flatMap(([from, to, miles]) => [[from, to, miles], [to, from, miles]]);

export const ROUTE_PAGES = Object.fromEntries(
  ALL_ROUTES.map(([from, to, miles]) => [
    routeSlug(from, to),
    { fromKey: from, toKey: to, from: CITIES[from], to: CITIES[to], miles },
  ]),
);

// SEO metadata for every route page, merged into INDEXABLE_ROUTES.
export const ROUTE_SEO = Object.fromEntries(
  Object.entries(ROUTE_PAGES).map(([slug, r]) => {
    const two = costRows(r.miles).find((c) => c.size === '2 bedrooms');
    return [
      `/moving/${slug}`,
      {
        title: `Moving from ${r.from.name} to ${r.to.name}: Cost & Free Quotes (2026)`,
        description: `${cityLabel(r.from)} to ${cityLabel(r.to)} is about ${r.miles.toLocaleString('en-US')} miles. A 2-bedroom move typically costs ${usd(two.low)}–${usd(two.high)}. Compare costs by home size and get a free quote.`,
        changefreq: 'monthly',
        priority: 0.8,
      },
    ];
  }),
);

// Other routes that share an origin or destination, for internal links.
export function relatedRoutes(slug, limit = 6) {
  const r = ROUTE_PAGES[slug];
  return Object.entries(ROUTE_PAGES)
    .filter(([s, o]) => s !== slug && (o.fromKey === r.fromKey || o.toKey === r.toKey || o.fromKey === r.toKey || o.toKey === r.fromKey))
    .slice(0, limit)
    .map(([s, o]) => ({ to: `/moving/${s}`, label: `${o.from.name} to ${o.to.name}` }));
}
