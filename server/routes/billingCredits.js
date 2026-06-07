// ──────────────────────────────────────────────────────────────────────────
// Shared credit-application helpers — applyOnboardingActivationCredit and
// applyTopUpCredit. Extracted from routes/billing.js so the Stripe webhook
// router (mounted ungated, before the verifiedGate on /api/billing) and the
// gated billing router can both import the same idempotent functions.
//
// IDEMPOTENCY: both helpers rely on the unique index on
// Transaction.stripePaymentIntentId. The transaction insert IS the gate; the
// balance $inc only runs once.
// ──────────────────────────────────────────────────────────────────────────
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const {
  sendAdminNotification,
  sendTopupReceiptEmail,
  sendActivationReceiptEmail,
} = require('../services/emailService');
const metaCapiMovers = require('../services/metaCapiMovers');

async function applyOnboardingActivationCredit(paymentIntent) {
  const md = paymentIntent.metadata || {};
  if (md.source !== 'onboarding_activation') return { applied: false, alreadyProcessed: false, reason: 'wrong_source' };
  if (paymentIntent.status !== 'succeeded')   return { applied: false, alreadyProcessed: false, reason: 'not_succeeded' };

  const userId = md.userId;
  const selectedAmount = Number(md.selectedAmount || 0);
  const bonusCredits   = Number(md.bonusCredits   || 0);
  const totalCredits   = Number(md.totalCredits   || selectedAmount + bonusCredits);
  if (!userId || !totalCredits) {
    console.error('[ApplyCredit] missing userId or totalCredits in PI metadata', paymentIntent.id, md);
    return { applied: false, alreadyProcessed: false, reason: 'invalid_metadata' };
  }

  const existing = await Transaction.findOne({ stripePaymentIntentId: paymentIntent.id });
  if (existing) {
    const u = await User.findById(userId).select('balance');
    return { applied: false, alreadyProcessed: true, balance: u?.balance || 0, totalCredits };
  }

  const user = await User.findById(userId);
  if (!user) {
    console.error('[ApplyCredit] user not found for PI', paymentIntent.id, userId);
    return { applied: false, alreadyProcessed: false, reason: 'user_not_found' };
  }

  let txn;
  try {
    txn = await new Transaction({
      user: userId,
      type: 'Credit Deposit',
      amount: totalCredits,
      description: bonusCredits > 0
        ? `Onboarding Activation +$${selectedAmount} (+$${bonusCredits} bonus) (PI: ${paymentIntent.id})`
        : `Onboarding Activation +$${selectedAmount} (PI: ${paymentIntent.id})`,
      status: 'Completed',
      stripePaymentIntentId: paymentIntent.id,
    }).save();
  } catch (err) {
    if (err && err.code === 11000) {
      const u = await User.findById(userId).select('balance');
      return { applied: false, alreadyProcessed: true, balance: u?.balance || 0, totalCredits };
    }
    throw err;
  }

  await User.updateOne({ _id: userId }, { $inc: { balance: totalCredits } });

  if (bonusCredits > 0) {
    await User.updateOne(
      { _id: userId, 'onboarding.bonusClaimedAt': null },
      { $set: { 'onboarding.bonusClaimedAt': new Date() } }
    );
  }

  await User.updateOne(
    { _id: userId, 'onboarding.activatedAt': null },
    { $set: { 'onboarding.activatedAt': new Date() } }
  );

  await User.updateOne(
    { _id: userId, 'onboarding.firstTopupAt': null },
    { $set: { 'onboarding.firstTopupAt': new Date() } }
  );

  await User.updateOne(
    { _id: userId, 'onboarding.complete': { $ne: true } },
    { $set: { 'onboarding.complete': true, 'onboarding.completedAt': new Date() } }
  );

  const fresh = await User.findById(userId).select('balance companyName email phone');

  sendAdminNotification({
    subject: `💰 Activation Payment — ${fresh.companyName}`,
    html: `
      <h2>New Activation Payment</h2>
      <p><strong>Company:</strong> ${fresh.companyName}</p>
      <p><strong>Email:</strong> ${fresh.email}</p>
      <p><strong>Paid:</strong> $${selectedAmount.toFixed(2)}</p>
      <p><strong>Bonus:</strong> $${bonusCredits.toFixed(2)}</p>
      <p><strong>Credited:</strong> $${totalCredits.toFixed(2)}</p>
      <p><strong>New Balance:</strong> $${(fresh.balance || 0).toFixed(2)}</p>
      <p><strong>PaymentIntent:</strong> ${paymentIntent.id}</p>
    `,
  }).catch(() => {});

  sendActivationReceiptEmail({
    user: fresh,
    amountPaid: selectedAmount,
    balanceAfter: fresh.balance || 0,
    isBonusPath: bonusCredits > 0,
  }).catch(() => {});

  // Mover CAPI: Purchase. This branch is reached once per PI (Transaction unique
  // index is the idempotency key), so no extra guard is needed. event_id =
  // PaymentIntent id so the browser Pixel Purchase dedups. value = cash paid.
  metaCapiMovers
    .sendActivationPurchase(fresh, { eventId: paymentIntent.id, value: selectedAmount })
    .catch(err => console.error('[metaCapiMovers] Purchase threw:', err && err.message));

  console.log(`[ApplyCredit] credited $${totalCredits} to ${userId} for PI ${paymentIntent.id}`);
  return { applied: true, alreadyProcessed: false, balance: fresh.balance || 0, totalCredits };
}

async function applyTopUpCredit(paymentIntent) {
  const md = paymentIntent.metadata || {};
  if (md.source !== 'topup')                  return { applied: false, alreadyProcessed: false, reason: 'wrong_source' };
  if (paymentIntent.status !== 'succeeded')   return { applied: false, alreadyProcessed: false, reason: 'not_succeeded' };

  const userId = md.userId;
  const amount = Number(md.amount || 0);
  if (!userId || !amount) {
    console.error('[ApplyTopUp] missing userId or amount in PI metadata', paymentIntent.id, md);
    return { applied: false, alreadyProcessed: false, reason: 'invalid_metadata' };
  }

  const existing = await Transaction.findOne({ stripePaymentIntentId: paymentIntent.id });
  if (existing) {
    const u = await User.findById(userId).select('balance');
    return { applied: false, alreadyProcessed: true, balance: u?.balance || 0, amount };
  }

  const user = await User.findById(userId);
  if (!user) {
    console.error('[ApplyTopUp] user not found for PI', paymentIntent.id, userId);
    return { applied: false, alreadyProcessed: false, reason: 'user_not_found' };
  }

  const isFirstTopup = !user.onboarding?.firstTopupAt;

  let topupTxn;
  try {
    topupTxn = await new Transaction({
      user: userId,
      type: 'Credit Deposit',
      amount,
      description: `Top Up +$${amount} (PI: ${paymentIntent.id})`,
      status: 'Completed',
      stripePaymentIntentId: paymentIntent.id,
    }).save();
  } catch (err) {
    if (err && err.code === 11000) {
      const u = await User.findById(userId).select('balance');
      return { applied: false, alreadyProcessed: true, balance: u?.balance || 0, amount };
    }
    throw err;
  }

  const update = { $inc: { balance: amount } };
  if (isFirstTopup) {
    update.$set = { 'onboarding.firstTopupAt': new Date() };
  }
  await User.updateOne({ _id: userId }, update);

  const fresh = await User.findById(userId).select('balance companyName email');

  sendAdminNotification({
    subject: `💰 Top-Up Payment — ${fresh.companyName}`,
    html: `
      <h2>Top-Up Payment</h2>
      <p><strong>Company:</strong> ${fresh.companyName}</p>
      <p><strong>Email:</strong> ${fresh.email}</p>
      <p><strong>Amount Added:</strong> $${amount.toFixed(2)}</p>
      <p><strong>New Balance:</strong> $${fresh.balance.toFixed(2)}</p>
      <p><strong>PaymentIntent:</strong> ${paymentIntent.id}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
    `,
  }).catch(() => {});

  sendTopupReceiptEmail({
    user: fresh,
    amount,
    balanceAfter: fresh.balance || 0,
    transactionId: topupTxn?._id?.toString(),
  }).catch(() => {});

  console.log(`[ApplyTopUp] credited $${amount} to ${userId} for PI ${paymentIntent.id}${isFirstTopup ? ' (first top-up)' : ''}`);
  return { applied: true, alreadyProcessed: false, balance: fresh.balance || 0, amount, isFirstTopup };
}

module.exports = { applyOnboardingActivationCredit, applyTopUpCredit };
