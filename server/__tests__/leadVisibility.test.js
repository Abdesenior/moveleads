/**
 * leadVisibility — Phase 6.1 smoke test.
 *
 * Runs as plain Node (no test runner required). Co-located in __tests__/
 * so it sits next to sanitize.test.js, but uses bare assert because Jest
 * is not installed in this project. Run with:
 *
 *   node server/__tests__/leadVisibility.test.js
 *
 * Verifies the contract that:
 *   - 'true' / 'full' / '1' / unknown / undefined / '' → 'off' (safety fallback)
 *   - 'rejected_only' → 'rejected_only'
 *   - The startup warning fires exactly once when env requested full mode.
 */

const assert = require('assert');

// Disable the periodic reporter timer for all test loads — we verify the
// startup announcement separately and don't want stray intervals leaking
// across cases. Counters still increment; only the setInterval is skipped.
process.env.LEAD_VISIBILITY_REPORT_INTERVAL_MS = '0';

// Load fresh so the startup IIFE runs in a controlled env state.
function loadFresh(envValue) {
  delete require.cache[require.resolve('../utils/leadVisibility')];
  if (envValue === undefined) delete process.env.ENABLE_TIERED_ROUTING;
  else process.env.ENABLE_TIERED_ROUTING = envValue;
  return require('../utils/leadVisibility');
}

// Helper: load a fresh module while capturing console output.
function loadFreshCapturing(envValue) {
  const warns = [];
  const logs = [];
  const origWarn = console.warn;
  const origLog = console.log;
  console.warn = (msg) => warns.push(String(msg));
  console.log  = (msg) => logs.push(String(msg));
  let mod;
  try { mod = loadFresh(envValue); } finally {
    console.warn = origWarn;
    console.log  = origLog;
  }
  return { mod, warns, logs };
}

// ── routingMode() — explicit-argument form (no env needed) ─────────────────
{
  const { routingMode } = loadFresh(undefined);

  // The four cases requested in the spec (Phase 6.1):
  assert.strictEqual(routingMode('true'),          'off',           "routingMode('true') -> off");
  assert.strictEqual(routingMode('full'),          'off',           "routingMode('full') -> off");
  assert.strictEqual(routingMode('rejected_only'), 'rejected_only', "routingMode('rejected_only') -> rejected_only");
  assert.strictEqual(routingMode(undefined),       'off',           'routingMode(undefined) -> off');

  // Phase 6.4 — new mode
  assert.strictEqual(routingMode('blocked_and_review'),  'blocked_and_review', "routingMode('blocked_and_review') -> blocked_and_review");
  assert.strictEqual(routingMode('BLOCKED_AND_REVIEW'),  'blocked_and_review', 'uppercase ok');
  assert.strictEqual(routingMode('  blocked_and_review  '), 'blocked_and_review', 'whitespace ok');

  // Additional edge cases that should also fall back to off:
  assert.strictEqual(routingMode('1'),       'off', "routingMode('1') -> off");
  assert.strictEqual(routingMode(''),        'off', "routingMode('') -> off");
  assert.strictEqual(routingMode('0'),       'off', "routingMode('0') -> off");
  assert.strictEqual(routingMode('false'),   'off', "routingMode('false') -> off");
  assert.strictEqual(routingMode('off'),     'off', "routingMode('off') -> off");
  assert.strictEqual(routingMode('GARBAGE'), 'off', "routingMode('GARBAGE') -> off");
  // Case-insensitive + whitespace tolerant:
  assert.strictEqual(routingMode('  REJECTED_ONLY  '), 'rejected_only', 'whitespace + uppercase ok');

  console.log('  ✓ routingMode() parsing matrix (incl. blocked_and_review)');
}

// ── Startup warning — fires exactly once when env requested full ───────────
{
  const { warns } = loadFreshCapturing('full');
  assert.strictEqual(warns.length, 1, 'one warning emitted for env=full');
  assert.ok(
    warns[0].includes('full routing mode requested but not implemented'),
    'warning text mentions "not implemented"'
  );
  assert.ok(warns[0].includes('falling back to off'), 'warning text mentions fallback');
  console.log('  ✓ startup warning emitted for env=full');
}

{
  const { warns } = loadFreshCapturing('rejected_only');
  assert.strictEqual(warns.length, 0, 'no warning for env=rejected_only');
  console.log('  ✓ no startup warning for env=rejected_only');
}

{
  const { warns } = loadFreshCapturing(undefined);
  assert.strictEqual(warns.length, 0, 'no warning when env unset');
  console.log('  ✓ no startup warning when env unset');
}

// ── Startup mode announcement — Phase 6.2 ──────────────────────────────────
{
  const { logs } = loadFreshCapturing('rejected_only');
  const announce = logs.find(l => l.includes('[leadVisibility] mode=rejected_only'));
  assert.ok(announce, 'mode announcement logged for env=rejected_only');
  console.log('  ✓ startup mode announcement for env=rejected_only');
}

{
  const { logs } = loadFreshCapturing(undefined);
  const announce = logs.find(l => l.includes('[leadVisibility] mode='));
  assert.ok(!announce, 'no mode announcement when env unset (mode=off)');
  console.log('  ✓ no mode announcement when env unset');
}

{
  // env=full → falls back to off → should NOT announce a mode line
  const { logs } = loadFreshCapturing('full');
  const announce = logs.find(l => l.includes('[leadVisibility] mode='));
  assert.ok(!announce, 'no mode announcement when env=full falls back to off');
  console.log('  ✓ no mode announcement when env=full falls back to off');
}

// ── moverVisibilityFilter — pass-through unless rejected_only ──────────────
{
  const off  = loadFresh(undefined).moverVisibilityFilter();
  assert.deepStrictEqual(off, {}, 'mode=off → filter is {}');

  const full = loadFresh('full').moverVisibilityFilter();
  assert.deepStrictEqual(full, {}, "mode=full (falls back to off) → filter is {}");

  const rOnly = loadFresh('rejected_only').moverVisibilityFilter();
  assert.ok(Array.isArray(rOnly.$and), 'rejected_only → $and array');
  assert.strictEqual(rOnly.$and.length, 4, '4 clauses (including Phase 6.3 quality gate)');

  // Verify the qualityGateCleared clause is present
  const hasGateClause = rOnly.$and.some(c =>
    c.qualityGateCleared && c.qualityGateCleared.$ne === false
  );
  assert.ok(hasGateClause, 'qualityGateCleared $ne false clause present');

  console.log('  ✓ moverVisibilityFilter() shape per mode (incl. quality gate)');
}

// ── isHiddenFromMovers — only hides under rejected_only ────────────────────
{
  const offMod = loadFresh(undefined);
  assert.strictEqual(offMod.isHiddenFromMovers({ status: 'REJECTED_FAKE' }), false, 'off: REJECTED_FAKE not hidden');
  assert.strictEqual(offMod.isHiddenFromMovers({ shadowTier: 'rejected' }), false, 'off: shadowTier=rejected not hidden');
  assert.strictEqual(offMod.isHiddenFromMovers({ qualityGateCleared: false }), false, 'off: gate=false not hidden');

  const fullMod = loadFresh('full');
  assert.strictEqual(fullMod.isHiddenFromMovers({ status: 'REJECTED_FAKE' }), false, 'full→off: REJECTED_FAKE not hidden');

  const rOnly = loadFresh('rejected_only');
  assert.strictEqual(rOnly.isHiddenFromMovers({ status: 'REJECTED_FAKE' }), true, 'rejected_only: REJECTED_FAKE hidden');
  assert.strictEqual(rOnly.isHiddenFromMovers({ adminTierOverride: { tier: 'rejected' } }), true, 'rejected_only: admin override hidden');
  assert.strictEqual(rOnly.isHiddenFromMovers({ shadowTier: 'rejected' }), true, 'rejected_only: shadowTier=rejected hidden');
  assert.strictEqual(rOnly.isHiddenFromMovers({ shadowTier: 'review' }), false, 'rejected_only: review not hidden');
  assert.strictEqual(rOnly.isHiddenFromMovers(null), false, 'null lead → not hidden (fail open)');
  // Phase 6.3 — quality gate
  assert.strictEqual(rOnly.isHiddenFromMovers({ qualityGateCleared: false }), true, 'rejected_only: gate=false hidden (V5 race fix)');
  assert.strictEqual(rOnly.isHiddenFromMovers({ qualityGateCleared: true }), false, 'rejected_only: gate=true visible');
  assert.strictEqual(rOnly.isHiddenFromMovers({}), false, 'rejected_only: missing gate (V4 / pre-fix) not hidden');

  // Combined: scoring in flight (gate=false) on a V5 lead is hidden
  assert.strictEqual(rOnly.isHiddenFromMovers({
    status: 'READY_FOR_DISTRIBUTION', funnelVersion: 'v5', qualityGateCleared: false,
  }), true, 'rejected_only: V5 lead pre-scoring race is hidden');

  // hiddenReason reflects the gate
  assert.strictEqual(rOnly.hiddenReason({ qualityGateCleared: false }), 'qualityGate=false', 'hiddenReason names the gate');

  console.log('  ✓ isHiddenFromMovers() behavior per mode (incl. quality gate)');
}

// ── Phase 6.4 — blocked_and_review mode ────────────────────────────────────

// computeStructuralBlockers — pure function matrix
{
  const { computeStructuralBlockers } = loadFresh(undefined);
  const blockers = (lead) => computeStructuralBlockers(lead);

  // Clean lead — no blockers
  assert.deepStrictEqual(
    blockers({ miles: 500, validation: { phone: { valid: true }, route: { suspicious: [] } } }),
    [], 'clean lead → no structural blockers'
  );

  // route_unresolved
  assert.deepStrictEqual(
    blockers({ miles: 500, validation: { phone: { valid: true }, route: { suspicious: ['origin_zip_not_found'] } } }),
    ['route_unresolved'], 'origin not found'
  );
  assert.deepStrictEqual(
    blockers({ miles: 500, validation: { phone: { valid: true }, route: { suspicious: ['destination_zip_not_found'] } } }),
    ['route_unresolved'], 'destination not found'
  );

  // distance_unknown
  assert.deepStrictEqual(
    blockers({ miles: 0, validation: { phone: { valid: true }, route: { suspicious: [] } } }),
    ['distance_unknown'], 'miles=0'
  );

  // Combined route+distance (typical when Mapbox fails)
  assert.deepStrictEqual(
    blockers({ miles: 0, validation: { phone: { valid: true }, route: { suspicious: ['origin_zip_not_found', 'destination_zip_not_found'] } } }),
    ['route_unresolved', 'distance_unknown'], 'route+distance'
  );

  // invalid_phone
  assert.deepStrictEqual(
    blockers({ miles: 500, validation: { phone: { valid: false }, route: { suspicious: [] } } }),
    ['invalid_phone'], 'invalid phone'
  );

  // suspicious_carrier
  assert.deepStrictEqual(
    blockers({ miles: 500, validation: { phone: { valid: true, providerSuspicion: 'high' }, route: { suspicious: [] } } }),
    ['suspicious_carrier'], 'high provider suspicion'
  );

  // SOFT cases (NOT structural per user spec)
  assert.deepStrictEqual(
    blockers({ miles: 500, validation: { phone: { valid: true, isVoip: true }, route: { suspicious: [] } } }),
    [], 'VoIP alone → not structural'
  );
  assert.deepStrictEqual(
    blockers({ miles: 500, validation: { phone: { valid: true, validityReason: 'twilio_no_enrichment' }, route: { suspicious: [] } } }),
    [], 'telecom_low_confidence alone → not structural'
  );
  assert.deepStrictEqual(
    blockers({ miles: 500, validation: { phone: { valid: true, suspicionPattern: 'alternating_pattern_5plus' }, route: { suspicious: [] } } }),
    [], 'suspicion_pattern alone → not structural'
  );

  // COMBO (telecom_low_confidence + suspicion_pattern) → structural
  assert.deepStrictEqual(
    blockers({ miles: 500, validation: { phone: { valid: true, validityReason: 'twilio_no_enrichment', suspicionPattern: 'alternating_pattern_5plus' }, route: { suspicious: [] } } }),
    ['low_confidence_plus_pattern'], 'low_conf + pattern combo → structural'
  );

  // High fraud signals
  assert.deepStrictEqual(
    blockers({ miles: 500, validation: { phone: { valid: true }, route: { suspicious: [] }, fraud: { smsPumpingRisk: 'high' } } }),
    ['high_sms_pumping'], 'high sms pumping'
  );
  assert.deepStrictEqual(
    blockers({ miles: 500, validation: { phone: { valid: true }, route: { suspicious: [] }, fingerprint: { bot: true } } }),
    ['fingerprint_bot'], 'confirmed bot'
  );

  // Null/undefined input — fail open
  assert.deepStrictEqual(blockers(null), [], 'null lead → no blockers');
  assert.deepStrictEqual(blockers(undefined), [], 'undefined lead → no blockers');
  assert.deepStrictEqual(blockers({}), ['distance_unknown'], 'empty lead → distance_unknown (miles missing)');

  console.log('  ✓ computeStructuralBlockers() matrix');
}

// moverVisibilityFilter shape per mode (Phase 6.6)
{
  const off = loadFresh(undefined).moverVisibilityFilter();
  assert.deepStrictEqual(off, {}, 'off → {}');

  const r = loadFresh('rejected_only').moverVisibilityFilter();
  assert.strictEqual(r.$and.length, 4, 'rejected_only → 4 clauses');

  const b = loadFresh('blocked_and_review').moverVisibilityFilter();
  // Phase 6.6: base 4 + denormalized $nin + 6 raw-field clauses = 11
  assert.strictEqual(b.$and.length, 11, 'blocked_and_review → 11 clauses (base 4 + structural $nin + 6 raw fallback)');

  const denormClause = b.$and[4];
  assert.ok(denormClause.structuralBlockers && Array.isArray(denormClause.structuralBlockers.$nin),
    'denormalized clause uses $nin against hide-worthy codes');
  assert.ok(denormClause.structuralBlockers.$nin.includes('invalid_phone'), 'invalid_phone in $nin list');

  // Phase 6.6 raw-validation fallback clauses
  const allKeys = b.$and.map(c => Object.keys(c)[0]);
  assert.ok(allKeys.includes('validation.phone.valid'), 'raw fallback: validation.phone.valid clause present');
  assert.ok(allKeys.includes('validation.phone.providerSuspicion'), 'raw fallback: providerSuspicion clause present');
  assert.ok(allKeys.includes('validation.route.suspicious'), 'raw fallback: route.suspicious clause present');
  assert.ok(allKeys.includes('miles'), 'raw fallback: miles clause present');
  assert.ok(allKeys.includes('validation.fraud.smsPumpingRisk'), 'raw fallback: sms pumping clause present');
  assert.ok(allKeys.includes('validation.fingerprint.bot'), 'raw fallback: bot clause present');

  console.log('  ✓ moverVisibilityFilter() shape per mode (Phase 6.6 raw fallback)');
}

// isHiddenFromMovers behavior in blocked_and_review — Phase 6.5: any tier
{
  const m = loadFresh('blocked_and_review');
  const h = (lead) => m.isHiddenFromMovers(lead);

  // Tier=rejected paths still hidden
  assert.strictEqual(h({ status: 'REJECTED_FAKE' }), true, 'REJECTED_FAKE hidden');
  assert.strictEqual(h({ shadowTier: 'rejected' }), true, 'shadowTier=rejected hidden');
  assert.strictEqual(h({ qualityGateCleared: false }), true, 'gate=false hidden');

  // Tier=review without structural — VISIBLE (soft review)
  assert.strictEqual(h({
    shadowTier: 'review', structuralBlockers: [],
  }), false, 'review with empty blockers visible');
  assert.strictEqual(h({
    shadowTier: 'review',
    validation: { phone: { valid: true, isVoip: true }, route: { suspicious: [] } },
    miles: 500,
  }), false, 'VoIP-only review visible (VoIP not structural)');

  // Phase 6.5 — ANY tier with structural blocker → hidden
  assert.strictEqual(h({ shadowTier: 'review',  structuralBlockers: ['route_unresolved'] }), true, 'review+route_unresolved hidden');
  assert.strictEqual(h({ shadowTier: 'review',  structuralBlockers: ['invalid_phone'] }), true, 'review+invalid_phone hidden');
  assert.strictEqual(h({ shadowTier: 'review',  structuralBlockers: ['low_confidence_plus_pattern'] }), true, 'review+combo hidden');
  assert.strictEqual(h({ shadowTier: 'standard',structuralBlockers: ['route_unresolved'] }), true, 'standard+route_unresolved hidden (Phase 6.5)');
  assert.strictEqual(h({ shadowTier: 'premium', structuralBlockers: ['invalid_phone'] }), true, 'premium+invalid_phone hidden (Phase 6.5)');
  assert.strictEqual(h({ shadowTier: 'hot',     structuralBlockers: ['distance_unknown'] }), true, 'hot+distance_unknown hidden (Phase 6.5)');

  // Fallback: no denormalized field, compute inline from validation
  assert.strictEqual(h({
    shadowTier: 'review', miles: 0,
    validation: { phone: { valid: true }, route: { suspicious: [] } },
  }), true, 'computed-inline distance_unknown hidden');

  console.log('  ✓ isHiddenFromMovers() in blocked_and_review (Phase 6.5: any-tier rule)');
}

// hiddenReason names the rule
{
  const m = loadFresh('blocked_and_review');
  assert.strictEqual(
    m.hiddenReason({ shadowTier: 'review', structuralBlockers: ['route_unresolved', 'distance_unknown'] }),
    'structural:route_unresolved,distance_unknown',
    'hiddenReason lists the structural codes'
  );
  console.log('  ✓ hiddenReason() names the structural rule');
}

// User's specific examples from the spec
{
  const m = loadFresh('blocked_and_review');
  const cases = [
    // [label, lead, expectedHidden]
    ['VoIP only',                  { shadowTier: 'review', validation: { phone: { valid: true, isVoip: true }, route: { suspicious: [] } }, miles: 500 }, false],
    ['Telecom unverified only',    { shadowTier: 'review', validation: { phone: { /* no checkedAt, no validityReason */ }, route: { suspicious: [] } }, miles: 500 }, false],
    ['Telecom low confidence only',{ shadowTier: 'review', validation: { phone: { valid: true, validityReason: 'twilio_no_enrichment' }, route: { suspicious: [] } }, miles: 500 }, false],
    ['Suspicion pattern only',     { shadowTier: 'review', validation: { phone: { valid: true, suspicionPattern: 'alternating_pattern_5plus' }, route: { suspicious: [] } }, miles: 500 }, false],
    ['Route unresolved',           { shadowTier: 'review', validation: { phone: { valid: true }, route: { suspicious: ['origin_zip_not_found'] } }, miles: 500 }, true],
    ['Invalid phone',              { shadowTier: 'review', validation: { phone: { valid: false }, route: { suspicious: [] } }, miles: 500 }, true],
    ['Pattern + low confidence',   { shadowTier: 'review', validation: { phone: { valid: true, validityReason: 'twilio_no_enrichment', suspicionPattern: 'alternating_pattern_5plus' }, route: { suspicious: [] } }, miles: 500 }, true],
  ];
  for (const [label, lead, expected] of cases) {
    const got = m.isHiddenFromMovers(lead);
    assert.strictEqual(got, expected, `user example: ${label} → hidden=${expected}`);
  }
  console.log('  ✓ user spec examples (VoIP/telecom-unverified visible; route/invalid/combo hidden)');
}

// rejected_only mode is UNCHANGED by Phase 6.4/6.5 (review leads still visible)
{
  const m = loadFresh('rejected_only');
  assert.strictEqual(m.isHiddenFromMovers({ shadowTier: 'review', structuralBlockers: ['route_unresolved'] }), false,
    'rejected_only: review with structural blockers STILL visible (no change to existing mode)');
  assert.strictEqual(m.isHiddenFromMovers({ shadowTier: 'rejected' }), true,
    'rejected_only: rejected still hidden');
  console.log('  ✓ rejected_only mode unchanged by Phase 6.4/6.5');
}

// Phase 6.6 — stale-lead simulation: filter must catch leads via raw-field
// fallback when the denormalized structuralBlockers field is missing.
//
// We simulate the Mongo filter logic in JS — for each "stale" lead doc,
// every clause in the $and array must evaluate TRUE to keep the lead.
// If ANY clause is FALSE, the lead is hidden.
{
  const { moverVisibilityFilter } = loadFresh('blocked_and_review');
  const filter = moverVisibilityFilter();
  const $and = filter.$and;

  // Faithful Mongo-style evaluator for our specific clause shapes
  function evalClause(clause, doc) {
    const [path] = Object.keys(clause);
    const op = clause[path];
    // Resolve dotted path
    const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
    if (op.$ne !== undefined) {
      // Mongo $ne against missing → TRUE (missing is "not equal")
      return value !== op.$ne;
    }
    if (op.$nin !== undefined) {
      // Mongo $nin against array → TRUE if no element of the array
      //   matches a value in the $nin list. Against missing → TRUE.
      //   Against scalar → TRUE if scalar not in list.
      if (value === undefined) return true;
      if (Array.isArray(value)) return value.every(v => !op.$nin.includes(v));
      return !op.$nin.includes(value);
    }
    if (op.$in !== undefined) {
      if (Array.isArray(value)) return value.some(v => op.$in.includes(v));
      return op.$in.includes(value);
    }
    if (op.$gte !== undefined) return value !== undefined && value >= op.$gte;
    if (op.$gt !== undefined) return value !== undefined && value > op.$gt;
    if (op.$lte !== undefined) return value !== undefined && value <= op.$lte;
    if (op.$exists !== undefined) {
      const exists = path.split('.').reduce(
        (o, k) => (o == null ? undefined : o[k]), doc) !== undefined;
      return exists === op.$exists;
    }
    return true;
  }
  function isVisible(doc) {
    return $and.every(clause => evalClause(clause, doc));
  }

  // The user's stale production lead: no structuralBlockers field,
  // shadowTier=review, qualityGateCleared either undefined or true,
  // BUT raw validation fields prove it's structural
  const userLead = {
    status: 'READY_FOR_DISTRIBUTION',
    shadowTier: 'review',
    qualityGateCleared: true, // set by old logic
    // structuralBlockers: missing (pre-Phase-6.5 lead)
    miles: 0,
    validation: {
      phone: { valid: false, suspicionPattern: 'low_distinct_3' },
      route: { suspicious: ['destination_zip_not_found'] },
    },
  };
  assert.strictEqual(isVisible(userLead), false,
    'stale lead with raw fields proving structural is HIDDEN by raw fallback');

  // Clean V5 lead — no validation issues, should be visible
  const cleanLead = {
    status: 'READY_FOR_DISTRIBUTION',
    shadowTier: 'standard',
    qualityGateCleared: true,
    structuralBlockers: [],
    miles: 500,
    validation: {
      phone: { valid: true, lineType: 'mobile', providerSuspicion: 'low' },
      route: { suspicious: [] },
    },
  };
  assert.strictEqual(isVisible(cleanLead), true, 'clean V5 lead visible');

  // V4 legacy lead — no validation fields at all, no shadowTier, no gate
  const v4Lead = {
    status: 'READY_FOR_DISTRIBUTION',
    miles: 500,
    // no validation, shadowTier, qualityGateCleared, structuralBlockers
  };
  assert.strictEqual(isVisible(v4Lead), true, 'V4 legacy lead visible (back-compat)');

  // Raw-field individual triggers
  assert.strictEqual(isVisible({ ...cleanLead, validation: { phone: { valid: false } } }), false,
    'raw: phone.valid=false hides');
  assert.strictEqual(isVisible({ ...cleanLead, validation: { route: { suspicious: ['origin_zip_not_found'] } } }), false,
    'raw: origin_zip_not_found hides');
  assert.strictEqual(isVisible({ ...cleanLead, validation: { route: { suspicious: ['destination_zip_not_found'] } } }), false,
    'raw: destination_zip_not_found hides');
  assert.strictEqual(isVisible({ ...cleanLead, miles: 0 }), false, 'raw: miles=0 hides');
  assert.strictEqual(isVisible({ ...cleanLead, validation: { phone: { providerSuspicion: 'high' } } }), false,
    'raw: providerSuspicion=high hides');
  assert.strictEqual(isVisible({ ...cleanLead, validation: { fraud: { smsPumpingRisk: 'high' } } }), false,
    'raw: high sms pumping hides');
  assert.strictEqual(isVisible({ ...cleanLead, validation: { fingerprint: { bot: true } } }), false,
    'raw: confirmed bot hides');

  console.log('  ✓ Phase 6.6 raw-field fallback catches stale/legacy structural leads');
}

// Phase 6.5 — tier router hard-reject combos
{
  const engine = require('../services/leadScoringEngine');
  const router = require('../services/leadTierRouter');

  function tierOf(validation, miles) {
    const lead = {
      customerPhone: '+11234561234', homeSize: '3 Bedroom',
      miles: miles ?? 500, moveDate: new Date(Date.now() + 5*86400000),
      originZip: '00000', destinationZip: '00000',
      intentConfirmed: true, funnelVersion: 'v5', validation,
    };
    const result = engine.score(lead);
    return router.assign(result.scores, lead).tier;
  }

  // User's failing production lead → MUST be rejected now
  assert.strictEqual(
    tierOf({
      phone: { valid: false, suspicionPattern: 'low_distinct_3', checkedAt: new Date() },
      route: { suspicious: ['origin_zip_not_found', 'destination_zip_not_found'], checkedAt: new Date() },
    }, 0),
    'rejected',
    'user prod lead (invalid+pattern+both ZIPs+distance) → rejected'
  );

  // Combo A: invalid + (route_unresolved OR distance_unknown)
  assert.strictEqual(
    tierOf({ phone: { valid: false, checkedAt: new Date() }, route: { suspicious: ['origin_zip_not_found'], checkedAt: new Date() } }, 500),
    'rejected', 'Combo A: invalid + route_unresolved → rejected'
  );
  assert.strictEqual(
    tierOf({ phone: { valid: false, checkedAt: new Date() }, route: { suspicious: [], checkedAt: new Date() } }, 0),
    'rejected', 'Combo A: invalid + distance_unknown → rejected'
  );

  // Combo B: both ZIPs unresolved (regardless of phone)
  assert.strictEqual(
    tierOf({
      phone: { valid: true, lineType: 'mobile', smsPumpingRisk: 'low', checkedAt: new Date() },
      route: { suspicious: ['origin_zip_not_found', 'destination_zip_not_found'], checkedAt: new Date() },
    }, 500),
    'rejected', 'Combo B: both ZIPs unresolved → rejected (even with valid phone)'
  );

  // Combo C: invalid + suspicious_pattern
  assert.strictEqual(
    tierOf({
      phone: { valid: false, suspicionPattern: 'low_distinct_3', checkedAt: new Date() },
      route: { suspicious: [], checkedAt: new Date() },
    }, 500),
    'rejected', 'Combo C: invalid + suspicious_pattern → rejected'
  );

  // SOFT cases stay review (not hard-rejected)
  assert.strictEqual(
    tierOf({ phone: { valid: false, checkedAt: new Date() }, route: { suspicious: [], checkedAt: new Date() } }, 500),
    'review', 'invalid phone alone → review (no hard reject)'
  );
  assert.strictEqual(
    tierOf({
      phone: { valid: true, lineType: 'mobile', smsPumpingRisk: 'low', checkedAt: new Date() },
      route: { suspicious: ['origin_zip_not_found'], checkedAt: new Date() },
    }, 0),
    'review', 'valid phone + one ZIP missing + distance unknown → review (soft)'
  );

  console.log('  ✓ tier router hard-reject combos (Phase 6.5)');
}

// ── Counters — Phase 6.2 ───────────────────────────────────────────────────
{
  const mod = loadFresh('rejected_only');
  // Fresh module → all counters start at 0
  assert.deepStrictEqual(mod.getCounters(), {
    mode: 'rejected_only', feed_hidden: 0, broadcasts_suppressed: 0, claim_blocked: 0,
  }, 'counters start at zero');

  mod.recordFeedHidden(5);
  mod.recordFeedHidden(3);
  mod.recordBroadcastSuppressed();
  mod.recordBroadcastSuppressed();
  mod.recordClaimBlocked();

  assert.deepStrictEqual(mod.getCounters(), {
    mode: 'rejected_only', feed_hidden: 8, broadcasts_suppressed: 2, claim_blocked: 1,
  }, 'counters increment correctly');

  // No-op cases
  mod.recordFeedHidden(0);
  mod.recordFeedHidden();
  assert.strictEqual(mod.getCounters().feed_hidden, 8, 'recordFeedHidden(0) is a no-op');

  // getCounters returns a copy — mutating it doesn't affect the live state
  const snap = mod.getCounters();
  snap.feed_hidden = 999;
  assert.strictEqual(mod.getCounters().feed_hidden, 8, 'getCounters returns a copy');

  console.log('  ✓ counters increment + getCounters snapshot');
}

console.log('\nAll leadVisibility smoke tests passed.');
