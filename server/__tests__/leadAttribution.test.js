/**
 * Lead attribution — lock-in suite.
 *
 * Pins:
 *   A. normalizeAttribution keeps path only, referrer host only, and derives
 *      a channel; bad input degrades to 'direct' without throwing.
 *   B. The V2 validator accepts an optional, strict `attribution` object and
 *      still accepts payloads without it (old clients keep working).
 *   C. Lead schema has the attribution subdocument with the same channel enum.
 *   D. ingest-v2 writes normalized attribution, never the raw client object.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeAttribution, CHANNELS } = require('../utils/attribution');
const { validateLeadPayloadV2 } = require('../validators/leadIngestV2');
const Lead = require('../models/Lead');

test('A1. strips query strings and referrer paths', () => {
  const a = normalizeAttribution({
    landingPage: '/moving/dallas-to-austin?email=someone@example.com',
    referrer: 'https://www.google.com/search?q=dallas+to+austin+movers',
  });
  assert.equal(a.landingPage, '/moving/dallas-to-austin');
  assert.equal(a.referrerHost, 'google.com');
  assert.equal(a.channel, 'organic_search');
});

test('A2. classifies channels', () => {
  const ch = (x) => normalizeAttribution(x).channel;
  assert.equal(ch({ referrer: 'https://www.bing.com/' }), 'organic_search');
  assert.equal(ch({ referrer: 'https://duckduckgo.com/' }), 'organic_search');
  assert.equal(ch({ referrer: 'https://chatgpt.com/' }), 'ai_assistant');
  assert.equal(ch({ referrer: 'https://gemini.google.com/app' }), 'ai_assistant');
  assert.equal(ch({ referrer: 'https://www.facebook.com/' }), 'social');
  assert.equal(ch({ referrer: 'https://moversboost.com/list' }), 'referral');
  assert.equal(ch({ utmSource: 'newsletter', utmMedium: 'email' }), 'campaign');
  assert.equal(ch({ utmSource: 'google', utmMedium: 'cpc', referrer: 'https://google.com/' }), 'paid');
  assert.equal(ch({ referrer: 'https://moveleads.cloud/moving' }), 'direct');
  assert.equal(ch({}), 'direct');
});

test('A3. bad input never throws', () => {
  for (const bad of [null, undefined, 'x', 42, { referrer: 'javascript:alert(1)' }, { landingPage: {} }, { firstSeenAt: 'nope' }]) {
    const a = normalizeAttribution(bad);
    assert.equal(a.channel, 'direct');
    assert.equal(a.firstSeenAt, undefined);
  }
});

const base = {
  firstName: 'Jane',
  customerPhone: '+15555550100',
  originZip: '90210',
  destinationZip: '10001',
  moveDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  homeSize: '2 Bedroom',
  intentConfirmed: true,
  clientSubmissionId: 'attribution-test-uuid',
  funnelVersion: 'v6',
};

test('B1. validator accepts payloads with and without attribution', () => {
  assert.equal(validateLeadPayloadV2(base).success, true);
  const r = validateLeadPayloadV2({
    ...base,
    attribution: {
      landingPage: '/moving/dallas-to-austin',
      referrer: 'https://www.google.com/',
      utmSource: 'google', utmMedium: 'organic', utmCampaign: 'x',
      firstSeenAt: '2026-10-06T10:00:00.000Z',
    },
  });
  assert.equal(r.success, true);
});

test('B2. validator rejects unknown keys inside attribution', () => {
  const r = validateLeadPayloadV2({ ...base, attribution: { landingPage: '/', email: 'x@y.com' } });
  assert.equal(r.success, false);
});

test('C1. Lead schema has attribution with the shared channel enum', () => {
  const p = Lead.schema.path('attribution');
  assert.ok(p, 'Lead.attribution must exist');
  assert.deepEqual([...p.schema.path('channel').enumValues].sort(), [...CHANNELS].sort());
});

test('D1. ingest-v2 stores normalized attribution only', () => {
  const src = fs.readFileSync(path.join(__dirname, '../routes/leadIngestV2.js'), 'utf8');
  assert.match(src, /attribution:\s*normalizeAttribution\(data\.attribution\)/);
  assert.doesNotMatch(src, /attribution:\s*data\.attribution\b/);
});

test('E1. lead-sources route is admin-gated, read-only and mounted before /api/admin', () => {
  const src = fs.readFileSync(path.join(__dirname, '../routes/admin/leadSources.js'), 'utf8');
  assert.match(src, /router\.use\(admin\)/);
  assert.match(src, /router\.get\('\/'/);
  assert.doesNotMatch(src, /router\.(post|put|patch|delete)\(/);
  assert.match(src, /from: PurchasedLead\.collection\.name/);
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const mount = server.indexOf("'/api/admin/lead-sources'");
  const generic = server.indexOf("app.use('/api/admin',");
  assert.ok(mount > 0 && mount < generic, 'must be mounted before the generic /api/admin router');
});
