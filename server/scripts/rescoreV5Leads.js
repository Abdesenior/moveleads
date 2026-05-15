/**
 * One-shot backfill: re-run scoringPipeline on V5 leads so they pick up the
 * Phase 6.5 tier-router hard-rejects + Phase 6.4 structuralBlockers field +
 * Phase 6.3 qualityGateCleared mirror.
 *
 * Why this exists: each phase added new defenses (shadowTier in 6, gate in 6.3,
 * structuralBlockers in 6.4, hard rejects in 6.5) but didn't backfill. A V5
 * lead scored under Phase 6.0 retains its old `shadowTier='review'` value and
 * has NO `structuralBlockers` field. The `blocked_and_review` filter's $nin
 * clause treats missing-field as a pass-through (correct for V4 leads, wrong
 * for stale V5 leads), so those leads stay visible to movers.
 *
 * What this does: load every Lead where `funnelVersion === 'v5'`, then call
 * `scoringPipeline.runShadow(leadId)` for each. The pipeline reads the lead's
 * existing `validation` data (already written by Phase 2 validation runs) and
 * re-runs the engine + tier router under Phase 6.5 rules. The resulting
 * shadowTier, qualityGateCleared, and structuralBlockers are mirrored back
 * onto the Lead doc.
 *
 * Safe to re-run: idempotent. Skips leads where the latest snapshot already
 * has engineVersion >= v5.phase6.1 unless --force is passed.
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node scripts/rescoreV5Leads.js
 *   MONGODB_URI="..." node scripts/rescoreV5Leads.js --force
 *   MONGODB_URI="..." node scripts/rescoreV5Leads.js --dry-run
 *   MONGODB_URI="..." node scripts/rescoreV5Leads.js --limit 100
 *   MONGODB_URI="..." node scripts/rescoreV5Leads.js --since 2026-04-01
 *
 * What it does NOT do:
 *   - Does not touch pricing, status, buyNowPrice
 *   - Does not run validation again (uses existing validation data only)
 *   - Does not send broadcasts (scoringPipeline never broadcasts)
 *   - Does not affect V4 leads
 */

require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2).reduce((acc, val, i, arr) => {
  if (val.startsWith('--')) {
    const key = val.slice(2);
    const next = arr[i + 1];
    acc[key] = (next && !next.startsWith('--')) ? next : true;
  }
  return acc;
}, {});

const FORCE   = args.force === true;
const DRY_RUN = args['dry-run'] === true;
const LIMIT   = args.limit ? Number(args.limit) : 0; // 0 = no limit
const SINCE   = args.since ? new Date(args.since) : null;

const TARGET_ENGINE_VERSION = 'v5.phase6.1';

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is required (or MONGO_URI). Pass it via env.');
    process.exit(1);
  }

  console.log(`[rescoreV5Leads] connecting…  dry-run=${DRY_RUN}  force=${FORCE}  limit=${LIMIT || 'none'}  since=${SINCE?.toISOString() || 'all'}`);
  await mongoose.connect(MONGODB_URI);

  const Lead = require('../models/Lead');
  const ScoringSnapshot = require('../models/ScoringSnapshot');
  const scoringPipeline = require('../services/scoringPipeline');

  const query = { funnelVersion: 'v5' };
  if (SINCE) query.createdAt = { $gte: SINCE };

  const cursor = Lead.find(query).select('_id customerPhone createdAt').sort({ createdAt: -1 }).lean();
  if (LIMIT > 0) cursor.limit(LIMIT);

  let scanned = 0, skipped = 0, rescored = 0, errors = 0;
  const startedAt = Date.now();

  for await (const lead of cursor) {
    scanned += 1;

    // Skip leads already scored under the target engine version (unless --force)
    if (!FORCE) {
      const latest = await ScoringSnapshot.findOne({ leadId: lead._id })
        .sort({ createdAt: -1 })
        .select('engineVersion')
        .lean();
      if (latest && latest.engineVersion === TARGET_ENGINE_VERSION) {
        skipped += 1;
        continue;
      }
    }

    if (DRY_RUN) {
      console.log(`[dry-run] would rescore ${lead._id} (${lead.customerPhone}, created ${lead.createdAt.toISOString()})`);
      rescored += 1;
      continue;
    }

    try {
      const snap = await scoringPipeline.runShadow(lead._id);
      if (snap) {
        rescored += 1;
        if (rescored % 25 === 0) {
          console.log(`  … ${rescored} rescored so far (${scanned} scanned)`);
        }
      } else {
        skipped += 1; // scoring returned null (SCORING_MODE=off or lead missing)
      }
    } catch (err) {
      errors += 1;
      console.error(`[error] ${lead._id}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('');
  console.log('─────────────────────────────────────────');
  console.log(`Scanned:   ${scanned}`);
  console.log(`Rescored:  ${rescored}`);
  console.log(`Skipped:   ${skipped}  (already at ${TARGET_ENGINE_VERSION} or no-op)`);
  console.log(`Errors:    ${errors}`);
  console.log(`Elapsed:   ${elapsed}s`);
  if (DRY_RUN) console.log('(dry-run — no DB writes)');
  console.log('─────────────────────────────────────────');

  await mongoose.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
