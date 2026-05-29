/**
 * Twilio statusCallback URL builder — PR-5.
 *
 * Single source of truth for the SMS delivery-status webhook URL. The
 * `statusCallback` param Twilio expects on Messages API creates is
 * `${SERVER_URL}/api/twilio/sms/status`. We isolate the construction here
 * so:
 *
 *   - All four outbound senders (sendMoverLeadSMS, sendMoverLostClaimSMS,
 *     sendSpeedToLeadSMS, sendMoverSms) produce byte-identical URLs.
 *   - The SERVER_URL fallback ('https://moveleads.cloud') matches the
 *     existing inbound webhook signature reconstruction in
 *     routes/twilio.js's `twilioWebhook` middleware (`SERVER_URL` is the
 *     same env var, same fallback). Drift here is a 403-cascade.
 *   - Future changes to the path (e.g. a `/v2` revision) live in one place.
 *
 * The function returns `null` (NOT an empty string) when SERVER_URL is
 * absent AND we choose to not configure the callback — but the current
 * design always returns a value (the fallback). Callers that want to
 * opt out for dev environments can check `process.env.NODE_ENV === 'test'`
 * etc. before calling; we don't add that conditional here because the
 * `statusCallback` param is harmless when delivered to a 404'd URL —
 * Twilio just stops retrying after the standard backoff.
 */

const FALLBACK_HOST = 'https://moveleads.cloud';
const PATH = '/api/twilio/sms/status';

function getSmsStatusCallbackUrl() {
  const host = process.env.SERVER_URL || FALLBACK_HOST;
  return `${host.replace(/\/+$/, '')}${PATH}`;
}

module.exports = { getSmsStatusCallbackUrl };
