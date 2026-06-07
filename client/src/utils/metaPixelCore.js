// Pixel-agnostic Meta helpers shared by the homeowner and mover pixels.
//
// fbevents.js exposes a single global `fbq`; multiple pixels share it. A bare
// fbq('track', …) broadcasts to EVERY initialized pixel, so all events go
// through trackSingle(pixelId, …) to stay isolated per pixel.

let injected = false;

/** Inject the stock fbevents.js snippet once. No init, no track. Idempotent. */
export function ensureFbevents() {
  if (injected) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  injected = true;
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
}

/**
 * Fire a single-pixel event. Targets exactly one pixel id so a second pixel
 * on the page never receives it. Safe under SSR / ad-blocker / missing id.
 */
export function trackSingle(pixelId, eventName, params = {}, eventId) {
  if (typeof window === 'undefined') return;
  if (!pixelId) return;
  const fbq = window.fbq;
  if (typeof fbq !== 'function') return;
  try {
    if (eventId) fbq('trackSingle', pixelId, eventName, params, { eventID: eventId });
    else         fbq('trackSingle', pixelId, eventName, params);
  } catch (_e) {
    // Never let a tracking failure surface to funnel UX. CAPI is durable.
  }
}

/** UUIDv4 for browser↔CAPI dedup. crypto.randomUUID with RFC4122 fallback. */
export function generateEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) return '';
  const target = name + '=';
  for (let p of document.cookie.split(';')) {
    p = p.trim();
    if (p.startsWith(target)) return decodeURIComponent(p.slice(target.length));
  }
  return '';
}

export function readFbp() { return readCookie('_fbp'); }

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

export function eventSourceUrl() {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.href;
}
