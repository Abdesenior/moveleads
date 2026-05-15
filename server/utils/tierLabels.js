/**
 * Tier label translation — display layer only.
 *
 * The DB enum stays `hot | premium | standard | review | rejected` everywhere
 * (Lead.js, ScoringSnapshot.js, leadTierRouter.js). Mover-facing surfaces and
 * customer-friendly admin views render the friendlier label via this function.
 *
 * Admin internals (raw operations console, audit logs, scoring rationale)
 * intentionally keep the raw enum for parity with router/engine output.
 *
 * Why a translation layer instead of a schema change:
 *   - tier values flow through 4 layers (router → snapshot → distribution
 *     status → admin UI) and renaming them anywhere is a migration. Keeping
 *     the enum stable means we can iterate on the mover-facing words freely
 *     without coordinated deploys.
 *   - admin/operator language ("hot", "rejected") is precise; mover language
 *     ("Ready-to-Book", "Blocked") is suggestive of action.
 */

const MOVER_LABELS = Object.freeze({
  hot:      'Ready-to-Book',
  premium:  'High-Intent',
  standard: 'Open Request',
  review:   'Needs Verification',
  rejected: 'Blocked',
});

/**
 * Mover-facing label. Returns null for unknown/null tiers so callers can
 * decide whether to render a fallback.
 */
function toMoverLabel(tier) {
  if (!tier) return null;
  return MOVER_LABELS[tier] || null;
}

/**
 * Admin-facing label. Returns the raw enum verbatim — admins see operational
 * truth, not marketing copy. Provided as a function (not a constant) so
 * callers can pipe both forms through the same code paths.
 */
function toAdminLabel(tier) {
  return tier || null;
}

/**
 * Combined "raw (Friendly)" form for admin contexts that want both, e.g.
 * "hot (Ready-to-Book)" in the scoring modal so an admin sees what a mover
 * would see alongside the engine's raw output.
 */
function toCombinedLabel(tier) {
  if (!tier) return null;
  const friendly = MOVER_LABELS[tier];
  return friendly ? `${tier} (${friendly})` : tier;
}

module.exports = {
  MOVER_LABELS,
  toMoverLabel,
  toAdminLabel,
  toCombinedLabel,
};
