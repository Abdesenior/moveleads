const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const Lead = require('../models/Lead');
const Transaction = require('../models/Transaction');
const { logAdminAction } = require('../utils/auditLog');
const { regenerateCoverageForUser_v2 } = require('../utils/coverageExpansion');
const { normalizeUSDigits, applyPhoneChange } = require('../utils/phoneVerification');
const { applyEmailChange } = require('../utils/emailVerification');
const { sendVerificationEmail } = require('../services/emailService');
const {
  VALID_STATE_CODES,
  MAX_STATES: MAX_SERVICE_STATES,
  normalizeStateList,
  buildServiceAreaPatch,
  backfillFromServiceStates,
} = require('../utils/serviceAreaMirror');

// @route   GET /api/users
// @desc    Admin: Get all users
// @access  Private (Admin)
router.get('/', [auth, admin], async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ dateJoined: -1 });
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/users/:id
// @desc    Admin: Update user (or self update profile)
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    // If not admin, can only update own profile
    if (!['admin','super_admin'].includes(req.user.role) && req.user.id !== req.params.id) {
       return res.status(401).json({ msg: 'Not authorized' });
    }

    let user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Strip fields that must never be changed via this endpoint regardless of caller.
    // Role and balance changes go through dedicated admin-only routes.
    // phoneVerified is also stripped — it can only flip true via the
    // /api/users/me/phone/verify-code route after Twilio Verify approval.
    // phoneVerifiedAt + phoneVerification* are server-managed state.
    // interstateEnabled is a derived field — recomputed server-side via
    // serviceAreaMirror; never trust a client-supplied value.
    const { role, balance, isSuspended, password, isEmailVerified,
            emailVerificationToken, resetPasswordToken,
            phoneVerified, phoneVerifiedAt,
            phoneVerificationLastSentAt, phoneVerificationSendsToday,
            interstateEnabled,
            ...safeBody } = req.body;

    // ── Phone-change invariant ─────────────────────────────────────────────
    // If the caller is updating `phone`, normalize to digits-only and let
    // applyPhoneChange reset phoneVerified to false when the value changes.
    // Idempotent re-save (same number) leaves verification state intact.
    if ('phone' in safeBody) {
      const newDigits = normalizeUSDigits(safeBody.phone);
      if (!newDigits && safeBody.phone) {
        return res.status(400).json({ msg: 'Invalid phone number' });
      }
      const patch = applyPhoneChange(user.phone, newDigits);
      if (Object.keys(patch).length > 0) {
        Object.assign(safeBody, patch);
      } else {
        // Either same as existing or empty input — store the normalized form
        // without touching verification state.
        safeBody.phone = newDigits || user.phone;
      }
    }

    // ── Email-change invariant ─────────────────────────────────────────────
    // 2026-05-29 — mirrors the phone-change invariant above.
    //
    // Before this fix, a mover who PATCHed a new email kept their previous
    // `isEmailVerified=true` flag. Email broadcasts (services/emailService.
    // broadcastLeadEmail) went to the new address even though it was
    // unverified — and if the new address was a typo, the mover silently
    // stopped receiving lead alerts. Audit finding 08 R1 / 12 B1.
    //
    // applyEmailChange returns an empty object for idempotent re-saves
    // (same email normalized) so the verification state is preserved.
    // For actual changes it returns: { email, isEmailVerified=false,
    // emailVerificationToken (fresh), emailVerificationExpires (+24h) }.
    //
    // The verification email itself is sent fire-and-forget after the
    // save (below) so the HTTP response is not gated on Resend latency,
    // matching the registration-time pattern in routes/auth.js.
    let emailChanged = false;
    let pendingVerificationToken = null;
    if ('email' in safeBody) {
      const patch = applyEmailChange(user.email, safeBody.email);
      if (Object.keys(patch).length > 0) {
        Object.assign(safeBody, patch);
        emailChanged = true;
        pendingVerificationToken = patch.emailVerificationToken;
      } else {
        // Idempotent re-save (same email) or empty / invalid input — drop
        // it from the patch so we don't trigger Mongoose normalization for
        // no behavioral change.
        delete safeBody.email;
      }
    }

    // ── Service-area write path (Phase 1 unified handler) ──────────────────
    // Three input shapes are accepted, in priority order:
    //   (1) New fields: pickupStates + deliveryStates + deliversNationwide
    //   (2) Legacy fields: serviceStates (single flat list)
    //   (3) Mixed (one of each) — new fields win; legacy is treated as
    //       supplemental and ignored to avoid contradictory writes.
    //
    // Whichever path runs ends up producing the SAME mongoose `$set` shape
    // via buildServiceAreaPatch: pickupStates + deliveryStates +
    // deliversNationwide + serviceStates (legacy mirror) + interstateEnabled.
    // The matcher still reads serviceStates today; Phase 3 cuts it over.
    let serviceAreaChanged = false;
    let regenPickup   = null;
    let regenDelivery = null;

    const hasNewPickup     = 'pickupStates'     in safeBody;
    const hasNewDelivery   = 'deliveryStates'   in safeBody;
    const hasNewNationwide = 'deliversNationwide' in safeBody;
    const hasLegacyService = 'serviceStates'    in safeBody;

    if (hasNewPickup || hasNewDelivery || hasNewNationwide) {
      // Validate outer shapes only — buildServiceAreaPatch handles dedup,
      // normalization, and unknown-code dropping internally.
      if (hasNewPickup && !Array.isArray(safeBody.pickupStates)) {
        return res.status(400).json({ msg: 'pickupStates must be an array of state codes' });
      }
      if (hasNewDelivery && !Array.isArray(safeBody.deliveryStates)) {
        return res.status(400).json({ msg: 'deliveryStates must be an array of state codes' });
      }
      if (hasNewNationwide && typeof safeBody.deliversNationwide !== 'boolean') {
        return res.status(400).json({ msg: 'deliversNationwide must be a boolean' });
      }

      const result = buildServiceAreaPatch({
        pickupStates:       hasNewPickup     ? safeBody.pickupStates       : undefined,
        deliveryStates:     hasNewDelivery   ? safeBody.deliveryStates     : undefined,
        deliversNationwide: hasNewNationwide ? safeBody.deliversNationwide : undefined,
        previous: {
          pickupStates:       user.pickupStates,
          deliveryStates:     user.deliveryStates,
          deliversNationwide: user.deliversNationwide,
        },
      });

      // Discard raw client values; use the helper's normalized versions.
      delete safeBody.pickupStates;
      delete safeBody.deliveryStates;
      delete safeBody.deliversNationwide;
      delete safeBody.serviceStates; // ignore legacy if mixed — new wins
      Object.assign(safeBody, result.patch);

      regenPickup   = { mode: 'states', states: result.pickupStates };
      regenDelivery = result.deliversNationwide
        ? { mode: 'nationwide', states: [] }
        : (result.deliveryStates.length > 0
            ? { mode: 'states', states: result.deliveryStates }
            : { mode: 'same', states: [] });

      // Keep onboarding.answers in sync so coverage regen's existing
      // signature (which reads from there) sees the right inputs even on
      // the back-compat regen call below.
      safeBody['onboarding.answers.pickup.mode']    = regenPickup.mode;
      safeBody['onboarding.answers.pickup.states']  = regenPickup.states;
      safeBody['onboarding.answers.delivery.mode']  = regenDelivery.mode;
      safeBody['onboarding.answers.delivery.states'] = regenDelivery.states;

      // Detect actual change vs idempotent re-save
      const prevPickup = Array.isArray(user.pickupStates) ? user.pickupStates : [];
      const prevDeliv  = Array.isArray(user.deliveryStates) ? user.deliveryStates : [];
      const prevNw     = !!user.deliversNationwide;
      const samePickup = prevPickup.length === regenPickup.states.length
        && [...prevPickup].sort().every((c, i) => c === [...regenPickup.states].sort()[i]);
      const sameDeliv  = prevDeliv.length === (regenDelivery.states || []).length
        && [...prevDeliv].sort().every((c, i) => c === [...(regenDelivery.states || [])].sort()[i]);
      const sameNw     = prevNw === result.deliversNationwide;
      serviceAreaChanged = !(samePickup && sameDeliv && sameNw);
    } else if (hasLegacyService) {
      // ── Legacy serviceStates path ────────────────────────────────────────
      // Old clients (and admin tooling) still send serviceStates as a flat
      // list. Normalize via the same helper to keep behavior consistent
      // and backfill pickup/delivery for movers whose new fields are empty.
      if (!Array.isArray(safeBody.serviceStates)) {
        return res.status(400).json({ msg: 'serviceStates must be an array of state codes' });
      }
      const cleaned = normalizeStateList(safeBody.serviceStates);
      safeBody.serviceStates = cleaned;
      const prev = Array.isArray(user.serviceStates) ? user.serviceStates : [];
      const same = prev.length === cleaned.length && prev.every((c, i) => c === cleaned[i]);
      const legacyChanged = !same;

      if (legacyChanged) {
        // Mirror to pickup.states for coverage regen (existing behavior).
        safeBody['onboarding.answers.pickup.mode']    = 'states';
        safeBody['onboarding.answers.pickup.states']  = cleaned;

        // Phase 1 backfill: if the mover has no pickupStates / deliveryStates
        // yet, populate them from the legacy write so they're not stuck on
        // the old field after the new UI ships. Preserves nationwide intent.
        const additions = backfillFromServiceStates(cleaned, {
          pickupStates:       user.pickupStates,
          deliveryStates:     user.deliveryStates,
          deliversNationwide: user.deliversNationwide,
        });
        Object.assign(safeBody, additions);
      }

      serviceAreaChanged = legacyChanged;
      regenPickup   = { mode: 'states', states: cleaned };
      regenDelivery = user?.onboarding?.answers?.delivery || { mode: 'same', states: [] };
    }

    user = await User.findByIdAndUpdate(req.params.id, { $set: safeBody }, { returnDocument: 'after' }).select('-password');

    // Best-effort coverage regen: don't block the response. If it fails the
    // user can still toggle states again or wait for the next save.
    //
    // We deliberately run this even when the pickup list is empty. The
    // regen helper does `CoverageArea.deleteMany({ company: userId })` first
    // and only re-inserts derived ZIPs (none, in the empty case) — so
    // clearing service states cleanly wipes the mover's CoverageArea
    // collection.
    if (serviceAreaChanged && regenPickup) {
      const dispatchBase = user?.onboarding?.answers?.dispatchBase || {};
      regenerateCoverageForUser_v2(
        user._id,
        dispatchBase,
        regenPickup,
        regenDelivery,
      ).catch(err => console.error('[Coverage] regen failed:', err.message));
    }

    // 2026-05-29 — send fresh verification email if the mover's email was
    // changed by this PATCH. Fire-and-forget; same posture as the
    // registration-time send in routes/auth.js. The mover sees an
    // "verification required" state on next dashboard load via the
    // existing VerificationBanner (which reads user.isEmailVerified).
    if (emailChanged && pendingVerificationToken) {
      sendVerificationEmail({
        toEmail: user.email,
        companyName: user.companyName,
        token: pendingVerificationToken,
      }).catch(err => console.error('[users.PATCH] sendVerificationEmail failed (non-fatal):', err.message));
    }

    res.json(user);
  } catch (err) {
    console.error('[PUT /users/:id]', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   PUT /api/users/:id/password
// @desc    User: Change password (requires current password)
// @access  Private
router.put('/:id/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    // This endpoint is strictly for self-service password changes.
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ msg: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ msg: 'New password is too short' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Current password is incorrect' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ msg: 'Password updated successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/users/:id/suspend
// @desc    Admin: Suspend or unsuspend an account
// @access  Private (Admin)
router.put('/:id/suspend', [auth, admin], async (req, res) => {
  try {
    const { isSuspended } = req.body || {};
    if (isSuspended === undefined) {
      return res.status(400).json({ msg: 'isSuspended is required' });
    }

    const before = await User.findById(req.params.id).select('isSuspended').lean();
    const nextSuspended = Boolean(isSuspended);

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isSuspended: nextSuspended } },
      { returnDocument: 'after' }
    ).select('-password');

    if (!user) return res.status(404).json({ msg: 'User not found' });

    logAdminAction({
      actor: req.user.id,
      action: nextSuspended ? 'user.suspend' : 'user.unsuspend',
      targetType: 'user',
      targetId: user._id,
      before: { isSuspended: before?.isSuspended ?? null },
      after: { isSuspended: nextSuspended },
    });

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/users/me
// @desc    User: Delete own account (and related purchased data)
// @access  Private
router.delete('/me', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Remove credits transactions + purchased lead records for this user.
    // (We only delete leads that were purchased by this user.)
    await Transaction.deleteMany({ user: userId });
    await Lead.updateMany(
      { 'buyers.company': userId }, 
      { 
        $pull: { buyers: { company: userId } },
        $set: { status: 'Available' }
      }
    );
    await User.findByIdAndDelete(userId);

    res.json({ msg: 'Account deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/users/:id
// @desc    Admin: Delete user
// @access  Private (Admin)
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    await User.findByIdAndDelete(req.params.id);

    logAdminAction({
      actor: req.user.id,
      action: 'user.delete',
      targetType: 'user',
      targetId: user._id,
      before: {
        email: user.email,
        companyName: user.companyName,
        role: user.role,
        balance: user.balance,
        isSuspended: user.isSuspended,
      },
      after: null,
    });

    res.json({ msg: 'User removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
