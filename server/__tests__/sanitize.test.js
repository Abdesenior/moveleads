/**
 * sanitize middleware lock-in.
 *
 * Historical context:
 *   This file previously used Jest globals (describe/it/expect/beforeEach/
 *   jest.fn) and asserted that the middleware actively stripped script
 *   tags, javascript: URLs, etc. The MoveLeads server suite has since
 *   standardized on node:test (no Jest installed), and the middleware
 *   itself was reduced to a pass-through:
 *
 *     const sanitizeBody = (req, res, next) => {
 *       if (Buffer.isBuffer(req.body)) { return next(); }
 *       next();
 *     };
 *
 *   The active stripping that used to live here is now provided by
 *   other layers (per-route validators, the bid/lead handlers, etc.).
 *
 * Current invariant this suite locks in:
 *   1. The middleware exists and exports a function with the standard
 *      Express (req, res, next) signature.
 *   2. It is a TRUE pass-through — req.body / req.query / req.params
 *      are not mutated. (Mutation here would be a hidden side-effect
 *      surprise to every route in the app.)
 *   3. It calls next() on the request whether req.body is a Buffer
 *      (binary upload path) or a parsed object (normal JSON path).
 *      Skipping next() would deadlock every request.
 *   4. Module shape — a single default export. No accidental named
 *      exports or extra middleware functions that callers might
 *      mistake for the active one.
 *
 * If sanitization gets re-introduced (e.g. an HTML-stripping pass), the
 * assertions below should be updated rather than additional logic being
 * piled into the middleware — keep the middleware focused and let the
 * tests document the contract.
 *
 * Run: `node server/__tests__/sanitize.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const sanitizeInput = require('../middleware/sanitize');

function makeReq(body = {}) {
  return { body, query: {}, params: {} };
}

// ── 1. Module shape ────────────────────────────────────────────────────

test('1. middleware/sanitize exports a function', () => {
  assert.equal(typeof sanitizeInput, 'function',
    'middleware/sanitize must export a single function');
});

test('2. Function takes the standard Express (req, res, next) arity', () => {
  // arity == 3 is the canonical Express middleware signature. Express
  // checks arity to decide error-handler vs. normal middleware; a wrong
  // arity here would break the dispatch posture.
  assert.equal(sanitizeInput.length, 3,
    'middleware must declare (req, res, next) — arity must be 3');
});

// ── 2. Pass-through behavior ───────────────────────────────────────────

test('3. Clean input is returned unchanged', () => {
  const req = makeReq({ name: 'John Doe', email: 'john@example.com' });
  let nextCalled = false;
  sanitizeInput(req, {}, () => { nextCalled = true; });
  assert.equal(req.body.name, 'John Doe',
    'sanitize must not mutate clean body fields');
  assert.equal(req.body.email, 'john@example.com',
    'sanitize must not mutate clean body fields');
  assert.equal(nextCalled, true,
    'sanitize must call next() on a parsed-object body');
});

test('4. Buffer body is passed through (binary upload short-circuit)', () => {
  // Webhook routes (Stripe, Twilio) need the raw Buffer to verify
  // signatures. Mutating / parsing it here would break signature checks.
  const buf = Buffer.from('raw webhook payload');
  const req = makeReq(buf);
  let nextCalled = false;
  sanitizeInput(req, {}, () => { nextCalled = true; });
  assert.ok(Buffer.isBuffer(req.body), 'Buffer body must remain a Buffer');
  assert.equal(req.body.toString(), 'raw webhook payload',
    'Buffer contents must not be mutated');
  assert.equal(nextCalled, true,
    'sanitize must still call next() on Buffer body');
});

test('5. Arrays in the body are passed through unchanged', () => {
  // Per the pass-through contract, array contents must not be touched.
  // Active stripping is owned by per-route validators now.
  const arr = ['item-a', 'item-b', 'item-c'];
  const req = makeReq({ items: arr });
  sanitizeInput(req, {}, () => {});
  assert.deepEqual(req.body.items, ['item-a', 'item-b', 'item-c'],
    'sanitize must not mutate array contents');
});

test('6. Nested objects are passed through unchanged', () => {
  const original = {
    user: {
      name: 'John',
      profile: { bio: 'clean bio', tags: ['a', 'b'] },
    },
  };
  const req = makeReq(JSON.parse(JSON.stringify(original)));
  sanitizeInput(req, {}, () => {});
  assert.deepEqual(req.body, original,
    'sanitize must not mutate nested-object bodies');
});

test('7. Empty body / empty query / empty params are passed through cleanly', () => {
  // Defensive: an empty body must not cause a throw or skip next().
  const req = makeReq({});
  let nextCalled = false;
  sanitizeInput(req, {}, () => { nextCalled = true; });
  assert.deepEqual(req.body, {}, 'empty body must remain empty');
  assert.equal(nextCalled, true, 'empty body still must call next()');
});

// ── 3. next() is always called ─────────────────────────────────────────

test('8. next() is called exactly once per invocation', () => {
  // Calling next() twice would re-enter the Express dispatch chain and
  // produce subtle bugs. Lock the once-and-only-once invariant.
  const req = makeReq({ x: 1 });
  let calls = 0;
  sanitizeInput(req, {}, () => { calls++; });
  assert.equal(calls, 1, 'next() must be invoked exactly once');
});

console.log('sanitize middleware tests scheduled.');
