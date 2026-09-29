import { useLocation } from 'react-router-dom';
import { getSeo, SITE_NAME } from '../seo/routes';

// Renders per-route <title>, meta and canonical tags. React 19 hoists these
// into <head>, and scripts/prerender.mjs captures them into static HTML.
export default function RouteSeo() {
  const { pathname } = useLocation();
  const seo = getSeo(pathname);

  return (
    <>
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      <meta name="robots" content={seo.robots} />
      {seo.canonical && <link rel="canonical" href={seo.canonical} />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={seo.title} />
      <meta property="og:description" content={seo.description} />
      {seo.canonical && <meta property="og:url" content={seo.canonical} />}
      <meta property="og:image" content={seo.image} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={seo.title} />
      <meta name="twitter:description" content={seo.description} />
      <meta name="twitter:image" content={seo.image} />
    </>
  );
}
