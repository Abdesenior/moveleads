const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const requirePhoneVerified = require('../middleware/requirePhoneVerified');
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
const { normalizeUSDigits, applyPhoneChange } = require('../utils/phoneVerification');
const { buildServiceAreaPatch, normalizeStateList } = require('../utils/serviceAreaMirror');

// Whitelisted answer keys to prevent setting arbitrary fields
const ANSWER_KEYS = [
  // Step 1 — dispatch base + pickup + delivery (new model)
  'dispatchBase', 'pickup', 'delivery',
  // Step 1 — legacy (kept for resume back-compat)
  'primaryMarket', 'coverageRadius', 'additionalMarkets',
  // Step 2 — move preferences (also written to top-level User.{maxDistance, preferredHomeSizes})
  'maxDistance', 'preferredHomeSizes',
  // Step 3 — alerts (also written to top-level User.{phone, smsNotif, emailNotif, receiveLiveTransfers})
  'phone', 'smsNotif', 'emailNotif', 'receiveLiveTransfers',
  // Legacy fields kept so resuming partners with old answers don't lose data.
  // 'moveTypes'/'avoidMoveTypes'/'alertChannels' are dormant (their reads were
  // retired in PR-C3/PR-C4) but stay whitelisted so resuming partners with old
  // answers don't 400. The 'dispatchHours' Mixed field backs the dormant
  // 'advanced' per-day mode (the default-mode editor in Settings uses the
  // sibling open/close/days keys).
  'moveTypes', 'avoidMoveTypes',
  'alertChannels',
  'dispatchHoursMode', 'dispatchDays', 'dispatchHoursOpen', 'dispatchHoursClose', 'dispatchHours',
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

    // ── Phone-verification gate for ALL steps past Contact (step 3) ──
    // Steps 1-3 save coverage + phone + email + toggles BEFORE the verify
    // modal opens, so they must stay open. Step 4 onward (SMS Claim,
    // Almost Ready, Activate, Success) represent the mover advancing
    // beyond the verification gate and require a verified phone.
    if (step >= 4) {
      const userDoc = await User.findById(req.user.id).select('phoneVerified').lean();
      if (!userDoc) return res.status(401).json({ msg: 'User not found' });
      if (userDoc.phoneVerified !== true) {
        return res.status(403).json({
          msg: 'Please verify your phone number before advancing past the Contact step.',
          code: 'PHONE_NOT_VERIFIED',
        });
      }
    }
    const update = { 'onboarding.currentStep': step };
    if (answers && typeof answers === 'object') {
      for (const key of ANSWER_KEYS) {
        if (key in answers) update[`onboarding.answers.${key}`] = answers[key];
      }

      // ── Step 3 (Alerts) writes the top-level User fields the SMS
      //    broadcast + voice routing + warm-transfer eligibility filter
      //    read directly. Move-distance + preferred-home-sizes are NOT
      //    asked in onboarding anymore — those preferences belong in
      //    Settings. The User schema still keeps the fields so the
      //    Settings page can write them later.
      if (step === 3) {
        if (typeof answers.phone === 'string' && answers.phone.trim()) {
          // Normalize to digits-only at the storage boundary. Accepts
          // anything from the client (formatted "(555) 555-5555", E.164
          // "+15555555555", or raw "5555555555") and stores a single
          // canonical 10-digit string. Drops a leading "1" if present.
          const phoneDigits = normalizeUSDigits(answers.phone);
          if (phoneDigits) {
            // Phone-change invariant: when the new value differs from the
            // stored one, applyPhoneChange resets phoneVerified to false +
            // clears phoneVerifiedAt. Idempotent re-saves (same number)
            // produce an empty patch.
            const existing = await User.findById(req.user.id).select('phone').lean();
            Object.assign(update, applyPhoneChange(existing?.phone, phoneDigits));
            // Always reflect the normalized form back through answers so
            // resumes display the same canonical value via the wizard's
            // formatter, regardless of whether the value changed.
            update['phone'] = phoneDigits;
            answers.phone = phoneDigits;
          }
        }
        if (typeof answers.smsNotif === 'boolean') {
          update['smsNotif'] = answers.smsNotif;
        }
        if (typeof answers.emailNotif === 'boolean') {
          update['emailNotif'] = answers.emailNotif;
        }
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

      // ── Mover-coverage cleanup Phase 1 — mirror nested pickup/delivery
      //    onboarding answers into the new top-level User fields. The
      //    matching code still reads serviceStates (Phase 3 cuts that
      //    over); buildServiceAreaPatch keeps serviceStates synced as a
      //    union for the duration of the migration.
      //
      // Triggers on either Step 1 (pickup) or Step 2 (delivery / nationwide).
      // Resolves the union by reading the previous user doc for fields the
      // current step didn't touch — so a Step 1 save doesn't clobber the
      // Step 2 delivery answer the user already submitted.
      if (step === 1 || step === 2) {
        const pickupStates = answers && answers.pickup && Array.isArray(answers.pickup.states)
          ? normalizeStateList(answers.pickup.states)
          : undefined;
        const deliveryStates = answers && answers.delivery && Array.isArray(answers.delivery.states)
          ? normalizeStateList(answers.delivery.states)
          : undefined;
        const deliversNationwide = (answers && answers.delivery && typeof answers.delivery.mode === 'string')
          ? (answers.delivery.mode === 'nationwide')
          : undefined;

        if (pickupStates !== undefined || deliveryStates !== undefined || deliversNationwide !== undefined) {
          const previous = await User.findById(req.user.id)
            .select('pickupStates deliveryStates deliversNationwide')
            .lean();
          const { patch } = buildServiceAreaPatch({
            pickupStates,
            deliveryStates,
            deliversNationwide,
            previous: previous || {},
          });
          Object.assign(update, patch);
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
router.post('/complete', auth, requirePhoneVerified, async (req, res) => {
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

// @route   POST /api/onboarding/dismiss-activation-offer
// @desc    Stamps onboarding.activationOfferDismissedAt so the wizard's
//          auto-mount effect stops re-opening on every login. The user has
//          completed setup (steps 1-4) and explicitly chose to defer the
//          activation tier picker. The ActivationBanner CTA still drives
//          explicit re-engagement, so this only suppresses the automatic
//          remount — not the partner's ability to come back later.
//          Idempotent: only sets the timestamp the first time.
// @access  Private (JWT)
router.post('/dismiss-activation-offer', auth, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user.id, 'onboarding.activationOfferDismissedAt': null },
      { $set: { 'onboarding.activationOfferDismissedAt': new Date() } }
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Onboarding] dismiss-activation-offer error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/onboarding/mark-first-topup-popup-seen
// @desc    Stamps onboarding.firstTopupPopupShownAt so the reassurance popup
//          never shows again. Idempotent — only sets the timestamp the first
//          time it's called.
// @access  Private (JWT)
router.post('/mark-first-topup-popup-seen', auth, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user.id, 'onboarding.firstTopupPopupShownAt': null },
      { $set: { 'onboarding.firstTopupPopupShownAt': new Date() } }
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Onboarding] mark-first-topup-popup-seen error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
