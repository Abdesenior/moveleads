import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';
import JsonLd from '../components/JsonLd';
import { SITE_URL } from '../seo/routes';
import { CITIES, CITY_HUB_SEO, usd } from '../seo/routePages';
import { STATES, statePairsFor, hubSlug, hasStateHub } from '../seo/statePages';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const MUTED = '#475569';
const BL = 'rgba(15,23,42,0.08)';
const h2Style = { fontFamily: F, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: NAVY, margin: '0 0 14px' };
const pStyle = { fontSize: 16.5, lineHeight: 1.75, color: MUTED, margin: '0 0 14px' };
const linkStyle = { color: '#ea580c', fontWeight: 700, textDecoration: 'none' };

// /moving-to/:state and /moving-from/:state (state slug, e.g. north-carolina).
export default function StateHub({ stateKey, dir }) {
  const st = STATES[stateKey];
  const pairs = statePairsFor(stateKey, dir);
  const slug = hubSlug(stateKey);
  const path = `/moving-${dir}/${slug}`;
  const into = dir === 'to';
  const city = CITIES[st.cities[0]];
  const quoteHref = into ? `/get-quote?to=${city.zip}` : `/get-quote?from=${city.zip}`;
  const heading = into ? `Moving to ${st.name}` : `Moving out of ${st.name}`;
  const cheapest = [...pairs].sort((a, b) => a.miles - b.miles)[0];
  const farthest = [...pairs].sort((a, b) => b.miles - a.miles)[0];
  const cheapTwo = cheapest.rows.find((c) => c.size === '2 bedrooms');
  const farTwo = farthest.rows.find((c) => c.size === '2 bedrooms');
  const other = into ? 'from' : 'to';
  const otherHub = hasStateHub(slug, other) ? `/moving-${other}/${slug}` : null;
  const cityHubs = st.cities.filter((k) => CITY_HUB_SEO[`/moving-${dir}/${k}`]);

  const faq = [
    [`How much does it cost to move ${into ? 'to' : 'out of'} ${st.name}?`,
      `It depends mostly on distance and home size. For a 2-bedroom home, a move ${into ? `from ${cheapest.from.name}` : `to ${cheapest.to.name}`} costs about ${usd(cheapTwo.low)}–${usd(cheapTwo.high)}, while a move ${into ? `from ${farthest.from.name}` : `to ${farthest.to.name}`} costs about ${usd(farTwo.low)}–${usd(farTwo.high)}. These are estimates from 2026 industry data; your quote depends on weight, date and services.`],
    [`What should I know before moving ${into ? 'to' : 'out of'} ${st.name}?`, st.note],
    [`Does ${st.name} have a state income tax?`,
      st.tax ? `${st.name} has no state income tax on wages.` : `Yes. ${st.name} taxes wages. Check the state revenue department for current rates before you compare salaries.`],
    ['Do I need an interstate mover?',
      'Yes, for any move that crosses a state line. The mover must be registered with the FMCSA and have a USDOT number, which you can check on the FMCSA website.'],
  ];

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'State to state moving', path: '/moving/state-to-state' },
    { name: heading, path },
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
        itemListElement: crumbs.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, item: `${SITE_URL}${x.path}` })),
      }} />
      <header style={{ background: `linear-gradient(135deg,#070e1b 0%,${NAVY} 100%)`, padding: '96px 0 56px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 20px' }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, marginBottom: 18 }}>
            {crumbs.map((x, i) => (
              <span key={x.path} style={{ color: 'rgba(255,255,255,0.55)' }}>
                {i > 0 && ' / '}
                {i < crumbs.length - 1
                  ? <Link to={x.path} style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>{x.name}</Link>
                  : <span style={{ color: '#fff' }}>{x.name}</span>}
              </span>
            ))}
          </nav>
          <h1 style={{ fontFamily: F, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.12, margin: '0 0 18px' }}>
            {heading}: costs, tips and free quotes
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', margin: '0 0 28px' }}>
            Typical moving costs {into ? `to ${st.name} from` : `from ${st.name} to`} {pairs.length} states, plus what to know about {st.name}. Get a free quote for your move.
          </p>
          <Link to={quoteHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ORANGE, color: '#fff', padding: '14px 26px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
            Get my free moving quote <ArrowRight size={18} />
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '56px 20px 56px' }}>
        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>{into ? `Cost to move to ${st.name} by state` : `Cost to move out of ${st.name} by state`}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, border: `1px solid ${BL}`, borderRadius: 12 }}>
            {pairs.map((p, i) => {
              const two = p.rows.find((x) => x.size === '2 bedrooms');
              return (
                <li key={p.slug} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '13px 16px', borderTop: i ? `1px solid ${BL}` : 'none' }}>
                  <Link to={`/moving/${p.slug}`} style={linkStyle}>{p.from.name} to {p.to.name}</Link>
                  <span style={{ fontSize: 14, color: MUTED }}>about {p.miles.toLocaleString('en-US')} mi · 2-bed {usd(two.low)}–{usd(two.high)}</span>
                </li>
              );
            })}
          </ul>
          <p style={{ ...pStyle, fontSize: 13.5, marginTop: 10 }}>Costs are estimates from published 2026 industry data for the typical distance between each state’s main cities. Each page shows costs by city and its source.</p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>What to know about {st.name}</h2>
          <p style={pStyle}>{st.note}</p>
          <p style={pStyle}>{st.tax ? `${st.name} has no state income tax on wages.` : `${st.name} has a state income tax on wages.`}</p>
          {cityHubs.length > 0 && (
            <p style={pStyle}>
              {into ? 'Moving to a city in ' : 'Moving from a city in '}{st.name}?{' '}
              {cityHubs.map((k, i) => (
                <span key={k}>{i > 0 && ' · '}<Link to={`/moving-${dir}/${k}`} style={linkStyle}>{CITIES[k].name}</Link></span>
              ))}
            </p>
          )}
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

        <section>
          <p style={pStyle}>
            {otherHub && <><Link to={otherHub} style={linkStyle}>{into ? `Moving out of ${st.name}` : `Moving to ${st.name}`}</Link> · </>}
            <Link to="/moving/state-to-state" style={linkStyle}>State to state moving costs</Link>
            {' · '}<Link to="/resources/moving-out-of-state-checklist" style={linkStyle}>Moving out of state checklist</Link>
          </p>
        </section>
      </main>
    </MarketingLayout>
  );
}
