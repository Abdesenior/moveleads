/**
 * preferredHomeSizes Filter Retirement lock-in (2026-06-07).
 *
 * Before this change, leadMatching.js (both the legacy and strict matcher)
 * filtered dispatch based on user.preferredHomeSizes. Settings exposed a
 * "Preferred Home Sizes" dropdown that wrote values like ['3 Bedroom',
 * '4+ Bedroom']. Movers with stale values were silently filtered out of
 * leads they could handle — same anti-pattern PR-C3 (alertChannels) and
 * PR-C4 (moveTypes) retired.
 *
 * This pass mirrors that posture: the matcher read is gone, the User
 * schema field stays dormant, and the Settings UI stays writable for
 * forward compatibility. Mover should never miss a lead because of a
 * hidden home-size preference.
 *
 * What this suite locks in:
 *
 *   A. doesLeadMatchMoverPreferences (legacy matcher) ignores
 *      preferredHomeSizes — a lead with any homeSize matches a mover
 *      with any preferredHomeSizes value, as long as coverage + distance
 *      pass.
 *
 *   B. doesLeadMatchMoverPreferencesStrict (strict matcher) ignores
 *      preferredHomeSizes — same semantics.
 *
 *   C. evalHomeSize collapses to a single code HOME_SIZE_FILTER_RETIRED
 *      with pass: true. Evidence still surfaces preferredHomeSizes +
 *      leadHomeSize so the diagnostic trace stays informative.
 *
 *   D. The four prior emitted codes (HOME_SIZE_NO_PREFERENCE,
 *      HOME_SIZE_MISSING_ON_LEAD, HOME_SIZE_IN_PREFS,
 *      HOME_SIZE_NOT_IN_PREFS) are GONE from matcherDiagnosis.js source.
 *
 *   E. Schema preservation — User.preferredHomeSizes stays defined
 *      (dormant). Don't delete; would mutate historical records on save.
 *
 *   F. Settings.jsx still writes preferredHomeSizes — the UI continues
 *      to function. PUT /api/users/:id continues to accept the field
 *      via the schema. No client-side break.
 *
 *   G. matcherDiagnosis.js's mover snapshot at the bottom of the file
 *      still includes preferredHomeSizes for evidence purposes.
 *
 * Pure-Node, no Mongo. Run:
 *   node server/__tests__/preferredHomeSizesRetired.test.js
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

const { doesLeadMatchMoverPreferences, doesLeadMatchMoverPreferencesStrict } = require('../utils/leadMatching');
const { __internals: diag } = require('../utils/matcherDiagnosis');

const repoRoot          = path.join(__dirname, '..', '..');
const leadMatchingSrc   = fs.readFileSync(path.join(repoRoot, 'server', 'utils',  'leadMatching.js'),     'utf8');
const matcherDiagSrc    = fs.readFileSync(path.join(repoRoot, 'server', 'utils',  'matcherDiagnosis.js'), 'utf8');
const userSchemaSrc     = fs.readFileSync(path.join(repoRoot, 'server', 'models', 'User.js'),             'utf8');
const settingsSrc       = fs.readFileSync(path.join(repoRoot, 'client', 'src', 'pages', 'dashboard', 'Settings.jsx'), 'utf8');

// ── A. Legacy matcher ignores preferredHomeSizes ────────────────────────

test('A1. doesLeadMatchMoverPreferences passes a lead whose homeSize is NOT in mover.preferredHomeSizes', () => {
  const mover = {
    maxDistance: '',
    preferredHomeSizes: ['3 Bedroom', '4+ Bedroom'],
  };
  const lead = {
    originZip: '78701',
    destinationZip: '75201',
    homeSize: '1 Bedroom',
    distance: 'Local',
  };
  // No coverage (empty zip set) → coverage is a no-op. No distance pref.
  // OLD behavior: false (size mismatch). NEW behavior: true.
  assert.equal(
    doesLeadMatchMoverPreferences(lead, mover, new Set()),
    true,
    '1 Bedroom lead must pass even though mover wants 3+ Bedroom — filter is retired'
  );
});

test('A2. doesLeadMatchMoverPreferences passes a lead with no homeSize field at all', () => {
  const mover = { maxDistance: '', preferredHomeSizes: ['3 Bedroom'] };
  const lead  = { originZip: '78701', destinationZip: '75201', distance: 'Local' /* no homeSize */ };
  assert.equal(
    doesLeadMatchMoverPreferences(lead, mover, new Set()),
    true,
    'lead missing homeSize must pass — gate is retired'
  );
});

test('A3. doesLeadMatchMoverPreferences still enforces distance (regression guard)', () => {
  const mover = { maxDistance: 'Long Distance', preferredHomeSizes: [] };
  const lead  = { originZip: '78701', destinationZip: '75201', distance: 'Local', homeSize: '2 Bedroom' };
  assert.equal(
    doesLeadMatchMoverPreferences(lead, mover, new Set()),
    false,
    'distance preference Long Distance must still reject a Local lead'
  );
});

// ── B. Strict matcher ignores preferredHomeSizes ────────────────────────

test('B1. doesLeadMatchMoverPreferencesStrict passes a lead whose homeSize is NOT in mover.preferredHomeSizes', () => {
  const mover = {
    pickupStates: ['NY'],
    deliveryStates: ['CA'],
    deliversNationwide: false,
    maxDistance: '',
    preferredHomeSizes: ['3 Bedroom'],
  };
  const lead = {
    originState: 'NY', destinationState: 'CA',
    distance: 'Long Distance', homeSize: '1 Bedroom',
  };
  assert.equal(
    doesLeadMatchMoverPreferencesStrict(lead, mover, {}),
    true,
    'strict matcher must also ignore preferredHomeSizes'
  );
});

test('B2. doesLeadMatchMoverPreferencesStrict still enforces coverage (regression guard)', () => {
  const mover = {
    pickupStates: ['NY'],
    deliveryStates: ['CA'],
    deliversNationwide: false,
    preferredHomeSizes: [],
  };
  const offCoverageLead = {
    originState: 'TX', destinationState: 'FL',
    distance: 'Long Distance', homeSize: '3 Bedroom',
  };
  assert.equal(
    doesLeadMatchMoverPreferencesStrict(offCoverageLead, mover, {}),
    false,
    'coverage gate must still fire'
  );
});

// ── C. evalHomeSize collapses to HOME_SIZE_FILTER_RETIRED ────────────────

test('C1. evalHomeSize emits HOME_SIZE_FILTER_RETIRED with pass:true (mover has prefs + lead has size)', () => {
  const r = diag.evalHomeSize(
    { homeSize: '1 Bedroom' },
    { preferredHomeSizes: ['3 Bedroom'] }
  );
  assert.equal(r.pass, true);
  assert.equal(r.code, 'HOME_SIZE_FILTER_RETIRED');
  assert.equal(r.gate, 'homeSize');
  assert.deepEqual(r.evidence.preferredHomeSizes, ['3 Bedroom']);
  assert.equal(r.evidence.leadHomeSize, '1 Bedroom');
});

test('C2. evalHomeSize emits HOME_SIZE_FILTER_RETIRED when mover has no preferences', () => {
  const r = diag.evalHomeSize({ homeSize: '2 Bedroom' }, {});
  assert.equal(r.pass, true);
  assert.equal(r.code, 'HOME_SIZE_FILTER_RETIRED');
  assert.deepEqual(r.evidence.preferredHomeSizes, []);
});

test('C3. evalHomeSize emits HOME_SIZE_FILTER_RETIRED when lead has no homeSize', () => {
  const r = diag.evalHomeSize({}, { preferredHomeSizes: ['3 Bedroom'] });
  assert.equal(r.pass, true);
  assert.equal(r.code, 'HOME_SIZE_FILTER_RETIRED');
  assert.equal(r.evidence.leadHomeSize, null);
});

// ── D. Prior emitted codes are GONE from matcherDiagnosis.js source ─────

test('D1. matcherDiagnosis.js does not emit HOME_SIZE_NO_PREFERENCE as a code literal', () => {
  // The string can still appear in inline comments, but not as a literal
  // 'HOME_SIZE_NO_PREFERENCE' in source (which would mean an evalHomeSize
  // branch is still returning that code). Quick proxy: not as a string
  // literal followed by , (typical code field).
  assert.doesNotMatch(matcherDiagSrc, /['"]HOME_SIZE_NO_PREFERENCE['"]\s*,/);
});

test('D2. matcherDiagnosis.js does not emit HOME_SIZE_MISSING_ON_LEAD', () => {
  assert.doesNotMatch(matcherDiagSrc, /['"]HOME_SIZE_MISSING_ON_LEAD['"]\s*,/);
});

test('D3. matcherDiagnosis.js does not emit HOME_SIZE_IN_PREFS or HOME_SIZE_NOT_IN_PREFS', () => {
  assert.doesNotMatch(matcherDiagSrc, /['"]HOME_SIZE_IN_PREFS['"]\s*,/);
  assert.doesNotMatch(matcherDiagSrc, /['"]HOME_SIZE_NOT_IN_PREFS['"]\s*,/);
});

test('D4. matcherDiagnosis.js emits HOME_SIZE_FILTER_RETIRED exactly once', () => {
  const occurrences = matcherDiagSrc.match(/HOME_SIZE_FILTER_RETIRED/g) || [];
  assert.equal(occurrences.length, 1,
    `expected one occurrence of HOME_SIZE_FILTER_RETIRED, found ${occurrences.length}`);
});

// ── E. Schema preservation — User.preferredHomeSizes stays defined ──────

test('E1. User schema still defines preferredHomeSizes', () => {
  assert.match(userSchemaSrc, /preferredHomeSizes:\s*\[\s*String\s*\]/,
    'User.preferredHomeSizes must remain defined as [String] — DO NOT delete (would mutate historical records on save)');
});

// ── F. Settings UI continues to write preferredHomeSizes ────────────────

test('F1. Settings.jsx still PUTs preferredHomeSizes (UI compatibility preserved)', () => {
  assert.match(settingsSrc, /preferredHomeSizes/,
    'Settings.jsx must still reference preferredHomeSizes — the UI continues to function for forward compatibility');
});

// ── G. Matcher source no longer gates on preferredHomeSizes ─────────────

test('G1. leadMatching.js no longer gates the legacy matcher on preferredHomeSizes', () => {
  // The legacy matcher previously did `sizes.length > 0 ... return false`.
  // After retirement, that early-return is gone. We detect this by looking
  // for the gating pattern — `sizes.includes(lead.homeSize)` followed by
  // `return false` in a tight neighborhood.
  assert.doesNotMatch(leadMatchingSrc, /preferredHomeSizes[\s\S]{0,80}return false/,
    'matcher must not return false based on preferredHomeSizes');
});

test('G2. leadMatching.js does NOT execute sizes.includes(lead.homeSize) anywhere', () => {
  // The actual filter pattern was `sizes.includes(lead.homeSize)`. After
  // retirement, that expression must be gone from the file.
  assert.doesNotMatch(leadMatchingSrc, /sizes\.includes\(lead\.homeSize\)/);
});
