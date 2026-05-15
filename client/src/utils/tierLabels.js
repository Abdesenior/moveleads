/**
 * Tier label translation — display layer only. Mirrors server/utils/tierLabels.js.
 *
 * DB enum stays raw; this module renders mover-friendly copy in UI contexts.
 * Admin "raw" label is unchanged so operators keep precise vocabulary.
 */

export const MOVER_LABELS = Object.freeze({
  hot:      'Ready-to-Book',
  premium:  'High-Intent',
  standard: 'Open Request',
  review:   'Needs Verification',
  rejected: 'Blocked',
});

export function toMoverLabel(tier) {
  if (!tier) return null;
  return MOVER_LABELS[tier] || null;
}

export function toAdminLabel(tier) {
  return tier || null;
}

export function toCombinedLabel(tier) {
  if (!tier) return null;
  const friendly = MOVER_LABELS[tier];
  return friendly ? `${tier} (${friendly})` : tier;
}
