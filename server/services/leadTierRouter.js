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

  // ── PHASE 3.7 EXPLICIT GUARANTEE ─────────────────────────────────────────
  // An invalid phone CANNOT reach hot/premium/standard. Promoted to an
  // explicit early hard rule (was only enforced via the force-review pass
  // below). This rule fires AFTER hard rejects (1-4) so compound fraud
  // (invalid phone + high SMS / bot / REJECTED_FAKE / fraudRiskScore<=10)
  // still produces 'rejected' rather than being demoted to 'review'.
  //
  // Combined with the -40 fraud penalty in leadScoringEngine.fraudRiskScore,
  // this guarantees:
  //   - phone invalid alone                       → tier='review'
  //   - phone invalid + 1 medium fraud signal     → tier='review' (close to reject)
  //   - phone invalid + 2 medium fraud signals    → tier='rejected' (fraudRiskScore<=10)
  //   - phone invalid + any high fraud signal     → tier='rejected'
  //   - phone invalid + admin REJECTED_FAKE       → tier='rejected'
  if (lead.validation?.phone?.valid === false) {
    const rsn = lead.validation.phone.validityReason
      ? `phone invalid: ${lead.validation.phone.validityReason}`
      : 'phone invalid';
    reasons.push(`hard rule: ${rsn} → review (no hot path)`);
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

  // ── Telecom-unverified soft cap (premium max — no Twilio data at all) ──
  // Phase 3.8 + Phase 4.1: distinguished from "telecom_low_confidence".
  // Telecom-unverified means Twilio truly didn't run (toggle off, env off,
  // skipped, or no checkedAt timestamp). The lead has NO telecom signal —
  // we genuinely don't know. Cap at premium (HOT not possible), don't
  // force review.
  //
  // The DIFFERENT case (Twilio ran but returned no enrichment) used to be
  // collapsed into this same soft-cap. It's now split out as
  // 'twilio_no_enrichment' → force-review (handled in the next pass), since
  // active emptiness is a stronger negative signal than absence.
  const phoneV = lead.validation?.phone;
  const phoneRan = phoneV && phoneV.checkedAt;
  const telecomUnverified =
    !phoneV ||
    !phoneRan ||
    (
      phoneV.valid !== false &&
      phoneV.validityReason !== 'twilio_no_enrichment' &&
      phoneV.lineType == null &&
      phoneV.smsPumpingRisk == null &&
      !phoneV.identityMatch
    );
  if (telecomUnverified && tier === 'hot') {
    tier = 'premium';
    reasons.push('soft cap: telecom unverified → max premium (no hot without lookup)');
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
    // Phase 3.8: suspicionPattern is a SOFT signal — number could be real
    // but pattern shape (e.g. alternating 5-7 chars, monotonic, low-distinct)
    // suggests garbage input. Even if Twilio recognized + low SMS risk,
    // force review so admin sees it. Does NOT compound to rejected on its
    // own — that requires phone.valid===false or other compound fraud.
    if (lead.validation?.phone?.suspicionPattern) {
      reviewSignals.push(`suspicious phone pattern (${lead.validation.phone.suspicionPattern})`);
    }
    // Phase 4.1: telecom_low_confidence — Twilio ran but returned no
    // enrichment. A real number usually has at least a line type; empty
    // enrichment is mildly suspicious. Forces review even if everything
    // else looks fine. Distinct from telecom_unverified (no Twilio at all
    // → soft cap at premium above), which is just "we didn't look".
    if (lead.validation?.phone?.validityReason === 'twilio_no_enrichment') {
      reviewSignals.push('low telecom confidence (Twilio returned no enrichment)');
    }
    if (lead.validation?.fraud?.smsPumpingRisk === 'medium') {
      reviewSignals.push('medium SMS pumping risk');
    }
    // VoIP catch — use the isVoip boolean rather than exact-match against
    // 'voip', because Twilio LTI returns subtypes like 'fixedvoip' and
    // 'nonfixedvoip'. The normalizer's regex-based isVoip flag catches all.
    if (lead.validation?.phone?.isVoip === true) {
      const lt = lead.validation.phone.lineType || 'voip';
      reviewSignals.push(`voip line type (${lt})`);
    }
    if (lead.validation?.fraud?.disposable === true) {
      reviewSignals.push('phone flagged disposable');
    }
    if (Array.isArray(lead.validation?.route?.suspicious) && lead.validation.route.suspicious.length > 0) {
      reviewSignals.push(`route flags: ${lead.validation.route.suspicious.join('+')}`);
    }
    // Phase 3.9 — explicit tier caps for route/distance unresolvability:
    //   1. Mapbox couldn't resolve origin OR destination ZIP → route_unresolved
    //   2. miles is 0 (no client/server distance, no Mapbox geocode) →
    //      distance_unknown
    // User spec: "If distance is unknown or either ZIP is unresolved, tier
    // cannot be hot; should go to review or at most standard". We force-review
    // (max=review) which is the strictest interpretation — safer.
    const routeSuspicious = lead.validation?.route?.suspicious || [];
    const originUnresolved = routeSuspicious.includes('origin_zip_not_found');
    const destUnresolved = routeSuspicious.includes('destination_zip_not_found');
    if (originUnresolved || destUnresolved) {
      reviewSignals.push(`route unresolved (${[originUnresolved && 'origin', destUnresolved && 'destination'].filter(Boolean).join(' + ')} ZIP not found in Mapbox)`);
    }
    if (!Number(lead.miles) || Number(lead.miles) <= 0) {
      reviewSignals.push('distance unknown (miles = 0)');
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
