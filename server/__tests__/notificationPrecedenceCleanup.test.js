/**
 * Notification Precedence Cleanup (PR-C3) lock-in.
 *
 * Before this PR, dispatchPolicy.wantsChannel had a hidden precedence:
 *   - If user.onboarding.answers.alertChannels was a non-empty array,
 *     that array was the source of truth.
 *   - Otherwise fall back to legacy user.smsNotif / user.emailNotif.
 *
 * No production UI ever wrote alertChannels (the current onboarding wizard
 * does not collect it, Settings does not write it). But legacy movers
 * carried over from a previous wizard version had it populated — and
 * because the precedence was hidden, their Settings toggle changes
 * silently had NO effect on dispatch.
 *
 * Per the "no hidden backend prefs" principle ([[no-hidden-backend-prefs]]),
 * PR-C3 retires the alertChannels READ in wantsChannel. The schema field
 * stays dormant (do NOT delete — would mutate historical records on save).
 *
 * What this suite locks in:
 *
 *   A. wantsChannel IGNORES alertChannels entirely. Legacy smsNotif /
 *      emailNotif are the SOLE source of truth (modulo isSuspended).
 *   B. The 'call' channel always returns false (orphan stays orphaned).
 *   C. Diagnosis codes collapse to SMS_OPTED_IN / SMS_OPTED_OUT and
 *      EMAIL_OPTED_IN / EMAIL_OPTED_OUT. Hard opt-out codes are
 *      preserved. The old *_VIA_ALERTCHANNELS / *_VIA_LEGACY /
 *      *_NOT_IN_ALERTCHANNELS / *_OPTED_OUT_LEGACY codes are GONE.
 *   D. alertChannels stays in the schema (dormant) — User model still
 *      defines it, the onboarding ANSWER_KEYS whitelist still includes
 *      it so legacy clients don't 400. Confirmed via source-level pins.
 *   E. smsClaim no longer reports alertChannels in the readiness check
 *      or the onboardingPreview payload. The "Alert channels" UI row
 *      is gone from SmsClaim.jsx.
 *   F. The shape of the four "load-bearing" pieces (broadcasters,
 *      matcher, Settings) is unchanged.
 *
 * Pure-Node, no Mongo. Run:
 *   `node server/__tests__/notificationPrecedenceCleanup.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { wantsChannel, isWithinDispatchHours } = require('../utils/dispatchPolicy');
const { __internals: diag } = require('../utils/matcherDiagnosis');

const repoRoot = path.join(__dirname, '..', '..');
const dispatchPolicySrc = fs.readFileSync(path.join(repoRoot, 'server', 'utils',   'dispatchPolicy.js'),     'utf8');
const matcherDiagSrc    = fs.readFileSync(path.join(repoRoot, 'server', 'utils',   'matcherDiagnosis.js'),   'utf8');
const userSchemaSrc     = fs.readFileSync(path.join(repoRoot, 'server', 'models',  'User.js'),               'utf8');
const onboardingSrc     = fs.readFileSync(path.join(repoRoot, 'server', 'routes',  'onboarding.js'),         'utf8');
const smsClaimSrc       = fs.readFileSync(path.join(repoRoot, 'server', 'routes',  'smsClaim.js'),           'utf8');
const settingsSrc       = fs.readFileSync(path.join(repoRoot, 'client', 'src', 'pages', 'dashboard', 'Settings.jsx'), 'utf8');
const smsClaimUiSrc     = fs.readFileSync(path.join(repoRoot, 'client', 'src', 'pages', 'dashboard', 'SmsClaim.jsx'), 'utf8');

// ── A. wantsChannel ignores alertChannels entirely ──────────────────────

test('A1. wantsChannel: smsNotif=true + alertChannels=[] → SMS opt-in', () => {
  assert.equal(wantsChannel({ smsNotif: true }, 'sms'), true);
});

test('A2. wantsChannel: smsNotif=true + alertChannels=[email] → SMS opt-in (the PR-C3 fix)', () => {
  // The exact silent-override scenario the cleanup eliminates.
  const u = { smsNotif: true, onboarding: { answers: { alertChannels: ['email'] } } };
  assert.equal(wantsChannel(u, 'sms'), true);
});

test('A3. wantsChannel: smsNotif=false + alertChannels=[sms] → SMS suppressed', () => {
  // Mirror of A2 — alertChannels=[sms] no longer turns SMS on if
  // Settings says no.
  const u = { smsNotif: false, onboarding: { answers: { alertChannels: ['sms'] } } };
  assert.equal(wantsChannel(u, 'sms'), false);
});

test('A4. wantsChannel: emailNotif=true + alertChannels=[sms] → email opt-in', () => {
  const u = { emailNotif: true, onboarding: { answers: { alertChannels: ['sms'] } } };
  assert.equal(wantsChannel(u, 'email'), true);
});

test('A5. wantsChannel: emailNotif=false + alertChannels=[email] → email suppressed', () => {
  const u = { emailNotif: false, onboarding: { answers: { alertChannels: ['email'] } } };
  assert.equal(wantsChannel(u, 'email'), false);
});

test('A6. wantsChannel: isSuspended short-circuits to false even with smsNotif=true', () => {
  const u = { smsNotif: true, emailNotif: true, isSuspended: true };
  assert.equal(wantsChannel(u, 'sms'), false);
  assert.equal(wantsChannel(u, 'email'), false);
});

test('A7. wantsChannel: null/undefined user returns false', () => {
  assert.equal(wantsChannel(null, 'sms'), false);
  assert.equal(wantsChannel(undefined, 'email'), false);
});

// ── B. 'call' channel orphan stays orphaned ─────────────────────────────

test("B1. wantsChannel: 'call' channel always returns false (no legacy field)", () => {
  // No callNotif field exists on User. PR-C3 retired alertChannels as
  // a vector for opt-in, so 'call' is now unreachable through this
  // gate. Warm transfers in routes/voice.js are gated separately
  // (receiveLiveTransfers + balance), not via wantsChannel.
  assert.equal(wantsChannel({ smsNotif: true, emailNotif: true }, 'call'), false);
  assert.equal(wantsChannel({ onboarding: { answers: { alertChannels: ['call'] } } }, 'call'), false);
});

// ── C. Diagnosis codes simplified ───────────────────────────────────────

test('C1. evalSmsChannel: smsNotif=true → SMS_OPTED_IN', () => {
  const g = diag.evalSmsChannel({ smsNotif: true });
  assert.equal(g.pass, true);
  assert.equal(g.code, 'SMS_OPTED_IN');
});

test('C2. evalSmsChannel: smsNotif=false → SMS_OPTED_OUT', () => {
  const g = diag.evalSmsChannel({ smsNotif: false });
  assert.equal(g.pass, false);
  assert.equal(g.code, 'SMS_OPTED_OUT');
});

test('C3. evalSmsChannel: smsOptOut=true → SMS_HARD_OPT_OUT (TCPA gate preserved)', () => {
  const g = diag.evalSmsChannel({ smsNotif: true, smsOptOut: true });
  assert.equal(g.pass, false);
  assert.equal(g.code, 'SMS_HARD_OPT_OUT');
});

test('C4. evalEmailChannel: emailNotif=true → EMAIL_OPTED_IN', () => {
  const g = diag.evalEmailChannel({ emailNotif: true });
  assert.equal(g.pass, true);
  assert.equal(g.code, 'EMAIL_OPTED_IN');
});

test('C5. evalEmailChannel: emailNotif=false → EMAIL_OPTED_OUT', () => {
  const g = diag.evalEmailChannel({ emailNotif: false });
  assert.equal(g.pass, false);
  assert.equal(g.code, 'EMAIL_OPTED_OUT');
});

test('C6. evalEmailChannel: emailOptOut=true → EMAIL_HARD_OPT_OUT', () => {
  const g = diag.evalEmailChannel({ emailNotif: true, emailOptOut: true });
  assert.equal(g.pass, false);
  assert.equal(g.code, 'EMAIL_HARD_OPT_OUT');
});

test('C7. Diagnosis codes do NOT emit the retired *_VIA_* / *_NOT_IN_ALERTCHANNELS / *_OPTED_OUT_LEGACY shapes', () => {
  // Pin: the retired codes must not appear as string literals (i.e. as
  // executable code that emits them). Audit-trail comments that mention
  // them are allowed — that's how documentation works. We scan for
  // quoted occurrences specifically.
  const retired = [
    'SMS_OPTED_IN_VIA_ALERTCHANNELS',
    'SMS_OPTED_IN_VIA_LEGACY',
    'SMS_NOT_IN_ALERTCHANNELS',
    'SMS_OPTED_OUT_LEGACY',
    'EMAIL_OPTED_IN_VIA_ALERTCHANNELS',
    'EMAIL_OPTED_IN_VIA_LEGACY',
    'EMAIL_NOT_IN_ALERTCHANNELS',
    'EMAIL_OPTED_OUT_LEGACY',
  ];
  for (const code of retired) {
    const quoted = new RegExp(`['"\`]${code}['"\`]`);
    assert.ok(
      !quoted.test(matcherDiagSrc),
      `Retired diagnosis code '${code}' must not be emitted as a string literal in matcherDiagnosis.js`
    );
  }
});

test('C8. Diagnosis evidence drops the alertChannels field', () => {
  // The trace evidence used to surface alertChannels — that was part of
  // the "hidden pref" UX failure. Drop it.
  const smsGate = diag.evalSmsChannel({ smsNotif: true });
  assert.equal('alertChannels' in smsGate.evidence, false);
  const emailGate = diag.evalEmailChannel({ emailNotif: true });
  assert.equal('alertChannels' in emailGate.evidence, false);
});

// ── D. Schema + ANSWER_KEYS preservation (dormant, not deleted) ─────────

test('D1. User.js still defines alertChannels in the schema (dormant)', () => {
  // Operator preference: dormant-vs-deprecated. We do NOT delete schema
  // fields — Mongoose would strip them on .save() and silently mutate
  // historical records.
  assert.match(userSchemaSrc, /alertChannels/);
});

test('D2. onboarding.js still includes alertChannels in ANSWER_KEYS', () => {
  // Legacy clients that still send this key must not 400. The route
  // accepts the write; nothing reads it after PR-C3.
  assert.match(onboardingSrc, /['"]alertChannels['"]/);
});

test('D3. dispatchPolicy.js does NOT read alertChannels in wantsChannel', () => {
  // The behavior change is the read removal. This pin would catch a
  // silent re-introduction (e.g. someone adds an "advanced mode" that
  // reads it).
  const wantsChannelBody = dispatchPolicySrc.match(
    /function wantsChannel\([^)]*\)\s*\{[\s\S]*?\n\}/
  );
  assert.ok(wantsChannelBody, 'wantsChannel function must be findable in dispatchPolicy.js');
  assert.doesNotMatch(
    wantsChannelBody[0],
    /alertChannels/,
    'wantsChannel body must not reference alertChannels'
  );
});

test('D4. dispatchPolicy.js contains the PR-C3 audit-trail comment', () => {
  assert.match(
    dispatchPolicySrc,
    /PR-C3:\s*alertChannels precedence retired/i,
    'Audit-trail comment must remain so future contributors understand the gap'
  );
});

// ── E. smsClaim drops the alertChannels references ──────────────────────

test('E1. smsClaim buildReadiness: smsNotifEnabled uses smsNotif only', () => {
  // Pin the line shape — the old `|| (Array.isArray(a.alertChannels) ...)`
  // disjunction is gone.
  assert.match(smsClaimSrc, /smsNotifEnabled:\s+user\?\.smsNotif === true,/);
  // And the alertChannels disjunction is gone
  assert.doesNotMatch(smsClaimSrc, /alertChannels.*includes\(['"]sms['"]\)/);
});

test('E2. smsClaim buildOnboardingPreview drops alertChannels from payload', () => {
  // Old preview included an alertChannels array — now absent.
  const preview = smsClaimSrc.match(/function buildOnboardingPreview[\s\S]*?\n\}/);
  assert.ok(preview, 'buildOnboardingPreview must be findable');
  assert.doesNotMatch(
    preview[0],
    /alertChannels:/,
    "buildOnboardingPreview must no longer return an 'alertChannels' field"
  );
});

test('E3. SmsClaim.jsx no longer renders the "Alert channels" row', () => {
  assert.doesNotMatch(smsClaimUiSrc, /label="Alert channels"/);
});

// ── F. What this PR does NOT touch ──────────────────────────────────────

test('F1. Settings.jsx still drives smsNotif + emailNotif via auto-save', () => {
  // Settings UI itself is unchanged — its writes were already correct;
  // the cleanup just stopped them from being silently overridden.
  assert.match(settingsSrc, /emailNotif/);
  assert.match(settingsSrc, /smsNotif/);
  assert.match(settingsSrc, /JSON\.stringify\(\{\s*emailNotif,\s*smsNotif\s*\}\)/);
});

test('F2. isWithinDispatchHours behavior is unchanged (regression guard for PR-C2)', () => {
  // Permissive when mode is unset
  assert.equal(isWithinDispatchHours({ onboarding: { answers: {} } }, 'sms'), true);
  // Email always bypasses
  assert.equal(isWithinDispatchHours({ onboarding: { answers: {} } }, 'email'), true);
});

test('F3. dispatchPolicy.js still exports the same four helpers', () => {
  const policy = require('../utils/dispatchPolicy');
  assert.equal(typeof policy.wantsChannel, 'function');
  assert.equal(typeof policy.isWithinDispatchHours, 'function');
  assert.equal(typeof policy.matchesMoveTypes, 'function');
  assert.equal(typeof policy.derivedMoveType, 'function');
});

console.log('Notification Precedence Cleanup (PR-C3) tests scheduled.');
