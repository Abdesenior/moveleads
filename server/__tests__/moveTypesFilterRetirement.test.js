/**
 * Move Types Filter Retirement (PR-C4) lock-in.
 *
 * Before this PR, dispatchPolicy.matchesMoveTypes filtered dispatch based
 * on user.onboarding.answers.moveTypes / avoidMoveTypes. No current UI
 * ever wrote those fields (the active onboarding wizard does not collect
 * them, Settings does not write them, no admin tool writes them). But
 * legacy movers carried over from a previous wizard version had stale
 * values — which silently filtered their dispatch with no UI to inspect
 * or change.
 *
 * Same shape as the PR-C3 alertChannels retirement. Per the
 * "no hidden backend prefs" principle ([[no-hidden-backend-prefs]]),
 * PR-C4 retires the moveTypes read. The schema fields stay dormant
 * (do NOT delete — would mutate historical records on save).
 *
 * What this suite locks in:
 *
 *   A. matchesMoveTypes ALWAYS returns true. Stale moveTypes /
 *      avoidMoveTypes have no effect on dispatch.
 *   B. evalMoveType collapses to a single code MOVE_TYPE_FILTER_RETIRED
 *      with pass: true. Evidence still surfaces `derived` so the trace
 *      remains informative. The five prior codes (MOVE_TYPE_NO_PREFERENCE
 *      / _UNCLASSIFIED / _IN_AVOIDS / _IN_PREFS / _NOT_IN_PREFS) are
 *      GONE as emitted string literals.
 *   C. derivedMoveType is UNCHANGED — kept as a pure classifier used
 *      for diagnosis evidence. PR #30's distance-decoupling stays.
 *   D. Schema preservation — User.onboarding.answers.moveTypes /
 *      avoidMoveTypes stay defined (dormant). ANSWER_KEYS whitelist
 *      still includes them so legacy clients don't 400.
 *   E. smsClaim drops moveTypesConfigured from readiness and moveTypes
 *      from the onboardingPreview payload. SmsClaim.jsx no longer
 *      renders the "Move types selected" ReadyRow or the
 *      "Move types" display row.
 *   F. Load-bearing logic untouched — call sites in leadMatching.js,
 *      twilioService.js, emailService.js still invoke matchesMoveTypes
 *      (the function returns true, no caller needs to change shape).
 *      Strict matcher path stays intact.
 *
 * Pure-Node, no Mongo. Run:
 *   `node server/__tests__/moveTypesFilterRetirement.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { matchesMoveTypes, derivedMoveType } = require('../utils/dispatchPolicy');
const { __internals: diag } = require('../utils/matcherDiagnosis');
const { doesLeadMatchMoverPreferences, doesLeadMatchMoverPreferencesStrict } = require('../utils/leadMatching');

const repoRoot = path.join(__dirname, '..', '..');
const dispatchPolicySrc = fs.readFileSync(path.join(repoRoot, 'server', 'utils',  'dispatchPolicy.js'),    'utf8');
const matcherDiagSrc    = fs.readFileSync(path.join(repoRoot, 'server', 'utils',  'matcherDiagnosis.js'),  'utf8');
const leadMatchingSrc   = fs.readFileSync(path.join(repoRoot, 'server', 'utils',  'leadMatching.js'),      'utf8');
const twilioSrc         = fs.readFileSync(path.join(repoRoot, 'server', 'services','twilioService.js'),    'utf8');
const emailSrc          = fs.readFileSync(path.join(repoRoot, 'server', 'services','emailService.js'),     'utf8');
const userSchemaSrc     = fs.readFileSync(path.join(repoRoot, 'server', 'models', 'User.js'),              'utf8');
const onboardingSrc     = fs.readFileSync(path.join(repoRoot, 'server', 'routes', 'onboarding.js'),        'utf8');
const smsClaimSrc       = fs.readFileSync(path.join(repoRoot, 'server', 'routes', 'smsClaim.js'),          'utf8');
const smsClaimUiSrc     = fs.readFileSync(path.join(repoRoot, 'client', 'src', 'pages', 'dashboard', 'SmsClaim.jsx'), 'utf8');

// ── A. matchesMoveTypes always returns true ─────────────────────────────

test('A1. matchesMoveTypes: empty/missing moveTypes → true (was true before, still true)', () => {
  assert.equal(matchesMoveTypes({}, {}), true);
  assert.equal(matchesMoveTypes({ onboarding: { answers: {} } }, {}), true);
});

test('A2. matchesMoveTypes: stale moveTypes=[apartment] + 3 Bedroom lead → true (the PR-C4 fix)', () => {
  // Before PR-C4: derivedMoveType('3 Bedroom')='home', 'home' NOT in
  // ['apartment'] → returned false → lead silently dropped.
  // After PR-C4: function returns true regardless.
  const u = { onboarding: { answers: { moveTypes: ['apartment'] } } };
  const l = { homeSize: '3 Bedroom' };
  assert.equal(matchesMoveTypes(u, l), true);
});

test('A3. matchesMoveTypes: stale avoidMoveTypes=[home] + 3 Bedroom lead → true (avoid is ignored too)', () => {
  // Before PR-C4: derived='home', avoidMoveTypes includes 'home'
  // → returned false → lead dropped.
  // After PR-C4: still true.
  const u = { onboarding: { answers: { moveTypes: ['apartment', 'home'], avoidMoveTypes: ['home'] } } };
  const l = { homeSize: '3 Bedroom' };
  assert.equal(matchesMoveTypes(u, l), true);
});

test('A4. matchesMoveTypes: null/undefined lead or user → still true (no crash)', () => {
  // The signature is preserved; defensive null-handling.
  assert.equal(matchesMoveTypes(null, null), true);
  assert.equal(matchesMoveTypes(undefined, undefined), true);
  assert.equal(matchesMoveTypes({}, null), true);
});

// ── B. evalMoveType collapses to MOVE_TYPE_FILTER_RETIRED ──────────────

test('B1. evalMoveType: always pass=true, code=MOVE_TYPE_FILTER_RETIRED', () => {
  // Sweep through every permutation that used to produce different codes.
  const cases = [
    { mover: {}, lead: { homeSize: 'Studio' } },
    { mover: { onboarding: { answers: { moveTypes: [] } } }, lead: {} },
    { mover: { onboarding: { answers: { moveTypes: ['apartment'] } } }, lead: { homeSize: 'Studio' } },
    { mover: { onboarding: { answers: { moveTypes: ['apartment'] } } }, lead: { homeSize: '3 Bedroom' } },
    { mover: { onboarding: { answers: { moveTypes: ['home'], avoidMoveTypes: ['home'] } } }, lead: { homeSize: '3 Bedroom' } },
    { mover: { onboarding: { answers: { moveTypes: ['office'] } } }, lead: {} }, // no homeSize → unclassified
  ];
  for (const { mover, lead } of cases) {
    const g = diag.evalMoveType(lead, mover);
    assert.equal(g.gate, 'moveType');
    assert.equal(g.pass, true);
    assert.equal(g.code, 'MOVE_TYPE_FILTER_RETIRED');
  }
});

test('B2. evalMoveType: evidence still surfaces derived classification', () => {
  // The trace is still informative — operators can see "we classified
  // this lead as a 'home' move" even though the gate doesn't filter.
  const g = diag.evalMoveType({ homeSize: '3 Bedroom' }, { onboarding: { answers: { moveTypes: ['apartment'] } } });
  assert.equal(g.evidence.derived, 'home');

  const gStudio = diag.evalMoveType({ homeSize: 'Studio' }, {});
  assert.equal(gStudio.evidence.derived, 'apartment');

  const gNull = diag.evalMoveType({}, {});
  assert.equal(gNull.evidence.derived, null);
});

test('B3. The five retired codes are NOT emitted as string literals in matcherDiagnosis.js', () => {
  // Source-level pin. If anyone re-introduces these as code emissions
  // (i.e., quoted), this test fails. Comments mentioning them are
  // allowed — that's documentation.
  const retired = [
    'MOVE_TYPE_NO_PREFERENCE',
    'MOVE_TYPE_UNCLASSIFIED',
    'MOVE_TYPE_IN_AVOIDS',
    'MOVE_TYPE_IN_PREFS',
    'MOVE_TYPE_NOT_IN_PREFS',
  ];
  for (const code of retired) {
    const quoted = new RegExp(`['"\`]${code}['"\`]`);
    assert.ok(
      !quoted.test(matcherDiagSrc),
      `Retired diagnosis code '${code}' must not be emitted as a string literal in matcherDiagnosis.js`
    );
  }
});

// ── C. derivedMoveType is unchanged (pure classifier kept alive) ───────

test('C1. derivedMoveType still classifies homeSize as before (apartment/home/office)', () => {
  assert.equal(derivedMoveType({ homeSize: 'Studio' }), 'apartment');
  assert.equal(derivedMoveType({ homeSize: '1 Bedroom' }), 'apartment');
  assert.equal(derivedMoveType({ homeSize: '2 Bedroom' }), 'home');
  assert.equal(derivedMoveType({ homeSize: '3 Bedroom' }), 'home');
  assert.equal(derivedMoveType({ homeSize: '4+ Bedroom' }), 'home');
});

test('C2. derivedMoveType still honors PR #30 — distance does NOT influence classification', () => {
  // PR #30 fix is preserved. A Long Distance 3 BR move still classifies
  // as 'home', not 'longDistance'.
  assert.equal(derivedMoveType({ homeSize: '3 Bedroom', distance: 'Long Distance' }), 'home');
  assert.equal(derivedMoveType({ homeSize: 'Studio', distance: 'Long Distance' }), 'apartment');
});

test('C3. derivedMoveType: explicit lead.moveType still wins', () => {
  assert.equal(derivedMoveType({ moveType: 'commercial', homeSize: '3 Bedroom' }), 'commercial');
  assert.equal(derivedMoveType({ moveType: 'storage' }), 'storage');
});

// ── D. Schema + ANSWER_KEYS preservation (dormant, not deleted) ────────

test('D1. User.js still defines moveTypes + avoidMoveTypes in the schema (dormant)', () => {
  // Operator preference: dormant-vs-deprecated. Mongoose would strip
  // these on .save() if deleted, silently mutating historical records.
  assert.match(userSchemaSrc, /\bmoveTypes\b/);
  assert.match(userSchemaSrc, /\bavoidMoveTypes\b/);
});

test('D2. onboarding.js still includes moveTypes + avoidMoveTypes in ANSWER_KEYS', () => {
  // Legacy clients sending these keys must not 400. The route accepts
  // the write; nothing reads it after PR-C4.
  assert.match(onboardingSrc, /['"]moveTypes['"]/);
  assert.match(onboardingSrc, /['"]avoidMoveTypes['"]/);
});

test('D3. dispatchPolicy.js matchesMoveTypes does NOT read onboarding.answers', () => {
  // Pin the retirement. Find the matchesMoveTypes function body and
  // assert it doesn't touch the answers payload anymore.
  const fnBody = dispatchPolicySrc.match(/function matchesMoveTypes\([^)]*\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fnBody, 'matchesMoveTypes function must be findable in dispatchPolicy.js');
  assert.doesNotMatch(
    fnBody[0],
    /onboarding/,
    'matchesMoveTypes body must not reference onboarding.answers anymore'
  );
  assert.doesNotMatch(
    fnBody[0],
    /\bavoidMoveTypes\b/,
    'matchesMoveTypes body must not reference avoidMoveTypes'
  );
});

test('D4. dispatchPolicy.js contains the PR-C4 audit-trail comment', () => {
  assert.match(
    dispatchPolicySrc,
    /PR-C4:\s*filter retired/i,
    'Audit-trail comment must remain so future contributors understand the retirement'
  );
});

// ── E. smsClaim drops moveTypes from readiness + preview + UI ──────────

test('E1. smsClaim buildReadiness no longer emits moveTypesConfigured', () => {
  // Pin: the field is no longer DECLARED or RETURNED. Audit-trail
  // comments that mention the name are allowed (documentation).
  const fnBody = smsClaimSrc.match(/function buildReadiness[\s\S]*?\n\}/);
  assert.ok(fnBody, 'buildReadiness must be findable');
  assert.doesNotMatch(
    fnBody[0],
    /const\s+moveTypesConfigured\s*=/,
    'buildReadiness must no longer declare moveTypesConfigured'
  );
  // And no longer return it as a property (a bare `moveTypesConfigured,`
  // or `moveTypesConfigured\n` inside the return object).
  assert.doesNotMatch(
    fnBody[0],
    /^\s*moveTypesConfigured\s*[,\n]/m,
    'buildReadiness return object must no longer include moveTypesConfigured'
  );
});

test('E2. smsClaim buildOnboardingPreview no longer surfaces moveTypes', () => {
  const fnBody = smsClaimSrc.match(/function buildOnboardingPreview[\s\S]*?\n\}/);
  assert.ok(fnBody, 'buildOnboardingPreview must be findable');
  assert.doesNotMatch(
    fnBody[0],
    /moveTypes:/,
    "buildOnboardingPreview must no longer return a 'moveTypes' field"
  );
});

test('E3. SmsClaim.jsx no longer renders the "Move types" ReadyRow or display row', () => {
  assert.doesNotMatch(smsClaimUiSrc, /moveTypesConfigured/);
  assert.doesNotMatch(smsClaimUiSrc, /label="Move types"/);
});

// ── F. Load-bearing logic untouched ────────────────────────────────────

test('F1. leadMatching.js still calls matchesMoveTypes in both matchers (call sites preserved)', () => {
  // Per operator: do NOT remove call sites. The function returns true
  // now, so the calls are no-ops, but the call shape stays intact so
  // future reintroductions (if any) are surgical.
  const calls = (leadMatchingSrc.match(/matchesMoveTypes\(/g) || []).length;
  assert.ok(calls >= 2, `Expected ≥2 call sites to matchesMoveTypes in leadMatching.js, found ${calls}`);
});

test('F2. twilioService.js + emailService.js still call matchesMoveTypes (broadcaster shape preserved)', () => {
  assert.match(twilioSrc, /matchesMoveTypes\(/);
  assert.match(emailSrc,  /matchesMoveTypes\(/);
});

test('F3. dispatchPolicy.js still exports the same four helpers', () => {
  const policy = require('../utils/dispatchPolicy');
  assert.equal(typeof policy.wantsChannel, 'function');
  assert.equal(typeof policy.isWithinDispatchHours, 'function');
  assert.equal(typeof policy.matchesMoveTypes, 'function');
  assert.equal(typeof policy.derivedMoveType, 'function');
});

test('F4. Strict matcher still produces correct outcomes given visible-Settings inputs', () => {
  // Sanity: confirm the strict matcher operates on coverage + distance
  // + homeSize alone now. moveTypes can be anything — it doesn't matter.
  const mover = {
    pickupStates: ['TX'], deliveryStates: [], deliversNationwide: true,
    maxDistance: '', preferredHomeSizes: [],
    onboarding: { answers: { moveTypes: ['apartment'], avoidMoveTypes: ['home'] } }, // stale junk
  };
  const lead = {
    originState: 'TX', originZip: '75070',
    destinationState: 'FL', destinationZip: '34470',
    distance: 'Long Distance', homeSize: '3 Bedroom',
  };
  assert.equal(
    doesLeadMatchMoverPreferencesStrict(lead, mover),
    true,
    'Strict matcher must produce match for a Settings-visible-positive lead even with stale moveTypes junk'
  );
});

test('F5. Legacy matcher also unaffected by stale moveTypes', () => {
  const mover = {
    deliversNationwide: true, maxDistance: '', preferredHomeSizes: [],
    serviceStates: ['TX'],
    onboarding: { answers: { moveTypes: ['apartment'], avoidMoveTypes: ['home'] } },
  };
  const lead = {
    originState: 'TX', originZip: '75070',
    destinationState: 'FL', destinationZip: '34470',
    distance: 'Long Distance', homeSize: '3 Bedroom',
  };
  assert.equal(
    doesLeadMatchMoverPreferences(lead, mover, new Set()),
    true,
    'Legacy matcher must also pass stale-moveTypes movers'
  );
});

console.log('Move Types Filter Retirement (PR-C4) tests scheduled.');
