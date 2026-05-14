const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const PartnerResearchSubmission = require('../models/PartnerResearchSubmission');

// Router-level: 3 submissions / hour / IP across BOTH forms.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { msg: 'Too many submissions from this IP. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(submitLimiter);

const VALID_PARTNER_TYPES = new Set(['realtor', 'facebook_group_admin']);
const REALTOR_VOLUMES = new Set(['1-4', '5-14', '15-29', '30+']);
const GROUP_SIZES     = new Set(['1k-5k', '5k-20k', '20k-50k', '50k+']);
const GROUP_FREQS     = new Set(['daily', 'weekly', 'occasionally', 'rarely']);

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

/**
 * @route   POST /api/partner-research/submit
 * @desc    Public submission endpoint for the two partner validation
 *          funnels. Dedupes by (email, partnerType) and returns a
 *          friendly { ok, alreadySubmitted } so the UI shows a warm
 *          confirmation without leaking enumeration data.
 * @access  Public (rate-limited at router level)
 */
router.post('/submit', async (req, res) => {
  try {
    const body = req.body || {};

    // Honeypot — silent success without storing.
    if (body.website) return res.json({ ok: true });

    const partnerType = String(body.partnerType || '').trim();
    if (!VALID_PARTNER_TYPES.has(partnerType)) {
      return res.status(400).json({ msg: 'Invalid partner type.' });
    }

    const fullName = String(body.fullName || '').trim();
    const email    = String(body.email || '').trim().toLowerCase();
    if (!fullName || !isEmail(email)) {
      return res.status(400).json({ msg: 'Full name and a valid email are required.' });
    }

    const doc = { partnerType, fullName, email };
    if (partnerType === 'realtor') {
      const brokerageName        = String(body.brokerageName || '').trim();
      const mainMarket           = String(body.mainMarket || '').trim().toUpperCase();
      const monthlyMovingClients = String(body.monthlyMovingClients || '').trim();
      if (!brokerageName || !mainMarket || !REALTOR_VOLUMES.has(monthlyMovingClients)) {
        return res.status(400).json({ msg: 'Brokerage, market, and client volume are required.' });
      }
      Object.assign(doc, { brokerageName, mainMarket, monthlyMovingClients });
    } else {
      const facebookGroupUrl    = String(body.facebookGroupUrl || '').trim();
      const groupSize           = String(body.groupSize || '').trim();
      const movingHelpFrequency = String(body.movingHelpFrequency || '').trim().toLowerCase();
      if (!facebookGroupUrl || !GROUP_SIZES.has(groupSize) || !GROUP_FREQS.has(movingHelpFrequency)) {
        return res.status(400).json({ msg: 'Group URL, size, and frequency are required.' });
      }
      Object.assign(doc, { facebookGroupUrl, groupSize, movingHelpFrequency });
    }

    // Dedup — friendly success, no enumeration leak.
    const existing = await PartnerResearchSubmission
      .findOne({ email, partnerType })
      .select('_id submittedAt')
      .lean();
    if (existing) return res.json({ ok: true, alreadySubmitted: true });

    doc.source = String(body.source || '').slice(0, 64);
    doc.utm = {
      source:   String(body.utm?.source   || '').slice(0, 128),
      medium:   String(body.utm?.medium   || '').slice(0, 128),
      campaign: String(body.utm?.campaign || '').slice(0, 128),
      term:     String(body.utm?.term     || '').slice(0, 128),
      content:  String(body.utm?.content  || '').slice(0, 128),
    };
    doc.completionTimeSeconds = Number(body.completionTimeSeconds) || null;
    doc.ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    doc.userAgent = (req.headers['user-agent'] || '').slice(0, 512);
    doc.submittedAt = new Date();

    const saved = await new PartnerResearchSubmission(doc).save();
    return res.json({ ok: true, id: saved._id });
  } catch (err) {
    if (err && err.code === 11000) {
      // Race on compound unique — treat as duplicate.
      return res.json({ ok: true, alreadySubmitted: true });
    }
    console.error('[PartnerResearch] submit error', err);
    return res.status(500).json({ msg: 'Could not submit. Please try again.' });
  }
});

module.exports = router;
