/**
 * Twilio SMS statusCallback + status route — PR-5 lock-in suite.
 *
 * Closes HIGH-CONFIDENCE-FIX-PLAN F7. Before PR-5 the only signal we had
 * on outbound SMS was the resolve of `messages.create()` — which only
 * confirms Twilio queued the message, NOT that the device received it.
 * Failed / undelivered SMS appeared as successful sends in our logs and
 * disappeared into the void.
 *
 * This PR:
 *   - Adds `statusCallback` to all four outbound messages.create sites
 *     (sendMoverLeadSMS, sendMoverLostClaimSMS, sendSpeedToLeadSMS,
 *     sendMoverSms). The URL is built by one helper —
 *     utils/twilioStatusCallback.js — so the four sites cannot drift.
 *   - Adds POST /api/twilio/sms/status. Twilio-signature-gated (reuses
 *     the existing twilioWebhook middleware). Upserts by MessageSid into
 *     a new SmsDeliveryStatus model.
 *   - Persists the lifecycle (queued → sending → sent → delivered, or
 *     queued → sent → undelivered, or queued → failed) keyed by
 *     MessageSid so the admin can answer "did mover X actually receive
 *     that lead alert?"
 *
 * This suite pins:
 *
 *   A. URL helper — single source of truth, uses SERVER_URL env with
 *      the same fallback as routes/twilio.js's twilioWebhook reconstruction,
 *      trims trailing slashes, returns the /api/twilio/sms/status path.
 *   B. All four outbound messages.create sites pass `statusCallback:
 *      getSmsStatusCallbackUrl()`. The four sites import the helper from
 *      utils/twilioStatusCallback (no duplicated inline URL).
 *   C. SmsDeliveryStatus model — required messageSid (string, trimmed),
 *      messageStatus (string), errorCode (number — Twilio sends it as a
 *      string, our route parses to int), errorMessage (string, bounded),
 *      toPhone / fromPhone (string), rawPayload (Mixed),
 *      receivedAt / updatedAt (Date, default Date.now, required).
 *      Unique-index on messageSid for upsert idempotency.
 *      90-day TTL on receivedAt.
 *      Index on { messageStatus, receivedAt: -1 } for admin filtering.
 *   D. Route — POST /sms/status mounted, express.urlencoded body parser
 *      attached, twilioWebhook signature middleware attached BEFORE the
 *      handler (so unsigned hits get 403'd before any DB work).
 *   E. Route handler — extracts MessageSid (with SmsSid fallback for
 *      legacy Twilio shape), MessageStatus, ErrorCode (parsed to number,
 *      undefined on parse failure), ErrorMessage / To / From.
 *      Missing MessageSid returns 204 (NOT a retry-triggering 500 —
 *      Twilio would retry an unrecoverable payload forever).
 *   F. Route upserts by messageSid — uses { upsert: true } with $set for
 *      mutable fields and $setOnInsert for receivedAt + messageSid (so a
 *      retry of the same SID updates updatedAt + status but PRESERVES
 *      the first-seen receivedAt timestamp).
 *   G. Persistence error path returns 500 so Twilio retries (transient
 *      Mongo failure is exactly the case where retries help). Validation
 *      errors return 204.
 *   H. Scope discipline — NO changes to:
 *        - inbound /sms/inbound route (PR-S6 claim atomic path)
 *        - PR-S3 atomic CAS at routes/twilio.js inbound CLAIM branch
 *        - candidate selection, matcher, dispatchPolicy
 *        - SMS Claim opt-in / scaffold / live flags
 *        - balance / Transaction / PurchasedLead
 *        - retry / claim logic anywhere
 *        - no new env flag (PR-5 ships always-on)
 *
 * Pure-Node, no Mongo. Source-level + behavioral assertions (the URL
 * helper is a pure function and is tested behaviorally with env stubs).
 *
 * Run: `node server/__tests__/twilioSmsStatusCallback.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot      = path.join(__dirname, '..');
const helperPath      = path.join(serverRoot, 'utils',    'twilioStatusCallback.js');
const modelPath       = path.join(serverRoot, 'models',   'SmsDeliveryStatus.js');
const smsServicePath  = path.join(serverRoot, 'services', 'smsService.js');
const twilioSvcPath   = path.join(serverRoot, 'services', 'twilioService.js');
const twilioRoutePath = path.join(serverRoot, 'routes',   'twilio.js');

const helperSrc      = fs.readFileSync(helperPath,      'utf8');
const modelSrc       = fs.readFileSync(modelPath,       'utf8');
const smsServiceSrc  = fs.readFileSync(smsServicePath,  'utf8');
const twilioSvcSrc   = fs.readFileSync(twilioSvcPath,   'utf8');
const twilioRouteSrc = fs.readFileSync(twilioRoutePath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const helperExec      = stripComments(helperSrc);
const modelExec       = stripComments(modelSrc);
const smsServiceExec  = stripComments(smsServiceSrc);
const twilioSvcExec   = stripComments(twilioSvcSrc);
const twilioRouteExec = stripComments(twilioRouteSrc);

// ── A. URL helper ──────────────────────────────────────────────────────

test('A1. utils/twilioStatusCallback exports getSmsStatusCallbackUrl', () => {
  const mod = require('../utils/twilioStatusCallback');
  assert.equal(typeof mod.getSmsStatusCallbackUrl, 'function',
    'getSmsStatusCallbackUrl must be exported as a function');
});

test('A2. Helper returns the SERVER_URL host with /api/twilio/sms/status path', () => {
  const { getSmsStatusCallbackUrl } = require('../utils/twilioStatusCallback');
  const original = process.env.SERVER_URL;
  try {
    process.env.SERVER_URL = 'https://api.moveleads.cloud';
    assert.equal(getSmsStatusCallbackUrl(), 'https://api.moveleads.cloud/api/twilio/sms/status');
  } finally {
    if (original === undefined) delete process.env.SERVER_URL;
    else process.env.SERVER_URL = original;
  }
});

test('A3. Helper trims trailing slashes off SERVER_URL', () => {
  // Defensive — if an operator sets SERVER_URL=https://...com/ the URL
  // construction must not produce a double-slash. Twilio rejects malformed
  // callback URLs.
  const { getSmsStatusCallbackUrl } = require('../utils/twilioStatusCallback');
  const original = process.env.SERVER_URL;
  try {
    process.env.SERVER_URL = 'https://api.moveleads.cloud/';
    assert.equal(getSmsStatusCallbackUrl(), 'https://api.moveleads.cloud/api/twilio/sms/status');
    process.env.SERVER_URL = 'https://api.moveleads.cloud////';
    assert.equal(getSmsStatusCallbackUrl(), 'https://api.moveleads.cloud/api/twilio/sms/status');
  } finally {
    if (original === undefined) delete process.env.SERVER_URL;
    else process.env.SERVER_URL = original;
  }
});

test('A4. Helper falls back to https://moveleads.cloud when SERVER_URL is unset', () => {
  // The fallback must match the existing twilioWebhook reconstruction
  // fallback in routes/twilio.js, or signature validation breaks.
  const { getSmsStatusCallbackUrl } = require('../utils/twilioStatusCallback');
  const original = process.env.SERVER_URL;
  try {
    delete process.env.SERVER_URL;
    assert.equal(getSmsStatusCallbackUrl(), 'https://moveleads.cloud/api/twilio/sms/status');
  } finally {
    if (original !== undefined) process.env.SERVER_URL = original;
  }
});

test('A5. Helper fallback matches routes/twilio.js twilioWebhook fallback (parity)', () => {
  // Pin the parity. If a future contributor changes either fallback, the
  // other breaks (signature mismatch → 403 → Twilio retries forever).
  assert.match(
    twilioRouteSrc,
    /process\.env\.SERVER_URL\s*\|\|\s*['"]https:\/\/moveleads\.cloud['"]/,
    'twilioWebhook must keep fallback "https://moveleads.cloud" for parity with helper'
  );
  assert.match(
    helperSrc,
    /['"]https:\/\/moveleads\.cloud['"]/,
    'Helper must keep fallback "https://moveleads.cloud" for parity with twilioWebhook'
  );
});

// ── B. statusCallback wired on every outbound messages.create ──────────

test('B1. sendMoverLeadSMS passes statusCallback via the helper', () => {
  assert.match(
    smsServiceExec,
    /sendMoverLeadSMS[\s\S]*?messages\.create\(\s*\{[\s\S]*?statusCallback\s*:\s*getSmsStatusCallbackUrl\(\)/,
    'sendMoverLeadSMS must pass statusCallback: getSmsStatusCallbackUrl() to messages.create'
  );
});

test('B2. sendMoverLostClaimSMS passes statusCallback via the helper', () => {
  assert.match(
    smsServiceExec,
    /sendMoverLostClaimSMS[\s\S]*?messages\.create\(\s*\{[\s\S]*?statusCallback\s*:\s*getSmsStatusCallbackUrl\(\)/,
    'sendMoverLostClaimSMS must pass statusCallback: getSmsStatusCallbackUrl() to messages.create'
  );
});

test('B3. sendSpeedToLeadSMS passes statusCallback via the helper', () => {
  assert.match(
    twilioSvcExec,
    /sendSpeedToLeadSMS[\s\S]*?messages\.create\(\s*\{[\s\S]*?statusCallback\s*:\s*getSmsStatusCallbackUrl\(\)/,
    'sendSpeedToLeadSMS must pass statusCallback: getSmsStatusCallbackUrl() to messages.create'
  );
});

test('B4. sendMoverSms passes statusCallback via the helper', () => {
  assert.match(
    twilioSvcExec,
    /sendMoverSms[\s\S]*?messages\.create\(\s*\{[\s\S]*?statusCallback\s*:\s*getSmsStatusCallbackUrl\(\)/,
    'sendMoverSms must pass statusCallback: getSmsStatusCallbackUrl() to messages.create'
  );
});

test('B5. The helper is imported from utils/twilioStatusCallback in both service files', () => {
  for (const [name, src] of [
    ['services/smsService.js', smsServiceExec],
    ['services/twilioService.js', twilioSvcExec],
  ]) {
    assert.match(
      src,
      /require\(\s*['"]\.\.\/utils\/twilioStatusCallback['"]\s*\)/,
      `${name} must import the helper from ../utils/twilioStatusCallback`
    );
  }
});

test('B6. No inline statusCallback URL strings (drift guard)', () => {
  // Every site must use the helper. An inline "...api/twilio/sms/status"
  // string in either service file means a contributor bypassed the helper.
  for (const [name, exec] of [
    ['services/smsService.js', smsServiceExec],
    ['services/twilioService.js', twilioSvcExec],
  ]) {
    assert.doesNotMatch(
      exec,
      /statusCallback\s*:\s*['"`][^'"`]*\/api\/twilio\/sms\/status[^'"`]*['"`]/,
      `${name} must NOT inline the statusCallback URL — use getSmsStatusCallbackUrl() helper`
    );
  }
});

test('B7. messages.create is called exactly 4 times across smsService + twilioService', () => {
  // Defense-in-depth: confirm the count. A fifth call appearing without
  // statusCallback would slip past B1-B4. The two voice-related send sites
  // (twilio.js voice routes use twiml, not messages.create) aren't counted.
  const smsCalls    = smsServiceExec.match(/messages\.create\(/g) || [];
  const twilioCalls = twilioSvcExec.match(/messages\.create\(/g) || [];
  assert.equal(smsCalls.length, 2,
    `smsService.js must have exactly 2 messages.create calls; found ${smsCalls.length}`);
  assert.equal(twilioCalls.length, 2,
    `twilioService.js must have exactly 2 messages.create calls; found ${twilioCalls.length}`);
});

// ── C. SmsDeliveryStatus model ─────────────────────────────────────────

test('C1. SmsDeliveryStatus model exists and is required from the route', () => {
  assert.ok(fs.existsSync(modelPath), 'SmsDeliveryStatus model file must exist');
  assert.match(
    twilioRouteExec,
    /require\(\s*['"]\.\.\/models\/SmsDeliveryStatus['"]\s*\)/,
    'routes/twilio.js must require SmsDeliveryStatus'
  );
});

test('C2. messageSid is required + trimmed', () => {
  assert.match(
    modelExec,
    /messageSid\s*:\s*\{\s*type\s*:\s*String\s*,\s*required\s*:\s*true\s*,\s*trim\s*:\s*true\s*\}/,
    'messageSid must be { type: String, required: true, trim: true }'
  );
});

test('C3. errorCode is a Number (parsed from Twilio string)', () => {
  // Twilio sends ErrorCode as a string like "30003"; we parse to Number
  // so admin queries like { errorCode: 30003 } work cleanly.
  assert.match(modelExec, /errorCode\s*:\s*\{\s*type\s*:\s*Number\s*\}/,
    'errorCode must be { type: Number }');
});

test('C4. errorMessage is bounded (maxlength 500)', () => {
  assert.match(
    modelExec,
    /errorMessage\s*:\s*\{\s*type\s*:\s*String\s*,\s*trim\s*:\s*true\s*,\s*maxlength\s*:\s*500\s*\}/,
    'errorMessage must be String + trim + maxlength: 500'
  );
});

test('C5. rawPayload uses Mixed for forensics fidelity', () => {
  assert.match(
    modelExec,
    /rawPayload\s*:\s*\{\s*type\s*:\s*mongoose\.Schema\.Types\.Mixed\s*\}/,
    'rawPayload must be Mixed (Twilio adds fields over time; forensics needs full fidelity)'
  );
});

test('C6. receivedAt and updatedAt are required Date fields with Date.now default', () => {
  assert.match(
    modelExec,
    /receivedAt\s*:\s*\{\s*type\s*:\s*Date\s*,\s*default\s*:\s*Date\.now\s*,\s*required\s*:\s*true\s*\}/,
    'receivedAt must be Date with default Date.now and required'
  );
  assert.match(
    modelExec,
    /updatedAt\s*:\s*\{\s*type\s*:\s*Date\s*,\s*default\s*:\s*Date\.now\s*,\s*required\s*:\s*true\s*\}/,
    'updatedAt must be Date with default Date.now and required'
  );
});

test('C7. Unique index on messageSid (upsert key)', () => {
  assert.match(
    modelExec,
    /\.index\(\s*\{\s*messageSid\s*:\s*1\s*\}\s*,\s*\{\s*unique\s*:\s*true\s*,\s*name\s*:\s*['"]messageSid_unique['"]\s*\}\s*\)/,
    'Schema must have unique-name index on messageSid'
  );
});

test('C8. Admin-filter index on { messageStatus, receivedAt: -1 }', () => {
  assert.match(
    modelExec,
    /\.index\(\s*\{\s*messageStatus\s*:\s*1\s*,\s*receivedAt\s*:\s*-1\s*\}\s*\)/,
    'Schema must index { messageStatus, receivedAt: -1 } for admin filter queries'
  );
});

test('C9. 90-day TTL on receivedAt (operational forensics, not legal record)', () => {
  assert.match(
    modelExec,
    /expireAfterSeconds\s*:\s*60\s*\*\s*60\s*\*\s*24\s*\*\s*90/,
    'TTL must be 90 days on receivedAt'
  );
});

test('C10. Mongoose model registered as smsDeliveryStatus', () => {
  // Pin the collection name so admin queries / future readers can rely
  // on the conventional naming.
  assert.match(
    modelExec,
    /mongoose\.model\(\s*['"]smsDeliveryStatus['"]\s*,\s*SmsDeliveryStatusSchema\s*\)/,
    "Model must be registered as 'smsDeliveryStatus'"
  );
});

// ── D. Route mounted with parser + signature middleware ────────────────

test('D1. POST /sms/status is wired in routes/twilio.js', () => {
  assert.match(
    twilioRouteExec,
    /router\.post\(\s*\n?\s*['"]\/sms\/status['"]/,
    'POST /sms/status must be defined on the twilio router'
  );
});

test('D2. POST /sms/status uses express.urlencoded body parser', () => {
  // Twilio posts application/x-www-form-urlencoded; the global json parser
  // doesn't handle it. Same posture as /sms/inbound.
  assert.match(
    twilioRouteExec,
    /router\.post\(\s*\n?\s*['"]\/sms\/status['"]\s*,\s*\n?\s*express\.urlencoded\(\s*\{\s*extended\s*:\s*false\s*\}\s*\)/,
    'POST /sms/status must mount express.urlencoded({ extended: false }) before the handler'
  );
});

test('D3. POST /sms/status applies twilioWebhook signature middleware', () => {
  // Signature gate must run BEFORE the handler. Unsigned hits get 403'd
  // before any DB work — same posture as /sms/inbound.
  assert.match(
    twilioRouteExec,
    /router\.post\(\s*\n?\s*['"]\/sms\/status['"]\s*,\s*\n?\s*express\.urlencoded\([^)]+\)\s*,\s*\n?\s*twilioWebhook/,
    'twilioWebhook signature middleware must be applied to POST /sms/status (between the parser and the handler)'
  );
});

// ── E. Handler input parsing ───────────────────────────────────────────

test('E1. Handler extracts MessageSid with SmsSid fallback', () => {
  // Twilio's older SMS callbacks use SmsSid; current ones use MessageSid.
  // Accept both for forward/backward compatibility.
  assert.match(
    twilioRouteExec,
    /body\.MessageSid\s*\|\|\s*body\.SmsSid/,
    'Handler must read MessageSid with SmsSid fallback'
  );
});

test('E2. Handler extracts MessageStatus with SmsStatus fallback', () => {
  assert.match(
    twilioRouteExec,
    /body\.MessageStatus\s*\|\|\s*body\.SmsStatus/,
    'Handler must read MessageStatus with SmsStatus fallback'
  );
});

test('E3. ErrorCode is parsed to a finite number (Twilio sends it as a string)', () => {
  assert.match(
    twilioRouteExec,
    /parseInt\(\s*errorCodeRaw\s*,\s*10\s*\)[\s\S]{0,80}Number\.isFinite\(\s*n\s*\)/,
    'ErrorCode must be parseInt(...,10) then guarded with Number.isFinite'
  );
});

test('E4. Missing MessageSid responds 204 (NOT 500 — Twilio would retry forever)', () => {
  // Critical: an unrecoverable payload must NOT trigger Twilio retries.
  assert.match(
    twilioRouteExec,
    /if\s*\(\s*!\s*messageSid\s*\)\s*\{[\s\S]*?return\s+res\.sendStatus\(\s*204\s*\)/,
    'Missing MessageSid must return res.sendStatus(204) — never 500'
  );
});

// ── F. Upsert idempotency ──────────────────────────────────────────────

test('F1. Route upserts by messageSid', () => {
  assert.match(
    twilioRouteExec,
    /SmsDeliveryStatus\.updateOne\(\s*\{\s*messageSid\s*\}[\s\S]{0,400}upsert\s*:\s*true/,
    'Route must upsert by { messageSid } with upsert: true'
  );
});

test('F2. Upsert preserves receivedAt across retries ($setOnInsert)', () => {
  // Twilio retries on transient 5xx within a 24h window. The first
  // callback's receivedAt must NOT be overwritten on subsequent retries.
  assert.match(
    twilioRouteExec,
    /\$setOnInsert\s*:\s*\{[\s\S]*?messageSid[\s\S]*?receivedAt\s*:\s*new\s+Date\(\)[\s\S]*?\}/,
    '$setOnInsert must include messageSid and receivedAt so retries preserve the first-seen timestamp'
  );
});

test('F3. Upsert $set covers messageStatus, updatedAt, rawPayload', () => {
  // updatedAt MUST be inside $set (not setOnInsert) so retries refresh
  // it. Lock the shape so contributors don't accidentally swap them.
  assert.match(twilioRouteExec, /set\.messageStatus|messageStatus\s*:\s*messageStatus/,
    '$set must include messageStatus');
  assert.match(twilioRouteExec, /updatedAt\s*:\s*new\s+Date\(\)/,
    '$set must include updatedAt: new Date()');
  assert.match(twilioRouteExec, /rawPayload\s*:\s*body/,
    '$set must include rawPayload: body');
});

test('F4. Handler responds 204 on success', () => {
  // Per Twilio docs, 2xx ack ends the retry chain.
  assert.match(
    twilioRouteExec,
    /await\s+SmsDeliveryStatus\.updateOne\([\s\S]*?return\s+res\.sendStatus\(\s*204\s*\)/,
    'Successful upsert must return res.sendStatus(204)'
  );
});

// ── G. Error handling ──────────────────────────────────────────────────

test('G1. Persistence error returns 500 so Twilio retries (transient is exactly when retry helps)', () => {
  assert.match(
    twilioRouteExec,
    /catch\s*\(\s*err\s*\)\s*\{[\s\S]*?\[SmsStatus\] persistence failed[\s\S]*?return\s+res\.sendStatus\(\s*500\s*\)/,
    'Persistence failure must log and return 500'
  );
});

// ── H. Scope discipline ────────────────────────────────────────────────

test('H1. No changes to inbound /sms/inbound route shape', () => {
  // PR-S6 contract — /sms/inbound mount must be untouched (same parser
  // chain, same middleware order).
  assert.match(
    twilioRouteSrc,
    /router\.post\(\s*\n?\s*['"]\/sms\/inbound['"]\s*,\s*\n?\s*express\.urlencoded\(\s*\{\s*extended\s*:\s*false\s*\}\s*\)\s*,\s*\n?\s*twilioWebhook\s*,/,
    '/sms/inbound mount shape must remain byte-identical'
  );
});

test('H2. PR-S3 atomic CAS shape unchanged in routes/twilio.js inbound handler', () => {
  // Lock-in for the buy-now-style atomic sequence in the inbound CLAIM
  // branch. The claimWindow CAS (token + status:open + expiresAt:$gt now
  // → status:claimed) is the race-resolution step that elects a single
  // winner. Pin the shape so future PRs cannot accidentally regress it.
  assert.match(
    twilioRouteSrc,
    /Lead\.findOneAndUpdate\([\s\S]*?'claimWindow\.token'\s*:\s*token[\s\S]*?'claimWindow\.status'\s*:\s*'open'[\s\S]*?'claimWindow\.expiresAt'\s*:\s*\{\s*\$gt\s*:\s*now\s*\}/,
    'PR-S3 claim-window CAS shape (token + status:open + expiresAt:$gt now) must remain in the inbound CLAIM branch'
  );
});

test('H3. No new env flags introduced by PR-5', () => {
  // PR-5 must ship always-on. Adding a feature flag would defeat the
  // observability purpose (we want EVERY outbound SMS reported).
  for (const re of [
    /process\.env\.ENABLE_SMS_STATUS_CALLBACK/,
    /process\.env\.SMS_STATUS_OBSERVABILITY/,
    /process\.env\.DELIVERY_RECEIPTS/,
  ]) {
    assert.doesNotMatch(helperExec,      re, `Helper must NOT introduce env flag ${re}`);
    assert.doesNotMatch(modelExec,       re, `Model must NOT introduce env flag ${re}`);
    assert.doesNotMatch(smsServiceExec,  re, `smsService must NOT introduce env flag ${re}`);
    assert.doesNotMatch(twilioSvcExec,   re, `twilioService must NOT introduce env flag ${re}`);
    assert.doesNotMatch(twilioRouteExec, re, `twilio route must NOT introduce env flag ${re}`);
  }
});

test('H4. No matcher / dispatchPolicy / candidate-selection imports added to the new files', () => {
  // PR-5 is observability. The helper, model, and route must not touch
  // matching / dispatchPolicy / leadVisibility code.
  for (const [name, exec] of [
    ['helper', helperExec],
    ['model',  modelExec],
  ]) {
    for (const forbidden of [
      /leadMatching/,
      /dispatchPolicy/,
      /leadVisibility/,
      /distributionDecision/,
    ]) {
      assert.doesNotMatch(exec, forbidden,
        `${name} must NOT import matching/dispatch/visibility code (${forbidden})`);
    }
  }
});

test('H5. No balance / Transaction / PurchasedLead writes in the new route handler', () => {
  // Defense-in-depth — observability route must not touch financial state.
  // Locate the /sms/status block by its route start through its end and
  // scan ONLY that block for forbidden financial writes.
  const block = twilioRouteSrc.match(
    /router\.post\(\s*\n?\s*['"]\/sms\/status['"][\s\S]*?\}\s*\)\s*;/
  );
  assert.ok(block, '/sms/status block must be findable');
  for (const forbidden of [
    /Transaction\.create/,
    /Transaction\(/,
    /PurchasedLead\(/,
    /\$inc\s*:\s*\{\s*balance/,
    /User\.findOneAndUpdate/,
    /User\.updateOne/,
  ]) {
    assert.doesNotMatch(block[0], forbidden,
      `/sms/status handler must NOT touch financial state (${forbidden})`);
  }
});

test('H6. /sms/status mount is wholly new — does not collide with /sms/inbound', () => {
  // Defense-in-depth: confirm both routes exist and are distinct.
  const inboundCount = (twilioRouteExec.match(/['"]\/sms\/inbound['"]/g) || []).length;
  const statusCount  = (twilioRouteExec.match(/['"]\/sms\/status['"]/g)  || []).length;
  assert.ok(inboundCount >= 1, '/sms/inbound must still be mounted');
  assert.ok(statusCount  >= 1, '/sms/status must be mounted');
});

console.log('Twilio SMS statusCallback + status route (PR-5) tests scheduled.');
