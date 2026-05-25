/**
 * Meta Conversions API service.
 *
 * Server-side `Lead` event fires alongside the browser Pixel `Lead` event,
 * deduplicated by Meta on (event_name, event_id). Provides attribution
 * coverage when the browser side is blocked (ad-blockers, Safari ITP,
 * cookie purge).
 *
 * Env vars (server/.env, never committed):
 *   META_PIXEL_ID              — same value as the public VITE_META_PIXEL_ID
 *   META_CAPI_ACCESS_TOKEN     — secret token, BACKEND ONLY
 *   META_CAPI_TEST_EVENT_CODE  — optional; routes events to Events Manager →
 *                                Test Events tab during QA. Unset in production.
 *
 * Sending discipline:
 *   - Caller invokes as fire-and-forget (`.catch()`), never `await`s. Meta
 *     uptime must not gate the customer-facing 201.
 *   - Idempotency is enforced via a conditional Mongo updateOne on
 *     `metaCapiSentAt` BEFORE the HTTP call. If we don't win the race
 *     (matchedCount === 0), we skip the send entirely. This guarantees
 *     exactly-once attempt per Lead.
 *   - PII (em, ph, fn, ln, ct, st, zp, country, external_id) is SHA-256
 *     hex of the lowercased + trimmed value. fbp, fbc, client_ip_address,
 *     client_user_agent stay plaintext per Meta spec.
 *   - On missing PIXEL_ID/TOKEN, falls back to scaffold log (no crash).
 */

'use strict';

const crypto = require('node:crypto');

const GRAPH_API_VERSION = 'v19.0';

// Resolved lazily — env vars may be loaded after this module is required
// (in particular in test harnesses that set NODE_ENV / paths first).
function envPixelId()     { return (process.env.META_PIXEL_ID || '').trim(); }
function envAccessToken() { return (process.env.META_CAPI_ACCESS_TOKEN || '').trim(); }
function envTestCode()    { return (process.env.META_CAPI_TEST_EVENT_CODE || '').trim(); }

/**
 * Pull the request-signal fields the Lead doc needs for later CAPI dedup:
 * client IP and User-Agent. Trust-proxy is already enabled in server.js
 * (`app.set('trust proxy', 1)`), so req.ip returns the real client IP
 * behind Vercel / load balancer.
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
    out.userAgent = ua.slice(0, 1024);
  }
  return out;
}

/**
 * Normalize + SHA-256 a PII value per Meta CAPI spec.
 * Returns undefined for empty/null so the caller omits the field
 * (Meta rejects empty-string PII).
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
 */
function normalizePhoneForHash(phone) {
  if (!phone) return undefined;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.length === 10) digits = '1' + digits;
  return digits;
}

/**
 * Split a `customerName` into first/last for hashing. Meta wants them as
 * separate `fn` / `ln` keys. The V6 funnel collects firstName/lastName
 * separately but the validator collapses to `customerName` for storage —
 * we reverse the collapse here.
 */
function splitName(fullName) {
  if (!fullName) return { fn: undefined, ln: undefined };
  const parts = String(fullName).trim().split(/\s+/);
  return {
    fn: parts[0] || undefined,
    ln: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
  };
}

/**
 * Strip the `noemail+…@moveleads.cloud` placeholder so we don't hash a
 * synthetic value that won't match any real Meta-known user. Real emails
 * pass through untouched.
 */
function realOrUndefined(email) {
  if (!email) return undefined;
  if (String(email).startsWith('noemail+')) return undefined;
  return email;
}

/**
 * Build the CAPI `data` array entry for this Lead. Pure — no env reads,
 * no I/O. Exposed for testing.
 *
 * @param {object} lead     Lead doc (or lean object)
 * @param {object} [options] { eventName='Lead' }
 * @returns {object} Single event object suitable for inclusion in `data: [...]`
 */
function buildEventEntry(lead, options = {}) {
  const eventName = options.eventName || 'Lead';
  const { fn, ln } = splitName(lead.customerName);
  const phoneDigits = normalizePhoneForHash(lead.customerPhone);
  const email = realOrUndefined(lead.customerEmail);

  const user_data = {};
  if (email)       user_data.em = [hashPii(email)];
  if (phoneDigits) user_data.ph = [hashPii(phoneDigits)];
  if (fn)          user_data.fn = [hashPii(fn)];
  if (ln)          user_data.ln = [hashPii(ln)];
  if (lead.originCity)  user_data.ct = [hashPii(lead.originCity)];
  if (lead.originState) user_data.st = [hashPii(lead.originState)];
  if (lead.originZip)   user_data.zp = [hashPii(lead.originZip)];
  // External ID anchors the event to our DB record — Meta hashes its
  // own copy and uses it for additional match signals.
  user_data.external_id = [hashPii(String(lead._id))];

  // Plaintext fields per Meta spec.
  if (lead.fbp)        user_data.fbp = lead.fbp;
  if (lead.fbc)        user_data.fbc = lead.fbc;
  if (lead.ipAddress)  user_data.client_ip_address = lead.ipAddress;
  if (lead.userAgent)  user_data.client_user_agent = lead.userAgent;

  const entry = {
    event_name:    eventName,
    event_time:    Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data,
  };
  if (lead.metaEventId)    entry.event_id         = lead.metaEventId;
  if (lead.eventSourceUrl) entry.event_source_url = lead.eventSourceUrl;
  return entry;
}

/**
 * Internal HTTP send. Returns { ok, status, body } shape. Never throws —
 * network errors become { ok: false, status: 0, error }.
 *
 * Uses native Node fetch (Node 18+). The MoveLeads server runs Node 22+
 * on Render, so this is safe.
 */
async function postEvents(pixelId, token, event, testCode) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`;
  const body = { data: [event] };
  if (testCode) body.test_event_code = testCode;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => '');
    let parsed;
    try { parsed = JSON.parse(text); } catch (_e) { parsed = text; }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err) {
    return { ok: false, status: 0, error: err && err.message };
  }
}

/**
 * Fire the `Lead` event via Meta Conversions API.
 *
 * Contract for callers (already in place in leadIngestV2.js):
 *   - Call AFTER lead.save() succeeds
 *   - Do NOT await — fire and forget with .catch()
 *   - Caller passes the just-saved Mongoose doc (or any lean object with
 *     the same fields). We read fields directly off `lead`.
 *
 * Idempotency: BEFORE the HTTP call we conditional-update
 * `metaCapiSentAt`. The race-loser sees matchedCount=0 and skips.
 * This guarantees at-most-once delivery even if the caller fires
 * twice (e.g. ingest retry, admin re-trigger).
 *
 * Degraded modes (return without firing, log once):
 *   - missing META_PIXEL_ID or META_CAPI_ACCESS_TOKEN
 *   - missing lead._id
 *   - lead.metaCapiSentAt already set (lost the race)
 *
 * @param {object} lead     Lead doc with attribution fields populated
 * @param {object} [_req]   Express request (unused at this layer — IP/UA
 *                          live on the Lead doc by the time we're called)
 * @returns {Promise<{sent: boolean, status?: number, reason?: string}>}
 */
async function sendLead(lead, _req) {
  if (!lead || !lead._id) {
    return { sent: false, reason: 'missing-lead' };
  }

  const pixelId = envPixelId();
  const token   = envAccessToken();
  if (!pixelId || !token) {
    console.log(`[metaCapi:scaffold] would send Lead event for lead=${lead._id} (env not configured)`);
    return { sent: false, reason: 'env-missing' };
  }

  // Idempotency gate. Lazy-require Lead so the module load order is
  // tolerant of test harnesses that mount the router before connecting.
  const Lead = require('../models/Lead');
  const claim = await Lead.updateOne(
    { _id: lead._id, $or: [{ metaCapiSentAt: { $exists: false } }, { metaCapiSentAt: null }] },
    { $set: { metaCapiSentAt: new Date() } }
  ).catch(err => ({ matchedCount: 0, _err: err }));

  if (!claim || claim.matchedCount === 0) {
    return { sent: false, reason: 'already-sent' };
  }

  // Visible-in-logs heartbeat — same shape as Commit 1's scaffold line so
  // grep continues to work across the cutover. Augmented with the outcome
  // post-send below.
  console.log(
    `[metaCapi] sending Lead event for lead=${lead._id} ` +
    `eventId=${lead.metaEventId || '<none>'} ` +
    `fbp=${lead.fbp ? 'present' : 'absent'} ` +
    `fbc=${lead.fbc ? 'present' : 'absent'} ` +
    `ip=${lead.ipAddress ? 'present' : 'absent'} ` +
    `ua=${lead.userAgent ? 'present' : 'absent'} ` +
    `url=${lead.eventSourceUrl ? 'present' : 'absent'}`
  );

  const event = buildEventEntry(lead, { eventName: 'Lead' });
  const result = await postEvents(pixelId, token, event, envTestCode());

  if (result.ok) {
    console.log(`[metaCapi] Lead event accepted (HTTP ${result.status}) lead=${lead._id}`);
    return { sent: true, status: result.status };
  }

  // Roll back the claim so a future explicit re-fire (admin tooling)
  // can succeed. Network/transient failures shouldn't permanently mark
  // the Lead as "sent" when nothing actually landed.
  await Lead.updateOne({ _id: lead._id }, { $unset: { metaCapiSentAt: '' } })
    .catch(err => console.error('[metaCapi] failed to roll back sent marker:', err && err.message));
  console.error(
    `[metaCapi] Lead event FAILED (HTTP ${result.status}) lead=${lead._id} ` +
    `body=${typeof result.body === 'string' ? result.body.slice(0, 400) : JSON.stringify(result.body).slice(0, 400)}` +
    (result.error ? ` error=${result.error}` : '')
  );
  return { sent: false, status: result.status, reason: 'http-error' };
}

/**
 * Fire the `QualifiedLead` event via Meta Conversions API.
 *
 * Wired into the scoring pipeline in a later commit when
 * `distributionDecision` flips to `system_approved` / `admin_approved`.
 * Body included now so Commit 2 doesn't need to round-trip.
 *
 * @param {object} lead  Mongoose Lead doc.
 * @returns {Promise<{sent: boolean, status?: number, reason?: string}>}
 */
async function sendQualifiedLead(lead) {
  if (!lead || !lead._id) {
    return { sent: false, reason: 'missing-lead' };
  }
  const pixelId = envPixelId();
  const token   = envAccessToken();
  if (!pixelId || !token) {
    console.log(`[metaCapi:scaffold] would send QualifiedLead for lead=${lead._id} (env not configured)`);
    return { sent: false, reason: 'env-missing' };
  }

  const Lead = require('../models/Lead');
  const claim = await Lead.updateOne(
    { _id: lead._id, $or: [{ metaQualifiedSentAt: { $exists: false } }, { metaQualifiedSentAt: null }] },
    { $set: { metaQualifiedSentAt: new Date() } }
  ).catch(err => ({ matchedCount: 0, _err: err }));
  if (!claim || claim.matchedCount === 0) {
    return { sent: false, reason: 'already-sent' };
  }

  console.log(`[metaCapi] sending QualifiedLead for lead=${lead._id}`);
  const event = buildEventEntry(lead, { eventName: 'QualifiedLead' });
  const result = await postEvents(pixelId, token, event, envTestCode());

  if (result.ok) {
    console.log(`[metaCapi] QualifiedLead accepted (HTTP ${result.status}) lead=${lead._id}`);
    return { sent: true, status: result.status };
  }
  await Lead.updateOne({ _id: lead._id }, { $unset: { metaQualifiedSentAt: '' } })
    .catch(() => { /* best effort */ });
  console.error(
    `[metaCapi] QualifiedLead FAILED (HTTP ${result.status}) lead=${lead._id} ` +
    (result.error ? `error=${result.error}` : `body=${JSON.stringify(result.body).slice(0, 400)}`)
  );
  return { sent: false, status: result.status, reason: 'http-error' };
}

module.exports = {
  extractRequestSignals,
  hashPii,
  normalizePhoneForHash,
  splitName,
  buildEventEntry,
  sendLead,
  sendQualifiedLead,
  // exported for unit-test injection only (do not call from production code)
  _internal: { postEvents, GRAPH_API_VERSION },
};
