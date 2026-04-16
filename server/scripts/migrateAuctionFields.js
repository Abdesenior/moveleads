/**
 * Migration: Backfill auction fields on legacy leads
 *
 * Targets any Lead document where auctionStatus is undefined/null
 * (i.e. created before the auction system was added).
 *
 * Sets:
 *   - buyNowPrice      (calculateAuctionPrice)
 *   - startingBidPrice (calculateAuctionPrice)
 *   - currentBidPrice  = 0
 *   - auctionStatus    = 'active'
 *   - auctionEndsAt    = now + 30 min
 *   - bids             = []  (if not already set)
 *
 * Usage:  node server/scripts/migrateAuctionFields.js
 *         (run from /MoveLeads root, or `node scripts/migrateAuctionFields.js` from /server)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Lead     = require('../models/Lead');
const { calculateAuctionPrice } = require('../utils/pricingEngine');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Find all leads that have no auctionStatus yet
  const leads = await Lead.find({ auctionStatus: { $exists: false } });
  console.log(`Found ${leads.length} leads to migrate`);

  if (leads.length === 0) {
    console.log('Nothing to do — all leads already have auction fields.');
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  const auctionEndsAt = new Date(Date.now() + 30 * 60 * 1000);

  for (const lead of leads) {
    const pricing = await calculateAuctionPrice({
      homeSize: lead.homeSize,
      miles:    lead.miles || 0,
      moveDate: lead.moveDate,
      grade:    lead.grade || 'C',
    });

    await Lead.findByIdAndUpdate(lead._id, {
      $set: {
        buyNowPrice:      pricing.buyNowPrice,
        startingBidPrice: pricing.startingBidPrice,
        currentBidPrice:  0,
        auctionStatus:    'active',
        auctionEndsAt,
        bids:             [],
      }
    });
    updated++;
  }

  console.log(`✅ Migrated ${updated} leads`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
