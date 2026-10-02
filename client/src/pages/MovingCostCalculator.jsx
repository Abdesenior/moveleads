import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';
import JsonLd from '../components/JsonLd';
import {
  CITIES, COST_SOURCE, HOURLY_SOURCE, SEASON_SOURCE, costRows, shortCostRows, costMatrix, estimateMiles, routeSlug, ROUTE_PAGES, usd, cityLabel,
} from '../seo/routePages';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const MUTED = '#475569';
const BL = 'rgba(15,23,42,0.08)';
const h2Style = { fontFamily: F, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: NAVY, margin: '0 0 14px' };
const pStyle = { fontSize: 16.5, lineHeight: 1.75, color: MUTED, margin: '0 0 14px' };
const ext = { color: '#ea580c', fontWeight: 600, textDecoration: 'none' };
const field = { width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${BL}`, fontSize: 16, background: '#fff', color: NAVY };
const label = { display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 };

const SIZES = ['Studio', '1 bedroom', '2 bedrooms', '3 bedrooms', '4+ bedrooms'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CITY_OPTIONS = Object.entries(CITIES).sort(([, a], [, b]) => a.name.localeCompare(b.name));

const FAQ = [
  ['How much does a long-distance move cost?', 'For full-service movers in 2026, a 2-bedroom home typically costs about $3,200 to $6,500 for 250 to 1,000 miles and about $3,900 to $10,900 for 1,500 to 2,500 miles. Larger homes and longer distances cost more.'],
  ['How accurate is this calculator?', 'It gives a typical range from published industry data, not a quote. Your real price depends on the weight of your belongings, access at both homes, your date and extra services. A mover’s in-home or video survey gives the most accurate price.'],
  ['What is the cheapest month to move?', 'October to April is usually cheaper than peak season, which runs from May to September. Weekdays and mid-month dates also tend to cost less.'],
  ['Does this include packing?', 'The ranges are for full-service moves. Packing materials, packing labor, storage and heavy items like pianos can add to the price.'],
];

export default function MovingCostCalculator() {
  const [from, setFrom] = useState('chicago');
  const [to, setTo] = useState('dallas');
  const [size, setSize] = useState('2 bedrooms');
  const [month, setMonth] = useState(9);

  const same = from === to;
  const est = same ? null : estimateMiles(from, to);
  const sameState = CITIES[from].state === CITIES[to].state;
  const shortMove = est && est.miles < 250 && est.miles >= 50 && sameState && est.hours != null;
  const tooShort = est && est.miles < 250 && !shortMove;
  const rows = !est || tooShort ? null : shortMove ? shortCostRows(est.hours) : costRows(est.miles);
  const range = rows ? rows.find((r) => r.size === size) : null;
  const peak = month >= 4 && month <= 8;
  const routePage = ROUTE_PAGES[routeSlug(from, to)] ? `/moving/${routeSlug(from, to)}` : null;
  const quoteHref = `/get-quote?from=${CITIES[from].zip}&to=${CITIES[to].zip}`;
  const matrix = costMatrix();

  return (
    <MarketingLayout>
      <JsonLd schema={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      }} />
      <JsonLd schema={{
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Moving Cost Calculator',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      }} />

      <header style={{ background: `linear-gradient(135deg,#070e1b 0%,${NAVY} 100%)`, padding: '96px 0 48px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 20px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8, margin: '0 0 12px' }}>Free tool</p>
          <h1 style={{ fontFamily: F, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.12, margin: '0 0 18px' }}>
            Moving cost calculator: estimate your long-distance move
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', margin: 0 }}>
            Pick where you’re moving from and to, and your home size. You get a typical full-service price range based on 2026 industry data, then a free quote from a licensed moving partner.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 20px 24px' }}>
        <section style={{ background: '#fff', border: `1px solid ${BL}`, borderRadius: 18, padding: 24, marginBottom: 44, boxShadow: '0 8px 30px rgba(15,23,42,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div>
              <label htmlFor="calc-from" style={label}>Moving from</label>
              <select id="calc-from" value={from} onChange={(e) => setFrom(e.target.value)} style={field}>
                {CITY_OPTIONS.map(([k, c]) => <option key={k} value={k}>{cityLabel(c)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="calc-to" style={label}>Moving to</label>
              <select id="calc-to" value={to} onChange={(e) => setTo(e.target.value)} style={field}>
                {CITY_OPTIONS.map(([k, c]) => <option key={k} value={k}>{cityLabel(c)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="calc-size" style={label}>Home size</label>
              <select id="calc-size" value={size} onChange={(e) => setSize(e.target.value)} style={field}>
                {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="calc-month" style={label}>Move month</label>
              <select id="calc-month" value={month} onChange={(e) => setMonth(Number(e.target.value))} style={field}>
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            </div>
          </div>

          <div aria-live="polite" style={{ background: '#fff7ed', border: '1px solid rgba(249,115,22,0.18)', borderRadius: 14, padding: 20 }}>
            {same && <p style={{ ...pStyle, margin: 0 }}>Choose two different cities.</p>}
            {tooShort && (
              <p style={{ ...pStyle, margin: 0 }}>
                {sameState
                  ? `This is about ${est.miles} miles, a local move usually priced by the hour. Get a free quote for an exact price.`
                  : `This is about ${est.miles} miles. Short moves across a state line are priced case by case, so get a free quote for an exact price.`}
              </p>
            )}
            {range && (
              <>
                <p style={{ fontSize: 14, color: MUTED, margin: '0 0 6px' }}>
                  {cityLabel(CITIES[from])} → {cityLabel(CITIES[to])} · {est.exact ? 'about' : 'roughly'} {est.miles.toLocaleString('en-US')} miles · {size}
                </p>
                <p style={{ fontFamily: F, fontSize: 'clamp(26px, 7vw, 36px)', fontWeight: 800, color: NAVY, margin: '0 0 6px', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                  {usd(range.low)} – {usd(range.high)}
                </p>
                {shortMove && (
                  <p style={{ ...pStyle, fontSize: 15, margin: '0 0 6px' }}>
                    Short in-state move: priced by crew hours plus the {est.hours}-hour drive, using the <a href={HOURLY_SOURCE.url} target="_blank" rel="noopener noreferrer" style={ext}>{HOURLY_SOURCE.name}</a>.
                  </p>
                )}
                <p style={{ ...pStyle, fontSize: 15, margin: 0 }}>
                  {peak
                    ? `${MONTHS[month]} is peak season (May to September). Expect prices toward the top of the range, and book early.`
                    : `${MONTHS[month]} is outside peak season, so prices toward the lower half of the range are more likely.`}
                </p>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginTop: 20 }}>
            <Link to={quoteHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ORANGE, color: '#fff', padding: '14px 26px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
              Get my exact free quote <ArrowRight size={18} />
            </Link>
            {routePage && <Link to={routePage} style={ext}>{CITIES[from].name} to {CITIES[to].name} moving guide →</Link>}
          </div>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>Average long-distance moving cost by home size and distance</h2>
          <p style={pStyle}>The calculator uses this table. Figures are typical full-service prices, rounded to the nearest $100.</p>
          <div style={{ overflowX: 'auto', border: `1px solid ${BL}`, borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px 14px', color: NAVY }}>Home size</th>
                  {matrix.bands.map((b) => <th key={b} style={{ textAlign: 'left', padding: '12px 14px', color: NAVY }}>{b}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r) => (
                  <tr key={r.size}>
                    <td style={{ padding: '10px 14px', color: NAVY, fontWeight: 600, borderTop: `1px solid ${BL}` }}>{r.size}</td>
                    {r.cells.map((c, i) => <td key={i} style={{ padding: '10px 14px', color: MUTED, borderTop: `1px solid ${BL}`, whiteSpace: 'nowrap' }}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ ...pStyle, fontSize: 13.5, marginTop: 10 }}>
            Based on <a href={COST_SOURCE.url} target="_blank" rel="noopener noreferrer" style={ext}>{COST_SOURCE.name}</a>; some cells interpolated from neighbouring figures.
            Season guidance from the <a href={SEASON_SOURCE.url} target="_blank" rel="noopener noreferrer" style={ext}>{SEASON_SOURCE.name}</a>.
            Distances between cities without a route guide are estimated from straight-line distance. These are not MoveLeads quotes.
          </p>
        </section>

        <section style={{ marginBottom: 56 }}>
          <h2 style={h2Style}>Frequently asked questions</h2>
          {FAQ.map(([q, a]) => (
            <div key={q} style={{ borderTop: `1px solid ${BL}`, padding: '18px 0' }}>
              <h3 style={{ fontFamily: F, fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>{q}</h3>
              <p style={{ ...pStyle, margin: 0 }}>{a}</p>
            </div>
          ))}
          <p style={pStyle}><Link to="/moving" style={ext}>Browse moving costs by route →</Link></p>
        </section>
      </main>
    </MarketingLayout>
  );
}
