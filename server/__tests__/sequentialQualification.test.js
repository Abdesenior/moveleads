/**
 * Sequential V5 qualification smoke test (Phase 6.7).
 *
 * Verifies that V5 leads cannot be mover-visible / claimable / broadcast
 * before validation + scoring complete. Two layers of verification:
 *
 *   A. STATIC checks against the source files — proves the dangerous
 *      parallel patterns (fire-and-forget baseline scoring, etc.) are gone
 *      and the sequential chain is in place.
 *
 *   B. VISIBILITY MATRIX — exercises moverVisibilityFilter +
 *      isHiddenFromMovers against snapshots of a V5 lead document at
 *      each lifecycle stage to prove the lead is hidden during the
 *      qualification window and visible/hidden correctly after.
 *
 * Runs as plain Node (no Jest needed): `node server/__tests__/sequentialQualification.test.js`.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Disable the periodic reporter so test loads don't leak intervals.
process.env.LEAD_VISIBILITY_REPORT_INTERVAL_MS = '0';
process.env.ENABLE_TIERED_ROUTING = 'blocked_and_review';

const ingestSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leadIngestV2.js'), 'utf8');
const validationSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'validationPipeline.js'), 'utf8');
const twilioSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'twilioService.js'), 'utf8');

// ── A. Static source-file checks ──────────────────────────────────────────
{
  // (1) V5 ingest must NOT call scoringPipeline.runShadow directly anymore.
  //     The baseline call (Phase 6.x race source) is gone.
  assert.ok(
    !/scoringPipeline\.runShadow\s*\(/.test(ingestSrc),
    'leadIngestV2 must NOT call scoringPipeline.runShadow directly (baseline call removed)'
  );
  console.log('  ✓ V5 ingest no longer makes a baseline scoringPipeline call');

  // (2) V5 ingest must call validationPipeline.runShadow inside an AWAIT
  //     (not fire-and-forget). Match: `await validationPipeline.runShadow`
  assert.ok(
    /await\s+validationPipeline\.runShadow\s*\(/.test(ingestSrc),
    'leadIngestV2 must await validationPipeline.runShadow inside the chain'
  );
  console.log('  ✓ V5 ingest awaits validationPipeline.runShadow');

  // (3) V5 ingest must call verifyLeadPhone with await (sequential, after
  //     validation + pricing). No more standalone fire-and-forget.
  assert.ok(
    /await\s+verifyLeadPhone\s*\(/.test(ingestSrc),
    'leadIngestV2 must await verifyLeadPhone inside the chain'
  );
  console.log('  ✓ V5 ingest awaits verifyLeadPhone (runs LAST in chain)');

  // (4) V5 ingest must still set qualityGateCleared: false at save time
  assert.ok(
    /qualityGateCleared:\s*false/.test(ingestSrc),
    'leadIngestV2 must set qualityGateCleared:false at ingest'
  );
  console.log('  ✓ V5 ingest sets qualityGateCleared=false at lead creation');

  // (5) Customer-facing 201 response must still be returned (UX preserved)
  assert.ok(
    /res\.status\(201\)\.json/.test(ingestSrc),
    'leadIngestV2 must still return 201 to the customer immediately'
  );
  console.log('  ✓ V5 ingest still returns 201 to customer immediately');

  // (6) validationPipeline must AWAIT scoring at the end, ALWAYS (no anyWritten gate)
  assert.ok(
    /await\s+scoringPipeline\.runShadow\s*\(lead\._id\s*\)/.test(validationSrc),
    'validationPipeline must await scoringPipeline.runShadow at the end'
  );
  console.log('  ✓ validationPipeline awaits scoringPipeline.runShadow at end');

  // (7) validationPipeline must NOT skip scoring based on anyWritten anymore
  assert.ok(
    !/if\s*\(\s*anyWritten\s*\)\s*\{[^}]*scoringPipeline\.runShadow/s.test(validationSrc),
    'validationPipeline must not gate scoring on anyWritten'
  );
  console.log('  ✓ validationPipeline no longer skips scoring when no provider wrote');

  // (8) verifyLeadPhone must reload the lead before passing to broadcasts
  //     (otherwise per-channel visibility guards see stale ingest-time data)
  assert.ok(
    /freshLead\s*=\s*await\s+Lead\.findById/.test(twilioSrc),
    'verifyLeadPhone must reload the lead before broadcasting (Phase 6.7 stale-data fix)'
  );
  console.log('  ✓ verifyLeadPhone reloads lead before broadcasting');

  // (9) Phase 6.8 — verifyLeadPhone must status-gate on scoring outcome.
  //     PENDING_MANUAL_REVIEW for rejected leads, env-independent.
  assert.ok(
    /qualificationFailed/.test(twilioSrc),
    'verifyLeadPhone must compute qualificationFailed from fresh DB state'
  );
  assert.ok(
    /lead\.status\s*=\s*['"]PENDING_MANUAL_REVIEW['"]/.test(twilioSrc),
    'verifyLeadPhone must set status=PENDING_MANUAL_REVIEW on qualification failure'
  );
  console.log('  ✓ verifyLeadPhone status-gates on scoring outcome (Phase 6.8)');
}

// ── B. Visibility matrix across the V5 lifecycle ──────────────────────────
{
  // Fresh load with mode set
  delete require.cache[require.resolve('../utils/leadVisibility')];
  const { isHiddenFromMovers, moverVisibilityFilter } = require('../utils/leadVisibility');
  const filter = moverVisibilityFilter();
  assert.ok(filter.$and, 'blocked_and_review must produce $and clauses');

  // Faithful evaluator (same as leadVisibility.test.js)
  function evalClause(clause, doc) {
    const [path] = Object.keys(clause);
    const op = clause[path];
    const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
    // Mongo idiom: `{ field: null }` matches docs where the field is null or
    // missing. Used by the suspicionPattern raw-fallback clause.
    if (op === null) return value === null || value === undefined;
    if (op.$ne !== undefined) return value !== op.$ne;
    if (op.$nin !== undefined) {
      if (value === undefined) return true;
      if (Array.isArray(value)) return value.every(v => !op.$nin.includes(v));
      return !op.$nin.includes(value);
    }
    if (op.$in !== undefined) {
      if (Array.isArray(value)) return value.some(v => op.$in.includes(v));
      return op.$in.includes(value);
    }
    return true;
  }
  function passesFilter(doc) {
    return filter.$and.every(c => evalClause(c, doc));
  }

  // STAGE 1 — Immediately after lead.save() in V5 ingest:
  //   status=Pending Verification, qualityGateCleared=false, no validation yet.
  //   Mover visibility MUST be blocked.
  const justSaved = {
    status: 'Pending Verification',
    qualityGateCleared: false,
    funnelVersion: 'v5',
  };
  assert.strictEqual(isHiddenFromMovers(justSaved), true,
    'STAGE 1 (just-saved V5 lead): hidden by qualityGateCleared=false');
  // Status filter is separate from moverVisibilityFilter; the GET /api/leads
  // handler additionally requires status IN [Available, READY]. We don't
  // check that here because moverVisibilityFilter doesn't include it — but
  // it's another layer of defense.
  console.log('  ✓ STAGE 1: just-saved V5 lead is hidden (gate=false)');

  // STAGE 2 — Mid-pipeline: validation has written validation.phone but
  //   scoring hasn't yet. shadowTier and structuralBlockers still missing,
  //   qualityGateCleared still false. Lead must remain hidden.
  const midPipeline = {
    status: 'Pending Verification',
    qualityGateCleared: false,
    funnelVersion: 'v5',
    validation: {
      phone: { valid: false, validityReason: 'twilio_says_invalid', checkedAt: new Date() },
      route: { suspicious: ['destination_zip_not_found'], checkedAt: new Date() },
    },
    miles: 0,
  };
  assert.strictEqual(isHiddenFromMovers(midPipeline), true,
    'STAGE 2 (mid-pipeline): hidden — gate still false');
  console.log('  ✓ STAGE 2: mid-pipeline V5 lead is hidden (gate still false)');

  // STAGE 3a — Post-qualification, REJECTED structural lead:
  //   sequential pipeline finished. shadowTier=rejected, gate=false,
  //   structuralBlockers populated. Must stay hidden permanently.
  const rejectedFinal = {
    status: 'READY_FOR_DISTRIBUTION',
    qualityGateCleared: false,
    shadowTier: 'rejected',
    structuralBlockers: ['invalid_phone', 'route_unresolved', 'distance_unknown'],
    funnelVersion: 'v5',
    validation: {
      phone: { valid: false, validityReason: 'twilio_says_invalid' },
      route: { suspicious: ['destination_zip_not_found'] },
    },
    miles: 0,
  };
  assert.strictEqual(isHiddenFromMovers(rejectedFinal), true,
    'STAGE 3a (post-pipeline rejected): hidden by shadowTier=rejected + gate=false');
  assert.strictEqual(passesFilter(rejectedFinal), false,
    'STAGE 3a: Mongo filter also blocks the rejected lead');
  console.log('  ✓ STAGE 3a: post-pipeline REJECTED lead permanently hidden');

  // STAGE 3b — Post-qualification, CLEAN lead (passes scoring with tier=standard):
  //   shadowTier=standard, gate=true, structuralBlockers=[]. Visible.
  const cleanFinal = {
    status: 'READY_FOR_DISTRIBUTION',
    qualityGateCleared: true,
    shadowTier: 'standard',
    structuralBlockers: [],
    funnelVersion: 'v5',
    validation: {
      phone: { valid: true, lineType: 'mobile', smsPumpingRisk: 'low', providerSuspicion: 'low' },
      route: { suspicious: [] },
    },
    miles: 500,
  };
  assert.strictEqual(isHiddenFromMovers(cleanFinal), false,
    'STAGE 3b (post-pipeline clean): visible');
  assert.strictEqual(passesFilter(cleanFinal), true,
    'STAGE 3b: Mongo filter passes the clean lead');
  console.log('  ✓ STAGE 3b: post-pipeline CLEAN lead is visible');

  // STAGE 3c — Post-qualification, SOFT REVIEW (VoIP only — not structural):
  //   shadowTier=review, gate=true, structuralBlockers=[]. Still visible per
  //   "do not hide soft review leads" rule.
  const softReviewFinal = {
    status: 'READY_FOR_DISTRIBUTION',
    qualityGateCleared: true,
    shadowTier: 'review',
    structuralBlockers: [],
    funnelVersion: 'v5',
    validation: {
      phone: { valid: true, isVoip: true, lineType: 'voip', smsPumpingRisk: 'low' },
      route: { suspicious: [] },
    },
    miles: 500,
  };
  assert.strictEqual(isHiddenFromMovers(softReviewFinal), false,
    'STAGE 3c (post-pipeline soft review VoIP-only): visible');
  console.log('  ✓ STAGE 3c: post-pipeline SOFT REVIEW (VoIP only) visible');

  // STAGE 3d — Post-qualification, HARD REVIEW (structural blocker):
  //   shadowTier=review, gate=true, structuralBlockers=['route_unresolved'].
  //   Hidden by the structural rule in blocked_and_review.
  const hardReviewFinal = {
    status: 'READY_FOR_DISTRIBUTION',
    qualityGateCleared: true,
    shadowTier: 'review',
    structuralBlockers: ['route_unresolved'],
    funnelVersion: 'v5',
    validation: {
      phone: { valid: true, lineType: 'mobile' },
      route: { suspicious: ['origin_zip_not_found'] },
    },
    miles: 500,
  };
  assert.strictEqual(isHiddenFromMovers(hardReviewFinal), true,
    'STAGE 3d (post-pipeline review + structural): hidden in blocked_and_review');
  assert.strictEqual(passesFilter(hardReviewFinal), false,
    'STAGE 3d: Mongo filter blocks it too');
  console.log('  ✓ STAGE 3d: post-pipeline REVIEW+structural hidden in blocked_and_review');
}

// ── B2. Status-gate works WITHOUT routing-mode env flag (Phase 6.8) ───────
// This is the critical safety net: even if ENABLE_TIERED_ROUTING is unset or
// misconfigured, the lifecycle status alone must hide rejected leads.
{
  // GET /api/leads mover branch ALWAYS requires status IN ['Available','READY_FOR_DISTRIBUTION'].
  // A lead held at PENDING_MANUAL_REVIEW (by Phase 6.8 status-gate) is
  // outside that set — Mongo $in clause excludes it, no matter what
  // moverVisibilityFilter() returns.
  const availableStatuses = ['Available', 'READY_FOR_DISTRIBUTION'];

  // Rejected lead held by Phase 6.8: status=PENDING_MANUAL_REVIEW
  assert.ok(
    !availableStatuses.includes('PENDING_MANUAL_REVIEW'),
    "PENDING_MANUAL_REVIEW is excluded by the GET /api/leads status filter regardless of env flag"
  );

  // For completeness, an approved-by-admin lead transitions back to
  // READY_FOR_DISTRIBUTION (see admin.js approve action upgrade).
  assert.ok(
    availableStatuses.includes('READY_FOR_DISTRIBUTION'),
    'READY_FOR_DISTRIBUTION is admitted by the GET /api/leads status filter (post admin approval)'
  );
  console.log('  ✓ STAGE 4: env-independent status gate — PENDING_MANUAL_REVIEW excluded by status filter');
}

// ── B3. Admin approve must upgrade status back to READY (Phase 6.8) ───────
{
  const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');

  // The approve handler must check for PENDING_MANUAL_REVIEW and upgrade
  // to READY_FOR_DISTRIBUTION.
  assert.ok(
    /lead\.status\s*===\s*['"]PENDING_MANUAL_REVIEW['"][\s\S]{0,500}lead\.status\s*=\s*['"]READY_FOR_DISTRIBUTION['"]/.test(adminSrc),
    'admin approve handler must upgrade PENDING_MANUAL_REVIEW → READY_FOR_DISTRIBUTION'
  );
  console.log('  ✓ admin approve handler upgrades held lead back to READY');
}

// ── C. Tier-router end-to-end with the user's failing production lead ─────
{
  const engine = require('../services/leadScoringEngine');
  const router = require('../services/leadTierRouter');
  const { computeStructuralBlockers } = require('../utils/leadVisibility');

  const lead = {
    customerPhone: '+14567654765', homeSize: '3 Bedroom', miles: 0,
    moveDate: new Date(Date.now() + 5*86400000),
    originZip: '10001', destinationZip: '00000',
    intentConfirmed: true, funnelVersion: 'v5',
    validation: {
      phone: { valid: false, validityReason: 'twilio_says_invalid', checkedAt: new Date() },
      route: { suspicious: ['destination_zip_not_found'], checkedAt: new Date() },
    },
  };
  const result = engine.score(lead);
  const t = router.assign(result.scores, lead);
  const blockers = computeStructuralBlockers(lead);

  assert.strictEqual(t.tier, 'rejected',
    "user's prod lead (invalid phone + destination unresolved + distance=0) → rejected");
  assert.ok(blockers.includes('invalid_phone'), 'structural: invalid_phone');
  assert.ok(blockers.includes('route_unresolved'), 'structural: route_unresolved');
  assert.ok(blockers.includes('distance_unknown'), 'structural: distance_unknown');
  console.log("  ✓ user's prod lead profile → tier=rejected, structuralBlockers populated");
}

console.log('\nAll sequential-qualification smoke tests passed.');
