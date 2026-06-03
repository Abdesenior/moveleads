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
const { openClaimWindow } = require('../utils/claimWindow');
const { getSmsStatusCallbackUrl } = require('../utils/twilioStatusCallback');

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
          role: { $in: User.MOVER_ROLES },
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
          role: { $in: User.MOVER_ROLES },
        })
      : [];
    const nationwideIds = await User.distinct('_id', {
      deliversNationwide: true,
      role: { $in: User.MOVER_ROLES },
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
      // PR-4 broadcast manifest — record the refined suppress reason for the
      // SMS pipeline. Most specific reason available at this layer.
      Lead.updateOne(
        { _id: lead._id },
        { $set: { lastBroadcastMatchedCount: 0, lastBroadcastSuppressReason: 'sms_no_coverage' } }
      ).catch(e => console.error('[SMS] manifest write (no_coverage) failed:', e.message));
      return;
    }

    // Hydrate candidate movers. Keep the cheap hard filters in Mongo
    // (phone present, not suspended). We deliberately drop the
    // `smsNotif: true` mongo filter — the dispatch-policy helper now
    // owns the channel decision (smsNotif is the sole authority since
    // PR-C3 retired alertChannels). Pull onboarding.answers so the helper
    // can read it, plus the new Phase 1 pickup/delivery fields for the
    // strict matcher.
    //
    // TCPA / Block E.2: also require smsOptOut !== true and
    // phoneVerified === true so STOP-replied or unverified partner
    // phones never receive a broadcast.
    // 2026-05-28 — added `balance` and `smsClaim` to the projection. The
    // per-mover Claim-vs-Alert partition step (below) consults both to
    // decide which body variant each mover receives. Selecting them here
    // means one query, no second round-trip per mover.
    const candidates = await User.find({
      _id:      { $in: Array.from(unionIds) },
      role:     { $in: User.MOVER_ROLES },
      isSuspended:   { $ne: true },
      smsOptOut:     { $ne: true },
      phoneVerified: true,
      phone:    { $exists: true, $nin: ['', null] },
    }).select('phone companyName smsNotif emailNotif isSuspended smsOptOut phoneVerified smsCounters maxDistance preferredHomeSizes deliversNationwide pickupStates deliveryStates serviceStates onboarding.answers balance smsClaim').lean();

    if (!candidates.length) {
      // 2026-05-28 — observability fix. The legacy log line
      // "[SMS] No candidates with phone on file" conflated FIVE distinct
      // hard-filter conditions: role mismatch, suspended, smsOptOut, not
      // phoneVerified, missing/empty phone. During the Alabama staging
      // investigation, "role mismatch" (a mover with role='mover' vs the
      // legacy role='customer' filter — PR #48) hid behind the misleading
      // log for hours. The breakdown below runs ONE projected find() over
      // the union we already have, bounded cost, only on the failure path.
      try {
        const unionDiag = await User.find({ _id: { $in: Array.from(unionIds) } })
          .select('role isSuspended smsOptOut phoneVerified phone')
          .lean();
        const dropped = {
          role_not_mover:   unionDiag.filter(u => !User.MOVER_ROLES.includes(u.role)).length,
          suspended:        unionDiag.filter(u => u.isSuspended === true).length,
          smsOptOut:        unionDiag.filter(u => u.smsOptOut === true).length,
          phoneNotVerified: unionDiag.filter(u => u.phoneVerified !== true).length,
          phoneMissing:     unionDiag.filter(u => !u.phone || u.phone === '').length,
        };
        console.log(
          `[SMS] No candidates remain after hard filter for lead ${lead._id}. ` +
          `unionSize=${unionDiag.length} dropped: ` +
          `${Object.entries(dropped).map(([k, v]) => `${k}=${v}`).join(' ')} ` +
          `(counts may overlap for movers failing multiple gates)`
        );
      } catch (_e) {
        // Defensive fallback — diagnostic must NEVER replace the dispatch
        // behavior. If the projected find() itself errors, fall back to the
        // legacy single-line log so the operator still sees SOMETHING.
        console.log('[SMS] No candidates with phone on file');
      }
      // PR-4 broadcast manifest — refined reason: union covered the lead
      // but every member failed a hard filter (role/suspended/smsOptOut/
      // unverified/phone-missing).
      Lead.updateOne(
        { _id: lead._id },
        { $set: { lastBroadcastMatchedCount: 0, lastBroadcastSuppressReason: 'sms_no_candidates' } }
      ).catch(e => console.error('[SMS] manifest write (no_candidates) failed:', e.message));
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
    // Optional per-candidate diagnosis trace, env-gated. Off by default;
    // turn on for short debugging windows only via MATCHER_DIAGNOSE_LOG=1.
    const diagnoseLog = process.env.MATCHER_DIAGNOSE_LOG === '1';
    const matched = candidates.filter(m => {
      const inLegacySet = legacyCandidateSet.has(String(m._id));
      const inStrictSet = strictCandidateSet.has(String(m._id));
      const passesLegacy = inLegacySet && doesLeadMatchMoverPreferences(lead, m, emptyZipSet);
      const passesStrict = inStrictSet && doesLeadMatchMoverPreferencesStrict(lead, m, {});
      if (passesLegacy) legacyPassCount++;
      if (passesStrict) strictPassCount++;
      logMatchShadow({ source: 'sms', lead, mover: m, legacy: passesLegacy, strict: passesStrict });
      if (diagnoseLog) {
        const { diagnoseMatch, shortLogLine } = require('../utils/matcherDiagnosis');
        console.log(shortLogLine(diagnoseMatch(lead, m, { strictMode })));
      }

      const passesActive = strictMode ? passesStrict : passesLegacy;
      if (!passesActive) return false;

      if (!wantsChannel(m, 'sms')) {
        console.log(`[SMS] Drop ${m.companyName || m._id}: smsNotif=false (SMS notifications disabled)`);
        return false;
      }
      if (!isWithinDispatchHours(m, 'sms', now)) {
        console.log(`[SMS] Drop ${m.companyName || m._id}: outside dispatch hours`);
        return false;
      }
      if (!matchesMoveTypes(m, lead)) {
        // matchesMoveTypes is intentionally dormant (always true) since PR-C4
        // retired the move-type filter. This branch cannot fire today; the
        // call site is kept as a structural placeholder per the retirement
        // lock-in tests.
        console.log(`[SMS] Drop ${m.companyName || m._id}: move-type gate (dormant — should not fire)`);
        return false;
      }
      return true;
    });

    console.log(`[MatchShadow] source=sms lead=${lead._id} candidates=${candidates.length} legacy_pass=${legacyPassCount} strict_pass=${strictPassCount} active=${strictMode ? 'strict' : 'legacy'}`);

    console.log(`[SMS] ${unionIds.size} cover this lead (union of legacy+strict), ${candidates.length} candidates after gates, ${matched.length} pass full policy under active mode`);
    if (!matched.length) {
      // PR-4 broadcast manifest — coverage + hard filter passed but the
      // per-candidate policy (matcher / wantsChannel / dispatch hours /
      // moveTypes) dropped everyone.
      Lead.updateOne(
        { _id: lead._id },
        { $set: { lastBroadcastMatchedCount: 0, lastBroadcastSuppressReason: 'sms_no_policy_pass' } }
      ).catch(e => console.error('[SMS] manifest write (no_policy_pass) failed:', e.message));
      return;
    }
    // PR-4 broadcast manifest — record the actual matched count. The SMS
    // path proceeds from here, so any prior SMS-specific suppress reason
    // is now stale; clear it. (Visibility-level reasons from the
    // orchestrator were already cleared when it decided to proceed.)
    Lead.updateOne(
      { _id: lead._id },
      { $set: { lastBroadcastMatchedCount: matched.length, lastBroadcastSuppressReason: null } }
    ).catch(e => console.error('[SMS] manifest write (matchedCount) failed:', e.message));
    console.log(`[SMS] Broadcasting to: ${matched.map(m => m.companyName || m.phone).join(', ')}`);

    // ── PR-S5/S7 — Per-mover SMS Claim eligibility partition ─────────────
    //
    // ENABLE_SMS_CLAIM_SCAFFOLD is still the master "is SMS Claim feature
    // live in this environment" switch, but the per-mover decision is no
    // longer global. Each matched mover is evaluated independently:
    //
    //   isClaimEligible(mover, lead) =
    //     ENABLE_SMS_CLAIM_SCAFFOLD === 'true'
    //     && mover.smsClaim?.optInRequested === true   ← per-mover opt-in
    //     && mover.balance >= lead.buyNowPrice         ← per-mover balance
    //   // phoneVerified is already enforced by the Mongo hard filter above
    //   // lead-is-claimable is already enforced by isHiddenFromMovers
    //
    // Movers who qualify get the SMS Claim variant ("Reply SEND <token>
    // to claim"). Movers who do NOT qualify still get an SMS — they just
    // get the legacy Alert variant ("Claim: moveleads.cloud/login"). The
    // partition guarantees:
    //
    //   - movers without balance never receive a token they cannot use
    //   - movers who never clicked "Activate Instant Jobs" on the
    //     SmsClaim dashboard receive normal Alerts (the activation button
    //     finally gates something operationally — was cosmetic before)
    //   - claimWindow.broadcastTo only contains real race participants,
    //     so PR-S6 loser fan-out targets only movers who actually had a
    //     chance to claim
    //
    // When NO mover qualifies (scaffold-off, or all movers ineligible),
    // openClaimWindow is NOT called and claimToken stays null. Every
    // mover gets the Alert variant — same fallback as before.
    //
    // openClaimWindow null return → claimToken stays null → eligible
    // movers also get the Alert variant. Defensive fallback (matches the
    // pre-S7 posture). The broadcast never fails on token absence; SMS
    // dispatch is the operational priority.
    const scaffoldEnabled = process.env.ENABLE_SMS_CLAIM_SCAFFOLD === 'true';
    const isClaimEligible = (mover) =>
      scaffoldEnabled &&
      mover.smsClaim && mover.smsClaim.optInRequested === true &&
      Number(mover.balance || 0) >= Number(lead.buyNowPrice || 0);

    const claimEligibleMovers = matched.filter(isClaimEligible);
    const alertOnlyMovers     = matched.filter(m => !isClaimEligible(m));

    console.log(
      `[SMS] mode partition lead=${lead._id} matched=${matched.length} ` +
      `claim=${claimEligibleMovers.length} alert=${alertOnlyMovers.length} ` +
      `scaffoldEnabled=${scaffoldEnabled}`
    );

    let claimToken = null;
    if (claimEligibleMovers.length > 0) {
      try {
        const recipientIds = claimEligibleMovers.map(m => m._id);
        const opened = await openClaimWindow(lead._id, recipientIds);
        if (opened && opened.token) {
          claimToken = opened.token;
          console.log(
            `[SMS] claimWindow opened for lead ${lead._id} — token=${claimToken} ` +
            `expires=${opened.expiresAt.toISOString()} recipients=${recipientIds.length}`
          );
        } else {
          console.log(
            `[SMS] claimWindow NOT opened for lead ${lead._id} — falling back ` +
            `to Alert variant for all movers (lead may already have open/claimed window).`
          );
        }
      } catch (e) {
        console.error(`[SMS] openClaimWindow error for lead ${lead._id}: ${e.message}. ` +
          `Continuing with Alert variant for all movers.`);
      }
    }

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

      // Per-mover token resolution: claim-eligible movers get the claim
      // token (if openClaimWindow succeeded); everyone else gets the
      // Alert variant (token=null → "Claim: moveleads.cloud/login" CTA).
      const tokenForThisMover = isClaimEligible(mover) ? claimToken : null;
      sendMoverLeadSMS(mover.phone, lead, tokenForThisMover)
        .then(async (result) => {
          // Only bump the counter on a confirmed send. sendMoverLeadSMS
          // returns { ok: false } on Twilio errors and (legacy) undefined
          // when credentials are missing; both are no-counter-bump cases.
          if (!result || result.ok !== true) return;
          // The reset (new UTC day → count=1) and bump (same day → +1) are
          // encoded as a single aggregation-pipeline updateOne so the read
          // and write happen atomically. Failures are non-fatal; the cap
          // is best-effort.
          //
          // 2026-05-28 — fix: route through the raw collection driver
          // (User.collection.updateOne) instead of the Mongoose wrapper.
          // Newer Mongoose versions reject array-form pipelines on
          // .updateOne() with "Cannot pass an array to query updates unless
          // updatePipeline option is set" — the helpful guard is meant
          // to catch accidental array-as-replacement-doc, but our payload
          // is a deliberate Mongo aggregation pipeline. The raw collection
          // accepts pipelines natively per the Mongo wire spec. The
          // pipeline payload itself is unchanged from the original write;
          // only the call site swaps from User.updateOne → User.collection.updateOne.
          // Effect: the daily SMS cap counter now actually increments
          // instead of silently failing on every send (the cap was a
          // no-op in production until this fix).
          try {
            await User.collection.updateOne(
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

    // 2026-05-28 — extracted into a canonical post-approval orchestrator
    // so the auto-approval path and the admin-approval path
    // (POST /api/admin/leads/:id/approve) converge on identical dispatch
    // semantics. Previously the admin path bypassed broadcastLeadSMS /
    // broadcastLeadEmail / emitNewLead entirely, producing silent-approved
    // inventory. The orchestrator does the fresh visibility check + Lead
    // reload + 3-channel fan-out that this block used to do inline.
    const { dispatchApprovedLead } = require('./dispatchOrchestrator');
    await dispatchApprovedLead(lead._id, { source: 'verifyLeadPhone' });

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
      to: lead.customerPhone,
      // PR-5: statusCallback for lifecycle observability — see
      // utils/twilioStatusCallback.js. No behavior change.
      statusCallback: getSmsStatusCallbackUrl(),
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
      // PR-5: statusCallback for lifecycle observability — see
      // utils/twilioStatusCallback.js. No behavior change.
      statusCallback: getSmsStatusCallbackUrl(),
    });
    console.log(`[Twilio] Mover SMS sent. SID: ${msg.sid}`);
  } catch (err) {
    console.error(`[Twilio] sendMoverSms failed for ${toPhone}:`, err.message);
  }
}

module.exports = { verifyLeadPhone, sendSpeedToLeadSMS, verifyPhoneNumber, sendMoverSms, broadcastLeadSMS };
