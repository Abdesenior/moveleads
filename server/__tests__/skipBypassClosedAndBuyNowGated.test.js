/**
 * Onboarding skip-bypass closed + bids.js buy-now gated (2026-06-09).
 *
 * Two tightly-related fixes:
 *
 * 1. POST /api/onboarding/skip — DELETED.
 *    Previously this route silently set onboarding.complete=true without
 *    requiring phone verification. The UI never called it (grep across
 *    client/src confirmed zero references) — but a technical user could
 *    hit it directly (DevTools fetch, curl, Postman) and bypass the
 *    verification gate. The route is now gone from server/routes/onboarding.js.
 *
 * 2. POST /api/bids/:leadId/buy-now — now gated by requirePhoneVerified.
 *    Previously dashboard buy-now did NOT require phoneVerified. A
 *    grandfathered mover (pre-2026-06-07 soft-skip flow) or an admin-
 *    credited mover could buy leads despite having no verified phone.
 *    The buy-now route now joins the chokepoint set so phone verification
 *    is enforced consistently across every marketplace-participation
 *    surface (activation, top-up, SMS Claim opt-in, onboarding step >=4,
 *    onboarding/complete, and now dashboard buy-now).
 *
 * Both fixes are source-pinned here. Tests are pure-Node — no Mongo, no
 * Express boot — so they run in the existing test lane without setup.
 *
 * Run:
 *   node server/__tests__/skipBypassClosedAndBuyNowGated.test.js
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const path     = require('node:path');

const onboardingSrc = fs.readFileSync(
  path.join(__dirname, '..', 'routes', 'onboarding.js'),
  'utf8'
);
const bidsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'routes', 'bids.js'),
  'utf8'
);
const middlewareSrc = fs.readFileSync(
  path.join(__dirname, '..', 'middleware', 'requirePhoneVerified.js'),
  'utf8'
);

// ── 1. POST /api/onboarding/skip is GONE ────────────────────────────────

test('S1. onboarding.js no longer registers POST /skip', () => {
  // The router definition must be absent. Comments referencing "/skip"
  // for documentation purposes are fine (we deliberately leave a
  // tombstone comment explaining the deletion).
  assert.doesNotMatch(onboardingSrc, /router\.post\(\s*['"]\/skip['"]/);
});

test('S2. No handler still sets onboarding.complete inside a /skip-like route', () => {
  // Defensive: even if someone names the route differently, no anonymous
  // handler in onboarding.js should set 'onboarding.complete': true
  // alongside 'onboarding.skippedAt' — that combination was the bypass
  // signature.
  assert.doesNotMatch(
    onboardingSrc,
    /onboarding\.skippedAt[\s\S]{0,200}onboarding\.complete['"]?\s*:\s*true/
  );
});

test('S3. A tombstone comment documents the deletion', () => {
  // Keep a comment explaining what was removed and why, so a future
  // contributor can find this with grep before reintroducing the pattern.
  assert.match(onboardingSrc, /\/skip[\s\S]{0,400}DELETED/);
});

// ── 2. bids.js POST /:leadId/buy-now is gated ───────────────────────────

test('B1. bids.js imports requirePhoneVerified', () => {
  assert.match(
    bidsSrc,
    /require\(['"]\.\.\/middleware\/requirePhoneVerified['"]\)/
  );
});

test('B2. POST /:leadId/buy-now has auth + requirePhoneVerified middleware mounted', () => {
  // Must apply middleware in the documented order — auth populates
  // req.user.id which requirePhoneVerified reads.
  assert.match(
    bidsSrc,
    /router\.post\(\s*['"]\/:leadId\/buy-now['"]\s*,\s*auth\s*,\s*requirePhoneVerified\s*,/
  );
});

test('B3. POST /:leadId/settle does NOT mount requirePhoneVerified (operator-only route)', () => {
  // Defensive — settle is a cron-secret-gated route used by the auction
  // settlement job. It should NOT pick up a phoneVerified gate.
  assert.doesNotMatch(
    bidsSrc,
    /router\.post\(\s*['"]\/:leadId\/settle['"]\s*,\s*[^,]*\s*,\s*requirePhoneVerified/
  );
});

// ── 3. Middleware docs name the new chokepoint ──────────────────────────

test('M1. requirePhoneVerified docstring lists bids.js buy-now as a chokepoint', () => {
  // Documentation lock-in: future audits should be able to read the
  // middleware header and find every gated route. Drift here is how
  // the /skip bypass slipped through the original PR #121 review.
  assert.match(middlewareSrc, /\/api\/bids\/:leadId\/buy-now/);
});

test('M2. requirePhoneVerified docstring records that /skip was deleted', () => {
  assert.match(middlewareSrc, /onboarding\/skip[\s\S]{0,200}DELETED/);
});

// ── 4. Behavior shape — the existing requirePhoneVerified middleware
//      already returns 403 + PHONE_NOT_VERIFIED on unverified users.
//      The 16 unit tests in requirePhoneVerified.test.js already pin
//      that behavior. We're just expanding the surface it covers —
//      no new behavior to test here.

// ── 5. Verified-user happy path — verified users can still complete
//      onboarding and purchase leads through the existing flow. This
//      is exercised by the 1333 prior tests; no separate happy-path
//      test needed because we didn't change the success branch of
//      either route, only added a precondition.
