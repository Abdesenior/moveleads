const cron = require('node-cron');
const Lead = require('../models/Lead');
const User = require('../models/User');
const PurchasedLead = require('../models/PurchasedLead');
const Transaction = require('../models/Transaction');
const { getIo } = require('../services/socketService');
const { sendAuctionWonEmail } = require('../services/emailService');

/**
 * Settle a single expired auction lead.
 *
 * Crash-safety strategy:
 *   1. Atomically flip the lead from 'active' → 'settling' so that a crash
 *      mid-loop leaves the lead in a discoverable interim state.  The outer
 *      finder query picks up both 'active' and 'settling' leads, so the next
 *      tick recovers from a previous crash.
 *   2. Iterate bids from highest to lowest.  For each candidate, do a
 *      conditional atomic debit gated by `balance >= amount`; on failure,
 *      fall through to the runner-up.
 *   3. Create the PurchasedLead row inside try/catch.  On E11000 (this lead
 *      was already settled by a parallel run / a prior tick that crashed
 *      after debit), refund the debit and break out — the lead is done.
 *   4. On success, write a 'Lead Purchase' Transaction row, set the lead to
 *      'sold' (or 'expired' if no candidate succeeded), and broadcast.
 *
 * Returns one of: 'sold' | 'expired' | 'skipped' | 'already_settled'.
 */
async function settleOneLead(leadId) {
  // Step 1 — Atomic claim into interim 'settling' status.
  // Accept either 'active' (normal path) or 'settling' (recovery from a
  // previous tick that crashed before reaching a terminal status).
  const claimed = await Lead.findOneAndUpdate(
    {
      _id: leadId,
      auctionStatus: { $in: ['active', 'settling'] },
      auctionEndsAt: { $lte: new Date() },
      // Phase B — instant-dispatch leads must never settle through the
      // auction path. They already lack `auctionEndsAt` so this $lte clause
      // would skip them on its own; this $ne is belt-and-suspenders against
      // any future code that mistakenly writes auctionEndsAt to an instant
      // lead. Existing (pre-Phase-A) leads have no distributionModel field
      // and pass through ($ne matches missing).
      distributionModel: { $ne: 'instant' },
    },
    { $set: { auctionStatus: 'settling' } },
    { new: true }
  );
  if (!claimed) return 'skipped';

  // Step 2 — No bids → expire.
  if (!claimed.bids || claimed.bids.length === 0) {
    claimed.auctionStatus = 'expired';
    await claimed.save();
    console.log(`[Auction] Lead ${claimed._id} expired with no bids`);
    return 'expired';
  }

  // Sort bids descending by amount; runner-up fallback iterates this list.
  const sortedBids = [...claimed.bids].sort((a, b) => b.amount - a.amount);

  let winningBid = null;
  let purchasedLeadDoc = null;
  let alreadySettled = false;

  for (const candidate of sortedBids) {
    // Step 3 — Atomic conditional debit gated by balance.
    const debited = await User.findOneAndUpdate(
      { _id: candidate.company, balance: { $gte: candidate.amount } },
      { $inc: { balance: -candidate.amount } },
      { new: true }
    );
    if (!debited) continue; // try next bid down

    // Step 4 — Create PurchasedLead audit row inside try/catch.
    try {
      purchasedLeadDoc = await new PurchasedLead({
        company:   candidate.company,
        lead:      claimed._id,
        pricePaid: candidate.amount,
      }).save();
    } catch (err) {
      if (err.code === 11000) {
        // This lead is already settled — refund our debit and bail.
        await User.findOneAndUpdate(
          { _id: candidate.company },
          { $inc: { balance: candidate.amount } }
        );
        alreadySettled = true;
        break;
      }
      // Unknown error — refund and rethrow to outer handler so the lead
      // stays in 'settling' for next-tick recovery.
      await User.findOneAndUpdate(
        { _id: candidate.company },
        { $inc: { balance: candidate.amount } }
      );
      throw err;
    }

    // Step 5 — Ledger row.
    await Transaction.create({
      user:        candidate.company,
      type:        'Lead Purchase',
      amount:      candidate.amount,
      description: `Auction win: lead ${claimed._id}`,
      lead:        claimed._id,
      purchasedLead: purchasedLeadDoc?._id,
      status:      'Completed',
    });

    winningBid = candidate;
    break;
  }

  if (alreadySettled) {
    // Another process already finalized this lead. Don't overwrite its status.
    return 'already_settled';
  }

  if (!winningBid) {
    // No candidate could afford their bid — expire.
    claimed.auctionStatus = 'expired';
    await claimed.save();
    console.log(`[Auction] Lead ${claimed._id} expired — no bidder could afford their bid`);
    return 'expired';
  }

  // Step 6 — Mark sold.
  claimed.winnerId      = winningBid.company;
  claimed.finalPrice    = winningBid.amount;
  claimed.auctionStatus = 'sold';
  claimed.status        = 'Purchased';
  claimed.buyers.push({
    company:     winningBid.company,
    purchasedAt: new Date(),
    pricePaid:   winningBid.amount,
  });
  await claimed.save();

  // Step 7 — Broadcast.
  const io = getIo();
  if (io) {
    io.to(`zip_${claimed.originZip}`).to(`zip_${claimed.destinationZip}`).emit('auction_settled', {
      leadId:     claimed._id,
      winnerId:   winningBid.company,
      finalPrice: winningBid.amount,
    });
    io.to(`zip_${claimed.originZip}`).to(`zip_${claimed.destinationZip}`).emit('lead_sold', {
      leadId:  claimed._id,
      buyerId: winningBid.company?.toString(),
    });
  }

  // Winner email — non-blocking.
  try {
    const winner = await User.findById(winningBid.company).select('email companyName');
    if (winner?.email) {
      const clientUrl = process.env.CLIENT_URL || 'https://app.moveleads.cloud';
      sendAuctionWonEmail({
        toEmail:      winner.email,
        companyName:  winner.companyName || 'there',
        finalPrice:   winningBid.amount,
        lead:         claimed,
        dashboardUrl: `${clientUrl}/dashboard/customers`,
      }).catch(err => console.error('[Auction] Win email error:', err.message));
    }
  } catch (err) {
    console.error('[Auction] Winner lookup error:', err.message);
  }

  console.log(`[Auction] Lead ${claimed._id} settled — winner charged $${winningBid.amount}`);
  return 'sold';
}

// Run every 2 minutes — settle any expired active (or stuck 'settling') auctions.
cron.schedule('*/2 * * * *', async () => {
  try {
    const expired = await Lead.find({
      auctionStatus: { $in: ['active', 'settling'] },
      auctionEndsAt: { $lte: new Date() },
      // Phase B — see settleOneLead for rationale.
      distributionModel: { $ne: 'instant' },
    }).select('_id');

    for (const lead of expired) {
      try {
        await settleOneLead(lead._id);
      } catch (err) {
        console.error(`[Auction Cron] Lead ${lead._id} error:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Auction Cron] Error:', err.message);
  }
});

module.exports = { settleOneLead };
