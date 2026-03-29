const express  = require('express');
const router   = express.Router();
const Lead     = require('../models/Lead');
const User     = require('../models/User');
const PurchasedLead = require('../models/PurchasedLead');
const { auth } = require('../middleware/auth');
const { getIo } = require('../services/socketService');

// ── Helpers ──────────────────────────────────────────────────────────────────
function broadcastBidUpdate(lead) {
  const io = getIo();
  if (!io) return;
  const payload = {
    leadId:         lead._id,
    currentBidPrice: lead.currentBidPrice,
    auctionEndsAt:  lead.auctionEndsAt,
    totalBids:      lead.bids.length,
  };
  io.to(`zip_${lead.originZip}`).to(`zip_${lead.destinationZip}`).emit('bid_update', payload);
}

function broadcastLeadSold(lead, buyerId) {
  const io = getIo();
  if (!io) return;
  io.to(`zip_${lead.originZip}`).to(`zip_${lead.destinationZip}`).emit('lead_sold', { leadId: lead._id, buyerId: buyerId?.toString() });
}

// ── POST /api/bids/:leadId — Place a bid ──────────────────────────────────────
router.post('/:leadId', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Valid bid amount required' });

    const lead = await Lead.findById(req.params.leadId);
    if (!lead)                            return res.status(404).json({ error: 'Lead not found' });
    if (lead.auctionStatus !== 'active')  return res.status(400).json({ error: 'Auction is not active' });
    if (new Date() > lead.auctionEndsAt)  return res.status(400).json({ error: 'Auction has ended' });
    if (amount <= lead.currentBidPrice)   return res.status(400).json({ error: `Bid must be higher than current bid of $${lead.currentBidPrice}` });

    const mover = await User.findById(req.user.id);
    if (!mover || mover.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    lead.bids.push({ company: req.user.id, amount: Number(amount), placedAt: new Date() });
    lead.currentBidPrice = Number(amount);

    // Anti-sniping: extend by 2 min if bid placed in final 2 min
    const twoMin = new Date(Date.now() + 2 * 60 * 1000);
    if (lead.auctionEndsAt < twoMin) lead.auctionEndsAt = twoMin;

    await lead.save();
    broadcastBidUpdate(lead);

    res.json({ success: true, currentBidPrice: lead.currentBidPrice, auctionEndsAt: lead.auctionEndsAt });
  } catch (err) {
    console.error('[Bids] Place bid error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/bids/:leadId/buy-now — Instant claim ───────────────────────────
router.post('/:leadId/buy-now', auth, async (req, res) => {
  try {
    // Atomic: only one mover can flip status to 'buy_now'
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.leadId, auctionStatus: 'active' },
      { $set: { auctionStatus: 'buy_now' } },
      { returnDocument: 'after' }
    );
    if (!lead) return res.status(400).json({ error: 'Lead no longer available' });

    const mover = await User.findById(req.user.id);
    if (!mover || mover.balance < lead.buyNowPrice) {
      // Revert — not enough balance
      lead.auctionStatus = 'active';
      await lead.save();
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    await User.findByIdAndUpdate(req.user.id, { $inc: { balance: -lead.buyNowPrice } });

    lead.winnerId   = req.user.id;
    lead.finalPrice = lead.buyNowPrice;
    lead.auctionStatus = 'sold';
    lead.status     = 'Purchased';
    lead.buyers.push({ company: req.user.id, purchasedAt: new Date(), pricePaid: lead.buyNowPrice });
    await lead.save();

    // Create audit record so the purchase appears in My Leads
    await new PurchasedLead({
      company:   req.user.id,
      lead:      lead._id,
      pricePaid: lead.buyNowPrice,
    }).save().catch(err => { if (err.code !== 11000) throw err; });

    broadcastLeadSold(lead, req.user.id);

    res.json({ success: true, message: 'Lead claimed!', pricePaid: lead.buyNowPrice, lead });
  } catch (err) {
    console.error('[Bids] Buy-now error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/bids/:leadId/settle — Called by cron when auction expires ───────
router.post('/:leadId/settle', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.leadId);
    if (!lead || lead.auctionStatus !== 'active') return res.sendStatus(200);
    if (new Date() < lead.auctionEndsAt)          return res.sendStatus(200);

    if (lead.bids.length === 0) {
      lead.auctionStatus = 'expired';
      await lead.save();
      return res.json({ result: 'expired' });
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

    res.json({ result: 'sold', finalPrice: winning.amount });
  } catch (err) {
    console.error('[Bids] Settle error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
