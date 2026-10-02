import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';
import JsonLd from '../components/JsonLd';
import NotFound from './NotFound';
import { SITE_URL } from '../seo/routes';
import { ROUTE_HIGHWAYS } from '../seo/routeHighways';
import {
  ROUTE_PAGES, COST_SOURCE, HOURLY_SOURCE, SEASON_SOURCE, routeCostRows, bandLabel, cityLabel, usd, relatedRoutes, timeZoneNote,
} from '../seo/routePages';

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

function QuoteButton({ href, label = 'Get my free moving quote' }) {
  return (
    <Link to={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ORANGE, color: '#fff', padding: '14px 26px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
      {label} <ArrowRight size={18} />
    </Link>
  );
}

export default function RoutePage() {
  const { slug } = useParams();
  const r = ROUTE_PAGES[slug];
  if (!r) return <NotFound />;

  const { from, to, miles } = r;
  const short = r.short;
  const rows = routeCostRows(r);
  const stateName = { FL: 'Florida', TX: 'Texas', CA: 'California', NC: 'North Carolina', AZ: 'Arizona', TN: 'Tennessee', OK: 'Oklahoma', LA: 'Louisiana' }[from.state] || from.state;
  const two = rows.find((c) => c.size === '2 bedrooms');
  const hours = r.hours;
  const quoteHref = `/get-quote?from=${from.zip}&to=${to.zip}`;
  const path = `/moving/${slug}`;
  const related = relatedRoutes(slug);
  const milesText = miles.toLocaleString('en-US');
  const roads = [...new Set((ROUTE_HIGHWAYS[[r.fromKey, r.toKey].sort().join('|')] || '')
    .split(/[,;]/).map((x) => x.trim()).filter(Boolean))].slice(0, 3);
  const highways = roads.length > 1 ? `${roads.slice(0, -1).join(', ')} and ${roads.at(-1)}` : roads[0] || '';
  const tzNote = timeZoneNote(r.fromKey, r.toKey);

  const taxLine = to.tax && !from.tax
    ? `${to.state === 'TX' ? 'Texas' : to.state === 'FL' ? 'Florida' : to.state === 'NV' ? 'Nevada' : to.state === 'WA' ? 'Washington' : 'Tennessee'} has no state income tax on wages, which is one reason this is a popular route.`
    : null;

  const faq = [
    [`How much does it cost to move from ${from.name} to ${to.name}?`,
      short
        ? `For about ${milesText} miles, expect roughly ${usd(rows[0].low)}–${usd(rows[0].high)} for a studio, ${usd(two.low)}–${usd(two.high)} for a 2-bedroom home and ${usd(rows[4].low)}–${usd(rows[4].high)} for 4 or more bedrooms. Short in-state moves are usually priced by the hour, so the crew size, hours and drive time set the price.`
        : `For about ${milesText} miles, full-service movers typically charge ${usd(rows[0].low)}–${usd(rows[0].high)} for a studio, ${usd(two.low)}–${usd(two.high)} for a 2-bedroom home and ${usd(rows[4].low)}–${usd(rows[4].high)} for 4 or more bedrooms. These are estimates from 2026 industry data; your quote depends on the weight of your belongings, your move date and extra services.`],
    [`How long does a move from ${from.name} to ${to.name} take?`,
      short
        ? `The drive is about ${milesText} miles, roughly ${hours} hours. Most in-state moves this size are loaded, driven and unloaded in one or two days, depending on home size.`
        : `The drive is about ${milesText} miles, roughly ${hours} hours behind the wheel. Interstate movers give you a delivery window in writing; it is usually a few days on a route this long, and longer if your belongings share a truck with other moves.`],
    [`What is the cheapest time to move from ${from.name} to ${to.name}?`,
      'Peak moving season runs from May to September, when prices are highest. Moving from October to April, on a weekday, and away from the end of the month usually costs less. Booking 6 to 8 weeks ahead can also lower the price.'],
    short
      ? ['What license does a mover need for this move?',
        `This move stays inside ${stateName}, so state rules apply. Check that the mover is licensed or registered with the state where required, and ask for proof of insurance before you book.`]
      : ['Do I need an interstate mover for this route?',
        `Yes. Because this move crosses state lines, the mover must be registered with the Federal Motor Carrier Safety Administration (FMCSA) and have a USDOT number. You can check any mover’s number on the FMCSA website before you book.`],
  ];

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Moving routes', path: '/moving' },
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
            {cityLabel(from)} → {cityLabel(to)} · about {milesText} miles
          </p>
          <h1 style={{ fontFamily: F, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.12, margin: '0 0 18px' }}>
            Moving from {from.name} to {to.name}: cost and free quotes
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', margin: '0 0 28px' }}>
            A move from {cityLabel(from)} to {cityLabel(to)} is about {milesText} miles, roughly {hours} hours of driving.
            For a 2-bedroom home, {short ? 'a short in-state move typically costs' : 'full-service movers typically charge'} {usd(two.low)}–{usd(two.high)}.
            Tell us about your move and we’ll match you with a licensed moving partner for this route. It’s free.
          </p>
          <QuoteButton href={quoteHref} />
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '56px 20px 24px' }}>
        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>{from.name} to {to.name} moving cost by home size</h2>
          <p style={pStyle}>
            {short
              ? `Short in-state moves are usually priced by the hour. These estimates add a typical crew’s loading and unloading time to the ${hours}-hour drive between the two cities:`
              : `Typical full-service prices for a move of ${bandLabel(miles)}, which covers this route:`}
          </p>
          <div style={{ overflowX: 'auto', margin: '6px 0 12px', border: `1px solid ${BL}`, borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px 16px', color: NAVY, borderBottom: `1px solid ${BL}` }}>Home size</th>
                  {short && <th style={{ textAlign: 'left', padding: '12px 16px', color: NAVY, borderBottom: `1px solid ${BL}` }}>Typical crew</th>}
                  <th style={{ textAlign: 'left', padding: '12px 16px', color: NAVY, borderBottom: `1px solid ${BL}` }}>Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.size}>
                    <td style={{ padding: '11px 16px', color: NAVY, fontWeight: 600, borderTop: i ? `1px solid ${BL}` : 'none' }}>{c.size}</td>
                    {short && <td style={{ padding: '11px 16px', color: MUTED, borderTop: i ? `1px solid ${BL}` : 'none' }}>{c.crew}, {c.hours} h</td>}
                    <td style={{ padding: '11px 16px', color: MUTED, borderTop: i ? `1px solid ${BL}` : 'none' }}>{usd(c.low)} – {usd(c.high)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ ...pStyle, fontSize: 13.5 }}>
            {short ? (
              <>
                Estimates use crew sizes, loading hours and hourly rates from the <a href={HOURLY_SOURCE.url} target="_blank" rel="noopener noreferrer" style={ext}>{HOURLY_SOURCE.name}</a>, plus the drive at the crew’s hourly rate, rounded to the nearest $100.
                Some movers also charge travel time from their depot, or price longer in-state moves by weight. These are not MoveLeads quotes; your mover prices your actual move.
              </>
            ) : (
              <>
                Estimates based on <a href={COST_SOURCE.url} target="_blank" rel="noopener noreferrer" style={ext}>{COST_SOURCE.name}</a>, rounded to the nearest $100.
                Some home sizes and distances were interpolated from neighbouring figures. These are not MoveLeads quotes; your mover prices your actual move.
              </>
            )}
          </p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>The drive from {from.name} to {to.name}</h2>
          <p style={pStyle}>
            The route is about {milesText} miles and takes roughly {hours} hours of driving
            {highways ? `, mostly on ${highways}` : ''}.
            {' '}{tzNote}
          </p>
          <p style={pStyle}>
            {short
              ? 'On a move this short the crew usually loads and delivers the same day or the next, so plan to reach the new home before the truck to unlock and direct the unload.'
              : hours >= 10
                ? 'If you drive yourself while the movers take your belongings, plan at least one overnight stop, and agree on a delivery date or window so someone is there to unload.'
                : 'You will likely arrive before your belongings. Interstate movers give a delivery window in writing, so make sure someone can be at the new home when the truck arrives.'}
          </p>
          <p style={{ ...pStyle, fontSize: 13.5 }}>Distance, drive time and highways from OpenStreetMap road data (OSRM).</p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>What changes the price</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {[
              short
                ? 'Hours. Short moves are priced by crew size and time, so packing ahead and having everything ready cuts the bill.'
                : 'Weight. Interstate movers price mostly by how much your belongings weigh and how far they go.',
              'Season. May to September is peak season and costs the most. October to April is usually cheaper.',
              'Timing. Weekdays and mid-month dates cost less than weekends and month-end. Booking 6 to 8 weeks ahead can save 10 to 20%.',
              'Extras. Packing, stairs, long carries from the truck, shuttle trucks and heavy items like pianos or safes add to the bill.',
            ].map((t) => {
              const [lead, ...rest] = t.split('. ');
              return (
                <li key={t} style={{ ...liStyle, display: 'flex', gap: 10 }}>
                  <CheckCircle size={18} color={ORANGE} style={{ flexShrink: 0, marginTop: 4 }} />
                  <span><strong style={{ color: NAVY }}>{lead}.</strong> {rest.join('. ')}</span>
                </li>
              );
            })}
          </ul>
          <p style={{ ...pStyle, fontSize: 13.5 }}>
            Season and booking figures from the <a href={SEASON_SOURCE.url} target="_blank" rel="noopener noreferrer" style={ext}>{SEASON_SOURCE.name}</a>.
          </p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>Moving to {to.name}: what to know</h2>
          <p style={pStyle}>{to.note}</p>
          {taxLine && <p style={pStyle}>{taxLine}</p>}
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>Leaving {from.name}</h2>
          <p style={pStyle}>{from.note}</p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>Before you book a mover</h2>
          <ol style={{ paddingLeft: 22, margin: 0 }}>
            <li style={liStyle}>{short ? `Check the mover’s ${stateName} license or registration where required, and ask for proof of insurance.` : 'Check the mover’s USDOT number on the FMCSA website. Interstate movers must have one.'}</li>
            <li style={liStyle}>Ask for an in-home or video survey, not a phone guess. Estimates based on a real look at your home are more accurate.</li>
            <li style={liStyle}>Ask for a binding or not-to-exceed estimate so the price can’t jump on delivery day.</li>
            {!short && <li style={liStyle}>Interstate movers must give you the FMCSA booklet “Your Rights and Responsibilities When You Move”. If they don’t, walk away.</li>}
            <li style={liStyle}>Never pay a large deposit in cash. A big upfront demand is a common sign of a moving scam.</li>
          </ol>
        </section>

        <section style={{ background: '#fff7ed', border: '1px solid rgba(249,115,22,0.18)', borderRadius: 18, padding: '32px 28px', textAlign: 'center', marginBottom: 44 }}>
          <h2 style={{ ...h2Style, marginBottom: 10 }}>Get a free quote for {from.name} to {to.name}</h2>
          <p style={{ ...pStyle, marginBottom: 20 }}>Takes about 60 seconds. We match your request with a licensed moving partner for this route, so you don’t get calls from a dozen companies.</p>
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

        {related.length > 0 && (
          <section style={{ marginBottom: 56 }}>
            <h2 style={h2Style}>Related moving routes</h2>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {related.map((l) => <li key={l.to} style={liStyle}><Link to={l.to} style={linkStyle}>Moving from {l.label}</Link></li>)}
              <li style={liStyle}><Link to={`/moving-from/${r.fromKey}`} style={linkStyle}>All moves from {from.name}</Link></li>
              <li style={liStyle}><Link to={`/moving-to/${r.toKey}`} style={linkStyle}>All moves to {to.name}</Link></li>
              <li style={liStyle}><Link to="/moving-cost-calculator" style={linkStyle}>Moving cost calculator</Link></li>
              <li style={liStyle}><Link to="/resources/moving-scams" style={linkStyle}>How to avoid moving scams</Link></li>
              <li style={liStyle}><Link to="/resources/moving-checklist" style={linkStyle}>Moving checklist</Link></li>
              <li style={liStyle}><Link to="/moving" style={linkStyle}>All moving routes</Link></li>
            </ul>
          </section>
        )}
      </main>
    </MarketingLayout>
  );
}
