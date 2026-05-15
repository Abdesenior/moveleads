/**
 * pricingEngineSimple — Phase 1 of the simplified additive-USD pricing
 * architecture. Replaces the legacy multiplier engine + the V2 add-on
 * predicate engine with one tiny rule set:
 *
 *   final = BASE + Σ matching DISTANCE / HOME_SIZE / URGENCY / VERIFICATION
 *           / HEAVY_ITEM rows  (clamped to [$10, $250])
 *
 * Phase 1 invariants (this commit):
 *   - SHADOW ONLY. Lead.buyNowPrice continues to come from
 *     calculateAuctionPrice() (legacy multipliers). Nothing in any money
 *     path reads Lead.priceShadowSimple / Lead.pricingBreakdownSimple yet.
 *   - Reads PricingRule rows where `amountUsd` is a finite number. Legacy
 *     multiplier-only rows (no amountUsd) are silently skipped — the new
 *     engine and the legacy engine coexist on the same collection without
 *     interfering with each other.
 *   - classifyLead(lead) is the canonical lead-bucketing function. Server
 *     code owns the "what counts as Cross Country / Urgent" thresholds —
 *     not operator-edited rule data. Operators only edit USD amounts.
 *
 * Public API:
 *   compute(lead) → { total, base, breakdown, skipped, reason? }
 *   classifyLead(lead) → { distance, urgency, homeSize, verifications[], heavyItems[] }
 *
 * Future phases (NOT in this commit):
 *   Phase 2 — flat-table admin UI at /admin/pricing.
 *   Phase 3 — atomic cutover: buyNowPrice = compute(lead).total at ingest.
 *   Phase 4 — delete PricingAddOn, pricingEngineV2, legacy multiplier
 *             engine, hard-coded multipliers, AdminPricingAddons UI.
 */

const PricingRule = require('../models/PricingRule');
const PlatformSettings = require('../models/PlatformSettings');

const DEFAULT_BASE_USD   = 20;
const SAFETY_FLOOR_USD   = 10;
const SAFETY_MAX_USD     = 250;

const NEW_ADDITIVE_CATEGORIES = new Set([
  'DISTANCE', 'HOME_SIZE', 'URGENCY', 'VERIFICATION', 'HEAVY_ITEM',
]);

function isShadowEnabled() {
  // Default ON — shadow is safe, doesn't affect production charging.
  // Operators flip OFF only if the compute itself is a problem (e.g. load
  // issue) or if PricingRule data is mid-seed and producing nonsense.
  const v = String(process.env.ENABLE_PRICING_SIMPLE_SHADOW || 'true').toLowerCase();
  return v === 'true' || v === '1';
}

/**
 * Pure classifier — maps a lead to its canonical bucket per category.
 * No DB reads, no side effects. Same intent as legacy
 * calculateAuctionPrice's urgencyLabel/distance derivations, just unified
 * in one place so the engine doesn't repeat the math.
 *
 * Thresholds live HERE, not in operator-edited rule data.
 */
function classifyLead(lead) {
  const miles = Number(lead && lead.miles) || 0;
  const distance =
    miles >= 1000 ? 'Cross Country' :
    miles >= 100  ? 'Long Distance' :
                    'Local';

  const moveDate = lead && lead.moveDate ? new Date(lead.moveDate) : null;
  const daysToMove = moveDate ? Math.round((moveDate - new Date()) / 86400000) : null;
  const urgency =
    daysToMove == null ? 'Standard' :
    daysToMove <= 7    ? 'Urgent'   :
    daysToMove <= 14   ? 'Soon'     :
                         'Standard';

  const homeSize = (lead && lead.homeSize) || null;

  const verifications = [];
  const phone = lead && lead.validation && lead.validation.phone;
  if (phone) {
    if (phone.valid === true) verifications.push('phone_verified');
    if (phone.lineType === 'mobile' && phone.providerSuspicion !== 'high') verifications.push('mobile_line');
    if (phone.identityMatch && (phone.identityMatch.firstNameMatch || phone.identityMatch.lastNameMatch)) {
      verifications.push('identity_match');
    }
  }

  const heavyItems = Array.isArray(lead && lead.heavyItems) ? lead.heavyItems : [];

  return { distance, urgency, homeSize, verifications, heavyItems };
}

/**
 * Compute the new additive-USD price for a lead.
 *
 * Resolution order for BASE:
 *   1. Active PricingRule { category: 'BASE' } with finite amountUsd.
 *   2. PlatformSettings.standardLeadPrice (if set and ≥ default).
 *   3. DEFAULT_BASE_USD ($20).
 *
 * For everything else: for each rule with category in
 * { DISTANCE, HOME_SIZE, URGENCY, VERIFICATION, HEAVY_ITEM } and a finite
 * amountUsd, the rule applies when its matchValue matches the lead's
 * bucket for that category. Multi-value categories (VERIFICATION,
 * HEAVY_ITEM) match if the rule's matchValue is in the lead's array
 * (i.e. a lead with piano AND safe will match two HEAVY_ITEM rows and
 * pay for both — by design).
 *
 * Total is clamped to [$10, $250] as a safety guard. Operators tuning
 * rule values can never produce a negative charge or runaway price.
 */
async function compute(lead) {
  if (!isShadowEnabled()) {
    return { total: null, base: null, breakdown: [], skipped: true, reason: 'shadow_flag_off' };
  }

  // Resolve PlatformSettings fallback for BASE.
  let settingsBase = null;
  try {
    const settings = await PlatformSettings.findOne().lean();
    if (settings && Number.isFinite(settings.standardLeadPrice)) {
      settingsBase = Number(settings.standardLeadPrice);
    }
  } catch (err) {
    console.warn('[pricingEngineSimple] PlatformSettings read failed:', err.message);
  }

  let rules = [];
  try {
    rules = await PricingRule.find({ isActive: true }).lean();
  } catch (err) {
    console.warn('[pricingEngineSimple] PricingRule fetch failed:', err.message);
    return { total: null, base: null, breakdown: [], skipped: false, reason: 'rules_fetch_failed' };
  }

  // BASE resolution.
  let base = DEFAULT_BASE_USD;
  const baseRule = rules.find(r => r.category === 'BASE' && Number.isFinite(r.amountUsd));
  if (baseRule) {
    base = Number(baseRule.amountUsd);
  } else if (settingsBase != null && settingsBase > base) {
    base = settingsBase;
  }

  const buckets = classifyLead(lead);
  const breakdown = [{ category: 'BASE', matchValue: '', amountUsd: base }];

  // Additive rules.
  for (const r of rules) {
    if (!NEW_ADDITIVE_CATEGORIES.has(r.category)) continue;
    if (!Number.isFinite(r.amountUsd)) continue;   // legacy multiplier-only rows are skipped

    let matches = false;
    if (r.category === 'DISTANCE')     matches = (r.matchValue === buckets.distance);
    else if (r.category === 'HOME_SIZE')    matches = (r.matchValue === buckets.homeSize);
    else if (r.category === 'URGENCY')      matches = (r.matchValue === buckets.urgency);
    else if (r.category === 'VERIFICATION') matches = buckets.verifications.includes(r.matchValue);
    else if (r.category === 'HEAVY_ITEM')   matches = buckets.heavyItems.includes(r.matchValue);

    if (matches) {
      breakdown.push({
        category:   r.category,
        matchValue: r.matchValue,
        amountUsd:  Number(r.amountUsd),
      });
    }
  }

  const raw    = breakdown.reduce((s, b) => s + (Number(b.amountUsd) || 0), 0);
  const total  = Math.max(SAFETY_FLOOR_USD, Math.min(SAFETY_MAX_USD, raw));

  return { total, base, breakdown, skipped: false };
}

module.exports = {
  compute,
  classifyLead,
  isShadowEnabled,
  DEFAULT_BASE_USD,
  SAFETY_FLOOR_USD,
  SAFETY_MAX_USD,
};
