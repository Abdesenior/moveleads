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
const { sendAdminLeadNotification, sendDisputeApprovedEmail } = require('../services/emailService');
const { sendMoverLeadSMS } = require('../services/smsService');
const Transaction = require('../models/Transaction');

// ── Helpers for bulk import ───────────────────────────────────────────────────
function milesFromZips(originZip, destinationZip) {
  const o = zipcodes.lookup(String(originZip));
  const d = zipcodes.lookup(String(destinationZip));
  if (!o || !d) return 0;
  const R = 3959, dLat = (d.latitude - o.latitude) * Math.PI / 180, dLon = (d.longitude - o.longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(o.latitude * Math.PI / 180) * Math.cos(d.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function parseMoveDate(dateStr) {
  // Use noon UTC as cutoff — all dates are stored at noon UTC.
  // "today noon <= today noon" correctly rejects today; midnight UTC would let today slip through.
  const todayNoon = new Date();
  todayNoon.setUTCHours(12, 0, 0, 0);

  if (!dateStr) return null;

  if (dateStr instanceof Date) {
    dateStr.setUTCHours(12, 0, 0, 0);
    return isNaN(dateStr) || dateStr <= todayNoon ? null : dateStr;
  }

  if (typeof dateStr === 'number') {
    const d = new Date(new Date(1899, 11, 30).getTime() + dateStr * 86400000);
    d.setUTCHours(12, 0, 0, 0);
    return isNaN(d) || d <= todayNoon ? null : d;
  }

  const str = String(dateStr).trim();

  // MM/DD/YYYY or MM/DD/YY
  const slashParts = str.split('/');
  if (slashParts.length === 3) {
    let [month, day, year] = slashParts;
    if (year.length <= 2) year = `20${year.padStart(2, '0')}`; // 26 → 2026
    const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00.000Z`);
    return isNaN(d) || d <= todayNoon ? null : d;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + 'T12:00:00.000Z');
    return isNaN(d) || d <= todayNoon ? null : d;
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  d.setUTCHours(12, 0, 0, 0);
  return d <= todayNoon ? null : d;
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
router.get('/leads/import/template', (_req, res) => {
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
      const customerEmail = (row.email || '').trim();
      if (!customerEmail) throw new Error('Missing email');

      const digits = String(row.phone || '').replace(/\D/g, '');
      const customerPhone = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : digits;
      if (!customerPhone) throw new Error('Missing phone number');

      const homeSize = HOME_SIZE_NORM[(row.moveSize || '').toLowerCase().trim()] || '2 Bedroom';
      const originZip = String(row.originZip || '').trim();
      const destinationZip = String(row.destinationZip || '').trim();
      const miles = milesFromZips(originZip, destinationZip) || 0;
      const distance = miles > 100 ? 'Long Distance' : 'Local';
      const grade = miles > 500 ? 'A' : miles > 100 ? 'B' : 'C';

      console.log('[DATE DEBUG] raw:', row.moveDate, '| type:', typeof row.moveDate);
      const moveDate = parseMoveDate(row.moveDate);
      console.log('[DATE PARSED]', moveDate);

      if (!moveDate) {
        errors.push({ row: customerEmail, error: `Move date missing, invalid, or in the past (raw: ${row.moveDate})` });
        skipped++;
        continue;
      }

      const pricing = await calculateAuctionPrice({ homeSize, miles, moveDate, grade });

      const lead = new Lead({
        customerName: `${row.firstName || ''} ${row.lastName || ''}`.trim() || 'Unknown',
        customerEmail,
        customerPhone,
        originCity: row.originCity || '',
        originState: row.originState || '',
        originZip,
        destinationCity: row.destinationCity || '',
        destinationState: row.destinationState || '',
        destinationZip,
        homeSize,
        moveDate,
        distance,
        miles,
        grade,
        route: `${row.originCity || ''} → ${row.destinationCity || ''}`,
        status: 'READY_FOR_DISTRIBUTION',
        isVerified: true,
        verifiedBy: 'admin',
        source: 'bulk_import',
        buyNowPrice: pricing.buyNowPrice,
        startingBidPrice: pricing.startingBidPrice,
        currentBidPrice: pricing.startingBidPrice,
        price: pricing.buyNowPrice,
        auctionStatus: 'active',
        auctionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        statusHistory: [{ status: 'READY_FOR_DISTRIBUTION', timestamp: new Date() }],
      });

      console.log('[FINAL DATE]', lead.moveDate, '| raw input was:', row.moveDate);
      await lead.save();
      emitNewLead(lead); // socket-only — no email, no SMS

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

// ── WP10.2 — Admin-initiated refund for a PurchasedLead ─────────────────────
// POST /api/admin/refund/:purchasedLeadId
//
// Policy note (known compromise — Phase 1):
//   We mark the PurchasedLead refunded but do NOT remove the buyer from
//   `lead.buyers`. The PII-redaction work in Block B filters contact info
//   by buyers membership, so the mover retains contact-info access even
//   after a refund. This keeps MyLeads able to render the row + refund
//   badge. Phase 2 may flip this policy (remove from buyers → PII gated).
//
// Idempotency gate: unique partial index `lead_refund_idempotency` on
// Transaction { purchasedLead, type: 'Lead Refund' }. Duplicate-key
// (E11000) → 409 Already refunded.
router.post('/refund/:purchasedLeadId', [auth, admin], async (req, res) => {
  try {
    const pl = await PurchasedLead.findById(req.params.purchasedLeadId);
    if (!pl) return res.status(404).json({ msg: 'Purchase record not found' });

    if (pl.refunded === true) {
      return res.status(409).json({ msg: 'Already refunded' });
    }

    const refundAmount = Number(pl.pricePaid || 0);
    if (!refundAmount || refundAmount < 0) {
      return res.status(400).json({ msg: 'Invalid pricePaid on purchase record' });
    }

    // 1. Insert the Transaction row first — unique partial index is the
    //    strict idempotency gate. If two admins click at once, only one
    //    insert wins; the loser's E11000 maps to 409.
    let transaction;
    try {
      transaction = await new Transaction({
        user: pl.company,
        type: 'Lead Refund',
        amount: refundAmount,
        description: `Admin refund for purchased lead ${pl._id} (admin: ${req.user.id})`,
        lead: pl.lead,
        purchasedLead: pl._id,
        status: 'Completed',
      }).save();
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ msg: 'Already refunded' });
      }
      throw err;
    }

    // 2. Atomic balance bump + flag flip on the PurchasedLead.
    //    The Transaction insert above already guaranteed single-execution;
    //    these two updates are now safe to run unconditionally.
    const userAfter = await User.findByIdAndUpdate(
      pl.company,
      { $inc: { balance: refundAmount } },
      { new: true }
    ).select('balance email companyName');

    await PurchasedLead.updateOne(
      { _id: pl._id },
      { $set: { refunded: true, refundedAt: new Date(), refundedBy: req.user.id } }
    );

    console.log(`[Admin Refund] purchasedLead=${pl._id} amount=$${refundAmount} → user ${pl.company} balance=$${userAfter?.balance?.toFixed?.(2)}`);

    // 3. Best-effort mover notification — reuse the dispute-approved email
    //    template (generic "credit applied" copy fits both flows).
    if (userAfter?.email) {
      const lead = await Lead.findById(pl.lead).select('route originCity destinationCity').lean();
      const route = lead?.route || (lead ? `${lead.originCity} → ${lead.destinationCity}` : 'your move');
      sendDisputeApprovedEmail({
        toEmail: userAfter.email,
        companyName: userAfter.companyName,
        refundAmount,
        leadRoute: route,
      }).catch((err) => {
        console.error('[Admin Refund Email Error]', err.message);
      });
    }

    return res.json({
      ok: true,
      balanceAfter: userAfter?.balance || 0,
      transactionId: transaction._id,
    });
  } catch (err) {
    console.error('[Admin Refund] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
