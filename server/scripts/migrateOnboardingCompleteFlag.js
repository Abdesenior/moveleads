/* eslint-disable no-console */
/**
 * migrateOnboardingCompleteFlag.js
 *
 * Reconcile `onboarding.complete` and `onboarding.activatedAt` for partner
 * accounts that were affected by older onboarding flows. Safe to re-run.
 *
 * USAGE
 *   Dry-run (default — no writes):
 *     node server/scripts/migrateOnboardingCompleteFlag.js
 *
 *   Apply changes:
 *     node server/scripts/migrateOnboardingCompleteFlag.js --apply
 *
 * GROUPS
 *   A — Healthy:
 *       balance > 0  OR  activatedAt set  OR  bonusClaimedAt set  OR  any
 *       successful 'Credit Deposit' Transaction.
 *       Action: untouched. Logged for visibility.
 *
 *   B — Backfill activatedAt:
 *       In Group A (has payment evidence) AND `activatedAt` is missing AND
 *       at least one `Credit Deposit` exists.
 *       Action: set `onboarding.activatedAt` to the date of the first
 *       successful `Credit Deposit`. Preserve `complete: true`. Wizard stays
 *       hidden for them.
 *
 *   C — Reset stale-complete:
 *       complete: true  AND  activatedAt: null  AND  bonusClaimedAt: null
 *       AND balance == 0  AND no successful Credit Deposit anywhere.
 *       These users were marked complete by the legacy flow even though they
 *       never activated. We bring them back into the wizard at step 5
 *       (the offer/activation picker) if they had setup answers, otherwise
 *       at their saved currentStep (or step 1 as fallback).
 *       Action: set `complete: false` and adjust `currentStep`.
 *
 * SAFETY GUARANTEES
 *   • A user that meets ANY of: balance>0, activatedAt, bonusClaimedAt, or
 *     a successful Credit Deposit will NEVER be reset to complete:false.
 *   • Onboarding answers are never deleted.
 *   • Idempotent: a second run finds the matched-and-fixed users no longer
 *     match the scan filters.
 */

require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');

// Load env from the repo root if running from a subdirectory.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const User = require('../models/User');
const Transaction = require('../models/Transaction');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

function hasSetupAnswers(user) {
  const a = (user.onboarding && user.onboarding.answers) || {};
  return !!(
    (a.dispatchBase && a.dispatchBase.zip) ||
    (typeof a.phone === 'string' && a.phone.trim()) ||
    (Array.isArray(a.alertChannels) && a.alertChannels.length) ||
    (typeof a.smsNotif === 'boolean') ||
    (typeof a.emailNotif === 'boolean')
  );
}

function pad(s, n) { return String(s == null ? '' : s).padEnd(n); }

async function main() {
  const banner = APPLY ? '🚨 APPLY MODE — changes will be written.' : '🔍 DRY-RUN — no writes will happen.';
  console.log(banner);
  console.log('─'.repeat(72));

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('FATAL: MONGODB_URI (or MONGO_URI) env not set.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const total = await User.countDocuments({ role: 'customer' });
  console.log(`Scanning ${total} customer accounts...\n`);

  const groupA = [];
  const groupB = [];
  const groupC = [];

  // Stream users to avoid loading the whole collection into memory.
  const cursor = User.find({ role: 'customer' }).lean().cursor();

  for await (const user of cursor) {
    const ob = user.onboarding || {};
    const balance = Number(user.balance || 0);
    const hasFlags = !!(ob.activatedAt || ob.bonusClaimedAt);

    const firstDeposit = await Transaction.findOne({
      user: user._id,
      type: 'Credit Deposit',
      status: 'Completed',
    }).sort({ date: 1 }).lean();

    const hasPayments = !!firstDeposit;
    const hasPaymentEvidence = balance > 0 || hasFlags || hasPayments;

    // Group B — paying user missing activatedAt → backfill from first deposit.
    if (hasPaymentEvidence && !ob.activatedAt && hasPayments) {
      groupB.push({ id: user._id, email: user.email, firstDeposit });
      continue;
    }

    // Group A — healthy, no action.
    if (hasPaymentEvidence) {
      groupA.push({
        id: user._id, email: user.email,
        why: balance > 0 ? `balance=$${balance.toFixed(2)}`
            : ob.activatedAt ? 'activatedAt set'
            : ob.bonusClaimedAt ? 'bonusClaimedAt set'
            : 'has Credit Deposit',
      });
      continue;
    }

    // Group C — stale complete:true with no payment evidence at all.
    if (ob.complete === true && balance === 0 && !hasFlags && !hasPayments) {
      const wasInSetup = hasSetupAnswers(user);
      const nextStep = wasInSetup ? 5 : (ob.currentStep && ob.currentStep > 0 ? ob.currentStep : 1);
      groupC.push({ id: user._id, email: user.email, nextStep, hadAnswers: wasInSetup });
      continue;
    }

    // Otherwise: not complete, not paying, nothing to do.
  }

  // ─── Report ──────────────────────────────────────────────────────────────
  console.log('─'.repeat(72));
  console.log(`Group A (healthy, no change):     ${pad(groupA.length, 6)}`);
  console.log(`Group B (backfill activatedAt):   ${pad(groupB.length, 6)}`);
  console.log(`Group C (reset to incomplete):    ${pad(groupC.length, 6)}`);
  console.log('─'.repeat(72));

  if (groupB.length) {
    console.log('\n── Group B — backfill activatedAt ──');
    console.log(`${pad('userId', 26)} ${pad('email', 38)} ${pad('activatedAt ←', 28)}`);
    for (const { id, email, firstDeposit } of groupB) {
      console.log(`${pad(id, 26)} ${pad(email, 38)} ${firstDeposit.date.toISOString()}`);
    }
  }

  if (groupC.length) {
    console.log('\n── Group C — reset to incomplete (wizard remounts) ──');
    console.log(`${pad('userId', 26)} ${pad('email', 38)} ${pad('currentStep ←', 14)} reason`);
    for (const { id, email, nextStep, hadAnswers } of groupC) {
      const reason = hadAnswers ? 'had setup answers, jump to offer step' : 'no answers, resume saved step';
      console.log(`${pad(id, 26)} ${pad(email, 38)} ${pad(nextStep, 14)} ${reason}`);
    }
  }

  if (VERBOSE && groupA.length) {
    console.log('\n── Group A — healthy, untouched (verbose) ──');
    console.log(`${pad('userId', 26)} ${pad('email', 38)} reason`);
    for (const { id, email, why } of groupA) {
      console.log(`${pad(id, 26)} ${pad(email, 38)} ${why}`);
    }
  }

  if (!APPLY) {
    console.log('\n─'.repeat(72));
    console.log('Dry-run complete. Re-run with --apply to write changes.');
    await mongoose.disconnect();
    return;
  }

  // ─── Apply ───────────────────────────────────────────────────────────────
  console.log('\n─'.repeat(72));
  console.log('Applying changes...');

  let bWritten = 0;
  for (const { id, firstDeposit } of groupB) {
    const r = await User.updateOne(
      { _id: id, 'onboarding.activatedAt': null },
      { $set: { 'onboarding.activatedAt': firstDeposit.date } }
    );
    if (r.modifiedCount) bWritten++;
  }
  console.log(`  ✓ Group B: backfilled activatedAt for ${bWritten}/${groupB.length} users.`);

  let cWritten = 0;
  for (const { id, nextStep } of groupC) {
    const r = await User.updateOne(
      { _id: id, 'onboarding.complete': true, 'onboarding.activatedAt': null, 'onboarding.bonusClaimedAt': null, balance: 0 },
      { $set: { 'onboarding.complete': false, 'onboarding.currentStep': nextStep } }
    );
    if (r.modifiedCount) cWritten++;
  }
  console.log(`  ✓ Group C: reset ${cWritten}/${groupC.length} stale-complete users.`);

  await mongoose.disconnect();
  console.log('\nMigration done.');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
