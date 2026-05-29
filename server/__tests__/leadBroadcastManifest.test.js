/**
 * Persisted broadcast manifest (PR-4) — lock-in suite.
 *
 * Closes HIGH-CONFIDENCE-FIX-PLAN F6: "why did/didn't this lead dispatch?"
 * must be answerable from the app layer (admin endpoint) without grepping
 * Render logs. Before this PR, the only signal lived in stdout lines from
 * twilioService.js + dispatchOrchestrator.js — invisible to the admin UI
 * and dropped 7 days later when Render retention rolled over.
 *
 * Three new fields on Lead (additive, no defaults that affect existing
 * docs — null reads identically to "no broadcast attempt observed"):
 *
 *   lastBroadcastAttemptAt        — set by dispatchApprovedLead at fanout
 *   lastBroadcastSuppressReason   — set by dispatchApprovedLead on
 *                                   visibility-level suppression, OR by
 *                                   broadcastLeadSMS on zero-match cases
 *                                   (refined SMS-specific reason).
 *                                   Cleared on proceed.
 *   lastBroadcastMatchedCount     — set by broadcastLeadSMS after policy
 *                                   filter, always (including zero).
 *
 * Reader: GET /api/admin/leads/:id/distribution-diagnose.
 *
 * This suite pins:
 *
 *   A. Schema — all three fields exist with correct types + sensible
 *      defaults (null), maxlength on the string field, no required flags,
 *      no indexes added (these are not query targets, only read-back).
 *   B. dispatchOrchestrator writes attemptAt at the START of every
 *      attempt (so a hidden lead still produces the timestamp), via a
 *      non-blocking $set fire-and-forget.
 *   C. dispatchOrchestrator writes the visibility-level suppressReason
 *      using the SPECIFIC reason from isHiddenFromMoversById (NOT a
 *      vague constant — the WHY field must stay specific). And it
 *      CLEARS the suppressReason when proceeding to fanout (so a
 *      previously-suppressed lead that now passes visibility doesn't
 *      keep its stale reason).
 *   D. broadcastLeadSMS writes matchedCount on every code path that
 *      reaches the candidate-selection branch — three early returns
 *      (no_coverage / no_candidates / no_policy_pass) each persist
 *      matchedCount: 0 + a refined reason, and the proceed path persists
 *      matched.length + clears the reason.
 *   E. SMS-specific suppress reasons are namespaced (`sms_*`) so they
 *      don't visually collide with visibility-level reasons like
 *      `distributionDecision=system_held`.
 *   F. distribution-diagnose endpoint selects + returns all three fields.
 *      lastBroadcastMatchedCount uses Number.isFinite to distinguish
 *      "never measured" (null) from "measured zero" (0). The endpoint
 *      does NOT add a derived predicate over the manifest — it's a raw
 *      passthrough so the admin can interpret freely.
 *   G. Writes are non-blocking (.catch on every Lead.updateOne so a
 *      transient DB hiccup never blocks dispatch). Observability MUST
 *      NOT regress behavior.
 *   H. Scope discipline — no dispatch logic changes, no matching
 *      changes, no SMS Claim changes, no schema field renames, no new
 *      env flags, existing PR #52/54/56/57/58 wirings unchanged, the
 *      atomic notifiedAt CAS at twilioService.js is untouched.
 *
 * Pure-Node, no Mongo. Source-level assertions (the manifest writes are
 * fire-and-forget Lead.updateOne calls; behavioral testing would require
 * Mongo. Source-level + path coverage is the right granularity here).
 *
 * Run: `node server/__tests__/leadBroadcastManifest.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot   = path.join(__dirname, '..');
const leadModelPath = path.join(serverRoot, 'models',   'Lead.js');
const orchPath      = path.join(serverRoot, 'services', 'dispatchOrchestrator.js');
const twilioSvcPath = path.join(serverRoot, 'services', 'twilioService.js');
const adminPath     = path.join(serverRoot, 'routes',   'admin.js');

const leadModelSrc = fs.readFileSync(leadModelPath, 'utf8');
const orchSrc      = fs.readFileSync(orchPath,      'utf8');
const twilioSvcSrc = fs.readFileSync(twilioSvcPath, 'utf8');
const adminSrc     = fs.readFileSync(adminPath,     'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const leadModelExec = stripComments(leadModelSrc);
const orchExec      = stripComments(orchSrc);
const twilioSvcExec = stripComments(twilioSvcSrc);
const adminExec     = stripComments(adminSrc);

// ── A. Schema — three additive fields ──────────────────────────────────

test('A1. Lead schema defines lastBroadcastAttemptAt as a Date with default null', () => {
  assert.match(
    leadModelExec,
    /lastBroadcastAttemptAt\s*:\s*\{\s*type\s*:\s*Date\s*,\s*default\s*:\s*null\s*\}/,
    'lastBroadcastAttemptAt must be { type: Date, default: null } — null reads ' +
    'as "no broadcast attempt observed" for legacy leads'
  );
});

test('A2. Lead schema defines lastBroadcastSuppressReason as a String with default null + maxlength', () => {
  // maxlength guards against an attacker (or a bug) writing an unbounded
  // string; the field carries operational reasons, not free-text payload.
  assert.match(
    leadModelExec,
    /lastBroadcastSuppressReason\s*:\s*\{\s*type\s*:\s*String\s*,\s*default\s*:\s*null\s*,\s*trim\s*:\s*true\s*,\s*maxlength\s*:\s*200\s*\}/,
    'lastBroadcastSuppressReason must be { type: String, default: null, trim: true, maxlength: 200 }'
  );
});

test('A3. Lead schema defines lastBroadcastMatchedCount as a Number with default null', () => {
  // Default null (not 0) — see endpoint K-tests for the distinction.
  assert.match(
    leadModelExec,
    /lastBroadcastMatchedCount\s*:\s*\{\s*type\s*:\s*Number\s*,\s*default\s*:\s*null\s*\}/,
    'lastBroadcastMatchedCount must be { type: Number, default: null } — null is ' +
    '"never measured", 0 is "measured and zero"'
  );
});

test('A4. No new indexes were added on the manifest fields (read-back only, not query targets)', () => {
  // Defense-in-depth — these fields are written infrequently and read on
  // demand by one admin endpoint. Adding an index would be a maintenance
  // cost with no query that uses it.
  for (const re of [
    /LeadSchema\.index\(\s*\{\s*lastBroadcastAttemptAt\s*:/,
    /LeadSchema\.index\(\s*\{\s*lastBroadcastSuppressReason\s*:/,
    /LeadSchema\.index\(\s*\{\s*lastBroadcastMatchedCount\s*:/,
  ]) {
    assert.doesNotMatch(leadModelExec, re,
      `No index must be added on broadcast manifest field matching ${re} — these ` +
      'are read-back fields, not query targets');
  }
});

test('A5. No `required: true` on manifest fields (legacy docs must remain valid)', () => {
  // Manifest is additive observability. A `required: true` would invalidate
  // every legacy lead on save() — schema migration land, NOT what we want.
  const manifestBlock = leadModelExec.match(
    /lastBroadcastAttemptAt[\s\S]{0,400}lastBroadcastMatchedCount\s*:[^,]+/
  );
  assert.ok(manifestBlock, 'manifest block must be findable');
  assert.doesNotMatch(manifestBlock[0], /required\s*:\s*true/,
    'No manifest field may be required:true — legacy leads must save() cleanly');
});

// ── B. Orchestrator writes attemptAt at start of every attempt ─────────

test('B1. dispatchOrchestrator writes lastBroadcastAttemptAt via Lead.updateOne', () => {
  assert.match(
    orchExec,
    /Lead\.updateOne\(\s*\{\s*_id\s*:\s*id\s*\}\s*,\s*\{\s*\$set\s*:\s*\{\s*lastBroadcastAttemptAt\s*:\s*new\s+Date\(\)\s*\}\s*\}\s*\)/,
    'Orchestrator must write { $set: { lastBroadcastAttemptAt: new Date() } } via Lead.updateOne'
  );
});

test('B2. attemptAt write happens BEFORE the visibility check (so suppressed dispatches still get a timestamp)', () => {
  // The whole point of the manifest: we want a row for SUPPRESSED attempts
  // too. If the attemptAt write fires only on the proceed path, the
  // most-interesting cases (silently suppressed leads) wouldn't be recorded.
  const attemptIdx = orchExec.indexOf('lastBroadcastAttemptAt');
  const visibilityIdx = orchExec.indexOf('isHiddenFromMoversById(id)');
  assert.notEqual(attemptIdx, -1, 'attemptAt write must exist');
  assert.notEqual(visibilityIdx, -1, 'visibility check must exist');
  assert.ok(
    attemptIdx < visibilityIdx,
    'attemptAt write must come BEFORE the visibility check — otherwise ' +
    'silently-suppressed dispatches would not be observable in the manifest'
  );
});

test('B3. attemptAt write is fire-and-forget with .catch (non-blocking)', () => {
  // Manifest writes MUST NOT block dispatch. A failed updateOne is logged
  // but never thrown.
  assert.match(
    orchExec,
    /Lead\.updateOne\(\s*\{\s*_id\s*:\s*id\s*\}\s*,\s*\{\s*\$set\s*:\s*\{\s*lastBroadcastAttemptAt[\s\S]{0,80}\)\.catch\(/,
    'attemptAt write must have a .catch — observability cannot regress behavior'
  );
});

// ── C. Orchestrator suppressReason (write + clear) ─────────────────────

test('C1. Hidden path writes the SPECIFIC reason from isHiddenFromMoversById', () => {
  // The whole value of this field is specificity — a hardcoded "hidden"
  // string would defeat the purpose. We pass `check.reason` through.
  assert.match(
    orchExec,
    /\$set\s*:\s*\{\s*lastBroadcastSuppressReason\s*:\s*check\.reason\s*\}/,
    'Suppression write must use check.reason (the specific reason from ' +
    'isHiddenFromMoversById), not a hardcoded vague constant'
  );
});

test('C2. Hidden-path suppressReason write is fire-and-forget', () => {
  // Same blocking rule as B3.
  assert.match(
    orchExec,
    /\$set\s*:\s*\{\s*lastBroadcastSuppressReason\s*:\s*check\.reason\s*\}[\s\S]{0,20}\)\.catch\(/,
    'Hidden-path suppressReason write must have .catch'
  );
});

test('C3. Proceeding path CLEARS the suppressReason (stale-reason guard)', () => {
  // A previously-system_held lead that's now admin_approved should not
  // keep its old suppress reason. Clear it on the proceed path.
  assert.match(
    orchExec,
    /\$set\s*:\s*\{\s*lastBroadcastSuppressReason\s*:\s*null\s*\}/,
    'Orchestrator must clear lastBroadcastSuppressReason when proceeding ' +
    'to fanout (stale-reason guard)'
  );
});

test('C4. Clear happens AFTER the fresh lead reload and BEFORE the broadcasters fire', () => {
  // The clear must be the last manifest action before fanout — otherwise
  // a SMS-pipeline reason from a prior attempt could be wiped after a
  // later-attempt zero-match writes a new one.
  const clearIdx = orchExec.indexOf('lastBroadcastSuppressReason: null');
  const freshIdx = orchExec.indexOf('await Lead.findById(id).lean()');
  const broadcastIdx = orchExec.indexOf('broadcastLeadSMS');
  assert.notEqual(clearIdx, -1, 'clear must exist');
  assert.notEqual(freshIdx, -1, 'fresh reload must exist');
  assert.notEqual(broadcastIdx, -1, 'broadcaster invocation must exist');
  assert.ok(
    freshIdx < clearIdx && clearIdx < broadcastIdx,
    'Clear must be sandwiched between the fresh reload and the broadcaster ' +
    'invocations (proceed-path placement)'
  );
});

// ── D. broadcastLeadSMS writes matchedCount on every path ──────────────

test('D1. no_coverage path writes matchedCount=0 + sms_no_coverage', () => {
  assert.match(
    twilioSvcExec,
    /\$set\s*:\s*\{\s*lastBroadcastMatchedCount\s*:\s*0\s*,\s*lastBroadcastSuppressReason\s*:\s*['"]sms_no_coverage['"]\s*\}/,
    'no_coverage early-return must $set both matchedCount:0 and reason:sms_no_coverage'
  );
});

test('D2. no_candidates path writes matchedCount=0 + sms_no_candidates', () => {
  assert.match(
    twilioSvcExec,
    /\$set\s*:\s*\{\s*lastBroadcastMatchedCount\s*:\s*0\s*,\s*lastBroadcastSuppressReason\s*:\s*['"]sms_no_candidates['"]\s*\}/,
    'no_candidates early-return must $set both matchedCount:0 and reason:sms_no_candidates'
  );
});

test('D3. no_policy_pass path writes matchedCount=0 + sms_no_policy_pass', () => {
  assert.match(
    twilioSvcExec,
    /\$set\s*:\s*\{\s*lastBroadcastMatchedCount\s*:\s*0\s*,\s*lastBroadcastSuppressReason\s*:\s*['"]sms_no_policy_pass['"]\s*\}/,
    'no_policy_pass early-return must $set both matchedCount:0 and reason:sms_no_policy_pass'
  );
});

test('D4. Proceed path writes matched.length + clears suppress reason', () => {
  assert.match(
    twilioSvcExec,
    /\$set\s*:\s*\{\s*lastBroadcastMatchedCount\s*:\s*matched\.length\s*,\s*lastBroadcastSuppressReason\s*:\s*null\s*\}/,
    'Proceed path must $set matchedCount: matched.length and clear the SMS-specific ' +
    'suppress reason (stale-reason guard)'
  );
});

test('D5. All four SMS manifest writes use fire-and-forget .catch', () => {
  // Count `.catch(e => console.error('[SMS] manifest write` occurrences —
  // should be exactly 4 (no_coverage, no_candidates, no_policy_pass, proceed).
  const matches = twilioSvcExec.match(/\.catch\(e\s*=>\s*console\.error\(\s*['"]\[SMS\] manifest write/g);
  assert.ok(matches, 'SMS manifest writes must have .catch handlers');
  assert.equal(matches.length, 4,
    `Expected exactly 4 SMS manifest writes with .catch (no_coverage, no_candidates, ` +
    `no_policy_pass, proceed); found ${matches.length}`);
});

// ── E. SMS-specific reasons are namespaced ─────────────────────────────

test('E1. All SMS-pipeline suppress reasons share the `sms_` prefix', () => {
  // Defense-in-depth — visibility-level reasons like
  // `distributionDecision=system_held` should never be confused with
  // SMS-pipeline reasons. The `sms_` prefix is the disambiguator.
  for (const reason of ['no_coverage', 'no_candidates', 'no_policy_pass']) {
    const bareRe = new RegExp(`lastBroadcastSuppressReason\\s*:\\s*['"]${reason}['"]`);
    assert.doesNotMatch(twilioSvcExec, bareRe,
      `SMS pipeline must use 'sms_${reason}' (namespaced), not '${reason}' alone`);
  }
});

// ── F. distribution-diagnose endpoint passes through all three fields ──

test('F1. distribution-diagnose selects all three manifest fields from Lead', () => {
  assert.match(
    adminExec,
    /\.select\([\s\S]*?lastBroadcastAttemptAt\s+lastBroadcastSuppressReason\s+lastBroadcastMatchedCount[\s\S]*?\)/,
    'distribution-diagnose .select() must include lastBroadcastAttemptAt, ' +
    'lastBroadcastSuppressReason, and lastBroadcastMatchedCount'
  );
});

test('F2. distribution-diagnose returns lastBroadcastAttemptAt', () => {
  assert.match(
    adminExec,
    /lastBroadcastAttemptAt\s*:\s*lead\.lastBroadcastAttemptAt/,
    'distribution-diagnose JSON must include lastBroadcastAttemptAt'
  );
});

test('F3. distribution-diagnose returns lastBroadcastSuppressReason', () => {
  assert.match(
    adminExec,
    /lastBroadcastSuppressReason\s*:\s*lead\.lastBroadcastSuppressReason/,
    'distribution-diagnose JSON must include lastBroadcastSuppressReason'
  );
});

test('F4. distribution-diagnose distinguishes null matchedCount from 0', () => {
  // null = never measured; 0 = measured zero. Number.isFinite is the
  // discriminator (false for null/undefined/NaN, true for any real number
  // including 0).
  assert.match(
    adminExec,
    /lastBroadcastMatchedCount\s*:\s*Number\.isFinite\(\s*lead\.lastBroadcastMatchedCount\s*\)[\s\S]{0,80}null/,
    'matchedCount must use Number.isFinite to distinguish null (never measured) ' +
    'from 0 (measured zero)'
  );
});

test('F5. distribution-diagnose adds NO derived predicate over the manifest', () => {
  // Raw passthrough — the admin interprets. We don't want a derived field
  // like `broadcastEverDispatched: attemptAt != null` because the manifest
  // contract is "what we observed last time", not "what's true now".
  for (const forbidden of [
    /broadcastEverDispatched/,
    /broadcastEverAttempted/,
    /lastBroadcastSuppressed/,
  ]) {
    assert.doesNotMatch(adminExec, forbidden,
      `Endpoint must NOT add derived predicate ${forbidden} over the manifest — ` +
      'raw passthrough only');
  }
});

// ── G. Writes are non-blocking everywhere ──────────────────────────────

test('G1. Orchestrator manifest writes have .catch handlers (no thrown errors)', () => {
  // Count orchestrator manifest .catch handlers — should be 3 (attempt,
  // hidden-reason, clear-on-proceed).
  const matches = orchExec.match(/\[dispatchApprovedLead\] manifest\./g);
  assert.ok(matches, 'Orchestrator manifest .catch error labels must exist');
  assert.equal(matches.length, 3,
    `Expected 3 manifest .catch labels (attemptAt, suppressReason write, ` +
    `suppressReason clear); found ${matches.length}`);
});

test('G2. Orchestrator does NOT await any manifest write (fire-and-forget)', () => {
  // Awaiting a manifest write would block dispatch on Mongo latency. Lock
  // the fire-and-forget posture.
  assert.doesNotMatch(orchExec, /await\s+Lead\.updateOne\(\s*\{\s*_id\s*:\s*id\s*\}\s*,\s*\{\s*\$set\s*:\s*\{\s*lastBroadcast/,
    'Orchestrator must NOT await any lastBroadcast* write — would block dispatch on Mongo latency');
});

test('G3. SMS broadcaster does NOT await any manifest write', () => {
  assert.doesNotMatch(twilioSvcExec, /await\s+Lead\.updateOne\(\s*\{\s*_id\s*:\s*lead\._id\s*\}\s*,\s*\{\s*\$set\s*:\s*\{\s*lastBroadcast/,
    'SMS broadcaster must NOT await any lastBroadcast* write');
});

// ── H. Scope discipline ────────────────────────────────────────────────

test('H1. Existing notifiedAt CAS at broadcastLeadSMS is untouched', () => {
  // The atomic conditional `updateOne({_id, notifiedAt: null}, $set: {notifiedAt})`
  // is PR-S3 contract; manifest writes must not collide with it.
  assert.match(
    twilioSvcExec,
    /Lead\.updateOne\(\s*\{\s*_id\s*:\s*lead\._id\s*,\s*notifiedAt\s*:\s*null\s*\}\s*,\s*\{\s*\$set\s*:\s*\{\s*notifiedAt\s*:\s*new\s+Date\(\)\s*\}\s*\}\s*\)/,
    'notifiedAt CAS must remain byte-identical'
  );
});

test('H2. Orchestrator still fans out to all three channels (SMS / email / socket)', () => {
  // PR #52 dispatch contract — must not regress.
  for (const fanout of ['broadcastLeadSMS', 'broadcastLeadEmail', 'socketService.emitNewLead']) {
    const re = new RegExp(fanout.replace('.', '\\.'));
    assert.match(orchExec, re, `Orchestrator must still call ${fanout}`);
  }
});

test('H3. Orchestrator still passes force through to each broadcaster', () => {
  // PR #52 admin re-broadcast contract.
  assert.match(orchExec, /broadcastLeadSMS\(\s*fresh\s*,\s*\{\s*force\s*\}\s*\)/,
    'broadcastLeadSMS must still receive { force }');
  assert.match(orchExec, /broadcastLeadEmail\(\s*fresh\s*,\s*\{\s*force\s*\}\s*\)/,
    'broadcastLeadEmail must still receive { force }');
  assert.match(orchExec, /socketService\.emitNewLead\(\s*fresh\s*,\s*\{\s*force\s*\}\s*\)/,
    'socketService.emitNewLead must still receive { force }');
});

test('H4. Orchestrator still uses isHiddenFromMoversById (defense-in-depth visibility)', () => {
  assert.match(orchExec, /isHiddenFromMoversById\(\s*id\s*\)/,
    'Orchestrator must still consult isHiddenFromMoversById');
});

test('H5. No new env flags added for the manifest', () => {
  // PR-4 must not introduce a feature flag — observability ships on always.
  for (const re of [
    /process\.env\.ENABLE_BROADCAST_MANIFEST/,
    /process\.env\.DISPATCH_MANIFEST/,
    /process\.env\.BROADCAST_OBSERVABILITY/,
  ]) {
    assert.doesNotMatch(orchExec, re,
      `Manifest must NOT be gated by env flag matching ${re}`);
    assert.doesNotMatch(twilioSvcExec, re,
      `Manifest must NOT be gated by env flag matching ${re}`);
    assert.doesNotMatch(adminExec, re,
      `Manifest must NOT be gated by env flag matching ${re}`);
  }
});

test('H6. No matching-logic changes in twilioService (matcher helpers untouched)', () => {
  // PR-4 is observability — manifest writes are sprinkled around the
  // selection branches but the selection logic itself stays byte-identical.
  // Confirm the matcher helper calls still exist and in the same shape.
  for (const fn of [
    'doesLeadMatchMoverPreferences(lead, m, emptyZipSet)',
    'doesLeadMatchMoverPreferencesStrict(lead, m, {})',
  ]) {
    assert.ok(twilioSvcSrc.includes(fn),
      `Matcher call '${fn}' must remain byte-identical (no matcher behavior change)`);
  }
});

test('H7. No new schema fields beyond the three manifest fields', () => {
  // Scope: this PR adds three named fields. If a contributor added more
  // ("lastBroadcastChannelCounts" or similar), they're outside PR-4.
  for (const forbidden of [
    /lastBroadcastChannelCounts/,
    /lastBroadcastAttemptBy/,
    /lastBroadcastReasonDetails/,
    /lastBroadcastError/,
  ]) {
    assert.doesNotMatch(leadModelExec, forbidden,
      `Lead schema must NOT include out-of-scope manifest field ${forbidden}`);
  }
});

console.log('Lead broadcast manifest (PR-4) tests scheduled.');
