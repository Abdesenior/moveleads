/**
 * leadVisibility — Phase 3 smoke test.
 *
 * After the Phase 3 cutover, this module is a thin delegation layer over
 * the unified distributionDecision field. The 8-clause filter, the
 * ENABLE_TIERED_ROUTING env modes, and the per-mode behavior branches
 * have all been retired. What stays:
 *
 *   - routingMode() still parses the env (audit/log metadata)
 *   - moverVisibilityFilter() returns one clause: distributionDecision $in distributable
 *   - isHiddenFromMovers(lead) delegates to !isDistributable(decision)
 *   - hiddenReason(lead) names the current decision value
 *   - computeStructuralBlockers + HIDE_WORTHY_STRUCTURAL_CODES preserved
 *     for the writers (scoringPipeline + distributionDecision derivation)
 *   - counters preserved as no-op-safe hooks
 *
 * Run with: `node server/__tests__/leadVisibility.test.js`
 */

const assert = require('assert');

process.env.LEAD_VISIBILITY_REPORT_INTERVAL_MS = '0';

function loadFresh(envValue) {
  delete require.cache[require.resolve('../utils/leadVisibility')];
  delete require.cache[require.resolve('../utils/distributionDecision')];
  if (envValue === undefined) delete process.env.ENABLE_TIERED_ROUTING;
  else process.env.ENABLE_TIERED_ROUTING = envValue;
  return require('../utils/leadVisibility');
}

// ── routingMode() — preserved for audit metadata only ────────────────────
{
  const { routingMode } = loadFresh(undefined);
  assert.strictEqual(routingMode('true'),               'off');
  assert.strictEqual(routingMode('full'),               'off');
  assert.strictEqual(routingMode('rejected_only'),      'rejected_only');
  assert.strictEqual(routingMode('blocked_and_review'), 'blocked_and_review');
  assert.strictEqual(routingMode('GARBAGE'),            'off');
  assert.strictEqual(routingMode(undefined),            'off');
  assert.strictEqual(routingMode(''),                   'off');
  assert.strictEqual(routingMode('  REJECTED_ONLY  '),  'rejected_only', 'case+whitespace ok');
  console.log('  ✓ routingMode() parsing (audit metadata only — no behavior branch)');
}

// ── moverVisibilityFilter — single clause, env-independent ───────────────
{
  for (const env of [undefined, 'off', 'rejected_only', 'blocked_and_review', 'full', 'garbage']) {
    const filter = loadFresh(env).moverVisibilityFilter();
    assert.deepStrictEqual(
      filter,
      { distributionDecision: { $in: ['system_approved', 'admin_approved'] } },
      `env=${env || '(unset)'} → single distributionDecision clause`
    );
  }
  console.log('  ✓ moverVisibilityFilter() returns single distributionDecision clause regardless of env');
}

// ── isHiddenFromMovers — delegates to distributionDecision ───────────────
{
  const m = loadFresh(undefined);
  const h = (lead) => m.isHiddenFromMovers(lead);

  // Distributable values → visible.
  assert.strictEqual(h({ distributionDecision: 'system_approved' }), false, 'system_approved → visible');
  assert.strictEqual(h({ distributionDecision: 'admin_approved' }),  false, 'admin_approved → visible');

  // Non-distributable values → hidden.
  assert.strictEqual(h({ distributionDecision: 'system_pending'  }), true, 'system_pending → hidden');
  assert.strictEqual(h({ distributionDecision: 'system_held'     }), true, 'system_held → hidden');
  assert.strictEqual(h({ distributionDecision: 'system_rejected' }), true, 'system_rejected → hidden');
  assert.strictEqual(h({ distributionDecision: 'admin_rejected'  }), true, 'admin_rejected → hidden');

  // Missing/undefined decision → hidden (fail closed — defensive).
  assert.strictEqual(h({}), true, 'no decision field → hidden');
  assert.strictEqual(h({ distributionDecision: undefined }), true, 'undefined decision → hidden');

  // Null lead → fail open (caller will likely 404).
  assert.strictEqual(h(null), false, 'null lead → fail open');

  // Critical Phase 3 invariant: legacy raw signals NO LONGER hide a lead
  // once distributionDecision says distribute. This is the silent-block fix.
  assert.strictEqual(h({
    distributionDecision: 'admin_approved',
    shadowTier: 'rejected',                              // would have hidden in legacy
    qualityGateCleared: false,                           // would have hidden in legacy
    structuralBlockers: ['invalid_phone'],               // would have hidden in legacy
    validation: { phone: { suspicionPattern: 'alternating', valid: false } },
    adminTierOverride: { tier: 'rejected' },
  }), false, 'admin_approved overrides all legacy raw signals');

  // The dual invariant: system_held stays hidden EVEN if all old gates
  // would have passed (clean evidence). This codifies that the decision
  // field is now authoritative — evidence on the doc is audit-only.
  assert.strictEqual(h({
    distributionDecision: 'system_held',
    shadowTier: 'standard',
    qualityGateCleared: true,
    structuralBlockers: [],
    validation: { phone: { valid: true } },
  }), true, 'system_held stays hidden even with clean evidence (decision is authoritative)');

  console.log('  ✓ isHiddenFromMovers() delegates to distributionDecision (env-independent)');
}

// ── hiddenReason — names the decision value ──────────────────────────────
{
  const { hiddenReason } = loadFresh(undefined);
  assert.strictEqual(hiddenReason({ distributionDecision: 'system_approved' }), null,
    'distributable → null reason');
  assert.strictEqual(hiddenReason({ distributionDecision: 'system_held' }),
    'distributionDecision=system_held', 'reason names the decision');
  assert.strictEqual(hiddenReason({ distributionDecision: 'admin_rejected' }),
    'distributionDecision=admin_rejected', 'admin_rejected named');
  assert.strictEqual(hiddenReason({}), 'distributionDecision=unset', 'missing decision named');
  assert.strictEqual(hiddenReason(null), null, 'null lead → null reason');
  console.log('  ✓ hiddenReason() names the decision value');
}

// ── computeStructuralBlockers — preserved for writers ────────────────────
{
  const { computeStructuralBlockers, HIDE_WORTHY_STRUCTURAL_CODES } = loadFresh(undefined);
  const b = (lead) => computeStructuralBlockers(lead);

  assert.deepStrictEqual(b({ miles: 500, validation: { phone: { valid: true }, route: { suspicious: [] } } }), [], 'clean lead → no blockers');
  assert.deepStrictEqual(b({ miles: 500, validation: { phone: { valid: false }, route: { suspicious: [] } } }), ['invalid_phone']);
  assert.deepStrictEqual(b({ miles: 0,   validation: { phone: { valid: true },  route: { suspicious: [] } } }), ['distance_unknown']);
  assert.deepStrictEqual(b({ miles: 500, validation: { phone: { valid: true },  route: { suspicious: ['origin_zip_not_found'] } } }), ['route_unresolved']);
  assert.deepStrictEqual(b({ miles: 500, validation: { phone: { valid: true, suspicionPattern: 'alternating' }, route: { suspicious: [] } } }), ['suspicion_pattern']);
  assert.deepStrictEqual(b({ miles: 500, validation: { phone: { valid: true, providerSuspicion: 'high' }, route: { suspicious: [] } } }), ['suspicious_carrier']);
  assert.deepStrictEqual(b({ miles: 500, validation: { phone: { valid: true }, route: { suspicious: [] }, fraud: { smsPumpingRisk: 'high' } } }), ['high_sms_pumping']);
  assert.deepStrictEqual(b({ miles: 500, validation: { phone: { valid: true }, route: { suspicious: [] }, fingerprint: { bot: true } } }), ['fingerprint_bot']);
  assert.deepStrictEqual(b(null),       [], 'null → no blockers');
  assert.deepStrictEqual(b(undefined),  [], 'undefined → no blockers');

  // HIDE_WORTHY_STRUCTURAL_CODES exposed for the writers.
  assert.ok(Array.isArray(HIDE_WORTHY_STRUCTURAL_CODES));
  assert.ok(HIDE_WORTHY_STRUCTURAL_CODES.includes('invalid_phone'));
  assert.ok(HIDE_WORTHY_STRUCTURAL_CODES.includes('route_unresolved'));
  assert.ok(HIDE_WORTHY_STRUCTURAL_CODES.includes('distance_unknown'));
  assert.ok(HIDE_WORTHY_STRUCTURAL_CODES.includes('suspicion_pattern'));

  console.log('  ✓ computeStructuralBlockers + HIDE_WORTHY_STRUCTURAL_CODES preserved for writers');
}

// ── Counters — preserved hooks (no-op-safe) ──────────────────────────────
{
  const mod = loadFresh(undefined);
  assert.deepStrictEqual(mod.getCounters(), { mode: 'off', feed_hidden: 0, broadcasts_suppressed: 0, claim_blocked: 0 });
  mod.recordFeedHidden(5);
  mod.recordBroadcastSuppressed();
  mod.recordClaimBlocked();
  const snap = mod.getCounters();
  assert.strictEqual(snap.feed_hidden, 5);
  assert.strictEqual(snap.broadcasts_suppressed, 1);
  assert.strictEqual(snap.claim_blocked, 1);
  console.log('  ✓ counters preserved as no-op-safe hooks');
}

// ── isHiddenFromMoversById — async variant, single field fetch ───────────
{
  const { isHiddenFromMoversById } = loadFresh(undefined);
  assert.strictEqual(typeof isHiddenFromMoversById, 'function', 'isHiddenFromMoversById exported');
  console.log('  ✓ isHiddenFromMoversById exported');
}

// ── Sync invariant: leadVisibility's inline isDistributable matches the
// canonical predicate exported by distributionDecision. The inline copy
// exists to avoid the circular import (leadVisibility ↔ distributionDecision);
// this test enforces they don't drift apart.
{
  delete require.cache[require.resolve('../utils/distributionDecision')];
  const dd = require('../utils/distributionDecision');
  const lvMod = loadFresh(undefined);
  // Exercise the predicate indirectly via isHiddenFromMovers — true for
  // distributable values, false otherwise.
  for (const v of ['system_pending','system_approved','system_held','system_rejected','admin_approved','admin_rejected']) {
    const canonical = dd.isDistributable(v);
    const inline    = !lvMod.isHiddenFromMovers({ distributionDecision: v });
    assert.strictEqual(inline, canonical,
      `isDistributable(${v}): leadVisibility inline (${inline}) must match distributionDecision canonical (${canonical})`);
  }
  console.log('  ✓ leadVisibility inline predicate matches distributionDecision canonical');
}

console.log('\nAll Phase 3 leadVisibility smoke tests passed.');
