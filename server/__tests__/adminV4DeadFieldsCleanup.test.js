/**
 * V4 dead-fields admin cleanup lock-in.
 *
 * 2026-05-26 cleanup: dropped the `estimatedWeight` and `numberOfRooms`
 * inputs from the admin Lead edit modal. They were V4-only legacy fields
 * never written by V5/V6 funnels, so every modern lead showed them as
 * empty rows in the modal — noise. The schema retains the fields for
 * V4 back-compat (legacy ingest path still writes them); only the admin
 * UI was changed.
 *
 * This test makes sure they don't quietly come back.
 *
 * Run: `node server/__tests__/adminV4DeadFieldsCleanup.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adminLeadsSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'admin', 'AdminLeads.jsx'),
  'utf8'
);
const leadModelSrc = fs.readFileSync(
  path.join(__dirname, '..', 'models', 'Lead.js'),
  'utf8'
);
const v4ValidatorSrc = fs.readFileSync(
  path.join(__dirname, '..', 'validators', 'leadIngest.js'),
  'utf8'
);

// ── A. Admin modal no longer renders the dead inputs ─────────────────────

test('A1. AdminLeads edit modal does NOT render numberOfRooms input', () => {
  // The <input name="numberOfRooms"> was the V4-only rooms count field.
  const inputRegex = /<input[^>]*\bname=["']numberOfRooms["']/;
  assert.doesNotMatch(
    adminLeadsSrc, inputRegex,
    'numberOfRooms input must NOT be rendered in the admin edit modal'
  );
});

test('A2. AdminLeads edit modal does NOT render estimatedWeight input', () => {
  const inputRegex = /<input[^>]*\bname=["']estimatedWeight["']/;
  assert.doesNotMatch(
    adminLeadsSrc, inputRegex,
    'estimatedWeight input must NOT be rendered in the admin edit modal'
  );
});

test('A3. AdminLeads form-state initialization does not include the dead fields', () => {
  // emptyForm + handleEditClick + handleAddLead payload assembly should
  // all be free of `estimatedWeight:` / `numberOfRooms:` keys. Comments
  // mentioning the field NAMES (for audit-trail) are allowed; what's
  // disallowed is a key in an object literal.
  //
  // We assert no `<key>: …` assignment exists.
  const numberOfRoomsKey = /\bnumberOfRooms\s*:\s*[^/]/;     // : followed by anything except a / (avoid // comments)
  const estimatedWeightKey = /\bestimatedWeight\s*:\s*[^/]/;
  assert.doesNotMatch(adminLeadsSrc, numberOfRoomsKey,
    'numberOfRooms must not appear as an object-literal key in AdminLeads.jsx');
  assert.doesNotMatch(adminLeadsSrc, estimatedWeightKey,
    'estimatedWeight must not appear as an object-literal key in AdminLeads.jsx');
});

test('A4. Weight icon import is dropped (was only used by Est. Weight field)', () => {
  // The Weight icon was only referenced by the removed input; cleaning
  // up the import keeps the file tidy. Hash stays — it's used by Origin
  // ZIP / Destination ZIP fields.
  const importLine = adminLeadsSrc.split('\n').find(l => l.startsWith("import {") && l.includes("'lucide-react'"));
  assert.ok(importLine, 'expected lucide-react import line');
  assert.ok(!/\bWeight\b/.test(importLine),
    'Weight icon must be removed from the lucide-react import line');
  assert.ok(/\bHash\b/.test(importLine),
    'Hash icon must remain (used by ZIP fields)');
});

test('A5. Cleanup intent is documented in a code comment', () => {
  // Future-self / next-engineer should find the why without having to
  // reach for git blame.
  assert.match(adminLeadsSrc, /V4.*dead.*field|dead.*V4.*field|V4-only.*legacy/i,
    'admin file must explain the cleanup intent in a comment so the dead inputs do not come back');
});

// ── B. Schema + V4 validator are UNCHANGED — back-compat preserved ──────

test('B1. Lead schema STILL defines estimatedWeight + numberOfRooms', () => {
  // No schema change. Legacy V4 leads + the V4 ingest path still need
  // these fields. The cleanup was UI-only.
  assert.match(leadModelSrc, /\bestimatedWeight\b/,
    'Lead.js must still declare estimatedWeight (V4 back-compat)');
  assert.match(leadModelSrc, /\bnumberOfRooms\b/,
    'Lead.js must still declare numberOfRooms (V4 back-compat)');
});

test('B2. V4 ingest validator (leadIngest.js) STILL accepts both fields', () => {
  // The legacy V4 funnel writes through server/validators/leadIngest.js
  // (NOT leadIngestV2.js). That path must remain untouched.
  assert.match(v4ValidatorSrc, /\bestimatedWeight\b/);
  assert.match(v4ValidatorSrc, /\bnumberOfRooms\b/);
});

console.log('\nV4 dead-fields admin cleanup lock-in tests scheduled.');
