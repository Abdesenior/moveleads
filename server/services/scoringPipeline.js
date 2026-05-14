/**
 * Scoring Pipeline — V5 Phase 1 orchestrator.
 *
 * Runs the new deterministic scoring engine + tier router for a Lead and
 * persists the result to the `scoring_snapshots` collection. Designed for
 * fire-and-forget invocation right after `lead.save()` in the existing
 * `/api/leads/ingest` handler — same pattern as `verifyLeadPhone`.
 *
 * Strict shadow-mode invariants (Phase 1):
 *   - NEVER mutate the Lead document
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
