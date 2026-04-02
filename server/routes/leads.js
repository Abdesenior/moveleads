const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const { auth, admin } = authMiddleware;
const Lead = require('../models/Lead');
const User = require('../models/User');
const PurchasedLead = require('../models/PurchasedLead');
const { deductLeadBalance, runAutoRecharge } = require('../services/billingService');
const { sendSpeedToLeadSMS } = require('../services/twilioService');
const PlatformSettings = require('../models/PlatformSettings');
const { validateLeadPayload } = require('../validators/leadIngest');
const { sendReviewRequestEmail } = require('../services/emailService');
const { verifyLeadPhone } = require('../services/twilioService');

const { calculateLeadPrice, calculateAuctionPrice } = require('../utils/pricingEngine');
const { calculateLeadScore } = require('../services/scoringService');

// ── Rate limiter: lead ingestion ──────────────────────────────────────────────
// 5 quote submissions per IP per 10 minutes — prevents form spam and DDoS
const ingestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many quote requests. Please wait a few minutes before trying again.' },
});

// @route   POST /api/leads/ingest
// @desc    Receive and validate a quote request from the marketing site
// @access  Public (no auth — this is a public-facing form submission)
router.post('/ingest', ingestLimiter, async (req, res) => {
  // 1. Validate with Zod
  const validation = validateLeadPayload(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: validation.message,
      errors: validation.errors
    });
  }

  const data = validation.data;

  try {
    // 2. Compute route string and distance category
    const route = `${data.originCity} → ${data.destinationCity}`;
    // Simple heuristic: if origin and destination zips share the first 3 digits → Local
    const isLocal = data.originZip.substring(0, 3) === data.destinationZip.substring(0, 3);
    const distance = isLocal ? 'Local' : 'Long Distance';

    // 3. Get base price from DB pricing rules (existing engine)
    const leadPrice = await calculateLeadPrice({
      homeSize: data.homeSize,
      distance: distance
    });

    // 4. Preliminary score + grade (lineType unknown until Twilio; refines later)
    const { score, grade, scoreFactors } = calculateLeadScore(
      { homeSize: data.homeSize },
      data.miles || 0,
      null,
      data.moveDate
    );

    // 5. Auction pricing based on score/grade
    const auctionPricing = calculateAuctionPrice({
      homeSize: data.homeSize,
      miles: data.miles || 0,
      moveDate: data.moveDate,
      grade,
    });

    // 6. Save lead with auction fields
    const lead = new Lead({
      route,
      originCity: data.originCity,
      destinationCity: data.destinationCity,
      originZip: data.originZip,
      destinationZip: data.destinationZip,
      homeSize: data.homeSize,
      moveDate: new Date(data.moveDate),
      distance,
      price: auctionPricing.buyNowPrice || leadPrice,
      miles: data.miles || 0,
      status: 'Pending Verification',
      isVerified: false,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      specialInstructions: data.specialInstructions || '',
      estimatedWeight: data.estimatedWeight || '',
      numberOfRooms: data.numberOfRooms || 0,
      customerStatus: 'New',
      score, grade, scoreFactors,
      buyNowPrice: auctionPricing.buyNowPrice,
      startingBidPrice: auctionPricing.startingBidPrice,
      currentBidPrice: auctionPricing.startingBidPrice,
      auctionStatus: 'active',
      auctionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24-hour window
      ...(data.sourceCompany && mongoose.isValidObjectId(data.sourceCompany) && { sourceCompany: data.sourceCompany }),
      statusHistory: [{ status: 'Pending Verification', timestamp: new Date() }]
    });

    await lead.save();

    // 5. Trigger Twilio Verification in the background (NON-BLOCKING)
    // testMode: skip real Twilio lookup when x-test-lead header is set or NODE_ENV=development
    const testMode = req.headers['x-test-lead'] === 'true' || process.env.NODE_ENV === 'development';
    verifyLeadPhone(lead._id, { testMode }).catch(err => {
      console.error('[Twilio Background Trace] Verification failed:', err.message);
    });

    res.status(201).json({
      success: true,
      message: 'Quote request received successfully. Your lead is pending verification.',
      lead: {
        id: lead._id,
        route: lead.route,
        moveDate: lead.moveDate,
        homeSize: lead.homeSize,
        status: lead.status
      }
    });
  } catch (err) {
    console.error('LEAD INGEST ERROR:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

// @route   GET /api/leads/widget-analytics
// @desc    Get ROI stats for leads captured via the user's widget
// @access  Private
router.get('/widget-analytics', auth, async (req, res) => {
  try {
    const widgetLeads = await Lead.find({ sourceCompany: req.user.id }).sort({ createdAt: -1 });
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
      query = {
        $or: [
          { 'buyers.company': req.user.id },
          {
            status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] },
            moveDate: { $gte: new Date() }, // Only future move dates
            $or: [
              { sourceCompany: { $exists: false } }, // Public "platform" leads
              { sourceCompany: req.user.id }         // Leads from their own widget
            ]
          }
        ]
      };
    }

    // Re-activate any expired leads that still have no buyer and a future move date
    // (handles the case where 24h window lapsed but movers haven't seen the lead)
    await Lead.updateMany(
      {
        auctionStatus: 'expired',
        status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] },
        moveDate: { $gte: new Date() },
        $or: [
          { 'buyers': { $size: 0 } },
          { 'buyers': { $exists: false } }
        ]
      },
      {
        $set: {
          auctionStatus: 'active',
          auctionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      }
    );

    const leads = await Lead.find(query).sort({ createdAt: -1 });
    res.json(leads);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/leads
// @desc    Admin: Create new lead
// @access  Private (Admin)
router.post('/', [auth, admin], async (req, res) => {
  try {
    const body = req.body;
    if (body.price && !body.buyNowPrice) body.buyNowPrice = body.price;
    const newLead = new Lead(body);
    const lead = await newLead.save();
    res.json(lead);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/leads/:id
// @desc    Admin: Update lead
// @access  Private (Admin)
router.put('/:id', [auth, admin], async (req, res) => {
  try {
    let lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ msg: 'Lead not found' });

    const update = req.body;
    if (update.price && !update.buyNowPrice) update.buyNowPrice = update.price;
    lead = await Lead.findByIdAndUpdate(req.params.id, { $set: update }, { returnDocument: 'after' });
    res.json(lead);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/leads/:id
// @desc    Admin: Delete a lead permanently
// @access  Private (Admin)
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ msg: 'Lead not found' });

    await Lead.findByIdAndDelete(req.params.id);
    await PurchasedLead.deleteMany({ lead: req.params.id });

    res.json({ success: true, msg: 'Lead deleted successfully' });
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
