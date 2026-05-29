/**
 * Admin lead PUT allowlist — status removal lock-in.
 *
 * Closes the fourth (and final relevant) silent-approved-inventory bug
 * class. PR #52 closed admin.approve; PR #54 closed admin.rescore;
 * PR #56 closed admin.tier_override.clear; this PR closes the
 * admin-lead-edit-form path through PUT /api/leads/:id.
 *
 * Background:
 *   The ADMIN_LEAD_WRITABLE allowlist in routes/leads.js controlled which
 *   fields an admin could update via the lead-edit form (PUT /api/leads/:id).
 *   It included 'status' — which meant an admin could flip
 *   status='READY_FOR_DISTRIBUTION' directly via the edit form. **The
 *   lead became distributable but no SMS / email / socket broadcast
 *   fired** — exactly the silent-inventory bug class the orchestrator
 *   wirings were built to close.
 *
 *   Identified during the launch-readiness silent-state hunt (finding F-9
 *   / HIGH-CONFIDENCE-FIX-PLAN F5). 100% confidence — verified by direct
 *   code inspection.
 *
 * Fix: remove 'status' from the allowlist. Admins who need to change
 * status must use the dedicated routes (approve / reject / etc.) which
 * both update status AND trigger dispatchApprovedLead via the canonical
 * orchestrator (PR #52/54/56).
 *
 * This suite pins:
 *
 *   A. 'status' is NOT in ADMIN_LEAD_WRITABLE
 *   B. The PUT handler still uses ADMIN_LEAD_WRITABLE as the source-of-
 *      truth allowlist (regression guard against an alternative writing
 *      mechanism slipping in)
 *   C. The existing editable fields are preserved (regression guard)
 *   D. PR #52 admin.approve wiring is unchanged
 *   E. PR #54 admin.rescore wiring is unchanged
 *   F. PR #56 admin.tier_override.clear wiring is unchanged
 *   G. The dedicated approve route DOES write status (so admins still
 *      have a way to advance status — through the orchestrator-wired path)
 *   H. Scope discipline — no other ADMIN_LEAD_WRITABLE-style allowlists
 *      were created
 *
 * Pure-Node, no Mongo. Source-level assertions.
 *
 * Run: `node server/__tests__/adminLeadAllowlistStatusRemoval.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const leadsRoutePath = path.join(serverRoot, 'routes', 'leads.js');
const adminRoutePath = path.join(serverRoot, 'routes', 'admin.js');

const leadsSrc = fs.readFileSync(leadsRoutePath, 'utf8');
const adminSrc = fs.readFileSync(adminRoutePath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const leadsExec = stripComments(leadsSrc);
const adminExec = stripComments(adminSrc);

// Isolate the ADMIN_LEAD_WRITABLE array.
const allowlistMatch = leadsExec.match(/const\s+ADMIN_LEAD_WRITABLE\s*=\s*\[([\s\S]*?)\]\s*;/);
const allowlistBody = allowlistMatch ? allowlistMatch[1] : '';

// ── A. 'status' is NOT in the allowlist ────────────────────────────────

test('A1. ADMIN_LEAD_WRITABLE does NOT include "status"', () => {
  assert.ok(allowlistMatch, 'ADMIN_LEAD_WRITABLE array must be findable');
  // Match 'status' as a standalone entry (with quote characters around it,
  // not embedded inside another field name like 'auctionStatus').
  assert.doesNotMatch(
    allowlistBody,
    /['"]status['"]/,
    'ADMIN_LEAD_WRITABLE must NOT include "status" — writing status via ' +
    'the lead-edit form bypasses the canonical post-approval orchestrator ' +
    'and produces silent approved inventory'
  );
});

test('A2. ADMIN_LEAD_WRITABLE does NOT include any lifecycle-critical alias', () => {
  // Defense-in-depth: confirm no future contributor added an alias for
  // status (e.g., "leadStatus", "currentStatus") that would re-introduce
  // the bug.
  for (const forbidden of [
    /['"]leadStatus['"]/,
    /['"]currentStatus['"]/,
    /['"]auctionStatus['"]/,
    /['"]distributionDecision['"]/,
    /['"]notifiedAt['"]/,
    /['"]winnerId['"]/,
    /['"]finalPrice['"]/,
    /['"]buyers['"]/,
  ]) {
    assert.doesNotMatch(allowlistBody, forbidden,
      `ADMIN_LEAD_WRITABLE must NOT include lifecycle-critical field matching ${forbidden}`);
  }
});

// ── B. PUT handler still gates on ADMIN_LEAD_WRITABLE ──────────────────

test('B1. PUT /:id handler iterates ADMIN_LEAD_WRITABLE for the $set payload', () => {
  // If a future contributor adds an alternative writing mechanism (e.g.,
  // spreading req.body directly), the silent-inventory bug returns. Pin
  // the for-loop that uses the allowlist as the only write path.
  assert.match(
    leadsExec,
    /for\s*\(\s*const\s+key\s+of\s+ADMIN_LEAD_WRITABLE\s*\)\s*\{[\s\S]{0,200}update\[key\]\s*=\s*req\.body\[key\]/,
    'PUT handler must iterate ADMIN_LEAD_WRITABLE to build the update object'
  );
});

test('B2. PUT handler does NOT spread req.body into the update', () => {
  // Defense-in-depth — the prior bug class. Confirm no `...req.body` slip.
  const putBlockMatch = leadsExec.match(
    /router\.put\(\s*['"]\/:id['"][\s\S]*?(?=router\.(get|post|put|delete|patch)|module\.exports)/
  );
  assert.ok(putBlockMatch, 'PUT /:id handler block must be findable');
  assert.doesNotMatch(putBlockMatch[0], /\.\.\.req\.body/,
    'PUT handler must NOT spread req.body — must use the ADMIN_LEAD_WRITABLE allowlist');
});

// ── C. Existing editable fields preserved ─────────────────────────────

test('C1. Pricing fields (buyNowPrice, currentBidPrice, score, grade) remain editable', () => {
  for (const field of ['buyNowPrice', 'currentBidPrice', 'score', 'grade']) {
    assert.match(allowlistBody, new RegExp(`['"]${field}['"]`),
      `Existing editable field '${field}' must remain in the allowlist`);
  }
});

test('C2. PII fields (customerName, customerPhone, customerEmail) remain editable', () => {
  for (const field of ['customerName', 'customerPhone', 'customerEmail']) {
    assert.match(allowlistBody, new RegExp(`['"]${field}['"]`),
      `Existing editable field '${field}' must remain in the allowlist`);
  }
});

test('C3. Route/move-detail fields remain editable', () => {
  for (const field of [
    'originCity', 'originState', 'originZip',
    'destinationCity', 'destinationState', 'destinationZip',
    'homeSize', 'moveDate', 'distance', 'miles', 'specialInstructions',
  ]) {
    assert.match(allowlistBody, new RegExp(`['"]${field}['"]`),
      `Existing editable field '${field}' must remain in the allowlist`);
  }
});

// ── D/E/F. PR #52/54/56 dispatch wirings unchanged ─────────────────────

test('D1. PR #52 admin.approve still calls dispatchApprovedLead', () => {
  assert.match(
    adminExec,
    /dispatchApprovedLead\(\s*lead\._id\s*,\s*\{\s*source:\s*['"]admin\.approve['"]\s*\}\s*\)/,
    'PR #52 admin.approve dispatch wiring must remain'
  );
});

test('E1. PR #54 admin.rescore still calls dispatchApprovedLead', () => {
  assert.match(
    adminExec,
    /dispatchApprovedLead\(\s*req\.params\.id\s*,\s*\{\s*source:\s*['"]admin\.rescore['"]\s*\}\s*\)/,
    'PR #54 admin.rescore dispatch wiring must remain'
  );
});

test('F1. PR #56 admin.tier_override.clear still calls dispatchApprovedLead', () => {
  assert.match(
    adminExec,
    /dispatchApprovedLead\(\s*lead\._id\s*,\s*\{\s*source:\s*['"]admin\.tier_override\.clear['"]\s*\}\s*\)/,
    'PR #56 admin.tier_override.clear dispatch wiring must remain'
  );
});

// ── G. The approve route writes status (so admins have a valid path) ──

test('G1. Admin approve route does upgrade status to READY_FOR_DISTRIBUTION', () => {
  // Sanity: trimming 'status' from the allowlist means admins cannot
  // write status via the edit form. They must use the approve route.
  // This test pins that the approve route DOES write status — so the
  // workflow remains intact (status changes happen, via the proper path).
  assert.match(
    adminExec,
    /lead\.status\s*=\s*['"]READY_FOR_DISTRIBUTION['"]/,
    'Admin approve route must still upgrade status to READY_FOR_DISTRIBUTION — ' +
    'this is the canonical path for status changes after trimming the edit-form path'
  );
});

// ── H. Scope discipline ────────────────────────────────────────────────

test('H1. Only one ADMIN_LEAD_WRITABLE allowlist exists (no shadow allowlists)', () => {
  // Defense-in-depth: confirm no second allowlist was introduced that
  // could allow status writes by a different name.
  const matches = leadsExec.match(/const\s+ADMIN_LEAD_WRITABLE\s*=/g) || [];
  assert.equal(matches.length, 1,
    'Exactly one ADMIN_LEAD_WRITABLE constant must exist — no shadow allowlists');
});

test('H2. No alternative admin-status-write route was added', () => {
  // Trimming 'status' from the allowlist forces admins through approve/
  // reject. Confirm no contributor added an alternative direct-status-
  // write route (e.g., PATCH /:id/status) that would defeat the purpose.
  for (const forbidden of [
    /router\.(post|patch|put)\(\s*['"]\/:id\/status['"]/,
    /router\.(post|patch|put)\(\s*['"]\/leads\/:id\/status['"]/,
    /router\.(post|patch|put)\(\s*['"]\/:id\/set-status['"]/,
  ]) {
    assert.doesNotMatch(leadsExec, forbidden,
      `No direct-status-write route must exist matching ${forbidden}`);
    assert.doesNotMatch(adminExec, forbidden,
      `No direct-status-write route must exist matching ${forbidden}`);
  }
});

console.log('Admin lead PUT allowlist status removal tests scheduled.');
