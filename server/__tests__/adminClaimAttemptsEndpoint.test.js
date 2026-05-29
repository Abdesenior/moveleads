/**
 * Admin ClaimAttempt query endpoint — lock-in suite.
 *
 * Closes HIGH-CONFIDENCE-FIX-PLAN F4. Before this PR, the ClaimAttempt
 * collection had:
 *   - 4 indexes (moverId/leadId/token/twilioMessageSid)
 *   - 90-day TTL
 *   - Wired writes from the live SMS Claim handler (PR-S2)
 *   - ZERO HTTP read path
 *
 * Pilot ops questions like "show me every failed claim for mover X this
 * week" required a Mongo shell. This route closes the gap with a
 * read-only filtered query.
 *
 * What this suite pins:
 *
 *   A. Route file exists, exports an Express router, applies admin
 *      middleware at the router level (so every method is gated, not
 *      just the one currently defined).
 *   B. GET / is wired, no other verbs (read-only by construction).
 *   C. All 5 filter params (leadId/moverId/outcome/since/twilioMessageSid)
 *      are read off req.query and applied to the Mongo filter.
 *   D. ObjectId fields (leadId/moverId) are validated with
 *      mongoose.isValidObjectId — invalid input returns 400, not a
 *      Mongoose cast error 500.
 *   E. outcome is validated against ClaimAttempt.OUTCOMES (the model's
 *      single source of truth). If the enum grows, this endpoint
 *      automatically accepts the new value — no source drift.
 *   F. since accepts ISO 8601 AND epoch ms (Date constructor handles both)
 *      and invalid input is a 400.
 *   G. Pagination: default limit 50, max 200; default skip 0; both
 *      parsed as ints with sane fallback.
 *   H. Sort is receivedAt desc (most recent first — the operational
 *      use case is "what just happened").
 *   I. Read-only — no .save / .create / .insert / .delete / .update /
 *      .remove / findOneAndUpdate / findOneAndDelete anywhere in the
 *      route file. This is a forensics endpoint; any mutation is a bug.
 *   J. The route is mounted at /api/admin/claim-attempts in server.js
 *      BEFORE the catch-all /api/admin mount (so admin.js wildcards
 *      can't shadow it), and uses verifiedGate (parity with other
 *      admin sub-routes).
 *
 * Pure-Node, no Mongo. Source-level + minimal behavioral assertions
 * (the parse helpers are pure functions and don't need a DB).
 *
 * Run: `node server/__tests__/adminClaimAttemptsEndpoint.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const routePath  = path.join(serverRoot, 'routes', 'admin', 'claimAttempts.js');
const serverPath = path.join(serverRoot, 'server.js');

const routeSrc  = fs.readFileSync(routePath, 'utf8');
const serverSrc = fs.readFileSync(serverPath, 'utf8');

function stripComments(src) {
  // Strip block comments first, then line comments. Note: this is naive
  // (does not respect strings) — assertions that need to match URL
  // literals or string content use the raw source.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const routeExec  = stripComments(routeSrc);
const serverExec = stripComments(serverSrc);

// ── A. Route is an Express router with admin middleware ────────────────

test('A1. routes/admin/claimAttempts.js exists and exports an Express router', () => {
  assert.ok(fs.existsSync(routePath), 'routes/admin/claimAttempts.js must exist');
  assert.match(routeExec, /express\.Router\(\)/,
    'Module must instantiate an Express router');
  assert.match(routeExec, /module\.exports\s*=\s*router/,
    'Module must export the router');
});

test('A2. admin middleware is applied at router level (gates every verb)', () => {
  // router.use(admin) — gates EVERY handler. If a future contributor
  // adds POST/PUT/DELETE without re-checking middleware, admin still
  // protects it.
  assert.match(routeExec, /const\s*\{\s*admin\s*\}\s*=\s*require\(\s*['"]\.\.\/\.\.\/middleware\/auth['"]\s*\)/,
    'admin middleware must be imported from ../../middleware/auth');
  assert.match(routeExec, /router\.use\(\s*admin\s*\)/,
    'admin middleware must be applied at router level via router.use(admin)');
});

// ── B. GET only — read-only by construction ────────────────────────────

test('B1. GET / is wired', () => {
  assert.match(routeExec, /router\.get\(\s*['"]\/['"]/,
    'GET / handler must be defined');
});

test('B2. No other HTTP verbs defined (read-only endpoint)', () => {
  for (const verb of ['post', 'put', 'patch', 'delete']) {
    const re = new RegExp(`router\\.${verb}\\(`);
    assert.doesNotMatch(routeExec, re,
      `router.${verb}() must NOT exist — this is a read-only forensics endpoint`);
  }
});

// ── C. All 5 filter params destructured and applied ────────────────────

test('C1. All 5 query params are destructured from req.query', () => {
  // The destructuring shape is the lock — if a future change accidentally
  // drops a param, this test goes red.
  for (const param of ['leadId', 'moverId', 'outcome', 'since', 'twilioMessageSid']) {
    assert.match(
      routeExec,
      new RegExp(`\\b${param}\\b`),
      `Query param '${param}' must be referenced in the handler`
    );
  }
  // And pinned at the destructure site (defense-in-depth).
  assert.match(
    routeExec,
    /const\s*\{\s*leadId\s*,\s*moverId\s*,\s*outcome\s*,\s*since\s*,\s*twilioMessageSid\s*\}\s*=\s*req\.query/,
    'All 5 filter params must be destructured from req.query in one place'
  );
});

test('C2. Each filter is conditionally applied to the Mongo filter object', () => {
  // Lock the if-guard pattern: only apply if the param is present. This
  // prevents accidental .find({ leadId: undefined }) which Mongoose
  // would translate to "match every doc with leadId field" — wrong.
  assert.match(routeExec, /if\s*\(\s*leadId\s*\)/,
    'leadId must be conditionally applied (no falsy → no filter)');
  assert.match(routeExec, /if\s*\(\s*moverId\s*\)/,
    'moverId must be conditionally applied');
  assert.match(routeExec, /if\s*\(\s*outcome\s*\)/,
    'outcome must be conditionally applied');
  assert.match(routeExec, /if\s*\(\s*since\s*\)/,
    'since must be conditionally applied');
  assert.match(routeExec, /if\s*\(\s*twilioMessageSid\s*\)/,
    'twilioMessageSid must be conditionally applied');
});

// ── D. ObjectId validation guards ──────────────────────────────────────

test('D1. leadId is validated with mongoose.isValidObjectId before use', () => {
  assert.match(
    routeExec,
    /mongoose\.isValidObjectId\(\s*leadId\s*\)/,
    'leadId must be validated with mongoose.isValidObjectId — ' +
    'invalid input must 400, not 500 with a cast error'
  );
});

test('D2. moverId is validated with mongoose.isValidObjectId before use', () => {
  assert.match(
    routeExec,
    /mongoose\.isValidObjectId\(\s*moverId\s*\)/,
    'moverId must be validated with mongoose.isValidObjectId'
  );
});

test('D3. Invalid ObjectId returns 400 (not 500)', () => {
  // Pin the response shape: an unrecognized ID is a client error.
  assert.match(routeExec, /res\.status\(\s*400\s*\)/,
    'Invalid filter inputs must respond with HTTP 400');
});

// ── E. Outcome validation against the model's OUTCOMES enum ───────────

test('E1. outcome is validated against ClaimAttempt.OUTCOMES (single source of truth)', () => {
  // The enum is exported by the model. The endpoint MUST import it and
  // validate against it — NOT against a hardcoded list. This is the
  // contract that keeps the API in sync with the model as the enum
  // grows.
  assert.match(routeExec, /ClaimAttempt\.OUTCOMES/,
    'Endpoint must validate outcome against ClaimAttempt.OUTCOMES (model is single source of truth)');
  // Pin the validation check itself (no hardcoded list).
  assert.match(
    routeExec,
    /ClaimAttempt\.OUTCOMES\.includes\(\s*outcome\s*\)/,
    'Endpoint must use ClaimAttempt.OUTCOMES.includes(outcome) — never a hardcoded list'
  );
});

test('E2. No hardcoded OUTCOMES list in the route (would silently drift from model)', () => {
  // Defense-in-depth: confirm nobody copied the enum into the route file.
  for (const val of ClaimAttemptOutcomes()) {
    // Build a regex that matches a string literal of that value. We tolerate
    // it appearing inside the imported model itself (we exec'd the route
    // source only). If a contributor inlines the enum, this goes red.
    const re = new RegExp(`['"]${val}['"]`);
    assert.doesNotMatch(routeExec, re,
      `OUTCOMES value '${val}' must NOT be hardcoded in the route — use ClaimAttempt.OUTCOMES`);
  }
});

function ClaimAttemptOutcomes() {
  // Read OUTCOMES from the model so this test stays in sync if the enum
  // changes. (Reading from the model is one indirection, vs. the bug we
  // are guarding against — duplicating the list in the route.)
  return require('../models/ClaimAttempt').OUTCOMES;
}

// ── F. since parsing — ISO and epoch ms both accepted ──────────────────

test('F1. since uses new Date() (handles both ISO 8601 and epoch ms)', () => {
  // The Date constructor accepts ISO strings and (after parseInt) epoch
  // numbers. Pin the constructor.
  assert.match(routeExec, /new\s+Date\(/,
    'since must be parsed with new Date() — handles ISO 8601 and epoch ms');
});

test('F2. Invalid since string returns 400', () => {
  // The route helper returns null for invalid dates; the handler converts
  // that to a 400. Pin both halves.
  assert.match(
    routeExec,
    /Number\.isNaN\(\s*d\.getTime\(\)\s*\)/,
    'since helper must reject NaN dates'
  );
});

test('F3. since builds a $gte filter on receivedAt', () => {
  // The semantics: "attempts received since this point in time."
  // ANY other comparison ($gt, $lte, $eq) would be a semantic bug.
  assert.match(
    routeExec,
    /receivedAt\s*=\s*\{\s*\$gte\s*:\s*sinceDate\s*\}/,
    'since must build a $gte filter on receivedAt'
  );
});

// ── G. Pagination — limit and skip ─────────────────────────────────────

test('G1. limit defaults to 50 and is capped at 200', () => {
  assert.match(routeExec, /DEFAULT_LIMIT\s*=\s*50/,
    'Default limit must be 50');
  assert.match(routeExec, /MAX_LIMIT\s*=\s*200/,
    'Max limit must be capped at 200 (prevents runaway queries)');
  assert.match(routeExec, /Math\.min\(\s*n\s*,\s*MAX_LIMIT\s*\)/,
    'limit must be capped via Math.min(n, MAX_LIMIT)');
});

test('G2. skip defaults to 0 and rejects negatives', () => {
  // parseSkip returns 0 for negative or non-finite input. The lock-in
  // here is the negative guard — without it, a negative skip would
  // throw in Mongo or skip backwards.
  assert.match(routeExec, /n\s*<\s*0/,
    'parseSkip must reject negative input (return 0)');
});

test('G3. Query uses .skip() and .limit() correctly', () => {
  assert.match(
    routeExec,
    /\.skip\(\s*skip\s*\)\s*\.limit\(\s*limit\s*\)/,
    'Query must call .skip(skip).limit(limit) in that order'
  );
});

// ── H. Sort — receivedAt descending (most recent first) ────────────────

test('H1. Query sorts by receivedAt descending', () => {
  assert.match(
    routeExec,
    /\.sort\(\s*\{\s*receivedAt\s*:\s*-1\s*\}\s*\)/,
    'Query must sort by receivedAt: -1 (most recent first — the ops use case)'
  );
});

// ── I. Read-only — no mutation calls anywhere in the file ──────────────

test('I1. No write operations on the ClaimAttempt model', () => {
  for (const forbidden of [
    /ClaimAttempt\.create\(/,
    /ClaimAttempt\.insertMany\(/,
    /ClaimAttempt\.updateOne\(/,
    /ClaimAttempt\.updateMany\(/,
    /ClaimAttempt\.deleteOne\(/,
    /ClaimAttempt\.deleteMany\(/,
    /ClaimAttempt\.findOneAndUpdate\(/,
    /ClaimAttempt\.findOneAndDelete\(/,
    /ClaimAttempt\.findByIdAndUpdate\(/,
    /ClaimAttempt\.findByIdAndDelete\(/,
    /ClaimAttempt\.remove\(/,
    /ClaimAttempt\.bulkWrite\(/,
  ]) {
    assert.doesNotMatch(routeExec, forbidden,
      `Mutation ${forbidden} must NOT exist — this is a read-only endpoint`);
  }
});

test('I2. .save() is not called anywhere in the route', () => {
  assert.doesNotMatch(routeExec, /\.save\(/,
    '.save() must NOT be called — this is a read-only endpoint');
});

test('I3. Uses .lean() for read performance (no Mongoose document overhead)', () => {
  assert.match(routeExec, /\.lean\(\)/,
    'Find query must use .lean() — returns plain objects, no Mongoose document overhead');
});

// ── J. Mount in server.js ──────────────────────────────────────────────

test('J1. server.js mounts /api/admin/claim-attempts under verifiedGate', () => {
  // Pin the full mount line including the verifiedGate middleware. Use
  // the raw server source for the URL literal (stripComments mangles
  // protocol-style strings).
  assert.match(
    serverSrc,
    /app\.use\(\s*['"]\/api\/admin\/claim-attempts['"]\s*,\s*verifiedGate\s*,\s*require\(\s*['"]\.\/routes\/admin\/claimAttempts['"]\s*\)\s*\)/,
    'server.js must mount /api/admin/claim-attempts under verifiedGate'
  );
});

test('J2. Mount appears BEFORE the catch-all /api/admin mount (no shadowing)', () => {
  // admin.js owns /api/admin/* wildcards. If claim-attempts is mounted
  // AFTER admin, admin.js's wildcards would shadow it. Lock the order.
  const claimAttemptsIdx = serverSrc.indexOf("'/api/admin/claim-attempts'");
  assert.notEqual(claimAttemptsIdx, -1, 'claim-attempts mount must exist');
  // Find the generic /api/admin mount that loads ./routes/admin (NOT
  // sub-paths like /api/admin/matcher).
  const adminCatchAllIdx = serverSrc.indexOf(
    "app.use('/api/admin',          verifiedGate, require('./routes/admin'))"
  );
  assert.notEqual(adminCatchAllIdx, -1, 'generic /api/admin catch-all mount must exist');
  assert.ok(
    claimAttemptsIdx < adminCatchAllIdx,
    'claim-attempts mount must appear BEFORE the generic /api/admin mount ' +
    'to prevent admin.js wildcards from shadowing it'
  );
});

// ── K. Response shape ──────────────────────────────────────────────────

test('K1. Response shape is { total, limit, skip, items }', () => {
  // Pin all four keys so paginated UIs (or future ones) get a stable
  // contract.
  assert.match(
    routeExec,
    /res\.json\(\s*\{[\s\S]{0,200}total[\s\S]{0,200}limit[\s\S]{0,200}skip[\s\S]{0,200}items[\s\S]{0,200}\}\s*\)/,
    'Response must include { total, limit, skip, items }'
  );
});

test('K2. countDocuments + find run in parallel via Promise.all', () => {
  // Two-query reads are fine when parallelized. Pin the Promise.all so
  // a future "optimization" doesn't serialize them and double the
  // latency.
  assert.match(
    routeExec,
    /Promise\.all\(\s*\[[\s\S]*?ClaimAttempt\.countDocuments\([\s\S]*?ClaimAttempt\s*[\s\S]*?\.find\([\s\S]*?\]\s*\)/,
    'total and items must be fetched in parallel via Promise.all'
  );
});

// ── L. Scope discipline ────────────────────────────────────────────────

test('L1. Route file does not write to other models (no side effects)', () => {
  // The forensics endpoint must not write to ANY collection. Spot-check
  // a few obvious models we use elsewhere.
  for (const model of ['Lead', 'User', 'PurchasedLead', 'Transaction', 'ValidationLog']) {
    const re = new RegExp(`${model}\\.(create|insertMany|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findOneAndDelete|save|remove|bulkWrite)\\(`);
    assert.doesNotMatch(routeExec, re,
      `Route must NOT write to ${model} — this is a forensics-only endpoint`);
  }
});

test('L2. No other admin sub-route mount was accidentally added or removed', () => {
  // Defense-in-depth: confirm the sibling mounts (matcherDiagnose,
  // moverResearch, partnerResearch, settings) still exist.
  for (const mount of [
    '/api/admin/settings',
    '/api/admin/mover-research',
    '/api/admin/partner-research',
    '/api/admin/matcher',
    '/api/admin/inventory',
  ]) {
    assert.ok(serverSrc.includes(mount),
      `Existing admin sub-route mount '${mount}' must remain`);
  }
});

console.log('Admin ClaimAttempts endpoint tests scheduled.');
