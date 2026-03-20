const twilio = require('twilio');
const Lead = require('../models/Lead');
const Communication = require('../models/Communication');
const socketService = require('./socketService');

// Singleton Twilio client — instantiated once at module load, not per call.
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER || '+15005550006';

const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

const LOOKUP_TIMEOUT_MS = 3000;

/**
 * Verify a lead's phone number using Twilio Lookup API.
 * Runs in the background (non-blocking) and updates the lead status.
 * Times out after 3 s — marks lead PENDING_MANUAL_REVIEW on timeout/error.
 *
 * @param {string} leadId
 */
async function verifyLeadPhone(leadId) {
  try {
    const lead = await Lead.findById(leadId);
    if (!lead) return;

    console.log(`[Twilio] Starting verification for lead ${leadId} (${lead.customerPhone})`);

    // Mock mode — no credentials configured
    if (!twilioClient) {
      console.warn('[Twilio] Missing credentials. Running in MOCK mode.');
      await new Promise(resolve => setTimeout(resolve, 2000));
      lead.isVerified = true;
      lead.status = 'READY_FOR_DISTRIBUTION';
      lead.statusHistory.push({ status: 'READY_FOR_DISTRIBUTION', timestamp: new Date() });
      await lead.save();
      console.log(`[Twilio] Mock verification SUCCESS for lead ${leadId}`);
      socketService.emitNewLead(lead);
      return;
    }

    // Race the Lookup call against a 3-second timeout.
    const lookupPromise = twilioClient.lookups.v2
      .phoneNumbers(lead.customerPhone)
      .fetch({ fields: 'line_type_intelligence' });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('LOOKUP_TIMEOUT')), LOOKUP_TIMEOUT_MS)
    );

    let lookup;
    try {
      lookup = await Promise.race([lookupPromise, timeoutPromise]);
    } catch (raceErr) {
      if (raceErr.message === 'LOOKUP_TIMEOUT') {
        console.warn(`[Twilio] Lookup timed out for lead ${leadId}. Marking PENDING_MANUAL_REVIEW.`);
        lead.status = 'PENDING_MANUAL_REVIEW';
        lead.statusHistory.push({ status: 'PENDING_MANUAL_REVIEW', timestamp: new Date() });
        await lead.save();
        return;
      }
      throw raceErr; // re-throw non-timeout errors to outer catch
    }

    const lineType = lookup.lineTypeIntelligence?.type;
    console.log(`[Twilio] Lookup result for ${lead.customerPhone}: type=${lineType}`);

    if (lineType === 'mobile' || lineType === 'landline' || lineType === 'voip') {
      lead.isVerified = true;
      lead.status = 'READY_FOR_DISTRIBUTION';
      console.log(`[Twilio] Verification PASSED (Type: ${lineType})`);
      socketService.emitNewLead(lead);
    } else {
      lead.isVerified = false;
      lead.status = 'REJECTED_FAKE';
      console.log(`[Twilio] Verification FAILED (Type: ${lineType || 'unknown'})`);
    }

    lead.statusHistory.push({ status: lead.status, timestamp: new Date() });
    await lead.save();

  } catch (err) {
    console.error(`[Twilio] Critical error verifying lead ${leadId}:`, err.message);
    try {
      const lead = await Lead.findById(leadId);
      if (lead) {
        lead.status = 'PENDING_MANUAL_REVIEW';
        lead.statusHistory.push({ status: 'PENDING_MANUAL_REVIEW', timestamp: new Date() });
        await lead.save();
      }
    } catch (saveErr) {
      console.error('[Twilio] Failed to save error status:', saveErr.message);
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

module.exports = { verifyLeadPhone, sendSpeedToLeadSMS };
