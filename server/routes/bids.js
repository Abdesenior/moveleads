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
const { isHiddenFromMovers, hiddenReason, routingMode, moverVisibilityFilter, recordClaimBlocked } = require('../utils/leadVisibility');
const { sendLeadPurchaseReceiptEmail } = require('../services/emailService');

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
    // Phase B — instant-dispatch leads do not accept bids. Buy-now / SMS
    // claim is the only purchase path for them. Return 409 (conflict with
    // the resource's distribution model) BEFORE any state mutation so the
    // route can never leave behind a partial write on an instant lead.
    if (lead.distributionModel === 'instant') {
      return res.status(409).json({
        error: 'bidding_not_supported',
        message: 'This lead is instant-dispatch only. Use Unlock Lead to claim it.',
      });
    }
    // Phase 6 — block bidding on rejected leads in rejected_only/full mode.
    if (isHiddenFromMovers(lead)) {
      console.log(`[leadVisibility] blocked bid on ${lead._id} by ${req.user.id}: ${hiddenReason(lead)} (mode=${routingMode()})`);
      recordClaimBlocked();
      return res.status(404).json({ error: 'Lead not available' });
    }
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
// Sibling: routes/twilio.js `/sms/inbound` CLAIM branch (PR-S3) replicates
// this atomic sequence for the SMS-reply claim path. Edits to the financial
// sequence here should be mirrored there (and vice versa); the two are pinned
// by their respective lock-in tests (this one's tests live in dealRoom.test
// + distributionModel.test; the SMS sibling has smsClaimLiveHandler.test).
router.post('/:leadId/buy-now', auth, async (req, res) => {
  try {
    // Atomic: only one mover can flip status to 'buy_now'.
    // Phase 6 — the moverVisibilityFilter is part of the atomic match so a
    // rejected lead (REJECTED_FAKE / admin-rejected / shadowTier=rejected) is
    // not winnable by a buy-now. moverVisibilityFilter() is `{}` in mode=off
    // so back-compat is preserved.
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.leadId, auctionStatus: 'active', ...moverVisibilityFilter() },
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

    // Receipt email — fire-and-forget. Mirrors the topup/activation
    // receipt pattern: a send failure logs but does not break the buy-now
    // success response. The mover has already paid + owns the lead via
    // the PurchasedLead mutex; the email is a paper trail, not a
    // money-safety surface.
    User.findById(req.user.id).select('email companyName balance').lean()
      .then(u => {
        if (!u?.email) return;
        return sendLeadPurchaseReceiptEmail({
          user:         u,
          lead,
          amount:       price,
          balanceAfter: u.balance,
          channel:      'dashboard',
          purchasedAt:  new Date(),
        });
      })
      .catch(e => console.error(`[Bids] Buy-now receipt email failed (non-fatal): ${e.message}`));

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
