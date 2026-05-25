/**
 * Mover-coverage cleanup — Phase 1 lock-in tests.
 *
 * Pure-Node, no Mongo. Covers:
 *   A. serviceAreaMirror helpers (normalize, computeInterstateEnabled,
 *      buildServiceAreaPatch, backfillFromServiceStates) behave correctly
 *      under happy + edge inputs
 *   B. User schema declares the new fields (source-level)
 *   C. PUT /api/users/:id source-level wiring uses the new helper for both
 *      new-fields and legacy serviceStates inputs
 *   D. Onboarding save-step source-level wiring mirrors pickup/delivery
 *      onboarding answers into top-level fields via buildServiceAreaPatch
 *
 * Phase 1 invariant: matching code is NOT changed by Phase 1. We do NOT
 * assert any change to leadMatching.js / leads.js / twilioService.js
 * behavior here. That cutover is Phase 3.
 *
 * Run: `node server/__tests__/moverServiceAreaPhase1.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  VALID_STATE_CODES,
  MAX_STATES,
  normalizeStateList,
  computeInterstateEnabled,
  buildServiceAreaPatch,
  backfillFromServiceStates,
} = require('../utils/serviceAreaMirror');

const userModelSrc      = fs.readFileSync(path.join(__dirname, '..', 'models', 'User.js'), 'utf8');
const usersRouteSrc     = fs.readFileSync(path.join(__dirname, '..', 'routes', 'users.js'), 'utf8');
const onboardingSrc     = fs.readFileSync(path.join(__dirname, '..', 'routes', 'onboarding.js'), 'utf8');
const backfillScriptSrc = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'backfillMoverServiceArea.js'), 'utf8');

// ── A. Helper behavior ────────────────────────────────────────────────────

test('normalizeStateList: trim, uppercase, dedupe, drop unknown, cap at 50', () => {
  // Happy path
  assert.deepEqual(normalizeStateList(['ca', 'NY', 'tx']), ['CA', 'NY', 'TX']);
  // Trim + case
  assert.deepEqual(normalizeStateList([' ca ', 'Ny']), ['CA', 'NY']);
  // Dedupe (preserves first occurrence then sorts)
  assert.deepEqual(normalizeStateList(['CA', 'NY', 'CA']), ['CA', 'NY']);
  // Drop unknown codes silently
  assert.deepEqual(normalizeStateList(['CA', 'XX', 'NY']), ['CA', 'NY']);
  // Non-array → []
  assert.deepEqual(normalizeStateList(null), []);
  assert.deepEqual(normalizeStateList('CA'), []);
  // Non-string entries dropped
  assert.deepEqual(normalizeStateList(['CA', 123, null, { code: 'NY' }]), ['CA']);
  // Cap
  const tooMany = Array.from({ length: 60 }, (_, i) => [...VALID_STATE_CODES][i % 50]);
  assert.equal(normalizeStateList(tooMany).length, Math.min(50, MAX_STATES));
});

test('computeInterstateEnabled: nationwide || delivery⊄pickup', () => {
  // Nationwide always wins
  assert.equal(computeInterstateEnabled({ deliversNationwide: true, pickupStates: [], deliveryStates: [] }), true);
  // Delivery ⊆ pickup → intrastate only
  assert.equal(computeInterstateEnabled({ pickupStates: ['CA', 'NY'], deliveryStates: ['CA'] }), false);
  assert.equal(computeInterstateEnabled({ pickupStates: ['CA'], deliveryStates: ['CA'] }), false);
  // Delivery state not in pickup → interstate
  assert.equal(computeInterstateEnabled({ pickupStates: ['CA'], deliveryStates: ['CA', 'NV'] }), true);
  assert.equal(computeInterstateEnabled({ pickupStates: [], deliveryStates: ['NY'] }), true);
  // Both empty, not nationwide → false (nothing configured)
  assert.equal(computeInterstateEnabled({ pickupStates: [], deliveryStates: [] }), false);
});

test('buildServiceAreaPatch: writes only supplied fields + maintains mirrors', () => {
  // Caller supplies pickup only — delivery/nationwide read from previous
  const r1 = buildServiceAreaPatch({
    pickupStates: ['CA', 'NV'],
    previous: { deliveryStates: ['CA'], deliversNationwide: false },
  });
  assert.deepEqual(r1.patch.pickupStates, ['CA', 'NV']);
  assert.ok(!('deliveryStates' in r1.patch),    'untouched delivery not written');
  assert.ok(!('deliversNationwide' in r1.patch),'untouched nationwide not written');
  // serviceStates mirror is union(pickup, delivery)
  assert.deepEqual(r1.patch.serviceStates, ['CA', 'NV']); // union with previous delivery ['CA']
  // interstate: delivery=[CA] ⊆ pickup=[CA,NV] → false
  assert.equal(r1.patch.interstateEnabled, false);

  // Caller flips nationwide on — delivery gets force-cleared
  const r2 = buildServiceAreaPatch({
    deliversNationwide: true,
    previous: { pickupStates: ['CA'], deliveryStates: ['CA', 'NV'] },
  });
  assert.equal(r2.patch.deliversNationwide, true);
  assert.equal(r2.patch.interstateEnabled, true);
  // pickup unchanged, no delivery write (helper didn't get a deliveryStates input)
  // ...but resolved deliveryStates is [] because nationwide cleared it
  assert.deepEqual(r2.deliveryStates, []);

  // Caller supplies delivery + nationwide=false in same payload
  const r3 = buildServiceAreaPatch({
    pickupStates: ['CA'],
    deliveryStates: ['NV', 'AZ'],
    deliversNationwide: false,
    previous: {},
  });
  assert.deepEqual(r3.patch.pickupStates, ['CA']);
  assert.deepEqual(r3.patch.deliveryStates, ['AZ', 'NV']); // sorted
  assert.equal(r3.patch.deliversNationwide, false);
  // serviceStates mirror = union
  assert.deepEqual(r3.patch.serviceStates, ['AZ', 'CA', 'NV']);
  // interstate: NV/AZ not in pickup → true
  assert.equal(r3.patch.interstateEnabled, true);

  // No inputs → no patch
  const r4 = buildServiceAreaPatch({ previous: { pickupStates: ['CA'] } });
  assert.deepEqual(r4.patch, {});
  assert.equal(r4.mirrorServiceStates, false);
});

test('buildServiceAreaPatch: normalizes inputs (drops unknown / dedupes)', () => {
  const r = buildServiceAreaPatch({
    pickupStates: ['ca', 'CA', 'XX', 'ny'],
    deliveryStates: ['CA', 'tx'],
    previous: {},
  });
  assert.deepEqual(r.patch.pickupStates, ['CA', 'NY']);
  assert.deepEqual(r.patch.deliveryStates, ['CA', 'TX']);
  assert.deepEqual(r.patch.serviceStates, ['CA', 'NY', 'TX']);
});

test('backfillFromServiceStates: fills empty pickup + delivery; respects nationwide', () => {
  // Empty previous → backfill both
  const r1 = backfillFromServiceStates(['CA', 'NY'], {});
  assert.deepEqual(r1.pickupStates, ['CA', 'NY']);
  assert.deepEqual(r1.deliveryStates, ['CA', 'NY']);
  assert.equal(r1.interstateEnabled, false); // pickup=delivery → false

  // Nationwide previous → fill pickup, leave delivery alone
  const r2 = backfillFromServiceStates(['CA'], { deliversNationwide: true });
  assert.deepEqual(r2.pickupStates, ['CA']);
  assert.ok(!('deliveryStates' in r2),
    'nationwide movers must not get a delivery list backfilled');
  assert.equal(r2.interstateEnabled, true);

  // Previous already has pickup → don't overwrite
  const r3 = backfillFromServiceStates(['CA', 'NY'], { pickupStates: ['TX'] });
  assert.ok(!('pickupStates' in r3), 'must not overwrite existing pickupStates');
  assert.deepEqual(r3.deliveryStates, ['CA', 'NY']); // delivery still empty → backfilled

  // Empty serviceStates → no additions
  const r4 = backfillFromServiceStates([], {});
  assert.deepEqual(r4, {});
});

// ── B. User schema declares the new fields ────────────────────────────────

test('User schema declares pickupStates / deliveryStates / interstateEnabled', () => {
  assert.match(userModelSrc, /\bpickupStates\s*:\s*\{/,    'User must declare pickupStates');
  assert.match(userModelSrc, /\bdeliveryStates\s*:\s*\{/,  'User must declare deliveryStates');
  assert.match(userModelSrc, /\binterstateEnabled\s*:\s*\{[^}]*type:\s*Boolean/,
    'User must declare interstateEnabled as Boolean');
  // serviceStates retained for back-compat — Phase 3 will deprecate
  assert.match(userModelSrc, /\bserviceStates\s*:\s*\[String\]/,
    'serviceStates kept readable for Phase 1+2 back-compat');
});

// ── C. PUT /api/users/:id wiring ──────────────────────────────────────────

test('users.js PUT imports + uses serviceAreaMirror helpers', () => {
  assert.match(
    usersRouteSrc,
    /require\(\s*['"]\.\.\/utils\/serviceAreaMirror['"]\s*\)/,
    'users.js must require serviceAreaMirror'
  );
  assert.match(usersRouteSrc, /\bbuildServiceAreaPatch\s*\(/,
    'users.js must call buildServiceAreaPatch in the new-fields path');
  assert.match(usersRouteSrc, /\bbackfillFromServiceStates\s*\(/,
    'users.js must call backfillFromServiceStates on the legacy path');
});

test('users.js PUT strips interstateEnabled from req.body (derived field)', () => {
  assert.match(
    usersRouteSrc,
    /\binterstateEnabled\s*,/,
    'users.js must destructure-strip interstateEnabled so clients cannot set it directly'
  );
});

test('users.js PUT validates outer shapes of new fields', () => {
  assert.match(usersRouteSrc, /pickupStates must be an array/);
  assert.match(usersRouteSrc, /deliveryStates must be an array/);
  assert.match(usersRouteSrc, /deliversNationwide must be a boolean/);
});

test('users.js PUT triggers coverage regen on service-area changes', () => {
  // The regen call still goes through regenerateCoverageForUser_v2 with
  // pickup + delivery shapes. We need the call site to exist and to use
  // the resolved regenPickup / regenDelivery values, not the raw inputs.
  // The call may span multiple lines — use dotall (`[\s\S]*?`) between args.
  assert.match(
    usersRouteSrc,
    /regenerateCoverageForUser_v2\([\s\S]*?regenPickup[\s\S]*?regenDelivery[\s\S]*?\)/,
    'users.js must pass resolved regenPickup/regenDelivery into the coverage regen call'
  );
});

// ── D. Onboarding save-step mirror ────────────────────────────────────────

test('onboarding.js mirrors pickup/delivery answers into top-level fields', () => {
  assert.match(
    onboardingSrc,
    /require\(\s*['"]\.\.\/utils\/serviceAreaMirror['"]\s*\)/,
    'onboarding.js must require serviceAreaMirror'
  );
  // The mirror block runs on step === 1 || step === 2
  assert.match(onboardingSrc, /if\s*\(\s*step\s*===\s*1\s*\|\|\s*step\s*===\s*2\s*\)/,
    'onboarding.js must run mirror on Step 1 or Step 2');
  assert.match(onboardingSrc, /\bbuildServiceAreaPatch\s*\(/,
    'onboarding.js must call buildServiceAreaPatch to compute mirror patch');
});

// ── E. Backfill script ────────────────────────────────────────────────────

test('backfillMoverServiceArea script uses helper + dry-run default', () => {
  assert.match(
    backfillScriptSrc,
    /require\(\s*['"]\.\.\/utils\/serviceAreaMirror['"]\s*\)/,
    'backfill script must require serviceAreaMirror helpers'
  );
  assert.match(backfillScriptSrc, /APPLY\s*=\s*args\.includes\(['"]--apply['"]\)/,
    'backfill script must default to dry-run; --apply opts into writes');
  assert.match(backfillScriptSrc, /computeInterstateEnabled\(/,
    'backfill script must recompute interstateEnabled, not trust legacy value');
});

// ── F. Phase 2 — Settings UI wiring ───────────────────────────────────────

const settingsJsxSrc   = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'dashboard', 'Settings.jsx'), 'utf8');
const statePickerSrc   = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'components', 'StatePicker.jsx'), 'utf8');

test('Phase 2: StatePicker component exports a default + accepts value/onChange', () => {
  assert.match(statePickerSrc, /export\s+default\s+function\s+StatePicker\s*\(/,
    'StatePicker must be a default-exported function component');
  assert.match(statePickerSrc, /value\s*,\s*onChange/,
    'StatePicker must accept value + onChange as props');
});

test('Phase 2: Settings.jsx imports StatePicker and drops legacy inline state hooks', () => {
  assert.match(settingsJsxSrc,
    /from\s+['"]\.\.\/\.\.\/components\/StatePicker['"]/,
    'Settings.jsx must import StatePicker');
  // Legacy state hooks are gone (file should no longer reference serviceStates state,
  // statesSaving, stateMenuOpen, etc. — those have all been replaced).
  assert.ok(!/setServiceStates\s*\(/.test(settingsJsxSrc),
    'setServiceStates state hook must be removed (replaced by pickupStates)');
  assert.ok(!/setStateMenuOpen\s*\(/.test(settingsJsxSrc),
    'inline state menu hooks must be gone (StatePicker owns them)');
});

test('Phase 2: Settings.jsx tracks pickupStates, deliveryMode, moveDistance', () => {
  assert.match(settingsJsxSrc, /setPickupStates\s*\(/,
    'Settings.jsx must own pickupStates state');
  assert.match(settingsJsxSrc, /setDeliveryMode\s*\(/,
    'Settings.jsx must own deliveryMode state');
  assert.match(settingsJsxSrc, /setDeliveryStatesCustom\s*\(/,
    'Settings.jsx must own deliveryStatesCustom state');
  assert.match(settingsJsxSrc, /setMoveDistance\s*\(/,
    'Settings.jsx must own moveDistance state');
});

test('Phase 2: saveServiceArea writes the new top-level fields', () => {
  assert.match(settingsJsxSrc, /const\s+saveServiceArea\s*=\s*async/,
    'saveServiceArea handler must exist');
  // Payload includes the four canonical fields
  assert.match(settingsJsxSrc, /pickupStates\s*,/);
  assert.match(settingsJsxSrc, /deliveryStates\s*:/);
  assert.match(settingsJsxSrc, /deliversNationwide\s*=\s*true/,
    'nationwide branch must set deliversNationwide=true');
  assert.match(settingsJsxSrc, /maxDistance\s*:\s*moveDistance/,
    'payload must include the new moveDistance value as maxDistance');
});

test('Phase 2: nationwide mode clears deliveryStates client-side', () => {
  // Search for the nationwide branch — it must set deliveryStates: []
  assert.match(
    settingsJsxSrc,
    /deliveryMode\s*===\s*['"]nationwide['"][\s\S]*?deliveryStates\s*=\s*\[\]/,
    'when deliveryMode==="nationwide", payload.deliveryStates must be []'
  );
});

test('Phase 2: same-as-pickup mode sends deliveryStates = pickupStates', () => {
  assert.match(
    settingsJsxSrc,
    /deliveryStates\s*=\s*pickupStates/,
    'when deliveryMode==="same", payload.deliveryStates must equal pickupStates'
  );
});

test('Phase 2: Lead Preferences tab no longer renders the maxDistance select', () => {
  // The select used to read maxDistancePref — that variable should be gone
  assert.ok(!/maxDistancePref/.test(settingsJsxSrc),
    'maxDistancePref state has been moved into Service Area; should not remain in Lead Preferences');
  // saveLeadPreferences only writes preferredHomeSizes now
  assert.match(
    settingsJsxSrc,
    /JSON\.stringify\(\s*\{\s*preferredHomeSizes\s*\}\s*\)/,
    'saveLeadPreferences must only send preferredHomeSizes after the move-distance migration'
  );
});

console.log('\nMover-coverage Phase 1 + Phase 2 lock-in tests scheduled.');
