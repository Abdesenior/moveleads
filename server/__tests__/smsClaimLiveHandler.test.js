/**
 * SMS Claim live handler (PR-S3) lock-in.
 *
 * Most consequential PR in the SMS Claim pipeline — wires the inbound
 * Twilio webhook to actually claim leads, debit balance, write the
 * PurchasedLead mutex, write the Transaction ledger row, and emit the
 * lead_sold socket event. Gated behind ENABLE_SMS_CLAIM_LIVE (default
 * off); when off, the handler stays in shadow mode (ClaimAttempt row
 * with outcome='shadow_only', no money or ownership changes).
 *
 * Architectural constraint: the handler is a SIBLING of the buy-now
 * atomic block in routes/bids.js. It REPLICATES that pattern verbatim
 * — same lead-flip CAS, same conditional debit, same PurchasedLead
 * mutex, same Transaction row, same socket emit. No shared helper.
 * Two siblings pinned by their respective lock-in tests.
 *
 * What this suite pins (source-level + behavioral):
 *
 *   A. Route surface — /sms/inbound is extended, NOT a new endpoint.
 *      Branch order is STOP → CLAIM → START → HELP → UNKNOWN.
 *      Signature validation middleware still applied.
 *
 *   B. Flag gating — ENABLE_SMS_CLAIM_LIVE checked with strict-equal
 *      'true'. Flag-off path writes shadow_only and exits before any
 *      financial code is reachable.
 *
 *   C. Twilio idempotency — ClaimAttempt insert with twilioMessageSid
 *      is the FIRST DB write in the claim branch. E11000 short-circuits
 *      to empty TwiML with no further writes.
 *
 *   D. Lead-flip CAS — exact filter + update shape, mirrors bids.js.
 *
 *   E. Atomic sequence — debit, PurchasedLead, lead.save, Transaction,
 *      broadcastLeadSold in that order; revert behaviors on failures.
 *
 *   F. Disambiguation — one extra read on lead-flip null, three loser
 *      outcomes reachable.
 *
 *   G. Sender precondition — smsOptOut and !phoneVerified short-circuit
 *      BEFORE any state mutation. Unknown sender treated as unverified.
 *
 *   H. Confirmation SMS via TwiML — no outbound sendMoverLeadSMS calls
 *      anywhere in the handler. Winner SMS includes price + customerName
 *      + customerPhone. 160-char budget.
 *
 *   I. Audit-trail comments — PR-S3 tag in routes/twilio.js, sibling
 *      pointer added to routes/bids.js.
 *
 *   J. Scope discipline — routes/bids.js atomic block content unchanged,
 *      no User.smsClaim.* reads in the claim branch, no schema changes.
 *
 *   K. findLeadByClaimToken helper — exists, unfiltered query, returns
 *      null on missing token.
 *
 * Pure-Node, no Mongo. Source-only assertions for the route file
 * (cannot require routes/twilio.js — it pulls in mongoose models and
 * boots the express router with non-trivial side-effects). Helper
 * verification via source scan + claimWindow.js inspection.
 *
 * Run: `node server/__tests__/smsClaimLiveHandler.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const twilioRoutePath = path.join(serverRoot, 'routes', 'twilio.js');
const bidsRoutePath   = path.join(serverRoot, 'routes', 'bids.js');
const claimWindowPath = path.join(serverRoot, 'utils', 'claimWindow.js');

const twilioSrc       = fs.readFileSync(twilioRoutePath, 'utf8');
const bidsSrc         = fs.readFileSync(bidsRoutePath,   'utf8');
const claimWindowSrc  = fs.readFileSync(claimWindowPath, 'utf8');

// Strip JS comments so audit-trail comments mentioning retired strings
// don't false-positive scans.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const twilioExec      = stripComments(twilioSrc);
const claimWindowExec = stripComments(claimWindowSrc);

// Helper: position of substring in a string (for source-order assertions).
function pos(src, needle) {
  return src.indexOf(needle);
}

// ── A. Route surface ────────────────────────────────────────────────────

test('A1. /sms/inbound endpoint is extended, NOT replaced or duplicated', () => {
  const matches = twilioExec.match(/router\.post\(\s*['"]\/sms\/inbound['"]/g) || [];
  assert.equal(matches.length, 1,
    `Expected exactly one /sms/inbound route. Found ${matches.length}. ` +
    `PR-S3 must extend the existing handler, not add a parallel endpoint.`);
});

test('A2. twilioWebhook signature middleware still applied to /sms/inbound', () => {
  // Pin: the route mount keeps express.urlencoded and twilioWebhook in the
  // chain. If a future refactor drops signature validation, this fails.
  assert.match(
    twilioExec,
    /router\.post\(\s*['"]\/sms\/inbound['"][\s\S]{0,200}twilioWebhook/,
    'twilioWebhook middleware must still wrap /sms/inbound after PR-S3 changes'
  );
});

test('A3. Branch order in handler is STOP → CLAIM → START → HELP', () => {
  // Source-order check using `indexOf`. STOP_KEYWORDS.has(keyword) appears
  // first; the parseClaimReply branch appears after STOP but before
  // START_KEYWORDS.has; START before HELP.
  const stopIdx  = pos(twilioExec, 'STOP_KEYWORDS.has(keyword)');
  const claimIdx = pos(twilioExec, 'parseClaimReply(rawBody)');
  const startIdx = pos(twilioExec, 'START_KEYWORDS.has(keyword)');
  const helpIdx  = pos(twilioExec, 'HELP_KEYWORDS.has(keyword)');
  assert.ok(stopIdx  > 0, 'STOP branch must exist');
  assert.ok(claimIdx > 0, 'CLAIM branch must exist');
  assert.ok(startIdx > 0, 'START branch must exist');
  assert.ok(helpIdx  > 0, 'HELP branch must exist');
  assert.ok(stopIdx  < claimIdx, 'STOP must come BEFORE CLAIM (TCPA precedence)');
  assert.ok(claimIdx < startIdx, 'CLAIM must come BEFORE START (parsed-token wins over generic keyword)');
  assert.ok(startIdx < helpIdx,  'START must come BEFORE HELP');
});

// ── B. Flag gating ──────────────────────────────────────────────────────

test('B1. ENABLE_SMS_CLAIM_LIVE is checked with strict-equal "true"', () => {
  // Truthy check would let "false" enable live mode. Pin the exact form.
  assert.match(
    twilioExec,
    /process\.env\.ENABLE_SMS_CLAIM_LIVE\s*!==\s*['"]true['"]/,
    'Flag check must be `process.env.ENABLE_SMS_CLAIM_LIVE !== "true"` — strict equality avoids the "false"→truthy footgun'
  );
});

test('B2. Flag-off path returns BEFORE any financial code', () => {
  // After the flag check (`if (process.env.ENABLE_SMS_CLAIM_LIVE !== 'true')`),
  // the next thing is the empty-TwiML return. The financial code
  // (Lead.findOneAndUpdate, User.findOneAndUpdate, PurchasedLead, Transaction)
  // must NOT be reachable when the flag is off.
  //
  // Source-order check: the flag-off return statement must come BEFORE the
  // first occurrence of `Lead.findOneAndUpdate` in the file.
  const flagOffIdx = twilioExec.indexOf("ENABLE_SMS_CLAIM_LIVE !== 'true'");
  const leadFlipIdx = twilioExec.indexOf('Lead.findOneAndUpdate');
  assert.ok(flagOffIdx > 0, 'flag check must exist');
  assert.ok(leadFlipIdx > 0, 'Lead.findOneAndUpdate must exist');
  assert.ok(flagOffIdx < leadFlipIdx,
    'Flag-off check must come before the financial code path so the flag-off path cannot reach Lead.findOneAndUpdate');
  // And the flag-off branch returns immediately afterward (within ~400 chars,
  // accounting for the log + return statement).
  const tail = twilioExec.slice(flagOffIdx, flagOffIdx + 600);
  assert.match(tail, /return\s+res\.type\(['"]text\/xml['"]\)/,
    'Flag-off branch must return TwiML immediately, no further DB writes');
});

test('B3. Flag-off ClaimAttempt outcome is exactly "shadow_only"', () => {
  // ClaimAttempt.create writes outcome:'shadow_only' as the idempotency
  // anchor. Flag-off path leaves that value as-is (no updateOne).
  assert.match(
    twilioExec,
    /outcome:\s*['"]shadow_only['"]/,
    'ClaimAttempt insert must use outcome:"shadow_only" as the initial value'
  );
});

// ── C. Twilio idempotency ──────────────────────────────────────────────

test('C1. ClaimAttempt.create is the FIRST DB write in the claim branch', () => {
  // The parseClaimReply branch starts when we detect a parsed token. The
  // FIRST DB write inside that branch must be ClaimAttempt.create — so any
  // Twilio retry of the same MessageSid trips E11000 before doing anything.
  const claimBranchStart = twilioExec.indexOf('parseClaimReply(rawBody)');
  assert.ok(claimBranchStart > 0);
  // Find the next occurrence of ClaimAttempt.create AFTER claim branch start.
  const claimAttemptIdx = twilioExec.indexOf('ClaimAttempt.create', claimBranchStart);
  const leadFlipIdx     = twilioExec.indexOf('Lead.findOneAndUpdate', claimBranchStart);
  const userDebitIdx    = twilioExec.indexOf('User.findOneAndUpdate', claimBranchStart);
  const purchasedIdx    = twilioExec.indexOf('new PurchasedLead',      claimBranchStart);
  assert.ok(claimAttemptIdx > 0, 'ClaimAttempt.create must be called in the claim branch');
  assert.ok(claimAttemptIdx < leadFlipIdx,
    'ClaimAttempt.create must precede Lead.findOneAndUpdate (idempotency anchor)');
  assert.ok(claimAttemptIdx < userDebitIdx,
    'ClaimAttempt.create must precede User.findOneAndUpdate (idempotency before any money write)');
  assert.ok(claimAttemptIdx < purchasedIdx,
    'ClaimAttempt.create must precede PurchasedLead insert (idempotency before mutex write)');
});

test('C2. E11000 on ClaimAttempt insert returns empty TwiML, no further writes', () => {
  // The catch on ClaimAttempt.create must check err.code === 11000 explicitly
  // and return without further DB writes.
  assert.match(
    twilioExec,
    /err\.code\s*===\s*11000[\s\S]{0,400}duplicate MessageSid[\s\S]{0,300}return\s+res\.type\(['"]text\/xml['"]\)/,
    'On ClaimAttempt E11000, handler must log "duplicate MessageSid" and return empty TwiML'
  );
});

test('C3. Two-write strategy — finalize stamps terminal outcome via updateOne', () => {
  // Final outcome gets stamped via ClaimAttempt.updateOne with $set:{outcome,...}.
  assert.match(
    twilioExec,
    /ClaimAttempt\.updateOne/,
    'Handler must call ClaimAttempt.updateOne to stamp the final outcome'
  );
});

// ── D. Lead-flip CAS shape ─────────────────────────────────────────────

test('D1. CAS filter contains claimWindow.token + status="open" + expiresAt $gt + moverVisibilityFilter', () => {
  // Pin every component of the filter. If any is dropped, the CAS becomes
  // unsafe (e.g. claiming an already-claimed lead, or claiming a
  // rejected-visibility lead).
  assert.match(twilioExec, /['"]claimWindow\.token['"]\s*:\s*token/,
    'Filter must include `"claimWindow.token": token`');
  assert.match(twilioExec, /['"]claimWindow\.status['"]\s*:\s*['"]open['"]/,
    'Filter must include `"claimWindow.status": "open"`');
  assert.match(twilioExec, /['"]claimWindow\.expiresAt['"]\s*:\s*\{\s*\$gt\s*:\s*now\s*\}/,
    'Filter must include `"claimWindow.expiresAt": { $gt: now }`');
  assert.match(twilioExec, /\.\.\.moverVisibilityFilter\(\)/,
    'Filter must spread `moverVisibilityFilter()` so rejected leads are not claimable');
});

test('D2. CAS update sets claimWindow.status=claimed + claimedBy + claimedAt + closedReason + auctionStatus=buy_now', () => {
  for (const piece of [
    /['"]claimWindow\.status['"]\s*:\s*['"]claimed['"]/,
    /['"]claimWindow\.claimedBy['"]\s*:\s*user\._id/,
    /['"]claimWindow\.claimedAt['"]\s*:\s*now/,
    /['"]claimWindow\.closedReason['"]\s*:\s*['"]claimed['"]/,
    /auctionStatus\s*:\s*['"]buy_now['"]/,
  ]) {
    assert.match(twilioExec, piece,
      `CAS update missing required $set field matching ${piece}`);
  }
});

test('D3. CAS uses findOneAndUpdate (not find-then-save)', () => {
  // find-then-save would race; only the atomic findOneAndUpdate is safe.
  assert.match(twilioExec, /Lead\.findOneAndUpdate/);
  // The claim branch itself must NOT contain a Lead.find followed by .save —
  // that would be the race-prone pattern.
  assert.doesNotMatch(twilioExec, /Lead\.find\([^)]*\)[\s\S]{0,80}\.save\(\)/,
    'Claim branch must not use find-then-save');
});

// ── E. Atomic sequence replication ─────────────────────────────────────

test('E1. After CAS success, next op is conditional debit', () => {
  // Match buy-now's pattern: User.findOneAndUpdate({_id, balance: $gte}, {$inc: -price})
  assert.match(
    twilioExec,
    /User\.findOneAndUpdate\(\s*\{\s*_id:\s*user\._id\s*,\s*balance:\s*\{\s*\$gte:\s*price\s*\}\s*\}\s*,\s*\{\s*\$inc:\s*\{\s*balance:\s*-price\s*\}\s*\}/,
    'Conditional debit must use exact `{_id, balance: $gte price}` + `$inc: -price` shape mirroring routes/bids.js'
  );
});

test('E2. Insufficient-balance revert filter is scoped to claimedBy=user._id', () => {
  // The revert filter must include `claimedBy: user._id` so we only
  // undo OUR own claim — never clobber a parallel claim from another mover.
  const debitNullMatch = twilioExec.match(
    /if\s*\(\s*!debited\s*\)[\s\S]{0,1500}?Lead\.findOneAndUpdate\(([\s\S]{0,500})/
  );
  assert.ok(debitNullMatch, 'The !debited revert block must call Lead.findOneAndUpdate');
  const revertFilter = debitNullMatch[1];
  assert.match(revertFilter, /['"]claimWindow\.claimedBy['"]\s*:\s*user\._id/,
    'Revert filter must include claimWindow.claimedBy=user._id (only undo our own claim)');
  assert.match(revertFilter, /['"]claimWindow\.status['"]\s*:\s*['"]claimed['"]/,
    'Revert filter must require claimWindow.status="claimed" (only undo from the claimed state we just entered)');
});

test('E3. PurchasedLead insert uses {company, lead, pricePaid} shape', () => {
  // Same shape as routes/bids.js.
  assert.match(
    twilioExec,
    /new PurchasedLead\(\s*\{\s*company:[\s\S]{0,200}lead:[\s\S]{0,200}pricePaid:/,
    'PurchasedLead must be created with the same {company, lead, pricePaid} shape as bids.js'
  );
});

test('E4. On PurchasedLead E11000: refund debit + revert lead claim', () => {
  // The PurchasedLead.save try/catch block on E11000 must do TWO things:
  // 1) Refund: User.findOneAndUpdate with $inc: +price
  // 2) Revert: Lead.findOneAndUpdate with claimedBy=user._id filter
  // Both within the same catch block.
  const e11000Block = twilioExec.match(
    /new PurchasedLead[\s\S]{0,300}\}\s*catch\s*\(\s*err\s*\)\s*\{([\s\S]{0,2000}?)(?=\}\s*catch|return\s+res\.type|\}\s*$|\n\s*\/\/)/
  );
  assert.ok(e11000Block, 'PurchasedLead.save catch block must be findable');
  const block = e11000Block[1];
  assert.match(block, /err\.code\s*===\s*11000/,
    'Catch must check err.code === 11000');
  assert.match(block, /\$inc:\s*\{\s*balance:\s*price\s*\}/,
    'On E11000, must refund via $inc: { balance: price }');
  assert.match(block, /Lead\.findOneAndUpdate[\s\S]{0,400}claimWindow\.claimedBy['"]\s*:\s*user\._id/,
    'On E11000, must revert lead claim with claimedBy=user._id filter');
});

test('E5. Transaction.create uses "SMS claim: lead" in description', () => {
  // Distinguish channels in transaction history. Buy-now uses "Buy-now purchase:".
  assert.match(
    twilioExec,
    /Transaction\.create\(\s*\{[\s\S]{0,500}description:\s*`SMS claim: lead \$\{[\s\S]{0,50}?\}`/,
    'Transaction.create description must include "SMS claim: lead ${leadId}"'
  );
  // And it must NOT use "Buy-now purchase" (that's the sibling).
  const txnBlock = twilioExec.match(/Transaction\.create\(\s*\{[\s\S]{0,500}?\}\s*\)/);
  assert.ok(txnBlock);
  assert.doesNotMatch(txnBlock[0], /Buy-now purchase/,
    'SMS claim Transaction description must NOT say "Buy-now purchase"');
});

test('E6. lead.save() finalizes with winnerId, finalPrice, auctionStatus="sold", status="Purchased", buyers push', () => {
  for (const piece of [
    /winnerId\s*=\s*user\._id/,
    /finalPrice\s*=\s*price/,
    /auctionStatus\s*=\s*['"]sold['"]/,
    /\.status\s*=\s*['"]Purchased['"]/,
    /buyers\.push\(\s*\{\s*company:\s*user\._id/,
  ]) {
    assert.match(twilioExec, piece,
      `lead.save() block missing required field matching ${piece}`);
  }
  // And actually call save.
  assert.match(twilioExec, /await\s+claimedLead\.save\(\)/,
    'Must call await claimedLead.save() after setting the finalize fields');
});

test('E7. broadcastLeadSold is a local helper (NOT imported from bids.js)', () => {
  // Plan §11 confirmed: duplicate the helper locally to avoid coupling.
  assert.match(
    twilioExec,
    /function\s+broadcastLeadSold\s*\(/,
    'broadcastLeadSold must be defined LOCALLY in routes/twilio.js, not imported'
  );
  assert.doesNotMatch(
    twilioExec,
    /require\(['"][^'"]*routes\/bids['"]\)/,
    'routes/twilio.js must NOT require routes/bids — siblings stay independent'
  );
});

// ── F. Disambiguation ──────────────────────────────────────────────────

test('F1. Lead-flip null branch calls findLeadByClaimToken for disambiguation', () => {
  assert.match(
    twilioExec,
    /if\s*\(\s*!claimedLead\s*\)[\s\S]{0,400}findLeadByClaimToken\(token\)/,
    'On lead-flip null, must call findLeadByClaimToken(token) to disambiguate'
  );
});

test('F2. Three loser outcomes reachable: rejected_unmatched_token / lost_already_claimed / lost_window_expired', () => {
  for (const outcome of ['rejected_unmatched_token', 'lost_already_claimed', 'lost_window_expired']) {
    assert.match(twilioExec, new RegExp(`['"]${outcome}['"]`),
      `Outcome string "${outcome}" must appear in the disambiguation branch`);
  }
});

test('F3. lost_already_claimed maps to status="claimed" check', () => {
  assert.match(
    twilioExec,
    /claimWindow\.status\s*===\s*['"]claimed['"][\s\S]{0,200}lost_already_claimed/,
    'lost_already_claimed must be assigned when stateLead.claimWindow.status === "claimed"'
  );
});

test('F4. lost_window_expired maps to expiresAt <= now check', () => {
  assert.match(
    twilioExec,
    /claimWindow\.expiresAt[\s\S]{0,80}<=\s*now[\s\S]{0,200}lost_window_expired/,
    'lost_window_expired must be assigned when stateLead.claimWindow.expiresAt <= now'
  );
});

// ── G. Sender precondition checks ──────────────────────────────────────

test('G1. smsOptOut short-circuits BEFORE Lead.findOneAndUpdate', () => {
  const optOutIdx  = twilioExec.indexOf('user.smsOptOut');
  const leadFlipIdx = twilioExec.indexOf('Lead.findOneAndUpdate');
  assert.ok(optOutIdx > 0,  'smsOptOut check must exist');
  assert.ok(leadFlipIdx > 0, 'Lead.findOneAndUpdate must exist');
  assert.ok(optOutIdx < leadFlipIdx,
    'smsOptOut check must come BEFORE the financial Lead.findOneAndUpdate');
});

test('G2. phoneVerified !== true short-circuits BEFORE Lead.findOneAndUpdate', () => {
  const phoneVerifiedIdx = twilioExec.indexOf('user.phoneVerified !== true');
  const leadFlipIdx = twilioExec.indexOf('Lead.findOneAndUpdate');
  assert.ok(phoneVerifiedIdx > 0,
    'Handler must check `user.phoneVerified !== true` (strict — undefined/false both treated as unverified)');
  assert.ok(phoneVerifiedIdx < leadFlipIdx,
    'phoneVerified check must come BEFORE Lead.findOneAndUpdate');
});

test('G3. Unknown sender treated as rejected_unverified_phone', () => {
  // `if (!user)` short-circuits with outcome 'rejected_unverified_phone'.
  assert.match(
    twilioExec,
    /if\s*\(\s*!user\s*\)[\s\S]{0,400}rejected_unverified_phone/,
    'Unknown sender (no user matched by phone) must map to rejected_unverified_phone'
  );
});

test('G4. User select includes phoneVerified field for the claim path', () => {
  // The existing user lookup must select phoneVerified so the precondition
  // check is actually meaningful.
  assert.match(
    twilioExec,
    /\.select\(['"][^'"]*phoneVerified[^'"]*['"]\)/,
    'User lookup .select() must include phoneVerified (otherwise the gate check reads undefined and silently rejects everyone)'
  );
});

// ── H. Confirmation SMS / TwiML ────────────────────────────────────────

test('H1. Winner TwiML contains "lead claimed" + price', () => {
  // The winner message head template.
  assert.match(twilioExec, /MoveLeads:\s*lead claimed!\s*\$\$\{price\}/,
    'Winner TwiML head must be `MoveLeads: lead claimed! $${price} debited.`');
});

test('H2. Winner TwiML includes Customer name + Phone lines', () => {
  assert.match(twilioExec, /Customer:\s*\$\{firstName\}/,
    'Winner TwiML must include "Customer: ${firstName}..." line');
  assert.match(twilioExec, /Phone:\s*\$\{claimedLead\.customerPhone/,
    'Winner TwiML must include "Phone: ${customerPhone}" line');
});

test('H3. No outbound sendMoverLeadSMS in the handler', () => {
  // Confirmation rides TwiML only — no separate outbound API call. If the
  // handler ever needs to send a follow-up SMS, that's PR-S6 territory.
  assert.doesNotMatch(
    twilioExec,
    /sendMoverLeadSMS/,
    'routes/twilio.js must NOT call sendMoverLeadSMS — confirmation rides TwiML inline'
  );
});

test('H4. 160-char single-segment budget guard is present for winner SMS', () => {
  // Body must be checked + trimmed if over 160 chars.
  assert.match(twilioExec, /body\.length\s*>\s*160/,
    '160-char budget guard must exist for the winner SMS body');
});

test('H5. Opt-out path returns empty TwiML (no Message tag)', () => {
  // For rejected_optout, the TwiML must be empty <Response/> — TCPA: we
  // do NOT push an SMS to an opted-out user.
  const optOutBlock = twilioExec.match(
    /if\s*\(\s*user\.smsOptOut\s*\)\s*\{([\s\S]{0,500}?)\}/
  );
  assert.ok(optOutBlock, 'smsOptOut block must be findable');
  assert.doesNotMatch(optOutBlock[1], /twiml\.message\(/,
    'smsOptOut block must NOT call twiml.message() — TCPA requires silent return');
});

test('H6. rejected_unmatched_token returns empty TwiML (cost control)', () => {
  // Per plan §12: empty TwiML for unmatched-token, same posture as the
  // existing UNKNOWN handler. The source-level signal is that the
  // unmatched branch never sets smsMessage to a non-empty string.
  // The disambiguation block starts with smsMessage='' and only assigns
  // a non-empty string on lost_already_claimed or lost_window_expired.
  assert.match(
    twilioExec,
    /let\s+smsMessage\s*=\s*['"]['"]/,
    'smsMessage must initialize to empty string (default unmatched-token case)'
  );
});

// ── I. Audit-trail comments ────────────────────────────────────────────

test('I1. routes/twilio.js carries PR-S3 audit tag', () => {
  assert.match(twilioSrc, /PR-S3/,
    'routes/twilio.js must reference PR-S3 in an audit-trail comment');
});

test('I2. routes/bids.js carries PR-S3 sibling pointer comment', () => {
  assert.match(bidsSrc, /PR-S3/,
    'routes/bids.js must carry a PR-S3 sibling-pointer comment so future ' +
    'contributors editing buy-now know the SMS claim mirror exists');
  // And it must specifically reference the sibling location.
  assert.match(bidsSrc, /sms|SMS|twilio/i,
    'Sibling pointer in bids.js must reference the SMS/Twilio sibling');
});

// ── J. Scope discipline ────────────────────────────────────────────────

test('J1. routes/bids.js buy-now atomic block is unchanged (sibling invariant)', () => {
  // Pin the load-bearing invariants that prove the buy-now atomic block
  // hasn't drifted. If any of these change, this test forces the
  // contributor to update BOTH bids.js + twilio.js (or revert).
  assert.match(bidsSrc, /router\.post\(\s*['"]\/:leadId\/buy-now['"]/,
    'buy-now route signature unchanged');
  // The atomic lead-flip filter shape
  assert.match(bidsSrc, /findOneAndUpdate\(\s*\{\s*_id:\s*req\.params\.leadId,\s*auctionStatus:\s*['"]active['"]/,
    'buy-now lead-flip filter unchanged');
  // The conditional debit
  assert.match(bidsSrc, /balance:\s*\{\s*\$gte:\s*price\s*\}/,
    'buy-now conditional debit `balance: $gte price` unchanged');
  assert.match(bidsSrc, /\$inc:\s*\{\s*balance:\s*-price\s*\}/,
    'buy-now debit `$inc: -price` unchanged');
  // The PurchasedLead shape
  assert.match(bidsSrc, /new PurchasedLead\(\{[\s\S]{0,200}company:[\s\S]{0,80}lead:[\s\S]{0,80}pricePaid:/,
    'buy-now PurchasedLead shape unchanged');
  // The Transaction shape with buy-now description
  assert.match(bidsSrc, /Transaction\.create\(\{[\s\S]{0,400}type:\s*['"]Lead Purchase['"][\s\S]{0,400}description:\s*`Buy-now purchase: lead/,
    'buy-now Transaction description "Buy-now purchase: lead ${id}" unchanged');
  // The broadcastLeadSold call
  assert.match(bidsSrc, /broadcastLeadSold\(lead,\s*req\.user\.id\)/,
    'buy-now broadcastLeadSold call unchanged');
});

test('J2. routes/twilio.js adds NO new public routes beyond /sms/inbound', () => {
  // Snapshot the list of router.post calls. Pre-PR-S3 there were:
  // /voice/incoming, /voice/status, /sms/inbound. PR-S3 must not add any.
  const routes = (twilioExec.match(/router\.post\(\s*['"]([^'"]+)['"]/g) || [])
    .map(m => m.match(/['"]([^'"]+)['"]/)[1])
    .sort();
  assert.deepEqual(
    routes,
    ['/sms/inbound', '/voice/incoming', '/voice/status'],
    'routes/twilio.js must NOT add new public routes — only extend the existing /sms/inbound handler'
  );
});

test('J3. No User.smsClaim.* preference reads in the claim branch (retire-the-read principle)', () => {
  // Per operator decision (PR-C3/PR-C4 lineage): hidden prefs that affect
  // dispatch behavior must either be UI-visible or stop being read.
  // The SMS claim handler must NOT read maxLeadPrice/residentialOnly/asapOnly/dailyClaimCap.
  for (const pref of ['maxLeadPrice', 'residentialOnly', 'asapOnly', 'dailyClaimCap', 'smsClaim']) {
    assert.doesNotMatch(twilioExec, new RegExp(`\\b${pref}\\b`),
      `routes/twilio.js must NOT read User.smsClaim.${pref} (retire-the-read principle)`);
  }
});

test('J4. No schema changes — ClaimAttempt OUTCOMES enum unchanged', () => {
  // PR-S3 uses existing enum values only. Confirm none were added.
  const ClaimAttempt = require('../models/ClaimAttempt');
  const expected = [
    'won', 'lost_already_claimed', 'lost_window_expired',
    'rejected_low_balance', 'rejected_unmatched_token',
    'rejected_optout', 'rejected_unverified_phone',
    'parsed_no_token', 'shadow_only',
  ];
  assert.deepEqual(ClaimAttempt.OUTCOMES, expected,
    'PR-S3 must NOT modify ClaimAttempt.OUTCOMES — uses existing values only');
});

// ── K. findLeadByClaimToken helper ─────────────────────────────────────

test('K1. utils/claimWindow.js exports findLeadByClaimToken', () => {
  assert.match(claimWindowExec, /module\.exports\s*=\s*\{[^}]*\bfindLeadByClaimToken\b/,
    'findLeadByClaimToken must be exported from utils/claimWindow.js');
});

test('K2. findLeadByClaimToken does UNFILTERED token lookup', () => {
  // Critical for disambiguation: must not filter by status. If filtered,
  // the three loser outcomes collapse back to one.
  assert.match(
    claimWindowExec,
    /findOne\(\s*\{\s*['"]claimWindow\.token['"]\s*:\s*token\s*\}\s*\)/,
    'findLeadByClaimToken must use Lead.findOne({"claimWindow.token": token}) ' +
    'with NO additional filters — the disambiguation needs to see all states'
  );
});

test('K3. findLeadByClaimToken returns null for missing token', () => {
  // Early-return guard.
  assert.match(claimWindowExec, /if\s*\(\s*!token\s*\)\s*return\s+null/,
    'findLeadByClaimToken must early-return null on falsy token');
});

console.log('SMS Claim live handler (PR-S3) tests scheduled.');
