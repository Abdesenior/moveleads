/**
 * Dispatch observability hardening lock-in.
 *
 * Two narrowly-scoped observability fixes addressing silent failure modes
 * that cost real investigation time during the Alabama staging SMS Claim
 * test (2026-05-28):
 *
 *   A. Twilio signature mismatch — `twilioWebhook` returned 403 with NO
 *      server-side log. Operators only saw the failure in the Twilio
 *      console webhook-delivery view. Root cause of one investigation
 *      branch was a `SERVER_URL` env mismatch (missing `api.` subdomain)
 *      that produced 403s for hours before being spotted.
 *
 *   B. `[SMS] No candidates with phone on file` conflated FIVE distinct
 *      hard-filter conditions (role / suspended / smsOptOut /
 *      phoneVerified / phone-missing). The role mismatch fixed by PR #48
 *      hid behind this misleading log line.
 *
 * Both changes are PURE OBSERVABILITY — they add log lines and a single
 * extra projected `.find()` on the failure path (bounded by `unionIds`
 * which is small by construction). No dispatch behavior changes.
 *
 * This suite pins:
 *
 *   A. twilioWebhook 403 path emits a structured warning with the
 *      reconstructed URL, truncated signature, and a hint pointing at
 *      SERVER_URL config.
 *   B. broadcastLeadSMS no-candidates path emits a per-filter count
 *      breakdown (role_not_mover / suspended / smsOptOut /
 *      phoneNotVerified / phoneMissing).
 *   C. The diagnostic find() is scoped to `unionIds` (does NOT re-query
 *      CoverageArea — the union was already computed upstream).
 *   D. The diagnostic find() is `.lean()` — no Mongoose hydration on the
 *      failure path.
 *   E. The role mismatch count uses `User.MOVER_ROLES` (the PR #48
 *      constant) — stays in lockstep with future role-set changes.
 *   F. On diagnostic-query failure, falls back to the legacy log line
 *      so the operator still sees SOMETHING (defensive — observability
 *      must NEVER replace dispatch behavior).
 *   G. Scope discipline — no behavior change, no schema change, no new
 *      env flags. PR-S3 / PR-S5 / PR-S6 invariants intact.
 *
 * Pure-Node, no Mongo. Source-level assertions.
 *
 * Run: `node server/__tests__/dispatchObservabilityHardening.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot      = path.join(__dirname, '..');
const twilioRoutePath = path.join(serverRoot, 'routes',   'twilio.js');
const twilioSvcPath   = path.join(serverRoot, 'services', 'twilioService.js');

const twilioRouteSrc = fs.readFileSync(twilioRoutePath, 'utf8');
const twilioSvcSrc   = fs.readFileSync(twilioSvcPath,   'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const twilioRouteExec = stripComments(twilioRouteSrc);
const twilioSvcExec   = stripComments(twilioSvcSrc);

// ── A. twilioWebhook signature-mismatch log ────────────────────────────

test('A1. twilioWebhook 403 path emits a structured warning', () => {
  assert.match(
    twilioRouteExec,
    /console\.warn\(\s*[`'"][^'"`]*twilioWebhook[\s\S]*?signature mismatch[\s\S]*?reconstructedUrl/,
    'Signature mismatch must produce a console.warn with "twilioWebhook" + ' +
    '"signature mismatch" + "reconstructedUrl=..." in the message'
  );
});

test('A2. Warning includes the reconstructed URL (operator diagnostic)', () => {
  // The reconstructed URL is the actual signal — if SERVER_URL is
  // misconfigured, the operator sees the wrong host in the log immediately.
  assert.match(twilioRouteExec, /reconstructedUrl=\$\{url\}/,
    'Warning must include `reconstructedUrl=${url}` so the operator sees the ' +
    'host the server signed against');
});

test('A3. Warning includes truncated signature (security — no full leak)', () => {
  // The full x-twilio-signature header contains cryptographic material.
  // Logging it raw is a leak. Truncate to 12 chars max.
  assert.match(
    twilioRouteExec,
    /\.slice\(\s*0\s*,\s*12\s*\)/,
    'Signature must be truncated to 12 chars before logging — security hygiene'
  );
  // And the variable must be a "preview" indicator so future contributors
  // don't accidentally widen it.
  assert.match(twilioRouteExec, /sigPreview\s*=\s*\(\s*req\.headers\[['"]x-twilio-signature['"]\]/,
    'Truncated signature must be stored in a `sigPreview` variable, not logged inline');
});

test('A4. Warning includes a hint pointing at SERVER_URL config', () => {
  // Operators reading the log should know what to check first.
  assert.match(
    twilioRouteExec,
    /SERVER_URL[\s\S]*?webhook URL|webhook URL[\s\S]*?SERVER_URL/i,
    'Warning must include a hint mentioning SERVER_URL + webhook URL so the operator ' +
    'knows where to look (this was the actual root cause during the Alabama investigation)'
  );
});

test('A5. 403 response still returned (behavior unchanged)', () => {
  // The log is BEFORE the 403. Confirm the 403 response itself is intact.
  assert.match(twilioRouteExec, /return res\.status\(403\)\.send\(['"]Forbidden['"]\)/,
    'Signature failure must still return 403 Forbidden — behavior unchanged');
});

test('A6. Reconstructed URL still uses SERVER_URL || legacy fallback (unchanged)', () => {
  // Pin the fallback chain. If a future contributor "fixes" the fallback
  // to something else, the lock-in catches the drift.
  // Use raw source — stripComments() greedily eats `//` inside the literal
  // string `'https://moveleads.cloud'`, leaving only `'https:` in the
  // stripped view. The line is unique enough that comment text isn't a risk.
  assert.match(
    twilioRouteSrc,
    /process\.env\.SERVER_URL\s*\|\|\s*['"]https:\/\/moveleads\.cloud['"]/,
    'Reconstruction must still use SERVER_URL || "https://moveleads.cloud" — ' +
    'unchanged by this observability PR'
  );
});

// ── B. broadcastLeadSMS per-filter no-candidates breakdown ─────────────

test('B1. No-candidates path runs a projected diagnostic find()', () => {
  // The breakdown query MUST be scoped to unionIds (small set) and project
  // only the diagnostic fields.
  assert.match(
    twilioSvcExec,
    /User\.find\(\s*\{\s*_id:\s*\{\s*\$in:\s*Array\.from\(unionIds\)\s*\}\s*\}\s*\)/,
    'No-candidates branch must run User.find({ _id: { $in: Array.from(unionIds) } }) ' +
    'for the per-filter diagnosis — bounded to the union we already computed'
  );
});

test('B2. Diagnostic find() projects only the 5 hard-filter fields', () => {
  assert.match(
    twilioSvcExec,
    /\.select\(['"]\s*role\s+isSuspended\s+smsOptOut\s+phoneVerified\s+phone\s*['"]\)/,
    'Diagnostic find() must use .select("role isSuspended smsOptOut phoneVerified phone") — ' +
    'minimal projection on the failure path'
  );
});

test('B3. Diagnostic find() uses .lean() — no Mongoose hydration', () => {
  // The block is inside the failure path; we MUST NOT pay the full
  // hydration cost when the broadcast is about to no-op.
  const blockMatch = twilioSvcExec.match(/No candidates remain after hard filter[\s\S]{0,800}|unionDiag\s*=\s*await\s+User\.find[\s\S]{0,400}/);
  assert.ok(blockMatch, 'no-candidates breakdown block must be findable');
  assert.match(blockMatch[0], /\.lean\(\)/,
    'Diagnostic find() must use .lean()');
});

test('B4. Per-filter counts cover the 5 hard-filter conditions', () => {
  for (const key of [
    'role_not_mover',
    'suspended',
    'smsOptOut',
    'phoneNotVerified',
    'phoneMissing',
  ]) {
    assert.match(twilioSvcExec, new RegExp(`\\b${key}\\b`),
      `Per-filter breakdown must include '${key}' count`);
  }
});

test('B5. role_not_mover count uses User.MOVER_ROLES (the PR #48 constant)', () => {
  // Critical: future role-set changes (e.g. adding a third mover role)
  // must automatically flow through this diagnostic without separate edits.
  assert.match(
    twilioSvcExec,
    /!User\.MOVER_ROLES\.includes\(\s*u\.role\s*\)/,
    'role_not_mover count must use `!User.MOVER_ROLES.includes(u.role)` — ' +
    'reuses the constant defined by PR #48'
  );
});

test('B6. Breakdown log includes leadId, unionSize, dropped counts, and overlap caveat', () => {
  // The exact log shape matters for grep-ability.
  assert.match(
    twilioSvcExec,
    /No candidates remain after hard filter for lead \$\{lead\._id\}[\s\S]*?unionSize=\$\{unionDiag\.length\}[\s\S]*?dropped:[\s\S]*?counts may overlap/,
    'Breakdown log must include leadId, unionSize, dropped counts, and the ' +
    '"counts may overlap" caveat for movers failing multiple gates'
  );
});

// ── F. Defensive fallback ──────────────────────────────────────────────

test('F1. On diagnostic-query failure, falls back to the legacy log line', () => {
  // Observability must NEVER replace dispatch behavior. If the projected
  // find() itself errors, we still return early with the legacy log so
  // the operator sees SOMETHING.
  assert.match(
    twilioSvcExec,
    /catch\s*\(\s*_e\s*\)\s*\{[\s\S]{0,200}\[SMS\] No candidates with phone on file/,
    'Catch block must fall back to the legacy "[SMS] No candidates with phone on file" log'
  );
});

test('F2. Function still returns early on no-candidates (behavior unchanged)', () => {
  // The return statement must remain after the diagnostic block — same
  // early-exit semantics as before.
  assert.match(
    twilioSvcExec,
    /\}\s*\n\s*return;\s*\n\s*\}/,
    'No-candidates branch must still `return` early after the breakdown log'
  );
});

// ── G. Scope discipline ────────────────────────────────────────────────

test('G1. No new env flags introduced (no ENABLE_* / FEATURE_*)', () => {
  // Both observability changes are unconditional. No new flags.
  const sigBlock = twilioRouteExec.match(/twilioWebhook[\s\S]{0,800}/);
  assert.ok(sigBlock);
  assert.doesNotMatch(sigBlock[0], /process\.env\.ENABLE_/,
    'Signature log must not be gated on an ENABLE_* flag');

  const breakdownBlock = twilioSvcExec.match(/No candidates remain after hard filter[\s\S]{0,1200}/);
  assert.ok(breakdownBlock);
  assert.doesNotMatch(breakdownBlock[0], /process\.env\.ENABLE_/,
    'Breakdown log must not be gated on an ENABLE_* flag');
});

test('G2. PR-S3 atomic block unchanged (no leak from observability)', () => {
  // PR-S3 PurchasedLead shape pin — confirm the financial code wasn't
  // touched in this PR.
  assert.match(
    twilioRouteExec,
    /new PurchasedLead\(\{\s*company:\s*user\._id,\s*lead:\s*claimedLead\._id,\s*pricePaid:\s*price,\s*\}\)/,
    'PR-S3 PurchasedLead shape must remain unchanged'
  );
});

test('G3. PR-S5 scaffold flag unchanged', () => {
  assert.match(twilioSvcExec, /process\.env\.ENABLE_SMS_CLAIM_SCAFFOLD\s*===\s*['"]true['"]/,
    'PR-S5 scaffold gate must remain intact');
});

test('G4. PR-S6 loser fan-out unchanged', () => {
  assert.match(twilioRouteExec, /CLAIM loser fan-out/,
    'PR-S6 loser fan-out block must remain');
  assert.match(twilioRouteExec, /sendMoverLostClaimSMS/,
    'PR-S6 loser SMS helper must still be called');
});

test('G5. PR #48 role filter unchanged (broadcaster candidate selection)', () => {
  assert.match(
    twilioSvcExec,
    /role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}/,
    'PR #48 role: { $in: User.MOVER_ROLES } filter must remain'
  );
});

test('G6. smsCounters raw-driver call unchanged (PR #50)', () => {
  assert.match(twilioSvcExec, /User\.collection\.updateOne/,
    'PR #50 raw-driver smsCounters bump must remain');
});

console.log('Dispatch observability hardening tests scheduled.');
