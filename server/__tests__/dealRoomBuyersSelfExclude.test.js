/**
 * Deal Room buyers.company self-exclusion (PR-D2) lock-in.
 *
 * Closes R2 from docs/audits/deal-room-pipeline/07-risks-and-bugs.md.
 *
 * Pre-PR-D2 the main mover feed (GET /api/leads) carried a
 * belt-and-suspenders self-exclusion clause at leads.js ~L184:
 *
 *     'buyers.company': { $ne: req.user.id }
 *
 * The Deal Room read endpoint (GET /api/leads/deals at leads.js L95-133)
 * did NOT carry this clause. Asymmetry was protected by the upstream
 * admin gate (adminInventory.js refuses `move_to_deal_room` on leads
 * with non-empty `buyers`), so the practical exposure was zero — but the
 * read-path drift was a latent landmine: any future loosening of the
 * admin gate would allow a mover to see their own already-purchased
 * lead reappear on Deal Room.
 *
 * PR-D2 fix: copy the same clause into the /deals query. Pure additive
 * filter; can only narrow results. No way for this clause to introduce
 * new visibility.
 *
 * What this suite pins:
 *
 *   A. The Deal Room query has the self-exclusion clause as a top-level
 *      filter clause keyed `'buyers.company': { $ne: req.user.id }`.
 *   B. The clause is structurally IDENTICAL to the main feed's clause
 *      (same key, same operator, same operand) so the two paths cannot
 *      drift apart again.
 *   C. The four pre-PR-D2 filter clauses are byte-identical (no
 *      incidental change to the surface, lifecycle, time, or quality
 *      gates).
 *   D. The clause is placed BEFORE the moverVisibilityFilter spread so
 *      a defensive future override in the spread can't accidentally
 *      remove it.
 *   E. Scope discipline — no changes to:
 *        - the admin write path (adminInventory.js — still refuses
 *          move_to_deal_room on leads with buyers)
 *        - the /buy-now path
 *        - the schema
 *        - the SMS Claim pipeline
 *        - the env flag
 *
 * Pure-Node, no Mongo. Source-level assertions only.
 *
 * Run: `node server/__tests__/dealRoomBuyersSelfExclude.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const leadsRoutePath        = path.join(serverRoot, 'routes', 'leads.js');
const adminInventoryPath    = path.join(serverRoot, 'routes', 'adminInventory.js');

const leadsRouteSrc     = fs.readFileSync(leadsRoutePath,     'utf8');
const adminInventorySrc = fs.readFileSync(adminInventoryPath, 'utf8');

function stripComments(src) {
  // Line comments first (URL fragments inside line comments would
  // otherwise be eaten by the greedy block-comment regex).
  return src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
const leadsRouteExec     = stripComments(leadsRouteSrc);
const adminInventoryExec = stripComments(adminInventorySrc);

// Isolate the GET /deals handler block so all the assertions about the
// /deals query are scoped to ONLY that handler — not the main GET /
// mover branch (which has its own buyers clause and would false-pass).
const dealsHandlerMatch = leadsRouteExec.match(
  /router\.get\(\s*['"]\/deals['"][\s\S]*?(?=router\.(get|post|put|patch|delete)|module\.exports)/
);

// ── A. Clause is present in the /deals query ──────────────────────────

test('A1. GET /deals handler block must be findable', () => {
  assert.ok(dealsHandlerMatch,
    'Could not isolate the GET /deals handler block from leads.js — has the route signature changed?');
});

test('A2. /deals query includes `buyers.company: { $ne: req.user.id }`', () => {
  assert.match(
    dealsHandlerMatch[0],
    /['"]buyers\.company['"]\s*:\s*\{\s*\$ne\s*:\s*req\.user\.id\s*\}/,
    'GET /deals query must include the self-exclusion clause ' +
    "'buyers.company': { $ne: req.user.id } — same shape as the main feed at leads.js#L184"
  );
});

// ── B. Structural identity with the main feed clause ─────────────────

test('B1. Main mover feed still has the self-exclusion clause (regression guard)', () => {
  // The whole point of PR-D2 is parity with this clause. If a future
  // refactor removes it from the main feed, the two endpoints would
  // drift in the OTHER direction — pin both.
  assert.match(
    leadsRouteExec,
    /['"]buyers\.company['"]\s*:\s*\{\s*\$ne\s*:\s*req\.user\.id\s*\}/g,
    'Main mover feed must keep the buyers.company self-exclusion clause'
  );
});

test('B2. Both feeds use the identical clause string', () => {
  // Defense-in-depth: count occurrences and confirm there are at least
  // TWO (main feed + Deal Room). Locks the two-path parity.
  const matches = leadsRouteExec.match(
    /['"]buyers\.company['"]\s*:\s*\{\s*\$ne\s*:\s*req\.user\.id\s*\}/g
  ) || [];
  assert.ok(matches.length >= 2,
    `Expected the self-exclusion clause to appear at least TWICE in leads.js ` +
    `(main feed + /deals); found ${matches.length}`);
});

// ── C. Pre-PR-D2 query clauses byte-identical ────────────────────────

test('C1. /deals still filters inventoryChannel: "deal_room"', () => {
  assert.match(
    dealsHandlerMatch[0],
    /inventoryChannel\s*:\s*['"]deal_room['"]/,
    'Surface clause must be unchanged'
  );
});

test('C2. /deals still filters status: $in [Available, READY_FOR_DISTRIBUTION]', () => {
  assert.match(
    dealsHandlerMatch[0],
    /status\s*:\s*\{\s*\$in\s*:\s*\[\s*['"]Available['"]\s*,\s*['"]READY_FOR_DISTRIBUTION['"]\s*\]\s*\}/,
    'Lifecycle clause must be unchanged'
  );
});

test('C3. /deals still filters moveDate: $gte new Date()', () => {
  assert.match(
    dealsHandlerMatch[0],
    /moveDate\s*:\s*\{\s*\$gte\s*:\s*new\s+Date\(\)\s*\}/,
    'Time clause must be unchanged'
  );
});

test('C4. /deals still spreads moverVisibilityFilter()', () => {
  assert.match(
    dealsHandlerMatch[0],
    /\.\.\.moverVisibilityFilter\(\)/,
    'Quality clause (Phase 3 via moverVisibilityFilter spread) must be unchanged'
  );
});

// ── D. Placement: buyers clause before moverVisibilityFilter spread ─

test('D1. buyers.company clause placed BEFORE moverVisibilityFilter spread', () => {
  // The spread can in theory overwrite preceding keys via Object spread
  // semantics. Today moverVisibilityFilter returns
  // {distributionDecision:...} so it can't shadow buyers.company, but
  // pinning the order means a future expansion of moverVisibilityFilter
  // cannot silently remove our clause.
  const buyersIdx = dealsHandlerMatch[0].indexOf("'buyers.company'");
  const buyersIdxDQ = dealsHandlerMatch[0].indexOf('"buyers.company"');
  const buyersIdxAny = (buyersIdx !== -1) ? buyersIdx : buyersIdxDQ;
  const spreadIdx = dealsHandlerMatch[0].indexOf('...moverVisibilityFilter()');
  assert.ok(buyersIdxAny !== -1, 'buyers.company clause must be present');
  assert.ok(spreadIdx !== -1, 'moverVisibilityFilter spread must be present');
  assert.ok(buyersIdxAny < spreadIdx,
    'buyers.company clause must appear BEFORE the moverVisibilityFilter spread ' +
    'so a future expansion of the helper cannot silently overwrite it');
});

// ── E. Scope discipline ─────────────────────────────────────────────

test('E1. Admin write gate still refuses move_to_deal_room on leads with buyers', () => {
  // The upstream protection that has been doing the work pre-PR-D2.
  // Confirm it's intact — PR-D2 is defense-in-depth, NOT a replacement
  // for this gate.
  assert.match(
    adminInventoryExec,
    /lead\.buyers[\s\S]{0,80}length\s*>\s*0[\s\S]{0,80}status[\s\S]{0,80}Purchased/,
    'Admin write gate must still refuse move_to_deal_room on leads with non-empty buyers or status=Purchased'
  );
});

test('E2. No /buy-now path changes', () => {
  // Sanity: PR-D2 must not touch the money path.
  const bidsPath = path.join(serverRoot, 'routes', 'bids.js');
  const bidsSrc = fs.readFileSync(bidsPath, 'utf8');
  // Buy-now handler signature unchanged.
  assert.match(
    bidsSrc,
    /router\.post\(\s*['"]\/:leadId\/buy-now['"]\s*,\s*auth\s*,/,
    'POST /:leadId/buy-now signature must remain unchanged'
  );
  // PurchasedLead unique-mutex creation site unchanged.
  // Multi-line constructor: `new PurchasedLead({ company: ..., lead: ..., pricePaid: ... })`.
  // [\s\S]* allows newlines + alignment whitespace between properties.
  assert.match(
    bidsSrc,
    /new\s+PurchasedLead\(\s*\{[\s\S]*?company\s*:\s*req\.user\.id[\s\S]*?lead\s*:\s*lead\._id[\s\S]*?pricePaid\s*:\s*price[\s\S]*?\}\s*\)/,
    'PurchasedLead creation shape (canonical mutex: company + lead + pricePaid) must remain unchanged'
  );
});

test('E3. /deals projection + sort + discountPercent annotation unchanged', () => {
  // PR-D2 is one-clause additive; the projection, sort, and per-lead
  // enrichment must be byte-identical.
  assert.match(
    dealsHandlerMatch[0],
    /\.select\(\s*['"]-customerName -customerPhone -customerEmail -specialInstructions -customerNotes -notifiedAt['"]\s*\)/,
    'PII projection must remain unchanged'
  );
  assert.match(
    dealsHandlerMatch[0],
    /\.sort\(\s*\{\s*updatedAt\s*:\s*-1\s*\}\s*\)/,
    'Sort must remain {updatedAt: -1}'
  );
  assert.match(
    dealsHandlerMatch[0],
    /discountPercent\s*[:=]/,
    'discountPercent annotation must remain'
  );
});

test('E4. ENABLE_DEAL_ROOM env gate unchanged', () => {
  assert.match(
    dealsHandlerMatch[0],
    /isEnabled\(\)/,
    'Env-flag gate via dealRoomFeature.isEnabled() must remain'
  );
});

test('E5. No new env flag introduced by PR-D2', () => {
  for (const re of [
    /process\.env\.DEAL_ROOM_SELF_EXCLUDE/,
    /process\.env\.ENABLE_BUYERS_SELF_EXCLUSION/,
  ]) {
    assert.doesNotMatch(leadsRouteExec, re,
      `Must NOT introduce env flag ${re}`);
  }
});

test('E6. No schema changes — no new fields in the buyers structure', () => {
  // Sanity: PR-D2 reads buyers.company which already exists in the
  // schema. Confirm the schema file is unchanged at that field.
  const leadModelPath = path.join(serverRoot, 'models', 'Lead.js');
  const leadModelSrc = fs.readFileSync(leadModelPath, 'utf8');
  assert.match(
    leadModelSrc,
    /buyers\s*:\s*\[\s*\{[\s\S]{0,400}company\s*:\s*\{\s*type\s*:\s*mongoose\.Schema\.Types\.ObjectId/,
    'Lead.buyers[].company schema must remain — no schema changes for PR-D2'
  );
});

console.log('Deal Room buyers self-exclude (PR-D2) tests scheduled.');
