/**
 * billingWebhook — non-negative balance clamp lock-in.
 *
 * Locks in the clawbackOrClamp helper added to handle the case where a
 * Stripe refund or chargeback exceeds the mover's current balance (the
 * mover spent the credit on leads before the dispute landed).
 *
 * Pre-fix behavior: unconditional `$inc: { balance: -amount }` drove
 * balance negative; operator had to manually run admin balance-adjust.
 *
 * Post-fix behavior:
 *   1. Conditional CAS via findOneAndUpdate({balance: {$gte: amount}}, $inc:-amount).
 *   2. On CAS miss: re-read balance, $set balance:0, write compensating
 *      "Admin Adjustment" Transaction row with +writedown amount so
 *      sum(Transaction.amount) === User.balance invariant holds.
 *   3. Compensating row is best-effort (try/catch, non-fatal) — mirrors
 *      the precedent set by adminBalanceAdjustTransactionRow.
 *
 * Assertions here are source-scan style — they pin the pattern without
 * spinning up Mongo. Integration coverage lives in a separate runbook
 * test that requires TEST_MONGODB_URI.
 */

'use strict';

const { test } = require('node:test');
const assert  = require('node:assert/strict');
const fs      = require('node:fs');
const path    = require('node:path');

const WEBHOOK_PATH = path.join(__dirname, '..', 'routes', 'billingWebhook.js');
const src = fs.readFileSync(WEBHOOK_PATH, 'utf8');

// ── A. Source pins — clawbackOrClamp helper exists with the right shape

test('A1 — clawbackOrClamp helper is defined in billingWebhook.js', () => {
  assert.match(src, /async\s+function\s+clawbackOrClamp\s*\(\s*\{\s*userId\s*,\s*amount\s*,\s*sourceLabel\s*,\s*sourceChargeId\s*\}\s*\)/);
});

test('A2 — helper uses conditional CAS with balance: {$gte: amount}', () => {
  // The CAS filter is what makes the clamp work — $gte (not $gt) so the
  // boundary case balance==amount is a normal debit.
  assert.match(src, /findOneAndUpdate\(\s*\{\s*_id:\s*userId\s*,\s*balance:\s*\{\s*\$gte:\s*amount\s*\}\s*\}/);
  assert.match(src, /\$inc:\s*\{\s*balance:\s*-amount\s*\}/);
});

test('A3 — on CAS miss, helper sets balance to 0 (clamp)', () => {
  // The unconditional $set: balance: 0 is the second leg of the
  // CAS-then-clamp pattern. Race window between CAS miss and $set is
  // documented as accepted in the comment block.
  assert.match(src, /\$set:\s*\{\s*balance:\s*0\s*\}/);
});

test('A4 — helper writes compensating Admin Adjustment Transaction row', () => {
  assert.match(src, /Transaction\.create\(/);
  assert.match(src, /type:\s*['"]Admin Adjustment['"]/);
  // amount is POSITIVE writedown — offsets the Stripe Refund / Chargeback
  // row's -amount to preserve sum(Transaction.amount) === User.balance.
  assert.match(src, /amount:\s*writedown/);
  assert.match(src, /Auto writedown:/);
});

test('A5 — compensating Transaction.create is wrapped in try/catch (non-fatal)', () => {
  // Mirrors adminBalanceAdjustTransactionRow precedent — balance clamp
  // already committed, ledger row failure must not throw out of webhook.
  assert.match(src, /try\s*\{\s*await\s+Transaction\.create/);
  assert.match(src, /Admin Adjustment writedown failed \(non-fatal\)/);
});

test('A6 — helper returns clamp metadata used by admin email', () => {
  assert.match(src, /return\s*\{\s*clamped:\s*false[\s\S]*?finalBalance:\s*ok\.balance\s*\}/);
  assert.match(src, /return\s*\{\s*clamped:\s*true[\s\S]*?finalBalance:\s*0\s*\}/);
});

// ── B. Source pins — both webhook handlers use the helper

test('B1 — charge.refunded handler calls clawbackOrClamp with sourceLabel "Stripe Refund"', () => {
  // Extract just the charge.refunded block to avoid cross-handler matches.
  const refundBlock = src.split("event.type === 'charge.refunded'")[1].split("event.type === 'charge.dispute.created'")[0];
  assert.match(refundBlock, /clawbackOrClamp\(\s*\{[\s\S]*?sourceLabel:\s*['"]Stripe Refund['"][\s\S]*?\}\s*\)/);
  // And it must NOT call the legacy unconditional $inc against balance.
  assert.doesNotMatch(refundBlock, /User\.updateOne\([^)]*\$inc:\s*\{\s*balance:\s*-refundedDollars\s*\}/);
});

test('B2 — charge.dispute.created handler calls clawbackOrClamp with sourceLabel "Stripe Chargeback"', () => {
  const disputeBlock = src.split("event.type === 'charge.dispute.created'")[1];
  assert.match(disputeBlock, /clawbackOrClamp\(\s*\{[\s\S]*?sourceLabel:\s*['"]Stripe Chargeback['"][\s\S]*?\}\s*\)/);
  assert.doesNotMatch(disputeBlock, /User\.updateOne\([^)]*\$inc:\s*\{\s*balance:\s*-disputedDollars\s*\}/);
});

test('B3 — admin email payload surfaces clamp status', () => {
  // Both handlers must include "Clamped to zero" + "Final balance" in
  // their HTML so the operator can triage overdraft cases at a glance.
  const clampedToZeroCount = (src.match(/Clamped to zero:/g) || []).length;
  assert.ok(clampedToZeroCount >= 2, `Both handlers must emit "Clamped to zero" in admin email. Found ${clampedToZeroCount}.`);
  const finalBalanceCount = (src.match(/Final balance:/g) || []).length;
  assert.ok(finalBalanceCount >= 2, `Both handlers must emit "Final balance" in admin email. Found ${finalBalanceCount}.`);
});

// ── C. Schema guard

test('C1 — Transaction.type enum still contains "Admin Adjustment"', () => {
  // Regression guard against accidental schema rollback that would
  // break the compensating-row write path.
  const Transaction = require('../models/Transaction');
  const typePath = Transaction.schema.path('type');
  assert.ok(typePath, 'Transaction.type schema path must exist');
  assert.ok(typePath.enumValues.includes('Admin Adjustment'),
    `Transaction.type enum must include "Admin Adjustment". Got: ${typePath.enumValues.join(', ')}`);
});

test('C2 — Transaction.type enum still contains "Stripe Refund" and "Stripe Chargeback"', () => {
  const Transaction = require('../models/Transaction');
  const enumValues = Transaction.schema.path('type').enumValues;
  assert.ok(enumValues.includes('Stripe Refund'), 'enum must include Stripe Refund');
  assert.ok(enumValues.includes('Stripe Chargeback'), 'enum must include Stripe Chargeback');
});
