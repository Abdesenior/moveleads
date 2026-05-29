const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
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
const { instantDispatchEnabled } = require('../utils/instantDispatch');
const Transaction = require('../models/Transaction');
const { logAdminAction } = require('../utils/auditLog');
const ScoringSnapshot = require('../models/ScoringSnapshot');
const ValidationLog = require('../models/ValidationLog');
const scoringPipeline = require('../services/scoringPipeline');
const { computeDistributionStatus, computeDistributionLabel } = require('../utils/distributionStatus');
const { isHiddenFromMovers, hiddenReason, routingMode } = require('../utils/leadVisibility');
const {
  deriveSystemDecision,
  describeSystemDecisionSource,
  isDistributable,
} = require('../utils/distributionDecision');

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
    const activeMovers = await User.countDocuments({ role: { $in: User.MOVER_ROLES }, balance: { $gt: 0 } });

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
    // Capture before-balance for audit log (single read; the $inc below is atomic).
    const before = await User.findById(req.params.id).select('balance').lean();

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $inc: { balance: parsed } },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ msg: 'User not found' });

    console.log(`[Admin] Balance adjusted for ${user.email}: ${parsed >= 0 ? '+' : ''}${parsed} → new balance $${user.balance.toFixed(2)}${note ? ` (${note})` : ''}`);

    // 2026-05-29 — write a Transaction ledger row alongside the balance
    // mutation so every adjustment is reconcilable. Before this, the
    // admin balance route was the ONLY balance-write path in the system
    // without a corresponding Transaction row — every adjustment created
    // drift between sum(Transaction.amount) and User.balance. Closes
    // HIGH-CONFIDENCE-FIX-PLAN F1 (3-agent audit convergence).
    //
    // The 'Admin Adjustment' Transaction.type was added to the model
    // enum in this same PR. Description captures who ran the adjustment
    // and the operator-supplied note for full audit trail. amount is
    // signed (negative for debits, positive for credits) matching the
    // existing Stripe Refund/Chargeback conventions.
    //
    // Non-fatal: if the Transaction.create fails (e.g., transient DB
    // hiccup) the balance write already committed and logAdminAction
    // captured the intent. Logging the failure lets the operator
    // reconcile manually if the rare case ever fires.
    try {
      await Transaction.create({
        user: user._id,
        type: 'Admin Adjustment',
        amount: parsed,
        description: `Admin balance adjustment by ${req.user.id}${note ? ` — ${note}` : ''}`,
        status: 'Completed',
      });
    } catch (txnErr) {
      console.error(`[Admin] Balance adjust — Transaction write failed (non-fatal): ${txnErr.message}`);
    }

    logAdminAction({
      actor: req.user.id,
      action: 'balance.adjust',
      targetType: 'user',
      targetId: user._id,
      before: { balance: before?.balance ?? null },
      after: { balance: user.balance },
      metadata: { delta: parsed, note: note || null },
    });

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
        // Phase B — instant leads skip auctionEndsAt; see leadIngest.js.
        ...(instantDispatchEnabled() ? {} : { auctionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }),
        distributionModel: instantDispatchEnabled() ? 'instant' : 'auction',
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

    logAdminAction({
      actor: req.user.id,
      action: 'refund.issue',
      targetType: 'purchasedLead',
      targetId: pl._id,
      before: { refunded: false },
      after: { refunded: true, refundAmount },
      metadata: { lead: pl.lead, company: pl.company, transactionId: transaction._id },
    });

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

// ── V5 Lead Quality (Phase 1) — read-only scoring snapshot endpoint ───────
// Returns the latest shadow-mode ScoringSnapshot for a Lead alongside the
// legacy score/grade so admin can compare side-by-side. No-op if scoring has
// not yet run for this lead (returns snapshot: null).
router.get('/leads/:id/scoring-snapshot', [auth, admin], async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ msg: 'Invalid lead id' });
    }

    // Phase 4 — include full validation context so the admin modal can
    // surface distribution-readiness, cap reasons, and recent validation
    // logs without separate round-trips.
    const lead = await Lead.findById(req.params.id)
      .select('score grade scoreFactors customerName customerPhone customerEmail route homeSize moveDate miles status validation intentConfirmed urgencyBucket heavyItems funnelVersion adminTierOverride reviewedAt reviewedBy reviewNotes buyNowPrice priceShadowV2 pricingBreakdownShadowV2 priceShadowSimple pricingBreakdownSimple pricingEngineVersion distributionDecision distributionDecisionBy distributionDecisionAt distributionDecisionReason inventoryChannel')
      .lean();
    if (!lead) return res.status(404).json({ msg: 'Lead not found' });
    const decisionByUser = await resolveDecisionByUser(lead.distributionDecisionBy);

    const snapshot = await ScoringSnapshot.findOne({ leadId: lead._id })
      .sort({ createdAt: -1 })
      .lean();

    // Pull last 25 validation logs across all types (phone / route / fingerprint)
    const validationLogs = await ValidationLog.find({ leadId: lead._id })
      .sort({ checkedAt: -1 })
      .limit(25)
      .lean();

    const distribution = computeDistributionStatus(lead, snapshot);
    // Phase 6.1 — display-only mover-operations triplet:
    //   lifecycleStatus   = the legacy Lead.status
    //   qualityStatus     = the quality-engine output (Ready/Review Required/Blocked/Rejected)
    //   distributionLabel = mover-visibility outcome (Visible/Hidden/Manual Review/Blocked)
    const hidden = isHiddenFromMovers(lead);
    const statusTriplet = {
      lifecycle:    lead.status || null,
      quality:      distribution.status || null,
      distribution: computeDistributionLabel(lead, distribution, { isHidden: hidden }),
      routingMode:  routingMode(),
      isHidden:     hidden,
    };

    return res.json({
      ok: true,
      mode: scoringPipeline.currentMode(),
      statusTriplet,
      lead: {
        _id: lead._id,
        route: lead.route,
        homeSize: lead.homeSize,
        moveDate: lead.moveDate,
        miles: lead.miles,
        status: lead.status,
        customerName: lead.customerName,
        customerPhone: lead.customerPhone,
        customerEmail: lead.customerEmail,
        intentConfirmed: lead.intentConfirmed,
        urgencyBucket: lead.urgencyBucket,
        heavyItems: lead.heavyItems,
        funnelVersion: lead.funnelVersion,
        adminTierOverride: lead.adminTierOverride || null,
        reviewedAt: lead.reviewedAt || null,
        reviewedBy: lead.reviewedBy || null,
        reviewNotes: lead.reviewNotes || null,
        // Phase 3 cleanup — distributionDecision is the authoritative quality
        // field. UI consumes these directly for the Distribution Decision
        // badge + the lifecycle-warning banner.
        inventoryChannel:           lead.inventoryChannel || 'main',
        distributionDecision:       lead.distributionDecision || null,
        distributionDecisionBy:     lead.distributionDecisionBy || null,
        distributionDecisionByEmail: decisionByUser ? decisionByUser.email : null,
        distributionDecisionByName:  decisionByUser
          ? [decisionByUser.firstName, decisionByUser.lastName].filter(Boolean).join(' ') || null
          : null,
        distributionDecisionAt:     lead.distributionDecisionAt || null,
        distributionDecisionReason: lead.distributionDecisionReason || null,
        legacy: {
          score: lead.score,
          grade: lead.grade,
          scoreFactors: lead.scoreFactors,
          buyNowPrice: lead.buyNowPrice ?? null,
        },
        // Phase 3 marketplace pricing V2 — shadow only. Surfaced for the admin
        // modal's legacy-vs-V2 panel; not used for charging or refunds.
        pricingV2: {
          priceShadowV2: lead.priceShadowV2 ?? null,
          breakdown: lead.pricingBreakdownShadowV2 || [],
        },
        // Simplified additive USD engine (Phase 1+/3 cutover). Surfaced for
        // the admin modal's Price Breakdown card so operators can verify
        // post-cutover that:
        //   • engineVersion === 'simple' leads have buyNowPrice === priceShadowSimple
        //   • engineVersion === 'legacy' / null leads stay on their original price
        //   • the breakdown lines match what the operator configured in /admin/pricing
        // Read-only — never reads back into any money path.
        pricingSimple: {
          engineVersion:     lead.pricingEngineVersion || null,
          priceShadowSimple: lead.priceShadowSimple ?? null,
          breakdown:         lead.pricingBreakdownSimple || [],
        },
        validation: lead.validation || null,
      },
      snapshot,
      distribution,
      validationLogs,
    });
  } catch (err) {
    console.error('[Admin ScoringSnapshot] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// ── Phase 4 — admin quality review actions ──────────────────────────────
// All actions: admin-only, audit-logged via logAdminAction, return the
// updated lead + fresh distribution status. Each action takes an optional
// { reason: string, note: string } body for the audit trail.
//
// PRODUCTION SAFETY: none of these change mover-facing behavior unless
// ENABLE_TIERED_ROUTING is flipped on. The actions write to:
//   - lead.adminTierOverride.* (additive, scoring engine consumes safely)
//   - lead.status (only for reject → REJECTED_FAKE)
//   - lead.reviewedAt / reviewedBy / reviewNotes (additive)
// Movers still see what they saw before until tier filtering is enabled.

const TIER_VALUES = ['hot', 'premium', 'standard', 'review', 'rejected'];

// Resolve a distributionDecisionBy value (userId | 'system' | 'migration') to
// a populated { _id, firstName, lastName, email } record when applicable.
// Returns null for non-user actors and on lookup failure (fail-open — the
// badge falls back to the raw string).
async function resolveDecisionByUser(decisionBy) {
  if (!decisionBy || decisionBy === 'system' || decisionBy === 'migration') return null;
  if (!mongoose.isValidObjectId(decisionBy)) return null;
  try {
    return await User.findById(decisionBy).select('firstName lastName email').lean();
  } catch (_e) {
    return null;
  }
}

async function loadLeadOr404(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ msg: 'Invalid lead id' });
    return null;
  }
  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    res.status(404).json({ msg: 'Lead not found' });
    return null;
  }
  return lead;
}

// Returns the full snapshot payload (same shape as GET scoring-snapshot)
// so the client can replace its local state in one round-trip after an action.
async function buildSnapshotPayload(leadId) {
  const lead = await Lead.findById(leadId).lean();
  if (!lead) return null;
  const snapshot = await ScoringSnapshot.findOne({ leadId: lead._id })
    .sort({ createdAt: -1 }).lean();
  const validationLogs = await ValidationLog.find({ leadId: lead._id })
    .sort({ checkedAt: -1 }).limit(25).lean();
  const distribution = computeDistributionStatus(lead, snapshot);
  const hidden = isHiddenFromMovers(lead);
  const statusTriplet = {
    lifecycle:    lead.status || null,
    quality:      distribution.status || null,
    distribution: computeDistributionLabel(lead, distribution, { isHidden: hidden }),
    routingMode:  routingMode(),
    isHidden:     hidden,
  };
  // Phase 3 cleanup — augment lead with resolved decision actor so the UI
  // can render the byEmail/byName without a second round-trip.
  const decisionByUser = await resolveDecisionByUser(lead.distributionDecisionBy);
  lead.distributionDecisionByEmail = decisionByUser ? decisionByUser.email : null;
  lead.distributionDecisionByName  = decisionByUser
    ? [decisionByUser.firstName, decisionByUser.lastName].filter(Boolean).join(' ') || null
    : null;
  return { lead, snapshot, distribution, validationLogs, statusTriplet };
}

// GET /api/admin/leads/:id/validation-logs — paginated validation logs
router.get('/leads/:id/validation-logs', [auth, admin], async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ msg: 'Invalid lead id' });
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const logs = await ValidationLog.find({ leadId: req.params.id })
    .sort({ checkedAt: -1 }).limit(limit).lean();
  res.json({ ok: true, logs });
});

// POST /api/admin/leads/:id/approve
// Approves a lead for the marketplace — sets adminTierOverride to 'standard'
// (or the requested tier if explicitly provided AND within ['standard',
// 'premium','hot']). Cannot approve-to-rejected/review through this endpoint.
router.post('/leads/:id/approve', [auth, admin], async (req, res) => {
  try {
    const lead = await loadLeadOr404(req, res);
    if (!lead) return;
    const requestedTier = req.body?.tier && ['standard','premium','hot'].includes(req.body.tier)
      ? req.body.tier : 'standard';
    const before = { adminTierOverride: lead.adminTierOverride || null, qualityGateCleared: lead.qualityGateCleared, status: lead.status };
    lead.adminTierOverride = {
      tier: requestedTier,
      reason: req.body?.reason || 'admin approved for distribution',
      by: req.user.id,
      at: new Date(),
    };
    // Phase 6.3 — admin approval clears the quality gate. Without this, a V5
    // lead that was rejected by scoring (qualityGateCleared=false) would stay
    // hidden from movers even after admin manually approves the override.
    lead.qualityGateCleared = true;
    // Approve also upgrades the lifecycle status to READY_FOR_DISTRIBUTION
    // when the lead is parked at a non-publishable interim status that
    // admin explicitly judged safe by approving.
    //
    // Safe to upgrade (admin is taking responsibility):
    //   - PENDING_MANUAL_REVIEW : Phase 6.8 status-gate held it for review
    //   - Pending Verification  : verifyLeadPhone never completed; admin
    //                             confirmed the lead is real
    //
    // Deliberately NOT auto-upgraded — they require a separate explicit
    // admin action ("Reactivate" / "Restore"):
    //   - Expired       : the move date has passed; reviving without
    //                     extending the date would put a stale lead on the feed
    //   - REJECTED_FAKE : admin previously rejected this; clearing the
    //                     decision should be deliberate, not a side-effect
    //   - Purchased     : already sold; can't re-publish
    //
    // {Available, READY_FOR_DISTRIBUTION} stay as-is (no upgrade needed).
    const UPGRADABLE_STATUSES = new Set(['PENDING_MANUAL_REVIEW', 'Pending Verification']);
    if (UPGRADABLE_STATUSES.has(lead.status)) {
      lead.status = 'READY_FOR_DISTRIBUTION';
      lead.statusHistory = lead.statusHistory || [];
      lead.statusHistory.push({ status: 'READY_FOR_DISTRIBUTION', timestamp: new Date() });
    }
    // Phase 1 — unified distribution decision. Admin approval is sticky
    // and authoritative: this write supersedes any system_* value. The
    // scoringPipeline and verifyLeadPhone writers guard against clobbering
    // admin_* values, so a later rescore cannot silently undo this.
    lead.distributionDecision       = 'admin_approved';
    lead.distributionDecisionBy     = String(req.user.id);
    lead.distributionDecisionAt     = new Date();
    lead.distributionDecisionReason = req.body?.reason || 'admin approved for distribution';
    await lead.save();
    logAdminAction({
      actor: req.user.id, action: 'lead.approve',
      targetType: 'lead', targetId: lead._id,
      before, after: { adminTierOverride: lead.adminTierOverride, distributionDecision: lead.distributionDecision },
      metadata: { reason: req.body?.reason, note: req.body?.note, requestedTier },
    });

    // 2026-05-28 — fire the canonical post-approval dispatch orchestrator.
    // Prior to this fix, the admin approve action wrote the right DB state
    // (distributionDecision='admin_approved' + status upgrade + qualityGate
    // clear) but skipped the SMS / email / socket fan-out, producing
    // silent-approved inventory: movers saw the lead only on next refresh,
    // no SMS Claim, no claimWindow, no realtime push. The orchestrator is
    // the same helper verifyLeadPhone now uses, so auto-approval and admin
    // approval converge on identical channels + idempotency semantics.
    //
    // Fire-and-forget: the HTTP response returns immediately so the admin
    // UI is not gated on Twilio/SendGrid/socket latency. The orchestrator
    // is internally fire-and-forget per channel too, so failures on one
    // channel do not cascade.
    const { dispatchApprovedLead } = require('../services/dispatchOrchestrator');
    dispatchApprovedLead(lead._id, { source: 'admin.approve' }).catch(err =>
      console.error(`[admin.approve] dispatch error for ${lead._id}: ${err.message}`)
    );

    const payload = await buildSnapshotPayload(lead._id);
    res.json({ ok: true, action: 'approve', ...payload });
  } catch (err) {
    console.error('[Admin lead.approve] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/admin/leads/:id/reject
// Marks the lead as REJECTED_FAKE. Sets adminTierOverride.tier='rejected'
// so the scoring engine consumers see the admin intent immediately.
router.post('/leads/:id/reject', [auth, admin], async (req, res) => {
  try {
    const lead = await loadLeadOr404(req, res);
    if (!lead) return;
    const before = { status: lead.status, adminTierOverride: lead.adminTierOverride || null };
    lead.status = 'REJECTED_FAKE';
    lead.statusHistory = lead.statusHistory || [];
    lead.statusHistory.push({ status: 'REJECTED_FAKE', timestamp: new Date() });
    lead.adminTierOverride = {
      tier: 'rejected',
      reason: req.body?.reason || 'admin rejected (fake)',
      by: req.user.id,
      at: new Date(),
    };
    // Phase 6.3 — explicit gate=false matches the rejected intent (belt-and-
    // suspenders alongside status=REJECTED_FAKE + adminTierOverride.tier=rejected).
    lead.qualityGateCleared = false;
    // Phase 1 — unified distribution decision. Admin rejection is sticky.
    lead.distributionDecision       = 'admin_rejected';
    lead.distributionDecisionBy     = String(req.user.id);
    lead.distributionDecisionAt     = new Date();
    lead.distributionDecisionReason = req.body?.reason || 'admin marked as fake/rejected';
    await lead.save();
    logAdminAction({
      actor: req.user.id, action: 'lead.reject',
      targetType: 'lead', targetId: lead._id,
      before, after: { status: lead.status, adminTierOverride: lead.adminTierOverride, distributionDecision: lead.distributionDecision },
      metadata: { reason: req.body?.reason, note: req.body?.note },
    });
    const payload = await buildSnapshotPayload(lead._id);
    res.json({ ok: true, action: 'reject', ...payload });
  } catch (err) {
    console.error('[Admin lead.reject] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/admin/leads/:id/rescore
// Triggers scoringPipeline.runShadow synchronously and returns the new payload.
// Useful after admin manually tweaks adminTierOverride or after fixing data.
router.post('/leads/:id/rescore', [auth, admin], async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ msg: 'Invalid lead id' });
    }
    const result = await scoringPipeline.runShadow(req.params.id);
    logAdminAction({
      actor: req.user.id, action: 'lead.rescore',
      targetType: 'lead', targetId: req.params.id,
      before: null, after: { snapshotId: result && result._id ? String(result._id) : null },
      metadata: { reason: req.body?.reason || 'admin manual rescore' },
    });

    // 2026-05-29 — fire the canonical post-approval dispatch orchestrator.
    //
    // scoringPipeline.runShadow may flip the lead's distributionDecision
    // (e.g., system_held → system_approved if validation evidence has
    // since improved, or system_pending → system_approved on a late re-
    // evaluation). Before this fix, that transition was silent: the lead
    // became distributable but no SMS / email / socket broadcast fired,
    // producing the same class of "silent approved inventory" bug PR #52
    // fixed for admin.approve.
    //
    // dispatchApprovedLead handles both the "no transition" case (the
    // internal isHiddenFromMoversById fresh-read check returns hidden:true
    // for non-distributable decisions and the orchestrator no-ops with a
    // log line) and the "already broadcast" case (per-channel notifiedAt
    // CAS short-circuits broadcasters). So calling it unconditionally
    // here is safe and idempotent.
    //
    // Fire-and-forget — the HTTP response returns immediately so the admin
    // UI is not gated on Twilio/SendGrid/socket latency. Same posture as
    // PR #52 wired for admin.approve.
    const { dispatchApprovedLead } = require('../services/dispatchOrchestrator');
    dispatchApprovedLead(req.params.id, { source: 'admin.rescore' }).catch(err =>
      console.error(`[admin.rescore] dispatch error for ${req.params.id}: ${err.message}`)
    );

    const payload = await buildSnapshotPayload(req.params.id);
    res.json({ ok: true, action: 'rescore', ...payload });
  } catch (err) {
    console.error('[Admin lead.rescore] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/admin/leads/:id/tier-override
// Body: { tier: 'hot'|'premium'|'standard'|'review'|'rejected', reason: string }
router.post('/leads/:id/tier-override', [auth, admin], async (req, res) => {
  try {
    const lead = await loadLeadOr404(req, res);
    if (!lead) return;
    const requestedTier = req.body?.tier;
    if (!TIER_VALUES.includes(requestedTier)) {
      return res.status(400).json({ msg: `tier must be one of: ${TIER_VALUES.join(', ')}` });
    }
    if (!req.body?.reason || String(req.body.reason).trim().length < 3) {
      return res.status(400).json({ msg: 'reason is required (min 3 chars)' });
    }
    const before = { adminTierOverride: lead.adminTierOverride || null, qualityGateCleared: lead.qualityGateCleared, status: lead.status };
    lead.adminTierOverride = {
      tier: requestedTier,
      reason: String(req.body.reason).slice(0, 500),
      by: req.user.id,
      at: new Date(),
    };
    // Phase 6.3 — sync the quality gate with the override decision so a
    // mover-visibility check at request time agrees with the override.
    // 'rejected' override → stays hidden (gate false); anything else →
    // admin has explicitly approved → gate cleared (true).
    lead.qualityGateCleared = requestedTier !== 'rejected';
    // Phase 6.8 — same status-upgrade logic as the approve action: if the
    // lead was held at PENDING_MANUAL_REVIEW by the status-gate fix and
    // admin is overriding to a non-rejected tier, upgrade status so the
    // status filter passes the lead.
    if (requestedTier !== 'rejected' && lead.status === 'PENDING_MANUAL_REVIEW') {
      lead.status = 'READY_FOR_DISTRIBUTION';
      lead.statusHistory = lead.statusHistory || [];
      lead.statusHistory.push({ status: 'READY_FOR_DISTRIBUTION', timestamp: new Date() });
    }
    await lead.save();
    logAdminAction({
      actor: req.user.id, action: 'lead.tier_override.set',
      targetType: 'lead', targetId: lead._id,
      before, after: { adminTierOverride: lead.adminTierOverride },
      metadata: { tier: requestedTier, reason: req.body.reason, note: req.body?.note },
    });
    const payload = await buildSnapshotPayload(lead._id);
    res.json({ ok: true, action: 'tier-override', ...payload });
  } catch (err) {
    console.error('[Admin lead.tier-override.set] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/admin/leads/:id/tier-override — clears the override
router.delete('/leads/:id/tier-override', [auth, admin], async (req, res) => {
  try {
    const lead = await loadLeadOr404(req, res);
    if (!lead) return;
    const before = { adminTierOverride: lead.adminTierOverride || null, qualityGateCleared: lead.qualityGateCleared };
    lead.adminTierOverride = undefined;
    lead.markModified('adminTierOverride');
    // Phase 6.3 — clearing an override reverts the lead to its natural
    // scoring tier. Re-sync the quality gate to the latest snapshot tier so
    // visibility agrees with the engine's last verdict. If no snapshot
    // exists yet, leave the gate as-is (defensive).
    try {
      const latestSnap = await ScoringSnapshot.findOne({ leadId: lead._id })
        .sort({ createdAt: -1 }).select('tier').lean();
      if (latestSnap && latestSnap.tier) {
        lead.qualityGateCleared = latestSnap.tier !== 'rejected';
      }
    } catch (e) {
      console.warn('[Admin lead.tier-override.clear] snapshot lookup failed:', e.message);
    }
    // Phase 1 — clearing an override is a symmetric undo: revert the
    // distributionDecision to the system verdict derived from current
    // evidence. Cleanly resolves the prior asymmetry where clear-override
    // would leave a status upgrade in place and create contradictory state.
    const systemDecision = deriveSystemDecision(lead);
    lead.distributionDecision       = systemDecision;
    lead.distributionDecisionBy     = 'system';
    lead.distributionDecisionAt     = new Date();
    lead.distributionDecisionReason = `cleared admin override → ${describeSystemDecisionSource(lead)}`;
    await lead.save();
    logAdminAction({
      actor: req.user.id, action: 'lead.tier_override.clear',
      targetType: 'lead', targetId: lead._id,
      before, after: { adminTierOverride: null, distributionDecision: lead.distributionDecision },
      metadata: { reason: req.body?.reason || 'admin cleared override' },
    });

    // 2026-05-29 — fire the canonical post-approval dispatch orchestrator.
    //
    // Clearing an admin tier-override re-derives distributionDecision via
    // deriveSystemDecision (line 910). If the prior state was admin_rejected
    // (or admin_approved that turns out to be system_held on re-derivation)
    // and the new derived decision is system_approved, the lead becomes
    // distributable — but no SMS / email / socket broadcast fires. Same
    // class as the bugs PR #52 (admin.approve) and PR #54 (admin.rescore)
    // closed. Identified during the launch-readiness silent-state hunt
    // (finding F-4).
    //
    // dispatchApprovedLead handles both the "still not distributable" case
    // (fresh-DB visibility check no-ops with a log line) and the "already
    // broadcast" case (per-channel notifiedAt CAS short-circuits broad-
    // casters). Calling unconditionally here is safe + idempotent. Same
    // posture as PR #54: fire-and-forget so the HTTP response is not gated
    // on Twilio/SendGrid/socket latency.
    const { dispatchApprovedLead } = require('../services/dispatchOrchestrator');
    dispatchApprovedLead(lead._id, { source: 'admin.tier_override.clear' }).catch(err =>
      console.error(`[admin.tier_override.clear] dispatch error for ${lead._id}: ${err.message}`)
    );

    const payload = await buildSnapshotPayload(lead._id);
    res.json({ ok: true, action: 'tier-override-clear', ...payload });
  } catch (err) {
    console.error('[Admin lead.tier-override.clear] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/admin/leads/:id/mark-reviewed
// Acknowledges admin has reviewed the lead. Does NOT change tier or status —
// just stamps reviewedAt/By/Notes. The modal shows a "Reviewed by X" badge.
router.post('/leads/:id/mark-reviewed', [auth, admin], async (req, res) => {
  try {
    const lead = await loadLeadOr404(req, res);
    if (!lead) return;
    const before = {
      reviewedAt: lead.reviewedAt || null,
      reviewedBy: lead.reviewedBy || null,
      reviewNotes: lead.reviewNotes || null,
    };
    lead.reviewedAt = new Date();
    lead.reviewedBy = req.user.id;
    lead.reviewNotes = req.body?.note ? String(req.body.note).slice(0, 1000) : null;
    await lead.save();
    logAdminAction({
      actor: req.user.id, action: 'lead.mark_reviewed',
      targetType: 'lead', targetId: lead._id,
      before, after: { reviewedAt: lead.reviewedAt, reviewedBy: lead.reviewedBy, reviewNotes: lead.reviewNotes },
      metadata: { note: req.body?.note },
    });
    const payload = await buildSnapshotPayload(lead._id);
    res.json({ ok: true, action: 'mark-reviewed', ...payload });
  } catch (err) {
    console.error('[Admin lead.mark-reviewed] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// ── GET /api/admin/leads/:id/distribution-diagnose ──────────────────────────
//
// Operational observability endpoint added 2026-05-28 in response to a staging
// SMS Claim test where a quote-flow Alabama lead appeared in the admin
// dashboard but no SMS broadcast reached the configured Alabama mover.
//
// Admin dashboard visibility is NOT the same as mover distribution
// eligibility. A lead can show in admin while being blocked from mover
// broadcast by distributionDecision (system_held / system_pending /
// system_rejected), the verifyLeadPhone qualification gate
// (shadowTier=rejected / qualityGateCleared=false / adminTierOverride),
// or the dedup guard (notifiedAt non-null without force).
//
// This endpoint replaces the need for direct Mongo shell access. It is:
//   - admin-only
//   - read-only — no Mongo writes, no broadcast triggering, no socket emit
//   - schema-stable — no fields added or changed
//   - matcher-independent — does NOT touch findEligibleMovers, dispatchPolicy,
//     or any mover-side gate. For mover-level diagnostics use
//     /api/admin/matcher/diagnose?leadId=…&moverId=… (PR #31).
//
// Response shape: the raw distribution-relevant fields on the Lead doc,
// plus derived predicates that reproduce the broadcast-suppression decision
// tree (qualificationFailed, hiddenFromMovers, distributable,
// broadcastWouldSuppress, broadcastWouldSuppressBy). The derived predicates
// reuse the production helpers (isHiddenFromMovers, hiddenReason,
// isDistributable) so they stay in lockstep with the broadcast path.
//
// What it does NOT include:
//   - candidate counts / mover-eligibility traces  → use /matcher/diagnose
//   - Twilio send results                          → check Twilio console
//   - per-mover dispatch hours / smsNotif gates    → /matcher/diagnose
router.get('/leads/:id/distribution-diagnose', [auth, admin], async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .select(
        'status distributionDecision distributionDecisionReason ' +
        'distributionDecisionBy distributionDecisionAt ' +
        'qualityGateCleared shadowTier structuralBlockers miles ' +
        'notifiedAt originZip destinationZip originState destinationState ' +
        'validation claimWindow adminTierOverride ' +
        // PR-4 broadcast manifest — persisted observability for "why
        // did/didn't this lead dispatch?" Written by dispatchApprovedLead
        // (attemptAt + visibility-level suppress reason) and broadcastLeadSMS
        // (matchedCount + sms-level suppress reason).
        'lastBroadcastAttemptAt lastBroadcastSuppressReason lastBroadcastMatchedCount'
      )
      .lean();

    if (!lead) {
      return res.status(404).json({ msg: 'Lead not found', leadId: req.params.id });
    }

    // Defense-in-depth: reuse the production visibility helpers so this
    // diagnose endpoint never drifts from what broadcastLeadSMS actually
    // does at twilioService.js:65 (and verifyLeadPhone:587).
    const hidden = isHiddenFromMovers(lead);
    const reason = hiddenReason(lead);

    // Reproduce the verifyLeadPhone qualification gate (twilioService.js:464-473).
    // This is the FIRST broadcast-suppression point in the V5 chain — fires
    // BEFORE isHiddenFromMovers, with priority: shadowTier=rejected →
    // qualityGateCleared=false → adminTierOverride.tier=rejected.
    let qualificationFailed = false;
    let qualificationReason = null;
    if (lead.shadowTier === 'rejected') {
      qualificationFailed = true;
      qualificationReason = 'shadowTier=rejected';
    } else if (lead.qualityGateCleared === false) {
      qualificationFailed = true;
      qualificationReason = 'qualityGateCleared=false';
    } else if (lead.adminTierOverride && lead.adminTierOverride.tier === 'rejected') {
      qualificationFailed = true;
      qualificationReason = 'adminTierOverride=rejected';
    }

    // Synthesize the broadcast verdict. Order matches the call chain:
    //   1. verifyLeadPhone qualificationFailed check (twilioService.js:580)
    //   2. verifyLeadPhone isHiddenFromMoversById check (twilioService.js:587)
    //   3. broadcastLeadSMS notifiedAt dedup (twilioService.js:54)
    //   4. broadcastLeadSMS isHiddenFromMovers defense-in-depth (twilioService.js:65)
    //
    // We report the FIRST gate that would fire. notifiedAt-only suppression
    // is bypassable with force:true (when/if a force endpoint exists); the
    // others are not bypassable without changing distributionDecision.
    let broadcastWouldSuppress = false;
    let broadcastWouldSuppressBy = null;
    if (qualificationFailed) {
      broadcastWouldSuppress = true;
      broadcastWouldSuppressBy = 'qualificationFailed';
    } else if (hidden) {
      broadcastWouldSuppress = true;
      broadcastWouldSuppressBy = 'hiddenFromMovers';
    } else if (lead.notifiedAt) {
      broadcastWouldSuppress = true;
      broadcastWouldSuppressBy = 'notifiedAt';
    }

    return res.json({
      // Raw lead state
      leadId:                     String(lead._id),
      status:                     lead.status,
      distributionDecision:       lead.distributionDecision,
      distributionDecisionReason: lead.distributionDecisionReason || null,
      distributionDecisionBy:     lead.distributionDecisionBy || null,
      distributionDecisionAt:     lead.distributionDecisionAt || null,
      qualityGateCleared:         lead.qualityGateCleared,
      shadowTier:                 lead.shadowTier || null,
      structuralBlockers:         Array.isArray(lead.structuralBlockers) ? lead.structuralBlockers : [],
      miles:                      Number.isFinite(lead.miles) ? lead.miles : null,
      notifiedAt:                 lead.notifiedAt || null,
      originZip:                  lead.originZip || null,
      destinationZip:             lead.destinationZip || null,
      originState:                lead.originState || null,
      destinationState:           lead.destinationState || null,
      validation: {
        phone:        (lead.validation && lead.validation.phone)       || null,
        route:        (lead.validation && lead.validation.route)       || null,
        fraud:        (lead.validation && lead.validation.fraud)       || null,
        fingerprint:  (lead.validation && lead.validation.fingerprint) || null,
      },
      claimWindow: lead.claimWindow ? {
        status:        lead.claimWindow.status || null,
        token:         lead.claimWindow.token  || null,
        openedAt:      lead.claimWindow.openedAt || null,
        expiresAt:     lead.claimWindow.expiresAt || null,
        claimedBy:     lead.claimWindow.claimedBy || null,
        claimedAt:     lead.claimWindow.claimedAt || null,
        closedReason:  lead.claimWindow.closedReason || null,
      } : null,
      adminTierOverride: lead.adminTierOverride || null,
      // PR-4 broadcast manifest — persisted observability.
      lastBroadcastAttemptAt:      lead.lastBroadcastAttemptAt || null,
      lastBroadcastSuppressReason: lead.lastBroadcastSuppressReason || null,
      lastBroadcastMatchedCount:   Number.isFinite(lead.lastBroadcastMatchedCount)
        ? lead.lastBroadcastMatchedCount
        : null,
      // Derived predicates — reproduce the broadcast suppression decision
      hiddenFromMovers:           hidden,
      hiddenReason:               reason,
      distributable:              isDistributable(lead.distributionDecision),
      qualificationFailed,
      qualificationReason,
      broadcastWouldSuppress,
      broadcastWouldSuppressBy,
    });
  } catch (err) {
    console.error('[Admin lead.distribution-diagnose] error:', err.message);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
