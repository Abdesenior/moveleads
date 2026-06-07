# Movers Meta Pixel + CAPI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an isolated Meta Pixel + Conversions API for the mover funnel (pixel `1721087862641992`) firing PageView / Lead / CompleteRegistration / Purchase, without changing the existing homeowner pixel's behavior. Future campaigns optimize for Purchase; Lead (activation-offer) is a mid-funnel volume/audience signal only.

**Architecture:** Two pixels share one global `fbq`; every event uses `trackSingle` so nothing cross-fires. New client modules (`metaPixelCore`, `metaPixelMovers`, `useMoverFunnelPixel`) and a self-contained server module (`metaCapiMovers`) reusing only the pure helpers from `metaCapi.js`. Browser↔CAPI dedup via shared `event_id`.

**Tech Stack:** React (Vite), Express, Mongoose, Meta `fbevents.js` + Graph API v19.0. Tests use Node's built-in `node:test` runner (no Jest/Vitest) in the source-level lock-in style of `server/__tests__/metaCapiCapture.test.js`.

**Spec:** `docs/superpowers/specs/2026-06-07-movers-meta-pixel-design.md`

**Conventions:**
- Test file (grows across tasks): `server/__tests__/metaCapiMovers.test.js`. Run with `node server/__tests__/metaCapiMovers.test.js`. `META_MOVER_*` env stays unset so the network path is never exercised.
- Per task: add the task's tests (they fail), implement, re-run (all pass), commit.
- All CAPI sends are fire-and-forget (`.catch`), never awaited.

---

### Task 1: Test scaffold + env documentation + User guard fields

**Files:**
- Create: `server/__tests__/metaCapiMovers.test.js`
- Modify: `server/.env.example`
- Modify: `server/models/User.js`

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/metaCapiMovers.test.js`:

```js
/**
 * Movers Meta Pixel + CAPI — lock-in suite.
 * Pure-Node, no Mongo, no network. META_MOVER_* deliberately unset so the
 * live sender path is never exercised. Mirrors metaCapiCapture.test.js.
 *
 * Run: node server/__tests__/metaCapiMovers.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const clientRoot = path.join(__dirname, '..', '..', 'client');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

const envExampleSrc = read(serverRoot, '.env.example');
const userModelSrc  = read(serverRoot, 'models', 'User.js');

test('A. env.example documents the mover Meta vars', () => {
  assert.match(envExampleSrc, /META_MOVER_PIXEL_ID/);
  assert.match(envExampleSrc, /META_MOVER_CAPI_ACCESS_TOKEN/);
  assert.match(envExampleSrc, /VITE_META_MOVER_PIXEL_ID/);
});

test('B. User schema declares the CompleteRegistration guard (and NO Purchase guard)', () => {
  assert.match(userModelSrc, /metaMoverCompleteRegistrationSentAt/);
  assert.doesNotMatch(userModelSrc, /metaMoverPurchaseSentAt/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: FAIL — assertions A and B fail (strings absent).

- [ ] **Step 3: Document env vars**

Append to `server/.env.example` (after the existing `META_*` block):

```bash
# ── Movers Meta Pixel + Conversions API (mover acquisition funnel only) ──
# Browser pixel id (build-time, Vite-exposed). Same value as META_MOVER_PIXEL_ID.
VITE_META_MOVER_PIXEL_ID=1721087862641992
# Server CAPI target + secret token (BACKEND ONLY).
META_MOVER_PIXEL_ID=1721087862641992
META_MOVER_CAPI_ACCESS_TOKEN=
# Optional: routes mover events to Events Manager → Test Events during QA. Unset in prod.
META_MOVER_CAPI_TEST_EVENT_CODE=
```

> If `client/.env.example` exists, also add `VITE_META_MOVER_PIXEL_ID=1721087862641992` there to match where `VITE_META_PIXEL_ID` already lives.

- [ ] **Step 4: Add the two guard fields to the User schema**

In `server/models/User.js`, locate the existing Meta/tracking or near the verification fields and add (place beside other top-level `Date` fields):

```js
  // Meta CAPI single-fire guard (mover CompleteRegistration). Mirror Lead.metaCapiSentAt.
  // Purchase needs NO guard — its idempotency key is the Stripe PaymentIntent id
  // (Transaction unique index upstream + Meta event_id dedup).
  metaMoverCompleteRegistrationSentAt: { type: Date },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: PASS (A and B green).

- [ ] **Step 6: Commit**

```bash
git add server/__tests__/metaCapiMovers.test.js server/.env.example server/models/User.js client/.env.example
git commit -m "feat(meta-movers): env vars, User CAPI guards, test scaffold"
```

---

### Task 2: Server `metaCapiMovers.js` module

**Files:**
- Create: `server/services/metaCapiMovers.js`
- Modify: `server/__tests__/metaCapiMovers.test.js`

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```js
// Loaded with META_MOVER_* unset → degraded path, no Mongo, no network.
const movers = require('../services/metaCapiMovers');

test('C. buildEvent produces a spec-compliant CAPI entry with hashed PII', () => {
  const user = { _id: 'abc123', email: 'mover@example.com', phone: '5551234567' };
  const ev = movers.buildEvent({
    eventName: 'Purchase', eventId: 'pi_test_1', user,
    customData: { currency: 'USD', value: 100 },
  });
  assert.equal(ev.event_name, 'Purchase');
  assert.equal(ev.event_id, 'pi_test_1');
  assert.equal(ev.action_source, 'website');
  assert.deepEqual(ev.custom_data, { currency: 'USD', value: 100 });
  // em / external_id are SHA-256 hex (64 chars) inside arrays
  assert.match(ev.user_data.em[0], /^[a-f0-9]{64}$/);
  assert.match(ev.user_data.external_id[0], /^[a-f0-9]{64}$/);
  assert.match(ev.user_data.ph[0], /^[a-f0-9]{64}$/);
});

test('C2. buildEvent omits placeholder noemail+ addresses', () => {
  const ev = movers.buildEvent({
    eventName: 'CompleteRegistration', eventId: 'e1',
    user: { _id: 'x', email: 'noemail+abc@moveleads.cloud' },
  });
  assert.equal(ev.user_data.em, undefined);
  assert.ok(ev.user_data.external_id); // external_id still anchors the event
});

test('D. senders degrade safely when env is unset (no throw, no send)', async () => {
  const r1 = await movers.sendCompleteRegistration({ _id: 'u1', email: 'a@b.com' }, { eventId: 'e1' });
  const r2 = await movers.sendActivationPurchase({ _id: 'u1', email: 'a@b.com' }, { eventId: 'pi_1', value: 50 });
  assert.equal(r1.sent, false);
  assert.equal(r1.reason, 'env-missing');
  assert.equal(r2.sent, false);
  assert.equal(r2.reason, 'env-missing');
});

test('D2. senders reject a missing user', async () => {
  const r = await movers.sendCompleteRegistration(null, { eventId: 'e1' });
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'missing-user');
});

test('D3. Purchase has NO User-guard field; idempotency is the PaymentIntent id', () => {
  const src = read(serverRoot, 'services', 'metaCapiMovers.js');
  assert.doesNotMatch(src, /metaMoverPurchaseSentAt/);
  assert.match(src, /metaMoverCompleteRegistrationSentAt/); // CompleteRegistration keeps its guard
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: FAIL — `Cannot find module '../services/metaCapiMovers'`.

- [ ] **Step 3: Create the module**

Create `server/services/metaCapiMovers.js`:

```js
/**
 * Meta Conversions API — MOVER funnel only.
 *
 * Self-contained so the homeowner CAPI (services/metaCapi.js) is untouched.
 * Reuses ONLY the pure helpers exported by metaCapi.js (hashPii,
 * normalizePhoneForHash, extractRequestSignals); ships its own small poster.
 *
 * Env (server/.env, never committed):
 *   META_MOVER_PIXEL_ID            — CAPI target (= public VITE_META_MOVER_PIXEL_ID)
 *   META_MOVER_CAPI_ACCESS_TOKEN   — secret token, BACKEND ONLY
 *   META_MOVER_CAPI_TEST_EVENT_CODE— optional QA routing to Test Events
 *
 * Discipline: fire-and-forget (.catch), never awaited; idempotent via a
 * conditional updateOne on a per-event User guard BEFORE the HTTP call
 * (mirrors metaCapi.sendLead); degraded no-op when env is missing.
 */
'use strict';

const { hashPii, normalizePhoneForHash, extractRequestSignals } = require('./metaCapi');

const GRAPH_API_VERSION = 'v19.0';

function envPixelId()  { return (process.env.META_MOVER_PIXEL_ID || '').trim(); }
function envToken()    { return (process.env.META_MOVER_CAPI_ACCESS_TOKEN || '').trim(); }
function envTestCode() { return (process.env.META_MOVER_CAPI_TEST_EVENT_CODE || '').trim(); }

function realOrUndefined(email) {
  if (!email) return undefined;
  if (String(email).startsWith('noemail+')) return undefined;
  return email;
}

function buildUserData(user, req) {
  const ud = {};
  const email = realOrUndefined(user.email);
  const phone = normalizePhoneForHash(user.phone);
  if (email) ud.em = [hashPii(email)];
  if (phone) ud.ph = [hashPii(phone)];
  ud.external_id = [hashPii(String(user._id))];
  const sig = extractRequestSignals(req);
  if (sig.ipAddress) ud.client_ip_address = sig.ipAddress;
  if (sig.userAgent) ud.client_user_agent = sig.userAgent;
  return ud;
}

function buildEvent({ eventName, eventId, user, req, customData }) {
  const entry = {
    event_name:    eventName,
    event_time:    Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data:     buildUserData(user, req),
  };
  if (eventId)    entry.event_id    = eventId;
  if (customData) entry.custom_data = customData;
  return entry;
}

async function postEvents(pixelId, token, event, testCode) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`;
  const body = { data: [event] };
  if (testCode) body.test_event_code = testCode;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => '');
    let parsed; try { parsed = JSON.parse(text); } catch (_e) { parsed = text; }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err) {
    return { ok: false, status: 0, error: err && err.message };
  }
}

// Env-checked post with NO idempotency guard. Used by Purchase, whose
// idempotency is upstream: applyOnboardingActivationCredit reaches applied:true
// once per PaymentIntent (Transaction unique index), and Meta dedups on
// event_id = the PaymentIntent id.
async function postIfConfigured({ user, eventName, eventId, req, customData }) {
  if (!user || !user._id) return { sent: false, reason: 'missing-user' };
  const pixelId = envPixelId();
  const token   = envToken();
  if (!pixelId || !token) {
    console.log(`[metaCapiMovers:scaffold] would send ${eventName} for user=${user._id} (env not configured)`);
    return { sent: false, reason: 'env-missing' };
  }
  const event  = buildEvent({ eventName, eventId, user, req, customData });
  const result = await postEvents(pixelId, token, event, envTestCode());
  if (result.ok) {
    console.log(`[metaCapiMovers] ${eventName} accepted (HTTP ${result.status}) user=${user._id}`);
    return { sent: true, status: result.status };
  }
  console.error(
    `[metaCapiMovers] ${eventName} FAILED (HTTP ${result.status}) user=${user._id}` +
    (result.error ? ` error=${result.error}` : '')
  );
  return { sent: false, status: result.status, reason: 'http-error' };
}

// CompleteRegistration: single-fire per user via a conditional updateOne BEFORE
// the HTTP call (verify-email can in theory be re-triggered). Rolls back on HTTP
// failure so an explicit re-fire can retry. Mirrors metaCapi.sendLead.
async function sendCompleteRegistration(user, { eventId, req } = {}) {
  if (!user || !user._id) return { sent: false, reason: 'missing-user' };
  const pixelId = envPixelId();
  const token   = envToken();
  if (!pixelId || !token) {
    console.log(`[metaCapiMovers:scaffold] would send CompleteRegistration for user=${user._id} (env not configured)`);
    return { sent: false, reason: 'env-missing' };
  }
  const User = require('../models/User'); // lazy — tolerant of no-Mongo test harnesses
  const claim = await User.updateOne(
    { _id: user._id, $or: [
      { metaMoverCompleteRegistrationSentAt: { $exists: false } },
      { metaMoverCompleteRegistrationSentAt: null },
    ] },
    { $set: { metaMoverCompleteRegistrationSentAt: new Date() } }
  ).catch(err => ({ matchedCount: 0, _err: err }));
  if (!claim || claim.matchedCount === 0) return { sent: false, reason: 'already-sent' };

  const event  = buildEvent({ eventName: 'CompleteRegistration', eventId, user, req });
  const result = await postEvents(pixelId, token, event, envTestCode());
  if (result.ok) {
    console.log(`[metaCapiMovers] CompleteRegistration accepted (HTTP ${result.status}) user=${user._id}`);
    return { sent: true, status: result.status };
  }
  await User.updateOne({ _id: user._id }, { $unset: { metaMoverCompleteRegistrationSentAt: '' } }).catch(() => {});
  console.error(
    `[metaCapiMovers] CompleteRegistration FAILED (HTTP ${result.status}) user=${user._id}` +
    (result.error ? ` error=${result.error}` : '')
  );
  return { sent: false, status: result.status, reason: 'http-error' };
}

// Purchase: NO per-user guard. Idempotency key = the Stripe PaymentIntent id.
async function sendActivationPurchase(user, { eventId, value, req } = {}) {
  return postIfConfigured({
    user, eventName: 'Purchase', eventId, req,
    customData: { currency: 'USD', value: Number(value) || 0 },
  });
}

module.exports = {
  buildUserData,
  buildEvent,
  sendCompleteRegistration,
  sendActivationPurchase,
  _internal: { postEvents, GRAPH_API_VERSION },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: PASS (A–D2 green).

- [ ] **Step 5: Commit**

```bash
git add server/services/metaCapiMovers.js server/__tests__/metaCapiMovers.test.js
git commit -m "feat(meta-movers): self-contained mover CAPI module"
```

---

### Task 3: Wire CompleteRegistration into email verification

**Files:**
- Modify: `server/routes/auth.js` (`issueJWT` ~42-60; `/verify-email` ~180-214)
- Modify: `server/__tests__/metaCapiMovers.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
const authRouteSrc = read(serverRoot, 'routes', 'auth.js');

test('E. verify-email fires mover CAPI CompleteRegistration and returns event_id', () => {
  assert.match(authRouteSrc, /require\(['"]\.\.\/services\/metaCapiMovers['"]\)/);
  assert.match(authRouteSrc, /sendCompleteRegistration\(/);
  // event_id is generated and threaded into the JWT response as metaEventId
  assert.match(authRouteSrc, /metaEventId/);
  // issueJWT must accept an extra payload object merged into the JSON
  assert.match(authRouteSrc, /function issueJWT\(user, res, extra/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: FAIL — assertion E fails.

- [ ] **Step 3: Extend `issueJWT` to accept an extra payload**

Replace the `issueJWT` function body's `res.json({...})` to merge `extra`. Change the signature and the response:

```js
function issueJWT(user, res, extra = {}) {
  const payload = { user: { id: user.id, role: user.role } };
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
    if (err) throw err;
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        companyName: user.companyName,
        isEmailVerified: !!user.isEmailVerified,
      },
      ...extra,
    });
  });
}
```

- [ ] **Step 4: Require the mover CAPI module**

Near the top of `server/routes/auth.js`, after the existing service requires (line ~10):

```js
const metaCapiMovers = require('../services/metaCapiMovers');
```

- [ ] **Step 5: Fire CompleteRegistration + thread event_id in `/verify-email`**

In the `/verify-email` handler, replace the success tail (the `sendWelcomeEmail(...)` + `return issueJWT(user, res);` block, ~202-209) with:

```js
    // Welcome email — best-effort, never blocks verification.
    sendWelcomeEmail(user).catch(() => {});

    // Mover CAPI: CompleteRegistration fires once per user (guarded). The
    // same event_id is echoed to the browser so the Pixel event dedups.
    const metaEventId = crypto.randomUUID();
    metaCapiMovers
      .sendCompleteRegistration(user, { eventId: metaEventId, req })
      .catch(err => console.error('[metaCapiMovers] CompleteRegistration threw:', err && err.message));

    // Issue JWT + echo the event_id for browser↔CAPI dedup.
    return issueJWT(user, res, { metaEventId });
```

> `crypto` is already imported at `auth.js:5` (`require('crypto')`), which provides `randomUUID()` on Node 18+.

- [ ] **Step 6: Run test to verify it passes**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: PASS (E green).

- [ ] **Step 7: Commit**

```bash
git add server/routes/auth.js server/__tests__/metaCapiMovers.test.js
git commit -m "feat(meta-movers): fire CompleteRegistration CAPI on email verify"
```

---

### Task 4: Wire Purchase into activation credit application

**Files:**
- Modify: `server/routes/billingCredits.js` (`applyOnboardingActivationCredit` ~65-113)
- Modify: `server/__tests__/metaCapiMovers.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
const billingCreditsSrc = read(serverRoot, 'routes', 'billingCredits.js');

test('F. activation credit fires mover CAPI Purchase with PI id + cash value', () => {
  assert.match(billingCreditsSrc, /require\(['"]\.\.\/services\/metaCapiMovers['"]\)/);
  assert.match(billingCreditsSrc, /sendActivationPurchase\(/);
  // event_id = the Stripe PaymentIntent id; value = the cash paid (selectedAmount)
  assert.match(billingCreditsSrc, /eventId:\s*paymentIntent\.id/);
  assert.match(billingCreditsSrc, /value:\s*selectedAmount/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: FAIL — assertion F fails.

- [ ] **Step 3: Require the mover CAPI module**

At the top of `server/routes/billingCredits.js`, after the existing requires (~17):

```js
const metaCapiMovers = require('../services/metaCapiMovers');
```

- [ ] **Step 4: Add phone to the post-credit user fetch**

In `applyOnboardingActivationCredit`, change the `fresh` select (line ~89) to include `phone`:

```js
  const fresh = await User.findById(userId).select('balance companyName email phone');
```

- [ ] **Step 5: Fire Purchase on the applied path**

Immediately before `return { applied: true, ... }` (line ~113), after the existing receipt-email call:

```js
  // Mover CAPI: Purchase. This branch is reached once per PI (Transaction unique
  // index is the idempotency key), so no extra guard is needed. event_id =
  // PaymentIntent id so the browser Pixel Purchase dedups. value = cash paid.
  metaCapiMovers
    .sendActivationPurchase(fresh, { eventId: paymentIntent.id, value: selectedAmount })
    .catch(err => console.error('[metaCapiMovers] Purchase threw:', err && err.message));
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: PASS (F green).

- [ ] **Step 7: Commit**

```bash
git add server/routes/billingCredits.js server/__tests__/metaCapiMovers.test.js
git commit -m "feat(meta-movers): fire Purchase CAPI on activation credit"
```

---

### Task 5: Client shared core + homeowner isolation refactor

**Files:**
- Create: `client/src/utils/metaPixelCore.js`
- Modify: `client/src/utils/metaPixel.js`
- Modify: `server/__tests__/metaCapiMovers.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
const pixelCoreSrc = (() => { try { return read(clientRoot, 'src', 'utils', 'metaPixelCore.js'); } catch { return ''; } })();
const pixelSrc     = read(clientRoot, 'src', 'utils', 'metaPixel.js');

test('G. core exposes ensureFbevents + trackSingle + readers', () => {
  assert.match(pixelCoreSrc, /export function ensureFbevents/);
  assert.match(pixelCoreSrc, /export function trackSingle/);
  assert.match(pixelCoreSrc, /trackSingle/);
  assert.match(pixelCoreSrc, /generateEventId/);
});

test('H. homeowner pixel is isolated via trackSingle (no bare track broadcast)', () => {
  // Homeowner events must target its own pixel id, not broadcast to all pixels.
  assert.match(pixelSrc, /trackSingle\(\s*PIXEL_ID\s*,\s*['"]PageView['"]/);
  assert.match(pixelSrc, /trackSingle\(\s*PIXEL_ID\s*,\s*['"]Lead['"]/);
  // No remaining bare fbq('track', ...) broadcast calls.
  assert.doesNotMatch(pixelSrc, /fbq\(\s*['"]track['"]\s*,/);
  // Still re-exports the readers GetQuoteV6 imports.
  assert.match(pixelSrc, /trackLead/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: FAIL — assertions G and H fail.

- [ ] **Step 3: Create the shared core**

Create `client/src/utils/metaPixelCore.js`:

```js
// Pixel-agnostic Meta helpers shared by the homeowner and mover pixels.
//
// fbevents.js exposes a single global `fbq`; multiple pixels share it. A bare
// fbq('track', …) broadcasts to EVERY initialized pixel, so all events go
// through trackSingle(pixelId, …) to stay isolated per pixel.

let injected = false;

/** Inject the stock fbevents.js snippet once. No init, no track. Idempotent. */
export function ensureFbevents() {
  if (injected) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  injected = true;
  /* eslint-disable */
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
}

/**
 * Fire a single-pixel event. Targets exactly one pixel id so a second pixel
 * on the page never receives it. Safe under SSR / ad-blocker / missing id.
 */
export function trackSingle(pixelId, eventName, params = {}, eventId) {
  if (typeof window === 'undefined') return;
  if (!pixelId) return;
  const fbq = window.fbq;
  if (typeof fbq !== 'function') return;
  try {
    if (eventId) fbq('trackSingle', pixelId, eventName, params, { eventID: eventId });
    else         fbq('trackSingle', pixelId, eventName, params);
  } catch (_e) {
    // Never let a tracking failure surface to funnel UX. CAPI is durable.
  }
}

/** UUIDv4 for browser↔CAPI dedup. crypto.randomUUID with RFC4122 fallback. */
export function generateEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) return '';
  const target = name + '=';
  for (let p of document.cookie.split(';')) {
    p = p.trim();
    if (p.startsWith(target)) return decodeURIComponent(p.slice(target.length));
  }
  return '';
}

export function readFbp() { return readCookie('_fbp'); }

export function readFbc() {
  const cookie = readCookie('_fbc');
  if (cookie) return cookie;
  if (typeof window === 'undefined') return '';
  try {
    const fbclid = new URL(window.location.href).searchParams.get('fbclid');
    if (!fbclid) return '';
    return `fb.1.${Date.now()}.${fbclid}`;
  } catch (_e) {
    return '';
  }
}

export function eventSourceUrl() {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.href;
}
```

- [ ] **Step 4: Refactor the homeowner pixel to use the core**

Replace the entire contents of `client/src/utils/metaPixel.js` with:

```js
// Homeowner Meta Pixel. Uses the shared core; fires every event via
// trackSingle so the mover pixel (when present) never receives homeowner
// events. Behavior is identical to before: init homeowner pixel, PageView at
// boot, Lead on quote submit — all scoped to VITE_META_PIXEL_ID.
import {
  ensureFbevents,
  trackSingle,
  generateEventId,
  readFbp,
  readFbc,
  eventSourceUrl,
} from './metaPixelCore';

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '';

let loaded = false;

/** Boot the homeowner pixel + fire PageView. Idempotent. Call once from main.jsx. */
export function loadPixel() {
  if (loaded) return;
  if (typeof window === 'undefined') return;
  if (!PIXEL_ID) return;
  loaded = true;
  ensureFbevents();
  try { window.fbq('init', PIXEL_ID); } catch (_e) { /* ad-blocker */ }
  trackSingle(PIXEL_ID, 'PageView');
}

/**
 * Fire the homeowner `Lead` event. Pass the SAME eventId sent to the server so
 * Meta dedups browser vs CAPI on (event_name, event_id).
 */
export function trackLead(eventId, params = {}) {
  trackSingle(
    PIXEL_ID,
    'Lead',
    { content_name: 'moveleads_quote', currency: 'USD', value: 0, ...params },
    eventId,
  );
}

// Re-export readers so existing GetQuoteV6 imports stay unchanged.
export { generateEventId, readFbp, readFbc, eventSourceUrl };
```

- [ ] **Step 5: Update the homeowner lock-in test to follow the core extraction**

The refactor moves `fbclid`, the `typeof fbq` guard, the `eventID: eventId` dedup, and the
reader functions out of `metaPixel.js` into `metaPixelCore.js`. The homeowner suite asserts those
live in `metaPixel.js`, so its source-location assertions must follow them. **Behavior is
unchanged** — only where the code lives. This is the only edit to the homeowner test, and it does
not touch the homeowner pixel's runtime.

In `server/__tests__/metaCapiCapture.test.js`, add this read alongside the existing `metaPixelSrc`
read (~line 38):

```js
const metaPixelCoreSrc = fs.readFileSync(path.join(clientRoot, 'src', 'utils', 'metaPixelCore.js'), 'utf8');
```

Then replace the entire `test('client metaPixel helper exports the expected surface', …)` block
(lines ~325-347) with:

```js
test('client metaPixel helper exports the expected surface', () => {
  // loadPixel + trackLead are defined in metaPixel.js; readers may be defined
  // OR re-exported from metaPixelCore after the core extraction.
  for (const name of ['loadPixel', 'trackLead']) {
    assert.match(metaPixelSrc, new RegExp(`export\\s+function\\s+${name}\\b`),
      `metaPixel.js must export ${name}()`);
  }
  for (const name of ['generateEventId', 'readFbp', 'readFbc', 'eventSourceUrl']) {
    assert.match(metaPixelSrc, new RegExp(`\\b${name}\\b`),
      `metaPixel.js must export/re-export ${name}`);
  }

  // loadPixel reads VITE_META_PIXEL_ID and short-circuits when unset.
  assert.match(metaPixelSrc, /import\.meta\.env\.VITE_META_PIXEL_ID/);
  assert.match(metaPixelSrc, /if\s*\(\s*!PIXEL_ID\s*\)/,
    'loadPixel must short-circuit when VITE_META_PIXEL_ID is missing');

  // Homeowner events are isolated via trackSingle — no bare track broadcast.
  assert.match(metaPixelSrc, /trackSingle\(\s*PIXEL_ID\s*,\s*['"]Lead['"]/,
    'trackLead must use trackSingle(PIXEL_ID, "Lead", …) for pixel isolation');
  assert.doesNotMatch(metaPixelSrc, /fbq\(\s*['"]track['"]\s*,/,
    'no bare fbq("track", …) broadcast calls — use trackSingle');

  // The shared core carries the snippet injector, fbq guard, eventID dedup,
  // and the fbclid fallback.
  assert.match(metaPixelCoreSrc, /export function ensureFbevents/);
  assert.match(metaPixelCoreSrc, /export function trackSingle/);
  assert.match(metaPixelCoreSrc, /typeof\s+fbq\s*!==\s*['"]function['"]/);
  assert.match(metaPixelCoreSrc, /eventID:\s*eventId/,
    'core trackSingle must pass eventID for browser↔CAPI dedup');
  assert.match(metaPixelCoreSrc, /fbclid/,
    'readFbc must fall back to the ?fbclid= URL param');
});
```

- [ ] **Step 6: Run BOTH suites to verify they pass**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: PASS (G and H green).

Run: `node server/__tests__/metaCapiCapture.test.js`
Expected: PASS — homeowner suite green with the updated source-location assertions.

- [ ] **Step 7: Verify the client still builds (no broken imports)**

Run: `cd client && npm run build`
Expected: build succeeds (GetQuoteV6 imports of `trackLead`/readers still resolve via re-export).

- [ ] **Step 8: Commit**

```bash
git add client/src/utils/metaPixelCore.js client/src/utils/metaPixel.js server/__tests__/metaCapiMovers.test.js server/__tests__/metaCapiCapture.test.js
git commit -m "feat(meta-movers): extract pixel core, isolate homeowner via trackSingle"
```

---

### Task 6: Mover pixel module + funnel hook

**Files:**
- Create: `client/src/utils/metaPixelMovers.js`
- Create: `client/src/hooks/useMoverFunnelPixel.js`
- Modify: `server/__tests__/metaCapiMovers.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
const moversPixelSrc = (() => { try { return read(clientRoot, 'src', 'utils', 'metaPixelMovers.js'); } catch { return ''; } })();
const moverHookSrc   = (() => { try { return read(clientRoot, 'src', 'hooks', 'useMoverFunnelPixel.js'); } catch { return ''; } })();

test('I. mover pixel module exposes the four event helpers + loader', () => {
  assert.match(moversPixelSrc, /VITE_META_MOVER_PIXEL_ID/);
  assert.match(moversPixelSrc, /export function loadMoverPixel/);
  assert.match(moversPixelSrc, /export function trackMoverPageView/);
  assert.match(moversPixelSrc, /export function trackMoverLead/);
  assert.match(moversPixelSrc, /export function trackMoverCompleteRegistration/);
  assert.match(moversPixelSrc, /export function trackMoverPurchase/);
  // All events target the mover pixel via trackSingle.
  assert.match(moversPixelSrc, /trackSingle\(\s*MOVER_PIXEL_ID/);
});

test('J. funnel hook loads the mover pixel and fires a PageView', () => {
  assert.match(moverHookSrc, /useMoverFunnelPixel/);
  assert.match(moverHookSrc, /loadMoverPixel\(\)/);
  assert.match(moverHookSrc, /trackMoverPageView\(\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: FAIL — assertions I and J fail.

- [ ] **Step 3: Create the mover pixel module**

Create `client/src/utils/metaPixelMovers.js`:

```js
// Mover-funnel Meta Pixel. Separate pixel id; every event uses trackSingle so
// it never receives homeowner events and vice versa. Loaded lazily on funnel
// surfaces via useMoverFunnelPixel — never global.
import { ensureFbevents, trackSingle, generateEventId } from './metaPixelCore';

const MOVER_PIXEL_ID = import.meta.env.VITE_META_MOVER_PIXEL_ID || '';

let loaded = false;

/** Boot the mover pixel. Idempotent. No-op when the id is unset (dev). */
export function loadMoverPixel() {
  if (loaded) return;
  if (typeof window === 'undefined') return;
  if (!MOVER_PIXEL_ID) return;
  loaded = true;
  ensureFbevents();
  try { window.fbq('init', MOVER_PIXEL_ID); } catch (_e) { /* ad-blocker */ }
}

export function trackMoverPageView() {
  trackSingle(MOVER_PIXEL_ID, 'PageView');
}

/**
 * Mid-funnel intent signal: mover reached the activation-offer screen.
 * Browser-only — self-generates an event_id (no CAPI counterpart to dedup with).
 */
export function trackMoverLead(params = {}) {
  trackSingle(
    MOVER_PIXEL_ID,
    'Lead',
    { content_name: 'mover_activation_offer', ...params },
    generateEventId(),
  );
}

/** eventId MUST equal the server CompleteRegistration event_id (verify-email response). */
export function trackMoverCompleteRegistration(eventId) {
  trackSingle(MOVER_PIXEL_ID, 'CompleteRegistration', {}, eventId);
}

/** eventId MUST equal the Stripe PaymentIntent id used server-side. value = cash paid. */
export function trackMoverPurchase(eventId, { value } = {}) {
  trackSingle(MOVER_PIXEL_ID, 'Purchase', { currency: 'USD', value: Number(value) || 0 }, eventId);
}
```

- [ ] **Step 4: Create the funnel hook**

Create `client/src/hooks/useMoverFunnelPixel.js`:

```js
import { useEffect } from 'react';
import { loadMoverPixel, trackMoverPageView } from '../utils/metaPixelMovers';

/**
 * Mount on mover-funnel surfaces ONLY. Loads the mover pixel (idempotent) and
 * fires one mover PageView on mount. Keeps the mover pixel scoped to the funnel
 * — it is never initialized anywhere else in the app.
 */
export function useMoverFunnelPixel() {
  useEffect(() => {
    loadMoverPixel();
    trackMoverPageView();
  }, []);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: PASS (I and J green).

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/metaPixelMovers.js client/src/hooks/useMoverFunnelPixel.js server/__tests__/metaCapiMovers.test.js
git commit -m "feat(meta-movers): mover pixel module + funnel PageView hook"
```

---

### Task 7: Wire PageView into the funnel pages + CompleteRegistration browser event

**Files:**
- Modify: `client/src/pages/Partners.jsx`
- Modify: `client/src/pages/Register.jsx`
- Modify: `client/src/pages/VerifyEmail.jsx`
- Modify: `client/src/pages/VerifyEmailPending.jsx`
- Modify: `server/__tests__/metaCapiMovers.test.js`

> `OnboardingWizard.jsx` is intentionally **NOT** modified — onboarding fires no per-screen PageView.
> The single mid-funnel `Lead` is fired by the activation-offer screen in Task 8.

- [ ] **Step 1: Write the failing test**

Append:

```js
const partnersSrc   = read(clientRoot, 'src', 'pages', 'Partners.jsx');
const registerSrc   = read(clientRoot, 'src', 'pages', 'Register.jsx');
const verifySrc     = read(clientRoot, 'src', 'pages', 'VerifyEmail.jsx');
const verifyPendSrc = read(clientRoot, 'src', 'pages', 'VerifyEmailPending.jsx');
const wizardSrc     = read(clientRoot, 'src', 'pages', 'onboarding', 'OnboardingWizard.jsx');

test('K. the four ENTRY surfaces call the mover funnel pixel hook', () => {
  for (const src of [partnersSrc, registerSrc, verifySrc, verifyPendSrc]) {
    assert.match(src, /useMoverFunnelPixel\(\)/);
  }
});

test('K2. onboarding wizard does NOT fire a PageView (no per-screen spam)', () => {
  assert.doesNotMatch(wizardSrc, /useMoverFunnelPixel/);
});

test('L. VerifyEmail fires browser CompleteRegistration with the server event_id', () => {
  assert.match(verifySrc, /trackMoverCompleteRegistration/);
  assert.match(verifySrc, /data\.metaEventId/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: FAIL — assertions K and L fail.

- [ ] **Step 3: Add the hook to Partners.jsx**

Add the import (with the other imports) and call the hook at the top of the component body:

```js
import { useMoverFunnelPixel } from '../hooks/useMoverFunnelPixel';
```
```js
  useMoverFunnelPixel();
```

- [ ] **Step 4: Add the hook to Register.jsx**

Same two additions — import at top, `useMoverFunnelPixel();` as the first line inside `export default function Register() {` (before existing `useState` calls is fine):

```js
import { useMoverFunnelPixel } from '../hooks/useMoverFunnelPixel';
```
```js
  useMoverFunnelPixel();
```

- [ ] **Step 5: Add the hook to VerifyEmailPending.jsx**

```js
import { useMoverFunnelPixel } from '../hooks/useMoverFunnelPixel';
```
```js
  useMoverFunnelPixel();
```

- [ ] **Step 6: Add the hook + browser CompleteRegistration to VerifyEmail.jsx**

Add imports:

```js
import { useMoverFunnelPixel } from '../hooks/useMoverFunnelPixel';
import { trackMoverCompleteRegistration } from '../utils/metaPixelMovers';
```

Call the hook at the top of the component:

```js
  useMoverFunnelPixel();
```

In the success branch of the verify-email `.then(async data => { … })` (right after `setStatus('success')` at line ~34), fire the browser event with the server-supplied id:

```js
        // Mover Pixel: CompleteRegistration. event_id matches the server CAPI
        // event so Meta dedups browser vs CAPI. Only fires on real success.
        if (data.metaEventId) trackMoverCompleteRegistration(data.metaEventId);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: PASS (K, K2, and L green).

- [ ] **Step 8: Verify the client builds**

Run: `cd client && npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/Partners.jsx client/src/pages/Register.jsx client/src/pages/VerifyEmail.jsx client/src/pages/VerifyEmailPending.jsx server/__tests__/metaCapiMovers.test.js
git commit -m "feat(meta-movers): PageView on entry pages + CompleteRegistration browser event"
```

---

### Task 8: Wire Lead (activation-offer) + Purchase browser events into activation

**Files:**
- Modify: `client/src/pages/onboarding/steps/StepActivate.jsx` (`TierPicker` ~53; `PaymentForm.confirmAndComplete` ~159-198)
- Modify: `server/__tests__/metaCapiMovers.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
const stepActivateSrc = read(clientRoot, 'src', 'pages', 'onboarding', 'steps', 'StepActivate.jsx');

test('M. StepActivate fires the mid-funnel Lead + inits the pixel on the offer screen', () => {
  assert.match(stepActivateSrc, /trackMoverLead/);
  assert.match(stepActivateSrc, /loadMoverPixel/); // TierPicker mount inits the pixel for the later Purchase
});

test('M2. StepActivate fires browser Purchase with the PaymentIntent id + cash value', () => {
  assert.match(stepActivateSrc, /trackMoverPurchase/);
  assert.match(stepActivateSrc, /paymentIntent\.id/);
  assert.match(stepActivateSrc, /value:\s*tier/); // cash paid (50 or 100)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: FAIL — assertions M and M2 fail.

- [ ] **Step 3: Import the helpers + useEffect**

In `client/src/pages/onboarding/steps/StepActivate.jsx`, extend the React import (line 30) and add the mover-pixel import:

```js
import { useContext, useState, useEffect } from 'react';
```
```js
import { loadMoverPixel, trackMoverLead, trackMoverPurchase } from '../../../utils/metaPixelMovers';
```

> Note the `../../../` depth — this file is under `pages/onboarding/steps/`. This only adds `useEffect` to the existing `useContext`/`useState` import.

- [ ] **Step 4: Fire Lead + init the pixel when the activation-offer screen mounts**

In the `TierPicker` component (the activation-offer screen, ~line 53), add a mount effect as the first statement of the component body (before `const ctaLabel = …`):

```js
  // Activation-offer screen reached: init the mover pixel and fire the single
  // mid-funnel Lead. This is the only mover-pixel event inside onboarding
  // besides Purchase — deliberately NO per-screen PageView.
  useEffect(() => {
    loadMoverPixel();
    trackMoverLead();
  }, []);
```

- [ ] **Step 5: Fire Purchase after the payment is confirmed**

In `PaymentForm.confirmAndComplete`, inside the `if (paymentIntent && paymentIntent.status === 'succeeded') {` block, after the `verify-payment-intent` fetch and before `if (refreshUser) await refreshUser();` (line ~188):

```js
        // Mover Pixel: Purchase. event_id = PaymentIntent id (matches server
        // CAPI) so Meta dedups. value = cash paid (tier: 50 or 100), not the
        // bonus-inflated balance.
        trackMoverPurchase(paymentIntent.id, { value: tier });
```

> `tier` is already a prop of `PaymentForm` (used in `ctaLabel`, line ~155); `paymentIntent` is in scope from `stripe.confirmPayment`.

- [ ] **Step 6: Run test to verify it passes**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: PASS (M and M2 green).

- [ ] **Step 7: Verify the client builds**

Run: `cd client && npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/onboarding/steps/StepActivate.jsx server/__tests__/metaCapiMovers.test.js
git commit -m "feat(meta-movers): Lead on activation-offer + Purchase on activation success"
```

---

### Task 9: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Run the full mover lock-in suite**

Run: `node server/__tests__/metaCapiMovers.test.js`
Expected: ALL tests (A–M) PASS.

- [ ] **Step 2: Confirm the homeowner suite still passes (no regression)**

Run: `node server/__tests__/metaCapiCapture.test.js`
Expected: PASS — homeowner pixel/CAPI assertions unaffected by the `trackSingle` refactor.

- [ ] **Step 3: Production build**

Run: `cd client && npm run build`
Expected: succeeds with no unresolved imports.

- [ ] **Step 4: Manual QA (staging, with env set + `META_MOVER_CAPI_TEST_EVENT_CODE`)**

Set client `VITE_META_MOVER_PIXEL_ID`, server `META_MOVER_PIXEL_ID` + `META_MOVER_CAPI_ACCESS_TOKEN` + `META_MOVER_CAPI_TEST_EVENT_CODE`. Then, watching Meta Events Manager → **Test Events** for pixel `1721087862641992`:

```
1. Visit /partners            → mover PageView appears.
2. Register a new mover       → /register PageView; "check inbox" splash.
3. Click the verify link      → VerifyEmail PageView + ONE CompleteRegistration
                                (browser + CAPI collapsed by event_id).
4. Walk onboarding to the     → NO PageView fires per onboarding screen;
   Activate (offer) screen      exactly ONE Lead (content_name mover_activation_offer).
5. Pay ($50 or $100)          → ONE Purchase, value = cash paid, browser + CAPI
                                collapsed by event_id = PaymentIntent id.
```

- [ ] **Step 5: Manual QA — isolation regression**

```
6. Visit /get-quote, submit a quote → homeowner `Lead` appears ONLY on the
   homeowner pixel (VITE_META_PIXEL_ID); the mover pixel shows NO Lead and was
   NOT initialized on /get-quote (Meta Pixel Helper: only 1 pixel on /get-quote,
   2 pixels never cross-fire).
```

- [ ] **Step 6: Final commit (if any QA tweaks were needed)**

```bash
git add -A
git commit -m "test(meta-movers): verification pass + QA notes"
```

---

## Self-Review

**Spec coverage:**
- §2 isolation (trackSingle both) → Task 5 (H asserts no bare `track`). ✓
- §3.1 core → Task 5. §3.2 homeowner edit → Task 5. §3.3 mover module → Task 6. §3.4 hook → Task 6. ✓
- §4.1 PageView (4 entry surfaces, none in onboarding) → Task 7 (K, K2). ✓
- §4.2 Lead (activation-offer, browser-only) → Task 6 (I) + Task 8 (M). ✓
- §4.3 CompleteRegistration browser → Task 7 (L); server → Task 3 (E). ✓
- §4.4 Purchase browser → Task 8 (M2); server → Task 4 (F); idempotency = PI id, no guard → Task 2 (D3). ✓
- §5 metaCapiMovers (pure-helper reuse, CR guard, Purchase no-guard, degraded) → Task 2 (C/C2/D/D2/D3). ✓
- §6 User guard field (CompleteRegistration only; no Purchase guard) → Task 1 (B). ✓
- §7 env vars → Task 1 (A). ✓
- §10 testing (unit + manual QA + isolation regression) → Tasks 2/9. ✓

**Regression handling:** The Task 5 core extraction moves `fbclid` / the `typeof fbq` guard /
`eventID: eventId` / the readers out of `metaPixel.js`, which the homeowner lock-in suite
(`metaCapiCapture.test.js`) asserts on by source location. Task 5 Step 5 updates those assertions to
follow the move (behavior unchanged); Task 5 Step 6 and Task 9 Step 2 both run that suite and expect
PASS. Baseline confirmed green (15/15) before any change. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type/name consistency:** `loadMoverPixel`, `trackMoverPageView`, `trackMoverLead`, `trackMoverCompleteRegistration`, `trackMoverPurchase`, `useMoverFunnelPixel`, `postIfConfigured`, `sendCompleteRegistration`, `sendActivationPurchase`, `buildEvent`, `buildUserData`, the single guard field `metaMoverCompleteRegistrationSentAt` (no `metaMoverPurchaseSentAt`), env `VITE_META_MOVER_PIXEL_ID` / `META_MOVER_PIXEL_ID` / `META_MOVER_CAPI_ACCESS_TOKEN` — used consistently across tasks. ✓
- `event_id` sources consistent: CompleteRegistration = server UUID echoed as `metaEventId`; Purchase = `paymentIntent.id` both sides. ✓
- Purchase `value` = cash (`selectedAmount` server / `tier` client), not `totalCredits`. ✓
```
