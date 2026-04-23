const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { auth, admin, superAdmin } = require('../middleware/auth');
const PurchasedLead = require('../models/PurchasedLead');
const User = require('../models/User');
const Lead = require('../models/Lead');
const CoverageArea = require('../models/CoverageArea');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const zipcodes = require('zipcodes');
const { calculateAuctionPrice } = require('../utils/pricingEngine');
const { calculateLeadScore } = require('../services/scoringService');
const { emitNewLead } = require('../services/socketService');
const { sendAdminLeadNotification } = require('../services/emailService');
const { sendMoverLeadSMS } = require('../services/smsService');

// ── Helpers for bulk import ───────────────────────────────────────────────────
function milesFromZips(originZip, destinationZip) {
  const o = zipcodes.lookup(String(originZip));
  const d = zipcodes.lookup(String(destinationZip));
  if (!o || !d) return 0;
  const R = 3959, dLat = (d.latitude - o.latitude) * Math.PI / 180, dLon = (d.longitude - o.longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(o.latitude * Math.PI / 180) * Math.cos(d.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const HOME_SIZE_NORM = {
  'studio': 'Studio',
  '1 bedroom': '1 Bedroom', '1bedroom': '1 Bedroom', '1_bedroom': '1 Bedroom',
  '2 bedroom': '2 Bedroom', '2bedroom': '2 Bedroom', '2_bedroom': '2 Bedroom',
  '3 bedroom': '3 Bedroom', '3bedroom': '3 Bedroom', '3_bedroom': '3 Bedroom',
  '4 bedroom': '4 Bedroom', '4bedroom': '4 Bedroom', '4_bedroom': '4 Bedroom',
  '5 bedroom': '5+ Bedroom', '5bedroom': '5+ Bedroom', '5_bedroom': '5+ Bedroom',
  '5+ bedroom': '5+ Bedroom', '5+bedroom': '5+ Bedroom',
  '4+ bedroom': '4+ Bedroom', '4+bedroom': '4+ Bedroom', '4+_bedroom': '4+ Bedroom',
};

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
    res.status(500).json({ msg: 'Server error' });
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
    res.status(500).json({ msg: 'Server error' });
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
    res.status(500).json({ msg: 'Server error' });
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
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/admin/users/:id/balance
// @desc    Admin: Add or deduct balance for any user
// @access  Private (Admin)
router.post('/users/:id/balance', [auth, admin], async (req, res) => {
  const { amount, note } = req.body;
  const parsed = parseFloat(amount);

  if (!Number.isFinite(parsed) || parsed === 0) {
    return res.status(400).json({ msg: 'amount must be a non-zero number' });
  }

  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $inc: { balance: parsed } },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ msg: 'User not found' });

    console.log(`[Admin] Balance adjusted for ${user.email}: ${parsed >= 0 ? '+' : ''}${parsed} → new balance $${user.balance.toFixed(2)}${note ? ` (${note})` : ''}`);
    res.json({ success: true, newBalance: user.balance });
  } catch (err) {
    console.error('[Admin] Balance adjust error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   GET /api/admin/leads/import/template
// @desc    Download a CSV template for bulk lead import
// @access  Private (Admin)
router.get('/leads/import/template', [auth, admin], (_req, res) => {
  const headers = [
    'first name', 'last name', 'email', 'phone',
    'origin city', 'origin state', 'origin zip',
    'destination city', 'destination state', 'destination zip',
    'move type', 'move size', 'move date',
  ].join(',');
  const example = [
    'John', 'Smith', 'john@gmail.com', '2125559980',
    'Dallas', 'TX', '75201',
    'Los Angeles', 'CA', '90210',
    'Long Distance', '2 Bedroom', '2026-06-15',
  ].join(',');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=moveleads-template.csv');
  res.send(`${headers}\n${example}`);
});

// @route   POST /api/admin/leads/import
// @desc    Bulk import leads from parsed CSV/Excel rows
// @access  Private (Admin)
router.post('/leads/import', [auth, admin], async (req, res) => {
  const { leads: rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ msg: 'No leads provided' });
  }

  let imported = 0, skipped = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const homeSize = HOME_SIZE_NORM[(row.moveSize || '').toLowerCase().trim()] || row.moveSize || '2 Bedroom';
      const originZip = String(row.originZip || '').replace(/\D/g, '').slice(0, 5);
      const destinationZip = String(row.destinationZip || '').replace(/\D/g, '').slice(0, 5);
      const miles = milesFromZips(originZip, destinationZip);
      const distance = miles > 100 ? 'Long Distance' : 'Local';

      const THIRTY_DAYS = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      let moveDate = (row.moveDate && !isNaN(new Date(row.moveDate)))
        ? new Date(row.moveDate)
        : THIRTY_DAYS;
      // Past dates are invisible to movers (feed filters moveDate >= now) — push forward
      if (moveDate < new Date()) moveDate = THIRTY_DAYS;

      // Normalize phone to E.164
      const digits = String(row.phone || '').replace(/\D/g, '');
      const customerPhone = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : digits;
      if (!customerPhone) throw new Error('Missing phone number');

      const customerEmail = (row.email || '').trim();
      if (!customerEmail) throw new Error('Missing email');

      const scoring = calculateLeadScore({ homeSize, miles, moveDate }, miles, 'mobile', moveDate);
      const pricing = await calculateAuctionPrice({ homeSize, miles, moveDate, grade: scoring.grade });

      const lead = new Lead({
        customerName: `${row.firstName || ''} ${row.lastName || ''}`.trim() || 'Unknown',
        customerEmail,
        customerPhone,
        originCity: row.originCity || '',
        originZip,
        destinationCity: row.destinationCity || '',
        destinationZip,
        homeSize,
        moveDate,
        distance,
        miles,
        route: `${row.originCity || ''} → ${row.destinationCity || ''}`,
        status: 'READY_FOR_DISTRIBUTION',
        isVerified: true,
        grade: scoring.grade,
        score: scoring.score,
        scoreFactors: scoring.scoreFactors,
        buyNowPrice: pricing.buyNowPrice,
        startingBidPrice: pricing.startingBidPrice,
        currentBidPrice: pricing.startingBidPrice,
        price: pricing.buyNowPrice,
        auctionStatus: 'active',
        auctionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        statusHistory: [{ status: 'READY_FOR_DISTRIBUTION', timestamp: new Date() }],
      });

      await lead.save();
      emitNewLead(lead); // socket-only — no email/SMS spam for bulk imports

      imported++;
    } catch (err) {
      console.error(`[Import] Row error (${row.email || 'unknown'}):`, err.message);
      errors.push({ row: row.email || 'unknown', error: err.message });
      skipped++;
    }
  }

  console.log(`[Import] Done — imported: ${imported}, skipped: ${skipped}`);
  res.json({ success: true, imported, skipped, errors });
});

module.exports = router;
