const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const PlatformSettings = require('../models/PlatformSettings');

// Admin: get global platform configuration
router.get('/', [auth, admin], async (req, res) => {
  try {
    const settings = await PlatformSettings.findOne({});
    if (!settings) {
      return res.json({
        standardLeadPrice: 10,
        exclusiveLeadMultiplier: 2.5,
        acceptNewUserSignups: true,
        automatedStripeRefunds: false
      });
    }
    res.json(settings);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Admin: update global platform configuration
router.put('/', [auth, admin], async (req, res) => {
  try {
    const {
      standardLeadPrice,
      exclusiveLeadMultiplier,
      acceptNewUserSignups,
      automatedStripeRefunds
    } = req.body || {};

    const updates = {};
    if (standardLeadPrice !== undefined) updates.standardLeadPrice = Number(standardLeadPrice);
    if (exclusiveLeadMultiplier !== undefined) updates.exclusiveLeadMultiplier = Number(exclusiveLeadMultiplier);
    if (acceptNewUserSignups !== undefined) updates.acceptNewUserSignups = Boolean(acceptNewUserSignups);
    if (automatedStripeRefunds !== undefined) updates.automatedStripeRefunds = Boolean(automatedStripeRefunds);

    const settings = await PlatformSettings.findOneAndUpdate(
      {},
      { $set: updates },
      { returnDocument: 'after', upsert: true }
    );

    res.json(settings);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;

