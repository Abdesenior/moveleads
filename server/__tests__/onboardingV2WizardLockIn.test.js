// Onboarding v2 — Wizard structural lock-in (2026-06-03)
//
// Covers the 8-screen direct-replacement controller introduced on
// feat/onboarding-v2-direct-replacement. Asserts:
//   - Welcome copy (operator-approved trust chips, no "ready-to-book")
//   - Screen ID const stays at 8 named values, in order
//   - Each step component is wired into the controller
//   - SMS Claim PATCH endpoint stays /users/me/sms-claim
//   - Browse-first dismissal endpoint unchanged
//   - VerifyPhoneModal mounted at wizard root
//   - Map is local (no CDN URLs in InteractiveUSMap or Onboarding.css)
//   - Pickup-derivation rule preserved verbatim in personalize.js
//
// These are surface-only lock-ins, not runtime tests. They protect copy
// the operator owns and structural pieces that prior incidents exposed.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CLIENT = path.join(__dirname, '..', '..', 'client', 'src');
const read = (p) => fs.readFileSync(path.join(CLIENT, p), 'utf8');

const wizard         = read('pages/onboarding/OnboardingWizard.jsx');
const welcome        = read('pages/onboarding/steps/StepWelcome.jsx');
const location       = read('pages/onboarding/steps/StepLocation.jsx');
const delivery       = read('pages/onboarding/steps/StepDelivery.jsx');
const contact        = read('pages/onboarding/steps/StepContact.jsx');
const smsClaim       = read('pages/onboarding/steps/StepSmsClaim.jsx');
const almostReady    = read('pages/onboarding/steps/StepAlmostReady.jsx');
const activate       = read('pages/onboarding/steps/StepActivate.jsx');
const success        = read('pages/onboarding/steps/StepSuccess.jsx');
const personalize    = read('pages/onboarding/personalize.js');
const map            = read('pages/onboarding/InteractiveUSMap.jsx');
const css            = read('pages/onboarding/Onboarding.css');

// ─── Screen identity ────────────────────────────────────────────────────────

test('W1 — SCREENS const declares all 8 named screens in order', () => {
  const match = wizard.match(/const SCREENS = \{[\s\S]*?\};/);
  assert.ok(match, 'SCREENS const must exist');
  const block = match[0];
  ['WELCOME', 'LOCATION', 'DELIVERY', 'CONTACT',
    'SMS_CLAIM', 'ALMOST_READY', 'ACTIVATE', 'SUCCESS'].forEach((name) => {
    assert.match(block, new RegExp(name + ':\\s*\\d'),
      `SCREENS.${name} must be declared`);
  });
});

test('W2 — Controller renders every step component by screen id', () => {
  ['StepWelcome', 'StepLocation', 'StepDelivery', 'StepContact',
   'StepSmsClaim', 'StepAlmostReady', 'StepActivate', 'StepSuccess'].forEach((c) => {
    assert.match(wizard, new RegExp('<' + c + '\\s'),
      `Controller must mount <${c}>`);
  });
});

// ─── Welcome copy lock-in (operator-approved trust chips) ────────────────────

test('W3 — Welcome uses the safer trust chips, not "Ready-to-book"', () => {
  assert.match(welcome, /Exclusive moving leads/);
  assert.match(welcome, /Qualified homeowner requests/);
  assert.match(welcome, /Published quickly after qualification/);
  assert.doesNotMatch(welcome, /Ready-to-book customers/);
  assert.doesNotMatch(welcome, /Delivered within seconds/);
});

test('W4 — Welcome H1 + eyebrow stay verbatim', () => {
  assert.match(welcome, /Welcome to MoveLeads/);
  assert.match(welcome, /Get more moving jobs in your service area/);
});

// ─── SMS Claim endpoint + opt-in plumbing ───────────────────────────────────

test('W5 — Wizard PATCHes /api/users/me/sms-claim with optInRequested', () => {
  assert.match(wizard, /\/users\/me\/sms-claim/);
  assert.match(wizard, /method:\s*['"]PATCH['"]/);
  assert.match(wizard, /optInRequested/);
});

test('W6 — chooseSms advances to ALMOST_READY after PATCH', () => {
  assert.match(wizard, /chooseSms\(/);
  assert.match(wizard, /SCREENS\.ALMOST_READY/);
});

// ─── Phone verify integration (PR #80 surface preserved) ────────────────────

test('W7 — VerifyPhoneModal mounted at wizard root with success + close handlers', () => {
  assert.match(wizard, /<VerifyPhoneModal/);
  assert.match(wizard, /onSuccess=\{handleVerifySuccess\}/);
  assert.match(wizard, /onClose=\{handleVerifyClose\}/);
});

test('W8 — Contact step preserves PR #80 verify status testids', () => {
  assert.match(contact, /data-testid="onboarding-verify-confirmed"/);
  assert.match(contact, /data-testid="onboarding-verify-pending"/);
  assert.match(contact, /data-testid="onboarding-verify-inline-cta"/);
});

// ─── Dismissal + browse-first (mandatory-onboarding semantics preserved) ────

test('W9 — Browse-first POST stays /api/onboarding/dismiss-activation-offer', () => {
  assert.match(wizard, /\/onboarding\/dismiss-activation-offer/);
});

test('W10 — Step 5 SMS Claim renders both opt-in CTAs', () => {
  assert.match(wizard, /I'll enable it later/);
  assert.match(wizard, /Enable SMS Claim/);
});

// ─── Stripe — real PaymentElement, no fake card form ─────────────────────────

test('W11 — StepActivate imports real Stripe Elements (no fake card form)', () => {
  assert.match(activate, /from\s+['"]@stripe\/react-stripe-js['"]/);
  assert.match(activate, /PaymentElement/);
  assert.match(activate, /ExpressCheckoutElement/);
  // No fake card inputs.
  assert.doesNotMatch(activate, /ow-cf-input/);
});

test('W12 — StepActivate hits real billing endpoints', () => {
  assert.match(activate, /\/billing\/verify-payment-intent/);
});

test('W13 — Controller calls /billing/create-payment-intent with chosen tier', () => {
  assert.match(wizard, /\/billing\/create-payment-intent/);
  assert.match(wizard, /amount:\s*currentTier/);
});

// ─── Map — local bundle, not CDN ────────────────────────────────────────────

test('W14 — InteractiveUSMap loads us-atlas TopoJSON from local public path', () => {
  assert.match(map, /\/onboarding\/states-10m\.json/);
  // d3-geo + topojson-client must be local imports, not CDN strings.
  assert.match(map, /import\s+\*\s+as\s+topojson\s+from\s+['"]topojson-client['"]/);
  assert.match(map, /from\s+['"]d3-geo['"]/);
});

test('W15 — No CDN URLs in onboarding sources', () => {
  [wizard, welcome, location, delivery, contact, smsClaim,
    almostReady, activate, success, map, css].forEach((src) => {
    assert.doesNotMatch(src, /cdn\.skypack\.dev/);
    assert.doesNotMatch(src, /unpkg\.com/);
    assert.doesNotMatch(src, /jsdelivr\.net/);
  });
});

// ─── Pickup-derivation rule (load-bearing for matcher) ──────────────────────

test('W16 — personalize.derivePickup keeps the operator-approved rule', () => {
  assert.match(personalize, /export function derivePickup/);
  assert.match(personalize, /deliveryUiMode\s*===\s*['"]local['"]/);
  assert.match(personalize, /mode:\s*['"]near['"]/);
  // 'some' includes home + selected
  assert.match(personalize, /deliveryUiMode\s*===\s*['"]some['"]/);
  // 'all' home-only seed (conservative)
  assert.match(personalize, /deliveryUiMode\s*===\s*['"]all['"]/);
});

test('W17 — personalize.mapDeliveryUiToServer keeps UI→server vocab map', () => {
  assert.match(personalize, /export function mapDeliveryUiToServer/);
  assert.match(personalize, /return\s+['"]same['"]/);
  assert.match(personalize, /return\s+['"]states['"]/);
  assert.match(personalize, /return\s+['"]nationwide['"]/);
});

// ─── SETUP_STAGES labels unchanged from L5 lock-in ──────────────────────────

test('W18 — SETUP_STAGES labels stay mover-language (no engineering verbs)', () => {
  const m = wizard.match(/const SETUP_STAGES = \[[\s\S]*?\];/);
  assert.ok(m, 'SETUP_STAGES must exist');
  const b = m[0];
  ['Your company', 'Where you work', 'How we reach you',
    'Add your first balance', 'Payment'].forEach((label) => {
    assert.match(b, new RegExp("label:\\s*['\"]" + label + "['\"]"),
      `SETUP_STAGES must keep label "${label}"`);
  });
  assert.doesNotMatch(b, /label:\s*['"]Dispatch['"]/);
  assert.doesNotMatch(b, /label:\s*['"]Coverage['"]/);
  assert.doesNotMatch(b, /label:\s*['"]Alerts['"]/);
  assert.doesNotMatch(b, /label:\s*['"]Activate['"]/);
});

// ─── Success aside (PR #79 testid preserved) ────────────────────────────────

test('W19 — Success aside keeps the PR #79 testid + Beta tag', () => {
  assert.match(success, /data-testid="onboarding-success-sms-claim-aside"/);
  assert.match(success, />Beta</);
  assert.match(success, /Claim leads by text/);
});

// ─── Mandatory-onboarding posture: no ?onboarding/complete from wizard ──────

test('W20 — Wizard never POSTs /onboarding/complete (mandatory-onboarding policy)', () => {
  assert.doesNotMatch(wizard, /\/onboarding\/complete/);
});
