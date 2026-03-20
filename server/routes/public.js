const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const Lead = require('../models/Lead');

// Rate-limit: max 30 zip checks per IP per minute — prevents enumeration scraping
const zipLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Too many requests. Please wait a moment.' }
});

/**
 * @route   GET /api/public/lead-volume/:zipcode
 * @desc    Return the number of leads in the last 7 days touching a given zip code.
 *          Used by the /for-movers lead-magnet widget.
 * @access  Public (rate-limited)
 */
router.get('/lead-volume/:zipcode', zipLimiter, async (req, res) => {
  const { zipcode } = req.params;

  // Basic sanitisation — must be exactly 5 digits
  if (!/^\d{5}$/.test(zipcode)) {
    return res.status(400).json({ msg: 'Zip code must be exactly 5 digits.' });
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Count all distributable leads (anything that made it past Twilio verification)
    // that touched this zip as either origin or destination in the last 7 days.
    const count = await Lead.countDocuments({
      createdAt: { $gte: since },
      status: { $nin: ['REJECTED_FAKE', 'PENDING_MANUAL_REVIEW'] },
      $or: [
        { originZip: zipcode },
        { destinationZip: zipcode }
      ]
    });

    // Supplementary: count distinct origin zips in the same window for
    // "neighbouring zip" context when count === 0.
    let nearbyCount = 0;
    if (count === 0) {
      // Use the first 3 digits as a rough "region" proxy (same prefix = same metro)
      const prefix = zipcode.slice(0, 3);
      nearbyCount = await Lead.countDocuments({
        createdAt: { $gte: since },
        status: { $nin: ['REJECTED_FAKE', 'PENDING_MANUAL_REVIEW'] },
        $or: [
          { originZip: { $regex: `^${prefix}` } },
          { destinationZip: { $regex: `^${prefix}` } }
        ]
      });
    }

    res.json({
      zipcode,
      count,
      nearbyCount,
      windowDays: 7,
      // Let the frontend decide the messaging, but give it a demand signal
      demandLabel: count >= 10 ? 'Very High' : count >= 5 ? 'High' : count >= 1 ? 'Active' : 'Emerging'
    });
  } catch (err) {
    console.error('[Public lead-volume]', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
