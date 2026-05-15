/**
 * PricingAddOn — Phase 3 marketplace pricing V2 (shadow mode).
 *
 * Defines additive USD pricing components evaluated against each lead at
 * ingest. The V2 engine is purely additive (legacy uses multipliers); this
 * lets us compose a transparent breakdown of WHY a lead costs what it does
 * instead of an opaque chain of multipliers.
 *
 * Phase 3 invariants:
 *   - Shadow only — pricingEngineV2 writes Lead.priceShadowV2 and
 *     Lead.pricingBreakdownShadowV2; Lead.buyNowPrice continues to come from
 *     the legacy engine. No claim/refund path reads the V2 fields.
 *   - Predicate is data, not code — appliesWhen is evaluated by a single
 *     pure function in pricingEngineV2.evaluatePredicate. Adding a new
 *     condition type requires editing that function (intentional — keeps the
 *     audit surface small).
 *   - active=false add-ons are skipped at evaluation time. Soft delete
 *     instead of removing rows so historical breakdowns remain auditable.
 */

const mongoose = require('mongoose');

const PredicateSchema = new mongoose.Schema({
  // Distance predicates (NULL = no bound)
  milesGte:           { type: Number },
  milesLt:            { type: Number },
  // Days-to-move predicates (NULL = no bound)
  daysToMoveLte:      { type: Number },
  daysToMoveGt:       { type: Number },
  // Home size — match if lead.homeSize is in this list
  homeSizeIn:         [{ type: String }],
  // Heavy items — match if any heavy item the lead reports is in this list
  heavyItemsAny:      [{ type: String }],
  // Tier — match if shadow tier is in this list (defensive — not used by
  // V2 yet but reserved so add-ons can scope to e.g. only premium leads)
  tierIn:             [{ type: String }],
  // Validation flags — match if Lead.validation has these markers true
  // ('phoneVerified', 'identityMatch', etc.)
  validationFlagsAll: [{ type: String }],
}, { _id: false });

const PricingAddOnSchema = new mongoose.Schema({
  code:        { type: String, required: true, unique: true, trim: true },
  label:       { type: String, required: true, trim: true },
  amountUsd:   { type: Number, required: true }, // negative allowed (discount)
  appliesWhen: { type: PredicateSchema, default: () => ({}) },
  active:      { type: Boolean, default: true, index: true },
  notes:       { type: String, trim: true },
  // Display order (for admin UI grouping). Lower numbers render first.
  order:       { type: Number, default: 100 },
}, { timestamps: true });

module.exports = mongoose.model('pricingAddOn', PricingAddOnSchema);
