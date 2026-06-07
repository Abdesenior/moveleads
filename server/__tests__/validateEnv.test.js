/**
 * validateEnv — boot-time production env hard-fail lock-in.
 *
 * Locks in:
 *   1. Production deploys MUST exit(1) when TWILIO_AUTH_TOKEN,
 *      STRIPE_WEBHOOK_SECRET, SERVER_URL, or JWT_SECRET is missing or
 *      blank.
 *   2. Production with all required present does NOT exit, even when
 *      optional vars (STRIPE_SECRET_KEY, MONGODB_URI, etc.) are missing
 *      — those only warn.
 *   3. Non-production envs never exit, regardless of what's missing.
 *   4. exit(1) is called exactly once per validation pass even when
 *      multiple required vars are missing — avoids spurious second
 *      exits that hide the original failure in logs.
 *   5. Empty-string / whitespace-only values count as missing — a
 *      blank env var is a misconfig, not an intentional empty.
 */

'use strict';

const { test } = require('node:test');
const assert  = require('node:assert/strict');
const validateEnv = require('../utils/validateEnv');

function makeHarness() {
  const exitCalls = [];
  const logCalls = [];
  return {
    exit: (code) => { exitCalls.push(code); },
    log: (msg) => { logCalls.push(String(msg)); },
    exitCalls,
    logCalls,
    logJoined: () => logCalls.join('\n'),
  };
}

const PROD_FULL = {
  NODE_ENV: 'production',
  TWILIO_AUTH_TOKEN: 'tok',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  SERVER_URL: 'https://api.moveleads.cloud',
  JWT_SECRET: 'jwt_x',
};

test('prod-missing-twilio-token: exits 1 and names TWILIO_AUTH_TOKEN', () => {
  const h = makeHarness();
  const env = { ...PROD_FULL };
  delete env.TWILIO_AUTH_TOKEN;
  const result = validateEnv({ env, exit: h.exit, log: h.log });
  assert.deepEqual(h.exitCalls, [1], 'exit must be called exactly once with code 1');
  assert.deepEqual(result.missingRequired, ['TWILIO_AUTH_TOKEN']);
  assert.match(h.logJoined(), /\[FATAL\]/);
  assert.match(h.logJoined(), /TWILIO_AUTH_TOKEN/);
  assert.equal(result.ok, false);
});

test('prod-missing-stripe-webhook-secret: exits 1 and names STRIPE_WEBHOOK_SECRET', () => {
  const h = makeHarness();
  const env = { ...PROD_FULL };
  delete env.STRIPE_WEBHOOK_SECRET;
  const result = validateEnv({ env, exit: h.exit, log: h.log });
  assert.deepEqual(h.exitCalls, [1]);
  assert.deepEqual(result.missingRequired, ['STRIPE_WEBHOOK_SECRET']);
  assert.match(h.logJoined(), /STRIPE_WEBHOOK_SECRET/);
});

test('prod-missing-server-url: exits 1 and names SERVER_URL', () => {
  const h = makeHarness();
  const env = { ...PROD_FULL };
  delete env.SERVER_URL;
  const result = validateEnv({ env, exit: h.exit, log: h.log });
  assert.deepEqual(h.exitCalls, [1]);
  assert.deepEqual(result.missingRequired, ['SERVER_URL']);
  assert.match(h.logJoined(), /SERVER_URL/);
});

test('prod-missing-jwt-secret: exits 1 — preserves pre-refactor behavior', () => {
  const h = makeHarness();
  const env = { ...PROD_FULL };
  delete env.JWT_SECRET;
  const result = validateEnv({ env, exit: h.exit, log: h.log });
  assert.deepEqual(h.exitCalls, [1]);
  assert.deepEqual(result.missingRequired, ['JWT_SECRET']);
  assert.match(h.logJoined(), /JWT_SECRET/);
});

test('prod-missing-all-required: exits 1 ONCE and names all four in one line', () => {
  const h = makeHarness();
  const env = { NODE_ENV: 'production' };
  validateEnv({ env, exit: h.exit, log: h.log });
  assert.deepEqual(h.exitCalls, [1], 'exit must fire exactly once even with multiple missing');
  const fatal = h.logCalls.find(l => l.includes('[FATAL]'));
  assert.ok(fatal, 'must emit a [FATAL] line');
  assert.match(fatal, /TWILIO_AUTH_TOKEN/);
  assert.match(fatal, /STRIPE_WEBHOOK_SECRET/);
  assert.match(fatal, /SERVER_URL/);
  assert.match(fatal, /JWT_SECRET/);
});

test('prod-all-required-present: does NOT exit; ok=true', () => {
  const h = makeHarness();
  const result = validateEnv({ env: { ...PROD_FULL }, exit: h.exit, log: h.log });
  assert.deepEqual(h.exitCalls, [], 'exit must not be called when all required vars are present');
  assert.equal(result.ok, true);
  assert.deepEqual(result.missingRequired, []);
});

test('prod-required-present-optional-missing: warns but does NOT exit', () => {
  const h = makeHarness();
  const result = validateEnv({ env: { ...PROD_FULL }, exit: h.exit, log: h.log });
  assert.deepEqual(h.exitCalls, []);
  assert.equal(result.ok, true);
  assert.match(h.logJoined(), /\[WARN\]/);
  assert.ok(result.missingOptional.length > 0);
});

test('dev-missing-everything: does NOT exit; warns under [dev] prefix', () => {
  const h = makeHarness();
  const result = validateEnv({ env: { NODE_ENV: 'development' }, exit: h.exit, log: h.log });
  assert.deepEqual(h.exitCalls, []);
  assert.equal(result.ok, true);
  assert.match(h.logJoined(), /\[dev\]/);
  assert.doesNotMatch(h.logJoined(), /\[FATAL\]/);
});

test('node-env-unset-treated-as-non-prod: does NOT exit', () => {
  const h = makeHarness();
  const result = validateEnv({ env: {}, exit: h.exit, log: h.log });
  assert.deepEqual(h.exitCalls, []);
  assert.equal(result.ok, true);
  assert.equal(result.isProd, false);
});

test('prod-empty-string-treated-as-missing: exits 1', () => {
  const h = makeHarness();
  const env = { ...PROD_FULL, TWILIO_AUTH_TOKEN: '   ' };
  const result = validateEnv({ env, exit: h.exit, log: h.log });
  assert.deepEqual(h.exitCalls, [1]);
  assert.deepEqual(result.missingRequired, ['TWILIO_AUTH_TOKEN']);
});

test('exposes REQUIRED_IN_PROD / WARN_IN_PROD constants for callers', () => {
  assert.ok(validateEnv.REQUIRED_IN_PROD.includes('TWILIO_AUTH_TOKEN'));
  assert.ok(validateEnv.REQUIRED_IN_PROD.includes('STRIPE_WEBHOOK_SECRET'));
  assert.ok(validateEnv.REQUIRED_IN_PROD.includes('SERVER_URL'));
  assert.ok(validateEnv.REQUIRED_IN_PROD.includes('JWT_SECRET'));
  assert.ok(validateEnv.WARN_IN_PROD.includes('STRIPE_SECRET_KEY'));
  assert.ok(validateEnv.WARN_IN_PROD.includes('MONGODB_URI'));
});
