const twilio = require('twilio');

let _client = null;
function getClient() {
  if (!_client) {
    _client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return _client;
}

/**
 * Send an SMS alert to a mover when a new verified lead matches their area.
 *
 * @param {string} toPhone - Mover phone number (any format; normalised to E.164)
 * @param {Object} lead    - Lead document fields
 */
async function sendMoverLeadSMS(toPhone, lead) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('[SMS] Twilio credentials not set — skipping SMS to', toPhone);
    return;
  }

  // Normalise to E.164 (US: strip non-digits, prepend +1 if 10 digits)
  const digits = toPhone.replace(/\D/g, '');
  const e164 = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

  const moveDateStr = lead.moveDate
    ? new Date(lead.moveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'TBD';

  const body =
    `🚨 New MoveLeads Alert!\n` +
    `${lead.homeSize} | ${lead.originCity} → ${lead.destinationCity}\n` +
    `Move Date: ${moveDateStr}\n` +
    `Grade: ${lead.grade} | Price: $${lead.buyNowPrice}\n` +
    `Claim now: moveleads.cloud/login`;

  console.log(`[SMS] Sending to ${e164}…`);

  try {
    const result = await getClient().messages.create({
      to:   e164,
      from: process.env.TWILIO_PHONE_NUMBER,
      body,
    });
    console.log(`[SMS] Sent to ${e164} — SID: ${result.sid}`);
  } catch (err) {
    console.error(`[SMS] Failed to ${e164}:`, err.message);
  }
}

module.exports = { sendMoverLeadSMS };
