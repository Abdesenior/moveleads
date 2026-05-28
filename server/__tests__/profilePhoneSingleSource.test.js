/**
 * Profile phone single-source-of-truth (PR-D2) lock-in.
 *
 * Before this PR, `User.phone` was editable in two surfaces:
 *   1. /dashboard/profile         — `client/src/pages/dashboard/Profile.jsx`
 *   2. /dashboard/settings (Profile tab) — `client/src/pages/dashboard/Settings.jsx`
 * Each had its own local state + Save button, both writing the same field
 * through `PUT /api/users/:id`. No real-time sync between the two UIs;
 * last save wins; the other surface shows stale UI until reload.
 *
 * Phone drives SMS dispatch + Twilio Verify — staleness here is a direct
 * trust hit (mover might think they updated their alert phone, but the
 * other UI shows the old number and the verification badge is in a third
 * place entirely).
 *
 * PR-D2 collapses the dual surface to one: Settings → Profile tab is the
 * sole authoritative place. Profile page handles company-identity only.
 *
 * What this suite locks in:
 *
 *   A. Profile.jsx no longer renders a phone input
 *   B. Profile.jsx formData no longer carries phone in state or payload
 *   C. Profile.jsx surfaces a clear hint pointing to Settings → Profile
 *      for SMS alert phone management
 *   D. Settings.jsx STILL renders the phone field + verification badge
 *      (Settings remains the canonical surface)
 *   E. Backend PUT /api/users/:id path is untouched — the phone-change
 *      invariant + verification reset continue to work whether the
 *      request comes from Settings OR a future caller
 *
 * Pure-Node, no Mongo, no jsdom. Source-level assertions only.
 *
 * Run: `node server/__tests__/profilePhoneSingleSource.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.join(__dirname, '..', '..', 'client', 'src');
const profileSrc  = fs.readFileSync(path.join(clientRoot, 'pages', 'dashboard', 'Profile.jsx'),  'utf8');
const settingsSrc = fs.readFileSync(path.join(clientRoot, 'pages', 'dashboard', 'Settings.jsx'), 'utf8');
const usersRouteSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'users.js'), 'utf8');

// ── A. Profile.jsx no longer renders a phone input ──────────────────────

test('A1. Profile.jsx no longer has a Phone Number form field', () => {
  // Pin the absence of the input. The label "Phone Number" was unique
  // to this control on the page.
  assert.doesNotMatch(
    profileSrc,
    /<label className="input-label">Phone Number<\/label>/,
    'Profile.jsx must not render a "Phone Number" form field'
  );
  // Defensive: no <input name="phone" anywhere
  assert.doesNotMatch(
    profileSrc,
    /<input[^>]*name=["']phone["']/,
    'Profile.jsx must not contain an <input name="phone"> element'
  );
});

// ── B. State + payload no longer carry phone ────────────────────────────

test('B1. Profile.jsx formData initial state does not include phone', () => {
  // Locate the useState({ ... }) call that initializes formData and
  // assert phone is not inside it. The earlier shape included
  // `phone: user?.phone || ''`.
  const formDataInit = profileSrc.match(
    /const \[formData,\s*setFormData\]\s*=\s*useState\(\{[\s\S]*?\}\);/
  );
  assert.ok(formDataInit, 'formData useState initializer must be findable');
  assert.doesNotMatch(
    formDataInit[0],
    /\bphone\s*:/,
    'formData initial state must not carry phone after PR-D2'
  );
});

test('B2. Profile.jsx does not reference formData.phone anywhere', () => {
  assert.doesNotMatch(
    profileSrc,
    /formData\.phone\b/,
    'No code path in Profile.jsx may still read formData.phone'
  );
});

// ── C. Hint to Settings is present ──────────────────────────────────────

test('C1. Profile.jsx surfaces a hint pointing to Settings → Profile for phone management', () => {
  assert.match(
    profileSrc,
    /SMS alert phone number/i,
    'Hint copy must mention the SMS alert phone number'
  );
  // The link is a react-router Link to /dashboard/settings — assert the
  // import + the destination.
  assert.match(
    profileSrc,
    /import\s+\{\s*Link\s*\}\s+from\s+['"]react-router-dom['"]/,
    'react-router Link must be imported'
  );
  assert.match(
    profileSrc,
    /<Link\s+to=["']\/dashboard\/settings["']/,
    'Hint must include a <Link to="/dashboard/settings">'
  );
});

test('C2. Audit-trail comment is present in Profile.jsx', () => {
  assert.match(
    profileSrc,
    /PR-D2:\s*phone removed from this form/i,
    'Audit-trail comment must remain so future contributors understand why phone is missing here'
  );
});

// ── D. Settings.jsx remains the canonical phone surface ─────────────────

test('D1. Settings.jsx still renders the SMS Alert Phone Number field', () => {
  // The label + state variable from PR-C1/C2/C3 era — must still be
  // present in Settings → Profile tab.
  assert.match(
    settingsSrc,
    /SMS Alert Phone Number/,
    'Settings → Profile tab must still render the "SMS Alert Phone Number" label'
  );
  assert.match(
    settingsSrc,
    /\bprofilePhone\b/,
    'Settings.jsx must still carry the profilePhone state variable'
  );
});

test('D2. Settings.jsx still wires the phone field to PUT /api/users/:id', () => {
  // The saveProfile handler in Settings.jsx sends a JSON body that
  // includes the trimmed phone value. Pin its shape (loosely so layout
  // changes don't break the test).
  assert.match(
    settingsSrc,
    /phone:\s*profilePhone\.trim\(\)/,
    'Settings saveProfile must still include phone: profilePhone.trim() in the PUT body'
  );
});

test('D3. Settings.jsx still renders the phone verification badge + Verify button', () => {
  // The verification UX (badge + modal) is the load-bearing context that
  // pairs with the phone field — moving phone out of Profile.jsx is only
  // safe if this stays here.
  assert.match(settingsSrc, /\bphoneVerified\b/);
  assert.match(settingsSrc, /VerifyPhoneModal/);
  assert.match(
    settingsSrc,
    /(Verify Phone|Re-verify)/,
    'Settings must still render the Verify Phone / Re-verify button'
  );
});

// ── E. Backend phone-change invariant untouched ─────────────────────────

test('E1. Server PUT /api/users/:id still applies the phone-change invariant', () => {
  // The unified service-area handler at server/routes/users.js handles
  // phone normalization + verification reset on phone change via
  // applyPhoneChange(). This PR is UI-only; the invariant must remain
  // intact so any caller (Settings or future) gets the same behavior.
  assert.match(
    usersRouteSrc,
    /applyPhoneChange/,
    'users.js must still import / call applyPhoneChange for the phone-change invariant'
  );
  assert.match(
    usersRouteSrc,
    /normalizeUSDigits/,
    'users.js must still normalize phone digits at the boundary'
  );
});

test('E2. Server PUT handler still accepts phone in the request body', () => {
  // The handler reads `safeBody.phone` (after stripping protected fields)
  // and the phone-change branch fires on 'phone' in safeBody.
  assert.match(
    usersRouteSrc,
    /['"]phone['"]\s+in\s+safeBody/,
    "users.js must still gate the phone-change branch on `'phone' in safeBody`"
  );
});

console.log('Profile phone single-source-of-truth (PR-D2) tests scheduled.');
