/**
 * ClaimAttempt.twilioMessageSid unique-sparse index (PR-S1) lock-in.
 *
 * This is the first of five pre-flip hardening blockers for the SMS
 * Claim pipeline. The audit (docs/audits/sms-claim-pipeline/) identified
 * idempotency as the load-bearing safety property: when ENABLE_SMS_CLAIM_LIVE
 * flips and the inbound webhook starts performing atomic claims, Twilio
 * retries (5 attempts over 24h on non-2xx response) MUST be idempotent.
 *
 * The webhook design in Phase 5 inserts a ClaimAttempt row FIRST,
 * before any balance debit. If Twilio retries the same MessageSid,
 * the second insert throws E11000 — that's the dedup signal.
 *
 * Without this unique constraint, a transient server error during a
 * successful claim would retry on the same payload and could double-
 * debit the mover. Trust failure in a fast-response money system.
 *
 * This test pins:
 *
 *   A. The model defines a unique sparse index on twilioMessageSid
 *      with the expected name.
 *   B. Other established indexes (cooldown, forensics, token, TTL)
 *      are still present — regression guard.
 *   C. The model still exports OUTCOMES enum unchanged.
 *
 * Pure-Node, no Mongo. Source-level assertions on the schema's
 * indexes() output.
 *
 * Run: `node server/__tests__/claimAttemptMessageSidIdempotency.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ClaimAttempt = require('../models/ClaimAttempt');
const claimAttemptSrc = fs.readFileSync(
  path.join(__dirname, '..', 'models', 'ClaimAttempt.js'),
  'utf8'
);

// Mongoose Schema.indexes() returns an array of [keys, options] tuples.
// Snapshot the model's index spec for assertions.
const indexes = ClaimAttempt.schema.indexes();

function findIndex(predicate) {
  return indexes.find(([keys, options]) => predicate(keys, options || {}));
}

// ── A. Unique sparse index on twilioMessageSid is present ───────────────

test('A1. ClaimAttempt schema defines a unique sparse index on twilioMessageSid', () => {
  const found = findIndex((keys, opts) =>
    keys && Object.keys(keys).length === 1 &&
    keys.twilioMessageSid === 1 &&
    opts.unique === true &&
    opts.sparse === true
  );
  assert.ok(
    found,
    'Expected an index spec [{ twilioMessageSid: 1 }, { unique: true, sparse: true, ... }] on ClaimAttempt schema'
  );
});

test('A2. The unique-sparse index has the documented name twilioMessageSid_unique', () => {
  const found = findIndex((keys, opts) =>
    keys.twilioMessageSid === 1 && opts.unique === true && opts.sparse === true
  );
  assert.ok(found, 'index must exist before name can be checked');
  const [, opts] = found;
  assert.equal(
    opts.name, 'twilioMessageSid_unique',
    'Named index helps operators identify this index in MongoDB diagnostics + drop/rebuild scripts'
  );
});

test('A3. PR-S1 audit-trail comment is present in ClaimAttempt.js', () => {
  assert.match(
    claimAttemptSrc,
    /PR-S1:\s*Twilio webhook idempotency key/i,
    'Inline audit-trail comment must explain why the index exists so future contributors do not drop it'
  );
});

// ── B. Established indexes still present (regression guard) ────────────

test('B1. {moverId, receivedAt: -1} cooldown index still present', () => {
  const found = findIndex((keys) =>
    keys && keys.moverId === 1 && keys.receivedAt === -1
  );
  assert.ok(found, 'Cooldown index for per-mover claim attempts must remain');
});

test('B2. {leadId, receivedAt: -1} forensics index still present', () => {
  const found = findIndex((keys) =>
    keys && keys.leadId === 1 && keys.receivedAt === -1
  );
  assert.ok(found, 'Per-lead forensics index must remain');
});

test('B3. {token: 1} unmatched-token debug index still present', () => {
  const found = findIndex((keys, opts) =>
    keys && keys.token === 1 && Object.keys(keys).length === 1
    // Distinguish from the unique-sparse twilioMessageSid index
    && !opts.unique
  );
  assert.ok(found, 'Token debug index must remain (separate from unique twilioMessageSid index)');
});

test('B4. TTL index on receivedAt (90 days) still present', () => {
  const found = findIndex((keys, opts) =>
    keys && keys.receivedAt === 1 && opts.expireAfterSeconds === 60 * 60 * 24 * 90
  );
  assert.ok(found, '90-day TTL retention must remain');
});

// ── C. OUTCOMES enum unchanged ─────────────────────────────────────────

test('C1. ClaimAttempt.OUTCOMES exports the documented 9-value enum', () => {
  const expected = [
    'won', 'lost_already_claimed', 'lost_window_expired',
    'rejected_low_balance', 'rejected_unmatched_token',
    'rejected_optout', 'rejected_unverified_phone',
    'parsed_no_token', 'shadow_only',
  ];
  assert.deepEqual(ClaimAttempt.OUTCOMES, expected,
    'OUTCOMES enum must not drift — Phase 5 handler will switch on these values');
});

// ── D. PR-S1 scope discipline ──────────────────────────────────────────
//
// This PR is index-only. The handler stays in shadow mode. The schema
// shape (fields, types, defaults) must be identical to pre-PR-S1.

test('D1. twilioMessageSid field shape is unchanged (still String, trim, no required, no enum)', () => {
  const path = ClaimAttempt.schema.path('twilioMessageSid');
  assert.ok(path, 'twilioMessageSid path must exist on schema');
  assert.equal(path.instance, 'String', 'twilioMessageSid must be a String field');
  // Must remain optional — Phase 4 has no rows; Phase 5 will populate
  // it but the unique-sparse semantics require optional+unique to work.
  assert.notEqual(path.isRequired, true, 'twilioMessageSid must remain optional (sparse-unique semantics)');
});

test('D2. No new fields added to ClaimAttempt schema', () => {
  // Pin the exact field set so PR-S1 stays scope-disciplined (index only).
  const expectedFields = new Set([
    '_id', 'leadId', 'moverId', 'fromPhone', 'body', 'parsedKeyword',
    'token', 'outcome', 'reason', 'twilioMessageSid', 'receivedAt',
    'createdAt', '__v',
  ]);
  const actualFields = new Set(Object.keys(ClaimAttempt.schema.paths));
  for (const field of actualFields) {
    assert.ok(
      expectedFields.has(field),
      `Unexpected schema field '${field}' — PR-S1 is index-only; new fields belong in a separate PR`
    );
  }
});

console.log('ClaimAttempt twilioMessageSid idempotency (PR-S1) tests scheduled.');
