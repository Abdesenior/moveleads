/**
 * Deal Room V1 smoke test.
 *
 * Pure-Node, no Mongo required. Three layers:
 *
 *   A. STATIC source checks — proves the schema fields exist, the feature
 *      flag is wired, both filter clauses are in place, and the cron has
 *      the belt-and-suspenders protection.
 *
 *   B. FEATURE FLAG matrix — verifies isEnabled() reads ENABLE_DEAL_ROOM
 *      correctly and defaults to off.
 *
 *   C. VISIBILITY-EQUIVALENT MATRIX — simulates the Mongo filters in JS to
 *      prove main feed excludes Deal Room / Archived, and the Deal Room
 *      endpoint excludes Main / Archived. Mutually exclusive surfaces.
 *
 * Run with: `node server/__tests__/dealRoom.test.js`
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const leadIngestV2Src = ''; // unused — keep for parity if needed later
const leadsRouteSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');
const adminInventorySrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminInventory.js'), 'utf8');
const settleSrc = fs.readFileSync(path.join(__dirname, '..', 'jobs', 'settleAuctions.js'), 'utf8');
const leadModelSrc = fs.readFileSync(path.join(__dirname, '..', 'models', 'Lead.js'), 'utf8');

// ── A. Static source-file checks ──────────────────────────────────────────
{
  // Schema fields present
  assert.ok(/inventoryChannel:\s*\{[\s\S]*?enum:\s*\[\s*'main'\s*,\s*'deal_room'\s*,\s*'archived'\s*\]/.test(leadModelSrc),
    'Lead schema must define inventoryChannel with enum [main, deal_room, archived]');
  assert.ok(/inventoryChannel:[\s\S]*?default:\s*'main'/.test(leadModelSrc),
    'inventoryChannel must default to main');
  assert.ok(/originalPrice:\s*\{\s*type:\s*Number/.test(leadModelSrc),
    'Lead schema must define originalPrice as Number');
  console.log('  ✓ A1. Lead schema has inventoryChannel + originalPrice');

  // Main feed exclusion
  assert.ok(/inventoryChannel:\s*\{\s*\$nin:\s*\['deal_room'\s*,\s*'archived'\]\s*\}/.test(leadsRouteSrc),
    'Main feed (GET /api/leads) must exclude deal_room AND archived via $nin');
  console.log('  ✓ A2. Main feed excludes Deal Room + Archived');

  // Deals endpoint exists
  assert.ok(/router\.get\(['"]\/deals['"]/.test(leadsRouteSrc),
    'routes/leads.js must define GET /deals');
  assert.ok(/inventoryChannel:\s*['"]deal_room['"]/.test(leadsRouteSrc),
    'GET /deals must filter inventoryChannel=deal_room');
  assert.ok(/moverVisibilityFilter\(\)/.test(leadsRouteSrc),
    'GET /deals must spread moverVisibilityFilter() (quality stays orthogonal to channel)');
  console.log('  ✓ A3. GET /api/leads/deals endpoint wired with quality filter');

  // Admin bulk endpoint
  assert.ok(/router\.post\(['"]\/bulk['"]/.test(adminInventorySrc),
    'adminInventory must define POST /bulk');
  const actions = ['move_to_deal_room', 'archive', 'restore_to_main'];
  for (const a of actions) {
    assert.ok(adminInventorySrc.includes(`'${a}'`), `bulk endpoint must support action ${a}`);
  }
  console.log('  ✓ A4. POST /api/admin/inventory/bulk supports all three actions');

  // Purchased-lead protection
  assert.ok(/lead\.buyers[\s\S]{0,200}lead\.status\s*===\s*['"]Purchased['"]/.test(adminInventorySrc),
    'bulk endpoint must refuse leads with buyers OR status=Purchased');
  console.log('  ✓ A5. Bulk endpoint refuses already-purchased leads');

  // Cron belt-and-suspenders
  const cronMatches = settleSrc.match(/inventoryChannel:\s*\{\s*\$nin:\s*\['deal_room'\s*,\s*'archived'\]/g);
  assert.ok(cronMatches && cronMatches.length === 2,
    `Settle cron must have inventoryChannel $nin in both queries (settleOneLead + the periodic scan); got ${cronMatches ? cronMatches.length : 0}`);
  console.log('  ✓ A6. Settle cron skips Deal Room + Archived leads (belt-and-suspenders)');

  // Feature flag wired into both endpoints
  assert.ok(/require\(['"][^'"]+dealRoomFeature['"]\)/.test(leadsRouteSrc),
    'GET /deals must require dealRoomFeature');
  assert.ok(/require\(['"][^'"]+dealRoomFeature['"]\)/.test(adminInventorySrc),
    'adminInventory must require dealRoomFeature');
  console.log('  ✓ A7. Both endpoints check ENABLE_DEAL_ROOM via dealRoomFeature.isEnabled()');

  // restore_to_main must not ASSIGN to distributionModel. Docstrings + comments
  // may mention the field; that's intentional documentation. The actual code
  // must not write to it.
  const restoreMatch = adminInventorySrc.match(/else if \(action === 'restore_to_main'\) \{([\s\S]*?)\n\s*\}\n/);
  assert.ok(restoreMatch, 'restore_to_main code block must be locatable in adminInventory.js');
  assert.ok(!/lead\.distributionModel\s*=/.test(restoreMatch[1]),
    'restore_to_main must NOT assign to lead.distributionModel — legacy auction leads stay out of the live feed');
  console.log('  ✓ A8. restore_to_main does not auto-promote to Live Feed');
}

// ── B. Feature flag matrix ────────────────────────────────────────────────
{
  const orig = process.env.ENABLE_DEAL_ROOM;
  function set(v) {
    if (v === undefined) delete process.env.ENABLE_DEAL_ROOM;
    else process.env.ENABLE_DEAL_ROOM = v;
    delete require.cache[require.resolve('../utils/dealRoomFeature')];
    return require('../utils/dealRoomFeature').isEnabled();
  }
  assert.strictEqual(set(undefined), false, 'default (unset) → false');
  assert.strictEqual(set(''),        false, 'empty string → false');
  assert.strictEqual(set('false'),   false, "'false' → false");
  assert.strictEqual(set('0'),       false, "'0' → false");
  assert.strictEqual(set('true'),    true,  "'true' → true");
  assert.strictEqual(set('TRUE'),    true,  'case-insensitive');
  assert.strictEqual(set('1'),       true,  "'1' → true");
  assert.strictEqual(set('garbage'), false, 'unknown → false (conservative)');
  if (orig === undefined) delete process.env.ENABLE_DEAL_ROOM;
  else process.env.ENABLE_DEAL_ROOM = orig;
  console.log('  ✓ B. dealRoomFeature.isEnabled() matrix');
}

// ── C. Visibility-equivalent matrix (Mongo filter simulation) ─────────────
{
  // Faithful evaluator for the specific clause shapes used in both feeds.
  function evalClause(clause, doc) {
    if (clause.$and) return clause.$and.every(c => evalClause(c, doc));
    if (clause.$or)  return clause.$or.some(c => evalClause(c, doc));
    const [path] = Object.keys(clause);
    const op = clause[path];
    const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
    if (op && typeof op === 'object') {
      if (op.$ne !== undefined)     return value !== op.$ne;
      if (op.$nin !== undefined)    {
        if (value === undefined) return true;
        if (Array.isArray(value)) return value.every(v => !op.$nin.includes(v));
        return !op.$nin.includes(value);
      }
      if (op.$in !== undefined)     {
        if (Array.isArray(value)) return value.some(v => op.$in.includes(v));
        return op.$in.includes(value);
      }
      if (op.$exists !== undefined) return (value !== undefined) === op.$exists;
      if (op.$gte !== undefined)    return value !== undefined && value >= op.$gte;
      if (op.$lte !== undefined)    return value !== undefined && value <= op.$lte;
    }
    return value === op;
  }

  // The main feed's availableBranch in routes/leads.js (relevant subset):
  const mainFeed = (doc) => evalClause({
    $and: [
      { status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] } },
      { distributionModel: 'instant' },
      { inventoryChannel: { $nin: ['deal_room', 'archived'] } },
      // moverVisibilityFilter() omitted — same gates for both feeds; not what
      // we're testing here.
    ]
  }, doc);

  // The /api/leads/deals query (relevant subset):
  const dealsFeed = (doc) => evalClause({
    $and: [
      { status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] } },
      { inventoryChannel: 'deal_room' },
    ]
  }, doc);

  // Test fixtures
  const cases = [
    {
      name: 'instant + main channel',
      doc: { status: 'READY_FOR_DISTRIBUTION', distributionModel: 'instant', inventoryChannel: 'main' },
      expectMain: true, expectDeals: false,
    },
    {
      name: 'instant + deal_room',
      doc: { status: 'READY_FOR_DISTRIBUTION', distributionModel: 'instant', inventoryChannel: 'deal_room' },
      expectMain: false, expectDeals: true,
    },
    {
      name: 'auction + deal_room (legacy moved to deals)',
      doc: { status: 'READY_FOR_DISTRIBUTION', distributionModel: 'auction', inventoryChannel: 'deal_room' },
      expectMain: false, expectDeals: true,
    },
    {
      name: 'instant + archived',
      doc: { status: 'READY_FOR_DISTRIBUTION', distributionModel: 'instant', inventoryChannel: 'archived' },
      expectMain: false, expectDeals: false,
    },
    {
      name: 'auction + missing channel (pre-Phase-A legacy)',
      doc: { status: 'READY_FOR_DISTRIBUTION', distributionModel: 'auction' /* no inventoryChannel */ },
      // Main: Phase D blocks (distributionModel != 'instant'). Deals: requires
      // explicit 'deal_room'. Neither shows.
      expectMain: false, expectDeals: false,
    },
    {
      name: 'instant + missing channel (back-compat: pre-Phase-deal-room)',
      doc: { status: 'READY_FOR_DISTRIBUTION', distributionModel: 'instant' /* no inventoryChannel */ },
      // $nin against missing is TRUE → main allows. Deals requires explicit
      // 'deal_room' → blocked.
      expectMain: true, expectDeals: false,
    },
    {
      name: 'instant + main but Pending Verification',
      doc: { status: 'Pending Verification', distributionModel: 'instant', inventoryChannel: 'main' },
      expectMain: false, expectDeals: false,
    },
  ];

  for (const c of cases) {
    assert.strictEqual(mainFeed(c.doc), c.expectMain,
      `MAIN feed visibility for "${c.name}" — expected ${c.expectMain}`);
    assert.strictEqual(dealsFeed(c.doc), c.expectDeals,
      `DEALS feed visibility for "${c.name}" — expected ${c.expectDeals}`);
    // Mutual exclusion invariant: a lead can never appear on both surfaces.
    assert.ok(!(mainFeed(c.doc) && dealsFeed(c.doc)),
      `MUTUAL EXCLUSION violated for "${c.name}"`);
  }
  console.log(`  ✓ C. Main / Deals mutual exclusion across ${cases.length} cases`);
}

// ── D2. Bulk endpoint partial-success contract (Phase 1.6) ───────────────
// Static check: the endpoint returns processed[] and rejected[] arrays, and
// the rejection messages are admin-actionable (mention the actual reason)
// rather than terse internals like "lead has buyers".
{
  // Returned envelope shape
  assert.ok(/processed:\s*processed\.length/.test(adminInventorySrc) || /processedCount:\s*processed\.length/.test(adminInventorySrc),
    'bulk endpoint must return processedCount');
  assert.ok(/rejectedCount:\s*rejected\.length/.test(adminInventorySrc),
    'bulk endpoint must return rejectedCount');
  assert.ok(/processed,\s*\n\s*rejected,/.test(adminInventorySrc),
    'bulk endpoint must return processed[] and rejected[] arrays in response');

  // Admin-actionable rejection messages
  assert.ok(/Already purchased — inventory cannot be changed/.test(adminInventorySrc),
    'rejection: purchased-lead message must explain the constraint, not just say "has buyers"');
  assert.ok(/Lower the deal price or deselect this lead/.test(adminInventorySrc),
    'rejection: dealPrice>originalPrice message must tell admin how to fix it');
  assert.ok(/Lead no longer exists/.test(adminInventorySrc),
    'rejection: not-found message must read naturally');
  assert.ok(/Invalid lead id format/.test(adminInventorySrc),
    'rejection: invalid ObjectId message must read naturally');
  console.log('  ✓ D2. Bulk partial-success contract — admin-actionable rejection messages');
}

// ── E. Client surfaces the partial-success result (Phase 1.6) ─────────────
{
  const adminLeadsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'admin', 'AdminLeads.jsx'), 'utf8');
  assert.ok(/setBulkResult\s*\(/.test(adminLeadsSrc),
    'AdminLeads must set bulkResult after the bulk call (surfaces processed/rejected to UI)');
  assert.ok(/BulkResultModal/.test(adminLeadsSrc),
    'AdminLeads must render BulkResultModal so admin sees per-lead outcomes');
  // Selection should NOT be unconditionally cleared anymore — only when
  // rejectedCount === 0 OR via the per-lead-processed deselection.
  assert.ok(/rejectedCount[\s\S]{0,40}===\s*0[\s\S]{0,80}clearSelection/.test(adminLeadsSrc),
    'AdminLeads must keep selection intact when any leads were rejected (no silent clear)');
  console.log('  ✓ E. AdminLeads surfaces partial-success result + keeps selection on rejection');
}

// ── F. Deal Room mover-side unlock confirmation (Phase 1.6) ───────────────
{
  const dealsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'dashboard', 'Deals.jsx'), 'utf8');
  // Modal exists
  assert.ok(/UnlockConfirmModal/.test(dealsSrc),
    'Deals.jsx must define UnlockConfirmModal');
  // Two-step flow: openConfirm sets state, submitConfirmedUnlock fires the request
  assert.ok(/openConfirm\s*=\s*\(/.test(dealsSrc),
    'Deals.jsx must define openConfirm (step 1: open modal, no purchase yet)');
  assert.ok(/submitConfirmedUnlock\s*=\s*async/.test(dealsSrc),
    'Deals.jsx must define submitConfirmedUnlock (step 2: actual purchase)');
  // DealCard now passes lead object to openConfirm (not (id, price))
  assert.ok(/onUnlock\s*=\s*\{\s*openConfirm\s*\}/.test(dealsSrc),
    'DealCard onUnlock must be wired to openConfirm');
  // Modal shows balance math + warning
  assert.ok(/balanceAfter/.test(dealsSrc),
    'UnlockConfirmModal must compute balance after unlock');
  assert.ok(/Purchase is final/.test(dealsSrc),
    'UnlockConfirmModal must include a finality warning');
  // Reuses existing endpoint — no new money path
  assert.ok(/\/bids\/\$\{leadId\}\/buy-now/.test(dealsSrc),
    'submitConfirmedUnlock must POST to the existing /bids/:id/buy-now endpoint');
  console.log('  ✓ F. Deals page has unlock confirmation modal with balance math + finality warning');
}

// ── G. UI cleanup (Phase 1.6) — no emojis in operational UI ───────────────
{
  const adminLeadsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'admin', 'AdminLeads.jsx'), 'utf8');
  // The admin bulk action bar block (sticky one) and its buttons must not
  // contain the old emoji prefixes. Check the specific tokens that were
  // present in the V1 code.
  const oldEmojis = ['🏷️', '🗄️', '↩️', '⭐', '🔥', '⛔'];
  for (const e of oldEmojis) {
    assert.ok(!adminLeadsSrc.includes(e),
      `Operational UI must not contain emoji "${e}" (cleanup pass)`);
  }
  console.log('  ✓ G. AdminLeads stripped of playful emojis in operational UI');
}

// ── D. money-path invariant (static check) ────────────────────────────────
{
  // bids.js buy-now must still charge lead.buyNowPrice (which IS the deal price
  // after move_to_deal_room mutates it). Verify the source still reads buyNowPrice
  // as `price` and uses it to debit + ledger + PurchasedLead.pricePaid.
  const bidsSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'bids.js'), 'utf8');
  assert.ok(/const\s+price\s*=\s*lead\.buyNowPrice/.test(bidsSrc),
    'buy-now must still read price from lead.buyNowPrice (deal price is the new buyNowPrice)');
  assert.ok(/pricePaid:\s*price/.test(bidsSrc),
    'PurchasedLead.pricePaid must use the same `price` value (audit immutability)');
  console.log('  ✓ D. Money path unchanged (buyNowPrice still authoritative)');
}

console.log('\nAll Deal Room V1 smoke tests passed.');
