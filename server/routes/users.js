const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const Lead = require('../models/Lead');
const Transaction = require('../models/Transaction');

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
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
       return res.status(401).json({ msg: 'Not authorized' });
    }

    let user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    user = await User.findByIdAndUpdate(req.params.id, { $set: req.body }, { returnDocument: 'after' }).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
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

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isSuspended: Boolean(isSuspended) } },
      { returnDocument: 'after' }
    ).select('-password');

    if (!user) return res.status(404).json({ msg: 'User not found' });
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
    res.json({ msg: 'User removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
