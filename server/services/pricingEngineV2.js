/**
 * Pricing Engine V2 — Phase 3 additive USD pricing (shadow mode).
 *
 * Computes Lead price as `base + Σ(matching add-ons)` with a transparent
 * breakdown. Runs in shadow alongside the legacy multiplier engine
 * (utils/pricingEngine.calculateAuctionPrice). Writes to:
 *
 *   Lead.priceShadowV2          (Number — total)
 *   Lead.pricingBreakdownShadowV2 (Array — { code, label, amountUsd })
 *
 * Lead.buyNowPrice is NEVER touched by this module. Claim/refund paths
 * remain on the legacy engine until Phase 5.
 *
 * Predicate evaluation is a pure function. The cost of a misclassification
 * is shadow-data drift — never a real overcharge — so we keep the predicate
 * grammar narrow and explicit.
 */

const PricingAddOn = require('../models/PricingAddOn');
const PlatformSettings = require('../models/PlatformSettings');

function isShadowEnabled() {
  // Default ON — shadow is safe, doesn't affect production charging.
  // Operators flip OFF only if the V2 compute is itself a problem (e.g.
  // load issue) or if PricingAddOn collection is misconfigured.
  const v = String(process.env.ENABLE_PRICING_ADDONS_SHADOW || 'true').toLowerCase();
  return v === 'true' || v === '1';
}

/**
 * Pure predicate evaluator. Returns true when ALL specified clauses match.
 * Empty / missing clauses are treated as "no constraint".
 *
 * @param {Object} predicate - PricingAddOn.appliesWhen
 * @param {Object} ctx - flattened lead context (built by buildContext below)
 * @returns {boolean}
 */
function evaluatePredicate(predicate = {}, ctx) {
  if (predicate.milesGte != null && !(ctx.miles >= predicate.milesGte)) return false;
  if (predicate.milesLt != null && !(ctx.miles < predicate.milesLt)) return false;
  if (predicate.daysToMoveLte != null && !(ctx.daysToMove != null && ctx.daysToMove <= predicate.daysToMoveLte)) return false;
  if (predicate.daysToMoveGt != null && !(ctx.daysToMove != null && ctx.daysToMove > predicate.daysToMoveGt)) return false;

  if (Array.isArray(predicate.homeSizeIn) && predicate.homeSizeIn.length > 0) {
    if (!ctx.homeSize || !predicate.homeSizeIn.includes(ctx.homeSize)) return false;
  }
  if (Array.isArray(predicate.heavyItemsAny) && predicate.heavyItemsAny.length > 0) {
    const hits = ctx.heavyItems || [];
    if (!predicate.heavyItemsAny.some(h => hits.includes(h))) return false;
  }
  if (Array.isArray(predicate.tierIn) && predicate.tierIn.length > 0) {
    if (!ctx.tier || !predicate.tierIn.includes(ctx.tier)) return false;
  }
  if (Array.isArray(predicate.validationFlagsAll) && predicate.validationFlagsAll.length > 0) {
    for (const flag of predicate.validationFlagsAll) {
      if (!ctx.validationFlags.has(flag)) return false;
    }
  }
  return true;
}

function buildContext(lead) {
  const miles = Number(lead.miles) || 0;
  const moveDate = lead.moveDate ? new Date(lead.moveDate) : null;
  const daysToMove = moveDate ? Math.round((moveDate - new Date()) / 86400000) : null;
  const validationFlags = new Set();
  const phone = lead.validation && lead.validation.phone;
  if (phone) {
    if (phone.valid === true) validationFlags.add('phoneVerified');
    if (phone.lineType === 'mobile' && phone.providerSuspicion !== 'high') validationFlags.add('mobileLine');
    if (phone.identityMatch && (phone.identityMatch.firstNameMatch || phone.identityMatch.lastNameMatch)) {
      validationFlags.add('identityMatch');
    }
  }
  return {
    miles,
    daysToMove,
    homeSize: lead.homeSize || null,
    heavyItems: Array.isArray(lead.heavyItems) ? lead.heavyItems : [],
    tier: lead.tier || null,
    validationFlags,
  };
}

/**
 * Compute V2 price + breakdown for a lead.
 *
 * Returns:
 *   {
 *     total: Number,
 *     base: Number,
 *     breakdown: [{ code, label, amountUsd }],
 *     skipped: boolean,        // true if shadow flag is off
 *     reason?: string,         // if skipped
 *   }
 */
async function compute(lead) {
  if (!isShadowEnabled()) {
    return { total: null, base: null, breakdown: [], skipped: true, reason: 'shadow_flag_off' };
  }

  // Base — anchored to PlatformSettings.standardLeadPrice when set, falls
  // back to a $10 floor (matches legacy engine's lower bound).
  let base = 10;
  try {
    const settings = await PlatformSettings.findOne().lean();
    if (settings?.standardLeadPrice && Number.isFinite(settings.standardLeadPrice)) {
      base = Math.max(10, Number(settings.standardLeadPrice));
    }
  } catch (err) {
    // Non-fatal — fall back to the $10 floor and log.
    console.warn('[pricingEngineV2] PlatformSettings read failed:', err.message);
  }

  let addOns = [];
  try {
    addOns = await PricingAddOn.find({ active: true }).lean();
  } catch (err) {
    console.warn('[pricingEngineV2] PricingAddOn fetch failed:', err.message);
    return { total: base, base, breakdown: [], skipped: false, reason: 'addons_fetch_failed' };
  }

  const ctx = buildContext(lead);
  const breakdown = [{ code: 'base', label: 'Base lead price', amountUsd: base }];

  for (const addOn of addOns) {
    if (evaluatePredicate(addOn.appliesWhen, ctx)) {
      breakdown.push({
        code: addOn.code,
        label: addOn.label,
        amountUsd: Number(addOn.amountUsd) || 0,
      });
    }
  }

  const total = breakdown.reduce((sum, line) => sum + (Number(line.amountUsd) || 0), 0);
  // Round to nearest dollar — mirrors legacy engine's $5 round, but tighter
  // since add-ons are explicit USD amounts.
  const rounded = Math.max(0, Math.round(total));

  return {
    total: rounded,
    base,
    breakdown,
    skipped: false,
  };
}

module.exports = {
  compute,
  evaluatePredicate,
  buildContext,
  isShadowEnabled,
};
