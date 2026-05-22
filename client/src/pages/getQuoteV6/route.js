// client/src/pages/getQuoteV6/route.js
// Pure helpers used by UI components only. NO ZIP_TABLE — V6 uses
// zippopotam.us in GetQuoteV6.jsx for live city/state enrichment.
//
// IMPORTANT: these helpers are for UI display only. No screen using them
// writes the result into the `answers` object. The funnel's payload
// behavior (including the `miles` field) is owned by GetQuoteV6.jsx and
// is unchanged by this integration. Distance enrichment as a payload
// feature, if desired later, will be a separate task.

const R_MILES = 3958.8;

// Great-circle distance in miles (haversine). Returns 0 if either input
// is missing lat/lng — callers should treat 0 as "unknown".
export function milesBetween(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R_MILES * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

// Cardinal direction string (e.g. "NW", "—") — used in the route-preview
// stat grid on desktop.
export function cardinal(route) {
  if (!route?.from || !route?.to) return '—';
  const dLat = (route.to.lat ?? 0) - (route.from.lat ?? 0);
  const dLng = (route.to.lng ?? 0) - (route.from.lng ?? 0);
  const ns = dLat > 0.2 ? 'N' : dLat < -0.2 ? 'S' : '';
  const ew = dLng > 0.2 ? 'E' : dLng < -0.2 ? 'W' : '';
  return (ns + ew) || '—';
}

// Transit-days label rule from CHANGES.md #11.
export function transitDaysLabel(miles) {
  if (miles == null) return '—';
  if (miles < 200)  return '1';
  if (miles < 800)  return '1–2';
  if (miles < 1800) return '2–3';
  return '3–5';
}
