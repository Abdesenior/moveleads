/**
 * Dispatch Hours Settings (PR-C2) lock-in.
 *
 * Three responsibilities:
 *
 *   A. VALIDATOR — every edge case of the PATCH /me/dispatch-hours
 *      payload validator. HH:MM format, day enum, close>open invariant,
 *      empty-days rejection, dedup + normalization, missing fields.
 *
 *   B. SOURCE-LEVEL PINS — Settings.jsx renders the dispatch-hours
 *      section, hydrates from onboarding.answers, calls the new
 *      endpoint. server.js mounts the route before /api/users so it
 *      isn't shadowed.
 *
 *   C. REGRESSION GUARDS — dispatchPolicy.isWithinDispatchHours
 *      behavior is identical to before for unconfigured movers AND for
 *      a freshly-configured mover. matcherDiagnosis.evalDispatchHours
 *      still produces OUTSIDE_HOURS_SMS for the documented case.
 *
 * Pure-Node, no Mongo, no HTTP. The validator is exported as a pure
 * function specifically so we can drive every edge case here.
 *
 * Run: `node server/__tests__/dispatchHoursSettings.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validatePayload, VALID_DAYS, HHMM } = require('../routes/dispatchHours');
const { isWithinDispatchHours } = require('../utils/dispatchPolicy');
const { __internals: diag } = require('../utils/matcherDiagnosis');

const repoRoot   = path.join(__dirname, '..', '..');
const settingsSrc = fs.readFileSync(path.join(repoRoot, 'client', 'src', 'pages', 'dashboard', 'Settings.jsx'), 'utf8');
const serverSrc   = fs.readFileSync(path.join(repoRoot, 'server', 'server.js'), 'utf8');
const routeSrc    = fs.readFileSync(path.join(repoRoot, 'server', 'routes', 'dispatchHours.js'), 'utf8');

// ── A. Validator edge cases ─────────────────────────────────────────────

test('A1. enabled=false produces a single-field patch that clears dispatchHoursMode', () => {
  const r = validatePayload({ enabled: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch, { 'onboarding.answers.dispatchHoursMode': null });
});

test('A2. enabled=true with valid open/close/days writes default-mode patch', () => {
  const r = validatePayload({
    enabled: true, open: '09:00', close: '17:00',
    days: ['mon','tue','wed','thu','fri'],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch, {
    'onboarding.answers.dispatchHoursMode':  'default',
    'onboarding.answers.dispatchHoursOpen':  '09:00',
    'onboarding.answers.dispatchHoursClose': '17:00',
    'onboarding.answers.dispatchDays':       ['mon','tue','wed','thu','fri'],
  });
});

test('A3. Missing enabled is rejected', () => {
  const r = validatePayload({});
  assert.equal(r.ok, false);
  assert.equal(r.field, 'enabled');
});

test('A4. Body must be an object', () => {
  assert.equal(validatePayload(null).ok, false);
  assert.equal(validatePayload(undefined).ok, false);
  assert.equal(validatePayload('hi').ok, false);
  assert.equal(validatePayload(42).ok, false);
});

test('A5. HH:MM regex rejects bad shapes', () => {
  const bad = ['9:00', '24:00', '12:60', '12:5', '12', 'noon', '', null, undefined];
  for (const open of bad) {
    const r = validatePayload({ enabled: true, open, close: '17:00', days: ['mon'] });
    assert.equal(r.ok, false, `open='${open}' should reject`);
    assert.equal(r.field, 'open');
  }
});

test('A6. HH:MM regex rejects bad close', () => {
  const bad = ['25:00', '9:5', '00:60'];
  for (const close of bad) {
    const r = validatePayload({ enabled: true, open: '09:00', close, days: ['mon'] });
    assert.equal(r.ok, false, `close='${close}' should reject`);
    assert.equal(r.field, 'close');
  }
});

test('A7. close must be strictly later than open (no overnight, no equal)', () => {
  // Overnight window
  const r1 = validatePayload({ enabled: true, open: '22:00', close: '06:00', days: ['mon'] });
  assert.equal(r1.ok, false);
  assert.equal(r1.field, 'close');
  assert.match(r1.error, /later than open/);
  // Exactly equal
  const r2 = validatePayload({ enabled: true, open: '09:00', close: '09:00', days: ['mon'] });
  assert.equal(r2.ok, false);
  assert.equal(r2.field, 'close');
});

test('A8. days must be non-empty array', () => {
  const r1 = validatePayload({ enabled: true, open: '09:00', close: '17:00', days: [] });
  assert.equal(r1.ok, false);
  assert.equal(r1.field, 'days');
  const r2 = validatePayload({ enabled: true, open: '09:00', close: '17:00', days: 'mon' });
  assert.equal(r2.ok, false);
  assert.equal(r2.field, 'days');
  const r3 = validatePayload({ enabled: true, open: '09:00', close: '17:00' });
  assert.equal(r3.ok, false);
  assert.equal(r3.field, 'days');
});

test('A9. days enum is strict — rejects full names, numbers, gibberish', () => {
  // Note: case is normalized (lowercased + trimmed), so 'MON' and ' Mon '
  // are ACCEPTED. Real garbage is rejected.
  const bad = [['Monday'], [1], ['mon', 'funday'], ['mon', null], ['xyz']];
  for (const days of bad) {
    const r = validatePayload({ enabled: true, open: '09:00', close: '17:00', days });
    assert.equal(r.ok, false, `days=${JSON.stringify(days)} should reject`);
    assert.equal(r.field, 'days');
  }
});

test("A9b. Case + whitespace are normalized on accepted day codes", () => {
  const r = validatePayload({
    enabled: true, open: '09:00', close: '17:00',
    days: ['MON', '  Tue ', 'WED'],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch['onboarding.answers.dispatchDays'], ['mon', 'tue', 'wed']);
});

test('A10. days is deduplicated + lowercased + trimmed', () => {
  const r = validatePayload({
    enabled: true, open: '09:00', close: '17:00',
    days: ['mon', 'mon', '  TUE ', 'Wed'],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch['onboarding.answers.dispatchDays'], ['mon', 'tue', 'wed']);
});

test('A11. days max length is 7', () => {
  const r = validatePayload({
    enabled: true, open: '09:00', close: '17:00',
    days: ['sun','mon','tue','wed','thu','fri','sat','sun'], // 8
  });
  assert.equal(r.ok, false);
  assert.equal(r.field, 'days');
});

test('A12. All 7 valid day codes are accepted', () => {
  const r = validatePayload({
    enabled: true, open: '00:00', close: '23:59',
    days: ['sun','mon','tue','wed','thu','fri','sat'],
  });
  assert.equal(r.ok, true);
  assert.equal(r.patch['onboarding.answers.dispatchDays'].length, 7);
});

test('A13. VALID_DAYS export matches dispatchPolicy DOW order', () => {
  // dispatchPolicy.DOW = ['sun','mon','tue','wed','thu','fri','sat'] (line 11)
  assert.deepEqual(VALID_DAYS, ['sun','mon','tue','wed','thu','fri','sat']);
});

test('A14. HHMM regex matches every valid HH:MM', () => {
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45, 59]) {
      const s = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      assert.ok(HHMM.test(s), `${s} should match`);
    }
  }
});

// ── B. Source-level pins ────────────────────────────────────────────────

test('B1. server.js mounts /api/users/me/dispatch-hours BEFORE /api/users', () => {
  assert.match(
    serverSrc,
    /app\.use\(\s*['"]\/api\/users\/me\/dispatch-hours['"][^)]*require\(['"]\.\/routes\/dispatchHours['"]\)/,
    'dispatchHours route must be mounted at /api/users/me/dispatch-hours'
  );
  const dispatchIdx = serverSrc.indexOf("/api/users/me/dispatch-hours");
  const usersIdx    = serverSrc.search(/app\.use\(\s*['"]\/api\/users['"][^)]*\.\/routes\/users['"]\)/);
  assert.ok(dispatchIdx > -1 && usersIdx > -1, 'both mount points must exist');
  assert.ok(
    dispatchIdx < usersIdx,
    'dispatchHours mount must precede the catch-all /api/users mount to avoid shadowing'
  );
});

test('B2. dispatchHours route file exports validatePayload + VALID_DAYS + HHMM', () => {
  assert.match(routeSrc, /module\.exports\.validatePayload\s*=\s*validatePayload/);
  assert.match(routeSrc, /module\.exports\.VALID_DAYS\s*=\s*VALID_DAYS/);
  assert.match(routeSrc, /module\.exports\.HHMM\s*=\s*HHMM/);
});

test('B3. PATCH / handler is registered on the dispatchHours router', () => {
  assert.match(routeSrc, /router\.patch\s*\(\s*['"]\/['"]/);
  // And writes the four onboarding.answers fields under $set
  assert.match(routeSrc, /findByIdAndUpdate/);
  assert.match(routeSrc, /onboarding\.answers\.dispatchHoursMode/);
});

test('B4. Settings.jsx renders the dispatch-hours section', () => {
  assert.match(settingsSrc, /Restrict SMS alerts to a time window/);
  assert.match(settingsSrc, /dispatchEnabled/);
  assert.match(settingsSrc, /dispatchOpen/);
  assert.match(settingsSrc, /dispatchClose/);
  assert.match(settingsSrc, /dispatchDays/);
});

test('B5. Settings.jsx hydrates dispatch-hours from onboarding.answers', () => {
  assert.match(settingsSrc, /user\.onboarding\?\.answers/);
  assert.match(settingsSrc, /dispatchHoursMode\s*===\s*['"]default['"]/);
  assert.match(settingsSrc, /dispatchHoursOpen/);
  assert.match(settingsSrc, /dispatchHoursClose/);
  // dispatchDays hydration falls back to the 7-day default
  assert.match(settingsSrc, /a\.dispatchDays/);
});

test('B6. Settings.jsx calls PATCH /users/me/dispatch-hours', () => {
  assert.match(settingsSrc, /\/users\/me\/dispatch-hours/);
  assert.match(settingsSrc, /method:\s*['"]PATCH['"]/);
});

test('B7. Settings.jsx surfaces the UTC disclosure', () => {
  // Explicit UTC notice + the live UTC clock helper.
  assert.match(settingsSrc, /hours are evaluated in\s*<strong>UTC/i);
  assert.match(settingsSrc, /utcNow\.getUTCHours/);
});

test('B8. Save button is disabled when enabled=true but no days are selected', () => {
  assert.match(
    settingsSrc,
    /disabled=\{dispatchSaving \|\| \(dispatchEnabled && dispatchDays\.length === 0\)\}/
  );
});

// ── C. Regression guards — read path unchanged ──────────────────────────

test('C1. isWithinDispatchHours is permissive for users with no dispatchHoursMode', () => {
  // Today's behavior for every existing mover. Must stay identical.
  const noConfig = { onboarding: { answers: {} } };
  assert.equal(isWithinDispatchHours(noConfig, 'sms'), true);
  assert.equal(isWithinDispatchHours(noConfig, 'email'), true);
});

test('C2. isWithinDispatchHours honors a default-mode window we just configured', () => {
  // Mirror what PATCH would store, then evaluate at a time inside + outside.
  const configured = {
    onboarding: {
      answers: {
        dispatchHoursMode: 'default',
        dispatchHoursOpen: '09:00',
        dispatchHoursClose: '17:00',
        dispatchDays: ['mon','tue','wed','thu','fri'],
      },
    },
  };
  // Inside: Wednesday at 10:00 (server's local clock interpretation; we
  // force the time via a Date instance — getHours/getDay use local-time
  // accessors, so any Date we pass returns predictable values relative
  // to the host).
  const inside = new Date(2026, 4, 27, 10, 0); // Wed 2026-05-27 10:00 local
  assert.equal(isWithinDispatchHours(configured, 'sms', inside), true);

  // Outside (after close)
  const outside = new Date(2026, 4, 27, 22, 0);
  assert.equal(isWithinDispatchHours(configured, 'sms', outside), false);

  // Saturday should be filtered out by dispatchDays even at 10:00
  const sat = new Date(2026, 4, 30, 10, 0); // Sat 2026-05-30
  assert.equal(isWithinDispatchHours(configured, 'sms', sat), false);

  // Email always bypasses
  assert.equal(isWithinDispatchHours(configured, 'email', outside), true);
});

test('C3. matcherDiagnosis evalDispatchHours still emits OUTSIDE_HOURS_SMS', () => {
  // Same shape PR #31 locked in. PR-C2 must not have changed the gate
  // code — only the write path is new.
  const mover = {
    onboarding: {
      answers: {
        dispatchHoursMode: 'default',
        dispatchHoursOpen: '09:00',
        dispatchHoursClose: '17:00',
        dispatchDays: ['mon','tue','wed','thu','fri'],
      },
    },
  };
  const outside = new Date(2026, 4, 27, 22, 0);
  const gate = diag.evalDispatchHours(mover, outside);
  assert.equal(gate.gate, 'dispatchHours');
  assert.equal(gate.pass, false);
  assert.equal(gate.code, 'OUTSIDE_HOURS_SMS');
});

test('C4. matcherDiagnosis evalDispatchHours stays permissive for unconfigured mover', () => {
  const mover = { onboarding: { answers: {} } };
  const gate = diag.evalDispatchHours(mover, new Date(2026, 4, 27, 22, 0));
  assert.equal(gate.pass, true);
  assert.equal(gate.code, 'HOURS_NOT_CONFIGURED_PERMISSIVE');
});

console.log('Dispatch Hours Settings (PR-C2) tests scheduled.');
