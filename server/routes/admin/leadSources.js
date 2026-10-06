// GET /api/admin/lead-sources?days=30
//
// Which channels and landing pages produce leads, and how many of those
// leads sold. Reads Lead.attribution (written at ingest by
// utils/attribution.normalizeAttribution). Leads without attribution
// (created before 2026-10, or from clients that don't send it) are
// counted as "untracked" so totals still add up.
//
// Read-only. Mounted in server.js under /api/admin/lead-sources with
// verifiedGate; the admin middleware here gates non-admin users.

const express = require('express');
const router = express.Router();
const { admin } = require('../../middleware/auth');
const Lead = require('../../models/Lead');
const PurchasedLead = require('../../models/PurchasedLead');

router.use(admin);

const ALLOWED_DAYS = [7, 30, 90, 365];

// Sold = at least one non-refunded purchase; revenue = sum of those prices.
const purchaseStages = [
  {
    $lookup: {
      from: PurchasedLead.collection.name,
      let: { id: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$lead', '$$id'] }, refunded: { $ne: true } } },
        { $project: { pricePaid: 1 } },
      ],
      as: 'purchases',
    },
  },
  {
    $addFields: {
      sold: { $cond: [{ $gt: [{ $size: '$purchases' }, 0] }, 1, 0] },
      revenue: { $sum: '$purchases.pricePaid' },
    },
  },
];

const groupBy = (key) => [
  {
    $group: {
      _id: key,
      leads: { $sum: 1 },
      sold: { $sum: '$sold' },
      revenue: { $sum: '$revenue' },
    },
  },
  { $sort: { leads: -1, _id: 1 } },
];

router.get('/', async (req, res) => {
  const days = Number(req.query.days) || 30;
  if (!ALLOWED_DAYS.includes(days)) {
    return res.status(400).json({ msg: `days must be one of ${ALLOWED_DAYS.join(', ')}` });
  }
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const [result] = await Lead.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $project: { attribution: 1 } },
      ...purchaseStages,
      {
        $facet: {
          totals: [{ $group: { _id: null, leads: { $sum: 1 }, sold: { $sum: '$sold' }, revenue: { $sum: '$revenue' }, tracked: { $sum: { $cond: [{ $ifNull: ['$attribution.channel', false] }, 1, 0] } } } }],
          byChannel: groupBy({ $ifNull: ['$attribution.channel', 'untracked'] }),
          byLandingPage: [
            { $match: { 'attribution.landingPage': { $exists: true } } },
            ...groupBy('$attribution.landingPage'),
            { $limit: 50 },
          ],
          byReferrer: [
            { $match: { 'attribution.referrerHost': { $exists: true } } },
            ...groupBy('$attribution.referrerHost'),
            { $limit: 20 },
          ],
        },
      },
    ]);

    const rename = (rows) => rows.map(({ _id, ...r }) => ({ key: _id, ...r }));
    const t = result.totals[0] || { leads: 0, sold: 0, revenue: 0, tracked: 0 };
    res.json({
      days,
      since,
      totals: { leads: t.leads, sold: t.sold, revenue: t.revenue, tracked: t.tracked },
      byChannel: rename(result.byChannel),
      byLandingPage: rename(result.byLandingPage),
      byReferrer: rename(result.byReferrer),
    });
  } catch (err) {
    console.error('[admin/lead-sources] aggregate failed:', err.message);
    res.status(500).json({ msg: 'Could not load lead sources' });
  }
});

module.exports = router;
