/**
 * Meta Conversions API service — Commit 1: scaffold only.
 *
 * No outbound HTTP calls happen here yet. This file exists so:
 *   1. The ingest handler can import `extractRequestSignals(req)` to grab
 *      IP + User-Agent without duplicating header logic.
 *   2. Commits 2/3 land as a small focused diff that flips `sendLead` and
 *      `sendQualifiedLead` from no-op to live without restructuring callers.
 *
 * Env vars (set in server/.env, NEVER committed):
 *   META_PIXEL_ID              — public Pixel ID (same value as VITE_META_PIXEL_ID)
 *   META_CAPI_ACCESS_TOKEN     — secret token, BACKEND ONLY, never ships to client
 *   META_CAPI_TEST_EVENT_CODE  — optional; routes events to Events Manager → Test
 *                                Events tab during QA. Unset in production.
 *
 * Design notes for the live implementation (Commit 2):
 *   - PII (em, ph, fn, ln, ct, st, zp, country, external_id) MUST be SHA-256
 *     hex AFTER normalization: lowercase + trim + strip phone non-digits +
 *     add country code. Do NOT hash client_ip_address, client_user_agent,
 *     fbp, fbc — Meta requires those in plaintext.
 *   - The call is fire-and-forget from the ingest handler. Never await it
 *     before the customer-facing 200; Meta uptime must not gate UX.
 *   - Idempotency: caller is responsible for checking lead.metaCapiSentAt
 *     before calling sendLead, and setting it AFTER. The conditional
 *     updateOne in the caller closes the race.
 */

'use strict';

const crypto = require('node:crypto');

/**
 * Pull the request-signal fields the Lead doc needs for later CAPI dedup:
 * client IP and User-Agent. Trust-proxy is already enabled in server.js
 * (`app.set('trust proxy', 1)`), so req.ip returns the real client IP
 * behind Vercel / load balancer.
 *
 * Returns an object with only the fields that were present, so the caller
 * can spread it into the Lead doc without overwriting with `undefined`.
 *
 * @param {import('express').Request} req
 * @returns {{ ipAddress?: string, userAgent?: string }}
 */
function extractRequestSignals(req) {
  const out = {};
  if (req && typeof req.ip === 'string' && req.ip) {
    out.ipAddress = req.ip;
  }
  const ua = req && req.headers ? req.headers['user-agent'] : undefined;
  if (typeof ua === 'string' && ua) {
    out.userAgent = ua.slice(0, 1024); // bound storage
  }
  return out;
}

/**
 * Normalize + SHA-256 a PII value per Meta CAPI spec.
 * Empty/null input returns undefined so the caller omits the field
 * (Meta rejects empty-string PII).
 *
 * Used by Commit 2's payload builder. Exported now so the test harness
 * can verify the contract.
 *
 * @param {string|undefined|null} value
 * @returns {string|undefined} SHA-256 hex, or undefined
 */
function hashPii(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Normalize a phone number for hashing: digits only, with US country code
 * if 10 digits. Meta wants E.164 without the '+' before hashing.
 *
 * @param {string|undefined|null} phone
 * @returns {string|undefined}
 */
function normalizePhoneForHash(phone) {
  if (!phone) return undefined;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.length === 10) digits = '1' + digits;
  return digits;
}

/**
 * Fire the `Lead` event via Meta Conversions API.
 *
 * Commit 1: NO-OP. Logs intent only so we can verify capture by tailing
 * server logs without sending real events. Commit 2 replaces this with a
 * live POST to graph.facebook.com.
 *
 * Contract for callers (already in place — see leadIngestV2.js):
 *   - Call AFTER lead.save() succeeds
 *   - Do NOT await — fire and forget with .catch()
 *   - Check `lead.metaCapiSentAt` before calling; set it after
 *
 * @param {object} lead  Mongoose Lead doc (or lean object) with the tracking
 *                       fields populated (metaEventId, fbp, fbc, ipAddress,
 *                       userAgent, eventSourceUrl).
 * @param {object} [_options]  Reserved for Commit 2 (e.g. testEventCode override).
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendLead(lead, _options = {}) {
  if (!lead || !lead._id) {
    return { sent: false, reason: 'missing-lead' };
  }
  // Scaffold mode — no outbound call. Surfaced at INFO level so it's
  // grep-able during Commit 1 verification.
  console.log(
    `[metaCapi:scaffold] would send Lead event for lead=${lead._id} ` +
    `eventId=${lead.metaEventId || '<none>'} ` +
    `fbp=${lead.fbp ? 'present' : 'absent'} ` +
    `fbc=${lead.fbc ? 'present' : 'absent'} ` +
    `ip=${lead.ipAddress ? 'present' : 'absent'} ` +
    `ua=${lead.userAgent ? 'present' : 'absent'} ` +
    `url=${lead.eventSourceUrl ? 'present' : 'absent'}`
  );
  return { sent: false, reason: 'scaffold' };
}

/**
 * Fire the `QualifiedLead` event via Meta Conversions API.
 *
 * Commit 1: NO-OP. Wired into the scoring pipeline in a later commit when
 * `distributionDecision` flips to `system_approved` / `admin_approved`.
 *
 * @param {object} lead  Mongoose Lead doc.
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendQualifiedLead(lead) {
  if (!lead || !lead._id) {
    return { sent: false, reason: 'missing-lead' };
  }
  console.log(
    `[metaCapi:scaffold] would send QualifiedLead for lead=${lead._id}`
  );
  return { sent: false, reason: 'scaffold' };
}

module.exports = {
  extractRequestSignals,
  hashPii,
  normalizePhoneForHash,
  sendLead,
  sendQualifiedLead,
};
