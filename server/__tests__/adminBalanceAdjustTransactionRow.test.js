/**
 * Admin balance-adjust Transaction row lock-in.
 *
 * Closes the ledger-drift defect identified by 3-agent audit convergence
 * (money-flow R9 + silent-state F-13 + observability R9) and ranked as
 * HIGH-CONFIDENCE-FIX-PLAN F1 (100% confidence).
 *
 * Before this fix, POST /api/admin/users/:id/balance performed:
 *   - $inc balance via User.findByIdAndUpdate
 *   - logAdminAction for audit trail
 *   - NO Transaction.create
 *
 * Every admin balance adjustment created drift between
 * sum(Transaction.amount) and User.balance. The mover's
 * GET /api/billing/transactions did not show the adjustment. Revenue-
 * reconciliation queries were wrong by every admin adjustment.
 *
 * This was also the manual remediation path for chargeback overdrafts
 * documented in B4-refund-overdraft-investigation.md — so every chargeback
 * fix today creates drift.
 *
 * Fix: write a Transaction row alongside the balance mutation. New
 * Transaction.type value 'Admin Adjustment' added to the enum to keep
 * the new write distinguishable from the other 6 types.
 *
 * This suite pins:
 *
 *   A. Transaction.type enum includes 'Admin Adjustment'
 *   B. The 6 existing enum values are preserved (regression guard)
 *   C. The balance-adjust route calls Transaction.create after the
 *      balance write
 *   D. Transaction shape: user, type='Admin Adjustment', amount=parsed
 *      (signed), description (includes actor + note), status='Completed'
 *   E. The Transaction.create is wrapped in try/catch — non-fatal on
 *      failure so the balance write + audit log are not blocked
 *   F. The existing $inc balance write is unchanged (regression guard)
 *   G. The existing logAdminAction is unchanged (regression guard)
 *   H. Scope discipline — no other balance writes in this route, no
 *      changes to other money paths
 *   I. Other money-write paths (buy-now, SMS Claim, refund, Stripe
 *      webhook) are unchanged
 *
 * Pure-Node, no Mongo. Source-level assertions + Transaction model
 * inspection.
 *
 * Run: `node server/__tests__/adminBalanceAdjustTransactionRow.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const adminPath  = path.join(serverRoot, 'routes', 'admin.js');
const txnModelPath = path.join(serverRoot, 'models', 'Transaction.js');

const adminSrc = fs.readFileSync(adminPath, 'utf8');
const txnSrc   = fs.readFileSync(txnModelPath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const adminExec = stripComments(adminSrc);
const txnExec   = stripComments(txnSrc);

// Isolate the balance route block.
const balanceBlockMatch = adminExec.match(
  /router\.post\(\s*['"]\/users\/:id\/balance['"][\s\S]*?(?=router\.(post|get|put|delete|patch)|module\.exports)/
);
const balanceBlock = balanceBlockMatch ? balanceBlockMatch[0] : '';

// ── A. Transaction.type enum includes 'Admin Adjustment' ───────────────

test('A1. Transaction.type enum includes "Admin Adjustment"', () => {
  // Use the model directly so we test what Mongoose will actually accept.
  const Transaction = require('../models/Transaction');
  const enumValues = Transaction.schema.path('type').enumValues;
  assert.ok(enumValues.includes('Admin Adjustment'),
    `Transaction.type enum must include "Admin Adjustment". Got: ${JSON.stringify(enumValues)}`);
});

// ── B. Existing enum values preserved ──────────────────────────────────

test('B1. Existing enum values are all preserved (regression guard)', () => {
  const Transaction = require('../models/Transaction');
  const enumValues = Transaction.schema.path('type').enumValues;
  for (const existing of [
    'Credit Deposit',
    'Lead Purchase',
    'Lead Dispute Refund',
    'Stripe Refund',
    'Stripe Chargeback',
    'Lead Refund',
  ]) {
    assert.ok(enumValues.includes(existing),
      `Existing enum value '${existing}' must be preserved. Got: ${JSON.stringify(enumValues)}`);
  }
});

test('B2. Enum length is exactly 7 (6 prior + Admin Adjustment, nothing else slipped in)', () => {
  const Transaction = require('../models/Transaction');
  const enumValues = Transaction.schema.path('type').enumValues;
  assert.equal(enumValues.length, 7,
    `Expected exactly 7 enum values (6 prior + Admin Adjustment). Got ${enumValues.length}: ${JSON.stringify(enumValues)}`);
});

// ── C. Route calls Transaction.create ───────────────────────────────────

test('C1. balance-adjust route calls Transaction.create with type="Admin Adjustment"', () => {
  assert.match(
    balanceBlock,
    /Transaction\.create\(\s*\{[\s\S]{0,400}type:\s*['"]Admin Adjustment['"]/,
    'balance-adjust route must call Transaction.create({ ..., type: "Admin Adjustment", ... })'
  );
});

test('C2. Transaction.create is called AFTER the $inc balance write', () => {
  // Order matters: balance write must commit before the Transaction row
  // is written, so a Transaction.create failure does not leave a row
  // without a balance mutation (the inverse drift — ledger ahead of balance).
  const incIdx = balanceBlock.indexOf('$inc: { balance: parsed }');
  const txnIdx = balanceBlock.indexOf('Transaction.create(');
  assert.ok(incIdx > 0, '$inc balance must be present');
  assert.ok(txnIdx > 0, 'Transaction.create call must be present');
  assert.ok(incIdx < txnIdx,
    'Transaction.create must come AFTER the $inc balance write');
});

// ── D. Transaction shape ───────────────────────────────────────────────

test('D1. Transaction has user = adjusted user._id', () => {
  // The Transaction must reference the user whose balance was adjusted,
  // NOT the admin actor (who is the operator).
  const txnCallMatch = balanceBlock.match(/Transaction\.create\(\s*\{([\s\S]*?)\}\s*\)/);
  assert.ok(txnCallMatch, 'Transaction.create({...}) call must be findable');
  assert.match(txnCallMatch[1], /user:\s*user\._id/,
    'Transaction.user must be the adjusted user._id, not the admin actor');
});

test('D2. Transaction amount is the raw parsed (signed) adjustment', () => {
  const txnCallMatch = balanceBlock.match(/Transaction\.create\(\s*\{([\s\S]*?)\}\s*\)/);
  assert.ok(txnCallMatch);
  assert.match(txnCallMatch[1], /amount:\s*parsed/,
    'Transaction.amount must be `parsed` (the signed adjustment value, matching $inc balance)');
});

test('D3. Transaction description includes the admin actor id', () => {
  // Audit trail: the description must record who ran the adjustment.
  const txnCallMatch = balanceBlock.match(/Transaction\.create\(\s*\{([\s\S]*?)\}\s*\)/);
  assert.ok(txnCallMatch);
  assert.match(txnCallMatch[1], /description:\s*`Admin balance adjustment by \$\{req\.user\.id\}/,
    'Transaction.description must include `Admin balance adjustment by ${req.user.id}` for audit trail');
});

test('D4. Transaction description includes the operator-supplied note when present', () => {
  // Conditional concatenation: when note is supplied, include it in description.
  const txnCallMatch = balanceBlock.match(/Transaction\.create\(\s*\{([\s\S]*?)\}\s*\)/);
  assert.ok(txnCallMatch);
  assert.match(txnCallMatch[1], /\$\{note\s*\?\s*[`'"][^'"`]*\$\{note\}[`'"]\s*:\s*['"]['"]/,
    'Transaction.description must conditionally include the operator note');
});

test('D5. Transaction.status is "Completed"', () => {
  const txnCallMatch = balanceBlock.match(/Transaction\.create\(\s*\{([\s\S]*?)\}\s*\)/);
  assert.ok(txnCallMatch);
  assert.match(txnCallMatch[1], /status:\s*['"]Completed['"]/,
    'Transaction.status must be "Completed" — adjustment is durable and final');
});

// ── E. Try/catch — non-fatal on Transaction.create failure ─────────────

test('E1. Transaction.create is wrapped in its own try/catch', () => {
  // The balance write already committed; a Transaction write failure must
  // not surface as a 500 to the operator. Logging captures the rare case.
  assert.match(
    balanceBlock,
    /try\s*\{\s*await\s+Transaction\.create\(\s*\{[\s\S]{0,400}\}\s*\)\s*;?\s*\}\s*catch\s*\(\s*txnErr\s*\)/,
    'Transaction.create must be wrapped in try/catch(txnErr)'
  );
});

test('E2. Catch logs a "[Admin] Balance adjust — Transaction write failed (non-fatal)" message', () => {
  // Operator must be able to grep for the rare case.
  assert.match(
    balanceBlock,
    /\[Admin\]\s+Balance adjust\s+—\s+Transaction write failed \(non-fatal\)/,
    'Catch must log a "[Admin] Balance adjust — Transaction write failed (non-fatal): ..." message'
  );
});

test('E3. Catch does NOT rethrow', () => {
  // The balance write + logAdminAction already happened. A throw here
  // would surface as a 500 even though everything else succeeded.
  const catchMatch = balanceBlock.match(/catch\s*\(\s*txnErr\s*\)\s*\{([\s\S]{0,400}?)\}/);
  assert.ok(catchMatch, 'Transaction.create catch block must be findable');
  assert.doesNotMatch(catchMatch[1], /throw/,
    'Transaction.create catch must not rethrow — balance write already committed');
});

// ── F. Existing $inc balance write unchanged ───────────────────────────

test('F1. $inc balance write is unchanged (regression guard)', () => {
  assert.match(
    balanceBlock,
    /User\.findByIdAndUpdate\(\s*req\.params\.id\s*,\s*\{\s*\$inc:\s*\{\s*balance:\s*parsed\s*\}\s*\}\s*,\s*\{\s*new:\s*true\s*\}\s*\)/,
    'Balance $inc write must remain unchanged'
  );
});

// ── G. Existing logAdminAction unchanged ───────────────────────────────

test('G1. logAdminAction is still called with action="balance.adjust"', () => {
  assert.match(
    balanceBlock,
    /logAdminAction\(\s*\{\s*actor:\s*req\.user\.id\s*,\s*action:\s*['"]balance\.adjust['"]/,
    'logAdminAction({ actor, action: "balance.adjust", ... }) must remain'
  );
});

// ── H. Scope discipline — no other writes in this route ───────────────

test('H1. balance-adjust route does NOT write any other Lead / User fields', () => {
  // Defensive: confirm no scope creep added other field writes.
  for (const forbidden of [
    /Lead\.findOneAndUpdate/,
    /Lead\.updateOne/,
    /PurchasedLead/,
    /ClaimAttempt/,
    /\$set:\s*\{\s*balance/,
  ]) {
    assert.doesNotMatch(balanceBlock, forbidden,
      `balance-adjust route must not write off-scope field/model matching ${forbidden}`);
  }
});

test('H2. No additional Transaction.create calls in this route (just one)', () => {
  const calls = balanceBlock.match(/Transaction\.create/g) || [];
  assert.equal(calls.length, 1,
    `Expected exactly one Transaction.create call in balance-adjust route. Got ${calls.length}`);
});

test('H3. No new env flags introduced', () => {
  assert.doesNotMatch(balanceBlock, /process\.env\.ENABLE_/,
    'balance-adjust route must not introduce any ENABLE_* flag gating');
});

// ── I. Other money paths unchanged ─────────────────────────────────────

test('I1. Buy-now atomic sequence in routes/bids.js unchanged (regression guard)', () => {
  const bidsSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'bids.js'), 'utf8');
  // Pin the load-bearing buy-now atomic CAS + debit shape.
  assert.match(
    bidsSrc,
    /findOneAndUpdate\(\s*\{\s*_id:\s*req\.params\.leadId,\s*auctionStatus:\s*['"]active['"]/,
    'Buy-now atomic CAS filter shape must be unchanged'
  );
  assert.match(
    bidsSrc,
    /balance:\s*\{\s*\$gte:\s*price\s*\}/,
    'Buy-now conditional debit shape must be unchanged'
  );
});

test('I2. SMS Claim atomic sequence in routes/twilio.js unchanged', () => {
  const twilioSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'twilio.js'), 'utf8');
  assert.match(
    stripComments(twilioSrc),
    /['"]claimWindow\.token['"]\s*:\s*token[\s\S]{0,300}['"]claimWindow\.status['"]\s*:\s*['"]open['"][\s\S]{0,200}['"]claimWindow\.expiresAt['"]\s*:\s*\{\s*\$gt:\s*now\s*\}/,
    'PR-S3 atomic CAS filter shape must remain unchanged'
  );
});

test('I3. Admin refund route still writes Transaction (regression guard)', () => {
  // The refund route's Transaction.create at line ~398 was already correct.
  // Confirm we did not accidentally remove it while editing the balance
  // route above it.
  assert.match(
    adminExec,
    /Transaction\(\{\s*user:\s*pl\.company\s*,\s*type:\s*['"]Lead Refund['"]/,
    'Admin refund route Transaction.create must remain unchanged'
  );
});

console.log('Admin balance-adjust Transaction row tests scheduled.');
