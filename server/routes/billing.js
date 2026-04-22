const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const stripeInit = () => require('stripe')(process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.trim() : '');
const stripe = stripeInit();

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
  const { amount } = req.body;
  if (![10, 50, 100, 200, 500].includes(amount)) {
    return res.status(400).json({ msg: 'Invalid amount selected' });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not defined in server environment');
    }
    const stripe = stripeInit();
    console.log('Creating Stripe Session for user:', req.user.id, 'Amount:', amount);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${amount} Credits`,
            description: `Purchase ${amount} credits for the MoveLeads platform`,
          },
          unit_amount: amount * 100, // Stripe uses cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}&amount=${amount}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/billing?canceled=true`,
      metadata: {
        userId: req.user.id.toString(),
        credits: amount.toString()
      }
    });

    res.json({ url: session.url });
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

    user.balance += Number(credits);
    await user.save();

    const transaction = new Transaction({
      user: userId,
      type: 'Credit Deposit',
      amount: Number(credits),
      description: `Credit Top Up +$${credits} (Session: ${session_id})`,
      status: 'Completed'
    });
    await transaction.save();

    res.json({ msg: 'Payment confirmed and credits added!', balance: user.balance });
  } catch (err) {
    console.error('PAYMENT CONFIRMATION ERROR:', err);
    res.status(500).send('Server Error');
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
        user.balance += Number(credits);
        await user.save();

        await new Transaction({
          user: userId,
          type: 'Credit Deposit',
          amount: Number(credits),
          description: `Credit Top Up +$${credits} (Session: ${session.id})`,
          status: 'Completed'
        }).save();

        console.log(`[Webhook] Added ${credits} credits to user ${userId}`);
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
