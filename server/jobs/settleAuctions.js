const cron = require('node-cron');
const Lead = require('../models/Lead');
const User = require('../models/User');
const PurchasedLead = require('../models/PurchasedLead');
const { getIo } = require('../services/socketService');

// Run every 2 minutes — settle any expired active auctions
cron.schedule('*/2 * * * *', async () => {
  try {
    const expired = await Lead.find({
      auctionStatus: 'active',
      auctionEndsAt: { $lte: new Date() },
    });

    for (const lead of expired) {
      if (lead.bids.length === 0) {
        lead.auctionStatus = 'expired';
        await lead.save();
        console.log(`[Auction] Lead ${lead._id} expired with no bids`);
        continue;
      }

      const winning = lead.bids.reduce((max, b) => b.amount > max.amount ? b : max);

      await User.findByIdAndUpdate(winning.company, { $inc: { balance: -winning.amount } });

      lead.winnerId      = winning.company;
      lead.finalPrice    = winning.amount;
      lead.auctionStatus = 'sold';
      lead.status        = 'Purchased';
      lead.buyers.push({ company: winning.company, purchasedAt: new Date(), pricePaid: winning.amount });
      await lead.save();

      await new PurchasedLead({
        company:   winning.company,
        lead:      lead._id,
        pricePaid: winning.amount,
      }).save().catch(err => { if (err.code !== 11000) throw err; });

      const io = getIo();
      if (io) {
        io.to(`zip_${lead.originZip}`).to(`zip_${lead.destinationZip}`).emit('auction_settled', {
          leadId:     lead._id,
          winnerId:   winning.company,
          finalPrice: winning.amount,
        });
      }

      console.log(`[Auction] Lead ${lead._id} settled — winner charged $${winning.amount}`);
    }
  } catch (err) {
    console.error('[Auction Cron] Error:', err.message);
  }
});

module.exports = {};
