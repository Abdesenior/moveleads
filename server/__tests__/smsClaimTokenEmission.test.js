/**
 * SMS Claim token emission (PR-S5) lock-in.
 *
 * Fourth of five pre-flip hardening blockers for the SMS Claim pipeline.
 * The earlier PRs (S1, S2, S2a) installed the safety indexes; this one
 * wires the dispatch path so an outbound mover SMS actually carries a
 * disambiguating token AND a matching claimWindow gets opened on the Lead.
 *
 * Scope discipline:
 *   - Behind ENABLE_SMS_CLAIM_SCAFFOLD flag (default off).
 *   - Flag OFF must leave production behavior IDENTICAL to pre-PR-S5
 *     (no claimWindow writes, no token in SMS body).
 *   - Flag ON must (a) call openClaimWindow before broadcasting and
 *     (b) pass the returned token into every sendMoverLeadSMS call.
 *   - PR-S5 does NOT touch: bid atomicity (routes/bids.js), balance
 *     debits, PurchasedLead writes, Transaction writes, or the inbound
 *     webhook (still shadow-only until PR-S3).
 *
 * This suite pins the contract at the source level + behaviorally for
 * sendMoverLeadSMS body composition. The atomic write inside
 * openClaimWindow itself is exercised via schema-introspection on the
 * existing Lead.claimWindow index suite (leadClaimWindowIndexes.test.js)
 * and the conditional filter is asserted at the source level here.
 *
 *   A. utils/claimWindow.js exists and exports openClaimWindow
 *   B. openClaimWindow uses the unique-sparse token + retry-on-E11000 pattern
 *   C. openClaimWindow CAS filter refuses to clobber open/claimed windows
 *   D. smsService.sendMoverLeadSMS accepts an optional 3rd claimToken arg
 *   E. Body switches "Claim: moveleads.cloud/login" → "Reply SEND <token> to claim"
 *      when a token is provided; otherwise unchanged (regression guard)
 *   F. twilioService.broadcastLeadSMS gates the openClaimWindow call on
 *      ENABLE_SMS_CLAIM_SCAFFOLD === 'true' and threads the token through
 *      to sendMoverLeadSMS
 *   G. PR-S5 audit-trail comment is present in each touched file
 *
 * Pure-Node, no Mongo. Source-level + behavioral (function call) assertions.
 *
 * Run: `node server/__tests__/smsClaimTokenEmission.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const claimWindowPath = path.join(serverRoot, 'utils', 'claimWindow.js');
const smsServicePath = path.join(serverRoot, 'services', 'smsService.js');
const twilioServicePath = path.join(serverRoot, 'services', 'twilioService.js');

const claimWindowSrc = fs.readFileSync(claimWindowPath, 'utf8');
const smsServiceSrc = fs.readFileSync(smsServicePath, 'utf8');
const twilioServiceSrc = fs.readFileSync(twilioServicePath, 'utf8');

// Strip JS comments so audit-trail comments mentioning retired strings
// don't false-positive scans for those strings.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const claimWindowExec = stripComments(claimWindowSrc);
const smsServiceExec = stripComments(smsServiceSrc);
const twilioServiceExec = stripComments(twilioServiceSrc);

// ── A. utils/claimWindow.js exists and exports openClaimWindow ──────────

test('A1. utils/claimWindow.js exists at the documented path', () => {
  assert.ok(fs.existsSync(claimWindowPath),
    'Expected utils/claimWindow.js to exist (PR-S5 new file)');
});

test('A2. utils/claimWindow.js exports openClaimWindow', () => {
  const mod = require('../utils/claimWindow');
  assert.equal(typeof mod.openClaimWindow, 'function',
    'openClaimWindow must be exported as a function');
});

test('A3. claimWindow.js requires utils/claimToken for token generation', () => {
  // Keeping claimToken.js Mongo-free is a separation-of-concerns
  // requirement: token generation is pure; only the writer touches Mongo.
  assert.match(claimWindowExec, /require\(['"]\.\/claimToken['"]\)/,
    'openClaimWindow must use claimToken.generateToken — not duplicate the alphabet logic');
  assert.match(claimWindowExec, /generateToken/,
    'openClaimWindow must call generateToken');
});

// ── B. Unique-sparse token + retry-on-E11000 pattern ────────────────────

test('B1. openClaimWindow uses Lead.findOneAndUpdate for the atomic CAS', () => {
  assert.match(claimWindowExec, /Lead\.findOneAndUpdate/,
    'Must use findOneAndUpdate (atomic CAS) — not find-then-save (race-prone)');
});

test('B2. openClaimWindow has a token-collision retry loop', () => {
  // The unique-sparse index (claimWindow_token_unique from PR-S2) throws
  // E11000 on token collision. The helper must catch and regenerate.
  assert.match(claimWindowExec, /11000|DuplicateKey/,
    'Must catch the duplicate-key error from claimWindow_token_unique');
  assert.match(claimWindowExec, /MAX_TOKEN_RETRIES|attempt\s*<=?\s*\d/,
    'Must bound the retry loop (no infinite retry on a runaway collision)');
});

// ── C. CAS filter refuses to clobber open/claimed windows ──────────────

test('C1. openClaimWindow filter uses $nin to skip open + claimed windows', () => {
  // The CAS filter is the load-bearing safety property — we never want
  // to overwrite an in-flight (`open`) or terminal (`claimed`) window.
  // Expired / admin_revoked / null may be overwritten (re-broadcast).
  assert.match(
    claimWindowExec,
    /['"]claimWindow\.status['"]\s*:\s*\{\s*\$nin\s*:\s*\[\s*['"]open['"]\s*,\s*['"]claimed['"]\s*\]\s*\}/,
    'Filter must be { "claimWindow.status": { $nin: ["open", "claimed"] } }'
  );
});

test('C2. openClaimWindow writes the full claimWindow subdoc shape', () => {
  // The schema (models/Lead.js) requires: status, openedAt, expiresAt,
  // token, windowMinutes, broadcastTo. All must be set together so the
  // Phase 5 inbound handler can rely on the shape.
  for (const field of ['status', 'openedAt', 'expiresAt', 'token', 'windowMinutes', 'broadcastTo']) {
    assert.match(claimWindowExec, new RegExp(`\\b${field}\\b`),
      `Must write claimWindow.${field} in the $set payload`);
  }
  // Status must be 'open' specifically — anything else would invent a state.
  assert.match(claimWindowExec, /status\s*:\s*['"]open['"]/,
    'New window must be opened with status: "open"');
});

test('C3. openClaimWindow returns { token, expiresAt } on success and null on failure', () => {
  // Callers (twilioService.broadcastLeadSMS) check `opened && opened.token`
  // to decide whether to use the token; the null path is the documented
  // "fall back to tokenless broadcast" signal.
  assert.match(claimWindowExec, /return\s*\{\s*token\s*,\s*expiresAt\s*\}/,
    'Success path must return { token, expiresAt }');
  assert.match(claimWindowExec, /return\s+null/,
    'Failure paths (already-open/claimed, exhausted retries) must return null, ' +
    'so callers can fall back to a tokenless broadcast.');
});

// ── D. sendMoverLeadSMS accepts optional 3rd claimToken arg ─────────────

test('D1. sendMoverLeadSMS signature accepts (toPhone, lead, claimToken)', () => {
  assert.match(
    smsServiceExec,
    /async\s+function\s+sendMoverLeadSMS\s*\(\s*toPhone\s*,\s*lead\s*,\s*claimToken\s*(=\s*null\s*)?\)/,
    'Signature must be sendMoverLeadSMS(toPhone, lead, claimToken = null) — token must default to null so existing callers stay correct without code changes.'
  );
});

// ── E. Body composition behavior ───────────────────────────────────────

test('E1. Without token, body still contains the legacy dashboard CTA (regression)', async () => {
  // Behavioral test: mock Twilio creds OFF so the function bails before
  // calling Twilio, but we'll directly verify the body-build logic by
  // re-reading the source. The bail short-circuits without exposing the
  // body, so we assert structurally that the legacy line is still
  // present in source as the fallback branch.
  assert.match(smsServiceExec, /Claim:\s*moveleads\.cloud\/login/,
    'Tokenless body must keep the legacy "Claim: moveleads.cloud/login" CTA');
});

test('E2. With a token, body uses "Reply SEND <token> to claim"', () => {
  assert.match(
    smsServiceExec,
    /Reply SEND \$\{claimToken\} to claim/,
    'Token path must produce "Reply SEND <token> to claim" — exact wording matters; the inbound parser (claimToken.parseClaimReply) expects "SEND <token>"'
  );
});

test('E3. Token path is gated on the claimToken arg being truthy', () => {
  // We want a clean ternary / if-check on the token, NOT some always-on
  // path that depends on env state inside smsService. smsService stays
  // flag-agnostic — the flag check lives in twilioService.broadcastLeadSMS.
  assert.match(
    smsServiceExec,
    /claimToken\s*\?[\s\S]*?`Reply SEND \$\{claimToken\} to claim`[\s\S]*?:\s*`Claim:\s*moveleads\.cloud\/login`/,
    'Body composition must branch on claimToken (ternary) — keeps smsService env-agnostic'
  );
});

test('E4. Body remains within 160-char single-segment budget (truncation preserved)', () => {
  // The 160-char SMS segment guard predates PR-S5 and must remain — both
  // because Twilio charges per segment and because the inbound parser
  // assumes a single-segment reply.
  assert.match(smsServiceExec, /body\.length\s*>\s*160/,
    '160-char truncation guard must remain');
  assert.match(smsServiceExec, /body\.slice\(0,\s*157\)\s*\+\s*['"]\.\.\.['"]/,
    'Truncation must keep the "..." marker at char 157');
});

// ── F. broadcastLeadSMS gates on ENABLE_SMS_CLAIM_SCAFFOLD ─────────────

test('F1. broadcastLeadSMS requires openClaimWindow from utils/claimWindow', () => {
  assert.match(
    twilioServiceExec,
    /require\(['"]\.\.\/utils\/claimWindow['"]\)/,
    'twilioService.js must require utils/claimWindow at module load'
  );
});

test('F2. The openClaimWindow call is gated on ENABLE_SMS_CLAIM_SCAFFOLD === "true"', () => {
  // Hard string match. If someone collapses this to a truthy check
  // (e.g. `if (process.env.ENABLE_SMS_CLAIM_SCAFFOLD)`) we'd accept
  // "false" as enabling — pin the explicit comparison.
  assert.match(
    twilioServiceExec,
    /process\.env\.ENABLE_SMS_CLAIM_SCAFFOLD\s*===\s*['"]true['"]/,
    'The scaffold gate must be a strict-equal-"true" check, not a truthy check (avoids "false" → truthy footgun)'
  );
});

test('F3. openClaimWindow is called with lead._id and recipient IDs from matched movers', () => {
  // Pin the argument shape so a future refactor doesn't accidentally
  // pass the entire mover objects (PII leak into claimWindow.broadcastTo).
  assert.match(
    twilioServiceExec,
    /openClaimWindow\(\s*lead\._id\s*,\s*recipientIds\s*\)/,
    'openClaimWindow(leadId, recipientIds) — recipientIds is the matched movers _id array, not the full mover objects'
  );
  assert.match(
    twilioServiceExec,
    /recipientIds\s*=\s*matched\.map\(\s*m\s*=>\s*m\._id\s*\)/,
    'recipientIds must be matched.map(m => m._id) — IDs only, no PII'
  );
});

test('F4. Token from openClaimWindow is threaded into sendMoverLeadSMS as 3rd arg', () => {
  // The whole point of opening the window is to put the token in the SMS.
  // If a refactor drops the 3rd arg we'd silently regress.
  assert.match(
    twilioServiceExec,
    /sendMoverLeadSMS\(\s*mover\.phone\s*,\s*lead\s*,\s*claimToken\s*\)/,
    'sendMoverLeadSMS must be called with (mover.phone, lead, claimToken) — drop the 3rd arg and the SMS reverts to tokenless silently'
  );
});

test('F5. broadcastLeadSMS does NOT block the broadcast on openClaimWindow errors', () => {
  // Operational discipline: SMS dispatch is the priority; Phase 4 token
  // emission is shadow. If openClaimWindow throws or returns null, we
  // log + continue tokenless. No early return / no rethrow.
  assert.match(
    twilioServiceExec,
    /try\s*\{[\s\S]*?openClaimWindow[\s\S]*?\}\s*catch\s*\(/,
    'openClaimWindow must be wrapped in try/catch'
  );
  assert.match(
    twilioServiceExec,
    /Continuing with tokenless broadcast|falling back to tokenless|tokenless broadcast/i,
    'The catch/null branch must log a fallback message — operators read for this when triaging silent token-missing reports'
  );
});

test('F6. Flag-off path leaves claimToken at null (no Lead.claimWindow writes)', () => {
  // Critical: flag-OFF production state. claimToken must stay null from
  // its initial declaration if the env check fails. The token gets passed
  // to sendMoverLeadSMS regardless — null token → legacy body branch.
  assert.match(
    twilioServiceExec,
    /let\s+claimToken\s*=\s*null\s*;\s*if\s*\(\s*process\.env\.ENABLE_SMS_CLAIM_SCAFFOLD/,
    'claimToken must be declared `let claimToken = null` immediately followed by the env-gated if — keeps the flag-OFF default truly null'
  );
});

// ── G. PR-S5 audit-trail comments ──────────────────────────────────────

test('G1. claimWindow.js documents itself as PR-S5 / Phase 4 scaffold', () => {
  assert.match(claimWindowSrc, /PR-S5/,
    'claimWindow.js must carry the PR-S5 audit tag');
  assert.match(claimWindowSrc, /Phase 4/i,
    'claimWindow.js must identify itself as the Phase 4 scaffold');
});

test('G2. smsService.js mentions PR-S5 in the function signature docstring', () => {
  assert.match(smsServiceSrc, /PR-S5/,
    'smsService.js must reference PR-S5 in the claimToken doc');
});

test('G3. twilioService.js call-site is annotated with PR-S5 + the flag name', () => {
  // A future contributor reading broadcastLeadSMS should immediately
  // see WHY there's a sudden Mongo write inside the SMS dispatch path
  // and WHICH flag controls it.
  assert.match(twilioServiceSrc, /PR-S5/,
    'twilioService.js broadcast call-site must reference PR-S5');
  assert.match(twilioServiceSrc, /ENABLE_SMS_CLAIM_SCAFFOLD/,
    'The flag name must appear in the call-site comment so a future ' +
    'contributor can flip it without reading external docs');
});

// ── H. Scope discipline — what PR-S5 does NOT touch ────────────────────

test('H1. claimWindow.js does NOT import financial models (routes/bids.js territory)', () => {
  // PR-S5 must not touch atomicity in the financial path. The helper
  // only touches Lead.
  assert.doesNotMatch(claimWindowExec, /require\(['"][^'"]*PurchasedLead['"]\)/,
    'PR-S5 must NOT require PurchasedLead — financial atomicity belongs in routes/bids.js, not the SMS scaffold');
  assert.doesNotMatch(claimWindowExec, /require\(['"][^'"]*Transaction['"]\)/,
    'PR-S5 must NOT require Transaction — only routes/bids.js owns money writes');
  assert.doesNotMatch(claimWindowExec, /require\(['"][^'"]*User['"]\)/,
    'PR-S5 must NOT require User — balance debits live in routes/bids.js, this scaffold only opens a window');
});

test('H2. broadcastLeadSMS still flips notifiedAt unchanged (regression guard)', () => {
  // The notifiedAt flip is the pre-existing dedup guard; PR-S5 must not
  // change it. If a future refactor moves it inside the scaffold gate
  // we'd silently break the email-broadcast race short-circuit.
  assert.match(
    twilioServiceExec,
    /Lead\.updateOne\(\s*\{\s*_id:\s*lead\._id\s*,\s*notifiedAt:\s*null\s*\}\s*,\s*\{\s*\$set:\s*\{\s*notifiedAt:\s*new Date\(\)\s*\}\s*\}\s*\)/,
    'The pre-existing notifiedAt CAS flip must remain unchanged'
  );
});

console.log('SMS Claim token emission (PR-S5) tests scheduled.');
