// First-touch attribution: remember where a visitor first arrived, so a quote
// submitted later (even after browsing several pages) records the page and
// channel that brought them. The server normalizes it (server/utils/
// attribution.js): path only, referrer host only.
//
// Stored per browser for 90 days. Storage can be blocked (private mode,
// cookie settings), so every access is wrapped and failure just means
// "no attribution", never a broken quote form.

const KEY = 'ml_first_touch';
const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SKIP = /^\/(dashboard|admin|login|register|dev|embed|_app)(\/|$)/;

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && Date.now() - new Date(v.firstSeenAt).getTime() < TTL_MS) return v;
  } catch { /* storage blocked or corrupt */ }
  return null;
}

export function captureFirstTouch() {
  if (typeof window === 'undefined' || read()) return;
  const { pathname, search } = window.location;
  if (SKIP.test(pathname)) return;
  const q = new URLSearchParams(search);
  const v = {
    landingPage: pathname,
    referrer: document.referrer || '',
    utmSource: q.get('utm_source') || '',
    utmMedium: q.get('utm_medium') || '',
    utmCampaign: q.get('utm_campaign') || '',
    firstSeenAt: new Date().toISOString(),
  };
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

// Payload for the ingest API: non-empty strings only, bounded lengths
// (the server validator rejects anything else).
export function getAttribution() {
  const v = read();
  if (!v) return undefined;
  const out = {};
  for (const k of ['landingPage', 'referrer', 'utmSource', 'utmMedium', 'utmCampaign', 'firstSeenAt']) {
    if (typeof v[k] === 'string' && v[k]) out[k] = v[k].slice(0, k === 'landingPage' || k === 'referrer' ? 2048 : 256);
  }
  return Object.keys(out).length ? out : undefined;
}
