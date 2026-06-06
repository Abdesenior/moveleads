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
 * Safe-to-log prefix of a Twilio SID. SIDs are not secrets (they're
 * routinely visible in Twilio console URLs + dashboards) but we keep
 * log output tight: first 6 chars + last 4 + middle masked.
 *
 *   <example-account-sid>  →  <masked-sid>
 *
 * Used by:
 *   - startup config dump (logVerifyConfigOnce)
 *   - per-attempt diagnostic logs in routes/phoneVerification.js
 */
function _maskSid(sid) {
  if (!sid || typeof sid !== 'string' || sid.length < 12) return '<missing>';
  return `${sid.slice(0, 6)}…${sid.slice(-4)}`;
}

/**
 * Verify config snapshot for diagnostics. Returns ONLY non-secret
 * identifiers: SID prefixes, account-mode hint, and whether the service
 * is wired. The actual auth token is never returned.
 *
 * Account-mode detection (trial vs production) requires an extra REST
 * call to /Accounts/{sid}, which we don't fire on every request. Callers
 * can use describeVerifyConfig() once at startup to surface it.
 */
function describeVerifyConfig() {
  return {
    configured: isVerifyConfigured(),
    accountSidPrefix: _maskSid(accountSid),
    verifySidPrefix:  _maskSid(verifyService),
    sameAccountFamily: Boolean(accountSid && verifyService),
    // We can't infer trial/production from local env alone — the SID
    // format doesn't differ. Operator must check Twilio console.
  };
}

/**
 * One-shot startup log so the operator can confirm at deploy time that the
 * server picked up the right credentials. Logs only prefixes — no auth
 * token, no full SIDs.
 *
 * Idempotent: safe to call multiple times; only the first call logs.
 */
let _startupLogged = false;
function logVerifyConfigOnce() {
  if (_startupLogged) return;
  _startupLogged = true;
  const cfg = describeVerifyConfig();
  if (!cfg.configured) {
    console.warn(`[twilioVerify] NOT CONFIGURED — accountSid=${cfg.accountSidPrefix} verifySid=${cfg.verifySidPrefix}. /api/users/me/phone/* routes will 503.`);
    return;
  }
  console.log(`[twilioVerify] configured — accountSid=${cfg.accountSidPrefix} verifySid=${cfg.verifySidPrefix}`);
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
 *
 * Codes we care about specifically:
 *   20429 / 60203 / 60212 → twilio_rate_limit (per-phone / per-account rate)
 *   60200                 → invalid_phone (malformed number)
 *   60238                 → verification_blocked_by_twilio (Fraud Guard at
 *                           the service level, geo-permission gap, or
 *                           Twilio's internal block heuristics)
 *   60410 / 60411         → verification_blocked_by_twilio (carrier-level
 *                           blocks, similar operator action required)
 *   60223                 → verification_blocked_by_twilio (delivery
 *                           channel disabled for the destination)
 *   20003 / 20404         → verify_auth_error (wrong VERIFY_SID for this
 *                           account, or auth token invalid)
 *
 * Everything else surfaces as `unknown` and the route returns 502.
 * Both ways the original twilioCode + message round-trip back so the
 * route can log the diagnostic detail without us having to know every
 * Twilio code in advance.
 */
function normalizeError(err) {
  const code = err?.code ?? err?.status ?? null;
  // Defensive default — only used as a final fallback. Route handlers
  // already map error codes to mover-facing strings; this just ensures
  // no vendor name leaks if a logger or future surface prints it.
  const message = err?.message || 'Verification error';

  if (code === 20429 || code === 60203 || code === 60212) {
    return { ok: false, error: 'twilio_rate_limit', twilioCode: code, message };
  }
  if (code === 60200) {
    return { ok: false, error: 'invalid_phone', twilioCode: code, message };
  }
  if (code === 60238 || code === 60410 || code === 60411 || code === 60223) {
    return { ok: false, error: 'verification_blocked_by_twilio', twilioCode: code, message };
  }
  if (code === 20003 || code === 20404) {
    return { ok: false, error: 'verify_auth_error', twilioCode: code, message };
  }
  return { ok: false, error: 'unknown', twilioCode: code, message };
}

module.exports = {
  isVerifyConfigured,
  sendVerification,
  checkVerification,
  describeVerifyConfig,
  logVerifyConfigOnce,
};
