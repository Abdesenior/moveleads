/**
 * Phase 2 — decisionDrift logger smoke tests.
 *
 * Pure-Node, no Mongo required. Five blocks:
 *
 *   A. Env-flag parsing matrix (isEnabled, sampleRate, fullScanEnabled)
 *   B. buildDriftRow shape exhaustive matrix
 *   C. inspectAndLog behavior — light-weight path (old_only detection)
 *   D. inspectAndLog behavior — full-scan path (both delta directions)
 *   E. Static wiring checks: routes/leads.js calls decisionDrift at both
 *      endpoints, gated by isEnabled, with the correct predicates.
 *
 * Run with: `node server/__tests__/decisionDrift.test.js`
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function reloadModule() {
  delete require.cache[require.resolve('../utils/decisionDrift')];
  return require('../utils/decisionDrift');
}

// ── A. env-flag parsing matrix ────────────────────────────────────────────
{
  const savedEnable = process.env.ENABLE_DECISION_DRIFT_LOGGING;
  const savedSample = process.env.DECISION_DRIFT_SAMPLE_RATE;
  const savedFull   = process.env.DECISION_DRIFT_FULL_SCAN;

  function setEnv(enable, sample, full) {
    if (enable === undefined) delete process.env.ENABLE_DECISION_DRIFT_LOGGING;
    else process.env.ENABLE_DECISION_DRIFT_LOGGING = enable;
    if (sample === undefined) delete process.env.DECISION_DRIFT_SAMPLE_RATE;
    else process.env.DECISION_DRIFT_SAMPLE_RATE = sample;
    if (full === undefined) delete process.env.DECISION_DRIFT_FULL_SCAN;
    else process.env.DECISION_DRIFT_FULL_SCAN = full;
    return reloadModule();
  }

  let m;

  m = setEnv(undefined);
  assert.strictEqual(m.isEnabled(),       false, 'A.1 default isEnabled=false');
  assert.strictEqual(m.sampleRate(),      1.0,   'A.1 default sampleRate=1.0');
  assert.strictEqual(m.fullScanEnabled(), false, 'A.1 default fullScan=false');

  m = setEnv('true');
  assert.strictEqual(m.isEnabled(), true, 'A.2 ENABLE=true → on');
  m = setEnv('1');
  assert.strictEqual(m.isEnabled(), true, 'A.2 ENABLE=1 → on');
  m = setEnv('YES');
  assert.strictEqual(m.isEnabled(), true, 'A.2 ENABLE=YES → on (case-insensitive)');
  m = setEnv('off');
  assert.strictEqual(m.isEnabled(), false, 'A.2 ENABLE=off → off');
  m = setEnv('garbage');
  assert.strictEqual(m.isEnabled(), false, 'A.2 ENABLE=garbage → off (conservative)');

  m = setEnv(undefined, '0.5');
  assert.strictEqual(m.sampleRate(), 0.5, 'A.3 sample=0.5 → 0.5');
  m = setEnv(undefined, '0');
  assert.strictEqual(m.sampleRate(), 0,   'A.3 sample=0 → 0');
  m = setEnv(undefined, '5');
  assert.strictEqual(m.sampleRate(), 1.0, 'A.3 sample=5 → clamped to 1.0');
  m = setEnv(undefined, '-1');
  assert.strictEqual(m.sampleRate(), 1.0, 'A.3 sample=-1 → defaulted to 1.0');
  m = setEnv(undefined, 'not-a-number');
  assert.strictEqual(m.sampleRate(), 1.0, 'A.3 sample=NaN → defaulted to 1.0');

  m = setEnv(undefined, undefined, 'true');
  assert.strictEqual(m.fullScanEnabled(), true, 'A.4 FULL_SCAN=true → on');
  m = setEnv(undefined, undefined, undefined);
  assert.strictEqual(m.fullScanEnabled(), false, 'A.4 FULL_SCAN unset → off');

  // shouldSample at sample=1 always true; at sample=0 always false.
  m = setEnv(undefined, '1');
  for (let i = 0; i < 20; i++) assert.strictEqual(m.shouldSample(), true,  `A.5 sample=1 always true (iter ${i})`);
  m = setEnv(undefined, '0');
  for (let i = 0; i < 20; i++) assert.strictEqual(m.shouldSample(), false, `A.5 sample=0 always false (iter ${i})`);

  // Restore env
  if (savedEnable === undefined) delete process.env.ENABLE_DECISION_DRIFT_LOGGING; else process.env.ENABLE_DECISION_DRIFT_LOGGING = savedEnable;
  if (savedSample === undefined) delete process.env.DECISION_DRIFT_SAMPLE_RATE;     else process.env.DECISION_DRIFT_SAMPLE_RATE     = savedSample;
  if (savedFull   === undefined) delete process.env.DECISION_DRIFT_FULL_SCAN;       else process.env.DECISION_DRIFT_FULL_SCAN       = savedFull;

  console.log('  ✓ A. env-flag parsing matrix');
}

// ── B. buildDriftRow shape ────────────────────────────────────────────────
{
  const m = reloadModule();
  const past = new Date(Date.now() - 86400000);

  const lead = {
    _id: 'lead-001',
    status: 'READY_FOR_DISTRIBUTION',
    distributionModel: 'auction',
    inventoryChannel: 'main',
    moveDate: past,
    structuralBlockers: ['invalid_phone'],
    adminTierOverride: { tier: 'standard', by: 'admin-1', at: new Date('2026-05-19T00:00:00Z') },
    qualityGateCleared: true,
    shadowTier: 'review',
    distributionDecision: 'admin_approved',
    distributionDecisionReason: 'admin approved for distribution',
    miles: 0,
    validation: {
      phone: { valid: false, suspicionPattern: 'alternating', providerSuspicion: 'high' },
      route: { suspicious: ['origin_zip_not_found'] },
      fraud: { smsPumpingRisk: 'high' },
      fingerprint: { bot: true },
    },
  };

  const row = m.buildDriftRow(lead, { endpoint: '/api/leads', oldIncludes: false, newIncludes: true });

  assert.strictEqual(row.evt, 'decision_drift', 'B.1 evt is decision_drift');
  assert.strictEqual(row.leadId, 'lead-001',     'B.1 leadId stringified');
  assert.strictEqual(row.endpoint, '/api/leads', 'B.1 endpoint preserved');
  assert.strictEqual(row.delta, 'new_only',      'B.2 false→true delta=new_only');

  // Snapshot of key fields the operator asked for:
  assert.strictEqual(row.status, 'READY_FOR_DISTRIBUTION', 'B.3 status');
  assert.strictEqual(row.distributionModel, 'auction',     'B.3 distributionModel');
  assert.strictEqual(row.inventoryChannel, 'main',         'B.3 inventoryChannel');
  assert.deepStrictEqual(row.structuralBlockers, ['invalid_phone'], 'B.3 structuralBlockers');
  assert.strictEqual(row.adminTierOverride.tier, 'standard', 'B.3 override.tier');
  assert.strictEqual(row.adminTierOverride.by,   'admin-1',  'B.3 override.by stringified');
  assert.strictEqual(row.qualityGateCleared, true, 'B.3 qualityGateCleared');
  assert.strictEqual(row.shadowTier, 'review',      'B.3 shadowTier');
  assert.strictEqual(row.decision, 'admin_approved',                 'B.3 decision');
  assert.strictEqual(row.decisionReason, 'admin approved for distribution', 'B.3 decisionReason');

  // moveDatePast — past moveDate → true.
  assert.strictEqual(row.moveDatePast, true, 'B.4 moveDate in past → moveDatePast=true');

  // Validation flags exhaustive.
  assert.deepStrictEqual(row.validationFlags, {
    phoneValidFalse:       true,
    suspicionPattern:      'alternating',
    providerSuspicionHigh: true,
    smsPumpingHigh:        true,
    fingerprintBot:        true,
    routeUnresolved:       true,
    milesZero:             true,
  }, 'B.5 validationFlags reflect all raw signals');

  // Empty-ish lead — defaults safe.
  const row2 = m.buildDriftRow({ _id: 'x', miles: 100 }, { endpoint: '/api/leads', oldIncludes: true, newIncludes: true });
  assert.strictEqual(row2.delta, 'agree', 'B.6 true→true delta=agree');
  assert.strictEqual(row2.adminTierOverride, null, 'B.6 no override → null');
  assert.strictEqual(row2.validationFlags.milesZero, false, 'B.6 miles=100 → milesZero=false');
  assert.strictEqual(row2.structuralBlockers.length, 0, 'B.6 no blockers → []');

  // old_only delta direction.
  const row3 = m.buildDriftRow({ _id: 'y', miles: 100 }, { endpoint: '/api/leads', oldIncludes: true, newIncludes: false });
  assert.strictEqual(row3.delta, 'old_only', 'B.7 true→false delta=old_only');

  console.log('  ✓ B. buildDriftRow shape exhaustive');
}

// ── C. inspectAndLog — light-weight path ──────────────────────────────────
// In light-weight mode, `included` is the production result set. Every lead
// in it passed the OLD filter; we check NEW per-lead.
{
  // Capture console.log output by patching.
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); };
  process.env.ENABLE_DECISION_DRIFT_LOGGING = 'true';
  process.env.DECISION_DRIFT_SAMPLE_RATE   = '1';
  delete process.env.DECISION_DRIFT_FULL_SCAN;
  const m = reloadModule();

  const included = [
    // Lead 1: agrees (new field would also distribute) — no row logged.
    { _id: 'L1', distributionDecision: 'system_approved' },
    // Lead 2: new field would HIDE — old_only drift, row logged.
    { _id: 'L2', distributionDecision: 'system_held', status: 'READY_FOR_DISTRIBUTION', miles: 100 },
    // Lead 3: also old_only — admin_rejected (sticky no).
    { _id: 'L3', distributionDecision: 'admin_rejected', miles: 100 },
    // Lead 4: agrees (admin_approved).
    { _id: 'L4', distributionDecision: 'admin_approved' },
  ];

  m.inspectAndLog({ endpoint: '/api/leads', included });

  // Restore console.
  console.log = origLog;

  // Expect 2 drift rows (L2, L3) + 1 summary line = 3 log lines.
  assert.strictEqual(logs.length, 3, `C.1 light-weight path: 2 drift rows + 1 summary, got ${logs.length}`);

  // First two lines are drift rows.
  const driftLines = logs.slice(0, 2).map(s => JSON.parse(s));
  const summaryLine = JSON.parse(logs[2]);
  const driftIds = driftLines.map(r => r.leadId).sort();
  assert.deepStrictEqual(driftIds, ['L2', 'L3'], 'C.2 drift rows are exactly L2 + L3');
  for (const r of driftLines) {
    assert.strictEqual(r.delta, 'old_only', `C.3 ${r.leadId} delta=old_only`);
    assert.strictEqual(r.oldFilterIncludes, true,  `C.3 ${r.leadId} oldFilterIncludes=true`);
    assert.strictEqual(r.newDecisionIncludes, false, `C.3 ${r.leadId} newDecisionIncludes=false`);
  }

  // Summary line invariants.
  assert.strictEqual(summaryLine.evt, 'decision_drift_summary', 'C.4 summary evt');
  assert.strictEqual(summaryLine.endpoint, '/api/leads',         'C.4 summary endpoint');
  assert.strictEqual(summaryLine.candidates, 4, 'C.4 summary candidates=4');
  assert.strictEqual(summaryLine.old_pass,  4, 'C.4 summary old_pass=4 (light-weight: all included)');
  assert.strictEqual(summaryLine.new_pass,  2, 'C.4 summary new_pass=2 (L1+L4)');
  assert.strictEqual(summaryLine.agree,     2, 'C.4 summary agree=2');
  assert.strictEqual(summaryLine.old_only,  2, 'C.4 summary old_only=2');
  assert.strictEqual(summaryLine.new_only,  0, 'C.4 summary new_only=0 (light-weight cannot see new_only)');
  assert.strictEqual(summaryLine.full_scan, false, 'C.4 summary full_scan=false');

  console.log('  ✓ C. inspectAndLog light-weight path');
}

// ── D. inspectAndLog — full-scan path ─────────────────────────────────────
{
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); };
  process.env.ENABLE_DECISION_DRIFT_LOGGING = 'true';
  process.env.DECISION_DRIFT_SAMPLE_RATE   = '1';
  process.env.DECISION_DRIFT_FULL_SCAN     = 'true';
  const m = reloadModule();

  // Use injected predicates so we don't need to wire up real validation/
  // adminTierOverride state. This isolates the inspectAndLog control flow.
  const candidates = [
    { _id: 'A', distributionDecision: 'system_approved', _oldPass: true,  _newPass: true  },  // agree
    { _id: 'B', distributionDecision: 'system_held',     _oldPass: true,  _newPass: false },  // old_only
    { _id: 'C', distributionDecision: 'admin_approved',  _oldPass: false, _newPass: true  },  // NEW_ONLY (the win)
    { _id: 'D', distributionDecision: 'system_rejected', _oldPass: false, _newPass: false },  // both hide → agree
  ];

  m.inspectAndLog({
    endpoint: '/api/leads',
    included: [],
    candidates,
    oldPredicate: (l) => !!l._oldPass,
    newPredicate: (l) => !!l._newPass,
  });

  console.log = origLog;

  // Expect 2 drift rows (B + C) + 1 summary.
  assert.strictEqual(logs.length, 3, `D.1 full-scan path: 2 drift rows + 1 summary, got ${logs.length}`);

  const driftLines = logs.slice(0, 2).map(s => JSON.parse(s));
  const summaryLine = JSON.parse(logs[2]);
  const driftById = Object.fromEntries(driftLines.map(r => [r.leadId, r]));
  assert.strictEqual(driftById.B && driftById.B.delta, 'old_only', 'D.2 B is old_only');
  assert.strictEqual(driftById.C && driftById.C.delta, 'new_only', 'D.2 C is new_only (the bug-fix direction)');

  assert.strictEqual(summaryLine.candidates, 4, 'D.3 candidates=4');
  assert.strictEqual(summaryLine.old_pass,  2, 'D.3 old_pass=2 (A,B)');
  assert.strictEqual(summaryLine.new_pass,  2, 'D.3 new_pass=2 (A,C)');
  assert.strictEqual(summaryLine.agree,     2, 'D.3 agree=2 (A,D)');
  assert.strictEqual(summaryLine.old_only,  1, 'D.3 old_only=1 (B)');
  assert.strictEqual(summaryLine.new_only,  1, 'D.3 new_only=1 (C)');
  assert.strictEqual(summaryLine.full_scan, true, 'D.3 full_scan=true');

  // Clean up env.
  delete process.env.ENABLE_DECISION_DRIFT_LOGGING;
  delete process.env.DECISION_DRIFT_SAMPLE_RATE;
  delete process.env.DECISION_DRIFT_FULL_SCAN;

  console.log('  ✓ D. inspectAndLog full-scan path (both deltas detected)');
}

// ── E. Static wiring checks in routes/leads.js ────────────────────────────
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');

  // Helper imported.
  assert.ok(/require\(['"]\.\.\/utils\/decisionDrift['"]\)/.test(src),
    'E.1 routes/leads.js must require utils/decisionDrift');

  // Wired into BOTH endpoints — each call passes a string endpoint label.
  assert.ok(/decisionDrift\.inspectAndLog\(\s*\{[\s\S]{0,400}endpoint:\s*['"]\/api\/leads\/deals['"]/.test(src),
    'E.2 must call inspectAndLog for the /api/leads/deals endpoint');
  assert.ok(/decisionDrift\.inspectAndLog\(\s*\{[\s\S]{0,400}endpoint:\s*['"]\/api\/leads['"]/.test(src),
    'E.2 must call inspectAndLog for the /api/leads endpoint');

  // Main feed predicate encodes the Phase D distributionModel='instant' clause.
  // Without this, the drift comparison would miss leads stuck behind the
  // distributionModel gate (which Phase 3 retires).
  assert.ok(/oldPredicate:\s*\(lead\)\s*=>\s*!isHiddenFromMovers\(lead\)\s*&&\s*lead\.distributionModel\s*===\s*['"]instant['"]/.test(src),
    'E.3 main-feed oldPredicate must combine !isHiddenFromMovers && distributionModel==="instant"');

  // Both endpoints must check isEnabled BEFORE doing any drift work — so
  // production paths pay zero cost when the flag is off.
  assert.ok(/if\s*\(\s*!isAdmin\s*&&\s*decisionDrift\.isEnabled\(\)/.test(src),
    'E.4 main-feed drift block must be gated on !isAdmin && decisionDrift.isEnabled()');
  assert.ok(/if\s*\(\s*decisionDrift\.isEnabled\(\)\s*\)/.test(src),
    'E.4 deals drift block must be gated on decisionDrift.isEnabled()');

  // Full-scan candidate fetch is opt-in via decisionDrift.fullScanEnabled().
  assert.ok(/decisionDrift\.fullScanEnabled\(\)/.test(src),
    'E.5 full-scan candidate fetch must be gated on fullScanEnabled()');

  console.log('  ✓ E. static wiring checks in routes/leads.js');
}

console.log('\nAll Phase 2 decisionDrift smoke tests passed.');
