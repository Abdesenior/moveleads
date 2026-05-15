const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const PlatformSettings = require('../models/PlatformSettings');
const { logAdminAction } = require('../utils/auditLog');
const validationToggles = require('../services/validationToggles');
const twilioLookupService = require('../services/twilioLookupService');
const mapboxService = require('../services/mapboxService');
const carrierReputation = require('../services/carrierReputation');

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

    const before = await PlatformSettings.findOne({}).lean();

    const settings = await PlatformSettings.findOneAndUpdate(
      {},
      { $set: updates },
      { returnDocument: 'after', upsert: true }
    );

    logAdminAction({
      actor: req.user.id,
      action: 'settings.update',
      targetType: 'platformSettings',
      targetId: settings._id,
      before: before
        ? {
            standardLeadPrice: before.standardLeadPrice,
            exclusiveLeadMultiplier: before.exclusiveLeadMultiplier,
            acceptNewUserSignups: before.acceptNewUserSignups,
            automatedStripeRefunds: before.automatedStripeRefunds,
          }
        : null,
      after: updates,
    });

    res.json(settings);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ── V5 Validation Toggles (Phase 2.5) ──────────────────────────────────────
// Admin-controlled kill switches layered ON TOP of env flags. Effective state
// = ENV && TOGGLE. Defaults to ALL OFF. See server/services/validationToggles.js.
//
// The endpoint also reports each env flag's state so admins can see why a
// toggle being on still has no effect (env-side gate is off).

router.get('/validation-toggles', [auth, admin], async (req, res) => {
  try {
    const toggles = await validationToggles.get();
    res.json({
      toggles,
      env: {
        mapboxEnabled: mapboxService.isEnabled(),
        twilioLookupEnabled: twilioLookupService.isEnabled(),
        twilioIdentityMatchEnabled: twilioLookupService.isIdentityMatchEnabled(),
        carrierReputationEnabled: carrierReputation.isEnabled(),
      },
      effective: {
        mapbox: mapboxService.isEnabled() && toggles.mapboxEnabled,
        twilioLookup: twilioLookupService.isEnabled() && toggles.twilioLookupEnabled,
        twilioIdentityMatch: twilioLookupService.isEnabled()
                          && twilioLookupService.isIdentityMatchEnabled()
                          && toggles.twilioLookupEnabled
                          && toggles.twilioIdentityMatchEnabled,
        carrierRep: twilioLookupService.isEnabled()
                 && carrierReputation.isEnabled()
                 && toggles.twilioLookupEnabled
                 && toggles.carrierReputationEnabled,
      },
    });
  } catch (err) {
    console.error('[validation-toggles GET] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.patch('/validation-toggles', [auth, admin], async (req, res) => {
  try {
    const { mapboxEnabled, twilioLookupEnabled, twilioIdentityMatchEnabled, carrierReputationEnabled } = req.body || {};
    const before = await validationToggles.get();
    const next = await validationToggles.set({
      mapboxEnabled, twilioLookupEnabled, twilioIdentityMatchEnabled, carrierReputationEnabled,
    });
    logAdminAction({
      actor: req.user.id,
      action: 'validation.toggles.update',
      targetType: 'platformSettings',
      before,
      after: next,
    });
    res.json({ ok: true, toggles: next });
  } catch (err) {
    console.error('[validation-toggles PATCH] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;

