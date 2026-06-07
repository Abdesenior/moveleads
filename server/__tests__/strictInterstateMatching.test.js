/**
 * Phase 3 — strict interstate matching lock-in tests.
 *
 * Pure-Node, no Mongo. Covers:
 *   A. The exact test matrix from the operator spec (NY pickup + CA delivery)
 *   B. Nationwide delivery short-circuit
 *   C. Same-as-pickup symmetric case
 *   D. Legacy-fallback resolveMoverStates for un-backfilled movers
 *   E. STRICT_INTERSTATE_MATCHING flag helper
 *   F. Wiring assertions across twilioService, emailService, leads.js
 *   G. Shadow log helper output shape
 *   H. Full-policy strict matcher (distance/home/moveTypes layered)
 *
 * Run: `node server/__tests__/strictInterstateMatching.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isLeadInMoverCoverage,
  isLeadInMoverCoverageStrict,
  doesLeadMatchMoverPreferences,
  doesLeadMatchMoverPreferencesStrict,
  resolveMoverStates,
} = require('../utils/leadMatching');
const { strictMatchingEnabled } = require('../utils/strictMatchingFlag');
const { logMatchShadow, logDashboardShadow, fmtOriginDest } = require('../utils/matchShadowLog');

const twilioSrc  = fs.readFileSync(path.join(__dirname, '..', 'services', 'twilioService.js'), 'utf8');
const emailSrc   = fs.readFileSync(path.join(__dirname, '..', 'services', 'emailService.js'), 'utf8');
const leadsSrc   = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');
const envSrc     = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');

// ── A. The exact operator test matrix ────────────────────────────────────

test('A. Strict matcher: NY pickup + CA delivery — exact matrix', () => {
  const mover = {
    _id: 'm1',
    pickupStates: ['NY'],
    deliveryStates: ['CA'],
    deliversNationwide: false,
  };
  const cases = [
    { from: 'NY', to: 'CA', expect: true,  reason: 'NY pickup + CA delivery — direct match' },
    { from: 'NY', to: 'NY', expect: false, reason: 'NY pickup OK but NY not in delivery [CA]' },
    { from: 'CA', to: 'NY', expect: false, reason: 'CA not in pickup [NY] — fails origin gate' },
    { from: 'NY', to: 'DC', expect: false, reason: 'DC not in delivery [CA] — fails destination gate' },
  ];
  for (const c of cases) {
    const lead = { _id: 'L', originState: c.from, destinationState: c.to };
    const result = isLeadInMoverCoverageStrict(lead, mover, {});
    assert.equal(result, c.expect, `${c.from}→${c.to}: ${c.reason} (got ${result}, expected ${c.expect})`);
  }
});

// ── B. Nationwide delivery short-circuits the destination gate ───────────

test('B. Nationwide delivery: pickup gate only; any destination passes', () => {
  const mover = {
    _id: 'm1',
    pickupStates: ['NY'],
    deliveryStates: [],            // empty when nationwide (server enforces this)
    deliversNationwide: true,
  };
  const lead1 = { _id: 'L', originState: 'NY', destinationState: 'CA' };
  assert.equal(isLeadInMoverCoverageStrict(lead1, mover, {}), true,
    'NY→anywhere matches when nationwide + NY pickup');
  const lead2 = { _id: 'L', originState: 'NY', destinationState: 'AK' };
  assert.equal(isLeadInMoverCoverageStrict(lead2, mover, {}), true,
    'NY→AK matches when nationwide');
  const lead3 = { _id: 'L', originState: 'CA', destinationState: 'NY' };
  assert.equal(isLeadInMoverCoverageStrict(lead3, mover, {}), false,
    'CA pickup is not configured — nationwide does NOT bypass origin gate');
});

// ── C. Symmetric (same as pickup) ────────────────────────────────────────

test('C. Same-as-pickup: deliveryStates equals pickupStates', () => {
  const mover = {
    _id: 'm1',
    pickupStates: ['NY', 'NJ'],
    deliveryStates: ['NY', 'NJ'],
    deliversNationwide: false,
  };
  assert.equal(isLeadInMoverCoverageStrict({ originState: 'NY', destinationState: 'NJ' }, mover, {}), true,
    'NY→NJ (both in pickup AND delivery) matches');
  assert.equal(isLeadInMoverCoverageStrict({ originState: 'NJ', destinationState: 'NY' }, mover, {}), true,
    'reverse direction also matches');
  assert.equal(isLeadInMoverCoverageStrict({ originState: 'NY', destinationState: 'CA' }, mover, {}), false,
    'CA not in delivery → false');
  assert.equal(isLeadInMoverCoverageStrict({ originState: 'CA', destinationState: 'NY' }, mover, {}), false,
    'CA not in pickup → false');
});

// ── D. ZIP-level fallback when state-level doesn't match ─────────────────

test('D. ZIP fallback: origin state misses but originZip covered → match if dest also covered', () => {
  const mover = {
    _id: 'm1',
    pickupStates: [],
    deliveryStates: [],
    deliversNationwide: false,
  };
  // Mover covers some specific NJ ZIPs via origin, and NY ZIPs via destination
  const coverage = {
    originZipSet:      new Set(['07030']),
    destinationZipSet: new Set(['10001']),
  };
  const lead = {
    originState: 'NJ', originZip: '07030',
    destinationState: 'NY', destinationZip: '10001',
  };
  assert.equal(isLeadInMoverCoverageStrict(lead, mover, coverage), true,
    'pickup state empty but origin ZIP covered + dest ZIP covered → match');

  const leadNoMatch = {
    originState: 'NJ', originZip: '99999',  // not in originZipSet
    destinationState: 'NY', destinationZip: '10001',
  };
  assert.equal(isLeadInMoverCoverageStrict(leadNoMatch, mover, coverage), false,
    'origin ZIP not covered → false even if dest is');
});

// ── E. Legacy-fallback for un-backfilled movers ──────────────────────────

test('E. resolveMoverStates legacy fallback when pickupStates empty + serviceStates set', () => {
  const mover = {
    pickupStates: [],
    deliveryStates: [],
    serviceStates: ['CA', 'TX'],
    deliversNationwide: false,
  };
  const resolved = resolveMoverStates(mover);
  assert.ok(resolved.pickup.has('CA') && resolved.pickup.has('TX'),
    'legacy serviceStates copied into pickup');
  assert.ok(resolved.delivery.has('CA') && resolved.delivery.has('TX'),
    'legacy serviceStates copied into delivery (symmetric)');
  assert.equal(resolved.nationwide, false);

  // Strict matcher under fallback: legacy symmetric coverage
  assert.equal(isLeadInMoverCoverageStrict({ originState: 'CA', destinationState: 'TX' }, mover, {}), true);
  assert.equal(isLeadInMoverCoverageStrict({ originState: 'CA', destinationState: 'NY' }, mover, {}), false);
});

test('E2. Explicit pickup wins over legacy serviceStates (no fallback fires)', () => {
  const mover = {
    pickupStates: ['NY'],         // explicit
    deliveryStates: ['CA'],
    serviceStates: ['TX', 'OK'],  // legacy — must be ignored when pickup set
  };
  const resolved = resolveMoverStates(mover);
  assert.deepEqual([...resolved.pickup].sort(), ['NY']);
  assert.deepEqual([...resolved.delivery].sort(), ['CA']);
});

// ── F. Edge cases ────────────────────────────────────────────────────────

test('F1. Null/undefined inputs return false safely', () => {
  assert.equal(isLeadInMoverCoverageStrict(null, { pickupStates: ['NY'] }), false);
  assert.equal(isLeadInMoverCoverageStrict({ originState: 'NY' }, null), false);
});

test('F2. Empty mover (no pickup, no delivery, no nationwide, no legacy) → never matches', () => {
  const mover = { pickupStates: [], deliveryStates: [], serviceStates: [] };
  assert.equal(isLeadInMoverCoverageStrict({ originState: 'NY', destinationState: 'CA' }, mover, {}), false);
});

test('F3. Case-insensitive state code matching on lead side', () => {
  const mover = { pickupStates: ['NY'], deliveryStates: ['CA'] };
  // Lead states stored lowercase shouldn't break — the matcher uppercases them
  assert.equal(isLeadInMoverCoverageStrict({ originState: 'ny', destinationState: 'ca' }, mover, {}), true);
});

// ── G. Full-policy strict matcher layers distance/home/moveTypes ─────────

test('G. doesLeadMatchMoverPreferencesStrict: distance filter applies on top of coverage; home-size filter is retired', () => {
  const mover = {
    pickupStates: ['NY'],
    deliveryStates: ['CA'],
    deliversNationwide: false,
    maxDistance: 'Long Distance',
    preferredHomeSizes: ['2 Bedroom', '3 Bedroom'],
  };
  const matchingLead = {
    originState: 'NY', destinationState: 'CA',
    distance: 'Long Distance', homeSize: '2 Bedroom',
  };
  assert.equal(doesLeadMatchMoverPreferencesStrict(matchingLead, mover, {}), true);

  const wrongDistance = { ...matchingLead, distance: 'Local' };
  assert.equal(doesLeadMatchMoverPreferencesStrict(wrongDistance, mover, {}), false,
    'distance preference Long Distance + lead.distance=Local → false');

  // HOME-SIZE filter RETIRED (2026-06-07). preferredHomeSizes is still on
  // the mover doc but the matcher ignores it. A 1-Bedroom lead that fails
  // the OLD home-size check should now pass (assuming coverage + distance
  // still match).
  const oldRejectedBySize = { ...matchingLead, homeSize: '1 Bedroom' };
  assert.equal(doesLeadMatchMoverPreferencesStrict(oldRejectedBySize, mover, {}), true,
    '1 Bedroom lead no longer rejected — preferredHomeSizes filter is retired');

  // Coverage still fails first — distance filter never reaches
  const noCoverage = { ...matchingLead, originState: 'TX' };
  assert.equal(doesLeadMatchMoverPreferencesStrict(noCoverage, mover, {}), false);
});

// ── H. Flag helper ───────────────────────────────────────────────────────

test('H. strictMatchingEnabled honors env values', () => {
  const before = process.env.STRICT_INTERSTATE_MATCHING;
  try {
    delete process.env.STRICT_INTERSTATE_MATCHING;
    assert.equal(strictMatchingEnabled(), false);

    process.env.STRICT_INTERSTATE_MATCHING = '';
    assert.equal(strictMatchingEnabled(), false);

    process.env.STRICT_INTERSTATE_MATCHING = 'false';
    assert.equal(strictMatchingEnabled(), false);

    for (const v of ['true', 'TRUE', '1', 'yes', 'on']) {
      process.env.STRICT_INTERSTATE_MATCHING = v;
      assert.equal(strictMatchingEnabled(), true, `value=${v}`);
    }
  } finally {
    if (before === undefined) delete process.env.STRICT_INTERSTATE_MATCHING;
    else process.env.STRICT_INTERSTATE_MATCHING = before;
  }
});

// ── I. Shadow log helper ─────────────────────────────────────────────────

test('I1. fmtOriginDest prefers state code; falls back to ZIP', () => {
  assert.equal(fmtOriginDest({ originState: 'NY', originZip: '10001' }, 'origin'), 'NY/10001');
  assert.equal(fmtOriginDest({ originZip: '10001' }, 'origin'), '10001');
  assert.equal(fmtOriginDest({}, 'origin'), 'unknown');
  assert.equal(fmtOriginDest({ destinationState: 'ca' }, 'destination'), 'CA');
});

test('I2. logMatchShadow + logDashboardShadow emit the documented log line shape', () => {
  // Capture console.log output
  const captured = [];
  const orig = console.log;
  console.log = (...args) => captured.push(args.join(' '));
  try {
    logMatchShadow({
      source: 'sms',
      lead: { _id: 'L1', originState: 'NY', originZip: '10001', destinationState: 'CA', destinationZip: '90210' },
      mover: { _id: 'M1' },
      legacy: true,
      strict: false,
    });
    logDashboardShadow({
      userId: 'U1',
      leadsCount: 50,
      legacyMatched: 42,
      strictMatched: 12,
    });
  } finally {
    console.log = orig;
  }
  assert.equal(captured.length, 2);
  assert.match(captured[0],
    /\[MatchShadow\] source=sms lead=L1 mover=M1 origin=NY\/10001 dest=CA\/90210 legacy=true strict=false/);
  assert.match(captured[1],
    /\[MatchShadow\] source=dashboard user=U1 leads=50 legacy_badge=42 strict_badge=12/);
});

// ── J. Legacy matcher is UNCHANGED ───────────────────────────────────────

test('J. Legacy matchers still produce the OR-semantics result (regression guard)', () => {
  const mover = { deliversNationwide: false };
  const zipSet = new Set(['10001']); // mover covers NY ZIP only
  const lead = {
    originZip: '10001',
    destinationZip: '99999',     // not in coverage
  };
  // Legacy: origin OR dest in zipSet → true (origin matches, dest doesn't matter)
  assert.equal(isLeadInMoverCoverage(lead, mover, zipSet), true,
    'Legacy: origin in coverage → matches regardless of destination (Phase 1+2 semantics preserved)');

  const leadDestOnly = { originZip: '99999', destinationZip: '10001' };
  assert.equal(isLeadInMoverCoverage(leadDestOnly, mover, zipSet), true,
    'Legacy: destination in coverage → matches (OR semantics)');
});

// ── K. Caller wiring assertions ──────────────────────────────────────────

test('K. twilioService.js imports strict matcher + flag + shadow helper', () => {
  assert.match(twilioSrc, /doesLeadMatchMoverPreferencesStrict/,
    'twilioService must import the strict matcher');
  assert.match(twilioSrc, /require\(['"]\.\.\/utils\/strictMatchingFlag['"]\)/,
    'twilioService must import the flag helper');
  assert.match(twilioSrc, /require\(['"]\.\.\/utils\/matchShadowLog['"]\)/,
    'twilioService must import the shadow log helper');
  assert.match(twilioSrc, /strictMatchingEnabled\(\)/,
    'twilioService must call strictMatchingEnabled() to pick the active mode');
  assert.match(twilioSrc, /logMatchShadow\(\s*\{[\s\S]*?source:\s*['"]sms['"]/,
    'twilioService must emit per-candidate shadow log with source=sms');
});

test('K2. emailService.js imports strict matcher + flag + shadow helper', () => {
  assert.match(emailSrc, /doesLeadMatchMoverPreferencesStrict/);
  assert.match(emailSrc, /require\(['"]\.\.\/utils\/strictMatchingFlag['"]\)/);
  assert.match(emailSrc, /require\(['"]\.\.\/utils\/matchShadowLog['"]\)/);
  assert.match(emailSrc, /logMatchShadow\(\s*\{[\s\S]*?source:\s*['"]email['"]/,
    'emailService must emit per-candidate shadow log with source=email');
});

test('K3. leads.js dashboard handler imports the full-policy strict matcher + flag + shadow helper', () => {
  // Phase 3.1: the dashboard now uses the FULL-POLICY strict matcher
  // (doesLeadMatchMoverPreferencesStrict) — same as SMS + email. The
  // coverage-only strict variant is no longer used by the dashboard.
  assert.match(leadsSrc, /doesLeadMatchMoverPreferencesStrict/,
    'leads.js must import the full-policy strict matcher (NOT the coverage-only one)');
  assert.match(leadsSrc, /require\(['"]\.\.\/utils\/strictMatchingFlag['"]\)/);
  assert.match(leadsSrc, /require\(['"]\.\.\/utils\/matchShadowLog['"]\)/);
  assert.match(leadsSrc, /logDashboardShadow\(/,
    'leads.js must emit per-request dashboard shadow summary');
  // Typed coverage fetch — origin/both and destination/both
  assert.match(leadsSrc, /type:\s*\{\s*\$in:\s*\[['"]origin['"],\s*['"]both['"]\]\s*\}/,
    'leads.js must fetch typed coverage for origin side');
  assert.match(leadsSrc, /type:\s*\{\s*\$in:\s*\[['"]destination['"],\s*['"]both['"]\]\s*\}/,
    'leads.js must fetch typed coverage for destination side');
});

test('K4. broadcasters use typed CoverageArea queries (origin/both + destination/both)', () => {
  for (const [name, src] of [['twilioService', twilioSrc], ['emailService', emailSrc]]) {
    assert.match(src, /type:\s*\{\s*\$in:\s*\[['"]origin['"],\s*['"]both['"]\]\s*\}/,
      `${name} must filter origin CoverageArea by type origin/both`);
    assert.match(src, /type:\s*\{\s*\$in:\s*\[['"]destination['"],\s*['"]both['"]\]\s*\}/,
      `${name} must filter destination CoverageArea by type destination/both`);
    assert.match(src, /deliversNationwide:\s*true/,
      `${name} must include nationwide-delivery movers in the destination set`);
  }
});

// ── L. .env documentation ────────────────────────────────────────────────

test('L. .env.example documents STRICT_INTERSTATE_MATCHING with safe default', () => {
  assert.match(envSrc, /^STRICT_INTERSTATE_MATCHING\s*=\s*false/m,
    '.env.example must default STRICT_INTERSTATE_MATCHING=false');
});

// ── M. Phase 3.1 — dashboard badge uses full-policy strict matcher ──────

const leadsRouteSrcM = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');

test('M1. Dashboard handler computes strict badge via doesLeadMatchMoverPreferencesStrict (full policy)', () => {
  assert.match(leadsRouteSrcM, /doesLeadMatchMoverPreferencesStrict/,
    'leads.js must import doesLeadMatchMoverPreferencesStrict for the strict badge');
  // The strict assignment must use the full-policy matcher (not the
  // coverage-only one — that was the Phase 3 mistake that let badges leak
  // onto leads whose maxDistance / homeSize / moveTypes the mover doesn't accept).
  assert.match(
    leadsRouteSrcM,
    /const strict\s*=\s*doesLeadMatchMoverPreferencesStrict\(/,
    'dashboard strict branch must use doesLeadMatchMoverPreferencesStrict (NOT the coverage-only isLeadInMoverCoverageStrict)'
  );
});

test('M2. Dashboard fetches User fields needed by full-policy matcher', () => {
  assert.match(leadsRouteSrcM, /maxDistance/,           'must select maxDistance');
  assert.match(leadsRouteSrcM, /preferredHomeSizes/,    'must select preferredHomeSizes');
  assert.match(leadsRouteSrcM, /onboarding\.answers/,   'must select onboarding.answers (moveTypes)');
});

test('M3. Strict badge respects maxDistance — local-only mover does NOT match long-distance lead', () => {
  const mover = {
    pickupStates: ['NY'],
    deliveryStates: ['CA'],
    deliversNationwide: false,
    maxDistance: 'Local',
  };
  // NY → CA is in coverage (origin NY pickup, dest CA delivery) but it's
  // a long-distance lead. The mover only wants Local. Badge must NOT fire.
  const lead = {
    originState: 'NY', destinationState: 'CA',
    originZip: '10001', destinationZip: '90210',
    distance: 'Long Distance',
  };
  assert.equal(doesLeadMatchMoverPreferencesStrict(lead, mover, {}), false,
    'Local-only mover should NOT match a Long Distance lead even when coverage is satisfied');
});

test('M4. Strict badge respects maxDistance — long-distance-only mover does NOT match local lead', () => {
  const mover = {
    pickupStates: ['NY'],
    deliveryStates: ['NY'],
    deliversNationwide: false,
    maxDistance: 'Long Distance',
  };
  const localLead = {
    originState: 'NY', destinationState: 'NY',
    originZip: '10001', destinationZip: '10002',
    distance: 'Local',
  };
  assert.equal(doesLeadMatchMoverPreferencesStrict(localLead, mover, {}), false,
    'Long-distance-only mover should NOT match a Local lead');
});

test('M5. maxDistance empty (Both) matches both distances', () => {
  const mover = {
    pickupStates: ['NY'],
    deliveryStates: ['CA'],
    deliversNationwide: false,
    maxDistance: '',  // both
  };
  const longLead = {
    originState: 'NY', destinationState: 'CA',
    distance: 'Long Distance',
  };
  assert.equal(doesLeadMatchMoverPreferencesStrict(longLead, mover, {}), true,
    'Both/Any-distance mover matches long-distance');
});

test('M6. Strict badge IGNORES preferredHomeSizes (filter retired 2026-06-07)', () => {
  const mover = {
    pickupStates: ['NY'],
    deliveryStates: ['CA'],
    deliversNationwide: false,
    preferredHomeSizes: ['3 Bedroom', '4+ Bedroom'],
  };
  // Pre-retirement this would have returned false (1 Bedroom not in
  // preferences). Post-retirement the matcher no longer reads the field,
  // so coverage + distance alone decide — both pass.
  const smallLead = {
    originState: 'NY', destinationState: 'CA',
    distance: 'Long Distance',
    homeSize: '1 Bedroom',
  };
  assert.equal(doesLeadMatchMoverPreferencesStrict(smallLead, mover, {}), true,
    '1 Bedroom lead now matches — preferredHomeSizes is no longer read by the matcher');

  const bigLead = { ...smallLead, homeSize: '3 Bedroom' };
  assert.equal(doesLeadMatchMoverPreferencesStrict(bigLead, mover, {}), true,
    '3 Bedroom lead also matches — both pass coverage + distance');
});

test('M7. Legacy fallback log fires once per mover per process (not per match call)', () => {
  // Capture warn output
  const captured = [];
  const orig = console.warn;
  console.warn = (...args) => captured.push(args.join(' '));
  try {
    const fallbackMover = {
      _id: 'unbackfilled-mover-1',
      pickupStates: [],
      deliveryStates: [],
      serviceStates: ['NY'],
    };
    // Three matches against the same mover should produce ONE warn line
    resolveMoverStates(fallbackMover);
    resolveMoverStates(fallbackMover);
    resolveMoverStates(fallbackMover);
    const fired = captured.filter(l => /legacy serviceStates fallback fired for mover=unbackfilled-mover-1/.test(l));
    assert.equal(fired.length, 1,
      'fallback warn must dedupe per mover per process');
    // A different mover triggers a separate warn
    resolveMoverStates({
      _id: 'unbackfilled-mover-2',
      pickupStates: [], deliveryStates: [],
      serviceStates: ['CA'],
    });
    const fired2 = captured.filter(l => /unbackfilled-mover-2/.test(l));
    assert.equal(fired2.length, 1);
  } finally {
    console.warn = orig;
  }
});

test('M8. Legacy fallback log does NOT fire for backfilled movers', () => {
  const captured = [];
  const orig = console.warn;
  console.warn = (...args) => captured.push(args.join(' '));
  try {
    const backfilledMover = {
      _id: 'backfilled-mover-1',
      pickupStates: ['NY'],
      deliveryStates: ['CA'],
      serviceStates: ['NY', 'CA'],
    };
    resolveMoverStates(backfilledMover);
    const fired = captured.filter(l => /legacy serviceStates fallback/.test(l));
    assert.equal(fired.length, 0,
      'backfilled mover must NOT trigger the legacy fallback warn');
  } finally {
    console.warn = orig;
  }
});

console.log('\nPhase 3 + 3.1 strict interstate matching lock-in tests scheduled.');
