// Service-area mirror helpers (Phase 1 of mover-coverage cleanup).
//
// This module exists so every write path that touches a mover's pickup /
// delivery states produces THE SAME patch shape — keeping the new top-level
// fields (`pickupStates`, `deliveryStates`, `deliversNationwide`,
// `interstateEnabled`) in lockstep with the legacy `serviceStates` field
// that the existing matcher + CoverageArea regen still read from.
//
// Phase 1 contract:
//   - WRITE the new fields whenever the caller supplies them
//   - MIRROR them into `serviceStates = union(pickup, delivery)` so the
//     existing coverage-regen pipeline (which reads serviceStates) keeps
//     producing the same behavior the mover saw before. This is the
//     compatibility bridge that lets Phase 1+2 ship without touching the
//     matcher.
//   - Phase 3 will replace the matcher to read pickupStates/deliveryStates
//     directly; at that point the serviceStates mirror becomes vestigial
//     and can be deprecated.
//
// Pure functions only — no DB calls, no I/O. Callers do the persistence.

'use strict';

// Canonical 50 US states + DC. Single source of truth for state-code
// validation across the new top-level fields. Mirrors the list already in
// routes/users.js (kept in lockstep on schema drift).
const VALID_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
]);

const MAX_STATES = 50;

/**
 * Normalize an array of state-code-ish inputs into a sorted, deduped list of
 * canonical 2-letter codes. Drops unknown codes silently (defensive — the
 * UI may pass `null`, mixed case, or stale codes from a snapshot).
 *
 * @param {unknown} raw  Anything; non-arrays / non-strings are tolerated
 * @returns {string[]}   Canonical, deduped, sorted, capped at MAX_STATES
 */
function normalizeStateList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const code = v.trim().toUpperCase();
    if (!VALID_STATE_CODES.has(code)) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= MAX_STATES) break;
  }
  out.sort();
  return out;
}

/**
 * Derive the boolean "this mover handles interstate moves":
 *   true if nationwide delivery is on, OR if any delivery state is not
 *   also a pickup state (i.e. the mover delivers somewhere they don't
 *   pick up from — that's an interstate-only relationship).
 *
 * Stored on the User doc as `interstateEnabled` so we can fast-filter
 * downstream without recomputing from arrays.
 *
 * @param {{pickupStates?: string[], deliveryStates?: string[], deliversNationwide?: boolean}} args
 * @returns {boolean}
 */
function computeInterstateEnabled({ pickupStates, deliveryStates, deliversNationwide }) {
  if (deliversNationwide === true) return true;
  const pickup = new Set(Array.isArray(pickupStates) ? pickupStates : []);
  const delivery = Array.isArray(deliveryStates) ? deliveryStates : [];
  for (const code of delivery) {
    if (!pickup.has(code)) return true;
  }
  return false;
}

/**
 * Build the canonical mongoose `$set` patch for a service-area save.
 *
 * Accepts whichever fields the caller supplies; absent fields are not
 * written. Always produces a coherent set of mirrors:
 *   - If pickup or delivery changes: serviceStates = union(pickup, delivery)
 *   - interstateEnabled derived from the resulting state
 *   - If nationwide=true: deliveryStates is force-cleared to []
 *
 * @param {object} input
 * @param {string[]} [input.pickupStates]
 * @param {string[]} [input.deliveryStates]
 * @param {boolean}  [input.deliversNationwide]
 * @param {object}   [input.previous]  Previous User values for fields the
 *                                      caller didn't supply (for accurate
 *                                      mirror computation)
 * @returns {{patch: object, mirrorServiceStates: boolean, pickupStates: string[], deliveryStates: string[], deliversNationwide: boolean}}
 *          The mongoose `$set` patch + the resolved values so the caller
 *          can decide whether to trigger CoverageArea regen.
 */
function buildServiceAreaPatch(input) {
  const previous = input.previous || {};
  const patch = {};

  const hasPickup   = Array.isArray(input.pickupStates);
  const hasDelivery = Array.isArray(input.deliveryStates);
  const hasNationwide = typeof input.deliversNationwide === 'boolean';

  // Resolved values — defaulting to existing User state for fields the
  // caller didn't touch. Used for computing the legacy serviceStates mirror
  // and the interstateEnabled flag.
  let pickup   = hasPickup   ? normalizeStateList(input.pickupStates)   : normalizeStateList(previous.pickupStates);
  let delivery = hasDelivery ? normalizeStateList(input.deliveryStates) : normalizeStateList(previous.deliveryStates);
  let nationwide = hasNationwide ? !!input.deliversNationwide
                                 : !!previous.deliversNationwide;

  // Nationwide invariant: clear deliveryStates when nationwide is on.
  // Mover intent is "I deliver everywhere" — keeping a partial list around
  // would create read-side ambiguity ("does delivery.states or
  // deliversNationwide win?"). Phase 3 matcher reads deliversNationwide
  // first.
  if (nationwide) {
    delivery = [];
  }

  if (hasPickup)     patch.pickupStates     = pickup;
  if (hasDelivery)   patch.deliveryStates   = delivery;
  if (hasNationwide) patch.deliversNationwide = nationwide;

  // Legacy serviceStates mirror — only written when pickup or delivery
  // changed. Union so the existing matcher (which reads serviceStates) sees
  // every state the mover cares about as either origin or destination.
  // After Phase 3 ships, this mirror becomes vestigial.
  let mirrorServiceStates = false;
  if (hasPickup || hasDelivery) {
    const combined = new Set([...pickup, ...delivery]);
    patch.serviceStates = Array.from(combined).sort();
    mirrorServiceStates = true;
  }

  // Always recompute interstateEnabled when ANY of the contributing fields
  // change. Cheap, prevents drift.
  if (hasPickup || hasDelivery || hasNationwide) {
    patch.interstateEnabled = computeInterstateEnabled({
      pickupStates: pickup,
      deliveryStates: delivery,
      deliversNationwide: nationwide,
    });
  }

  return {
    patch,
    mirrorServiceStates,
    pickupStates: pickup,
    deliveryStates: delivery,
    deliversNationwide: nationwide,
  };
}

/**
 * Reverse mirror: when a legacy `serviceStates` write comes in (admin
 * tooling, old client, backfill script), populate pickupStates +
 * deliveryStates symmetrically so a mover going through the new UI later
 * doesn't see empty fields. Only fills in fields that are currently empty
 * on the user — never overrides explicit values.
 *
 * @param {string[]} nextServiceStates  Normalized state codes
 * @param {object} previous             Existing user fields
 * @returns {object} Mongoose `$set` additions
 */
function backfillFromServiceStates(nextServiceStates, previous = {}) {
  const additions = {};
  const codes = normalizeStateList(nextServiceStates);

  const prevPickup   = normalizeStateList(previous.pickupStates);
  const prevDelivery = normalizeStateList(previous.deliveryStates);
  const isNationwide = !!previous.deliversNationwide;

  if (prevPickup.length === 0 && codes.length > 0) {
    additions.pickupStates = codes;
  }
  // Only mirror to delivery if the mover hasn't picked nationwide
  // (nationwide means "I deliver everywhere" — adding a state list back
  // would contradict that intent).
  if (!isNationwide && prevDelivery.length === 0 && codes.length > 0) {
    additions.deliveryStates = codes;
  }

  if (Object.keys(additions).length > 0) {
    additions.interstateEnabled = computeInterstateEnabled({
      pickupStates: additions.pickupStates || prevPickup,
      deliveryStates: additions.deliveryStates || prevDelivery,
      deliversNationwide: isNationwide,
    });
  }
  return additions;
}

module.exports = {
  VALID_STATE_CODES,
  MAX_STATES,
  normalizeStateList,
  computeInterstateEnabled,
  buildServiceAreaPatch,
  backfillFromServiceStates,
};
