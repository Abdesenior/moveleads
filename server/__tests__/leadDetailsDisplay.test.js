/**
 * Lead details display — Phase 1 lock-in.
 *
 * Backend audit (2026-05-26) found that homeType, stairs, heavyItems, and
 * urgencyBucket are collected by the V6 quote funnel and persisted on the
 * Lead schema but were never rendered to the mover. The data wasn't lost —
 * the display layer was just skipping it. Phase 1 wires those fields into
 * the three mover-facing surfaces:
 *
 *   - LeadFeed PreviewModal (pre-purchase)
 *   - PurchaseSuccessModal (just-bought)
 *   - MyLeads ExpandedPanel (purchased history)
 *
 * Plus filters the synthetic `noemail+{phone}@moveleads.cloud` placeholder
 * out of MyLeads (PurchaseSuccessModal already does it).
 *
 * Pure-Node, no Mongo, no jsdom. Source-level + helper-behavior assertions.
 *
 * Run: `node server/__tests__/leadDetailsDisplay.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.join(__dirname, '..', '..', 'client', 'src');
const leadDisplaySrc       = fs.readFileSync(path.join(clientRoot, 'utils', 'leadDisplay.js'), 'utf8');
const leadFeedSrc          = fs.readFileSync(path.join(clientRoot, 'pages', 'dashboard', 'LeadFeed.jsx'), 'utf8');
const purchaseSuccessSrc   = fs.readFileSync(path.join(clientRoot, 'components', 'PurchaseSuccessModal.jsx'), 'utf8');
const myLeadsSrc           = fs.readFileSync(path.join(clientRoot, 'pages', 'dashboard', 'MyLeads.jsx'), 'utf8');

// ── A. leadDisplay helper module ─────────────────────────────────────────

test('A1. leadDisplay exports the five helpers we expect', () => {
  for (const name of ['formatHomeType', 'formatStairs', 'formatUrgency', 'isRealEmail', 'heavyItemTone']) {
    assert.match(
      leadDisplaySrc,
      new RegExp(`export function ${name}\\b`),
      `leadDisplay.js must export ${name}()`
    );
  }
});

test('A2. leadDisplay helpers map enum values correctly (behavior, not just source)', async () => {
  // Behavior check — load the actual module via dynamic import (ESM).
  const url = 'file://' + path.join(clientRoot, 'utils', 'leadDisplay.js');
  const mod = await import(url);

  // homeType
  assert.equal(mod.formatHomeType('house'),     'House');
  assert.equal(mod.formatHomeType('apartment'), 'Apartment');
  assert.equal(mod.formatHomeType('condo'),     'Condo');
  assert.equal(mod.formatHomeType('townhouse'), 'Townhouse');
  assert.equal(mod.formatHomeType('storage'),   'Storage unit');
  assert.equal(mod.formatHomeType('other'),     'Other');
  assert.equal(mod.formatHomeType(undefined),   '—', 'undefined → em-dash placeholder');

  // stairs — the operationally-critical mapping
  assert.equal(mod.formatStairs('ground_floor'),  'Ground floor');
  assert.equal(mod.formatStairs('walk_up_2'),     'Walk-up — 2 floors');
  assert.equal(mod.formatStairs('walk_up_3plus'), 'Walk-up — 3+ floors');
  assert.equal(mod.formatStairs('elevator'),      'Elevator');

  // urgency
  assert.equal(mod.formatUrgency('asap'),       'ASAP');
  assert.equal(mod.formatUrgency('this_week'),  'This week');
  assert.equal(mod.formatUrgency('this_month'), 'This month');
  assert.equal(mod.formatUrgency('flexible'),   'Flexible');

  // isRealEmail — filters the synthetic placeholder
  assert.equal(mod.isRealEmail('jane@example.com'),                              true);
  assert.equal(mod.isRealEmail('noemail+15555550100@moveleads.cloud'),           false);
  assert.equal(mod.isRealEmail(''),                                              false);
  assert.equal(mod.isRealEmail(null),                                            false);
  assert.equal(mod.isRealEmail(undefined),                                       false);

  // heavyItemTone — visual weighting
  assert.equal(mod.heavyItemTone('Upright piano'), 'heavy');
  assert.equal(mod.heavyItemTone('Gun safe'),      'heavy');
  assert.equal(mod.heavyItemTone('Hot tub'),       'heavy');
  assert.equal(mod.heavyItemTone('Pool table'),    'heavy');
  assert.equal(mod.heavyItemTone('Couch'),         'neutral');
  assert.equal(mod.heavyItemTone(''),              'neutral');
});

// ── B. PreviewModal (pre-purchase) — operational details visible ─────────

test('B1. PreviewModal imports the leadDisplay helpers', () => {
  assert.match(leadFeedSrc, /from\s+['"]\.\.\/\.\.\/utils\/leadDisplay['"]/,
    'LeadFeed.jsx must import from utils/leadDisplay');
  for (const fn of ['formatHomeType', 'formatStairs', 'formatUrgency', 'heavyItemTone']) {
    assert.match(leadFeedSrc, new RegExp(`\\b${fn}\\b`),
      `LeadFeed.jsx must reference ${fn}`);
  }
});

test('B2. PreviewModal renders Home Type / Access / Urgency rows when present', () => {
  // Each row is conditional on the lead field being truthy, and feeds
  // through the helper. Source-level assertion checks the wiring.
  assert.match(leadFeedSrc, /lead\.homeType\s*&&\s*<Row\s+label="Home Type"\s+value=\{formatHomeType\(lead\.homeType\)\}/);
  assert.match(leadFeedSrc, /lead\.stairs\s+&&\s*<Row\s+label="Access"\s+value=\{formatStairs\(lead\.stairs\)\}/);
  assert.match(leadFeedSrc, /lead\.urgencyBucket\s*&&\s*<Row\s+label="Urgency"\s+value=\{formatUrgency\(lead\.urgencyBucket\)\}/);
});

test('B3. PreviewModal renders heavyItems chips when non-empty', () => {
  assert.match(leadFeedSrc, /lead\.heavyItems[\s\S]*?\.length\s*>\s*0/,
    'must gate the chip block on heavyItems.length > 0');
  assert.match(leadFeedSrc, /lead\.heavyItems\.map/,
    'must map over heavyItems');
  assert.match(leadFeedSrc, /Heavy items/,
    'must label the chip block');
});

// ── C. PurchaseSuccessModal (just-bought) ────────────────────────────────
//
// 2026-05-26 architecture simplification (PR A of lead-detail cleanup):
// the modal celebrates the unlock + hands off to MyLeads. It must NOT
// re-render the operational-details breakdown — that's MyLeads' job.

test('C1. PurchaseSuccessModal imports isRealEmail (only)', () => {
  assert.match(purchaseSuccessSrc, /from\s+['"]\.\.\/utils\/leadDisplay['"]/,
    'must import from utils/leadDisplay');
  assert.match(purchaseSuccessSrc, /\bisRealEmail\b/,
    'must reference isRealEmail');
});

test('C2. PurchaseSuccessModal does NOT re-render the Move details breakdown', () => {
  // The pre-PR-A modal had a detailRows array enumerating homeType /
  // access / urgency / distance — duplicated content the mover already
  // saw in PreviewModal and is about to see in MyLeads.
  assert.ok(!/detailRows\s*=\s*\[/.test(purchaseSuccessSrc),
    'detailRows array must be removed (was the duplicated Move details card data)');
  assert.ok(!/formatHomeType\(lead\.homeType\)/.test(purchaseSuccessSrc),
    'formatHomeType must not be called here (use MyLeads for full breakdown)');
  assert.ok(!/formatStairs\(lead\.stairs\)/.test(purchaseSuccessSrc),
    'formatStairs must not be called here');
  assert.ok(!/formatUrgency\(lead\.urgencyBucket\)/.test(purchaseSuccessSrc),
    'formatUrgency must not be called here');
  // The label string "Move details" was the heading of the removed card.
  assert.ok(!/>\s*Move details\s*</.test(purchaseSuccessSrc),
    'the "Move details" card heading must be removed');
});

test('C3. PurchaseSuccessModal does NOT enumerate heavy items', () => {
  // Heavy items chips moved to MyLeads. The success modal mentions them
  // in the handoff cue ("heavy items included") but does not list them.
  assert.ok(!/heavyItems\.map/.test(purchaseSuccessSrc),
    'heavyItems.map must be removed (no chip enumeration in this modal)');
  assert.ok(!/heavyItemTone\(/.test(purchaseSuccessSrc),
    'heavyItemTone must not be called here — chip styling lives in MyLeads now');
});

test('C4. PurchaseSuccessModal uses isRealEmail to gate the email row', () => {
  assert.match(purchaseSuccessSrc, /isRealEmail\(lead\.customerEmail\)/,
    'must call isRealEmail to filter the noemail+ placeholder');
});

test('C5. PurchaseSuccessModal renders the My Leads handoff cue', () => {
  // Single cue line below the customer-details card telling the mover
  // where to find the full breakdown. Subtle copy, not a button.
  assert.match(purchaseSuccessSrc, /My Leads/,
    'must reference "My Leads" in the handoff cue');
  assert.match(purchaseSuccessSrc, /Home type, access, urgency/,
    'cue must enumerate the categories the mover will find in MyLeads');
});

test('C6. PurchaseSuccessModal conditionally mentions heavy items in the cue (no list)', () => {
  // When heavyItems.length > 0 the cue includes the phrase "heavy items
  // included" — but does NOT render the list of items. The actual list
  // is in MyLeads.
  assert.match(purchaseSuccessSrc, /hasHeavyItems/,
    'must compute hasHeavyItems boolean to gate the cue text');
  assert.match(purchaseSuccessSrc, /heavy items included/i,
    'cue must use the phrase "heavy items included" when hasHeavyItems is true');
});

// ── D. MyLeads ExpandedPanel (post-purchase history) ─────────────────────

test('D1. MyLeads imports the leadDisplay helpers', () => {
  assert.match(myLeadsSrc, /from\s+['"]\.\.\/\.\.\/utils\/leadDisplay['"]/);
  for (const fn of ['formatHomeType', 'formatStairs', 'formatUrgency', 'heavyItemTone', 'isRealEmail']) {
    assert.match(myLeadsSrc, new RegExp(`\\b${fn}\\b`),
      `MyLeads must reference ${fn}`);
  }
});

test('D2. ExpandedPanel renders the Move details block above the contact/CRM grid', () => {
  assert.match(myLeadsSrc, /Move details/,
    'must label the operational details block');
  assert.match(myLeadsSrc, /detailRows\s*=\s*\[/,
    'must build a detailRows array (same pattern as PurchaseSuccessModal)');
  assert.match(myLeadsSrc, /heavyItems\.map/,
    'must render heavyItems as chips');
});

test('D3. MyLeads filters out noemail+ placeholder from the email row', () => {
  // Earlier the email row rendered lead?.customerEmail directly which
  // would show `noemail+15555550100@moveleads.cloud` for any homeowner
  // who skipped the optional Email field. Now gated by isRealEmail.
  assert.match(myLeadsSrc, /emailToShow\s*=\s*isRealEmail\(/,
    'must compute emailToShow via isRealEmail');
  // The plain ` lead?.customerEmail` direct render (without the filter)
  // should be gone.
  assert.ok(!/<div[^>]*>\{lead\?\.customerEmail\}<\/div>/.test(myLeadsSrc),
    'must not render lead.customerEmail directly without the isRealEmail filter');
});

// ── E. Cross-surface consistency ─────────────────────────────────────────

test('E1. All three surfaces use the same helper module (no inline copies)', () => {
  // Reject any inline {ground_floor: '...'} or similar — every surface
  // must go through the shared helper so labels can never drift.
  for (const [name, src] of [
    ['LeadFeed.jsx',             leadFeedSrc],
    ['PurchaseSuccessModal.jsx', purchaseSuccessSrc],
    ['MyLeads.jsx',              myLeadsSrc],
  ]) {
    // Allow the helper module itself to declare the maps. Other files
    // must not have their own walk_up_3plus lookup table.
    assert.ok(!/walk_up_3plus['"]?\s*:\s*['"]/.test(src),
      `${name} must not redefine the stairs label map (use formatStairs from leadDisplay)`);
  }
});

console.log('\nLead-details-display Phase 1 lock-in tests scheduled.');
