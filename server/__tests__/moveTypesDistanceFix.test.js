/**
 * Move-types distance-override regression.
 *
 * Production bug (2026-05-26): the operator reported that a mover with
 *   pickupStates=['TX'], deliversNationwide=true, maxDistance='' (Both)
 * was NOT seeing a McKinney, TX → Ocala, FL lead in the "Matched for you"
 * tab — only TX→TX leads appeared, even though both should have matched
 * by the operator's mental model.
 *
 * Root cause: `dispatchPolicy.derivedMoveType` returned `'longDistance'`
 * whenever `lead.distance === 'Long Distance'`, BEFORE falling through to
 * the homeSize-based derivation. If the mover's legacy
 * `onboarding.answers.moveTypes` array (from a prior onboarding wizard
 * version, no longer surfaced in any UI) didn't include `'longDistance'`,
 * `matchesMoveTypes` silently returned false → strict matcher dropped the
 * lead → no "Matches your setup" badge → Matched-for-you tab filtered it
 * out.
 *
 * This conflated two orthogonal filters:
 *   - DISTANCE  is gated by User.maxDistance (Settings; user-controlled)
 *   - moveTypes should classify KIND of move (apartment/home/office),
 *     not distance
 *
 * Fix: remove the distance-based branch from derivedMoveType. Distance
 * stays where it belongs (User.maxDistance). moveTypes derives from
 * homeSize alone.
 *
 * These tests both lock in the fix for the exact failing case AND guard
 * against regressing the legitimate filters (distance, home size,
 * categorical moveTypes) that should still work.
 *
 * Pure-Node, no Mongo. Run: `node server/__tests__/moveTypesDistanceFix.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  doesLeadMatchMoverPreferencesStrict,
  isLeadInMoverCoverageStrict,
} = require('../utils/leadMatching');
const { matchesMoveTypes, derivedMoveType } = require('../utils/dispatchPolicy');

// ── Fixtures ────────────────────────────────────────────────────────────

// Operator's exact mover config.
function nationwideTexasMover(overrides = {}) {
  return {
    _id: 'mover_test',
    pickupStates: ['TX'],
    deliveryStates: [],
    deliversNationwide: true,
    maxDistance: '',           // 'Both' is saved as empty string by Settings
    preferredHomeSizes: [],
    onboarding: { answers: {} },
    ...overrides,
  };
}

function leadTxToFl(overrides = {}) {
  return {
    originCity: 'McKinney', originState: 'TX', originZip: '75070',
    destinationCity: 'Ocala', destinationState: 'FL', destinationZip: '34470',
    distance: 'Long Distance',
    homeSize: '3 Bedroom',
    ...overrides,
  };
}

function leadTxToTx(overrides = {}) {
  return {
    originCity: 'McKinney', originState: 'TX', originZip: '75070',
    destinationCity: 'Houston', destinationState: 'TX', destinationZip: '77001',
    distance: 'Local',
    homeSize: '3 Bedroom',
    ...overrides,
  };
}

// ── A. The exact failing pair from the production report ────────────────

test("A1. McKinney, TX → Ocala, FL: nationwide mover with no moveTypes matches", () => {
  const mover = nationwideTexasMover();
  const lead = leadTxToFl();
  assert.equal(isLeadInMoverCoverageStrict(lead, mover), true, 'coverage should pass — TX in pickup + nationwide delivery');
  assert.equal(doesLeadMatchMoverPreferencesStrict(lead, mover), true, 'full strict match should pass — operator baseline');
});

test("A2. McKinney, TX → Houston, TX: nationwide mover matches (regression guard for the working case)", () => {
  const mover = nationwideTexasMover();
  const lead = leadTxToTx();
  assert.equal(doesLeadMatchMoverPreferencesStrict(lead, mover), true);
});

test("A3. THE BUG: TX→FL with stale moveTypes (no 'longDistance') now matches after fix", () => {
  // This is the exact production bug. Before the fix, this returned false
  // and the TX→FL lead never showed in the Matched-for-you tab.
  const moverWithStaleTypes = nationwideTexasMover({
    onboarding: { answers: { moveTypes: ['apartment', 'home', 'office'] } },
  });
  const lead = leadTxToFl();

  // Origin + nationwide pass — coverage is fine.
  assert.equal(isLeadInMoverCoverageStrict(lead, moverWithStaleTypes), true);

  // After fix: derivedMoveType for a 3 Bedroom long-distance lead is 'home'
  // (derived from homeSize, NOT 'longDistance' from distance).
  assert.equal(
    derivedMoveType(lead),
    'home',
    'derivedMoveType must derive from homeSize, not from distance — distance is gated by maxDistance'
  );

  // moveTypes preference includes 'home' → matchesMoveTypes returns true.
  assert.equal(matchesMoveTypes(moverWithStaleTypes, lead), true);

  // Full strict matcher therefore returns true — fix verified.
  assert.equal(
    doesLeadMatchMoverPreferencesStrict(lead, moverWithStaleTypes),
    true,
    'OPERATOR REPRO: TX→FL with stale moveTypes must match for a nationwide mover after the fix'
  );
});

// ── B. Companion: the symmetric TX→TX case should still match too ──────

test('B1. TX→TX (local) with the SAME stale moveTypes still matches (no regression)', () => {
  const moverWithStaleTypes = nationwideTexasMover({
    onboarding: { answers: { moveTypes: ['apartment', 'home', 'office'] } },
  });
  const lead = leadTxToTx();
  assert.equal(doesLeadMatchMoverPreferencesStrict(lead, moverWithStaleTypes), true);
});

// ── C. Legitimate distance filter must still work ───────────────────────
// The fix decouples moveTypes from distance. The distance filter
// (User.maxDistance) must continue to gate correctly — otherwise we'd
// open a hole in the matcher.

test("C1. maxDistance='Local' still rejects long-distance leads", () => {
  const moverLocalOnly = nationwideTexasMover({ maxDistance: 'Local' });
  const lead = leadTxToFl(); // distance = 'Long Distance'
  assert.equal(
    doesLeadMatchMoverPreferencesStrict(lead, moverLocalOnly),
    false,
    "Long-distance lead must still be rejected when mover maxDistance='Local'"
  );
});

test("C2. maxDistance='Long Distance' still rejects local leads", () => {
  const moverLongOnly = nationwideTexasMover({ maxDistance: 'Long Distance' });
  const lead = leadTxToTx(); // distance = 'Local'
  assert.equal(
    doesLeadMatchMoverPreferencesStrict(lead, moverLongOnly),
    false,
    "Local lead must still be rejected when mover maxDistance='Long Distance'"
  );
});

test("C3. maxDistance='' (Both) still accepts both distances", () => {
  const moverBoth = nationwideTexasMover({ maxDistance: '' });
  assert.equal(doesLeadMatchMoverPreferencesStrict(leadTxToFl(), moverBoth), true, 'Both should accept long-distance');
  assert.equal(doesLeadMatchMoverPreferencesStrict(leadTxToTx(), moverBoth), true, 'Both should accept local');
});

// ── D. Legitimate categorical moveTypes filter must still work ──────────
// The fix removed only the distance-based branch from derivedMoveType.
// Home-size-based derivation must still classify correctly so that
// movers with moveTypes=['apartment'] still reject 'home'-sized leads,
// and explicit lead.moveType still wins.

// 2026-05-28 — PR-C4: the categorical moveTypes / avoidMoveTypes filter
// has been retired (matchesMoveTypes always returns true now). D1-D3
// were originally regression guards for that filter's narrow behavior
// (apartment vs home, avoidMoveTypes rejection). After PR-C4 they
// invert: the gate is permissive, so leads pass regardless of stale
// preferences. derivedMoveType itself is unchanged — D4, E1, E2 still
// pin it as a pure classifier.

test("D1. PR-C4: mover with moveTypes=['apartment'] now MATCHES a 3 Bedroom lead (filter retired)", () => {
  const moverApartmentOnly = nationwideTexasMover({
    onboarding: { answers: { moveTypes: ['apartment'] } },
  });
  const lead3BR = leadTxToTx({ homeSize: '3 Bedroom' });
  // derivedMoveType is unchanged — still classifies 3 Bedroom as 'home'.
  assert.equal(derivedMoveType(lead3BR), 'home');
  // But the matcher no longer filters on it. The visible Settings
  // (preferredHomeSizes, distance, pickup/delivery) are the complete
  // dispatch picture now.
  assert.equal(
    doesLeadMatchMoverPreferencesStrict(lead3BR, moverApartmentOnly),
    true,
    'PR-C4: matchesMoveTypes always passes; stale moveTypes preference must not filter'
  );
});

test("D2. PR-C4: mover with moveTypes=['apartment'] still MATCHES a Studio lead (filter retired, same outcome)", () => {
  const moverApartmentOnly = nationwideTexasMover({
    onboarding: { answers: { moveTypes: ['apartment'] } },
  });
  const leadStudio = leadTxToTx({ homeSize: 'Studio' });
  assert.equal(derivedMoveType(leadStudio), 'apartment');
  assert.equal(doesLeadMatchMoverPreferencesStrict(leadStudio, moverApartmentOnly), true);
});

test('D3. PR-C4: avoidMoveTypes is ignored — match passes regardless of stale avoids', () => {
  const moverAvoidsHome = nationwideTexasMover({
    onboarding: { answers: { moveTypes: ['apartment', 'home'], avoidMoveTypes: ['home'] } },
  });
  const lead3BR = leadTxToTx({ homeSize: '3 Bedroom' });
  // derivedMoveType still resolves to 'home', but avoidMoveTypes is
  // no longer consulted (filter retired). Lead matches.
  assert.equal(
    doesLeadMatchMoverPreferencesStrict(lead3BR, moverAvoidsHome),
    true,
    'PR-C4: avoidMoveTypes must not filter — Settings is the sole dispatch authority'
  );
});

test('D4. explicit lead.moveType still wins over homeSize derivation', () => {
  const lead = leadTxToTx({ moveType: 'commercial', homeSize: '3 Bedroom' });
  // moveType wins; derivedMoveType returns the explicit value verbatim.
  assert.equal(derivedMoveType(lead), 'commercial');
});

// ── E. derivedMoveType: distance no longer affects classification ──────

test('E1. derivedMoveType ignores distance entirely', () => {
  // Same lead shape, swap distance — derived value must NOT change.
  const local = { homeSize: '3 Bedroom', distance: 'Local' };
  const long  = { homeSize: '3 Bedroom', distance: 'Long Distance' };
  assert.equal(derivedMoveType(local), derivedMoveType(long), 'distance must not change the categorical derivation');
  assert.equal(derivedMoveType(long), 'home', 'should derive from homeSize');
});

test("E2. derivedMoveType returns null when no homeSize is available (still permissive)", () => {
  // Permissive default: no homeSize → can't classify → null → matcher
  // treats as "don't filter".
  assert.equal(derivedMoveType({ distance: 'Long Distance' }), null);
  assert.equal(derivedMoveType({}), null);
});

// ── F. Sanity: the distance-based branch is gone from the source ───────

test("F. The 'longDistance' distance-override branch is removed from derivedMoveType", () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'utils', 'dispatchPolicy.js'), 'utf8');
  // Pin the absence of the exact override. The documentation comment
  // mentions the old behavior on purpose — only the executable branch
  // must be gone.
  assert.doesNotMatch(
    src,
    /if\s*\(\s*lead\.distance\s*===\s*['"]Long Distance['"]\s*\)\s*return\s+['"]longDistance['"]/,
    'derivedMoveType must not contain the distance-based override branch'
  );
});

console.log('moveTypes distance-override fix tests scheduled.');
