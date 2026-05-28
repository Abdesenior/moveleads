const express = require('express');
const router  = express.Router();
const twilio  = require('twilio');
const User    = require('../models/User');
const Lead          = require('../models/Lead');
const PurchasedLead = require('../models/PurchasedLead');
const Transaction   = require('../models/Transaction');
const ClaimAttempt  = require('../models/ClaimAttempt');
const { parseClaimReply } = require('../utils/claimToken');
const { findLeadByClaimToken } = require('../utils/claimWindow');
const { moverVisibilityFilter } = require('../utils/leadVisibility');
const { getIo } = require('../services/socketService');
const { sendMoverLostClaimSMS } = require('../services/smsService');

const VoiceResponse = twilio.twiml.VoiceResponse;
const MessagingResponse = twilio.twiml.MessagingResponse;
const { validateRequest } = twilio;

const API_BASE = 'https://api.moveleads.cloud';

/**
 * Socket emit for SMS-claim winners — mirrors broadcastLeadSold in
 * routes/bids.js. Duplicated intentionally (PR-S3) to avoid coupling
 * the inbound webhook to the bids router; if PR-S6 wants to vary the
 * emit shape later, the two routes stay independently editable.
 */
function broadcastLeadSold(lead, buyerId) {
  const io = getIo();
  if (!io) return;
  io.to(`zip_${lead.originZip}`).to(`zip_${lead.destinationZip}`).emit('lead_sold', {
    leadId: lead._id,
    buyerId: buyerId?.toString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Twilio webhook setup runbook (Phase 1 / Block E.2)
// ─────────────────────────────────────────────────────────────────────────────
// Inbound SMS keyword webhook:
//   URL:    https://api.moveleads.cloud/api/twilio/sms/inbound
//   Method: POST (Twilio signature-verified — same pattern as voice routes)
//   Configure in: Twilio console → Phone Numbers → Active Numbers
//                 → [partner SMS line] → Messaging → "A message comes in"
//                 → Webhook → POST → paste URL above.
//
// Inbound voice webhook (already in production):
//   URL:    https://api.moveleads.cloud/api/twilio/voice/incoming
//   Method: POST
//   Configure in: Phone Numbers → +12542825345 → Voice webhook
//
// Signature verification: the `twilioWebhook` middleware below mirrors the
// pattern used in server/routes/voice.js (validateRequest with
// TWILIO_AUTH_TOKEN). When TWILIO_AUTH_TOKEN is unset (dev/mock) the check
// is skipped so local testing still works.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Twilio webhook signature validation (mirrors voice.js implementation).
 * Skipped when TWILIO_AUTH_TOKEN is absent (dev / mock mode).
 */
function twilioWebhook(req, res, next) {
  if (!process.env.TWILIO_AUTH_TOKEN) return next();

  const url = `${process.env.SERVER_URL || 'https://moveleads.cloud'}${req.originalUrl}`;
  const valid = validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    req.headers['x-twilio-signature'] || '',
    url,
    req.body
  );
  if (!valid) {
    // 2026-05-28 — observability fix. The 403 path was previously silent
    // server-side; signature mismatches only surfaced in the Twilio console
    // webhook-delivery view. During the Alabama staging investigation the
    // root cause was a SERVER_URL ↔ webhook-URL host mismatch (api. subdomain
    // missing from SERVER_URL), and the silent 403 cost real investigation
    // time. Logging the reconstructed URL makes a future mismatch one
    // grep away. Signature is truncated to 12 chars so the full secret
    // material doesn't appear in log aggregations.
    const sigPreview = (req.headers['x-twilio-signature'] || '').slice(0, 12);
    console.warn(
      `[twilioWebhook] signature mismatch — reconstructedUrl=${url} ` +
      `sigPreview=${sigPreview}… method=${req.method} ` +
      `(if seen: verify SERVER_URL env matches the Twilio-console webhook URL exactly)`
    );
    return res.status(403).send('Forbidden');
  }
  next();
}

/**
 * Incoming call webhook — set this URL in the Twilio console:
 *   Phone Numbers → +12542825345 → Voice webhook → POST
 *   https://api.moveleads.cloud/api/twilio/voice/incoming
 *
 * Handles any direct inbound call to the Twilio number.
 * Warm-transfer OUTBOUND calls are handled by /api/voice/* routes.
 */
router.post('/voice/incoming', (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say(
    { voice: 'Polly.Matthew' },
    'Thank you for calling MoveLeads. To get free quotes from verified movers, visit moveleads dot cloud. Goodbye!'
  );
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

/**
 * Status callback — receives call lifecycle events (initiated, ringing, completed, etc.)
 * Set as statusCallbackUrl when creating outbound calls.
 */
router.post('/voice/status', (req, res) => {
  const { CallSid, CallStatus, To, From, CallDuration } = req.body;
  console.log(`[Twilio] Status callback — SID: ${CallSid} | Status: ${CallStatus} | To: ${To} | From: ${From} | Duration: ${CallDuration}s`);
  res.sendStatus(204);
});

/**
 * Inbound SMS webhook — Twilio POSTs every inbound SMS to this URL.
 * Handles TCPA-required keywords (STOP, START, HELP, etc.) and persists
 * the opt-out flag on the matching User document.
 *
 * Body is application/x-www-form-urlencoded; mount the parser locally
 * because the global app.use(express.json()) does not parse form bodies.
 */
const SUPPORT_NUMBER = '+1 (307) 204-4792';
const STOP_KEYWORDS  = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_KEYWORDS = new Set(['START', 'UNSTOP', 'YES']);
const HELP_KEYWORDS  = new Set(['HELP', 'INFO']);

router.post(
  '/sms/inbound',
  express.urlencoded({ extended: false }),
  twilioWebhook,
  async (req, res) => {
    const twiml = new MessagingResponse();
    const rawBody = (req.body && req.body.Body) || '';
    const fromRaw = (req.body && req.body.From) || '';
    const keyword = rawBody.trim().toUpperCase();

    try {
      // Normalize phone to digits-only for lookup; users may be stored
      // with formatting like "(307) 204-4792".
      const digits = fromRaw.replace(/\D/g, '');
      const last10 = digits.slice(-10);

      // Match either the raw E.164 or any stored format that contains the
      // same last-10 digits. Prefer non-suspended on ties.
      //
      // PR-S3 — extended `.select()` to include `phoneVerified` (TCPA gate for
      // the claim path) and `balance` is fetched in the conditional debit, not
      // here. Other branches (STOP/START/HELP) ignore the extra fields.
      let user = null;
      if (last10) {
        const candidates = await User
          .find({ phone: { $regex: last10 + '$' } })
          .select('_id phone isSuspended smsOptOut phoneVerified')
          .lean();
        if (candidates.length) {
          user = candidates.find(u => !u.isSuspended) || candidates[0];
        }
      }

      const userIdLog = user ? user._id : 'none';

      if (STOP_KEYWORDS.has(keyword)) {
        if (user) {
          await User.updateOne({ _id: user._id }, { $set: { smsOptOut: true } });
        }
        console.log(`[Twilio SMS Inbound] STOP keyword="${keyword}" userId=${userIdLog}`);
        twiml.message('You have been unsubscribed from MoveLeads alerts. Reply START to resubscribe.');
        return res.type('text/xml').send(twiml.toString());
      }

      // ────────────────────────────────────────────────────────────────────
      // PR-S3 — SMS Claim Live Handler. Gated on ENABLE_SMS_CLAIM_LIVE.
      //
      // Architectural constraint: this branch is a SIBLING of the buy-now
      // atomic block in routes/bids.js:101-186. It REPLICATES that pattern
      // verbatim — same lead-flip CAS shape, same conditional debit, same
      // unique PurchasedLead mutex, same Transaction ledger row, same socket
      // emit. PR-S3 does NOT introduce a shared purchase helper; we keep
      // two narrow siblings, each pinned to its own lock-in tests
      // (smsClaimLiveHandler.test.js for this one, leadVisibility/bids
      // tests for the other).
      //
      // Order in this handler: STOP (TCPA) → CLAIM (this) → START → HELP →
      // UNKNOWN. STOP wins everything; CLAIM sits before START/HELP so a
      // mover replying with a parsed token never gets treated as a generic
      // keyword.
      //
      // Idempotency: Twilio retries non-2xx webhook responses up to 5
      // times over 24h with the same MessageSid. The unique-sparse index
      // `twilioMessageSid_unique` (PR-S1) on ClaimAttempt is the dedup
      // signal. We insert ClaimAttempt FIRST (outcome='shadow_only'); on
      // E11000 we return prior empty TwiML, no further DB writes. After
      // the claim path terminates, we updateOne to stamp the final
      // outcome + leadId. Two-write strategy means even if write 2 fails,
      // the unique-MessageSid row blocks retries from re-executing the
      // claim.
      // ────────────────────────────────────────────────────────────────────
      const parsed = parseClaimReply(rawBody);
      if (parsed.token) {
        const messageSid = (req.body && req.body.MessageSid) || '';
        const token = parsed.token;
        const now = new Date();

        // Idempotency anchor — insert ClaimAttempt with shadow_only outcome.
        // Final outcome gets stamped via updateOne after the claim path
        // terminates. On Twilio retry of the same MessageSid, E11000 here
        // is the dedup signal.
        let attempt;
        try {
          attempt = await ClaimAttempt.create({
            fromPhone: fromRaw,
            body: rawBody,
            parsedKeyword: parsed.keyword,
            token,
            twilioMessageSid: messageSid || undefined, // empty string would defeat sparse
            outcome: 'shadow_only',
            moverId: user ? user._id : undefined,
          });
        } catch (err) {
          if (err.code === 11000) {
            console.log(`[Twilio SMS Inbound] CLAIM duplicate MessageSid ${messageSid} — already processed, no-op`);
            // Twilio retry of an already-handled webhook. Return empty TwiML
            // (200) so Twilio stops retrying; the original response already
            // reached the mover.
            return res.type('text/xml').send(twiml.toString());
          }
          throw err;
        }

        // Helper to stamp the terminal outcome on the attempt row. Non-fatal
        // on failure — the shadow_only row is still in place + idempotent.
        const finalize = async (outcome, reason, extras = {}) => {
          try {
            await ClaimAttempt.updateOne(
              { _id: attempt._id },
              { $set: { outcome, reason, ...extras } }
            );
          } catch (e) {
            console.error(`[Twilio SMS Inbound] CLAIM finalize update failed (non-fatal): ${e.message}`);
          }
        };

        // Flag-off path — shadow only. ENABLE_SMS_CLAIM_LIVE strict-equals
        // 'true' on purpose; truthy check would let "false" enable live mode.
        if (process.env.ENABLE_SMS_CLAIM_LIVE !== 'true') {
          console.log(`[Twilio SMS Inbound] CLAIM shadow_only token=${token} (ENABLE_SMS_CLAIM_LIVE off)`);
          // Attempt row already has outcome='shadow_only'; no update needed.
          return res.type('text/xml').send(twiml.toString());
        }

        // Sender precondition — unknown sender treated as unverified.
        if (!user) {
          console.log(`[Twilio SMS Inbound] CLAIM rejected_unverified_phone (no user match) token=${token} from=${fromRaw}`);
          await finalize('rejected_unverified_phone', 'no user matched phone');
          twiml.message('MoveLeads: claim received but your phone is not verified. Visit moveleads.cloud to verify.');
          return res.type('text/xml').send(twiml.toString());
        }

        // Opt-out — TCPA. No SMS reply.
        if (user.smsOptOut) {
          console.log(`[Twilio SMS Inbound] CLAIM rejected_optout mover=${user._id}`);
          await finalize('rejected_optout', 'smsOptOut=true');
          return res.type('text/xml').send(twiml.toString());
        }

        // Verification gate — phoneVerified must be true.
        if (user.phoneVerified !== true) {
          console.log(`[Twilio SMS Inbound] CLAIM rejected_unverified_phone mover=${user._id}`);
          await finalize('rejected_unverified_phone', 'phoneVerified=false');
          twiml.message('MoveLeads: claim received but your phone is not verified. Visit moveleads.cloud to verify.');
          return res.type('text/xml').send(twiml.toString());
        }

        // ── Atomic lead-flip CAS ─────────────────────────────────────────
        // Mirrors routes/bids.js:108-112 (buy-now atomic claim). Filter
        // includes moverVisibilityFilter() so a rejected lead is not
        // claimable by SMS reply (Phase 6 visibility model).
        const claimedLead = await Lead.findOneAndUpdate(
          {
            'claimWindow.token': token,
            'claimWindow.status': 'open',
            'claimWindow.expiresAt': { $gt: now },
            ...moverVisibilityFilter(),
          },
          {
            $set: {
              'claimWindow.status': 'claimed',
              'claimWindow.claimedBy': user._id,
              'claimWindow.claimedAt': now,
              'claimWindow.closedReason': 'claimed',
              auctionStatus: 'buy_now',
            },
          },
          { new: true }
        );

        if (!claimedLead) {
          // Disambiguation — one indexed read to distinguish unmatched
          // token / already-claimed / window-expired. Cost only paid on
          // loser path. Filtered query above would have collapsed these.
          const stateLead = await findLeadByClaimToken(token);
          let outcome = 'rejected_unmatched_token';
          let smsMessage = ''; // empty TwiML for unmatched (cost control)

          if (stateLead && stateLead.claimWindow) {
            if (stateLead.claimWindow.status === 'claimed') {
              outcome = 'lost_already_claimed';
              smsMessage = 'MoveLeads: lead already claimed by another mover. Better luck next time.';
            } else if (stateLead.claimWindow.expiresAt && stateLead.claimWindow.expiresAt <= now) {
              outcome = 'lost_window_expired';
              smsMessage = "MoveLeads: this lead's claim window expired. Reply STOP to opt out.";
            }
          }

          console.log(`[Twilio SMS Inbound] CLAIM ${outcome} token=${token} mover=${user._id}`);
          await finalize(outcome, outcome, { leadId: stateLead ? stateLead._id : undefined });
          if (smsMessage) twiml.message(smsMessage);
          return res.type('text/xml').send(twiml.toString());
        }

        // We won the lead-flip. Read the price and try to debit.
        const price = claimedLead.buyNowPrice;

        // Atomic conditional debit — single op enforces balance >= price.
        // Mirrors routes/bids.js:120-124.
        const debited = await User.findOneAndUpdate(
          { _id: user._id, balance: { $gte: price } },
          { $inc: { balance: -price } },
          { new: true }
        );

        if (!debited) {
          // Insufficient balance — revert the lead claim. Revert filter
          // scoped to claimedBy=user._id so we only undo OUR claim. Mirrors
          // routes/bids.js:128-132 but with the claim-window fields too.
          await Lead.findOneAndUpdate(
            {
              _id: claimedLead._id,
              'claimWindow.status': 'claimed',
              'claimWindow.claimedBy': user._id,
            },
            {
              $set: {
                'claimWindow.status': 'expired',
                'claimWindow.closedReason': 'expired',
                'claimWindow.claimedBy': null,
                'claimWindow.claimedAt': null,
                auctionStatus: 'active',
              },
            }
          );
          console.log(`[Twilio SMS Inbound] CLAIM rejected_low_balance mover=${user._id} price=$${price}`);
          await finalize('rejected_low_balance', `balance < ${price}`, { leadId: claimedLead._id });
          twiml.message(`MoveLeads: insufficient balance to claim ($${price} needed). Add funds at moveleads.cloud`);
          return res.type('text/xml').send(twiml.toString());
        }

        // Create PurchasedLead audit row. Unique { company, lead } mutex
        // is the load-bearing race resolver — E11000 here means another
        // concurrent claim won (a buy-now or sibling SMS claim that landed
        // microseconds before us). Mirrors routes/bids.js:138-159.
        let purchasedLeadDoc;
        try {
          purchasedLeadDoc = await new PurchasedLead({
            company:   user._id,
            lead:      claimedLead._id,
            pricePaid: price,
          }).save();
        } catch (err) {
          if (err.code === 11000) {
            // Refund debit + revert lead claim.
            await User.findOneAndUpdate({ _id: user._id }, { $inc: { balance: price } });
            await Lead.findOneAndUpdate(
              {
                _id: claimedLead._id,
                'claimWindow.status': 'claimed',
                'claimWindow.claimedBy': user._id,
              },
              {
                $set: {
                  'claimWindow.status': 'expired',
                  'claimWindow.closedReason': 'expired',
                  'claimWindow.claimedBy': null,
                  'claimWindow.claimedAt': null,
                  auctionStatus: 'active',
                },
              }
            );
            console.log(`[Twilio SMS Inbound] CLAIM lost_already_claimed (PurchasedLead E11000) mover=${user._id} lead=${claimedLead._id}`);
            await finalize('lost_already_claimed', 'PurchasedLead E11000', { leadId: claimedLead._id });
            twiml.message('MoveLeads: lead already claimed by another mover. Better luck next time.');
            return res.type('text/xml').send(twiml.toString());
          }
          // Unknown error — refund + revert and propagate to outer catch.
          // Outer catch returns empty TwiML 200, so Twilio does not retry.
          // ClaimAttempt row remains as shadow_only with the messageSid
          // unique index ensuring a true retry would no-op.
          await User.findOneAndUpdate({ _id: user._id }, { $inc: { balance: price } });
          await Lead.findOneAndUpdate(
            { _id: claimedLead._id, 'claimWindow.status': 'claimed', 'claimWindow.claimedBy': user._id },
            { $set: {
                'claimWindow.status': 'expired',
                'claimWindow.closedReason': 'expired',
                'claimWindow.claimedBy': null,
                'claimWindow.claimedAt': null,
                auctionStatus: 'active',
            } }
          );
          throw err;
        }

        // Finalize the lead — same fields buy-now sets (routes/bids.js:161-166).
        // lead.save() is intentionally uncaught (matches bids.js posture):
        // if it throws, PurchasedLead is the source of truth for ownership;
        // the lead's status fields may drift but the unique mutex holds.
        claimedLead.winnerId      = user._id;
        claimedLead.finalPrice    = price;
        claimedLead.auctionStatus = 'sold';
        claimedLead.status        = 'Purchased';
        claimedLead.buyers.push({ company: user._id, purchasedAt: now, pricePaid: price });
        await claimedLead.save();

        // Ledger row — non-fatal. Mirrors routes/bids.js:169-177; description
        // says "SMS claim" so the operator can distinguish channels in the
        // transaction history UI.
        try {
          await Transaction.create({
            user:          user._id,
            type:          'Lead Purchase',
            amount:        price,
            description:   `SMS claim: lead ${claimedLead._id}`,
            lead:          claimedLead._id,
            purchasedLead: purchasedLeadDoc._id,
            status:        'Completed',
          });
        } catch (e) {
          console.error(`[Twilio SMS Inbound] CLAIM Transaction.create failed (non-fatal): ${e.message}`);
        }

        // Socket emit — non-fatal. Uses the local broadcastLeadSold helper.
        try {
          broadcastLeadSold(claimedLead, user._id);
        } catch (e) {
          console.error(`[Twilio SMS Inbound] CLAIM broadcastLeadSold failed (non-fatal): ${e.message}`);
        }

        console.log(`[Twilio SMS Inbound] CLAIM won lead=${claimedLead._id} mover=${user._id} price=$${price}`);
        await finalize('won', 'claim succeeded', { leadId: claimedLead._id });

        // ── PR-S6 — loser notification fan-out ───────────────────────────────
        //
        // Notify the OTHER recipients of this claimWindow that the lead has
        // been claimed by someone else and NO charge was made to them. Fires
        // ONLY on the winner branch (after finalize('won')), AFTER the entire
        // financial atomic sequence has committed.
        //
        // Idempotency: this fan-out is invoked from the winner code path,
        // which itself is reached only on a fresh ClaimAttempt insert (the
        // unique-sparse twilioMessageSid index from PR-S1 short-circuits
        // Twilio retries at the duplicate-MessageSid check, before the
        // winner code can re-run). So losers are notified exactly once per
        // claim.
        //
        // Side-effect discipline (locked by lock-in tests):
        //   - NO Lead mutations (Lead.claimWindow already terminal at this
        //     point — flipped to 'claimed' by the atomic CAS upstream)
        //   - NO financial writes (no User balance, no PurchasedLead, no
        //     Transaction)
        //   - NO additional ClaimAttempt rows (losers are NOT distinct claim
        //     attempts; they're a notification surface only)
        //
        // Failure isolation: each Twilio send is fire-and-forget with its
        // own .catch. A single loser's send failure does NOT cascade to the
        // others, does NOT delay the winner TwiML response, and does NOT
        // surface to the inbound HTTP request.
        try {
          const broadcastTo = Array.isArray(claimedLead.claimWindow && claimedLead.claimWindow.broadcastTo)
            ? claimedLead.claimWindow.broadcastTo
            : [];
          // Filter out the winning mover (string-compare on _id so any
          // ObjectId vs. string identity quirk does not accidentally
          // re-notify the winner with a lost-claim message).
          const winnerIdStr = String(user._id);
          const loserIds = broadcastTo.filter(id => String(id) !== winnerIdStr);

          if (loserIds.length > 0) {
            // TCPA + dispatch-discipline gates — SAME shape as the outbound
            // SMS broadcast hard filter in twilioService.js (phoneVerified,
            // smsOptOut, isSuspended, phone present) + role discriminator
            // from User.MOVER_ROLES (PR #48). Reuses the same constant so
            // a future role-set change automatically flows through here.
            const losers = await User.find({
              _id:           { $in: loserIds },
              role:          { $in: User.MOVER_ROLES },
              isSuspended:   { $ne: true },
              smsOptOut:     { $ne: true },
              phoneVerified: true,
              phone:         { $exists: true, $nin: ['', null] },
            }).select('_id phone companyName').lean();

            console.log(
              `[Twilio SMS Inbound] CLAIM loser fan-out — broadcastTo=${broadcastTo.length} ` +
              `losers=${loserIds.length} eligible=${losers.length} lead=${claimedLead._id}`
            );

            // Fire-and-forget per-loser. We do NOT await any of these —
            // the winner TwiML must return immediately. Each send has its
            // own try/catch inside sendMoverLostClaimSMS.
            for (const loser of losers) {
              sendMoverLostClaimSMS(loser.phone).catch(e =>
                console.error(`[Twilio SMS Inbound] CLAIM loser SMS to ${loser._id} failed (non-fatal): ${e.message}`)
              );
            }
          }
        } catch (e) {
          console.error(`[Twilio SMS Inbound] CLAIM loser fan-out failed (non-fatal): ${e.message}`);
        }

        // Confirmation SMS — PII unlocked because the mover paid + owns the lead.
        // Compose first-name + last-initial from customerName; if customerName
        // is empty for any reason, fall back gracefully without throwing.
        const fullName = String(claimedLead.customerName || '').trim();
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] || '';
        const lastInitial = nameParts.length > 1 ? (nameParts[nameParts.length - 1][0] || '') : '';
        const customerLine = lastInitial ? `Customer: ${firstName} ${lastInitial}` : `Customer: ${firstName}`;
        const phoneLine = `Phone: ${claimedLead.customerPhone || 'n/a'}`;
        const head = `MoveLeads: lead claimed! $${price} debited.`;
        const dashLine = `View: moveleads.cloud/dashboard/customers`;

        // 160-char single-segment budget. Drop the dashboard line first if
        // over budget — PII stays non-negotiable. If still over, slice.
        let body = `${head}\n${customerLine}\n${phoneLine}\n${dashLine}`;
        if (body.length > 160) body = `${head}\n${customerLine}\n${phoneLine}`;
        if (body.length > 160) body = body.slice(0, 157) + '...';
        twiml.message(body);
        return res.type('text/xml').send(twiml.toString());
      }

      if (START_KEYWORDS.has(keyword)) {
        if (user) {
          await User.updateOne({ _id: user._id }, { $set: { smsOptOut: false } });
        }
        console.log(`[Twilio SMS Inbound] START keyword="${keyword}" userId=${userIdLog}`);
        twiml.message('You are resubscribed to MoveLeads alerts. Reply STOP to unsubscribe.');
        return res.type('text/xml').send(twiml.toString());
      }

      if (HELP_KEYWORDS.has(keyword)) {
        console.log(`[Twilio SMS Inbound] HELP keyword="${keyword}" userId=${userIdLog}`);
        twiml.message(
          `MoveLeads: lead alert notifications. Reply STOP to unsubscribe, START to resubscribe. Support: ${SUPPORT_NUMBER}`
        );
        return res.type('text/xml').send(twiml.toString());
      }

      // Unknown keyword — empty TwiML response (no auto-reply to reduce
      // bounce-spam cost; Twilio still records the inbound message).
      console.log(`[Twilio SMS Inbound] UNKNOWN keyword="${keyword}" userId=${userIdLog}`);
      return res.type('text/xml').send(twiml.toString());
    } catch (err) {
      console.error('[Twilio SMS Inbound] error:', err.message);
      // Still return empty TwiML — Twilio will retry on non-2xx and we
      // don't want to leak handler state.
      return res.type('text/xml').send(twiml.toString());
    }
  }
);

module.exports = router;
