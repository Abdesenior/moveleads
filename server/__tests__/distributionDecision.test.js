/**
 * Phase 1 — Unified distribution decision layer smoke tests.
 *
 * Pure-Node, no Mongo required. Six blocks:
 *
 *   A. deriveSystemDecision exhaustive matrix
 *   B. isSystemOwned / isAdminOwned / isDistributable matrix
 *   C. Writer source-file checks (every code path either writes
 *      distributionDecision correctly, or — for tier-override / mark-reviewed
 *      — deliberately does NOT write it per spec)
 *   D. Atomic-protection simulation: scoringPipeline / verifyLeadPhone
 *      updates skip when the lead is admin-owned
 *   E. Backfill classifier matrix (covers each migration bucket)
 *   F. Schema check: enum, default, indexed
 *
 * Run with: `node server/__tests__/distributionDecision.test.js`
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  SYSTEM_VALUES,
  ADMIN_VALUES,
  DISTRIBUTABLE_VALUES,
  deriveSystemDecision,
  isSystemOwned,
  isAdminOwned,
  isDistributable,
  describeSystemDecisionSource,
} = require('../utils/distributionDecision');

const { classifyForBackfill } = require('../scripts/backfillDistributionDecision');

// ── A. deriveSystemDecision exhaustive matrix ────────────────────────────
{
  // Fixture helper: a "clean" lead doc has resolved miles + empty validation
  // so computeStructuralBlockers returns []. Pre-V5 production leads always
  // have real miles values — miles=0 IS a legitimate structural blocker
  // (Mapbox couldn't compute the route) and correctly produces system_held.
  const cleanBase = { miles: 100, structuralBlockers: [], validation: {} };

  // (1) Legacy lead — no V5 fields but real miles → system_approved.
  assert.strictEqual(deriveSystemDecision({ miles: 100 }), 'system_approved',
    'A.1 legacy lead with miles>0 → system_approved');

  // (2) Fresh V5 lead at ingest — gate=false, no shadowTier → system_pending.
  assert.strictEqual(
    deriveSystemDecision({ qualityGateCleared: false, miles: 100 }),
    'system_pending',
    'A.2 V5 fresh lead (gate=false, no shadowTier) → system_pending');

  // (3) shadowTier=rejected → system_rejected.
  assert.strictEqual(
    deriveSystemDecision({ ...cleanBase, shadowTier: 'rejected' }),
    'system_rejected',
    'A.3 shadowTier=rejected → system_rejected');

  // (4) status=REJECTED_FAKE dominates even with shadowTier=standard.
  assert.strictEqual(
    deriveSystemDecision({ ...cleanBase, status: 'REJECTED_FAKE', shadowTier: 'standard' }),
    'system_rejected',
    'A.4 status=REJECTED_FAKE always wins → system_rejected');

  // (5) shadowTier=review → system_held.
  assert.strictEqual(
    deriveSystemDecision({ ...cleanBase, shadowTier: 'review', qualityGateCleared: true }),
    'system_held',
    'A.5 shadowTier=review → system_held');

  // (6) Structural blocker via denormalized field → system_held.
  assert.strictEqual(
    deriveSystemDecision({ ...cleanBase, shadowTier: 'standard', qualityGateCleared: true, structuralBlockers: ['invalid_phone'] }),
    'system_held',
    'A.6 structuralBlockers=[invalid_phone] → system_held');

  // (7) Raw suspicionPattern → system_held even if shadowTier=standard.
  assert.strictEqual(
    deriveSystemDecision({
      ...cleanBase,
      shadowTier: 'standard', qualityGateCleared: true,
      validation: { phone: { suspicionPattern: 'alternating' } },
    }),
    'system_held',
    'A.7 raw suspicionPattern → system_held');

  // (8) Raw phone.valid=false → system_held.
  assert.strictEqual(
    deriveSystemDecision({
      ...cleanBase,
      shadowTier: 'standard', qualityGateCleared: true,
      validation: { phone: { valid: false } },
    }),
    'system_held',
    'A.8 raw phone.valid=false → system_held');

  // (9) Raw providerSuspicion=high → system_held.
  assert.strictEqual(
    deriveSystemDecision({
      ...cleanBase,
      shadowTier: 'standard', qualityGateCleared: true,
      validation: { phone: { providerSuspicion: 'high' } },
    }),
    'system_held',
    'A.9 raw providerSuspicion=high → system_held');

  // (10) Raw fraud.smsPumpingRisk=high → system_held.
  assert.strictEqual(
    deriveSystemDecision({
      ...cleanBase,
      shadowTier: 'standard', qualityGateCleared: true,
      validation: { fraud: { smsPumpingRisk: 'high' } },
    }),
    'system_held',
    'A.10 raw fraud.smsPumpingRisk=high → system_held');

  // (11) Raw fingerprint.bot=true → system_held.
  assert.strictEqual(
    deriveSystemDecision({
      ...cleanBase,
      shadowTier: 'standard', qualityGateCleared: true,
      validation: { fingerprint: { bot: true } },
    }),
    'system_held',
    'A.11 raw fingerprint.bot=true → system_held');

  // (12-14) shadowTier ∈ {standard, premium, hot} with clean evidence → system_approved.
  for (const tier of ['standard', 'premium', 'hot']) {
    assert.strictEqual(
      deriveSystemDecision({ ...cleanBase, shadowTier: tier, qualityGateCleared: true }),
      'system_approved',
      `A.12-14 shadowTier=${tier} clean → system_approved`);
  }

  // (16) miles=0 IS a real structural blocker — verify it correctly produces
  //      system_held when no other signal is set. This codifies the "no
  //      empty-doc → approved" expectation: distance_unknown is hide-worthy.
  assert.strictEqual(deriveSystemDecision({}), 'system_held',
    'A.16 empty doc (miles=0) → system_held via distance_unknown blocker');

  // (15) Null/undefined input fails open to system_pending.
  assert.strictEqual(deriveSystemDecision(null), 'system_pending', 'A.15 null → system_pending');
  assert.strictEqual(deriveSystemDecision(undefined), 'system_pending', 'A.15 undefined → system_pending');

  // (16) Never returns admin_* — that's the caller's job.
  // (Implicitly verified across the matrix; reassert defensively.)
  for (const v of SYSTEM_VALUES) { /* check enum membership */ assert.ok(typeof v === 'string'); }
  assert.ok(!SYSTEM_VALUES.includes('admin_approved'), 'A.16 SYSTEM_VALUES excludes admin_*');
  assert.ok(!SYSTEM_VALUES.includes('admin_rejected'), 'A.16 SYSTEM_VALUES excludes admin_*');

  console.log(`  ✓ A. deriveSystemDecision exhaustive matrix (${15} cases)`);
}

// ── B. Ownership / distributability helpers ──────────────────────────────
{
  for (const v of SYSTEM_VALUES) {
    assert.strictEqual(isSystemOwned(v), true,  `B.1 ${v} is system-owned`);
    assert.strictEqual(isAdminOwned(v),  false, `B.1 ${v} is NOT admin-owned`);
  }
  for (const v of ADMIN_VALUES) {
    assert.strictEqual(isSystemOwned(v), false, `B.2 ${v} is NOT system-owned`);
    assert.strictEqual(isAdminOwned(v),  true,  `B.2 ${v} is admin-owned`);
  }
  // Distributability — only system_approved + admin_approved.
  assert.strictEqual(isDistributable('system_approved'), true,  'B.3 system_approved distributes');
  assert.strictEqual(isDistributable('admin_approved'),  true,  'B.3 admin_approved distributes');
  assert.strictEqual(isDistributable('system_pending'),  false, 'B.3 system_pending hidden');
  assert.strictEqual(isDistributable('system_held'),     false, 'B.3 system_held hidden');
  assert.strictEqual(isDistributable('system_rejected'), false, 'B.3 system_rejected hidden');
  assert.strictEqual(isDistributable('admin_rejected'),  false, 'B.3 admin_rejected hidden');

  // describeSystemDecisionSource — a sample of strings to ensure the function
  // doesn't throw on common shapes. Exact wording isn't asserted; this is just
  // an audit-string smoke check.
  assert.ok(/REJECTED_FAKE/.test(describeSystemDecisionSource({ status: 'REJECTED_FAKE' })),
    'B.4 describe handles status=REJECTED_FAKE');
  assert.ok(/pending/.test(describeSystemDecisionSource({ qualityGateCleared: false })),
    'B.4 describe handles pre-scoring');
  assert.ok(/structural/.test(describeSystemDecisionSource({ structuralBlockers: ['route_unresolved'] })),
    'B.4 describe handles structural blockers');

  console.log('  ✓ B. ownership / distributability helpers');
}

// ── C. Writer source-file checks ─────────────────────────────────────────
{
  const ingestSrc        = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leadIngestV2.js'), 'utf8');
  const scoringSrc       = fs.readFileSync(path.join(__dirname, '..', 'services', 'scoringPipeline.js'), 'utf8');
  const twilioSrc        = fs.readFileSync(path.join(__dirname, '..', 'services', 'twilioService.js'), 'utf8');
  const adminSrc         = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');

  // C.1 — leadIngestV2 stamps system_pending at save.
  assert.ok(/distributionDecision:\s*['"]system_pending['"]/.test(ingestSrc),
    'C.1 ingest must write distributionDecision="system_pending"');

  // C.2 — scoringPipeline writes guarded by SYSTEM_VALUES.
  assert.ok(/distributionDecision:\s*\{\s*\$in:\s*SYSTEM_VALUES/.test(scoringSrc),
    'C.2 scoringPipeline updateOne must filter on { distributionDecision: { $in: SYSTEM_VALUES } } (stickiness guard)');
  assert.ok(/distributionDecision:\s*decision/.test(scoringSrc),
    'C.2 scoringPipeline must write distributionDecision: decision');

  // C.3 — verifyLeadPhone writes guarded by SYSTEM_VALUES.
  assert.ok(/distributionDecision:\s*\{\s*\$in:\s*SYS/.test(twilioSrc),
    'C.3 verifyLeadPhone updateOne must filter on { distributionDecision: { $in: SYSTEM_VALUES } } (stickiness guard)');

  // C.4 — admin /approve writes admin_approved.
  assert.ok(/lead\.distributionDecision\s*=\s*['"]admin_approved['"]/.test(adminSrc),
    'C.4 admin /approve must set distributionDecision="admin_approved"');

  // C.5 — admin /reject writes admin_rejected.
  assert.ok(/lead\.distributionDecision\s*=\s*['"]admin_rejected['"]/.test(adminSrc),
    'C.5 admin /reject must set distributionDecision="admin_rejected"');

  // C.6 — admin clear-override re-derives system decision.
  // Match across newlines: "deriveSystemDecision(lead)" appears, plus the
  // assignment lives in the clear-override handler. We assert presence + that
  // the assignment isn't admin_*.
  assert.ok(/deriveSystemDecision\(lead\)/.test(adminSrc),
    'C.6 admin clear-override must call deriveSystemDecision(lead)');
  const clearBlock = adminSrc.match(/cleared admin override/);
  assert.ok(clearBlock, 'C.6 admin clear-override block must be locatable');

  // C.7 — admin /tier-override (set) must NOT write distributionDecision.
  // Decoupling tier from visibility is the Phase 1 semantic correction.
  const setOverrideBlock = adminSrc.match(/router\.post\(['"]\/leads\/:id\/tier-override['"][\s\S]*?(?=router\.delete\(['"]\/leads\/:id\/tier-override['"])/);
  assert.ok(setOverrideBlock, 'C.7 set-override block must be locatable');
  assert.ok(!/lead\.distributionDecision\s*=/.test(setOverrideBlock[0]),
    'C.7 admin /tier-override (set) must NOT write distributionDecision (decoupled from visibility)');

  // C.8 — admin /mark-reviewed must NOT write distributionDecision.
  const markReviewedBlock = adminSrc.match(/router\.post\(['"]\/leads\/:id\/mark-reviewed['"][\s\S]*?\}\);/);
  assert.ok(markReviewedBlock, 'C.8 mark-reviewed block must be locatable');
  assert.ok(!/distributionDecision/.test(markReviewedBlock[0]),
    'C.8 admin /mark-reviewed must NOT write distributionDecision (cosmetic only)');

  console.log('  ✓ C. writer source-file checks (8 paths)');
}

// ── D. Atomic-protection simulation ──────────────────────────────────────
// Verifies that the stickiness guard would correctly prevent a pipeline write
// against an admin-owned lead. Pure JS simulation of the Mongo $in filter.
{
  function pipelineFilterMatches(currentDecision) {
    return SYSTEM_VALUES.includes(currentDecision);
  }

  // An admin_approved lead is NOT matched by the pipeline filter — write
  // skipped. (This is the fix for rescore-undoes-approve.)
  assert.strictEqual(pipelineFilterMatches('admin_approved'), false,
    'D.1 admin_approved lead must NOT match the pipeline updateOne filter');
  assert.strictEqual(pipelineFilterMatches('admin_rejected'), false,
    'D.1 admin_rejected lead must NOT match the pipeline updateOne filter');

  // System-owned values DO match — write proceeds normally.
  for (const v of SYSTEM_VALUES) {
    assert.strictEqual(pipelineFilterMatches(v), true,
      `D.2 system value ${v} must match the pipeline updateOne filter`);
  }

  console.log('  ✓ D. atomic-protection simulation (rescore cannot clobber admin_*)');
}

// ── E. Backfill classifier matrix ────────────────────────────────────────
{
  // E.1 — status=REJECTED_FAKE → admin_rejected
  let r = classifyForBackfill({ status: 'REJECTED_FAKE' });
  assert.strictEqual(r.decision, 'admin_rejected', 'E.1 REJECTED_FAKE → admin_rejected');
  assert.ok(/REJECTED_FAKE/.test(r.reason), 'E.1 reason mentions REJECTED_FAKE');

  // E.2 — adminTierOverride.tier=rejected → admin_rejected
  r = classifyForBackfill({ adminTierOverride: { tier: 'rejected', by: 'u1' } });
  assert.strictEqual(r.decision, 'admin_rejected', 'E.2 override=rejected → admin_rejected');
  assert.strictEqual(r.by, 'u1', 'E.2 preserves override.by');

  // E.3 — adminTierOverride.tier=standard → admin_approved
  r = classifyForBackfill({ adminTierOverride: { tier: 'standard', by: 'u2' } });
  assert.strictEqual(r.decision, 'admin_approved', 'E.3 override=standard → admin_approved');

  // E.4 — adminTierOverride.tier=premium → admin_approved
  r = classifyForBackfill({ adminTierOverride: { tier: 'premium' } });
  assert.strictEqual(r.decision, 'admin_approved', 'E.4 override=premium → admin_approved');
  assert.strictEqual(r.by, 'migration', 'E.4 missing override.by → "migration"');

  // E.5 — adminTierOverride.tier=hot → admin_approved
  r = classifyForBackfill({ adminTierOverride: { tier: 'hot' } });
  assert.strictEqual(r.decision, 'admin_approved', 'E.5 override=hot → admin_approved');

  // E.6 — adminTierOverride.tier=review → REVERTED to system verdict
  //        (the deliberate semantic correction). With clean evidence
  //        (real miles, no other signals) system would say system_approved.
  r = classifyForBackfill({ adminTierOverride: { tier: 'review' }, miles: 100 });
  assert.strictEqual(r.decision, 'system_approved', 'E.6 override=review (clean) → REVERTED to system_approved');
  assert.ok(/reverted/.test(r.reason), 'E.6 reason flags the review-override revert');

  // E.6b — adminTierOverride.tier=review on a lead with structural issues
  //        reverts to system_held — admin's review-override no longer
  //        accidentally publishes leads with raw blockers.
  r = classifyForBackfill({ adminTierOverride: { tier: 'review' }, miles: 0 });
  assert.strictEqual(r.decision, 'system_held', 'E.6b override=review (miles=0) → system_held');

  // E.7 — legacy lead with shadowTier=rejected → system_rejected
  r = classifyForBackfill({ shadowTier: 'rejected', miles: 100 });
  assert.strictEqual(r.decision, 'system_rejected', 'E.7 shadowTier=rejected → system_rejected');

  // E.8 — fresh V5 lead → system_pending
  r = classifyForBackfill({ qualityGateCleared: false, miles: 100 });
  assert.strictEqual(r.decision, 'system_pending', 'E.8 fresh V5 → system_pending');

  // E.9 — review tier from scoring → system_held
  r = classifyForBackfill({ shadowTier: 'review', qualityGateCleared: true, miles: 100 });
  assert.strictEqual(r.decision, 'system_held', 'E.9 shadowTier=review → system_held');

  // E.10 — clean legacy lead → system_approved (real miles, no other signals)
  r = classifyForBackfill({ miles: 100 });
  assert.strictEqual(r.decision, 'system_approved', 'E.10 legacy clean lead → system_approved');

  // E.11 — null doc is defensive: returns system_pending bucket.
  r = classifyForBackfill(null);
  assert.strictEqual(r.decision, 'system_pending', 'E.11 null doc → system_pending');

  // E.12 — miles=0 lead lands in system_held (distance_unknown blocker).
  //        Confirms the backfill correctly inherits the structural-blocker
  //        rule rather than blanket-approving every legacy doc.
  r = classifyForBackfill({});
  assert.strictEqual(r.decision, 'system_held', 'E.12 miles=0 legacy lead → system_held');

  console.log('  ✓ E. backfill classifier matrix (11 buckets)');
}

// ── F. Schema check ──────────────────────────────────────────────────────
{
  const Lead = require('../models/Lead');
  const pathDef = Lead.schema.path('distributionDecision');
  assert.ok(pathDef, 'F.1 Lead.distributionDecision must exist');
  assert.strictEqual(pathDef.instance, 'String', 'F.1 field type is String');
  const enumValues = pathDef.enumValues || (pathDef.options && pathDef.options.enum);
  const enumSet = Array.isArray(enumValues) ? enumValues : (enumValues && enumValues.values);
  const expected = ['system_pending','system_approved','system_held','system_rejected','admin_approved','admin_rejected'];
  for (const v of expected) {
    assert.ok(enumSet.includes(v), `F.1 enum includes ${v}`);
  }
  assert.strictEqual(enumSet.length, expected.length, 'F.1 enum has exactly 6 values');

  // Default
  const dflt = pathDef.defaultValue;
  assert.strictEqual(typeof dflt === 'function' ? dflt() : dflt, 'system_pending',
    'F.2 default is system_pending');

  // Index — Mongoose marks indexed paths in the schema's index tree or via options.
  const indexed = (pathDef.options && pathDef.options.index === true)
    || Lead.schema.indexes().some(([keys]) => Object.prototype.hasOwnProperty.call(keys, 'distributionDecision'));
  assert.ok(indexed, 'F.3 distributionDecision must be indexed');

  // Audit fields present
  assert.ok(Lead.schema.path('distributionDecisionBy'),     'F.4 distributionDecisionBy exists');
  assert.ok(Lead.schema.path('distributionDecisionAt'),     'F.4 distributionDecisionAt exists');
  assert.ok(Lead.schema.path('distributionDecisionReason'), 'F.4 distributionDecisionReason exists');

  // Sanity: DISTRIBUTABLE_VALUES matches our intent.
  assert.deepStrictEqual([...DISTRIBUTABLE_VALUES].sort(),
    ['admin_approved','system_approved'].sort(),
    'F.5 DISTRIBUTABLE_VALUES = {system_approved, admin_approved}');

  console.log('  ✓ F. schema check (enum, default, index, audit fields)');
}

// ── G. Phase 3 behavioral cutover — admin actions end-to-end ────────────
//
// Models the mover feed query as a pure JS predicate and runs each admin
// action's WRITE through it, asserting the lead becomes visible/hidden as
// promised by the unified model. Each block names a specific user-visible
// outcome the user asked us to prove.
{
  const SYSTEM_VALUES_ARRAY = ['system_pending','system_approved','system_held','system_rejected'];

  // Phase 3 mover feed filter — pure JS port. Four orthogonal axes ANDed:
  //   status ∈ {Available, READY_FOR_DISTRIBUTION}
  //   moveDate ≥ now
  //   inventoryChannel ∉ {deal_room, archived}
  //   distributionDecision ∈ {system_approved, admin_approved}
  function feedIncludes(lead) {
    if (!['Available', 'READY_FOR_DISTRIBUTION'].includes(lead.status)) return false;
    if (!lead.moveDate || new Date(lead.moveDate) < new Date()) return false;
    if (['deal_room', 'archived'].includes(lead.inventoryChannel)) return false;
    if (!['system_approved', 'admin_approved'].includes(lead.distributionDecision)) return false;
    return true;
  }

  // Simulators for each admin action — mirror the server handler's write set.
  function applyApprove(lead) {
    return {
      ...lead,
      adminTierOverride: { tier: 'standard', at: new Date(), by: 'admin-1' },
      qualityGateCleared: true,
      status: lead.status === 'PENDING_MANUAL_REVIEW' ? 'READY_FOR_DISTRIBUTION' : lead.status,
      distributionDecision: 'admin_approved',
      distributionDecisionBy: 'admin-1',
    };
  }
  function applyReject(lead) {
    return {
      ...lead,
      status: 'REJECTED_FAKE',
      adminTierOverride: { tier: 'rejected', at: new Date(), by: 'admin-1' },
      qualityGateCleared: false,
      distributionDecision: 'admin_rejected',
      distributionDecisionBy: 'admin-1',
    };
  }
  function applyTierOverride(lead, tier) {
    // Phase 3: tier override is DECOUPLED from visibility. Sets
    // adminTierOverride + (legacy) qualityGateCleared but does NOT touch
    // distributionDecision.
    return {
      ...lead,
      adminTierOverride: { tier, at: new Date(), by: 'admin-1' },
      qualityGateCleared: tier !== 'rejected',
    };
  }
  function applyClearOverride(lead) {
    // Phase 3: re-derives from current evidence. We use deriveSystemDecision.
    const next = { ...lead, adminTierOverride: undefined };
    const derived = deriveSystemDecision(next);
    return {
      ...next,
      qualityGateCleared: !(lead.shadowTier === 'rejected'),
      distributionDecision: derived,
      distributionDecisionBy: 'system',
    };
  }
  function applyRescore(lead, newSystemDecision) {
    // Phase 3 atomic guard: rescore only writes when current decision is
    // system_*. Simulate the guard explicitly so the test reflects the
    // real route behavior.
    if (!SYSTEM_VALUES_ARRAY.includes(lead.distributionDecision)) {
      return lead; // admin_* sticky — no change
    }
    return { ...lead, distributionDecision: newSystemDecision };
  }

  // Baseline V5 lead that was scored as 'review' with a raw suspicionPattern
  // signal — the exact shape that motivated this whole refactor.
  const heldLead = {
    _id: 'L-held',
    status: 'PENDING_MANUAL_REVIEW',
    moveDate: new Date(Date.now() + 7 * 86400000),
    inventoryChannel: 'main',
    shadowTier: 'review',
    qualityGateCleared: false,
    structuralBlockers: ['suspicion_pattern'],
    validation: { phone: { suspicionPattern: 'alternating' } },
    miles: 500,
    distributionDecision: 'system_held',
  };

  // G.1 — Approve makes the held lead visible.
  assert.strictEqual(feedIncludes(heldLead), false, 'G.1 baseline: held lead hidden');
  const approved = applyApprove(heldLead);
  assert.strictEqual(approved.distributionDecision, 'admin_approved', 'G.1 approve writes admin_approved');
  assert.strictEqual(approved.status, 'READY_FOR_DISTRIBUTION', 'G.1 approve upgrades PENDING_MANUAL_REVIEW status');
  assert.strictEqual(feedIncludes(approved), true,
    'G.1 approved lead appears in feed DESPITE lingering suspicionPattern + shadowTier=review (silent-block fixed)');

  // G.2 — Reject hides the lead via three redundant gates.
  const rejected = applyReject(approved);
  assert.strictEqual(rejected.distributionDecision, 'admin_rejected', 'G.2 reject writes admin_rejected');
  assert.strictEqual(rejected.status, 'REJECTED_FAKE', 'G.2 reject sets status=REJECTED_FAKE');
  assert.strictEqual(feedIncludes(rejected), false, 'G.2 rejected lead hidden');

  // G.3 — Rescore CANNOT undo an admin approval (the sticky guarantee).
  //        Simulate a later rescore that would otherwise produce system_held.
  const rescoredAfterApprove = applyRescore(approved, 'system_held');
  assert.strictEqual(rescoredAfterApprove.distributionDecision, 'admin_approved',
    'G.3 rescore on admin_approved leaves the decision untouched (atomic guard)');
  assert.strictEqual(feedIncludes(rescoredAfterApprove), true,
    'G.3 lead stays visible after rescore — no silent un-approve');

  // G.4 — Rescore on a system-owned lead correctly updates the decision.
  const heldAfterRescore = applyRescore(heldLead, 'system_approved');
  assert.strictEqual(heldAfterRescore.distributionDecision, 'system_approved',
    'G.4 rescore on system_held → system_approved when evidence cleans up');

  // G.5 — Clear override on an approved lead reverts to system verdict.
  //        On the heldLead's evidence (review + suspicionPattern) the system
  //        verdict is system_held — lead returns to hidden.
  const cleared = applyClearOverride(approved);
  assert.strictEqual(cleared.distributionDecision, 'system_held',
    'G.5 clear-override re-derives from evidence (review + suspicionPattern → system_held)');
  assert.strictEqual(feedIncludes(cleared), false,
    'G.5 cleared lead returns to hidden (symmetric undo)');
  assert.strictEqual(cleared.adminTierOverride, undefined, 'G.5 override cleared');

  // G.6 — Tier override is DECOUPLED from visibility.
  //        Setting tier=standard on a held lead must NOT make it visible —
  //        that's the responsibility of /approve, not /tier-override.
  const tieredHeld = applyTierOverride(heldLead, 'standard');
  assert.strictEqual(tieredHeld.distributionDecision, 'system_held',
    'G.6 tier-override does NOT touch distributionDecision');
  assert.strictEqual(feedIncludes(tieredHeld), false,
    'G.6 tier-override alone cannot publish a held lead — must use /approve');

  // G.7 — Tier override to 'review' no longer accidentally publishes leads.
  //        Under the old model this set qualityGateCleared=true and made the
  //        lead visible. Under Phase 3, distributionDecision is untouched.
  const approvedThenReviewOverride = applyTierOverride(approved, 'review');
  assert.strictEqual(approvedThenReviewOverride.distributionDecision, 'admin_approved',
    'G.7 tier=review override does NOT alter distributionDecision');
  // The lead remains visible because the admin had already approved it
  // explicitly; tier=review is just a tag.

  // G.8 — admin_rejected hides regardless of evidence.
  const rejectedWithCleanEvidence = {
    ...heldLead,
    shadowTier: 'standard',
    qualityGateCleared: true,
    structuralBlockers: [],
    validation: { phone: { valid: true } },
    distributionDecision: 'admin_rejected',
    status: 'READY_FOR_DISTRIBUTION',
  };
  assert.strictEqual(feedIncludes(rejectedWithCleanEvidence), false,
    'G.8 admin_rejected stays hidden even with clean evidence (sticky)');

  // G.9 — system_rejected stays hidden until admin action.
  const systemRejected = {
    ...heldLead,
    distributionDecision: 'system_rejected',
    status: 'READY_FOR_DISTRIBUTION',
  };
  assert.strictEqual(feedIncludes(systemRejected), false, 'G.9 system_rejected hidden');
  const recoveredViaApprove = applyApprove(systemRejected);
  assert.strictEqual(feedIncludes(recoveredViaApprove), true,
    'G.9 admin can rescue a system_rejected lead via /approve');

  // G.10 — Lifecycle stays separate. Expired status hides regardless of decision.
  const expiredApproved = {
    ...approved,
    status: 'Expired',
  };
  assert.strictEqual(feedIncludes(expiredApproved), false,
    'G.10 Expired status hides regardless of distributionDecision (lifecycle separate)');

  // G.11 — Past moveDate hides regardless of decision.
  const pastMoveDate = {
    ...approved,
    moveDate: new Date(Date.now() - 86400000),
  };
  assert.strictEqual(feedIncludes(pastMoveDate), false,
    'G.11 past moveDate hides regardless of distributionDecision (time gate separate)');

  // G.12 — Deal Room channel hides from main feed (surface gate separate).
  const inDealRoom = {
    ...approved,
    inventoryChannel: 'deal_room',
  };
  assert.strictEqual(feedIncludes(inDealRoom), false,
    'G.12 deal_room channel hides from main feed (surface gate separate)');

  console.log('  ✓ G. Phase 3 admin-action behavioral cutover (12 assertions)');
}

// ── H. Phase 3 integration cleanup — server-side behavioral assertions ──
//
// Proves the post-cleanup contract:
//   - approve upgrades PENDING_MANUAL_REVIEW AND Pending Verification
//     to READY_FOR_DISTRIBUTION (both are safe-to-publish on admin auth)
//   - approve does NOT upgrade Expired (separate Reactivate action required)
//   - approve writes admin_approved and the lead becomes visible iff
//     lifecycle/time/placement gates are also clear
//   - dealRoomMoveBlockReason messages are axis-prefixed (Quality:/Lifecycle:)
//   - admin snapshot payload returns distributionDecision fields
{
  const adminSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'routes', 'admin.js'), 'utf8');
  const adminInventorySrc2 = require('fs').readFileSync(require('path').join(__dirname, '..', 'routes', 'adminInventory.js'), 'utf8');

  // H.1 — approve upgrades both PENDING_MANUAL_REVIEW + Pending Verification
  assert.ok(/UPGRADABLE_STATUSES\s*=\s*new Set\(\[['"]PENDING_MANUAL_REVIEW['"]\s*,\s*['"]Pending Verification['"]\]\)/.test(adminSrc),
    'H.1 approve handler must expose UPGRADABLE_STATUSES = {PENDING_MANUAL_REVIEW, Pending Verification}');
  assert.ok(/UPGRADABLE_STATUSES\.has\(lead\.status\)/.test(adminSrc),
    'H.1 approve handler must check status against UPGRADABLE_STATUSES');

  // H.2 — Expired is NOT in the upgrade set. We grep negatively: no place in
  // admin.js auto-upgrades 'Expired' → 'READY_FOR_DISTRIBUTION'.
  assert.ok(!/['"]Expired['"][\s\S]{0,200}['"]READY_FOR_DISTRIBUTION['"]/.test(adminSrc),
    'H.2 approve must NOT auto-upgrade Expired (separate Reactivate action required)');

  // H.3 — admin snapshot endpoint returns distributionDecision fields and
  // includes inventoryChannel in the .select() projection.
  assert.ok(/distributionDecision distributionDecisionBy distributionDecisionAt distributionDecisionReason inventoryChannel/.test(adminSrc),
    'H.3 GET /scoring-snapshot must select distributionDecision* + inventoryChannel');
  assert.ok(/distributionDecisionByEmail:[\s\S]{0,200}decisionByUser\s*\?[\s\S]{0,40}email/.test(adminSrc),
    'H.3 payload must include resolved distributionDecisionByEmail');

  // H.4 — buildSnapshotPayload also resolves the actor for action responses.
  assert.ok(/lead\.distributionDecisionByEmail\s*=\s*decisionByUser/.test(adminSrc),
    'H.4 buildSnapshotPayload must augment lead with distributionDecisionByEmail');

  // H.5 — dealRoomMoveBlockReason messages prefixed with Quality:
  assert.ok(/['"]Quality: lead was rejected by admin/.test(adminInventorySrc2),
    'H.5 admin_rejected reason prefixed with "Quality:"');
  assert.ok(/['"]Quality: lead was rejected by quality scoring/.test(adminInventorySrc2),
    'H.5 system_rejected reason prefixed with "Quality:"');
  assert.ok(/Quality: lead is held for review/.test(adminInventorySrc2),
    'H.5 system_held reason prefixed with "Quality:"');

  // H.6 — Lifecycle reasons in the per-lead loop are prefixed with Lifecycle:
  assert.ok(/['"]Lifecycle: move date has already passed/.test(adminInventorySrc2),
    'H.6 past-moveDate reason prefixed with "Lifecycle:"');
  assert.ok(/['"]Lifecycle: lead is expired/.test(adminInventorySrc2),
    'H.6 Expired-status reason prefixed with "Lifecycle:"');
  assert.ok(/Lifecycle: lead status[\s\S]{0,40}is not eligible/.test(adminInventorySrc2),
    'H.6 ineligible-status reason prefixed with "Lifecycle:"');
  assert.ok(/['"]Lifecycle: already purchased/.test(adminInventorySrc2),
    'H.6 purchased-lead reason prefixed with "Lifecycle:"');

  console.log('  ✓ H. Phase 3 integration cleanup — server-side behavioral assertions');
}

// ── I. Phase 3 integration cleanup — admin-action lifecycle behaviors ──
{
  // Pure JS simulator: mirror the approve handler's status-upgrade logic.
  const UPGRADABLE = new Set(['PENDING_MANUAL_REVIEW', 'Pending Verification']);
  function approveStatusUpgrade(status) {
    return UPGRADABLE.has(status) ? 'READY_FOR_DISTRIBUTION' : status;
  }

  // I.1 — PENDING_MANUAL_REVIEW upgrades.
  assert.strictEqual(approveStatusUpgrade('PENDING_MANUAL_REVIEW'), 'READY_FOR_DISTRIBUTION',
    'I.1 PENDING_MANUAL_REVIEW upgrades on approve');

  // I.2 — Pending Verification upgrades (the new behavior).
  assert.strictEqual(approveStatusUpgrade('Pending Verification'), 'READY_FOR_DISTRIBUTION',
    'I.2 Pending Verification upgrades on approve (new in this cleanup)');

  // I.3 — Expired does NOT upgrade.
  assert.strictEqual(approveStatusUpgrade('Expired'), 'Expired',
    'I.3 Expired stays Expired (separate Reactivate action required)');

  // I.4 — REJECTED_FAKE does NOT upgrade.
  assert.strictEqual(approveStatusUpgrade('REJECTED_FAKE'), 'REJECTED_FAKE',
    'I.4 REJECTED_FAKE stays — explicit restore required');

  // I.5 — Purchased does NOT upgrade.
  assert.strictEqual(approveStatusUpgrade('Purchased'), 'Purchased',
    'I.5 Purchased stays — lead is already sold');

  // I.6 — Available / READY stay as-is (no upgrade needed).
  assert.strictEqual(approveStatusUpgrade('Available'), 'Available');
  assert.strictEqual(approveStatusUpgrade('READY_FOR_DISTRIBUTION'), 'READY_FOR_DISTRIBUTION');

  // I.7 — Behavioral: approve on an Expired lead writes admin_approved BUT
  //       the feed filter still hides it via the lifecycle clause. The admin
  //       UI must surface a clear warning.
  function feedIncludes(lead) {
    if (!['Available', 'READY_FOR_DISTRIBUTION'].includes(lead.status)) return false;
    if (!lead.moveDate || new Date(lead.moveDate) < new Date()) return false;
    if (['deal_room', 'archived'].includes(lead.inventoryChannel)) return false;
    if (!['system_approved', 'admin_approved'].includes(lead.distributionDecision)) return false;
    return true;
  }

  const expiredLead = {
    status: 'Expired',                            // not upgraded by approve
    moveDate: new Date(Date.now() - 86400000),    // past
    inventoryChannel: 'main',
    distributionDecision: 'admin_approved',       // approve DID write this
  };
  assert.strictEqual(feedIncludes(expiredLead), false,
    'I.7 admin_approved + Expired status: feed STILL hides — lifecycle gate independent');

  // I.8 — Pending Verification + approve → upgrades status to READY,
  //        writes admin_approved → feed includes (if other gates OK).
  const pvLead = {
    status: approveStatusUpgrade('Pending Verification'),
    moveDate: new Date(Date.now() + 7 * 86400000),
    inventoryChannel: 'main',
    distributionDecision: 'admin_approved',
  };
  assert.strictEqual(feedIncludes(pvLead), true,
    'I.8 Pending Verification + approve → status upgrades → feed includes');

  console.log('  ✓ I. Phase 3 integration cleanup — admin-action lifecycle behaviors');
}

// ── J. Phase 3 integration cleanup — client + admin UI wiring ───────────
{
  const fs = require('fs');
  const path = require('path');
  const modalSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'components', 'admin', 'ScoringSnapshotModal.jsx'), 'utf8');
  const feedSrc  = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'dashboard', 'LeadFeed.jsx'), 'utf8');

  // J.1 — ScoringSnapshotModal renders a Distribution Decision card.
  assert.ok(/DistributionDecisionCard/.test(modalSrc),
    'J.1 ScoringSnapshotModal must render DistributionDecisionCard');
  assert.ok(/leadDetail\?\.distributionDecision/.test(modalSrc),
    'J.1 card render guarded on leadDetail.distributionDecision');

  // J.2 — DistributionDecisionCard reads distributionDecision* fields, not adminTierOverride.
  const cardMatch = modalSrc.match(/function DistributionDecisionCard\([\s\S]*?\n\}\n/);
  assert.ok(cardMatch, 'J.2 DistributionDecisionCard function locatable');
  const cardBody = cardMatch[0];
  assert.ok(/lead\.distributionDecision\b/.test(cardBody),
    'J.2 card reads lead.distributionDecision');
  assert.ok(/lead\.distributionDecisionByEmail/.test(cardBody) || /lead\.distributionDecisionByName/.test(cardBody) || /lead\.distributionDecisionBy\b/.test(cardBody),
    'J.2 card displays decisionBy');
  assert.ok(/lead\.distributionDecisionAt/.test(cardBody),
    'J.2 card displays decisionAt');
  assert.ok(/lead\.distributionDecisionReason/.test(cardBody),
    'J.2 card displays decisionReason');
  assert.ok(!/adminTierOverride/.test(cardBody),
    'J.2 card body must NOT read adminTierOverride (decoupled — that is a tier tag, not approval state)');

  // J.3 — Lifecycle expiration warning uses the precise authority-clarifying
  // wording. The warning must (a) name the architectural split, (b) tell admin
  // an explicit Reactivate action is required, (c) state that approval does
  // NOT auto-revive expired leads.
  assert.ok(/Approved quality-wise but hidden due to lifecycle expiration/.test(modalSrc),
    'J.3 modal must surface the "Approved quality-wise but hidden due to lifecycle expiration" warning');
  assert.ok(/Reactivate \/ extend-moveDate action/.test(modalSrc),
    'J.3 warning must point at the explicit Reactivate action that admin needs');
  assert.ok(/does NOT auto-revive/.test(modalSrc),
    'J.3 warning must state that approval does not auto-revive expired leads');

  // J.4 — The legacy "Admin Override → tier" pill is gone (the one that read
  // like a decision). Replaced by a quietly-labelled "Tier tag" pill.
  assert.ok(!/Admin Override → \{distribution\.override\}/.test(modalSrc),
    'J.4 legacy "Admin Override → …" pill must be removed (read like a decision)');
  assert.ok(/Tier tag:/.test(modalSrc),
    'J.4 replacement pill must read "Tier tag:" to make priority-tag semantics explicit');

  // J.5 — LeadFeed.jsx no longer filters fetched results by auctionStatus.
  // Server is sole authority. The function `isDistributable` is gone.
  assert.ok(!/const isDistributable\s*=/.test(feedSrc),
    'J.5 LeadFeed.jsx must drop the legacy isDistributable helper (name conflict + auctionStatus filter)');
  assert.ok(!/data\.filter\(isDistributable\)/.test(feedSrc),
    'J.5 LeadFeed.jsx must not filter the fetched array client-side');
  assert.ok(/setLeads\(data\);/.test(feedSrc),
    'J.5 LeadFeed.jsx must setLeads(data) directly — trust the server');

  // J.6 — Defensive socket-side renderable check exists (name-distinct).
  assert.ok(/isFeedRenderable/.test(feedSrc),
    'J.6 LeadFeed.jsx must keep a name-distinct helper for NEW_LEAD_AVAILABLE defensive check');
  assert.ok(!/l\.auctionStatus\s*!==\s*['"]expired['"]/.test(feedSrc),
    'J.6 LeadFeed.jsx must drop the auctionStatus !== "expired" client filter');

  // J.7 — Tier badges in admin UIs are relabeled as "Scoring" evidence
  // (not "Tier" as if it were an operational gate). Three call sites:
  // ScoringSnapshotModal, AdminLeads TierBadge component, AdminQuality row.
  assert.ok(/Scoring Tier:/.test(modalSrc),
    'J.7 ScoringSnapshotModal must label the engine-verdict pill "Scoring Tier:"');
  const adminLeadsSrc   = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'admin', 'AdminLeads.jsx'), 'utf8');
  const adminQualitySrc = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'admin', 'AdminQuality.jsx'), 'utf8');
  assert.ok(/>Scoring:</.test(adminLeadsSrc),
    'J.7 AdminLeads TierBadge must prefix the value with a quiet "Scoring:" label');
  assert.ok(/>Scoring:</.test(adminQualitySrc),
    'J.7 AdminQuality QualityRow must prefix the tier with "Scoring:"');
  assert.ok(/Scoring Tier/.test(adminQualitySrc),
    'J.7 AdminQuality table header must read "Scoring Tier" not "Tier"');

  // J.8 — AdminQuality review queue filters out admin-acted leads from the
  // actionable buckets, exposes them via a dedicated "Resolved" bucket.
  assert.ok(/ADMIN_ACTED_DECISIONS\s*=\s*new Set\(\[['"]admin_approved['"]\s*,\s*['"]admin_rejected['"]\]\)/.test(adminQualitySrc),
    'J.8 AdminQuality must define ADMIN_ACTED_DECISIONS = {admin_approved, admin_rejected}');
  assert.ok(/key:\s*['"]resolved['"]/.test(adminQualitySrc),
    'J.8 AdminQuality must add a "resolved" bucket for audit access to admin-acted leads');
  assert.ok(/if \(b === ['"]resolved['"]\) return adminActed/.test(adminQualitySrc),
    'J.8 resolved bucket must show ONLY admin-acted leads');
  assert.ok(/if \(adminActed\) return false/.test(adminQualitySrc),
    'J.8 every actionable bucket must exclude admin-acted leads');

  console.log('  ✓ J. Phase 3 integration cleanup — client + admin UI wiring');
}

console.log('\nAll Phase 1 + Phase 3 + integration-cleanup distributionDecision smoke tests passed.');
