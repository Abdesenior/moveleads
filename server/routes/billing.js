const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const stripeInit = () => require('stripe')(process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.trim() : '');
const stripe = stripeInit();
const {
  applyOnboardingActivationCredit,
  applyTopUpCredit,
} = require('./billingCredits');

// @route   GET /api/billing/balance
// @desc    Get user balance
// @access  Private
router.get('/balance', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ balance: user.balance });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Onboarding-activation Payment Element flow
//
// Architecture:
//   1. Client → POST /create-payment-intent { amount: 50 | 100 } → server creates
//      a PaymentIntent with metadata.source='onboarding_activation' and computes
//      bonus eligibility server-side (only $100 + onboarding.bonusClaimedAt==null).
//   2. Client mounts <PaymentElement>, user pays, stripe.confirmPayment returns.
//   3. Client → POST /verify-payment-intent { paymentIntentId } (instant UX path).
//   4. Stripe → webhook payment_intent.succeeded (safety-net path).
//
// Both paths converge on `applyOnboardingActivationCredit(paymentIntent)` which
// is strictly idempotent: a unique index on Transaction.stripePaymentIntentId
// is the database-level safety, plus a Transaction.findOne() pre-check, plus
// a conditional User.updateOne() for the bonus stamp that races safely.
// ──────────────────────────────────────────────────────────────────────────

const ALLOWED_INTENT_AMOUNTS = [50, 100];
// applyOnboardingActivationCredit is now imported from ./billingCredits — see
// top of file. The webhook lives in routes/billingWebhook.js (mounted ungated
// in server.js before the verifiedGate on /api/billing).

// @route   POST /api/billing/create-payment-intent
// @desc    Create a PaymentIntent for the onboarding activation flow
// @access  Private (JWT)
router.post('/create-payment-intent', auth, async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    if (!ALLOWED_INTENT_AMOUNTS.includes(amount)) {
      return res.status(400).json({ msg: 'Invalid amount' });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ msg: 'Payment configuration error' });
    }
    const stripe = stripeInit();

    // ── WP-A4 — defense-in-depth email-verification gate ──
    // Even if the client somehow bypasses the wizard auto-mount gate, we
    // refuse to mint an activation PaymentIntent for an unverified user.
    const userDoc = await User.findById(req.user.id).select('onboarding isEmailVerified');
    if (!userDoc) return res.status(401).json({ msg: 'User not found' });
    if (userDoc.isEmailVerified !== true) {
      return res.status(403).json({
        msg: 'Please verify your email before activating. Check your inbox (and spam folder) for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    const isBonusTier = amount === 100;
    const eligibleForBonus = !!userDoc && !userDoc.onboarding?.bonusClaimedAt && isBonusTier;
    const bonusCredits = eligibleForBonus ? 50 : 0;
    const totalCredits = amount + bonusCredits;

    const intent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: req.user.id.toString(),
        source: 'onboarding_activation',
        selectedAmount: String(amount),
        bonusCredits: String(bonusCredits),
        totalCredits: String(totalCredits),
        onboardingBonusEligible: eligibleForBonus ? 'true' : 'false',
      },
      description: eligibleForBonus
        ? `MoveLeads onboarding activation: $${amount} → $${totalCredits} balance`
        : `MoveLeads activation: $${amount}`,
    });

    res.json({
      clientSecret: intent.client_secret,
      selectedAmount: amount,
      bonusCredits,
      totalCredits,
    });
  } catch (err) {
    console.error('[CreatePaymentIntent]', err);
    res.status(500).json({ msg: 'Could not start payment' });
  }
});

// @route   POST /api/billing/verify-payment-intent
// @desc    Instant-UX confirmation that a PaymentIntent succeeded.
//          Idempotent — webhook covers the case where this call doesn't run.
// @access  Private (JWT)
router.post('/verify-payment-intent', auth, async (req, res) => {
  try {
    const { paymentIntentId } = req.body || {};
    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return res.status(400).json({ msg: 'paymentIntentId required' });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ msg: 'Payment configuration error' });
    }
    const stripe = stripeInit();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Authorization: the PaymentIntent must belong to the calling user.
    if (intent.metadata?.userId !== req.user.id.toString()) {
      return res.status(403).json({ msg: 'Unauthorized' });
    }
    if (intent.status !== 'succeeded') {
      return res.status(409).json({ msg: `Payment not yet succeeded (status: ${intent.status})` });
    }

    const result = await applyOnboardingActivationCredit(intent);
    const user = await User.findById(req.user.id).select('balance onboarding');
    return res.json({
      applied: result.applied,
      alreadyProcessed: result.alreadyProcessed,
      balance: user.balance || 0,
      bonusClaimedAt: user.onboarding?.bonusClaimedAt || null,
    });
  } catch (err) {
    console.error('[VerifyPaymentIntent]', err);
    res.status(500).json({ msg: 'Verification failed' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Inline Top-Up flow (Stripe Payment Element on /dashboard/billing)
//
// Mirrors the activation flow but is purpose-built for plain top-ups:
//   - No bonus, no `onboarding.bonusClaimedAt` stamp
//   - No `onboarding.activatedAt` / `complete` flag stamps
//   - Just credits the balance, writes a Transaction row, and returns
//
// Keyed off PaymentIntent.metadata.source === 'topup' so webhook + verify
// both route to applyTopUpCredit (parallel to applyOnboardingActivationCredit).
// Strict idempotency via Transaction.stripePaymentIntentId unique-sparse index.
// ──────────────────────────────────────────────────────────────────────────

const ALLOWED_TOPUP_AMOUNTS = [50, 100, 200, 500];
// applyTopUpCredit is now imported from ./billingCredits.

// @route   POST /api/billing/create-topup-intent
// @desc    Create a PaymentIntent for an inline top-up (no redirect)
// @access  Private (JWT)
router.post('/create-topup-intent', auth, async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    if (!ALLOWED_TOPUP_AMOUNTS.includes(amount)) {
      return res.status(400).json({ msg: 'Invalid amount' });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ msg: 'Payment configuration error' });
    }
    const stripe = stripeInit();

    // ── WP-A4 — top-ups also gated on email verification (cheap defense). ──
    // Top-ups are typically post-activation, so by the time someone hits this
    // they should already be verified — but block to be safe.
    const userDoc = await User.findById(req.user.id).select('isEmailVerified');
    if (!userDoc) return res.status(401).json({ msg: 'User not found' });
    if (userDoc.isEmailVerified !== true) {
      return res.status(403).json({
        msg: 'Please verify your email before adding funds. Check your inbox (and spam folder) for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const intent = await stripe.paymentIntents.create({
      amount: amount * 100, // Stripe uses cents
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: req.user.id.toString(),
        source: 'topup',
        amount: String(amount),
      },
      description: `MoveLeads top-up: $${amount}`,
    });

    res.json({ clientSecret: intent.client_secret, amount });
  } catch (err) {
    console.error('[CreateTopUpIntent]', err);
    res.status(500).json({ msg: 'Could not start payment' });
  }
});

// @route   POST /api/billing/verify-topup-intent
// @desc    Fast-UX confirmation that a top-up PI succeeded. Webhook is the
//          safety-net — both call applyTopUpCredit, which is idempotent.
// @access  Private (JWT)
router.post('/verify-topup-intent', auth, async (req, res) => {
  try {
    const { paymentIntentId } = req.body || {};
    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return res.status(400).json({ msg: 'paymentIntentId required' });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ msg: 'Payment configuration error' });
    }
    const stripe = stripeInit();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.metadata?.userId !== req.user.id.toString()) {
      return res.status(403).json({ msg: 'Unauthorized' });
    }
    if (intent.metadata?.source !== 'topup') {
      return res.status(400).json({ msg: 'Not a top-up intent' });
    }
    if (intent.status !== 'succeeded') {
      return res.status(409).json({ msg: `Payment not yet succeeded (status: ${intent.status})` });
    }

    const result = await applyTopUpCredit(intent);
    const user = await User.findById(req.user.id).select('balance');
    // The reassurance popup is owned by DashboardLayout, which watches
    // user.onboarding.firstTopupAt / firstTopupPopupShownAt directly via
    // refreshUser — so we don't need to surface a flag here.
    return res.json({
      applied: result.applied,
      alreadyProcessed: result.alreadyProcessed,
      balance: user.balance || 0,
      amount: result.amount,
    });
  } catch (err) {
    console.error('[VerifyTopUpIntent]', err);
    res.status(500).json({ msg: 'Verification failed' });
  }
});

// NOTE: The Stripe webhook (POST /api/billing/webhook) has been MOVED to
// routes/billingWebhook.js so it can be mounted in server.js BEFORE the
// `requireEmailVerified` gate that wraps the rest of /api/billing. Stripe
// deliveries don't carry a JWT and must not be blocked by the verification
// gate. The webhook authenticates via STRIPE_WEBHOOK_SECRET signature check.

// @route   GET /api/billing/transactions
// @desc    Get user transaction history
// @access  Private
router.get('/transactions', auth, async (req, res) => {
  try {
    let query = { user: req.user.id };
    if (req.user.role === 'admin') query = {}; // admin sees all
    
    const transactions = await Transaction.find(query).sort({ date: -1 });
    res.json(transactions);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/billing/admin/revenue-stats
// @desc    Get platform revenue statistics (Admin only)
// @access  Private (Admin)
router.get('/admin/revenue-stats', [auth, admin], async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await Transaction.aggregate([
      { $match: { status: 'Completed', amount: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          monthlyRevenue: {
            $sum: {
              $cond: [{ $gte: ['$date', thirtyDaysAgo] }, '$amount', 0]
            }
          }
        }
      }
    ]);

    const result = stats.length > 0 ? stats[0] : { totalRevenue: 0, monthlyRevenue: 0 };
    res.json(result);
  } catch (err) {
    console.error('REVENUE STATS ERROR:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/billing/create-setup-intent
// @desc    Create a Stripe SetupIntent to securely save a card
// @access  Private
router.post('/create-setup-intent', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    let customerId = user.stripeCustomerId;

    // Create a Stripe customer if one doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.companyName,
        metadata: { userId: user.id.toString() }
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session', // critical for future auto-recharges
    });

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error('SETUP INTENT ERROR:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/billing/save-payment-method
// @desc    Attach a payment method to a customer and save as default
// @access  Private
router.post('/save-payment-method', auth, async (req, res) => {
  const { paymentMethodId } = req.body;
  if (!paymentMethodId) return res.status(400).json({ msg: 'Payment Method ID is required' });

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripeCustomerId,
    });

    // Set as default for the customer
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Save to user model
    user.stripePaymentMethodId = paymentMethodId;
    await user.save();

    res.json({ msg: 'Payment method saved successfully', paymentMethodId });
  } catch (err) {
    console.error('SAVE PM ERROR:', err.message);
    res.status(500).json({ msg: err.message });
  }
});

module.exports = router;
