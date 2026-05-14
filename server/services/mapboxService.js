/**
 * Mapbox geocoding service — Phase 2 shadow route validation.
 *
 * Resolves US ZIP codes to lat/lng/city/state via Mapbox Geocoding API v5,
 * computes great-circle distance between origin and destination, and flags
 * suspicious patterns:
 *   - ZIP fails to resolve (typo / fake)
 *   - Origin === Destination ZIP
 *   - Origin or destination outside US
 *   - Claimed `miles` diverges >25% from geocoded distance (form tampering)
 *
 * Phase 2 invariants:
 *   - NEVER replaces the legacy `zipcodes` lookup in routes/leadIngest.js
 *   - NEVER mutates Lead directly — caller (validationPipeline) does that
 *   - NEVER throws to its caller
 *   - Safely no-ops when MAPBOX_TOKEN is missing or flag is off
 *
 * Cost: Mapbox free tier = 100k forward-geocodes/month. With 2 geocodes per
 * lead (origin + destination), 50k leads/mo fits free.
 */

const PROVIDER = 'mapbox';

function isEnabled() {
  return String(process.env.ENABLE_MAPBOX_VALIDATION).toLowerCase() === 'true';
}

const EARTH_RADIUS_MILES = 3959;
function haversineMiles(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return Math.round(EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Geocode a single US zip. Returns {lat, lng, city, state, country} or null.
async function geocodeZip(zip, token, timeoutMs) {
  if (!/^\d{5}$/.test(String(zip))) return null;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${zip}.json` +
    `?country=us&types=postcode&limit=1&access_token=${encodeURIComponent(token)}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let body;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    body = await res.json();
    if (!res.ok) return { error: { message: body?.message || `HTTP ${res.status}`, httpStatus: res.status } };
  } catch (err) {
    return { error: { message: err.message } };
  } finally {
    clearTimeout(t);
  }

  const feature = (body.features || [])[0];
  if (!feature) return null;

  const [lng, lat] = feature.center || [];
  const ctx = feature.context || [];
  const placeCtx   = ctx.find(c => /^place\./.test(c.id));     // city
  const regionCtx  = ctx.find(c => /^region\./.test(c.id));    // state
  const countryCtx = ctx.find(c => /^country\./.test(c.id));   // country

  return {
    lat, lng,
    city: placeCtx?.text || null,
    state: regionCtx?.short_code ? String(regionCtx.short_code).replace(/^US-/i, '') : (regionCtx?.text || null),
    country: countryCtx?.short_code || countryCtx?.text || null,
    rawFeature: feature,
  };
}

/**
 * Validate origin/destination ZIP pair. Fire-and-forget safe.
 *
 * @param {string} originZip
 * @param {string} destinationZip
 * @param {Object} opts
 * @param {number} [opts.claimedMiles] - Miles claimed by the form, for sanity check
 * @returns {Promise<Object>} { available, status, result, rawRedacted, costUsd, error }
 */
async function validateRoute(originZip, destinationZip, opts = {}) {
  if (!isEnabled()) {
    return {
      available: false, status: 'skipped', provider: PROVIDER,
      result: { reason: 'feature_flag_off' },
      rawRedacted: '', costUsd: 0, error: null,
    };
  }

  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    return {
      available: false, status: 'skipped', provider: PROVIDER,
      result: { reason: 'mapbox_token_missing' },
      rawRedacted: '', costUsd: 0, error: null,
    };
  }

  const timeoutMs = Number(process.env.MAPBOX_TIMEOUT_MS || 5000);
  const [origin, dest] = await Promise.all([
    geocodeZip(originZip, token, timeoutMs),
    geocodeZip(destinationZip, token, timeoutMs),
  ]);

  if (origin && origin.error) {
    return {
      available: false, status: 'error', provider: PROVIDER,
      result: { reason: 'origin_geocode_failed' },
      rawRedacted: '', costUsd: 0, error: origin.error,
    };
  }
  if (dest && dest.error) {
    return {
      available: false, status: 'error', provider: PROVIDER,
      result: { reason: 'destination_geocode_failed' },
      rawRedacted: '', costUsd: 0, error: dest.error,
    };
  }

  const suspicious = [];
  if (!origin)      suspicious.push('origin_zip_not_found');
  if (!dest)        suspicious.push('destination_zip_not_found');
  if (origin && dest && originZip === destinationZip) suspicious.push('same_origin_destination');
  if (origin && origin.country && origin.country !== 'us' && origin.country !== 'US') suspicious.push('origin_not_us');
  if (dest   && dest.country   && dest.country   !== 'us' && dest.country   !== 'US') suspicious.push('destination_not_us');

  let geocodedMiles = null;
  let milesDivergencePct = null;
  if (origin && dest) {
    geocodedMiles = haversineMiles(origin.lat, origin.lng, dest.lat, dest.lng);
    const claimed = Number(opts.claimedMiles || 0);
    if (claimed > 0 && geocodedMiles > 0) {
      milesDivergencePct = Math.abs(claimed - geocodedMiles) / geocodedMiles;
      if (milesDivergencePct > 0.25) suspicious.push('miles_divergence_high');
    }
  }

  const distanceClass = geocodedMiles == null ? null
                       : geocodedMiles > 100 ? 'long_distance'
                       : 'local';

  const normalized = {
    origin: origin ? { city: origin.city, state: origin.state, country: origin.country, lat: origin.lat, lng: origin.lng } : null,
    destination: dest ? { city: dest.city, state: dest.state, country: dest.country, lat: dest.lat, lng: dest.lng } : null,
    geocodedMiles,
    claimedMiles: opts.claimedMiles ?? null,
    milesDivergencePct,
    distanceClass,
    suspicious,
  };

  // Raw stored is the two Mapbox feature objects (no PII to redact)
  const rawStored = JSON.stringify({
    origin: origin?.rawFeature || null,
    destination: dest?.rawFeature || null,
  }).slice(0, 8 * 1024);

  return {
    available: true, status: 'ok', provider: PROVIDER,
    result: normalized,
    rawRedacted: rawStored,
    costUsd: 0, // Mapbox geocoding is free at our volume
    error: null,
  };
}

module.exports = {
  validateRoute,
  geocodeZip,
  haversineMiles,
  isEnabled,
  PROVIDER,
};
