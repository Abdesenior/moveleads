const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const User = require('../models/User');
const Lead = require('../models/Lead');
const PurchasedLead = require('../models/PurchasedLead');
const findEligibleMovers = require('../utils/findEligibleMovers');
const { deductLeadBalance } = require('../services/billingService');

const VoiceResponse = twilio.twiml.VoiceResponse;
const { validateRequest } = twilio;

// ── FIX 2: Twilio webhook signature validation ────────────────────────────────
// Validates every incoming webhook is genuinely from Twilio.
// Skipped when TWILIO_AUTH_TOKEN is absent (dev / mock mode).
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
 * 1. Customer Answers the Phone
 */
router.post('/customer-answered', twilioWebhook, (req, res) => {
  const { leadId } = req.query;
  const twiml = new VoiceResponse();

  const gather = twiml.gather({
    numDigits: 1,
    action: `/api/voice/customer-gather?leadId=${leadId}`,
  });

  gather.say(
    { voice: 'Polly.Matthew' },
    "Hi! Thank you for requesting a moving quote on Move Leads. Press 1 to be connected to our top-rated local mover right now."
  );

  twiml.say("We didn't receive any input. Goodbye!");
  res.type('text/xml').send(twiml.toString());
});

/**
 * 2. Customer Presses 1 → Find Movers & Dial Simultaneously
 */
router.post('/customer-gather', twilioWebhook, async (req, res) => {
  const { Digits } = req.body;
  const { leadId } = req.query;
  const twiml = new VoiceResponse();

  if (Digits === '1') {
    twiml.say({ voice: 'Polly.Matthew' }, "Please hold while we connect you.");

    try {
      const lead = await Lead.findById(leadId);
      if (!lead) {
        twiml.say("Sorry, we couldn't find your lead information.");
        return res.type('text/xml').send(twiml.toString());
      }

      const allEligible = await findEligibleMovers(lead.originZip, lead.destinationZip);

      const warmTransferMovers = allEligible
        .filter(m => m.balance >= 50 && m.receiveLiveTransfers === true)
        .slice(0, 3);

      if (warmTransferMovers.length === 0) {
        twiml.say("Sorry, all our movers are currently busy. They will call you shortly.");
        return res.type('text/xml').send(twiml.toString());
      }

      // Pass leadId to dial-complete so refund logic knows which lead to check
      const dial = twiml.dial({ action: `/api/voice/dial-complete?leadId=${leadId}` });

      warmTransferMovers.forEach(mover => {
        dial.number({
          url: `/api/voice/mover-whisper?moverId=${mover._id}&leadId=${leadId}`
        }, mover.phone);
      });

    } catch (err) {
      console.error('[Voice Routes] Gather Error:', err);
      twiml.say("An error occurred while finding movers.");
    }
  } else {
    twiml.say("Goodbye!");
  }

  res.type('text/xml').send(twiml.toString());
});

/**
 * 3. Mover Answers (The Whisper)
 */
router.post('/mover-whisper', twilioWebhook, (req, res) => {
  const { moverId, leadId } = req.query;
  const twiml = new VoiceResponse();

  const gather = twiml.gather({
    numDigits: 1,
    action: `/api/voice/mover-accept?moverId=${moverId}&leadId=${leadId}`,
  });

  gather.say("You have a live moving lead from Move Leads. Press 1 to accept and be charged 40 dollars.");

  res.type('text/xml').send(twiml.toString());
});

/**
 * 4. Mover Presses 1 — Charge & Connect
 *
 * FIX 1: Uses a single atomic findOneAndUpdate to claim the lead slot.
 * Two movers pressing 1 simultaneously can only result in ONE successful
 * claim — the second sees buyers.$size !== 0 and gets rejected instantly.
 * Charge only happens AFTER the atomic claim succeeds.
 */
router.post('/mover-accept', twilioWebhook, async (req, res) => {
  const { Digits } = req.body;
  const { moverId, leadId } = req.query;
  const twiml = new VoiceResponse();

  if (Digits === '1') {
    try {
      const leadPrice = 40;

      // Atomic claim — filter ensures buyers array is empty at write time.
      // If another mover already claimed (buyers.length > 0), this returns null.
      const lead = await Lead.findOneAndUpdate(
        { _id: leadId, buyers: { $size: 0 } },
        { $push: { buyers: { company: moverId, purchasedAt: new Date() } } },
        { returnDocument: 'after' }
      );

      if (!lead) {
        twiml.say('Sorry, another mover claimed this lead first.');
        twiml.hangup();
        return res.type('text/xml').send(twiml.toString());
      }

      // Charge only after successful atomic claim
      await deductLeadBalance(moverId, leadPrice, null, 'Live Warm Transfer');

      lead.status = 'Purchased';
      lead.isWarmTransfer = true;
      await lead.save();

      await new PurchasedLead({
        company: moverId,
        lead: lead._id,
        pricePaid: leadPrice,
        isLiveTransfer: true
      }).save();

      twiml.say('Connecting you now.');

    } catch (err) {
      console.error('[Voice Routes] Accept Error:', err);
      twiml.say('An error occurred.');
      twiml.hangup();
    }
  } else {
    twiml.hangup();
  }

  res.type('text/xml').send(twiml.toString());
});

/**
 * 5. Dial Complete — Refund if call dropped or lasted under 10 seconds
 *
 * FIX 4: If the mover was charged but the call failed or was < 10 s,
 * refund the $40 credit, remove them from buyers, and reset the lead.
 */
router.post('/dial-complete', twilioWebhook, async (req, res) => {
  const { DialCallStatus, DialCallDuration } = req.body;
  const { leadId } = req.query;

  if (leadId) {
    try {
      const lead = await Lead.findById(leadId);
      if (lead && lead.buyers.length > 0) {
        const moverId = lead.buyers[0].company;
        const duration = parseInt(DialCallDuration || '0', 10);
        const callFailed = DialCallStatus !== 'completed' || duration < 10;

        if (callFailed) {
          await User.findByIdAndUpdate(moverId, { $inc: { balance: 40 } });
          await Lead.findByIdAndUpdate(leadId, {
            $pull: { buyers: { company: moverId } },
            $set: { status: 'Available', isWarmTransfer: false }
          });
          await PurchasedLead.findOneAndDelete({
            lead: leadId,
            company: moverId,
            isLiveTransfer: true
          });
          console.log(`[Voice] Refunded mover ${moverId} — status=${DialCallStatus}, duration=${duration}s`);
        }
      }
    } catch (err) {
      console.error('[Voice] dial-complete error:', err.message);
    }
  }

  const twiml = new VoiceResponse();
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

module.exports = router;
