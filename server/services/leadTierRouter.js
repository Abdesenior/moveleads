/**
 * Lead Tier Router — V5 deterministic tier assignment.
 *
 * Phase 1 (shadow mode): output is consumed only by scoringPipeline and stored
 * in `scoring_snapshots`. NEVER influences mover dashboard visibility,
 * pricing, broadcast, or dispatch.
 *
 * Pure function: given the scores returned by leadScoringEngine plus a `lead`
 * object (for hard-rule overrides like REJECTED_FAKE), returns
 * `{ tier, tierReason: [...] }`.
 *
 * Tier ladder (high → low): hot, premium, standard, review, rejected.
 *
 * Threshold values are placeholders. Real thresholds will be tuned against
 * shadow-mode distribution data before SCORING_MODE flips to live.
 */

const TIERS = ['hot', 'premium', 'standard', 'review', 'rejected'];

const THRESHOLDS = {
  hotComposite:      85,
  premiumComposite:  70,
  standardComposite: 50,
  reviewComposite:   30,
  // below reviewComposite → rejected
};

function assign(scores, lead = {}) {
  const reasons = [];

  // ── Hard rules (override anything the composite says) ─────────────────────
  if (lead.status === 'REJECTED_FAKE') {
    reasons.push('hard rule: lead status is REJECTED_FAKE');
    return { tier: 'rejected', tierReason: reasons };
  }
  if (scores.fraudRiskScore <= 20) {
    reasons.push(`hard rule: fraudRiskScore <= 20 (${scores.fraudRiskScore})`);
    return { tier: 'rejected', tierReason: reasons };
  }
  if (lead.intentConfirmed === false) {
    reasons.push('hard rule: intentConfirmed is false → low_trust review');
    return { tier: 'review', tierReason: reasons };
  }
  if (lead.status === 'PENDING_MANUAL_REVIEW') {
    reasons.push('hard rule: lead status is PENDING_MANUAL_REVIEW');
    return { tier: 'review', tierReason: reasons };
  }

  // ── Composite-based tier ──────────────────────────────────────────────────
  const c = scores.compositeScore || 0;
  let tier;
  if (c >= THRESHOLDS.hotComposite) {
    tier = 'hot';
    reasons.push(`composite ${c} >= ${THRESHOLDS.hotComposite} (hot threshold)`);
  } else if (c >= THRESHOLDS.premiumComposite) {
    tier = 'premium';
    reasons.push(`composite ${c} >= ${THRESHOLDS.premiumComposite} (premium threshold)`);
  } else if (c >= THRESHOLDS.standardComposite) {
    tier = 'standard';
    reasons.push(`composite ${c} >= ${THRESHOLDS.standardComposite} (standard threshold)`);
  } else if (c >= THRESHOLDS.reviewComposite) {
    tier = 'review';
    reasons.push(`composite ${c} >= ${THRESHOLDS.reviewComposite} (review threshold)`);
  } else {
    tier = 'rejected';
    reasons.push(`composite ${c} < ${THRESHOLDS.reviewComposite} (below review)`);
  }

  // ── Soft-downgrades (a high composite alone shouldn't promote a sketchy lead) ─
  if (tier === 'hot' && scores.trustScore < 60) {
    tier = 'premium';
    reasons.push(`soft downgrade: trustScore ${scores.trustScore} < 60 (hot → premium)`);
  }
  if ((tier === 'hot' || tier === 'premium') && scores.urgencyScore < 40) {
    tier = 'standard';
    reasons.push(`soft downgrade: urgencyScore ${scores.urgencyScore} < 40 (→ standard)`);
  }

  // ── Admin override always wins ────────────────────────────────────────────
  if (lead.adminTierOverride && lead.adminTierOverride.tier && TIERS.includes(lead.adminTierOverride.tier)) {
    reasons.unshift(`admin override → ${lead.adminTierOverride.tier} (reason: ${lead.adminTierOverride.reason || 'n/a'})`);
    return { tier: lead.adminTierOverride.tier, tierReason: reasons };
  }

  return { tier, tierReason: reasons };
}

module.exports = {
  assign,
  TIERS,
  THRESHOLDS,
};
