/**
 * Admin clear-tier-override dispatch wiring lock-in.
 *
 * Closes the third silent-approved-inventory bug class. PR #52 closed
 * admin.approve; PR #54 closed admin.rescore; this PR closes
 * DELETE /api/admin/leads/:id/tier-override — same pattern.
 *
 * Background: clearing an admin tier-override re-derives the lead's
 * distributionDecision via deriveSystemDecision(lead) and writes it.
 * If the new derived decision is system_approved and the prior state
 * was admin_rejected (or distinguishable via state transition), the
 * lead becomes distributable but no SMS / email / socket broadcast
 * fired. Identified during the launch-readiness silent-state hunt
 * (finding F-4).
 *
 * Fix mirrors PR #54 exactly: after lead.save() + audit log, the route
 * calls dispatchApprovedLead(lead._id, { source: 'admin.tier_override.
 * clear' }) fire-and-forget. The orchestrator's defense-in-depth fresh-
 * read visibility check handles the "still not distributable" case;
 * per-channel notifiedAt CAS handles the "already broadcast" case. Safe
 * + idempotent to call unconditionally.
 *
 * This suite pins:
 *
 *   A. The DELETE route requires the orchestrator
 *   B. dispatchApprovedLead is called with source="admin.tier_override.clear"
 *   C. The call is fire-and-forget with .catch (HTTP response not blocked)
 *   D. The call is NOT awaited
 *   E. The call comes AFTER lead.save() (so the orchestrator sees the fresh
 *      distributionDecision derived from the cleared override)
 *   F. The call comes BEFORE res.json (so the Promise actually fires)
 *   G. PR #52 admin.approve wiring is unchanged (regression guard)
 *   H. PR #54 admin.rescore wiring is unchanged (regression guard)
 *   I. The SET (POST) tier-override route is STILL NOT wired (intentional —
 *      it doesn't flip distributionDecision; see PR #54 test I1)
 *   J. PR-S3 atomic CAS shape unchanged (no leak)
 *   K. Audit log unchanged
 *   L. Scope discipline — no financial code, no Lead direct writes outside
 *      what was already there, no env flags
 *
 * Pure-Node, no Mongo. Source-level assertions.
 *
 * Run: `node server/__tests__/adminClearTierOverrideDispatchWiring.test.js`
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

// Isolate the clear-tier-override route block.
const clearBlockMatch = adminExec.match(
  /router\.delete\(\s*['"]\/leads\/:id\/tier-override['"][\s\S]*?(?=router\.post|router\.delete|module\.exports)/
);
const clearBlock = clearBlockMatch ? clearBlockMatch[0] : '';

const setBlockMatch = adminExec.match(
  /router\.post\(\s*['"]\/leads\/:id\/tier-override['"][\s\S]*?(?=router\.post|router\.delete|module\.exports)/
);
const setBlock = setBlockMatch ? setBlockMatch[0] : '';

const approveBlockMatch = adminExec.match(
  /router\.post\(\s*['"]\/leads\/:id\/approve['"][\s\S]*?(?=router\.post|module\.exports)/
);
const approveBlock = approveBlockMatch ? approveBlockMatch[0] : '';

const rescoreBlockMatch = adminExec.match(
  /router\.post\(\s*['"]\/leads\/:id\/rescore['"][\s\S]*?(?=router\.post|module\.exports)/
);
const rescoreBlock = rescoreBlockMatch ? rescoreBlockMatch[0] : '';

// ── A. Orchestrator required ────────────────────────────────────────────

test('A1. clear-tier-override route requires the dispatchOrchestrator', () => {
  assert.match(
    clearBlock,
    /require\(['"]\.\.\/services\/dispatchOrchestrator['"]\)/,
    'clear-tier-override route must require ../services/dispatchOrchestrator (lazy require inside the handler)'
  );
});

// ── B. dispatchApprovedLead called with correct source tag ─────────────

test('B1. clear-tier-override calls dispatchApprovedLead with source="admin.tier_override.clear"', () => {
  assert.match(
    clearBlock,
    /dispatchApprovedLead\(\s*lead\._id\s*,\s*\{\s*source:\s*['"]admin\.tier_override\.clear['"]\s*\}\s*\)/,
    'clear-tier-override route must call dispatchApprovedLead(lead._id, { source: "admin.tier_override.clear" })'
  );
});

// ── C. Fire-and-forget with .catch ─────────────────────────────────────

test('C1. dispatch call has its own .catch handler', () => {
  assert.match(
    clearBlock,
    /dispatchApprovedLead\([\s\S]{0,200}\)\.catch\(\s*err\s*=>/,
    'dispatchApprovedLead call must have .catch(err => ...) — fire-and-forget so HTTP response is not blocked'
  );
});

test('C2. catch logs a "[admin.tier_override.clear]" error tag for operator grep', () => {
  assert.match(
    clearBlock,
    /\[admin\.tier_override\.clear\]\s+dispatch error/,
    'catch must log "[admin.tier_override.clear] dispatch error" so operators can grep Render logs'
  );
});

// ── D. NOT awaited ─────────────────────────────────────────────────────

test('D1. dispatchApprovedLead is NOT awaited', () => {
  assert.doesNotMatch(
    clearBlock,
    /await\s+dispatchApprovedLead/,
    'clear-tier-override must NOT await dispatchApprovedLead — would block HTTP response on Twilio/SendGrid latency'
  );
});

// ── E. Order: AFTER lead.save() ────────────────────────────────────────

test('E1. dispatchApprovedLead is called AFTER lead.save()', () => {
  // Order matters: lead.save() commits the new distributionDecision (re-
  // derived from the cleared override) — if we dispatched before, the
  // orchestrator's fresh DB read would see stale state.
  const saveIdx     = clearBlock.indexOf('await lead.save()');
  const dispatchIdx = clearBlock.indexOf('dispatchApprovedLead(lead._id');
  assert.ok(saveIdx > 0,     'await lead.save() must exist');
  assert.ok(dispatchIdx > 0, 'dispatchApprovedLead call must exist');
  assert.ok(saveIdx < dispatchIdx,
    'dispatchApprovedLead must be called AFTER lead.save() so the orchestrator sees the fresh distributionDecision');
});

// ── F. Order: BEFORE res.json ──────────────────────────────────────────

test('F1. dispatchApprovedLead is called BEFORE res.json', () => {
  const dispatchIdx = clearBlock.indexOf('dispatchApprovedLead(lead._id');
  const resIdx      = clearBlock.indexOf("action: 'tier-override-clear'");
  assert.ok(dispatchIdx > 0);
  assert.ok(resIdx > 0, 'res.json action: "tier-override-clear" must exist');
  assert.ok(dispatchIdx < resIdx,
    'dispatchApprovedLead must be called BEFORE res.json so the dispatch Promise actually fires');
});

// ── G/H. Prior PR wiring regression-guarded ────────────────────────────

test('G1. PR #52 admin.approve dispatchApprovedLead call unchanged', () => {
  assert.match(
    approveBlock,
    /dispatchApprovedLead\(\s*lead\._id\s*,\s*\{\s*source:\s*['"]admin\.approve['"]\s*\}\s*\)/,
    'PR #52 admin.approve dispatchApprovedLead call must remain — regression guard'
  );
});

test('H1. PR #54 admin.rescore dispatchApprovedLead call unchanged', () => {
  assert.match(
    rescoreBlock,
    /dispatchApprovedLead\(\s*req\.params\.id\s*,\s*\{\s*source:\s*['"]admin\.rescore['"]\s*\}\s*\)/,
    'PR #54 admin.rescore dispatchApprovedLead call must remain — regression guard'
  );
});

// ── I. SET tier-override is now wired (C1 fix, 2026-05-29) ────────────

test('I1. SET (POST) tier-override calls dispatchApprovedLead with source admin.tier_override.set', () => {
  // 2026-05-29 (C1 fix) — reversed from the original "intentionally not
  // wired" invariant. The architecture audit (docs/audits/
  // architecture-final/02-visibility-matrix-and-conflicts.md C1) confirmed
  // that the prior SET-handler design was a silent-state bug class: a
  // held lead promoted via tier-override (non-rejected) became broadcast-
  // eligible by status + quality gates but no SMS/email/socket fired.
  // Same shape as PR #52 (admin.approve), PR #54 (admin.rescore), PR #56
  // (admin.tier_override.clear) closed for the OTHER admin write paths.
  //
  // C1 fix wires SET symmetrically: write distributionDecision in
  // lockstep + call dispatchApprovedLead.
  assert.match(
    setBlock,
    /dispatchApprovedLead\(\s*lead\._id\s*,\s*\{\s*source\s*:\s*['"]admin\.tier_override\.set['"]\s*\}\s*\)/,
    'SET (POST) tier-override must call dispatchApprovedLead with source admin.tier_override.set (C1 fix)'
  );
});

test('I2. SET tier-override writes distributionDecision in lockstep (admin_approved or admin_rejected)', () => {
  // 2026-05-29 (C1 fix) — SET now writes distributionDecision via
  // ternary on requestedTier === 'rejected'. Mirrors admin.approve
  // (admin_approved) and admin.reject (admin_rejected) behavior.
  assert.match(
    setBlock,
    /lead\.distributionDecision\s*=\s*\(\s*requestedTier\s*===\s*['"]rejected['"]\s*\)\s*\?\s*['"]admin_rejected['"]\s*:\s*['"]admin_approved['"]/,
    'SET tier-override must write distributionDecision via ternary (rejected → admin_rejected; else → admin_approved)'
  );
});

// ── J. PR-S3 atomic CAS shape unchanged ────────────────────────────────

test('J1. routes/twilio.js PR-S3 atomic CAS shape unchanged (no leak from this PR)', () => {
  const twilioRouteSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'twilio.js'), 'utf8');
  assert.match(
    stripComments(twilioRouteSrc),
    /['"]claimWindow\.token['"]\s*:\s*token[\s\S]{0,300}['"]claimWindow\.status['"]\s*:\s*['"]open['"][\s\S]{0,200}['"]claimWindow\.expiresAt['"]\s*:\s*\{\s*\$gt:\s*now\s*\}/,
    'PR-S3 atomic CAS filter shape must remain unchanged'
  );
});

// ── K. Audit log unchanged ─────────────────────────────────────────────

test('K1. Clear-tier-override still calls logAdminAction with action="lead.tier_override.clear"', () => {
  assert.match(
    clearBlock,
    /logAdminAction\(\s*\{\s*actor:\s*req\.user\.id\s*,\s*action:\s*['"]lead\.tier_override\.clear['"]/,
    'logAdminAction call with action="lead.tier_override.clear" must remain'
  );
});

test('K2. Snapshot-tier resync block unchanged (regression guard)', () => {
  // The route reads ScoringSnapshot to resync qualityGateCleared. This is
  // existing behavior; PR-D must not touch it.
  assert.match(
    clearBlock,
    /ScoringSnapshot\.findOne\(\s*\{\s*leadId:\s*lead\._id\s*\}\s*\)[\s\S]{0,80}\.sort\(\s*\{\s*createdAt:\s*-1\s*\}\s*\)[\s\S]{0,80}\.select\(\s*['"]tier['"]\s*\)\.lean\(\)/,
    'ScoringSnapshot resync block must remain unchanged'
  );
});

// ── L. Scope discipline ────────────────────────────────────────────────

test('L1. Clear-tier-override handler does NOT do financial writes', () => {
  for (const forbidden of [
    /Transaction\.create/,
    /new PurchasedLead/,
    /\$inc:\s*\{\s*balance/,
  ]) {
    assert.doesNotMatch(clearBlock, forbidden,
      `Clear-tier-override handler must contain no financial writes (${forbidden})`);
  }
});

test('L2. No new env flags introduced', () => {
  assert.doesNotMatch(clearBlock, /process\.env\.ENABLE_/,
    'Clear-tier-override handler must not introduce any ENABLE_* flag gating');
});

test('L3. No new schema fields written outside the existing scope', () => {
  // The existing scope writes: adminTierOverride, qualityGateCleared,
  // distributionDecision, distributionDecisionBy/At/Reason. No new field
  // writes should appear.
  // We just confirm no out-of-scope writes by checking for common
  // off-scope fields that would suggest scope creep.
  for (const forbidden of [
    /lead\.notifiedAt/,
    /lead\.claimWindow/,
    /lead\.auctionStatus\s*=/,
    /lead\.status\s*=/,
  ]) {
    assert.doesNotMatch(clearBlock, forbidden,
      `Clear-tier-override must not write off-scope field (${forbidden})`);
  }
});

console.log('Admin clear-tier-override dispatch wiring tests scheduled.');
