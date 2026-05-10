const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Lead = require('../models/Lead');
const PurchasedLead = require('../models/PurchasedLead');

// NOTE: The legacy POST /api/purchases/:lead_id route was removed — it
// imported `chargeMoverForLead` from billingService which does not exist,
// so every call returned 500. The active buy-now path is
// POST /api/leads/:id/claim (legacy) and POST /api/bids/:leadId/buy-now.

// @route   GET /api/purchases
// @desc    Get all leads purchased by the current user, with per-buyer CRM data
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const purchases = await PurchasedLead.find({ company: req.user.id })
      .populate('lead')
      .sort({ purchasedAt: -1 });
    res.json(purchases);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/purchases/:id
// @desc    Update customer status and notes for a purchased lead
// @access  Private
router.put('/:id', auth, async (req, res) => {
  const { customerStatus, customerNotes } = req.body;
  
  try {
    let lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ msg: 'Lead not found' });

    // Ensure user owns this purchase
    if (!lead.buyers.some(b => b.company.toString() === req.user.id)) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    if (customerStatus && customerStatus !== lead.customerStatus) {
      lead.customerStatus = customerStatus;
      lead.statusHistory.push({ status: customerStatus, timestamp: new Date() });
    }
    if (customerNotes !== undefined) lead.customerNotes = customerNotes;

    await lead.save();
    res.json(lead);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
