const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const Transaction = require('../models/Transaction');

/**
 * Atomically deducts the lead price from the user's balance within an existing
 * MongoDB session/transaction. Records a Transaction document.
 *
 * Returns the new balance so the caller can decide whether to trigger recharge.
 *
 * @param {string} userId
 * @param {number} amount  - Lead price
 * @param {ClientSession} session - Active Mongoose session (required)
 * @returns {Promise<{ balance: number }>}
 */
async function deductLeadBalance(userId, amount, session = null, description = null) {
  // Atomic balance deduction — findOneAndUpdate prevents read-modify-save race.
  // session is optional; standalone MongoDB instances don't support multi-doc transactions.
  const findOpts = session ? { returnDocument: 'after', session } : { returnDocument: 'after' };
  const updated = await User.findOneAndUpdate(
    { _id: userId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    findOpts
  );

  if (!updated) {
    // Either user not found or balance was insufficient.
    const userQuery = User.findById(userId);
    if (session) userQuery.session(session);
    const user = await userQuery;
    if (!user) throw new Error('User not found');
    throw new Error('Insufficient balance to purchase lead');
  }

  const leadTransaction = new Transaction({
    user: userId,
    type: 'Lead Purchase',
    amount: -amount,
    description: description || `Purchased Lead for $${amount}`,
    status: 'Completed'
  });
  await leadTransaction.save(session ? { session } : {});

  console.log(`[Billing] Charged ${userId} $${amount}. New balance: $${updated.balance.toFixed(2)}`);

  return { balance: updated.balance };
}

/**
 * Checks whether auto-recharge should fire and, if so, charges the user's saved
 * Stripe payment method off-session. This runs OUTSIDE any MongoDB transaction —
 * it is called after the transaction commits and is fully async (fire-and-forget).
 *
 * @param {string} userId
 */
async function runAutoRecharge(userId) {
  const user = await User.findById(userId);
  if (!user) return;

  const { balance, autoRechargeThreshold, autoRechargeAmount, stripePaymentMethodId, stripeCustomerId } = user;

  if (balance >= autoRechargeThreshold || !stripePaymentMethodId || !stripeCustomerId) return;
  if (!autoRechargeAmount || autoRechargeAmount <= 0) return;

  console.log(`[Billing] Auto-recharge triggered for ${userId}. Balance: $${balance.toFixed(2)}, Threshold: $${autoRechargeThreshold}`);

  try {
    const idempotencyKey = `recharge-${userId}-${Date.now()}`;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Math.round(autoRechargeAmount * 100),
        currency: 'usd',
        customer: stripeCustomerId,
        payment_method: stripePaymentMethodId,
        off_session: true,
        confirm: true,
        description: `Auto-Recharge +$${autoRechargeAmount} (Threshold: $${autoRechargeThreshold})`,
      },
      { idempotencyKey }
    );

    if (paymentIntent.status === 'succeeded') {
      // Atomic credit — no session needed here, we're outside the transaction.
      await User.findByIdAndUpdate(userId, { $inc: { balance: autoRechargeAmount } });

      await Transaction.create({
        user: userId,
        type: 'Credit Deposit',
        amount: autoRechargeAmount,
        description: `Auto-Recharge +$${autoRechargeAmount} (Threshold: $${autoRechargeThreshold})`,
        status: 'Completed'
      });

      console.log(`[Billing] Auto-recharge SUCCESS for ${userId}. Added $${autoRechargeAmount}.`);
    }
  } catch (err) {
    console.error(`[Billing] Auto-recharge FAILED for ${userId}:`, err.message);
    // Non-fatal — the lead purchase already committed. Notify user via email in production.
  }
}

module.exports = { deductLeadBalance, runAutoRecharge };
