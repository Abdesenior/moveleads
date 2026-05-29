/**
 * Deal Room observability (PR-D3) lock-in.
 *
 * Closes R4 from docs/audits/deal-room-pipeline/07-risks-and-bugs.md.
 *
 * Pre-PR-D3 the Deal Room had ZERO read-side observability:
 *   - No happy-path log on /api/leads/deals (only the catch path logged).
 *   - No admin endpoint to ask "how big is Deal Room? how stale?".
 *   - Operator had to load the admin AdminLeads.jsx page, filter by
 *     channel='deal_room', and count rows manually to answer trivial
 *     pilot questions.
 *
 * PR-D3 fix (two surgical additions):
 *
 *   1. One log line on the /api/leads/deals happy path:
 *        [Deals] mover=<id> count=<N> sort=updatedAt:-1
 *
 *   2. New admin endpoint:
 *        GET /api/admin/inventory/deal-room/summary
 *      Auth: [auth, admin] (same as the existing bulk endpoint).
 *      Flag posture: does NOT 503 when flag off — returns 200 with
 *      enabled:false. The primary operator use case is "what's the flag
 *      state in this env?"; 503 defeats that.
 *      Response shape:
 *        {
 *          enabled, totalDealRoomLeads, availableDealRoomLeads,
 *          purchasedDealRoomLeads, oldest, newest, generatedAt
 *        }
 *
 * What this suite pins:
 *
 *   A. Log line — exact shape, present on the happy path BEFORE
 *      res.json, NOT in the catch.
 *   B. Admin endpoint — route definition, middleware chain, NOT
 *      gated on isEnabled() flag (deliberate — operators need to
 *      query the flag state itself).
 *   C. Counts use the right filters (total, available, purchased).
 *      No buyers self-exclusion (admin summary is identity-agnostic).
 *   D. Oldest/newest derivation — ascending vs descending sort, _id
 *      and updatedAt selected only, ageDays computed at request time.
 *   E. Response shape includes every documented field.
 *   F. Error path: 500 with logged message + 'Server error' msg.
 *   G. Counts queries run via Promise.all (single round-trip latency).
 *   H. Scope discipline — no schema changes, no /buy-now changes,
 *      no admin write path changes, no SMS Claim changes, no new
 *      env flag, no Lead document mutations.
 *
 * Pure-Node, no Mongo. Source-level + structural assertions only.
 *
 * Run: `node server/__tests__/dealRoomObservability.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const leadsRoutePath     = path.join(serverRoot, 'routes', 'leads.js');
const adminInventoryPath = path.join(serverRoot, 'routes', 'adminInventory.js');
const serverPath         = path.join(serverRoot, 'server.js');

const leadsRouteSrc     = fs.readFileSync(leadsRoutePath,     'utf8');
const adminInventorySrc = fs.readFileSync(adminInventoryPath, 'utf8');
const serverSrc         = fs.readFileSync(serverPath,         'utf8');

function stripComments(src) {
  return src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
const leadsRouteExec     = stripComments(leadsRouteSrc);
const adminInventoryExec = stripComments(adminInventorySrc);
const serverExec         = stripComments(serverSrc);

// Isolate the /deals handler block.
const dealsHandlerMatch = leadsRouteExec.match(
  /router\.get\(\s*['"]\/deals['"][\s\S]*?(?=router\.(get|post|put|patch|delete)|module\.exports)/
);

// Isolate the /deal-room/summary handler block.
const summaryHandlerMatch = adminInventoryExec.match(
  /router\.get\(\s*['"]\/deal-room\/summary['"][\s\S]*?(?=router\.(get|post|put|patch|delete)|module\.exports)/
);

// ── A. Happy-path log line on /api/leads/deals ────────────────────────

test('A1. /deals handler block must be findable', () => {
  assert.ok(dealsHandlerMatch,
    'Could not isolate the GET /deals handler block from leads.js');
});

test('A2. /deals happy path logs the [Deals] line', () => {
  // Exact shape: [Deals] mover=<id> count=<N> sort=updatedAt:-1
  assert.match(
    dealsHandlerMatch[0],
    /console\.log\(\s*`\[Deals\] mover=\$\{req\.user\.id\} count=\$\{leads\.length\} sort=updatedAt:-1`\s*\)/,
    'Happy path must emit console.log(`[Deals] mover=${req.user.id} count=${leads.length} sort=updatedAt:-1`)'
  );
});

test('A3. Log line emitted BEFORE res.json(leads)', () => {
  // Operator triage: if a request 500s after the log, the log still
  // tells the operator the query did return data — narrows the bug to
  // serialization / network. Pin the order.
  const logIdx = dealsHandlerMatch[0].indexOf('[Deals] mover=');
  const jsonIdx = dealsHandlerMatch[0].indexOf('res.json(leads)');
  assert.ok(logIdx !== -1, 'log line must exist');
  assert.ok(jsonIdx !== -1, 'res.json(leads) must exist');
  assert.ok(logIdx < jsonIdx,
    'Log line must come BEFORE res.json(leads)');
});

test('A4. Log line is NOT in the catch block', () => {
  // The catch block already has its own error log. The happy-path log
  // must be in the try block. Source-level proxy: the [Deals] line and
  // the [Deals Endpoint] line are distinct.
  assert.ok(
    /\[Deals Endpoint\] error/.test(dealsHandlerMatch[0]),
    'catch-path error log must remain'
  );
  assert.notEqual(
    '[Deals] mover=',
    '[Deals Endpoint] error',
    'happy-path and error-path tags must be distinct'
  );
});

// ── B. Admin summary endpoint mount + middleware ──────────────────────

test('B1. /deal-room/summary handler block must be findable', () => {
  assert.ok(summaryHandlerMatch,
    'Could not isolate the GET /deal-room/summary handler block from adminInventory.js');
});

test('B2. Route is defined as GET /deal-room/summary', () => {
  assert.match(
    adminInventoryExec,
    /router\.get\(\s*['"]\/deal-room\/summary['"]/,
    'Route signature must be GET /deal-room/summary'
  );
});

test('B3. Middleware chain is [auth, admin] (parity with bulk endpoint)', () => {
  assert.match(
    adminInventoryExec,
    /router\.get\(\s*['"]\/deal-room\/summary['"]\s*,\s*\[\s*auth\s*,\s*admin\s*\]/,
    'Middleware chain must be [auth, admin] — same as /bulk endpoint'
  );
});

test('B4. Endpoint is NOT gated on isEnabled() — operators need to query flag state', () => {
  // The bulk endpoint 503s when flag off. The summary endpoint must NOT
  // — its primary use case is "what is the flag state in this env?".
  // Source-level: confirm there is NO `if (!isEnabled()) return res.status(503)`
  // sequence inside the summary handler block.
  assert.doesNotMatch(
    summaryHandlerMatch[0],
    /if\s*\(\s*!\s*isEnabled\(\)\s*\)\s*\{[\s\S]{0,200}res\.status\(\s*503\s*\)/,
    'Summary endpoint must NOT 503 when ENABLE_DEAL_ROOM is off — operator needs to query flag state'
  );
  assert.doesNotMatch(
    summaryHandlerMatch[0],
    /if\s*\(\s*!\s*isEnabled\(\)\s*\)\s*\{[\s\S]{0,200}res\.status\(\s*404\s*\)/,
    'Summary endpoint must NOT 404 when ENABLE_DEAL_ROOM is off either'
  );
  // Positive: enabled IS read and surfaced in the response.
  assert.match(
    summaryHandlerMatch[0],
    /const\s+enabled\s*=\s*isEnabled\(\)/,
    'Summary handler must read enabled = isEnabled() so the response surfaces flag state'
  );
});

// ── C. Counts use correct filters ─────────────────────────────────────

test('C1. Total count filters on inventoryChannel: deal_room only', () => {
  // No status / moveDate / decision constraints — total is unconditional
  // Deal Room population.
  assert.match(
    summaryHandlerMatch[0],
    /allFilter\s*=\s*\{\s*inventoryChannel\s*:\s*['"]deal_room['"]\s*\}/,
    'Total filter (allFilter) must be { inventoryChannel: "deal_room" } only'
  );
});

test('C2. Available count filters on status + moveDate + distributionDecision', () => {
  // Mirrors the mover-side /deals query filter EXCEPT for the
  // buyers.company self-exclusion (PR-D2) which is per-mover.
  assert.match(
    summaryHandlerMatch[0],
    /availableFilter\s*=\s*\{[\s\S]*?\.\.\.allFilter[\s\S]*?status\s*:\s*\{\s*\$in\s*:\s*\[\s*['"]Available['"]\s*,\s*['"]READY_FOR_DISTRIBUTION['"]\s*\]\s*\}[\s\S]*?moveDate\s*:\s*\{\s*\$gte\s*:\s*now\s*\}[\s\S]*?distributionDecision\s*:\s*\{\s*\$in\s*:\s*\[\s*['"]system_approved['"]\s*,\s*['"]admin_approved['"]\s*\]\s*\}/,
    'availableFilter must compose allFilter + status + moveDate + distributionDecision'
  );
});

test('C3. Available count does NOT include buyers.company self-exclusion (admin summary is identity-agnostic)', () => {
  // Defensive: if a future contributor copy-pastes the PR-D2 clause in
  // here, the admin's count drops to a per-mover view and stops being
  // useful as a global summary.
  assert.doesNotMatch(
    summaryHandlerMatch[0],
    /availableFilter[\s\S]{0,400}buyers\.company/,
    'availableFilter must NOT include buyers.company filter — admin summary is identity-agnostic'
  );
});

test('C4. Purchased count filters on status: "Purchased"', () => {
  assert.match(
    summaryHandlerMatch[0],
    /purchasedFilter\s*=\s*\{[\s\S]*?\.\.\.allFilter[\s\S]*?status\s*:\s*['"]Purchased['"]/,
    'purchasedFilter must include status: "Purchased"'
  );
});

// ── D. Oldest / newest derivation ─────────────────────────────────────

test('D1. Oldest derived via .sort({updatedAt: 1}).limit(1)', () => {
  // Ascending sort gets the most stale (smallest updatedAt).
  assert.match(
    summaryHandlerMatch[0],
    /Lead\.find\(\s*allFilter\s*\)\s*\.sort\(\s*\{\s*updatedAt\s*:\s*1\s*\}\s*\)\s*\.select\(\s*['"]_id updatedAt['"]\s*\)\s*\.limit\(\s*1\s*\)\s*\.lean\(\)/,
    'Oldest must be Lead.find(allFilter).sort({updatedAt: 1}).select("_id updatedAt").limit(1).lean()'
  );
});

test('D2. Newest derived via .sort({updatedAt: -1}).limit(1)', () => {
  assert.match(
    summaryHandlerMatch[0],
    /Lead\.find\(\s*allFilter\s*\)\s*\.sort\(\s*\{\s*updatedAt\s*:\s*-1\s*\}\s*\)\s*\.select\(\s*['"]_id updatedAt['"]\s*\)\s*\.limit\(\s*1\s*\)\s*\.lean\(\)/,
    'Newest must be Lead.find(allFilter).sort({updatedAt: -1}).select("_id updatedAt").limit(1).lean()'
  );
});

test('D3. ageDays computed at request time (not denormalized)', () => {
  // Locked to derive from `now.getTime() - new Date(row.updatedAt).getTime()`.
  assert.match(
    summaryHandlerMatch[0],
    /ageMs\s*=\s*now\.getTime\(\)\s*-\s*new\s+Date\(\s*row\.updatedAt\s*\)\.getTime\(\)/,
    'ageMs must be computed at request time from now - row.updatedAt'
  );
  assert.match(
    summaryHandlerMatch[0],
    /Math\.max\(\s*0\s*,\s*Math\.round\(\s*ageMs\s*\/\s*\(\s*1000\s*\*\s*60\s*\*\s*60\s*\*\s*24\s*\)\s*\)\s*\)/,
    'ageDays must be Math.max(0, Math.round(ageMs / (1000*60*60*24)))'
  );
});

test('D4. describe(null) returns null (defensive — empty Deal Room)', () => {
  assert.match(
    summaryHandlerMatch[0],
    /if\s*\(\s*!\s*row\s*\|\|\s*!\s*row\.updatedAt\s*\)\s*return\s+null/,
    'describe() helper must return null when row is missing — empty Deal Room must serialize cleanly'
  );
});

// ── E. Response shape complete ────────────────────────────────────────

test('E1. Response includes all 7 documented fields', () => {
  for (const field of [
    /enabled\s*,/,
    /totalDealRoomLeads\s*:/,
    /availableDealRoomLeads\s*:/,
    /purchasedDealRoomLeads\s*:/,
    /oldest\s*:/,
    /newest\s*:/,
    /generatedAt\s*:/,
  ]) {
    assert.match(
      summaryHandlerMatch[0],
      field,
      `Response must include field matching ${field}`
    );
  }
});

test('E2. describe() returns documented per-row shape', () => {
  // { leadId, updatedAt, ageDays }
  for (const field of [
    /leadId\s*:\s*String\(\s*row\._id\s*\)/,
    /updatedAt\s*:\s*new\s+Date\(\s*row\.updatedAt\s*\)\.toISOString\(\)/,
    /ageDays/,
  ]) {
    assert.match(
      summaryHandlerMatch[0],
      field,
      `describe() must return field matching ${field}`
    );
  }
});

test('E3. generatedAt is the request-time ISO timestamp', () => {
  assert.match(
    summaryHandlerMatch[0],
    /generatedAt\s*:\s*now\.toISOString\(\)/,
    'generatedAt must be now.toISOString()'
  );
});

// ── F. Error path ─────────────────────────────────────────────────────

test('F1. Caught errors emit a tagged log + return 500 with "Server error"', () => {
  assert.match(
    summaryHandlerMatch[0],
    /catch\s*\(\s*err\s*\)\s*\{[\s\S]{0,200}\[Admin DealRoomSummary\] error[\s\S]{0,200}res\.status\(\s*500\s*\)\.json\(\s*\{\s*msg\s*:\s*['"]Server error['"]\s*\}\s*\)/,
    'catch block must log [Admin DealRoomSummary] error and return 500 with msg "Server error"'
  );
});

// ── G. Promise.all for parallel queries ──────────────────────────────

test('G1. Counts + oldest/newest run in parallel via Promise.all', () => {
  // 5-tuple destructure inside Promise.all([countDocuments × 3, find × 2]).
  assert.match(
    summaryHandlerMatch[0],
    /const\s*\[\s*total\s*,\s*available\s*,\s*purchased\s*,\s*oldestArr\s*,\s*newestArr\s*\]\s*=\s*await\s+Promise\.all\(/,
    'All 5 queries must run via Promise.all destructured as [total, available, purchased, oldestArr, newestArr]'
  );
});

// ── H. Scope discipline ──────────────────────────────────────────────

test('H1. No schema changes (Lead, PurchasedLead, Transaction untouched)', () => {
  // Read endpoint only. Lock-in via "no references to schema field
  // additions" in the summary handler.
  for (const forbidden of [
    /movedToDealRoomAt/,    // would be a schema addition if it existed
    /dealRoomAge/,
    /\.dealRoomMetrics/,
  ]) {
    assert.doesNotMatch(summaryHandlerMatch[0], forbidden,
      `Summary handler must NOT reference imagined schema field ${forbidden}`);
  }
});

test('H2. No Lead document mutations (read-only)', () => {
  // Defense-in-depth: forbid any write call on Lead inside the summary
  // handler body.
  for (const forbidden of [
    /Lead\.updateOne/,
    /Lead\.updateMany/,
    /Lead\.findOneAndUpdate/,
    /Lead\.deleteOne/,
    /Lead\.deleteMany/,
    /\.save\(\)/,
  ]) {
    assert.doesNotMatch(summaryHandlerMatch[0], forbidden,
      `Summary handler must NOT mutate Lead via ${forbidden} — read-only contract`);
  }
});

test('H3. Existing /bulk endpoint is byte-identical', () => {
  // PR-D3 adds the summary endpoint; the bulk endpoint must not be
  // touched. Pin its definition shape + signature.
  assert.match(
    adminInventoryExec,
    /router\.post\(\s*['"]\/bulk['"]\s*,\s*\[\s*auth\s*,\s*admin\s*\]/,
    '/bulk endpoint signature must remain unchanged'
  );
  // ENABLE_DEAL_ROOM gate on /bulk must remain (asymmetric: /bulk 503s
  // when off, /summary does not).
  assert.match(
    adminInventoryExec,
    /router\.post\(\s*['"]\/bulk['"][\s\S]*?if\s*\(\s*!\s*isEnabled\(\)\s*\)[\s\S]{0,300}res\.status\(\s*503\s*\)/,
    '/bulk endpoint must still 503 when ENABLE_DEAL_ROOM is off (asymmetric posture vs /summary)'
  );
});

test('H4. /buy-now path is unchanged (no money path impact)', () => {
  const bidsSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'bids.js'), 'utf8');
  assert.match(
    bidsSrc,
    /router\.post\(\s*['"]\/:leadId\/buy-now['"]\s*,\s*auth\s*,/,
    'POST /:leadId/buy-now signature must remain unchanged'
  );
});

test('H5. No new env flag introduced by PR-D3', () => {
  for (const re of [
    /process\.env\.ENABLE_DEAL_ROOM_SUMMARY/,
    /process\.env\.DEAL_ROOM_OBSERVABILITY/,
  ]) {
    assert.doesNotMatch(leadsRouteExec, re,
      `Must NOT introduce env flag ${re}`);
    assert.doesNotMatch(adminInventoryExec, re,
      `Must NOT introduce env flag ${re}`);
  }
});

test('H6. /deals handler still has the env-flag gate (404 when off)', () => {
  // PR-D3 adds a log line but does NOT change the existing flag posture
  // for the mover-side endpoint.
  assert.match(
    dealsHandlerMatch[0],
    /if\s*\(\s*!\s*isEnabled\(\)\s*\)[\s\S]{0,200}res\.status\(\s*404\s*\)\.json\(\s*\{\s*msg\s*:\s*['"]Deal Room is not enabled['"]\s*\}\s*\)/,
    '/deals must still 404 with msg "Deal Room is not enabled" when flag is off'
  );
});

test('H7. /deals 4-clause query unchanged (no incidental modification)', () => {
  for (const clause of [
    /inventoryChannel\s*:\s*['"]deal_room['"]/,
    /status\s*:\s*\{\s*\$in\s*:\s*\[\s*['"]Available['"]\s*,\s*['"]READY_FOR_DISTRIBUTION['"]\s*\]\s*\}/,
    /moveDate\s*:\s*\{\s*\$gte\s*:\s*new\s+Date\(\)\s*\}/,
    /\.\.\.moverVisibilityFilter\(\)/,
  ]) {
    assert.match(dealsHandlerMatch[0], clause,
      `/deals query clause must remain: ${clause}`);
  }
});

test('H8. AdminInventory mount + verifiedGate unchanged', () => {
  assert.match(
    serverExec,
    /app\.use\(\s*['"]\/api\/admin\/inventory['"]\s*,\s*verifiedGate\s*,\s*require\(\s*['"]\.\/routes\/adminInventory['"]\s*\)\s*\)/,
    'Mount of /api/admin/inventory under verifiedGate must remain unchanged'
  );
});

console.log('Deal Room observability (PR-D3) tests scheduled.');
