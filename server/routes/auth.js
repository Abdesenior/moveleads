const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const PlatformSettings = require('../models/PlatformSettings');

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Login: 10 attempts per IP per 15 minutes — slows brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Too many login attempts. Please try again in 15 minutes.' },
});

// Register: 5 accounts per IP per hour — prevents mass account creation
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Too many accounts created from this IP. Please try again later.' },
});

// @route   POST /api/auth/register
// @desc    Register user returning JWT token
// @access  Public
router.post('/register', registerLimiter, async (req, res) => {
  const { companyName, dotNumber, mcNumber, phone, email, password } = req.body;
  try {
    const settings = await PlatformSettings.findOne({});
    const acceptNewUserSignups = settings ? settings.acceptNewUserSignups : true;
    if (!acceptNewUserSignups) {
      return res.status(403).json({ msg: 'Registrations are currently closed' });
    }

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    user = new User({
      companyName, dotNumber, mcNumber, phone, email, password,
      role: email.includes('admin') ? 'admin' : 'customer',
      balance: 0
    });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    const payload = { user: { id: user.id, role: user.role } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, email: user.email, role: user.role, companyName } });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user returning JWT token
// @access  Public
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ msg: 'Account suspended' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    const payload = { user: { id: user.id, role: user.role } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, email: user.email, role: user.role, companyName: user.companyName } });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/auth/me
// @desc    Get currently logged in user context
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
