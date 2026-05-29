/**
 * receiveLiveTransfers filter retirement (PR-D7) lock-in.
 *
 * Last "hidden backend pref" landmine surfaced by the dashboard audit
 * (docs/audits/mover-dashboard/04-settings.md OC-1).
 *
 * Until this PR, `User.receiveLiveTransfers` was read by:
 *   1. `server/utils/findEligibleMovers.js:83` — aggregation filter
 *      gating which movers join the warm-transfer eligibility set
 *   2. `server/routes/voice.js:73` — in-memory filter on the eligible
 *      list before warm-transfer dial
 *
 * The field was set ONLY by the onboarding wizard
 * (`server/routes/onboarding.js:103`). No Settings UI, no admin tool,
 * no Profile page. Same shape as PR-C3 (alertChannels) and PR-C4
 * (moveTypes) — a backend pref that drives dispatch with no
 * mover-facing way to inspect or change it.
 *
 * Voice routes are currently unmounted (server.js:98-118), so the
 * filter was effectively dormant in production already. PR-D7 makes
 * the architecture state explicit by removing both read sites. The
 * schema field stays dormant per the dormant-vs-deprecated discipline.
 *
 * What this suite locks in:
 *
 *   A. findEligibleMovers.js no longer emits the
 *      `$eq: ['$receiveLiveTransfers', true]` aggregation clause AND
 *      no longer projects the field in Stage 5
 *   B. routes/voice.js no longer filters on `receiveLiveTransfers`
 *      in its in-memory candidate list (money-safety
 *      `balance >= 50` filter MUST stay intact)
 *   C. The User schema still defines the field (dormant)
 *   D. ANSWER_KEYS whitelist still includes 'receiveLiveTransfers'
 *      so legacy onboarding clients don't 400
 *   E. Audit-trail comments are present in both modified files
 *   F. Server.js dormancy block reflects the FILTER retirement but
 *      keeps the schema-field permanence call-out
 *
 * Pure-Node, no Mongo. Run:
 *   `node server/__tests__/receiveLiveTransfersRetirement.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const findEligibleSrc = fs.readFileSync(path.join(serverRoot, 'utils', 'findEligibleMovers.js'), 'utf8');
const voiceSrc        = fs.readFileSync(path.join(serverRoot, 'routes', 'voice.js'),             'utf8');
const userSchemaSrc   = fs.readFileSync(path.join(serverRoot, 'models', 'User.js'),              'utf8');
const onboardingSrc   = fs.readFileSync(path.join(serverRoot, 'routes', 'onboarding.js'),        'utf8');
const serverSrc       = fs.readFileSync(path.join(serverRoot, 'server.js'),                       'utf8');

// Strip JS comments so audit-trail mentions don't false-positive when
// we scan for the retired strings.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const findEligibleExec = stripComments(findEligibleSrc);
const voiceExec        = stripComments(voiceSrc);

// ── A. findEligibleMovers.js retirements ────────────────────────────────

test("A1. findEligibleMovers.js no longer emits the `$eq receiveLiveTransfers true` aggregation clause", () => {
  // The exact $eq match-expression that gated the user join is the
  // load-bearing reason this filter ever ran. Pin its absence in
  // executable code (comments stripped).
  assert.doesNotMatch(
    findEligibleExec,
    /\$eq:\s*\[\s*['"]\$receiveLiveTransfers['"]/,
    "findEligibleMovers.js must not emit a `$eq: ['$receiveLiveTransfers', ...]` clause"
  );
});

test('A2. findEligibleMovers.js no longer projects receiveLiveTransfers in Stage 5', () => {
  // The $project block previously surfaced this field for downstream
  // callers. Once the filter is retired the projection is pure waste
  // — drop it for cleanliness.
  assert.doesNotMatch(
    findEligibleExec,
    /receiveLiveTransfers:\s*1/,
    "findEligibleMovers.js must not project receiveLiveTransfers in any $project stage"
  );
});

test('A3. findEligibleMovers.js still self-joins on origin → destination CoverageArea (regression guard)', () => {
  // The retirement only touches the user-join stage; the typed-zip
  // self-join is the load-bearing logic of this file. Pin its shape.
  assert.match(findEligibleExec, /\$lookup/);
  assert.match(findEligibleExec, /coverage_areas/);
  assert.match(findEligibleExec, /destCoverage/);
});

test('A4. findEligibleMovers.js still filters users by mover-role set (regression guard)', () => {
  // The role gate stays in place — only the receiveLiveTransfers gate
  // is retired.
  //
  // 2026-05-28 (PR #48 "mover role alignment"): the role filter widened
  // from a single literal `$eq: ['$role', 'customer']` to a multi-value
  // `$in: ['$role', ['customer', 'mover']]`. Reason: production accounts
  // were being created with role='mover' but the pipeline filter only
  // admitted 'customer', silently dropping them from eligibility joins.
  // The current invariant we lock in here is the existence of a role
  // filter that admits BOTH the legacy 'customer' role AND the current
  // 'mover' role. A future contributor who shrinks this back to the
  // single literal re-introduces the PR #48 bug.
  assert.match(
    findEligibleExec,
    /\$in\s*:\s*\[\s*['"]\$role['"]\s*,\s*\[\s*['"]customer['"]\s*,\s*['"]mover['"]\s*\]\s*\]/,
    "Role filter must remain as `$in: ['$role', ['customer', 'mover']]` — admits both legacy and current mover roles (PR #48)"
  );
});

// ── B. voice.js retirement (money-safety gate preserved) ────────────────

test('B1. voice.js no longer filters on `receiveLiveTransfers === true`', () => {
  // The in-memory filter in the warm-transfer dial path. Pin the
  // absence of the retired clause in executable code.
  assert.doesNotMatch(
    voiceExec,
    /receiveLiveTransfers\s*===\s*true/,
    "voice.js must not filter on `m.receiveLiveTransfers === true` anymore"
  );
});

test('B2. voice.js money-safety filter (balance >= 50) STAYS intact', () => {
  // The balance gate is a separate concern (cost control + ensuring
  // mover can actually claim the call). Must remain.
  assert.match(
    voiceExec,
    /m\.balance\s*>=\s*50/,
    "voice.js must still gate warm-transfer movers on `m.balance >= 50`"
  );
});

// ── C. User schema still defines the field (dormant) ────────────────────

test('C1. User.js still defines `receiveLiveTransfers` as a schema field', () => {
  // Per dormant-vs-deprecated discipline: do NOT delete schema fields.
  // Mongoose would strip the field on .save() and silently mutate
  // historical records.
  assert.match(
    userSchemaSrc,
    /receiveLiveTransfers:\s*\{\s*type:\s*Boolean/,
    "User.receiveLiveTransfers schema field must remain defined (dormant)"
  );
});

// ── D. ANSWER_KEYS whitelist preservation ───────────────────────────────

test("D1. onboarding.js ANSWER_KEYS still includes 'receiveLiveTransfers'", () => {
  // Legacy onboarding clients still send this key in their payload.
  // Removing it from the whitelist would 400 those requests. Nothing
  // reads the stored value after PR-D7, so leaving the write is
  // harmless.
  assert.match(
    onboardingSrc,
    /['"]receiveLiveTransfers['"]/,
    "ANSWER_KEYS whitelist must still contain 'receiveLiveTransfers'"
  );
});

// ── E. Audit-trail comments present ─────────────────────────────────────

test('E1. findEligibleMovers.js contains the PR-D7 audit-trail comment', () => {
  assert.match(
    findEligibleSrc,
    /PR-D7:.*receiveLiveTransfers.*retired/is,
    "Audit-trail comment must explain the filter retirement in findEligibleMovers.js"
  );
});

test('E2. voice.js contains the PR-D7 audit-trail comment', () => {
  assert.match(
    voiceSrc,
    /PR-D7:.*receiveLiveTransfers.*dropped/is,
    "Audit-trail comment must explain the filter drop in voice.js"
  );
});

// ── F. server.js dormancy block reflects the retirement ─────────────────

test('F1. server.js voice-dormancy block still calls out the schema field as permanent', () => {
  // The comment block at server.js:98-118 documents what stays on
  // disk for the unmounted voice flow. After PR-D7 the
  // findEligibleMovers.js note should reflect that the FILTER is
  // retired but the schema field stays.
  assert.match(
    serverSrc,
    /User\.receiveLiveTransfers\s*\([^)]*schema field/,
    "server.js dormancy block must still mention User.receiveLiveTransfers as a permanent schema field"
  );
  assert.match(
    serverSrc,
    /FILTER retired in PR-D7/,
    "server.js dormancy block must record the PR-D7 retirement"
  );
});

console.log('receiveLiveTransfers retirement (PR-D7) tests scheduled.');
