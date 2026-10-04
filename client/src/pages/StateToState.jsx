import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';
import JsonLd from '../components/JsonLd';
import { SITE_URL } from '../seo/routes';
import { COST_SOURCE, usd } from '../seo/routePages';
import { STATES, STATE_PAGES, DISTANCE_EXAMPLES, hubSlug, hasStateHub } from '../seo/statePages';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const MUTED = '#475569';
const BL = 'rgba(15,23,42,0.08)';
const h2Style = { fontFamily: F, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: NAVY, margin: '0 0 14px' };
const pStyle = { fontSize: 16.5, lineHeight: 1.75, color: MUTED, margin: '0 0 14px' };
const liStyle = { fontSize: 16, lineHeight: 1.7, color: MUTED, marginBottom: 8 };
const linkStyle = { color: '#ea580c', fontWeight: 700, textDecoration: 'none' };
const th = { textAlign: 'left', padding: '12px 16px', color: NAVY, borderBottom: `1px solid ${BL}` };
const td = (i) => ({ padding: '11px 16px', color: MUTED, borderTop: i ? `1px solid ${BL}` : 'none' });

const pick = (rows, size) => rows.find((c) => c.size === size);

// Group state pages by origin state for scanning.
function byOrigin() {
  const g = {};
  for (const p of Object.values(STATE_PAGES)) (g[p.fromKey] ||= []).push(p);
  return Object.entries(g).sort(([a], [b]) => STATES[a].name.localeCompare(STATES[b].name));
}

export default function StateToState() {
  const faq = [
    ['How much does it cost to move to another state?',
      `For full-service movers, a 2-bedroom move costs about ${usd(pick(DISTANCE_EXAMPLES[0].rows, '2 bedrooms').low)}–${usd(pick(DISTANCE_EXAMPLES[0].rows, '2 bedrooms').high)} for about 300 miles and about ${usd(pick(DISTANCE_EXAMPLES[5].rows, '2 bedrooms').low)}–${usd(pick(DISTANCE_EXAMPLES[5].rows, '2 bedrooms').high)} coast to coast. The weight of your belongings, the distance, the date and extra services set the final price.`],
    ['How do state to state movers charge?',
      'Interstate movers price mostly by the weight of your belongings and the distance, plus extras like packing, stairs and shuttle trucks. Federal rules require a written estimate, and you can ask for a binding or not-to-exceed estimate so the price cannot jump at delivery.'],
    ['What is the cheapest way to move to another state?',
      'Renting a truck and doing the work yourself is usually cheapest, then a moving container, then full-service movers. Moving fewer things, moving between October and April, and booking 6 to 8 weeks ahead lower the cost of any option.'],
    ['How do I find a moving company that moves you out of state?',
      'Look for a mover registered with the Federal Motor Carrier Safety Administration (FMCSA) with a USDOT number, check its complaint history on the FMCSA website, and compare at least three written estimates based on an in-home or video survey.'],
    ['How far in advance should I book an interstate mover?',
      'About 6 to 8 weeks ahead, and earlier for a move between May and September, when movers book up fastest.'],
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
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'State to state moving', item: `${SITE_URL}/moving/state-to-state` },
        ],
      }} />
      <header style={{ background: `linear-gradient(135deg,#070e1b 0%,${NAVY} 100%)`, padding: '96px 0 56px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 20px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8, margin: '0 0 12px' }}>State to state moving</p>
          <h1 style={{ fontFamily: F, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.12, margin: '0 0 18px' }}>
            State to state movers: what moving to another state costs in 2026
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', margin: '0 0 28px' }}>
            Typical interstate moving costs by distance and home size, how state to state movers charge, the cheapest options,
            and cost pages for {Object.keys(STATE_PAGES).length} popular state-to-state moves. Get a free quote for yours.
          </p>
          <Link to="/get-quote" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ORANGE, color: '#fff', padding: '14px 26px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
            Get my free moving quote <ArrowRight size={18} />
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '56px 20px 56px' }}>
        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>Cost of moving to another state by distance</h2>
          <p style={pStyle}>Estimated full-service prices by driving distance:</p>
          <div style={{ overflowX: 'auto', margin: '6px 0 12px', border: `1px solid ${BL}`, borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
              <thead><tr><th style={th}>Distance</th><th style={th}>Studio</th><th style={th}>2 bedrooms</th><th style={th}>4+ bedrooms</th></tr></thead>
              <tbody>
                {DISTANCE_EXAMPLES.map((d, i) => (
                  <tr key={d.miles}>
                    <td style={{ ...td(i), color: NAVY, fontWeight: 600 }}>{d.miles.toLocaleString('en-US')} miles</td>
                    {['Studio', '2 bedrooms', '4+ bedrooms'].map((s) => (
                      <td key={s} style={td(i)}>{usd(pick(d.rows, s).low)} – {usd(pick(d.rows, s).high)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ ...pStyle, fontSize: 13.5 }}>
            Estimates based on <a href={COST_SOURCE.url} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontWeight: 600 }}>{COST_SOURCE.name}</a>, interpolated by distance.
            Not MoveLeads quotes. For your exact cities, try the <Link to="/moving-cost-calculator" style={linkStyle}>moving cost calculator</Link>.
          </p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>How state to state moving works</h2>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li style={liStyle}><strong style={{ color: NAVY }}>The mover must be federally registered.</strong> Any move across a state line needs a mover registered with the FMCSA, with a USDOT number you can look up.</li>
            <li style={liStyle}><strong style={{ color: NAVY }}>Price is set by weight and distance.</strong> Interstate moves are priced mostly by how much your belongings weigh, not by the hour.</li>
            <li style={liStyle}><strong style={{ color: NAVY }}>You get a written estimate.</strong> A binding estimate fixes the price; a non-binding one can rise up to 110% at delivery. <Link to="/resources/binding-vs-non-binding-moving-estimate" style={linkStyle}>Binding vs non-binding estimates</Link>.</li>
            <li style={liStyle}><strong style={{ color: NAVY }}>Delivery comes in a window.</strong> Movers give a delivery window in writing, often several days to two weeks on long routes.</li>
          </ul>
          <p style={{ ...pStyle, marginTop: 14 }}>
            Guides: <Link to="/resources/how-to-choose-a-long-distance-moving-company" style={linkStyle}>how to choose a long-distance mover</Link>
            {' · '}<Link to="/resources/cheapest-way-to-move-out-of-state" style={linkStyle}>cheapest way to move out of state</Link>
            {' · '}<Link to="/resources/moving-out-of-state-checklist" style={linkStyle}>moving out of state checklist</Link>
          </p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>Moving to a new state</h2>
          <p style={pStyle}>
            {Object.keys(STATES).filter((k) => hasStateHub(hubSlug(k), 'to')).map((k, i) => (
              <span key={k}>{i > 0 && ' · '}<Link to={`/moving-to/${hubSlug(k)}`} style={linkStyle}>{STATES[k].name}</Link></span>
            ))}
          </p>
        </section>

        <h2 style={h2Style}>Popular state to state moves</h2>
        {byOrigin().map(([key, pages]) => (
          <section key={key} style={{ marginBottom: 32 }}>
            <h3 style={{ fontFamily: F, fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 12px' }}>
              {hasStateHub(hubSlug(key), 'from')
                ? <Link to={`/moving-from/${hubSlug(key)}`} style={{ color: NAVY, textDecoration: 'none' }}>Moving from {STATES[key].name}</Link>
                : `Moving from ${STATES[key].name}`}
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, border: `1px solid ${BL}`, borderRadius: 12 }}>
              {pages.sort((a, b) => a.miles - b.miles).map((p, i) => {
                const two = pick(p.rows, '2 bedrooms');
                return (
                  <li key={p.slug} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '13px 16px', borderTop: i ? `1px solid ${BL}` : 'none' }}>
                    <Link to={`/moving/${p.slug}`} style={linkStyle}>{p.from.name} to {p.to.name}</Link>
                    <span style={{ fontSize: 14, color: MUTED }}>about {p.miles.toLocaleString('en-US')} mi · 2-bed {usd(two.low)}–{usd(two.high)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section style={{ margin: '44px 0' }}>
          <h2 style={h2Style}>Frequently asked questions</h2>
          {faq.map(([q, a]) => (
            <div key={q} style={{ borderTop: `1px solid ${BL}`, padding: '18px 0' }}>
              <h3 style={{ fontFamily: F, fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>{q}</h3>
              <p style={{ ...pStyle, margin: 0 }}>{a}</p>
            </div>
          ))}
        </section>

        <p style={pStyle}><Link to="/moving" style={linkStyle}>Moving costs between cities</Link></p>
      </main>
    </MarketingLayout>
  );
}
