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
//
// Query params:
//   ?state=XX — narrow the corpus to a single state/market before computing
//               intelligence. Used by the dashboard's state breakdown card.
router.get('/analytics', async (req, res) => {
  try {
    const { state } = req.query;
    const baseQuery = state ? { mainStateOrMarket: String(state).toUpperCase().trim() } : {};
    const submissions = await MoverResearchSubmission.find(baseQuery).lean();
    const { computeIntel } = require('../../services/moverResearchIntel');
    const intel = computeIntel(submissions);
    res.json(intel);
  } catch (err) {
    console.error('[AdminMoverResearch] analytics error', err);
    res.status(500).json({ msg: 'Server error' });
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

// ─── Delete ───────────────────────────────────────────────────────────────
//
// DELETE /api/admin/mover-research/:id
// Hard-deletes the submission. These are test/research records, not money
// records, so we don't bother with a soft-delete column. An AdminAction
// audit row is written so the action is recoverable in an audit trail
// (best-effort — audit failures don't block the delete).
router.delete('/:id', async (req, res) => {
  try {
    const doc = await MoverResearchSubmission.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ msg: 'Not found' });
    await MoverResearchSubmission.deleteOne({ _id: req.params.id });
    try {
      const { logAdminAction } = require('../../utils/auditLog');
      logAdminAction({
        actor: req.user.id,
        action: 'mover_research.delete',
        targetType: 'mover_research',
        targetId: doc._id,
        before: { email: doc.email, companyName: doc.companyName, submittedAt: doc.submittedAt },
        after: null,
      });
    } catch (_e) { /* audit failure shouldn't block */ }
    res.json({ ok: true });
  } catch (err) {
    if (err && err.name === 'CastError') {
      return res.status(404).json({ msg: 'Not found' });
    }
    console.error('[AdminMoverResearch] delete error', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
