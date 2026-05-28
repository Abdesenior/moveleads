/**
 * Profile coverage redirect copy fix (PR-D3) lock-in.
 *
 * Before this PR, Profile.jsx contained a green info card directing
 * movers to "Settings → Coverage Areas" to add or update their
 * "Coverage ZIP codes". Two problems:
 *
 *   1. The "Coverage Areas" tab was removed in PR-C1 (2026-05-26).
 *      Movers following the directive landed on a Settings page that
 *      no longer had that tab.
 *   2. ZIP codes are no longer manually managed by movers. CoverageArea
 *      is auto-maintained internally from state preferences in Settings →
 *      Service Areas.
 *
 * PR-D3 rewrites the card with accurate post-PR-C1 copy:
 *   - References "Service Areas" (the current canonical tab)
 *   - References "states you pick up and deliver in" (the actual mental
 *     model movers use post-PR-C1)
 *   - Uses a real react-router <Link> (not static text)
 *
 * What this suite locks in:
 *
 *   A. Stale strings are GONE — no "Coverage ZIP codes" / "Coverage
 *      Areas" / "Set your coverage ZIP codes in Settings" anywhere in
 *      Profile.jsx
 *   B. New copy mentions "Service Area" + pick up + deliver
 *   C. A real <Link to="/dashboard/settings"> is present
 *   D. Audit-trail comment is present
 *   E. PR-D2 outcome stays intact — the SMS phone hint card from the
 *      previous PR is unaffected
 *
 * Pure-Node, no Mongo, no jsdom. Source-level assertions only.
 *
 * Run: `node server/__tests__/profileCoverageCopyFix.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.join(__dirname, '..', '..', 'client', 'src');
const profileSrc = fs.readFileSync(path.join(clientRoot, 'pages', 'dashboard', 'Profile.jsx'), 'utf8');

// Strip JS-style block comments + line comments so we can scan only
// executable / JSX content. Audit-trail comments often reference the
// retired strings on purpose (documentation) — that should NOT trip a
// "stale string" check.
const profileExec = profileSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
  .replace(/\/\/.*$/gm, '');           // line comments

// ── A. Stale strings are gone ───────────────────────────────────────────

test('A1. Profile.jsx no longer mentions "Coverage ZIP codes" in executable content', () => {
  // The phrase "Coverage ZIP codes" was the user-visible framing of the
  // pre-PR-C1 manual ZIP UI. Movers don't manage ZIPs anymore.
  // (Comments mentioning the old name in audit trails are allowed —
  //  we scan profileExec which has comments stripped.)
  assert.doesNotMatch(
    profileExec,
    /Coverage ZIP codes/i,
    'Profile.jsx must not refer to "Coverage ZIP codes" in user-visible content — PR-C1 retired that model'
  );
});

test('A2. Profile.jsx no longer points to "Settings → Coverage Areas" in user-visible content', () => {
  // The "Coverage Areas" tab was removed in PR-C1. Pointing users there
  // is a direct trust hit (the tab does not exist).
  assert.doesNotMatch(
    profileExec,
    /Settings\s*→\s*Coverage Areas/i,
    'Profile.jsx must not point to the removed Coverage Areas tab in user-visible content'
  );
  assert.doesNotMatch(
    profileExec,
    /Coverage Areas/i,
    'No reference to the removed "Coverage Areas" tab name should remain in user-visible content'
  );
});

test('A3. Profile.jsx no longer uses the stale headline "Set your coverage ZIP codes in Settings"', () => {
  assert.doesNotMatch(
    profileExec,
    /Set your coverage ZIP codes in Settings/i,
    'Stale headline must be replaced'
  );
});

// ── B. New copy is accurate to the post-PR-C1 Service Areas model ───────

test('B1. Profile.jsx coverage card mentions "Service Area"', () => {
  assert.match(
    profileSrc,
    /Service Area/,
    'New coverage card must mention Service Area (the canonical post-PR-C1 surface)'
  );
});

test('B2. Profile.jsx coverage card explains pick up + deliver as the mental model', () => {
  assert.match(profileSrc, /pick up/i, 'Coverage card should mention "pick up"');
  assert.match(profileSrc, /deliver/i, 'Coverage card should mention "deliver"');
});

// ── C. Real Link to /dashboard/settings ────────────────────────────────

test('C1. Coverage card uses a real react-router <Link>, not static text', () => {
  // The <Link> import was added in PR-D2 for the SMS hint; this PR adds
  // a second <Link> to the same target. Pin the existence of at least
  // two Link references in Profile.jsx.
  assert.match(
    profileSrc,
    /import\s+\{\s*Link\s*\}\s+from\s+['"]react-router-dom['"]/,
    'react-router Link must still be imported'
  );
  const linkCount = (profileSrc.match(/<Link\s+to=["']\/dashboard\/settings["']/g) || []).length;
  assert.ok(
    linkCount >= 2,
    `Expected at least 2 <Link to="/dashboard/settings"> elements in Profile.jsx (SMS hint + coverage card), found ${linkCount}`
  );
});

test('C2. Coverage card link text mentions Service Areas explicitly', () => {
  // The link should self-describe its destination — "Open Settings →
  // Service Areas" or similar. Avoids the prior pattern of pointing at
  // a tab name that didn't exist.
  assert.match(
    profileSrc,
    /Service Areas/,
    'New link should mention "Service Areas" (the canonical tab name)'
  );
});

// ── D. Audit-trail comment is present ───────────────────────────────────

test('D1. Profile.jsx contains the PR-D3 audit-trail comment', () => {
  assert.match(
    profileSrc,
    /PR-D3:\s*coverage redirect notice rewritten/i,
    'Audit-trail comment block must explain the PR-D3 cleanup'
  );
});

// ── E. PR-D2 outcome unchanged ──────────────────────────────────────────

test('E1. SMS phone hint card from PR-D2 is still present', () => {
  // The hint mentioning the SMS alert phone number must remain — this
  // PR only touches the coverage card.
  assert.match(profileSrc, /SMS alert phone number/i);
  assert.match(profileSrc, /PR-D2:\s*phone removed from this form/i,
    'PR-D2 audit-trail comment must still be present');
});

test('E2. Profile.jsx still does not render a phone form field', () => {
  // Regression guard: PR-D2 dropped phone; this PR must not bring it
  // back accidentally.
  assert.doesNotMatch(
    profileSrc,
    /<input[^>]*name=["']phone["']/,
    'Profile.jsx must not contain a <input name="phone"> element'
  );
});

console.log('Profile coverage copy fix (PR-D3) tests scheduled.');
