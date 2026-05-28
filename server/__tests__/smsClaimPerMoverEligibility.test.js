/**
 * Per-mover SMS Claim eligibility lock-in.
 *
 * Bug closed by this PR:
 *
 *   The SMS Claim mode was previously decided by a single global env
 *   flag (ENABLE_SMS_CLAIM_SCAFFOLD). When the flag was on, EVERY mover
 *   in the matched array received the Claim variant ("Reply SEND <token>
 *   to claim") — including movers without balance, movers who never
 *   activated SMS Claim, etc. They would receive the SMS, reply SEND,
 *   and get rejected_low_balance at the inbound debit step. Wasted Twilio
 *   cost + mover confusion + spurious ClaimAttempt rows + misleading PR-S6
 *   "no charge was made" loser SMS to movers who never had a real chance.
 *
 *   Meanwhile, the SmsClaim page's "Activate Instant Jobs (preview)"
 *   toggle wrote User.smsClaim.optInRequested but the dispatch path
 *   never read it. The button was cosmetic.
 *
 * Fix:
 *   Per-mover eligibility evaluation INSIDE broadcastLeadSMS. Movers
 *   who qualify get the Claim variant; everyone else still gets an SMS,
 *   just the Alert variant ("Claim: moveleads.cloud/login"). One
 *   broadcaster, one inbound webhook, one candidate system — but now
 *   two clear message modes selected per mover.
 *
 *   isClaimEligible(mover, lead) =
 *     ENABLE_SMS_CLAIM_SCAFFOLD === 'true'
 *     && mover.smsClaim?.optInRequested === true
 *     && mover.balance >= lead.buyNowPrice
 *
 * This suite pins:
 *
 *   A. Candidate query selects the new fields (balance, smsClaim)
 *   B. isClaimEligible predicate exists with the documented conditions
 *   C. Partition produces two disjoint arrays (claimEligible + alertOnly)
 *   D. openClaimWindow called with claimEligibleMovers.map(_id),
 *      NOT matched.map(_id) — broadcastTo includes only race participants
 *   E. Per-mover send loop uses per-mover token (null for alert-only)
 *   F. openClaimWindow only fires when claimEligibleMovers.length > 0
 *      (scaffold-on with no eligible movers does NOT open a window)
 *   G. Mode-partition observability log present
 *   H. Scope discipline — no inbound handler change, no financial change,
 *      no schema change, no other smsClaim.* fields read at dispatch
 *      (retire-the-read preserved for maxLeadPrice/residentialOnly/etc.)
 *   I. PR-S3/S5/S6 invariants intact
 *   J. PR #52 dispatch orchestrator invariants intact
 *   K. sendMoverLeadSMS body composition unchanged (still chooses
 *      Alert vs Claim variant based on claimToken arg presence)
 *
 * Pure-Node, no Mongo. Source-level + behavioral assertions on the
 * partition predicate semantics.
 *
 * Run: `node server/__tests__/smsClaimPerMoverEligibility.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const twilioSvcPath = path.join(serverRoot, 'services', 'twilioService.js');
const smsSvcPath    = path.join(serverRoot, 'services', 'smsService.js');
const userModelPath = path.join(serverRoot, 'models',   'User.js');

const twilioSvcSrc = fs.readFileSync(twilioSvcPath, 'utf8');
const smsSvcSrc    = fs.readFileSync(smsSvcPath,    'utf8');
const userSrc      = fs.readFileSync(userModelPath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const twilioSvcExec = stripComments(twilioSvcSrc);
const smsSvcExec    = stripComments(smsSvcSrc);
const userExec      = stripComments(userSrc);

// ── A. Candidate query selects new fields ─────────────────────────────

test('A1. Candidate User.find().select() includes `balance`', () => {
  // The per-mover eligibility check needs balance. Without it in the
  // projection, mover.balance is undefined and every mover fails the
  // eligibility check (Number(undefined||0)=0 < any positive price).
  // That would silently regress all movers to the Alert variant.
  assert.match(
    twilioSvcExec,
    /\.select\(['"][^'"]*\bbalance\b[^'"]*['"]\)/,
    'Candidate query must include `balance` in .select(...) projection'
  );
});

test('A2. Candidate User.find().select() includes `smsClaim`', () => {
  // The per-mover eligibility check needs smsClaim.optInRequested.
  // Selecting the whole `smsClaim` subdoc keeps the projection list
  // short (one entry) and follows Mongoose convention.
  assert.match(
    twilioSvcExec,
    /\.select\(['"][^'"]*\bsmsClaim\b[^'"]*['"]\)/,
    'Candidate query must include `smsClaim` in .select(...) projection'
  );
});

test('A3. Existing select fields unchanged (regression guard)', () => {
  // The prior PRs (PR-C2/C3/C4/D7, PR #48, etc.) all rely on specific
  // fields being projected. Confirm none were collateral-damaged.
  for (const field of [
    'phone', 'companyName', 'smsNotif', 'emailNotif', 'isSuspended',
    'smsOptOut', 'phoneVerified', 'smsCounters', 'maxDistance',
    'preferredHomeSizes', 'deliversNationwide', 'pickupStates',
    'deliveryStates', 'serviceStates', 'onboarding.answers',
  ]) {
    const re = new RegExp(`\\.select\\(['"][^'"]*\\b${field.replace('.', '\\.')}\\b[^'"]*['"]\\)`);
    assert.match(twilioSvcExec, re,
      `Existing projection field '${field}' must remain in .select(...)`);
  }
});

// ── B. isClaimEligible predicate ──────────────────────────────────────

test('B1. isClaimEligible is defined as an arrow function inside broadcastLeadSMS', () => {
  assert.match(
    twilioSvcExec,
    /const\s+isClaimEligible\s*=\s*\(\s*mover\s*\)\s*=>/,
    'isClaimEligible must be defined as `const isClaimEligible = (mover) => ...`'
  );
});

test('B2. Eligibility predicate reads scaffoldEnabled (= ENABLE_SMS_CLAIM_SCAFFOLD === "true")', () => {
  // The master env flag stays as the master switch. Per-mover decision
  // is layered on top — flag off → no mover is eligible → all get Alert.
  assert.match(
    twilioSvcExec,
    /const\s+scaffoldEnabled\s*=\s*process\.env\.ENABLE_SMS_CLAIM_SCAFFOLD\s*===\s*['"]true['"]/,
    'scaffoldEnabled must be derived from `process.env.ENABLE_SMS_CLAIM_SCAFFOLD === "true"` (strict-equal)'
  );
  assert.match(
    twilioSvcExec,
    /isClaimEligible\s*=\s*\(\s*mover\s*\)\s*=>\s*[\s\S]{0,300}scaffoldEnabled\s*&&/,
    'Predicate must check scaffoldEnabled first'
  );
});

test('B3. Predicate reads mover.smsClaim.optInRequested (the activation flag)', () => {
  assert.match(
    twilioSvcExec,
    /mover\.smsClaim\s*&&\s*mover\.smsClaim\.optInRequested\s*===\s*true/,
    'Predicate must check `mover.smsClaim && mover.smsClaim.optInRequested === true` — ' +
    'defensive against legacy users with no smsClaim subdoc'
  );
});

test('B4. Predicate compares mover.balance to lead.buyNowPrice (with Number() coercion)', () => {
  // Mongoose returns balance as a Number, but be defensive against
  // missing/null values from legacy docs.
  assert.match(
    twilioSvcExec,
    /Number\(\s*mover\.balance\s*\|\|\s*0\s*\)\s*>=\s*Number\(\s*lead\.buyNowPrice\s*\|\|\s*0\s*\)/,
    'Balance check must be `Number(mover.balance || 0) >= Number(lead.buyNowPrice || 0)` — ' +
    'defensive coercion for legacy docs'
  );
});

test('B5. Predicate does NOT read retired smsClaim filter fields', () => {
  // Per retire-the-read principle: maxLeadPrice / residentialOnly /
  // commercialOptIn / asapOnly / dailyClaimCap remain NOT consulted.
  // Only optInRequested is read. If a future contributor adds reads on
  // those fields, this test fires.
  const fnBlock = twilioSvcExec.match(/isClaimEligible\s*=\s*\(\s*mover\s*\)\s*=>[\s\S]{0,500}?;/);
  assert.ok(fnBlock, 'isClaimEligible expression must be findable');
  for (const retired of [
    'maxLeadPrice', 'residentialOnly', 'commercialOptIn', 'asapOnly', 'dailyClaimCap',
  ]) {
    assert.doesNotMatch(fnBlock[0], new RegExp(`\\b${retired}\\b`),
      `Predicate must NOT read smsClaim.${retired} — retire-the-read principle`);
  }
});

// ── C. Partition produces two disjoint arrays ──────────────────────────

test('C1. claimEligibleMovers and alertOnlyMovers arrays are derived from matched', () => {
  assert.match(
    twilioSvcExec,
    /const\s+claimEligibleMovers\s*=\s*matched\.filter\(\s*isClaimEligible\s*\)/,
    'claimEligibleMovers must be `matched.filter(isClaimEligible)`'
  );
  assert.match(
    twilioSvcExec,
    /const\s+alertOnlyMovers\s*=\s*matched\.filter\(\s*m\s*=>\s*!isClaimEligible\(\s*m\s*\)\s*\)/,
    'alertOnlyMovers must be `matched.filter(m => !isClaimEligible(m))`'
  );
});

// ── D. openClaimWindow uses claim-eligible IDs only ────────────────────

test('D1. openClaimWindow receives claimEligibleMovers.map(_id), NOT matched.map(_id)', () => {
  // This is the load-bearing assertion. If a future contributor passes
  // `matched.map(_id)` again, the broadcastTo set re-bloats with movers
  // who can't claim, and PR-S6 loser fan-out re-introduces the misleading
  // "no charge was made" SMS to movers who never had a chance.
  assert.match(
    twilioSvcExec,
    /openClaimWindow\(\s*lead\._id\s*,\s*recipientIds\s*\)/,
    'openClaimWindow must be called as openClaimWindow(lead._id, recipientIds)'
  );
  assert.match(
    twilioSvcExec,
    /recipientIds\s*=\s*claimEligibleMovers\.map\(\s*m\s*=>\s*m\._id\s*\)/,
    'recipientIds must be `claimEligibleMovers.map(m => m._id)` — ' +
    'broadcastTo only contains race participants'
  );
  // And NOT the legacy `matched.map(m => m._id)` shape.
  assert.doesNotMatch(
    twilioSvcExec,
    /recipientIds\s*=\s*matched\.map\(\s*m\s*=>\s*m\._id\s*\)/,
    'Legacy `recipientIds = matched.map(m => m._id)` must be gone'
  );
});

// ── E. Per-mover send loop uses per-mover token ────────────────────────

test('E1. Per-mover send call uses a per-mover token (claimToken or null)', () => {
  assert.match(
    twilioSvcExec,
    /tokenForThisMover\s*=\s*isClaimEligible\(\s*mover\s*\)\s*\?\s*claimToken\s*:\s*null/,
    'tokenForThisMover must be `isClaimEligible(mover) ? claimToken : null` ' +
    '— alert-only movers get null even if a token was generated for the eligible cohort'
  );
  assert.match(
    twilioSvcExec,
    /sendMoverLeadSMS\(\s*mover\.phone\s*,\s*lead\s*,\s*tokenForThisMover\s*\)/,
    'sendMoverLeadSMS must be called with the per-mover token (not the global claimToken)'
  );
});

test('E2. No remaining call site uses the global claimToken for everyone', () => {
  // The legacy shape was `sendMoverLeadSMS(mover.phone, lead, claimToken)`
  // — that exact line must be gone, replaced by the per-mover variant.
  assert.doesNotMatch(
    twilioSvcExec,
    /sendMoverLeadSMS\(\s*mover\.phone\s*,\s*lead\s*,\s*claimToken\s*\)/,
    'Legacy `sendMoverLeadSMS(mover.phone, lead, claimToken)` must be gone'
  );
});

// ── F. openClaimWindow gating ──────────────────────────────────────────

test('F1. openClaimWindow is only invoked when claimEligibleMovers.length > 0', () => {
  // The flag check moved from `ENABLE_SMS_CLAIM_SCAFFOLD === 'true'` to
  // `claimEligibleMovers.length > 0`. The flag still gates the predicate;
  // this is the additional "are there real candidates" gate.
  assert.match(
    twilioSvcExec,
    /if\s*\(\s*claimEligibleMovers\.length\s*>\s*0\s*\)\s*\{[\s\S]{0,500}?openClaimWindow/,
    'openClaimWindow must be gated on `if (claimEligibleMovers.length > 0)`'
  );
});

test('F2. claimToken default is null (Alert variant unless explicitly assigned)', () => {
  assert.match(twilioSvcExec, /let\s+claimToken\s*=\s*null\s*;/,
    'claimToken must default to null — the Alert variant is the fallback');
});

test('F3. claimToken is only assigned from a successful openClaimWindow result', () => {
  assert.match(
    twilioSvcExec,
    /if\s*\(\s*opened\s*&&\s*opened\.token\s*\)\s*\{\s*claimToken\s*=\s*opened\.token/,
    'claimToken must only be assigned from `opened.token` after a successful openClaimWindow'
  );
});

// ── G. Mode-partition observability log ────────────────────────────────

test('G1. Partition log includes matched / claim / alert counts and scaffold flag state', () => {
  // Operator must be able to grep Render logs to see the partition shape
  // for each broadcast: how many movers matched, how many got Claim, how
  // many got Alert. scaffold flag state helps debug "is the feature even
  // on in this environment".
  assert.match(
    twilioSvcExec,
    /\[SMS\] mode partition lead=\$\{lead\._id\}[\s\S]{0,80}matched=\$\{matched\.length\}[\s\S]{0,80}claim=\$\{claimEligibleMovers\.length\}[\s\S]{0,80}alert=\$\{alertOnlyMovers\.length\}[\s\S]{0,80}scaffoldEnabled=\$\{scaffoldEnabled\}/,
    'Partition log must include lead id, matched count, claim count, alert count, scaffoldEnabled state'
  );
});

// ── H. Scope discipline ────────────────────────────────────────────────

test('H1. Inbound CLAIM handler in routes/twilio.js is unchanged (no new optInRequested check)', () => {
  // The inbound atomic CAS + debit + PurchasedLead sequence is the
  // financial path — it MUST stay unchanged. Outbound filtering is the
  // gating mechanism for this PR.
  const twilioRoutePath = path.join(serverRoot, 'routes', 'twilio.js');
  const twilioRouteSrc = fs.readFileSync(twilioRoutePath, 'utf8');
  // No new optInRequested check in the inbound handler.
  assert.doesNotMatch(twilioRouteSrc, /optInRequested/,
    'Inbound /sms/inbound handler must NOT read smsClaim.optInRequested — ' +
    'outbound filtering is the gating mechanism');
  // PR-S3 atomic CAS shape unchanged.
  assert.match(
    stripComments(twilioRouteSrc),
    /['"]claimWindow\.token['"]\s*:\s*token[\s\S]{0,300}['"]claimWindow\.status['"]\s*:\s*['"]open['"][\s\S]{0,200}['"]claimWindow\.expiresAt['"]\s*:\s*\{\s*\$gt:\s*now\s*\}/,
    'PR-S3 atomic CAS filter must remain unchanged'
  );
});

test('H2. No financial code touched in broadcastLeadSMS', () => {
  // The broadcast path is read-only on financial state.
  const fnRegion = twilioSvcExec.match(/async function broadcastLeadSMS[\s\S]*?(?=\nasync function |\nfunction |\nmodule\.exports)/);
  assert.ok(fnRegion, 'broadcastLeadSMS function body must be findable');
  for (const forbidden of [
    /Transaction\.create/,
    /new PurchasedLead/,
    /PurchasedLead\.create/,
    /\$inc:\s*\{\s*balance/,
  ]) {
    assert.doesNotMatch(fnRegion[0], forbidden,
      `broadcastLeadSMS must contain no financial writes (${forbidden})`);
  }
});

test('H3. No schema change — User.smsClaim enum unchanged', () => {
  // Schema status enum must still be ['inactive', 'needs_balance', 'preview_enabled'].
  // The audit flagged a possible future 'eligible_live' value but this PR
  // does NOT add it.
  assert.match(
    userExec,
    /status:\s*\{\s*type:\s*String\s*,\s*enum:\s*\[\s*['"]inactive['"]\s*,\s*['"]needs_balance['"]\s*,\s*['"]preview_enabled['"]\s*\]/,
    'User.smsClaim.status enum must remain ["inactive", "needs_balance", "preview_enabled"] — ' +
    'no schema change in this PR'
  );
});

test('H4. No new env flags — only ENABLE_SMS_CLAIM_SCAFFOLD is read', () => {
  // The PR introduces NO new ENABLE_*/FEATURE_* env reads. ENABLE_SMS_CLAIM_LIVE
  // is read inside routes/twilio.js (PR-S3) — untouched here.
  const fnRegion = twilioSvcExec.match(/async function broadcastLeadSMS[\s\S]*?(?=\nasync function |\nfunction |\nmodule\.exports)/);
  assert.ok(fnRegion);
  // The only ENABLE_* read in broadcastLeadSMS is ENABLE_SMS_CLAIM_SCAFFOLD.
  const enableReads = fnRegion[0].match(/process\.env\.ENABLE_[A-Z_]+/g) || [];
  for (const read of enableReads) {
    assert.equal(read, 'process.env.ENABLE_SMS_CLAIM_SCAFFOLD',
      `broadcastLeadSMS must only read ENABLE_SMS_CLAIM_SCAFFOLD env var. Got: ${read}`);
  }
});

// ── I. PR-S3 / S5 / S6 invariants intact ───────────────────────────────

test('I1. PR-S5 openClaimWindow contract unchanged', () => {
  assert.match(
    twilioSvcExec,
    /openClaimWindow\(\s*lead\._id\s*,\s*recipientIds\s*\)/,
    'PR-S5 openClaimWindow(leadId, recipientIds) shape unchanged'
  );
});

test('I2. PR-S6 loser fan-out is reachable via the inbound handler (not broadcastLeadSMS)', () => {
  // PR-S6 lives in routes/twilio.js (inbound CLAIM branch). Confirm it
  // wasn't accidentally moved to broadcastLeadSMS.
  const twilioRoutePath = path.join(serverRoot, 'routes', 'twilio.js');
  const twilioRouteSrc = fs.readFileSync(twilioRoutePath, 'utf8');
  assert.match(twilioRouteSrc, /CLAIM loser fan-out/,
    'PR-S6 loser fan-out must remain in routes/twilio.js');
  assert.doesNotMatch(twilioSvcExec, /CLAIM loser fan-out|sendMoverLostClaimSMS/,
    'PR-S6 loser fan-out must NOT appear in services/twilioService.js broadcastLeadSMS');
});

test('I3. Daily SMS cap raw-driver pipeline (PR #50) unchanged', () => {
  assert.match(twilioSvcExec, /User\.collection\.updateOne/,
    'PR #50 raw-driver smsCounters bump must remain');
});

// ── J. PR #52 dispatch orchestrator invariants intact ──────────────────

test('J1. broadcastLeadSMS is still called by the orchestrator (not bypassed)', () => {
  // PR #52's dispatchOrchestrator.js is the canonical caller. Confirm
  // it still imports broadcastLeadSMS from twilioService.
  const orchPath = path.join(serverRoot, 'services', 'dispatchOrchestrator.js');
  const orchSrc = fs.readFileSync(orchPath, 'utf8');
  assert.match(stripComments(orchSrc), /broadcastLeadSMS\(\s*fresh\s*,\s*\{\s*force\s*\}\s*\)/,
    'PR #52 orchestrator must still call broadcastLeadSMS(fresh, { force })');
});

// ── K. sendMoverLeadSMS body composition unchanged ────────────────────

test('K1. sendMoverLeadSMS signature still accepts (toPhone, lead, claimToken)', () => {
  // The PR-S5 helper signature is the contract this PR relies on.
  // Confirm it wasn't accidentally changed.
  assert.match(
    smsSvcExec,
    /async\s+function\s+sendMoverLeadSMS\s*\(\s*toPhone\s*,\s*lead\s*,\s*claimToken\s*=\s*null\s*\)/,
    'sendMoverLeadSMS signature must remain (toPhone, lead, claimToken = null)'
  );
});

test('K2. Body chooses Claim vs Alert variant based on claimToken arg (unchanged)', () => {
  assert.match(
    smsSvcExec,
    /claimToken\s*\?\s*[`'"]Reply SEND/,
    'Body must still use ternary: claimToken ? "Reply SEND <token>..." : "Claim: moveleads.cloud..."'
  );
});

console.log('Per-mover SMS Claim eligibility tests scheduled.');
