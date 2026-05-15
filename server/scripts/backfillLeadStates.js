/* eslint-disable no-console */
/**
 * backfillLeadStates.js
 *
 * One-off migration: derive originState / destinationState from the existing
 * originZip / destinationZip on every legacy Lead doc that doesn't yet have
 * them. The `zipcodes` npm package (already used by leadIngestV2 and
 * placeAutocomplete) is the canonical ZIP → (city, state) source — same
 * lookup the ingest path uses, so we never disagree with what new leads
 * store.
 *
 * Idempotent — filters on docs where either state field is missing or empty,
 * and only updates the missing side(s). Safe to re-run.
 *
 * USAGE
 *   Dry run (default — counts + sample only, no writes):
 *     node server/scripts/backfillLeadStates.js
 *
 *   Apply for every legacy lead:
 *     node server/scripts/backfillLeadStates.js --apply
 *
 *   Restrict to a single lead by id (useful for spot-fixes):
 *     node server/scripts/backfillLeadStates.js --apply --id=665f...
 */

require('dotenv').config();
const mongoose = require('mongoose');
const zipcodes = require('zipcodes');
const Lead = require('../models/Lead');

function parseArgs(argv) {
  const args = { apply: false, id: null };
  for (const a of argv.slice(2)) {
    if (a === '--apply') args.apply = true;
    else if (a.startsWith('--id=')) args.id = a.slice('--id='.length).trim();
  }
  return args;
}

function stateFromZip(zip) {
  const z = zipcodes.lookup(String(zip || ''));
  return (z && z.state) ? String(z.state).toUpperCase() : '';
}

async function main() {
  const args = parseArgs(process.argv);

  if (!process.env.MONGODB_URI) {
    console.error('[BackfillStates] MONGODB_URI not set. Refusing to run.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('[BackfillStates] Connected.');

  // Pick leads that are missing OR have empty originState/destinationState.
  const filter = {
    $or: [
      { originState:      { $in: [null, '', undefined] } },
      { originState:      { $exists: false } },
      { destinationState: { $in: [null, '', undefined] } },
      { destinationState: { $exists: false } },
    ],
  };
  if (args.id) {
    if (!mongoose.Types.ObjectId.isValid(args.id)) {
      console.error(`[BackfillStates] Invalid --id: ${args.id}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    filter._id = new mongoose.Types.ObjectId(args.id);
  }

  const totalCandidates = await Lead.countDocuments(filter);
  console.log(`[BackfillStates] ${totalCandidates} lead(s) need a state derivation.`);
  if (totalCandidates === 0) {
    console.log('[BackfillStates] Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const cursor = Lead.find(filter)
    .select('_id originZip destinationZip originState destinationState originCity destinationCity')
    .lean()
    .cursor();

  let inspected = 0;
  let toUpdate  = 0;
  let updated   = 0;
  let zipMissOrigin = 0;
  let zipMissDest   = 0;
  const sample = [];

  for await (const doc of cursor) {
    inspected += 1;
    const setOps = {};

    if (!doc.originState) {
      const s = stateFromZip(doc.originZip);
      if (s) setOps.originState = s;
      else zipMissOrigin += 1;
    }
    if (!doc.destinationState) {
      const s = stateFromZip(doc.destinationZip);
      if (s) setOps.destinationState = s;
      else zipMissDest += 1;
    }

    if (Object.keys(setOps).length === 0) continue;
    toUpdate += 1;

    if (sample.length < 5) {
      sample.push({
        _id: String(doc._id),
        from: `${doc.originCity} (${doc.originZip})`,
        to:   `${doc.destinationCity} (${doc.destinationZip})`,
        set:  setOps,
      });
    }

    if (args.apply) {
      try {
        await Lead.updateOne({ _id: doc._id }, { $set: setOps });
        updated += 1;
      } catch (err) {
        console.error(`[BackfillStates] update failed for ${doc._id}:`, err.message);
      }
    }
  }

  console.log('────────────────────────────────────────────────');
  console.log(`[BackfillStates] inspected             : ${inspected}`);
  console.log(`[BackfillStates] would-update          : ${toUpdate}`);
  console.log(`[BackfillStates] origin ZIP unresolved : ${zipMissOrigin}`);
  console.log(`[BackfillStates] dest   ZIP unresolved : ${zipMissDest}`);
  console.log(`[BackfillStates] applied               : ${updated}${args.apply ? '' : ' (dry run)'}`);
  console.log('[BackfillStates] sample:');
  for (const s of sample) console.log('  ', JSON.stringify(s));
  console.log('────────────────────────────────────────────────');

  if (!args.apply) console.log('[BackfillStates] DRY RUN — pass --apply to commit.');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[BackfillStates] Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
