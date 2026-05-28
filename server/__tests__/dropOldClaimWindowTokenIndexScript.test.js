/**
 * dropOldClaimWindowTokenIndex script (PR-S2a) lock-in.
 *
 * PR-S2 added a new unique-sparse named index `claimWindow_token_unique`
 * on `Lead.claimWindow.token`. Production Mongo has a legacy auto-created
 * anonymous index `claimWindow.token_1` (sparse, non-unique) that
 * Mongoose cannot replace automatically — same keys, different options.
 * PR-S2a ships an ops-only maintenance script to drop the legacy index
 * so Mongoose's createIndexes() can install the new one on next
 * connection.
 *
 * The script runs OUT-OF-PROCESS by an operator (not in CI, not in
 * app boot). This test pins the script's contract at the source level:
 *
 *   A. The script file exists at the documented path
 *   B. It targets the correct legacy index name and writes the correct
 *      new index name (so future contributors can grep for them)
 *   C. It contains the safety guard for populated rows (Phase 5 protection)
 *   D. It supports --dry-run mode
 *   E. It documents how to run it + restart Render
 *   F. Exit codes are documented and reachable
 *   G. PR-S2a audit-trail comment is present
 *
 * No actual execution (would require Mongo). Source-only assertions.
 *
 * Run: `node server/__tests__/dropOldClaimWindowTokenIndexScript.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.join(
  __dirname, '..', 'scripts', 'dropOldClaimWindowTokenIndex.js'
);

let scriptSrc;
test('A1. Script file exists at the documented path', () => {
  assert.ok(
    fs.existsSync(scriptPath),
    `Expected script at server/scripts/dropOldClaimWindowTokenIndex.js`
  );
  scriptSrc = fs.readFileSync(scriptPath, 'utf8');
});

// ── B. Correct index names ─────────────────────────────────────────────

test("B1. Script targets the legacy index name 'claimWindow.token_1'", () => {
  assert.match(
    scriptSrc,
    /['"]claimWindow\.token_1['"]/,
    `Script must reference the legacy auto-created index name verbatim. ` +
    `If the constant is renamed, the deploy team's drop step references break.`
  );
});

test("B2. Script references the new index name 'claimWindow_token_unique' (for AFTER-state validation)", () => {
  assert.match(
    scriptSrc,
    /['"]claimWindow_token_unique['"]/,
    `Script must reference the new unique-sparse index name so it can ` +
    `confirm post-restart state to the operator.`
  );
});

// ── C. Safety guard for populated rows ─────────────────────────────────

test('C1. Script counts populated claimWindow.token rows before dropping', () => {
  // Phase 4 should be zero. The safety guard refuses to drop if any row
  // has the field set — defensive against running the script after
  // Phase 5 ships and rows are present.
  assert.match(
    scriptSrc,
    /countDocuments[\s\S]*?['"]claimWindow\.token['"][\s\S]*?\$exists/,
    `Script must call countDocuments with { 'claimWindow.token': { $exists: true } } ` +
    `as the safety check before dropping.`
  );
});

test('C2. Safety guard logs a clear refusal message with the populated count', () => {
  assert.match(
    scriptSrc,
    /SAFETY GUARD/i,
    `Script must emit a "SAFETY GUARD" log line when refusing to drop. ` +
    `Operators grep for this when triaging unexpected drop failures.`
  );
});

// ── D. --dry-run mode ──────────────────────────────────────────────────

test('D1. Script supports --dry-run flag', () => {
  assert.match(
    scriptSrc,
    /--dry-run/,
    `Script must accept --dry-run as documented in the usage block.`
  );
  // Confirm dry-run gates the actual drop, not just the connect.
  assert.match(
    scriptSrc,
    /dryRun[\s\S]*?DRY RUN[\s\S]*?(skip|would)/i,
    `Dry run path must explicitly skip the destructive drop step.`
  );
});

// ── E. Usage + restart instructions in docstring ───────────────────────

test('E1. Script docstring documents the MONGODB_URI invocation', () => {
  assert.match(
    scriptSrc,
    /MONGODB_URI[\s\S]*?node\s+server\/scripts\/dropOldClaimWindowTokenIndex\.js/,
    `Docstring must show the exact invocation with MONGODB_URI prefixed`
  );
});

test('E2. Script docstring mentions restarting the Render service after drop', () => {
  // The new index only appears after Mongoose reconnects and runs
  // createIndexes(). Operator must know this.
  assert.match(
    scriptSrc,
    /restart.*Render/i,
    `Docstring must instruct the operator to restart the Render service ` +
    `after the drop so Mongoose creates the new index.`
  );
});

// ── F. Exit codes documented ───────────────────────────────────────────

test('F1. Script documents distinct exit codes for different failure modes', () => {
  // Exit codes per the script's docstring:
  //   0 success, 1 missing env, 2 connect fail, 3 safety guard, 4 unexpected
  for (const code of ['0', '1', '2', '3', '4']) {
    const re = new RegExp(`(^|\\s)${code}\\s+-`, 'm');
    assert.match(scriptSrc, re,
      `Exit code ${code} must be documented in the docstring exit-code block`);
  }
});

test('F2. Script actually calls process.exit with each documented code', () => {
  for (const code of ['0', '1', '2', '3', '4']) {
    const re = new RegExp(`process\\.exit\\(${code}\\)`);
    assert.match(scriptSrc, re,
      `Script must contain a process.exit(${code}) call matching the documented exit code`);
  }
});

// ── G. Audit-trail comment ─────────────────────────────────────────────

test('G1. Script docstring identifies itself as PR-S2a', () => {
  assert.match(
    scriptSrc,
    /PR-S2a/,
    `Audit-trail tag must connect the script back to its originating PR ` +
    `so a future contributor can find the lock-in tests + design rationale.`
  );
});

// ── H. Operational properties — idempotent, read-then-write ────────────

test('H1. Script lists indexes BEFORE the drop (operator visibility)', () => {
  assert.match(
    scriptSrc,
    /BEFORE.*indexes on leads collection/i,
    `Script must print the BEFORE state of all indexes — operator confirms ` +
    `the old index is actually present before any destructive action.`
  );
});

test('H2. Script lists indexes AFTER the drop (operator verification)', () => {
  assert.match(
    scriptSrc,
    /AFTER.*indexes on leads collection/i,
    `Script must print the AFTER state — operator confirms the drop succeeded ` +
    `and (if restart already happened) the new index is present.`
  );
});

test('H3. Idempotent: if old index already absent, script exits cleanly with code 0', () => {
  // Look for the "nothing to drop" path in the code.
  assert.match(
    scriptSrc,
    /not present.*nothing to drop/i,
    `Script must explicitly handle the case where the old index is already gone ` +
    `(re-run after a successful previous run). Should exit 0, not error.`
  );
});

// ── I. Script does NOT touch app behavior ──────────────────────────────

test('I1. Script does NOT import models that would trigger Mongoose autoIndex on connect', () => {
  // If the script required '../models/Lead', loading it would trigger
  // Mongoose's autoIndex flow and attempt to create the NEW index BEFORE
  // we've dropped the OLD one — same-key/different-options conflict.
  // The script uses the raw collection driver instead.
  assert.doesNotMatch(
    scriptSrc,
    /require\(['"]\.\.\/models\/Lead['"]\)/,
    `Script must NOT require ../models/Lead. Loading the model triggers ` +
    `Mongoose's autoIndex which would conflict with the in-flight drop. ` +
    `Use mongoose.connection.db.collection('leads') instead.`
  );
});

test('I2. Script uses the raw driver collection() — not a Mongoose model', () => {
  assert.match(
    scriptSrc,
    /mongoose\.connection\.db\.collection\(['"]leads['"]\)/,
    `Script must use mongoose.connection.db.collection('leads') for raw ` +
    `index ops (no Mongoose schema autoIndex interference).`
  );
});

console.log('dropOldClaimWindowTokenIndex script (PR-S2a) tests scheduled.');
