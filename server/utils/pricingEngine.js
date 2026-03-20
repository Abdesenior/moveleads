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

module.exports = { calculateLeadPrice };
