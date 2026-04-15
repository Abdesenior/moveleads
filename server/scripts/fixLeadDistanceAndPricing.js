/**
 * One-time migration: fix existing leads that have wrong miles, distance, or pricing.
 *
 * What it fixes:
 *   - leads with miles = 0 or missing → recalculates from zip coordinates
 *   - distance field set to 'Local' but actual miles > 100 (or vice versa)
 *   - buyNowPrice / startingBidPrice / price out of sync with actual distance
 *
 * Run on Render shell:
 *   node scripts/fixLeadDistanceAndPricing.js
 *
 * Or via npm script (add to package.json if desired):
 *   "migrate:leads": "node scripts/fixLeadDistanceAndPricing.js"
 */
require('dotenv').config();
const mongoose = require('mongoose');

// ── Dependencies ──────────────────────────────────────────────────────────────
const Lead = require('../models/Lead');
const { calculateAuctionPrice } = require('../utils/pricingEngine');
const zipcodes = require('zipcodes');

// ── Haversine (same formula as the ingest route) ──────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(3959 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function milesFromZips(originZip, destinationZip) {
  const o = zipcodes.lookup(originZip);
  const d = zipcodes.lookup(destinationZip);
  if (!o || !d) return 0;
  return haversine(o.latitude, o.longitude, d.latitude, d.longitude);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Target all leads that haven't been purchased yet and have a future move date
  const leads = await Lead.find({
    moveDate: { $gte: new Date() },
    'buyers.0': { $exists: false }, // no buyers
  });

  console.log(`Found ${leads.length} active unpurchased leads to check`);

  let fixed = 0, skipped = 0;

  for (const lead of leads) {
    if (!lead.originZip || !lead.destinationZip) { skipped++; continue; }

    const computedMiles = milesFromZips(lead.originZip, lead.destinationZip);
    if (computedMiles === 0) { skipped++; continue; }

    const correctDistance = computedMiles > 100 ? 'Long Distance' : 'Local';
    const pricing = calculateAuctionPrice({
      homeSize: lead.homeSize,
      miles: computedMiles,
      moveDate: lead.moveDate,
      grade: lead.grade || 'C',
    });

    const needsUpdate =
      lead.miles !== computedMiles ||
      lead.distance !== correctDistance ||
      lead.buyNowPrice !== pricing.buyNowPrice ||
      lead.startingBidPrice !== pricing.startingBidPrice;

    if (!needsUpdate) { skipped++; continue; }

    console.log(
      `  [FIX] ${lead.originZip}→${lead.destinationZip} | ` +
      `miles: ${lead.miles}→${computedMiles} | ` +
      `dist: ${lead.distance}→${correctDistance} | ` +
      `price: $${lead.buyNowPrice}→$${pricing.buyNowPrice}`
    );

    lead.miles            = computedMiles;
    lead.distance         = correctDistance;
    lead.buyNowPrice      = pricing.buyNowPrice;
    lead.startingBidPrice = pricing.startingBidPrice;
    lead.price            = pricing.buyNowPrice;
    // Activate auction so the updated lead shows bid/buy-now buttons immediately
    if (lead.auctionStatus !== 'active') {
      lead.auctionStatus = 'active';
      lead.auctionEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    await lead.save();
    fixed++;
  }

  console.log(`\nMigration complete: ${fixed} fixed, ${skipped} already correct / skipped`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
