// Coverage expansion: turn a free-text service-area input + radius into a set
// of ZIP codes, then write CoverageArea documents so the mover becomes
// immediately routable (eligible for findEligibleMovers, joins zip socket
// rooms on next connect, gets matching SMS broadcasts).
//
// Used by /api/onboarding/save-step (step 1 only, while !onboarding.complete)
// and /api/onboarding/preview-coverage (live UI preview, no DB write).

const zipcodes = require('zipcodes');
const CoverageArea = require('../models/CoverageArea');

// Hard cap so a Statewide selection on California (~2500 zips) or a typo can't
// runaway-insert into the DB. 3000 is more than the largest US state.
const MAX_ZIPS_PER_USER = 3000;

const VALID_RADII = new Set(['25', '50', '100', 'statewide', 'interstate']);
const ZIP_RE = /^\d{5}$/;
const CITY_STATE_RE = /^([^,]+),\s*([A-Za-z]{2})\s*$/;

/**
 * Resolve a single user input (ZIP, "City, ST", or just a 5-digit ZIP) into a
 * zipcodes record { zip, city, state, latitude, longitude } or null.
 */
function resolveCenter(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  if (ZIP_RE.test(trimmed)) {
    const r = zipcodes.lookup(trimmed);
    return r || null;
  }

  const m = trimmed.match(CITY_STATE_RE);
  if (m) {
    const matches = zipcodes.lookupByName(m[1].trim(), m[2].toUpperCase());
    if (matches && matches.length) return matches[0];
    return null;
  }

  return null;
}

/**
 * Given a single input + radius, return the matching ZIPs and a friendly
 * display name. Throws an Error with .userMessage for any user-facing issue
 * the wizard can surface inline.
 */
function expandInputToZips(input, radius) {
  const center = resolveCenter(input);
  if (!center) {
    const err = new Error('UNRESOLVED_INPUT');
    err.userMessage = `We couldn't recognize "${input}". Try "City, ST" (e.g. Houston, TX) or a 5-digit ZIP.`;
    throw err;
  }

  if (!VALID_RADII.has(String(radius))) {
    const err = new Error('INVALID_RADIUS');
    err.userMessage = 'Pick a service radius.';
    throw err;
  }

  const r = String(radius);
  let zips = [];

  if (r === 'statewide') {
    zips = (zipcodes.lookupByState(center.state) || []).map(z => z.zip);
  } else if (r === 'interstate') {
    // Approximation: 100mi metro coverage. True interstate routing (origin
    // matched, destination unrestricted) is a Phase 2 in findEligibleMovers.
    zips = zipcodes.radius(center.zip, 100) || [];
  } else {
    zips = zipcodes.radius(center.zip, Number(r)) || [];
  }

  // Dedupe + cap.
  const set = new Set(zips.filter(Boolean).map(z => String(z)));
  const capped = Array.from(set).slice(0, MAX_ZIPS_PER_USER);

  return {
    zips: capped,
    centerZip: center.zip,
    displayName: `${center.city}, ${center.state}`,
    state: center.state,
    capped: zips.length > MAX_ZIPS_PER_USER,
  };
}

/**
 * Combine the primary input + any additional inputs into one merged ZIP set.
 * Each additional input is resolved with the same selected radius — except
 * 'statewide'/'interstate', which we keep applied to the primary only and use
 * a 25mi default for additional chips so we don't accidentally explode coverage.
 */
function expandAll(primary, radius, additionalInputs = []) {
  const main = expandInputToZips(primary, radius);
  const allZips = new Set(main.zips);

  const extraRadius = (radius === 'statewide' || radius === 'interstate') ? '25' : String(radius);
  const resolvedExtras = [];
  const failedExtras = [];

  for (const extra of (additionalInputs || [])) {
    if (!extra || !String(extra).trim()) continue;
    try {
      const ex = expandInputToZips(extra, extraRadius);
      resolvedExtras.push({ input: extra, displayName: ex.displayName, zipCount: ex.zips.length });
      ex.zips.forEach(z => allZips.add(z));
    } catch (e) {
      failedExtras.push({ input: extra, message: e.userMessage || 'unresolved' });
    }
  }

  // Re-cap after merging.
  const merged = Array.from(allZips).slice(0, MAX_ZIPS_PER_USER);

  return {
    zips: merged,
    primary: { displayName: main.displayName, centerZip: main.centerZip, state: main.state, zipCount: main.zips.length },
    additional: resolvedExtras,
    failedExtras,
    capped: allZips.size > MAX_ZIPS_PER_USER,
  };
}

/**
 * Wipe + bulk-insert CoverageArea docs for a user. Called only while the
 * user's onboarding is not yet complete (Settings editor is the source of
 * truth post-onboarding).
 */
async function regenerateCoverageForUser(userId, primary, radius, additionalInputs) {
  const result = expandAll(primary, radius, additionalInputs);
  if (!result.zips.length) return { count: 0, ...result };

  await CoverageArea.deleteMany({ company: userId });
  await CoverageArea.insertMany(
    result.zips.map(zip => ({ company: userId, zipCode: zip, type: 'both', radius: 0 })),
    { ordered: false }
  );

  return { count: result.zips.length, ...result };
}

// ── v2: typed coverage from dispatchBase + pickup + delivery answers ───────
//
// Builds an origin-zip set and a destination-zip set, then writes typed
// CoverageArea documents:
//   • intersection of origin ∩ destination → type:'both'
//   • origin only                            → type:'origin'
//   • destination only                       → type:'destination'
//
// Sets are independently capped at MAX_ZIPS_PER_USER (3000) to bound DB load.
// Nationwide delivery is NOT expanded into ZIPs — the route handler also
// flips User.deliversNationwide so the matching helper can short-circuit.

const NEAR_BASE_RADIUS_MILES = 50; // "Local around my base" = ≈50mi

function _zipsForPickup(dispatchBase, pickup) {
  const mode = (pickup && pickup.mode) || 'near';
  if (mode === 'near') {
    if (!dispatchBase || !dispatchBase.zip) return [];
    return zipcodes.radius(dispatchBase.zip, NEAR_BASE_RADIUS_MILES) || [];
  }
  if (mode === 'state') {
    const st = (dispatchBase && dispatchBase.state) || '';
    if (!st) return [];
    return (zipcodes.lookupByState(st) || []).map(z => z.zip);
  }
  if (mode === 'states') {
    const states = Array.isArray(pickup.states) ? pickup.states : [];
    const out = new Set();
    for (const st of states) {
      if (!st) continue;
      const arr = zipcodes.lookupByState(st) || [];
      for (const r of arr) out.add(r.zip);
    }
    return Array.from(out);
  }
  return [];
}

function _zipsForDelivery(originZips, dispatchBase, delivery) {
  const mode = (delivery && delivery.mode) || 'same';
  if (mode === 'same') {
    return originZips.slice(); // mirror — caller will collapse to type:'both'
  }
  if (mode === 'states') {
    const states = Array.isArray(delivery.states) ? delivery.states : [];
    const out = new Set();
    for (const st of states) {
      if (!st) continue;
      const arr = zipcodes.lookupByState(st) || [];
      for (const r of arr) out.add(r.zip);
    }
    return Array.from(out);
  }
  // 'nationwide' → no ZIP set; caller relies on User.deliversNationwide
  return null;
}

async function regenerateCoverageForUser_v2(userId, dispatchBase, pickup, delivery) {
  const originZipsRaw      = _zipsForPickup(dispatchBase, pickup);
  const destinationZipsRaw = _zipsForDelivery(originZipsRaw, dispatchBase, delivery);
  const nationwide         = (delivery && delivery.mode === 'nationwide');

  // Cap each set independently before computing the typed split.
  const originZips      = Array.from(new Set(originZipsRaw)).slice(0, MAX_ZIPS_PER_USER);
  const destinationZips = destinationZipsRaw === null
    ? null
    : Array.from(new Set(destinationZipsRaw)).slice(0, MAX_ZIPS_PER_USER);

  const originSet = new Set(originZips);
  const destSet   = destinationZips === null ? new Set() : new Set(destinationZips);

  const bothZips        = [];
  const originOnlyZips  = [];
  const destOnlyZips    = [];

  for (const z of originSet) {
    if (destSet.has(z)) bothZips.push(z);
    else originOnlyZips.push(z);
  }
  for (const z of destSet) {
    if (!originSet.has(z)) destOnlyZips.push(z);
  }

  const docs = [
    ...bothZips.map(z       => ({ company: userId, zipCode: z, type: 'both',        radius: 0 })),
    ...originOnlyZips.map(z => ({ company: userId, zipCode: z, type: 'origin',      radius: 0 })),
    ...destOnlyZips.map(z   => ({ company: userId, zipCode: z, type: 'destination', radius: 0 })),
  ];

  await CoverageArea.deleteMany({ company: userId });
  if (docs.length) {
    await CoverageArea.insertMany(docs, { ordered: false });
  }

  return {
    counts: {
      both:            bothZips.length,
      originOnly:      originOnlyZips.length,
      destinationOnly: destOnlyZips.length,
      total:           docs.length,
    },
    nationwide,
    capped: {
      origin:      originZipsRaw.length      > MAX_ZIPS_PER_USER,
      destination: destinationZipsRaw !== null && destinationZipsRaw.length > MAX_ZIPS_PER_USER,
    },
  };
}

module.exports = {
  expandInputToZips,
  expandAll,
  regenerateCoverageForUser,
  regenerateCoverageForUser_v2,
  VALID_RADII,
  MAX_ZIPS_PER_USER,
  NEAR_BASE_RADIUS_MILES,
};
