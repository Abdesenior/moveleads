// Admin ClaimAttempt query endpoint — operational observability.
//
// GET /api/admin/claim-attempts
//   ?leadId=<ObjectId>           Optional — filter by lead
//   ?moverId=<ObjectId>          Optional — filter by mover
//   ?outcome=<string>            Optional — filter by ClaimAttempt.OUTCOMES enum value
//   ?since=<ISO date or ms>      Optional — only attempts with receivedAt >= since
//   ?twilioMessageSid=<string>   Optional — exact-match lookup (Twilio retry forensics)
//   ?limit=<int>                 Default 50, max 200
//   ?skip=<int>                  Default 0, for pagination
//
// Returns: { total, limit, skip, items: [<ClaimAttempt>] } sorted by
// receivedAt descending (most recent first).
//
// Read-only. No side effects. Closes HIGH-CONFIDENCE-FIX-PLAN F4 —
// before this endpoint, the ClaimAttempt collection (rich indexed
// forensics including 90-day TTL data, twilioMessageSid idempotency
// audit, full outcome enum) had ZERO HTTP read path. Pilot questions
// like "show me every failed claim for mover X this week" required
// Mongo shell access.
//
// Mounted in server.js under /api/admin/claim-attempts with
// verifiedGate (auth + requireEmailVerified) already applied; the
// `admin` middleware here gates non-admin verified users.

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { admin } = require('../../middleware/auth');
const ClaimAttempt = require('../../models/ClaimAttempt');

router.use(admin);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 200;

function parseLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseSkip(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function parseSince(raw) {
  if (!raw) return null;
  // Accept ISO 8601 strings AND epoch ms (the latter for log-grep-friendly
  // pasting). new Date() handles both.
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

router.get('/', async (req, res) => {
  try {
    const { leadId, moverId, outcome, since, twilioMessageSid } = req.query || {};

    const filter = {};

    if (leadId) {
      if (!mongoose.isValidObjectId(leadId)) {
        return res.status(400).json({ msg: 'leadId must be a valid ObjectId' });
      }
      filter.leadId = leadId;
    }

    if (moverId) {
      if (!mongoose.isValidObjectId(moverId)) {
        return res.status(400).json({ msg: 'moverId must be a valid ObjectId' });
      }
      filter.moverId = moverId;
    }

    if (outcome) {
      if (!ClaimAttempt.OUTCOMES.includes(outcome)) {
        return res.status(400).json({
          msg: `outcome must be one of: ${ClaimAttempt.OUTCOMES.join(', ')}`,
        });
      }
      filter.outcome = outcome;
    }

    if (since) {
      const sinceDate = parseSince(since);
      if (!sinceDate) {
        return res.status(400).json({ msg: 'since must be a valid ISO date or epoch ms' });
      }
      filter.receivedAt = { $gte: sinceDate };
    }

    if (twilioMessageSid) {
      // Trim only — preserve case (Twilio SIDs are case-sensitive).
      filter.twilioMessageSid = String(twilioMessageSid).trim();
    }

    const limit = parseLimit(req.query.limit);
    const skip  = parseSkip(req.query.skip);

    // Two-query read: total + page. The total count uses the same filter
    // so pagination context is accurate. Both queries are indexed by
    // construction (see ClaimAttempt schema indexes on leadId/moverId/
    // outcome/twilioMessageSid/receivedAt).
    const [total, items] = await Promise.all([
      ClaimAttempt.countDocuments(filter),
      ClaimAttempt
        .find(filter)
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.json({
      total,
      limit,
      skip,
      items,
    });
  } catch (err) {
    console.error('[Admin ClaimAttempts] error:', err.message);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
