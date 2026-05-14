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

  // Fraud thresholds: hard-reject only on overwhelming evidence; medium
  // signals send to review queue instead. See `Force-review pass` below.
  fraudHardReject:   10,   // (was 20) only undeniable / compound fraud
  fraudForceReview:  35,   // (new)    suspicious-but-recoverable
};

function assign(scores, lead = {}) {
  const reasons = [];

  // ── Hard reject rules ─────────────────────────────────────────────────────
  // Only undeniable HIGH-severity fraud signals reach here. Any single one is
  // enough to auto-reject. Compound MEDIUM signals get caught by the
  // fraudRiskScore <= fraudHardReject catch-all below them.
  const hardRejectSignals = [];
  if (lead.status === 'REJECTED_FAKE') {
    hardRejectSignals.push('lead status is REJECTED_FAKE');
  }
  if (lead.validation?.fraud?.smsPumpingRisk === 'high') {
    hardRejectSignals.push('Twilio: high SMS pumping risk');
  }
  if (lead.validation?.fingerprint?.bot === true) {
    hardRejectSignals.push('fingerprint: confirmed bot');
  }
  if (scores.fraudRiskScore <= THRESHOLDS.fraudHardReject) {
    hardRejectSignals.push(`fraudRiskScore ${scores.fraudRiskScore} <= ${THRESHOLDS.fraudHardReject} (compounded mediums)`);
  }
  if (hardRejectSignals.length > 0) {
    reasons.push(`hard reject: ${hardRejectSignals.join('; ')}`);
    return { tier: 'rejected', tierReason: reasons };
  }

  // ── Review hard rules (suspicious but not fake) ──────────────────────────
  if (lead.intentConfirmed === false) {
    reasons.push('hard rule: intentConfirmed is false → review queue');
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

  // ── Force-review pass ────────────────────────────────────────────────────
  // Single MEDIUM fraud signals must not auto-reject — they should land in
  // the review queue so admin can decide. Compound signals already dropped
  // fraudRiskScore low enough to trigger the hard-reject rule above.
  //
  // Triggers (any of):
  //   - fraudRiskScore <= 35 (multiple soft hits accumulated)
  //   - Twilio: SMS pumping risk = medium
  //   - Twilio: lineType = voip (single VoIP line is suspicious, not certain)
  //   - Twilio: fraud.disposable flag set (derived from isVoip)
  //   - Mapbox: any suspicious route flag present
  //   - Fingerprint: vpn=true OR confidence < 0.3 (without bot=true)
  //
  // Only demotes if base tier is currently hot/premium/standard — leads
  // already in review or rejected aren't promoted up by this pass.
  if (tier === 'hot' || tier === 'premium' || tier === 'standard') {
    const reviewSignals = [];
    if (scores.fraudRiskScore <= THRESHOLDS.fraudForceReview) {
      reviewSignals.push(`fraudRiskScore ${scores.fraudRiskScore} <= ${THRESHOLDS.fraudForceReview}`);
    }
    if (lead.validation?.phone?.valid === false) {
      // Local NANP check or Twilio explicitly rejected the number. Even
      // without other signals, a fake/unallocated phone must not stay at
      // premium/hot tier. Force review so admin can decide.
      const rsn = lead.validation.phone.validityReason
        ? `phone invalid: ${lead.validation.phone.validityReason}`
        : 'phone invalid';
      reviewSignals.push(rsn);
    }
    if (lead.validation?.fraud?.smsPumpingRisk === 'medium') {
      reviewSignals.push('medium SMS pumping risk');
    }
    if (lead.validation?.phone?.lineType === 'voip') {
      reviewSignals.push('voip line type');
    }
    if (lead.validation?.fraud?.disposable === true) {
      reviewSignals.push('phone flagged disposable');
    }
    if (Array.isArray(lead.validation?.route?.suspicious) && lead.validation.route.suspicious.length > 0) {
      reviewSignals.push(`route flags: ${lead.validation.route.suspicious.join('+')}`);
    }
    if (lead.validation?.fingerprint?.vpn === true) {
      reviewSignals.push('fingerprint: vpn');
    }
    if (typeof lead.validation?.fingerprint?.confidence === 'number'
        && lead.validation.fingerprint.confidence < 0.3
        && lead.validation.fingerprint.bot !== true) {
      reviewSignals.push(`fingerprint low confidence (${lead.validation.fingerprint.confidence})`);
    }

    if (reviewSignals.length > 0) {
      reasons.push(`force-review: ${reviewSignals.join('; ')}`);
      tier = 'review';
    }
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
