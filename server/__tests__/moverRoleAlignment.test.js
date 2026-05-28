/**
 * Mover-role alignment fix lock-in.
 *
 * Production has User accounts with BOTH role='customer' (the historical
 * mover-account default; the early codebase used 'customer' to mean
 * "moving company" — confusing legacy) AND role='mover' (newer accounts
 * created via out-of-band paths like scripts/restoreWisdomAccount.js
 * which writes via the raw db.collection driver and bypasses Mongoose
 * enum validation).
 *
 * Until this fix shipped, every dispatch/candidate-selection query
 * filtered with the literal `role: 'customer'`, silently dropping any
 * account with role='mover'. That was the root cause of the Alabama
 * staging SMS Claim test going silent: the configured Alabama mover
 * had role='mover', so they passed coverage selection (their pickupStates
 * included 'AL'), made it into the unionIds set, but were then excluded
 * by the Mongo hard filter — the broadcaster logged the misleading
 * "[SMS] No candidates with phone on file" and exited.
 *
 * This suite pins:
 *
 *   A. User schema enum accepts both 'customer' and 'mover'.
 *   B. User module exports a MOVER_ROLES frozen array = ['customer', 'mover'].
 *   C. broadcastLeadSMS — all 4 role filters accept BOTH values.
 *   D. broadcastLeadEmail — all 4 role filters accept BOTH values (mirror).
 *   E. findEligibleMovers aggregation $lookup accepts BOTH.
 *   F. admin.js active-mover metric accepts BOTH (hygiene).
 *   G. Scope discipline — operator's "do not change" surfaces unchanged:
 *      - matcher diagnose route (uses findById, no role filter — unchanged)
 *      - SMS Claim readiness route (uses findById, no role filter — unchanged)
 *      - SMS Claim atomic path in routes/twilio.js (looks up by phone, no
 *        role filter — unchanged)
 *      - matching logic in utils/leadMatching.js + utils/dispatchPolicy.js
 *        (no role checks anywhere — unchanged)
 *      - registration default in routes/auth.js (still 'customer' — policy
 *        decision deferred to a separate PR)
 *   H. Scope discipline — financial code paths untouched:
 *      - routes/bids.js buy-now atomic sequence
 *      - PR-S3 inbound claim handler atomic sequence
 *
 * Pure-Node, no Mongo. Source-level assertions on the touched files.
 *
 * Run: `node server/__tests__/moverRoleAlignment.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot     = path.join(__dirname, '..');
const userModelPath  = path.join(serverRoot, 'models',   'User.js');
const twilioSvcPath  = path.join(serverRoot, 'services', 'twilioService.js');
const emailSvcPath   = path.join(serverRoot, 'services', 'emailService.js');
const matcherPath    = path.join(serverRoot, 'utils',    'findEligibleMovers.js');
const adminRoutePath = path.join(serverRoot, 'routes',   'admin.js');

const userSrc        = fs.readFileSync(userModelPath, 'utf8');
const twilioSrc      = fs.readFileSync(twilioSvcPath, 'utf8');
const emailSrc       = fs.readFileSync(emailSvcPath,  'utf8');
const matcherSrc     = fs.readFileSync(matcherPath,   'utf8');
const adminSrc       = fs.readFileSync(adminRoutePath, 'utf8');

// Strip JS comments so audit-trail comments mentioning retired strings
// don't false-positive scans.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const twilioExec  = stripComments(twilioSrc);
const emailExec   = stripComments(emailSrc);
const matcherExec = stripComments(matcherSrc);
const adminExec   = stripComments(adminSrc);
const userExec    = stripComments(userSrc);

// ── A. User schema enum accepts both roles ──────────────────────────────

test('A1. User.role enum includes both "customer" and "mover"', () => {
  assert.match(
    userExec,
    /role:\s*\{[\s\S]{0,200}enum:\s*\[[^\]]*['"]customer['"][^\]]*['"]mover['"][^\]]*\]/,
    'User.role schema enum must list BOTH "customer" and "mover" so future ' +
    'Mongoose-mediated writes of role="mover" pass validation.'
  );
});

test('A2. User.role enum still includes "admin" and "super_admin" (regression)', () => {
  assert.match(userExec, /enum:\s*\[[\s\S]{0,200}['"]admin['"]/,
    'admin enum value must be preserved');
  assert.match(userExec, /enum:\s*\[[\s\S]{0,200}['"]super_admin['"]/,
    'super_admin enum value must be preserved');
});

test('A3. User.role default is still "customer" (no behavior change for new registrations)', () => {
  // Registration default policy is deliberately NOT changed in this PR.
  // The auth.js registration path still writes role='customer'; both that
  // value and the production 'mover' value now flow through dispatch.
  assert.match(userExec, /default:\s*['"]customer['"]/,
    'role default must remain "customer" — registration policy change is out of scope');
});

// ── B. MOVER_ROLES constant exported ────────────────────────────────────

test('B1. User module exports MOVER_ROLES', () => {
  const User = require('../models/User');
  assert.ok(Array.isArray(User.MOVER_ROLES),
    'User.MOVER_ROLES must be exported as an array');
});

test('B2. MOVER_ROLES contains exactly ["customer", "mover"]', () => {
  const User = require('../models/User');
  assert.deepEqual(User.MOVER_ROLES, ['customer', 'mover'],
    'MOVER_ROLES must contain exactly ["customer", "mover"] — adding admin/super_admin would let admin accounts receive lead broadcasts');
});

test('B3. MOVER_ROLES is frozen (immutable contract)', () => {
  const User = require('../models/User');
  assert.equal(Object.isFrozen(User.MOVER_ROLES), true,
    'MOVER_ROLES must be Object.freeze()d — a future contributor mutating the array would silently change dispatch semantics for every consumer');
});

// ── C. twilioService broadcastLeadSMS uses MOVER_ROLES ─────────────────

test('C1. twilioService has NO bare `role: "customer"` literal in dispatch queries', () => {
  // Stripped of comments so any audit-trail mention of 'customer' is allowed,
  // but the actual filter assignment must be gone.
  assert.doesNotMatch(twilioExec, /role:\s*['"]customer['"]/,
    'No remaining bare `role: "customer"` in twilioService — all dispatch ' +
    'queries must use `role: { $in: User.MOVER_ROLES }`');
});

test('C2. twilioService pickupStates query uses MOVER_ROLES', () => {
  // The pickupStates state-level match for the strict origin set.
  assert.match(
    twilioExec,
    /pickupStates:\s*String\(lead\.originState\)\.toUpperCase\(\),\s*role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}/,
    'pickupStates query must filter `role: { $in: User.MOVER_ROLES }`'
  );
});

test('C3. twilioService deliveryStates query uses MOVER_ROLES', () => {
  assert.match(
    twilioExec,
    /deliveryStates:\s*String\(lead\.destinationState\)\.toUpperCase\(\),\s*role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}/,
    'deliveryStates query must filter `role: { $in: User.MOVER_ROLES }`'
  );
});

test('C4. twilioService deliversNationwide query uses MOVER_ROLES', () => {
  assert.match(
    twilioExec,
    /deliversNationwide:\s*true,\s*role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}/,
    'deliversNationwide query must filter `role: { $in: User.MOVER_ROLES }`'
  );
});

test('C5. twilioService candidates hard filter uses MOVER_ROLES', () => {
  // The Mongo hard filter that was silently dropping role='mover' accounts.
  // This is THE bug fix.
  assert.match(
    twilioExec,
    /role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}[\s\S]{0,400}isSuspended[\s\S]{0,200}smsOptOut[\s\S]{0,200}phoneVerified[\s\S]{0,200}phone:/,
    'broadcastLeadSMS candidate hard filter must lead with `role: { $in: User.MOVER_ROLES }` before the other dispatch-discipline gates'
  );
});

// ── D. emailService broadcastLeadEmail uses MOVER_ROLES ────────────────

test('D1. emailService has NO bare `role: "customer"` literal in dispatch queries', () => {
  assert.doesNotMatch(emailExec, /role:\s*['"]customer['"]/,
    'No remaining bare `role: "customer"` in emailService — all dispatch ' +
    'queries must use `role: { $in: User.MOVER_ROLES }`');
});

test('D2. emailService pickupStates query uses MOVER_ROLES', () => {
  assert.match(
    emailExec,
    /pickupStates:\s*String\(lead\.originState\)\.toUpperCase\(\),\s*role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}/,
    'emailService pickupStates query must filter `role: { $in: User.MOVER_ROLES }`'
  );
});

test('D3. emailService deliveryStates query uses MOVER_ROLES', () => {
  assert.match(
    emailExec,
    /deliveryStates:\s*String\(lead\.destinationState\)\.toUpperCase\(\),\s*role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}/,
    'emailService deliveryStates query must filter `role: { $in: User.MOVER_ROLES }`'
  );
});

test('D4. emailService deliversNationwide query uses MOVER_ROLES', () => {
  assert.match(
    emailExec,
    /deliversNationwide:\s*true,\s*role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}/,
    'emailService deliversNationwide query must filter `role: { $in: User.MOVER_ROLES }`'
  );
});

test('D5. emailService candidates hard filter uses MOVER_ROLES', () => {
  assert.match(
    emailExec,
    /role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}[\s\S]{0,400}isSuspended[\s\S]{0,200}isEmailVerified[\s\S]{0,200}email:/,
    'broadcastLeadEmail candidate hard filter must include `role: { $in: User.MOVER_ROLES }` before the dispatch-discipline gates'
  );
});

// ── E. findEligibleMovers aggregation accepts both ─────────────────────

test('E1. findEligibleMovers aggregation $lookup accepts both roles via $in', () => {
  // Inside an aggregation $expr the syntax is { $in: ['$role', [array]] }
  // — different shape from the find-query $in. Pin BOTH the operator and
  // the operand-shape to keep future contributors from collapsing this
  // back to a single value.
  assert.match(
    matcherExec,
    /\$in:\s*\[\s*['"]\$role['"]\s*,\s*\[\s*['"]customer['"]\s*,\s*['"]mover['"]\s*\]\s*\]/,
    'findEligibleMovers $lookup pipeline must use `{ $in: [\'$role\', [\'customer\', \'mover\']] }`'
  );
});

test('E2. findEligibleMovers no longer has `$eq: [$role, "customer"]`', () => {
  assert.doesNotMatch(matcherExec, /\$eq:\s*\[\s*['"]\$role['"]\s*,\s*['"]customer['"]\s*\]/,
    'Old `$eq: [\'$role\', \'customer\']` must be gone — the bug was filtering on a single value');
});

// ── F. admin.js active-mover metric uses MOVER_ROLES ───────────────────

test('F1. admin.js active-movers metric accepts both roles', () => {
  assert.match(
    adminExec,
    /countDocuments\(\{\s*role:\s*\{\s*\$in:\s*User\.MOVER_ROLES\s*\}\s*,\s*balance:\s*\{\s*\$gt:\s*0\s*\}\s*\}\)/,
    'admin.js active-movers metric must count both `customer` and `mover` roles ' +
    '— otherwise the metric undercounts production population'
  );
});

test('F2. admin.js no longer counts only role="customer"', () => {
  assert.doesNotMatch(adminExec, /countDocuments\(\{\s*role:\s*['"]customer['"]/,
    'No remaining bare `countDocuments({ role: "customer" ...})` in admin.js');
});

// ── G. Scope discipline — operator's "do not change" surfaces ──────────

test('G1. matcher diagnose route does NOT add any role filter', () => {
  // The diagnose tool looks up the mover by ID and reports the gate verdicts.
  // No role filter should be added — the operator told us this path is
  // unaffected and must stay that way.
  const diagSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'admin', 'matcherDiagnose.js'), 'utf8');
  const diagExec = stripComments(diagSrc);
  assert.doesNotMatch(diagExec, /role:\s*['"]customer['"]/,
    'matcher diagnose route must not introduce a role filter');
  assert.doesNotMatch(diagExec, /role:\s*['"]mover['"]/,
    'matcher diagnose route must not introduce a role filter');
});

test('G2. SMS Claim readiness route (routes/smsClaim.js) unchanged on role', () => {
  const smsClaimSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'smsClaim.js'), 'utf8');
  const smsClaimExec = stripComments(smsClaimSrc);
  assert.doesNotMatch(smsClaimExec, /\brole:\s*['"]/,
    'smsClaim route must not filter by role — the endpoint operates on req.user.id directly');
});

test('G3. SMS Claim atomic path in routes/twilio.js unchanged on role', () => {
  // The inbound claim handler (PR-S3) looks up the sender by phone last-10
  // digits — no role filter. Confirm this still holds.
  const twilioRouteSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'twilio.js'), 'utf8');
  const twilioRouteExec = stripComments(twilioRouteSrc);
  // The User.find inside the inbound handler has no role filter — only phone regex.
  assert.match(twilioRouteExec, /User\s*\n?\s*\.find\(\{\s*phone:\s*\{\s*\$regex:/,
    'Inbound webhook handler must continue to look up sender by phone regex with no role filter');
  // And no role: literal should appear in the SMS-claim atomic path.
  assert.doesNotMatch(twilioRouteExec, /role:\s*['"]customer['"]/,
    'SMS-claim atomic path must not introduce a role filter');
});

test('G4. routes/auth.js registration default is still "customer" (policy unchanged in this PR)', () => {
  const authSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'auth.js'), 'utf8');
  const authExec = stripComments(authSrc);
  assert.match(authExec, /role:\s*['"]customer['"]/,
    'Public registration must continue to default role="customer" — registration policy is a separate decision');
});

test('G5. Matching logic (leadMatching + dispatchPolicy) has no role filter', () => {
  // The operator said: "Do not touch matching logic". Confirm these files
  // don't introduce role filtering as a side-effect.
  for (const file of ['leadMatching.js', 'dispatchPolicy.js']) {
    const src = fs.readFileSync(path.join(serverRoot, 'utils', file), 'utf8');
    assert.doesNotMatch(stripComments(src), /\brole:\s*['"]customer['"]/,
      `${file} must not introduce a role filter`);
    assert.doesNotMatch(stripComments(src), /\brole:\s*['"]mover['"]/,
      `${file} must not introduce a role filter`);
  }
});

// ── H. Scope discipline — financial code paths untouched ───────────────

test('H1. routes/bids.js buy-now atomic block has no role filter', () => {
  const bidsSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'bids.js'), 'utf8');
  // Extract the buy-now atomic block.
  const blockMatch = bidsSrc.match(/router\.post\(\s*['"]\/:leadId\/buy-now['"][\s\S]*?\n\}\);/);
  assert.ok(blockMatch, 'buy-now route must still exist');
  const block = blockMatch[0];
  assert.doesNotMatch(block, /\brole:\s*['"]/,
    'buy-now atomic block must contain no role filter — financial path is untouched');
});

test('H2. PR-S3 inbound claim handler atomic block has no role filter', () => {
  // The PR-S3 CLAIM branch inside routes/twilio.js /sms/inbound.
  const twilioRouteSrc = fs.readFileSync(path.join(serverRoot, 'routes', 'twilio.js'), 'utf8');
  // Find the parseClaimReply branch (PR-S3 entry point).
  const claimBranchMatch = twilioRouteSrc.match(/parseClaimReply\(rawBody\)[\s\S]*?(?=if \(START_KEYWORDS\.has)/);
  assert.ok(claimBranchMatch, 'PR-S3 claim branch must still exist');
  const block = claimBranchMatch[0];
  // The block legitimately checks user.smsOptOut, user.phoneVerified etc.,
  // but never role. Confirm role isn't introduced.
  assert.doesNotMatch(block, /\brole:\s*['"]/,
    'PR-S3 claim branch must contain no role filter');
});

// ── I. Behavioral — User.MOVER_ROLES is consumable by Mongo $in ─────────

test('I1. User.MOVER_ROLES is shape-compatible with Mongo $in operator', () => {
  // Sanity: Mongo $in expects an array of literals. Confirm the constant
  // is exactly that shape — not nested, not a Set, not a frozen object.
  const User = require('../models/User');
  assert.equal(Array.isArray(User.MOVER_ROLES), true);
  for (const v of User.MOVER_ROLES) {
    assert.equal(typeof v, 'string',
      `Every MOVER_ROLES value must be a string. Got ${typeof v}: ${v}`);
  }
  // And the two specific role strings must be present (positional independence).
  assert.ok(User.MOVER_ROLES.includes('customer'), 'MOVER_ROLES must include "customer"');
  assert.ok(User.MOVER_ROLES.includes('mover'),    'MOVER_ROLES must include "mover"');
});

test('I2. MOVER_ROLES does NOT include admin/super_admin (TCPA / dispatch hygiene)', () => {
  // Defensive: if admin/super_admin slipped in, admin users would receive
  // mover lead broadcasts (TCPA risk + spam).
  const User = require('../models/User');
  assert.ok(!User.MOVER_ROLES.includes('admin'),
    'MOVER_ROLES must NOT include "admin" — admin accounts must not receive mover dispatch broadcasts');
  assert.ok(!User.MOVER_ROLES.includes('super_admin'),
    'MOVER_ROLES must NOT include "super_admin"');
});

console.log('Mover-role alignment fix tests scheduled.');
