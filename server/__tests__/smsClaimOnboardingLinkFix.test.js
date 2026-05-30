/**
 * SmsClaim onboarding link fix (PR-D5) lock-in.
 *
 * Before this PR, the SmsClaim page (`/dashboard/sms-claim`) had a small
 * footer link under the "Coverage & alerts (from onboarding)" section:
 *
 *   Manage in the [Onboarding wizard →](/dashboard/profile)
 *
 * Two problems:
 *   1. The link target was `/dashboard/profile` — the Profile page.
 *      The actual Onboarding wizard is mounted in DashboardLayout as a
 *      modal, NOT at /dashboard/profile.
 *   2. The data displayed above (primary market, coverage mode,
 *      dispatch hours) is editable in SETTINGS, not Profile.
 *
 * The mover would click expecting a setup flow, land on a company-
 * identity form instead, and be unable to change the values they were
 * looking at.
 *
 * PR-D5 aligns label + destination: link now says "Edit in Settings →"
 * and points to /dashboard/settings.
 *
 * What this suite locks in:
 *
 *   A. Old misleading label "Onboarding wizard" is gone in user-visible
 *      content (audit-trail comments can still mention the prior text)
 *   B. The link target is /dashboard/settings, not /dashboard/profile
 *   C. The new label mentions Settings
 *   D. Audit-trail comment is present
 *   E. The surrounding section (Coverage & alerts from onboarding) is
 *      preserved
 *
 * Pure-Node, no Mongo, no jsdom. Source-level assertions only.
 *
 * Run: `node server/__tests__/smsClaimOnboardingLinkFix.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.join(__dirname, '..', '..', 'client', 'src');
const smsClaimSrc = fs.readFileSync(path.join(clientRoot, 'pages', 'dashboard', 'SmsClaim.jsx'), 'utf8');

// Strip JS comments so audit-trail mentions of retired strings don't
// false-positive when we scan for them.
const smsClaimExec = smsClaimSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

// Isolate the alert-coverage section so the assertions are scoped to
// the footer link we're fixing — there are other Link elements on the
// page (Settings link, Add Funds link, etc.).
//
// 2026-05-29 — the section heading was originally "Coverage & alerts
// (from onboarding)" when PR-D5 shipped; a later cleanup (post-PR-C1
// service-area unification) renamed it to "Current alert coverage" and
// rewrote the rows to read canonical pickup/delivery/maxDistance fields
// directly. The PR-D5 invariant (link target + label) is unaffected by
// the rename; the test is updated to find the renamed section.
const sectionMatch =
  smsClaimExec.match(/Current alert coverage[\s\S]*?<\/section>/) ||
  smsClaimExec.match(/Coverage & alerts \(from onboarding\)[\s\S]*?<\/section>/);

// ── A. Old misleading label gone ────────────────────────────────────────

test('A1. SmsClaim alert-coverage footer no longer says "Onboarding wizard"', () => {
  assert.ok(sectionMatch, 'Alert-coverage section must be findable');
  assert.doesNotMatch(
    sectionMatch[0],
    /Onboarding wizard/i,
    'The footer link under the alert-coverage section must no longer label itself "Onboarding wizard"'
  );
});

// ── B. Link target points to /dashboard/settings, not /dashboard/profile ─

test('B1. The alert-coverage footer link points to /dashboard/settings', () => {
  assert.ok(sectionMatch, 'Alert-coverage section must be findable');
  // The section must contain a Link to /dashboard/settings
  assert.match(
    sectionMatch[0],
    /<Link\s+to=["']\/dashboard\/settings["']/,
    'Footer link must point at /dashboard/settings (where the data is actually editable)'
  );
});

test('B2. The alert-coverage footer no longer points to /dashboard/profile', () => {
  assert.ok(sectionMatch, 'Alert-coverage section must be findable');
  assert.doesNotMatch(
    sectionMatch[0],
    /<Link\s+to=["']\/dashboard\/profile["']/,
    'Footer link must not point at /dashboard/profile (Profile page is for company identity, not these fields)'
  );
});

// ── C. New label mentions Settings ──────────────────────────────────────

test('C1. The alert-coverage footer mentions "Settings"', () => {
  assert.ok(sectionMatch, 'Alert-coverage section must be findable');
  assert.match(
    sectionMatch[0],
    /Settings/,
    'Footer label must mention "Settings" so the destination matches the text'
  );
});

// ── D. Audit-trail comment is present ───────────────────────────────────

test('D1. SmsClaim.jsx contains the PR-D5 audit-trail comment', () => {
  assert.match(
    smsClaimSrc,
    /PR-D5:\s*link target \+ label corrected/i,
    'Audit-trail comment must explain the PR-D5 cleanup'
  );
});

// ── E. Surrounding section preserved ────────────────────────────────────

test('E1. The alert-coverage section heading still exists', () => {
  // The original PR-D5 heading was "Coverage & alerts (from onboarding)".
  // Post-PR-C1 service-area unification renamed it to "Current alert
  // coverage". Accept either — the invariant PR-D5 locked was the
  // presence of SOME alert-coverage section the footer link sits under.
  const ok =
    /Current alert coverage/.test(smsClaimSrc) ||
    /Coverage & alerts \(from onboarding\)/.test(smsClaimSrc);
  assert.ok(ok,
    'Alert-coverage section heading must be preserved (either current "Current alert coverage" or legacy "Coverage & alerts (from onboarding)") — only the footer link is changed by PR-D5');
});

test('E2. The coverage preview shows only Pickup states + Delivery (2026-05-30 visual polish)', () => {
  // 2026-05-30 — Visual-polish PR reduced the coverage panel from four rows
  // (pickup, delivery, max distance, dispatch hours) to TWO (pickup,
  // delivery). The operator's directive: do not display values that aren't
  // sourced from real settings — Max distance + Dispatch hours rendered
  // as "—" when unset, which felt invented. Backend payload + Settings UI
  // are unchanged; only the SmsClaim surface stopped reading those fields.
  //
  // What this test now guarantees:
  //   - Pickup + Delivery rows are present (the load-bearing SMS coverage)
  //   - Max distance + Dispatch hours rows are absent
  //   - Legacy onboarding-wizard labels stay out too (PR-C1 unchanged)
  const present = ['Pickup states', 'Delivery'];
  for (const label of present) {
    assert.ok(
      new RegExp(`label="${label}"`).test(smsClaimSrc),
      `Coverage row "${label}" must remain rendered`
    );
  }
  const removed = ['Max distance', 'Dispatch hours', 'Primary market', 'Coverage radius', 'Coverage mode'];
  for (const label of removed) {
    assert.ok(
      !new RegExp(`label="${label}"`).test(smsClaimSrc),
      `Coverage row "${label}" must not be rendered on the SmsClaim page`
    );
  }
});

test('E3. The post-PR-C3/C4 row removals (Alert channels, Move types) stay removed', () => {
  // Sanity: this PR must not accidentally re-introduce the rows that
  // PR-C3 and PR-C4 explicitly removed.
  assert.doesNotMatch(smsClaimExec, /label="Alert channels"/);
  assert.doesNotMatch(smsClaimExec, /label="Move types"/);
});

console.log('SmsClaim onboarding link fix (PR-D5) tests scheduled.');
