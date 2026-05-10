const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const PricingRule = require('../models/PricingRule');
const { logAdminAction } = require('../utils/auditLog');

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

    logAdminAction({
      actor: req.user.id,
      action: 'pricing.create',
      targetType: 'pricingRule',
      targetId: rule._id,
      before: null,
      after: { category, matchValue, multiplier, description },
    });

    res.json(rule);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/admin/pricing/:id
// @desc    Update a pricing rule
// @access  Private (Admin)
//
// WP12.4a — Allowlist update fields. Previously the entire req.body was
// spread into $set, which meant a malicious or buggy client could rewrite
// `category` or `matchValue` — the rule's identity — and silently change
// which leads it matches. Only multiplier/description/isActive are
// editable; identity fields are immutable after create.
const PRICING_RULE_WRITABLE = ['multiplier', 'description', 'isActive'];

router.put('/:id', [auth, admin], async (req, res) => {
  try {
    const before = await PricingRule.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ msg: 'Rule not found' });

    const update = {};
    for (const key of PRICING_RULE_WRITABLE) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const rule = await PricingRule.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { returnDocument: 'after' }
    );

    logAdminAction({
      actor: req.user.id,
      action: 'pricing.update',
      targetType: 'pricingRule',
      targetId: rule._id,
      before: {
        multiplier: before.multiplier,
        description: before.description,
        isActive: before.isActive,
      },
      after: {
        multiplier: rule.multiplier,
        description: rule.description,
        isActive: rule.isActive,
      },
    });

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
    const before = await PricingRule.findById(req.params.id).lean();
    await PricingRule.findByIdAndDelete(req.params.id);

    if (before) {
      logAdminAction({
        actor: req.user.id,
        action: 'pricing.delete',
        targetType: 'pricingRule',
        targetId: before._id,
        before: {
          category: before.category,
          matchValue: before.matchValue,
          multiplier: before.multiplier,
          description: before.description,
          isActive: before.isActive,
        },
        after: null,
      });
    }

    res.json({ msg: 'Rule removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
