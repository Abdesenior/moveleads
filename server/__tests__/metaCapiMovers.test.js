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

const authRouteSrc = read(serverRoot, 'routes', 'auth.js');

test('E. verify-email fires mover CAPI CompleteRegistration and returns event_id', () => {
  assert.match(authRouteSrc, /require\(['"]\.\.\/services\/metaCapiMovers['"]\)/);
  assert.match(authRouteSrc, /sendCompleteRegistration\(/);
  // event_id is generated and threaded into the JWT response as metaEventId
  assert.match(authRouteSrc, /metaEventId/);
  // issueJWT must accept an extra payload object merged into the JSON
  assert.match(authRouteSrc, /function issueJWT\(user, res, extra/);
});

const billingCreditsSrc = read(serverRoot, 'routes', 'billingCredits.js');

test('F. activation credit fires mover CAPI Purchase with PI id + cash value', () => {
  assert.match(billingCreditsSrc, /require\(['"]\.\.\/services\/metaCapiMovers['"]\)/);
  assert.match(billingCreditsSrc, /sendActivationPurchase\(/);
  // event_id = the Stripe PaymentIntent id; value = the cash paid (selectedAmount)
  assert.match(billingCreditsSrc, /eventId:\s*paymentIntent\.id/);
  assert.match(billingCreditsSrc, /value:\s*selectedAmount/);
});

const pixelCoreSrc = (() => { try { return read(clientRoot, 'src', 'utils', 'metaPixelCore.js'); } catch { return ''; } })();
const pixelSrc     = read(clientRoot, 'src', 'utils', 'metaPixel.js');

test('G. core exposes ensureFbevents + trackSingle + readers', () => {
  assert.match(pixelCoreSrc, /export function ensureFbevents/);
  assert.match(pixelCoreSrc, /export function trackSingle/);
  assert.match(pixelCoreSrc, /trackSingle/);
  assert.match(pixelCoreSrc, /generateEventId/);
});

test('H. homeowner pixel is isolated via trackSingle (no bare track broadcast)', () => {
  assert.match(pixelSrc, /trackSingle\(\s*PIXEL_ID\s*,\s*['"]PageView['"]/);
  assert.match(pixelSrc, /trackSingle\(\s*PIXEL_ID\s*,\s*['"]Lead['"]/);
  assert.doesNotMatch(pixelSrc, /fbq\(\s*['"]track['"]\s*,/);
  assert.match(pixelSrc, /trackLead/);
});

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
