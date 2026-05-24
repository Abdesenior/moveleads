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

module.exports = {
  doesLeadMatchMoverPreferences,
  isLeadInMoverCoverage,
};
