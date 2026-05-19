/**
 * Phase 2 — shadow-compare logger for the unified distribution decision.
 *
 * Compares the LEGACY quality filter (moverVisibilityFilter / isHiddenFromMovers)
 * against the NEW quality field (distributionDecision ∈ DISTRIBUTABLE_VALUES)
 * on every mover-feed pull. Logs per-lead drift + a per-endpoint summary.
 *
 * Production behavior: ZERO. The legacy filter is still authoritative. Phase 2
 * only observes; Phase 3 will flip reads. All work happens behind env flags
 * and is wrapped in try/catch so a logger fault never breaks the feed.
 *
 * Env flags:
 *   ENABLE_DECISION_DRIFT_LOGGING   default off — turn on logging
 *   DECISION_DRIFT_SAMPLE_RATE      default 1.0 — log every drift row
 *                                                 (set 0.1 to log 10%)
 *   DECISION_DRIFT_FULL_SCAN        default off — also fetch a wider
 *                                                 candidate set (orthogonal
 *                                                 clauses only, no quality
 *                                                 filter) so we can detect
 *                                                 NEW_ONLY deltas: leads the
 *                                                 new field would distribute
 *                                                 that the old filter
 *                                                 currently hides. Doubles
 *                                                 the feed cost — opt in
 *                                                 only during diagnostic
 *                                                 windows.
 *
 * Drift directions:
 *   delta=old_only — old filter included, new field would HIDE. Phase 3
 *                    risk: silent removal. Should approach zero if backfill
 *                    + writers are consistent. Investigate any occurrence.
 *   delta=new_only — old filter hid, new field would DISTRIBUTE. The
 *                    expected payoff direction — these are the admin-
 *                    approved leads currently stuck behind raw-validation
 *                    gates (the original bug). Counting these by mode
 *                    confirms the magnitude of the fix.
 *   delta=agree    — both agree (vast majority). Not logged per-row;
 *                    counted in the summary line.
 *
 * Log shape (single-line JSON, greppable):
 *   { evt:"decision_drift", leadId, endpoint, delta, decision,
 *     decisionReason, status, distributionModel, inventoryChannel,
 *     moveDate, moveDatePast, structuralBlockers, adminTierOverride,
 *     qualityGateCleared, shadowTier, validationFlags{...}, routingMode }
 *
 *   { evt:"decision_drift_summary", endpoint, candidates, old_pass,
 *     new_pass, agree, old_only, new_only, sample_rate, full_scan,
 *     routingMode }
 */

const { isDistributable } = require('./distributionDecision');
const { isHiddenFromMovers, routingMode } = require('./leadVisibility');

function parseBool(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function isEnabled() {
  return parseBool(process.env.ENABLE_DECISION_DRIFT_LOGGING);
}

function sampleRate() {
  const n = Number(process.env.DECISION_DRIFT_SAMPLE_RATE);
  if (!Number.isFinite(n) || n < 0) return 1.0;
  return n > 1 ? 1.0 : n;
}

function fullScanEnabled() {
  return parseBool(process.env.DECISION_DRIFT_FULL_SCAN);
}

function shouldSample() {
  const r = sampleRate();
  if (r >= 1) return true;
  if (r <= 0) return false;
  return Math.random() < r;
}

/**
 * Pure function — build the JSON-loggable per-lead drift row.
 * Stable, deterministic, no side effects. Easy to test.
 *
 * @param {Object} lead - Lead document (lean) — requires the visibility
 *                        fields: status, distributionModel, inventoryChannel,
 *                        moveDate, structuralBlockers, adminTierOverride,
 *                        qualityGateCleared, shadowTier, validation, miles,
 *                        distributionDecision, distributionDecisionReason.
 * @param {Object} opts
 * @param {string} opts.endpoint       — '/api/leads' | '/api/leads/deals'
 * @param {boolean} opts.oldIncludes   — passed by the legacy filter
 * @param {boolean} opts.newIncludes   — passes the new field's filter
 * @returns {Object} JSON-loggable row
 */
function buildDriftRow(lead, { endpoint, oldIncludes, newIncludes }) {
  const v  = lead.validation || {};
  const p  = v.phone        || {};
  const r  = v.route        || {};
  const f  = v.fraud        || {};
  const fp = v.fingerprint  || {};
  const routeSus = Array.isArray(r.suspicious) ? r.suspicious : [];
  const milesNum = Number(lead.miles) || 0;
  return {
    evt: 'decision_drift',
    leadId: String(lead._id),
    endpoint,
    oldFilterIncludes:   !!oldIncludes,
    newDecisionIncludes: !!newIncludes,
    delta: (oldIncludes && !newIncludes)  ? 'old_only'
         : (!oldIncludes && newIncludes)  ? 'new_only'
         :                                  'agree',
    decision:        lead.distributionDecision       || null,
    decisionReason:  lead.distributionDecisionReason || null,
    status:            lead.status            || null,
    distributionModel: lead.distributionModel || null,
    inventoryChannel:  lead.inventoryChannel  || null,
    moveDate:          lead.moveDate          || null,
    moveDatePast:      lead.moveDate ? (new Date(lead.moveDate) < new Date()) : null,
    structuralBlockers: Array.isArray(lead.structuralBlockers) ? lead.structuralBlockers : [],
    adminTierOverride: lead.adminTierOverride && lead.adminTierOverride.tier
      ? {
          tier: lead.adminTierOverride.tier,
          at:   lead.adminTierOverride.at || null,
          by:   lead.adminTierOverride.by ? String(lead.adminTierOverride.by) : null,
        }
      : null,
    qualityGateCleared: lead.qualityGateCleared === undefined ? null : lead.qualityGateCleared,
    shadowTier:         lead.shadowTier || null,
    validationFlags: {
      phoneValidFalse:       p.valid === false,
      suspicionPattern:      p.suspicionPattern || null,
      providerSuspicionHigh: p.providerSuspicion === 'high',
      smsPumpingHigh:        f.smsPumpingRisk === 'high',
      fingerprintBot:        fp.bot === true,
      routeUnresolved:       routeSus.includes('origin_zip_not_found') || routeSus.includes('destination_zip_not_found'),
      milesZero:             milesNum <= 0,
    },
    routingMode: routingMode(),
  };
}

function logDriftRow(row) {
  try { console.log(JSON.stringify(row)); }
  catch (err) { console.warn('[decisionDrift] log row failed:', err.message); }
}

function logDriftSummary(summary) {
  try { console.log(JSON.stringify({ evt: 'decision_drift_summary', ...summary })); }
  catch (err) { console.warn('[decisionDrift] log summary failed:', err.message); }
}

/**
 * Inspect a set of leads against both filters and emit drift rows + summary.
 *
 * Predicate-driven so each endpoint can express its own legacy semantics:
 *   - Main feed (GET /api/leads) passes a predicate that includes the
 *     `distributionModel === 'instant'` Phase D clause (which Phase 3
 *     will retire — so any new_only delta caused by it is a measurement
 *     of leads currently stuck behind that gate).
 *   - Deals (GET /api/leads/deals) uses the default predicate
 *     (!isHiddenFromMovers(lead)) — that endpoint doesn't filter on
 *     distributionModel today.
 *
 * Modes:
 *   - candidates omitted OR full-scan off: light-weight path. Inspects
 *     `included` only — i.e., leads the production query returned. Can
 *     only detect OLD_ONLY drift (a lead in the result whose
 *     distributionDecision is NOT in {system_approved, admin_approved}).
 *   - candidates provided AND full-scan on: full-scan path. Inspects
 *     the wider candidate set — leads passing the orthogonal clauses
 *     (status, moveDate, inventoryChannel, sourceCompany) but NOT the
 *     quality/placement gates. Catches BOTH delta directions.
 *
 * @param {Object} opts
 * @param {string} opts.endpoint
 * @param {Object[]} opts.included  — leads the production query returned
 * @param {Object[]} [opts.candidates] — wider candidate set when full-scan
 * @param {(lead:Object) => boolean} [opts.oldPredicate]
 *        Defaults to `lead => !isHiddenFromMovers(lead)`. Override per
 *        endpoint to encode any non-quality legacy clauses that should
 *        count as part of "old filter pass".
 * @param {(lead:Object) => boolean} [opts.newPredicate]
 *        Defaults to `lead => isDistributable(lead.distributionDecision)`.
 */
function inspectAndLog(opts) {
  if (!isEnabled()) return;
  const {
    endpoint,
    included = [],
    candidates,
    oldPredicate = (lead) => !isHiddenFromMovers(lead),
    newPredicate = (lead) => isDistributable(lead.distributionDecision),
  } = opts || {};

  try {
    const useCandidates = Array.isArray(candidates) && fullScanEnabled();
    const set = useCandidates ? candidates : included;
    let oldOnly = 0;
    let newOnly = 0;
    let agree = 0;
    let oldPass = 0;
    let newPass = 0;

    for (const lead of set) {
      // In light-weight mode, every `included` lead passed the old filter
      // by definition (it's in the production result). In full-scan mode
      // we evaluate the predicate explicitly because the candidate set is
      // wider than the production query.
      const oldIncludes = useCandidates ? !!oldPredicate(lead) : true;
      const newIncludes = !!newPredicate(lead);
      if (oldIncludes) oldPass += 1;
      if (newIncludes) newPass += 1;
      if (oldIncludes === newIncludes) {
        agree += 1;
        continue;
      }
      if (oldIncludes && !newIncludes) oldOnly += 1;
      else newOnly += 1;
      if (shouldSample()) {
        logDriftRow(buildDriftRow(lead, { endpoint, oldIncludes, newIncludes }));
      }
    }

    logDriftSummary({
      endpoint,
      candidates:  set.length,
      old_pass:    oldPass,
      new_pass:    newPass,
      agree,
      old_only:    oldOnly,
      new_only:    newOnly,
      sample_rate: sampleRate(),
      full_scan:   useCandidates,
      routingMode: routingMode(),
    });
  } catch (err) {
    // Drift logging must never break the feed. Swallow and move on.
    console.warn('[decisionDrift] inspectAndLog failed:', err.message);
  }
}

module.exports = {
  isEnabled,
  sampleRate,
  fullScanEnabled,
  shouldSample,
  buildDriftRow,
  logDriftRow,
  logDriftSummary,
  inspectAndLog,
};
