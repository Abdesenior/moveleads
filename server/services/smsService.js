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

  // Vonage SMS API wants the number WITHOUT the leading '+' (MSISDN format)
  const msisdn = e164.replace('+', '');
  const fromId = process.env.VONAGE_FROM_NUMBER || 'MoveLeads';

  console.log(`[SMS] Sending to ${msisdn} from "${fromId}"...`);

  try {
    const vonage = getVonage();
    const resp = await vonage.sms.send({
      to:   msisdn,
      from: fromId,
      text: message,
    });

    console.log('[SMS] Full Vonage response:', JSON.stringify(resp));

    const status = resp?.messages?.[0];
    if (status?.status === '0') {
      console.log(`[SMS] Sent to ${msisdn} — message-id: ${status['message-id']}`);
    } else {
      console.error(`[SMS] Vonage rejected message to ${msisdn} — status: ${status?.status} error: ${status?.['error-text']} (full: ${JSON.stringify(status)})`);
    }
  } catch (err) {
    console.error(`[SMS] Exception sending to ${msisdn}:`, err.message);
    console.error('[SMS] Full exception:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
  }
}

module.exports = { sendMoverLeadSMS };
