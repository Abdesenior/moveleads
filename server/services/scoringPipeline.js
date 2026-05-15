/**
 * Scoring Pipeline — V5 Phase 1 orchestrator.
 *
 * Runs the new deterministic scoring engine + tier router for a Lead and
 * persists the result to the `scoring_snapshots` collection. Designed for
 * fire-and-forget invocation right after `lead.save()` in the existing
 * `/api/leads/ingest` handler — same pattern as `verifyLeadPhone`.
 *
 * Shadow-mode invariants (Phase 1 → Phase 6):
 *   - The full scoring breakdown stays in ScoringSnapshot (never on Lead).
 *   - As of Phase 6, ONE field (`Lead.shadowTier`) is mirrored from the
 *     snapshot's tier so leadVisibility.moverVisibilityFilter() can apply a
 *     query-time filter without joining the snapshot collection per request.
 *     The mirror write is best-effort; its failure does not fail the snapshot.
 *   - NEVER throw out of a fire-and-forget caller
 *   - NEVER make an external API call (engine + router are pure)
 *
 * Gating: `SCORING_MODE` env var. Default `shadow`. Set to `off` to disable
 * entirely (for hotfix rollback without redeploying code).
 */

const Lead = require('../models/Lead');
const ScoringSnapshot = require('../models/ScoringSnapshot');
const leadScoringEngine = require('./leadScoringEngine');
const leadTierRouter = require('./leadTierRouter');
const { computeStructuralBlockers } = require('../utils/leadVisibility');

function currentMode() {
  const m = (process.env.SCORING_MODE || 'shadow').toLowerCase();
  if (m === 'off' || m === 'shadow' || m === 'live') return m;
  return 'shadow';
}

/**
 * Shadow-mode: compute scores + tier and write a ScoringSnapshot. Never
 * touches the Lead. Safe to call without `await`.
 *
 * @param {String|ObjectId} leadId
 * @returns {Promise<Object|null>} the saved snapshot doc, or null if skipped/failed
 */
async function runShadow(leadId) {
  if (currentMode() === 'off') return null;

  try {
    const lead = await Lead.findById(leadId).lean();
    if (!lead) {
      console.warn(`[scoringPipeline] lead not found: ${leadId}`);
      return null;
    }

    const { scores, breakdown, engineVersion } = leadScoringEngine.score(lead);
    const { tier, tierReason } = leadTierRouter.assign(scores, lead);

    const snapshot = await ScoringSnapshot.create({
      leadId: lead._id,
      engineVersion,
      mode: 'shadow',
      scores,
      tier,
      tierReason,
      // Phase 2: capture the lead status at the moment of scoring so that when
      // a baseline + enriched snapshot pair coexist, admin can tell which one
      // ran pre-Twilio-verifyLeadPhone vs post.
      leadStatusAtScoring: lead.status,
      legacy: {
        score: lead.score,
        grade: lead.grade,
      },
      breakdown,
    });

    // Phase 6 / 6.3 — mirror tier onto Lead.shadowTier AND flip qualityGateCleared
    // in the SAME atomic update so the visibility filter sees consistent state.
    //
    //   - shadowTier: the latest tier (used by Mongo filter + isHiddenFromMovers)
    //   - qualityGateCleared: TRUE for non-rejected tiers (lead becomes visible),
    //                         FALSE for rejected tiers (stays hidden).
    //
    // V5 leads start with qualityGateCleared=false at ingest. After this update
    // they either become visible (cleared=true) or remain hidden (cleared=false).
    // Failure here doesn't affect the snapshot; the lead stays hidden (safe).
    if (tier) {
      // Phase 6.4 — also denormalize structural blockers for blocked_and_review
      // routing. Computed from the same `lead` doc the engine just scored, so
      // it reflects the validation state that produced this tier.
      // Phase 6.9 — AWAITED. Previously this updateOne was fire-and-forget,
      // which left a ~ms-scale race window where the V5 sequential chain
      // could move on to verifyLeadPhone before the mirror landed on the
      // Lead doc. Awaiting it makes the "sequential qualification" guarantee
      // strict: when scoringPipeline.runShadow resolves, the Lead row has
      // the new shadowTier/qualityGateCleared/structuralBlockers committed.
      // Errors are logged but not re-thrown — the snapshot save is still
      // authoritative; a failed mirror leaves the Lead doc with stale
      // (or missing) denormalized fields, which the visibility filter
      // treats as "still pending" (safe default).
      const structuralBlockers = computeStructuralBlockers(lead);
      try {
        await Lead.updateOne(
          { _id: lead._id },
          { $set: {
              shadowTier: tier,
              shadowTierUpdatedAt: new Date(),
              qualityGateCleared: tier !== 'rejected',
              structuralBlockers,
          } }
        );
      } catch (err) {
        console.warn(`[scoringPipeline] shadowTier/gate/blockers mirror failed for ${lead._id}:`, err.message);
      }
    }

    return snapshot;
  } catch (err) {
    // Shadow mode must never affect production. Log loudly, return null.
    console.error(`[scoringPipeline] shadow run failed for lead ${leadId}:`, err.message);
    return null;
  }
}

module.exports = {
  runShadow,
  currentMode,
};
