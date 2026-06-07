/**
 * Distribution Decision — Phase 1 unified visibility layer.
 *
 * Single authoritative field on Lead (`distributionDecision`) replaces the
 * 8-clause AND filter that currently gates mover-feed visibility. Separates:
 *
 *   - EVIDENCE  (validation.*, shadowTier, structuralBlockers,
 *                qualityGateCleared)  ←  pipeline writes only, never gates feed
 *   - DECISION  (distributionDecision)                ←  what gates the feed
 *   - PLACEMENT (distributionModel, inventoryChannel,
 *                moveDate, status)                    ←  orthogonal axes
 *
 * Phase 1 invariant: this module is WRITE-ONLY. The legacy
 * moverVisibilityFilter / isHiddenFromMovers in leadVisibility.js remain
 * authoritative for production reads. Phase 2 will shadow-compare the new
 * filter against the old; Phase 3 flips reads to the new field.
 *
 * Stickiness contract: pipeline callers (scoringPipeline, verifyLeadPhone)
 * MUST guard their updateOne with `{ distributionDecision: { $in: SYSTEM_VALUES } }`
 * so an admin_* value cannot be silently clobbered by a later pipeline run.
 * This is what fixes rescore-undoes-approve.
 */

const { computeStructuralBlockers, HIDE_WORTHY_STRUCTURAL_CODES } = require('./leadVisibility');

const SYSTEM_VALUES = Object.freeze([
  'system_pending',
  'system_approved',
  'system_held',
  'system_rejected',
]);

const ADMIN_VALUES = Object.freeze(['admin_approved', 'admin_rejected']);

const ALL_VALUES = Object.freeze([...SYSTEM_VALUES, ...ADMIN_VALUES]);

// Values that distribute on the mover-facing main feed. Future read-side
// callers will use this set; not consulted in Phase 1 production reads.
const DISTRIBUTABLE_VALUES = Object.freeze(['system_approved', 'admin_approved']);

/**
 * Pure function — derive the SYSTEM verdict for a lead from its evidence.
 *
 * Never returns an admin_* value. The caller is responsible for the
 * stickiness check before writing the result.
 *
 * Priority order (each rule is independent):
 *
 *   1. status === 'REJECTED_FAKE'           → system_rejected
 *   2. qualityGateCleared=false + no shadowTier → system_pending
 *      (V5 lead at ingest, scoring not yet run)
 *   3. shadowTier === 'rejected'            → system_rejected
 *   4. shadowTier === 'review'              → system_held
 *   5. structuralBlockers ∩ HIDE_WORTHY     → system_held
 *      (denormalized field preferred; falls back to computing from validation)
 *   6. raw validation signals               → system_held
 *      - validation.phone.suspicionPattern present
 *      - validation.phone.valid === false
 *      - validation.phone.providerSuspicion === 'high'
 *      - validation.fraud.smsPumpingRisk === 'high'
 *      - validation.fingerprint.bot === true
 *   6.5 contact-trust gate (feature-flagged)→ system_held
 *      (Promotes contact legitimacy to a PRIMARY gate so move-value
 *      signals can't auto-approve a weak-trust lead. See
 *      _contactTrustGateReason for the five sub-rules.)
 *   7. default                              → system_approved
 *
 * Reject is reserved for EXPLICIT verdicts (admin REJECTED_FAKE or scoring
 * engine 'rejected'). Every other "bad" signal produces system_held — admin
 * can still approve to make the lead distributable.
 *
 * @param {Object|null|undefined} lead - Lead document (lean or mongoose)
 * @returns {'system_pending'|'system_approved'|'system_held'|'system_rejected'}
 */
function deriveSystemDecision(lead) {
  if (!lead) return 'system_pending';

  // (1) Lifecycle reject wins. status=REJECTED_FAKE means admin manually
  //     marked the lead fake — system mirrors that decision.
  if (lead.status === 'REJECTED_FAKE') return 'system_rejected';

  // (2) Pipeline-in-progress detection. V5 leads start with
  //     qualityGateCleared=false at ingest; the gate flips when scoring
  //     writes shadowTier. Disambiguate "pre-scoring" from "post-rejected"
  //     via shadowTier presence.
  const gateFalse = lead.qualityGateCleared === false;
  const hasTier   = lead.shadowTier != null;
  if (gateFalse && !hasTier) return 'system_pending';

  // (3-4) Scoring verdicts on shadowTier.
  if (lead.shadowTier === 'rejected') return 'system_rejected';
  if (lead.shadowTier === 'review')   return 'system_held';

  // (5) Structural blockers — prefer denormalized field, fall back to compute.
  //     Held (NOT rejected): admin can still approve to distribute.
  const blockers = Array.isArray(lead.structuralBlockers)
    ? lead.structuralBlockers
    : computeStructuralBlockers(lead);
  if (blockers.some(c => HIDE_WORTHY_STRUCTURAL_CODES.includes(c))) {
    return 'system_held';
  }

  // (6) Raw-validation fallback. Defends against stale denormalization
  //     (denormalized array missing or out-of-date relative to validation).
  const v = lead.validation || {};
  if (v.phone && v.phone.suspicionPattern)             return 'system_held';
  if (v.phone && v.phone.valid === false)              return 'system_held';
  if (v.phone && v.phone.providerSuspicion === 'high') return 'system_held';
  if (v.fraud && v.fraud.smsPumpingRisk === 'high')    return 'system_held';
  if (v.fingerprint && v.fingerprint.bot === true)     return 'system_held';

  // (6.5) Contact-trust gate (feature-flagged, 2026-06-06).
  //       Hardens the approval gate so contact legitimacy is the PRIMARY
  //       requirement rather than an advisory weight in the composite.
  //       Every rule returns system_held — admin can still approve to
  //       publish any held lead, mirroring the held-not-rejected semantic
  //       used elsewhere in this function.
  //
  //       Toggle via env: CONTACT_TRUST_GATE_ENABLED=true. When the flag
  //       is unset or 'false' the gate is bypassed and the function
  //       behaves exactly as before.
  if (process.env.CONTACT_TRUST_GATE_ENABLED === 'true') {
    const gateReason = _contactTrustGateReason(lead);
    if (gateReason) {
      _logContactTrustGate(lead, gateReason);
      return 'system_held';
    }
  }

  // (7) Default: trust. Legacy leads (no V5 fields) land here, AND V5
  //     leads with shadowTier in {standard, premium, hot} and no blockers.
  return 'system_approved';
}

/**
 * Contact-trust gate — checks the five operator-approved sub-rules in
 * order. Returns the first matching reason string, or null if the lead
 * passes every rule.
 *
 * Pure function — no side effects, no env reads. Caller (deriveSystem-
 * Decision) gates the env check.
 *
 * @param {Object} lead
 * @returns {string|null} reason code or null if the gate is silent
 */
function _contactTrustGateReason(lead) {
  const v = lead.validation || {};
  const phone = v.phone || {};
  const scores = lead.scores || {};
  const identity = phone.identityMatch || {};
  const hasNameMatch =
    identity.firstNameMatch === true || identity.lastNameMatch === true;

  // Rule 1 — Landline without identity match.
  // Landline is a real number but the lowest-trust line type. A name
  // match (Twilio Lookup verification of owner first/last name)
  // overrides the block; an unverified landline does not.
  if (phone.lineType === 'landline' && !hasNameMatch) {
    return 'landline_no_identity_match';
  }

  // Rule 2 — VoIP / fixed VoIP. Always held; identity match does NOT
  // override (per spec — VoIP is the most common burner-phone vector).
  if (
    phone.lineType === 'voip' ||
    phone.lineType === 'fixedvoip' ||
    phone.isVoip === true
  ) {
    return 'voip';
  }

  // Rule 3 — No telecom enrichment. Either Twilio Verify explicitly
  // reported no enrichment, or Lookup never ran (no checkedAt). Both
  // mean we have no carrier evidence to back the number. An identity
  // match overrides the block.
  const noEnrichment =
    phone.validityReason === 'twilio_no_enrichment' ||
    phone.checkedAt == null;
  if (noEnrichment && !hasNameMatch) {
    return 'no_telecom_enrichment';
  }

  // Rule 4 — Trust score floor. A composite > 70 cannot save a lead
  // whose contact-trust sub-score is below 60; the score breakdown
  // is in services/leadScoringEngine.js trustScore block.
  if (typeof scores.trustScore === 'number' && scores.trustScore < 60) {
    return 'trust_score_below_60';
  }

  // Rule 5 — Composite cannot override marginal trust. If the composite
  // crosses the auto-approve band (>=70) on the back of move-value /
  // urgency / intent points while trust sits in the 60-64 grey zone,
  // hold for review.
  if (
    typeof scores.compositeScore === 'number' &&
    typeof scores.trustScore === 'number' &&
    scores.compositeScore >= 70 &&
    scores.trustScore < 65
  ) {
    return 'composite_overrides_weak_trust';
  }

  return null;
}

/**
 * Structured log when the contact-trust gate holds a lead. Tagged-string
 * format matches the existing [phoneVerification] / [Admin sandbox-reset]
 * conventions in this codebase so operators can grep for the tag.
 */
function _logContactTrustGate(lead, reason) {
  const v = lead.validation || {};
  const phone = v.phone || {};
  const scores = lead.scores || {};
  const identity = phone.identityMatch || {};
  // eslint-disable-next-line no-console
  console.warn(
    `[contactTrustGate] held leadId=${lead._id || lead.id || 'n/a'} ` +
    `reason=${reason} ` +
    `lineType=${phone.lineType || 'n/a'} ` +
    `trustScore=${scores.trustScore ?? 'n/a'} ` +
    `compositeScore=${scores.compositeScore ?? 'n/a'} ` +
    `validityReason=${phone.validityReason || 'n/a'} ` +
    `checkedAt=${phone.checkedAt ? new Date(phone.checkedAt).toISOString() : 'null'} ` +
    `firstNameMatch=${identity.firstNameMatch ?? 'n/a'} ` +
    `lastNameMatch=${identity.lastNameMatch ?? 'n/a'}`
  );
}

/**
 * @param {string|undefined} decision
 * @returns {boolean} true if the value is pipeline-owned (writable by system)
 */
function isSystemOwned(decision) {
  return SYSTEM_VALUES.includes(decision);
}

/**
 * @param {string|undefined} decision
 * @returns {boolean} true if the value is admin-owned (sticky against pipeline writes)
 */
function isAdminOwned(decision) {
  return ADMIN_VALUES.includes(decision);
}

/**
 * @param {string|undefined} decision
 * @returns {boolean} true if the lead is visible to movers on the main feed
 *                    (Phase 3 read-side will use this; not consulted in Phase 1)
 */
function isDistributable(decision) {
  return DISTRIBUTABLE_VALUES.includes(decision);
}

/**
 * One-line audit string describing the source of a system verdict. Helpful
 * for the distributionDecisionReason field. Never returns 'admin_*'.
 *
 * @param {Object} lead
 * @returns {string}
 */
function describeSystemDecisionSource(lead) {
  if (!lead) return 'no lead doc';
  if (lead.status === 'REJECTED_FAKE') return 'status=REJECTED_FAKE';
  const gateFalse = lead.qualityGateCleared === false;
  const hasTier   = lead.shadowTier != null;
  if (gateFalse && !hasTier) return 'pipeline pending';
  if (lead.shadowTier === 'rejected') return 'shadowTier=rejected';
  if (lead.shadowTier === 'review')   return 'shadowTier=review';
  const blockers = Array.isArray(lead.structuralBlockers)
    ? lead.structuralBlockers
    : computeStructuralBlockers(lead);
  const hits = blockers.filter(c => HIDE_WORTHY_STRUCTURAL_CODES.includes(c));
  if (hits.length > 0) return `structural:${hits.join(',')}`;
  const v = lead.validation || {};
  if (v.phone && v.phone.suspicionPattern)             return `raw:suspicionPattern=${v.phone.suspicionPattern}`;
  if (v.phone && v.phone.valid === false)              return 'raw:phone.valid=false';
  if (v.phone && v.phone.providerSuspicion === 'high') return 'raw:providerSuspicion=high';
  if (v.fraud && v.fraud.smsPumpingRisk === 'high')    return 'raw:smsPumpingRisk=high';
  if (v.fingerprint && v.fingerprint.bot === true)     return 'raw:fingerprint.bot=true';
  if (process.env.CONTACT_TRUST_GATE_ENABLED === 'true') {
    const reason = _contactTrustGateReason(lead);
    if (reason) return `contact_trust_gate:${reason}`;
  }
  return 'evidence clean';
}

module.exports = {
  SYSTEM_VALUES,
  ADMIN_VALUES,
  ALL_VALUES,
  DISTRIBUTABLE_VALUES,
  deriveSystemDecision,
  isSystemOwned,
  isAdminOwned,
  isDistributable,
  describeSystemDecisionSource,
};
