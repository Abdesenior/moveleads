/**
 * Lead Visibility — Phase 6: tiered mover routing.
 *
 * Single source of truth for "should this lead be visible to MOVERS?".
 * Admin paths (anything under /api/admin/*) MUST NOT call this — admins
 * see everything regardless of mode.
 *
 * Modes:
 *
 *   'off' (default, also back-compat for '', '0', 'false')
 *      No filtering. Current behavior preserved byte-for-byte. Only mode
 *      ever active in production until the operator opts in.
 *
 *   'rejected_only'
 *      Hide leads where ANY of:
 *        - lead.status === 'REJECTED_FAKE'                  (admin manual reject)
 *        - lead.adminTierOverride.tier === 'rejected'       (admin override)
 *        - lead.shadowTier === 'rejected'                   (scoring engine reject)
 *        - lead.qualityGateCleared === false                (V5 race fix)
 *      Movers see everything else (review, standard, premium, hot stay visible).
 *
 *   'blocked_and_review'  (Phase 6.4 — NEW)
 *      Everything 'rejected_only' hides, PLUS leads where:
 *        - lead.shadowTier === 'review' AND lead.structuralBlockers has any entry
 *      Structural blockers are computed by computeStructuralBlockers() — see
 *      that function for the exact list. The intent: a review lead that's
 *      structurally unusable (no resolvable route, no distance, invalid phone,
 *      double-uncertain telecom, etc.) shouldn't waste a mover's attention.
 *      Review leads that are review for SOFT reasons (VoIP-only, telecom
 *      unverified alone, single suspicion-pattern, etc.) STAY VISIBLE — those
 *      are still legit-but-unverified, not structurally broken.
 *
 *   'full' / 'true' / '1'  →  FALLS BACK TO 'off'
 *      Full routing semantics (hiding ALL review leads, not just structurally
 *      broken ones) is not implemented yet. Anyone setting
 *      ENABLE_TIERED_ROUTING=full|true|1 in production would otherwise silently
 *      activate behavior we have not designed. We treat these values as a
 *      misconfiguration and fall back to 'off'. A one-shot warning is emitted
 *      at module load so the operator notices.
 *
 * Two public helpers cover the two integration patterns:
 *
 *   moverVisibilityFilter()
 *     Returns a Mongo $and fragment to inject into `Lead.find({ ... })`.
 *     Used by the dashboard feed + widget analytics list. Mongo $ne against
 *     a missing field returns TRUE, so leads without a shadowTier value stay
 *     visible (safety: pre-V5 leads, unscored leads, snapshot write failures).
 *
 *   isHiddenFromMovers(lead)
 *     Sync function for paths that already have a Lead doc in hand (claim,
 *     bid, single broadcast). Returns true if the lead must be hidden.
 *     Fails OPEN on missing input (no doc → not hidden).
 *
 * Logging: explicit-lookup callers (claim, bid, broadcast) log a single line
 * when they block a request, so admin can correlate. The query-time filter
 * doesn't log per-row (would be noisy on every feed pull).
 *
 * Rollback: unset ENABLE_TIERED_ROUTING. routingMode() returns 'off'.
 * moverVisibilityFilter() returns {} → no Mongo filter applied. Old
 * Lead.shadowTier values stay on disk but are inert.
 */

/**
 * Resolve a routing-mode value to one of {'off', 'rejected_only', 'blocked_and_review'}.
 *
 * @param {string|undefined} [rawInput] - Optional override; defaults to
 *   process.env.ENABLE_TIERED_ROUTING. The override exists so unit tests
 *   can exercise the parsing logic without mutating process.env.
 * @returns {'off' | 'rejected_only' | 'blocked_and_review'}
 *
 * Note: 'full' / 'true' / '1' deliberately resolve to 'off' here. See module
 * doc-comment. The startup IIFE below logs a one-shot warning when those
 * values were the env input, so an operator who *thinks* they enabled full
 * routing immediately sees that it's not active.
 */
function routingMode(rawInput) {
  const source = rawInput !== undefined ? rawInput : process.env.ENABLE_TIERED_ROUTING;
  const raw = String(source ?? '').trim().toLowerCase();
  if (raw === 'rejected_only') return 'rejected_only';
  if (raw === 'blocked_and_review') return 'blocked_and_review';
  // Everything else (including 'full', 'true', '1', 'off', 'false', '0',
  // '', undefined, garbage) → 'off'. Conservative by design.
  return 'off';
}

/**
 * Helper: which modes apply ANY visibility filtering. Used to short-circuit
 * sync/async checks and to gate the periodic reporter.
 */
function filterModeActive() {
  const m = routingMode();
  return m === 'rejected_only' || m === 'blocked_and_review';
}

/**
 * Pure function — compute the list of STRUCTURAL blocker codes from a Lead
 * document. Used by:
 *   - scoringPipeline (denormalized onto Lead.structuralBlockers at scoring time)
 *   - isHiddenFromMovers fallback when the lead doc lacks the denormalized field
 *
 * "Structural" = the lead is fundamentally hard or impossible to fulfill from
 * a mover's perspective, OR carries a submitter-quality signal that warrants
 * admin review before mover exposure. Soft/calibration signals (VoIP alone,
 * telecom_low_confidence alone) are still NOT structural.
 *
 * Blocker codes returned (each is independently set):
 *   route_unresolved   — origin OR destination ZIP not found in Mapbox
 *   distance_unknown   — miles === 0 (couldn't compute distance)
 *   invalid_phone      — Twilio explicitly says invalid OR local NANP rule
 *   suspicious_carrier — carrierReputation flagged provider as 'high'
 *   suspicion_pattern  — phone-shape pattern fired (alternating/low-distinct/etc.).
 *                        Telecom Lookup may still say the number is valid; the
 *                        pattern indicates submitter quality is questionable,
 *                        so the lead is held for admin review rather than
 *                        auto-pushed to movers. Auto-reject only happens when
 *                        combined with another hard signal (handled in
 *                        leadTierRouter, not here).
 *   low_confidence_plus_pattern — kept for back-compat with leads scored before
 *                        suspicion_pattern alone became structural; functionally
 *                        a strict subset of the new rule.
 *   high_sms_pumping   — Twilio SMS pumping risk = 'high'
 *   fingerprint_bot    — fingerprint service confirmed bot
 *
 * Deliberately excluded (single-signal "soft" cases):
 *   voip_line / isVoip            — phone is VoIP but legit-looking
 *   telecom_low_confidence alone  — twilio_no_enrichment with no other red flags
 *   telecom_unverified            — no Twilio Lookup at all (toggle off)
 *
 * @param {Object|null|undefined} lead - Lead document (lean or mongoose)
 * @returns {string[]} array of structural blocker codes (possibly empty)
 */
function computeStructuralBlockers(lead) {
  if (!lead) return [];
  const out = [];
  const phone = (lead.validation && lead.validation.phone) || {};
  const routeSus = (lead.validation && lead.validation.route && Array.isArray(lead.validation.route.suspicious))
    ? lead.validation.route.suspicious : [];
  const fraud = (lead.validation && lead.validation.fraud) || {};
  const fp    = (lead.validation && lead.validation.fingerprint) || {};

  // Route: unresolved origin/destination ZIP
  if (routeSus.includes('origin_zip_not_found') || routeSus.includes('destination_zip_not_found')) {
    out.push('route_unresolved');
  }
  // Distance: 0 / NaN / negative (Mapbox couldn't compute, or no client-side haversine)
  const milesNum = Number(lead.miles) || 0;
  if (milesNum <= 0) {
    out.push('distance_unknown');
  }
  // Phone: explicitly invalid
  if (phone.valid === false) {
    out.push('invalid_phone');
  }
  // Carrier: high suspicion provider (TextNow/Bandwidth/Twilio CPaaS/etc.)
  if (phone.providerSuspicion === 'high') {
    out.push('suspicious_carrier');
  }
  // Phone-shape pattern: alternating / low-distinct / sequential. Now an
  // independent structural blocker — pattern alone is enough to hold the
  // lead for admin review even if Twilio Lookup validates the number.
  if (phone.suspicionPattern) {
    out.push('suspicion_pattern');
  }
  // COMBO: telecom_low_confidence AND suspicion_pattern. Subsumed by the
  // single-pattern rule above; kept emitted for back-compat with downstream
  // analytics and pre-existing denormalized `structuralBlockers` arrays.
  const lowConf = phone.validityReason === 'twilio_no_enrichment';
  const suspPattern = !!phone.suspicionPattern;
  if (lowConf && suspPattern) {
    out.push('low_confidence_plus_pattern');
  }
  // Fraud: severe SMS pumping risk or confirmed bot
  if (fraud.smsPumpingRisk === 'high') {
    out.push('high_sms_pumping');
  }
  if (fp.bot === true) {
    out.push('fingerprint_bot');
  }
  return out;
}

// ── First-week monitoring counters ──────────────────────────────────────────
// Process-local counters incremented at each block point. Periodically dumped
// to logs (default every 15 min) so the operator can spot-check that:
//   - rejected_only is actually active
//   - the magnitude of blocks is sane (not 0 → "is it even running?",
//     not 1000s/hour → "are we over-filtering legitimate leads?")
//
// No persistence, no admin endpoint, no dashboard — just enough visibility
// for the first production window. Counters reset on process restart, which
// is fine for cardinality estimation.
//
// Disable the periodic reporter by setting LEAD_VISIBILITY_REPORT_INTERVAL_MS=0
// (counters still increment; only the periodic log is suppressed).
const counters = {
  feed_hidden: 0,
  broadcasts_suppressed: 0,
  claim_blocked: 0,
};

let _reporterHandle = null;

function _startReporter() {
  if (_reporterHandle) return;
  if (!filterModeActive()) return;
  const periodMs = Number(process.env.LEAD_VISIBILITY_REPORT_INTERVAL_MS ?? 15 * 60 * 1000);
  if (!Number.isFinite(periodMs) || periodMs <= 0) return; // disabled
  _reporterHandle = setInterval(() => {
    console.log(
      `[leadVisibility] mode=${routingMode()} ` +
      `feed_hidden=${counters.feed_hidden} ` +
      `broadcasts_suppressed=${counters.broadcasts_suppressed} ` +
      `claim_blocked=${counters.claim_blocked}`
    );
  }, periodMs);
  // .unref() so the interval doesn't keep the event loop alive — Node can
  // still exit cleanly when shutting down (e.g. SIGTERM during deploys).
  if (typeof _reporterHandle.unref === 'function') _reporterHandle.unref();
}

function recordFeedHidden(n) {
  if (!n || n <= 0) return; // 0, undefined, negative, NaN → no-op
  counters.feed_hidden += n;
}

function recordBroadcastSuppressed() {
  counters.broadcasts_suppressed += 1;
}

function recordClaimBlocked() {
  counters.claim_blocked += 1;
}

/**
 * Read-only counter snapshot. Useful for ad-hoc REPL inspection. Returns
 * a copy so callers can't mutate the live state.
 */
function getCounters() {
  return { mode: routingMode(), ...counters };
}

// ── Module-load bootstrap ──────────────────────────────────────────────────
// Runs once when this module is first required. Two things:
//   1. Warn if env requested unimplemented 'full'/'true'/'1' mode.
//   2. If a non-off mode is effective, announce it and start the reporter.
// Module caching guarantees this runs at most once per process.
(function bootstrap() {
  const raw = String(process.env.ENABLE_TIERED_ROUTING ?? '').trim().toLowerCase();
  if (raw === 'full' || raw === 'true' || raw === '1') {
    console.warn('[leadVisibility] full routing mode requested but not implemented; falling back to off');
  }
  const mode = routingMode();
  if (mode !== 'off') {
    console.log(`[leadVisibility] mode=${mode}`);
    _startReporter();
  }
})();

/**
 * Mongo filter fragment for mover-facing list queries. Compose by ANDing
 * with the caller's existing query. Returns `{}` when mode is off so the
 * resulting query is unchanged.
 */
/**
 * Phase 6.5 — codes within `structuralBlockers` that always hide a lead under
 * `blocked_and_review`, regardless of tier. Centralized here so the filter,
 * sync check, and async helper all use the same list.
 */
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

function moverVisibilityFilter() {
  const mode = routingMode();
  if (mode === 'off') return {};

  // Base clauses — applied in BOTH rejected_only and blocked_and_review.
  // Each clause is "field $ne <bad-value>" which Mongo treats as TRUE when
  // the field is missing — so V4 leads and pre-V5 records pass through.
  const clauses = [
    { status: { $ne: 'REJECTED_FAKE' } },
    { 'adminTierOverride.tier': { $ne: 'rejected' } },
    { shadowTier: { $ne: 'rejected' } },
    // Phase 6.3 — V5 quality gate. Hides V5 leads where scoring hasn't
    // finished yet (or finished with rejected). V4 + pre-fix leads have
    // no field → $ne false is TRUE → passes through.
    { qualityGateCleared: { $ne: false } },
  ];

  if (mode === 'blocked_and_review') {
    // Phase 6.5 — strict structural-blocker filter (replaces the narrower
    // Phase-6.4 "review + structural" rule). ANY hide-worthy structural
    // code in lead.structuralBlockers excludes the lead, regardless of
    // shadowTier.
    //
    // $nin against an array field excludes the doc when ANY element of
    // the array matches one of the values. Missing field / empty array
    // → $nin matches (no element is in the list) → kept visible.
    clauses.push({
      structuralBlockers: { $nin: HIDE_WORTHY_STRUCTURAL_CODES },
    });

    // Phase 6.6 — raw-validation-field fallback. Defends against pre-
    // Phase-6.5 leads whose `structuralBlockers` field was never
    // denormalized (their scoring snapshot pre-dates Phase 6.4) and
    // against any denormalization staleness. Each clause checks the
    // raw validation data directly:
    //
    //   { 'validation.phone.valid': { $ne: false } }
    //     → hides leads with explicit Twilio "invalid" verdict
    //   { 'validation.phone.providerSuspicion': { $ne: 'high' } }
    //     → hides leads on throwaway/CPaaS carriers
    //   { 'validation.route.suspicious': { $nin: [...] } }
    //     → hides leads with ANY origin/destination ZIP unresolved
    //   { miles: { $ne: 0 } }
    //     → hides leads where distance is exactly 0 (couldn't compute)
    //   { 'validation.fraud.smsPumpingRisk': { $ne: 'high' } }
    //     → hides leads on high SMS-pumping fraud
    //   { 'validation.fingerprint.bot': { $ne: true } }
    //     → hides confirmed-bot leads
    //
    // $ne / $nin against a MISSING field returns TRUE in Mongo, so:
    //   - V4 leads (no validation.* fields) pass through (back-compat)
    //   - V5 leads that haven't been validated yet pass through here BUT
    //     are caught by qualityGateCleared $ne false (Phase 6.3)
    //   - V5 leads that WERE validated have these fields and get filtered
    //
    // This pair (denormalized $nin + raw-field $ne) is belt-and-suspenders:
    // a denormalization failure or stale-data lead still gets caught
    // because the raw validation field is on the Lead doc directly.
    //
    // Note: the `low_confidence_plus_pattern` combo is intentionally NOT
    // expressed as a raw clause (too complex). It relies on the
    // denormalized field. Acceptable: that combo is rarer and the
    // denormalization for new leads is correct.
    clauses.push({ 'validation.phone.valid': { $ne: false } });
    clauses.push({ 'validation.phone.providerSuspicion': { $ne: 'high' } });
    clauses.push({ 'validation.route.suspicious': { $nin: ['origin_zip_not_found', 'destination_zip_not_found'] } });
    clauses.push({ miles: { $ne: 0 } });
    clauses.push({ 'validation.fraud.smsPumpingRisk': { $ne: 'high' } });
    clauses.push({ 'validation.fingerprint.bot': { $ne: true } });
    // suspicion_pattern raw fallback: any non-null pattern string hides.
    // `{ field: null }` is Mongo's idiom for "field is null OR missing".
    clauses.push({ 'validation.phone.suspicionPattern': null });
  }

  return { $and: clauses };
}

/**
 * Per-document visibility check. Use on the explicit-lookup paths (claim,
 * bid, broadcast) where the caller already has a Lead doc. Sync, defensive.
 *
 * @param {Object|null|undefined} lead - Lead document (mongoose doc or lean object)
 * @returns {boolean} true if the lead must be hidden from movers
 */
function isHiddenFromMovers(lead) {
  if (!lead) return false; // Fail open — caller will likely 404 or similar
  const mode = routingMode();
  if (mode === 'off') return false;

  if (lead.status === 'REJECTED_FAKE') return true;
  if (lead.adminTierOverride?.tier === 'rejected') return true;
  if (lead.shadowTier === 'rejected') return true;
  // Phase 6.3 — V5 quality gate. Explicit false means scoring not yet
  // completed (or completed with rejected tier). Missing/undefined is
  // back-compat (V4 leads + pre-Phase-6.3 V5 leads).
  if (lead.qualityGateCleared === false) return true;

  // Phase 6.5 — blocked_and_review: ALSO hide ANY lead (regardless of
  // tier) that carries a hide-worthy structural blocker. Prefer the
  // denormalized field; fall back to computing it inline so leads with
  // a Lead-side mirror mismatch are still caught when their `validation`
  // is loaded.
  if (mode === 'blocked_and_review') {
    const blockers = Array.isArray(lead.structuralBlockers)
      ? lead.structuralBlockers
      : computeStructuralBlockers(lead);
    if (blockers.some(code => HIDE_WORTHY_STRUCTURAL_CODES.includes(code))) return true;
  }
  return false;
}

/**
 * Async version that fetches the latest Lead state + falls back to the
 * ScoringSnapshot collection if `shadowTier` isn't on the Lead yet (covers
 * the rare case where scoring saved a snapshot but the Lead-side mirror
 * failed). Use this on race-sensitive paths like broadcasts where the
 * in-memory `lead` object may have been loaded BEFORE the scoring pipeline
 * finished — e.g. verifyLeadPhone holds an early copy of the Lead doc.
 *
 * Returns true when the lead must be hidden. Fails OPEN on error
 * (returns false) so monitoring/fetch failures never block legitimate
 * mover visibility.
 *
 * @param {String|Object} leadOrId  Lead document or Lead._id
 * @returns {Promise<{ hidden: boolean, reason: string|null, source: string|null }>}
 */
async function isHiddenFromMoversById(leadOrId) {
  const mode = routingMode();
  if (mode === 'off') {
    return { hidden: false, reason: null, source: null };
  }
  const Lead = require('../models/Lead');
  const ScoringSnapshot = require('../models/ScoringSnapshot');
  try {
    const id = (leadOrId && leadOrId._id) ? leadOrId._id : leadOrId;
    if (!id) return { hidden: false, reason: null, source: null };

    // Fetch enough fields to evaluate both the always-on rules AND the
    // Phase 6.4 review+structural rule. `validation` lets us recompute
    // structural blockers when the denormalized field is missing.
    const lead = await Lead.findById(id)
      .select('status adminTierOverride shadowTier qualityGateCleared funnelVersion structuralBlockers validation miles')
      .lean();
    if (!lead) return { hidden: false, reason: null, source: null };

    // Sync check first — covers all the common cases.
    if (lead.status === 'REJECTED_FAKE')
      return { hidden: true, reason: 'status=REJECTED_FAKE', source: 'lead' };
    if (lead.adminTierOverride?.tier === 'rejected')
      return { hidden: true, reason: 'adminOverride=rejected', source: 'lead' };
    if (lead.shadowTier === 'rejected')
      return { hidden: true, reason: 'shadowTier=rejected', source: 'lead' };
    if (lead.qualityGateCleared === false)
      return { hidden: true, reason: 'qualityGate=false', source: 'lead' };

    // Phase 6.5 — blocked_and_review: any hide-worthy structural code in
    // Lead.structuralBlockers (or computed inline if the field is missing)
    // blocks visibility regardless of tier.
    if (mode === 'blocked_and_review') {
      const blockers = Array.isArray(lead.structuralBlockers)
        ? lead.structuralBlockers
        : computeStructuralBlockers(lead);
      const hits = blockers.filter(code => HIDE_WORTHY_STRUCTURAL_CODES.includes(code));
      if (hits.length > 0) {
        return { hidden: true, reason: `structural:${hits.join(',')}`, source: 'lead' };
      }
    }

    // Minimum-fix fallback: if Lead.shadowTier is missing, consult the
    // ScoringSnapshot collection directly. Handles the case where the
    // snapshot wrote but the Lead-side mirror failed (or the Lead doc
    // is from a code path that bypassed the mirror).
    if (lead.shadowTier == null) {
      const snap = await ScoringSnapshot.findOne({ leadId: id })
        .sort({ createdAt: -1 })
        .select('tier')
        .lean();
      if (snap && snap.tier === 'rejected') {
        return { hidden: true, reason: 'snapshot.tier=rejected (mirror missing)', source: 'snapshot' };
      }
    }

    return { hidden: false, reason: null, source: null };
  } catch (err) {
    console.warn('[leadVisibility] isHiddenFromMoversById failed, failing OPEN:', err.message);
    return { hidden: false, reason: null, source: null };
  }
}

/**
 * Diagnostic string for logging. Returns a short reason describing why a
 * lead was hidden, or null if it isn't. Useful for log lines like
 *   `[leadVisibility] blocked claim of ${leadId}: ${reason}`
 */
function hiddenReason(lead) {
  if (!lead) return null;
  const mode = routingMode();
  if (mode === 'off') return null;
  if (lead.status === 'REJECTED_FAKE') return 'status=REJECTED_FAKE';
  if (lead.adminTierOverride?.tier === 'rejected') return 'adminOverride=rejected';
  if (lead.shadowTier === 'rejected') return 'shadowTier=rejected';
  if (lead.qualityGateCleared === false) return 'qualityGate=false';
  if (mode === 'blocked_and_review') {
    const blockers = Array.isArray(lead.structuralBlockers)
      ? lead.structuralBlockers
      : computeStructuralBlockers(lead);
    const hits = blockers.filter(code => HIDE_WORTHY_STRUCTURAL_CODES.includes(code));
    if (hits.length > 0) return `structural:${hits.join(',')}`;
  }
  return null;
}

module.exports = {
  routingMode,
  moverVisibilityFilter,
  isHiddenFromMovers,
  // Phase 6.3 — async variant with DB re-fetch + ScoringSnapshot fallback,
  // used on race-sensitive paths (post-verifyLeadPhone broadcasts).
  isHiddenFromMoversById,
  hiddenReason,
  // Phase 6.4 — pure structural-blocker classifier used by scoringPipeline
  // to denormalize the result onto Lead.structuralBlockers, and as a fallback
  // inside isHiddenFromMovers when the denormalized field is missing.
  computeStructuralBlockers,
  // Phase 6.5 — exported so admin tools / tests can introspect.
  HIDE_WORTHY_STRUCTURAL_CODES,
  // First-week monitoring (Phase 6.2)
  recordFeedHidden,
  recordBroadcastSuppressed,
  recordClaimBlocked,
  getCounters,
};
