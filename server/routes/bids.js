/**
 * Runbook:
 *   POST /api/bids/:leadId/settle requires the x-cron-secret header to match
 *   the CRON_SECRET environment variable. The in-process cron at
 *   server/jobs/settleAuctions.js does NOT hit this route — it talks to
 *   Mongoose directly — so this endpoint is only used for manual/external
 *   re-settlement. Set CRON_SECRET in the server env before deploying.
 */

const express  = require('express');
const router   = express.Router();
const Lead     = require('../models/Lead');
const User     = require('../models/User');
const PurchasedLead = require('../models/PurchasedLead');
const Transaction   = require('../models/Transaction');
const { auth } = require('../middleware/auth');
const { getIo } = require('../services/socketService');
const { settleOneLead } = require('../jobs/settleAuctions');

// Cron-secret guard for endpoints triggered out-of-band by schedulers.
// Returns 401 instead of 403 so curious authenticated callers can't tell
// whether the route exists vs. requires a different role.
function requireCronSecret(req, res, next) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'];
  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

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

    const price = lead.buyNowPrice;

    // Atomic conditional debit — single op enforces balance >= price.
    // Eliminates the read-then-write race where two concurrent buy-nows
    // on different leads can drive a single account negative.
    const debited = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: price } },
      { $inc: { balance: -price } },
      { new: true }
    );

    if (!debited) {
      // Insufficient balance (or concurrent debit drained it).
      // Revert the lead claim atomically (only if we still own the 'buy_now' flip).
      await Lead.findOneAndUpdate(
        { _id: lead._id, auctionStatus: 'buy_now' },
        { $set: { auctionStatus: 'active' } }
      );
      return res.status(402).json({ msg: 'Insufficient balance', error: 'Insufficient balance' });
    }

    // Create audit row first so a duplicate { company, lead } trips before we
    // mutate lead.buyers / status. On E11000 we refund and revert.
    let purchasedLeadDoc;
    try {
      purchasedLeadDoc = await new PurchasedLead({
        company:   req.user.id,
        lead:      lead._id,
        pricePaid: price,
      }).save();
    } catch (err) {
      if (err.code === 11000) {
        // Another concurrent claim won — refund and revert.
        await User.findOneAndUpdate(
          { _id: req.user.id },
          { $inc: { balance: price } }
        );
        await Lead.findOneAndUpdate(
          { _id: lead._id, auctionStatus: 'buy_now' },
          { $set: { auctionStatus: 'active' } }
        );
        return res.status(409).json({ error: 'Lead already claimed' });
      }
      throw err;
    }

    lead.winnerId   = req.user.id;
    lead.finalPrice = price;
    lead.auctionStatus = 'sold';
    lead.status     = 'Purchased';
    lead.buyers.push({ company: req.user.id, purchasedAt: new Date(), pricePaid: price });
    await lead.save();

    // Ledger entry — closes the gap so buy-now appears in transaction history.
    await Transaction.create({
      user:        req.user.id,
      type:        'Lead Purchase',
      amount:      price,
      description: `Buy-now purchase: lead ${lead._id}`,
      lead:        lead._id,
      purchasedLead: purchasedLeadDoc?._id,
      status:      'Completed',
    });

    broadcastLeadSold(lead, req.user.id);

    res.json({ success: true, message: 'Lead claimed!', pricePaid: price, lead });
  } catch (err) {
    console.error('[Bids] Buy-now error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/bids/:leadId/settle — Called by cron when auction expires ───────
// Requires x-cron-secret header matching process.env.CRON_SECRET. The
// internal node-cron job in server/jobs/settleAuctions.js does NOT call
// this route, it operates on Mongoose directly, so requiring auth here
// only affects manual / external invocations.
router.post('/:leadId/settle', requireCronSecret, async (req, res) => {
  try {
    // Delegate to the shared crash-safe settlement helper so the manual and
    // cron paths can't drift.  The helper handles the atomic 'settling'
    // claim, the runner-up fallback, the ledger row, and broadcast.
    const result = await settleOneLead(req.params.leadId);
    res.json({ result });
  } catch (err) {
    console.error('[Bids] Settle error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
