/* eslint-disable no-console */
/**
 * closeStaleClaimWindows — SMS Claim Pipeline pre-flip hardening (PR-S4).
 *
 * Background job that expires Lead.claimWindow documents whose status is
 * 'open' and whose expiresAt has passed. Without this, an open window
 * sits forever once its expiry passes, blocking future re-broadcasts on
 * the same lead (PR-S5's openClaimWindow CAS filter refuses to overwrite
 * windows in `open` or `claimed` states).
 *
 * Query is supported by the compound partial index PR-S2 installed:
 *   { 'claimWindow.status': 1, 'claimWindow.expiresAt': 1 } with
 *   partialFilterExpression { 'claimWindow.status': { $exists: true } }
 *
 * Atomicity:
 *   Uses Mongo's updateMany — a single atomic conditional write per row
 *   via the document-level lock. Filter `{ status: 'open', expiresAt:
 *   { $lte: now } }` excludes already-expired rows so the job is
 *   idempotent: multiple instances (e.g. blue/green deploy overlap) can
 *   safely run the same tick.
 *
 *   Race with PR-S3 (future inbound webhook): if a mover's SEND-token
 *   reply lands AFTER expiresAt but BEFORE our updateMany runs, both
 *   writes race on `claimWindow.status === 'open'`. Mongo's per-doc
 *   write-conflict resolution picks one winner. PR-S3 will write
 *   `status: 'claimed'` (not 'expired'); whichever loses just no-ops.
 *   The mover wins ties because the inbound webhook responds inline and
 *   hits Mongo first in the vast majority of cases — the cron is the
 *   safety net, not the primary path.
 *
 * Flag independence (intentional):
 *   This job is NOT gated on ENABLE_SMS_CLAIM_SCAFFOLD. PR-S5 is the
 *   only opener of windows, but if scaffold is flipped on in prod and
 *   then off again, any leftover open windows would otherwise stay
 *   `open` forever and silently block future re-broadcasts on those
 *   leads. The cleanup must outlive flag flips. Cost when flag-off in
 *   prod (no windows opened anywhere) is one indexed query every 5 min
 *   that returns zero rows — effectively free.
 *
 * Scope discipline:
 *   - Touches ONLY Lead.claimWindow (status + closedReason).
 *   - Does NOT touch financial models (PurchasedLead, Transaction, User
 *     balances). PR-S5/S4 are scaffold + maintenance; financial atomicity
 *     stays in routes/bids.js until PR-S3 wires the real inbound claim
 *     handler that replicates that pattern.
 *   - Does NOT send any SMS to losers — that's PR-S6.
 *
 * Run cadence:
 *   Every 5 minutes (cron '*\/5 * * * *'). Matches the Phase 4 audit's
 *   "5-10 min cadence" recommendation; aligns with a 10-min default
 *   claim window so a stale window is never more than ~5 min late
 *   being marked expired in the worst case.
 */

const cron = require('node-cron');
const Lead = require('../models/Lead');

/**
 * Find all leads with an open + expired claimWindow and flip them to
 * status='expired', closedReason='expired'. Returns the modifiedCount
 * so the cron + manual ops invocations can log activity.
 *
 * Pure async function — schedule-independent. Exported for:
 *   - The cron handler (below)
 *   - Future ops scripts that may want to force a sweep
 *   - Tests
 *
 * @param {{ now?: Date }} [opts] — `now` lets tests pin the clock.
 * @returns {Promise<{ modifiedCount: number, matchedCount: number }>}
 */
async function closeStaleClaimWindows({ now = new Date() } = {}) {
  const result = await Lead.updateMany(
    {
      'claimWindow.status': 'open',
      'claimWindow.expiresAt': { $lte: now },
    },
    {
      $set: {
        'claimWindow.status': 'expired',
        'claimWindow.closedReason': 'expired',
      },
    }
  );
  return {
    modifiedCount: result.modifiedCount || 0,
    matchedCount: result.matchedCount || 0,
  };
}

// Schedule — every 5 minutes. See file-header for flag-independence rationale.
cron.schedule('*/5 * * * *', async () => {
  try {
    const { modifiedCount } = await closeStaleClaimWindows();
    if (modifiedCount > 0) {
      // Only log on activity to keep prod logs quiet when scaffold-off
      // (the common case in production today).
      console.log(`[closeStaleClaimWindows] expired ${modifiedCount} stale claim window(s)`);
    }
  } catch (err) {
    console.error('[closeStaleClaimWindows] Error:', err.message);
  }
});

module.exports = { closeStaleClaimWindows };
