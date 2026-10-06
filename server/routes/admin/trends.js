// GET /api/admin/trends?days=30
//
// Is the business growing? For the last N days vs the N days before:
//   - leads in, leads sold (sell-through), what happened to the rest
//     (still open, expired, rejected, in review) — by lead created date
//   - sales and revenue — by purchase date, non-refunded only
//   - a daily series for charts (UTC days)
//
// Read-only. Mounted in server.js under /api/admin/trends with
// verifiedGate; the admin middleware here gates non-admin users.

const express = require('express');
const router = express.Router();
const { admin } = require('../../middleware/auth');
const Lead = require('../../models/Lead');
const PurchasedLead = require('../../models/PurchasedLead');

router.use(admin);

const ALLOWED_DAYS = [7, 30, 90];
const DAY = 24 * 60 * 60 * 1000;

const REVIEW = ['PENDING_MANUAL_REVIEW', 'Pending Verification'];

// Outcome of a lead, in priority order: sold beats everything else.
const outcomeExpr = {
  $switch: {
    branches: [
      { case: { $gt: ['$soldCount', 0] }, then: 'sold' },
      { case: { $eq: ['$status', 'REJECTED_FAKE'] }, then: 'rejected' },
      { case: { $in: ['$status', REVIEW] }, then: 'review' },
      { case: { $or: [{ $eq: ['$status', 'Expired'] }, { $eq: ['$auctionStatus', 'expired'] }] }, then: 'expired' },
    ],
    default: 'open',
  },
};

router.get('/', async (req, res) => {
  const days = Number(req.query.days) || 30;
  if (!ALLOWED_DAYS.includes(days)) {
    return res.status(400).json({ msg: `days must be one of ${ALLOWED_DAYS.join(', ')}` });
  }
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY);
  const prevSince = new Date(since.getTime() - days * DAY);
  const period = { $cond: [{ $gte: ['$createdAt', since] }, 'current', 'previous'] };

  try {
    const [leadAgg, salesAgg] = await Promise.all([
      Lead.aggregate([
        { $match: { createdAt: { $gte: prevSince, $lt: now } } },
        { $project: { createdAt: 1, status: 1, auctionStatus: 1 } },
        {
          $lookup: {
            from: PurchasedLead.collection.name,
            let: { id: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$lead', '$$id'] }, refunded: { $ne: true } } },
              { $count: 'n' },
            ],
            as: 'p',
          },
        },
        { $addFields: { soldCount: { $ifNull: [{ $first: '$p.n' }, 0] }, period } },
        { $addFields: { outcome: outcomeExpr } },
        {
          $facet: {
            byPeriod: [{ $group: { _id: { period: '$period', outcome: '$outcome' }, n: { $sum: 1 } } }],
            daily: [
              { $match: { period: 'current' } },
              { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, leads: { $sum: 1 } } },
            ],
          },
        },
      ]),
      PurchasedLead.aggregate([
        { $match: { purchasedAt: { $gte: prevSince, $lt: now }, refunded: { $ne: true } } },
        {
          $facet: {
            byPeriod: [{
              $group: {
                _id: { $cond: [{ $gte: ['$purchasedAt', since] }, 'current', 'previous'] },
                sales: { $sum: 1 },
                revenue: { $sum: '$pricePaid' },
              },
            }],
            daily: [
              { $match: { purchasedAt: { $gte: since } } },
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$purchasedAt' } },
                  sales: { $sum: 1 },
                  revenue: { $sum: '$pricePaid' },
                },
              },
            ],
          },
        },
      ]),
    ]);

    const L = leadAgg[0];
    const S = salesAgg[0];
    const empty = () => ({ leads: 0, sold: 0, open: 0, expired: 0, rejected: 0, review: 0, sales: 0, revenue: 0 });
    const periods = { current: empty(), previous: empty() };
    for (const { _id, n } of L.byPeriod) {
      periods[_id.period][_id.outcome] += n;
      periods[_id.period].leads += n;
    }
    for (const { _id, sales, revenue } of S.byPeriod) {
      periods[_id].sales = sales;
      periods[_id].revenue = revenue;
    }

    // One row per UTC day, zero-filled, oldest first.
    const leadsByDay = Object.fromEntries(L.daily.map((d) => [d._id, d.leads]));
    const salesByDay = Object.fromEntries(S.daily.map((d) => [d._id, d]));
    const daily = [];
    for (let t = since.getTime(); t <= now.getTime(); t += DAY) {
      const key = new Date(t).toISOString().slice(0, 10);
      if (daily.length && daily[daily.length - 1].date === key) continue;
      daily.push({
        date: key,
        leads: leadsByDay[key] || 0,
        sales: salesByDay[key]?.sales || 0,
        revenue: salesByDay[key]?.revenue || 0,
      });
    }
    const today = now.toISOString().slice(0, 10);
    if (daily[daily.length - 1]?.date !== today) {
      daily.push({ date: today, leads: leadsByDay[today] || 0, sales: salesByDay[today]?.sales || 0, revenue: salesByDay[today]?.revenue || 0 });
    }

    res.json({ days, since, previousSince: prevSince, current: periods.current, previous: periods.previous, daily });
  } catch (err) {
    console.error('[admin/trends] aggregate failed:', err.message);
    res.status(500).json({ msg: 'Could not load trends' });
  }
});

module.exports = router;
