/**
 * Admin distribution-diagnose endpoint lock-in.
 *
 * Operational observability endpoint added 2026-05-28 in response to a
 * staging SMS Claim test where a quote-flow Alabama lead appeared in the
 * admin dashboard but no SMS broadcast reached the configured Alabama
 * mover. Admin dashboard visibility is NOT the same as mover distribution
 * eligibility; the broadcast can be suppressed by:
 *
 *   1. verifyLeadPhone qualificationFailed (shadowTier=rejected /
 *      qualityGateCleared=false / adminTierOverride=rejected)
 *   2. isHiddenFromMovers (distributionDecision NOT in
 *      {system_approved, admin_approved})
 *   3. notifiedAt dedup (non-null without force:true)
 *
 * This endpoint replaces the need for direct Mongo shell access. It
 * answers ALL THREE suppression points in a single read-only call.
 *
 * What this suite pins (source-level — the route file loads Stripe which
 * needs a key in test runners, so behavioral tests aren't feasible here;
 * matches the existing admin-route lock-in convention):
 *
 *   A. Route exists at GET /api/admin/leads/:id/distribution-diagnose
 *      with [auth, admin] middleware
 *   B. Response shape — every operator-required field is in the response
 *   C. Derived predicates — hiddenFromMovers / distributable /
 *      qualificationFailed / broadcastWouldSuppress all present
 *   D. Derived predicates REUSE the production helpers (isHiddenFromMovers,
 *      hiddenReason, isDistributable) so they stay in lockstep with the
 *      broadcast path
 *   E. broadcastWouldSuppressBy enumerates the three suppression sources
 *      in priority order matching verifyLeadPhone → broadcastLeadSMS
 *   F. Scope discipline — endpoint does NOT trigger broadcast, does NOT
 *      write to any model, does NOT call into matcher / dispatchPolicy
 *      / Twilio / socket
 *
 * Pure-Node, no Mongo. Source-level assertions on the route file.
 *
 * Run: `node server/__tests__/adminDistributionDiagnose.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adminRoutePath = path.join(__dirname, '..', 'routes', 'admin.js');
const adminSrc = fs.readFileSync(adminRoutePath, 'utf8');

// Strip JS comments so audit-trail comments mentioning retired strings
// don't false-positive scans.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const adminExec = stripComments(adminSrc);

// Isolate the new route handler block so scope-discipline assertions
// don't false-positive against unrelated parts of admin.js (which
// legitimately calls broadcastLeadSMS in other endpoints).
const diagnoseBlockMatch = adminExec.match(
  /router\.get\(\s*['"]\/leads\/:id\/distribution-diagnose['"][\s\S]*?\n\}\)\s*;/
);
const diagnoseBlock = diagnoseBlockMatch ? diagnoseBlockMatch[0] : '';

// ── A. Route surface + middleware ───────────────────────────────────────

test('A1. Route exists at GET /api/admin/leads/:id/distribution-diagnose', () => {
  assert.match(
    adminExec,
    /router\.get\(\s*['"]\/leads\/:id\/distribution-diagnose['"]/,
    'Endpoint must be GET /leads/:id/distribution-diagnose on the admin router (mounted at /api/admin)'
  );
});

test('A2. Endpoint requires [auth, admin] middleware', () => {
  assert.match(
    adminExec,
    /router\.get\(\s*['"]\/leads\/:id\/distribution-diagnose['"][\s\S]{0,80}\[\s*auth\s*,\s*admin\s*\]/,
    'Must use [auth, admin] middleware (same as the other admin lead routes)'
  );
});

test('A3. Endpoint is GET (read-only verb)', () => {
  // Defense-in-depth: confirm we're NOT using POST/PATCH/PUT/DELETE for this path.
  // A future contributor adding any non-GET verb at the same path would trip this.
  for (const verb of ['post', 'patch', 'put', 'delete']) {
    const re = new RegExp(`router\\.${verb}\\(\\s*['"]\\/leads\\/:id\\/distribution-diagnose['"]`);
    assert.doesNotMatch(adminExec, re,
      `distribution-diagnose endpoint must be GET-only — found router.${verb} for the same path`);
  }
});

test('A4. Returns 404 when lead not found', () => {
  assert.match(
    diagnoseBlock,
    /Lead not found/,
    'Handler must return a 404 with "Lead not found" when the lead does not exist'
  );
});

// ── B. Response shape — every operator-required field ─────────────────

test('B1. Response includes raw lead state fields', () => {
  for (const field of [
    'status',
    'distributionDecision',
    'distributionDecisionReason',
    'distributionDecisionBy',
    'distributionDecisionAt',
    'qualityGateCleared',
    'shadowTier',
    'structuralBlockers',
    'miles',
    'notifiedAt',
    'originZip',
    'destinationZip',
    'originState',
    'destinationState',
  ]) {
    assert.match(diagnoseBlock, new RegExp(`\\b${field}\\b\\s*:`),
      `Response must include the '${field}' field`);
  }
});

test('B2. Response includes validation subobjects (phone, route, fraud, fingerprint)', () => {
  for (const sub of ['phone', 'route', 'fraud', 'fingerprint']) {
    const re = new RegExp(`${sub}\\s*:\\s*\\(lead\\.validation`);
    assert.match(diagnoseBlock, re,
      `Response must surface validation.${sub} (read from lead.validation.${sub})`);
  }
});

test('B3. Response includes claimWindow with all PR-S5 subfields', () => {
  // The diagnose endpoint is the primary forensic surface for SMS Claim
  // pipeline state. Every claimWindow subfield needs to be visible.
  assert.match(diagnoseBlock, /claimWindow\s*:/,
    'Response must include a claimWindow field');
  for (const sub of ['status', 'token', 'openedAt', 'expiresAt', 'claimedBy', 'claimedAt', 'closedReason']) {
    const re = new RegExp(`lead\\.claimWindow\\.${sub}`);
    assert.match(diagnoseBlock, re,
      `claimWindow.${sub} must be sourced from lead.claimWindow.${sub}`);
  }
});

test('B4. Response includes adminTierOverride for completeness', () => {
  assert.match(diagnoseBlock, /adminTierOverride/,
    'Response must include adminTierOverride so the operator can confirm any admin intent on the lead');
});

test('B5. Response includes leadId for confirmation', () => {
  // Defensive: confirm the response echoes the lead's _id so the operator
  // is sure they got the lead they asked about.
  assert.match(diagnoseBlock, /leadId\s*:\s*String\(lead\._id\)/,
    'Response must echo leadId (as a string) for operator confirmation');
});

// ── C. Derived predicates ─────────────────────────────────────────────

test('C1. Response includes hiddenFromMovers boolean', () => {
  assert.match(diagnoseBlock, /hiddenFromMovers\s*:\s*hidden/,
    'Response must include hiddenFromMovers boolean derived from isHiddenFromMovers(lead)');
});

test('C2. Response includes hiddenReason string', () => {
  assert.match(diagnoseBlock, /hiddenReason\s*:\s*reason/,
    'Response must include hiddenReason string derived from hiddenReason(lead)');
});

test('C3. Response includes distributable boolean', () => {
  assert.match(diagnoseBlock, /distributable\s*:\s*isDistributable\(lead\.distributionDecision\)/,
    'distributable must reuse isDistributable() from utils/distributionDecision');
});

test('C4. Response includes qualificationFailed boolean + qualificationReason string', () => {
  assert.match(diagnoseBlock, /qualificationFailed/,
    'Response must include qualificationFailed boolean');
  assert.match(diagnoseBlock, /qualificationReason/,
    'Response must include qualificationReason string');
});

test('C5. Response includes broadcastWouldSuppress + broadcastWouldSuppressBy', () => {
  // ES6 shorthand emission — `{ broadcastWouldSuppress, broadcastWouldSuppressBy }`
  // — produces no `:` separator, so match on word boundary instead.
  assert.match(diagnoseBlock, /\bbroadcastWouldSuppress\b/,
    'Response must include broadcastWouldSuppress boolean');
  assert.match(diagnoseBlock, /\bbroadcastWouldSuppressBy\b/,
    'Response must include broadcastWouldSuppressBy enumerated string');
});

// ── D. Reuse production helpers (no drift) ────────────────────────────

test('D1. Uses isHiddenFromMovers from utils/leadVisibility (no reinvented predicate)', () => {
  // The whole point of this endpoint is to NOT drift from broadcastLeadSMS's
  // actual behavior. If a future contributor inlines a `decision === 'system_approved' ||
  // decision === 'admin_approved'` check here, it will eventually skew from
  // the helper. Pin the helper call.
  assert.match(diagnoseBlock, /isHiddenFromMovers\(lead\)/,
    'Must call isHiddenFromMovers(lead) — do not reinvent the predicate');
});

test('D2. Uses hiddenReason from utils/leadVisibility', () => {
  assert.match(diagnoseBlock, /hiddenReason\(lead\)/,
    'Must call hiddenReason(lead) for the reason string');
});

test('D3. Uses isDistributable from utils/distributionDecision', () => {
  assert.match(diagnoseBlock, /isDistributable\(lead\.distributionDecision\)/,
    'Must call isDistributable() — do not inline the DISTRIBUTABLE_VALUES check');
});

test('D4. isDistributable is imported from utils/distributionDecision at the top of admin.js', () => {
  // Source order: `const { ..., isDistributable } = require('../utils/distributionDecision');`
  // — the destructured field appears BEFORE the require literal.
  assert.match(
    adminExec,
    /isDistributable[\s\S]{0,400}require\(['"]\.\.\/utils\/distributionDecision['"]\)/,
    'isDistributable must be destructured from the distributionDecision require'
  );
});

test('D5. hiddenReason is imported from utils/leadVisibility at the top of admin.js', () => {
  // Same source-order pattern as D4.
  assert.match(
    adminExec,
    /hiddenReason[\s\S]{0,200}require\(['"]\.\.\/utils\/leadVisibility['"]\)/,
    'hiddenReason must be destructured from the leadVisibility require'
  );
});

// ── E. Suppression-priority ordering ──────────────────────────────────

test('E1. qualificationFailed is checked before hidden in the broadcastWouldSuppressBy logic', () => {
  // The order matches twilioService.js verifyLeadPhone (lines 580 → 587).
  // qualificationFailed fires FIRST so the operator sees that as the
  // "first failing gate" rather than the downstream defense-in-depth
  // distributionDecision gate that would ALSO catch the same lead.
  const qualIdx = diagnoseBlock.indexOf("broadcastWouldSuppressBy = 'qualificationFailed'");
  const hiddenIdx = diagnoseBlock.indexOf("broadcastWouldSuppressBy = 'hiddenFromMovers'");
  assert.ok(qualIdx > 0, 'qualificationFailed assignment must exist');
  assert.ok(hiddenIdx > 0, 'hiddenFromMovers assignment must exist');
  assert.ok(qualIdx < hiddenIdx,
    'qualificationFailed must come BEFORE hiddenFromMovers in the suppression decision tree (matches twilioService.js verifyLeadPhone order)');
});

test('E2. hidden is checked before notifiedAt', () => {
  const hiddenIdx = diagnoseBlock.indexOf("broadcastWouldSuppressBy = 'hiddenFromMovers'");
  const notifiedIdx = diagnoseBlock.indexOf("broadcastWouldSuppressBy = 'notifiedAt'");
  assert.ok(hiddenIdx > 0, 'hiddenFromMovers assignment must exist');
  assert.ok(notifiedIdx > 0, 'notifiedAt assignment must exist');
  assert.ok(hiddenIdx < notifiedIdx,
    'hiddenFromMovers must come BEFORE notifiedAt — the visibility gate dominates the dedup gate');
});

test('E3. qualificationFailed reproduces the verifyLeadPhone gate sequence (twilioService.js:464-473)', () => {
  // shadowTier=rejected → qualityGateCleared=false → adminTierOverride.tier=rejected
  // All three must be present in the diagnose block in source order.
  const tierRejectedIdx = diagnoseBlock.indexOf("'shadowTier=rejected'");
  const gateFalseIdx = diagnoseBlock.indexOf("'qualityGateCleared=false'");
  const overrideIdx  = diagnoseBlock.indexOf("'adminTierOverride=rejected'");
  assert.ok(tierRejectedIdx > 0, "shadowTier=rejected branch must exist");
  assert.ok(gateFalseIdx > 0,    "qualityGateCleared=false branch must exist");
  assert.ok(overrideIdx > 0,     "adminTierOverride=rejected branch must exist");
  assert.ok(tierRejectedIdx < gateFalseIdx && gateFalseIdx < overrideIdx,
    'Branch order must match twilioService.js verifyLeadPhone: shadowTier → qualityGateCleared → adminTierOverride');
});

// ── F. Scope discipline ───────────────────────────────────────────────

test('F1. Diagnose handler does NOT trigger broadcast', () => {
  // admin.js has OTHER routes that legitimately call broadcastLeadSMS
  // (e.g. emitNewLead on lead.approve). We assert ONLY against the
  // diagnose route body, not the whole file.
  assert.doesNotMatch(diagnoseBlock, /broadcastLeadSMS|broadcastLeadEmail|emitNewLead/,
    'Diagnose endpoint must NOT call any broadcast/socket-emit helper');
});

test('F2. Diagnose handler does NOT write to Mongo', () => {
  // Read-only. Any write would defeat the "operational observability" promise.
  const forbidden = [
    /findOneAndUpdate/,
    /findByIdAndUpdate/,
    /updateOne/,
    /updateMany/,
    /\.save\(\)/,
    /Transaction\.create/,
    /PurchasedLead/,
  ];
  for (const re of forbidden) {
    assert.doesNotMatch(diagnoseBlock, re,
      `Diagnose endpoint must NOT contain ${re} — read-only contract`);
  }
});

test('F3. Diagnose handler does NOT call into matcher or dispatchPolicy', () => {
  // Mover-level diagnostics belong to /api/admin/matcher/diagnose (PR #31).
  // The distribution-diagnose endpoint stays scoped to the LEAD-side gates.
  for (const re of [
    /doesLeadMatchMoverPreferences/,
    /findEligibleMovers/,
    /wantsChannel/,
    /isWithinDispatchHours/,
    /diagnoseMatch/,
    /strictMatchingEnabled/,
  ]) {
    assert.doesNotMatch(diagnoseBlock, re,
      `Diagnose endpoint must NOT call ${re} — mover-level checks belong in /matcher/diagnose`);
  }
});

test('F4. Diagnose handler does NOT touch Twilio', () => {
  assert.doesNotMatch(diagnoseBlock, /twilio|Twilio/,
    'Diagnose endpoint must NOT call into Twilio');
});

test('F5. Diagnose handler does NOT log audit-trail (read-only operations need no audit)', () => {
  // logAdminAction is used by mutating routes (approve, reject, etc.).
  // A read endpoint should not pollute the audit log on every operator
  // diagnosis call.
  assert.doesNotMatch(diagnoseBlock, /logAdminAction/,
    'Diagnose endpoint must NOT call logAdminAction (read-only, no audit needed)');
});

test('F6. Diagnose handler does NOT modify the route response shape from other admin routes', () => {
  // Confirms additive-only change. The other admin lead routes still exist.
  for (const route of [
    /router\.post\(\s*['"]\/leads\/:id\/approve['"]/,
    /router\.post\(\s*['"]\/leads\/:id\/reject['"]/,
    /router\.post\(\s*['"]\/leads\/:id\/rescore['"]/,
    /router\.get\(\s*['"]\/leads\/:id\/scoring-snapshot['"]/,
  ]) {
    assert.match(adminExec, route,
      `Pre-existing admin lead route must still be present: ${route}`);
  }
});

console.log('Admin distribution-diagnose endpoint tests scheduled.');
