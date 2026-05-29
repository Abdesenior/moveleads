/**
 * admin.tier_override.set dispatch wiring (C1 fix) lock-in.
 *
 * Closes C1 from docs/audits/architecture-final/02-visibility-matrix-and-conflicts.md.
 *
 * Pre-C1 bug:
 *   POST /api/admin/leads/:id/tier-override (the SET handler) wrote
 *   adminTierOverride + qualityGateCleared + (conditional) status
 *   upgrade from PENDING_MANUAL_REVIEW → READY_FOR_DISTRIBUTION, but
 *   did NOT touch distributionDecision and did NOT call
 *   dispatchApprovedLead.
 *
 *   For a held lead (status=PENDING_MANUAL_REVIEW,
 *   distributionDecision=system_held or system_rejected), admin clicking
 *   "set tier=standard" made the lead broadcast-eligible by status +
 *   quality gates BUT distributionDecision stayed system_held — so the
 *   moverVisibilityFilter() still hid it from the main feed. Worse,
 *   admins who set tier=standard expecting promotion got silent failure
 *   visible only by polling the diagnose endpoint.
 *
 *   Even after C1's distributionDecision write, no SMS / email / socket
 *   broadcast would fire because the orchestrator wasn't called.
 *
 * C1 fix (this commit):
 *   1. Write distributionDecision in lockstep:
 *      - tier !== 'rejected' → 'admin_approved'
 *      - tier === 'rejected' → 'admin_rejected'
 *      + distributionDecisionBy = String(req.user.id)
 *      + distributionDecisionAt = new Date()
 *      + distributionDecisionReason = `admin tier-override → <tier>: <reason>`
 *   2. Call dispatchApprovedLead(lead._id, { source: 'admin.tier_override.set' })
 *      unconditionally after save (orchestrator handles "still hidden"
 *      and "already broadcast" cases internally — same posture as PR #52
 *      admin.approve, PR #54 admin.rescore, PR #56 admin.tier_override.clear).
 *   3. Audit row before/after now captures distributionDecision so the
 *      operator can see the transition in the action log.
 *
 * This suite pins:
 *
 *   A. Source-level — distributionDecision write exists, ternary on
 *      requestedTier === 'rejected' is correct (admin_rejected vs
 *      admin_approved), by/at/reason fields set.
 *   B. Source-level — dispatchApprovedLead call exists with the exact
 *      source tag 'admin.tier_override.set', fire-and-forget with
 *      .catch error logging.
 *   C. Source-level — audit row before/after both include
 *      distributionDecision (operator can read the transition).
 *   D. Source-level — qualityGateCleared write preserved (Phase 6.3
 *      gate-sync still in place).
 *   E. Source-level — status auto-upgrade preserved (Phase 6.8
 *      PENDING_MANUAL_REVIEW → READY_FOR_DISTRIBUTION when tier ≠
 *      rejected).
 *   F. Symmetry with admin.tier_override.clear — both endpoints now
 *      call dispatchApprovedLead and write distributionDecision.
 *   G. Scope discipline — no SMS Claim changes, no schema changes, no
 *      buy-now changes, no new env flags.
 *
 * Behavioral testing of this handler is impractical: it uses
 * lead.save() (Mongoose document) plus `loadLeadOr404` which does a
 * fresh Lead.findById. Stubbing the chain reliably requires a full
 * Mongoose document mock with statusHistory.push, markModified, etc.
 * Source-level + the integration evidence captured in the audit
 * (visibility matrix + reader/writer maps) is the right granularity
 * here, matching the pattern of dispatchOrchestratorUnification.test.js
 * (PR #52 wiring) and adminRescoreDispatchWiring.test.js (PR #54).
 *
 * Run: `node server/__tests__/adminTierOverrideSetDispatchWiring.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adminPath = path.join(__dirname, '..', 'routes', 'admin.js');
const adminSrc = fs.readFileSync(adminPath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
const adminExec = stripComments(adminSrc);

// Isolate the POST /leads/:id/tier-override (SET) handler block. There's
// both POST (set) and DELETE (clear) on the same path; the SET is the
// router.post one.
const setBlockMatch = adminExec.match(
  /router\.post\(\s*['"]\/leads\/:id\/tier-override['"][\s\S]*?(?=router\.(get|post|put|patch|delete)|module\.exports)/
);

// ── A. distributionDecision write ──────────────────────────────────────

test('A1. SET handler block must be findable', () => {
  assert.ok(setBlockMatch, 'POST /leads/:id/tier-override handler must be findable in admin.js');
});

test('A2. distributionDecision is set via ternary on requestedTier === "rejected"', () => {
  // tier === 'rejected' → 'admin_rejected'; otherwise → 'admin_approved'.
  // Mirrors approve/reject behavior exactly.
  assert.match(
    setBlockMatch[0],
    /lead\.distributionDecision\s*=\s*\(\s*requestedTier\s*===\s*['"]rejected['"]\s*\)\s*\?\s*['"]admin_rejected['"]\s*:\s*['"]admin_approved['"]/,
    'distributionDecision must be set via ternary: (requestedTier === "rejected") ? "admin_rejected" : "admin_approved"'
  );
});

test('A3. distributionDecisionBy is set to String(req.user.id)', () => {
  assert.match(
    setBlockMatch[0],
    /lead\.distributionDecisionBy\s*=\s*String\(\s*req\.user\.id\s*\)/,
    'distributionDecisionBy must be String(req.user.id) — matches admin.approve / admin.reject pattern'
  );
});

test('A4. distributionDecisionAt is set to new Date()', () => {
  assert.match(
    setBlockMatch[0],
    /lead\.distributionDecisionAt\s*=\s*new\s+Date\(\)/,
    'distributionDecisionAt must be set on the override write'
  );
});

test('A5. distributionDecisionReason captures the operator-provided reason', () => {
  // Reason text format: `admin tier-override → <tier>: <reason>` so the
  // diagnose endpoint can read it back cleanly.
  assert.match(
    setBlockMatch[0],
    /lead\.distributionDecisionReason\s*=\s*`admin tier-override → \$\{requestedTier\}: \$\{String\(req\.body\.reason\)\.slice\(0,\s*200\)\}`/,
    'distributionDecisionReason must be `admin tier-override → ${requestedTier}: ${trimmed reason}`'
  );
});

// ── B. dispatchApprovedLead call ───────────────────────────────────────

test('B1. dispatchApprovedLead is imported via require inside the handler', () => {
  // Lazy require pattern, same as admin.tier_override.clear at L969.
  assert.match(
    setBlockMatch[0],
    /const\s*\{\s*dispatchApprovedLead\s*\}\s*=\s*require\(\s*['"]\.\.\/services\/dispatchOrchestrator['"]\s*\)/,
    'dispatchApprovedLead must be require()d inside the handler'
  );
});

test('B2. dispatchApprovedLead called with the exact source tag', () => {
  // Source tag is non-negotiable — log grep + drift guard.
  assert.match(
    setBlockMatch[0],
    /dispatchApprovedLead\(\s*lead\._id\s*,\s*\{\s*source\s*:\s*['"]admin\.tier_override\.set['"]\s*\}\s*\)/,
    "dispatchApprovedLead must be called with (lead._id, { source: 'admin.tier_override.set' })"
  );
});

test('B3. Fire-and-forget posture: .catch on the promise, no await', () => {
  // Same posture as admin.approve / admin.rescore / tier_override.clear.
  assert.match(
    setBlockMatch[0],
    /dispatchApprovedLead\([\s\S]*?\)\.catch\(\s*err\s*=>/,
    'dispatch must use .catch(err => ...) — fire-and-forget, not await'
  );
  // And it must NOT be awaited (would gate HTTP response on Twilio latency).
  assert.doesNotMatch(
    setBlockMatch[0],
    /await\s+dispatchApprovedLead/,
    'dispatchApprovedLead must NOT be awaited in this handler'
  );
});

test('B4. Catch handler logs with the standard [admin.tier_override.set] tag', () => {
  // Operator-grep tag aligned with the other dispatch-wiring routes.
  assert.match(
    setBlockMatch[0],
    /\[admin\.tier_override\.set\]\s+dispatch error/,
    'Catch path must log [admin.tier_override.set] dispatch error for grep parity with admin.approve / admin.rescore / tier_override.clear'
  );
});

// ── C. Audit row captures the distributionDecision transition ─────────

test('C1. Audit row `before` captures distributionDecision', () => {
  // Before-snapshot must include distributionDecision so the operator
  // can see the prior value in the action log.
  assert.match(
    setBlockMatch[0],
    /const\s+before\s*=\s*\{[\s\S]{0,400}distributionDecision\s*:\s*lead\.distributionDecision/,
    'audit `before` must include distributionDecision'
  );
});

test('C2. Audit row `after` captures the new distributionDecision', () => {
  // After-snapshot must include the new value.
  assert.match(
    setBlockMatch[0],
    /after\s*:\s*\{[\s\S]{0,400}distributionDecision\s*:\s*lead\.distributionDecision/,
    'audit `after` must include the post-save distributionDecision value'
  );
});

// ── D. Phase 6.3 quality gate sync preserved ──────────────────────────

test('D1. qualityGateCleared still synced to (tier !== "rejected")', () => {
  assert.match(
    setBlockMatch[0],
    /lead\.qualityGateCleared\s*=\s*requestedTier\s*!==\s*['"]rejected['"]/,
    'Phase 6.3 quality-gate sync must remain (qualityGateCleared = tier !== rejected)'
  );
});

// ── E. Phase 6.8 status auto-upgrade preserved ────────────────────────

test('E1. PENDING_MANUAL_REVIEW → READY_FOR_DISTRIBUTION when tier !== rejected', () => {
  assert.match(
    setBlockMatch[0],
    /if\s*\(\s*requestedTier\s*!==\s*['"]rejected['"]\s*&&\s*lead\.status\s*===\s*['"]PENDING_MANUAL_REVIEW['"]\s*\)\s*\{[\s\S]{0,300}lead\.status\s*=\s*['"]READY_FOR_DISTRIBUTION['"]/,
    'Phase 6.8 status auto-upgrade from PENDING_MANUAL_REVIEW → READY_FOR_DISTRIBUTION must remain'
  );
});

test('E2. statusHistory.push fires on the status upgrade path', () => {
  assert.match(
    setBlockMatch[0],
    /lead\.statusHistory\.push\(\s*\{\s*status\s*:\s*['"]READY_FOR_DISTRIBUTION['"]/,
    'statusHistory.push must fire on the auto-upgrade path'
  );
});

// ── F. Symmetry with tier_override.clear ──────────────────────────────

test('F1. tier_override.clear ALSO calls dispatchApprovedLead (PR #56 regression guard)', () => {
  // Locate the DELETE /leads/:id/tier-override block separately.
  const clearBlock = adminExec.match(
    /router\.delete\(\s*['"]\/leads\/:id\/tier-override['"][\s\S]*?(?=router\.(get|post|put|patch|delete)|module\.exports)/
  );
  assert.ok(clearBlock, 'DELETE /leads/:id/tier-override handler must be findable');
  assert.match(
    clearBlock[0],
    /dispatchApprovedLead\(\s*lead\._id\s*,\s*\{\s*source\s*:\s*['"]admin\.tier_override\.clear['"]\s*\}\s*\)/,
    'Symmetric clear handler must still call dispatchApprovedLead with source admin.tier_override.clear (PR #56 regression guard)'
  );
});

test('F2. tier_override.clear writes distributionDecision via deriveSystemDecision', () => {
  // Symmetry verification — clear handler re-derives system decision.
  const clearBlock = adminExec.match(
    /router\.delete\(\s*['"]\/leads\/:id\/tier-override['"][\s\S]*?(?=router\.(get|post|put|patch|delete)|module\.exports)/
  );
  assert.ok(clearBlock);
  assert.match(
    clearBlock[0],
    /lead\.distributionDecision\s*=\s*systemDecision/,
    'Clear handler must write distributionDecision via deriveSystemDecision (PR #56 regression guard)'
  );
});

// ── G. Scope discipline ───────────────────────────────────────────────

test('G1. No SMS Claim path changes', () => {
  // ClaimAttempt / openClaimWindow / claimWindow not touched anywhere in
  // the SET block.
  for (const forbidden of [
    /ClaimAttempt/,
    /openClaimWindow/,
    /claimWindow/,
  ]) {
    assert.doesNotMatch(setBlockMatch[0], forbidden,
      `tier_override.set handler must NOT touch SMS Claim surface (${forbidden})`);
  }
});

test('G2. No schema changes — no new Lead field writes beyond the documented set', () => {
  // The handler writes exactly the documented set:
  //   adminTierOverride, qualityGateCleared, status (conditional),
  //   statusHistory (conditional), distributionDecision,
  //   distributionDecisionBy, distributionDecisionAt, distributionDecisionReason.
  // Forbid writes to other lifecycle / financial / dedup fields.
  for (const forbidden of [
    /lead\.buyers\s*\./,
    /lead\.winnerId\s*=/,
    /lead\.finalPrice\s*=/,
    /lead\.auctionStatus\s*=/,
    /lead\.notifiedAt\s*=/,
    /lead\.lastBroadcastAttemptAt\s*=/,
    /lead\.inventoryChannel\s*=/,
  ]) {
    assert.doesNotMatch(setBlockMatch[0], forbidden,
      `tier_override.set must NOT write field matching ${forbidden}`);
  }
});

test('G3. No new env flag introduced by C1 fix', () => {
  for (const re of [
    /process\.env\.ENABLE_TIER_OVERRIDE_DISPATCH/,
    /process\.env\.TIER_OVERRIDE_BROADCAST/,
  ]) {
    assert.doesNotMatch(setBlockMatch[0], re,
      `Must NOT introduce env flag ${re}`);
  }
});

test('G4. buildSnapshotPayload still called for the response (response shape unchanged)', () => {
  // Response shape preserved — admin UI continues to receive { ok, action,
  // ...payload }.
  assert.match(
    setBlockMatch[0],
    /buildSnapshotPayload\(\s*lead\._id\s*\)/,
    'buildSnapshotPayload must still be called — response shape unchanged'
  );
  assert.match(
    setBlockMatch[0],
    /res\.json\(\s*\{\s*ok\s*:\s*true\s*,\s*action\s*:\s*['"]tier-override['"]/,
    'Response shape { ok: true, action: "tier-override", ...payload } must remain'
  );
});

console.log('admin.tier_override.set dispatch wiring (C1) tests scheduled.');
