const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');

// Whitelisted answer keys to prevent setting arbitrary fields
const ANSWER_KEYS = [
  'primaryMarket', 'coveragePreference', 'coveragePreferences', 'additionalMarkets',
  'moveTypes', 'avoidMoveTypes',
  'alertChannels', 'urgentCallEnabled',
  'dispatchHoursMode', 'dispatchDays', 'dispatchHoursOpen', 'dispatchHoursClose', 'dispatchHours',
  'dailyRequestCapacity', 'preferredTiming', 'crewCount',
];

// @route   GET /api/onboarding/status
// @desc    Return current onboarding state for the logged-in user
// @access  Private
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('onboarding balance');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    return res.json({
      onboarding: user.onboarding,
      balance: user.balance || 0,
    });
  } catch (err) {
    console.error('[Onboarding] status error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/onboarding/save-step
// @desc    Persist answers for a step and bump currentStep
// @access  Private
// Body:    { step: number, answers: { ... } }
router.post('/save-step', auth, async (req, res) => {
  try {
    const { step, answers } = req.body || {};
    if (typeof step !== 'number' || step < 1 || step > 5) {
      return res.status(400).json({ msg: 'Invalid step' });
    }
    const update = { 'onboarding.currentStep': step };
    if (answers && typeof answers === 'object') {
      for (const key of ANSWER_KEYS) {
        if (key in answers) update[`onboarding.answers.${key}`] = answers[key];
      }
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, runValidators: true }
    ).select('onboarding');
    return res.json({ onboarding: user.onboarding });
  } catch (err) {
    console.error('[Onboarding] save-step error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/onboarding/skip
// @desc    Mark wizard as skipped — soft-lock dismissed
// @access  Private
router.post('/skip', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          'onboarding.skippedAt': new Date(),
          'onboarding.complete': true,
          'onboarding.completedAt': new Date(),
        },
      },
      { new: true }
    ).select('onboarding');
    return res.json({ onboarding: user.onboarding });
  } catch (err) {
    console.error('[Onboarding] skip error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/onboarding/complete
// @desc    Mark wizard as fully completed (called after summary screen, before/after activation)
// @access  Private
router.post('/complete', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          'onboarding.complete': true,
          'onboarding.completedAt': new Date(),
          'onboarding.currentStep': 5,
        },
      },
      { new: true }
    ).select('onboarding');
    return res.json({ onboarding: user.onboarding });
  } catch (err) {
    console.error('[Onboarding] complete error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
