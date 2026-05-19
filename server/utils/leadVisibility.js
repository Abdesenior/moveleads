/**
 * Lead Visibility — Phase 3 cutover.
 *
 * Single authoritative quality gate is now `Lead.distributionDecision`
 * (see utils/distributionDecision.js). This module retains the historical
 * helper names so the broadcast/claim/bid paths don't need migration, but
 * every visibility function now delegates to the new field:
 *
 *   moverVisibilityFilter() → { distributionDecision: { $in: [system_approved, admin_approved] } }
 *   isHiddenFromMovers(lead) → !isDistributable(lead.distributionDecision)
 *   isHiddenFromMoversById(id) → fetches distributionDecision, same check
 *   hiddenReason(lead) → short string explaining the current decision value
 *
 * Retired (Phase 3):
 *   - The 8-clause AND filter on shadowTier / qualityGateCleared /
 *     structuralBlockers / validation.*
 *   - The `ENABLE_TIERED_ROUTING` env modes (off / rejected_only /
 *     blocked_and_review) — `routingMode()` still parses the env for
 *     audit/log purposes but no code branches on it for visibility
 *   - The first-week monitoring counters (still callable so existing
 *     log lines don't crash, but only the recordFeedHidden is wired in
 *     today — that call was removed from routes/leads.js in Phase 3)
 *
 * Kept as evidence/audit (unchanged):
 *   - computeStructuralBlockers — used by scoringPipeline to denormalize
 *     structuralBlockers onto Lead, and by distributionDecision derivation
 *   - HIDE_WORTHY_STRUCTURAL_CODES — same audience
 *
 * Rollback: revert this file + routes/leads.js + adminInventory changes
 * in one commit; the field stays on the doc untouched.
 */

// Local copy of the predicate to avoid a circular dependency with
// ./distributionDecision (which imports computeStructuralBlockers from
// this module). The canonical definition lives in distributionDecision.js;
// this inline copy must stay in sync. There's a test below that asserts
// both modules agree on the distributable set.
function isDistributable(decision) {
  return decision === 'system_approved' || decision === 'admin_approved';
}

// ── Routing mode (audit only — no behavior branches in Phase 3) ──────────
//
// Pre-Phase-3 this env var selected one of three filter shapes. After
// Phase 3 the filter is fixed: it always consults distributionDecision.
// We keep routingMode() for log/audit metadata (decisionDrift summary,
// hiddenReason output) so historical log shapes are stable.
function routingMode(rawInput) {
  const source = rawInput !== undefined ? rawInput : process.env.ENABLE_TIERED_ROUTING;
  const raw = String(source ?? '').trim().toLowerCase();
  if (raw === 'rejected_only')      return 'rejected_only';
  if (raw === 'blocked_and_review') return 'blocked_and_review';
  return 'off';
}

// ── Structural blocker classifier (kept — used by writers) ───────────────
//
// Pure function. Returns the hide-worthy codes from a Lead's evidence.
// Used by scoringPipeline to denormalize Lead.structuralBlockers, and by
// distributionDecision.deriveSystemDecision as a fallback when the
// denormalized field is stale.
const HIDE_WORTHY_STRUCTURAL_CODES = Object.freeze([
  'invalid_phone',
  'route_unresolved',
  'distance_unknown',
  'suspicion_pattern',
  'low_confidence_plus_pattern',
  'suspicious_carrier',
  'high_sms_pumping',
  'fingerprint_bot',
]);

function computeStructuralBlockers(lead) {
  if (!lead) return [];
  const out = [];
  const phone    = (lead.validation && lead.validation.phone)    || {};
  const routeSus = (lead.validation && lead.validation.route && Array.isArray(lead.validation.route.suspicious))
    ? lead.validation.route.suspicious : [];
  const fraud    = (lead.validation && lead.validation.fraud)       || {};
  const fp       = (lead.validation && lead.validation.fingerprint) || {};

  if (routeSus.includes('origin_zip_not_found') || routeSus.includes('destination_zip_not_found')) {
    out.push('route_unresolved');
  }
  const milesNum = Number(lead.miles) || 0;
  if (milesNum <= 0) out.push('distance_unknown');
  if (phone.valid === false) out.push('invalid_phone');
  if (phone.providerSuspicion === 'high') out.push('suspicious_carrier');
  if (phone.suspicionPattern) out.push('suspicion_pattern');
  const lowConf = phone.validityReason === 'twilio_no_enrichment';
  if (lowConf && !!phone.suspicionPattern) out.push('low_confidence_plus_pattern');
  if (fraud.smsPumpingRisk === 'high') out.push('high_sms_pumping');
  if (fp.bot === true) out.push('fingerprint_bot');
  return out;
}

// ── Counters (legacy — only callable hooks remain) ───────────────────────
//
// Phase 6.2 introduced periodic counters for the legacy filter's hide rate.
// Phase 3 retired the call sites that drove these counters. The functions
// remain exported so any straggler reference doesn't crash; getCounters()
// still returns a shape compatible with the historical log line.
const counters = { feed_hidden: 0, broadcasts_suppressed: 0, claim_blocked: 0 };
function recordFeedHidden(n)         { if (n && n > 0) counters.feed_hidden += n; }
function recordBroadcastSuppressed() { counters.broadcasts_suppressed += 1; }
function recordClaimBlocked()        { counters.claim_blocked += 1; }
function getCounters()               { return { mode: routingMode(), ...counters }; }

// ── Phase 3 visibility API ───────────────────────────────────────────────

/**
 * Mongo filter fragment for mover-facing list queries. Compose by ANDing
 * with the caller's existing query. Single clause: distributionDecision
 * must be in {system_approved, admin_approved}.
 *
 * The status, moveDate, inventoryChannel, and sourceCompany gates are
 * orthogonal lifecycle/placement/identity axes and are NOT this helper's
 * concern — the calling route adds them directly. See routes/leads.js
 * for the assembled query.
 */
function moverVisibilityFilter() {
  return { distributionDecision: { $in: ['system_approved', 'admin_approved'] } };
}

/**
 * Per-document visibility check. Sync, defensive. Returns true if the lead
 * must be hidden from movers.
 *
 * @param {Object|null|undefined} lead - Lead document (lean or mongoose)
 * @returns {boolean}
 */
function isHiddenFromMovers(lead) {
  if (!lead) return false; // fail open — caller will likely 404
  return !isDistributable(lead.distributionDecision);
}

/**
 * Async DB-fetching variant for race-sensitive paths (post-verifyLeadPhone
 * broadcasts) where the in-memory `lead` was loaded before the pipeline
 * finished. Re-reads `distributionDecision` and answers.
 *
 * Fails OPEN on error (returns hidden:false) so a transient DB issue never
 * blocks legitimate mover visibility.
 *
 * @param {String|Object} leadOrId
 * @returns {Promise<{hidden:boolean, reason:string|null, source:string|null}>}
 */
async function isHiddenFromMoversById(leadOrId) {
  const Lead = require('../models/Lead');
  try {
    const id = (leadOrId && leadOrId._id) ? leadOrId._id : leadOrId;
    if (!id) return { hidden: false, reason: null, source: null };
    const lead = await Lead.findById(id).select('distributionDecision').lean();
    if (!lead) return { hidden: false, reason: null, source: null };
    if (isDistributable(lead.distributionDecision)) {
      return { hidden: false, reason: null, source: 'lead' };
    }
    return {
      hidden: true,
      reason: `distributionDecision=${lead.distributionDecision || 'unset'}`,
      source: 'lead',
    };
  } catch (err) {
    console.warn('[leadVisibility] isHiddenFromMoversById failed, failing OPEN:', err.message);
    return { hidden: false, reason: null, source: null };
  }
}

/**
 * Diagnostic string — short reason describing why a lead is hidden, or
 * null if it isn't. Used by claim/bid/broadcast log lines.
 */
function hiddenReason(lead) {
  if (!lead) return null;
  if (isDistributable(lead.distributionDecision)) return null;
  return `distributionDecision=${lead.distributionDecision || 'unset'}`;
}

module.exports = {
  routingMode,
  moverVisibilityFilter,
  isHiddenFromMovers,
  isHiddenFromMoversById,
  hiddenReason,
  computeStructuralBlockers,
  HIDE_WORTHY_STRUCTURAL_CODES,
  recordFeedHidden,
  recordBroadcastSuppressed,
  recordClaimBlocked,
  getCounters,
};
