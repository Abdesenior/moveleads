/**
 * Meta Pixel + CAPI — Commit 1 backend foundation lock-in.
 *
 * Pure-Node, no Mongo. Source-level + behavioral assertions covering:
 *   A. Lead schema declares all six tracking fields with correct types
 *      and the dedup-critical metaEventId index
 *   B. V2 validator accepts the four client-supplied tracking fields and
 *      enforces sane bounds (URL form, length cap)
 *   C. The ingest-v2 handler imports metaCapi and persists ALL six fields
 *      (four from body + two from req via extractRequestSignals)
 *   D. metaCapi exports the scaffold surface, and the no-op functions
 *      return a sensible shape WITHOUT firing any HTTP call
 *   E. .env.example documents META_PIXEL_ID, META_CAPI_ACCESS_TOKEN,
 *      and META_CAPI_TEST_EVENT_CODE so deploys don't miss them
 *
 * Run: `node server/__tests__/metaCapiCapture.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leadModelSrc       = fs.readFileSync(path.join(__dirname, '..', 'models', 'Lead.js'), 'utf8');
const validatorSrc       = fs.readFileSync(path.join(__dirname, '..', 'validators', 'leadIngestV2.js'), 'utf8');
const ingestRouteSrc     = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leadIngestV2.js'), 'utf8');
const metaCapiSrc        = fs.readFileSync(path.join(__dirname, '..', 'services', 'metaCapi.js'), 'utf8');
const envExampleSrc      = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');

// ── A. Lead schema declares the six tracking fields ──────────────────────

test('Lead schema declares all Meta tracking fields', () => {
  const fields = ['metaEventId', 'fbp', 'fbc', 'ipAddress', 'userAgent', 'eventSourceUrl', 'metaCapiSentAt', 'metaQualifiedSentAt'];
  for (const f of fields) {
    assert.match(
      leadModelSrc,
      new RegExp(`\\b${f}\\s*:\\s*\\{`),
      `Lead.js must declare \`${f}\` as a schema field`
    );
  }

  // metaEventId is the dedup correlation key. We want it indexed so future
  // server-side dedup queries (e.g. "did we already CAPI this event?")
  // don't collection-scan.
  assert.match(
    leadModelSrc,
    /metaEventId\s*:\s*\{\s*type:\s*String\s*,\s*index:\s*true\s*\}/,
    'metaEventId must declare `index: true` — it is the dedup correlation key'
  );

  // Sent-marker fields are Dates, not booleans — we need a timestamp for
  // diagnostics + 7-day Meta dedup window correlation.
  assert.match(leadModelSrc, /metaCapiSentAt\s*:\s*\{\s*type:\s*Date\s*\}/);
  assert.match(leadModelSrc, /metaQualifiedSentAt\s*:\s*\{\s*type:\s*Date\s*\}/);
});

// ── B. Validator accepts the four client-supplied fields ─────────────────

test('V2 validator accepts metaEventId/fbp/fbc/eventSourceUrl as optional', () => {
  const { validateLeadPayloadV2 } = require('../validators/leadIngestV2');

  const basePayload = {
    firstName: 'Jane',
    customerPhone: '+15555550100',
    originZip: '90210',
    destinationZip: '10001',
    moveDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    homeSize: '2 Bedroom',
    intentConfirmed: true,
    clientSubmissionId: 'cmt1-validator-test-uuid',
    funnelVersion: 'v6',
  };

  // (1) Payload WITHOUT tracking fields still validates — back-compat.
  const noTracking = validateLeadPayloadV2(basePayload);
  assert.equal(noTracking.success, true, 'validator must accept payloads without tracking fields');

  // (2) Payload WITH all four tracking fields validates.
  const withTracking = validateLeadPayloadV2({
    ...basePayload,
    clientSubmissionId: 'cmt1-validator-test-uuid-2',
    metaEventId:    '550e8400-e29b-41d4-a716-446655440000',
    fbp:            'fb.1.1700000000000.123456789',
    fbc:            'fb.1.1700000000000.AbCdEf',
    eventSourceUrl: 'https://moveleads.cloud/get-quote',
  });
  assert.equal(withTracking.success, true, `validator must accept tracking fields. Errors: ${JSON.stringify(withTracking.errors)}`);
  assert.equal(withTracking.data.metaEventId,    '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(withTracking.data.fbp,            'fb.1.1700000000000.123456789');
  assert.equal(withTracking.data.fbc,            'fb.1.1700000000000.AbCdEf');
  assert.equal(withTracking.data.eventSourceUrl, 'https://moveleads.cloud/get-quote');

  // (3) Malformed eventSourceUrl is rejected (validator is .strict() and the
  //     field is z.string().url() — a hostile client can't dump junk).
  const badUrl = validateLeadPayloadV2({
    ...basePayload,
    clientSubmissionId: 'cmt1-validator-test-uuid-3',
    eventSourceUrl: 'not-a-url',
  });
  assert.equal(badUrl.success, false, 'validator must reject a non-URL eventSourceUrl');
});

// ── C. Ingest handler imports metaCapi and persists all six fields ───────

test('ingest-v2 imports metaCapi and persists all six tracking fields', () => {
  assert.match(
    ingestRouteSrc,
    /require\(\s*['"]\.\.\/services\/metaCapi['"]\s*\)/,
    'leadIngestV2.js must require services/metaCapi'
  );

  // Client-supplied fields — conditional spreads keyed to data.*
  const clientFields = [
    [/data\.metaEventId\s*&&\s*\{\s*metaEventId:\s*data\.metaEventId\s*\}/,       'metaEventId'],
    [/data\.fbp\s*&&\s*\{\s*fbp:\s*data\.fbp\s*\}/,                               'fbp'],
    [/data\.fbc\s*&&\s*\{\s*fbc:\s*data\.fbc\s*\}/,                               'fbc'],
    [/data\.eventSourceUrl\s*&&\s*\{\s*eventSourceUrl:\s*data\.eventSourceUrl\s*\}/, 'eventSourceUrl'],
  ];
  for (const [pattern, name] of clientFields) {
    assert.match(ingestRouteSrc, pattern,
      `ingest-v2 must persist ${name} from validated payload via conditional spread`);
  }

  // Server-supplied IP + UA arrive via metaCapi.extractRequestSignals(req)
  // — single source of truth so the header-key + bound logic isn't duplicated.
  assert.match(
    ingestRouteSrc,
    /\.\.\.metaCapi\.extractRequestSignals\(\s*req\s*\)/,
    'ingest-v2 must spread metaCapi.extractRequestSignals(req) into the new Lead doc'
  );

  // Fire-and-forget scaffold call so the `[metaCapi:scaffold]` log line
  // appears in Render per ingest (Commit 1 visibility). Must use .catch()
  // and never await — customer response cannot be gated on Meta uptime.
  // Commit 2 flips this call site to a live CAPI POST without restructuring.
  assert.match(
    ingestRouteSrc,
    /metaCapi\.sendLead\(\s*lead\s*,\s*req\s*\)\.catch\(/,
    'ingest-v2 must invoke metaCapi.sendLead(lead, req).catch(...) after save so the scaffold log fires per submission'
  );
});

// ── D. metaCapi scaffold surface + no-op safety ──────────────────────────

test('metaCapi scaffold exports the expected surface and does not fire HTTP', () => {
  const metaCapi = require('../services/metaCapi');

  for (const fn of ['extractRequestSignals', 'hashPii', 'normalizePhoneForHash', 'sendLead', 'sendQualifiedLead']) {
    assert.equal(typeof metaCapi[fn], 'function', `metaCapi must export ${fn}()`);
  }

  // Scaffold mode: sendLead returns {sent:false, reason:'scaffold'} so
  // Commit 2 code that flips it live can be detected by reading the
  // returned shape in integration logs.
  return Promise.all([
    metaCapi.sendLead({ _id: 'fake-id', metaEventId: 'x' }).then(r => {
      assert.deepEqual(r, { sent: false, reason: 'scaffold' });
    }),
    metaCapi.sendQualifiedLead({ _id: 'fake-id' }).then(r => {
      assert.deepEqual(r, { sent: false, reason: 'scaffold' });
    }),
    metaCapi.sendLead(null).then(r => {
      assert.deepEqual(r, { sent: false, reason: 'missing-lead' },
        'sendLead(null) must short-circuit without throwing');
    }),
  ]);
});

test('metaCapi.extractRequestSignals returns only present fields', () => {
  const { extractRequestSignals } = require('../services/metaCapi');

  // Happy path
  const both = extractRequestSignals({ ip: '203.0.113.42', headers: { 'user-agent': 'Mozilla/5.0 Test' } });
  assert.deepEqual(both, { ipAddress: '203.0.113.42', userAgent: 'Mozilla/5.0 Test' });

  // No headers at all → empty object, NOT { ipAddress: undefined } —
  // we don't want to overwrite saved fields with undefined.
  assert.deepEqual(extractRequestSignals({}), {});
  assert.deepEqual(extractRequestSignals({ ip: '', headers: {} }), {});

  // Bounded UA (1024 char cap)
  const longUa = 'a'.repeat(2000);
  const bounded = extractRequestSignals({ ip: '1.2.3.4', headers: { 'user-agent': longUa } });
  assert.equal(bounded.userAgent.length, 1024, 'userAgent must be truncated to 1024 chars');
});

test('metaCapi.hashPii normalizes (trim+lowercase) before SHA-256', () => {
  const { hashPii } = require('../services/metaCapi');
  // Known vector: sha256('jane@example.com') = b1d2... (the actual hash isn't
  // the point — what matters is that two inputs that should normalize to the
  // same value DO).
  const a = hashPii('  Jane@Example.COM  ');
  const b = hashPii('jane@example.com');
  assert.equal(a, b, 'hashPii must trim + lowercase before hashing');
  assert.equal(typeof a, 'string');
  assert.equal(a.length, 64, 'SHA-256 hex is 64 chars');
  assert.equal(hashPii(''),  undefined, 'empty input → undefined (Meta rejects empty PII)');
  assert.equal(hashPii(null), undefined);
});

// ── E. .env.example documents the three Meta env vars ────────────────────

test('.env.example documents META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, META_CAPI_TEST_EVENT_CODE', () => {
  assert.match(envExampleSrc, /^META_PIXEL_ID\s*=/m,             '.env.example must list META_PIXEL_ID');
  assert.match(envExampleSrc, /^META_CAPI_ACCESS_TOKEN\s*=/m,    '.env.example must list META_CAPI_ACCESS_TOKEN');
  assert.match(envExampleSrc, /^META_CAPI_TEST_EVENT_CODE\s*=/m, '.env.example must list META_CAPI_TEST_EVENT_CODE');
});

console.log('\nMeta CAPI Commit 1 (backend foundation) lock-in tests scheduled.');
