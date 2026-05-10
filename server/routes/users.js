const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const Lead = require('../models/Lead');
const Transaction = require('../models/Transaction');
const { logAdminAction } = require('../utils/auditLog');
const { regenerateCoverageForUser_v2 } = require('../utils/coverageExpansion');

// Canonical 50 US states + DC. Matches client/src/data/usStates.js. Used to
// validate `serviceStates` in self-update payloads — unknown codes are
// silently dropped (defensive) and we cap at 50 entries to bound impact.
const VALID_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
]);
const MAX_SERVICE_STATES = 50;

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
    const { role, balance, isSuspended, password, isEmailVerified,
            emailVerificationToken, resetPasswordToken, ...safeBody } = req.body;

    // ── serviceStates validation + canonical mirror ────────────────────────
    // Source of truth for "what states does this mover operate in" is
    // User.serviceStates. Coverage regen (regenerateCoverageForUser_v2) reads
    // pickup/delivery from onboarding.answers, so we mirror serviceStates →
    // onboarding.answers.pickup.states (mode='states') so the existing
    // coverage helper produces the right ZIP set without a refactor.
    let serviceStatesChanged = false;
    let nextServiceStates = null;
    if ('serviceStates' in safeBody) {
      const raw = safeBody.serviceStates;
      if (!Array.isArray(raw)) {
        return res.status(400).json({ msg: 'serviceStates must be an array of state codes' });
      }
      // Normalize, dedupe, drop unknowns, cap.
      const cleaned = [];
      const seen = new Set();
      for (const v of raw) {
        if (typeof v !== 'string') continue;
        const code = v.trim().toUpperCase();
        if (!VALID_STATE_CODES.has(code)) continue; // silently drop
        if (seen.has(code)) continue;
        seen.add(code);
        cleaned.push(code);
        if (cleaned.length >= MAX_SERVICE_STATES) break;
      }
      safeBody.serviceStates = cleaned;
      nextServiceStates = cleaned;
      const prev = Array.isArray(user.serviceStates) ? user.serviceStates : [];
      const same = prev.length === cleaned.length && prev.every((c, i) => c === cleaned[i]);
      serviceStatesChanged = !same;

      // Mirror into onboarding.answers.pickup.states so coverageExpansion
      // (which reads pickup.states/delivery.states) regenerates correctly.
      if (serviceStatesChanged && cleaned.length > 0) {
        safeBody['onboarding.answers.pickup.mode']    = 'states';
        safeBody['onboarding.answers.pickup.states']  = cleaned;
      }
    }

    user = await User.findByIdAndUpdate(req.params.id, { $set: safeBody }, { returnDocument: 'after' }).select('-password');

    // Best-effort coverage regen: don't block the response. If it fails the
    // user can still toggle states again or wait for the next save.
    if (serviceStatesChanged && nextServiceStates && nextServiceStates.length > 0) {
      const dispatchBase = user?.onboarding?.answers?.dispatchBase || {};
      const delivery     = user?.onboarding?.answers?.delivery     || { mode: 'same', states: [] };
      regenerateCoverageForUser_v2(
        user._id,
        dispatchBase,
        { mode: 'states', states: nextServiceStates },
        delivery,
      ).catch(err => console.error('[Coverage] regen failed:', err.message));
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
