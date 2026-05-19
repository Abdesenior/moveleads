/* eslint-disable no-console */
/**
 * backfillDistributionDecision.js
 *
 * Phase 1 migration: populate the new `distributionDecision` field on every
 * Lead document from existing evidence + prior admin actions. Idempotent
 * (re-runnable) and dry-run by default.
 *
 * Backfill rules, in priority order:
 *
 *   1. status === 'REJECTED_FAKE'
 *      → admin_rejected, by=<override.by || 'migration'>,
 *        reason='backfill: status=REJECTED_FAKE'
 *
 *   2. adminTierOverride.tier === 'rejected'
 *      → admin_rejected, by=<override.by || 'migration'>,
 *        reason='backfill: override=rejected'
 *
 *   3. adminTierOverride.tier ∈ { hot, premium, standard }
 *      → admin_approved, by=<override.by || 'migration'>,
 *        reason='backfill: override=<tier>'
 *
 *   4. (default — no admin distribution action recorded)
 *      → deriveSystemDecision(lead), by='system',
 *        reason='backfill: derived from <source>'
 *
 * Note: `adminTierOverride.tier === 'review'` historic leads are deliberately
 * NOT mapped to admin_approved. The "review" override was a tier tag with an
 * accidental visibility side-effect (qualityGateCleared=true made it visible).
 * Backfill corrects the inversion: those leads get the system verdict instead.
 * The migration log surfaces N affected leads so the operator can audit.
 *
 * USAGE
 *   Dry run (default — bucket counts + sample, no writes):
 *     node server/scripts/backfillDistributionDecision.js
 *
 *   Apply across the collection:
 *     node server/scripts/backfillDistributionDecision.js --apply
 *
 *   Restrict to a single lead by id (for spot-checks):
 *     node server/scripts/backfillDistributionDecision.js --apply --id=665f...
 *
 *   Batch size (default 500):
 *     node server/scripts/backfillDistributionDecision.js --apply --batch=1000
 *
 * Idempotency: re-running re-derives every lead. Leads that already have the
 * correct value are no-op'd via `$set` (Mongo doesn't bump updatedAt unless
 * the value actually changes — but to be safe, we compute first and only
 * write if the new value differs).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const {
  deriveSystemDecision,
  describeSystemDecisionSource,
} = require('../utils/distributionDecision');

function parseArgs(argv) {
  const args = { apply: false, id: null, batch: 500 };
  for (const a of argv.slice(2)) {
    if (a === '--apply') args.apply = true;
    else if (a.startsWith('--id=')) args.id = a.slice('--id='.length).trim();
    else if (a.startsWith('--batch=')) {
      const n = parseInt(a.slice('--batch='.length), 10);
      if (Number.isFinite(n) && n > 0) args.batch = n;
    }
  }
  return args;
}

/**
 * Pure function — given a Lead doc, return the target backfill state.
 * Exported for unit testing. Does NOT touch the DB.
 *
 * @param {Object} lead - Lead document (lean preferred)
 * @returns {{decision: string, by: string, reason: string, bucket: string}}
 */
function classifyForBackfill(lead) {
  if (!lead) {
    return { decision: 'system_pending', by: 'migration', reason: 'backfill: missing doc', bucket: 'system_pending' };
  }

  // (1) status=REJECTED_FAKE → admin_rejected
  if (lead.status === 'REJECTED_FAKE') {
    const by = lead.adminTierOverride && lead.adminTierOverride.by
      ? String(lead.adminTierOverride.by) : 'migration';
    return {
      decision: 'admin_rejected', by,
      reason: 'backfill: status=REJECTED_FAKE',
      bucket: 'admin_rejected',
    };
  }

  const overrideTier = lead.adminTierOverride && lead.adminTierOverride.tier;
  const overrideBy   = lead.adminTierOverride && lead.adminTierOverride.by
    ? String(lead.adminTierOverride.by) : 'migration';

  // (2) override=rejected → admin_rejected
  if (overrideTier === 'rejected') {
    return {
      decision: 'admin_rejected', by: overrideBy,
      reason: 'backfill: override=rejected',
      bucket: 'admin_rejected',
    };
  }

  // (3) override ∈ {hot, premium, standard} → admin_approved
  if (['hot', 'premium', 'standard'].includes(overrideTier)) {
    return {
      decision: 'admin_approved', by: overrideBy,
      reason: `backfill: override=${overrideTier}`,
      bucket: 'admin_approved',
    };
  }

  // (4) Default — system verdict from evidence. Includes the override=review
  //     case (deliberate semantic correction; see header comment).
  const decision = deriveSystemDecision(lead);
  const source   = describeSystemDecisionSource(lead);
  const reason = overrideTier === 'review'
    ? `backfill: override=review reverted to system (${source})`
    : `backfill: derived from ${source}`;
  return { decision, by: 'system', reason, bucket: decision };
}

async function main() {
  const args = parseArgs(process.argv);
  const apply = args.apply;
  const idFilter = args.id;

  if (!process.env.MONGO_URI) {
    console.error('Missing MONGO_URI in env. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[backfillDistributionDecision] connected (apply=${apply}, batch=${args.batch}${idFilter ? `, id=${idFilter}` : ''})`);

  const baseFilter = idFilter ? { _id: idFilter } : {};
  const total = await Lead.countDocuments(baseFilter);
  console.log(`[backfillDistributionDecision] scanning ${total} leads…`);

  const buckets = {
    admin_approved: 0,
    admin_rejected: 0,
    system_pending: 0,
    system_approved: 0,
    system_held:     0,
    system_rejected: 0,
  };
  const sampleByBucket = {
    admin_approved: [], admin_rejected: [],
    system_pending: [], system_approved: [], system_held: [], system_rejected: [],
  };
  let processed = 0;
  let written   = 0;
  let unchanged = 0;
  let reviewOverrideReverted = 0;

  const cursor = Lead.find(baseFilter)
    .select('status adminTierOverride shadowTier qualityGateCleared structuralBlockers validation miles distributionDecision')
    .lean()
    .cursor({ batchSize: args.batch });

  for await (const lead of cursor) {
    processed += 1;
    const target = classifyForBackfill(lead);
    buckets[target.bucket] = (buckets[target.bucket] || 0) + 1;

    if (sampleByBucket[target.bucket].length < 5) {
      sampleByBucket[target.bucket].push({
        _id: String(lead._id),
        status: lead.status,
        shadowTier: lead.shadowTier,
        overrideTier: lead.adminTierOverride && lead.adminTierOverride.tier,
        reason: target.reason,
      });
    }
    if (lead.adminTierOverride && lead.adminTierOverride.tier === 'review' && target.bucket !== 'admin_approved' && target.bucket !== 'admin_rejected') {
      reviewOverrideReverted += 1;
    }

    if (lead.distributionDecision === target.decision) {
      unchanged += 1;
      continue;
    }

    if (apply) {
      try {
        await Lead.updateOne(
          { _id: lead._id },
          { $set: {
              distributionDecision:       target.decision,
              distributionDecisionBy:     target.by,
              distributionDecisionAt:     new Date(),
              distributionDecisionReason: target.reason,
          } }
        );
        written += 1;
      } catch (err) {
        console.warn(`[backfillDistributionDecision] write failed for ${lead._id}: ${err.message}`);
      }
    }

    if (processed % 1000 === 0) {
      console.log(`[backfillDistributionDecision] progress: ${processed}/${total} (written=${written}, unchanged=${unchanged})`);
    }
  }

  console.log('\n[backfillDistributionDecision] summary:');
  console.log(`  total scanned:        ${processed}`);
  console.log(`  already correct:      ${unchanged}`);
  console.log(`  written:              ${apply ? written : '(dry run — none)'}`);
  console.log(`  override=review fixed: ${reviewOverrideReverted} (reverted to system verdict)`);
  console.log('  bucket distribution:');
  for (const [bucket, count] of Object.entries(buckets)) {
    console.log(`    ${bucket.padEnd(18)} ${count}`);
  }
  console.log('  samples per bucket (up to 5 each):');
  for (const [bucket, sample] of Object.entries(sampleByBucket)) {
    if (sample.length === 0) continue;
    console.log(`    ${bucket}:`);
    for (const s of sample) {
      console.log(`      ${s._id}  status=${s.status} shadowTier=${s.shadowTier} override=${s.overrideTier} — ${s.reason}`);
    }
  }
  if (!apply) {
    console.log('\nDry run complete. Re-run with --apply to write.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

// Export the pure classifier for tests; only run main() when invoked as a script.
module.exports = { classifyForBackfill };

if (require.main === module) {
  main().catch(err => {
    console.error('[backfillDistributionDecision] fatal:', err);
    process.exit(1);
  });
}
