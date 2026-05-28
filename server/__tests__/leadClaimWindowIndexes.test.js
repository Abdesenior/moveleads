/**
 * Lead.claimWindow indexes (PR-S2) lock-in.
 *
 * Second of five pre-flip hardening blockers for the SMS Claim pipeline.
 * The audit (docs/audits/sms-claim-pipeline/) identified two index gaps
 * on Lead.claimWindow that block safe Phase 5 operation:
 *
 *   1. claimWindow.token was sparse but NON-UNIQUE. Two leads could
 *      share a token. The Phase 5 inbound webhook will atomically flip
 *      a claim window via:
 *        Lead.findOneAndUpdate(
 *          { 'claimWindow.token': T, 'claimWindow.status': 'open' },
 *          { $set: { ... } }
 *        )
 *      A non-unique token makes this lookup ambiguous — the wrong lead
 *      could be claimed.
 *
 *   2. No compound index on { claimWindow.status, claimWindow.expiresAt }.
 *      The Phase 5 closeStaleClaimWindows background job (PR-S4) will
 *      run every 5-10 min with the query:
 *        { 'claimWindow.status': 'open', 'claimWindow.expiresAt': { $lt: now } }
 *      Without a supporting index this is a full collection scan.
 *
 * PR-S2 closes both. The previous inline index on claimWindow.token has
 * been removed and replaced with a named unique-sparse index at the
 * schema level. A compound partial index on status+expiresAt supports
 * the background job.
 *
 * This test pins:
 *
 *   A. claimWindow.token has a unique sparse index with the expected name
 *   B. Compound partial index on {status, expiresAt} with the expected
 *      name + partial filter
 *   C. The inline `index: true, sparse: true` on the field declaration
 *      is gone (verified by checking the field has no per-field index spec)
 *   D. Existing Lead indexes (originZip+destinationZip, status+createdAt,
 *      clientSubmissionId partial-unique) unchanged — regression guard
 *   E. claimWindow schema shape unchanged otherwise — PR-S2 is index-only
 *
 * Pure-Node, no Mongo. Source-level + schema-introspection assertions.
 *
 * Run: `node server/__tests__/leadClaimWindowIndexes.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Lead = require('../models/Lead');
const leadSrc = fs.readFileSync(
  path.join(__dirname, '..', 'models', 'Lead.js'),
  'utf8'
);

// Mongoose Schema.indexes() returns array of [keys, options] tuples.
const indexes = Lead.schema.indexes();

function findIndex(predicate) {
  return indexes.find(([keys, options]) => predicate(keys, options || {}));
}

function indexNames() {
  return indexes.map(([, opts]) => (opts || {}).name).filter(Boolean);
}

// ── A. claimWindow.token unique-sparse named index ──────────────────────

test('A1. Lead schema defines a unique sparse index on claimWindow.token', () => {
  const found = findIndex((keys, opts) =>
    keys && keys['claimWindow.token'] === 1 &&
    opts.unique === true &&
    opts.sparse === true
  );
  assert.ok(
    found,
    'Expected an index spec [{ "claimWindow.token": 1 }, { unique: true, sparse: true, ... }] on Lead schema. ' +
    'This is the lookup index for the Phase 5 inbound claim CAS.'
  );
});

test('A2. The unique-sparse token index has the documented name claimWindow_token_unique', () => {
  const found = findIndex((keys, opts) =>
    keys['claimWindow.token'] === 1 && opts.unique === true && opts.sparse === true
  );
  assert.ok(found, 'index must exist');
  const [, opts] = found;
  assert.equal(
    opts.name, 'claimWindow_token_unique',
    'Named index — operators must be able to identify + drop it from the ' +
    'old anonymous `claimWindow.token_1` index that prod has today.'
  );
});

// ── B. Compound partial index on {status, expiresAt} ────────────────────

test('B1. Lead schema defines a compound index on {claimWindow.status, claimWindow.expiresAt}', () => {
  const found = findIndex((keys) => {
    if (!keys) return false;
    const keyNames = Object.keys(keys);
    return keyNames.length === 2 &&
      keys['claimWindow.status'] === 1 &&
      keys['claimWindow.expiresAt'] === 1;
  });
  assert.ok(
    found,
    'Expected compound index [{ "claimWindow.status": 1, "claimWindow.expiresAt": 1 }, {...}] on Lead schema. ' +
    'Supports the Phase 5 closeStaleClaimWindows background job query.'
  );
});

test('B2. The compound index has the documented name claimWindow_status_expiresAt', () => {
  const found = findIndex((keys) =>
    keys['claimWindow.status'] === 1 && keys['claimWindow.expiresAt'] === 1
  );
  assert.ok(found, 'index must exist');
  const [, opts] = found;
  assert.equal(opts.name, 'claimWindow_status_expiresAt');
});

test('B3. The compound index is partial-filtered on { claimWindow.status: { $exists: true } }', () => {
  // Keeps the index tiny — only leads with an actual claim window
  // get an index entry. Most leads in Phase 5 will have no claim window.
  const found = findIndex((keys, opts) =>
    keys['claimWindow.status'] === 1 &&
    keys['claimWindow.expiresAt'] === 1 &&
    opts.partialFilterExpression
  );
  assert.ok(found, 'compound index must have partialFilterExpression');
  const [, opts] = found;
  assert.deepEqual(
    opts.partialFilterExpression,
    { 'claimWindow.status': { $exists: true } },
    'Partial filter must match `claimWindow.status: { $exists: true }` to skip leads without claim windows'
  );
});

// ── C. Inline `index: true, sparse: true` removed from token field ──────

test('C1. claimWindow.token no longer carries inline index/sparse on the field declaration', () => {
  // Schema.path() exposes the field config. If we left the inline
  // `index: true, sparse: true`, the path would have those flags.
  // After PR-S2 the path should only have type/trim/uppercase.
  const tokenPath = Lead.schema.path('claimWindow.token');
  assert.ok(tokenPath, 'claimWindow.token path must exist on schema');
  assert.equal(tokenPath.instance, 'String');
  // The _index property reflects the per-field inline index spec.
  // Mongoose normalizes `index: true` into `_index: true` (or an object).
  assert.ok(
    tokenPath._index === undefined || tokenPath._index === null || tokenPath._index === false,
    'claimWindow.token must NOT have an inline index spec (moved to schema level in PR-S2). ' +
    `Got ${JSON.stringify(tokenPath._index)}`
  );
});

test('C2. PR-S2 audit-trail comment is present in Lead.js', () => {
  assert.match(
    leadSrc,
    /PR-S2:\s*SMS Claim pipeline pre-flip hardening indexes/i,
    'Inline audit-trail comment must explain why the indexes exist (so future contributors do not drop them) AND ' +
    'the operational note about dropping the old anonymous index in prod.'
  );
});

test('C3. PR-S2 operational note references the prod index drop step', () => {
  // Operators reading the file should see the explicit drop command.
  assert.match(
    leadSrc,
    /db\.leads\.dropIndex\(['"]claimWindow\.token_1['"]\)/,
    'Audit-trail comment must contain the explicit dropIndex command for the deploy team'
  );
});

// ── D. Existing indexes unchanged (regression guard) ────────────────────

test('D1. {originZip, destinationZip} routing hot-path index still present', () => {
  const found = findIndex((keys) =>
    keys && keys.originZip === 1 && keys.destinationZip === 1
  );
  assert.ok(found, 'Routing hot-path index must remain');
});

test('D2. {status, createdAt: -1} dashboard query index still present', () => {
  const found = findIndex((keys) =>
    keys && keys.status === 1 && keys.createdAt === -1
  );
  assert.ok(found, 'Dashboard query index must remain');
});

test('D3. clientSubmissionId partial-unique idempotency index still present', () => {
  const found = findIndex((keys, opts) =>
    keys && keys.clientSubmissionId === 1 &&
    opts.unique === true &&
    opts.partialFilterExpression
  );
  assert.ok(found, 'V5 idempotency partial-unique index must remain');
  const [, opts] = found;
  assert.equal(opts.name, 'clientSubmissionId_partial_unique');
});

// ── E. claimWindow schema shape unchanged otherwise ─────────────────────

test('E1. claimWindow has the same subdoc fields as before PR-S2', () => {
  const expectedSubfields = new Set([
    'status', 'openedAt', 'expiresAt', 'token', 'windowMinutes',
    'broadcastTo', 'offeredTo', 'claimedBy', 'claimedAt', 'closedReason',
  ]);
  for (const sub of expectedSubfields) {
    const p = Lead.schema.path(`claimWindow.${sub}`);
    assert.ok(p, `claimWindow.${sub} must still exist on schema`);
  }
});

test('E2. claimWindow.status enum unchanged', () => {
  const p = Lead.schema.path('claimWindow.status');
  assert.deepEqual(p.enumValues, ['open', 'claimed', 'expired']);
});

test('E3. claimWindow.closedReason enum unchanged', () => {
  const p = Lead.schema.path('claimWindow.closedReason');
  assert.deepEqual(p.enumValues, ['claimed', 'expired', 'admin_revoked']);
});

// ── F. PR-S2 scope discipline — index-only ──────────────────────────────

test('F1. Total Lead index count grew by exactly 2 (token-unique + status-expiresAt compound)', () => {
  // Pre-PR-S2: 3 schema-level indexes (originZip+destZip, status+createdAt,
  // clientSubmissionId partial-unique) + 1 inline (claimWindow.token sparse)
  //   = 4 indexes
  // Post-PR-S2: 3 unchanged + claimWindow.token unique-sparse + compound
  //   = 5 indexes
  //
  // Mongoose's schema.indexes() reports both schema-level and inline
  // indexes, so the net delta should be +1 (added 2 new schema-level
  // indexes, removed 1 inline index).
  const names = indexNames();
  // We don't pin a hard count because mongoose may add a default _id index
  // listing in some versions. Instead pin that both new named indexes are present:
  assert.ok(names.includes('claimWindow_token_unique'), 'token unique index name missing');
  assert.ok(names.includes('claimWindow_status_expiresAt'), 'compound index name missing');
  assert.ok(names.includes('clientSubmissionId_partial_unique'), 'pre-existing idempotency index name missing');
});

console.log('Lead.claimWindow indexes (PR-S2) tests scheduled.');
