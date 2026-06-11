/* eslint-disable no-console */
/**
 * reactivateLeads — PR-6 silent-state cron.
 *
 * Background:
 *   Pre-PR-6, the mover-feed handler at GET /api/leads ran an in-handler
 *   updateMany that flipped any lead with:
 *
 *     auctionStatus ∈ { null, undefined, 'expired', 'pending' }
 *     status        ∈ { 'Available', 'READY_FOR_DISTRIBUTION' }
 *     moveDate      ≥ now
 *     buyers        empty or missing
 *
 *   to { auctionStatus: 'active', auctionEndsAt: now + 24h }. This
 *   re-promoted a lead into the marketplace WITHOUT any SMS / email /
 *   socket dispatch — a classic silent-state mutation. The trigger was
 *   "any mover visited the feed"; the cost was movers never being told
 *   that a previously-expired lead was available again.
 *
 *   Closes HIGH-CONFIDENCE-FIX-PLAN F2 (read-path-side-effect class) and
 *   the last remaining "silently approved inventory" bug class. See
 *   PR-A series (PR #52/54/56/57) — same shape, different surface.
 *
 * What this job does (and only this):
 *   - Atomically reactivates every lead that matches the criteria above.
 *   - For each lead the CAS actually touched, fires
 *     dispatchApprovedLead(leadId, { source: 'cron.reactivate' }) — the
 *     canonical orchestrator wires SMS / email / socket and respects
 *     visibility + notifiedAt dedup.
 *   - Logs a single summary line per tick when anything happened.
 *
 *   Out of scope (NOT done by this job):
 *     - The Expire mutation at routes/leads.js:196-203 (lifecycle-only,
 *       no broadcast implications) stays in the read handler.
 *     - No matcher / dispatchPolicy / SMS Claim / financial logic.
 *     - No state changes other than auctionStatus / auctionEndsAt.
 *
 * Idempotency / dispatch dedup:
 *   - Per-lead findOneAndUpdate re-applies the eligibility filter at
 *     write time. If two cron instances overlap (blue/green deploy), each
 *     lead's CAS succeeds for exactly ONE of them; the loser's
 *     findOneAndUpdate returns null and skips dispatch. No double SMS.
 *   - dispatchApprovedLead itself defends against double-dispatch via the
 *     per-channel notifiedAt CAS (PR #52 / PR-S3). We pass
 *     source: 'cron.reactivate' as the operator-grep tag and DO NOT
 *     force-bypass dedup — a lead that was already broadcast on its
 *     last reactivation will short-circuit at the broadcaster level.
 *
 * Failure isolation:
 *   - One lead's dispatch failure does NOT halt the loop. The error is
 *     logged and the next lead proceeds. The summary line at the end
 *     reports successes + failures so the operator can spot a pattern.
 *
 * Cadence:
 *   Every 5 minutes ('*\/5 * * * *'). Matches the existing operational
 *   rhythm:
 *     - jobs/cleanupExpiredLeads        @ 5 min (existing)
 *     - jobs/closeStaleClaimWindows     @ 5 min (existing)
 *   The pre-PR-6 read-handler mutation effectively reactivated leads
 *   "whenever any mover hit the feed" — typically sub-minute during
 *   business hours. 5 minutes is the slowest reasonable cron cadence
 *   we can ship without lengthening the dispatch-after-eligibility
 *   window enough to be visible to operators. Tighter cadence is
 *   higher Mongo pressure for negligible UX benefit; looser is a
 *   visibly stale marketplace.
 *
 * Filter scope (2026-06-09 — narrowed twice in one day):
 *
 *   Morning narrowing — `notifiedAt: null`. Only leads that have never
 *   been broadcast can be reactivated. Once a lead has been broadcast
 *   and its auction window expires, it stays expired until the cleanup
 *   cron removes it when the move date passes. Stops "zombie inventory"
 *   re-appearing in the dashboard Live Leads feed every 5 minutes.
 *
 *   Follow-up narrowing — legacy-lead protection:
 *     - `createdAt >= now - MAX_REACTIVATION_AGE_MS` (7 days). A
 *       never-broadcast lead older than a week is presumed legacy /
 *       abandoned inventory and must not be resurrected.
 *     - `distributionDecision ∈ {system_approved, admin_approved}`.
 *       Aligns the cron's filter with what dispatchApprovedLead's
 *       visibility check requires anyway. Pre-qualification-era leads
 *       (distributionDecision undefined / 'system_pending') no longer
 *       receive auctionStatus writes every tick only for their
 *       dispatch to be suppressed downstream.
 *
 *   Net intent: send FRESH, QUALIFIED leads. Never re-alert, never
 *   resurrect legacy inventory.
 *
 *   Trade-off: a lead that doesn't sell in its first 24h auction
 *   window is gone from the marketplace, and an admin approving a
 *   > 7-day-old lead must dispatch it via the admin.approve route
 *   (which calls dispatchApprovedLead directly) — the cron won't pick
 *   it up. Instant-dispatch leads (the current production model)
 *   don't go through auction cycles anyway, so the impact is minimal.
 *
 *   The test suite pins all clauses (see
 *   __tests__/reactivateLeadsCron.test.js).
 */

const cron = require('node-cron');
const Lead = require('../models/Lead');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build the eligibility filter. Exported so the test suite can assert
 * shape parity with the (now-removed) read-handler mutation, and so a
 * future ops script can re-use the exact same criteria without copying.
 *
 * @param {Date} now
 * @returns {Object} mongo filter
 */
// Max age for reactivation. A never-broadcast lead older than this is
// presumed legacy / abandoned inventory — it predates the current
// qualification cycle and must NOT be resurrected by the cron regardless
// of any other field state. Exported for tests + ops scripts.
const MAX_REACTIVATION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function buildEligibilityFilter(now) {
  return {
    auctionStatus: { $nin: ['active', 'sold', 'buy_now'] },
    status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] },
    moveDate: { $gte: now },
    // 2026-06-09 — only reactivate leads that have NEVER been broadcast.
    // Without this clause, a lead that was broadcast once, sat through
    // a 24h auction window without selling, and is now `auctionStatus:
    // 'expired'` would get re-promoted every 5 minutes for as long as
    // its move date is in the future. The per-channel `notifiedAt` CAS
    // in the broadcasters short-circuits the actual SMS/email/socket
    // emit — but the lead re-appears in the dashboard "Live Leads"
    // feed (which filters on `auctionStatus: 'active'`) and movers
    // perceive it as zombie inventory. By gating on `notifiedAt: null`
    // we keep the cron's main legitimate purpose (handling silent-state
    // pending / admin-held leads that haven't broadcast yet) and stop
    // re-listing previously-broadcast expired leads. Once expired,
    // stays expired — until the move date passes and cleanup removes it.
    notifiedAt: null,
    // 2026-06-09 (same-day follow-up) — two belt-and-suspenders clauses
    // protecting against LEGACY leads (created before the current
    // qualification / scoring / contact-trust system) that still carry
    // notifiedAt: null and a future moveDate:
    //
    // (a) createdAt within MAX_REACTIVATION_AGE_MS (7 days). A
    //     never-broadcast lead older than a week is stale inventory by
    //     definition — even if an admin retroactively flips its
    //     distributionDecision, the cron must not resurrect it. Hard
    //     cutoff on a field every lead has.
    createdAt: { $gte: new Date(now.getTime() - MAX_REACTIVATION_AGE_MS) },
    // (b) distributionDecision must be distributable. Aligns the cron
    //     with what dispatchApprovedLead's isHiddenFromMoversById check
    //     requires anyway — previously the cron would flip
    //     auctionStatus/auctionEndsAt on undistributable leads every 5
    //     minutes only for the dispatch to be suppressed downstream.
    //     Now those leads produce ZERO writes per tick. Legacy leads
    //     with distributionDecision undefined or 'system_pending' are
    //     excluded here (undefined does not match the $in).
    distributionDecision: { $in: ['system_approved', 'admin_approved'] },
    $or: [
      { buyers: { $size: 0 } },
      { buyers: { $exists: false } },
    ],
  };
}

/**
 * Reactivate eligible leads and dispatch each. Exported for the cron
 * handler (below), ops scripts, and tests.
 *
 * @param {Object} [opts]
 * @param {Date} [opts.now]                — pin the clock for tests.
 * @param {Function} [opts.dispatch]       — injected dispatcher (defaults
 *   to dispatchApprovedLead). Tests pass a stub to avoid pulling in the
 *   broadcaster + Twilio + email service graph.
 * @returns {Promise<{
 *   candidateCount: number,
 *   reactivated: number,
 *   dispatched: number,
 *   dispatchFailed: number,
 * }>}
 */
async function reactivateLeads({ now = new Date(), dispatch } = {}) {
  const dispatchFn =
    dispatch ||
    require('../services/dispatchOrchestrator').dispatchApprovedLead;

  const filter = buildEligibilityFilter(now);

  // Step 1 — read the eligible set. .lean() + projection: just the _id.
  // We don't trust this read for the actual reactivation — Step 2's
  // per-lead CAS re-applies the filter at write time.
  const candidates = await Lead.find(filter).select('_id').lean();

  let reactivated = 0;
  let dispatched = 0;
  let dispatchFailed = 0;

  for (const c of candidates) {
    let flipped;
    try {
      // Step 2 — atomic check-and-set per lead. Re-applying the filter
      // means another cron instance (or, in theory, a future code path)
      // that already reactivated this lead loses the race here.
      flipped = await Lead.findOneAndUpdate(
        { _id: c._id, ...filter },
        {
          $set: {
            auctionStatus: 'active',
            auctionEndsAt: new Date(now.getTime() + ONE_DAY_MS),
          },
        },
        { new: true, projection: { _id: 1 } }
      );
    } catch (err) {
      // Per-lead Mongo failure — log and move on. Halt would let one bad
      // lead block every subsequent reactivation in the same tick.
      console.error(
        `[reactivateLeads] CAS failed for ${c._id}: ${err.message}`
      );
      continue;
    }

    if (!flipped) {
      // Raced with another instance — that one will dispatch.
      continue;
    }
    reactivated++;

    try {
      // Use the canonical orchestrator. No { force: true } — we want
      // the per-channel notifiedAt guard to short-circuit a lead that
      // was already broadcast on a prior reactivation.
      const result = await dispatchFn(flipped._id, {
        source: 'cron.reactivate',
      });
      // Per-lead Mongo / Twilio failures inside dispatchApprovedLead are
      // already swallowed at the broadcaster level. A non-dispatched
      // result here typically means the lead failed the fresh visibility
      // check (a rare race between our CAS and an admin reject). Treat
      // those as expected — only true throws count as dispatchFailed.
      if (result && result.dispatched === true) {
        dispatched++;
      }
    } catch (err) {
      dispatchFailed++;
      console.error(
        `[reactivateLeads] dispatch failed for ${flipped._id}: ${err.message}`
      );
    }
  }

  return {
    candidateCount: candidates.length,
    reactivated,
    dispatched,
    dispatchFailed,
  };
}

// Schedule — every 5 minutes. See file-header for cadence rationale.
// The scheduled task handle is exported so the test suite (which doesn't
// run inside a long-lived server process) can `.stop()` it after
// behavioral assertions complete; otherwise node-cron keeps the event
// loop alive and the test process hangs.
const scheduledTask = cron.schedule('*/5 * * * *', async () => {
  try {
    const summary = await reactivateLeads();
    if (summary.reactivated > 0 || summary.dispatchFailed > 0) {
      console.log(
        `[reactivateLeads] candidates=${summary.candidateCount} ` +
          `reactivated=${summary.reactivated} ` +
          `dispatched=${summary.dispatched} ` +
          `dispatchFailed=${summary.dispatchFailed}`
      );
    }
  } catch (err) {
    console.error('[reactivateLeads] tick failed:', err.message);
  }
});

module.exports = { reactivateLeads, buildEligibilityFilter, scheduledTask, MAX_REACTIVATION_AGE_MS };
