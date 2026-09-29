import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';
import { ROUTE_PAGES, costRows, usd } from '../seo/routePages';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const MUTED = '#475569';
const BL = 'rgba(15,23,42,0.08)';

// Group routes by origin city for scanning.
function byOrigin() {
  const groups = {};
  for (const [slug, r] of Object.entries(ROUTE_PAGES)) {
    (groups[r.from.name] ||= []).push({ slug, ...r });
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

export default function RoutesIndex() {
  return (
    <MarketingLayout>
      <header style={{ background: `linear-gradient(135deg,#070e1b 0%,${NAVY} 100%)`, padding: '96px 0 56px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 20px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8, margin: '0 0 12px' }}>Moving routes</p>
          <h1 style={{ fontFamily: F, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.12, margin: '0 0 18px' }}>
            Long-distance moving costs by route
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', margin: '0 0 28px' }}>
            Distance, typical cost by home size and moving tips for popular US moving routes. Pick your route, or get a free quote for any move.
          </p>
          <Link to="/get-quote" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ORANGE, color: '#fff', padding: '14px 26px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
            Get my free moving quote <ArrowRight size={18} />
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '48px 20px 56px' }}>
        {byOrigin().map(([origin, routes]) => (
          <section key={origin} style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, color: NAVY, margin: '0 0 12px' }}>
              <Link to={`/moving-from/${routes[0].fromKey}`} style={{ color: NAVY, textDecoration: 'none' }}>Moving from {origin}</Link>
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, border: `1px solid ${BL}`, borderRadius: 12 }}>
              {routes.map((r, i) => {
                const two = costRows(r.miles).find((c) => c.size === '2 bedrooms');
                return (
                  <li key={r.slug} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '13px 16px', borderTop: i ? `1px solid ${BL}` : 'none' }}>
                    <Link to={`/moving/${r.slug}`} style={{ color: '#ea580c', fontWeight: 700, textDecoration: 'none' }}>
                      {r.from.name} to {r.to.name}, {r.to.state}
                    </Link>
                    <span style={{ fontSize: 14, color: MUTED }}>
                      {r.miles.toLocaleString('en-US')} mi · 2-bed {usd(two.low)}–{usd(two.high)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
    </MarketingLayout>
  );
}
