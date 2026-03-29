const PricingRule = require('../models/PricingRule');
const PlatformSettings = require('../models/PlatformSettings');

/**
 * Calculates the dynamic price for a lead based on ingestion data.
 * @param {Object} leadData - The raw lead data from ingestion (homeSize, distance, etc.)
 * @returns {Promise<Number>} - The final calculated lead price
 */
async function calculateLeadPrice(leadData) {
  try {
    // 1. Get Base Price from Platform Settings
    const settings = await PlatformSettings.findOne();
    let finalPrice = settings?.standardLeadPrice || 10;

    // 2. Fetch all active pricing rules
    const rules = await PricingRule.find({ isActive: true });

    // 3. Apply Multipliers
    // We apply multipliers cumulatively (Multiplicative)
    for (const rule of rules) {
      let match = false;

      if (rule.category === 'HOME_SIZE' && leadData.homeSize === rule.matchValue) {
        match = true;
      } else if (rule.category === 'DISTANCE' && leadData.distance === rule.matchValue) {
        match = true;
      }

      if (match) {
        finalPrice *= rule.multiplier;
        // If there's a flat fee component in the future, add it here
      }
    }

    // Round to 2 decimal places
    return Math.round(finalPrice * 100) / 100;
  } catch (err) {
    console.error('Pricing Engine Error:', err);
    return 10; // Fallback to safe default
  }
}

/**
 * Calculate dynamic auction pricing for a lead.
 * Used at ingest time — after preliminary scoring — to set buyNowPrice and startingBidPrice.
 *
 * @param {{ homeSize, miles, moveDate, grade }} lead
 * @returns {{ buyNowPrice, startingBidPrice, factors }}
 */
function calculateAuctionPrice(lead) {
  const { homeSize = '', miles = 0, moveDate, grade = 'C' } = lead;

  let base = 10;
  if (miles > 1000)     base = 35;
  else if (miles > 500) base = 25;
  else if (miles > 100) base = 18;

  const SIZE_MULT = {
    'Studio': 1.0, '1 Bedroom': 1.1, '2 Bedroom': 1.2,
    '3 Bedroom': 1.35, '4 Bedroom': 1.5, '4+ Bedroom': 1.5,
    '5 Bedroom': 1.75, '5+ Bedroom': 1.75,
  };
  const sizeMult = SIZE_MULT[homeSize] || 1.0;

  const days = moveDate ? (new Date(moveDate) - new Date()) / 86400000 : 60;
  const urgencyMult = days <= 7 ? 1.5 : days <= 14 ? 1.3 : days <= 30 ? 1.15 : 1.0;

  const mo = moveDate ? new Date(moveDate).getMonth() + 1 : new Date().getMonth() + 1;
  const seasonMult = [5, 6, 7, 8].includes(mo) ? 1.15 : 1.0;

  const dom = moveDate ? new Date(moveDate).getDate() : 15;
  const eomMult = dom >= 28 ? 1.12 : 1.0;

  const gradeMult = { A: 1.4, B: 1.15, C: 1.0, D: 0.85 }[grade] || 1.0;

  let price = base * sizeMult * urgencyMult * seasonMult * eomMult * gradeMult;
  price = Math.round(price / 5) * 5;
  price = Math.max(10, Math.min(price, 150));
  if (miles < 100) price = Math.min(price, 25);

  return {
    buyNowPrice:      price,
    startingBidPrice: Math.max(9, Math.round(price * 0.6 / 5) * 5),
    factors: { base, sizeMult, urgencyMult, seasonMult, eomMult, gradeMult },
  };
}

module.exports = { calculateLeadPrice, calculateAuctionPrice };
