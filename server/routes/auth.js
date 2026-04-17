const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const PlatformSettings = require('../models/PlatformSettings');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

// ── Rate limiters ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Too many login attempts. Please try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Too many accounts created from this IP. Please try again later.' },
});

const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Too many resend requests. Please wait 15 minutes.' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function issueJWT(user, res) {
  const payload = { user: { id: user.id, role: user.role } };
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
    if (err) throw err;
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, companyName: user.companyName }
    });
  });
}

// @route   POST /api/auth/register
// @desc    Register user and send verification email
// @access  Public
router.post('/register', registerLimiter, async (req, res) => {
  const { companyName, dotNumber, mcNumber, phone, password } = req.body;
  const email = req.body.email?.toLowerCase().trim();
  try {
    const settings = await PlatformSettings.findOne({});
    if (settings && !settings.acceptNewUserSignups) {
      return res.status(403).json({ msg: 'Registrations are currently closed' });
    }

    if (await User.findOne({ email })) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    const verificationToken = generateVerificationToken();

    const user = new User({
      companyName, dotNumber, mcNumber, phone, email,
      password: await bcrypt.hash(password, 10),
      role: 'mover',   // public registration always creates movers — never admin
      balance: 0,
      isEmailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await user.save();

    // All public registrations require email verification before login
    sendVerificationEmail({ toEmail: email, companyName, token: verificationToken })
      .catch(err => console.error('[VerifyEmail] Failed to send:', err.message));
    return res.status(201).json({ msg: 'Account created. Please check your email to verify before logging in.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user returning JWT token
// @access  Public
router.post('/login', loginLimiter, async (req, res) => {
  const password = req.body.password;
  const email = req.body.email?.toLowerCase().trim();

  if (!password || !email) {
    console.log(`[Login Failed] Missing email or password in request. Email: ${email}`);
    return res.status(400).json({ msg: 'Invalid Credentials' });
  }

  try {
    console.log(`[Login Attempt] Email: ${email}`);
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`[Login Failed] No user found in DB for email: ${email}`);
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    if (user.isSuspended) return res.status(403).json({ msg: 'Account suspended' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(`[Login Failed] Password mismatch for email: ${email}`);
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    // Log unverified status but allow login so they can see the VerificationBanner in dashboard
    if (user.isEmailVerified === false && user.role === 'customer') {
      console.log(`[Login] Unverified customer logged in: ${email}`);
    }

    issueJWT(user, res);
  } catch (err) {
    console.error('[Login Route Error]:', err);
    res.status(500).json({ msg: 'Internal Server Error', error: err.message });
  }
});

// @route   GET /api/auth/verify-email?token=XYZ
// @desc    Verify a user's email address via token link
// @access  Public
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ msg: 'Verification token is required.' });

  try {
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        msg: 'This verification link is invalid or has expired. Please request a new one.',
        code: 'TOKEN_INVALID',
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({ msg: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/auth/resend-verification
// @desc    Re-send the verification email (e.g. if it expired)
// @access  Public
router.post('/resend-verification', resendLimiter, async (req, res) => {
  const email = req.body.email?.toLowerCase().trim();
  if (!email) return res.status(400).json({ msg: 'Email is required.' });

  try {
    const user = await User.findOne({ email });
    console.log(`[ResendVerify] Request for: ${email}. User found: ${!!user}`);

    // Always return 200 to avoid user enumeration
    if (!user) {
      console.log(`[ResendVerify] No user found for: ${email}`);
      return res.json({ msg: 'If that email exists and is unverified, a new link has been sent.' });
    }

    if (user.isEmailVerified) {
      console.log(`[ResendVerify] User already verified: ${email}`);
      return res.json({ msg: 'If that email exists and is unverified, a new link has been sent.' });
    }

    const token = generateVerificationToken();
    user.emailVerificationToken = token;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    console.log(`[ResendVerify] Sending email to: ${email} with token: ${token.slice(0, 10)}...`);
    sendVerificationEmail({ toEmail: email, companyName: user.companyName, token })
      .then(() => console.log(`[ResendVerify] Success queued for: ${email}`))
      .catch(err => console.error('[ResendVerify] Failed to send:', err.message));

    res.json({ msg: 'If that email exists and is unverified, a new link has been sent.' });
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
    if (!user) return res.status(401).json({ msg: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim() });
    if (!user) return res.json({ success: true }); // don't reveal if email exists

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    await sendPasswordResetEmail({
      toEmail: email,
      resetLink: `${process.env.CLIENT_URL || 'https://moveleads.cloud'}/reset-password?token=${token}`,
    });

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[forgot-password]', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ msg: 'Token and new password are required' });
    if (newPassword.length < 8) return res.status(400).json({ msg: 'Password must be at least 8 characters' });

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ msg: 'Invalid or expired reset link' });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('[reset-password]', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
