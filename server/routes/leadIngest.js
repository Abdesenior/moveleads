/**
 * Public Lead Ingest Router
 *
 * Receives quote-form submissions from the marketing site. Mounted at
 * `/api/leads/ingest` in server.js BEFORE the `verifiedGate`-wrapped
 * `/api/leads` mount — visitors are not authenticated, so this router
 * MUST stay outside any auth chain.
 *
 * Extracted from routes/leads.js to escape the email-verification gate
 * that protects the rest of `/api/leads` (mover dashboard, claims, etc.).
 * Logic is byte-for-byte the same as the previous in-place handler;
 * only the mount path differs (handler is now `router.post('/')`).
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const zipcodes = require('zipcodes');

const Lead = require('../models/Lead');
const User = require('../models/User');
const { validateLeadPayload } = require('../validators/leadIngest');
const { verifyLeadPhone } = require('../services/twilioService');
const { calculateLeadPrice, calculateAuctionPrice } = require('../utils/pricingEngine');
const { calculateLeadScore } = require('../services/scoringService');
const scoringPipeline = require('../services/scoringPipeline');
const validationPipeline = require('../services/validationPipeline');
const pricingEngineV2 = require('../services/pricingEngineV2');
const pricingEngineSimple = require('../services/pricingEngineSimple');

/* ── Haversine distance (miles) between two lat/lon pairs ─────────────────── */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* ── Compute straight-line miles from zip codes ───────────────────────────── */
function milesFromZips(originZip, destinationZip) {
  const o = zipcodes.lookup(originZip);
  const d = zipcodes.lookup(destinationZip);
  if (!o || !d) return 0;
  return haversine(o.latitude, o.longitude, d.latitude, d.longitude);
}

/* ── Derive a 2-letter state from a ZIP, server-side. ZIP is canonical;
   if it doesn't resolve we return '' and the optional schema field
   stays empty (the UI falls back to city-only). ─────────────────────── */
function stateFromZip(zip) {
  const z = zipcodes.lookup(String(zip || ''));
  return (z && z.state) ? String(z.state).toUpperCase() : '';
}

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
router.post('/', ingestLimiter, async (req, res) => {
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
    // 2. Duplicate check — same phone OR email submitted within the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const duplicate = await Lead.findOne({
      createdAt: { $gte: thirtyDaysAgo },
      $or: [
        { customerPhone: data.customerPhone },
        { customerEmail: data.customerEmail }
      ]
    });
    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active quote request. Please wait before submitting again.'
      });
    }

    // 3. Compute route string and real distance in miles
    const route = `${data.originCity} → ${data.destinationCity}`;

    // Trust miles from the form (calculated client-side via haversine + zipcodes).
    // If miles is 0 or missing (e.g. zip lookup failed on client), recompute server-side.
    const miles = (data.miles && data.miles > 0)
      ? data.miles
      : milesFromZips(data.originZip, data.destinationZip);

    const distance = miles > 100 ? 'Long Distance' : 'Local';

    // 3. Get base price from DB pricing rules (existing engine)
    const leadPrice = await calculateLeadPrice({
      homeSize: data.homeSize,
      distance: distance
    });

    // 4. Preliminary score + grade (lineType unknown until Twilio; refines later)
    const { score, grade, scoreFactors } = calculateLeadScore(
      { homeSize: data.homeSize },
      miles,
      null,
      data.moveDate
    );

    // 5. Auction pricing — Phase 3 forward-only cutover.
    //    If ENABLE_PRICING_SIMPLE_LIVE=true, NEW leads get their buyNowPrice
    //    from pricingEngineSimple.compute() and are stamped with
    //    pricingEngineVersion='simple'. Else they take the legacy path and
    //    are stamped 'legacy'. The Twilio reprice respects this field, so
    //    a lead never switches engines after creation. Existing leads
    //    (version=undefined) keep behaving exactly as they always have.
    const useSimpleLive = String(process.env.ENABLE_PRICING_SIMPLE_LIVE || '').toLowerCase() === 'true'
                       || String(process.env.ENABLE_PRICING_SIMPLE_LIVE || '') === '1';
    let auctionPricing;
    let pricingEngineVersion;
    if (useSimpleLive) {
      const simple = await pricingEngineSimple.compute({
        miles, moveDate: data.moveDate, homeSize: data.homeSize, heavyItems: [], validation: {},
      });
      if (simple.total != null && !simple.skipped) {
        const buyNow = Number(simple.total);
        const startingBid = Math.max(9, Math.round(buyNow * 0.6 / 5) * 5);
        auctionPricing       = { buyNowPrice: buyNow, startingBidPrice: startingBid };
        pricingEngineVersion = 'simple';
      } else {
        // Fall back to legacy if simple engine can't compute (rules empty,
        // shadow flag off, etc). Stamped 'legacy' so the Twilio reprice
        // takes the legacy path too — keeps the lead consistent.
        auctionPricing = await calculateAuctionPrice({ homeSize: data.homeSize, miles, moveDate: data.moveDate, grade });
        pricingEngineVersion = 'legacy';
      }
    } else {
      auctionPricing = await calculateAuctionPrice({ homeSize: data.homeSize, miles, moveDate: data.moveDate, grade });
      pricingEngineVersion = 'legacy';
    }

    // 5b. Validate sourceCompany. The intake form is public, so anyone can
    //     stamp an attribution. We only accept it if it resolves to an
    //     existing User in a legitimate attribution role. Invalid ObjectIds
    //     or unknown ids are dropped silently — returning 400 would leak
    //     which company ids exist in the system.
    let resolvedSourceCompany;
    if (data.sourceCompany) {
      try {
        if (mongoose.isValidObjectId(data.sourceCompany)) {
          const exists = await User.exists({
            _id: data.sourceCompany,
            role: { $in: ['customer'] },
          });
          if (exists) resolvedSourceCompany = data.sourceCompany;
        }
      } catch (_e) {
        // swallow — drop the field silently
      }
    }

    // Resolve state: trust client value if present (V4 form already submits
    // it after a ZIP lookup), else derive server-side from ZIP. ZIP stays
    // the canonical input — state is just a normalized projection.
    const originState      = (data.originState      || stateFromZip(data.originZip)).toUpperCase();
    const destinationState = (data.destinationState || stateFromZip(data.destinationZip)).toUpperCase();

    // 6. Save lead with auction fields
    const lead = new Lead({
      route,
      originCity: data.originCity,
      destinationCity: data.destinationCity,
      originZip: data.originZip,
      destinationZip: data.destinationZip,
      originState, destinationState,
      homeSize: data.homeSize,
      moveDate: new Date(data.moveDate),
      distance,
      price: auctionPricing.buyNowPrice || leadPrice,
      miles,
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
      pricingEngineVersion,
      // Phase A — forward-only stamp. Reads ENABLE_INSTANT_DISPATCH but does
      // NOT branch any other ingest behavior yet: every lead still gets the
      // 24-hour auction window below. The stamp is what Phase B will switch on.
      distributionModel: (
        String(process.env.ENABLE_INSTANT_DISPATCH || '').toLowerCase() === 'true'
        || String(process.env.ENABLE_INSTANT_DISPATCH || '') === '1'
      ) ? 'instant' : 'auction',
      auctionStatus: 'active',
      auctionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24-hour window
      ...(resolvedSourceCompany && { sourceCompany: resolvedSourceCompany }),
      statusHistory: [{ status: 'Pending Verification', timestamp: new Date() }]
    });

    await lead.save();

    // 5. Trigger Twilio Verification in the background (NON-BLOCKING)
    // testMode: skip real Twilio lookup when x-test-lead header is set or NODE_ENV=development
    const testMode = req.headers['x-test-lead'] === 'true' || process.env.NODE_ENV === 'development';
    verifyLeadPhone(lead._id, { testMode }).catch(err => {
      console.error('[Twilio Background Trace] Verification failed:', err.message);
    });

    // V5 Lead Quality (Phase 1) — shadow-mode baseline scoring, fire-and-forget.
    // Writes a ScoringSnapshot for admin comparison. NEVER mutates this Lead,
    // never affects pricing/dispatch/broadcast. Disable with SCORING_MODE=off.
    scoringPipeline.runShadow(lead._id).catch(err => {
      console.error('[scoringPipeline] shadow run errored:', err.message);
    });

    // V5 Lead Quality (Phase 2) — shadow validation pipeline, fire-and-forget.
    // Runs Twilio Lookup + Mapbox + Fingerprint stub (each independently flag-
    // gated, all default OFF), persists results to validation_logs + Lead.
    // validation.*, then triggers an *enriched* re-score so admin gets a
    // baseline-vs-enriched pair of snapshots. Self-skips when every flag is
    // false, so this is a no-op until explicitly turned on.
    validationPipeline.runShadow(lead._id).catch(err => {
      console.error('[validationPipeline] shadow run errored:', err.message);
    });

    // V5 marketplace Phase 3 — pricing V2 shadow. Computes additive USD price
    // + breakdown using PricingAddOn collection. Writes Lead.priceShadowV2 +
    // pricingBreakdownShadowV2. NEVER touches buyNowPrice; legacy engine is
    // still authoritative for charging/refunds. Self-skips if shadow flag off.
    pricingEngineV2.compute(lead).then(result => {
      if (result.skipped) return;
      return Lead.updateOne(
        { _id: lead._id },
        { $set: { priceShadowV2: result.total, pricingBreakdownShadowV2: result.breakdown } }
      );
    }).catch(err => {
      console.error('[pricingEngineV2] shadow run errored:', err.message);
    });

    // Simplified additive USD pricing — Phase 1 SHADOW ONLY. Reads
    // PricingRule rows with amountUsd set, sums BASE + matching DISTANCE
    // / HOME_SIZE / URGENCY / VERIFICATION / HEAVY_ITEM rows, clamps to
    // [$10, $250]. NEVER touches buyNowPrice. Self-skips when shadow flag
    // is off or rule fetch fails.
    pricingEngineSimple.compute(lead).then(result => {
      if (result.skipped || result.total == null) return;
      return Lead.updateOne(
        { _id: lead._id },
        { $set: { priceShadowSimple: result.total, pricingBreakdownSimple: result.breakdown } }
      );
    }).catch(err => {
      console.error('[pricingEngineSimple] shadow run errored:', err.message);
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

module.exports = router;
