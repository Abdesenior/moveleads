/**
 * Fixed-USD pricing engine — Phase 1 of the legacy-multiplier deprecation.
 *
 * Evaluates FixedPriceRule rows against a lead and returns the single
 * winning rule + its exact USD price (no stacking, no math). Mirrors the
 * predicate semantics of pricingEngineV2.evaluatePredicate so operators
 * see the same rules behave the same way across engines.
 *
 *   compute(lead) →
 *     { matched: true,  priceUsd, ruleCode, ruleId, candidates, skipped: false }
 *     { matched: false, priceUsd: null, ruleCode: null, ruleId: null,
 *       candidates, skipped: false }
 *     { matched: false, priceUsd: null, ruleCode: null, ruleId: null,
 *       skipped: true, reason }
 *
 * SHADOW ONLY in Phase 1 — write to Lead.priceShadowFixed +
 * Lead.pricingFixedRuleCode. Never touches Lead.buyNowPrice.
 *
 * Tiebreak when multiple rules match:
 *   1. Highest `priority` wins.
 *   2. Most recently created next.
 *   3. Code ascending (stable, deterministic).
 *
 * Flag: ENABLE_PRICING_FIXED_SHADOW (default 'true'). Same operator-flip
 * pattern as ENABLE_PRICING_ADDONS_SHADOW. Setting to anything other than
 * 'true'/'1' skips compute (no DB read, no DB write).
 */

const FixedPriceRule = require('../models/FixedPriceRule');

function isShadowEnabled() {
  const v = String(process.env.ENABLE_PRICING_FIXED_SHADOW || 'true').toLowerCase();
  return v === 'true' || v === '1';
}

/**
 * Pure predicate evaluator. Mirrors pricingEngineV2.evaluatePredicate
 * (intentional — operators write rules against one mental model).
 * Empty / missing clauses are treated as "no constraint".
 */
function evaluatePredicate(predicate = {}, ctx) {
  if (predicate.milesGte != null && !(ctx.miles >= predicate.milesGte)) return false;
  if (predicate.milesLt  != null && !(ctx.miles <  predicate.milesLt))  return false;
  if (predicate.daysToMoveLte != null && !(ctx.daysToMove != null && ctx.daysToMove <= predicate.daysToMoveLte)) return false;
  if (predicate.daysToMoveGt  != null && !(ctx.daysToMove != null && ctx.daysToMove >  predicate.daysToMoveGt))  return false;
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
 * Compute the fixed price for a lead. Returns the winner + a list of every
 * candidate that matched (for analytics / explainability later).
 */
async function compute(lead) {
  if (!isShadowEnabled()) {
    return { matched: false, priceUsd: null, ruleCode: null, ruleId: null, candidates: [], skipped: true, reason: 'shadow_flag_off' };
  }

  let rules = [];
  try {
    rules = await FixedPriceRule.find({ active: true })
      .sort({ priority: -1, createdAt: -1, code: 1 })
      .lean();
  } catch (err) {
    console.warn('[fixedPriceEngine] FixedPriceRule fetch failed:', err.message);
    return { matched: false, priceUsd: null, ruleCode: null, ruleId: null, candidates: [], skipped: false, reason: 'rules_fetch_failed' };
  }

  const ctx = buildContext(lead);
  const candidates = [];
  let winner = null;

  for (const rule of rules) {
    if (evaluatePredicate(rule.appliesWhen, ctx)) {
      candidates.push({ code: rule.code, label: rule.label, priceUsd: rule.priceUsd, priority: rule.priority });
      if (!winner) winner = rule; // already sorted — first match wins
    }
  }

  if (!winner) {
    return { matched: false, priceUsd: null, ruleCode: null, ruleId: null, candidates: [], skipped: false };
  }

  return {
    matched:  true,
    priceUsd: Number(winner.priceUsd),
    ruleCode: winner.code,
    ruleId:   winner._id,
    candidates,
    skipped:  false,
  };
}

module.exports = {
  compute,
  evaluatePredicate,
  buildContext,
  isShadowEnabled,
};
