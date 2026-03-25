const twilio = require('twilio');
const Lead = require('../models/Lead');
const Communication = require('../models/Communication');
const PurchasedLead = require('../models/PurchasedLead'); 
const socketService = require('./socketService');
const { calculateLeadScore } = require('./scoringService');

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

      // FIX 5: calculate grade in mock mode so grade === 'A' warm-transfer
      // logic actually fires in development and staging environments.
      const mockScoring = calculateLeadScore(lead, lead.miles, 'mobile', lead.moveDate);
      lead.score = mockScoring.score;
      lead.grade = mockScoring.grade;
      lead.scoreFactors = mockScoring.scoreFactors;

      lead.isVerified = true;
      lead.status = 'READY_FOR_DISTRIBUTION';
      lead.statusHistory.push({ status: 'READY_FOR_DISTRIBUTION', timestamp: new Date() });
      await lead.save();
      console.log(`[Twilio] Mock verification SUCCESS for lead ${leadId} — Grade: ${mockScoring.grade} (score: ${mockScoring.score})`);
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

    if (lineType === 'mobile' || lineType === 'landline') {
      lead.isVerified = true;
      lead.status = 'READY_FOR_DISTRIBUTION';
      
      // Calculate score and grade once lineType is known
      const scoring = calculateLeadScore(lead, lead.miles, lineType, lead.moveDate);
      lead.score = scoring.score;
      lead.grade = scoring.grade;
      lead.scoreFactors = scoring.scoreFactors;

      // EXCLUSIVE ROUTING: If lead came from a specific company's widget
      if (lead.sourceCompany) {
        lead.status = 'Purchased';
        await new PurchasedLead({
          company: lead.sourceCompany,
          lead: lead._id,
          pricePaid: 0 // Widget leads are free/pre-paid in this model
        }).save();
        console.log(`[Twilio] Exclusive assignment to ${lead.sourceCompany}`);
      }

      console.log(`[Twilio] Verification PASSED (Type: ${lineType}) - Grade: ${scoring.grade}`);
      
      // TRIGGER WARM TRANSFER CALL FOR GRADE 'A' LEADS
      if (scoring.grade === 'A' && twilioClient) {
        const serverUrl = process.env.SERVER_URL || 'https://moveleads.cloud';
        console.log(`[Twilio Warm Transfer] Triggering call to ${lead.customerPhone} for lead ${lead._id}`);
        
        twilioClient.calls.create({
          to: lead.customerPhone,
          from: fromPhone,
          url: `${serverUrl}/api/voice/customer-answered?leadId=${lead._id}`
        }).catch(err => {
          console.error('[Twilio Warm Transfer Error] Failed to trigger call:', err.message);
        });
      }

      socketService.emitNewLead(lead);
    } else {
      // voip, toll_free, invalid, unknown → reject
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

module.exports = { verifyLeadPhone, sendSpeedToLeadSMS, verifyPhoneNumber, sendMoverSms };
