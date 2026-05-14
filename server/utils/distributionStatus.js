/**
 * Distribution-readiness helper — Phase 4 admin review workflow.
 *
 * Pure function. Given a Lead document and (optionally) its most-recent
 * ScoringSnapshot, returns:
 *
 *   {
 *     status: 'Ready' | 'Review Required' | 'Blocked' | 'Rejected',
 *     capReasons: [ { code, message, severity } ]
 *   }
 *
 * Status semantics:
 *
 *   Ready           — tier ∈ {hot, premium, standard}, no validation issues,
 *                     no admin review pending. Lead would be visible to
 *                     movers if ENABLE_TIERED_ROUTING flipped on.
 *
 *   Review Required — tier === 'review' (natural OR via override), or any
 *                     "force-review" signal is present (phone invalid, voip,
 *                     suspicious phone pattern, route unresolved, distance
 *                     unknown, intent not confirmed). Needs admin attention.
 *
 *   Blocked         — telecom unverified (no Twilio enrichment available).
 *                     Soft-capped at premium — cannot reach hot until we
 *                     have telecom data. Not "Review Required" because the
 *                     lead is otherwise fine; the gating is operational
 *                     (admin needs to enable Twilio, not approve the lead).
 *
 *   Rejected        — tier === 'rejected' OR status === 'REJECTED_FAKE'.
 *                     Lead would be filtered out under tiered routing.
 *
 * capReasons explain SPECIFICALLY why a lead cannot reach hot tier. Used
 * by the admin modal to surface "this lead is at premium because…".
 *
 * Used by the /api/admin/leads/:id/scoring-snapshot endpoint and by the
 * AdminQuality client to compute review-queue filters.
 */

function computeCapReasons(lead, snapshot) {
  const reasons = [];
  const phone = lead.validation && lead.validation.phone;
  const route = lead.validation && lead.validation.route;
  const fraud = lead.validation && lead.validation.fraud;
  const fp    = lead.validation && lead.validation.fingerprint;

  // ── Phone-level caps ──────────────────────────────────────────────────
  if (phone && phone.valid === false) {
    reasons.push({
      code: 'phone_invalid',
      message: phone.validityReason
        ? `phone invalid: ${phone.validityReason}`
        : 'phone invalid',
      severity: 'high',
    });
  }
  if (phone && phone.isVoip === true) {
    reasons.push({
      code: 'voip_line',
      message: `voip line detected${phone.lineType ? ` (${phone.lineType})` : ''}`,
      severity: 'medium',
    });
  }
  if (phone && phone.suspicionPattern) {
    reasons.push({
      code: 'suspicious_phone_pattern',
      message: `suspicious phone pattern (${phone.suspicionPattern})`,
      severity: 'medium',
    });
  }

  // ── Telecom confidence — three distinct states ─────────────────────────
  // Phase 4.1: split "telecom unverified" into two cap reasons.
  //
  //   telecom_low_confidence (severity: medium → Review Required)
  //     Twilio ACTIVELY looked up the number and returned no useful
  //     enrichment (validityReason === 'twilio_no_enrichment'). A real
  //     allocated number usually has at least a line type; active emptiness
  //     is a stronger negative signal than not asking at all.
  //
  //   telecom_unverified (severity: low → Blocked, premium soft-cap)
  //     Twilio never ran (toggle off, env off, timeout, or no checkedAt).
  //     We genuinely don't know — neutral, can still be premium.
  //
  // The cases are mutually exclusive: low_confidence requires Twilio to have
  // actually run (checkedAt + validityReason marker), and unverified covers
  // the truly-no-data case.
  if (phone && phone.valid !== false) {
    if (phone.validityReason === 'twilio_no_enrichment') {
      reasons.push({
        code: 'telecom_low_confidence',
        message: 'telecom low confidence — Twilio returned no enrichment',
        severity: 'medium', // forces Review Required
      });
    } else {
      const phoneRan = phone.checkedAt != null;
      const noEnrichment = phone.lineType == null && phone.smsPumpingRisk == null && !phone.identityMatch;
      if (!phoneRan || noEnrichment) {
        reasons.push({
          code: 'telecom_unverified',
          message: 'telecom unverified — no Twilio lookup performed',
          severity: 'low', // soft cap (premium), not force-review
        });
      }
    }
  } else if (!phone) {
    // Truly no telecom validation at all (Twilio toggle off, no record on lead)
    reasons.push({
      code: 'telecom_unverified',
      message: 'telecom unverified — no Twilio lookup performed',
      severity: 'low',
    });
  }

  // ── Route-level caps ───────────────────────────────────────────────────
  const suspicious = (route && Array.isArray(route.suspicious)) ? route.suspicious : [];
  const originUnresolved = suspicious.includes('origin_zip_not_found');
  const destUnresolved   = suspicious.includes('destination_zip_not_found');
  if (originUnresolved || destUnresolved) {
    const which = [originUnresolved && 'origin', destUnresolved && 'destination']
      .filter(Boolean).join(' + ');
    reasons.push({
      code: 'route_unresolved',
      message: `route unresolved — ${which} ZIP not found in Mapbox`,
      severity: 'medium',
    });
  }
  if (!Number(lead.miles) || Number(lead.miles) <= 0) {
    reasons.push({
      code: 'distance_unknown',
      message: 'distance unknown (miles = 0)',
      severity: 'medium',
    });
  }

  // Other route suspicious flags (same_origin_destination, miles_divergence_high,
  // origin_not_us, destination_not_us) — surfaced as separate cap reasons.
  for (const flag of suspicious) {
    if (flag === 'origin_zip_not_found' || flag === 'destination_zip_not_found') continue;
    reasons.push({
      code: `route_${flag}`,
      message: `route flag: ${flag}`,
      severity: flag === 'same_origin_destination' || flag.endsWith('_not_us') ? 'high' : 'medium',
    });
  }

  // ── Intent ─────────────────────────────────────────────────────────────
  if (lead.intentConfirmed === false) {
    reasons.push({
      code: 'intent_not_confirmed',
      message: 'intent not confirmed (V5 intentConfirmed = false)',
      severity: 'medium',
    });
  }

  // ── Fraud signals ──────────────────────────────────────────────────────
  if (fraud && fraud.smsPumpingRisk === 'high') {
    reasons.push({ code: 'sms_pumping_high', message: 'high SMS pumping risk', severity: 'high' });
  }
  if (fraud && fraud.smsPumpingRisk === 'medium') {
    reasons.push({ code: 'sms_pumping_medium', message: 'medium SMS pumping risk', severity: 'medium' });
  }
  if (fp && fp.bot === true) {
    reasons.push({ code: 'fingerprint_bot', message: 'fingerprint: confirmed bot', severity: 'high' });
  }
  if (fp && fp.vpn === true) {
    reasons.push({ code: 'fingerprint_vpn', message: 'fingerprint: vpn', severity: 'medium' });
  }
  if (fp && typeof fp.confidence === 'number' && fp.confidence < 0.3 && fp.bot !== true) {
    reasons.push({
      code: 'fingerprint_low_confidence',
      message: `fingerprint low confidence (${fp.confidence})`,
      severity: 'medium',
    });
  }

  // ── Lead-status caps ──────────────────────────────────────────────────
  if (lead.status === 'PENDING_MANUAL_REVIEW') {
    reasons.push({
      code: 'pending_manual_review',
      message: 'lead status: PENDING_MANUAL_REVIEW',
      severity: 'medium',
    });
  }
  if (lead.status === 'REJECTED_FAKE') {
    reasons.push({
      code: 'admin_rejected_fake',
      message: 'admin marked REJECTED_FAKE',
      severity: 'high',
    });
  }

  // ── Snapshot composite contributing factor (informational only) ──────
  if (snapshot && snapshot.scores) {
    const fraudScore = snapshot.scores.fraudRiskScore;
    if (typeof fraudScore === 'number' && fraudScore <= 10) {
      reasons.push({
        code: 'compound_fraud',
        message: `fraudRiskScore ${fraudScore} ≤ 10 (compound fraud → rejected)`,
        severity: 'high',
      });
    } else if (typeof fraudScore === 'number' && fraudScore <= 35) {
      reasons.push({
        code: 'elevated_fraud',
        message: `fraudRiskScore ${fraudScore} ≤ 35 (elevated)`,
        severity: 'medium',
      });
    }
  }

  return reasons;
}

function computeDistributionStatus(lead, snapshot) {
  const tier = (snapshot && snapshot.tier) || null;
  const capReasons = computeCapReasons(lead, snapshot);

  // Rejected is the strongest signal — always win.
  if (lead.status === 'REJECTED_FAKE' || tier === 'rejected') {
    return { status: 'Rejected', capReasons, tier };
  }

  // Admin override → respect the override's implied status.
  const overrideTier = lead.adminTierOverride && lead.adminTierOverride.tier;
  if (overrideTier === 'rejected') {
    return { status: 'Rejected', capReasons, tier, override: overrideTier };
  }
  if (overrideTier === 'review') {
    return { status: 'Review Required', capReasons, tier, override: overrideTier };
  }
  if (overrideTier && ['hot', 'premium', 'standard'].includes(overrideTier)) {
    return { status: 'Ready', capReasons, tier, override: overrideTier };
  }

  // Natural tier is 'review' OR any high/medium-severity cap reason fires.
  const highOrMediumCap = capReasons.some(r => r.severity === 'high' || r.severity === 'medium');
  if (tier === 'review' || highOrMediumCap) {
    return { status: 'Review Required', capReasons, tier };
  }

  // Telecom-unverified is the only low-severity cap that triggers 'Blocked'.
  // (Lead is otherwise fine; just can't reach hot until telecom data exists.)
  const lowSeverityCap = capReasons.find(r => r.severity === 'low');
  if (lowSeverityCap && tier === 'premium') {
    return { status: 'Blocked', capReasons, tier };
  }

  return { status: 'Ready', capReasons, tier };
}

module.exports = {
  computeDistributionStatus,
  computeCapReasons,
};
