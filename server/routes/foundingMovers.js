const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const MoverResearchSubmission = require('../models/MoverResearchSubmission');
const { generateTags } = require('../services/moverResearchTagger');

// Per-IP rate limit on the public submit endpoint.
// 3 submissions / hour / IP is generous enough for real users sharing a
// NAT but tight enough to throttle scripted abuse.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { msg: 'Too many submissions from this IP. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   POST /api/founding-movers/submit
 * @desc    Public submission endpoint for the Founding Mover Program.
 *          De-duplicates by email and returns a friendly "already
 *          submitted" response rather than 409 so the UI can show a
 *          warm confirmation message without leaking enumeration data.
 * @access  Public (rate-limited)
 */
router.post('/submit', submitLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const email = (body.email || '').trim().toLowerCase();

    if (!email || !body.companyName) {
      return res.status(400).json({ msg: 'Company name and email required.' });
    }

    // Duplicate check — return friendly "already submitted" without enumeration value
    const existing = await MoverResearchSubmission
      .findOne({ email })
      .select('_id submittedAt')
      .lean();
    if (existing) {
      return res.json({ ok: true, alreadySubmitted: true });
    }

    const autoTags = generateTags(body);

    const submission = await new MoverResearchSubmission({
      ...body,
      email,
      autoTags,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      submittedAt: new Date(),
    }).save();

    return res.json({ ok: true, id: submission._id });
  } catch (err) {
    if (err && err.code === 11000) {
      // Race on unique email — same as duplicate
      return res.json({ ok: true, alreadySubmitted: true });
    }
    console.error('[FoundingMovers] submit error', err);
    return res.status(500).json({ msg: 'Could not submit. Please try again.' });
  }
});

module.exports = router;
