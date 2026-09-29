import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';
import JsonLd from '../components/JsonLd';
import NotFound from './NotFound';
import { B2B_PAGES } from '../seo/b2bPages';
import { SITE_URL } from '../seo/routes';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const NAVY = '#0b1628';
const ORANGE = '#f97316';
const MUTED = '#475569';
const BL = 'rgba(15,23,42,0.08)';

const h2Style = { fontFamily: F, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: NAVY, margin: '0 0 14px' };
const pStyle = { fontSize: 16.5, lineHeight: 1.75, color: MUTED, margin: '0 0 14px' };
const liStyle = { fontSize: 16, lineHeight: 1.7, color: MUTED, marginBottom: 8 };
const linkStyle = { color: '#ea580c', fontWeight: 700, textDecoration: 'none' };

function Table({ table }) {
  return (
    <div style={{ overflowX: 'auto', margin: '6px 0 14px', border: `1px solid ${BL}`, borderRadius: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
        {table.caption && (
          <caption style={{ textAlign: 'left', padding: '12px 16px 0', fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>{table.caption}</caption>
        )}
        <thead>
          <tr>
            {table.head.map((h, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '12px 16px', color: NAVY, fontWeight: 700, borderBottom: `1px solid ${BL}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} style={{ padding: '11px 16px', color: c === 0 ? NAVY : MUTED, fontWeight: c === 0 ? 600 : 400, borderTop: r ? `1px solid ${BL}` : 'none' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.note && <p style={{ ...pStyle, fontSize: 14, padding: '0 16px 12px', margin: 0 }}>{table.note}</p>}
    </div>
  );
}

function Section({ s }) {
  return (
    <section style={{ marginBottom: 44 }}>
      <h2 style={h2Style}>{s.h2}</h2>
      {s.text && <p style={pStyle}>{s.text}</p>}
      {s.table && <Table table={s.table} />}
      {s.bullets && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
          {s.bullets.map((b, i) => (
            <li key={i} style={{ ...liStyle, display: 'flex', gap: 10 }}>
              <CheckCircle size={18} color={ORANGE} style={{ flexShrink: 0, marginTop: 4 }} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {s.steps && (
        <ol style={{ paddingLeft: 22, margin: '0 0 14px' }}>
          {s.steps.map((b, i) => <li key={i} style={liStyle}>{b}</li>)}
        </ol>
      )}
      {s.numbered && (
        <ol style={{ paddingLeft: 22, margin: '0 0 14px' }}>
          {s.numbered.map((b, i) => {
            const [lead, ...rest] = b.split('. ');
            return <li key={i} style={liStyle}><strong style={{ color: NAVY }}>{lead}.</strong> {rest.join('. ')}</li>;
          })}
        </ol>
      )}
      {s.links && (
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          {s.links.map((l) => <li key={l.to} style={liStyle}><Link to={l.to} style={linkStyle}>{l.label}</Link></li>)}
        </ul>
      )}
      {s.link && <p style={pStyle}><Link to={s.link.to} style={linkStyle}>{s.link.label} →</Link></p>}
      {s.sources && (
        <p style={{ ...pStyle, fontSize: 13.5 }}>
          Sources: {s.sources.map((src, i) => (
            <span key={src.url}>{i > 0 && ' · '}<a href={src.url} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontWeight: 600 }}>{src.label}</a></span>
          ))}
        </p>
      )}
    </section>
  );
}

export default function SeoLanding() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '');
  const page = B2B_PAGES[path];
  if (!page) return <NotFound />;

  const parent = page.parent && B2B_PAGES[page.parent];
  const crumbs = [{ name: 'Home', path: '/' }];
  if (parent) crumbs.push({ name: parent.breadcrumb, path: page.parent });
  crumbs.push({ name: page.breadcrumb, path });

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE_URL}${c.path}` })),
  };

  return (
    <MarketingLayout>
      <JsonLd schema={faqSchema} />
      <JsonLd schema={breadcrumbSchema} />

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
          <p style={{ fontSize: 12, fontWeight: 700, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.8, margin: '0 0 12px' }}>{page.eyebrow}</p>
          <h1 style={{ fontFamily: F, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.12, margin: '0 0 18px' }}>{page.h1}</h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', margin: '0 0 28px' }}>{page.answer}</p>
          <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ORANGE, color: '#fff', padding: '14px 26px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
            Create a free mover account <ArrowRight size={18} />
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '56px 20px 24px' }}>
        {page.sections.map((s) => <Section key={s.h2} s={s} />)}

        <section style={{ marginBottom: 44 }}>
          <h2 style={h2Style}>Frequently asked questions</h2>
          {page.faq.map(([q, a]) => (
            <div key={q} style={{ borderTop: `1px solid ${BL}`, padding: '18px 0' }}>
              <h3 style={{ fontFamily: F, fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>{q}</h3>
              <p style={{ ...pStyle, margin: 0 }}>{a}</p>
            </div>
          ))}
        </section>

        <section style={{ background: '#fff7ed', border: '1px solid rgba(249,115,22,0.18)', borderRadius: 18, padding: '32px 28px', textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ ...h2Style, marginBottom: 10 }}>Start getting moving leads</h2>
          <p style={{ ...pStyle, marginBottom: 20 }}>Free to join. No subscription, no contract. Pay only for the leads you claim.</p>
          <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ORANGE, color: '#fff', padding: '14px 26px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
            Create a free mover account <ArrowRight size={18} />
          </Link>
          <p style={{ fontSize: 14, color: MUTED, margin: '16px 0 0' }}>
            <Link to="/pricing" style={linkStyle}>See pricing</Link> · <Link to="/for-movers" style={linkStyle}>How it works</Link>
          </p>
        </section>
      </main>
    </MarketingLayout>
  );
}
