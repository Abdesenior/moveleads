/**
 * Boot-time production env validation.
 *
 * Called from server.js immediately after `require('dotenv').config()`,
 * before connectDB() and before any route is mounted. Single source of
 * truth for which env vars are non-optional in production.
 *
 * Behavior:
 *   - In production (NODE_ENV === 'production'):
 *     - Missing any var in REQUIRED_IN_PROD → console.error('[FATAL] …')
 *       and exit(1). Process MUST NOT continue to bind a port.
 *     - Missing any var in WARN_IN_PROD     → console.error('[WARN] …').
 *       Process continues; degraded mode is the operator's call.
 *   - In any non-production env (NODE_ENV unset, 'development', 'test'):
 *     - Logs a single '[dev]' line listing whatever is missing, then
 *       returns ok=true. Devs are not blocked by missing secrets.
 *
 * Empty / whitespace-only values are treated as missing — a blank env
 * var is almost always a misconfigured deploy, not an intentional empty.
 *
 * JWT_SECRET stays in REQUIRED_IN_PROD to preserve the existing
 * fail-fast behavior that server.js had before this validator was
 * extracted. The original H1 spec listed only TWILIO_AUTH_TOKEN /
 * STRIPE_WEBHOOK_SECRET / SERVER_URL — those are added; JWT_SECRET is
 * kept (additive, no regression).
 *
 * Testability: env, exit, and log are injected via the options bag so
 * unit tests can pass a mock env and a recording exit without touching
 * the real process. See server/__tests__/validateEnv.test.js.
 */

'use strict';

const REQUIRED_IN_PROD = [
  'TWILIO_AUTH_TOKEN',
  'STRIPE_WEBHOOK_SECRET',
  'SERVER_URL',
  'JWT_SECRET',
];

const WARN_IN_PROD = [
  'STRIPE_SECRET_KEY',
  'MONGODB_URI',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_PHONE_NUMBER',
  'RESEND_API_KEY',
];

function isMissing(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function validateEnv({ env = process.env, exit = process.exit, log = console.error } = {}) {
  const isProd = env.NODE_ENV === 'production';
  const missingRequired = REQUIRED_IN_PROD.filter(k => isMissing(env[k]));
  const missingOptional = WARN_IN_PROD.filter(k => isMissing(env[k]));

  if (isProd && missingRequired.length > 0) {
    log('[FATAL] Missing required production env vars: ' + missingRequired.join(', ') + '. Refusing to start.');
    exit(1);
    return { ok: false, missingRequired, missingOptional, isProd };
  }

  if (isProd && missingOptional.length > 0) {
    log('[WARN] Missing recommended production env vars: ' + missingOptional.join(', ') + '. Some features may degrade.');
  }

  if (!isProd && (missingRequired.length > 0 || missingOptional.length > 0)) {
    log('[dev] env vars not set: required=[' + missingRequired.join(',') + '] optional=[' + missingOptional.join(',') + ']');
  }

  return { ok: true, missingRequired, missingOptional, isProd };
}

module.exports = validateEnv;
module.exports.REQUIRED_IN_PROD = REQUIRED_IN_PROD;
module.exports.WARN_IN_PROD = WARN_IN_PROD;
