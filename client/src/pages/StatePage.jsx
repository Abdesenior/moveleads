import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';
import JsonLd from '../components/JsonLd';
import { SITE_URL } from '../seo/routes';
import { COST_SOURCE, SEASON_SOURCE, CITIES, CITY_HUB_SEO, usd, bandLabel } from '../seo/routePages';
import { STATE_PAGES, statePairSlug, statePairsFor, stateZoneNote, hubSlug, hasStateHub } from '../seo/statePages';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const MUTED = '#475569';
const BL = 'rgba(15,23,42,0.08)';

const h2Style = { fontFamily: F, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: NAVY, margin: '0 0 14px' };
const pStyle = { fontSize: 16.5, lineHeight: 1.75, color: MUTED, margin: '0 0 14px' };
const liStyle = { fontSize: 16, lineHeight: 1.7, color: MUTED, marginBottom: 8 };
const linkStyle = { color: '#ea580c', fontWeight: 700, textDecoration: 'none' };
const ext = { ...linkStyle, fontWeight: 600 };
const th = { textAlign: 'left', padding: '12px 16px', color: NAVY, borderBottom: `1px solid ${BL}` };
const td = (i) => ({ padding: '11px 16px', color: MUTED, borderTop: i ? `1px solid ${BL}` : 'none' });

function QuoteButton({ href, label = 'Get my free moving quote' }) {
  return (
    <Link to={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ORANGE, color: '#fff', padding: '14px 26px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
      {label} <ArrowRight size={18} />
    </Link>
  );
}

function Checks({ items }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
      {items.map((t) => {
        const [lead, ...rest] = t.split('. ');
        return (
          <li key={t} style={{ ...liStyle, display: 'flex', gap: 10 }}>
            <CheckCircle size={18} color={ORANGE} style={{ flexShrink: 0, marginTop: 4 }} />
            <span><strong style={{ color: NAVY }}>{lead}.</strong> {rest.join('. ')}</span>
          </li>
        );
      })}
    </ul>
  );
}

const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);

export default function StatePage({ slug }) {
  const p = STATE_PAGES[slug];
  const { from, to, rows, miles, hours, legs } = p;
  const two = rows.find((c) => c.size === '2 bedrooms');
  const milesText = miles.toLocaleString('en-US');
  const range = p.minMiles === p.maxMiles
    ? `about ${milesText} miles`
    : `${p.minMiles.toLocaleString('en-US')} to ${p.maxMiles.toLocaleString('en-US')} miles`;
  const fromCity = CITIES[from.cities[0]];
  const toCity = CITIES[to.cities[0]];
  const quoteHref = `/get-quote?from=${fromCity.zip}&to=${toCity.zip}`;
  const path = `/moving/${slug}`;
  const zoneNote = stateZoneNote(p);
  const fromNames = list(from.cities.map((k) => CITIES[k].name));
  const toNames = list(to.cities.map((k) => CITIES[k].name));
  const long = miles >= 1000;

  const taxLine = to.tax && !from.tax
    ? `${to.name} has no state income tax on wages, and ${from.name} does. For many people that is one of the main reasons for this move.`
    : !to.tax && from.tax
      ? `${from.name} has no state income tax on wages, but ${to.name} does, so include state income tax in your new budget.`
      : null;

  const reverse = STATE_PAGES[statePairSlug(p.toKey, p.fromKey)];
  const moreInto = statePairsFor(p.toKey, 'to').filter((x) => x.slug !== slug).slice(0, 5);
  const moreOut = statePairsFor(p.fromKey, 'from').filter((x) => x.slug !== slug).slice(0, 5);

  const faq = [
    [`How much does it cost to move from ${from.name} to ${to.name}?`,
      `For a typical move of about ${milesText} miles, full-service movers charge roughly ${usd(rows[0].low)}–${usd(rows[0].high)} for a studio, ${usd(two.low)}–${usd(two.high)} for a 2-bedroom home and ${usd(rows[4].low)}–${usd(rows[4].high)} for 4 or more bedrooms. The exact price depends on which cities you move between, the weight of your belongings, the date and any extra services.`],
    [`What is the cheapest way to move from ${from.name} to ${to.name}?`,
      `Renting a truck and doing the work yourself is usually the cheapest, followed by a moving container that a company drives for you. Full-service movers cost the most but do the loading, driving and unloading. Whatever you choose, moving fewer things, moving between October and April and booking early lower the price.`],
    [`How long does it take to move from ${from.name} to ${to.name}?`,
      `The drive between the main cities is ${range}, about ${hours} hours behind the wheel for a typical route. Movers give you a delivery window in writing. On ${long ? 'a cross-country route like this one it is often one to two weeks' : 'a route this length it is often several days to a week'}, and longer if your belongings share a truck with other moves.`],
    [`When is the best time to move from ${from.name} to ${to.name}?`,
      'Peak moving season runs from May to September, when prices are highest and movers book up. Moving between October and April, on a weekday and away from the end of the month usually costs less. Book 6 to 8 weeks ahead.'],
    [`Do I need an interstate mover to move from ${from.name} to ${to.name}?`,
      'Yes. Any move that crosses a state line must be done by a mover registered with the Federal Motor Carrier Safety Administration (FMCSA) with a USDOT number. You can look up any mover’s number on the FMCSA website before you book.'],
    [`How do I find the best movers from ${from.name} to ${to.name}?`,
      'Get at least three written estimates after an in-home or video survey, check each mover’s USDOT number and complaint history with the FMCSA, and ask for a binding or not-to-exceed estimate. Be careful with any mover that asks for a large cash deposit.'],
  ];

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'State to state moving', path: '/moving/state-to-state' },
    { name: `${from.name} to ${to.name}`, path },
  ];

  return (
    <MarketingLayout>
      <JsonLd schema={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      }} />
      <JsonLd schema={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE_URL}${c.path}` })),
      }} />

      <header style={{ background: `linear-gradient(135deg,#070e1b 0%,${NAVY} 100%)`, padding: '96px 0 56px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 20px' }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, marginBottom: 18 }}>
            {crumbs.map((c, i) => (
              <span key={c.path} style={{ color: 'rgba(255,255,255,0.55)' }}>
                {i > 0 && ' / '}
                {i < crumbs.length - 1
                  ? <Link to={c.path} style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>{c.name}</Link>
                  : <span style={{ color: '#fff' }}>{c.name}</span>}
              </span>
            ))}
          </nav>
          <p style={{ fontSize: 12, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8, margin: '0 0 12px' }}>
            {from.name} → {to.name} · {range}
          </p>
          <h1 style={{ fontFamily: F, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.12, margin: '0 0 18px' }}>
            Moving from {from.name} to {to.name}: cost, cheapest options and free quotes
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', margin: '0 0 28px' }}>
            A move from {from.name} to {to.name} is {range} between the main cities. For a 2-bedroom home,
            full-service movers typically charge {usd(two.low)}–{usd(two.high)}.
            Tell us about your move and we’ll match you with a licensed interstate mover for this route. It’s free.
          </p>
          <QuoteButton href={quoteHref} />
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '56px 20px 24px' }}>
        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>{from.name} to {to.name} moving cost by home size</h2>
          <p style={pStyle}>
            Estimated full-service prices for a typical {from.name} to {to.name} move of about {milesText} miles
            (the middle distance between {fromNames} and {toNames}), interpolated from published prices for the {bandLabel(miles)} band and its neighbours:
          </p>
          <div style={{ overflowX: 'auto', margin: '6px 0 12px', border: `1px solid ${BL}`, borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
              <thead><tr><th style={th}>Home size</th><th style={th}>Estimated cost</th></tr></thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.size}>
                    <td style={{ ...td(i), color: NAVY, fontWeight: 600 }}>{c.size}</td>
                    <td style={td(i)}>{usd(c.low)} – {usd(c.high)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ ...pStyle, fontSize: 13.5 }}>
            Estimates based on <a href={COST_SOURCE.url} target="_blank" rel="noopener noreferrer" style={ext}>{COST_SOURCE.name}</a>, rounded to the nearest $50.
            These are not MoveLeads quotes; your mover prices your actual move.
          </p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>Cost by city: {from.name} to {to.name}</h2>
          <p style={pStyle}>Where you start and end in each state changes the distance, and the distance changes the price. Estimated cost for a 2-bedroom home:</p>
          <div style={{ overflowX: 'auto', margin: '6px 0 12px', border: `1px solid ${BL}`, borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
              <thead><tr><th style={th}>Route</th><th style={th}>Driving distance</th><th style={th}>2-bedroom cost</th></tr></thead>
              <tbody>
                {legs.map((l, i) => (
                  <tr key={`${l.fromKey}-${l.toKey}`}>
                    <td style={td(i)}>
                      {l.href
                        ? <Link to={l.href} style={linkStyle}>{l.from.name} to {l.to.name}</Link>
                        : <span style={{ color: NAVY, fontWeight: 600 }}>{l.from.name} to {l.to.name}</span>}
                    </td>
                    <td style={td(i)}>{l.miles.toLocaleString('en-US')} mi · {l.hours} h</td>
                    <td style={td(i)}>{usd(l.two.low)} – {usd(l.two.high)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ ...pStyle, fontSize: 13.5 }}>Driving distances and times from OpenStreetMap road data (OSRM).</p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>Cheapest ways to move from {from.name} to {to.name}</h2>
          <p style={pStyle}>There are three main ways to make this move. From cheapest to most expensive:</p>
          <Checks items={[
            'Rent a truck. You pack, load, drive and unload yourself. It costs the least in cash, but on a trip of ' + range + ' add fuel, hotels, meals and your own time.',
            'Use a moving container. The company drops a container at your home, you load it, and they drive it to ' + to.name + '. You avoid the long drive and pay less than full service.',
            'Hire full-service movers. The crew packs (if you want), loads, drives and unloads. It costs the most but saves the most work, and the mover is responsible for your belongings in transit.',
          ]} />
          <p style={pStyle}>Ways to lower the price with any option:</p>
          <Checks items={[
            'Move less. Interstate moves are priced mostly by weight, so selling or donating what you won’t use cuts the bill.',
            'Pick the date. October to April, weekdays and mid-month dates usually cost less than summer weekends and month-end.',
            'Book early. Booking 6 to 8 weeks ahead can save 10 to 20% compared to a last-minute move.',
            'Compare written estimates. Get at least three, based on a real look at your home, not a phone guess.',
          ]} />
          <p style={{ ...pStyle, fontSize: 13.5 }}>
            Season and booking figures from the <a href={SEASON_SOURCE.url} target="_blank" rel="noopener noreferrer" style={ext}>{SEASON_SOURCE.name}</a>.
            More in our guide: <Link to="/resources/cheapest-way-to-move-out-of-state" style={ext}>the cheapest way to move out of state</Link>.
          </p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>The drive from {from.name} to {to.name}</h2>
          <p style={pStyle}>
            Between the main cities the drive is {range}, typically about {hours} hours behind the wheel.
            {' '}{zoneNote}
          </p>
          <p style={pStyle}>
            {hours >= 10
              ? 'If you drive yourself while the movers take your belongings, plan at least one overnight stop, and agree on a delivery window in writing so someone is there to unload.'
              : 'You will likely arrive before your belongings. Interstate movers give a delivery window in writing, so make sure someone can be at the new home when the truck arrives.'}
          </p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>Moving to {to.name}: what to know</h2>
          <p style={pStyle}>{to.note}</p>
          {taxLine && <p style={pStyle}>{taxLine}</p>}
          <p style={pStyle}>
            Popular destinations in {to.name}:{' '}
            {to.cities.filter((k) => CITY_HUB_SEO[`/moving-to/${k}`]).map((k, i) => (
              <span key={k}>{i > 0 && ', '}<Link to={`/moving-to/${k}`} style={linkStyle}>{CITIES[k].name}</Link></span>
            ))}.
          </p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>How to choose a mover from {from.name} to {to.name}</h2>
          <ol style={{ paddingLeft: 22, margin: 0 }}>
            <li style={liStyle}>Check the mover’s USDOT number on the FMCSA website. Every interstate mover must have one.</li>
            <li style={liStyle}>Ask for an in-home or video survey, not a phone guess. Estimates based on a real look at your home are more accurate.</li>
            <li style={liStyle}>Ask for a binding or not-to-exceed estimate so the price can’t jump on delivery day.</li>
            <li style={liStyle}>Interstate movers must give you the FMCSA booklet “Your Rights and Responsibilities When You Move”. If they don’t, walk away.</li>
            <li style={liStyle}>Never pay a large deposit in cash. A big upfront demand is a common sign of a moving scam.</li>
          </ol>
          <p style={{ ...pStyle, marginTop: 14 }}>
            More: <Link to="/resources/how-to-choose-a-long-distance-moving-company" style={linkStyle}>how to choose a long-distance moving company</Link>
            {' · '}<Link to="/resources/moving-out-of-state-checklist" style={linkStyle}>moving out of state checklist</Link>
          </p>
        </section>

        <section style={{ background: '#fff7ed', border: '1px solid rgba(249,115,22,0.18)', borderRadius: 18, padding: '32px 28px', textAlign: 'center', marginBottom: 44 }}>
          <h2 style={{ ...h2Style, marginBottom: 10 }}>Get a free quote from {from.name} to {to.name}</h2>
          <p style={{ ...pStyle, marginBottom: 20 }}>Takes about 60 seconds. We match your request with a licensed interstate mover for this route, so you don’t get calls from a dozen companies.</p>
          <QuoteButton href={quoteHref} label="Start my free quote" />
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>Frequently asked questions</h2>
          {faq.map(([q, a]) => (
            <div key={q} style={{ borderTop: `1px solid ${BL}`, padding: '18px 0' }}>
              <h3 style={{ fontFamily: F, fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>{q}</h3>
              <p style={{ ...pStyle, margin: 0 }}>{a}</p>
            </div>
          ))}
        </section>

        <section style={{ marginBottom: 56 }}>
          <h2 style={h2Style}>Related moves</h2>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            {reverse && <li style={liStyle}><Link to={`/moving/${reverse.slug}`} style={linkStyle}>Moving from {to.name} to {from.name}</Link></li>}
            {moreInto.map((x) => <li key={x.slug} style={liStyle}><Link to={`/moving/${x.slug}`} style={linkStyle}>Moving from {x.from.name} to {x.to.name}</Link></li>)}
            {moreOut.map((x) => <li key={x.slug} style={liStyle}><Link to={`/moving/${x.slug}`} style={linkStyle}>Moving from {x.from.name} to {x.to.name}</Link></li>)}
            {hasStateHub(hubSlug(p.toKey), 'to') && <li style={liStyle}><Link to={`/moving-to/${hubSlug(p.toKey)}`} style={linkStyle}>Moving to {to.name}</Link></li>}
            {hasStateHub(hubSlug(p.fromKey), 'from') && <li style={liStyle}><Link to={`/moving-from/${hubSlug(p.fromKey)}`} style={linkStyle}>Moving out of {from.name}</Link></li>}
            <li style={liStyle}><Link to="/moving/state-to-state" style={linkStyle}>State to state moving costs</Link></li>
            <li style={liStyle}><Link to="/moving-cost-calculator" style={linkStyle}>Moving cost calculator</Link></li>
            <li style={liStyle}><Link to="/resources/moving-scams" style={linkStyle}>How to avoid moving scams</Link></li>
          </ul>
        </section>

        <section style={{ borderTop: `1px solid ${BL}`, paddingTop: 28, marginBottom: 56 }}>
          <h2 style={{ ...h2Style, fontSize: 20 }}>Moving company serving {from.name} to {to.name}?</h2>
          <p style={pStyle}>
            MoveLeads sends long-distance move requests on routes like this one to interstate movers who cover them,
            one buyer per lead by default, from $18 per lead with no subscription.{' '}
            <Link to="/moving-leads/long-distance" style={linkStyle}>Long-distance moving leads</Link>
            {' · '}
            <Link to="/moving-leads/exclusive" style={linkStyle}>Exclusive moving leads</Link>
          </p>
        </section>
      </main>
    </MarketingLayout>
  );
}
