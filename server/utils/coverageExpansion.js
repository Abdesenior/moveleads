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

module.exports = {
  expandInputToZips,
  expandAll,
  regenerateCoverageForUser,
  VALID_RADII,
  MAX_ZIPS_PER_USER,
};
