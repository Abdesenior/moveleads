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

test('C1. PurchaseSuccessModal imports the leadDisplay helpers', () => {
  assert.match(purchaseSuccessSrc, /from\s+['"]\.\.\/utils\/leadDisplay['"]/,
    'PurchaseSuccessModal must import from utils/leadDisplay');
});

test('C2. PurchaseSuccessModal builds a detailRows array from the four fields', () => {
  // The component computes a `detailRows` array filtering out missing
  // fields so it doesn't render em-dash rows. The shape:
  //   { label: 'Home type', value: formatHomeType(lead.homeType) }
  assert.match(purchaseSuccessSrc, /detailRows\s*=\s*\[/);
  assert.match(purchaseSuccessSrc, /formatHomeType\(lead\.homeType\)/);
  assert.match(purchaseSuccessSrc, /formatStairs\(lead\.stairs\)/);
  assert.match(purchaseSuccessSrc, /formatUrgency\(lead\.urgencyBucket\)/);
});

test('C3. PurchaseSuccessModal renders the Move details card', () => {
  assert.match(purchaseSuccessSrc, /Move details/,
    'must label the operational details block');
  assert.match(purchaseSuccessSrc, /heavyItems\.map/,
    'must render heavyItems as chips');
});

test('C4. PurchaseSuccessModal uses isRealEmail to gate the email row', () => {
  // The earlier inline `startsWith('noemail+')` check is replaced by the
  // shared helper for consistency with MyLeads.
  assert.match(purchaseSuccessSrc, /isRealEmail\(lead\.customerEmail\)/,
    'must call isRealEmail to filter the noemail+ placeholder');
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
