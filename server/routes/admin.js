const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { auth, admin, superAdmin } = require('../middleware/auth');
const PurchasedLead = require('../models/PurchasedLead');
const User = require('../models/User');
const Lead = require('../models/Lead');
const CoverageArea = require('../models/CoverageArea');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// @route   POST /api/admin/impersonate/:id
// @desc    Super Admin: Impersonate a user (generate delegated JWT)
// @access  Private (Super Admin)
router.post('/impersonate/:id', [auth, superAdmin], async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ msg: 'Target user not found' });

    // Payload for the target user
    const payload = {
      user: {
        id: targetUser.id,
        role: targetUser.role
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' }, // Standard session duration
      (err, token) => {
        if (err) throw err;
        res.json({ 
          token, 
          user: {
            _id: targetUser.id,
            companyName: targetUser.companyName,
            email: targetUser.email,
            role: targetUser.role
          }
        });
      }
    );
  } catch (err) {
    console.error('IMPERSONATION ERROR:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/admin/stats
// @desc    Get aggregated platform statistics for admin dashboard
// @access  Private (Admin)
router.get('/stats', [auth, admin], async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const now = new Date();

    // 1. Today's Revenue (Aggregated from lead purchases)
    const revenueData = await PurchasedLead.aggregate([
      { $match: { purchasedAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$pricePaid' } } }
    ]);
    const todayRevenue = revenueData[0]?.total || 0;

    // 2. Total Active Movers (Mover accounts with balance > 0)
    const activeMovers = await User.countDocuments({ role: 'customer', balance: { $gt: 0 } });

    // 3. Lead Volume (Ingested today vs. Sold today)
    const leadsIngestedToday = await Lead.countDocuments({ createdAt: { $gte: today } });
    const leadsSoldTodayCount = await PurchasedLead.countDocuments({ purchasedAt: { $gte: today } });

    // 4. Stripe Balance (Real balance from Stripe Connect/Platform account)
    let availableBalance = 0;
    try {
      if (process.env.STRIPE_SECRET_KEY) {
        const balance = await stripe.balance.retrieve();
        // Summing all available currency balances (usually just USD)
        availableBalance = balance.available.reduce((acc, b) => acc + b.amount, 0) / 100;
      }
    } catch (err) {
      console.warn('[Admin Stats] Failed to fetch Stripe balance:', err.message);
      // Fallback to 0 if stripe fails or keys missing
    }

    res.json({
      todayRevenue,
      activeMovers,
      leadVolume: {
        ingested: leadsIngestedToday,
        sold: leadsSoldTodayCount
      },
      stripeBalance: availableBalance,
      lastUpdated: now
    });
  } catch (err) {
    console.error('ADMIN STATS ERROR:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/admin/coverage
// @desc    Admin: Create a coverage area for a mover company
// @access  Private (Admin)
router.post('/coverage', [auth, admin], async (req, res) => {
  const { userId, zipCode, type = 'both', radius = 0 } = req.body;
  if (!userId || !zipCode) {
    return res.status(400).json({ msg: 'userId and zipCode are required' });
  }
  try {
    const area = new CoverageArea({ company: userId, zipCode, type, radius });
    await area.save();
    res.status(201).json(area);
  } catch (err) {
    console.error('COVERAGE CREATE ERROR:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/admin/coverage/:id
// @desc    Admin: Delete a coverage area
// @access  Private (Admin)
router.delete('/coverage/:id', [auth, admin], async (req, res) => {
  try {
    await CoverageArea.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Coverage area deleted' });
  } catch (err) {
    console.error('COVERAGE DELETE ERROR:', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
