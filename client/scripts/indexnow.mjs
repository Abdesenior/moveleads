// IndexNow: tell Bing (and other IndexNow engines) which pages changed.
//   node scripts/indexnow.mjs manifest  -> writes dist/indexnow-manifest.json
//   node scripts/indexnow.mjs diff      -> compares with the live manifest,
//                                          writes the changed URLs to indexnow-urls.txt
//   node scripts/indexnow.mjs submit    -> posts indexnow-urls.txt to IndexNow
// Page hashes ignore <script> and <link> tags, so a new JS bundle alone
// does not count as a change.
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const HOST = 'moveleads.cloud';
const SITE = `https://${HOST}`;
const MANIFEST = 'indexnow-manifest.json';
const LIST = path.join(ROOT, 'indexnow-urls.txt');

async function key() {
  const file = (await readdir(path.join(ROOT, 'public'))).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (!file) throw new Error('IndexNow key file missing from client/public');
  return file.slice(0, -4);
}

async function sitemapUrls() {
  const xml = await readFile(path.join(DIST, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const htmlFile = (url) => {
  const p = new URL(url).pathname;
  return path.join(DIST, p === '/' ? 'index.html' : `${p.slice(1)}.html`);
};

async function manifest() {
  const out = {};
  for (const url of await sitemapUrls()) {
    const html = (await readFile(htmlFile(url), 'utf8')).replace(/<script\b[\s\S]*?<\/script>|<link\b[^>]*>/gi, '');
    out[url] = createHash('sha1').update(html).digest('hex').slice(0, 16);
  }
  await writeFile(path.join(DIST, MANIFEST), JSON.stringify(out));
  console.log(`${MANIFEST}: ${Object.keys(out).length} pages`);
}

async function diff() {
  const next = JSON.parse(await readFile(path.join(DIST, MANIFEST), 'utf8'));
  let prev = {};
  const res = await fetch(`${SITE}/${MANIFEST}`).catch(() => null);
  if (res?.ok) prev = await res.json().catch(() => ({}));
  else console.log('No live manifest yet: submitting every page once.');
  const changed = Object.keys(next).filter((u) => prev[u] !== next[u]);
  await writeFile(LIST, changed.join('\n'));
  console.log(`${changed.length} changed of ${Object.keys(next).length} pages`);
}

async function submit() {
  const urlList = (await readFile(LIST, 'utf8')).split('\n').filter(Boolean);
  if (!urlList.length) return console.log('Nothing changed; nothing to submit.');
  const k = await key();
  // IndexNow accepts up to 10,000 URLs per request.
  for (let i = 0; i < urlList.length; i += 10000) {
    const batch = urlList.slice(i, i + 10000);
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: k, keyLocation: `${SITE}/${k}.txt`, urlList: batch }),
    });
    console.log(`IndexNow: ${batch.length} URLs -> HTTP ${res.status}`);
  }
}

const cmd = process.argv[2];
const run = { manifest, diff, submit }[cmd];
if (!run) { console.error('usage: indexnow.mjs manifest|diff|submit'); process.exit(1); }
await run();
