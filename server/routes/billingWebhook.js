// ──────────────────────────────────────────────────────────────────────────
// Stripe webhook — split out of routes/billing.js so it can be mounted
// BEFORE the email-verification gate that wraps the rest of /api/billing.
//
// Stripe deliveries carry NO JWT — they are authenticated via the raw-body
// signature check using STRIPE_WEBHOOK_SECRET. Mounting this router at
// /api/billing/webhook with no auth gate is by design.
//
// Handlers below mirror the logic that used to live inline in billing.js,
// importing the shared apply* helpers from a shared module.
// ──────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.trim() : '');
const { sendAdminNotification } = require('../services/emailService');
const {
  applyOnboardingActivationCredit,
  applyTopUpCredit,
} = require('./billingCredits');

// ── Balance clawback with non-negative clamp ────────────────────────────
// Stripe refunds/chargebacks can arrive AFTER the mover has spent the
// original credit on leads. Unconditional $inc would drive balance
// negative, and operators would have to remediate via the manual admin
// balance-adjust route (see B4-refund-overdraft-investigation.md).
//
// This helper does a conditional-CAS clamp: only debit if the full
// amount can be debited; otherwise zero out the balance and write a
// compensating "Admin Adjustment" Transaction row for the unfundable
// delta. Ledger invariant sum(Transaction.amount) === User.balance is
// preserved across the two-row write: the Stripe Refund / Stripe
// Chargeback row already carries -amount; the +writedown row offsets
// the portion the balance could not actually fund.
//
// Race window: between the CAS miss and the unconditional $set:0, a
// concurrent debit (buy-now / SMS Claim) could fire and our $set would
// overwrite it. Net effect: that concurrent debit is silently absorbed
// (mover effectively gets one lead for free). Chargebacks are rare
// events and operator-eyeballed; we accept this race.
async function clawbackOrClamp({ userId, amount, sourceLabel, sourceChargeId }) {
  const ok = await User.findOneAndUpdate(
    { _id: userId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true }
  );
  if (ok) {
    return { clamped: false, debited: amount, writedown: 0, finalBalance: ok.balance };
  }

  // Would-be-negative — clamp to 0 and write compensating ledger row.
  const cur = await User.findById(userId).select('balance').lean();
  const before = Number(cur?.balance || 0);
  const debited = Math.max(0, Math.min(amount, before));
  const writedown = Math.round((amount - debited) * 100) / 100;
  await User.updateOne({ _id: userId }, { $set: { balance: 0 } });

  try {
    await Transaction.create({
      user: userId,
      type: 'Admin Adjustment',
      // POSITIVE — offsets the unfundable portion of the -amount clawback
      // row so sum(Transaction.amount) === User.balance still holds.
      amount: writedown,
      description: `Auto writedown: ${sourceLabel} ${sourceChargeId} exceeded balance by $${writedown.toFixed(2)} — clamped to 0 to preserve non-negative invariant`,
      status: 'Completed',
    });
  } catch (txnErr) {
    console.error(`[Webhook] Admin Adjustment writedown failed (non-fatal): ${txnErr.message}`);
  }

  return { clamped: true, debited, writedown, finalBalance: 0 };
}

// @route   POST /api/billing/webhook
// @desc    Stripe Webhook Listener
// @access  Public (Stripe Signature Verification)
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const source = intent?.metadata?.source;

    if (source === 'onboarding_activation') {
      try {
        const result = await applyOnboardingActivationCredit(intent);
        if (result.applied) {
          console.log(`[Webhook] PI ${intent.id} (activation) → credited $${result.totalCredits}`);
        } else {
          console.log(`[Webhook] PI ${intent.id} (activation) → no-op (${result.reason || 'already processed'})`);
        }
      } catch (err) {
        console.error(`[Webhook] PI ${intent.id} (activation) apply error:`, err.message);
      }
    } else if (source === 'topup') {
      try {
        const result = await applyTopUpCredit(intent);
        if (result.applied) {
          console.log(`[Webhook] PI ${intent.id} (topup) → credited $${result.amount}`);
        } else {
          console.log(`[Webhook] PI ${intent.id} (topup) → no-op (${result.reason || 'already processed'})`);
        }
      } catch (err) {
        console.error(`[Webhook] PI ${intent.id} (topup) apply error:`, err.message);
      }
    }
    return res.json({ received: true });
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    try {
      const piId = charge.payment_intent;
      const original = piId
        ? await Transaction.findOne({ stripePaymentIntentId: piId })
        : null;

      if (!original) {
        console.log(`[Webhook] charge.refunded → no matching Transaction for PI ${piId || '?'} (charge ${charge.id})`);
        return res.json({ received: true });
      }

      const already = await Transaction.findOne({ stripeChargeId: charge.id, type: 'Stripe Refund' });
      if (already) {
        console.log(`[Webhook] charge.refunded → already processed for charge ${charge.id}`);
        return res.json({ received: true });
      }

      const refundedCents = Number(charge.amount_refunded || 0);
      const refundedDollars = Math.round(refundedCents) / 100;
      if (!refundedDollars || refundedDollars <= 0) {
        console.log(`[Webhook] charge.refunded → zero refund amount for charge ${charge.id}; skipping`);
        return res.json({ received: true });
      }

      try {
        await new Transaction({
          user: original.user,
          type: 'Stripe Refund',
          amount: -refundedDollars,
          description: `Stripe refund of charge ${charge.id} (PI: ${piId})`,
          stripeChargeId: charge.id,
          status: 'Completed',
        }).save();
      } catch (err) {
        if (err && err.code === 11000) {
          console.log(`[Webhook] charge.refunded → race: already processed for charge ${charge.id}`);
          return res.json({ received: true });
        }
        throw err;
      }

      const clampResult = await clawbackOrClamp({
        userId: original.user,
        amount: refundedDollars,
        sourceLabel: 'Stripe Refund',
        sourceChargeId: charge.id,
      });

      console.log(
        `[Webhook] charge.refunded → clawed back $${clampResult.debited} from user ${original.user} ` +
        `(charge ${charge.id}; clamped=${clampResult.clamped}, writedown=$${clampResult.writedown})`
      );

      User.findById(original.user).select('email companyName').lean().then((u) => {
        if (!u?.email) return;
        const clampLines = clampResult.clamped
          ? `<p><strong>Clamped to zero:</strong> YES</p>
             <p><strong>Actually debited:</strong> $${clampResult.debited.toFixed(2)}</p>
             <p><strong>Compensating Admin Adjustment:</strong> +$${clampResult.writedown.toFixed(2)} (mover owes this — consider collection action)</p>`
          : `<p><strong>Clamped to zero:</strong> NO</p>`;
        return sendAdminNotification({
          subject: `🔁 Stripe refund processed — ${u.companyName}`,
          html: `
            <h2>Stripe Refund Processed</h2>
            <p><strong>Company:</strong> ${u.companyName}</p>
            <p><strong>Email:</strong> ${u.email}</p>
            <p><strong>Amount Refunded:</strong> $${refundedDollars.toFixed(2)}</p>
            <p><strong>Charge:</strong> ${charge.id}</p>
            <p><strong>PaymentIntent:</strong> ${piId}</p>
            ${clampLines}
            <p><strong>Final balance:</strong> $${clampResult.finalBalance.toFixed(2)}</p>
          `,
        });
      }).catch(() => {});
    } catch (err) {
      console.error(`[Webhook] charge.refunded error:`, err.message);
    }
    return res.json({ received: true });
  }

  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object;
    const charge = dispute.charge;
    const chargeId = typeof charge === 'string' ? charge : charge?.id;
    try {
      let original = null;
      if (dispute.payment_intent) {
        original = await Transaction.findOne({ stripePaymentIntentId: dispute.payment_intent });
      }
      if (!original && chargeId) {
        original = await Transaction.findOne({ stripeChargeId: chargeId });
      }

      if (!original) {
        console.log(`[Webhook] charge.dispute.created → no matching Transaction for charge ${chargeId || '?'}`);
        return res.json({ received: true });
      }

      const already = await Transaction.findOne({ stripeChargeId: chargeId, type: 'Stripe Chargeback' });
      if (already) {
        console.log(`[Webhook] charge.dispute.created → already processed for charge ${chargeId}`);
        return res.json({ received: true });
      }

      const disputedCents = Number(dispute.amount || 0);
      const disputedDollars = Math.round(disputedCents) / 100;
      if (!disputedDollars || disputedDollars <= 0) {
        console.log(`[Webhook] charge.dispute.created → zero disputed amount; skipping (charge ${chargeId})`);
        return res.json({ received: true });
      }

      try {
        await new Transaction({
          user: original.user,
          type: 'Stripe Chargeback',
          amount: -disputedDollars,
          description: `Stripe chargeback on charge ${chargeId} (reason: ${dispute.reason || 'unspecified'})`,
          stripeChargeId: chargeId,
          status: 'Completed',
        }).save();
      } catch (err) {
        if (err && err.code === 11000) {
          console.log(`[Webhook] charge.dispute.created → race: already processed for charge ${chargeId}`);
          return res.json({ received: true });
        }
        throw err;
      }

      const clampResult = await clawbackOrClamp({
        userId: original.user,
        amount: disputedDollars,
        sourceLabel: 'Stripe Chargeback',
        sourceChargeId: chargeId,
      });

      console.log(
        `[Webhook] charge.dispute.created → clawed back $${clampResult.debited} from user ${original.user} ` +
        `(charge ${chargeId}; clamped=${clampResult.clamped}, writedown=$${clampResult.writedown})`
      );

      User.findById(original.user).select('email companyName').lean().then((u) => {
        if (!u) return;
        const clampLines = clampResult.clamped
          ? `<p><strong>Clamped to zero:</strong> YES</p>
             <p><strong>Actually debited:</strong> $${clampResult.debited.toFixed(2)}</p>
             <p><strong>Compensating Admin Adjustment:</strong> +$${clampResult.writedown.toFixed(2)} (mover owes this — consider collection action)</p>`
          : `<p><strong>Clamped to zero:</strong> NO</p>`;
        return sendAdminNotification({
          subject: `⚠️ Stripe Chargeback opened — ${u.companyName}`,
          html: `
            <h2>Stripe Chargeback Opened</h2>
            <p><strong>Company:</strong> ${u.companyName}</p>
            <p><strong>Email:</strong> ${u.email}</p>
            <p><strong>Amount Disputed:</strong> $${disputedDollars.toFixed(2)}</p>
            <p><strong>Reason:</strong> ${dispute.reason || 'unspecified'}</p>
            <p><strong>Charge:</strong> ${chargeId}</p>
            ${clampLines}
            <p><strong>Final balance:</strong> $${clampResult.finalBalance.toFixed(2)}</p>
          `,
        });
      }).catch(() => {});
    } catch (err) {
      console.error(`[Webhook] charge.dispute.created error:`, err.message);
    }
    return res.json({ received: true });
  }

  res.json({ received: true });
});

module.exports = router;
