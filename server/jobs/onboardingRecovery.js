// Onboarding recovery cron — fires recovery emails for two segments:
//   1) Post-skip: completed setup but didn't claim activation bonus.
//   2) Mid-wizard: registered, started wizard, never reached Confirm.
// Idempotent: each user only gets each touch once via per-segment flags.

const cron = require('node-cron');
const User = require('../models/User');
const {
  sendOnboardingRecovery12h,
  sendOnboardingRecovery24h,
  sendOnboardingRecovery72h,
  sendOnboardingMidwizard12h,
  sendOnboardingMidwizard24h,
  sendOnboardingMidwizard72h,
} = require('../services/emailService');

const HOUR = 60 * 60 * 1000;

async function runPostSkipBatch(now) {
  const users = await User.find({
    'onboarding.complete': true,
    'onboarding.bonusClaimedAt': null,
    role: { $in: ['customer', undefined] },
    isSuspended: { $ne: true },
  }).select('email companyName onboarding createdAt');

  let sent12 = 0, sent24 = 0, sent72 = 0;

  for (const u of users) {
    const completedAt = u.onboarding?.completedAt
      ? new Date(u.onboarding.completedAt).getTime()
      : new Date(u.createdAt).getTime();
    const ageMs = now - completedAt;
    const flags = u.onboarding?.recovery || {};

    try {
      if (ageMs >= 72 * HOUR && !flags.sent72h) {
        await sendOnboardingRecovery72h(u);
        await User.updateOne({ _id: u._id }, { $set: { 'onboarding.recovery.sent72h': true } });
        sent72++;
      } else if (ageMs >= 24 * HOUR && !flags.sent24h) {
        await sendOnboardingRecovery24h(u);
        await User.updateOne({ _id: u._id }, { $set: { 'onboarding.recovery.sent24h': true } });
        sent24++;
      } else if (ageMs >= 12 * HOUR && !flags.sent12h) {
        await sendOnboardingRecovery12h(u);
        await User.updateOne({ _id: u._id }, { $set: { 'onboarding.recovery.sent12h': true } });
        sent12++;
      }
    } catch (err) {
      console.error(`[OnboardingRecovery] post-skip failed for ${u._id}:`, err.message);
    }
  }
  return { sent12, sent24, sent72 };
}

async function runMidwizardBatch(now) {
  // Started wizard (currentStep > 0) but never reached Confirm (complete != true).
  const users = await User.find({
    'onboarding.complete': { $ne: true },
    'onboarding.currentStep': { $gt: 0 },
    role: { $in: ['customer', undefined] },
    isSuspended: { $ne: true },
  }).select('email companyName onboarding createdAt');

  let sent12 = 0, sent24 = 0, sent72 = 0;

  for (const u of users) {
    // Window starts at registration time (no completedAt for abandoners).
    const ageMs = now - new Date(u.createdAt).getTime();
    const flags = u.onboarding?.recovery || {};

    try {
      if (ageMs >= 72 * HOUR && !flags.sentMidwizard72h) {
        await sendOnboardingMidwizard72h(u);
        await User.updateOne({ _id: u._id }, { $set: { 'onboarding.recovery.sentMidwizard72h': true } });
        sent72++;
      } else if (ageMs >= 24 * HOUR && !flags.sentMidwizard24h) {
        await sendOnboardingMidwizard24h(u);
        await User.updateOne({ _id: u._id }, { $set: { 'onboarding.recovery.sentMidwizard24h': true } });
        sent24++;
      } else if (ageMs >= 12 * HOUR && !flags.sentMidwizard12h) {
        await sendOnboardingMidwizard12h(u);
        await User.updateOne({ _id: u._id }, { $set: { 'onboarding.recovery.sentMidwizard12h': true } });
        sent12++;
      }
    } catch (err) {
      console.error(`[OnboardingRecovery] midwizard failed for ${u._id}:`, err.message);
    }
  }
  return { sent12, sent24, sent72 };
}

async function runOnce() {
  const now = Date.now();
  const post = await runPostSkipBatch(now);
  const mid  = await runMidwizardBatch(now);
  const total = post.sent12 + post.sent24 + post.sent72 + mid.sent12 + mid.sent24 + mid.sent72;
  if (total > 0) {
    console.log(`[OnboardingRecovery] post-skip: 12h=${post.sent12} 24h=${post.sent24} 72h=${post.sent72} | midwizard: 12h=${mid.sent12} 24h=${mid.sent24} 72h=${mid.sent72}`);
  }
}

// Auto-register at module load — matches the pattern used by settleAuctions / requestFeedback
// Run every 30 minutes — small enough that 12h/24h/72h thresholds fire near their target.
cron.schedule('*/30 * * * *', () => {
  runOnce().catch(err => console.error('[OnboardingRecovery] tick error:', err));
});
console.log('[OnboardingRecovery] cron registered — runs every 30 min');

module.exports = { runOnce };
