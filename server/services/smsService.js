const { Vonage } = require('@vonage/server-sdk');

let _vonage = null;
function getVonage() {
  if (!_vonage) {
    _vonage = new Vonage({
      apiKey:    process.env.VONAGE_API_KEY,
      apiSecret: process.env.VONAGE_API_SECRET,
    });
  }
  return _vonage;
}

/**
 * Send an SMS alert to a mover when a new verified lead matches their area.
 *
 * @param {string} toPhone - Mover phone number (any format; will be normalised to E.164)
 * @param {Object} lead    - Lead document fields
 */
async function sendMoverLeadSMS(toPhone, lead) {
  if (!process.env.VONAGE_API_KEY || !process.env.VONAGE_API_SECRET) {
    console.warn('[SMS] Vonage credentials not set — skipping SMS to', toPhone);
    return;
  }

  // Normalise to E.164 (US numbers: strip non-digits, prepend +1 if 10 digits)
  const digits = toPhone.replace(/\D/g, '');
  const e164 = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

  const moveDateStr = lead.moveDate
    ? new Date(lead.moveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'TBD';

  const message =
    `\uD83D\uDEA8 New MoveLeads Alert!\n` +
    `${lead.homeSize} | ${lead.originCity} \u2192 ${lead.destinationCity}\n` +
    `Move Date: ${moveDateStr}\n` +
    `Grade: ${lead.grade} | Price: $${lead.buyNowPrice}\n` +
    `Claim now: moveleads.cloud/login`;

  console.log(`[SMS] Sending to ${e164}...`);

  try {
    const vonage = getVonage();
    const resp = await vonage.sms.send({
      to:   e164,
      from: process.env.VONAGE_FROM_NUMBER || 'MoveLeads',
      text: message,
    });

    const status = resp?.messages?.[0];
    if (status?.status === '0') {
      console.log(`[SMS] Sent to ${e164} — message-id: ${status['message-id']}`);
    } else {
      console.warn(`[SMS] Vonage returned non-zero status for ${e164}:`, status?.['error-text'] || JSON.stringify(status));
    }
  } catch (err) {
    console.error(`[SMS] Failed to send to ${e164}:`, err.message);
  }
}

module.exports = { sendMoverLeadSMS };
