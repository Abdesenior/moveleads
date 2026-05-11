const express = require('express');
const router = express.Router();
const { admin } = require('../../middleware/auth');
const MoverResearchSubmission = require('../../models/MoverResearchSubmission');

/**
 * Admin-only routes for the Founding Mover Program research data.
 *
 * Mounted under /api/admin/mover-research with [auth, requireEmailVerified]
 * already applied by server.js. We additionally apply the `admin`
 * middleware here so a non-admin verified user can't reach the data.
 */
router.use(admin);

// ─── List + filter ────────────────────────────────────────────────────────
//
// GET /api/admin/mover-research
//   ?tag=...         — single-tag filter (matches autoTags)
//   ?state=...       — exact-match on mainStateOrMarket
//   ?search=...      — case-insensitive contains on companyName OR email
//   ?page=1
//   ?pageSize=25
router.get('/', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const filter   = {};

    if (req.query.tag)   filter.autoTags = req.query.tag;
    if (req.query.state) filter.mainStateOrMarket = req.query.state;
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      filter.$or = [{ companyName: rx }, { email: rx }];
    }

    const [submissions, total] = await Promise.all([
      MoverResearchSubmission
        .find(filter)
        .select('companyName email mainStateOrMarket autoTags sharedExclusivePreference marketplacePreference submittedAt')
        .sort({ submittedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      MoverResearchSubmission.countDocuments(filter),
    ]);

    res.json({ submissions, total, page, pageSize });
  } catch (err) {
    console.error('[AdminMoverResearch] list error', err);
    res.status(500).json({ msg: 'Could not load submissions.' });
  }
});

// ─── Analytics ────────────────────────────────────────────────────────────
//
// GET /api/admin/mover-research/analytics
// IMPORTANT: this route must be declared BEFORE the /:id route so it
// isn't swallowed by the ObjectId-shaped param.
router.get('/analytics', async (req, res) => {
  try {
    const all = await MoverResearchSubmission.find({}).lean();
    const totalSubmissions = all.length;

    const countBy = (extractor) => {
      const map = new Map();
      for (const doc of all) {
        const vals = extractor(doc);
        for (const v of vals) {
          if (!v) continue;
          map.set(v, (map.get(v) || 0) + 1);
        }
      }
      return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }));
    };

    const sharedExclusiveBreakdown = countBy(d => [d.sharedExclusivePreference]);
    const biddingInterested = all.filter(d => Array.isArray(d.autoTags) && d.autoTags.includes('bidding_interested')).length;
    const biddingInterestedPercent = totalSubmissions ? Math.round((biddingInterested / totalSubmissions) * 100) : 0;

    const topDesiredMoveTypes  = countBy(d => d.desiredMoveTypes  || []).slice(0, 10);
    const topPreferredJobSizes = countBy(d => d.preferredJobSizes || []).slice(0, 10);
    const topValueSignals      = countBy(d => d.valueSignals      || []).slice(0, 10);
    const topOverpricedSignals = countBy(d => d.overpricedSignals || []).slice(0, 10);
    const topFrustrations      = countBy(d => d.leadProviderFrustrations || []).slice(0, 10);
    const topRetentionDrivers  = countBy(d => d.retentionDrivers  || []).slice(0, 10);
    const speedExpectationBreakdown = countBy(d => [d.speedExpectation]);
    const stateBreakdown = countBy(d => [d.mainStateOrMarket]).slice(0, 20);
    const topTags = countBy(d => d.autoTags || []).slice(0, 20);

    // Date histogram for the last 30 days
    const now = new Date();
    const histogram = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const isoDay = d.toISOString().slice(0, 10);
      const count = all.filter(s => {
        const t = s.submittedAt ? new Date(s.submittedAt).getTime() : 0;
        return t >= d.getTime() && t < next.getTime();
      }).length;
      histogram.push({ date: isoDay, count });
    }

    res.json({
      totalSubmissions,
      sharedExclusiveBreakdown,
      biddingInterestedPercent,
      topDesiredMoveTypes,
      topPreferredJobSizes,
      topValueSignals,
      topOverpricedSignals,
      topFrustrations,
      topRetentionDrivers,
      speedExpectationBreakdown,
      stateBreakdown,
      topTags,
      submissionsLast30Days: histogram,
    });
  } catch (err) {
    console.error('[AdminMoverResearch] analytics error', err);
    res.status(500).json({ msg: 'Could not load analytics.' });
  }
});

// ─── CSV export ───────────────────────────────────────────────────────────
//
// GET /api/admin/mover-research/export.csv
// Streams a CSV of every submission. Plain-string concat with proper
// quote-escaping — no extra deps.
router.get('/export.csv', async (req, res) => {
  try {
    const filter = {};
    if (req.query.tag)   filter.autoTags = req.query.tag;
    if (req.query.state) filter.mainStateOrMarket = req.query.state;
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      filter.$or = [{ companyName: rx }, { email: rx }];
    }

    const rows = await MoverResearchSubmission.find(filter).sort({ submittedAt: -1 }).lean();

    const columns = [
      'submittedAt',
      'companyName',
      'contactName',
      'email',
      'phone',
      'mainStateOrMarket',
      'desiredMoveTypes',
      'preferredJobSizes',
      'valueSignals',
      'requiredConfirmations',
      'sharedExclusivePreference',
      'sharedAcceptableConditions',
      'sharedMaxMovers',
      'exclusiveTriggers',
      'exclusiveTriggersDepends',
      'priorityScenario',
      'speedExpectation',
      'overpricedSignals',
      'marketplacePreference',
      'biddingTriggers',
      'leadProviderExperience',
      'leadProviderFrustrations',
      'platformWish',
      'paidRequestReason',
      'trustToTry',
      'retentionDrivers',
      'biggestProblem',
      'autoTags',
      'source',
      'utmSource',
      'utmMedium',
      'utmCampaign',
      'completionTimeSeconds',
    ];

    const escape = (v) => {
      if (v === null || v === undefined) return '';
      let s = Array.isArray(v) ? v.join('; ') : String(v);
      if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mover-research-${new Date().toISOString().slice(0,10)}.csv"`);

    res.write(columns.join(',') + '\r\n');

    for (const r of rows) {
      const line = columns.map((c) => {
        if (c === 'utmSource')   return escape(r.utm && r.utm.source);
        if (c === 'utmMedium')   return escape(r.utm && r.utm.medium);
        if (c === 'utmCampaign') return escape(r.utm && r.utm.campaign);
        if (c === 'submittedAt') return escape(r.submittedAt ? new Date(r.submittedAt).toISOString() : '');
        return escape(r[c]);
      }).join(',');
      res.write(line + '\r\n');
    }
    res.end();
  } catch (err) {
    console.error('[AdminMoverResearch] csv error', err);
    res.status(500).json({ msg: 'Could not export CSV.' });
  }
});

// ─── Single submission ────────────────────────────────────────────────────
//
// GET /api/admin/mover-research/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await MoverResearchSubmission.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ msg: 'Submission not found.' });
    res.json(doc);
  } catch (err) {
    if (err && err.name === 'CastError') {
      return res.status(404).json({ msg: 'Submission not found.' });
    }
    console.error('[AdminMoverResearch] detail error', err);
    res.status(500).json({ msg: 'Could not load submission.' });
  }
});

module.exports = router;
