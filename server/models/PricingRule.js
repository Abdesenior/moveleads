const mongoose = require('mongoose');

/**
 * PricingRule — unified rule model for both the legacy multiplier engine
 * and the new additive-USD engine.
 *
 * Phase 1 (this commit): adds `amountUsd` as an additive field and expands
 * `category` to include URGENCY / VERIFICATION / HEAVY_ITEM so operators
 * can author the new flat rule set. `multiplier` stays for back-compat with
 * the legacy engine until Phase 4 (then dropped).
 *
 * Engine read contract:
 *   - Legacy engine (pricingEngine.calculateAuctionPrice) reads `multiplier`
 *     ONLY from rows with category in ['HOME_SIZE','DISTANCE','BASE','MOVE_DATE'].
 *   - New engine (pricingEngineSimple.compute) reads `amountUsd` ONLY from
 *     rows where amountUsd is a finite number. Rows that only have
 *     `multiplier` (legacy) are silently skipped by the new engine.
 *   - There is no scenario where both engines apply the same row — they
 *     consult different fields. Rules can safely coexist during the
 *     shadow window.
 */
const PricingRuleSchema = new mongoose.Schema({
  category: {
    type: String,
    // BASE/HOME_SIZE/DISTANCE/MOVE_DATE: legacy categories (read by either engine).
    // URGENCY/VERIFICATION/HEAVY_ITEM: new additive-only categories (read by
    // pricingEngineSimple only — the legacy multiplier engine ignores them).
    enum: ['HOME_SIZE', 'DISTANCE', 'BASE', 'MOVE_DATE', 'URGENCY', 'VERIFICATION', 'HEAVY_ITEM'],
    required: true,
  },
  matchValue: {
    // For BASE: '' (singleton — there should be exactly one BASE row).
    // For DISTANCE: 'Local' | 'Long Distance' | 'Cross Country'.
    // For HOME_SIZE: matches lead.homeSize (Studio / 1 Bedroom / …).
    // For URGENCY: 'Urgent' | 'Soon' | 'Standard'.
    // For VERIFICATION: 'phone_verified' | 'mobile_line' | 'identity_match'.
    // For HEAVY_ITEM: free string matched against entries in lead.heavyItems.
    // Empty string is valid only for BASE rows; all other categories require
    // a matchValue (enforced by the custom required validator below).
    type: String,
    default: '',
    required: function () { return this.category !== 'BASE'; },
  },
  multiplier: {
    // Legacy engine input. Default 1.0 = "no effect". Kept for back-compat
    // during the migration window. Deprecated — new rules should set
    // amountUsd instead.
    type: Number,
    default: 1.0,
  },
  amountUsd: {
    // New additive engine input. Number of dollars added (or subtracted, if
    // negative) when this rule matches. For BASE, this is the starting
    // value before any add-ons apply. NOT a required field — legacy rows
    // that predate the additive migration may have null/undefined.
    type: Number,
  },
  description: { type: String },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

// Hot-path index for both engines — filter active rules, group/sort by
// category for stable breakdowns.
PricingRuleSchema.index({ isActive: 1, category: 1 });

module.exports = mongoose.model('pricing_rule', PricingRuleSchema);
