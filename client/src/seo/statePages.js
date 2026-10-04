// State-to-state moving pages (/moving/california-to-florida), state hubs
// (/moving-to/florida, /moving-from/california) and the /moving/state-to-state
// index. Plain JS (no Vite imports): scripts/prerender.mjs loads it through
// seo/routes.js.
//
// Every number comes from the city data in routePages.js: OSRM driving
// distances between the main cities of each state, priced with the same
// published 2026 cost data as the city route pages. Estimates, not quotes.

import { ROUTE_DISTANCES } from './routeDistances.js';
import { CITIES, ROUTE_PAGES, MIN_ROUTE_MILES, costRows, usd, routeSlug, cityZone } from './routePages.js';

// slug -> state. `hub` is the slug used for /moving-to/ and /moving-from/
// when the state name clashes with a city page (New York, Washington).
// `cities` are keys of CITIES, biggest metro first.
export const STATES = {
  alabama: { name: 'Alabama', abbr: 'AL', cities: ['birmingham'], tax: false,
    note: 'Alabama has some of the lowest property taxes in the country and a lower cost of living than most states. Summers are hot and humid, and spring brings severe storms.' },
  arizona: { name: 'Arizona', abbr: 'AZ', cities: ['phoenix', 'tucson'], tax: false,
    note: 'Arizona has a flat 2.5% state income tax. Summer temperatures in Phoenix often pass 110°F, so book an early-morning unload. Arizona does not observe daylight saving time.' },
  california: { name: 'California', abbr: 'CA', cities: ['los-angeles', 'san-francisco', 'san-diego', 'sacramento'], tax: false,
    note: 'California has one of the highest state income tax rates and some of the highest housing costs in the country. Many cities require a temporary parking permit for a moving truck, so check with the city before move day.' },
  colorado: { name: 'Colorado', abbr: 'CO', cities: ['denver', 'colorado-springs', 'boulder'], tax: false,
    note: 'Colorado has a flat state income tax. Denver sits at about 5,280 feet, and winter storms can close I-70 through the mountains, so allow extra delivery time between November and April.' },
  connecticut: { name: 'Connecticut', abbr: 'CT', cities: ['hartford'], tax: false,
    note: 'Connecticut sits between New York City and Boston and has high property taxes. Winters are snowy, so most moves happen between April and October.' },
  florida: { name: 'Florida', abbr: 'FL', cities: ['miami', 'orlando', 'tampa', 'jacksonville', 'fort-lauderdale'], tax: true,
    note: 'Florida has no state income tax. Hurricane season runs from June 1 to November 30, and home insurance costs more than in most states, so get insurance quotes before you buy.' },
  georgia: { name: 'Georgia', abbr: 'GA', cities: ['atlanta'], tax: false,
    note: 'Georgia has a flat state income tax, and the Atlanta metro is one of the fastest-growing in the country. Traffic on I-285 and I-75/85 can slow a delivery day.' },
  idaho: { name: 'Idaho', abbr: 'ID', cities: ['boise'], tax: false,
    note: 'Idaho has a flat state income tax and has been one of the fastest-growing states. Winter can bring snow on the passes into Boise, so check road conditions for a winter move.' },
  illinois: { name: 'Illinois', abbr: 'IL', cities: ['chicago'], tax: false,
    note: 'Illinois has a flat 4.95% state income tax and some of the highest property taxes in the country. Chicago requires a street-use permit to reserve parking for a moving truck on many streets.' },
  indiana: { name: 'Indiana', abbr: 'IN', cities: ['indianapolis'], tax: false,
    note: 'Indiana has a flat state income tax plus a county income tax, and housing costs below the national average.' },
  iowa: { name: 'Iowa', abbr: 'IA', cities: ['des-moines'], tax: false,
    note: 'Iowa has low housing costs and a flat state income tax. Winters are cold and snowy, so most people prefer to move between April and October.' },
  kansas: { name: 'Kansas', abbr: 'KS', cities: ['wichita'], tax: false,
    note: 'Kansas has some of the most affordable housing in the country. Spring brings severe storms, so leave room in your schedule.' },
  kentucky: { name: 'Kentucky', abbr: 'KY', cities: ['louisville'], tax: false,
    note: 'Kentucky has a flat state income tax and housing costs well below the national average.' },
  louisiana: { name: 'Louisiana', abbr: 'LA', cities: ['new-orleans', 'baton-rouge'], tax: false,
    note: 'Hurricane season runs from June 1 to November 30, and flood insurance matters in many areas. Older New Orleans homes often have narrow stairs and tight streets, so mention access when you get quotes.' },
  maryland: { name: 'Maryland', abbr: 'MD', cities: ['baltimore'], tax: false,
    note: 'Maryland charges a state income tax plus a county income tax. Many Baltimore row homes have narrow stairs, which movers may price as an extra.' },
  massachusetts: { name: 'Massachusetts', abbr: 'MA', cities: ['boston'], tax: false,
    note: 'Boston needs a street-occupancy permit to reserve parking for a moving truck. Many leases end on September 1, so movers in Boston book up weeks before that date.' },
  michigan: { name: 'Michigan', abbr: 'MI', cities: ['detroit'], tax: false,
    note: 'Michigan has a flat state income tax, and some cities, including Detroit, add a city income tax. Winters are cold and snowy.' },
  minnesota: { name: 'Minnesota', abbr: 'MN', cities: ['minneapolis'], tax: false,
    note: 'Minnesota winters are long and cold, so most people move between April and October. Many leases in Minneapolis turn over on the first of the month.' },
  missouri: { name: 'Missouri', abbr: 'MO', cities: ['kansas-city', 'st-louis'], tax: false,
    note: 'Missouri has housing costs below the national average. Kansas City and St. Louis both add a 1% city earnings tax for people who live or work there.' },
  montana: { name: 'Montana', abbr: 'MT', cities: ['billings'], tax: false,
    note: 'Montana has no general sales tax. Distances are long and mountain passes can close in winter, so build in extra delivery time from November to March.' },
  nebraska: { name: 'Nebraska', abbr: 'NE', cities: ['omaha'], tax: false,
    note: 'Nebraska has a low cost of living and a large insurance and finance job market in Omaha. Winters are cold and windy.' },
  nevada: { name: 'Nevada', abbr: 'NV', cities: ['las-vegas'], tax: true,
    note: 'Nevada has no state income tax. Las Vegas summers are extremely hot, so plan the unload for early morning and pack heat-sensitive items in your car.' },
  'new-jersey': { name: 'New Jersey', abbr: 'NJ', cities: ['newark'], tax: false,
    note: 'New Jersey has some of the highest property taxes in the country. Many apartment buildings ask for a certificate of insurance (COI) from your mover.' },
  'new-mexico': { name: 'New Mexico', abbr: 'NM', cities: ['albuquerque'], tax: false,
    note: 'Albuquerque sits at about 5,000 feet. Summers are hot and dry, and housing costs are below the national average.' },
  'new-york': { name: 'New York', abbr: 'NY', hub: 'new-york-state', cities: ['new-york', 'buffalo'], tax: false,
    note: 'New York has a state income tax, and New York City adds its own city income tax. Most NYC buildings need a certificate of insurance (COI) from your mover and a reserved elevator slot.' },
  'north-carolina': { name: 'North Carolina', abbr: 'NC', cities: ['charlotte', 'raleigh'], tax: false,
    note: 'North Carolina has a flat state income tax and is one of the fastest-growing states, led by Charlotte and the Raleigh-Durham area. Movers book up early in summer.' },
  ohio: { name: 'Ohio', abbr: 'OH', cities: ['columbus'], tax: false,
    note: 'Ohio has a state income tax, and most cities, including Columbus, add a local income tax. Housing costs are below the national average.' },
  oklahoma: { name: 'Oklahoma', abbr: 'OK', cities: ['oklahoma-city', 'tulsa'], tax: false,
    note: 'Oklahoma has some of the lowest housing costs in the country. Spring is tornado season, so watch the forecast if you move between March and June.' },
  oregon: { name: 'Oregon', abbr: 'OR', cities: ['portland'], tax: false,
    note: 'Oregon has no general sales tax but a high state income tax. Portland is rainy from fall to spring, so ask your mover how they protect furniture in wet weather.' },
  pennsylvania: { name: 'Pennsylvania', abbr: 'PA', cities: ['philadelphia', 'pittsburgh'], tax: false,
    note: 'Pennsylvania has a flat 3.07% state income tax, and Philadelphia and many other towns add a local wage tax. Philadelphia row homes often have narrow stairs.' },
  'south-carolina': { name: 'South Carolina', abbr: 'SC', cities: ['charleston', 'greenville'], tax: false,
    note: 'South Carolina is one of the fastest-growing states. Housing costs are lower than in most coastal states, and hurricane season runs from June 1 to November 30.' },
  'south-dakota': { name: 'South Dakota', abbr: 'SD', cities: ['sioux-falls'], tax: true,
    note: 'South Dakota has no state income tax. Winters are long and cold, so most people move between April and October.' },
  tennessee: { name: 'Tennessee', abbr: 'TN', cities: ['nashville', 'memphis'], tax: true,
    note: 'Tennessee has no state income tax on wages, but its combined sales tax is among the highest in the country. Nashville movers book up fast in summer.' },
  texas: { name: 'Texas', abbr: 'TX', cities: ['houston', 'dallas', 'austin', 'san-antonio'], tax: true,
    note: 'Texas has no state income tax, but property taxes are higher than in most states, so compare total housing costs. Summers are very hot, so plan early-morning loading and unloading.' },
  utah: { name: 'Utah', abbr: 'UT', cities: ['salt-lake-city'], tax: false,
    note: 'Utah has a flat state income tax and one of the youngest, fastest-growing populations in the country. Winter storms can affect mountain routes into Salt Lake City.' },
  virginia: { name: 'Virginia', abbr: 'VA', cities: ['virginia-beach', 'richmond'], tax: false,
    note: 'Virginia has a state income tax, and cars are subject to a yearly local personal property tax. Hampton Roads has a large military community, so movers there are busy during summer transfer season.' },
  'washington-state': { name: 'Washington', abbr: 'WA', cities: ['seattle'], tax: true,
    note: 'Washington has no state income tax on wages, but its sales tax is among the highest in the country. Seattle is hilly with steep driveways, so mention access when you get quotes.' },
  wisconsin: { name: 'Wisconsin', abbr: 'WI', cities: ['milwaukee'], tax: false,
    note: 'Wisconsin winters are cold and snowy, so a spring to fall move is easier. Many older Milwaukee homes have steep stairs.' },
  wyoming: { name: 'Wyoming', abbr: 'WY', cities: ['cheyenne'], tax: true,
    note: 'Wyoming has no state income tax. Strong winter winds can close I-80 and I-25, so watch the forecast near your move date.' },
};

const hubSlug = (key) => STATES[key].hub || key;
const stateBySlugHub = Object.fromEntries(Object.keys(STATES).map((k) => [hubSlug(k), k]));
export const stateFromHub = (slug) => stateBySlugHub[slug];

// [from, to] state pairs with search demand (Semrush exports, Oct 2026).
const PAIRS = `
new-york florida|california florida|california new-york|florida virginia|new-jersey florida|california texas|florida california|california arizona|california oregon|california washington-state|pennsylvania florida|texas california|california north-carolina
florida texas|texas colorado|new-york texas|michigan texas|illinois florida|new-york north-carolina|ohio florida|massachusetts florida|connecticut florida|indiana florida|missouri florida|maryland florida|virginia florida|georgia florida|colorado florida
california new-jersey|california pennsylvania|california illinois|california michigan|california south-carolina|california georgia|california colorado|california nevada|california tennessee|california massachusetts|california maryland|california virginia|california ohio|california missouri|california wisconsin|california indiana|california kentucky|california alabama|california idaho|california montana|california iowa|california nebraska|california new-mexico|california utah|california wyoming|california oklahoma|california minnesota
florida new-york|florida north-carolina|florida georgia|florida south-carolina|florida new-jersey|florida pennsylvania|florida colorado|florida tennessee|florida illinois|florida massachusetts|florida washington-state|florida nevada
new-jersey california|new-jersey texas|new-jersey north-carolina|new-jersey georgia|new-jersey arizona
new-york california|new-york arizona|new-york colorado|new-york georgia|new-york virginia|new-york south-carolina
pennsylvania california|pennsylvania texas|pennsylvania north-carolina|pennsylvania south-carolina|pennsylvania georgia|pennsylvania tennessee|pennsylvania illinois|pennsylvania alabama|pennsylvania oklahoma
texas florida|texas new-york|texas new-jersey|texas massachusetts|texas washington-state|texas maryland
massachusetts texas|massachusetts colorado|massachusetts north-carolina|massachusetts south-carolina
illinois texas|illinois pennsylvania|illinois new-jersey|illinois massachusetts|illinois south-carolina|illinois north-carolina
ohio texas|ohio missouri|ohio massachusetts|ohio iowa
missouri tennessee|missouri kansas|missouri texas|missouri minnesota|missouri wisconsin
kentucky texas|kentucky maryland|kentucky oklahoma
virginia north-carolina|virginia texas|virginia california|maryland california|maryland texas|maryland north-carolina
south-carolina texas|south-carolina maryland|south-carolina illinois|south-carolina new-jersey|south-carolina new-york|south-carolina wisconsin
michigan california|michigan massachusetts|iowa texas|iowa ohio|indiana california|arizona california|washington-state california|washington-state arizona|oregon california|oregon texas
north-carolina texas|north-carolina california|north-carolina florida|north-carolina missouri|north-carolina iowa|wisconsin south-carolina|nebraska texas|nebraska pennsylvania
colorado california|colorado texas|colorado pennsylvania|colorado massachusetts
colorado utah|colorado kansas|colorado illinois|colorado minnesota|colorado nebraska|colorado missouri|colorado montana|colorado new-mexico|colorado nevada|colorado iowa|colorado kentucky|colorado arizona|colorado south-dakota|colorado wyoming
utah colorado|kansas colorado|illinois colorado|minnesota colorado|nebraska colorado|missouri colorado|new-mexico colorado|nevada colorado|arizona colorado
`.trim().split(/[|\n]/).map((p) => p.trim().split(' '));

const pairKey = (a, b) => [a, b].sort().join('|');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

// City-to-city legs for a state pair, long enough to be a long-distance move.
function legs(fromState, toState) {
  const out = [];
  for (const a of STATES[fromState].cities) {
    for (const b of STATES[toState].cities) {
      const d = ROUTE_DISTANCES[pairKey(a, b)];
      if (!d || d[0] < MIN_ROUTE_MILES) continue;
      const two = costRows(d[0]).find((c) => c.size === '2 bedrooms');
      const slug = routeSlug(a, b);
      out.push({ fromKey: a, toKey: b, from: CITIES[a], to: CITIES[b], miles: d[0], hours: d[1], two, href: ROUTE_PAGES[slug] ? `/moving/${slug}` : null });
    }
  }
  return out.sort((x, y) => x.miles - y.miles);
}

export const statePairSlug = (a, b) => `${a}-to-${b}`;

export const STATE_PAGES = Object.fromEntries(
  PAIRS.flatMap(([a, b]) => {
    if (!STATES[a] || !STATES[b]) throw new Error(`Unknown state in pair: ${a} ${b}`);
    const slug = statePairSlug(a, b);
    if (ROUTE_PAGES[slug]) throw new Error(`State slug clashes with a city route: ${slug}`);
    const l = legs(a, b);
    if (!l.length) return [];
    const miles = median(l.map((x) => x.miles));
    const hours = median(l.map((x) => x.hours));
    return [[slug, {
      slug, fromKey: a, toKey: b, from: STATES[a], to: STATES[b], legs: l, miles, hours,
      minMiles: l[0].miles, maxMiles: l.at(-1).miles, rows: costRows(miles),
    }]];
  }),
);

// Short title with the 2-bedroom price, like the city route pages.
function pairTitle(p) {
  const two = p.rows.find((c) => c.size === '2 bedrooms');
  const base = `${p.from.name} to ${p.to.name} Movers: ${usd(two.low)}–${usd(two.high)}`;
  return base.length <= 48 ? `${base} (2026 Cost)` : base.length <= 56 ? `${base} (2026)` : base;
}

export const STATE_PAIR_SEO = Object.fromEntries(
  Object.values(STATE_PAGES).map((p) => {
    const two = p.rows.find((c) => c.size === '2 bedrooms');
    return [`/moving/${p.slug}`, {
      title: pairTitle(p),
      description: `Moving from ${p.from.name} to ${p.to.name}? A 2-bedroom move of about ${p.miles.toLocaleString('en-US')} miles costs ${usd(two.low)}–${usd(two.high)}. Costs by city and home size, cheapest options and free quotes.`,
      changefreq: 'monthly',
      priority: 0.8,
    }];
  }),
);

// State hubs: every state page into (or out of) a state.
export function statePairsFor(stateKey, dir) {
  return Object.values(STATE_PAGES)
    .filter((p) => (dir === 'to' ? p.toKey : p.fromKey) === stateKey)
    .sort((a, b) => a.miles - b.miles);
}

export const STATE_HUB_SEO = Object.fromEntries(
  Object.entries(STATES).flatMap(([key, st]) => {
    const out = [];
    const into = statePairsFor(key, 'to');
    const outOf = statePairsFor(key, 'from');
    if (into.length >= 2) {
      out.push([`/moving-to/${hubSlug(key)}`, {
        title: `Moving to ${st.name}: Costs from ${into.length} States, Tips and Free Quotes`,
        description: `What it costs to move to ${st.name} from ${into.slice(0, 3).map((p) => p.from.name).join(', ')} and more, plus taxes, weather and what to know before you move.`,
        changefreq: 'monthly',
        priority: 0.8,
      }]);
    }
    if (outOf.length >= 2) {
      out.push([`/moving-from/${hubSlug(key)}`, {
        title: `Moving Out of ${st.name}: Costs to ${outOf.length} States (2026)`,
        description: `Typical costs to move from ${st.name} to ${outOf.slice(0, 3).map((p) => p.to.name).join(', ')} and more. Compare by distance and home size, then get a free quote.`,
        changefreq: 'monthly',
        priority: 0.8,
      }]);
    }
    return out;
  }),
);
export const hasStateHub = (slug, dir) => Boolean(STATE_HUB_SEO[`/moving-${dir}/${slug}`]);
export { hubSlug };

// Plain-English time zone change between the main cities of two states.
export function stateZoneNote(p) {
  const a = cityZone(p.from.cities[0]);
  const b = cityZone(p.to.cities[0]);
  if (!a || !b || a === b) return null;
  const off = { Eastern: -5, Central: -6, Mountain: -7, Pacific: -8 };
  const diff = off[b] - off[a];
  const hrs = Math.abs(diff) === 1 ? '1 hour' : `${Math.abs(diff)} hours`;
  return `Most of ${p.from.name} is on ${a} time and most of ${p.to.name} is on ${b} time, so you ${diff > 0 ? 'lose' : 'gain'} ${hrs}.`;
}

// Driving-distance price bands for the /moving/state-to-state index.
export const DISTANCE_EXAMPLES = [300, 600, 1000, 1500, 2000, 2800].map((miles) => ({ miles, rows: costRows(miles) }));

// The state page for a city route (e.g. Chicago to Dallas -> Illinois to Texas).
const keyByAbbr = Object.fromEntries(Object.entries(STATES).map(([k, s]) => [s.abbr, k]));
export function statePageForCities(fromAbbr, toAbbr) {
  const a = keyByAbbr[fromAbbr];
  const b = keyByAbbr[toAbbr];
  return a && b ? STATE_PAGES[statePairSlug(a, b)] || null : null;
}
