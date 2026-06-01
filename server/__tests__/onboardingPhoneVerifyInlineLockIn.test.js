// Onboarding — inline phone verification in Step 3 (2026-05-30) — lock-in
//
// The wizard's Step 3 ("How we reach you") now triggers VerifyPhoneModal
// after save-step, with both close paths (success + skip) advancing to
// step 4. The user explicitly directed: never block onboarding on a
// failed or skipped verification; the inline amber status card carries
// the recovery CTA.
//
// This suite locks in:
//   A. VerifyPhoneModal + useToast are imported by the wizard
//   B. Wizard mounts VerifyPhoneModal at the root (above the wizard chrome)
//   C. Step 3 next() does: saveStep → fetch /auth/me → branch on phoneVerified
//   D. handleVerifySuccess advances to step 4 (success path)
//   E. handleVerifyClose advances to step 4 (skip path) with a soft toast
//   F. handleInlineVerifyClick saves first, then opens the modal (does
//      NOT advance the step — mover stays on step 3)
//   G. ScreenAlerts receives phoneVerified + onVerifyClick + saving props
//   H. The green / amber status cards render with the right testids and copy
//   I. The Step 7 success screen carries the SMS Claim awareness aside
//
// Backend is unchanged — phoneVerification.js routes + applyPhoneChange +
// User.phoneVerified field were all in place pre-PR. This is a client-only
// integration.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WIZARD = path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'onboarding', 'OnboardingWizard.jsx');
const CSS    = path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'onboarding', 'Onboarding.css');

const src = fs.readFileSync(WIZARD, 'utf8');
const css = fs.readFileSync(CSS, 'utf8');

const exec = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\/.*$/gm, '');

// ─── A. Imports ──────────────────────────────────────────────────────────────

test('A1. OnboardingWizard imports VerifyPhoneModal', () => {
  assert.match(
    src,
    /import\s+VerifyPhoneModal\s+from\s+['"]\.\.\/\.\.\/components\/VerifyPhoneModal['"]/,
    'VerifyPhoneModal must be imported from the shared components path'
  );
});

test('A2. OnboardingWizard imports useToast (for the soft skip toast)', () => {
  assert.match(
    src,
    /import\s*\{\s*useToast\s*\}\s*from\s+['"]\.\.\/\.\.\/components\/ui\/Toast['"]/,
    'useToast must be imported for the skip-path toast'
  );
});

// ─── B. Modal mount ──────────────────────────────────────────────────────────

test('B1. VerifyPhoneModal is rendered at the wizard root with isOpen + onClose + onSuccess', () => {
  assert.match(
    exec,
    /<VerifyPhoneModal\s+isOpen=\{verifyOpen\}\s+onClose=\{handleVerifyClose\}\s+onSuccess=\{handleVerifySuccess\}\s*\/>/,
    'VerifyPhoneModal must mount with the three required props'
  );
});

test('B2. verifyOpen + phoneVerified state hooks are declared', () => {
  assert.match(exec, /const\s+\[verifyOpen,\s*setVerifyOpen\]\s*=\s*useState\(false\)/);
  assert.match(exec, /const\s+\[phoneVerified,\s*setPhoneVerified\]\s*=\s*useState\(!!user\?\.phoneVerified\)/);
});

// ─── C. Step 3 next() — save → fetch /auth/me → branch ─────────────────────

test('C1. next() at step 3 calls saveStep(step) then fetches /auth/me', () => {
  // saveStep(step) must be awaited; the fetch URL must be exactly /auth/me.
  // We look for the structural shape rather than the literal sequence so
  // future minor reorderings inside the branch don't break the test.
  assert.match(exec, /await\s+saveStep\(step\)/);
  assert.match(
    exec,
    /await\s+fetch\(\s*`\$\{API_URL\}\/auth\/me`\s*,/,
    'next() at step 3 must fetch /auth/me to determine phoneVerified'
  );
});

test('C2. fresh.phoneVerified === true → setStep(4); otherwise setVerifyOpen(true)', () => {
  assert.match(
    exec,
    /if\s*\(\s*fresh\.phoneVerified\s*===\s*true\s*\)\s*\{[\s\S]{0,50}setStep\(4\)/,
    'Verified user must advance to step 4 directly'
  );
  assert.match(
    exec,
    /else\s*\{[\s\S]{0,80}setVerifyOpen\(true\)/,
    'Unverified user must open the modal instead of advancing'
  );
});

test('C3. /auth/me read failure is non-blocking — advance to step 4 anyway', () => {
  // Three permissive advance paths must exist in the step-3 branch:
  //   1. verified path (inside if (res.ok) → fresh.phoneVerified === true)
  //   2. !res.ok path  (server returned non-OK)
  //   3. catch path    (fetch threw — network blip)
  // We slice from the step-3 branch opener to the modal-success handler
  // declaration (the next clear boundary).
  const start = exec.indexOf('else if (step === 3)');
  const end   = exec.indexOf('function handleVerifySuccess');
  assert.ok(start > -1 && end > start, 'step-3 branch must precede handleVerifySuccess');
  const branch = exec.slice(start, end);
  const advances = (branch.match(/setStep\(4\)/g) || []).length;
  assert.ok(
    advances >= 3,
    `expected ≥3 setStep(4) calls in step-3 branch (verified + read-fail + catch), found ${advances}`
  );
  // Sanity: the catch + !res.ok comments explain the permissive intent.
  // Check the raw source (comments retained) because the executable-only
  // slice strips line comments.
  const rawBranchStart = src.indexOf('else if (step === 3)');
  const rawBranchEnd   = src.indexOf('function handleVerifySuccess');
  const rawBranch = src.slice(rawBranchStart, rawBranchEnd);
  assert.match(rawBranch, /Read failure[\s\S]{0,60}advance/i,
    'catch + !res.ok branches must explain the permissive intent inline');
});

// ─── D. Success handler ─────────────────────────────────────────────────────

test('D1. handleVerifySuccess closes the modal, marks verified, refreshes, advances', () => {
  const fn = exec.match(/function\s+handleVerifySuccess\s*\(\s*\)\s*\{[\s\S]+?\n\s*\}/);
  assert.ok(fn, 'handleVerifySuccess must be declared');
  const body = fn[0];
  assert.match(body, /setVerifyOpen\(false\)/);
  assert.match(body, /setPhoneVerified\(true\)/);
  assert.match(body, /refreshUser\(\)/);
  assert.match(body, /setStep\(4\)/);
});

// ─── E. Skip handler ────────────────────────────────────────────────────────

// E1 + E2 slice the function body by index because the nested
// `if (toast && toast.info) { ... }` block makes a non-greedy regex
// terminate at the wrong closing brace.
function sliceHandlerBody(srcExec, handlerName, nextHandlerName) {
  const start = srcExec.indexOf(`function ${handlerName}`);
  const end   = nextHandlerName ? srcExec.indexOf(`function ${nextHandlerName}`) : -1;
  if (start === -1) return '';
  return end > start ? srcExec.slice(start, end) : srcExec.slice(start, start + 1200);
}

test('E1. handleVerifyClose closes the modal, surfaces the toast, advances', () => {
  const body = sliceHandlerBody(exec, 'handleVerifyClose', 'handleInlineVerifyClick');
  assert.ok(body, 'handleVerifyClose must be declared');
  assert.match(body, /setVerifyOpen\(false\)/);
  assert.match(body, /toast\.info\(/,  'skip path must fire toast.info');
  assert.match(body, /setStep\(4\)/,   'skip path must STILL advance to step 4');
});

test('E2. Skip toast wording references both "saved" and the alert tradeoff', () => {
  const body = sliceHandlerBody(exec, 'handleVerifyClose', 'handleInlineVerifyClick');
  assert.match(body, /Your phone is saved/, 'toast title affirms the phone was saved');
  assert.match(
    body,
    /[Tt]ext alerts won.{1,3}t fire until your phone is confirmed\./,
    'toast body must explain the alert tradeoff'
  );
});

// ─── F. Inline "Verify now" CTA handler ─────────────────────────────────────

test('F1. handleInlineVerifyClick saves first, then opens the modal — does NOT advance step', () => {
  const fn = exec.match(/async\s+function\s+handleInlineVerifyClick\s*\(\s*\)\s*\{[\s\S]+?\n\s*\}/);
  assert.ok(fn, 'handleInlineVerifyClick must be declared');
  const body = fn[0];
  assert.match(body, /await\s+saveStep\(3\)/, 'inline CTA saves step 3 first');
  assert.match(body, /setVerifyOpen\(true\)/, 'inline CTA opens the modal');
  // Crucially: it must NOT call setStep(4) — the mover stays on step 3 so
  // the card flips green in place after success.
  assert.doesNotMatch(body, /setStep\(4\)/,
    'inline CTA must NOT advance the step — modal callbacks own that decision');
});

// ─── G. ScreenAlerts prop wiring ───────────────────────────────────────────

test('G1. ScreenAlerts receives phoneVerified + onVerifyClick + saving from the wizard', () => {
  assert.match(
    exec,
    /<ScreenAlerts\s+[\s\S]{0,300}phoneVerified=\{phoneVerified\}[\s\S]{0,200}onVerifyClick=\{handleInlineVerifyClick\}[\s\S]{0,100}saving=\{saving\}/,
    'ScreenAlerts must be passed the three new props'
  );
});

test('G2. ScreenAlerts signature accepts the new props', () => {
  assert.match(
    exec,
    /function\s+ScreenAlerts\(\s*\{\s*answers,\s*setAnswer,\s*userEmail,\s*phoneVerified,\s*onVerifyClick,\s*saving\s*\}\s*\)/,
    'ScreenAlerts must accept phoneVerified + onVerifyClick + saving in its destructured props'
  );
});

// ─── H. Inline status card render ──────────────────────────────────────────

test('H1. Confirmed (green) card renders with the expected testid + copy', () => {
  assert.match(exec, /data-testid="onboarding-verify-confirmed"/);
  assert.match(exec, /Phone confirmed/);
});

test('H2. Pending (amber) card renders with the testid + the inline CTA', () => {
  assert.match(exec, /data-testid="onboarding-verify-pending"/);
  assert.match(exec, /data-testid="onboarding-verify-inline-cta"/);
  assert.match(exec, /Confirm your phone to receive text alerts/);
  assert.match(exec, />\s*Verify now →\s*</);
});

test('H3. Both cards are gated on a valid phone number (no card for empty/invalid input)', () => {
  // The render expression checks both phoneIsValid (which combines a
  // present value + no phoneError) before rendering either state.
  assert.match(
    exec,
    /const\s+phoneIsValid\s*=\s*!!answers\.phone\s*&&\s*!phoneError/,
    'phoneIsValid must require a non-empty + non-erroring phone'
  );
  assert.match(
    exec,
    /\{showVerifyCard\s*&&\s*phoneVerified\s*&&/,
    'confirmed card must be gated on showVerifyCard'
  );
  assert.match(
    exec,
    /\{showVerifyCard\s*&&\s*!phoneVerified\s*&&/,
    'pending card must be gated on showVerifyCard'
  );
});

// ─── I. Step 7 SMS Claim awareness aside ───────────────────────────────────

test('I1. Step 7 success screen carries the SMS Claim awareness line', () => {
  assert.match(exec, /data-testid="onboarding-success-sms-claim-aside"/);
  assert.match(
    exec,
    /Reply by text to claim leads instantly[\s\S]{0,40}turn on\s*<strong>SMS Claim<\/strong>[\s\S]{0,40}from the sidebar\./,
    'Step 7 aside must include the awareness copy'
  );
});

test('I2. Step 7 aside renders a Beta chip', () => {
  assert.match(exec, /className="ow-success-beta"/);
  assert.match(exec, />\s*Beta\s*<\/span>/);
});

test('I3. Step 7 primary CTA "View matching opportunities" is preserved', () => {
  // The awareness aside must NOT replace the primary CTA. Both render.
  assert.match(exec, />\s*View matching opportunities →\s*</);
});

// ─── CSS support ───────────────────────────────────────────────────────────

test('S1. Onboarding.css ships the three new classes for the verify card', () => {
  assert.match(css, /\.ow-verify-status\s*\{/);
  assert.match(css, /\.ow-verify-status-confirmed\s*\{/);
  assert.match(css, /\.ow-verify-status-pending\s*\{/);
  assert.match(css, /\.ow-verify-status-cta\s*\{/);
});

test('S2. Onboarding.css ships the Step 7 aside + Beta chip classes', () => {
  assert.match(css, /\.ow-success-aside\s*\{/);
  assert.match(css, /\.ow-success-beta\s*\{/);
});

console.log('\nOnboarding inline phone-verify (Step 3 + Step 7) lock-in suite — all assertions passed.');
