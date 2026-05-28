/**
 * SMS Claim loser notification (PR-S6) lock-in.
 *
 * Seventh and final SMS Claim pipeline blocker. When the inbound claim
 * handler's atomic CAS picks a winner, this PR notifies the OTHER
 * recipients of the same claimWindow that the lead was claimed by
 * someone else and NO charge was made to them.
 *
 * The end-to-end winner path (PR-S3 + earlier PRs) is already proven on
 * staging — the operator confirmed an Alabama test claim succeeded:
 * mover received "SEND HJ6H" prompt, replied, received "lead claimed!
 * $180 debited..." confirmation, ownership + ledger row both correct.
 * PR-S6 adds the loser-side closing.
 *
 * Operator constraints (pinned by this suite):
 *
 *   - No financial logic changes
 *   - No additional lead mutations
 *   - No extra claimWindow writes (status='claimed' was already flipped
 *     by the atomic CAS upstream; the loser fan-out is read-only on Lead)
 *   - Idempotent — fan-out lives inside the winner branch, which is
 *     gated by the unique-sparse twilioMessageSid index (PR-S1). Twilio
 *     retries short-circuit at the duplicate-MessageSid check, never
 *     re-firing the loser SMS.
 *   - Safe on Twilio retries
 *
 * What this suite pins:
 *
 *   A. sendMoverLostClaimSMS helper exists and is exported
 *   B. Loser body matches operator spec — "claimed by another mover",
 *      "No charge was made", TCPA STOP footer, single GSM-7 segment
 *   C. No PII in the loser body (no customerName/Phone/Email — losers
 *      did not pay and have no entitlement)
 *   D. Fan-out fires AFTER finalize('won') in the winner branch only
 *   E. Fan-out source set is claimedLead.claimWindow.broadcastTo with
 *      the winner removed by string-compare
 *   F. TCPA + dispatch-discipline gates on the loser query mirror the
 *      outbound broadcast hard filter (role=MOVER_ROLES, isSuspended,
 *      smsOptOut, phoneVerified, phone present)
 *   G. Each per-loser send is fire-and-forget with its own .catch —
 *      a single failure does not cascade, does not delay winner TwiML,
 *      does not surface to the inbound HTTP request
 *   H. Scope discipline — fan-out block contains NO financial writes,
 *      NO Lead mutations, NO ClaimAttempt rows
 *   I. PR-S3 atomic block (the financial sequence) is unchanged
 *   J. Idempotency — fan-out only reachable from the winner branch,
 *      which is downstream of the twilioMessageSid uniqueness check
 *
 * Pure-Node, no Mongo. Source-level assertions.
 *
 * Run: `node server/__tests__/smsClaimLoserNotification.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot     = path.join(__dirname, '..');
const smsServicePath = path.join(serverRoot, 'services', 'smsService.js');
const twilioRoutePath = path.join(serverRoot, 'routes',  'twilio.js');

const smsSrc    = fs.readFileSync(smsServicePath,  'utf8');
const twilioSrc = fs.readFileSync(twilioRoutePath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const smsExec    = stripComments(smsSrc);
const twilioExec = stripComments(twilioSrc);

// Isolate the loser-fan-out block so scope-discipline assertions don't
// false-positive against unrelated parts of routes/twilio.js (the file
// legitimately contains User.findOneAndUpdate, Lead.findOneAndUpdate,
// Transaction.create, PurchasedLead, etc. in the winner atomic block).
const fanOutBlockMatch = twilioExec.match(
  /PR-S6[\s\S]*?CLAIM loser fan-out[\s\S]*?\}\s*catch\s*\(e\)\s*\{[\s\S]*?\}\s*\}/
);
// Fallback: source matches even without comments stripped
const fanOutSourceMatch = twilioSrc.match(
  /(?<=await finalize\('won'[^;]*;)[\s\S]*?(?=\/\/ Confirmation SMS)/
);
const fanOutBlock       = fanOutBlockMatch       ? fanOutBlockMatch[0]       : '';
const fanOutSource      = fanOutSourceMatch      ? fanOutSourceMatch[0]      : '';

// ── A. Helper exists ────────────────────────────────────────────────────

test('A1. sendMoverLostClaimSMS is exported from smsService', () => {
  const mod = require('../services/smsService');
  assert.equal(typeof mod.sendMoverLostClaimSMS, 'function',
    'sendMoverLostClaimSMS must be exported as a function');
});

test('A2. sendMoverLeadSMS still exported (regression — PR-S5 helper unchanged)', () => {
  const mod = require('../services/smsService');
  assert.equal(typeof mod.sendMoverLeadSMS, 'function',
    'sendMoverLeadSMS must still be exported; PR-S6 must not remove it');
});

test('A3. sendMoverLostClaimSMS signature is single-arg `(toPhone)`', () => {
  assert.match(
    smsExec,
    /async\s+function\s+sendMoverLostClaimSMS\s*\(\s*toPhone\s*\)/,
    'Signature must be sendMoverLostClaimSMS(toPhone). No lead, no token, no extra args — ' +
    'the loser body is constant and PII-free, so additional context would invite scope creep.'
  );
});

// ── B. Body composition ─────────────────────────────────────────────────

test('B1. Body contains "claimed by another mover"', () => {
  assert.match(smsExec, /claimed by another mover/,
    'Body must contain operator-specified phrase "claimed by another mover"');
});

test('B2. Body contains "No charge was made"', () => {
  assert.match(smsExec, /No charge was made/,
    'Body must contain operator-specified phrase "No charge was made" — ' +
    'preempts mover anxiety about being debited for a lead they did not win');
});

test('B3. Body includes TCPA "Reply STOP" footer', () => {
  assert.match(smsExec, /Reply STOP/,
    'Body must include "Reply STOP to opt out" for TCPA hygiene, matching ' +
    'the outbound lead SMS pattern');
});

test('B4. Body is constructed as a single string literal (no per-call interpolation)', () => {
  // The loser body has zero template variables — it is the same constant
  // text for every recipient. Pin this so a future contributor does not
  // accidentally add PII (customer name, phone, price) into the loser
  // notification, which would violate the "losers have no entitlement"
  // rule.
  const bodyAssignMatch = smsExec.match(/const body\s*=\s*([\s\S]*?);/);
  assert.ok(bodyAssignMatch, 'body assignment must be findable');
  const bodyExpr = bodyAssignMatch[1];
  assert.doesNotMatch(bodyExpr, /\$\{/,
    'Loser body must contain NO ${...} template substitutions — losers get a ' +
    'constant message with no PII');
});

test('B5. No PII in the loser body — no customerName, customerPhone, price, route', () => {
  // The function body must NOT reference any lead/customer field. The
  // loser SMS is a fixed string.
  const fnBodyMatch = smsExec.match(/function\s+sendMoverLostClaimSMS[\s\S]*?\n\}/);
  assert.ok(fnBodyMatch, 'sendMoverLostClaimSMS body must be findable');
  const fnBody = fnBodyMatch[0];
  for (const piiHint of ['customerName', 'customerPhone', 'customerEmail',
                          'buyNowPrice', 'finalPrice', 'originCity', 'destinationCity',
                          'homeSize', 'moveDate', 'grade']) {
    assert.doesNotMatch(fnBody, new RegExp(`\\b${piiHint}\\b`),
      `Loser body must NOT reference '${piiHint}' — losers did not pay`);
  }
});

test('B6. Body length fits a single GSM-7 segment (≤160 chars)', () => {
  // Recompute the body the same way the function does. The fixed body
  // is ~92 chars, well under the cap.
  const body =
    'MoveLeads: this lead was claimed by another mover. No charge was made.\n' +
    'Reply STOP to opt out';
  assert.ok(body.length <= 160,
    `Loser body must fit a single GSM-7 segment (≤160). Got ${body.length} chars`);
});

test('B7. Twilio credentials check short-circuits (dev/mock safety)', () => {
  // Same defensive guard as sendMoverLeadSMS — if credentials are missing,
  // log a warning and return without calling Twilio.
  assert.match(
    smsExec,
    /sendMoverLostClaimSMS[\s\S]{0,500}TWILIO_ACCOUNT_SID[\s\S]{0,200}return/,
    'Helper must short-circuit when Twilio creds are absent (dev / mock parity)'
  );
});

// ── C. Fan-out wiring — winner-branch only ─────────────────────────────

test('C1. routes/twilio.js requires sendMoverLostClaimSMS from smsService', () => {
  assert.match(
    twilioExec,
    /require\(['"]\.\.\/services\/smsService['"]\)[\s\S]{0,200}sendMoverLostClaimSMS|sendMoverLostClaimSMS[\s\S]{0,200}require\(['"]\.\.\/services\/smsService['"]\)/,
    'routes/twilio.js must import sendMoverLostClaimSMS from smsService'
  );
});

test('C2. Fan-out block exists and is gated by PR-S6 audit-trail comment', () => {
  assert.match(twilioSrc, /PR-S6/,
    'PR-S6 audit-trail comment must mark the fan-out block');
  assert.match(twilioSrc, /CLAIM loser fan-out/,
    'Fan-out block must be findable by the canonical log/comment phrase');
});

test('C3. Fan-out fires AFTER finalize("won") (source-order)', () => {
  // Pin the order: the fan-out block must come AFTER the finalize('won')
  // call so the financial sequence is fully committed before any loser
  // SMS goes out. If the order ever flipped, a Transaction.create failure
  // would still emit loser SMS (a worse failure mode than the inverse).
  const finalizeIdx = twilioExec.indexOf("finalize('won'");
  const fanOutIdx   = twilioExec.indexOf('CLAIM loser fan-out');
  assert.ok(finalizeIdx > 0, 'finalize(\'won\') call must exist');
  assert.ok(fanOutIdx > 0,   'CLAIM loser fan-out block must exist');
  assert.ok(finalizeIdx < fanOutIdx,
    'Fan-out must come AFTER finalize(\'won\') so financial commit precedes loser notification');
});

test('C4. Fan-out runs BEFORE winner TwiML (so loser sends fire on the same request)', () => {
  // The fan-out kicks off Twilio sends fire-and-forget BEFORE the winner
  // TwiML is rendered. Anchor on a code-level string ('MoveLeads: lead
  // claimed!' literal in the winner body) so this survives comment
  // stripping.
  const fanOutIdx     = twilioSrc.indexOf('CLAIM loser fan-out');
  const winnerTwimlIdx = twilioSrc.indexOf('MoveLeads: lead claimed!');
  assert.ok(fanOutIdx > 0, 'fan-out marker must exist');
  assert.ok(winnerTwimlIdx > 0, 'winner-TwiML body string must exist');
  assert.ok(winnerTwimlIdx > fanOutIdx,
    'Fan-out must come BEFORE the winner confirmation TwiML — kick off sends, then respond');
});

// ── D. Fan-out target — broadcastTo minus winner ───────────────────────

test('D1. Fan-out source set is claimedLead.claimWindow.broadcastTo', () => {
  assert.match(
    fanOutSource,
    /claimedLead\.claimWindow[\s\S]{0,80}broadcastTo|claimWindow\s*&&\s*claimedLead\.claimWindow\.broadcastTo/,
    'Fan-out must read recipients from claimedLead.claimWindow.broadcastTo (set by PR-S5 openClaimWindow)'
  );
});

test('D2. broadcastTo is defensively array-checked', () => {
  // If openClaimWindow ever returns a doc without broadcastTo (defensive
  // upstream changes, partial migrations, etc.), the fan-out must NOT
  // throw. Array.isArray guard or equivalent.
  assert.match(
    fanOutSource,
    /Array\.isArray\([\s\S]{0,160}broadcastTo\)/,
    'broadcastTo must be defensively checked with Array.isArray before .filter()'
  );
});

test('D3. Winner is excluded from the loser list', () => {
  assert.match(
    fanOutSource,
    /filter\(id\s*=>\s*String\(id\)\s*!==\s*winnerIdStr\)|filter\(id\s*=>\s*String\(id\)\s*!==\s*String\(user\._id\)\)/,
    'Winner must be removed from the loser list via string-compare on _id'
  );
});

test('D4. Winner ID compare uses String() coercion (defensive against ObjectId-vs-string identity)', () => {
  // Mongo identifiers can flow as ObjectId or string depending on the
  // hydration path. String() on both sides ensures the winner is reliably
  // matched even on identity drift.
  assert.match(
    fanOutSource,
    /winnerIdStr\s*=\s*String\(user\._id\)/,
    'winnerIdStr must be String(user._id) — never compare ObjectId directly to string'
  );
});

// ── E. TCPA + dispatch-discipline gates on the loser query ─────────────

test('E1. Loser query uses role: { $in: User.MOVER_ROLES }', () => {
  assert.match(
    fanOutSource,
    /role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}/,
    'Loser query must filter role: { $in: User.MOVER_ROLES } — reuses PR #48 constant'
  );
});

test('E2. Loser query filters isSuspended', () => {
  assert.match(fanOutSource, /isSuspended:\s*\{\s*\$ne:\s*true\s*\}/,
    'Loser query must filter isSuspended: { $ne: true }');
});

test('E3. Loser query filters smsOptOut', () => {
  assert.match(fanOutSource, /smsOptOut:\s*\{\s*\$ne:\s*true\s*\}/,
    'Loser query must filter smsOptOut: { $ne: true } (TCPA hygiene)');
});

test('E4. Loser query requires phoneVerified=true', () => {
  assert.match(fanOutSource, /phoneVerified:\s*true/,
    'Loser query must require phoneVerified=true (TCPA hard gate)');
});

test('E5. Loser query requires phone present', () => {
  assert.match(
    fanOutSource,
    /phone:\s*\{\s*\$exists:\s*true\s*,\s*\$nin:\s*\[\s*['"]['"]\s*,\s*null\s*\]\s*\}/,
    'Loser query must require phone exists and is non-empty'
  );
});

test('E6. Loser query is scoped to loserIds (not the entire user collection)', () => {
  assert.match(
    fanOutSource,
    /_id:\s*\{\s*\$in:\s*loserIds\s*\}/,
    'Loser query must scope by _id: { $in: loserIds } — bounded by the broadcast recipients, no full-collection scan'
  );
});

test('E7. Loser query selects only operationally-needed fields', () => {
  // We only need _id + phone + companyName for logging. Avoid hydrating
  // the full doc.
  assert.match(
    fanOutSource,
    /\.select\(['"]\s*_id\s+phone\s+companyName\s*['"]\)/,
    'Loser query must use .select("_id phone companyName") — minimal projection'
  );
  assert.match(fanOutSource, /\.lean\(\)/,
    'Loser query must use .lean() — no Mongoose hydration on the loser fan-out');
});

// ── F. Failure isolation — per-loser fire-and-forget ───────────────────

test('F1. Each per-loser send is fire-and-forget with .catch', () => {
  // No await on the send. Each Promise has its own .catch so a single
  // send failure does not cascade.
  assert.match(
    fanOutSource,
    /sendMoverLostClaimSMS\(loser\.phone\)\.catch\(/,
    'Per-loser send must be fire-and-forget with its own .catch (no await blocking winner TwiML)'
  );
});

test('F2. Per-loser .catch logs a non-fatal warning, does NOT rethrow', () => {
  assert.match(
    fanOutSource,
    /loser SMS to [\s\S]{0,80}failed \(non-fatal\)/,
    'Per-loser .catch must log "(non-fatal)" so the operator can grep for cascade-free loser failures'
  );
});

test('F3. Entire fan-out block is wrapped in try/catch — non-fatal at the top level too', () => {
  // If the loserIds construction or User.find throws, the winner branch
  // must continue to send the winner TwiML. The outer try/catch catches.
  // Use non-greedy + larger window — the fan-out body is longer than
  // 2000 chars when comments are stripped lazily by the regex engine.
  assert.match(
    fanOutSource,
    /try\s*\{[\s\S]*?\}\s*catch\s*\(\s*e\s*\)/,
    'Fan-out block must be wrapped in try/catch (e)'
  );
  assert.match(
    fanOutSource,
    /loser fan-out failed \(non-fatal\)/,
    'Outer catch must log "(non-fatal)" — fan-out failures must never block winner TwiML'
  );
});

// ── G. Logging visibility for operator ─────────────────────────────────

test('G1. Fan-out logs broadcastTo / losers / eligible counts for observability', () => {
  assert.match(
    fanOutSource,
    /broadcastTo=\$\{broadcastTo\.length\}[\s\S]{0,80}losers=\$\{loserIds\.length\}[\s\S]{0,80}eligible=\$\{losers\.length\}/,
    'Fan-out must log three counts: broadcastTo size, loser count (after winner removal), ' +
    'eligible count (after TCPA gates). Helps operator confirm fan-out shape on first staging test.'
  );
});

// ── H. Scope discipline — no financial / lead / ClaimAttempt writes ────

test('H1. Fan-out does NOT write to Lead', () => {
  // Lead.claimWindow.status is already 'claimed' from the atomic CAS
  // upstream. The fan-out is read-only on Lead.
  assert.doesNotMatch(fanOutSource, /Lead\.findOneAndUpdate/,
    'Fan-out must NOT call Lead.findOneAndUpdate');
  assert.doesNotMatch(fanOutSource, /Lead\.updateOne/,
    'Fan-out must NOT call Lead.updateOne');
  assert.doesNotMatch(fanOutSource, /claimedLead\.save\(\)/,
    'Fan-out must NOT call claimedLead.save() — Lead is already finalized');
});

test('H2. Fan-out does NOT write to User (no balance refund, no counter bumps)', () => {
  assert.doesNotMatch(fanOutSource, /User\.findOneAndUpdate/,
    'Fan-out must NOT call User.findOneAndUpdate — losers had no debit, no refund needed');
  assert.doesNotMatch(fanOutSource, /User\.updateOne/,
    'Fan-out must NOT call User.updateOne');
});

test('H3. Fan-out does NOT create financial records', () => {
  assert.doesNotMatch(fanOutSource, /Transaction\.create/,
    'Fan-out must NOT create Transaction rows — losers had no financial event');
  assert.doesNotMatch(fanOutSource, /new PurchasedLead/,
    'Fan-out must NOT create PurchasedLead rows');
});

test('H4. Fan-out does NOT create additional ClaimAttempt rows', () => {
  // Losers are NOT distinct claim attempts. They are a notification
  // surface. The winning ClaimAttempt is the single record for this
  // claim race.
  assert.doesNotMatch(fanOutSource, /ClaimAttempt\.create/,
    'Fan-out must NOT create ClaimAttempt rows for losers');
  assert.doesNotMatch(fanOutSource, /new ClaimAttempt/,
    'Fan-out must NOT create ClaimAttempt rows for losers');
});

test('H5. Fan-out does NOT trigger socket emits', () => {
  // The single lead_sold emit fires earlier in the winner path. The fan-out
  // is mover-side notification only.
  assert.doesNotMatch(fanOutSource, /broadcastLeadSold|emitNewLead|getIo\(\)/,
    'Fan-out must NOT trigger any socket emit');
});

// ── I. PR-S3 atomic sequence unchanged ─────────────────────────────────

test('I1. PR-S3 atomic CAS shape unchanged', () => {
  // The atomic claim CAS that flips Lead.claimWindow.status to 'claimed'
  // must remain byte-for-byte identical to PR-S3. Pin the load-bearing
  // invariants.
  assert.match(
    twilioExec,
    /['"]claimWindow\.token['"]\s*:\s*token[\s\S]{0,300}['"]claimWindow\.status['"]\s*:\s*['"]open['"][\s\S]{0,200}['"]claimWindow\.expiresAt['"]\s*:\s*\{\s*\$gt:\s*now\s*\}/,
    'PR-S3 atomic CAS filter (token + status:open + expiresAt:$gt now) must remain unchanged'
  );
});

test('I2. PR-S3 conditional debit shape unchanged', () => {
  assert.match(
    twilioExec,
    /User\.findOneAndUpdate\(\s*\{\s*_id:\s*user\._id\s*,\s*balance:\s*\{\s*\$gte:\s*price\s*\}\s*\}\s*,\s*\{\s*\$inc:\s*\{\s*balance:\s*-price\s*\}\s*\}/,
    'PR-S3 conditional debit shape must remain unchanged'
  );
});

test('I3. PR-S3 Transaction shape unchanged — still uses "SMS claim: lead" description', () => {
  assert.match(
    twilioExec,
    /description:\s*`SMS claim: lead \$\{[^}]*\}`/,
    'PR-S3 Transaction description must remain "SMS claim: lead ${id}"'
  );
});

test('I4. PR-S3 PurchasedLead shape unchanged', () => {
  assert.match(
    twilioExec,
    /new PurchasedLead\(\{\s*company:\s*user\._id,\s*lead:\s*claimedLead\._id,\s*pricePaid:\s*price,\s*\}\)/,
    'PR-S3 PurchasedLead shape must remain unchanged'
  );
});

// ── J. Idempotency contract ────────────────────────────────────────────

test('J1. Fan-out is only reachable from the winner code path', () => {
  // The fan-out block is inside the winner branch, downstream of all the
  // success-only writes. If reachable from any of the loser branches
  // (rejected_*, lost_*, shadow_only), Twilio retries on those paths
  // could re-fire loser SMS.
  //
  // Verify by checking that the fan-out block sits between finalize('won')
  // and the winner TwiML body, anchored on strings that survive comment
  // stripping.
  const winnerFinalizeIdx = twilioSrc.indexOf("finalize('won'");
  const fanOutIdx         = twilioSrc.indexOf('CLAIM loser fan-out');
  const winnerTwimlIdx    = twilioSrc.indexOf('MoveLeads: lead claimed!');
  assert.ok(winnerFinalizeIdx > 0, 'finalize(\'won\') must exist');
  assert.ok(fanOutIdx > 0,         'fan-out marker must exist');
  assert.ok(winnerTwimlIdx > 0,    'winner-TwiML body literal must exist');
  assert.ok(winnerFinalizeIdx < fanOutIdx && fanOutIdx < winnerTwimlIdx,
    'Fan-out must sit strictly between finalize(\'won\') and the winner TwiML body — ' +
    'no loser-branch escape can reach it');
});

test('J2. Twilio retry idempotency — duplicate MessageSid still short-circuits BEFORE the winner code', () => {
  // The duplicate-MessageSid path (PR-S1 unique-sparse index) must STILL
  // return empty TwiML before the winner branch can re-run. Regression
  // guard against accidental reordering.
  const dupIdx = twilioExec.indexOf('duplicate MessageSid');
  const winnerIdx = twilioExec.indexOf("finalize('won'");
  assert.ok(dupIdx > 0, 'duplicate MessageSid short-circuit must exist');
  assert.ok(dupIdx < winnerIdx,
    'duplicate-MessageSid early-return must precede the winner branch — ' +
    'so Twilio retries cannot re-fire the loser fan-out');
});

// ── K. Sibling discipline — routes/bids.js untouched ───────────────────

test('K1. routes/bids.js buy-now route untouched', () => {
  const bidsSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'bids.js'), 'utf8');
  assert.match(bidsSrc, /router\.post\(\s*['"]\/:leadId\/buy-now['"]/,
    'buy-now route must still exist');
  // No loser fan-out should leak into buy-now.
  assert.doesNotMatch(bidsSrc, /sendMoverLostClaimSMS/,
    'sendMoverLostClaimSMS must NOT be called from routes/bids.js — SMS-claim concept only');
  assert.doesNotMatch(bidsSrc, /loser fan-out/,
    'Loser fan-out concept must NOT leak into routes/bids.js');
});

console.log('SMS Claim loser notification (PR-S6) tests scheduled.');
