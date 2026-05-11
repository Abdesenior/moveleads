const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const Dispute = require('../models/Dispute');
const PurchasedLead = require('../models/PurchasedLead');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Lead = require('../models/Lead');
const mongoose = require('mongoose');
const { sendDisputeApprovedEmail } = require('../services/emailService');
const { logAdminAction } = require('../utils/auditLog');

// @route   POST /api/disputes
// @desc    Mover: Create a dispute for a purchased lead
// @access  Private (Mover)
router.post('/', auth, async (req, res) => {
  const { leadId, reason } = req.body;

  if (!leadId || !reason) {
    return res.status(400).json({ msg: 'leadId and reason are required' });
  }

  try {
    // 1. Verify the user actually bought this lead
    const purchasedLead = await PurchasedLead.findOne({ company: req.user.id, lead: leadId });
    if (!purchasedLead) {
      return res.status(404).json({ msg: 'Purchase record not found for this lead' });
    }

    // 2. Enforce 7-day dispute window (WP10.5 — was 24h).
    //    Widened to match the FirstTopupReassurancePopup promise that
    //    "onboarding lead credits stay refundable if a lead becomes unreachable".
    //    A single business day was too short for a mover to realize the
    //    customer never picked up after multiple attempts.
    const purchasedAt = purchasedLead.purchasedAt || purchasedLead.createdAt;
    const hoursSincePurchase = (Date.now() - new Date(purchasedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSincePurchase > 7 * 24) {
      return res.status(400).json({ msg: 'Dispute window has closed. Disputes must be submitted within 7 days of purchase.' });
    }

    // 3. Check for existing dispute
    const existing = await Dispute.findOne({ company: req.user.id, purchasedLead: purchasedLead._id });
    if (existing) {
      return res.status(400).json({ msg: 'A dispute for this lead already exists' });
    }

    const dispute = new Dispute({
      company: req.user.id,
      lead: leadId,
      purchasedLead: purchasedLead._id,
      reason
    });

    await dispute.save();
    res.json(dispute);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   GET /api/disputes/admin
// @desc    Admin: List all pending disputes
// @access  Private (Admin)
router.get('/admin', [auth, admin], async (req, res) => {
  try {
    const disputes = await Dispute.find({ status: 'PENDING' })
      .populate('company', 'companyName email')
      .populate('lead', 'originCity destinationCity originZip customerName route')
      .populate('purchasedLead', 'pricePaid')
      .sort({ createdAt: -1 });
    res.json(disputes);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/disputes/admin/:id/resolve
// @desc    Admin: Resolve a dispute (APPROVE/DENY)
// @access  Private (Admin)
router.post('/admin/:id/resolve', [auth, admin], async (req, res) => {
  const { approve, adminNotes } = req.body;

  try {
    // ── WP10.3 — atomic claim ──────────────────────────────────────────────
    // Replace previous "fetch → check status → start transaction" pattern,
    // which had a race window between the status check and the
    // refund-transaction body. Two concurrent admin clicks both passed the
    // pre-check and double-credited the mover. The findOneAndUpdate below
    // is itself the gate: only one writer can flip PENDING → APPROVED/DENIED.
    const targetStatus = approve ? 'APPROVED' : 'DENIED';
    const claimed = await Dispute.findOneAndUpdate(
      { _id: req.params.id, status: 'PENDING' },
      {
        $set: {
          status: targetStatus,
          adminNotes: adminNotes || '',
          resolvedAt: new Date(),
          resolvedBy: req.user.id,
        },
      },
      { new: true }
    );

    if (!claimed) {
      // Either the id is wrong OR it's no longer PENDING (already resolved
      // by a competing request). 409 conveys both cleanly.
      const exists = await Dispute.findById(req.params.id).select('_id').lean();
      if (!exists) return res.status(404).json({ msg: 'Dispute not found' });
      return res.status(409).json({ msg: 'Dispute already resolved' });
    }

    // Refund logic only runs on approval. Status flip is already committed
    // — even if the refund transaction below fails, we have an admin trail
    // (resolvedBy / resolvedAt) and can replay manually via the admin
    // refund route (WP10.2).
    if (approve) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          // Atomic claim on PurchasedLead.refunded — same gate the admin
          // refund route + voice auto-refund + lead-delete cascade use.
          // Cross-path mutual exclusion: if any other path already credited
          // this purchase, the findOneAndUpdate returns null and we skip
          // the balance increment + Transaction insert. Prevents the
          // dispute-approve + admin-refund double-credit vector.
          const purchase = await PurchasedLead.findOneAndUpdate(
            { _id: claimed.purchasedLead, refunded: { $ne: true } },
            { $set: { refunded: true, refundedAt: new Date(), refundedBy: req.user.id } },
            { new: true, session }
          );
          if (!purchase) {
            console.log(`[Disputes] purchase ${claimed.purchasedLead} already refunded by another path — skipping credit.`);
            return;
          }

          await User.findByIdAndUpdate(
            claimed.company,
            { $inc: { balance: purchase.pricePaid } },
            { session }
          );

          const transaction = new Transaction({
            user: claimed.company,
            type: 'Lead Dispute Refund',
            amount: purchase.pricePaid,
            description: `Refund for disputed lead: ${claimed.lead}`,
            lead: claimed.lead,
            purchasedLead: purchase._id,
            status: 'Completed'
          });
          await transaction.save({ session });
        });
      } finally {
        session.endSession();
      }
    }

    const dispute = claimed;

    logAdminAction({
      actor: req.user.id,
      action: approve ? 'dispute.approve' : 'dispute.deny',
      targetType: 'dispute',
      targetId: dispute._id,
      before: { status: 'PENDING' },
      after: { status: targetStatus },
      metadata: {
        lead: dispute.lead,
        company: dispute.company,
        purchasedLead: dispute.purchasedLead,
        adminNotes: adminNotes || null,
      },
    });

    res.json(dispute);

    // Post-commit side effect: notify the mover by email (non-blocking).
    // Only fires on approval; a denial has no credit to report.
    if (approve) {
      // Re-fetch populated data needed for the email (purchase + company).
      Promise.all([
        PurchasedLead.findById(dispute.purchasedLead).lean(),
        User.findById(dispute.company).select('email companyName').lean(),
        Lead.findById(dispute.lead).select('route originCity destinationCity').lean()
      ]).then(([purchase, company, lead]) => {
        if (!purchase || !company) return;
        const route = lead?.route || `${lead?.originCity} → ${lead?.destinationCity}` || 'your move';
        return sendDisputeApprovedEmail({
          toEmail: company.email,
          companyName: company.companyName,
          refundAmount: purchase.pricePaid,
          leadRoute: route
        });
      }).catch(err => {
        console.error('[Dispute Email Error]', err.message);
      });
    }
  } catch (err) {
    console.error('DISPUTE RESOLUTION ERROR:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
