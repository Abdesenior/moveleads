const cron = require('node-cron');
const Lead = require('../models/Lead');

// Run daily at 05:00 UTC (midnight US Eastern) — expire leads whose move date has passed
cron.schedule('0 5 * * *', async () => {
  try {
    const result = await Lead.updateMany(
      {
        moveDate: { $lt: new Date() },
        status: { $nin: ['Purchased', 'Expired'] },
      },
      { $set: { status: 'Expired', auctionStatus: 'expired' } }
    );
    console.log(`[Cleanup] Expired ${result.modifiedCount} past-date leads`);
  } catch (err) {
    console.error('[Cleanup Cron] Error:', err.message);
  }
});

module.exports = {};
