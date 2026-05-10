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

  // Body kept ≤160 chars to fit a single GSM-7 SMS segment. Long lead routes
  // can push us close to the limit; we trim the route portion if needed.
  let body =
    `MoveLeads: ${lead.homeSize} | ${lead.originCity}→${lead.destinationCity}\n` +
    `${moveDateStr} | Grade ${lead.grade} | $${lead.buyNowPrice}\n` +
    `Claim: moveleads.cloud/login\nReply STOP to opt out`;
  if (body.length > 160) body = body.slice(0, 157) + '...';

  console.log(`[SMS] Sending to ${e164}…`);

  try {
    const result = await getClient().messages.create({
      to:   e164,
      from: process.env.TWILIO_PHONE_NUMBER,
      body,
    });
    console.log(`[SMS] Sent to ${e164} — SID: ${result.sid}`);
    // Returning a truthy value lets callers gate counter bumps on success.
    return { ok: true, sid: result.sid };
  } catch (err) {
    console.error(`[SMS] Failed to ${e164}:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendMoverLeadSMS };
