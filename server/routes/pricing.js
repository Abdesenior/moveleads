const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const PricingRule = require('../models/PricingRule');

// @route   GET /api/admin/pricing
// @desc    Get all pricing rules
// @access  Private (Admin)
router.get('/', [auth, admin], async (req, res) => {
  try {
    const rules = await PricingRule.find().sort({ category: 1, matchValue: 1 });
    res.json(rules);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/admin/pricing
// @desc    Create a new pricing rule
// @access  Private (Admin)
router.post('/', [auth, admin], async (req, res) => {
  try {
    const { category, matchValue, multiplier, description } = req.body;
    
    // Check if rule already exists
    let rule = await PricingRule.findOne({ category, matchValue });
    if (rule) return res.status(400).json({ msg: 'Rule already exists for this value' });

    rule = new PricingRule({ category, matchValue, multiplier, description });
    await rule.save();
    res.json(rule);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/admin/pricing/:id
// @desc    Update a pricing rule
// @access  Private (Admin)
router.put('/:id', [auth, admin], async (req, res) => {
  try {
    const rule = await PricingRule.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { returnDocument: 'after' }
    );
    res.json(rule);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/admin/pricing/:id
// @desc    Delete a pricing rule
// @access  Private (Admin)
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    await PricingRule.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Rule removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
