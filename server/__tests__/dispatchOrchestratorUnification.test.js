/**
 * Dispatch orchestrator unification lock-in.
 *
 * Bug fixed by this PR:
 *
 *   Admin approval of a suspicious / manually-reviewed lead used to
 *   write the right DB state (distributionDecision='admin_approved',
 *   status='READY_FOR_DISTRIBUTION', qualityGateCleared=true) and then
 *   return immediately WITHOUT firing the SMS broadcast, email broadcast,
 *   or socket emit. Movers saw the lead only on next dashboard refresh
 *   ("silent approved inventory"). No SMS Claim token was emitted, no
 *   claimWindow opened, no realtime push reached already-logged-in
 *   movers. The auto-approval path (verifyLeadPhone) already invoked
 *   all three channels inline; the admin path diverged.
 *
 * Fix:
 *   Extract the inline dispatch block from verifyLeadPhone into a
 *   canonical orchestrator services/dispatchOrchestrator.js (function
 *   `dispatchApprovedLead`). Both paths now converge on the helper.
 *   Any future re-broadcast tooling calls the same helper.
 *
 * This suite pins:
 *
 *   A. Orchestrator file + helper exist with the documented contract
 *   B. Orchestrator fans out to all three channels (SMS / email / socket)
 *   C. Orchestrator preserves the fresh-DB-read visibility check
 *      (defense-in-depth — does NOT trust caller in-memory state)
 *   D. Orchestrator passes the `force` flag through to each channel
 *   E. Each per-channel call has its own .catch — failure on one channel
 *      does NOT cascade to the others
 *   F. Orchestrator does NOT do financial writes / Lead mutations /
 *      claimWindow writes / ClaimAttempt writes / admin notifications
 *   G. verifyLeadPhone now calls the orchestrator (auto-approval path
 *      converged)
 *   H. admin.approve route now calls the orchestrator (admin-approval
 *      path converged) — THE BUG FIX
 *   I. admin.approve calls it AFTER lead.save() (so the dispatch sees
 *      the post-approval DB state) and BEFORE the HTTP response (so the
 *      Promise fires regardless of UI latency)
 *   J. admin.approve uses fire-and-forget with .catch (HTTP response not
 *      blocked on Twilio/SendGrid/socket latency)
 *   K. Idempotency preserved — orchestrator delegates dedup to each
 *      channel's own notifiedAt guard (no new dedup logic added)
 *   L. Source tags differ ('verifyLeadPhone' vs 'admin.approve') so
 *      operator can grep which path triggered each dispatch
 *   M. Scope discipline — no claim-handler changes, no financial paths
 *      touched, no schema changes, PR-S3 atomic block byte-for-byte
 *      unchanged
 *
 * Pure-Node, no Mongo. Source-level + behavioral (function call)
 * assertions on the orchestrator's exported helper.
 *
 * Run: `node server/__tests__/dispatchOrchestratorUnification.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const orchPath     = path.join(serverRoot, 'services', 'dispatchOrchestrator.js');
const twilioSvcPath = path.join(serverRoot, 'services', 'twilioService.js');
const adminPath    = path.join(serverRoot, 'routes',   'admin.js');

const orchSrc      = fs.readFileSync(orchPath,      'utf8');
const twilioSvcSrc = fs.readFileSync(twilioSvcPath, 'utf8');
const adminSrc     = fs.readFileSync(adminPath,     'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const orchExec      = stripComments(orchSrc);
const twilioSvcExec = stripComments(twilioSvcSrc);
const adminExec     = stripComments(adminSrc);

// ── A. Orchestrator file + helper exist ─────────────────────────────────

test('A1. services/dispatchOrchestrator.js exists', () => {
  assert.ok(fs.existsSync(orchPath),
    'Expected services/dispatchOrchestrator.js to exist');
});

test('A2. Module exports dispatchApprovedLead as a function', () => {
  const mod = require('../services/dispatchOrchestrator');
  assert.equal(typeof mod.dispatchApprovedLead, 'function',
    'dispatchApprovedLead must be exported as a function');
});

test('A3. Helper signature accepts (leadOrId, { force, source })', () => {
  assert.match(
    orchExec,
    /async\s+function\s+dispatchApprovedLead\s*\(\s*leadOrId\s*,\s*\{\s*force\s*=\s*false\s*,\s*source\s*=\s*['"]unknown['"]\s*\}\s*=\s*\{\s*\}\s*\)/,
    'Signature must be `async function dispatchApprovedLead(leadOrId, { force = false, source = "unknown" } = {})`'
  );
});

test('A4. Helper returns { dispatched: boolean, reason?: string }', () => {
  // Source-level pin — the JSDoc says so, and the source has at least
  // the success branch returning `{ dispatched: true }` and failure
  // branches returning `{ dispatched: false, reason: ... }`.
  assert.match(orchExec, /return\s*\{\s*dispatched:\s*true\s*\}/,
    'Success path must return { dispatched: true }');
  assert.match(orchExec, /return\s*\{\s*dispatched:\s*false[\s\S]{0,80}reason/,
    'Failure paths must return { dispatched: false, reason: ... }');
});

// ── B. Three-channel fan-out ────────────────────────────────────────────

test('B1. Orchestrator calls broadcastLeadSMS', () => {
  assert.match(orchExec, /broadcastLeadSMS\(\s*fresh\s*,\s*\{\s*force\s*\}\s*\)/,
    'Orchestrator must call broadcastLeadSMS(fresh, { force })');
});

test('B2. Orchestrator calls broadcastLeadEmail', () => {
  assert.match(orchExec, /broadcastLeadEmail\(\s*fresh\s*,\s*\{\s*force\s*\}\s*\)/,
    'Orchestrator must call broadcastLeadEmail(fresh, { force })');
});

test('B3. Orchestrator calls socketService.emitNewLead', () => {
  assert.match(orchExec, /socketService\.emitNewLead\(\s*fresh\s*,\s*\{\s*force\s*\}\s*\)/,
    'Orchestrator must call socketService.emitNewLead(fresh, { force })');
});

test('B4. All three channels are invoked unconditionally after the visibility check', () => {
  // No env flag, no opt-in, no per-channel toggle on the call site.
  // Channel gating lives INSIDE each broadcaster (smsNotif, emailNotif,
  // notifiedAt dedup, etc.) — the orchestrator does not duplicate it.
  const fanOutBlock = orchExec.match(/broadcastLeadSMS[\s\S]*?broadcastLeadEmail[\s\S]*?socketService\.emitNewLead/);
  assert.ok(fanOutBlock, 'Three-channel fan-out block must be findable');
  assert.doesNotMatch(fanOutBlock[0], /process\.env\.ENABLE_/,
    'Fan-out block must not be gated on any ENABLE_* flag');
});

// ── C. Fresh-DB-read visibility check ──────────────────────────────────

test('C1. Orchestrator calls isHiddenFromMoversById on the fresh DB path', () => {
  assert.match(orchExec, /require\(['"]\.\.\/utils\/leadVisibility['"]\)/,
    'Orchestrator must require utils/leadVisibility');
  assert.match(orchExec, /isHiddenFromMoversById\(\s*id\s*\)/,
    'Orchestrator must call isHiddenFromMoversById(id) for defense-in-depth check');
});

test('C2. Hidden check fires BEFORE the broadcasters', () => {
  // Source-order pin: if a future contributor swaps these, a non-
  // distributable lead would broadcast.
  const hiddenIdx = orchExec.indexOf('isHiddenFromMoversById');
  const smsIdx    = orchExec.indexOf('broadcastLeadSMS(fresh');
  assert.ok(hiddenIdx > 0 && smsIdx > 0);
  assert.ok(hiddenIdx < smsIdx,
    'isHiddenFromMoversById must fire BEFORE broadcastLeadSMS');
});

test('C3. Hidden check failure returns early with reason (no fan-out)', () => {
  assert.match(
    orchExec,
    /if\s*\(\s*check\.hidden\s*\)\s*\{[\s\S]{0,400}return\s*\{\s*dispatched:\s*false[\s\S]{0,80}reason:\s*check\.reason/,
    'On check.hidden, must return { dispatched: false, reason: check.reason } without firing channels'
  );
});

test('C4. Lead reload uses Lead.findById(id).lean()', () => {
  assert.match(orchExec, /Lead\.findById\(\s*id\s*\)\.lean\(\)/,
    'Orchestrator must reload the lead via Lead.findById(id).lean() ' +
    '— matches the verifyLeadPhone pre-extraction pattern');
});

// ── D. Force flag passthrough ───────────────────────────────────────────

test('D1. force flag is destructured from opts with default false', () => {
  assert.match(orchExec, /force\s*=\s*false\s*,/,
    'force must default to false');
});

test('D2. force flag is passed to broadcastLeadSMS / Email / emitNewLead', () => {
  // All three calls use { force }. Pin this — if a future refactor drops
  // the force passthrough, admin re-broadcast tooling (future PR) silently
  // breaks.
  for (const call of ['broadcastLeadSMS', 'broadcastLeadEmail', 'socketService.emitNewLead']) {
    const callRegex = new RegExp(`${call.replace(/\./g, '\\.')}\\(\\s*fresh\\s*,\\s*\\{\\s*force\\s*\\}\\s*\\)`);
    assert.match(orchExec, callRegex,
      `${call} must be called with { force } so admin re-broadcast can bypass dedup`);
  }
});

// ── E. Failure isolation (.catch per channel) ──────────────────────────

test('E1. broadcastLeadSMS call has its own .catch', () => {
  assert.match(
    orchExec,
    /broadcastLeadSMS\([^)]*\)\.catch\(\s*err\s*=>/,
    'broadcastLeadSMS call must have .catch(err => ...) — no cascade'
  );
});

test('E2. broadcastLeadEmail call has its own .catch', () => {
  assert.match(
    orchExec,
    /broadcastLeadEmail\([^)]*\)\.catch\(\s*err\s*=>/,
    'broadcastLeadEmail call must have .catch(err => ...) — no cascade'
  );
});

test('E3. emitNewLead is wrapped in its own try/catch (synchronous call)', () => {
  // emitNewLead returns void (not a Promise), so .catch isn't applicable.
  // It must be wrapped in try/catch instead. Pin both shapes.
  assert.match(
    orchExec,
    /try\s*\{\s*socketService\.emitNewLead\([^)]*\)\s*;[\s\S]{0,80}\}\s*catch\s*\(\s*err\s*\)/,
    'emitNewLead must be wrapped in try/catch (synchronous, returns void)'
  );
});

// ── F. Scope discipline ─────────────────────────────────────────────────

test('F1. Orchestrator does NOT write to Lead', () => {
  for (const forbidden of [
    /Lead\.findOneAndUpdate/,
    /Lead\.updateOne/,
    /Lead\.updateMany/,
    /\.save\(\)/,
  ]) {
    assert.doesNotMatch(orchExec, forbidden,
      `Orchestrator must not write to Lead (${forbidden})`);
  }
});

test('F2. Orchestrator does NOT do financial writes', () => {
  for (const forbidden of [
    /Transaction\.create/,
    /Transaction\b/,
    /new PurchasedLead/,
    /PurchasedLead\.create/,
    /\$inc:\s*\{\s*balance/,
  ]) {
    assert.doesNotMatch(orchExec, forbidden,
      `Orchestrator must not contain financial writes (${forbidden})`);
  }
});

test('F3. Orchestrator does NOT touch claimWindow / ClaimAttempt', () => {
  for (const forbidden of [
    /claimWindow/,
    /ClaimAttempt/,
    /openClaimWindow/,
    /findLeadByClaimToken/,
  ]) {
    assert.doesNotMatch(orchExec, forbidden,
      `Orchestrator must not touch SMS Claim surfaces (${forbidden}) — ` +
      `openClaimWindow is invoked inside broadcastLeadSMS already (PR-S5)`);
  }
});

test('F4. Orchestrator does NOT send the admin-notification email', () => {
  // sendAdminLeadNotification is for the auto-approval admin-side email.
  // Admin approval doesn't need it (the admin already knows — they just
  // clicked the button).
  assert.doesNotMatch(orchExec, /sendAdminLeadNotification/,
    'Orchestrator must not send the admin-notification email — out of scope');
});

test('F5. Orchestrator does NOT make direct Twilio API calls', () => {
  assert.doesNotMatch(orchExec, /twilio\(/,
    'Orchestrator must delegate to broadcastLeadSMS — no direct Twilio API calls');
  assert.doesNotMatch(orchExec, /\.messages\.create/,
    'Orchestrator must not call Twilio messages.create directly');
});

// ── G. verifyLeadPhone path converged ──────────────────────────────────

test('G1. verifyLeadPhone requires the orchestrator', () => {
  // Lazy require inside the function — to break the circular dep between
  // dispatchOrchestrator (which lazy-requires twilioService) and twilioService
  // (which lazy-requires dispatchOrchestrator from inside verifyLeadPhone).
  assert.match(
    twilioSvcExec,
    /require\(['"]\.\/dispatchOrchestrator['"]\)/,
    'twilioService.js must require ./dispatchOrchestrator (lazy require inside verifyLeadPhone)'
  );
});

test('G2. verifyLeadPhone calls dispatchApprovedLead with source="verifyLeadPhone"', () => {
  assert.match(
    twilioSvcExec,
    /dispatchApprovedLead\(\s*lead\._id\s*,\s*\{\s*source:\s*['"]verifyLeadPhone['"]\s*\}\s*\)/,
    'verifyLeadPhone must call dispatchApprovedLead(lead._id, { source: "verifyLeadPhone" })'
  );
});

test('G3. verifyLeadPhone no longer has its inline 3-channel fan-out', () => {
  // After extraction, the old block `broadcastLeadSMS(leadForBroadcast); broadcastLeadEmail(leadForBroadcast).catch(() => {}); socketService.emitNewLead(leadForBroadcast);`
  // must be gone. broadcastLeadSMS function itself is defined in this same
  // file, so we can't grep for the bare name; but the multi-line inline
  // block (leadForBroadcast variable) must NOT appear in verifyLeadPhone.
  assert.doesNotMatch(twilioSvcExec, /leadForBroadcast/,
    'Old inline `leadForBroadcast` variable from verifyLeadPhone must be removed ' +
    '(replaced by dispatchApprovedLead call)');
});

// ── H. admin.approve path converged (THE BUG FIX) ──────────────────────

test('H1. routes/admin.js requires the orchestrator', () => {
  // Lazy require inside the approve handler is fine (same pattern).
  assert.match(
    adminExec,
    /require\(['"]\.\.\/services\/dispatchOrchestrator['"]\)/,
    'routes/admin.js must require ../services/dispatchOrchestrator'
  );
});

test('H2. admin.approve calls dispatchApprovedLead with source="admin.approve"', () => {
  assert.match(
    adminExec,
    /dispatchApprovedLead\(\s*lead\._id\s*,\s*\{\s*source:\s*['"]admin\.approve['"]\s*\}\s*\)/,
    'admin.approve route must call dispatchApprovedLead(lead._id, { source: "admin.approve" })'
  );
});

// ── I. Order: call AFTER save, BEFORE response ─────────────────────────

test('I1. dispatchApprovedLead is called AFTER lead.save() in admin.approve', () => {
  // The save must commit the post-approval state (distributionDecision,
  // status, qualityGateCleared) before the orchestrator's fresh-DB-read
  // visibility check — otherwise the orchestrator would see stale state.
  const approveBlock = adminExec.match(/router\.post\(\s*['"]\/leads\/:id\/approve['"][\s\S]*?(?=router\.post|module\.exports)/);
  assert.ok(approveBlock, 'approve route block must be findable');
  const block = approveBlock[0];
  const saveIdx = block.indexOf('await lead.save()');
  const dispatchIdx = block.indexOf('dispatchApprovedLead(lead._id');
  assert.ok(saveIdx > 0, 'lead.save() must exist in approve route');
  assert.ok(dispatchIdx > 0, 'dispatchApprovedLead call must exist');
  assert.ok(saveIdx < dispatchIdx,
    'dispatchApprovedLead must be called AFTER await lead.save() so the orchestrator sees the post-approval DB state');
});

test('I2. dispatchApprovedLead is called BEFORE res.json in admin.approve', () => {
  // The dispatch is fire-and-forget but the call site must be reached
  // before we respond, so the Promise actually fires for every admin
  // approval (not just ones where the response is delayed by other code).
  const approveBlock = adminExec.match(/router\.post\(\s*['"]\/leads\/:id\/approve['"][\s\S]*?(?=router\.post|module\.exports)/);
  assert.ok(approveBlock);
  const block = approveBlock[0];
  const dispatchIdx = block.indexOf('dispatchApprovedLead(lead._id');
  // The res.json in approve includes the literal string 'action:'. Use that
  // as the anchor — it's unique within this block.
  const resIdx = block.indexOf("action: 'approve'");
  assert.ok(resIdx > 0, 'res.json action: "approve" must exist');
  assert.ok(dispatchIdx < resIdx,
    'dispatchApprovedLead must be called BEFORE res.json(...) so the dispatch Promise actually fires');
});

// ── J. Fire-and-forget posture (admin response not blocked) ────────────

test('J1. admin.approve uses .catch on the dispatch call (fire-and-forget)', () => {
  assert.match(
    adminExec,
    /dispatchApprovedLead\(\s*lead\._id[\s\S]{0,100}\)\.catch\(\s*err\s*=>/,
    'admin.approve must call dispatchApprovedLead(...).catch(err => ...) — ' +
    'fire-and-forget so HTTP response is not blocked on Twilio/SendGrid latency'
  );
});

test('J2. admin.approve does NOT `await` the dispatch call', () => {
  // If a future contributor adds `await` here, the HTTP response will be
  // gated on every dispatch. Pin the no-await contract.
  assert.doesNotMatch(
    adminExec,
    /await\s+dispatchApprovedLead/,
    'admin.approve must NOT await dispatchApprovedLead — would block HTTP response on dispatch latency'
  );
});

// ── K. Idempotency preserved (delegated to channel dedup) ──────────────

test('K1. Orchestrator does NOT introduce a new dedup guard', () => {
  // Dedup lives inside each broadcaster's notifiedAt CAS. Adding a guard
  // in the orchestrator would double-gate and create surprising behavior
  // when force=true tries to bypass the per-channel guard.
  for (const forbidden of [
    /notifiedAt:\s*null/,
    /lastDispatchedAt/,
    /alreadyDispatched/,
  ]) {
    assert.doesNotMatch(orchExec, forbidden,
      `Orchestrator must not introduce its own dedup guard (${forbidden}) ` +
      `— delegate to per-channel notifiedAt CAS`);
  }
});

// ── L. Source tags differ for observability ────────────────────────────

test('L1. verifyLeadPhone source tag is "verifyLeadPhone"', () => {
  assert.match(twilioSvcExec, /source:\s*['"]verifyLeadPhone['"]/,
    'verifyLeadPhone call site must tag source="verifyLeadPhone"');
});

test('L2. admin.approve source tag is "admin.approve"', () => {
  assert.match(adminExec, /source:\s*['"]admin\.approve['"]/,
    'admin.approve call site must tag source="admin.approve"');
});

test('L3. Source tag is included in the orchestrator log lines', () => {
  // The operator should be able to grep Render logs for source=admin.approve
  // vs source=verifyLeadPhone to differentiate the two paths.
  assert.match(orchExec, /source=\$\{source\}/,
    'Orchestrator log lines must include `source=${source}` for grep-ability');
});

// ── M. Scope discipline — claim handler + financial paths untouched ────

test('M1. routes/twilio.js (SMS Claim handler) is NOT touched by this PR', () => {
  // The PR-S3 atomic CAS + PR-S5 scaffold + PR-S6 loser fan-out all live
  // in routes/twilio.js. We must not introduce any orchestrator references
  // there — the SMS Claim inbound handler does not dispatch leads; it
  // claims them.
  const twilioRouteSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'twilio.js'), 'utf8');
  assert.doesNotMatch(stripComments(twilioRouteSrc), /dispatchApprovedLead/,
    'routes/twilio.js (SMS Claim handler) must NOT call dispatchApprovedLead');
});

test('M2. routes/bids.js (buy-now atomic block) is NOT touched', () => {
  const bidsSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'bids.js'), 'utf8');
  assert.doesNotMatch(stripComments(bidsSrc), /dispatchApprovedLead/,
    'routes/bids.js (financial atomic path) must NOT call dispatchApprovedLead');
});

test('M3. PR-S3 atomic CAS shape unchanged in routes/twilio.js (regression guard)', () => {
  // Sanity: confirm the financial atomic block was not collateral damage
  // from the extraction. Pin the load-bearing invariants.
  const twilioRouteSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'twilio.js'), 'utf8');
  const stripped = stripComments(twilioRouteSrc);
  assert.match(
    stripped,
    /['"]claimWindow\.token['"]\s*:\s*token[\s\S]{0,300}['"]claimWindow\.status['"]\s*:\s*['"]open['"][\s\S]{0,200}['"]claimWindow\.expiresAt['"]\s*:\s*\{\s*\$gt:\s*now\s*\}/,
    'PR-S3 atomic CAS filter shape must remain unchanged'
  );
});

console.log('Dispatch orchestrator unification tests scheduled.');
