/**
 * V5 Public Lead Ingest Router  —  POST /api/leads/ingest-v2
 *
 * Accepts quote-form submissions from the V5 funnel (GetQuoteV5.jsx).
 * Mounted in server.js BEFORE the verifiedGate-wrapped /api/leads — V5
 * visitors are not authenticated.
 *
 * Compared to the V4 ingest:
 *   - Stricter Zod schema (`validateLeadPayloadV2` from validators/leadIngestV2.js)
 *     — rejects unknown fields, requires intentConfirmed, requires
 *     clientSubmissionId, requires funnelVersion='v5'.
 *   - Idempotent by clientSubmissionId: re-submission of the same UUID
 *     returns the existing lead instead of creating a duplicate. Handles
 *     mobile network retries. Backed by a unique partial index on
 *     Lead.clientSubmissionId.
 *   - Server-side email placeholder: when `customerEmail` is missing the
 *     V2 validator injects `noemail+{phone}@moveleads.cloud` so the
 *     existing CRM review-email flow (which checks email validity at the
 *     send step) doesn't break for V5 leads.
 *   - V5 fields persisted directly on Lead: intentConfirmed,
 *     urgencyBucket, heavyItems[], moveType, funnelVersion,
 *     clientSubmissionId, fingerprintVisitorId/RequestId.
 *
 * Phase 3 invariants — UNCHANGED behaviour for everyone but V5 visitors:
 *   - V4 `/api/leads/ingest` route untouched.
 *   - Twilio verifyLeadPhone runs identically (status flips same way).
 *   - scoringPipeline + validationPipeline are the same fire-and-forget
 *     calls the V4 ingest uses.
 *   - Mover dashboard sees V5 leads the same way it sees V4 leads.
 *   - No tier-based routing, pricing change, or SMS claim flow.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const zipcodes = require('zipcodes');

const Lead = require('../models/Lead');
const User = require('../models/User');
const { validateLeadPayloadV2 } = require('../validators/leadIngestV2');
const { verifyLeadPhone } = require('../services/twilioService');
const { calculateLeadPrice, calculateAuctionPrice } = require('../utils/pricingEngine');
const { calculateLeadScore } = require('../services/scoringService');
const scoringPipeline = require('../services/scoringPipeline');
const validationPipeline = require('../services/validationPipeline');
const pricingEngineV2 = require('../services/pricingEngineV2');
const pricingEngineSimple = require('../services/pricingEngineSimple');
const { instantDispatchEnabled } = require('../utils/instantDispatch');
const metaCapi = require('../services/metaCapi');

/**
 * Derive an `urgencyBucket` enum from a specific `moveDate`. V6 conversational
 * funnel may capture an exact date via the calendar branch instead of a
 * bucket select — server bridges to the bucket so existing scoring code
 * (which reads `urgencyBucket`) keeps working unchanged.
 *
 * Bucket thresholds match the leadScoringEngine urgency bands. Returns
 * undefined for invalid / missing input so the caller can default cleanly.
 */
function deriveUrgencyBucket(moveDate) {
  if (!moveDate) return undefined;
  const d = (moveDate instanceof Date) ? moveDate : new Date(moveDate);
  if (Number.isNaN(d.getTime())) return undefined;
  const daysAway = Math.round((d.getTime() - Date.now()) / 86400000);
  if (daysAway <= 7)  return 'asap';
  if (daysAway <= 14) return 'this_week';
  if (daysAway <= 30) return 'this_month';
  return 'flexible';
}

/* ── Distance helpers (same as leadIngest.js) ─────────────────────────────── */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
function milesFromZips(originZip, destinationZip) {
  const o = zipcodes.lookup(originZip);
  const d = zipcodes.lookup(destinationZip);
  if (!o || !d) return 0;
  return haversine(o.latitude, o.longitude, d.latitude, d.longitude);
}

/* ── Helper: derive city/state from ZIP so the existing Lead schema
   (which requires originCity/destinationCity) gets sensible values.
   The V5 client doesn't collect city/state — it's enrichment. ─────────── */
function cityStateFromZip(zip) {
  const z = zipcodes.lookup(String(zip || ''));
  if (!z) return { city: 'Unknown', state: '' };
  return { city: z.city || 'Unknown', state: z.state || '' };
}

// ── Rate limiter (same as V4) — 5 submissions per IP per 10 minutes ────────
const ingestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many quote requests. Please wait a few minutes before trying again.' },
});

// @route   POST /api/leads/ingest-v2
// @access  Public (no auth — V5 marketing-site form)
router.post('/', ingestLimiter, async (req, res) => {
  const validation = validateLeadPayloadV2(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: validation.message,
      errors: validation.errors,
    });
  }
  const data = validation.data;

  try {
    // 1. Idempotency — same clientSubmissionId returns the existing lead.
    //    Backed by the partial unique index for race protection on parallel
    //    retries (covered by the catch on E11000 at the save step below).
    const existing = await Lead.findOne({ clientSubmissionId: data.clientSubmissionId }).lean();
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Quote request already received (idempotent retry).',
        idempotent: true,
        lead: {
          id: existing._id,
          route: existing.route,
          moveDate: existing.moveDate,
          homeSize: existing.homeSize,
          status: existing.status,
        },
      });
    }

    // 2. Soft-duplicate check — same phone OR email submitted within 30 days
    //    (not from this exact submission — that was step 1). Mirrors V4 logic.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const softDup = await Lead.findOne({
      createdAt: { $gte: thirtyDaysAgo },
      clientSubmissionId: { $ne: data.clientSubmissionId },
      $or: [
        { customerPhone: data.customerPhone },
        ...(data.customerEmail && !String(data.customerEmail).startsWith('noemail+')
          ? [{ customerEmail: data.customerEmail }]
          : []),
      ],
    });
    if (softDup) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active quote request. Please wait before submitting again.',
      });
    }

    // 3. Resolve city + state from ZIPs (V5 doesn't collect them client-side).
    //    Both values are now persisted — the marketplace UI renders
    //    "City, ST" off the stored state when present.
    const origin = cityStateFromZip(data.originZip);
    const dest   = cityStateFromZip(data.destinationZip);
    const originCity      = origin.city;
    const destinationCity = dest.city;
    const originState      = origin.state;
    const destinationState = dest.state;
    const route = `${originCity} → ${destinationCity}`;

    // 4. Miles — trust client value if > 0, otherwise compute from ZIPs
    const miles = (data.miles && data.miles > 0)
      ? data.miles
      : milesFromZips(data.originZip, data.destinationZip);
    const distance = miles > 100 ? 'Long Distance' : 'Local';

    // 5. Legacy pricing + scoring (same engines V4 uses — keeps mover
    //    dashboard / auction settlement / refund flow indistinguishable
    //    from V4 leads. The V5 scoring + validation runs in shadow on top.)
    const leadPrice = await calculateLeadPrice({ homeSize: data.homeSize, distance });
    const { score, grade, scoreFactors } = calculateLeadScore(
      { homeSize: data.homeSize }, miles, null, data.moveDate
    );
    // Phase 3 forward-only cutover — see leadIngest.js for the full
    // contract. NEW leads only; existing docs are never re-priced.
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
        auctionPricing = await calculateAuctionPrice({ homeSize: data.homeSize, miles, moveDate: data.moveDate, grade });
        pricingEngineVersion = 'legacy';
      }
    } else {
      auctionPricing = await calculateAuctionPrice({ homeSize: data.homeSize, miles, moveDate: data.moveDate, grade });
      pricingEngineVersion = 'legacy';
    }

    // 6. sourceCompany — same defensive resolution as V4
    let resolvedSourceCompany;
    if (data.sourceCompany) {
      try {
        if (mongoose.isValidObjectId(data.sourceCompany)) {
          const exists = await User.exists({ _id: data.sourceCompany, role: { $in: ['customer'] } });
          if (exists) resolvedSourceCompany = data.sourceCompany;
        }
      } catch (_e) { /* drop silently */ }
    }

    // 7. Save lead — includes V5-specific fields
    const lead = new Lead({
      route, originCity, destinationCity,
      originZip: data.originZip, destinationZip: data.destinationZip,
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
      customerStatus: 'New',
      score, grade, scoreFactors,
      buyNowPrice: auctionPricing.buyNowPrice,
      startingBidPrice: auctionPricing.startingBidPrice,
      currentBidPrice: auctionPricing.startingBidPrice,
      pricingEngineVersion,
      // Phase B — see leadIngest.js for full rationale on distributionModel
      // branching. auctionStatus stays 'active' for both models so /buy-now
      // keeps working without route changes; only auctionEndsAt is gated.
      distributionModel: instantDispatchEnabled() ? 'instant' : 'auction',
      auctionStatus: 'active',
      ...(instantDispatchEnabled() ? {} : { auctionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }),
      ...(resolvedSourceCompany && { sourceCompany: resolvedSourceCompany }),
      statusHistory: [{ status: 'Pending Verification', timestamp: new Date() }],

      // V5/V6 fields. funnelVersion is taken from the validated payload so
      // V5 clients stamp 'v5' and V6 conversational-funnel clients stamp
      // 'v6'. Both flow through the same ingest pipeline.
      funnelVersion: data.funnelVersion,
      clientSubmissionId: data.clientSubmissionId,
      intentConfirmed: data.intentConfirmed,
      // Phase 6.3 — start V5/V6 leads BEHIND the quality gate. Mover
      // visibility requires qualityGateCleared !== false; the scoring
      // pipeline flips this to true when it saves a snapshot with
      // non-rejected tier (or leaves it false when tier is rejected).
      // Prevents the race where verifyLeadPhone marks
      // status=READY_FOR_DISTRIBUTION + fires broadcasts before
      // scoring/validation has finished.
      qualityGateCleared: false,
      // Phase 1 — unified distribution decision. Starts pending; the
      // scoringPipeline / verifyLeadPhone writers will advance it to a
      // concrete system_* verdict once evidence lands. Default at the
      // schema level handles this too, but the explicit write keeps
      // ingest readable and makes the value predictable for tests.
      distributionDecision: 'system_pending',
      distributionDecisionBy:     'system',
      distributionDecisionAt:     new Date(),
      distributionDecisionReason: 'ingest',
      // V6 may capture an exact moveDate via calendar; the urgencyBucket
      // can be derived from it server-side when the client only sends a
      // bucket OR only sends a date. Both fields end up on the doc so
      // downstream consumers can read whichever is most informative.
      urgencyBucket: data.urgencyBucket || deriveUrgencyBucket(data.moveDate),
      heavyItems: data.heavyItems || [],
      ...(data.moveType && { moveType: data.moveType }),
      // V6 operational-difficulty signals. Optional — schema accepts null.
      ...(data.homeType && { homeType: data.homeType }),
      ...(data.stairs && { stairs: data.stairs }),

      // Meta Pixel + CAPI attribution capture (Commit 1: persist only — no
      // CAPI fire yet). Client-supplied fields come from the validated
      // payload; server-supplied IP + UA come from req via metaCapi.
      // Conditional spreads keep `undefined` off the doc so absent fields
      // stay truly absent in Mongo rather than rendering as `null`.
      ...(data.metaEventId    && { metaEventId:    data.metaEventId }),
      ...(data.fbp            && { fbp:            data.fbp }),
      ...(data.fbc            && { fbc:            data.fbc }),
      ...(data.eventSourceUrl && { eventSourceUrl: data.eventSourceUrl }),
      ...metaCapi.extractRequestSignals(req),
    });

    try {
      await lead.save();
    } catch (err) {
      // Race: another parallel insert with the same clientSubmissionId won
      // the unique index. Return the winner.
      if (err && err.code === 11000) {
        const winner = await Lead.findOne({ clientSubmissionId: data.clientSubmissionId }).lean();
        if (winner) {
          return res.status(200).json({
            success: true,
            idempotent: true,
            message: 'Quote request already received (race-resolved).',
            lead: {
              id: winner._id, route: winner.route, moveDate: winner.moveDate,
              homeSize: winner.homeSize, status: winner.status,
            },
          });
        }
      }
      throw err;
    }

    // 8. Sequential background qualification chain (Phase 6.7) ─────────────────
    //
    // The customer-facing response returns immediately below. Behind the
    // scenes, an async IIFE runs the qualification pipeline in STRICT ORDER:
    //
    //   validation → scoring (triggered + awaited inside validation)
    //              → pricing V2 shadow
    //              → verifyLeadPhone (status flip + broadcasts)
    //
    // Why strict order matters:
    //   - lead.qualityGateCleared starts FALSE at save (above) — mover
    //     visibility is blocked.
    //   - validation writes lead.validation.*
    //   - scoring (inside validation) writes shadowTier + structuralBlockers
    //     + qualityGateCleared atomically. ONLY after this does the gate
    //     potentially flip to TRUE.
    //   - pricing V2 then reads the post-scoring lead so add-ons reflect
    //     final validation/tier state.
    //   - verifyLeadPhone runs LAST: sets status=READY_FOR_DISTRIBUTION,
    //     re-checks visibility, and only broadcasts if the lead passes the
    //     final gate. Socket emit, SMS, email all fire post-qualification.
    //
    // No fire-and-forget that could race. No baseline scoring (it was the
    // race source — see prior phase notes). Customer API response is
    // unaffected; the chain executes after the response is sent.
    const testMode = req.headers['x-test-lead'] === 'true' || process.env.NODE_ENV === 'development';
    const leadId = lead._id;
    (async () => {
      try {
        // (a) Validation (local NANP + Twilio + Mapbox + carrier reputation).
        //     At the end, validationPipeline awaits scoringPipeline.runShadow,
        //     which writes the only ScoringSnapshot + mirrors shadowTier,
        //     qualityGateCleared, structuralBlockers atomically.
        await validationPipeline.runShadow(leadId);
      } catch (err) {
        console.error(`[V5 chain] validation/scoring failed for ${leadId}:`, err.message);
      }

      // (b) Pricing V2 shadow — reads the post-scoring lead so add-on
      //     predicates evaluate against the final validation/tier state.
      //     Still shadow-only; never touches buyNowPrice.
      try {
        const freshLead = await Lead.findById(leadId).lean();
        if (freshLead) {
          const result = await pricingEngineV2.compute(freshLead);
          if (!result.skipped) {
            await Lead.updateOne(
              { _id: leadId },
              { $set: { priceShadowV2: result.total, pricingBreakdownShadowV2: result.breakdown } }
            );
          }
        }
      } catch (err) {
        console.error(`[V5 chain] pricingV2 failed for ${leadId}:`, err.message);
      }

      // Simplified additive USD pricing — Phase 1 SHADOW ONLY. Same
      // placement as V2 so both engines see the post-scoring lead with
      // the final qualification context (tier, validation, heavyItems).
      try {
        const freshLead = await Lead.findById(leadId).lean();
        if (freshLead) {
          const result = await pricingEngineSimple.compute(freshLead);
          if (!result.skipped && result.total != null) {
            await Lead.updateOne(
              { _id: leadId },
              { $set: { priceShadowSimple: result.total, pricingBreakdownSimple: result.breakdown } }
            );
          }
        }
      } catch (err) {
        console.error(`[V5 chain] pricingEngineSimple failed for ${leadId}:`, err.message);
      }

      // (c) verifyLeadPhone runs LAST: legacy lifecycle + status flip +
      //     broadcasts. Its internal isHiddenFromMoversById re-check sees
      //     the FINAL qualification state — if scoring rejected the lead
      //     (or any other hide rule fires), broadcasts are suppressed.
      try {
        await verifyLeadPhone(leadId, { testMode });
      } catch (err) {
        console.error(`[V5 chain] verifyLeadPhone failed for ${leadId}:`, err.message);
      }
    })();

    return res.status(201).json({
      success: true,
      message: 'Quote request received successfully. Your lead is pending verification.',
      lead: {
        id: lead._id,
        route: lead.route,
        moveDate: lead.moveDate,
        homeSize: lead.homeSize,
        status: lead.status,
      },
    });
  } catch (err) {
    console.error('LEAD INGEST V2 ERROR:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

module.exports = router;
