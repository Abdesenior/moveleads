const twilio = require('twilio');
const https  = require('https');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Communication = require('../models/Communication');
const PurchasedLead = require('../models/PurchasedLead');
const socketService = require('./socketService');
const { calculateLeadScore } = require('./scoringService');
const { calculateAuctionPrice } = require('../utils/pricingEngine');
const { sendAdminLeadNotification } = require('./emailService');
const { sendMoverLeadSMS } = require('./smsService');

// Twilio — used for SMS and warm-transfer calls only (not phone lookup)
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const fromPhone  = process.env.TWILIO_PHONE_NUMBER || '+15005550006';
const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

// Abstract API — used for phone number validation
const ABSTRACT_API_KEY = process.env.ABSTRACT_API_KEY;

const LOOKUP_TIMEOUT_MS = 5000;

/**
 * Broadcast SMS to all movers who have smsNotif enabled and a phone number on file.
 * Non-blocking — errors are logged but never propagate.
 */
async function broadcastLeadSMS(lead) {
  console.log('[SMS] Attempting to notify movers for lead:', lead._id);
  try {
    const movers = await User.find({
      role:     'mover',
      smsNotif: true,
      phone:    { $exists: true, $nin: ['', null] },
    }).select('phone companyName smsNotif').lean();

    console.log(`[SMS] Found ${movers.length} mover(s) with smsNotif=true and a phone number`);
    movers.forEach(m => console.log(`[SMS Debug] Mover: ${m.companyName} smsNotif: ${m.smsNotif} phone: ${m.phone}`));
    if (!movers.length) return;
    console.log(`[SMS] Broadcasting to: ${movers.map(m => m.companyName || m.phone).join(', ')}`);

    for (const mover of movers) {
      sendMoverLeadSMS(mover.phone, lead).catch(() => {});
    }
  } catch (err) {
    console.error('[SMS] broadcastLeadSMS error:', err.message);
  }
}

/**
 * Look up a phone number via Abstract Phone Validation API.
 * Returns { valid, lineType, isVoip, riskLevel } or throws on network error.
 */
async function abstractLookup(phone) {
  // Abstract expects E.164 without the leading +
  const digits = phone.replace(/\D/g, '');
  const url = `https://phoneintelligence.abstractapi.com/v1/?api_key=${ABSTRACT_API_KEY}&phone=${digits}`;

  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log(`[Abstract] Raw response for ${phone}:`, JSON.stringify(data));

          // Phone Intelligence response structure:
          //   data.phone_validation.is_valid  → boolean
          //   data.phone_carrier.line_type    → 'mobile', 'landline', 'voip', etc.
          //   data.phone_risk.risk_level      → 'low', 'medium', 'high'
          const lineType  = data.phone_carrier?.line_type || 'unknown';
          const riskLevel = data.phone_risk?.risk_level   || 'low';
          resolve({
            valid:     data.phone_validation?.is_valid === true,
            lineType,
            isVoip:    lineType.toLowerCase() === 'voip',
            riskLevel,
          });
        } catch (e) {
          reject(new Error(`Abstract API parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(LOOKUP_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('LOOKUP_TIMEOUT'));
    });
  });
}

/**
 * Verify a lead's phone number.
 * Priority: Abstract API (primary) → mock (dev/test fallback).
 * Twilio is kept only for SMS and warm-transfer calls.
 *
 * Pass/fail rules:
 *   PASS: phone_validation.is_valid === true AND line_type !== 'voip' AND risk_level !== 'high'
 *   FAIL: is_valid === false OR isVoip === true OR risk_level === 'high'
 */
async function verifyLeadPhone(leadId, { testMode = false } = {}) {
  let lead;
  try {
    lead = await Lead.findById(leadId);
    if (!lead) return;

    console.log(`[PhoneVerify] Starting for lead ${leadId} (${lead.customerPhone})`);

    const isDev = process.env.NODE_ENV === 'development';

    // ── Mock mode: dev environment or explicit test flag ──────────────────────
    if (!ABSTRACT_API_KEY || isDev || testMode) {
      console.log(`[PhoneVerify] MOCK mode (apiKey=${!!ABSTRACT_API_KEY} isDev=${isDev} testMode=${testMode})`);
      await new Promise(resolve => setTimeout(resolve, 500));

      const mockScoring = calculateLeadScore(lead, lead.miles, 'Mobile', lead.moveDate);
      lead.score        = mockScoring.score;
      lead.grade        = mockScoring.grade;
      lead.scoreFactors = mockScoring.scoreFactors;

      const mockPricing = await calculateAuctionPrice({ homeSize: lead.homeSize, miles: lead.miles, moveDate: lead.moveDate, grade: mockScoring.grade });
      lead.buyNowPrice      = mockPricing.buyNowPrice;
      lead.price            = mockPricing.buyNowPrice;
      lead.startingBidPrice = mockPricing.startingBidPrice;
      lead.currentBidPrice  = mockPricing.startingBidPrice;

      lead.isVerified = true;
      lead.status     = 'READY_FOR_DISTRIBUTION';
      lead.statusHistory.push({ status: 'READY_FOR_DISTRIBUTION', timestamp: new Date() });
      await lead.save();
      console.log(`[PhoneVerify] Mock PASS — Grade: ${mockScoring.grade}`);
      sendAdminLeadNotification({ leadId: lead._id, customerName: lead.customerName, customerPhone: lead.customerPhone, customerEmail: lead.customerEmail, originCity: lead.originCity, destinationCity: lead.destinationCity, originZip: lead.originZip, destinationZip: lead.destinationZip, homeSize: lead.homeSize, moveDate: lead.moveDate, distance: lead.distance, miles: lead.miles, grade: lead.grade, price: lead.buyNowPrice, createdAt: lead.createdAt }).catch(err => console.error('[AdminNotify] mock path error:', err.message));
      broadcastLeadSMS(lead);
      socketService.emitNewLead(lead);
      return;
    }

    // ── Abstract API verification ─────────────────────────────────────────────
    let result;
    try {
      result = await abstractLookup(lead.customerPhone);
    } catch (lookupErr) {
      if (lookupErr.message === 'LOOKUP_TIMEOUT') {
        console.warn(`[PhoneVerify] Abstract API timed out for lead ${leadId} — marking PENDING_MANUAL_REVIEW`);
      } else {
        console.error(`[PhoneVerify] Abstract API error for lead ${leadId}:`, lookupErr.message);
      }
      lead.status       = 'PENDING_MANUAL_REVIEW';
      lead.price        = 0;
      lead.buyNowPrice  = 0;
      lead.startingBidPrice = 0;
      lead.currentBidPrice  = 0;
      lead.auctionStatus    = 'expired';
      lead.statusHistory.push({ status: 'PENDING_MANUAL_REVIEW', timestamp: new Date() });
      await lead.save();
      return;
    }

    const { valid, lineType, isVoip, riskLevel } = result;
    console.log(`[PhoneVerify] Abstract result: valid=${valid} type=${lineType} isVoip=${isVoip} risk=${riskLevel}`);

    const passed = valid === true && !isVoip && riskLevel !== 'high';

    if (passed) {
      lead.isVerified = true;
      lead.status     = 'READY_FOR_DISTRIBUTION';

      // Map Abstract type to scoring-compatible string
      const normalizedType = lineType?.toLowerCase().includes('mobile') ? 'mobile'
                           : lineType?.toLowerCase().includes('land')   ? 'landline'
                           : 'mobile'; // default to mobile scoring if ambiguous

      const scoring     = calculateLeadScore(lead, lead.miles, normalizedType, lead.moveDate);
      lead.score        = scoring.score;
      lead.grade        = scoring.grade;
      lead.scoreFactors = scoring.scoreFactors;

      const finalPricing = await calculateAuctionPrice({ homeSize: lead.homeSize, miles: lead.miles, moveDate: lead.moveDate, grade: scoring.grade });
      lead.buyNowPrice      = finalPricing.buyNowPrice;
      lead.price            = finalPricing.buyNowPrice;
      lead.startingBidPrice = finalPricing.startingBidPrice;
      lead.currentBidPrice  = finalPricing.startingBidPrice;

      // Exclusive routing: widget-sourced lead goes straight to that company
      if (lead.sourceCompany) {
        lead.status = 'Purchased';
        await new PurchasedLead({
          company:   lead.sourceCompany,
          lead:      lead._id,
          pricePaid: 0
        }).save().catch(err => { if (err.code !== 11000) throw err; });
        console.log(`[PhoneVerify] Exclusive assignment to ${lead.sourceCompany}`);
      }

      console.log(`[PhoneVerify] PASS — Type: ${lineType} Grade: ${scoring.grade} Price: $${finalPricing.buyNowPrice}`);

      // Warm transfer for Grade A leads
      if (scoring.grade === 'A' && twilioClient) {
        console.log(`[WarmTransfer] Initiating call for lead ${lead._id} → ${lead.customerPhone}`);
        twilioClient.calls.create({
          to:                  lead.customerPhone,
          from:                fromPhone,
          url:                 `https://api.moveleads.cloud/api/voice/customer-answered?leadId=${lead._id}`,
          statusCallback:      'https://api.moveleads.cloud/api/twilio/voice/status',
          statusCallbackMethod: 'POST',
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        })
        .then(call => console.log(`[WarmTransfer] Call initiated: ${call.sid}`))
        .catch(err => console.error('[WarmTransfer] Call failed:', err.message));
      }

      sendAdminLeadNotification({ leadId: lead._id, customerName: lead.customerName, customerPhone: lead.customerPhone, customerEmail: lead.customerEmail, originCity: lead.originCity, destinationCity: lead.destinationCity, originZip: lead.originZip, destinationZip: lead.destinationZip, homeSize: lead.homeSize, moveDate: lead.moveDate, distance: lead.distance, miles: lead.miles, grade: lead.grade, price: lead.buyNowPrice, createdAt: lead.createdAt }).catch(err => console.error('[AdminNotify] real path error:', err.message));
      broadcastLeadSMS(lead);

      socketService.emitNewLead(lead);
    } else {
      // VOIP or invalid number — reject
      lead.isVerified       = false;
      lead.status           = 'REJECTED_FAKE';
      lead.price            = 0;
      lead.buyNowPrice      = 0;
      lead.startingBidPrice = 0;
      lead.currentBidPrice  = 0;
      lead.auctionStatus    = 'expired';
      console.log(`[PhoneVerify] FAIL — valid=${valid} type=${lineType} isVoip=${isVoip} risk=${riskLevel}`);
    }

    lead.statusHistory.push({ status: lead.status, timestamp: new Date() });
    await lead.save();

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

module.exports = { verifyLeadPhone, sendSpeedToLeadSMS, verifyPhoneNumber, sendMoverSms };
