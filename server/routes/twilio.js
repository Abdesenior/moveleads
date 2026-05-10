const express = require('express');
const router  = express.Router();
const twilio  = require('twilio');
const User    = require('../models/User');

const VoiceResponse = twilio.twiml.VoiceResponse;
const MessagingResponse = twilio.twiml.MessagingResponse;
const { validateRequest } = twilio;

const API_BASE = 'https://api.moveleads.cloud';

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
  if (!valid) return res.status(403).send('Forbidden');
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
      let user = null;
      if (last10) {
        const candidates = await User
          .find({ phone: { $regex: last10 + '$' } })
          .select('_id phone isSuspended smsOptOut')
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
