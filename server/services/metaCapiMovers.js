/**
 * Meta Conversions API — MOVER funnel only.
 *
 * Self-contained so the homeowner CAPI (services/metaCapi.js) is untouched.
 * Reuses ONLY the pure helpers exported by metaCapi.js (hashPii,
 * normalizePhoneForHash, extractRequestSignals); ships its own small poster.
 *
 * Env (server/.env, never committed):
 *   META_MOVER_PIXEL_ID            — CAPI target (= public VITE_META_MOVER_PIXEL_ID)
 *   META_MOVER_CAPI_ACCESS_TOKEN   — secret token, BACKEND ONLY
 *   META_MOVER_CAPI_TEST_EVENT_CODE— optional QA routing to Test Events
 *
 * Discipline: fire-and-forget (.catch), never awaited; idempotent via a
 * conditional updateOne on a per-event User guard BEFORE the HTTP call
 * (mirrors metaCapi.sendLead); degraded no-op when env is missing.
 */
'use strict';

const { hashPii, normalizePhoneForHash, extractRequestSignals } = require('./metaCapi');

const GRAPH_API_VERSION = 'v19.0';

function envPixelId()  { return (process.env.META_MOVER_PIXEL_ID || '').trim(); }
function envToken()    { return (process.env.META_MOVER_CAPI_ACCESS_TOKEN || '').trim(); }
function envTestCode() { return (process.env.META_MOVER_CAPI_TEST_EVENT_CODE || '').trim(); }

function realOrUndefined(email) {
  if (!email) return undefined;
  if (String(email).startsWith('noemail+')) return undefined;
  return email;
}

function buildUserData(user, req) {
  const ud = {};
  const email = realOrUndefined(user.email);
  const phone = normalizePhoneForHash(user.phone);
  if (email) ud.em = [hashPii(email)];
  if (phone) ud.ph = [hashPii(phone)];
  ud.external_id = [hashPii(String(user._id))];
  const sig = extractRequestSignals(req);
  if (sig.ipAddress) ud.client_ip_address = sig.ipAddress;
  if (sig.userAgent) ud.client_user_agent = sig.userAgent;
  return ud;
}

function buildEvent({ eventName, eventId, user, req, customData }) {
  const entry = {
    event_name:    eventName,
    event_time:    Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data:     buildUserData(user, req),
  };
  if (eventId)    entry.event_id    = eventId;
  if (customData) entry.custom_data = customData;
  return entry;
}

async function postEvents(pixelId, token, event, testCode) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`;
  const body = { data: [event] };
  if (testCode) body.test_event_code = testCode;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => '');
    let parsed; try { parsed = JSON.parse(text); } catch (_e) { parsed = text; }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err) {
    return { ok: false, status: 0, error: err && err.message };
  }
}

// Env-checked post with NO idempotency guard. Used by Purchase, whose
// idempotency is upstream: applyOnboardingActivationCredit reaches applied:true
// once per PaymentIntent (Transaction unique index), and Meta dedups on
// event_id = the PaymentIntent id.
async function postIfConfigured({ user, eventName, eventId, req, customData }) {
  if (!user || !user._id) return { sent: false, reason: 'missing-user' };
  const pixelId = envPixelId();
  const token   = envToken();
  if (!pixelId || !token) {
    console.log(`[metaCapiMovers:scaffold] would send ${eventName} for user=${user._id} (env not configured)`);
    return { sent: false, reason: 'env-missing' };
  }
  const event  = buildEvent({ eventName, eventId, user, req, customData });
  const result = await postEvents(pixelId, token, event, envTestCode());
  if (result.ok) {
    console.log(`[metaCapiMovers] ${eventName} accepted (HTTP ${result.status}) user=${user._id}`);
    return { sent: true, status: result.status };
  }
  console.error(
    `[metaCapiMovers] ${eventName} FAILED (HTTP ${result.status}) user=${user._id}` +
    (result.error ? ` error=${result.error}` : '')
  );
  return { sent: false, status: result.status, reason: 'http-error' };
}

// CompleteRegistration: single-fire per user via a conditional updateOne BEFORE
// the HTTP call (verify-email can in theory be re-triggered). Rolls back on HTTP
// failure so an explicit re-fire can retry. Mirrors metaCapi.sendLead.
async function sendCompleteRegistration(user, { eventId, req } = {}) {
  if (!user || !user._id) return { sent: false, reason: 'missing-user' };
  const pixelId = envPixelId();
  const token   = envToken();
  if (!pixelId || !token) {
    console.log(`[metaCapiMovers:scaffold] would send CompleteRegistration for user=${user._id} (env not configured)`);
    return { sent: false, reason: 'env-missing' };
  }
  const User = require('../models/User'); // lazy — tolerant of no-Mongo test harnesses
  const claim = await User.updateOne(
    { _id: user._id, $or: [
      { metaMoverCompleteRegistrationSentAt: { $exists: false } },
      { metaMoverCompleteRegistrationSentAt: null },
    ] },
    { $set: { metaMoverCompleteRegistrationSentAt: new Date() } }
  ).catch(err => ({ matchedCount: 0, _err: err }));
  if (!claim || claim.matchedCount === 0) return { sent: false, reason: 'already-sent' };

  const event  = buildEvent({ eventName: 'CompleteRegistration', eventId, user, req });
  const result = await postEvents(pixelId, token, event, envTestCode());
  if (result.ok) {
    console.log(`[metaCapiMovers] CompleteRegistration accepted (HTTP ${result.status}) user=${user._id}`);
    return { sent: true, status: result.status };
  }
  await User.updateOne({ _id: user._id }, { $unset: { metaMoverCompleteRegistrationSentAt: '' } }).catch(() => {});
  console.error(
    `[metaCapiMovers] CompleteRegistration FAILED (HTTP ${result.status}) user=${user._id}` +
    (result.error ? ` error=${result.error}` : '')
  );
  return { sent: false, status: result.status, reason: 'http-error' };
}

// Purchase: NO per-user guard. Idempotency key = the Stripe PaymentIntent id.
async function sendActivationPurchase(user, { eventId, value, req } = {}) {
  return postIfConfigured({
    user, eventName: 'Purchase', eventId, req,
    customData: { currency: 'USD', value: Number(value) || 0 },
  });
}

module.exports = {
  buildUserData,
  buildEvent,
  sendCompleteRegistration,
  sendActivationPurchase,
  _internal: { postEvents, GRAPH_API_VERSION },
};
