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

    // 2. Check for existing dispute
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
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ msg: 'Dispute not found' });

    if (dispute.status !== 'PENDING') {
      return res.status(400).json({ msg: 'Dispute already resolved' });
    }

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      if (approve) {
        // 1. Find the purchase to get the amount paid
        const purchase = await PurchasedLead.findById(dispute.purchasedLead).session(session);
        if (!purchase) throw new Error('Purchase record missing');

        // 2. Credit the user's balance
        await User.findByIdAndUpdate(
          dispute.company,
          { $inc: { balance: purchase.pricePaid } },
          { session }
        );

        // 3. Log the refund transaction
        const transaction = new Transaction({
          user: dispute.company,
          type: 'Lead Dispute Refund',
          amount: purchase.pricePaid,
          description: `Refund for disputed lead: ${dispute.lead}`,
          lead: dispute.lead,
          status: 'Completed'
        });
        await transaction.save({ session });

        dispute.status = 'APPROVED';
      } else {
        dispute.status = 'DENIED';
      }

      dispute.adminNotes = adminNotes || '';
      dispute.resolvedAt = new Date();
      await dispute.save({ session });
    });

    session.endSession();
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
