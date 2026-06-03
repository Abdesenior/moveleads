// Onboarding v2 — Backend wiring lock-in (2026-06-03)
//
// Asserts the server contract surfaces that the v2 wizard depends on remain
// in place. These are wiring-level checks (route exists, controller defines
// the right handler, schema field exists) — not runtime assertions.
//
// What this protects:
//   1. save-step route + currentStep tracking
//   2. dismiss-activation-offer route exists (browse-first flow)
//   3. sms-claim PATCH on users router (optInRequested → smsClaim.optedIn)
//   4. create-payment-intent + verify-payment-intent on billing router
//   5. applyPhoneChange resets phoneVerified when number changes
//   6. /api/onboarding/place-suggest exists (StepLocation autocomplete)
//   7. /auth/me returns phoneVerified (StepContact post-save resume)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(SERVER, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(SERVER, p));

// Helper: read first file that exists from a list of candidate paths.
function readFirst(candidates) {
  for (const c of candidates) {
    if (exists(c)) return { src: read(c), path: c };
  }
  return { src: '', path: null };
}

const userModel = readFirst(['models/User.js']).src;
const onboardingRoute = readFirst([
  'routes/onboarding.js',
  'routes/api/onboarding.js',
]).src;
const usersRoute = readFirst([
  'routes/users.js',
  'routes/api/users.js',
]).src;
// PR #80 split the Twilio Verify endpoints into their own router under
// /api/users/me/phone — both /send-verification and /verify-code live there.
const phoneVerifyRoute = readFirst([
  'routes/phoneVerification.js',
  'routes/phone.js',
]).src;
// SMS Claim has its own router under /api/users/me/sms-claim (PATCH).
const smsClaimRoute = readFirst([
  'routes/smsClaim.js',
  'routes/sms-claim.js',
]).src;
const phoneVerificationUtil = readFirst([
  'utils/phoneVerification.js',
]).src;
const billingRoute = readFirst([
  'routes/billing.js',
  'routes/api/billing.js',
]).src;
const authRoute = readFirst([
  'routes/auth.js',
  'routes/api/auth.js',
]).src;

// ─── User model — phoneVerified + smsClaim wiring ────────────────────────────

test('B1 — User model has phoneVerified boolean field', () => {
  assert.match(userModel, /phoneVerified/);
});

test('B2 — applyPhoneChange resets phoneVerified on phone change', () => {
  // applyPhoneChange in utils/phoneVerification.js is the canonical helper —
  // it returns a patch with phoneVerified: false whenever the new number
  // differs from the previous one. Every write site that touches User.phone
  // is required to route through this helper.
  assert.match(phoneVerificationUtil, /applyPhoneChange/);
  assert.match(phoneVerificationUtil, /phoneVerified:\s*false/);
});

test('B3 — User model carries smsClaim subdocument with opt-in flags', () => {
  assert.match(userModel, /smsClaim/);
});

// ─── Onboarding routes ──────────────────────────────────────────────────────

test('B4 — /onboarding/save-step route is defined', () => {
  assert.match(onboardingRoute, /save-step/);
});

test('B5 — /onboarding/dismiss-activation-offer route is defined (browse-first)', () => {
  assert.match(onboardingRoute, /dismiss-activation-offer/);
});

test('B6 — onboarding.currentStep is tracked via save-step handler', () => {
  // save-step persists answers + currentStep. The wiring lock-in just checks
  // currentStep is referenced in the save-step file.
  assert.match(onboardingRoute, /currentStep/);
});

test('B7 — /onboarding/place-suggest route exists for StepLocation autocomplete', () => {
  assert.match(onboardingRoute, /place-suggest/);
});

test('B8 — Wizard never relies on an /onboarding/complete client call', () => {
  // The route may still exist server-side (admin / system), but mandatory-
  // onboarding policy forbids the client from calling it. v2 wizard PATCHes
  // sms-claim + saves steps only. This is a complement to W20 in the wizard
  // lock-in suite — it asserts the policy on the surface the wizard touches.
  const wizard = fs.readFileSync(path.join(
    __dirname, '..', '..', 'client', 'src',
    'pages', 'onboarding', 'OnboardingWizard.jsx',
  ), 'utf8');
  assert.doesNotMatch(wizard, /\/onboarding\/complete/);
});

// ─── Users route — SMS Claim PATCH endpoint ─────────────────────────────────

test('B9 — PATCH /users/me/sms-claim handler exists', () => {
  // smsClaim router declares its own PATCH handler. Mount point is
  // /api/users/me/sms-claim, configured in server.js / app.js.
  assert.match(smsClaimRoute, /\.patch\(/);
});

test('B10 — sms-claim handler reads optInRequested from request body', () => {
  assert.match(smsClaimRoute, /optInRequested/);
});

// ─── Billing — create + verify payment intent ───────────────────────────────

test('B11 — /billing/create-payment-intent route is defined', () => {
  assert.match(billingRoute, /create-payment-intent/);
});

test('B12 — /billing/verify-payment-intent route is defined', () => {
  assert.match(billingRoute, /verify-payment-intent/);
});

test('B13 — Billing route honors source: onboarding_activation', () => {
  // The wizard sends source: 'onboarding_activation'. Server must accept it
  // (the field is consumed somewhere — at minimum referenced).
  assert.match(billingRoute, /onboarding_activation|source/);
});

// ─── Auth /me — phoneVerified shape ─────────────────────────────────────────

test('B14 — /auth/me route exists and returns user shape', () => {
  assert.match(authRoute, /\/me/);
});

// ─── Onboarding payload shape — pickup + delivery enums ─────────────────────

test('B15 — save-step accepts pickup + delivery answers (matcher inputs)', () => {
  assert.match(onboardingRoute, /pickup/);
  assert.match(onboardingRoute, /delivery/);
});

// ─── Mandatory onboarding posture preserved on the server ───────────────────

test('B16 — onboarding.activationOfferDismissedAt is set by dismiss endpoint', () => {
  assert.match(onboardingRoute, /activationOfferDismissedAt/);
});

// ─── Twilio Verify wiring (PR #80) — phone send/verify endpoints ────────────

test('B17 — Phone send-verification + verify-code routes exist', () => {
  // VerifyPhoneModal posts to /users/me/phone/send-verification and
  // /users/me/phone/verify-code. PR #80 broke these out into their own
  // router (routes/phoneVerification.js).
  assert.match(phoneVerifyRoute, /send-verification/);
  assert.match(phoneVerifyRoute, /verify-code/);
});

// ─── State enums — server understands the v2 delivery vocab ─────────────────

test('B18 — User model declares delivery mode as same|states|nationwide', () => {
  // The v2 wizard translates UI vocab → server vocab via mapDeliveryUiToServer
  // (local→same, some→states, all→nationwide). The User schema enum must
  // include all three values so save-step persists without validation error.
  assert.match(userModel, /'same'/);
  assert.match(userModel, /'states'/);
  assert.match(userModel, /'nationwide'/);
});

// ─── Save-step currentStep clamp protection ─────────────────────────────────

test('B19 — Server tolerates currentStep values 1–5 (post-v2-Welcome range)', () => {
  // v2 wizard sends server step numbers 1..5. The handler must not reject
  // values in that range. Surface check: no explicit "currentStep > 3"
  // truncation guard.
  assert.doesNotMatch(onboardingRoute, /currentStep\s*>\s*3/);
});

// ─── ApplyOnboardingActivationCredit unchanged ──────────────────────────────

test('B20 — Onboarding activation credit helper still flips bonusClaimedAt', () => {
  // The server-side helper that grants the $50 bonus stamps bonusClaimedAt
  // on user.onboarding. v2 success-screen reads this to choose the headline.
  const billing = billingRoute;
  const onboarding = onboardingRoute;
  assert.match(billing + onboarding, /bonusClaimedAt/);
});
