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
  const zipSet = coverageZips instanceof Set ? coverageZips : new Set(coverageZips || []);
  if (zipSet.size > 0) {
    const inOrigin = lead.originZip && zipSet.has(String(lead.originZip));
    const inDest   = lead.destinationZip && zipSet.has(String(lead.destinationZip));
    if (!inOrigin && !inDest) return false;
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

  return true;
}

module.exports = { doesLeadMatchMoverPreferences };
