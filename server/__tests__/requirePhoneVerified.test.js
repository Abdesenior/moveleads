/**
 * requirePhoneVerified — hard-fail gate lock-in.
 *
 * Two layers of coverage:
 *
 *   A) Source pins — confirm the middleware is mounted on every chokepoint
 *      that ends in money, marketplace participation, or onboarding
 *      completion, AND that the gate is NOT mounted on routes that must
 *      succeed even when the phone has been unverified (e.g. Stripe
 *      credit-application paths).
 *
 *   B) Unit behavior — mock User.findById and exercise the middleware
 *      directly against a fake req/res/next triple. Cover: 401 (no auth),
 *      401 (user missing), 403 (phoneVerified=false), 403 (phoneVerified
 *      undefined), 200/next() (phoneVerified=true), 500 (DB throws).
 *
 * Why this matters: any soft-skip in the UI must be a no-op against the
 * server. Removing the controller's handleVerifyClose soft-skip is
 * necessary but not sufficient — a scripted POST could otherwise
 * complete onboarding or charge a card with phoneVerified=false. The
 * server is the source of truth.
 */

'use strict';

const { test } = require('node:test');
const assert  = require('node:assert/strict');
const fs      = require('node:fs');
const path    = require('node:path');

// ── A. Source pins — middleware is mounted on every chokepoint

const SERVER_ROOT = path.join(__dirname, '..');

function readRoute(relPath) {
  return fs.readFileSync(path.join(SERVER_ROOT, relPath), 'utf8');
}

test('A1 — requirePhoneVerified is imported by billing.js', () => {
  const src = readRoute('routes/billing.js');
  assert.match(src, /require\(['"]\.\.\/middleware\/requirePhoneVerified['"]\)/);
});

test('A2 — POST /create-payment-intent has requirePhoneVerified mounted after auth', () => {
  const src = readRoute('routes/billing.js');
  assert.match(src, /router\.post\(\s*['"]\/create-payment-intent['"]\s*,\s*auth\s*,\s*requirePhoneVerified\s*,/);
});

test('A3 — POST /create-topup-intent has requirePhoneVerified mounted after auth', () => {
  const src = readRoute('routes/billing.js');
  assert.match(src, /router\.post\(\s*['"]\/create-topup-intent['"]\s*,\s*auth\s*,\s*requirePhoneVerified\s*,/);
});

test('A4 — POST /verify-payment-intent does NOT mount requirePhoneVerified', () => {
  // If a mover already paid Stripe, we MUST credit the balance. Re-checking
  // phoneVerified here would create a foot-gun where they pay but the
  // credit is held because they unverified their phone in between.
  const src = readRoute('routes/billing.js');
  assert.doesNotMatch(src, /router\.post\(\s*['"]\/verify-payment-intent['"]\s*,\s*auth\s*,\s*requirePhoneVerified/);
});

test('A5 — POST /verify-topup-intent does NOT mount requirePhoneVerified', () => {
  const src = readRoute('routes/billing.js');
  assert.doesNotMatch(src, /router\.post\(\s*['"]\/verify-topup-intent['"]\s*,\s*auth\s*,\s*requirePhoneVerified/);
});

test('A6 — onboarding.js imports requirePhoneVerified', () => {
  const src = readRoute('routes/onboarding.js');
  assert.match(src, /require\(['"]\.\.\/middleware\/requirePhoneVerified['"]\)/);
});

test('A7 — POST /onboarding/complete has requirePhoneVerified mounted after auth', () => {
  const src = readRoute('routes/onboarding.js');
  assert.match(src, /router\.post\(\s*['"]\/complete['"]\s*,\s*auth\s*,\s*requirePhoneVerified\s*,/);
});

test('A8 — POST /onboarding/save-step gates inline on step >= 4', () => {
  const src = readRoute('routes/onboarding.js');
  // The gate is inline (not a mounted middleware) because steps 1-3 must
  // pass through to save phone/email/toggles BEFORE the verify modal opens.
  assert.match(src, /if\s*\(\s*step\s*>=\s*4\s*\)/);
  // The inline gate must also check phoneVerified and emit PHONE_NOT_VERIFIED.
  const saveStepBlock = src.split("router.post('/save-step'")[1].split("router.post('/preview-coverage-v2'")[0];
  assert.match(saveStepBlock, /phoneVerified/);
  assert.match(saveStepBlock, /PHONE_NOT_VERIFIED/);
});

test('A9 — PATCH /api/users/me/sms-claim gates inline on optInRequested === true', () => {
  const src = readRoute('routes/smsClaim.js');
  const patchBlock = src.split("router.patch('/'")[1];
  // Inline gate on TRUE (opt-in) only — opt-out must always succeed so a
  // mover can disable the feature even if verification has been reset.
  assert.match(patchBlock, /optInRequested\s*===\s*true/);
  assert.match(patchBlock, /phoneVerified/);
  assert.match(patchBlock, /PHONE_NOT_VERIFIED/);
});

// ── B. Unit behavior — exercise the middleware directly

const requirePhoneVerified = require('../middleware/requirePhoneVerified');
const User = require('../models/User');

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload)  { this.body = payload; return this; },
  };
}

function makeNext() {
  const calls = [];
  const fn = (err) => { calls.push(err === undefined ? '__no_arg__' : err); };
  fn.calls = calls;
  return fn;
}

function stubUserFindById(returnValue, opts = {}) {
  const original = User.findById;
  User.findById = () => ({
    select: () => ({
      lean: async () => {
        if (opts.throw) throw new Error(opts.throw);
        return returnValue;
      },
    }),
  });
  return () => { User.findById = original; };
}

test('B1 — 401 when no req.user.id', async () => {
  const req = {};
  const res = makeRes();
  const next = makeNext();
  await requirePhoneVerified(req, res, next);
  assert.equal(res.statusCode, 401);
  assert.equal(next.calls.length, 0, 'next must not be called');
});

test('B2 — 401 when user not found in DB', async () => {
  const restore = stubUserFindById(null);
  try {
    const req = { user: { id: 'fakeid' } };
    const res = makeRes();
    const next = makeNext();
    await requirePhoneVerified(req, res, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.calls.length, 0);
  } finally { restore(); }
});

test('B3 — 403 + PHONE_NOT_VERIFIED when phoneVerified=false', async () => {
  const restore = stubUserFindById({ phoneVerified: false });
  try {
    const req = { user: { id: 'fakeid' } };
    const res = makeRes();
    const next = makeNext();
    await requirePhoneVerified(req, res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'PHONE_NOT_VERIFIED');
    assert.equal(next.calls.length, 0);
  } finally { restore(); }
});

test('B4 — 403 + PHONE_NOT_VERIFIED when phoneVerified is undefined', async () => {
  // Defensive check — only strict true unlocks the route.
  const restore = stubUserFindById({});
  try {
    const req = { user: { id: 'fakeid' } };
    const res = makeRes();
    const next = makeNext();
    await requirePhoneVerified(req, res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'PHONE_NOT_VERIFIED');
  } finally { restore(); }
});

test('B5 — 403 + PHONE_NOT_VERIFIED when phoneVerified is a truthy non-boolean', async () => {
  // Defensive check — guard against accidental string "true" / 1 / etc.
  const restore = stubUserFindById({ phoneVerified: 'true' });
  try {
    const req = { user: { id: 'fakeid' } };
    const res = makeRes();
    const next = makeNext();
    await requirePhoneVerified(req, res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'PHONE_NOT_VERIFIED');
  } finally { restore(); }
});

test('B6 — calls next() when phoneVerified === true', async () => {
  const restore = stubUserFindById({ phoneVerified: true });
  try {
    const req = { user: { id: 'fakeid' } };
    const res = makeRes();
    const next = makeNext();
    await requirePhoneVerified(req, res, next);
    assert.equal(next.calls.length, 1, 'next must be called exactly once');
    assert.equal(res.statusCode, 200, 'res must not be touched');
  } finally { restore(); }
});

test('B7 — 500 when User.findById throws', async () => {
  const restore = stubUserFindById(null, { throw: 'mongo offline' });
  try {
    const req = { user: { id: 'fakeid' } };
    const res = makeRes();
    const next = makeNext();
    await requirePhoneVerified(req, res, next);
    assert.equal(res.statusCode, 500);
    assert.equal(next.calls.length, 0);
  } finally { restore(); }
});
