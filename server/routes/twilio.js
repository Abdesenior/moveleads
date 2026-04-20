const express = require('express');
const router  = express.Router();
const twilio  = require('twilio');

const VoiceResponse = twilio.twiml.VoiceResponse;

const API_BASE = 'https://api.moveleads.cloud';

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

module.exports = router;
