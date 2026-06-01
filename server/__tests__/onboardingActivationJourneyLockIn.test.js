// Onboarding — activation-journey re-framing (2026-05-30) — lock-in
//
// Implements Decisions 1A / 2A / 3A from the approved audit. The wizard
// stays at 7 steps; no new stages, no new settings, no backend changes.
//
//   Step 1 — reframed H1 + subtitle; duplicate card-section label removed.
//   Step 2 — subtitle reframed.
//   Step 3 — alert-channel explainer added above phone input (PR #80
//            verification card and PATCH flow untouched).
//   Step 4 — single-screen Phase 2 expansion: lead-flow + control note
//            + trust line + SMS Claim card (benefit → flow → balance →
//            optional). Primary CTA unchanged.
//   Step 5 — wallet framing line added; trust strip extended; unverifiable
//            marketplace footer removed.
//   Step 7 — one-line aside upgraded to a small SMS Claim card; primary
//            CTA "View matching opportunities →" preserved.
//
// Lock-ins assert on the exec-stripped source so explanatory comments
// don't accidentally satisfy "must not contain" assertions.

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

// ─── Step 1: reframed H1 + subtitle + duplicate label removed ──────────────

test('S1.A — Step 1 H1 reads "Where do your crews start jobs?"', () => {
  assert.match(
    exec,
    /<h1\s+className="ow-h1">\s*Where do your crews start jobs\?\s*<\/h1>/,
    'Step 1 H1 must read the operator-approved question'
  );
});

test('S1.B — Step 1 subtitle reframed to opportunity-coverage language', () => {
  assert.match(
    exec,
    /<p\s+className="ow-sub">\s*We'll only show you opportunities in the areas you serve\.\s*<\/p>/,
    'Step 1 subtitle must read the new copy'
  );
});

test('S1.C — Pre-reframe Step 1 copy must not return', () => {
  assert.doesNotMatch(exec, /Enter your main dispatch location/);
  assert.doesNotMatch(exec, /We'll use this to match move requests near your crew base\./);
});

test('S1.D — Decision 1A: duplicate card-section label is gone', () => {
  // The card section label literally said "Where do your crews start jobs?".
  // After 1A the H1 owns that question, so the <label className="ow-label">
  // for the section must be gone. Only the H1 should carry the phrase.
  const hits = (exec.match(/Where do your crews start jobs\?/g) || []).length;
  assert.equal(hits, 1, 'phrase must appear exactly once (as the Step 1 H1)');
  // And the specific label markup must not include it.
  assert.doesNotMatch(
    exec,
    /<label\s+className="ow-label">\s*Where do your crews start jobs\?\s*<\/label>/,
    'duplicate ow-label section header must be removed'
  );
});

// ─── Step 2: subtitle reframing ────────────────────────────────────────────

test('S2.A — Step 2 subtitle reframed to local+long-distance language', () => {
  assert.match(
    exec,
    /<p\s+className="ow-sub">\s*This helps us send the right local and long-distance opportunities\.\s*<\/p>/,
    'Step 2 subtitle must read the new copy'
  );
});

test('S2.B — Pre-reframe Step 2 copy must not return', () => {
  assert.doesNotMatch(exec, /This narrows the long-distance leads we send you\./);
});

// ─── Step 3: alert-channel explainer ───────────────────────────────────────

test('S3.A — Step 3 explainer lead-in present', () => {
  assert.match(exec, /When a matching homeowner requests a quote:/);
});

test('S3.B — Step 3 lists all three channels (text, email, dashboard)', () => {
  assert.match(exec, />\s*We'll text you\s*</);
  assert.match(exec, />\s*We'll email you\s*</);
  assert.match(exec, />\s*You'll see it in your dashboard\s*</);
});

test('S3.C — PR #80 verify card structure preserved (testids untouched)', () => {
  assert.match(exec, /data-testid="onboarding-verify-confirmed"/);
  assert.match(exec, /data-testid="onboarding-verify-pending"/);
  assert.match(exec, /data-testid="onboarding-verify-inline-cta"/);
});

// ─── Step 4: how-it-works + control note + trust + SMS Claim card ─────────

test('S4.A — Step 4 has all 5 lead-flow items in order', () => {
  // The numbered ordered list must contain the five operator-specified
  // labels in their canonical order.
  const lf = exec.indexOf('Homeowner requests a quote');
  const rv = exec.indexOf('We review the request');
  const al = exec.indexOf('Matching movers receive alerts');
  const un = exec.indexOf('You unlock or claim the lead');
  const cl = exec.indexOf('Call the customer');
  assert.ok(lf > -1 && rv > lf && al > rv && un > al && cl > un,
    'lead-flow items must appear in canonical order on Step 4');
});

test('S4.B — Step 4 control-reassurance note present (operator additional adjustment #2)', () => {
  assert.match(exec, /You decide which leads are worth pursuing\./);
  assert.match(exec, /You're never charged just for receiving alerts\./);
});

test('S4.C — Step 4 trust line includes verified + refund policy', () => {
  assert.match(exec, /We focus on verified homeowner requests\./);
  assert.match(exec, /If a lead qualifies under our refund policy, your balance can be credited back\./);
});

test('S4.D — Step 4 SMS Claim card carries title + Beta chip', () => {
  assert.match(exec, /id="ow-sms-claim-title"[^>]*>\s*Claim leads by text\s*</);
  assert.match(exec, /className="ow-sms-claim-card-beta">Beta</);
});

test('S4.E — Step 4 SMS Claim card section order: benefit → flow → balance → optional', () => {
  // Slice the card body and assert the four signature phrases land in
  // the operator-specified order.
  const cardStart = exec.indexOf('id="ow-sms-claim-title"');
  // The card ends at the activation CTA ("Claim your $50 FREE credit").
  const cardEnd   = exec.indexOf('Claim your $50 FREE credit');
  assert.ok(cardStart > -1 && cardEnd > cardStart, 'SMS Claim card must precede the activation CTA');
  const body = exec.slice(cardStart, cardEnd);

  const benefit = body.indexOf('The fastest way to grab a matching lead');
  const flow    = body.indexOf('Reply <strong>SEND ABCD</strong>');
  const balance = body.indexOf('your available balance must be at least the lead price');
  const optional = body.indexOf('SMS Claim is optional');

  assert.ok(benefit > -1, 'benefit-first paragraph must exist');
  assert.ok(flow > benefit, 'flow paragraph must follow benefit');
  assert.ok(balance > flow, 'balance paragraph must follow flow');
  assert.ok(optional > balance, 'optional disclaimer must come last');
});

test('S4.F — Step 4 SMS Claim balance example uses $42 / $42', () => {
  // Operator vision used these exact numbers; verbatim in the card.
  assert.match(exec, /Example: if a lead costs <strong>\$42<\/strong>, you need at least <strong>\$42<\/strong> available balance to claim it\./);
});

test('S4.G — Step 4 primary CTA "Claim your $50 FREE credit" preserved', () => {
  assert.match(exec, />\s*Claim your \$50 FREE credit\s*</);
});

test('S4.H — Step 4 keeps the existing status checklist (post-setup celebration intact)', () => {
  assert.match(exec, />Service area saved</);
  assert.match(exec, />Alerts ready</);
  assert.match(exec, />Dashboard prepared</);
});

// ─── Step 5: wallet framing + trust strip + marketplace footer removed ────

test('S5.A — Step 5 wallet framing present (operator additional adjustment #3)', () => {
  assert.match(exec, /lead-buying wallet<\/strong>/);
  assert.match(exec, /You pay only when you unlock or claim a lead\./);
  assert.match(exec, /Your balance stays in your account until you use it\./);
});

test('S5.B — Step 5 trust strip extended with "Pay per lead, never per month"', () => {
  assert.match(
    exec,
    /Refundable balance · No subscription · Balance never expires · Pay per lead, never per month/,
    'Step 5 trust strip must include the per-lead clarification'
  );
});

test('S5.C — Step 5 marketplace footer claim is gone', () => {
  // The previous unverifiable claim "Movers are currently activating
  // coverage in your market." must NOT appear anywhere in executable code.
  assert.doesNotMatch(exec, /Movers are currently activating coverage in your market\./);
  // And the wrapper element with that class must be gone too.
  assert.doesNotMatch(exec, /className="ow-marketplace-footer"/);
});

test('S5.D — Step 5 H1/CTA/tier picker untouched', () => {
  assert.match(exec, /<h1\s+className="ow-h1">\s*Ready To Receive Moving Jobs\s*<\/h1>/);
  assert.match(exec, /Includes \$50 bonus/);
  assert.match(exec, /Starter — no bonus included/);
  // Skip CTA copy preserved (already polished in PR #76).
  assert.match(exec, />\s*Browse leads first\s*</);
});

// ─── Step 7: Decision 3A — small SMS Claim card ────────────────────────────

test('S7.A — Step 7 SMS Claim card has title + Beta chip', () => {
  assert.match(exec, /className="ow-success-sms-claim-title">\s*Claim leads by text\s*</);
  // Beta chip reuses .ow-success-beta — preserved class.
  assert.match(exec, /className="ow-success-beta">Beta/);
});

test('S7.B — Step 7 SMS Claim card body explains SEND + first to reply wins', () => {
  assert.match(exec, /Reply <strong>SEND<\/strong> to claim it instantly/);
  assert.match(exec, /first to reply wins/);
});

test('S7.C — Step 7 SMS Claim card footer points at the sidebar', () => {
  assert.match(
    exec,
    /<p\s+className="ow-success-sms-claim-footer">\s*Turn it on anytime from the sidebar\.\s*<\/p>/
  );
});

test('S7.D — Step 7 testid preserved on the upgraded card wrapper', () => {
  assert.match(exec, /data-testid="onboarding-success-sms-claim-aside"/);
});

test('S7.E — Step 7 primary CTA "View matching opportunities →" preserved', () => {
  assert.match(exec, />\s*View matching opportunities →\s*</);
});

// ─── CSS support — all new classes ship ────────────────────────────────────

test('C1. Onboarding.css ships the Step 3 alert-channel explainer classes', () => {
  assert.match(css, /\.ow-alerts-channels\s*\{/);
  assert.match(css, /\.ow-alerts-channels-lead\s*\{/);
  assert.match(css, /\.ow-alerts-channels-list\s*\{/);
  assert.match(css, /\.ow-alerts-channels-tick\s*\{/);
});

test('C2. Onboarding.css ships the Step 4 journey-block classes', () => {
  assert.match(css, /\.ow-journey-block\s*\{/);
  assert.match(css, /\.ow-journey-h2\s*\{/);
  assert.match(css, /\.ow-how-it-works\s*\{/);
  assert.match(css, /\.ow-how-it-works-item\s*\{/);
  assert.match(css, /\.ow-how-num\s*\{/);
  assert.match(css, /\.ow-journey-control\s*\{/);
  assert.match(css, /\.ow-journey-trust\s*\{/);
});

test('C3. Onboarding.css ships the SMS Claim card classes (Step 4 + Step 7)', () => {
  assert.match(css, /\.ow-sms-claim-card\s*\{/);
  assert.match(css, /\.ow-sms-claim-card-title\s*\{/);
  assert.match(css, /\.ow-sms-claim-card-beta\s*\{/);
  assert.match(css, /\.ow-sms-claim-card-section\s*\{/);
  assert.match(css, /\.ow-sms-claim-card-benefit\s*\{/);
  assert.match(css, /\.ow-sms-claim-card-optional\s*\{/);
  assert.match(css, /\.ow-success-sms-claim-card\s*\{/);
  assert.match(css, /\.ow-success-sms-claim-title\s*\{/);
  assert.match(css, /\.ow-success-sms-claim-body\s*\{/);
  assert.match(css, /\.ow-success-sms-claim-footer\s*\{/);
});

test('C4. Onboarding.css ships the Step 5 wallet-framing class', () => {
  assert.match(css, /\.ow-wallet-framing\s*\{/);
});

// ─── Cross-cutting: scope honored (nothing structural changed) ─────────────

test('X1. No new wizard stages — SETUP_STAGES still has 5 entries', () => {
  // Count `id:` entries inside the SETUP_STAGES const literal.
  const block = exec.match(/const\s+SETUP_STAGES\s*=\s*\[[\s\S]+?\];/);
  assert.ok(block, 'SETUP_STAGES literal must exist');
  const ids = block[0].match(/id:\s*\d+/g) || [];
  assert.equal(ids.length, 5, 'SETUP_STAGES must contain exactly 5 stage entries');
});

test('X2. PR #80 phone-verify wiring preserved (handlers + modal mount)', () => {
  assert.match(exec, /function\s+handleVerifySuccess\s*\(\s*\)/);
  assert.match(exec, /function\s+handleVerifyClose\s*\(\s*\)/);
  assert.match(exec, /async\s+function\s+handleInlineVerifyClick\s*\(\s*\)/);
  assert.match(exec, /<VerifyPhoneModal\s+isOpen=\{verifyOpen\}/);
});

test('X3. PR #80 Step 7 testid for the SMS Claim heads-up is preserved (renamed wrapper, same data-testid)', () => {
  assert.match(exec, /data-testid="onboarding-success-sms-claim-aside"/);
});

console.log('\nOnboarding activation-journey lock-in suite — all assertions passed.');
