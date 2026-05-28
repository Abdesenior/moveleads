/**
 * Email change resets isEmailVerified lock-in.
 *
 * Bug closed: Before this fix, a mover who PATCHed a new email kept their
 * previous `isEmailVerified=true` flag. Email broadcasts (services/
 * emailService.broadcastLeadEmail) went to the new (possibly typo'd)
 * address even though it was unverified. The mover silently stopped
 * receiving lead alerts. Audit finding 08 R1 / 12 B1.
 *
 * Fix mirrors the existing utils/phoneVerification.applyPhoneChange
 * pattern: on email change, reset `isEmailVerified=false`, rotate the
 * verification token, set a 24h expiry. The routes/users.js PATCH
 * handler now applies the patch and fires a verification email
 * fire-and-forget after the save.
 *
 * This suite pins:
 *
 *   A. utils/emailVerification.js exists and exports applyEmailChange
 *   B. Helper behavior — empty input → empty patch (no change)
 *   C. Helper behavior — same email (case-insensitive) → empty patch
 *      (idempotent re-save preserves verification state)
 *   D. Helper behavior — real change → patch with email +
 *      isEmailVerified=false + emailVerificationToken + 24h expiry
 *   E. Helper normalization — leading/trailing whitespace + uppercase
 *      compared correctly
 *   F. Token is 64-char hex (32 random bytes, same shape as routes/auth.js
 *      uses for registration tokens)
 *   G. routes/users.js requires the helper + sendVerificationEmail
 *   H. routes/users.js PATCH handler invokes applyEmailChange when
 *      'email' is in the body
 *   I. Patch is applied to safeBody (Object.assign) so the User write
 *      includes the reset
 *   J. Verification email is sent fire-and-forget AFTER the save, with
 *      .catch logged non-fatally
 *   K. Sibling discipline — applyPhoneChange pattern unchanged
 *   L. Scope discipline — no financial code touched, no schema change,
 *      no new env flags
 *
 * Pure-Node, no Mongo for source-level assertions; behavioral helper
 * tests for B-F.
 *
 * Run: `node server/__tests__/emailChangeResetsVerification.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const helperPath = path.join(serverRoot, 'utils', 'emailVerification.js');
const usersRoutePath = path.join(serverRoot, 'routes', 'users.js');

const helperSrc = fs.readFileSync(helperPath, 'utf8');
const usersSrc  = fs.readFileSync(usersRoutePath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
const helperExec = stripComments(helperSrc);
const usersExec  = stripComments(usersSrc);

// ── A. Helper file exists + exports ─────────────────────────────────────

test('A1. utils/emailVerification.js exists', () => {
  assert.ok(fs.existsSync(helperPath), 'Expected utils/emailVerification.js to exist');
});

test('A2. Exports applyEmailChange as a function', () => {
  const mod = require('../utils/emailVerification');
  assert.equal(typeof mod.applyEmailChange, 'function');
});

test('A3. Exports generateVerificationToken (for reuse / testing)', () => {
  const mod = require('../utils/emailVerification');
  assert.equal(typeof mod.generateVerificationToken, 'function');
});

test('A4. Exports VERIFICATION_EXPIRY_MS constant (24h)', () => {
  const mod = require('../utils/emailVerification');
  assert.equal(mod.VERIFICATION_EXPIRY_MS, 24 * 60 * 60 * 1000);
});

// ── B-F. Behavioral helper tests ───────────────────────────────────────

test('B1. Empty new email → empty patch (no change)', () => {
  const { applyEmailChange } = require('../utils/emailVerification');
  assert.deepEqual(applyEmailChange('old@x.com', ''), {});
  assert.deepEqual(applyEmailChange('old@x.com', null), {});
  assert.deepEqual(applyEmailChange('old@x.com', undefined), {});
  assert.deepEqual(applyEmailChange('old@x.com', 123), {});
});

test('C1. Same email (case-insensitive) → empty patch (idempotent re-save)', () => {
  const { applyEmailChange } = require('../utils/emailVerification');
  assert.deepEqual(applyEmailChange('a@b.c', 'a@b.c'), {});
  assert.deepEqual(applyEmailChange('a@b.c', 'A@B.C'), {});
  assert.deepEqual(applyEmailChange('A@B.C', 'a@b.c'), {});
  assert.deepEqual(applyEmailChange('  a@b.c  ', 'a@b.c'), {});
});

test('D1. Real change → patch with 4 fields', () => {
  const { applyEmailChange } = require('../utils/emailVerification');
  const patch = applyEmailChange('old@x.com', 'new@y.com');
  assert.deepEqual(
    Object.keys(patch).sort(),
    ['email', 'emailVerificationExpires', 'emailVerificationToken', 'isEmailVerified']
  );
});

test('D2. Patch resets isEmailVerified to false (the bug fix)', () => {
  const { applyEmailChange } = require('../utils/emailVerification');
  const patch = applyEmailChange('old@x.com', 'new@y.com');
  assert.equal(patch.isEmailVerified, false,
    'Patch must reset isEmailVerified to false — THE BUG FIX');
});

test('D3. Patch email is normalized (lowercase + trimmed)', () => {
  const { applyEmailChange } = require('../utils/emailVerification');
  const patch = applyEmailChange('old@x.com', '  NEW@Y.COM  ');
  assert.equal(patch.email, 'new@y.com',
    'Patch email must be normalized to lowercase + trimmed');
});

test('D4. Patch expiry is approximately 24h from now', () => {
  const { applyEmailChange, VERIFICATION_EXPIRY_MS } = require('../utils/emailVerification');
  const before = Date.now();
  const patch = applyEmailChange('old@x.com', 'new@y.com');
  const after = Date.now();
  assert.ok(patch.emailVerificationExpires instanceof Date,
    'emailVerificationExpires must be a Date');
  const expiresMs = patch.emailVerificationExpires.getTime();
  assert.ok(expiresMs >= before + VERIFICATION_EXPIRY_MS,
    `expiry should be >= now + 24h (got ${expiresMs - before}ms)`);
  assert.ok(expiresMs <= after + VERIFICATION_EXPIRY_MS + 1000,
    `expiry should be ~= now + 24h (got ${expiresMs - after}ms)`);
});

test('E1. Empty old email + non-empty new → patch produced', () => {
  // New users created without verification can still trigger this.
  const { applyEmailChange } = require('../utils/emailVerification');
  const patch = applyEmailChange('', 'new@y.com');
  assert.ok(Object.keys(patch).length > 0);
  assert.equal(patch.isEmailVerified, false);
});

test('E2. Null/undefined old email handled defensively', () => {
  const { applyEmailChange } = require('../utils/emailVerification');
  assert.ok(Object.keys(applyEmailChange(null, 'new@y.com')).length > 0);
  assert.ok(Object.keys(applyEmailChange(undefined, 'new@y.com')).length > 0);
});

test('F1. Token is 64-char hex (32 random bytes)', () => {
  const { applyEmailChange, generateVerificationToken } = require('../utils/emailVerification');
  const patch = applyEmailChange('old@x.com', 'new@y.com');
  assert.match(patch.emailVerificationToken, /^[0-9a-f]{64}$/,
    'Token must be 64-char hex — matches routes/auth.js generateVerificationToken shape');

  // Direct helper invocation too.
  assert.match(generateVerificationToken(), /^[0-9a-f]{64}$/);
});

test('F2. Token rotates per call (not deterministic)', () => {
  const { applyEmailChange } = require('../utils/emailVerification');
  const a = applyEmailChange('old@x.com', 'new@y.com').emailVerificationToken;
  const b = applyEmailChange('old@x.com', 'new@y.com').emailVerificationToken;
  assert.notEqual(a, b, 'Tokens must be unique per call (crypto.randomBytes)');
});

// ── G. routes/users.js wires the helper ────────────────────────────────

test('G1. routes/users.js requires the emailVerification helper', () => {
  assert.match(
    usersExec,
    /require\(['"]\.\.\/utils\/emailVerification['"]\)/,
    'routes/users.js must require ../utils/emailVerification'
  );
  assert.match(
    usersExec,
    /applyEmailChange/,
    'routes/users.js must destructure applyEmailChange'
  );
});

test('G2. routes/users.js requires sendVerificationEmail from emailService', () => {
  assert.match(
    usersExec,
    /require\(['"]\.\.\/services\/emailService['"]\)/,
    'routes/users.js must require ../services/emailService'
  );
  assert.match(
    usersExec,
    /sendVerificationEmail/,
    'routes/users.js must destructure sendVerificationEmail'
  );
});

// ── H. Handler invokes applyEmailChange when 'email' is in body ────────

test('H1. PATCH handler checks `email in safeBody` before invoking applyEmailChange', () => {
  assert.match(
    usersExec,
    /if\s*\(\s*['"]email['"]\s+in\s+safeBody\s*\)/,
    'Handler must check `if ("email" in safeBody)` before calling applyEmailChange'
  );
});

test('H2. PATCH handler calls applyEmailChange with (user.email, safeBody.email)', () => {
  assert.match(
    usersExec,
    /applyEmailChange\(\s*user\.email\s*,\s*safeBody\.email\s*\)/,
    'Handler must call applyEmailChange(user.email, safeBody.email)'
  );
});

// ── I. Patch applied to safeBody ──────────────────────────────────────

test('I1. Non-empty patch is applied to safeBody via Object.assign', () => {
  assert.match(
    usersExec,
    /Object\.assign\(\s*safeBody\s*,\s*patch\s*\)/,
    'Handler must Object.assign(safeBody, patch) when the patch is non-empty'
  );
});

test('I2. Empty patch (idempotent re-save) drops email from safeBody', () => {
  // When applyEmailChange returns {} (same email), we don't want safeBody
  // to still contain the raw client `email` value because Mongoose would
  // re-normalize and update timestamps unnecessarily. Drop it.
  assert.match(
    usersExec,
    /delete\s+safeBody\.email/,
    'Handler must delete safeBody.email on idempotent re-save (empty patch)'
  );
});

test('I3. Handler stamps emailChanged + pendingVerificationToken for the post-save side effect', () => {
  // The flag-and-token pattern lets the email send happen AFTER the save
  // (so the User has the new email persisted) without recomputing the patch.
  assert.match(usersExec, /let\s+emailChanged\s*=\s*false/,
    'Handler must declare `let emailChanged = false`');
  assert.match(usersExec, /let\s+pendingVerificationToken\s*=\s*null/,
    'Handler must declare `let pendingVerificationToken = null`');
  assert.match(usersExec, /emailChanged\s*=\s*true/,
    'emailChanged must be set true on real change');
  assert.match(
    usersExec,
    /pendingVerificationToken\s*=\s*patch\.emailVerificationToken/,
    'pendingVerificationToken must be set from patch.emailVerificationToken'
  );
});

// ── J. Verification email sent fire-and-forget after save ──────────────

test('J1. sendVerificationEmail is invoked AFTER the User save when email changed', () => {
  // Source-order: User.findByIdAndUpdate → emailChanged check → sendVerificationEmail
  const updateIdx = usersExec.indexOf('User.findByIdAndUpdate(req.params.id');
  const sendIdx   = usersExec.indexOf('sendVerificationEmail({');
  assert.ok(updateIdx > 0, 'User.findByIdAndUpdate(req.params.id, ...) must exist');
  assert.ok(sendIdx > 0,   'sendVerificationEmail({...}) call must exist');
  assert.ok(updateIdx < sendIdx,
    'sendVerificationEmail must be called AFTER User.findByIdAndUpdate so the new email is persisted');
});

test('J2. sendVerificationEmail is called with toEmail = updated user.email + companyName + token', () => {
  // Multi-line call shape — match each required key/value pair independently
  // so formatting changes don't break the test.
  const callMatch = usersExec.match(/sendVerificationEmail\(\s*\{([\s\S]*?)\}\s*\)/);
  assert.ok(callMatch, 'sendVerificationEmail({...}) call must be findable');
  const args = callMatch[1];
  assert.match(args, /toEmail:\s*user\.email/,
    'Call args must include `toEmail: user.email`');
  assert.match(args, /companyName:\s*user\.companyName/,
    'Call args must include `companyName: user.companyName`');
  assert.match(args, /token:\s*pendingVerificationToken/,
    'Call args must include `token: pendingVerificationToken`');
});

test('J3. sendVerificationEmail is gated on emailChanged + pendingVerificationToken', () => {
  assert.match(
    usersExec,
    /if\s*\(\s*emailChanged\s*&&\s*pendingVerificationToken\s*\)/,
    'Send must be gated on `if (emailChanged && pendingVerificationToken)`'
  );
});

test('J4. sendVerificationEmail call is fire-and-forget with .catch', () => {
  assert.match(
    usersExec,
    /sendVerificationEmail\(\s*\{[\s\S]{0,400}\}\s*\)\.catch\(/,
    'sendVerificationEmail call must have .catch(err => ...) — non-fatal'
  );
});

test('J5. .catch logs "[users.PATCH] sendVerificationEmail failed (non-fatal):" so operators can grep', () => {
  assert.match(
    usersExec,
    /\[users\.PATCH\][\s\S]{0,80}sendVerificationEmail failed \(non-fatal\)/,
    'Catch must log "[users.PATCH] sendVerificationEmail failed (non-fatal):" for operator grep'
  );
});

// ── K. Sibling discipline — applyPhoneChange pattern unchanged ────────

test('K1. routes/users.js still requires applyPhoneChange (PR-D2 invariant)', () => {
  assert.match(
    usersExec,
    /\bapplyPhoneChange\b/,
    'applyPhoneChange must still be imported — PR-D2 invariant'
  );
});

test('K2. Phone-change handler block is still present', () => {
  assert.match(
    usersExec,
    /if\s*\(\s*['"]phone['"]\s+in\s+safeBody\s*\)[\s\S]{0,500}applyPhoneChange\(\s*user\.phone\s*,\s*newDigits\s*\)/,
    'Phone-change handler must remain — regression guard'
  );
});

// ── L. Scope discipline ────────────────────────────────────────────────

test('L1. Helper does NOT touch financial fields', () => {
  for (const forbidden of [
    /balance/,
    /Transaction/,
    /PurchasedLead/,
  ]) {
    assert.doesNotMatch(helperExec, forbidden,
      `Helper must contain no financial references (${forbidden})`);
  }
});

test('L2. Helper does NOT require Mongoose models (pure utility)', () => {
  for (const forbidden of [
    /require\(['"]\.\.\/models/,
    /mongoose/,
  ]) {
    assert.doesNotMatch(helperExec, forbidden,
      `Helper must be model-free (${forbidden})`);
  }
});

test('L3. Helper does NOT introduce new env flags', () => {
  assert.doesNotMatch(helperExec, /process\.env\.ENABLE_/,
    'Helper must not introduce ENABLE_* flags');
});

test('L4. routes/users.js financial code paths unchanged (regression guard)', () => {
  // PATCH handler does not touch balance / Transaction / PurchasedLead.
  // Belt-and-suspenders.
  // We allow incidental mentions in comments, so use stripComments.
  // The handler body for the email-change block:
  const emailBlock = usersExec.match(/if\s*\(\s*['"]email['"]\s+in\s+safeBody\s*\)[\s\S]{0,1200}/);
  assert.ok(emailBlock, 'email block must be findable');
  for (const forbidden of [
    /Transaction\.create/,
    /\$inc:\s*\{\s*balance/,
    /new PurchasedLead/,
  ]) {
    assert.doesNotMatch(emailBlock[0], forbidden,
      `Email-change handler block must contain no financial writes (${forbidden})`);
  }
});

console.log('Email change resets verification tests scheduled.');
