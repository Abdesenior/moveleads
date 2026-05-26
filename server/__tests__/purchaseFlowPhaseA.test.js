/**
 * Purchase-flow cleanup — Phase A lock-in tests.
 *
 * Backend-only change: purchased leads must no longer appear in the
 * mover-facing /api/leads response. They live exclusively in
 * /dashboard/my-leads (GET /api/purchases).
 *
 * Pre-Phase-A the query had a `$or` branch that always returned leads
 * the mover already owned, which caused them to re-appear in the
 * marketplace on every refresh — conflicting with the operator's
 * UX intent. Phase A drops that branch + adds a defensive
 * `buyers.company: $ne` clause so legacy multi-buyer leads can't leak
 * through either.
 *
 * Pure-Node, no Mongo. Source-level assertions.
 *
 * Run: `node server/__tests__/purchaseFlowPhaseA.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leadsRouteSrc    = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');
const purchasesRouteSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'purchases.js'), 'utf8');

// ── A. The pre-Phase-A purchased-pass-through branch is gone ───────────

test('GET /api/leads mover query no longer returns purchased leads via $or branch', () => {
  // The pre-Phase-A query had an outer `$or` wrapping
  // `{ 'buyers.company': req.user.id }` and `availableBranch`. That
  // wrapper made the response include every lead the mover had ever
  // bought, regardless of status / moveDate / quality gates — which
  // re-introduced purchased leads into the marketplace on refresh.
  //
  // Reject the exact shape (whitespace-tolerant).
  const purchasedPassThrough =
    /query\s*=\s*\{\s*\$or:\s*\[\s*\{\s*['"]buyers\.company['"]:\s*req\.user\.id\s*\}/;
  assert.doesNotMatch(
    leadsRouteSrc,
    purchasedPassThrough,
    'leads.js mover query must NOT wrap availableBranch in a $or with ' +
    '{ "buyers.company": req.user.id } — purchased leads belong in /api/purchases only'
  );
});

test('GET /api/leads mover query gates buyers.company with $ne req.user.id', () => {
  // Belt-and-suspenders for legacy multi-buyer leads (claim flow with
  // maxBuyers > 1): the lead can stay status='Available' after one
  // buyer takes a slot. Without this clause that lead would re-appear
  // in the marketplace for the mover who already bought a slot.
  const explicitExclude =
    /['"]buyers\.company['"]:\s*\{\s*\$ne:\s*req\.user\.id\s*\}/;
  assert.match(
    leadsRouteSrc,
    explicitExclude,
    'leads.js availableBranch must include `buyers.company: { $ne: req.user.id }`'
  );
});

test('availableBranch keeps the four quality/lifecycle axes', () => {
  // Refactor safety — the audit-confirmed Phase 3 invariants must survive.
  const availableBranchStart = leadsRouteSrc.indexOf('const availableBranch = {');
  const availableBranchEnd   = leadsRouteSrc.indexOf('};', availableBranchStart);
  assert.ok(availableBranchStart > -1 && availableBranchEnd > availableBranchStart,
    'leads.js must still declare availableBranch as a named object literal');
  const block = leadsRouteSrc.slice(availableBranchStart, availableBranchEnd);
  assert.match(block, /status:\s*\{\s*\$in:\s*\[\s*['"]Available['"],\s*['"]READY_FOR_DISTRIBUTION['"]\s*\]/,
    'status lifecycle filter must remain');
  assert.match(block, /moveDate:\s*\{\s*\$gte:\s*new Date\(\)/,
    'moveDate future filter must remain');
  assert.match(block, /inventoryChannel:\s*\{\s*\$nin:\s*\[['"]deal_room['"],\s*['"]archived['"]\]/,
    'inventoryChannel surface filter must remain');
  assert.match(block, /moverVisibilityFilter\(\)/,
    'moverVisibilityFilter (distributionDecision quality gate) must remain');
});

test('availableBranch is the entire mover query (no $or wrapper)', () => {
  // After Phase A, `query = availableBranch` directly. No outer wrapping.
  assert.match(
    leadsRouteSrc,
    /query\s*=\s*availableBranch/,
    'mover query must be set directly from availableBranch (no purchased-pass-through wrapper)'
  );
});

// ── B. /api/purchases remains the canonical read for purchased leads ────

test('GET /api/purchases serves the my-leads page (unchanged)', () => {
  // Phase A does not change /api/purchases — just confirms the endpoint
  // still exists and reads PurchasedLead, so my-leads has somewhere to
  // pull purchased leads from now that they no longer leak into /api/leads.
  assert.match(
    purchasesRouteSrc,
    /require\(['"]\.\.\/models\/PurchasedLead['"]\)/,
    'purchases.js must read PurchasedLead model'
  );
  assert.match(
    purchasesRouteSrc,
    /\.populate\(['"]lead['"]/,
    'purchases.js must populate the lead doc so my-leads has full PII'
  );
});

// ── C. Operator scenarios written as plain-English assertions ───────────

test('OPERATOR: non-buyer movers still see Available leads in /api/leads', () => {
  // Negative-space check: nothing in the query excludes leads whose
  // buyers array does NOT contain this mover. The $ne filter only
  // excludes leads where the CURRENT mover is in buyers — other movers'
  // unrelated leads stay visible. This is a sanity assertion on the
  // semantics of $ne; it would only fail if someone changed the operator
  // to $eq or removed the conditional.
  assert.match(
    leadsRouteSrc,
    /['"]buyers\.company['"]:\s*\{\s*\$ne:/,
    '$ne (not equal) is correct — excludes only the requesting mover'
  );
  assert.doesNotMatch(
    leadsRouteSrc,
    /['"]buyers\.company['"]:\s*\{\s*\$eq:\s*req\.user\.id/,
    'must not be $eq (would invert the semantics and exclude every available lead)'
  );
});

test('OPERATOR: after refresh, purchased lead does not return in /api/leads', () => {
  // The mover already in buyers is excluded by the $ne clause.
  // The purchased lead's status is also flipped to 'Purchased' by
  // bids.js#buy-now, which the lifecycle filter (status $in
  // [Available, READY_FOR_DISTRIBUTION]) ALSO excludes. Two independent
  // mechanisms; either one is sufficient. This test exists to lock in
  // the documented intent.
  assert.match(
    leadsRouteSrc,
    /status:\s*\{\s*\$in:\s*\[\s*['"]Available['"],\s*['"]READY_FOR_DISTRIBUTION['"]\s*\]/,
    'lifecycle filter must include the post-purchase exclusion (Purchased status not in list)'
  );
});

test('OPERATOR: comment block documents the Phase A intent for future readers', () => {
  // The "why" lives in the code comment so the next engineer doesn't
  // helpfully re-introduce the pass-through.
  assert.match(
    leadsRouteSrc,
    /Phase A/,
    'leads.js mover query must mention Phase A in its comment so the intent is discoverable'
  );
  assert.match(
    leadsRouteSrc,
    /\/api\/purchases/,
    'comment must point future readers to /api/purchases as the canonical purchased-leads read'
  );
});

console.log('\nPurchase-flow Phase A backend lock-in tests scheduled.');
