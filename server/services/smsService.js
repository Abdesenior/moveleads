const twilio = require('twilio');
const { getSmsStatusCallbackUrl } = require('../utils/twilioStatusCallback');

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
 * @param {string} toPhone     - Mover phone number (any format; normalised to E.164)
 * @param {Object} lead        - Lead document fields
 * @param {string|null} [claimToken=null] — PR-S5 / Phase 4. When non-null,
 *   the body uses "Reply SEND <token> to claim" in place of the generic
 *   dashboard-login CTA. Token-in-SMS is gated upstream by
 *   ENABLE_SMS_CLAIM_SCAFFOLD in twilioService.broadcastLeadSMS; this
 *   function is intentionally flag-agnostic — if a token is passed it
 *   gets rendered, full stop. Keeps the SMS layer simple and testable.
 */
async function sendMoverLeadSMS(toPhone, lead, claimToken = null) {
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

  // PR-S5: When a claimToken is present we swap the dashboard CTA for the
  // reply-to-claim instruction. Same 160-char single-segment budget.
  const claimLine = claimToken
    ? `Reply SEND ${claimToken} to claim`
    : `Claim: moveleads.cloud/login`;

  // Body kept ≤160 chars to fit a single GSM-7 SMS segment. Long lead routes
  // can push us close to the limit; we trim the route portion if needed.
  let body =
    `MoveLeads: ${lead.homeSize} | ${lead.originCity}→${lead.destinationCity}\n` +
    `${moveDateStr} | Grade ${lead.grade} | $${lead.buyNowPrice}\n` +
    `${claimLine}\nReply STOP to opt out`;
  if (body.length > 160) body = body.slice(0, 157) + '...';

  console.log(`[SMS] Sending to ${e164}…`);

  try {
    // PR-5: statusCallback wires the Twilio Messages lifecycle (queued →
    // sent → delivered / failed / undelivered) into POST /api/twilio/sms/status.
    // Pure observability — adding this param does NOT change the message
    // body, recipient, or send semantics.
    const result = await getClient().messages.create({
      to:   e164,
      from: process.env.TWILIO_PHONE_NUMBER,
      body,
      statusCallback: getSmsStatusCallbackUrl(),
    });
    console.log(`[SMS] Sent to ${e164} — SID: ${result.sid}`);
    // Returning a truthy value lets callers gate counter bumps on success.
    return { ok: true, sid: result.sid };
  } catch (err) {
    console.error(`[SMS] Failed to ${e164}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Send the "claimed by another mover" notification to losers of an SMS claim
 * race (PR-S6 / SMS Claim pipeline loser notification path).
 *
 * Fired by routes/twilio.js's CLAIM-branch winner path, AFTER the financial
 * atomic sequence has completed (debit + PurchasedLead mutex + Transaction
 * + lead.save + finalize('won')). The fan-out is fire-and-forget per loser
 * so the winner's TwiML reply never blocks on outbound Twilio API calls.
 *
 * Idempotency: this helper is invoked only inside the winner branch of the
 * inbound webhook, which is itself protected by the unique-sparse
 * twilioMessageSid index on ClaimAttempt (PR-S1). A Twilio retry of the
 * winner's SEND short-circuits at the duplicate-MessageSid check before the
 * winner code runs again, so loser notifications never re-fire.
 *
 * Body discipline:
 *   - Single GSM-7 segment (≤160 chars). The body below is 92 chars,
 *     comfortably under the cap with no per-lead truncation needed.
 *   - Includes a "Reply STOP" footer to match TCPA hygiene used by the
 *     outbound lead SMS dispatch.
 *   - NO PII (no customer name, no phone, no route) — losers did NOT pay
 *     and have no entitlement to contact information.
 *
 * @param {string} toPhone — Mover phone number (any format; normalised to E.164)
 * @returns {Promise<{ok: true, sid: string} | {ok: false, error: string} | void>}
 *   void when Twilio creds absent (dev/mock); same shape as sendMoverLeadSMS
 *   otherwise so callers can gate counter bumps / metrics on the result.
 */
async function sendMoverLostClaimSMS(toPhone) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('[SMS] Twilio credentials not set — skipping lost-claim SMS to', toPhone);
    return;
  }

  // Normalise to E.164 (US: strip non-digits, prepend +1 if 10 digits) — same
  // pattern as sendMoverLeadSMS. Duplicated by intent: SMS dispatch helpers
  // stay independently editable per PR-S3's no-shared-abstraction discipline.
  const digits = toPhone.replace(/\D/g, '');
  const e164 = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

  // Exact body: 92 chars on a single GSM-7 segment. The "No charge was made"
  // phrasing is operator-specified and intentional — it preempts mover
  // anxiety about being debited for a lead they did not win.
  const body =
    'MoveLeads: this lead was claimed by another mover. No charge was made.\n' +
    'Reply STOP to opt out';

  console.log(`[SMS] Sending lost-claim notice to ${e164}…`);

  try {
    // PR-5: statusCallback for lifecycle observability — see sendMoverLeadSMS.
    const result = await getClient().messages.create({
      to:   e164,
      from: process.env.TWILIO_PHONE_NUMBER,
      body,
      statusCallback: getSmsStatusCallbackUrl(),
    });
    console.log(`[SMS] Lost-claim sent to ${e164} — SID: ${result.sid}`);
    return { ok: true, sid: result.sid };
  } catch (err) {
    console.error(`[SMS] Lost-claim failed to ${e164}:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendMoverLeadSMS, sendMoverLostClaimSMS };
