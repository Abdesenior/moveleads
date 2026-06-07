/**
 * Meta Pixel + CAPI — lock-in test suite.
 *
 * Pure-Node, no Mongo, no network. Source-level + behavioral assertions
 * covering both Commit 1 (backend foundation) and Commit 2 (live sender +
 * browser Pixel). Network calls in `sendLead` are guarded by env presence;
 * tests deliberately keep META_* env unset so the live path is never
 * exercised in CI.
 *
 *   A. Lead schema declares all six tracking fields + sent-marker dates
 *   B. V2 validator accepts the four client-supplied tracking fields
 *      with sane bounds (URL form, length cap)
 *   C. Ingest handler imports metaCapi, persists all six fields, and
 *      fires-and-forgets sendLead
 *   D. metaCapi surface: live sender behavior under degraded env,
 *      pure helpers (hashPii, extractRequestSignals, splitName),
 *      payload builder produces a spec-compliant CAPI entry
 *   E. .env.example documents the three Meta env vars
 *   F. Client wiring: metaPixel helpers exist, main.jsx loads the
 *      Pixel, V6 funnel attaches eventId/fbp/fbc/eventSourceUrl and
 *      fires trackLead after a non-idempotent 200
 *
 * Run: `node server/__tests__/metaCapiCapture.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leadModelSrc      = fs.readFileSync(path.join(__dirname, '..', 'models', 'Lead.js'), 'utf8');
const validatorSrc      = fs.readFileSync(path.join(__dirname, '..', 'validators', 'leadIngestV2.js'), 'utf8');
const ingestRouteSrc    = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leadIngestV2.js'), 'utf8');
const metaCapiSrc       = fs.readFileSync(path.join(__dirname, '..', 'services', 'metaCapi.js'), 'utf8');
const envExampleSrc     = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');

const clientRoot = path.join(__dirname, '..', '..', 'client');
const metaPixelSrc       = fs.readFileSync(path.join(clientRoot, 'src', 'utils', 'metaPixel.js'), 'utf8');
const metaPixelCoreSrc = fs.readFileSync(path.join(clientRoot, 'src', 'utils', 'metaPixelCore.js'), 'utf8');
const mainJsxSrc         = fs.readFileSync(path.join(clientRoot, 'src', 'main.jsx'), 'utf8');
const getQuoteV6Src      = fs.readFileSync(path.join(clientRoot, 'src', 'pages', 'GetQuoteV6.jsx'), 'utf8');
const envProdExampleSrc  = fs.readFileSync(path.join(clientRoot, '.env.production.example'), 'utf8');

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

  assert.match(
    leadModelSrc,
    /metaEventId\s*:\s*\{\s*type:\s*String\s*,\s*index:\s*true\s*\}/,
    'metaEventId must declare `index: true` — it is the dedup correlation key'
  );

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
    clientSubmissionId: 'cmt2-validator-test-uuid',
    funnelVersion: 'v6',
  };

  const noTracking = validateLeadPayloadV2(basePayload);
  assert.equal(noTracking.success, true, 'validator must accept payloads without tracking fields');

  const withTracking = validateLeadPayloadV2({
    ...basePayload,
    clientSubmissionId: 'cmt2-validator-test-uuid-2',
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

  const badUrl = validateLeadPayloadV2({
    ...basePayload,
    clientSubmissionId: 'cmt2-validator-test-uuid-3',
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

  assert.match(
    ingestRouteSrc,
    /\.\.\.metaCapi\.extractRequestSignals\(\s*req\s*\)/,
    'ingest-v2 must spread metaCapi.extractRequestSignals(req) into the new Lead doc'
  );

  // Fire-and-forget CAPI call after save. Must use .catch() and never await
  // — customer response cannot be gated on Meta uptime.
  assert.match(
    ingestRouteSrc,
    /metaCapi\.sendLead\(\s*lead\s*,\s*req\s*\)\.catch\(/,
    'ingest-v2 must invoke metaCapi.sendLead(lead, req).catch(...) after save'
  );
});

// ── D. metaCapi surface + degraded-env behavior + payload shape ──────────

test('metaCapi exports the full Commit 2 surface', () => {
  const metaCapi = require('../services/metaCapi');
  for (const fn of [
    'extractRequestSignals', 'hashPii', 'normalizePhoneForHash',
    'splitName', 'buildEventEntry',
    'sendLead', 'sendQualifiedLead',
  ]) {
    assert.equal(typeof metaCapi[fn], 'function', `metaCapi must export ${fn}()`);
  }
});

test('sendLead and sendQualifiedLead skip cleanly when env is missing', async () => {
  const metaCapi = require('../services/metaCapi');

  // Save & clear env so this test is hermetic regardless of caller setup.
  const before = {
    pixel: process.env.META_PIXEL_ID,
    token: process.env.META_CAPI_ACCESS_TOKEN,
    test:  process.env.META_CAPI_TEST_EVENT_CODE,
  };
  delete process.env.META_PIXEL_ID;
  delete process.env.META_CAPI_ACCESS_TOKEN;
  delete process.env.META_CAPI_TEST_EVENT_CODE;
  try {
    const r1 = await metaCapi.sendLead({ _id: 'fake-id', metaEventId: 'x' });
    assert.deepEqual(r1, { sent: false, reason: 'env-missing' },
      'sendLead must return env-missing when META_PIXEL_ID / META_CAPI_ACCESS_TOKEN are unset');

    const r2 = await metaCapi.sendQualifiedLead({ _id: 'fake-id' });
    assert.deepEqual(r2, { sent: false, reason: 'env-missing' });

    const r3 = await metaCapi.sendLead(null);
    assert.deepEqual(r3, { sent: false, reason: 'missing-lead' });
  } finally {
    if (before.pixel !== undefined) process.env.META_PIXEL_ID         = before.pixel;
    if (before.token !== undefined) process.env.META_CAPI_ACCESS_TOKEN = before.token;
    if (before.test  !== undefined) process.env.META_CAPI_TEST_EVENT_CODE = before.test;
  }
});

test('metaCapi.extractRequestSignals returns only present fields', () => {
  const { extractRequestSignals } = require('../services/metaCapi');

  const both = extractRequestSignals({ ip: '203.0.113.42', headers: { 'user-agent': 'Mozilla/5.0 Test' } });
  assert.deepEqual(both, { ipAddress: '203.0.113.42', userAgent: 'Mozilla/5.0 Test' });

  assert.deepEqual(extractRequestSignals({}), {});
  assert.deepEqual(extractRequestSignals({ ip: '', headers: {} }), {});

  const longUa = 'a'.repeat(2000);
  const bounded = extractRequestSignals({ ip: '1.2.3.4', headers: { 'user-agent': longUa } });
  assert.equal(bounded.userAgent.length, 1024, 'userAgent must be truncated to 1024 chars');
});

test('metaCapi.hashPii normalizes (trim+lowercase) before SHA-256', () => {
  const { hashPii } = require('../services/metaCapi');
  const a = hashPii('  Jane@Example.COM  ');
  const b = hashPii('jane@example.com');
  assert.equal(a, b, 'hashPii must trim + lowercase before hashing');
  assert.equal(typeof a, 'string');
  assert.equal(a.length, 64, 'SHA-256 hex is 64 chars');
  assert.equal(hashPii(''),  undefined, 'empty input → undefined (Meta rejects empty PII)');
  assert.equal(hashPii(null), undefined);
});

test('metaCapi.splitName splits customerName into fn + ln', () => {
  const { splitName } = require('../services/metaCapi');
  assert.deepEqual(splitName('Jane Doe'),       { fn: 'Jane', ln: 'Doe' });
  assert.deepEqual(splitName('Madonna'),         { fn: 'Madonna', ln: undefined });
  assert.deepEqual(splitName('María del Carmen Pérez'),
    { fn: 'María', ln: 'del Carmen Pérez' });
  assert.deepEqual(splitName(''), { fn: undefined, ln: undefined });
  assert.deepEqual(splitName(undefined), { fn: undefined, ln: undefined });
});

test('metaCapi.buildEventEntry produces a CAPI-spec-compliant entry', () => {
  const { buildEventEntry, hashPii } = require('../services/metaCapi');
  const lead = {
    _id: '6a148cee632be42f147938f3',
    customerName:  'Jane Doe',
    customerEmail: 'jane@example.com',
    customerPhone: '+15555550100',
    originCity:    'Beverly Hills',
    originState:   'CA',
    originZip:     '90210',
    metaEventId:   '550e8400-e29b-41d4-a716-446655440000',
    fbp:           'fb.1.1700000000000.123456789',
    fbc:           'fb.1.1700000000000.AbCdEf',
    ipAddress:     '203.0.113.42',
    userAgent:     'Mozilla/5.0 Test',
    eventSourceUrl: 'https://moveleads.cloud/get-quote',
  };

  const entry = buildEventEntry(lead);
  assert.equal(entry.event_name,       'Lead');
  assert.equal(entry.action_source,    'website');
  assert.equal(entry.event_id,         lead.metaEventId);
  assert.equal(entry.event_source_url, lead.eventSourceUrl);
  assert.ok(Number.isInteger(entry.event_time) && entry.event_time > 1_600_000_000,
    'event_time must be a unix seconds integer');

  const u = entry.user_data;
  // Hashed PII — assert deep equality against the same hash computed inline.
  assert.deepEqual(u.em, [hashPii('jane@example.com')]);
  assert.deepEqual(u.ph, [hashPii('15555550100')], 'phone hashed as digits-only with country code');
  assert.deepEqual(u.fn, [hashPii('Jane')]);
  assert.deepEqual(u.ln, [hashPii('Doe')]);
  assert.deepEqual(u.ct, [hashPii('Beverly Hills')]);
  assert.deepEqual(u.st, [hashPii('CA')]);
  assert.deepEqual(u.zp, [hashPii('90210')]);
  assert.deepEqual(u.external_id, [hashPii(String(lead._id))]);

  // Plaintext fields per Meta spec
  assert.equal(u.fbp,               lead.fbp);
  assert.equal(u.fbc,               lead.fbc);
  assert.equal(u.client_ip_address, lead.ipAddress);
  assert.equal(u.client_user_agent, lead.userAgent);

  // The synthetic `noemail+…@moveleads.cloud` placeholder MUST be stripped —
  // hashing it would produce a value that matches nothing Meta knows.
  const leadWithPlaceholder = { ...lead, customerEmail: 'noemail+5555550100@moveleads.cloud' };
  const e2 = buildEventEntry(leadWithPlaceholder);
  assert.equal(e2.user_data.em, undefined,
    'noemail+ placeholders must NOT be hashed and sent as em');

  // QualifiedLead event variant
  const qualified = buildEventEntry(lead, { eventName: 'QualifiedLead' });
  assert.equal(qualified.event_name, 'QualifiedLead');
});

test('metaCapi.sendLead targets graph.facebook.com with the right URL shape', () => {
  // Source-level check: the GRAPH endpoint string is constructed from
  // graph.facebook.com + version + pixelId + /events. If anyone edits that
  // construction by accident, we want the test to scream.
  assert.match(
    metaCapiSrc,
    /https:\/\/graph\.facebook\.com\/\$\{GRAPH_API_VERSION\}\/\$\{pixelId\}\/events/,
    'metaCapi must POST to graph.facebook.com/<version>/<pixelId>/events'
  );

  assert.match(metaCapiSrc, /Authorization:\s*`Bearer \$\{token\}`/,
    'metaCapi must send the access token as a Bearer header');

  assert.match(metaCapiSrc, /test_event_code/,
    'metaCapi must honor META_CAPI_TEST_EVENT_CODE for QA routing');

  // Idempotency gate: conditional updateOne BEFORE the HTTP call.
  assert.match(
    metaCapiSrc,
    /metaCapiSentAt:\s*\{\s*\$exists:\s*false\s*\}/,
    'sendLead must guard with a conditional updateOne on metaCapiSentAt before the HTTP call'
  );
  assert.match(
    metaCapiSrc,
    /metaQualifiedSentAt:\s*\{\s*\$exists:\s*false\s*\}/,
    'sendQualifiedLead must guard with a conditional updateOne on metaQualifiedSentAt'
  );

  // Rollback on HTTP failure so a manual re-fire can succeed.
  assert.match(
    metaCapiSrc,
    /\$unset:\s*\{\s*metaCapiSentAt:\s*''/,
    'sendLead must $unset metaCapiSentAt on HTTP failure so re-fire is possible'
  );
});

// ── E. .env documentation ────────────────────────────────────────────────

test('server .env.example documents META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, META_CAPI_TEST_EVENT_CODE', () => {
  assert.match(envExampleSrc, /^META_PIXEL_ID\s*=/m);
  assert.match(envExampleSrc, /^META_CAPI_ACCESS_TOKEN\s*=/m);
  assert.match(envExampleSrc, /^META_CAPI_TEST_EVENT_CODE\s*=/m);
});

test('client .env.production.example documents VITE_META_PIXEL_ID', () => {
  assert.match(envProdExampleSrc, /^VITE_META_PIXEL_ID\s*=/m,
    'client/.env.production.example must list VITE_META_PIXEL_ID');
});

// ── F. Client wiring ─────────────────────────────────────────────────────

test('client metaPixel helper exports the expected surface', () => {
  // loadPixel + trackLead are defined in metaPixel.js; readers may be defined
  // OR re-exported from metaPixelCore after the core extraction.
  for (const name of ['loadPixel', 'trackLead']) {
    assert.match(metaPixelSrc, new RegExp(`export\\s+function\\s+${name}\\b`),
      `metaPixel.js must export ${name}()`);
  }
  for (const name of ['generateEventId', 'readFbp', 'readFbc', 'eventSourceUrl']) {
    assert.match(metaPixelSrc, new RegExp(`\\b${name}\\b`),
      `metaPixel.js must export/re-export ${name}`);
  }

  // loadPixel reads VITE_META_PIXEL_ID and short-circuits when unset.
  assert.match(metaPixelSrc, /import\.meta\.env\.VITE_META_PIXEL_ID/);
  assert.match(metaPixelSrc, /if\s*\(\s*!PIXEL_ID\s*\)/,
    'loadPixel must short-circuit when VITE_META_PIXEL_ID is missing');

  // Homeowner events are isolated via trackSingle — no bare track broadcast.
  assert.match(metaPixelSrc, /trackSingle\(\s*PIXEL_ID\s*,\s*['"]Lead['"]/,
    'trackLead must use trackSingle(PIXEL_ID, "Lead", …) for pixel isolation');
  assert.doesNotMatch(metaPixelSrc, /fbq\(\s*['"]track['"]\s*,/,
    'no bare fbq("track", …) broadcast calls — use trackSingle');

  // The shared core carries the snippet injector, fbq guard, eventID dedup,
  // and the fbclid fallback.
  assert.match(metaPixelCoreSrc, /export function ensureFbevents/);
  assert.match(metaPixelCoreSrc, /export function trackSingle/);
  assert.match(metaPixelCoreSrc, /typeof\s+fbq\s*!==\s*['"]function['"]/);
  assert.match(metaPixelCoreSrc, /eventID:\s*eventId/,
    'core trackSingle must pass eventID for browser↔CAPI dedup');
  assert.match(metaPixelCoreSrc, /fbclid/,
    'readFbc must fall back to the ?fbclid= URL param');
});

test('main.jsx boots the Meta Pixel exactly once', () => {
  assert.match(mainJsxSrc, /from\s+['"]\.\/utils\/metaPixel['"]/);
  assert.match(mainJsxSrc, /\bloadPixel\(\)/,
    'main.jsx must call loadPixel() during boot');
});

test('GetQuoteV6 wires Meta attribution + fires trackLead after non-idempotent 200', () => {
  // Imports the helpers we need
  for (const name of ['generateEventId', 'readFbp', 'readFbc', 'eventSourceUrl', 'trackLead']) {
    assert.match(
      getQuoteV6Src,
      new RegExp(`\\b${name}\\b`),
      `GetQuoteV6.jsx must import + use ${name}`
    );
  }

  // Event ID is generated BEFORE the POST, not after, so the same value
  // flows to the server in the body AND to fbq after the 200.
  const eventIdGenIdx = getQuoteV6Src.indexOf('generateEventId()');
  // Use `await fetch(` as the anchor — `/api/leads/ingest-v2` also appears
  // in the docstring at the top of the file.
  const fetchIdx      = getQuoteV6Src.indexOf('await fetch(');
  const trackLeadIdx  = getQuoteV6Src.indexOf('trackLead(');
  assert.ok(eventIdGenIdx > -1 && fetchIdx > -1 && trackLeadIdx > -1,
    'expected all three call sites to exist in GetQuoteV6.jsx');
  assert.ok(eventIdGenIdx < fetchIdx,
    'metaEventId must be generated BEFORE the fetch so the server receives it');
  assert.ok(fetchIdx < trackLeadIdx,
    'trackLead must fire AFTER the fetch resolves');

  // All four client-supplied fields make it into the POST body via
  // conditional assignment (matches the server's conditional-spread style).
  assert.match(getQuoteV6Src, /payload\.metaEventId\s*=\s*metaEventId/);
  assert.match(getQuoteV6Src, /payload\.fbp\s*=\s*metaFbp/);
  assert.match(getQuoteV6Src, /payload\.fbc\s*=\s*metaFbc/);
  assert.match(getQuoteV6Src, /payload\.eventSourceUrl\s*=\s*metaSourceUrl/);

  // Idempotent retries (server returns idempotent: true) must NOT fire
  // a second browser Lead event — that's what dedup is for, but the
  // browser side has no metaCapiSentAt to gate on.
  assert.match(
    getQuoteV6Src,
    /if\s*\(\s*!json\.idempotent\s*&&[^)]*\)\s*\{\s*trackLead/,
    'trackLead must remain gated on !json.idempotent (retries do not re-fire) — now also AND-gated'
  );
});

test('Lead event is gated to Long Distance (server + browser); Local fires nothing', () => {
  // Single source of truth: the ONLY mileage threshold is the distance
  // derivation in the ingest route. Tracking gates compare to its string output.
  assert.match(ingestRouteSrc, /miles\s*>\s*100\s*\?\s*['"]Long Distance['"]\s*:\s*['"]Local['"]/,
    'distance derivation (miles>100) remains the single classification source');

  // Server: 201 response exposes the canonical classification for the browser.
  assert.match(ingestRouteSrc, /distance:\s*lead\.distance/,
    'ingest 201 response must include distance: lead.distance');

  // Server: CAPI Lead fires ONLY when lead.distance === "Long Distance".
  assert.match(
    ingestRouteSrc,
    /if\s*\(\s*lead\.distance\s*===\s*['"]Long Distance['"]\s*\)\s*\{[\s\S]{0,240}metaCapi\.sendLead\(/,
    'sendLead must be wrapped in if (lead.distance === "Long Distance") — Local does not fire CAPI'
  );

  // Browser: trackLead fires ONLY for non-idempotent Long Distance responses.
  // (Covers all three: Long Distance fires, Local does not, idempotent retries do not.)
  assert.match(
    getQuoteV6Src,
    /!json\.idempotent\s*&&\s*json\.lead\?\.distance\s*===\s*['"]Long Distance['"]/,
    'browser trackLead must require !json.idempotent && json.lead.distance === "Long Distance"'
  );
});

console.log('\nMeta Pixel + CAPI lock-in tests scheduled (Commit 1 + Commit 2).');
