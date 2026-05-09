const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const {
  expandAll,
  regenerateCoverageForUser,
  regenerateCoverageForUser_v2,
  VALID_RADII,
  NEAR_BASE_RADIUS_MILES,
} = require('../utils/coverageExpansion');
const { suggestPlaces } = require('../utils/placeAutocomplete');
const zipcodes = require('zipcodes');

// Whitelisted answer keys to prevent setting arbitrary fields
const ANSWER_KEYS = [
  // Step 1 — dispatch base + pickup + delivery (new model)
  'dispatchBase', 'pickup', 'delivery',
  // Step 1 — legacy (kept for resume back-compat)
  'primaryMarket', 'coverageRadius', 'additionalMarkets',
  // Step 2 — move preferences (also written to top-level User.{maxDistance, preferredHomeSizes})
  'maxDistance', 'preferredHomeSizes',
  // Step 3 — notifications + live transfers (also written to top-level User.{phone, smsNotif, receiveLiveTransfers})
  'phone', 'smsNotif', 'receiveLiveTransfers',
  // Legacy fields kept so resuming partners with old answers don't lose data
  'coveragePreference', 'coveragePreferences',
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
    // Accept 1..5 to keep partners with the legacy 5-step wizard mid-flow compatible.
    if (typeof step !== 'number' || step < 1 || step > 5) {
      return res.status(400).json({ msg: 'Invalid step' });
    }
    const update = { 'onboarding.currentStep': step };
    if (answers && typeof answers === 'object') {
      for (const key of ANSWER_KEYS) {
        if (key in answers) update[`onboarding.answers.${key}`] = answers[key];
      }

      // ── Step 3 (Preferences + Alerts) writes top-level User fields the
      //    matching helper + SMS broadcast read directly. The nested
      //    onboarding.answers copy is kept so the wizard can hydrate on
      //    resume. (Was Step 2 + Step 3 in the legacy 5-step wizard; merged
      //    into Step 3 in the new 4-step flow.)
      if (step === 3) {
        if (typeof answers.maxDistance === 'string') {
          update['maxDistance'] = answers.maxDistance;
        }
        if (Array.isArray(answers.preferredHomeSizes)) {
          update['preferredHomeSizes'] = answers.preferredHomeSizes;
        }
        if (typeof answers.phone === 'string' && answers.phone.trim()) {
          update['phone'] = answers.phone.trim();
        }
        if (typeof answers.smsNotif === 'boolean') {
          update['smsNotif'] = answers.smsNotif;
        }
      }

      // ── Step 4 (Activation) — Live Phone Transfers toggle moved here so
      //    the user opts in next to the balance picker. Persisted on every
      //    save-step from this screen so closing mid-activation doesn't
      //    drop the choice.
      if (step === 4) {
        if (typeof answers.receiveLiveTransfers === 'boolean') {
          update['receiveLiveTransfers'] = answers.receiveLiveTransfers;
        }
      }

      // ── Step 2 (new model): persist deliversNationwide + derive friendly
      //    primaryMarket. Delivery mode is set on Step 2 in the new flow.
      if (step === 2 && answers.delivery && typeof answers.delivery.mode === 'string') {
        update['deliversNationwide'] = (answers.delivery.mode === 'nationwide');
        if (answers.dispatchBase && answers.dispatchBase.city && answers.dispatchBase.state) {
          update['onboarding.answers.primaryMarket'] = `${answers.dispatchBase.city}, ${answers.dispatchBase.state}`;
        }
      }
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, runValidators: true }
    ).select('onboarding');

    // ── Side-effect: regenerate CoverageArea ZIP docs from Step 1 inputs ───
    // Only while the user is still in onboarding. Once onboarding.complete is
    // true, the Settings → Coverage Areas editor is the source of truth and
    // we must NOT wipe whatever the partner has customized there.
    // Coverage regenerates whenever the user touches the dispatch/pickup
    // (Step 1) OR delivery (Step 2). Both phases of the new split flow need
    // to refresh CoverageArea docs because dispatchBase + pickup + delivery
    // together define the typed origin/destination/both writes.
    let coverageInfo = null;
    if ((step === 1 || step === 2) && !user.onboarding?.complete && answers) {
      try {
        // Prefer the new dispatchBase + pickup + delivery model. Fall back to
        // the legacy primaryMarket + coverageRadius + additionalMarkets path
        // for any client still sending the old shape (e.g. partners
        // mid-resume on a stale tab).
        if (answers.dispatchBase && answers.dispatchBase.zip) {
          coverageInfo = await regenerateCoverageForUser_v2(
            req.user.id,
            answers.dispatchBase,
            answers.pickup || { mode: 'near' },
            answers.delivery || { mode: 'same' },
          );
          console.log(`[Coverage v2] ${req.user.id} both=${coverageInfo.counts.both} originOnly=${coverageInfo.counts.originOnly} destOnly=${coverageInfo.counts.destinationOnly} nationwide=${coverageInfo.nationwide}`);
        } else if (typeof answers.primaryMarket === 'string' && answers.primaryMarket.trim() && answers.coverageRadius) {
          coverageInfo = await regenerateCoverageForUser(
            req.user.id,
            answers.primaryMarket,
            answers.coverageRadius,
            Array.isArray(answers.additionalMarkets) ? answers.additionalMarkets : []
          );
          console.log(`[Coverage v1] Regenerated ${coverageInfo.count} ZIPs for ${req.user.id}`);
        }
      } catch (covErr) {
        console.error('[Coverage] regen failed', covErr.message);
        coverageInfo = { error: covErr.userMessage || covErr.message };
      }
    }

    return res.json({ onboarding: user.onboarding, coverage: coverageInfo });
  } catch (err) {
    console.error('[Onboarding] save-step error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// @route   GET /api/onboarding/place-suggest?q=Hou&limit=8
// @desc    Local city/ZIP autocomplete. No external API. Powered by an
//          in-memory index built from the bundled `zipcodes` package at
//          server boot. Returns at most `limit` suggestions, ranked by
//          population proxy + exact-match prefix.
// @access  Private (requires JWT to keep the index from being scraped publicly)
router.get('/place-suggest', auth, async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 8));
    if (q.trim().length < 2) return res.json({ suggestions: [] });
    const suggestions = suggestPlaces(q, limit);
    return res.json({ suggestions });
  } catch (err) {
    console.error('[Onboarding] place-suggest error', err);
    return res.status(500).json({ suggestions: [] });
  }
});

// @route   POST /api/onboarding/preview-coverage-v2
// @desc    Live preview for the new dispatch-base + pickup + delivery flow.
//          Computes typed coverage counts WITHOUT touching the DB. Powers
//          the wizard's preview pill.
// @access  Private
router.post('/preview-coverage-v2', auth, async (req, res) => {
  try {
    const { dispatchBase, pickup, delivery } = req.body || {};
    if (!dispatchBase || !dispatchBase.zip || !dispatchBase.state) {
      return res.json({ ok: false, msg: 'dispatchBase required' });
    }
    // Reuse the v2 helpers without writing to the DB.
    const { _zipsForPickup, _zipsForDelivery } = require('../utils/coverageExpansion')._test || {};
    // Simpler: import the helpers directly via duplicate computation here.
    const originRaw = computeOriginPreview(dispatchBase, pickup || { mode: 'near' });
    const deliverRaw = computeDeliveryPreview(originRaw, dispatchBase, delivery || { mode: 'same' });
    const nationwide = (delivery && delivery.mode === 'nationwide');

    const originSet = new Set(originRaw);
    const destSet   = deliverRaw === null ? new Set() : new Set(deliverRaw);
    let bothCount = 0, originOnlyCount = 0, destOnlyCount = 0;
    for (const z of originSet) (destSet.has(z) ? bothCount++ : originOnlyCount++);
    for (const z of destSet) if (!originSet.has(z)) destOnlyCount++;

    return res.json({
      ok: true,
      base: {
        city: dispatchBase.city || '',
        state: dispatchBase.state || '',
        zip: dispatchBase.zip || '',
      },
      pickup: { mode: (pickup && pickup.mode) || 'near', states: (pickup && pickup.states) || [] },
      delivery: { mode: (delivery && delivery.mode) || 'same', states: (delivery && delivery.states) || [] },
      counts: {
        both: bothCount,
        originOnly: originOnlyCount,
        destinationOnly: destOnlyCount,
        total: bothCount + originOnlyCount + destOnlyCount,
        // raw set sizes (pre-cap) so we can show the cap notice
        rawOrigin: originRaw.length,
        rawDestination: deliverRaw === null ? null : deliverRaw.length,
      },
      nationwide,
      nearBaseRadiusMiles: NEAR_BASE_RADIUS_MILES,
    });
  } catch (err) {
    console.error('[Onboarding] preview-coverage-v2 error', err);
    return res.status(500).json({ ok: false, msg: 'Preview failed' });
  }
});

// Local helpers (preview-only — duplicated from coverageExpansion.v2 so we
// don't have to export the internals).
function computeOriginPreview(dispatchBase, pickup) {
  const mode = (pickup && pickup.mode) || 'near';
  if (mode === 'near') {
    if (!dispatchBase.zip) return [];
    return zipcodes.radius(dispatchBase.zip, NEAR_BASE_RADIUS_MILES) || [];
  }
  if (mode === 'state') {
    if (!dispatchBase.state) return [];
    return (zipcodes.lookupByState(dispatchBase.state) || []).map(z => z.zip);
  }
  if (mode === 'states') {
    const out = new Set();
    for (const st of (pickup.states || [])) {
      for (const r of (zipcodes.lookupByState(st) || [])) out.add(r.zip);
    }
    return Array.from(out);
  }
  return [];
}
function computeDeliveryPreview(originZips, dispatchBase, delivery) {
  const mode = (delivery && delivery.mode) || 'same';
  if (mode === 'same') return originZips.slice();
  if (mode === 'states') {
    const out = new Set();
    for (const st of (delivery.states || [])) {
      for (const r of (zipcodes.lookupByState(st) || [])) out.add(r.zip);
    }
    return Array.from(out);
  }
  return null; // nationwide
}

// @route   POST /api/onboarding/preview-coverage
// @desc    Live preview for the wizard's Step 1 — returns the resolved
//          metro name + ZIP count without writing anything to the DB.
// @access  Private
router.post('/preview-coverage', auth, async (req, res) => {
  try {
    const { primaryMarket, coverageRadius, additionalMarkets } = req.body || {};
    if (!primaryMarket || !String(primaryMarket).trim()) {
      return res.status(400).json({ ok: false, msg: 'primaryMarket required' });
    }
    if (!coverageRadius || !VALID_RADII.has(String(coverageRadius))) {
      return res.status(400).json({ ok: false, msg: 'coverageRadius required' });
    }
    try {
      const r = expandAll(
        primaryMarket,
        coverageRadius,
        Array.isArray(additionalMarkets) ? additionalMarkets : []
      );
      return res.json({
        ok: true,
        primary: r.primary,
        additional: r.additional,
        failedExtras: r.failedExtras,
        zipCount: r.zips.length,
        capped: r.capped,
      });
    } catch (e) {
      return res.json({ ok: false, msg: e.userMessage || e.message });
    }
  } catch (err) {
    console.error('[Onboarding] preview-coverage error', err);
    return res.status(500).json({ ok: false, msg: 'Server error' });
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
