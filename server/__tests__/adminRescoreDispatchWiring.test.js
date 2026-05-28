/**
 * Admin rescore dispatch wiring lock-in.
 *
 * Closes the second silent-approved-inventory bug class. PR #52 closed
 * admin.approve. This PR closes admin.rescore — the same pattern:
 *
 *   scoringPipeline.runShadow re-derives Lead.distributionDecision based
 *   on evidence. If admin fixes validation data and clicks Rescore, a
 *   lead can transition system_held → system_approved. Before this fix,
 *   that transition was silent: the lead became distributable but no
 *   SMS / email / socket broadcast fired.
 *
 * Fix: after the scoringPipeline.runShadow + audit log + payload build,
 * the rescore route now calls dispatchApprovedLead(leadId, { source:
 * 'admin.rescore' }) fire-and-forget. The orchestrator's defense-in-
 * depth fresh-read visibility check handles the "still not distributable
 * after rescore" case (no-op + log) and the per-channel notifiedAt CAS
 * handles the "already broadcast" case.
 *
 * This suite pins:
 *
 *   A. routes/admin.js POST /leads/:id/rescore requires the orchestrator
 *   B. dispatchApprovedLead is called with source="admin.rescore"
 *   C. The call is fire-and-forget with .catch (HTTP response not blocked)
 *   D. The call is NOT awaited
 *   E. The call comes AFTER scoringPipeline.runShadow (so the orchestrator
 *      sees the fresh distributionDecision)
 *   F. The call comes BEFORE res.json (so the Promise actually fires)
 *   G. PR #52 admin.approve wiring is unchanged (regression guard)
 *   H. PR-S3 atomic CAS shape unchanged (no leak)
 *   I. tier-override is INTENTIONALLY NOT wired to the orchestrator —
 *      it doesn't flip distributionDecision (no silent inventory risk)
 *
 * Pure-Node, no Mongo. Source-level assertions on the rescore route block.
 *
 * Run: `node server/__tests__/adminRescoreDispatchWiring.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const adminPath  = path.join(serverRoot, 'routes', 'admin.js');
const adminSrc   = fs.readFileSync(adminPath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const adminExec = stripComments(adminSrc);

// Isolate the rescore route block so scope-discipline assertions don't
// false-positive against unrelated parts of admin.js.
const rescoreBlockMatch = adminExec.match(
  /router\.post\(\s*['"]\/leads\/:id\/rescore['"][\s\S]*?(?=router\.post|module\.exports)/
);
const rescoreBlock = rescoreBlockMatch ? rescoreBlockMatch[0] : '';

const tierOverrideBlockMatch = adminExec.match(
  /router\.post\(\s*['"]\/leads\/:id\/tier-override['"][\s\S]*?(?=router\.post|router\.delete|module\.exports)/
);
const tierOverrideBlock = tierOverrideBlockMatch ? tierOverrideBlockMatch[0] : '';

const approveBlockMatch = adminExec.match(
  /router\.post\(\s*['"]\/leads\/:id\/approve['"][\s\S]*?(?=router\.post|module\.exports)/
);
const approveBlock = approveBlockMatch ? approveBlockMatch[0] : '';

// ── A. Orchestrator required ────────────────────────────────────────────

test('A1. rescore route requires the dispatchOrchestrator', () => {
  assert.match(
    rescoreBlock,
    /require\(['"]\.\.\/services\/dispatchOrchestrator['"]\)/,
    'rescore route must require ../services/dispatchOrchestrator (lazy require inside the handler)'
  );
});

// ── B. dispatchApprovedLead called with source="admin.rescore" ─────────

test('B1. rescore calls dispatchApprovedLead with source="admin.rescore"', () => {
  assert.match(
    rescoreBlock,
    /dispatchApprovedLead\(\s*req\.params\.id\s*,\s*\{\s*source:\s*['"]admin\.rescore['"]\s*\}\s*\)/,
    'rescore route must call dispatchApprovedLead(req.params.id, { source: "admin.rescore" })'
  );
});

// ── C. Fire-and-forget with .catch ─────────────────────────────────────

test('C1. dispatch call has its own .catch handler', () => {
  assert.match(
    rescoreBlock,
    /dispatchApprovedLead\([\s\S]{0,200}\)\.catch\(\s*err\s*=>/,
    'dispatchApprovedLead call must have .catch(err => ...) — fire-and-forget so HTTP response is not blocked'
  );
});

test('C2. catch logs a "[admin.rescore]" error tag for operator grep', () => {
  assert.match(
    rescoreBlock,
    /\[admin\.rescore\]\s+dispatch error/,
    'catch must log "[admin.rescore] dispatch error" so operators can grep Render logs'
  );
});

// ── D. NOT awaited ─────────────────────────────────────────────────────

test('D1. dispatchApprovedLead is NOT awaited', () => {
  assert.doesNotMatch(
    rescoreBlock,
    /await\s+dispatchApprovedLead/,
    'rescore must NOT await dispatchApprovedLead — would block HTTP response on Twilio/SendGrid latency'
  );
});

// ── E. Order: AFTER scoringPipeline.runShadow ──────────────────────────

test('E1. dispatchApprovedLead is called AFTER scoringPipeline.runShadow', () => {
  // Order matters: runShadow writes the new distributionDecision; if we
  // dispatched before, the orchestrator's fresh DB read would see stale
  // state.
  const runShadowIdx = rescoreBlock.indexOf('scoringPipeline.runShadow');
  const dispatchIdx  = rescoreBlock.indexOf('dispatchApprovedLead(req.params.id');
  assert.ok(runShadowIdx > 0, 'scoringPipeline.runShadow call must exist');
  assert.ok(dispatchIdx > 0,  'dispatchApprovedLead call must exist');
  assert.ok(runShadowIdx < dispatchIdx,
    'dispatchApprovedLead must be called AFTER scoringPipeline.runShadow so the orchestrator sees the fresh distributionDecision');
});

// ── F. Order: BEFORE res.json ──────────────────────────────────────────

test('F1. dispatchApprovedLead is called BEFORE res.json', () => {
  // The call site must be reached before we respond so the Promise
  // actually fires for every rescore.
  const dispatchIdx = rescoreBlock.indexOf('dispatchApprovedLead(req.params.id');
  const resIdx      = rescoreBlock.indexOf("action: 'rescore'");
  assert.ok(dispatchIdx > 0);
  assert.ok(resIdx > 0,
    'res.json action: "rescore" must exist');
  assert.ok(dispatchIdx < resIdx,
    'dispatchApprovedLead must be called BEFORE res.json so the dispatch Promise actually fires');
});

// ── G. PR #52 admin.approve wiring unchanged ───────────────────────────

test('G1. admin.approve still calls dispatchApprovedLead with source="admin.approve" (regression guard)', () => {
  assert.match(
    approveBlock,
    /dispatchApprovedLead\(\s*lead\._id\s*,\s*\{\s*source:\s*['"]admin\.approve['"]\s*\}\s*\)/,
    'PR #52 admin.approve dispatchApprovedLead call must remain — regression guard'
  );
});

// ── H. PR-S3 atomic CAS shape unchanged ────────────────────────────────

test('H1. routes/twilio.js PR-S3 atomic CAS shape unchanged (no leak from this PR)', () => {
  // Sanity: confirm the financial atomic block was not collateral damage.
  // We only touched admin.js; this is belt-and-suspenders.
  const twilioRouteSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'twilio.js'), 'utf8');
  assert.match(
    stripComments(twilioRouteSrc),
    /['"]claimWindow\.token['"]\s*:\s*token[\s\S]{0,300}['"]claimWindow\.status['"]\s*:\s*['"]open['"][\s\S]{0,200}['"]claimWindow\.expiresAt['"]\s*:\s*\{\s*\$gt:\s*now\s*\}/,
    'PR-S3 atomic CAS filter shape must remain unchanged'
  );
});

// ── I. tier-override NOT wired (audit found this was a false positive) ─

test('I1. tier-override is INTENTIONALLY NOT wired to the orchestrator', () => {
  // Audit file 06 initially flagged tier-override as a silent-dispatch
  // bug. Verification of the actual code (this PR's pre-flight check)
  // showed tier-override does NOT touch distributionDecision; it only
  // sets adminTierOverride + qualityGateCleared. A lead at
  // distributionDecision=system_held remains held after tier-override
  // — the visibility filter still suppresses it. Admin must explicitly
  // approve to make a held lead distributable.
  //
  // This test locks in that decision so a future contributor who reads
  // the audit and thinks tier-override "should also" dispatch does NOT
  // wire it. Tier-override is intentionally a label-only action.
  assert.doesNotMatch(
    tierOverrideBlock,
    /dispatchApprovedLead/,
    'tier-override route must NOT call dispatchApprovedLead — tier change does not flip distributionDecision, so there is no silent-inventory risk to fix'
  );
});

test('I2. tier-override does NOT write distributionDecision (the property that makes it safe)', () => {
  // The reason I1 is correct: tier-override deliberately does not flip
  // distributionDecision. If a future contributor adds a write here,
  // it WOULD become a silent-dispatch bug and I1 must be revisited.
  assert.doesNotMatch(
    tierOverrideBlock,
    /lead\.distributionDecision\s*=/,
    'tier-override must not write lead.distributionDecision directly — if this changes, the I1 decision must be revisited'
  );
});

// ── J. Scope discipline ────────────────────────────────────────────────

test('J1. Rescore handler does NOT write Lead state (read-only via scoringPipeline)', () => {
  // The rescore handler itself doesn't write any Lead field directly.
  // scoringPipeline.runShadow does the writes; the handler just calls it.
  assert.doesNotMatch(rescoreBlock, /Lead\.findOneAndUpdate|Lead\.updateOne|lead\.save\(\)/,
    'rescore handler must not directly write Lead state');
});

test('J2. Rescore handler does NOT do financial writes', () => {
  for (const forbidden of [
    /Transaction\.create/,
    /new PurchasedLead/,
    /\$inc:\s*\{\s*balance/,
  ]) {
    assert.doesNotMatch(rescoreBlock, forbidden,
      `rescore handler must contain no financial writes (${forbidden})`);
  }
});

test('J3. No new env flags introduced', () => {
  assert.doesNotMatch(rescoreBlock, /process\.env\.ENABLE_/,
    'rescore handler must not introduce any ENABLE_* flag gating');
});

// ── K. Audit log unchanged (regression guard) ──────────────────────────

test('K1. Rescore still calls logAdminAction with action="lead.rescore"', () => {
  assert.match(
    rescoreBlock,
    /logAdminAction\(\s*\{\s*actor:\s*req\.user\.id\s*,\s*action:\s*['"]lead\.rescore['"]/,
    'rescore must still call logAdminAction({ actor, action: "lead.rescore", ... })'
  );
});

console.log('Admin rescore dispatch wiring tests scheduled.');
