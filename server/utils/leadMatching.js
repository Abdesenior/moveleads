// Lead ↔ mover preference matching.
//
// Single source of truth for whether a lead is "matched for" a given mover.
// Used by:
//   • broadcastLeadSMS  — to decide who gets a text
//   • GET /api/leads    — to attach _matchesPreferences for sorting + badge
//   • (future)          — socket-emit payload labels, ranking, etc.
//
// Pure function — no DB, no side effects. Caller pre-fetches the mover's
// CoverageArea zips to keep this hot loop cheap.

const { matchesMoveTypes } = require('./dispatchPolicy');

/**
 * @param {Object} lead   Lead document (or lean object).
 * @param {Object} user   User document (or lean object) — at minimum:
 *                        { maxDistance, preferredHomeSizes }
 * @param {Set<string>|Array<string>} coverageZips
 *                        The mover's CoverageArea zip codes.
 *                        Pass an empty Set to indicate "no coverage configured" —
 *                        in that case we treat coverage as a no-op (don't filter
 *                        out the lead on coverage), so legacy partners with no
 *                        CoverageArea aren't excluded entirely.
 * @returns {boolean}
 */
function doesLeadMatchMoverPreferences(lead, user, coverageZips) {
  if (!lead || !user) return false;

  // 1. Coverage area (origin OR destination must be in zip set).
  // Special case: if the mover has User.deliversNationwide=true AND their
  // coverage matches the lead's ORIGIN, we accept regardless of whether the
  // destination ZIP is in their CoverageArea — they declared they'll deliver
  // anywhere. (Warm transfers still require explicit destination coverage,
  // enforced separately in findEligibleMovers — that's a money-safety
  // boundary we're keeping.)
  const zipSet = coverageZips instanceof Set ? coverageZips : new Set(coverageZips || []);
  if (zipSet.size > 0) {
    const inOrigin = lead.originZip && zipSet.has(String(lead.originZip));
    const inDest   = lead.destinationZip && zipSet.has(String(lead.destinationZip));
    const nationwidePass = user.deliversNationwide && inOrigin;
    if (!inOrigin && !inDest && !nationwidePass) return false;
  }
  // If zipSet.size === 0, the mover has no coverage configured. We do NOT
  // filter on coverage in that case — we'd rather show a too-broad set than
  // empty out the dashboard for a partner who hasn't completed onboarding.

  // 2. Distance preference. User.maxDistance:
  //   ''            → both / any (no filter)
  //   'Local'       → lead.distance must equal 'Local'
  //   'Long Distance' → lead.distance must equal 'Long Distance'
  const distPref = (user.maxDistance || '').trim();
  if (distPref === 'Local' || distPref === 'Long Distance') {
    if (lead.distance !== distPref) return false;
  }

  // 3. Preferred home sizes. Empty array → no filter.
  const sizes = Array.isArray(user.preferredHomeSizes) ? user.preferredHomeSizes : [];
  if (sizes.length > 0) {
    if (!lead.homeSize || !sizes.includes(lead.homeSize)) return false;
  }

  // 4. Onboarding moveTypes preference (apartment/home/office/longDistance
  //    /packing/storage/emergency + avoidMoveTypes). Permissive when not
  //    configured — see dispatchPolicy.matchesMoveTypes.
  if (!matchesMoveTypes(user, lead)) return false;

  return true;
}

/**
 * Coverage-only match used by /dashboard/leads to drive the
 * "Matches your setup" badge and the "Matched for you" tab.
 *
 * Strictly answers ONE question: is the lead's origin OR destination ZIP
 * in the mover's CoverageArea? Does NOT consider distance, home size,
 * move type, urgency, move date, or price — those are informational
 * metadata on the lead card, not gates on the badge.
 *
 * Operational dispatch (SMS, email) deliberately continues to call the
 * fuller `doesLeadMatchMoverPreferences` above. We split badge semantics
 * (coverage-only) from dispatch semantics (full policy) to make the
 * dashboard signal honest without disturbing broadcast volume.
 *
 * Behavior:
 *   - zipSet empty (mover hasn't configured CoverageArea) → false.
 *     The badge must mean something; onboarding-incomplete movers
 *     should not see every lead as matched.
 *   - lead.originZip in zipSet → true
 *   - lead.destinationZip in zipSet → true
 *   - deliversNationwide + lead.originZip in zipSet → true
 *     (mover declared they'll deliver anywhere; origin coverage is
 *     enough — same nationwide rule as the existing helper.)
 *   - everything else → false
 *
 * @param {Object|null} lead          Lead doc / lean object with originZip + destinationZip
 * @param {Object|null} user          User doc with deliversNationwide flag
 * @param {Set<string>|Array<string>} coverageZips  Mover's CoverageArea zip codes
 * @returns {boolean}
 */
function isLeadInMoverCoverage(lead, user, coverageZips) {
  if (!lead || !user) return false;
  const zipSet = coverageZips instanceof Set ? coverageZips : new Set(coverageZips || []);
  if (zipSet.size === 0) return false;
  const inOrigin       = lead.originZip      && zipSet.has(String(lead.originZip));
  const inDest         = lead.destinationZip && zipSet.has(String(lead.destinationZip));
  const nationwidePass = user.deliversNationwide && inOrigin;
  return Boolean(inOrigin || inDest || nationwidePass);
}

// ── Phase 3 strict matcher (origin AND destination) ─────────────────────────
//
// The legacy matchers above check `origin OR destination` against a single
// flat ZIP set — they don't distinguish "I pick up here" from "I deliver
// there". The strict matcher closes that gap by requiring BOTH ends to be
// covered before a mover is considered a match.
//
// Algorithm (per audit doc Phase 3):
//
//   moverCanHandleLeadStrict(lead, mover, {originZipSet, destinationZipSet}):
//     1. Origin   = (mover.pickupStates includes lead.originState)
//                   OR (lead.originZip in originZipSet)
//     2. Destination = mover.deliversNationwide
//                      OR (mover.deliveryStates includes lead.destinationState)
//                      OR (lead.destinationZip in destinationZipSet)
//     3. Both must pass (AND). If either fails → not a match.
//     4. (Full-policy variant only) then layer distance + home size +
//        moveTypes filters from doesLeadMatchMoverPreferences.
//
// Back-compat: if mover.pickupStates is empty but mover.serviceStates has
// data, treat pickup AND delivery as serviceStates (legacy symmetric
// semantics). This protects movers who somehow escaped the Phase 1 backfill.
//
// Caller responsibility: pre-fetch typed CoverageArea ZIPs and pass them as
// originZipSet / destinationZipSet. Empty Set inputs are safe — the matcher
// falls back to state-only coverage in that case.

/**
 * Resolve a mover's effective pickup/delivery state lists with the
 * legacy-symmetric fallback. Pure helper used by both strict variants.
 *
 * @param {object} mover
 * @returns {{pickup: Set<string>, delivery: Set<string>, nationwide: boolean}}
 */
function resolveMoverStates(mover) {
  let pickup   = Array.isArray(mover.pickupStates)   ? mover.pickupStates   : [];
  let delivery = Array.isArray(mover.deliveryStates) ? mover.deliveryStates : [];
  if (pickup.length === 0 && Array.isArray(mover.serviceStates) && mover.serviceStates.length > 0) {
    // Legacy fallback — treat serviceStates as both pickup AND delivery so
    // un-backfilled movers don't suddenly stop matching.
    pickup   = mover.serviceStates;
    delivery = mover.serviceStates;
  }
  return {
    pickup:     new Set(pickup),
    delivery:   new Set(delivery),
    nationwide: !!mover.deliversNationwide,
  };
}

/**
 * Coverage-only strict match (origin AND destination).
 *
 * Use case: dashboard "Matches your setup" badge. Does NOT consider
 * distance / home size / move types — those are dispatch concerns.
 *
 * @param {object} lead   Lead with originState, originZip, destinationState, destinationZip
 * @param {object} mover  User with pickupStates, deliveryStates, deliversNationwide,
 *                        (and serviceStates for legacy fallback)
 * @param {object} [coverage]
 * @param {Set<string>|Array<string>} [coverage.originZipSet]      Mover's ZIPs typed origin OR both
 * @param {Set<string>|Array<string>} [coverage.destinationZipSet] Mover's ZIPs typed destination OR both
 * @returns {boolean}
 */
function isLeadInMoverCoverageStrict(lead, mover, coverage = {}) {
  if (!lead || !mover) return false;
  const { pickup, delivery, nationwide } = resolveMoverStates(mover);
  const originZipSet      = coverage.originZipSet      instanceof Set ? coverage.originZipSet      : new Set(coverage.originZipSet      || []);
  const destinationZipSet = coverage.destinationZipSet instanceof Set ? coverage.destinationZipSet : new Set(coverage.destinationZipSet || []);

  // ── Origin gate ──────────────────────────────────────────────────────
  const originState = (lead.originState || '').toUpperCase();
  const hasOrigin =
    (originState && pickup.has(originState)) ||
    (lead.originZip && originZipSet.has(String(lead.originZip)));
  if (!hasOrigin) return false;

  // ── Destination gate ─────────────────────────────────────────────────
  if (nationwide) return true; // mover delivers anywhere — origin was the only gate
  const destState = (lead.destinationState || '').toUpperCase();
  const hasDestination =
    (destState && delivery.has(destState)) ||
    (lead.destinationZip && destinationZipSet.has(String(lead.destinationZip)));
  return Boolean(hasDestination);
}

/**
 * Full-policy strict match.
 *
 * Use case: SMS / email broadcasts. Calls isLeadInMoverCoverageStrict first,
 * then layers distance + home size + moveTypes filters (same as the legacy
 * doesLeadMatchMoverPreferences).
 *
 * @param {object} lead
 * @param {object} mover
 * @param {object} [coverage]   {originZipSet, destinationZipSet}
 * @returns {boolean}
 */
function doesLeadMatchMoverPreferencesStrict(lead, mover, coverage = {}) {
  if (!isLeadInMoverCoverageStrict(lead, mover, coverage)) return false;

  // Distance preference. Same semantics as legacy.
  const distPref = (mover.maxDistance || '').trim();
  if (distPref === 'Local' || distPref === 'Long Distance') {
    if (lead.distance !== distPref) return false;
  }

  // Preferred home sizes.
  const sizes = Array.isArray(mover.preferredHomeSizes) ? mover.preferredHomeSizes : [];
  if (sizes.length > 0) {
    if (!lead.homeSize || !sizes.includes(lead.homeSize)) return false;
  }

  // Move-type preferences (apartment/home/office/longDistance/etc).
  if (!matchesMoveTypes(mover, lead)) return false;

  return true;
}

module.exports = {
  // Legacy (Phase 1+2 — origin OR destination)
  doesLeadMatchMoverPreferences,
  isLeadInMoverCoverage,
  // Strict (Phase 3 — origin AND destination, behind STRICT_INTERSTATE_MATCHING)
  isLeadInMoverCoverageStrict,
  doesLeadMatchMoverPreferencesStrict,
  resolveMoverStates,
};
