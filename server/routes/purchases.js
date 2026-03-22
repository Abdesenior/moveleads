const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const Lead = require('../models/Lead');
const PurchasedLead = require('../models/PurchasedLead');
const { chargeMoverForLead } = require('../services/billingService');

// @route   POST /api/purchases/:lead_id
// @desc    Buy a lead, deduct credits from user balance, mark lead as sold
// @access  Private
router.post('/:lead_id', auth, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id || req.params.lead_id);
    if (!lead) return res.status(404).json({ msg: 'Lead not found' });

    if (lead.status !== 'Available' && lead.status !== 'READY_FOR_DISTRIBUTION') {
      return res.status(400).json({ msg: 'Lead is no longer available' });
    }

    // Use chargeMoverForLead service (handles deduction + auto-recharge)
    const { balance } = await chargeMoverForLead(req.user.id, lead.price);
    
    // Mark lead as purchased
    lead.status = 'Purchased';
    lead.buyers.push({ company: req.user.id });
    await lead.save();

    const user = await User.findById(req.user.id); // for current leadsPurchased count
    user.leadsPurchased += 1;
    await user.save();

    // Create PurchasedLead audit record
    const purchasedLead = new PurchasedLead({
      company: req.user.id,
      lead: lead.id,
      pricePaid: lead.price
    });
    await purchasedLead.save().catch(err => {
      // Ignore duplicate key errors (idempotency)
      if (err.code !== 11000) console.error('PurchasedLead save error:', err.message);
    });

    res.json({ msg: 'Lead successfully purchased', lead, balance });
  } catch (err) {
    if (err.message === 'Insufficient balance to purchase lead') {
      return res.status(400).json({ msg: err.message });
    }
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

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
