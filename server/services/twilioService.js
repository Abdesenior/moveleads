const twilio = require('twilio');
const Lead = require('../models/Lead');
const User = require('../models/User');
const CoverageArea = require('../models/CoverageArea');
const Communication = require('../models/Communication');
const PurchasedLead = require('../models/PurchasedLead');
const { doesLeadMatchMoverPreferences, doesLeadMatchMoverPreferencesStrict } = require('../utils/leadMatching');
const { wantsChannel, isWithinDispatchHours, matchesMoveTypes } = require('../utils/dispatchPolicy');
const { strictMatchingEnabled } = require('../utils/strictMatchingFlag');
const { logMatchShadow } = require('../utils/matchShadowLog');
const socketService = require('./socketService');
const { calculateLeadScore } = require('./scoringService');
const { calculateAuctionPrice } = require('../utils/pricingEngine');
const pricingEngineSimple = require('./pricingEngineSimple');
const { sendAdminLeadNotification, broadcastLeadEmail } = require('./emailService');
const { sendMoverLeadSMS } = require('./smsService');

// Twilio — used for SMS and warm-transfer calls. Telecom trust (line type,
// SMS pumping risk, identity match) is handled by services/twilioLookupService
// via the validation pipeline, NOT here. This file no longer assesses telecom
// trust at all — it just progresses Lead lifecycle status.
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const fromPhone  = process.env.TWILIO_PHONE_NUMBER || '+15005550006';
const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;
// `twilioClient` is retained for SMS / voice flows elsewhere in this file.
// Keep the unused-var lint suppressed by reading it once for clarity.
void twilioClient;

// ── TCPA / cost-cap constants (Phase 1 / Block E.2) ────────────────────────
// Per-mover daily Twilio SMS cap. PlatformSettings has no SMS-cap knob yet,
// so this is a constant; lift to PlatformSettings if/when an admin UI is
// added. The counter lives on User.smsCounters (UTC day-aligned).
const MAX_SMS_PER_MOVER_PER_DAY = 25;

/** Return the JS Date for the start of "today" in UTC. */
function startOfTodayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Broadcast SMS to all movers who have smsNotif enabled and a phone number on file.
 * Non-blocking — errors are logged but never propagate.
 *
 * @param {Object} lead
 * @param {{force?: boolean}} [opts] - pass `force: true` from admin re-broadcast
 *   endpoints to bypass the `notifiedAt` dedup guard.
 */
async function broadcastLeadSMS(lead, { force = false } = {}) {
  console.log('[SMS] Attempting to notify movers for lead:', lead._id);

  // Dedup guard — skip if this lead has already been broadcast unless force.
  if (lead.notifiedAt && !force) {
    console.log(`[Broadcast] lead ${lead._id} already notified, skipping`);
    return;
  }

  // Phase 6 — block broadcasts of rejected leads when routing mode hides
  // them. Required since SMS reaches movers directly; "movers can't see it
  // in the feed but can still get pinged" would be incoherent. Force flag
  // does NOT bypass — admin re-broadcast still respects visibility.
  const { isHiddenFromMovers, hiddenReason, routingMode, recordBroadcastSuppressed } = require('../utils/leadVisibility');
  if (isHiddenFromMovers(lead)) {
    console.log(`[leadVisibility] suppressed SMS broadcast for ${lead._id}: ${hiddenReason(lead)} (mode=${routingMode()})`);
    recordBroadcastSuppressed();
    return;
  }

  try {
    // 1. Candidate selection ─────────────────────────────────────────────────
    //
    // Always compute BOTH the legacy candidate set (origin OR destination, flat
    // ZIP query) AND the strict candidate set (origin AND destination, typed
    // CoverageArea queries + state-level pickup/delivery + nationwide).
    //
    // We hydrate the UNION so we have every candidate in memory regardless of
    // which mode is active. The per-candidate loop below logs the shadow
    // (legacy vs strict) for each one so the operator can diff candidate
    // counts on real traffic before flipping STRICT_INTERSTATE_MATCHING=true.
    const strictMode = strictMatchingEnabled();

    // ── Legacy candidate set: union of origin + destination ZIPs ─────────
    const legacyZipMatchIds = await CoverageArea.distinct('company', {
      zipCode: { $in: [lead.originZip, lead.destinationZip].filter(Boolean) },
    });
    const legacyCandidateSet = new Set(legacyZipMatchIds.map(String));

    // ── Strict candidate set: intersection of (pickup covers origin) AND
    //    (delivery covers destination OR nationwide). State-level checks
    //    via User.pickupStates / deliveryStates / deliversNationwide; ZIP
    //    fallback via CoverageArea typed on origin/destination/both. ─────
    const pickupCoverageOriginIds = lead.originZip
      ? await CoverageArea.distinct('company', {
          zipCode: lead.originZip,
          type: { $in: ['origin', 'both'] },
        })
      : [];
    const pickupStateMatchIds = lead.originState
      ? await User.distinct('_id', {
          pickupStates: String(lead.originState).toUpperCase(),
          role: 'customer',
        })
      : [];
    const originStrictSet = new Set([
      ...pickupCoverageOriginIds.map(String),
      ...pickupStateMatchIds.map(String),
    ]);

    const deliveryCoverageDestIds = lead.destinationZip
      ? await CoverageArea.distinct('company', {
          zipCode: lead.destinationZip,
          type: { $in: ['destination', 'both'] },
        })
      : [];
    const deliveryStateMatchIds = lead.destinationState
      ? await User.distinct('_id', {
          deliveryStates: String(lead.destinationState).toUpperCase(),
          role: 'customer',
        })
      : [];
    const nationwideIds = await User.distinct('_id', {
      deliversNationwide: true,
      role: 'customer',
    });
    const destStrictSet = new Set([
      ...deliveryCoverageDestIds.map(String),
      ...deliveryStateMatchIds.map(String),
      ...nationwideIds.map(String),
    ]);
    const strictCandidateSet = new Set(
      [...originStrictSet].filter(id => destStrictSet.has(id))
    );

    // ── Hydration: union of both so we can shadow-log each candidate ─────
    const unionIds = new Set([...legacyCandidateSet, ...strictCandidateSet]);
    if (!unionIds.size) {
      console.log('[SMS] No companies cover this lead (legacy+strict both empty) — no SMS sent');
      return;
    }

    // Hydrate candidate movers. Keep the cheap hard filters in Mongo
    // (phone present, not suspended). We deliberately drop the
    // `smsNotif: true` mongo filter — the dispatch-policy helper now
    // owns the channel decision (alertChannels first, legacy smsNotif
    // as fallback). Pull onboarding.answers so the helper can read it,
    // plus the new Phase 1 pickup/delivery fields for the strict matcher.
    //
    // TCPA / Block E.2: also require smsOptOut !== true and
    // phoneVerified === true so STOP-replied or unverified partner
    // phones never receive a broadcast.
    const candidates = await User.find({
      _id:      { $in: Array.from(unionIds) },
      role:     'customer',
      isSuspended:   { $ne: true },
      smsOptOut:     { $ne: true },
      phoneVerified: true,
      phone:    { $exists: true, $nin: ['', null] },
    }).select('phone companyName smsNotif emailNotif isSuspended smsOptOut phoneVerified smsCounters maxDistance preferredHomeSizes deliversNationwide pickupStates deliveryStates serviceStates onboarding.answers').lean();

    if (!candidates.length) {
      console.log('[SMS] No candidates with phone on file');
      return;
    }

    // 3. Per-candidate match decision + shadow log.
    //    Each mover already passes coverage (Stage 1), so we pass an empty
    //    ZIP set to the legacy helper to skip its in-helper coverage check
    //    and let it focus on distance + home size + moveTypes.
    //    The strict helper does its own state-level coverage gate (the
    //    Mongo pre-filter only narrows; the in-memory check is the truth).
    const emptyZipSet = new Set();
    const now = new Date();
    let legacyPassCount = 0;
    let strictPassCount = 0;
    const matched = candidates.filter(m => {
      const inLegacySet = legacyCandidateSet.has(String(m._id));
      const inStrictSet = strictCandidateSet.has(String(m._id));
      const passesLegacy = inLegacySet && doesLeadMatchMoverPreferences(lead, m, emptyZipSet);
      const passesStrict = inStrictSet && doesLeadMatchMoverPreferencesStrict(lead, m, {});
      if (passesLegacy) legacyPassCount++;
      if (passesStrict) strictPassCount++;
      logMatchShadow({ source: 'sms', lead, mover: m, legacy: passesLegacy, strict: passesStrict });

      const passesActive = strictMode ? passesStrict : passesLegacy;
      if (!passesActive) return false;

      if (!wantsChannel(m, 'sms')) {
        console.log(`[SMS] Drop ${m.companyName || m._id}: alertChannels does not include 'sms'`);
        return false;
      }
      if (!isWithinDispatchHours(m, 'sms', now)) {
        console.log(`[SMS] Drop ${m.companyName || m._id}: outside dispatch hours`);
        return false;
      }
      if (!matchesMoveTypes(m, lead)) {
        console.log(`[SMS] Drop ${m.companyName || m._id}: moveTypes does not match lead`);
        return false;
      }
      return true;
    });

    console.log(`[MatchShadow] source=sms lead=${lead._id} candidates=${candidates.length} legacy_pass=${legacyPassCount} strict_pass=${strictPassCount} active=${strictMode ? 'strict' : 'legacy'}`);

    console.log(`[SMS] ${unionIds.size} cover this lead (union of legacy+strict), ${candidates.length} candidates after gates, ${matched.length} pass full policy under active mode`);
    if (!matched.length) return;
    console.log(`[SMS] Broadcasting to: ${matched.map(m => m.companyName || m.phone).join(', ')}`);

    // Per-mover daily cap (TCPA / cost-control). Read the persisted
    // counter on each candidate; if today's count has hit the cap, skip.
    // On send success, bump the counter atomically (resetting it when the
    // stored date is older than today).
    const todayStart = startOfTodayUTC();
    for (const mover of matched) {
      const counters = mover.smsCounters || { date: null, count: 0 };
      const counterDate = counters.date ? new Date(counters.date) : null;
      const sameDay = counterDate && counterDate.getTime() >= todayStart.getTime();
      const usedToday = sameDay ? Number(counters.count || 0) : 0;
      if (usedToday >= MAX_SMS_PER_MOVER_PER_DAY) {
        console.log(`[SMS] Drop ${mover.companyName || mover._id}: daily SMS cap reached (${usedToday}/${MAX_SMS_PER_MOVER_PER_DAY})`);
        continue;
      }

      sendMoverLeadSMS(mover.phone, lead)
        .then(async (result) => {
          // Only bump the counter on a confirmed send. sendMoverLeadSMS
          // returns { ok: false } on Twilio errors and (legacy) undefined
          // when credentials are missing; both are no-counter-bump cases.
          if (!result || result.ok !== true) return;
          // The reset (new UTC day → count=1) and bump (same day → +1) are
          // encoded as a single aggregation-pipeline updateOne so the read
          // and write happen atomically. Failures are non-fatal; the cap
          // is best-effort.
          try {
            await User.updateOne(
              { _id: mover._id },
              [
                {
                  $set: {
                    'smsCounters.date': {
                      $cond: [
                        { $lt: [{ $ifNull: ['$smsCounters.date', new Date(0)] }, todayStart] },
                        todayStart,
                        '$smsCounters.date',
                      ],
                    },
                    'smsCounters.count': {
                      $cond: [
                        { $lt: [{ $ifNull: ['$smsCounters.date', new Date(0)] }, todayStart] },
                        1,
                        { $add: [{ $ifNull: ['$smsCounters.count', 0] }, 1] },
                      ],
                    },
                  },
                },
              ]
            );
          } catch (e) {
            console.error('[SMS] Failed to bump smsCounters for', mover._id, e.message);
          }
        })
        .catch(() => {});
    }

    // Mark lead as notified — atomic conditional so two parallel callers
    // don't both fire and the email broadcast can short-circuit if it
    // races. We only flip the flag if it's still null.
    try {
      await Lead.updateOne(
        { _id: lead._id, notifiedAt: null },
        { $set: { notifiedAt: new Date() } }
      );
    } catch (e) {
      console.error('[SMS] Failed to set notifiedAt:', e.message);
    }
  } catch (err) {
    console.error('[SMS] broadcastLeadSMS error:', err.message);
  }
}

// NOTE: Abstract API phone-validation integration was removed in Phase 3.5
// when telecom trust assessment moved to services/twilioLookupService.js (called
// via the validation pipeline). Having two telecom-trust providers writing to
// the same lead caused REJECTED_FAKE to be set by Abstract before the new
// qualification engine got a vote. The single source of truth for line type /
// SMS pumping risk / identity match is now Twilio Lookup V2 (gated by env flag
// + admin toggle). See server/services/validationPipeline.js.

/**
 * Progress a lead's lifecycle status after ingest.
 *
 * Phase 3.5 — the Abstract API integration was removed. This function NO
 * LONGER assesses telecom trust. Its job now is:
 *   1. Defensive phone-shape sanity (Zod already enforces shape at ingest;
 *      this is belt-and-suspenders for admin-imported / legacy paths).
 *   2. Compute legacy score/grade + auction pricing.
 *   3. Set lead.status to READY_FOR_DISTRIBUTION (or 'Purchased' for
 *      widget-sourced leads).
 *   4. Fire broadcast SMS / email / socket event.
 *
 * What this function will NEVER do anymore:
 *   - Set lead.status = 'REJECTED_FAKE' (only admin actions can now)
 *   - Call an external telecom API
 *   - Pass a non-null lineType into the legacy scorer (telecom trust is
 *     entirely Twilio Lookup's job now, via the validation pipeline)
 *
 * Telecom trust signals (line type, SMS pumping risk, identity match) are
 * read from `lead.validation.phone.*` by the new qualification engine.
 * That data is populated by services/twilioLookupService.js inside the
 * validation pipeline, gated by env flag AND admin toggle.
 *
 * Failure modes:
 *   - Lead not found              → return silently
 *   - Phone shape malformed       → PENDING_MANUAL_REVIEW (admin reviews)
 *   - Unexpected internal error   → PENDING_MANUAL_REVIEW
 *
 * `testMode` is preserved in the signature for back-compat with V4/V5
 * ingest callers but is now a no-op (there's no live API to mock).
 */
// eslint-disable-next-line no-unused-vars
async function verifyLeadPhone(leadId, { testMode = false } = {}) {
  let lead;
  try {
    lead = await Lead.findById(leadId);
    if (!lead) return;

    console.log(`[PhoneVerify] Starting for lead ${leadId} (${lead.customerPhone})`);

    // ── Defensive phone-shape check ─────────────────────────────────────────
    // Zod blocks bad shapes at ingest, but admin-imported leads or future
    // backfill scripts can bypass that. If the shape is clearly malformed,
    // route to PENDING_MANUAL_REVIEW so admin can decide. Do not auto-reject.
    const digits = String(lead.customerPhone || '').replace(/\D/g, '');
    const shapeOk = digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
    if (!shapeOk) {
      console.warn(`[PhoneVerify] lead ${leadId} phone shape malformed → PENDING_MANUAL_REVIEW`);
      lead.isVerified = false;
      lead.status = 'PENDING_MANUAL_REVIEW';
      lead.statusHistory.push({ status: 'PENDING_MANUAL_REVIEW', timestamp: new Date() });
      await lead.save();
      return;
    }

    // ── Legacy scoring (drives auction pricing tier & V4 grade column) ─────
    // lineType is intentionally null — the legacy scorer's +10 "mobile" bonus
    // is no longer applied here. Telecom-trust scoring lives entirely in the
    // new qualification engine, which reads lead.validation.phone.lineType
    // populated by Twilio Lookup. The legacy grade is now phone-agnostic.
    const scoring = calculateLeadScore(lead, lead.miles, null, lead.moveDate);
    lead.score        = scoring.score;
    lead.grade        = scoring.grade;
    lead.scoreFactors = scoring.scoreFactors;

    // Phase 3 forward-only reprice. Dispatch by lead.pricingEngineVersion
    // — leads created with version='simple' get repriced via the additive
    // USD engine (validation.phone is now populated, so VERIFICATION rows
    // can match). Leads with version='legacy' or undefined (every doc
    // that existed before Phase 3) keep the legacy multiplier path
    // unchanged. No existing lead is ever rerouted to a different engine.
    let finalPricing;
    if (lead.pricingEngineVersion === 'simple') {
      const simple = await pricingEngineSimple.compute(lead);
      if (simple.total != null && !simple.skipped) {
        const buyNow = Number(simple.total);
        const startingBid = Math.max(9, Math.round(buyNow * 0.6 / 5) * 5);
        finalPricing = { buyNowPrice: buyNow, startingBidPrice: startingBid };
      } else {
        // Simple engine couldn't compute — fall back to legacy. Mark the
        // lead so subsequent ops stay consistent.
        finalPricing = await calculateAuctionPrice({
          homeSize: lead.homeSize, miles: lead.miles, moveDate: lead.moveDate, grade: scoring.grade,
        });
        lead.pricingEngineVersion = 'legacy';
      }
    } else {
      finalPricing = await calculateAuctionPrice({
        homeSize: lead.homeSize, miles: lead.miles, moveDate: lead.moveDate, grade: scoring.grade,
      });
    }
    lead.buyNowPrice      = finalPricing.buyNowPrice;
    lead.price            = finalPricing.buyNowPrice;
    lead.startingBidPrice = finalPricing.startingBidPrice;
    lead.currentBidPrice  = finalPricing.startingBidPrice;

    // ── Lifecycle: status reflects the FINAL qualification verdict ─────────
    // Phase 6.8 — STRAIGHT FIX: status itself gates distribution, independent
    // of the routing-mode env flag. Even if ENABLE_TIERED_ROUTING is
    // misconfigured, the existing mover-facing status filter
    // `status IN ['Available', 'READY_FOR_DISTRIBUTION']` will exclude any
    // lead whose status we hold at PENDING_MANUAL_REVIEW here. No reliance
    // on the env flag, no reliance on the visibility filter being applied,
    // no reliance on any downstream guard.
    //
    // In the V5 sequential chain (Phase 6.7), validation+scoring have already
    // run and written shadowTier / qualityGateCleared / adminTierOverride.
    // We re-fetch (the in-memory `lead` is stale on those fields) and decide
    // status from that final state. For V4 leads (still parallel), this
    // check is best-effort — if scoring hasn't finished yet, the post-fetch
    // doc won't have shadowTier and we'll set status=READY as before. That's
    // V4's pre-existing race; we didn't make it worse.
    lead.isVerified = true;
    let qualificationFailed = false;
    let qualificationReason = null;
    try {
      const freshForStatus = await Lead.findById(lead._id)
        .select('shadowTier qualityGateCleared adminTierOverride structuralBlockers')
        .lean();
      if (freshForStatus) {
        if (freshForStatus.shadowTier === 'rejected') {
          qualificationFailed = true;
          qualificationReason = 'shadowTier=rejected';
        } else if (freshForStatus.qualityGateCleared === false) {
          qualificationFailed = true;
          qualificationReason = 'qualityGateCleared=false';
        } else if (freshForStatus.adminTierOverride?.tier === 'rejected') {
          qualificationFailed = true;
          qualificationReason = 'adminTierOverride=rejected';
        }
      }
    } catch (err) {
      console.warn(`[PhoneVerify] status-gate fetch failed for ${lead._id}, defaulting to READY:`, err.message);
    }
    if (qualificationFailed) {
      lead.status = 'PENDING_MANUAL_REVIEW';
      console.log(`[PhoneVerify] qualification failed for ${lead._id} → PENDING_MANUAL_REVIEW (${qualificationReason})`);
    } else {
      lead.status = 'READY_FOR_DISTRIBUTION';
    }

    // Phase 1 — distributionDecision write with stickiness guard.
    //
    // scoringPipeline already wrote a decision based on the post-scoring lead.
    // verifyLeadPhone runs LAST in the V5 chain and is the lifecycle gate's
    // owner, so we re-derive after the status flip and write again — this
    // catches the case where status moves to PENDING_MANUAL_REVIEW or
    // REJECTED_FAKE (above) and the decision needs to follow.
    //
    // The { distributionDecision: { $in: SYSTEM_VALUES } } filter is the
    // stickiness guard: if admin has already set admin_approved/admin_rejected,
    // this no-ops. (Real-world rare; defensive.)
    try {
      const {
        SYSTEM_VALUES: SYS,
        deriveSystemDecision: derive,
        describeSystemDecisionSource: describe,
      } = require('../utils/distributionDecision');
      const evidenceDoc = {
        status: lead.status,
        qualityGateCleared: lead.qualityGateCleared,
        shadowTier: lead.shadowTier,
        structuralBlockers: lead.structuralBlockers,
        validation: lead.validation,
        miles: lead.miles,
      };
      const decision = derive(evidenceDoc);
      await Lead.updateOne(
        { _id: lead._id, distributionDecision: { $in: SYS } },
        { $set: {
            distributionDecision: decision,
            distributionDecisionBy:     'system',
            distributionDecisionAt:     new Date(),
            distributionDecisionReason: `verifyLeadPhone: ${describe(evidenceDoc)}`,
        } }
      );
    } catch (err) {
      console.warn(`[PhoneVerify] distributionDecision write failed for ${lead._id}:`, err.message);
    }

    // Exclusive routing: widget-sourced lead goes straight to that company.
    // Skipped when qualification failed — we don't push a rejected lead to a
    // partner either; admin reviews first.
    if (lead.sourceCompany && !qualificationFailed) {
      lead.status = 'Purchased';
      await new PurchasedLead({
        company:   lead.sourceCompany,
        lead:      lead._id,
        pricePaid: 0,
      }).save().catch(err => { if (err.code !== 11000) throw err; });
      console.log(`[PhoneVerify] Exclusive assignment to ${lead.sourceCompany}`);
    }

    lead.statusHistory.push({ status: lead.status, timestamp: new Date() });
    await lead.save();
    console.log(`[PhoneVerify] status=${lead.status} — Grade: ${scoring.grade} Price: $${finalPricing.buyNowPrice}`);

    // ── Warm transfer (auto-call Grade A mobile leads) ─────────────────────
    // PREVIOUSLY fired here using Abstract's lineType. Now requires Twilio
    // Lookup's authoritative lineType (lead.validation.phone.lineType), which
    // isn't necessarily populated at this moment because the validation
    // pipeline runs in parallel. Warm transfer should be re-introduced from
    // validationPipeline.js after lead.validation.phone.lineType is written.
    // Skipping here keeps the legacy warm-transfer behaviour from firing
    // against leads whose line type is unknown. The unused `fromPhone` var
    // is kept exported so future re-introduction is a one-line edit.
    void fromPhone;

    // ── Side effects: admin notify + mover broadcast ──────────────────────
    // Admin notify always fires regardless of mover-visibility — admins
    // need to see fake/rejected leads too.
    sendAdminLeadNotification({
      leadId: lead._id, customerName: lead.customerName,
      customerPhone: lead.customerPhone, customerEmail: lead.customerEmail,
      originCity: lead.originCity, destinationCity: lead.destinationCity,
      originZip: lead.originZip, destinationZip: lead.destinationZip,
      homeSize: lead.homeSize, moveDate: lead.moveDate, distance: lead.distance,
      miles: lead.miles, grade: lead.grade, price: lead.buyNowPrice,
      createdAt: lead.createdAt,
    }).catch(err => console.error('[AdminNotify] error:', err.message));

    // Phase 6.3 — race-safe broadcast guard.
    // Phase 6.7 — in the sequential V5 chain, validation+scoring have ALREADY
    // run by the time verifyLeadPhone executes. The DB has fresh shadowTier,
    // qualityGateCleared, structuralBlockers. The in-memory `lead` doc was
    // loaded at the TOP of this function (before scoring) and is stale on
    // those fields. We need both:
    //   (a) the outer isHiddenFromMoversById check (uses fresh DB read)
    //   (b) reload the lead doc so the per-channel broadcast guards inside
    //       broadcastLeadSMS / broadcastLeadEmail / emitNewLead see fresh
    //       visibility fields — otherwise they'd see qualityGateCleared=false
    //       (the ingest-time value) and incorrectly suppress legit broadcasts.
    // Phase 6.8 — qualificationFailed short-circuits broadcasts unconditionally.
    // This is the env-flag-independent gate: if scoring marked the lead
    // rejected (or gate=false / override=rejected), NO broadcasts fire,
    // regardless of routing-mode env config.
    if (qualificationFailed) {
      console.log(`[leadVisibility] verifyLeadPhone: suppressed broadcasts for ${lead._id} — qualification failed (${qualificationReason})`);
      return;
    }

    const { isHiddenFromMoversById } = require('../utils/leadVisibility');
    const check = await isHiddenFromMoversById(lead._id);
    if (check.hidden) {
      console.log(`[leadVisibility] verifyLeadPhone: suppressed broadcasts for ${lead._id} — ${check.reason} (source=${check.source})`);
    } else {
      // Reload so downstream guards in the broadcast services see the
      // post-qualification fields (shadowTier, qualityGateCleared, etc.)
      // along with the just-saved status/pricing fields.
      const freshLead = await Lead.findById(lead._id).lean();
      const leadForBroadcast = freshLead || lead;
      broadcastLeadSMS(leadForBroadcast);
      broadcastLeadEmail(leadForBroadcast).catch(() => {});
      socketService.emitNewLead(leadForBroadcast);
    }

  } catch (err) {
    console.error(`[PhoneVerify] Unexpected error for lead ${leadId}:`, err.message);
    try {
      if (lead) {
        lead.status           = 'PENDING_MANUAL_REVIEW';
        lead.price            = 0;
        lead.buyNowPrice      = 0;
        lead.startingBidPrice = 0;
        lead.currentBidPrice  = 0;
        lead.auctionStatus    = 'expired';
        lead.statusHistory.push({ status: 'PENDING_MANUAL_REVIEW', timestamp: new Date() });
        await lead.save();
      }
    } catch (saveErr) {
      console.error('[PhoneVerify] Failed to save error status:', saveErr.message);
    }
  }
}

/**
 * Send a Speed-to-Lead SMS to the customer when a mover claims the lead.
 * Deduplicates: if a Sent/Pending record already exists for this company+lead,
 * skips the send to prevent duplicate messages on accidental double-claims.
 *
 * @param {Object} lead    - Lead document
 * @param {Object} company - User (mover) document
 */
async function sendSpeedToLeadSMS(lead, company) {
  const messageBody = `Hi ${lead.customerName}, this is ${company.companyName}. We just received your quote request for your move to ${lead.destinationCity}. Are you free for a quick call to go over the details?`;

  console.log(`[Twilio SMS] Sending Speed-to-Lead for ${lead._id} to ${lead.customerPhone}...`);

  // Dedup: skip if we already sent (or are pending) an SMS for this company+lead pair.
  const existing = await Communication.findOne({
    company: company._id,
    lead: lead._id,
    type: 'SMS',
    status: { $in: ['Sent', 'Delivered', 'Pending'] }
  });
  if (existing) {
    console.warn(`[Twilio SMS] Duplicate suppressed — record ${existing._id} already exists for company ${company._id} + lead ${lead._id}`);
    return;
  }

  const comm = new Communication({
    company: company._id,
    lead: lead._id,
    phoneNumber: lead.customerPhone,
    content: messageBody,
    status: 'Pending'
  });

  try {
    await comm.save();

    if (!twilioClient) {
      console.warn('[Twilio SMS] Missing credentials. Running in MOCK mode.');
      await new Promise(resolve => setTimeout(resolve, 800));
      comm.status = 'Sent';
      comm.sid = 'MOCK_SID_' + Math.random().toString(36).substring(7);
      await comm.save();
      console.log(`[Twilio SMS] MOCK SMS sent to ${lead.customerPhone}`);
      return;
    }

    const message = await twilioClient.messages.create({
      body: messageBody,
      from: fromPhone,
      to: lead.customerPhone
    });

    comm.status = 'Sent';
    comm.sid = message.sid;
    await comm.save();
    console.log(`[Twilio SMS] SMS sent. SID: ${message.sid}`);

  } catch (err) {
    console.error(`[Twilio SMS] Failed to send SMS to ${lead.customerPhone}:`, err.message);
    try {
      comm.status = 'Failed';
      comm.error = err.message;
      await comm.save();
    } catch (saveErr) {
      console.error('[Twilio SMS] Failed to update comm record:', saveErr.message);
    }
  }
}

/**
 * Standalone phone validation using Twilio Lookup V2.
 * Returns { valid: true, e164: '+1...' } or { valid: false, reason: '...' }.
 * Rejects voip, toll_free, and invalid/unknown line types.
 *
 * @param {string} phone - Raw phone number in any format
 */
async function verifyPhoneNumber(phone) {
  if (!twilioClient) {
    console.warn('[Twilio] verifyPhoneNumber: no credentials, returning mock pass');
    return { valid: true, e164: phone };
  }

  try {
    const lookup = await twilioClient.lookups.v2
      .phoneNumbers(phone)
      .fetch({ fields: 'line_type_intelligence' });

    const lineType = lookup.lineTypeIntelligence?.type;
    const e164 = lookup.phoneNumber; // e.g. +12145551234

    console.log(`[Twilio] verifyPhoneNumber ${phone} → type=${lineType} e164=${e164}`);

    if (lineType === 'mobile' || lineType === 'landline') {
      return { valid: true, e164 };
    }

    return { valid: false, reason: `Rejected line type: ${lineType || 'unknown'}` };
  } catch (err) {
    console.error(`[Twilio] verifyPhoneNumber error for ${phone}:`, err.message);
    return { valid: false, reason: err.message };
  }
}

/**
 * Send an SMS alert to a mover when a matching lead is available.
 *
 * @param {string} toPhone    - Mover's phone in E.164 format
 * @param {Object} leadDetails - { homeSize, originZip, destinationZip }
 */
async function sendMoverSms(toPhone, leadDetails) {
  const { homeSize, originZip, destinationZip } = leadDetails;
  const body = `🚨 MoveLeads: New Lead! ${homeSize} moving from ${originZip} to ${destinationZip}. Claim it here: https://moveleads.cloud/login`;

  console.log(`[Twilio] sendMoverSms → ${toPhone}`);

  if (!twilioClient) {
    console.warn('[Twilio] sendMoverSms: no credentials, mock send');
    return;
  }

  try {
    const msg = await twilioClient.messages.create({
      body,
      from: fromPhone,
      to: toPhone,
    });
    console.log(`[Twilio] Mover SMS sent. SID: ${msg.sid}`);
  } catch (err) {
    console.error(`[Twilio] sendMoverSms failed for ${toPhone}:`, err.message);
  }
}

module.exports = { verifyLeadPhone, sendSpeedToLeadSMS, verifyPhoneNumber, sendMoverSms, broadcastLeadSMS };
