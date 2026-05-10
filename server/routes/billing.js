const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const stripeInit = () => require('stripe')(process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.trim() : '');
const stripe = stripeInit();
const { sendAdminNotification } = require('../services/emailService');

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

// @route   POST /api/billing/create-checkout-session
// @desc    Create Stripe Checkout session
// @access  Private
router.post('/create-checkout-session', auth, async (req, res) => {
  const { amount, embedded } = req.body;
  if (![50, 100, 200, 500].includes(amount)) {
    return res.status(400).json({ msg: 'Invalid amount selected' });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not defined in server environment');
    }
    const stripe = stripeInit();

    // Detect first-time-mover bonus eligibility.
    // Bonus only applies to the $100 activation tier — the $50 starter tier is
    // a lower-commitment fallback for hesitant movers and gets no bonus.
    const userDoc = await User.findById(req.user.id).select('onboarding');
    const isBonusTier = Number(amount) === 100;
    const eligibleForBonus = !!userDoc && !userDoc.onboarding?.bonusClaimedAt && isBonusTier;
    const baseCredits = Number(amount);
    const bonusCredits = eligibleForBonus ? Math.round(baseCredits * 0.5) : 0;
    const totalCredits = baseCredits + bonusCredits;

    console.log('Creating Stripe Session for user:', req.user.id, 'Amount:', amount, 'Bonus:', bonusCredits, 'Embedded:', !!embedded);

    const baseConfig = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: eligibleForBonus
              ? `${baseCredits} Credits + ${bonusCredits} bonus`
              : `${amount} Credits`,
            description: eligibleForBonus
              ? `First-time mover onboarding: $${baseCredits} = $${totalCredits} balance`
              : `Purchase ${amount} credits for the MoveLeads platform`,
          },
          unit_amount: amount * 100, // Stripe uses cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      metadata: {
        userId: req.user.id.toString(),
        credits: String(totalCredits),
        baseCredits: String(baseCredits),
        bonusCredits: String(bonusCredits),
        firstPurchaseBonus: eligibleForBonus ? 'true' : 'false',
      },
    };

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    let session;
    if (embedded) {
      // Stripe Embedded Checkout — UI mounts inside our modal, redirects to
      // return_url after payment. ui_mode 'embedded_page' pairs with the
      // client's stripe.createEmbeddedCheckoutPage() call and is supported
      // by the Stripe Node SDK's default API version (dahlia release).
      session = await stripe.checkout.sessions.create({
        ...baseConfig,
        ui_mode: 'embedded_page',
        return_url: `${clientUrl}/dashboard/leads?onboarding=success&session_id={CHECKOUT_SESSION_ID}`,
      });
      return res.json({
        clientSecret: session.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      });
    } else {
      session = await stripe.checkout.sessions.create({
        ...baseConfig,
        success_url: `${clientUrl}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}&amount=${amount}`,
        cancel_url: `${clientUrl}/dashboard/billing?canceled=true`,
      });
      return res.json({ url: session.url });
    }
  } catch (err) {
    console.error('STRIPE SESSION ERROR:', err);
    res.status(500).json({ msg: err.message });
  }
});

// @route   POST /api/billing/confirm-payment
// @desc    Manually confirm payment after redirect (alternative to webhook)
// @access  Private
router.post('/confirm-payment', auth, async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ msg: 'No session ID provided' });

  try {
    const stripe = stripeInit();
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ msg: 'Payment not completed' });
    }

    // Check if this session was already processed (idempotency)
    const existingTx = await Transaction.findOne({ description: new RegExp(session_id) });
    if (existingTx) {
      return res.status(200).json({ msg: 'Payment already processed', alreadyProcessed: true });
    }

    const { userId, credits } = session.metadata;

    // Security check: Match the current logged-in user with the session metadata
    if (userId !== req.user.id) {
       return res.status(403).json({ msg: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Re-validate the first-purchase bonus at apply time. The session
    // metadata's `credits` was computed when the session was created — if
    // the user already claimed the bonus elsewhere (concurrent session,
    // earlier deploy, manual support credit, etc.) we must NOT grant it
    // again. Atomic conditional update wins exactly once.
    const baseCredits = Number(session.metadata.baseCredits || credits);
    let amountToCredit = Number(credits);
    let bonusGranted = false;
    if (session.metadata.firstPurchaseBonus === 'true') {
      const claim = await User.updateOne(
        { _id: userId, 'onboarding.bonusClaimedAt': null },
        { $set: { 'onboarding.bonusClaimedAt': new Date() } }
      );
      if (claim.modifiedCount > 0) {
        bonusGranted = true; // we won the race; full metadata credits stand
      } else {
        amountToCredit = baseCredits; // already claimed → drop the bonus
      }
    }

    user.balance += amountToCredit;
    await user.save();

    const transaction = new Transaction({
      user: userId,
      type: 'Credit Deposit',
      amount: amountToCredit,
      description: bonusGranted
        ? `Onboarding Top Up +$${baseCredits} (+$${amountToCredit - baseCredits} bonus) (Session: ${session_id})`
        : `Credit Top Up +$${amountToCredit} (Session: ${session_id})`,
      status: 'Completed'
    });
    await transaction.save();

    sendAdminNotification({
      subject: `💰 New Balance Top-Up — ${user.companyName}`,
      html: `
        <h2>New Balance Top-Up</h2>
        <p><strong>Company:</strong> ${user.companyName}</p>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Amount Added:</strong> $${amountToCredit.toFixed(2)}</p>
        <p><strong>New Balance:</strong> $${user.balance.toFixed(2)}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
        <a href="https://moveleads.cloud/admin/users">View in Admin Panel →</a>
      `
    }).catch(() => {});

    res.json({ msg: 'Payment confirmed and credits added!', balance: user.balance });
  } catch (err) {
    console.error('PAYMENT CONFIRMATION ERROR:', err);
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

async function applyOnboardingActivationCredit(paymentIntent) {
  // Returns { applied: boolean, balance: number, totalCredits: number, alreadyProcessed: boolean }.
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

  // Pre-check: same paymentIntent already credited?
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

  // Insert the transaction first — the unique index on stripePaymentIntentId
  // is the strict idempotency gate. If a concurrent request already inserted
  // a transaction for this PI, .save() throws E11000 and we bail without
  // ever incrementing the balance.
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
      // Race: another request just inserted the same PI. Treat as already-credited.
      const u = await User.findById(userId).select('balance');
      return { applied: false, alreadyProcessed: true, balance: u?.balance || 0, totalCredits };
    }
    throw err;
  }

  // Increment the balance. The transaction insert above guarantees this runs
  // exactly once per PI.
  await User.updateOne({ _id: userId }, { $inc: { balance: totalCredits } });

  // Stamp bonusClaimedAt only when bonusCredits > 0 — and only if not already
  // stamped, so a concurrent flow can't double-stamp. The condition makes the
  // update a no-op for the second writer.
  if (bonusCredits > 0) {
    await User.updateOne(
      { _id: userId, 'onboarding.bonusClaimedAt': null },
      { $set: { 'onboarding.bonusClaimedAt': new Date() } }
    );
  }

  // Stamp activatedAt for ANY successful onboarding payment ($50 or $100).
  // This is the field the ActivationBanner uses to hide itself, so $50 payers
  // also get the banner removed. Conditional update so it stamps only once.
  await User.updateOne(
    { _id: userId, 'onboarding.activatedAt': null },
    { $set: { 'onboarding.activatedAt': new Date() } }
  );

  // Activation IS the partner's first balance event. Stamp firstTopupAt so
  // the post-first-balance reassurance popup fires on the dashboard after
  // the activation success screen — same trigger field the top-up flow uses.
  // Conditional ensures it only stamps the very first time.
  await User.updateOne(
    { _id: userId, 'onboarding.firstTopupAt': null },
    { $set: { 'onboarding.firstTopupAt': new Date() } }
  );

  // Mark onboarding complete (in case user paid before clicking Confirm Setup).
  await User.updateOne(
    { _id: userId, 'onboarding.complete': { $ne: true } },
    { $set: { 'onboarding.complete': true, 'onboarding.completedAt': new Date() } }
  );

  const fresh = await User.findById(userId).select('balance companyName email');

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

  console.log(`[ApplyCredit] credited $${totalCredits} to ${userId} for PI ${paymentIntent.id}`);
  return { applied: true, alreadyProcessed: false, balance: fresh.balance || 0, totalCredits };
}

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

    const userDoc = await User.findById(req.user.id).select('onboarding');
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

  // Idempotency pre-check (transaction insert below is the database-level guard).
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

  // Snapshot whether this is the first top-up before we mutate state.
  const isFirstTopup = !user.onboarding?.firstTopupAt;

  // Insert Transaction first — unique index on stripePaymentIntentId is the
  // strict idempotency gate. E11000 race → treat as already-credited.
  try {
    await new Transaction({
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

  console.log(`[ApplyTopUp] credited $${amount} to ${userId} for PI ${paymentIntent.id}${isFirstTopup ? ' (first top-up)' : ''}`);
  return { applied: true, alreadyProcessed: false, balance: fresh.balance || 0, amount, isFirstTopup };
}

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

// @route   POST /api/billing/webhook
// @desc    Stripe Webhook Listener
// @access  Public (Stripe Signature Verification)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ── Handle payment_intent.succeeded for the activation + top-up flows ──
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

  // Handle successful payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, credits } = session.metadata;

    try {
      // Idempotency: skip if this session was already processed
      const alreadyProcessed = await Transaction.findOne({
        description: new RegExp(session.id)
      });
      if (alreadyProcessed) {
        console.log(`[Webhook] Session ${session.id} already processed — skipping`);
        return res.json({ received: true });
      }

      const user = await User.findById(userId);
      if (user) {
        // Re-validate first-purchase bonus at apply time. Two concurrent
        // sessions could both have been created with bonus baked into
        // their metadata; the conditional update on bonusClaimedAt wins
        // exactly once. Loser drops the bonus and applies only baseCredits.
        const baseCredits = Number(session.metadata.baseCredits || credits);
        let amountToCredit = Number(credits);
        let bonusGranted = false;
        if (session.metadata.firstPurchaseBonus === 'true') {
          const claim = await User.updateOne(
            { _id: userId, 'onboarding.bonusClaimedAt': null },
            { $set: { 'onboarding.bonusClaimedAt': new Date() } }
          );
          if (claim.modifiedCount > 0) {
            bonusGranted = true;
          } else {
            amountToCredit = baseCredits;
          }
        }

        user.balance += amountToCredit;
        await user.save();

        await new Transaction({
          user: userId,
          type: 'Credit Deposit',
          amount: amountToCredit,
          description: bonusGranted
            ? `Onboarding Top Up +$${baseCredits} (+$${amountToCredit - baseCredits} bonus) (Session: ${session.id})`
            : `Credit Top Up +$${amountToCredit} (Session: ${session.id})`,
          status: 'Completed'
        }).save();

        sendAdminNotification({
          subject: `💰 New Balance Top-Up — ${user.companyName}`,
          html: `
            <h2>New Balance Top-Up</h2>
            <p><strong>Company:</strong> ${user.companyName}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Amount Added:</strong> $${amountToCredit.toFixed(2)}</p>
            <p><strong>New Balance:</strong> $${user.balance.toFixed(2)}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
            <a href="https://moveleads.cloud/admin/users">View in Admin Panel →</a>
          `
        }).catch(() => {});

        console.log(`[Webhook] Added ${amountToCredit} credits to user ${userId} (bonus: ${bonusGranted})`);
      }
    } catch (dbErr) {
      console.error(`[Webhook] Database error: ${dbErr.message}`);
    }
  }

  res.json({ received: true });
});

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
