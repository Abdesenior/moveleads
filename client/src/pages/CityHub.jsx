import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';
import JsonLd from '../components/JsonLd';
import NotFound from './NotFound';
import { SITE_URL } from '../seo/routes';
import { CITIES, cityRoutes, routeCostRows, usd, cityLabel } from '../seo/routePages';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const MUTED = '#475569';
const BL = 'rgba(15,23,42,0.08)';
const h2Style = { fontFamily: F, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: NAVY, margin: '0 0 14px' };
const pStyle = { fontSize: 16.5, lineHeight: 1.75, color: MUTED, margin: '0 0 14px' };

export default function CityHub() {
  const { city } = useParams();
  const { pathname } = useLocation();
  const dir = pathname.startsWith('/moving-from/') ? 'from' : 'to';
  const c = CITIES[city];
  const routes = c ? cityRoutes(city, dir) : [];
  if (!c || routes.length === 0) return <NotFound />;

  const heading = dir === 'from' ? `Moving from ${c.name}` : `Moving to ${c.name}`;
  const quoteHref = dir === 'from' ? `/get-quote?from=${c.zip}` : `/get-quote?to=${c.zip}`;
  const other = dir === 'from' ? `/moving-to/${city}` : `/moving-from/${city}`;
  const hasOther = cityRoutes(city, dir === 'from' ? 'to' : 'from').length > 0;
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Moving routes', path: '/moving' },
    { name: heading, path: pathname.replace(/\/+$/, '') },
  ];

  return (
    <MarketingLayout>
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
            {heading}, {c.state}: costs and free quotes
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', margin: '0 0 28px' }}>
            Typical long-distance moving costs {dir === 'from' ? `from ${cityLabel(c)} to` : `to ${cityLabel(c)} from`} {routes.length} popular {routes.length === 1 ? 'city' : 'cities'}, plus what to know about {c.name}. Get a free quote for your move.
          </p>
          <Link to={quoteHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ORANGE, color: '#fff', padding: '14px 26px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
            Get my free moving quote <ArrowRight size={18} />
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '56px 20px 56px' }}>
        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>{dir === 'from' ? `Popular moves from ${c.name}` : `Popular moves to ${c.name}`}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, border: `1px solid ${BL}`, borderRadius: 12 }}>
            {routes.map((r, i) => {
              const two = routeCostRows(r).find((x) => x.size === '2 bedrooms');
              const other = dir === 'from' ? r.to : r.from;
              return (
                <li key={r.slug} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '13px 16px', borderTop: i ? `1px solid ${BL}` : 'none' }}>
                  <Link to={`/moving/${r.slug}`} style={{ color: '#ea580c', fontWeight: 700, textDecoration: 'none' }}>
                    {r.from.name} to {r.to.name}
                  </Link>
                  <span style={{ fontSize: 14, color: MUTED }}>
                    {cityLabel(other)} · {r.miles.toLocaleString('en-US')} mi · 2-bed {usd(two.low)}–{usd(two.high)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p style={{ ...pStyle, fontSize: 13.5, marginTop: 10 }}>Costs are estimates from published 2026 industry data. Each route page shows its source.</p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>What to know about {c.name}</h2>
          <p style={pStyle}>{c.note}</p>
        </section>

        <section>
          <p style={pStyle}>
            {hasOther && <><Link to={other} style={{ color: '#ea580c', fontWeight: 700, textDecoration: 'none' }}>{dir === 'from' ? `Moving to ${c.name}` : `Moving from ${c.name}`}</Link> · </>}
            <Link to="/moving" style={{ color: '#ea580c', fontWeight: 700, textDecoration: 'none' }}>All moving routes</Link>
          </p>
        </section>
      </main>
    </MarketingLayout>
  );
}
