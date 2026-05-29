/**
 * AdminLeads.jsx bulk-refresh URL (C3 fix) lock-in.
 *
 * Closes C3 from docs/audits/architecture-final/02-visibility-matrix-and-conflicts.md.
 *
 * Bug:
 *   After every bulk inventory action (move_to_deal_room / archive /
 *   restore_to_main), AdminLeads.jsx#L734 issued
 *
 *     fetch(`${API_URL}/admin/leads?limit=500`, ...)
 *
 *   That endpoint DOES NOT EXIST. The only collection-level leads
 *   endpoint is the admin branch of GET /api/leads at routes/leads.js#L246
 *   (req.user.role === 'admin' skips the mover-visibility filter and
 *   returns the entire collection). The initial page-load fetch at
 *   AdminLeads.jsx#L597 already uses ${API_URL}/leads correctly.
 *
 *   Symptom: refresh silently 404'd. The Array.isArray(j.leads) wrapper
 *   branch never fired. Admin saw the bulk action complete (the
 *   bulkResult modal rendered correctly) but the leads list stayed
 *   stale until a manual page refresh. Confusing UX, easily mistaken for
 *   a backend bug.
 *
 * C3 fix (this commit):
 *   Change the URL to `${API_URL}/leads` (drop the bogus /admin prefix
 *   and the unused ?limit=500 query param — the admin branch of
 *   /api/leads doesn't honor pagination today). Existing response shape
 *   handling already covers both raw array (the admin branch returns
 *   that today) and wrapper-shape responses, so no other client change
 *   is required.
 *
 * What this suite pins:
 *
 *   A. The bulk-refresh fetch in callInventoryBulk now uses
 *      `${API_URL}/leads` (and NOT the bogus `/admin/leads?limit=500`).
 *   B. The initial page-load fetch (loadLeads) ALSO uses `${API_URL}/leads`
 *      — symmetry guarantees both reads talk to the same endpoint and
 *      see consistent state.
 *   C. Server confirms only ONE leads collection endpoint exists at
 *      this URL — the admin branch of GET /api/leads. Specifically:
 *      no router defines `router.get('/admin/leads')`.
 *   D. Server `/api/leads` handler still admits admin role to the
 *      bypass-filter branch (the C3 fix would break if the admin branch
 *      were ever removed).
 *   E. Response-shape handling preserved — both `Array.isArray(j)`
 *      (the actual current shape) and `Array.isArray(j.leads)`
 *      (defense-in-depth for a future wrapper) are still parsed.
 *   F. Scope discipline — no SMS Claim path changes, no schema changes,
 *      no admin write-path changes (bulk inventory route untouched).
 *
 * Pure-Node, no Mongo, no jsdom. Source-level assertions.
 *
 * Run: `node server/__tests__/adminLeadsBulkRefreshUrl.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const clientRoot = path.join(__dirname, '..', '..', 'client', 'src');

const adminLeadsJsxPath = path.join(clientRoot, 'pages', 'admin', 'AdminLeads.jsx');
const adminLeadsJsxSrc  = fs.readFileSync(adminLeadsJsxPath, 'utf8');

const leadsRoutePath = path.join(serverRoot, 'routes', 'leads.js');
const leadsRouteSrc  = fs.readFileSync(leadsRoutePath, 'utf8');

const adminRoutePath = path.join(serverRoot, 'routes', 'admin.js');
const adminRouteSrc  = fs.readFileSync(adminRoutePath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
const adminLeadsJsxExec = stripComments(adminLeadsJsxSrc);
const leadsRouteExec    = stripComments(leadsRouteSrc);
const adminRouteExec    = stripComments(adminRouteSrc);

// Isolate the callInventoryBulk handler block.
const bulkBlock = adminLeadsJsxExec.match(
  /callInventoryBulk\s*=\s*async\s*\(\s*body\s*\)\s*=>\s*\{[\s\S]*?(?=const\s+submitMoveToDealRoom|const\s+submit|\n\};\s*const)/
);

// ── A. Bulk-refresh URL fixed ─────────────────────────────────────────

test('A1. callInventoryBulk block must be findable', () => {
  assert.ok(bulkBlock, 'callInventoryBulk handler block must be findable in AdminLeads.jsx');
});

test('A2. Bulk-refresh fetch uses `${API_URL}/leads`', () => {
  // The new URL. Pin the literal template.
  assert.match(
    bulkBlock[0],
    /const\s+refresh\s*=\s*await\s+fetch\(\s*`\$\{API_URL\}\/leads`/,
    'Bulk-refresh must fetch `${API_URL}/leads` (drops the bogus /admin prefix and the unused ?limit=500)'
  );
});

test('A3. The bogus `/admin/leads?limit=500` URL is gone from AdminLeads.jsx', () => {
  // Defense-in-depth: the broken URL must not appear ANYWHERE in the file
  // (not just inside callInventoryBulk).
  assert.doesNotMatch(
    adminLeadsJsxExec,
    /['"`]\$\{API_URL\}\/admin\/leads\?limit=500['"`]/,
    'The pre-C3 URL ${API_URL}/admin/leads?limit=500 must not exist anywhere — silent 404 vector'
  );
  assert.doesNotMatch(
    adminLeadsJsxExec,
    /\/admin\/leads\?limit=500/,
    'No reference to /admin/leads?limit=500 anywhere in AdminLeads.jsx'
  );
});

// ── B. Initial load and bulk-refresh use the SAME endpoint ────────────

test('B1. Initial page-load fetch uses `${API_URL}/leads` (symmetry)', () => {
  // The initial fetch at AdminLeads.jsx#L597 (pre-C3 already correct).
  // Locking it here so any future refactor that splits them goes red.
  assert.match(
    adminLeadsJsxExec,
    /fetch\(\s*`\$\{API_URL\}\/leads`\s*,\s*\{\s*headers\s*:\s*\{\s*['"]x-auth-token['"]\s*:\s*token\s*\}\s*\}\s*\)/,
    'Initial page-load fetch must use `${API_URL}/leads` — must match the bulk-refresh URL for state consistency'
  );
});

test('B2. Both fetches against /leads appear in the source (two instances)', () => {
  // Count occurrences of the exact template literal. Should be at least
  // 2: the initial loadLeads call + the bulk-refresh call.
  const matches = adminLeadsJsxExec.match(/`\$\{API_URL\}\/leads`/g) || [];
  assert.ok(matches.length >= 2,
    `Expected at least 2 fetches to \`\${API_URL}/leads\` (initial + bulk-refresh); found ${matches.length}`);
});

// ── C. No /admin/leads collection endpoint exists on the server ──────

test('C1. Server does NOT define a router.get for /admin/leads collection', () => {
  // The audit found that this URL silently 404'd because no handler
  // exists. Pin the absence so a future contributor doesn't add one
  // without also revisiting C3.
  //
  // We check both admin.js (the most likely place) and confirm leads.js
  // is mounted at /api/leads (not /api/admin/leads). The router.get('/')
  // in leads.js is the canonical handler.
  assert.doesNotMatch(
    adminRouteExec,
    /router\.get\(\s*['"]\/leads['"]/,
    'admin.js must NOT define router.get("/leads") — there is no /api/admin/leads collection endpoint; bulk-refresh hits /api/leads'
  );
});

// ── D. /api/leads admin branch still handles req.user.role === 'admin' ─

test('D1. /api/leads handler at the GET / route admits admin role to the unfiltered branch', () => {
  // The fix relies on the admin branch existing. Pin its existence so
  // C3 doesn't silently regress if someone removes the admin branch.
  // The handler structure: router.get('/', auth, async (req, res) => {
  //   ... if (req.user.role !== 'admin') { (mover branch with full filter) }
  //   ... rest of handler returns leads.
  // }). We check for the role check.
  assert.match(
    leadsRouteExec,
    /router\.get\(\s*['"]\/['"][\s\S]{0,4000}req\.user\.role\s*!==\s*['"]admin['"]/,
    'GET /api/leads must still gate the mover branch on req.user.role !== "admin" — the admin branch is what AdminLeads.jsx relies on'
  );
});

// ── E. Response-shape handling preserved ─────────────────────────────

test('E1. Both Array.isArray(j) and Array.isArray(j.leads) shapes are handled', () => {
  // The admin branch of /api/leads currently returns a raw array. Defense-
  // in-depth handler covers a future wrapper shape too. Pin both.
  assert.match(
    bulkBlock[0],
    /if\s*\(\s*Array\.isArray\(\s*j\s*\)\s*\)\s*setLeads\(\s*j\s*\)/,
    'Bulk-refresh must handle raw-array response: if Array.isArray(j) setLeads(j)'
  );
  assert.match(
    bulkBlock[0],
    /else\s+if\s*\(\s*Array\.isArray\(\s*j\.leads\s*\)\s*\)\s*setLeads\(\s*j\.leads\s*\)/,
    'Bulk-refresh must handle wrapper response: else if Array.isArray(j.leads) setLeads(j.leads)'
  );
});

test('E2. Bulk-refresh only updates state on refresh.ok (no false-positive bulk success)', () => {
  // Defense: if the refresh fails (network blip, transient 500), the UI
  // should keep the previous list rather than blowing it away. The
  // `if (refresh.ok)` guard is load-bearing.
  assert.match(
    bulkBlock[0],
    /if\s*\(\s*refresh\.ok\s*\)\s*\{[\s\S]{0,300}setLeads/,
    'Bulk-refresh must guard state update on refresh.ok'
  );
});

// ── F. Scope discipline ──────────────────────────────────────────────

test('F1. callInventoryBulk POST URL unchanged (bulk endpoint still hit)', () => {
  // The bulk endpoint POST is /api/admin/inventory/bulk — that one IS
  // real and unchanged by C3.
  assert.match(
    bulkBlock[0],
    /fetch\(\s*`\$\{API_URL\}\/admin\/inventory\/bulk`/,
    'POST to /api/admin/inventory/bulk must remain unchanged (the write endpoint is real and correct)'
  );
});

test('F2. No SMS Claim references in the changed block', () => {
  for (const forbidden of [
    /openClaimWindow/,
    /claimWindow/,
    /ClaimAttempt/,
    /ENABLE_SMS_CLAIM/,
  ]) {
    assert.doesNotMatch(bulkBlock[0], forbidden,
      `Bulk handler must NOT touch SMS Claim surface (${forbidden})`);
  }
});

test('F3. No schema-related strings introduced by C3', () => {
  // Defensive — C3 is a pure URL fix.
  for (const forbidden of [
    /inventoryChannel/,
    /distributionDecision/,
    /Lead\.updateOne/,
  ]) {
    assert.doesNotMatch(bulkBlock[0], forbidden,
      `Bulk handler must NOT contain schema-touching pattern ${forbidden} — C3 is a URL fix`);
  }
});

console.log('AdminLeads bulk-refresh URL (C3) tests scheduled.');
