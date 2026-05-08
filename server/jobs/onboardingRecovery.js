// Onboarding recovery cron — fires recovery emails for movers who skipped activation.
// Idempotent: each user only gets each touch once (sent12h/sent24h/sent72h flags).

const cron = require('node-cron');
const User = require('../models/User');
const {
  sendOnboardingRecovery12h,
  sendOnboardingRecovery24h,
  sendOnboardingRecovery72h,
} = require('../services/emailService');

const HOUR = 60 * 60 * 1000;

async function runOnce() {
  const now = Date.now();

  // Candidates: completed onboarding (or skipped), no bonus claimed yet
  const users = await User.find({
    'onboarding.complete': true,
    'onboarding.bonusClaimedAt': null,
    role: { $in: ['customer', undefined] }, // skip admins
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
      console.error(`[OnboardingRecovery] failed for ${u._id}:`, err.message);
    }
  }

  if (sent12 + sent24 + sent72 > 0) {
    console.log(`[OnboardingRecovery] sent: 12h=${sent12} 24h=${sent24} 72h=${sent72}`);
  }
}

// Auto-register at module load — matches the pattern used by settleAuctions / requestFeedback
// Run every 30 minutes — small enough that 12h/24h/72h thresholds fire near their target.
cron.schedule('*/30 * * * *', () => {
  runOnce().catch(err => console.error('[OnboardingRecovery] tick error:', err));
});
console.log('[OnboardingRecovery] cron registered — runs every 30 min');

module.exports = { runOnce };
