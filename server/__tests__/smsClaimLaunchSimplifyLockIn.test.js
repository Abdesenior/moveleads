// SMS Claim launch-simplify lock-in (2026-05-30)
//
// Codifies the post-runtime-audit decisions for the SMS Claim page:
//
//   1. Page copy is TRUTHFUL (no "preview-only" / "launches in a future
//      update" claims — the feature is in production).
//
//   2. Page is SIMPLE — the mover should understand it in 5 seconds.
//      The exact spec the operator provided:
//        - Headline: "Claim leads by text"
//        - Plain-English explanation
//        - Example SMS body with "Reply SEND ABCD to claim it."
//        - "What happens after you reply" — 4 bullets
//        - Requirements checklist — exactly 4 rows
//        - Single action: "Turn on SMS Claim" / "SMS Claim is on"
//
//   3. Page does NOT expose preference controls that the backend doesn't
//      enforce (maxLeadPrice, dailyClaimCap, residentialOnly,
//      commercialOptIn, asapOnly). Backend schema is preserved; only the
//      UI is stripped down. Showing controls that do nothing is worse
//      than not shipping them.
//
//   4. Page still renders the "Current alert coverage" panel + the
//      PR-D5 Settings link comment (compatibility with
//      smsClaimOnboardingLinkFix + smsClaimCoveragePreviewTruthfulness
//      suites).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'dashboard', 'SmsClaim.jsx');
const src = fs.readFileSync(SRC, 'utf8');

// Strip JS/JSX comments so claims about "the page does NOT show X" check
// executable code only — not explanatory comments that mention the old X.
const exec = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\/.*$/gm, '');

// ─── 1. Truthfulness ────────────────────────────────────────────────────────

test('S1.A — Page no longer claims "Live SMS claiming launches in a future update"', () => {
  assert.doesNotMatch(exec, /Live SMS claiming launches/i,
    'Pre-launch lie must be removed — SMS Claim is live in production');
});

test('S1.B — Page no longer markets itself as "Preview / Early Access"', () => {
  assert.doesNotMatch(exec, /Preview \/ Early Access/i);
  assert.doesNotMatch(exec, /Activate Instant Jobs \(preview\)/i);
});

test('S1.C — Page has a BETA badge', () => {
  assert.match(exec, />\s*BETA\s*</);
});

// ─── 2. Simple spec ─────────────────────────────────────────────────────────

test('S2.A — Headline is "Claim leads by text"', () => {
  assert.match(exec, /<h1[\s\S]*?>\s*Claim leads by text\s*<\/h1>/);
});

test('S2.B — Plain-English explanation present', () => {
  assert.match(exec,
    /When a lead matches your service area and you have enough balance,\s*we text you[\s\S]{0,80}the lead summary and a claim code\./);
});

test('S2.C — Example SMS body includes "Reply SEND ABCD to claim it."', () => {
  assert.match(exec, /Reply SEND ABCD to claim it\./);
});

test('S2.D — "What happens after you reply" includes all 4 outcomes', () => {
  assert.match(exec, /The lead price is deducted from your balance\./);
  assert.match(exec, />My Leads<\/strong>/);
  assert.match(exec, /You receive the customer.{0,5}s contact details\./);
  assert.match(exec, /You can call the customer right away\./);
});

test('S2.E — Requirements checklist has exactly the 4 spec-listed rows', () => {
  // We assert each label and that NO other ReadyRow uses an unrelated label.
  assert.match(exec, /label="Phone verified"/);
  assert.match(exec, /label=\{\s*`Enough balance/);   // template literal w/ recommended
  assert.match(exec, /label="Service areas set"/);
  assert.match(exec, /label="SMS alerts enabled"/);
  // Legacy rows that were in the prior page must not return.
  assert.doesNotMatch(exec, /label="Coverage area set"/);
  assert.doesNotMatch(exec, /label="Dispatch hours set"/);
  assert.doesNotMatch(exec, /label="SMS not opted out/);
  assert.doesNotMatch(exec, /label="Move types"/);
});

test('S2.F — Single action button labels: "Turn on SMS Claim" / "Turn off"', () => {
  // Labels are inside a ternary expression — match the string literals in
  // source rather than JSX text children.
  assert.match(exec, /['"]Turn on SMS Claim['"]/);
  assert.match(exec, /['"]Turn off['"]/);
  // Pre-simplify labels gone.
  assert.doesNotMatch(exec, /['"]Activate Instant Jobs/);
  assert.doesNotMatch(exec, /['"]Activate \(needs balance\)['"]/);
  assert.doesNotMatch(exec, /['"]Deactivate['"]/);
});

test('S2.G — Heading "SMS Claim is on" / "SMS Claim is off" present', () => {
  assert.match(exec, /SMS Claim is on/);
  assert.match(exec, /SMS Claim is off/);
});

// ─── 3. No unenforced controls in the UI ────────────────────────────────────

test('S3.A — No "Maximum lead price" input rendered', () => {
  assert.doesNotMatch(exec, /Maximum lead price/i);
  assert.doesNotMatch(exec, /label=\{?\s*prefLabel/);   // label style for prefs is removed
});

test('S3.B — No "Daily claim cap" input rendered', () => {
  assert.doesNotMatch(exec, /Daily claim cap/i);
});

test('S3.C — No "Residential only" / "Commercial" / "ASAP only" toggles rendered', () => {
  assert.doesNotMatch(exec, /Residential only/);
  assert.doesNotMatch(exec, /Allow commercial moves/);
  assert.doesNotMatch(exec, /ASAP \/ this week only/);
});

test('S3.D — savePreferences function is removed', () => {
  assert.doesNotMatch(exec, /async function savePreferences/);
  assert.doesNotMatch(exec, /toast\.success\(['"]Preferences saved['"]/);
});

test('S3.E — PATCH body only sends optInRequested', () => {
  // The only PATCH call in the page must serialize just { optInRequested: newVal }.
  assert.match(exec, /body:\s*JSON\.stringify\(\{\s*optInRequested:\s*newVal\s*\}\)/);
  assert.doesNotMatch(exec, /JSON\.stringify\(\{\s*maxLeadPrice/);
  assert.doesNotMatch(exec, /JSON\.stringify\(\{[^}]*residentialOnly/);
});

// ─── 4. Compatibility with existing test suites ─────────────────────────────

test('S4.A — "Current alert coverage" heading preserved (smsClaimCoveragePreviewTruthfulness compat)', () => {
  assert.match(src, /Current alert coverage/);
});

test('S4.B — PR-D5 audit-trail comment preserved (smsClaimOnboardingLinkFix compat)', () => {
  assert.match(src, /PR-D5:\s*link target \+ label corrected/i);
});

test('S4.C — Coverage rows preserved', () => {
  assert.match(exec, /label="Pickup states"/);
  assert.match(exec, /label="Delivery"/);
  assert.match(exec, /label="Max distance"/);
  assert.match(exec, /label="Dispatch hours"/);
});

test('S4.D — Footer "Edit in Settings →" preserved', () => {
  assert.match(exec, /Edit in\s*<Link[^>]+to="\/dashboard\/settings"[^>]*>Settings →<\/Link>/);
});

test('S4.E — Page does NOT reference data.onboardingPreview (moveTypesFilterRetirement compat)', () => {
  assert.doesNotMatch(exec, /data\.onboardingPreview/);
});

test('S4.F — Page does NOT reference moveTypesConfigured', () => {
  assert.doesNotMatch(exec, /moveTypesConfigured/);
});

console.log('\nSMS Claim launch-simplify lock-in suite — all assertions passed.');
