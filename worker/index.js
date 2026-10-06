// Edge router for moveleads.cloud. Runs before static assets so that:
//  - http, www, trailing-slash and .html variants 301 to one canonical URL
//  - legacy /move/:from/:to links 301 to the matching /moving/ route page
//  - known app routes (login, dashboard...) get the SPA shell with 200
//  - every other unknown path gets the SPA shell with a real 404 status,
//    instead of a copy of the home page (which Search Console reported as
//    soft 404s and "alternate page with proper canonical tag")

const CANONICAL_HOST = 'moveleads.cloud';

// Client-side-only routes: served the SPA shell with 200 (they are noindex).
const APP_PATHS = [
  '/login', '/register', '/forgot-password', '/reset-password',
  '/verify-email', '/verify-email-pending', '/thank-you', '/feedback',
  '/dashboard', '/admin', '/dev', '/embed/widget',
];

const isAppPath = (p) => APP_PATHS.some((a) => p === a || p.startsWith(`${a}/`));

async function canonicalRedirect(url, env) {
  const target = new URL(url);
  let changed = false;

  if (target.protocol === 'http:') { target.protocol = 'https:'; changed = true; }
  if (target.hostname === `www.${CANONICAL_HOST}`) { target.hostname = CANONICAL_HOST; changed = true; }
  if (target.pathname.length > 1 && target.pathname.endsWith('/')) {
    target.pathname = target.pathname.replace(/\/+$/, '') || '/';
    changed = true;
  }
  if (target.pathname.endsWith('.html')) {
    target.pathname = target.pathname === '/index.html' ? '/' : target.pathname.slice(0, -5);
    changed = true;
  }
  if (target.pathname === '/get-quote-v6') { target.pathname = '/get-quote'; changed = true; }

  const legacy = target.pathname.match(/^\/move\/([^/]+)\/([^/]+)$/);
  if (legacy) {
    const slug = `${legacy[1]}-to-${legacy[2]}`.toLowerCase();
    const probe = await env.ASSETS.fetch(new Request(`https://${CANONICAL_HOST}/moving/${slug}`));
    target.pathname = probe.ok ? `/moving/${slug}` : '/moving';
    target.search = '';
    changed = true;
  }

  return changed ? Response.redirect(target.toString(), 301) : null;
}

async function shell(url, env, status) {
  const res = await env.ASSETS.fetch(new Request(`${url.origin}/_app`));
  return new Response(res.body, { status, headers: res.headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const redirect = await canonicalRedirect(url, env);
    if (redirect) return redirect;

    // The raw shell is internal; never serve it at its own URL.
    if (url.pathname === '/_app') return shell(url, env, 404);

    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return res;

    return shell(url, env, isAppPath(url.pathname) ? 200 : 404);
  },

  // Cron (wrangler.jsonc): ping the Render API so it doesn't fall asleep
  // after 15 idle minutes; a cold start makes the quote form wait ~30s.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetch('https://api.moveleads.cloud/api/health').catch(() => {}));
  },
};
