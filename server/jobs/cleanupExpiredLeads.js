const cron = require('node-cron');
const Lead = require('../models/Lead');

// Run daily at midnight — expire leads whose move date has passed
cron.schedule('0 0 * * *', async () => {
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
