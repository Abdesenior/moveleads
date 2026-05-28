/**
 * closeStaleClaimWindows cron job (PR-S4) lock-in.
 *
 * Fifth pre-flip hardening blocker for the SMS Claim pipeline. PR-S5
 * (token emission) is the only thing that opens claim windows; PR-S4
 * is the maintenance partner that closes them when they expire.
 * Without this, a once-opened window remains `open` forever past its
 * expiresAt, blocking future re-broadcasts on the same lead (the
 * openClaimWindow CAS filter refuses to overwrite `open` or `claimed`).
 *
 * Source-only assertions (no Mongo). This pins:
 *
 *   A. Job file exists at the documented path
 *   B. Exports the function name closeStaleClaimWindows
 *   C. Cron schedule is exactly every-5-minutes (no drift to hourly/daily)
 *   D. Job is FLAG-INDEPENDENT — does NOT read ENABLE_SMS_CLAIM_SCAFFOLD.
 *      This is a deliberate design choice (see file-header rationale):
 *      cleanup must outlive flag flips to avoid orphan windows.
 *   E. Query filter matches { status:'open', expiresAt: { $lte: now } }
 *   F. Update sets status='expired' AND closedReason='expired'
 *   G. Uses updateMany (bulk, idempotent, single Mongo round-trip)
 *   H. Wired into server.js boot
 *   I. PR-S4 audit-trail comment present in both files
 *   J. Scope discipline — does NOT import financial models
 *   K. Function signature accepts injectable `now` (testability)
 *
 * Run: `node server/__tests__/closeStaleClaimWindowsJob.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const jobPath = path.join(serverRoot, 'jobs', 'closeStaleClaimWindows.js');
const serverJsPath = path.join(serverRoot, 'server.js');

const jobSrc = fs.readFileSync(jobPath, 'utf8');
const serverJsSrc = fs.readFileSync(serverJsPath, 'utf8');

// Strip JS comments so audit-trail mentions of retired strings or
// rationale text don't false-positive scans.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const jobExec = stripComments(jobSrc);
const serverJsExec = stripComments(serverJsSrc);

// ── A. File exists ─────────────────────────────────────────────────────

test('A1. server/jobs/closeStaleClaimWindows.js exists', () => {
  assert.ok(fs.existsSync(jobPath),
    'Expected job file at server/jobs/closeStaleClaimWindows.js');
});

// ── B. Exports the function ─────────────────────────────────────────────

test('B1. Module exports a function named closeStaleClaimWindows', () => {
  // Source-only assertion (NOT require()) — cron.schedule() at module
  // load keeps the event loop alive and would hang the test runner.
  // Pattern matches the existing distributionModel.test.js convention.
  assert.match(
    jobExec,
    /module\.exports\s*=\s*\{[^}]*\bcloseStaleClaimWindows\b/,
    'Module must export `closeStaleClaimWindows` (named export). ' +
    'Tests + future ops scripts need to invoke it directly.'
  );
  // Also assert the function declaration exists in the source.
  assert.match(
    jobExec,
    /(async\s+)?function\s+closeStaleClaimWindows\s*\(/,
    'closeStaleClaimWindows must be defined as a top-level function'
  );
});

// ── C. Cron schedule ────────────────────────────────────────────────────

test('C1. Cron schedule is every 5 minutes (`*/5 * * * *`)', () => {
  // Hard-pin the exact crontab expression. Anything looser ("*/2",
  // "*/10", "hourly") changes the staleness window and breaks the
  // "expired no more than ~5 min late" invariant.
  assert.match(
    jobExec,
    /cron\.schedule\(\s*['"]\*\/5\s+\*\s+\*\s+\*\s+\*['"]/,
    'Schedule must be exactly `*/5 * * * *` — every 5 minutes'
  );
});

// ── D. Flag-independence ────────────────────────────────────────────────

test('D1. Job does NOT read ENABLE_SMS_CLAIM_SCAFFOLD (flag-independent)', () => {
  // Deliberate design — see file header. If a future contributor adds
  // a flag gate, orphan windows would survive flag-down transitions
  // and block re-broadcasts on those leads forever.
  assert.doesNotMatch(jobExec, /ENABLE_SMS_CLAIM_SCAFFOLD/,
    'Cleanup job must NOT be flag-gated. If you think it should be, ' +
    're-read the file-header rationale: cleanup must outlive flag flips.');
});

test('D2. Job does NOT read ENABLE_SMS_CLAIM_LIVE either', () => {
  // Same logic — and additionally: PR-S4 ships BEFORE the live flag
  // ever flips. Gating cleanup on the live flag would mean we don't
  // clean up during the very rollout phases where we most need it.
  assert.doesNotMatch(jobExec, /ENABLE_SMS_CLAIM_LIVE/,
    'Cleanup job must NOT be gated on ENABLE_SMS_CLAIM_LIVE');
});

// ── E. Query filter shape ──────────────────────────────────────────────

test('E1. Filter targets claimWindow.status === "open"', () => {
  assert.match(jobExec, /['"]claimWindow\.status['"]\s*:\s*['"]open['"]/,
    'Filter must include `"claimWindow.status": "open"` — claimed and ' +
    'expired windows are terminal and must not be touched');
});

test('E2. Filter targets claimWindow.expiresAt with $lte now', () => {
  // $lte (not $lt) so a window expiring exactly at `now` still gets
  // expired this tick rather than waiting another 5 min.
  assert.match(
    jobExec,
    /['"]claimWindow\.expiresAt['"]\s*:\s*\{\s*\$lte\s*:/,
    'Filter must use `$lte` on claimWindow.expiresAt — boundary windows ' +
    'expire this tick rather than slipping to the next'
  );
});

// ── F. Update payload ──────────────────────────────────────────────────

test('F1. Update sets claimWindow.status = "expired"', () => {
  assert.match(
    jobExec,
    /['"]claimWindow\.status['"]\s*:\s*['"]expired['"]/,
    'Update must set claimWindow.status to "expired" (the terminal state)'
  );
});

test('F2. Update sets claimWindow.closedReason = "expired"', () => {
  // closedReason is required by the Lead.claimWindow schema enum
  // (claimed | expired | admin_revoked). Forensic field — operators
  // grep by closedReason when triaging "why did this window close".
  assert.match(
    jobExec,
    /['"]claimWindow\.closedReason['"]\s*:\s*['"]expired['"]/,
    'Update must set claimWindow.closedReason = "expired" for forensics'
  );
});

test('F3. Update does NOT clobber other claimWindow subfields', () => {
  // The whole point of $set with dotted keys is targeted writes —
  // token, broadcastTo, expiresAt etc. must survive expiry so PR-S3
  // forensics + lock-in tests can inspect what was emitted.
  const setBlockMatch = jobExec.match(/\$set\s*:\s*\{([\s\S]*?)\}/);
  assert.ok(setBlockMatch, '$set payload must be findable');
  const setBlock = setBlockMatch[1];
  // Forbidden: top-level `claimWindow:` (would replace the whole subdoc).
  assert.doesNotMatch(
    setBlock,
    /(^|\W)claimWindow\s*:/,
    'Must NOT $set a top-level `claimWindow:` object — that would clobber ' +
    'token, broadcastTo, openedAt, expiresAt. Use dotted keys only.'
  );
});

// ── G. updateMany usage ────────────────────────────────────────────────

test('G1. Job uses Lead.updateMany (not find-then-loop)', () => {
  // updateMany is idempotent and atomic per-row; a find-then-loop would
  // need its own race handling and lose the "boring single round-trip"
  // property.
  assert.match(jobExec, /Lead\.updateMany/,
    'Job must use Lead.updateMany — not Lead.find then per-row save');
  assert.doesNotMatch(jobExec, /for\s*\(\s*const\s+\w+\s+of\s+\w+\.find/,
    'Job must NOT loop over Lead.find results — updateMany is idempotent + atomic');
});

// ── H. Wired into boot ──────────────────────────────────────────────────

test('H1. server.js requires the new job at boot', () => {
  // Use raw source — stripComments() can mis-handle `/api/voice/*`-style
  // tokens inside `//` comments in server.js and accidentally eat the
  // requires block. The require pattern is distinctive enough that an
  // audit-trail comment mentioning it wouldn't false-positive.
  assert.match(
    serverJsSrc,
    /require\(['"]\.\/jobs\/closeStaleClaimWindows['"]\)/,
    'server.js must require ./jobs/closeStaleClaimWindows so the cron registers on boot'
  );
});

test('H2. server.js wiring sits with the other job requires', () => {
  // Sanity — keeps the boot file organised. All four pre-existing jobs
  // are required in a contiguous block; the new one belongs there too.
  const jobBlockMatch = serverJsSrc.match(
    /require\(['"]\.\/jobs\/[\s\S]{0,400}?require\(['"]\.\/jobs\/closeStaleClaimWindows['"]\)/
  );
  assert.ok(jobBlockMatch,
    'closeStaleClaimWindows require should sit with the other ./jobs/ requires, not floating elsewhere in server.js');
});

// ── I. PR-S4 audit-trail comment ───────────────────────────────────────

test('I1. Job file documents itself as PR-S4', () => {
  assert.match(jobSrc, /PR-S4/,
    'Job file must carry the PR-S4 audit tag for future grep-ability');
});

test('I2. server.js wiring is annotated with PR-S4', () => {
  // A future contributor reading server.js boot should immediately know
  // why this job exists.
  assert.match(serverJsSrc, /PR-S4/,
    'server.js wiring must reference PR-S4 in a nearby comment');
});

// ── J. Scope discipline — no financial code ────────────────────────────

test('J1. Job does NOT import PurchasedLead / Transaction / User', () => {
  // PR-S4 is maintenance only. Financial atomicity lives in
  // routes/bids.js (the gold standard) — when PR-S3 ships the inbound
  // handler, it will replicate that pattern there, not here.
  for (const m of ['PurchasedLead', 'Transaction', 'User']) {
    const re = new RegExp(`require\\(['"][^'"]*${m}['"]\\)`);
    assert.doesNotMatch(jobExec, re,
      `PR-S4 must NOT require ${m} — maintenance jobs don't touch money writes`);
  }
});

test('J2. Job does NOT import SMS / email services', () => {
  // Loser-notification SMS is PR-S6 territory, not PR-S4.
  assert.doesNotMatch(jobExec, /require\(['"][^'"]*smsService['"]\)/,
    'PR-S4 must NOT require smsService — loser notification is PR-S6');
  assert.doesNotMatch(jobExec, /require\(['"][^'"]*emailService['"]\)/,
    'PR-S4 must NOT require emailService — same reasoning');
});

// ── K. Testability — injectable clock ──────────────────────────────────

test('K1. closeStaleClaimWindows accepts an options bag with `now`', () => {
  // The function must accept an injectable clock so tests can pin time
  // (Phase 5 lock-in suites will exercise the cutoff exactly).
  assert.match(
    jobExec,
    /function\s+closeStaleClaimWindows\s*\(\s*\{\s*now\s*=\s*new\s+Date\(\)\s*\}\s*=\s*\{\s*\}\s*\)/,
    'Signature must be `function closeStaleClaimWindows({ now = new Date() } = {})` — ' +
    'tests need to pin the clock'
  );
});

test('K2. closeStaleClaimWindows returns { modifiedCount, matchedCount }', () => {
  // Callers + operators need observability. Returning the count makes
  // manual ops sweeps + future dashboards trivial.
  assert.match(jobExec, /modifiedCount/,
    'Return value must include modifiedCount');
  assert.match(jobExec, /matchedCount/,
    'Return value must include matchedCount');
});

console.log('closeStaleClaimWindows cron job (PR-S4) tests scheduled.');
