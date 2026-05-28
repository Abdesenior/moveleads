/**
 * smsCounters aggregation-pipeline update fix lock-in.
 *
 * Bug: every successful outbound SMS broadcast was emitting a Render
 * warning:
 *
 *   "Failed to bump smsCounters for <id>: Cannot pass an array to query
 *    updates unless updatePipeline option is set"
 *
 * The atomic UTC-day reset + count bump at twilioService.js:289-312 used
 * Mongoose's `User.updateOne(filter, [pipeline])` form. Newer Mongoose
 * versions guard against accidental array-as-replacement-doc by
 * requiring an explicit option for pipeline-form updates. Our payload
 * IS a deliberate pipeline (Mongo wire spec supports update pipelines
 * directly), so the guard was a false positive — but the silent effect
 * is real: the `User.smsCounters.count` field NEVER incremented in
 * production, which means the daily SMS cap (MAX_SMS_PER_MOVER_PER_DAY)
 * was a no-op.
 *
 * Fix: route the update through the raw collection driver
 * (`User.collection.updateOne`) which accepts pipelines natively per the
 * Mongo spec, bypassing Mongoose's array guard. Pipeline body itself is
 * unchanged.
 *
 * This suite pins:
 *
 *   A. The call uses User.collection.updateOne (raw driver), NOT
 *      User.updateOne (Mongoose wrapper)
 *   B. The pipeline body is unchanged — same $cond / $ifNull / $lt /
 *      $add operators on the same fields
 *   C. The pipeline still gates on result.ok === true (only bumps the
 *      counter on a confirmed send)
 *   D. The try/catch wrapper still catches and logs non-fatally
 *   E. No other smsCounters write sites added (single source of truth
 *      for the atomic UTC-day reset + bump)
 *   F. Scope discipline — no claim-path changes, no broadcaster behavior
 *      changes, no schema changes, no new env flags
 *
 * Pure-Node, no Mongo. Source-level assertions.
 *
 * Run: `node server/__tests__/smsCountersPipelineFix.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const twilioSvcPath = path.join(__dirname, '..', 'services', 'twilioService.js');
const twilioSrc = fs.readFileSync(twilioSvcPath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const twilioExec = stripComments(twilioSrc);

// ── A. Raw-driver call site ─────────────────────────────────────────────

test('A1. smsCounters bump uses User.collection.updateOne (raw driver)', () => {
  // The whole point of the fix. If a future contributor reverts to
  // User.updateOne, the production warning returns and the cap silently
  // breaks again.
  assert.match(
    twilioExec,
    /User\.collection\.updateOne\(\s*\{\s*_id:\s*mover\._id\s*\}\s*,\s*\[/,
    'smsCounters bump must call User.collection.updateOne (the raw driver bypasses ' +
    'Mongoose\'s array-form guard which produced "Cannot pass an array to query updates" ' +
    'in production)'
  );
});

test('A2. Bare User.updateOne is NOT used for the smsCounters bump', () => {
  // Confirm the old call site is gone. Other User.updateOne calls in
  // the file (notifiedAt write etc.) are fine — only the smsCounters
  // pipeline must not regress.
  const counterBlock = twilioExec.match(/Failed to bump smsCounters[\s\S]{0,800}/);
  // We grep the counterBlock — but the log line is INSIDE the catch block,
  // which is AFTER the updateOne call. Use a wider window: the entire
  // smsCounters.* pipeline + its surrounding try/catch.
  const wideBlock = twilioExec.match(/['"]smsCounters\.date['"][\s\S]*?Failed to bump smsCounters/);
  assert.ok(wideBlock, 'smsCounters pipeline block must be findable');
  assert.doesNotMatch(wideBlock[0], /User\.updateOne/,
    'No bare User.updateOne(...) call in the smsCounters bump block');
});

// ── B. Pipeline body unchanged ──────────────────────────────────────────

test('B1. Pipeline preserves the smsCounters.date $cond / $ifNull / $lt shape', () => {
  // The pipeline body operators are load-bearing. If any of them change,
  // the UTC-day reset semantics could subtly drift.
  assert.match(
    twilioExec,
    /['"]smsCounters\.date['"]\s*:\s*\{\s*\$cond:\s*\[\s*\{\s*\$lt:\s*\[\s*\{\s*\$ifNull:\s*\[\s*['"]\$smsCounters\.date['"]\s*,\s*new\s+Date\(0\)\s*\]\s*\}\s*,\s*todayStart\s*\]\s*\}/,
    'smsCounters.date pipeline must keep $cond:[$lt:[$ifNull:[..., new Date(0)], todayStart] ... ] shape'
  );
});

test('B2. Pipeline preserves the smsCounters.count $cond + $add shape', () => {
  assert.match(
    twilioExec,
    /['"]smsCounters\.count['"]\s*:\s*\{\s*\$cond:\s*\[\s*\{\s*\$lt:\s*\[\s*\{\s*\$ifNull:\s*\[\s*['"]\$smsCounters\.date['"]\s*,\s*new\s+Date\(0\)\s*\]\s*\}\s*,\s*todayStart\s*\]\s*\}\s*,\s*1\s*,\s*\{\s*\$add:\s*\[\s*\{\s*\$ifNull:\s*\[\s*['"]\$smsCounters\.count['"]\s*,\s*0\s*\]\s*\}\s*,\s*1\s*\]\s*\}/,
    'smsCounters.count pipeline must keep $cond:[$lt..., 1, $add:[$ifNull:[..., 0], 1]] shape ' +
    '(new UTC day → 1, same day → +1)'
  );
});

test('B3. Pipeline is still the second arg (an array literal)', () => {
  // The Mongo wire spec accepts pipelines as the second positional arg.
  // Confirm we kept the array shape rather than switching to a $-style
  // operator object (which would change semantics).
  assert.match(
    twilioExec,
    /User\.collection\.updateOne\([\s\S]{0,60}_id[\s\S]{0,40},\s*\[\s*\{\s*\$set/,
    'Second arg to updateOne must remain a pipeline array starting with { $set: ... }'
  );
});

// ── C. Gate on confirmed send ──────────────────────────────────────────

test('C1. Counter bump is gated on result.ok === true', () => {
  // The bump must only fire on a confirmed Twilio send. A Twilio error
  // (result.ok === false) or missing credentials (result undefined) must
  // NOT bump the counter — otherwise the cap drifts off real send count.
  assert.match(
    twilioExec,
    /if\s*\(\s*!result\s*\|\|\s*result\.ok\s*!==\s*true\s*\)\s*return/,
    'Counter bump must short-circuit when result is falsy or result.ok !== true ' +
    '— only confirmed Twilio sends count toward the daily cap'
  );
});

// ── D. Failure isolation ───────────────────────────────────────────────

test('D1. updateOne call is still inside a try/catch — non-fatal on error', () => {
  // The cap is best-effort; counter bump failures must not surface to
  // the broadcast caller.
  assert.match(
    twilioExec,
    /try\s*\{\s*await\s+User\.collection\.updateOne[\s\S]*?\}\s*catch\s*\(\s*e\s*\)\s*\{\s*console\.error\(\s*['"]\[SMS\]\s*Failed to bump smsCounters/,
    'updateOne must remain wrapped in try/catch with the "[SMS] Failed to bump smsCounters" log'
  );
});

// ── E. No other smsCounters write sites ────────────────────────────────

test('E1. The smsCounters pipeline write is the ONLY smsCounters update site in twilioService.js', () => {
  // Defense-in-depth: ensure a future contributor doesn't add a parallel
  // bump path with different semantics. Pipeline pattern stays the single
  // source of truth for the UTC-day reset + bump.
  const counterWriteSites = twilioExec.match(/smsCounters\./g) || [];
  // The pipeline writes both `smsCounters.date` and `smsCounters.count`, plus
  // reads via $ifNull from `$smsCounters.date` (×2) and `$smsCounters.count`,
  // plus the in-memory read `mover.smsCounters` near the cap check. Count
  // bounded but not pinned — just confirm there's no second updateOne block.
  assert.ok(counterWriteSites.length > 0, 'smsCounters references must exist');

  // The only updateOne mentioning smsCounters must be the pipeline one.
  const updateOneCalls = twilioExec.match(/updateOne\([\s\S]*?(?=updateOne\(|$)/g) || [];
  const counterUpdates = updateOneCalls.filter(c => /smsCounters/.test(c));
  assert.equal(counterUpdates.length, 1,
    `Expected exactly ONE updateOne call referencing smsCounters. Found ${counterUpdates.length}`);
});

// ── F. Scope discipline ────────────────────────────────────────────────

test('F1. No claim-path changes — PR-S5 scaffold block intact', () => {
  // PR-S5 token + openClaimWindow gate must be byte-for-byte unchanged.
  assert.match(twilioExec, /process\.env\.ENABLE_SMS_CLAIM_SCAFFOLD\s*===\s*['"]true['"]/,
    'PR-S5 scaffold gate must remain intact');
  assert.match(twilioExec, /openClaimWindow\(\s*lead\._id\s*,\s*recipientIds\s*\)/,
    'PR-S5 openClaimWindow call must remain intact');
});

test('F2. No broadcaster behavior changes — candidate selection unchanged', () => {
  // The candidate selection queries (4 spots updated by PR #48 to use
  // MOVER_ROLES) must remain. This PR is the counter bump call, nothing else.
  assert.match(twilioExec, /role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}/,
    'PR #48 role alignment must remain (broadcaster filter unchanged)');
});

test('F3. notifiedAt CAS flip unchanged (no leak from the counter fix)', () => {
  assert.match(
    twilioExec,
    /Lead\.updateOne\(\s*\{\s*_id:\s*lead\._id\s*,\s*notifiedAt:\s*null\s*\}\s*,\s*\{\s*\$set:\s*\{\s*notifiedAt:\s*new Date\(\)\s*\}\s*\}\s*\)/,
    'notifiedAt CAS flip must remain unchanged'
  );
});

test('F4. No new env flags / no schema changes', () => {
  // This PR introduces NO new env flag reads. Audit the diff would be the
  // cleanest check, but as a source-level proxy, confirm the counter block
  // doesn't reference any new ENABLE_* / FEATURE_* env vars.
  const counterBlock = twilioExec.match(/['"]smsCounters\.date['"][\s\S]*?Failed to bump smsCounters/);
  assert.ok(counterBlock, 'counter block must be findable');
  assert.doesNotMatch(counterBlock[0], /process\.env\.ENABLE_/,
    'Counter block must not introduce a new ENABLE_* flag');
  assert.doesNotMatch(counterBlock[0], /process\.env\.FEATURE_/,
    'Counter block must not introduce a new FEATURE_* flag');
});

test('F5. MAX_SMS_PER_MOVER_PER_DAY constant unchanged', () => {
  // The cap value must remain operator-configured. PR #48 didn't touch
  // this; this PR doesn't either.
  assert.match(twilioExec, /const\s+MAX_SMS_PER_MOVER_PER_DAY\s*=\s*25/,
    'MAX_SMS_PER_MOVER_PER_DAY constant must remain at 25 — daily cap value unchanged');
});

console.log('smsCounters aggregation-pipeline fix tests scheduled.');
