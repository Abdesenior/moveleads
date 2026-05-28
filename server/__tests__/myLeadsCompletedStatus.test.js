/**
 * MyLeads "Completed" CRM status (PR-D4) lock-in.
 *
 * Before this PR, the MyLeads UI exposed 5 status buttons:
 *   ['New', 'Contacted', 'Quoted', 'Booked', 'Lost']
 *
 * But the backend PurchasedLead schema enum had ALWAYS allowed 6:
 *   ['New', 'Contacted', 'Quoted', 'Booked', 'Completed', 'Lost']
 *
 * AND setting crmStatus='Completed' via PATCH /api/leads/:id/crm-status
 * triggers the existing sendReviewRequestEmail() automation in
 * routes/leads.js. The UI was the only thing blocking movers from
 * closing the lifecycle from the dashboard. A backend-supported feature
 * (review-email auto-fire) was silently disconnected from the dashboard.
 *
 * PR-D4 adds 'Completed' to the UI status set so the contract matches.
 *
 * What this suite locks in:
 *
 *   A. DRIFT-SAFETY — the UI STATUSES array equals the backend
 *      PurchasedLead.CRM_STATUSES exactly (same order, same values).
 *      This is the load-bearing assertion. If anyone touches either
 *      side and the two drift, this test goes red and the
 *      review-email auto-fire feature can never get silently
 *      re-disconnected.
 *   B. The new entry exists at the expected position (between Booked
 *      and Lost).
 *   C. STATUS_META has a renderable entry for every status in
 *      STATUSES (no orphan status would render with broken styling).
 *   D. Audit-trail comment is present.
 *   E. The backend route (PATCH /api/leads/:id/crm-status) still
 *      validates against CRM_STATUSES — i.e., the route accepts
 *      'Completed' as before (regression guard).
 *
 * Pure-Node, no Mongo, no jsdom. Source-level assertions only.
 *
 * Run: `node server/__tests__/myLeadsCompletedStatus.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.join(__dirname, '..', '..', 'client', 'src');
const myLeadsSrc      = fs.readFileSync(path.join(clientRoot, 'pages', 'dashboard', 'MyLeads.jsx'), 'utf8');
const leadsRouteSrc   = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'),          'utf8');

// Load the backend enum directly — single source of truth on the server.
const { CRM_STATUSES: backendStatuses } = (() => {
  // The schema file requires mongoose; we don't want to pull mongoose in
  // for a source-level test. Parse the literal from the source instead.
  const schemaSrc = fs.readFileSync(path.join(__dirname, '..', 'models', 'PurchasedLead.js'), 'utf8');
  const m = schemaSrc.match(/const\s+CRM_STATUSES\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error('Could not locate CRM_STATUSES literal in PurchasedLead.js');
  // Safe eval of a literal-array — we already grep-bounded it.
  // eslint-disable-next-line no-eval
  const arr = eval(m[1]);
  return { CRM_STATUSES: arr };
})();

// Parse the UI STATUSES literal the same way.
const uiStatuses = (() => {
  const m = myLeadsSrc.match(/const\s+STATUSES\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error('Could not locate STATUSES literal in MyLeads.jsx');
  // eslint-disable-next-line no-eval
  return eval(m[1]);
})();

// ── A. Drift-safety: UI STATUSES === backend CRM_STATUSES ───────────────

test('A1. UI STATUSES is an exact match for backend PurchasedLead.CRM_STATUSES', () => {
  assert.deepEqual(
    uiStatuses, backendStatuses,
    `UI/backend status enum drift detected.\n  UI:      ${JSON.stringify(uiStatuses)}\n  Backend: ${JSON.stringify(backendStatuses)}\n` +
    `If you intentionally changed one side, update the other in the same PR. The backend route auto-fires sendReviewRequestEmail() on 'Completed' transitions; orphan UI states silently disconnect that.`
  );
});

test('A2. Both sides include the canonical six statuses', () => {
  const expected = ['New', 'Contacted', 'Quoted', 'Booked', 'Completed', 'Lost'];
  assert.deepEqual(uiStatuses, expected);
  assert.deepEqual(backendStatuses, expected);
});

// ── B. Position rationale: Completed between Booked and Lost ────────────

test("B1. 'Completed' is positioned between 'Booked' and 'Lost' in the UI", () => {
  const i = uiStatuses.indexOf('Completed');
  assert.ok(i > -1, "'Completed' must be present in UI STATUSES");
  assert.equal(uiStatuses[i - 1], 'Booked',  "Status before 'Completed' should be 'Booked'");
  assert.equal(uiStatuses[i + 1], 'Lost',    "Status after 'Completed' should be 'Lost'");
});

// ── C. STATUS_META has a renderable entry for every status ──────────────

test('C1. STATUS_META has an entry for every status (no orphan rendering)', () => {
  // Extract the STATUS_META keys directly from source. The block sits
  // immediately after STATUSES.
  const metaBlock = myLeadsSrc.match(/const\s+STATUS_META\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(metaBlock, 'STATUS_META block must be findable');
  for (const s of uiStatuses) {
    const entryRe = new RegExp(`\\b${s}\\s*:\\s*\\{`);
    assert.match(
      metaBlock[1], entryRe,
      `STATUS_META is missing an entry for '${s}' — buttons + pills for this status would render with fallback styling`
    );
  }
});

test("C2. STATUS_META entry for 'Completed' has color / bg / border keys", () => {
  // Defensive: pin the shape of the new entry. Mismatched keys would
  // render as black-on-transparent pills.
  const completedBlock = myLeadsSrc.match(/Completed:\s*\{([^}]*)\}/);
  assert.ok(completedBlock, "STATUS_META.Completed must be findable");
  assert.match(completedBlock[1], /\bcolor:/);
  assert.match(completedBlock[1], /\bbg:/);
  assert.match(completedBlock[1], /\bborder:/);
});

// ── D. Audit-trail comment present ──────────────────────────────────────

test('D1. MyLeads.jsx contains the PR-D4 audit-trail comment', () => {
  assert.match(
    myLeadsSrc,
    /PR-D4:\s*'Completed' added to the UI status set/i,
    "Audit-trail comment must explain the addition and the drift-safety contract"
  );
});

// ── E. Backend route still validates against CRM_STATUSES ───────────────

test('E1. Backend route PATCH /api/leads/:id/crm-status still validates against CRM_STATUSES', () => {
  // The route imports CRM_STATUSES (via PurchasedLead.CRM_STATUSES) and
  // rejects unknown values. Regression guard.
  assert.match(
    leadsRouteSrc,
    /crm-status/i,
    'leads.js must still register the crm-status route'
  );
  assert.match(
    leadsRouteSrc,
    /CRM_STATUSES/,
    'leads.js must reference CRM_STATUSES for validation'
  );
});

console.log('MyLeads Completed CRM status (PR-D4) tests scheduled.');
