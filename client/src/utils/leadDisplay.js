// Lead display helpers — single source of truth for turning enum codes the
// backend stores (e.g. `walk_up_3plus`) into human-readable labels the
// dashboard renders (e.g. "Walk-up — 3+ floors").
//
// Used across PreviewModal (pre-purchase), PurchaseSuccessModal (just-bought),
// and MyLeads ExpandedPanel (post-purchase history) so the three surfaces
// can never drift apart on copy. Add new enum mappings here, not inline.

const HOME_TYPE_LABELS = {
  house:     'House',
  apartment: 'Apartment',
  condo:     'Condo',
  townhouse: 'Townhouse',
  storage:   'Storage unit',
  other:     'Other',
};

const STAIRS_LABELS = {
  ground_floor:  'Ground floor',
  walk_up_2:     'Walk-up — 2 floors',
  walk_up_3plus: 'Walk-up — 3+ floors',
  elevator:      'Elevator',
};

const URGENCY_LABELS = {
  asap:       'ASAP',
  this_week:  'This week',
  this_month: 'This month',
  flexible:   'Flexible',
};

/** Lookup helper — falls back to the raw value (or '—') so missing mappings
 * are never crash-causing. */
function lookup(map, key, fallback = '—') {
  if (key === undefined || key === null || key === '') return fallback;
  return map[key] || String(key);
}

export function formatHomeType(code) { return lookup(HOME_TYPE_LABELS, code); }
export function formatStairs(code)   { return lookup(STAIRS_LABELS,    code); }
export function formatUrgency(code)  { return lookup(URGENCY_LABELS,   code); }

/**
 * The V2 ingest validator injects a synthetic email when the homeowner
 * skips the optional Email field: `noemail+{phone}@moveleads.cloud`.
 * That placeholder must not leak to the mover — they'd waste time trying
 * to contact a nonexistent address.
 */
export function isRealEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return !email.startsWith('noemail+');
}

/**
 * Convenience — returns the email if real, otherwise null so the caller
 * can conditionally render.
 */
export function displayEmail(email) {
  return isRealEmail(email) ? email : null;
}

/**
 * Heavy-items chip color picker. Lets the renderer apply mild visual
 * weighting (piano, safe → red-ish; everything else neutral) without
 * each surface owning its own table.
 */
export function heavyItemTone(item) {
  if (!item || typeof item !== 'string') return 'neutral';
  const lower = item.toLowerCase();
  if (/piano|safe|pool table|hot tub|gun safe/.test(lower)) return 'heavy';
  return 'neutral';
}
