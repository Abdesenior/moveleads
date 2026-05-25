// Meta Pixel (fbevents.js) browser helpers.
//
// Three responsibilities:
//   1. loadPixel()     — inject fbevents.js once on app boot, fire PageView
//   2. trackLead(...)  — fire `Lead` after a successful ingest, sharing the
//                        same event_id the backend will use for CAPI dedup
//   3. readers         — generateEventId, readFbp, readFbc, eventSourceUrl
//
// All entry points are safe under:
//   - missing VITE_META_PIXEL_ID (degraded mode — silent no-op)
//   - ad-blockers (no `window.fbq` defined — guarded calls)
//   - server-side rendering (no `document` / `window` — early returns)
//
// Meta dedups by (event_name, event_id). The browser fires `Lead` with the
// SAME event_id the server passes to CAPI in graph.facebook.com/.../events.
// Mismatched event_ids = no dedup = double-counted conversions.

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '';

let loaded = false;

/**
 * Inject the Meta Pixel base script and fire `init` + `PageView`. Idempotent
 * — calling more than once is a no-op. Skipped entirely if VITE_META_PIXEL_ID
 * is not set, so dev builds without a Pixel ID stay silent.
 *
 * Call once from main.jsx during app boot.
 */
export function loadPixel() {
  if (loaded) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!PIXEL_ID) return;
  loaded = true;

  // Stock Meta snippet, inlined so we don't ship a third-party loader file.
  // Source: https://www.facebook.com/business/help/952192354843755
  /* eslint-disable */
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  try {
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  } catch (_e) {
    // Ad-blockers can throw at init time. Swallow — we don't want to crash
    // the app boot path for a tracking failure.
  }
}

/**
 * Generate a UUIDv4 event_id. Prefers crypto.randomUUID (all evergreen
 * browsers), falls back to a manual RFC4122 v4 implementation for ancient
 * environments where the API isn't present.
 */
export function generateEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback — sufficient for our dedup use case (collision astronomically
  // unlikely; this is best-effort attribution, not a security token).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Read a single cookie by name. Returns '' if absent.
 */
function readCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) return '';
  const target = name + '=';
  const parts = document.cookie.split(';');
  for (let p of parts) {
    p = p.trim();
    if (p.startsWith(target)) return decodeURIComponent(p.slice(target.length));
  }
  return '';
}

/** `_fbp` cookie value, or empty string. */
export function readFbp() {
  return readCookie('_fbp');
}

/**
 * `_fbc` cookie value, OR a reconstructed `fbc` from the `?fbclid=…` URL
 * param on a fresh ad-click landing. Meta accepts either format:
 *   fb.<subdomain>.<creation_timestamp_ms>.<fbclid>
 *
 * Why fall back to fbclid: on the very first ad-click landing the browser
 * may not have set the `_fbc` cookie yet (Pixel hasn't loaded). The URL
 * param is the authoritative source; we mirror it into the format Meta
 * expects so attribution doesn't drop on the first conversion.
 */
export function readFbc() {
  const cookie = readCookie('_fbc');
  if (cookie) return cookie;
  if (typeof window === 'undefined') return '';
  try {
    const fbclid = new URL(window.location.href).searchParams.get('fbclid');
    if (!fbclid) return '';
    return `fb.1.${Date.now()}.${fbclid}`;
  } catch (_e) {
    return '';
  }
}

/** Current page URL for `event_source_url`. Empty string in non-browser. */
export function eventSourceUrl() {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.href;
}

/**
 * Fire the `Lead` event from the browser side of the deduplicated pair.
 * Pass the SAME eventId that was sent to the server in the ingest body —
 * Meta uses (event_name, event_id) to dedupe browser vs CAPI.
 *
 * Safe under: no `fbq` (ad-blocker), missing PIXEL_ID, throwing fbq.
 *
 * @param {string} eventId  UUIDv4 generated via generateEventId(), also in the POST body
 * @param {object} [params] Optional event params (value, currency, content_name, …)
 */
export function trackLead(eventId, params = {}) {
  if (typeof window === 'undefined') return;
  if (!PIXEL_ID) return;
  const fbq = window.fbq;
  if (typeof fbq !== 'function') return;
  try {
    fbq(
      'track',
      'Lead',
      { content_name: 'moveleads_quote', currency: 'USD', value: 0, ...params },
      { eventID: eventId },
    );
  } catch (_e) {
    // Same rationale as loadPixel — never let a tracking failure surface
    // to the funnel UX. Server-side CAPI is the durable channel.
  }
}
