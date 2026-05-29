/**
 * Deal Room — full scenario integration pass (2026-05-29).
 *
 * Companion to docs/audits/deal-room-pipeline/09-scenario-test-results.md.
 *
 * Purpose: prove every route in the Deal Room pipeline works TOGETHER,
 * not just individually. The audit (00-08) established per-route
 * correctness; PR-D1/D2/D3 closed the highest-confidence gaps. This
 * suite drives the actual route handlers (loaded from the real router
 * modules) through ten scenarios with stubbed Mongoose model methods,
 * end-to-end, with no Mongo and no HTTP server boot.
 *
 * Methodology:
 *   - require the real router modules (routes/leads.js,
 *     routes/adminInventory.js, etc.)
 *   - walk router.stack to find the handler for a given (method, path)
 *   - stub Lead/User/PurchasedLead/Transaction model methods with
 *     scenario-specific fakes
 *   - invoke handler(req, res) with a minimal stub Express req/res
 *   - assert response status/body + that the stubs were called in the
 *     expected sequence with the expected arguments
 *
 * Where a scenario CANNOT be fully verified at the handler level (e.g.
 * frontend rendering of distinct banners requires DOM), we fall back to
 * source-level lock-in assertions on the already-merged PR-D1 banner
 * branch and document the manual verification step in the runbook.
 *
 * Scope discipline:
 *   - read-only; no Lead/User/Transaction mutations
 *   - no new functionality; pure test harness
 *   - no Twilio / Stripe / Mongo connections required
 *   - no dependency additions
 *   - no production code touched
 *
 * Run: `node server/__tests__/dealRoomScenarioIntegration.test.js`
 */

// Set environment defaults BEFORE any require() that pulls in modules
// with module-load side effects. Two specific needs:
//   1. STRIPE_SECRET_KEY — services/billingService.js (a transitive
//      require of routes/leads.js) instantiates Stripe at module load.
//      Stripe throws "Neither apiKey nor config.authenticator provided"
//      if the env var is unset. Use a dummy test value; no real Stripe
//      call is ever made by these scenarios.
//   2. JWT_SECRET — middleware/auth.js may read it; setting a dummy
//      avoids any "JWT secret not set" startup failure surfaced during
//      require() chains.
if (!process.env.STRIPE_SECRET_KEY) process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_scenario_tests';
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'jwt_dummy_for_scenario_tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ── Helpers ───────────────────────────────────────────────────────────

// Find a handler in a router's stack by method + path. Returns the
// LAST function in the route's handler chain (the actual handler;
// preceding entries are middleware like auth/admin).
function findHandler(router, method, path) {
  for (const layer of router.stack || []) {
    if (layer.route && layer.route.path === path) {
      const methods = layer.route.methods || {};
      if (methods[method.toLowerCase()]) {
        const stack = layer.route.stack;
        return stack[stack.length - 1].handle;
      }
    }
  }
  throw new Error(`Could not find ${method.toUpperCase()} ${path} in router`);
}

// Minimal Express res stub. Tracks status + body + which sendStatus/json
// was called.
function makeRes() {
  return {
    _status: 200,
    _body: null,
    _ended: false,
    status(c) { this._status = c; return this; },
    json(b)  { this._body = b; this._ended = true; return this; },
    sendStatus(c) { this._status = c; this._ended = true; return this; },
    type() { return this; },
    send() { this._ended = true; return this; },
  };
}

// Temporarily replace a set of method properties on an object. Returns
// a restore function. Designed for stubbing Mongoose Model classes
// (Lead.find, Lead.countDocuments, etc.).
function stub(obj, methods) {
  const originals = {};
  for (const [name, impl] of Object.entries(methods)) {
    originals[name] = obj[name];
    obj[name] = impl;
  }
  return () => {
    for (const [name, orig] of Object.entries(originals)) {
      if (orig === undefined) delete obj[name];
      else obj[name] = orig;
    }
  };
}

// Control ENABLE_DEAL_ROOM via env. Required because some route files
// destructure `const { isEnabled } = require(...)` at module load — by
// the time a test runs, the local `isEnabled` binding is captured and
// stubbing dealRoomFeature.isEnabled doesn't affect it. Env-based control
// is universal: the helper reads from process.env every call.
function setDealRoomFlag(value) {
  const prev = process.env.ENABLE_DEAL_ROOM;
  if (value) process.env.ENABLE_DEAL_ROOM = 'true';
  else delete process.env.ENABLE_DEAL_ROOM;
  return () => {
    if (prev === undefined) delete process.env.ENABLE_DEAL_ROOM;
    else process.env.ENABLE_DEAL_ROOM = prev;
  };
}

// Mongoose .find().select().sort().lean() — / .find().sort().select().limit().lean()
// chain. The handler under test chains these in various orders, so the
// stub must accept any chain order and resolve to the configured array.
function findChainReturning(value) {
  const result = {
    select() { return this; },
    sort()   { return this; },
    limit()  { return this; },
    skip()   { return this; },
    populate() { return this; },
    lean()   { return Promise.resolve(value); },
    then(onFulfilled, onRejected) {
      // Allows `await Lead.find(...)` without further chaining
      return Promise.resolve(value).then(onFulfilled, onRejected);
    },
  };
  return result;
}

// ──────────────────────────────────────────────────────────────────────
// SCENARIO 1 — Feature flag OFF
// ──────────────────────────────────────────────────────────────────────

test('S1.1 GET /api/leads/deals → 404 with documented msg when ENABLE_DEAL_ROOM is off', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const leadsRouter = require('../routes/leads');

  const restoreFlag = setDealRoomFlag(false);
  try {
    const handler = findHandler(leadsRouter, 'GET', '/deals');
    const req = { user: { id: 'mover-1' }, query: {} };
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 404, 'must return 404 when flag is off');
    assert.deepEqual(res._body, { msg: 'Deal Room is not enabled' },
      'response body must document why the endpoint is off');
  } finally { restoreFlag(); }
});

test('S1.2 GET /api/admin/inventory/deal-room/summary → 200 with enabled:false when off', async () => {
  // PR-D3 contract: summary endpoint MUST NOT 503/404 when flag is off.
  // Operators query this exact endpoint to learn the flag state.
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const Lead = require('../models/Lead');
  const adminInventory = require('../routes/adminInventory');

  const restoreFlag = setDealRoomFlag(false);
  const restoreLead = stub(Lead, {
    countDocuments: () => Promise.resolve(0),
    find: () => findChainReturning([]),
  });
  try {
    const handler = findHandler(adminInventory, 'GET', '/deal-room/summary');
    const req = { user: { id: 'admin-1', role: 'admin' } };
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200, 'summary must return 200 even when flag is off');
    assert.equal(res._body.enabled, false, 'enabled must reflect flag state');
    assert.equal(res._body.totalDealRoomLeads, 0);
    assert.equal(res._body.availableDealRoomLeads, 0);
    assert.equal(res._body.purchasedDealRoomLeads, 0);
    assert.equal(res._body.oldest, null);
    assert.equal(res._body.newest, null);
    assert.ok(typeof res._body.generatedAt === 'string',
      'generatedAt must be an ISO string');
  } finally { restoreLead(); restoreFlag(); }
});

test('S1.3 POST /api/admin/inventory/bulk → 503 when flag is off (move_to_deal_room blocked)', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const adminInventory = require('../routes/adminInventory');

  const restoreFlag = setDealRoomFlag(false);
  try {
    const handler = findHandler(adminInventory, 'POST', '/bulk');
    const req = {
      user: { id: 'admin-1', role: 'admin' },
      body: { leadIds: ['64a0000000000000000000aa'], action: 'move_to_deal_room', dealPrice: 99 },
    };
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 503,
      'admin bulk endpoint must 503 when flag is off — operator should not be able to manipulate Deal Room state');
    assert.ok(res._body.msg && /not enabled|disabled/i.test(res._body.msg),
      'response body must explain the 503');
  } finally { restoreFlag(); }
});

test('S1.4 PR-D1 client distinguishes flag-off from real-empty (source-level)', () => {
  // Frontend cannot be invoked from node:test. Verify the PR-D1 banner
  // branch exists in the source — already locked by
  // dealRoomDisabledBannerDistinction.test.js. Re-affirm here so the
  // scenario file documents the integration.
  const dealsJsx = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'dashboard', 'Deals.jsx'),
    'utf8'
  );
  assert.match(dealsJsx, /data-testid\s*=\s*['"]deal-room-disabled-banner['"]/,
    'Disabled banner must exist with data-testid="deal-room-disabled-banner"');
  assert.match(dealsJsx, /data-testid\s*=\s*['"]deal-room-empty-state['"]/,
    'Empty state must exist with data-testid="deal-room-empty-state"');
  assert.match(dealsJsx, /setFeatureDisabled\(\s*true\s*\)/,
    '404 branch must set featureDisabled true');
});

// ──────────────────────────────────────────────────────────────────────
// SCENARIO 2 — Feature flag ON, empty inventory
// ──────────────────────────────────────────────────────────────────────

test('S2.1 GET /api/leads/deals → 200 + [] when flag on and no Deal Room leads exist', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const Lead = require('../models/Lead');
  const leadsRouter = require('../routes/leads');

  const restoreFlag = setDealRoomFlag(true);
  // Capture the query that was passed to Lead.find so we can verify the
  // 5-clause filter (PR-D2 added the buyers self-exclude).
  let observedQuery = null;
  const restoreLead = stub(Lead, {
    find: (q) => { observedQuery = q; return findChainReturning([]); },
  });
  try {
    const handler = findHandler(leadsRouter, 'GET', '/deals');
    const req = { user: { id: 'mover-empty', role: 'mover' }, query: {} };
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.deepEqual(res._body, [], 'response must be an empty array');
    // Verify the query carries all 5 filter clauses
    assert.equal(observedQuery.inventoryChannel, 'deal_room');
    assert.deepEqual(observedQuery.status, { $in: ['Available', 'READY_FOR_DISTRIBUTION'] });
    assert.ok(observedQuery.moveDate && observedQuery.moveDate.$gte instanceof Date);
    assert.deepEqual(observedQuery['buyers.company'], { $ne: 'mover-empty' },
      'PR-D2 self-exclusion clause must be present');
    assert.deepEqual(observedQuery.distributionDecision,
      { $in: ['system_approved', 'admin_approved'] },
      'Phase 3 moverVisibilityFilter clause must be present');
  } finally { restoreLead(); restoreFlag(); }
});

test('S2.2 GET /deal-room/summary → enabled:true, totals 0 when no Deal Room leads', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const Lead = require('../models/Lead');
  const adminInventory = require('../routes/adminInventory');

  const restoreFlag = setDealRoomFlag(true);
  const restoreLead = stub(Lead, {
    countDocuments: () => Promise.resolve(0),
    find: () => findChainReturning([]),
  });
  try {
    const handler = findHandler(adminInventory, 'GET', '/deal-room/summary');
    const req = { user: { id: 'admin-1', role: 'admin' } };
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.enabled, true);
    assert.equal(res._body.totalDealRoomLeads, 0);
    assert.equal(res._body.availableDealRoomLeads, 0);
    assert.equal(res._body.purchasedDealRoomLeads, 0);
    assert.equal(res._body.oldest, null);
    assert.equal(res._body.newest, null);
  } finally { restoreLead(); restoreFlag(); }
});

// ──────────────────────────────────────────────────────────────────────
// SCENARIO 3 — Admin moves valid leads (validation matrix)
// ──────────────────────────────────────────────────────────────────────
//
// The /bulk handler uses lead.save() (Mongoose document save) for the
// happy path which is hard to stub fully. Per-lead REJECTION paths are
// the high-value tests — they're synchronous validation checks that
// exercise every gate.

function makeBulkRequest(overrides = {}) {
  return {
    user: { id: 'admin-1', role: 'admin' },
    body: {
      leadIds: [],
      action: 'move_to_deal_room',
      ...overrides,
    },
  };
}

test('S3.1 400 when neither dealPrice nor discountPercent provided', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const adminInventory = require('../routes/adminInventory');
  const restoreFlag = setDealRoomFlag(true);
  try {
    const handler = findHandler(adminInventory, 'POST', '/bulk');
    const req = makeBulkRequest({ leadIds: ['64a0000000000000000000aa'] });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 400);
  } finally { restoreFlag(); }
});

test('S3.2 400 when BOTH dealPrice and discountPercent provided (XOR)', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const adminInventory = require('../routes/adminInventory');
  const restoreFlag = setDealRoomFlag(true);
  try {
    const handler = findHandler(adminInventory, 'POST', '/bulk');
    const req = makeBulkRequest({
      leadIds: ['64a0000000000000000000aa'],
      dealPrice: 99,
      discountPercent: 40,
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 400,
      'XOR validation must 400 when both dealPrice and discountPercent are sent');
  } finally { restoreFlag(); }
});

test('S3.3 400 when leadIds is empty', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const adminInventory = require('../routes/adminInventory');
  const restoreFlag = setDealRoomFlag(true);
  try {
    const handler = findHandler(adminInventory, 'POST', '/bulk');
    const req = makeBulkRequest({ leadIds: [], dealPrice: 99 });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 400);
  } finally { restoreFlag(); }
});

test('S3.4 400 when discountPercent ≤ 0 or ≥ 100', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const adminInventory = require('../routes/adminInventory');
  const restoreFlag = setDealRoomFlag(true);
  try {
    const handler = findHandler(adminInventory, 'POST', '/bulk');
    for (const pct of [0, -10, 100, 200]) {
      const req = makeBulkRequest({ leadIds: ['64a0000000000000000000aa'], discountPercent: pct });
      const res = makeRes();
      await handler(req, res);
      assert.equal(res._status, 400, `discountPercent=${pct} must 400`);
    }
  } finally { restoreFlag(); }
});

test('S3.5 400 when dealPrice ≤ 0', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const adminInventory = require('../routes/adminInventory');
  const restoreFlag = setDealRoomFlag(true);
  try {
    const handler = findHandler(adminInventory, 'POST', '/bulk');
    for (const dp of [0, -5]) {
      const req = makeBulkRequest({ leadIds: ['64a0000000000000000000aa'], dealPrice: dp });
      const res = makeRes();
      await handler(req, res);
      assert.equal(res._status, 400, `dealPrice=${dp} must 400`);
    }
  } finally { restoreFlag(); }
});

test('S3.6 Per-lead rejection: lead with non-empty buyers is rejected with documented reason', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const Lead = require('../models/Lead');
  const auditLog = require('../utils/auditLog');
  const adminInventory = require('../routes/adminInventory');

  const restoreFlag = setDealRoomFlag(true);
  // Stub Lead.findById to return a "previously purchased" lead
  const restoreLead = stub(Lead, {
    findById: () => Promise.resolve({
      _id: '64a0000000000000000000aa',
      status: 'Purchased',
      buyers: [{ company: 'other-mover' }],
      buyNowPrice: 100,
      originalPrice: 200,
      auctionStatus: 'sold',
      distributionDecision: 'system_approved',
      moveDate: new Date(Date.now() + 86400000),
    }),
  });
  const restoreAudit = stub(auditLog, { logAdminAction: () => {} });
  try {
    const handler = findHandler(adminInventory, 'POST', '/bulk');
    const req = makeBulkRequest({
      leadIds: ['64a0000000000000000000aa'],
      dealPrice: 99,
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200,
      'per-lead failures still produce HTTP 200 with rejected[] populated');
    assert.equal(res._body.processedCount, 0);
    assert.equal(res._body.rejectedCount, 1);
    assert.ok(/already purchased|buyers/i.test(res._body.rejected[0].reason),
      `purchase-protection reason expected; got: ${res._body.rejected[0].reason}`);
  } finally { restoreAudit(); restoreLead(); restoreFlag(); }
});

test('S3.7 Per-lead rejection: lead with past moveDate is rejected with Lifecycle: prefix', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const Lead = require('../models/Lead');
  const auditLog = require('../utils/auditLog');
  const adminInventory = require('../routes/adminInventory');

  const restoreFlag = setDealRoomFlag(true);
  const restoreLead = stub(Lead, {
    findById: () => Promise.resolve({
      _id: '64a0000000000000000000bb',
      status: 'Available',
      buyers: [],
      buyNowPrice: 100,
      originalPrice: null,
      auctionStatus: 'active',
      distributionDecision: 'system_approved',
      moveDate: new Date(Date.now() - 86400000), // YESTERDAY
    }),
  });
  const restoreAudit = stub(auditLog, { logAdminAction: () => {} });
  try {
    const handler = findHandler(adminInventory, 'POST', '/bulk');
    const req = makeBulkRequest({ leadIds: ['64a0000000000000000000bb'], dealPrice: 99 });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.rejectedCount, 1);
    assert.match(res._body.rejected[0].reason, /Lifecycle:/i,
      'past-moveDate rejection must carry Lifecycle: prefix');
  } finally { restoreAudit(); restoreLead(); restoreFlag(); }
});

test('S3.8 Per-lead rejection: system_held lead is rejected with Quality: prefix', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const Lead = require('../models/Lead');
  const auditLog = require('../utils/auditLog');
  const adminInventory = require('../routes/adminInventory');

  const restoreFlag = setDealRoomFlag(true);
  const restoreLead = stub(Lead, {
    findById: () => Promise.resolve({
      _id: '64a0000000000000000000cc',
      status: 'Available',
      buyers: [],
      buyNowPrice: 100,
      originalPrice: null,
      auctionStatus: 'active',
      distributionDecision: 'system_held',  // FAILS isDistributable
      moveDate: new Date(Date.now() + 86400000),
    }),
  });
  const restoreAudit = stub(auditLog, { logAdminAction: () => {} });
  try {
    const handler = findHandler(adminInventory, 'POST', '/bulk');
    const req = makeBulkRequest({ leadIds: ['64a0000000000000000000cc'], dealPrice: 99 });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.rejectedCount, 1);
    assert.match(res._body.rejected[0].reason, /Quality:/i,
      'system_held rejection must carry Quality: prefix');
  } finally { restoreAudit(); restoreLead(); restoreFlag(); }
});

test('S3.9 Single + multi-lead processing: loop processes each leadId independently', async () => {
  // Spy that records every findById call. Both leads should be visited
  // (and both rejected here due to the past moveDate).
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const Lead = require('../models/Lead');
  const auditLog = require('../utils/auditLog');
  const adminInventory = require('../routes/adminInventory');

  const restoreFlag = setDealRoomFlag(true);
  const visited = [];
  const restoreLead = stub(Lead, {
    findById: (id) => {
      visited.push(String(id));
      return Promise.resolve({
        _id: id, status: 'Available', buyers: [], buyNowPrice: 100,
        originalPrice: null, auctionStatus: 'active',
        distributionDecision: 'system_approved',
        moveDate: new Date(Date.now() - 86400000),  // past — rejected
      });
    },
  });
  const restoreAudit = stub(auditLog, { logAdminAction: () => {} });
  try {
    const handler = findHandler(adminInventory, 'POST', '/bulk');
    const req = makeBulkRequest({
      leadIds: ['64a0000000000000000000aa', '64a0000000000000000000bb', '64a0000000000000000000cc'],
      dealPrice: 99,
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(visited.length, 3, 'all 3 leadIds must be visited (sequential loop)');
    assert.equal(res._body.rejectedCount, 3);
  } finally { restoreAudit(); restoreLead(); restoreFlag(); }
});

// ──────────────────────────────────────────────────────────────────────
// SCENARIO 4 — Deal Room visibility
// ──────────────────────────────────────────────────────────────────────

test('S4.1 Main feed query excludes inventoryChannel=deal_room (source-level)', () => {
  // Locked by purchaseFlowPhaseA.test.js — re-affirm so the scenario doc
  // points here.
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');
  // Main feed mover branch has $nin: ['deal_room', 'archived'].
  assert.match(
    src,
    /inventoryChannel\s*:\s*\{\s*\$nin\s*:\s*\[\s*['"]deal_room['"]\s*,\s*['"]archived['"]\s*\]\s*\}/,
    'Main feed must exclude inventoryChannel deal_room + archived'
  );
});

test('S4.2 /deals query has buyers self-exclusion (PR-D2 — already covered by S2.1)', () => {
  // Re-affirm the source-level invariant for the runbook crosswalk.
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');
  // The /deals handler block specifically (NOT the main feed which has
  // its own copy).
  const dealsBlock = src.match(/router\.get\(\s*['"]\/deals['"][\s\S]*?(?=router\.(get|post|put|patch|delete))/);
  assert.ok(dealsBlock, '/deals handler block must be findable');
  assert.match(dealsBlock[0], /['"]buyers\.company['"]\s*:\s*\{\s*\$ne\s*:\s*req\.user\.id\s*\}/,
    '/deals query must include the PR-D2 self-exclusion clause');
});

test('S4.3 /deals does NOT filter by mover coverage (documented design choice)', () => {
  // Notable design decision: Deal Room is a discount CATALOG. Mover
  // browses everything; their coverage is enforced at purchase time by
  // the main feed pricing pipeline (not the Deal Room view). This test
  // documents the choice and would go red if a future PR adds a
  // coverage filter without an accompanying decision.
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');
  const dealsBlock = src.match(/router\.get\(\s*['"]\/deals['"][\s\S]*?(?=router\.(get|post|put|patch|delete))/);
  assert.ok(dealsBlock);
  // Absent: pickupStates, deliveryStates, deliversNationwide, CoverageArea
  for (const forbidden of [/pickupStates/, /deliveryStates/, /deliversNationwide/, /CoverageArea/]) {
    assert.doesNotMatch(dealsBlock[0], forbidden,
      `/deals handler must NOT filter by coverage field ${forbidden} — Deal Room is a discount catalog by design`);
  }
});

// ──────────────────────────────────────────────────────────────────────
// SCENARIO 5 — Deal Room purchase (uses canonical buy-now)
// ──────────────────────────────────────────────────────────────────────
//
// The /buy-now handler in bids.js uses Mongoose document save() + atomic
// CAS via findOneAndUpdate. Full behavioral simulation requires stubbing
// 4 model methods + a save-able document. Below: verify the integration
// invariant — Deal Room purchase hits the SAME endpoint as marketplace,
// price is server-trusted, client sends no body.

test('S5.1 Client posts to /api/bids/:id/buy-now with NO body (server-trusted price)', () => {
  const dealsJsx = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'dashboard', 'Deals.jsx'),
    'utf8'
  );
  // The fetch call must NOT include a body.
  // Pin the fetch shape: method:POST, headers only, no `body:`.
  const buyNowFetch = dealsJsx.match(
    /fetch\(\s*`\$\{API_URL\}\/bids\/\$\{leadId\}\/buy-now`\s*,\s*\{[\s\S]*?\}\s*\)/
  );
  assert.ok(buyNowFetch, 'buy-now fetch call must be findable');
  assert.doesNotMatch(buyNowFetch[0], /\bbody\s*:/,
    'Deal Room buy-now fetch must NOT include a body — price is server-trusted');
});

test('S5.2 Server reads lead.buyNowPrice AFTER the lead-flip CAS (no client tamper)', () => {
  const bidsSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'bids.js'), 'utf8');
  // Pin the canonical sequence: findOneAndUpdate (lead flip) → const price = lead.buyNowPrice
  // The CAS must come BEFORE the price read.
  const casIdx = bidsSrc.indexOf('Lead.findOneAndUpdate');
  const priceIdx = bidsSrc.indexOf('lead.buyNowPrice');
  assert.ok(casIdx !== -1 && priceIdx !== -1);
  assert.ok(casIdx < priceIdx,
    'Lead.findOneAndUpdate (CAS) must run BEFORE the price read — server-trusted price');
});

test('S5.3 buy-now creates exactly one Transaction with type:"Lead Purchase"', () => {
  const bidsSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'bids.js'), 'utf8');
  // Look for Transaction.create with type:'Lead Purchase' inside the
  // buy-now handler block.
  const buyNowBlock = bidsSrc.match(/router\.post\(\s*['"]\/:leadId\/buy-now['"][\s\S]*?(?=router\.(get|post|put|patch|delete)|module\.exports)/);
  assert.ok(buyNowBlock, 'buy-now handler block must be findable');
  assert.match(
    buyNowBlock[0],
    /Transaction\.create\(\s*\{[\s\S]*?type\s*:\s*['"]Lead Purchase['"]/,
    'buy-now must create a Transaction with type "Lead Purchase"'
  );
});

test('S5.4 buy-now creates a PurchasedLead via the unique {company,lead} mutex', () => {
  const bidsSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'bids.js'), 'utf8');
  assert.match(
    bidsSrc,
    /new\s+PurchasedLead\(\s*\{[\s\S]*?company\s*:\s*req\.user\.id[\s\S]*?lead\s*:\s*lead\._id[\s\S]*?pricePaid\s*:\s*price/,
    'buy-now must instantiate PurchasedLead({company, lead, pricePaid})'
  );
});

test('S5.5 buy-now flips Lead.status to "Purchased" (removes from Deal Room visibility)', () => {
  const bidsSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'bids.js'), 'utf8');
  assert.match(bidsSrc, /lead\.status\s*=\s*['"]Purchased['"]/,
    'buy-now must set lead.status = "Purchased" — removes from /deals via status filter');
});

// ──────────────────────────────────────────────────────────────────────
// SCENARIO 6 — Insufficient balance
// ──────────────────────────────────────────────────────────────────────

test('S6.1 Insufficient balance → 402 + revert + no PurchasedLead', () => {
  // Pin the conditional debit shape + 402 path in bids.js.
  const bidsSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'bids.js'), 'utf8');
  const buyNowBlock = bidsSrc.match(/router\.post\(\s*['"]\/:leadId\/buy-now['"][\s\S]*?(?=router\.(get|post|put|patch|delete)|module\.exports)/);
  assert.ok(buyNowBlock);
  // Conditional debit (atomic): balance >= price
  assert.match(
    buyNowBlock[0],
    /User\.findOneAndUpdate\(\s*\{[\s\S]*?balance\s*:\s*\{\s*\$gte\s*:\s*price\s*\}[\s\S]*?\}[\s\S]*?\$inc\s*:\s*\{\s*balance\s*:\s*-\s*price\s*\}/,
    'Conditional debit must guard on balance >= price'
  );
  // 402 + Insufficient balance message
  assert.match(buyNowBlock[0], /res\.status\(\s*402\s*\)/);
  assert.match(buyNowBlock[0], /Insufficient balance/);
  // The revert of auctionStatus back to 'active'
  assert.match(buyNowBlock[0], /auctionStatus\s*:\s*['"]active['"]/);
});

// ──────────────────────────────────────────────────────────────────────
// SCENARIO 7 — Restore to main
// ──────────────────────────────────────────────────────────────────────

test('S7.1 restore_to_main sets inventoryChannel="main" + restores buyNowPrice from originalPrice', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const Lead = require('../models/Lead');
  const auditLog = require('../utils/auditLog');
  const adminInventory = require('../routes/adminInventory');

  const restoreFlag = setDealRoomFlag(true);

  // Build a Mongoose-style document with a mock save().
  let savedDoc = null;
  const leadDoc = {
    _id: '64a0000000000000000000aa',
    status: 'Available',
    buyers: [],
    buyNowPrice: 150,
    originalPrice: 250,
    auctionStatus: 'expired',
    inventoryChannel: 'deal_room',
    distributionDecision: 'system_approved',
    distributionModel: 'instant',
    moveDate: new Date(Date.now() + 86400000),
    save() { savedDoc = { ...this }; return Promise.resolve(this); },
  };
  const restoreLead = stub(Lead, { findById: () => Promise.resolve(leadDoc) });
  const restoreAudit = stub(auditLog, { logAdminAction: () => {} });
  try {
    const handler = findHandler(adminInventory, 'POST', '/bulk');
    const req = {
      user: { id: 'admin-1', role: 'admin' },
      body: { leadIds: ['64a0000000000000000000aa'], action: 'restore_to_main' },
    };
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.processedCount, 1);
    assert.equal(savedDoc.inventoryChannel, 'main', 'inventoryChannel must flip to main');
    assert.equal(savedDoc.buyNowPrice, 250, 'buyNowPrice must reset to originalPrice');
  } finally { restoreAudit(); restoreLead(); restoreFlag(); }
});

test('S7.2 restore_to_main does NOT call dispatchApprovedLead (passive re-list — documented)', () => {
  // Documented behavior in R5 of 07-risks-and-bugs.md. The cron
  // (jobs/reactivateLeads.js) handles re-dispatch on a 5-minute tick;
  // per-channel notifiedAt CAS may suppress the actual broadcast.
  const adminInventorySrc = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'adminInventory.js'), 'utf8'
  );
  assert.doesNotMatch(adminInventorySrc, /dispatchApprovedLead/,
    'adminInventory.js must NOT call dispatchApprovedLead — restore is passive re-list (documented R5)');
});

// ──────────────────────────────────────────────────────────────────────
// SCENARIO 8 — Refund parked behavior
// ──────────────────────────────────────────────────────────────────────

test('S8.1 No refund path touches Lead.inventoryChannel (parked behavior — documented R7)', () => {
  // Verified at the source level: refunds touch Transaction +
  // PurchasedLead.refunded + User.balance. They do NOT touch the Lead
  // document. Result: refunded Deal Room lead stays
  // inventoryChannel='deal_room' forever (operator must manually
  // restore/archive). Documented R7.
  for (const file of ['routes/admin.js', 'routes/billingWebhook.js', 'routes/disputes.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    // Refund handlers exist in these files; none should write
    // inventoryChannel.
    const refundBlocks = src.match(/refund|chargeback/gi) || [];
    if (refundBlocks.length > 0) {
      assert.doesNotMatch(
        src,
        /\binventoryChannel\s*=\s*['"](?:deal_room|main|archived)['"]/,
        `${file} contains refund logic; it must NOT write Lead.inventoryChannel (R7 documented)`
      );
    }
  }
});

// ──────────────────────────────────────────────────────────────────────
// SCENARIO 9 — Observability
// ──────────────────────────────────────────────────────────────────────

test('S9.1 [Deals] log line fires on /deals happy path', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const Lead = require('../models/Lead');
  const leadsRouter = require('../routes/leads');

  const restoreFlag = setDealRoomFlag(true);
  const restoreLead = stub(Lead, { find: () => findChainReturning([{ _id: 'l1', buyNowPrice: 100, originalPrice: 200 }]) });

  // Capture console.log
  const origLog = console.log;
  const logs = [];
  console.log = (...args) => { logs.push(args.join(' ')); };
  try {
    const handler = findHandler(leadsRouter, 'GET', '/deals');
    const req = { user: { id: 'mover-9' }, query: {} };
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    const dealLogLines = logs.filter(l => l.startsWith('[Deals] mover='));
    assert.equal(dealLogLines.length, 1, 'exactly one [Deals] line per request');
    assert.match(dealLogLines[0], /mover=mover-9/);
    assert.match(dealLogLines[0], /count=1/);
    assert.match(dealLogLines[0], /sort=updatedAt:-1/);
  } finally {
    console.log = origLog;
    restoreLead();
    restoreFlag();
  }
});

test('S9.2 Summary endpoint returns correct totals with non-empty inventory', async () => {
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const Lead = require('../models/Lead');
  const adminInventory = require('../routes/adminInventory');

  const restoreFlag = setDealRoomFlag(true);
  // Stub countDocuments to return different values per filter shape.
  const restoreLead = stub(Lead, {
    countDocuments: (filter) => {
      if (filter.status === 'Purchased') return Promise.resolve(2);
      if (filter.status && filter.status.$in) return Promise.resolve(5);
      return Promise.resolve(8);  // total (no status filter)
    },
    find: (filter) => {
      // Oldest/newest stub — returns a single Lead with a known updatedAt
      const updatedAt = new Date(Date.now() - 10 * 86400000); // 10 days old
      return findChainReturning([{ _id: 'l-oldest', updatedAt }]);
    },
  });
  try {
    const handler = findHandler(adminInventory, 'GET', '/deal-room/summary');
    const req = { user: { id: 'admin-1', role: 'admin' } };
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.enabled, true);
    assert.equal(res._body.totalDealRoomLeads, 8);
    assert.equal(res._body.availableDealRoomLeads, 5);
    assert.equal(res._body.purchasedDealRoomLeads, 2);
    assert.ok(res._body.oldest, 'oldest must be populated');
    assert.equal(res._body.oldest.leadId, 'l-oldest');
    assert.ok(res._body.oldest.ageDays >= 9 && res._body.oldest.ageDays <= 11,
      `ageDays ≈ 10 expected, got ${res._body.oldest.ageDays}`);
  } finally { restoreLead(); restoreFlag(); }
});

test('S9.3 move_to_deal_room writes an audit row via logAdminAction (source-level)', () => {
  // NOTE on test approach: stubbing logAdminAction behaviorally fails
  // because adminInventory.js destructures `const { logAdminAction } =
  // require('../utils/auditLog')` at module load — the local binding
  // is captured before any test can swap it. (Behavioral evidence is
  // visible in S9.3's earlier failing runs: stdout shows "[AuditLog]
  // failed to write: admin_action validation failed: actor: Cast to
  // ObjectId failed for value 'admin-1'", proving the real logger ran
  // with our stub never invoked.) We therefore verify the wiring at
  // the source level — the same approach dealRoom.test.js takes — and
  // pin the audit-row shape we expect to be persisted at runtime.
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminInventory.js'), 'utf8');
  // logAdminAction call inside the bulk handler
  assert.match(src, /logAdminAction\(/,
    'adminInventory.js must call logAdminAction(...)');
  // Action string follows the lead.inventory.<verb> convention
  assert.match(src, /action\s*:\s*`?lead\.inventory\.\$?\{?action\}?`?/,
    'logAdminAction.action must be `lead.inventory.${action}`');
  // before/after objects capture inventoryChannel + buyNowPrice + originalPrice + auctionStatus
  for (const field of ['inventoryChannel', 'buyNowPrice', 'originalPrice', 'auctionStatus']) {
    const re = new RegExp(`(before|after)[\\s\\S]{0,400}${field}`);
    assert.match(src, re, `audit before/after must include ${field}`);
  }
  // Metadata carries the operator-supplied reason + price fields.
  // Real shape spans multiple lines with conditional expressions; bump
  // the inter-key window enough to cover dealPrice + discountPercent +
  // their conditionals before we expect to find `reason:`.
  assert.match(src, /metadata\s*:\s*\{[\s\S]{0,500}reason\s*:/,
    'audit metadata must include reason');
});

// ──────────────────────────────────────────────────────────────────────
// SCENARIO 10 — Security / auth
// ──────────────────────────────────────────────────────────────────────

test('S10.1 POST /bulk has [auth, admin] middleware chain at the route level', () => {
  // Source-level — the middleware array in the route definition.
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminInventory.js'), 'utf8');
  assert.match(
    src,
    /router\.post\(\s*['"]\/bulk['"]\s*,\s*\[\s*auth\s*,\s*admin\s*\]/,
    'POST /bulk must be gated by [auth, admin] at the route level'
  );
});

test('S10.2 GET /deal-room/summary has [auth, admin] middleware chain', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminInventory.js'), 'utf8');
  assert.match(
    src,
    /router\.get\(\s*['"]\/deal-room\/summary['"]\s*,\s*\[\s*auth\s*,\s*admin\s*\]/,
    'GET /deal-room/summary must be gated by [auth, admin]'
  );
});

test('S10.3 /deals + /api/admin/inventory mounted under verifiedGate (auth + email verified)', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  // /api/leads (containing /deals) mounted with verifiedGate
  assert.match(serverSrc, /app\.use\(\s*['"]\/api\/leads['"]\s*,\s*verifiedGate/,
    '/api/leads must be mounted under verifiedGate');
  // /api/admin/inventory mounted with verifiedGate
  assert.match(serverSrc, /app\.use\(\s*['"]\/api\/admin\/inventory['"]\s*,\s*verifiedGate/,
    '/api/admin/inventory must be mounted under verifiedGate');
});

test('S10.4 admin middleware accepts admin + super_admin only', () => {
  const authSrc = fs.readFileSync(path.join(__dirname, '..', 'middleware', 'auth.js'), 'utf8');
  // The admin middleware should check role IN {admin, super_admin}
  assert.match(authSrc, /req\.user\.role\s*===\s*['"]admin['"]/,
    'admin middleware must accept role admin');
  assert.match(authSrc, /req\.user\.role\s*===\s*['"]super_admin['"]/,
    'admin middleware must accept role super_admin');
});

test('S10.5 /deals query mover identity-scoping: buyers.company $ne req.user.id', async () => {
  // S2.1 already proved this; re-affirm in security-scenario context.
  const dealRoomFeature = require('../utils/dealRoomFeature');
  const Lead = require('../models/Lead');
  const leadsRouter = require('../routes/leads');

  const restoreFlag = setDealRoomFlag(true);
  let observedQuery = null;
  const restoreLead = stub(Lead, {
    find: (q) => { observedQuery = q; return findChainReturning([]); },
  });
  try {
    const handler = findHandler(leadsRouter, 'GET', '/deals');
    const req = { user: { id: 'mover-isolation-test' }, query: {} };
    const res = makeRes();
    await handler(req, res);
    assert.deepEqual(observedQuery['buyers.company'], { $ne: 'mover-isolation-test' },
      'buyers.company self-exclusion must scope to req.user.id');
  } finally { restoreLead(); restoreFlag(); }
});

test('S10.6 Client buy-now request body is empty (price tamper vector closed)', () => {
  // Same invariant as S5.1 — re-affirm in security context.
  const dealsJsx = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'dashboard', 'Deals.jsx'),
    'utf8'
  );
  const buyNowFetch = dealsJsx.match(
    /fetch\(\s*`\$\{API_URL\}\/bids\/\$\{leadId\}\/buy-now`\s*,\s*\{[\s\S]*?\}\s*\)/
  );
  assert.ok(buyNowFetch);
  // No body key in the fetch options
  assert.doesNotMatch(buyNowFetch[0], /\bbody\s*:/,
    'No body in buy-now fetch — price cannot be tampered by client');
  // No expectedPrice / price / dealPrice keys
  for (const forbidden of [/expectedPrice/, /clientPrice/, /requestedPrice/]) {
    assert.doesNotMatch(buyNowFetch[0], forbidden,
      `buy-now fetch must NOT carry a client-controlled price field ${forbidden}`);
  }
});

test('S10.7 /buy-now backend ignores request body for price (always reads from doc)', () => {
  const bidsSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'bids.js'), 'utf8');
  const buyNowBlock = bidsSrc.match(/router\.post\(\s*['"]\/:leadId\/buy-now['"][\s\S]*?(?=router\.(get|post|put|patch|delete)|module\.exports)/);
  assert.ok(buyNowBlock);
  // Price is derived from lead.buyNowPrice; req.body.price would be a tamper signal.
  // Lock the absence of req.body.price / req.body.expectedPrice reads in the handler.
  for (const forbidden of [/req\.body\.price/, /req\.body\.expectedPrice/, /req\.body\.dealPrice/]) {
    assert.doesNotMatch(buyNowBlock[0], forbidden,
      `buy-now handler must NOT read price from req.body (${forbidden}) — server-trusted only`);
  }
  // Positive: const price = lead.buyNowPrice
  assert.match(buyNowBlock[0], /const\s+price\s*=\s*lead\.buyNowPrice/,
    'Price must be read as const price = lead.buyNowPrice');
});

console.log('Deal Room scenario integration tests scheduled.');
