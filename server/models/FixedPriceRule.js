/**
 * FixedPriceRule — Phase 1 of the legacy-multiplier deprecation plan.
 *
 * Defines a fixed USD price per lead based on a predicate match. The engine
 * (services/fixedPriceEngine.js) is "best-match-wins": exactly one rule
 * applies per lead, no stacking, no math, no compounding.
 *
 *   IF predicate matches  THEN  final price = priceUsd
 *
 * Phase 1 invariants (this commit):
 *   - SHADOW ONLY. Lead.buyNowPrice continues to come from the legacy
 *     multiplier engine. Nothing in any money path reads
 *     Lead.priceShadowFixed / Lead.pricingFixedRuleCode yet.
 *   - The predicate shape is intentionally the same as PricingAddOn.appliesWhen
 *     so operators only learn one mental model and the proven predicate
 *     evaluator can be shared.
 *   - Tiebreak by `priority` (higher wins), then most-recent createdAt.
 *
 * Roadmap (NOT in this commit):
 *   Phase 2 — admin CRUD UI at /admin/pricing-rules (separate from the
 *             legacy /admin/pricing PricingRule editor).
 *   Phase 3 — cutover: ingest writes buyNowPrice from FixedPriceRule
 *             instead of calculateAuctionPrice() when a rule matches.
 *   Phase 4 — remove the legacy multiplier engine + PricingRule model.
 */

const mongoose = require('mongoose');

// Same predicate shape as PricingAddOn.appliesWhen — keeps the mental model
// consistent for operators and lets us share the pure predicate evaluator.
const PredicateSchema = new mongoose.Schema({
  milesGte:           { type: Number },
  milesLt:            { type: Number },
  daysToMoveLte:      { type: Number },
  daysToMoveGt:       { type: Number },
  homeSizeIn:         [{ type: String }],
  heavyItemsAny:      [{ type: String }],
  tierIn:             [{ type: String }],
  validationFlagsAll: [{ type: String }],
}, { _id: false });

const FixedPriceRuleSchema = new mongoose.Schema({
  code:        { type: String, required: true, unique: true, trim: true },
  label:       { type: String, required: true, trim: true },
  // The exact final price (USD) when this rule wins. Non-negative — a fixed
  // pricing model has no concept of "discount add-ons"; if a discount is
  // required, create a dedicated rule with a lower priceUsd.
  priceUsd:    { type: Number, required: true, min: 0 },
  appliesWhen: { type: PredicateSchema, default: () => ({}) },
  // Higher priority wins on multi-rule match. Stable tiebreak: most recent
  // createdAt next, then code ascending.
  priority:    { type: Number, default: 100, index: true },
  active:      { type: Boolean, default: true, index: true },
  notes:       { type: String, trim: true },
}, { timestamps: true });

// Compound index supporting the engine's hot path: filter active=true, sort
// by priority desc + createdAt desc.
FixedPriceRuleSchema.index({ active: 1, priority: -1, createdAt: -1 });

module.exports = mongoose.model('fixedPriceRule', FixedPriceRuleSchema);
