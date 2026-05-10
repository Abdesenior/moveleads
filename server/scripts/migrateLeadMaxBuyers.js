/**
 * One-time migration: collapse legacy multi-buyer leads to exclusive (maxBuyers=1).
 *
 * Run manually: `node server/scripts/migrateLeadMaxBuyers.js`
 *
 * Only touches leads that have NOT been sold yet (no buyers, or empty buyers
 * array). Leads already partially or fully purchased keep their original
 * maxBuyers so we don't retroactively invalidate existing buyer slots.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Lead = require('../models/Lead');

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGO_URI / MONGODB_URI in env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[migrateLeadMaxBuyers] Connected to MongoDB');

  try {
    const result = await Lead.updateMany(
      {
        maxBuyers: { $gt: 1 },
        $or: [
          { buyers: { $size: 0 } },
          { buyers: { $exists: false } },
        ],
      },
      { $set: { maxBuyers: 1 } }
    );

    console.log(
      `[migrateLeadMaxBuyers] modifiedCount=${result.modifiedCount} ` +
      `matchedCount=${result.matchedCount}`
    );
  } catch (err) {
    console.error('[migrateLeadMaxBuyers] Error:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('[migrateLeadMaxBuyers] Disconnected');
  }
}

run();
