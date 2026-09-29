// Pre-renders public pages to static HTML after `vite build`, so search
// engines and AI crawlers get real content, titles and canonicals instead of
// an empty SPA shell. Also writes dist/sitemap.xml from the same route list.
//
// Usage: node scripts/prerender.mjs   (run from client/, after vite build)

import http from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { INDEXABLE_ROUTES, SITE_URL } from '../src/seo/routes.js';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const API_HOST = 'api.moveleads.cloud';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain',
  '.xml': 'application/xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

async function startServer(shell) {
  const server = http.createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(DIST, urlPath);
    try {
      if (file.startsWith(DIST) && (await stat(file)).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        return res.end(await readFile(file));
      }
    } catch { /* fall through to the SPA shell */ }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(shell);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function renderRoute(browser, origin, route) {
  const page = await browser.newPage();
  // Only our own assets, fonts (a failed CSS @import breaks lazy-route CSS)
  // and read-only API calls; no analytics, pixels or maps.
  await page.route('**/*', (r) => {
    const url = new URL(r.request().url());
    const ours = url.origin === origin;
    const fonts = FONT_HOSTS.includes(url.hostname);
    const api = url.hostname === API_HOST && r.request().method() === 'GET';
    return ours || fonts || api ? r.continue() : r.abort();
  });

  await page.goto(`${origin}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => {
    const root = document.getElementById('root');
    return root?.firstElementChild && !root.querySelector('[data-loading-screen]') && document.title;
  }, null, { timeout: 30000 });

  const html = await page.evaluate((routePath) => {
    // Drop anything injected at runtime that must not ship in static HTML.
    document.querySelectorAll('script[src]').forEach((s) => {
      const src = s.getAttribute('src');
      if (!src.startsWith('/assets/') && !src.includes('googletagmanager.com')) s.remove();
    });
    document.querySelectorAll('iframe').forEach((f) => f.remove());

    // If Cloudflare serves this file for a different path (SPA fallback),
    // clear the static content before paint so the wrong page never shows.
    const guard = document.createElement('script');
    const want = routePath === '/' ? '' : routePath;
    guard.textContent =
      `if(location.pathname.replace(/\\/+$/,'')!==${JSON.stringify(want)})` +
      `document.getElementById('root').replaceChildren()`;
    document.getElementById('root').after(guard);

    return '<!doctype html>\n' + document.documentElement.outerHTML;
  }, route);

  await page.close();
  return html;
}

function buildSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = Object.entries(INDEXABLE_ROUTES).map(([route, meta]) => [
    '  <url>',
    `    <loc>${SITE_URL}${route}</loc>`,
    `    <lastmod>${today}</lastmod>`,
    `    <changefreq>${meta.changefreq}</changefreq>`,
    `    <priority>${meta.priority.toFixed(1)}</priority>`,
    '  </url>',
  ].join('\n'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

async function main() {
  const shell = await readFile(path.join(DIST, 'index.html'), 'utf8');
  const server = await startServer(shell);
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Playwright's bundled Chromium in CI; fall back to a locally installed Chrome.
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  const routes = Object.keys(INDEXABLE_ROUTES);
  let failed = 0;

  try {
    for (const route of routes) {
      try {
        const html = await renderRoute(browser, origin, route);
        const out = route === '/' ? 'index.html' : `${route.slice(1)}.html`;
        await writeFile(path.join(DIST, out), html);
        console.log(`prerendered ${route} -> ${out} (${Math.round(html.length / 1024)} KB)`);
      } catch (err) {
        failed++;
        console.error(`FAILED ${route}: ${err.message.split('\n')[0]}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  await writeFile(path.join(DIST, 'sitemap.xml'), buildSitemap());
  console.log(`sitemap.xml: ${routes.length} urls`);
  if (failed) process.exit(1);
}

main();
