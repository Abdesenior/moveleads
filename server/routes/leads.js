const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const { auth, admin } = authMiddleware;
const Lead = require('../models/Lead');
const User = require('../models/User');
const CoverageArea = require('../models/CoverageArea');
const PurchasedLead = require('../models/PurchasedLead');
const { doesLeadMatchMoverPreferences } = require('../utils/leadMatching');
const { deductLeadBalance, runAutoRecharge } = require('../services/billingService');
const { sendSpeedToLeadSMS } = require('../services/twilioService');
const PlatformSettings = require('../models/PlatformSettings');
const { sendReviewRequestEmail, sendAdminNotification, sendDisputeApprovedEmail } = require('../services/emailService');

const { calculateAuctionPrice } = require('../utils/pricingEngine');
const Transaction = require('../models/Transaction');
const { logAdminAction } = require('../utils/auditLog');
const { moverVisibilityFilter, isHiddenFromMovers, hiddenReason, routingMode, recordClaimBlocked } = require('../utils/leadVisibility');

// NOTE: The public `POST /api/leads/ingest` handler lives in routes/leadIngest.js
// and is mounted directly in server.js BEFORE the verifiedGate-wrapped
// /api/leads mount — visitors are not authenticated. Anything that previously
// lived here (helpers, rate limiter, the handler itself) was moved verbatim
// to routes/leadIngest.js. Don't add public surface to this router.

// @route   GET /api/leads/widget-analytics
// @desc    Get ROI stats for leads captured via the user's widget
// @access  Private
router.get('/widget-analytics', auth, async (req, res) => {
  try {
    // Phase 6 — mover-facing widget analytics excludes rejected leads when
    // ENABLE_TIERED_ROUTING=rejected_only (or 'full'). In mode=off this is
    // a no-op spread (`{}`).
    const widgetLeads = await Lead.find({
      sourceCompany: req.user.id,
      ...moverVisibilityFilter(),
    }).sort({ createdAt: -1 });
    const totalLeads = widgetLeads.length;

    let pipelineValue = 0;
    widgetLeads.forEach(lead => {
      const s = lead.homeSize || '';
      if (s.includes('Studio')) pipelineValue += 500;
      else if (s.includes('1 Bed')) pipelineValue += 900;
      else if (s.includes('2 Bed')) pipelineValue += 1500;
      else if (s.includes('3 Bed')) pipelineValue += 2200;
      else pipelineValue += 3000; // 4+ beds
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentLeadsCount = widgetLeads.filter(l => new Date(l.createdAt) > thirtyDaysAgo).length;

    res.json({
      success: true,
      stats: { totalLeads, pipelineValue, recentLeadsCount },
      recentLeads: widgetLeads.slice(0, 5).map(l => ({
        _id: l._id,
        customerName: l.customerName,
        homeSize: l.homeSize,
        createdAt: l.createdAt,
        originCity: l.originCity,
        destinationCity: l.destinationCity,
      })),
    });
  } catch (err) {
    console.error('[Widget Analytics Error]:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/leads/deals
// @desc    Deal Room — discounted secondary inventory (V1)
// @access  Private (mover) — admins get 200 with their normal view too;
//          purchased-by-this-mover leads are intentionally NOT bypass-added
//          here (My Leads is the canonical "leads I own" surface — Deal Room
//          is browse-only).
//
// Gated by ENABLE_DEAL_ROOM env flag. When off → 404 (mover page renders an
// empty state cleanly). When on → returns leads with inventoryChannel='deal_room'
// that pass moverVisibilityFilter, status filter, and future-move-date filter.
// Reuses the same quality/safety guards as the main feed; only the channel
// differs.
router.get('/deals', auth, async (req, res) => {
  const { isEnabled } = require('../utils/dealRoomFeature');
  if (!isEnabled()) {
    return res.status(404).json({ msg: 'Deal Room is not enabled' });
  }
  try {
    // Phase 3 — same four-axis filter as the main feed, surface=deal_room.
    // Sale-mechanism (distributionModel) intentionally NOT a visibility gate
    // here either — auction-stamped Deal Room leads remain visible for
    // buy-now. Bidding on instant leads is still blocked separately by bids.js.
    const query = {
      inventoryChannel: 'deal_room',
      status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] },
      moveDate: { $gte: new Date() },
      ...moverVisibilityFilter(),
    };

    let leads = await Lead.find(query)
      .select('-customerName -customerPhone -customerEmail -specialInstructions -customerNotes -notifiedAt')
      .sort({ updatedAt: -1 })
      .lean();

    // Discount percent computed at display (not stored). Safe when
    // originalPrice is missing — returns 0%, mover just sees the price.
    leads = leads.map(l => {
      const orig = Number(l.originalPrice) || 0;
      const now = Number(l.buyNowPrice) || 0;
      const discountPercent = (orig > 0 && now < orig)
        ? Math.round((1 - now / orig) * 100)
        : 0;
      return { ...l, discountPercent };
    });

    res.json(leads);
  } catch (err) {
    console.error('[Deals Endpoint] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   GET /api/leads
// @desc    Get all leads
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    let query = {};

    // If user is not admin, only show Available leads OR leads they have purchased
    if (req.user.role !== 'admin') {
      // A mover should only see:
      // 1. Leads they have already purchased.
      // 2. Public marketplace leads (no sourceCompany) with a future move date.
      // 3. Leads generated by their own private widget.
      //
      // Phase 3 — unified mover feed filter. Four orthogonal axes, one
      // AND. distributionDecision is the SOLE quality gate (replaces the
      // pre-Phase-3 8-clause AND on shadowTier / qualityGateCleared /
      // structuralBlockers / validation.*). distributionModel is no
      // longer consulted here — retired as a visibility gate so legacy
      // 'auction'-stamped or pre-Phase-A leads can flow through once
      // they're approved. Sale-mechanism behavior (auctions vs instant
      // buy-now) is still controlled by distributionModel inside the
      // bid + settle paths.
      const availableBranch = {
        status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] },  // lifecycle
        moveDate: { $gte: new Date() },                            // time
        inventoryChannel: { $nin: ['deal_room', 'archived'] },     // surface
        $or: [
          { sourceCompany: { $exists: false } }, // public platform leads
          { sourceCompany: req.user.id },        // mover's own widget leads
        ],
        ...moverVisibilityFilter(),                                // quality
      };
      query = {
        $or: [
          { 'buyers.company': req.user.id }, // purchased — always visible
          availableBranch,
        ]
      };

      // The lead feed is fully browseable. We DO NOT filter by CoverageArea
      // here — instead, every lead is annotated below with
      // `_matchesPreferences` and the response is sorted matched-first. The
      // client renders a "Matched for you" tab on top of the same dataset.
    }

    // Expire bulk-imported leads whose move date has already passed.
    await Lead.updateMany(
      {
        status: 'READY_FOR_DISTRIBUTION',
        moveDate: { $lt: new Date() },
        $or: [{ buyers: { $size: 0 } }, { buyers: { $exists: false } }]
      },
      { $set: { status: 'Expired', auctionStatus: 'expired' } }
    );

    // Ensure every available, unbought lead with a future move date has an active auction.
    // This catches:
    //   - 'expired' leads (24h window lapsed but no buyer yet)
    //   - 'pending' leads (admin-created leads that never got activated)
    //   - null/undefined auctionStatus (old leads created before auction system)
    await Lead.updateMany(
      {
        auctionStatus: { $nin: ['active', 'sold', 'buy_now'] },
        status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] },
        moveDate: { $gte: new Date() },
        $or: [
          { buyers: { $size: 0 } },
          { buyers: { $exists: false } }
        ]
      },
      {
        $set: {
          auctionStatus: 'active',
          auctionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      }
    );

    // Sort by when each lead became visible to movers (distributionDecisionAt),
    // not when the homeowner originally submitted (createdAt). A 21-day-old
    // lead approved today is "freshly listed" from the mover's POV and should
    // rank with today's listings, not 21 days back. createdAt tiebreaker keeps
    // ordering deterministic on millisecond-collision and sinks the rare
    // legacy lead with a missing decision timestamp to the bottom.
    const leads = await Lead.find(query).sort({ distributionDecisionAt: -1, createdAt: -1 }).lean();

    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    // V5 Phase 1 — annotate leads with their most-recent shadow scoring tier
    // for admin viewers only. Single aggregation lookup (one DB roundtrip) to
    // avoid N+1 queries. Mover-facing requests don't get this annotation —
    // the tier is shadow-mode and must not influence mover behavior yet.
    if (isAdmin && leads.length > 0) {
      const ScoringSnapshot = require('../models/ScoringSnapshot');
      const leadIds = leads.map(l => l._id);
      const latestPerLead = await ScoringSnapshot.aggregate([
        { $match: { leadId: { $in: leadIds } } },
        { $sort: { createdAt: -1 } },
        { $group: {
            _id: '$leadId',
            tier: { $first: '$tier' },
            composite: { $first: '$scores.compositeScore' },
            engineVersion: { $first: '$engineVersion' },
        }},
      ]);
      const tierByLeadId = new Map(latestPerLead.map(s => [String(s._id), s]));
      for (const l of leads) {
        const s = tierByLeadId.get(String(l._id));
        if (s) {
          l._shadowTier = s.tier;
          l._shadowComposite = s.composite;
          l._shadowEngineVersion = s.engineVersion;
        }
      }
    }

    // For non-admin users, annotate each lead with _matchesPreferences.
    // The client uses this flag to (a) filter the "Matched for you" tab and
    // (b) render the "Matches your setup" badge on individual cards.
    //
    // We deliberately do NOT re-sort the response by match. The "All" tab is
    // strict newest-listed first (preserves the distributionDecisionAt-desc
    // order Mongo produced). The "Matched for you" tab is the relevance view —
    // it filters by _matchesPreferences client-side, keeping the same freshness
    // order within the filtered subset. Combining the two on the server side
    // produced confusing orderings like "4d-ago (matched) > 1h-ago (unmatched)"
    // on the All tab; that's now gone.
    if (!isAdmin) {
      const me = await User.findById(req.user.id).select('maxDistance preferredHomeSizes').lean();
      const myZips = await CoverageArea.distinct('zipCode', { company: req.user.id });
      const zipSet = new Set((myZips || []).map(z => String(z)));
      for (const l of leads) {
        l._matchesPreferences = doesLeadMatchMoverPreferences(l, me || {}, zipSet);
      }
    }

    // ── PII redaction ─────────────────────────────────────────────────────────
    // Customer contact/free-text fields must NEVER leak to non-buyers. A mover
    // only earns access to customerName/phone/email/notes once they appear in
    // lead.buyers. Admins see everything. Projection is unsafe here because
    // some leads in this response ARE owned by req.user (matched via the
    // 'buyers.company' branch of `query`) — so we post-process per-lead.
    if (!isAdmin) {
      const myId = String(req.user.id);
      const redacted = leads.map(l => {
        const isBuyer = Array.isArray(l.buyers) && l.buyers.some(b => b && b.company && String(b.company) === myId);
        if (isBuyer) return l;
        // Strip every customer-identifying / free-text field. Keep route,
        // origin/destination city/state/zip, homeSize, moveDate, distance,
        // score, grade, buyNowPrice, currentBidPrice, auctionEndsAt,
        // _matchesPreferences, etc.
        delete l.customerName;
        delete l.customerPhone;
        delete l.customerEmail;
        delete l.specialInstructions;
        delete l.customerNotes;
        delete l.customerStatus;
        delete l.statusHistory;
        // No explicit street/address field in the schema, but redact defensively
        // if older docs have one.
        delete l.customerStreet;
        delete l.customerAddress;
        return l;
      });
      return res.json(redacted);
    }

    res.json(leads);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/leads
// @desc    Admin: Create new lead
// @access  Private (Admin)
//
// Notification side-effects (added):
//   - emits NEW_LEAD_AVAILABLE to zip socket rooms (so connected matching
//     movers see the lead instantly in their LeadFeed)
//   - broadcasts SMS to movers whose preferences match (coverage + distance
//     + home size, gated by smsNotif=true)
//   - does NOT trigger the warm-transfer voice flow — that's reserved for
//     verified ingest leads with a Grade A score. Admin leads bypass
//     verification and would rake-fire calls otherwise.
//
// Opt-out: pass ?notify=false to suppress notifications (use during bulk
// CSV imports of stale historical leads).
router.post('/', [auth, admin], async (req, res) => {
  try {
    const body = req.body;
    if (body.price && !body.buyNowPrice) body.buyNowPrice = body.price;
    const newLead = new Lead(body);
    const lead = await newLead.save();

    const notify = String(req.query.notify || 'true').toLowerCase() !== 'false';
    if (notify) {
      // First-time broadcast for a freshly-created lead. Intentionally NOT
      // passing `force: true` — the in-memory `lead.notifiedAt` is null at
      // this point so all three calls proceed, and the atomic Mongo update
      // inside the broadcasts means subsequent re-runs (e.g. an admin
      // re-pricing flow, if one is ever added) will short-circuit unless
      // they pass `{ force: true }`.
      try {
        const socketService = require('../services/socketService');
        socketService.emitNewLead(lead);
      } catch (e) {
        console.error('[AdminLead] socket emit failed:', e.message);
      }
      try {
        const { broadcastLeadSMS } = require('../services/twilioService');
        broadcastLeadSMS(lead).catch(() => {});
      } catch (e) {
        console.error('[AdminLead] sms broadcast failed:', e.message);
      }
      try {
        const { broadcastLeadEmail } = require('../services/emailService');
        broadcastLeadEmail(lead).catch(() => {});
      } catch (e) {
        console.error('[AdminLead] email broadcast failed:', e.message);
      }
    }

    res.json(lead);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/leads/:id
// @desc    Admin: Update lead
// @access  Private (Admin)
//
// WP12.4b — Allowlist admin-writable fields. Previously the entire req.body
// was spread into $set, which exposed lifecycle-critical fields (buyers,
// bids, auctionStatus, auctionEndsAt, notifiedAt, winnerId, finalPrice,
// sourceCompany). A typo in the admin UI could corrupt the auction state
// machine or silently re-attribute revenue. Now we only allow a curated
// set of editable fields.
const ADMIN_LEAD_WRITABLE = [
  'status', 'buyNowPrice', 'currentBidPrice', 'score', 'grade',
  'customerName', 'customerPhone', 'customerEmail',
  'originCity', 'originState', 'originZip',
  'destinationCity', 'destinationState', 'destinationZip',
  'homeSize', 'moveDate', 'distance', 'miles', 'specialInstructions',
];

router.put('/:id', [auth, admin], async (req, res) => {
  try {
    let lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ msg: 'Lead not found' });

    // Build a clean update object from the allowlist only. Silently drop
    // anything else — rejecting with 400 would surface as a confusing UX
    // bug if the admin form ever submits an unmodified field.
    const update = {};
    for (const key of ADMIN_LEAD_WRITABLE) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    // Backwards-compat: legacy admin UI submits `price`; treat it as buyNowPrice
    // when buyNowPrice isn't explicitly set.
    if (req.body.price !== undefined && update.buyNowPrice === undefined) {
      update.buyNowPrice = req.body.price;
    }

    if (update.moveDate) {
      // Treat plain YYYY-MM-DD as noon UTC so no timezone shifts the calendar day
      const raw = String(update.moveDate).trim();
      update.moveDate = /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? new Date(raw + 'T12:00:00.000Z')
        : new Date(raw);
    }
    lead = await Lead.findByIdAndUpdate(req.params.id, { $set: update }, { returnDocument: 'after' });
    res.json(lead);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/leads/:id
// @desc    Admin: Delete a lead permanently (with refund cascade)
// @access  Private (Admin)
//
// WP12.3 — Refund cascade: deleting a lead must reimburse every mover who
// bought it. Previously, this route just dropped the Lead + PurchasedLead docs
// and silently kept the mover's money. We now:
//   1. Fetch all PurchasedLeads for this lead.
//   2. For each non-refunded purchase, $inc the buyer's balance by pricePaid
//      and write a 'Lead Refund' Transaction. The lead_refund_idempotency
//      partial-unique index on Transaction { purchasedLead, type: 'Lead Refund' }
//      ensures duplicate-key (E11000) → no-op, so a double-delete (or a prior
//      admin refund) never double-credits the mover.
//   3. Delete the Lead and PurchasedLead records.
//   4. Audit row with refundedCount + refundedTotal in metadata.
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ msg: 'Lead not found' });

    // 1. Find all purchases for this lead.
    const purchases = await PurchasedLead.find({ lead: req.params.id });

    let refundedCount = 0;
    let refundedTotal = 0;
    const refundedCompanies = [];

    for (const pl of purchases) {
      // Skip if already refunded by admin/voice path.
      if (pl.refunded === true) continue;

      const refundAmount = Number(pl.pricePaid || 0);
      if (!Number.isFinite(refundAmount) || refundAmount <= 0) continue;

      try {
        // Insert Transaction FIRST — the lead_refund_idempotency unique
        // partial index is the strict gate. Duplicate key → already refunded
        // via another path; skip the balance bump.
        try {
          await new Transaction({
            user: pl.company,
            type: 'Lead Refund',
            amount: refundAmount,
            description: `Admin lead deletion refund: lead ${req.params.id}`,
            lead: pl.lead,
            purchasedLead: pl._id,
            status: 'Completed',
          }).save();
        } catch (txErr) {
          if (txErr && txErr.code === 11000) {
            // Already refunded — no-op, do not bump balance.
            continue;
          }
          throw txErr;
        }

        // Atomic balance bump + flag flip — only runs if the Transaction
        // insert above won the idempotency race.
        const userAfter = await User.findByIdAndUpdate(
          pl.company,
          { $inc: { balance: refundAmount } },
          { new: true }
        ).select('balance email companyName');

        await PurchasedLead.updateOne(
          { _id: pl._id },
          { $set: { refunded: true, refundedAt: new Date(), refundedBy: req.user.id } }
        );

        refundedCount += 1;
        refundedTotal += refundAmount;
        refundedCompanies.push({ company: pl.company, email: userAfter?.email, companyName: userAfter?.companyName, amount: refundAmount });
      } catch (innerErr) {
        // One bad refund must not block the rest. Logged for ops follow-up.
        console.error('[Delete Lead] Refund failed for purchasedLead', pl._id, '-', innerErr.message);
      }
    }

    // 2. Now delete the Lead + PurchasedLead docs.
    await Lead.findByIdAndDelete(req.params.id);
    await PurchasedLead.deleteMany({ lead: req.params.id });

    // 3. Audit row.
    logAdminAction({
      actor: req.user.id,
      action: 'lead.delete',
      targetType: 'lead',
      targetId: lead._id,
      before: { status: lead.status, buyersCount: Array.isArray(lead.buyers) ? lead.buyers.length : 0 },
      after: null,
      metadata: { refundedCount, refundedTotal, route: lead.route },
    });

    // 4. Best-effort emails (reuse dispute-approved template — generic
    //    "credit applied" copy fits the case). Non-blocking.
    const route = lead.route || `${lead.originCity || ''} → ${lead.destinationCity || ''}`;
    for (const r of refundedCompanies) {
      if (!r.email) continue;
      sendDisputeApprovedEmail({
        toEmail: r.email,
        companyName: r.companyName,
        refundAmount: r.amount,
        leadRoute: route,
      }).catch(err => {
        console.error('[Delete Lead] Refund email failed:', err.message);
      });
    }

    res.json({ success: true, msg: 'Lead deleted successfully', refundedCount, refundedTotal });
  } catch (err) {
    console.error('[Delete Lead]', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/leads/:id/claim
// @desc    Claim/Buy a lead with concurrency control
// @access  Private
router.post('/:id/claim', auth, async (req, res) => {
  // 1. Validate ObjectId before touching the DB
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ msg: 'Invalid lead ID' });
  }

  try {
    // 2. Pre-flight: check balance BEFORE touching the lead document.
    //    This ensures a failed balance check never partially mutates lead state.
    const mover = await User.findById(req.user.id);
    if (!mover) return res.status(404).json({ msg: 'User not found' });

    const leadPrecheck = await Lead.findById(req.params.id);
    if (!leadPrecheck) return res.status(404).json({ msg: 'Lead not found' });

    // Phase 6 — block claims of rejected leads in rejected_only/full mode.
    // Returns the same 404-equivalent semantics so movers don't get a
    // different error surface than for a truly-missing lead. Logged so
    // admin can correlate via /admin/quality-analytics action timeline.
    if (isHiddenFromMovers(leadPrecheck)) {
      console.log(`[leadVisibility] blocked claim of ${leadPrecheck._id} by ${req.user.id}: ${hiddenReason(leadPrecheck)} (mode=${routingMode()})`);
      recordClaimBlocked();
      return res.status(404).json({ msg: 'Lead not available' });
    }

    const leadCost = leadPrecheck.price || 0;
    if (mover.balance < leadCost) {
      return res.status(400).json({ msg: 'Insufficient balance to purchase lead' });
    }

    // 3. Atomically claim the lead slot.
    //    findOneAndUpdate with $push is a single atomic document operation —
    //    no multi-document transaction required (works on standalone MongoDB).
    const lead = await Lead.findOneAndUpdate(
      {
        _id: req.params.id,
        $expr: { $lt: [{ $size: '$buyers' }, '$maxBuyers'] },
        'buyers.company': { $ne: new mongoose.Types.ObjectId(req.user.id) }
      },
      { $push: { buyers: { company: req.user.id, pricePaid: 0 } } },
      { returnDocument: 'after' }
    );

    if (!lead) {
      // Distinguish between not-found, already-owned, and sold-out.
      const existing = await Lead.findById(req.params.id);
      if (!existing) return res.status(404).json({ msg: 'Lead not found' });
      if (existing.buyers.some(b => b.company.toString() === req.user.id)) {
        return res.status(400).json({ msg: 'You already purchased this lead' });
      }
      return res.status(409).json({ msg: 'Sorry, another mover grabbed this lead first!' });
    }

    // 4. Mark as Purchased once all slots are filled.
    if (lead.buyers.length >= lead.maxBuyers) {
      lead.status = 'Purchased';
      await lead.save();
    }

    // 5. Deduct balance atomically (single-document op, no session needed).
    const billing = await deductLeadBalance(req.user.id, lead.price);
    const newBalance = billing.balance;

    // 5. Increment user metrics.
    await User.findByIdAndUpdate(req.user.id, { $inc: { leadsPurchased: 1 } });

    // 6. Audit record.
    await new PurchasedLead({
      company: req.user.id,
      lead: lead._id,
      pricePaid: lead.buyNowPrice || lead.price,
    }).save().catch(err => { if (err.code !== 11000) throw err; });

    res.json({
      success: true,
      message: 'Lead claimed successfully',
      lead,
      balance: newBalance
    });

    // 7. Post-purchase side effects (non-blocking).
    runAutoRecharge(req.user.id).catch(err => {
      console.error('[Auto-Recharge Background Error]', err.message);
    });

    sendAdminNotification({
      subject: `🎯 Lead Purchased — ${mover.companyName} bought a $${lead.price} lead`,
      html: `
        <h2>Lead Purchased</h2>
        <p><strong>Company:</strong> ${mover.companyName}</p>
        <p><strong>Email:</strong> ${mover.email}</p>
        <p><strong>Lead:</strong> ${lead.originCity} → ${lead.destinationCity}</p>
        <p><strong>Home Size:</strong> ${lead.homeSize}</p>
        <p><strong>Move Date:</strong> ${new Date(lead.moveDate).toLocaleDateString('en-US', { timeZone: 'UTC' })}</p>
        <p><strong>Amount Charged:</strong> $${lead.price}</p>
        <p><strong>Mover Balance After:</strong> $${newBalance.toFixed(2)}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
        <a href="https://moveleads.cloud/admin/leads">View in Admin Panel →</a>
      `
    }).catch(() => {});

    User.findById(req.user.id).then(company => {
      if (company) {
        sendSpeedToLeadSMS(lead, company).catch(err => {
          console.error('[Background SMS Trace] Automation error:', err.message);
        });
      }
    }).catch(() => { });

  } catch (err) {
    console.error(`[Claim Error] ${req.user.id} -> ${req.params.id}:`, err.message);

    if (err.message === 'Insufficient balance to purchase lead') {
      return res.status(400).json({ msg: err.message });
    }

    res.status(500).json({ msg: 'Internal server error during lead claim' });
  }
});

// @route   PATCH /api/leads/:id/crm-status
// @desc    Update the CRM status and/or notes for a lead this company purchased
// @access  Private
router.patch('/:id/crm-status', auth, async (req, res) => {
  const { crmStatus, crmNotes } = req.body;
  const PurchasedLead = require('../models/PurchasedLead');
  const VALID = PurchasedLead.CRM_STATUSES;

  if (crmStatus !== undefined && !VALID.includes(crmStatus)) {
    return res.status(400).json({ msg: `Invalid status. Must be one of: ${VALID.join(', ')}` });
  }

  try {
    const update = {};
    if (crmStatus !== undefined) update.crmStatus = crmStatus;
    if (crmNotes !== undefined) update.crmNotes = crmNotes;

    const record = await PurchasedLead.findOneAndUpdate(
      { lead: req.params.id, company: req.user.id },
      { $set: update },
      { returnDocument: 'after' }
    ).populate('lead');

    if (!record) {
      return res.status(404).json({ msg: 'No purchase record found for this lead.' });
    }

    // Automate Review Request if marked as Completed
    if (update.crmStatus === 'Completed') {
      const mover = await User.findById(req.user.id);
      if (mover && mover.googleReviewLink && record.lead && record.lead.customerEmail) {
        // Fire and forget email
        sendReviewRequestEmail({
          toEmail: record.lead.customerEmail,
          customerName: record.lead.customerName,
          companyName: mover.companyName,
          reviewLink: mover.googleReviewLink
        }).catch(err => {
          console.error('[Background Review Email Error]', err.message);
        });
      }
    }

    res.json(record);
  } catch (err) {
    console.error('[CRM status]', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
