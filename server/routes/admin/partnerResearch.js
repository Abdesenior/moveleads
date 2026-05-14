const express = require('express');
const router = express.Router();
const { admin } = require('../../middleware/auth');
const PartnerResearchSubmission = require('../../models/PartnerResearchSubmission');

/**
 * Admin-only routes for the Partner Research dashboard.
 *
 * Mounted under /api/admin/partner-research with [auth, requireEmailVerified]
 * already applied by server.js. We additionally apply `admin` here so a
 * non-admin verified user can't reach the data.
 */
router.use(admin);

const VALID_TYPES = new Set(['realtor', 'facebook_group_admin']);

// GET /api/admin/partner-research?partnerType=&search=&page=&pageSize=
router.get('/', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const filter   = {};

    if (VALID_TYPES.has(req.query.partnerType)) filter.partnerType = req.query.partnerType;
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      filter.$or = [
        { fullName: rx }, { email: rx },
        { brokerageName: rx }, { mainMarket: rx },
        { facebookGroupUrl: rx },
        { popularMarkets: rx },
      ];
    }

    const [submissions, total] = await Promise.all([
      PartnerResearchSubmission
        .find(filter)
        .select('partnerType fullName email brokerageName mainMarket monthlyMovingClients facebookGroupUrl groupSize movingHelpFrequency popularMarkets submittedAt')
        .sort({ submittedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      PartnerResearchSubmission.countDocuments(filter),
    ]);

    res.json({ submissions, total, page, pageSize });
  } catch (err) {
    console.error('[AdminPartnerResearch] list error', err);
    res.status(500).json({ msg: 'Could not load submissions.' });
  }
});

// GET /api/admin/partner-research/stats
// MUST be declared BEFORE /:id so it isn't swallowed by ObjectId-shaped param.
router.get('/stats', async (_req, res) => {
  try {
    const [total, realtor, facebook_group_admin] = await Promise.all([
      PartnerResearchSubmission.countDocuments({}),
      PartnerResearchSubmission.countDocuments({ partnerType: 'realtor' }),
      PartnerResearchSubmission.countDocuments({ partnerType: 'facebook_group_admin' }),
    ]);
    res.json({ total, realtor, facebook_group_admin });
  } catch (err) {
    console.error('[AdminPartnerResearch] stats error', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/admin/partner-research/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await PartnerResearchSubmission.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ msg: 'Submission not found.' });
    res.json(doc);
  } catch (err) {
    if (err && err.name === 'CastError') {
      return res.status(404).json({ msg: 'Submission not found.' });
    }
    console.error('[AdminPartnerResearch] detail error', err);
    res.status(500).json({ msg: 'Could not load submission.' });
  }
});

module.exports = router;
