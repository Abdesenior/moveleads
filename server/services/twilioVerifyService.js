/**
 * Twilio Verify client wrapper — Phase 1 phone verification.
 *
 * Two thin pass-through helpers around Twilio's Verify v2 API. All security
 * concerns we'd otherwise own (code generation, hashing, expiry, attempt
 * counting, replay protection) are handled by Twilio's managed service.
 *
 * Env vars (set in production):
 *   TWILIO_ACCOUNT_SID   — existing, also used by SMS/Lookup
 *   TWILIO_AUTH_TOKEN    — existing
 *   TWILIO_VERIFY_SID    — new; the Verify Service SID (starts with VA...)
 *                          created in Twilio Console for "MoveLeads".
 *
 * Behavior when env is missing (dev / mock mode):
 *   - sendVerification / checkVerification return a SKIPPED result. Callers
 *     surface a 503-style error so the UI can show "Verification service
 *     temporarily unavailable" instead of a generic 500.
 *
 * Design notes:
 *   - This file deliberately does NOT touch the User model. The route layer
 *     owns DB writes; this service only talks to Twilio.
 *   - Errors from Twilio are normalized into a small result shape so the
 *     route layer doesn't have to know the Twilio error code taxonomy.
 *   - No retry / backoff. Twilio's own retry behavior is sufficient; the
 *     route's rate-limit middleware handles client-side retry storms.
 */

const twilio = require('twilio');

const accountSid    = process.env.TWILIO_ACCOUNT_SID;
const authToken     = process.env.TWILIO_AUTH_TOKEN;
const verifyService = process.env.TWILIO_VERIFY_SID;

// Lazy-init the client. Same pattern as services/twilioService.js so the
// app boots cleanly in dev without Twilio creds.
const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

function isVerifyConfigured() {
  return Boolean(twilioClient && verifyService);
}

/**
 * Create a fresh verification — Twilio generates a 6-digit code and sends
 * an SMS to the E.164 number provided.
 *
 * Returns one of:
 *   { ok: true,  status: 'pending' }    — SMS dispatched, awaiting check
 *   { ok: false, skipped: true,         — Twilio not configured (dev/mock)
 *                reason: 'verify_service_unavailable' }
 *   { ok: false, error: 'twilio_rate_limit' | 'invalid_phone' | 'unknown',
 *                twilioCode: number|null,
 *                message: string }
 *
 * @param {string} e164Phone  E.164 format, e.g. '+15551234567'
 */
async function sendVerification(e164Phone) {
  if (!isVerifyConfigured()) {
    return { ok: false, skipped: true, reason: 'verify_service_unavailable' };
  }
  try {
    const verification = await twilioClient.verify.v2
      .services(verifyService)
      .verifications.create({ to: e164Phone, channel: 'sms' });
    return { ok: true, status: verification.status };
  } catch (err) {
    return normalizeError(err);
  }
}

/**
 * Validate a 6-digit code the user typed. Twilio returns 'approved' on
 * success, 'pending' on incorrect code (with attempts remaining), or
 * 'canceled' once the verification has been exhausted / expired.
 *
 * Returns one of:
 *   { ok: true,  status: 'approved' }   — flip phoneVerified true in caller
 *   { ok: true,  status: 'pending'  }   — wrong code, retry possible
 *   { ok: true,  status: 'canceled' }   — expired or max attempts hit
 *   { ok: false, skipped: true, reason: 'verify_service_unavailable' }
 *   { ok: false, error: 'no_active_verification' | 'unknown',
 *                twilioCode, message }
 *
 * @param {string} e164Phone
 * @param {string} code        6-digit string the user typed
 */
async function checkVerification(e164Phone, code) {
  if (!isVerifyConfigured()) {
    return { ok: false, skipped: true, reason: 'verify_service_unavailable' };
  }
  try {
    const check = await twilioClient.verify.v2
      .services(verifyService)
      .verificationChecks.create({ to: e164Phone, code });
    return { ok: true, status: check.status };
  } catch (err) {
    // 404 from Twilio means there's no active verification for this `to`.
    // Treat it as a clean state so the route can respond
    // "please request a new code" without surfacing a 5xx.
    if (err && err.status === 404) {
      return { ok: false, error: 'no_active_verification', twilioCode: 404, message: err.message };
    }
    return normalizeError(err);
  }
}

/**
 * Map Twilio SDK errors into the small result shape the route layer expects.
 * Twilio error codes we care about specifically:
 *   - 20429: rate limit exceeded
 *   - 60200: invalid parameter (often malformed phone)
 *   - 60203: max send attempts reached for this phone
 *   - 60212: too many concurrent verifications for this phone
 * Everything else surfaces as `unknown` and gets a 502 from the route.
 */
function normalizeError(err) {
  const code = err?.code ?? err?.status ?? null;
  if (code === 20429 || code === 60203 || code === 60212) {
    return { ok: false, error: 'twilio_rate_limit', twilioCode: code, message: err.message };
  }
  if (code === 60200) {
    return { ok: false, error: 'invalid_phone', twilioCode: code, message: err.message };
  }
  return { ok: false, error: 'unknown', twilioCode: code, message: err?.message || 'Twilio Verify error' };
}

module.exports = {
  isVerifyConfigured,
  sendVerification,
  checkVerification,
};
