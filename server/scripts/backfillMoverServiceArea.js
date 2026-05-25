/* eslint-disable no-console */
/**
 * backfillMoverServiceArea.js
 *
 * Mover-coverage cleanup, Phase 1 migration: populate the new top-level
 * `pickupStates` + `deliveryStates` + `interstateEnabled` fields on every
 * mover (User where role='customer') from the existing legacy data.
 *
 * Idempotent (re-runnable) and dry-run by default.
 *
 * Backfill source priority (per user, first match wins):
 *
 *   1. onboarding.answers.pickup.states + onboarding.answers.delivery.states
 *      (these reflect the most recent explicit pickup/delivery split the
 *       mover made during the new onboarding flow)
 *
 *   2. serviceStates (legacy single list — backfill into BOTH pickup and
 *      delivery, since the legacy semantics treated states symmetrically;
 *      that preserves matching behavior under the Phase 1 union mirror).
 *
 *   3. Empty arrays + interstateEnabled=false (mover hasn't configured
 *      anything; new Settings UI will prompt them).
 *
 * `deliversNationwide` is NEVER changed by this script — it's already the
 * authoritative top-level flag for nationwide delivery.
 *
 * USAGE
 *   Dry run (default — bucket counts + sample, no writes):
 *     node server/scripts/backfillMoverServiceArea.js
 *
 *   Apply across the collection:
 *     node server/scripts/backfillMoverServiceArea.js --apply
 *
 *   Restrict to a single user by id (for spot-checks):
 *     node server/scripts/backfillMoverServiceArea.js --apply --id=665f...
 *
 *   Batch size (default 500):
 *     node server/scripts/backfillMoverServiceArea.js --apply --batch=1000
 *
 * Idempotency: re-running re-derives every mover. Users whose pickup/delivery
 * already match the derived values get no write (computed-then-compared).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const {
  normalizeStateList,
  computeInterstateEnabled,
} = require('../utils/serviceAreaMirror');

const args = process.argv.slice(2);
const APPLY  = args.includes('--apply');
const ID_ARG = (args.find(a => a.startsWith('--id=')) || '').split('=')[1] || null;
const BATCH  = Number((args.find(a => a.startsWith('--batch=')) || '').split('=')[1]) || 500;

function deriveFor(user) {
  // Source 1 — explicit pickup/delivery from onboarding answers
  const a = user.onboarding && user.onboarding.answers ? user.onboarding.answers : {};
  const onboardPickup   = a.pickup   && Array.isArray(a.pickup.states)   ? a.pickup.states   : null;
  const onboardDelivery = a.delivery && Array.isArray(a.delivery.states) ? a.delivery.states : null;
  const onboardNationwide = !!(a.delivery && a.delivery.mode === 'nationwide');

  // Source 2 — legacy serviceStates
  const legacy = Array.isArray(user.serviceStates) ? user.serviceStates : null;

  let pickupStates, deliveryStates, source;
  if (onboardPickup && onboardPickup.length > 0) {
    pickupStates = normalizeStateList(onboardPickup);
    deliveryStates = onboardNationwide
      ? []
      : (onboardDelivery && onboardDelivery.length > 0
          ? normalizeStateList(onboardDelivery)
          : normalizeStateList(onboardPickup)); // delivery.mode='same' default
    source = 'onboarding';
  } else if (legacy && legacy.length > 0) {
    const cleaned = normalizeStateList(legacy);
    pickupStates = cleaned;
    deliveryStates = user.deliversNationwide ? [] : cleaned;
    source = 'serviceStates';
  } else {
    pickupStates = [];
    deliveryStates = [];
    source = 'empty';
  }

  const interstateEnabled = computeInterstateEnabled({
    pickupStates,
    deliveryStates,
    deliversNationwide: !!user.deliversNationwide,
  });

  return { pickupStates, deliveryStates, interstateEnabled, source };
}

function arraysEqualUnsorted(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`[backfill] connected. mode=${APPLY ? 'APPLY' : 'DRY-RUN'} batch=${BATCH} id=${ID_ARG || 'all'}`);

  const baseQuery = ID_ARG
    ? { _id: ID_ARG }
    : { role: 'customer' };

  const counts = {
    scanned: 0,
    fromOnboarding: 0,
    fromServiceStates: 0,
    fromEmpty: 0,
    needsWrite: 0,
    wrote: 0,
    skippedIdempotent: 0,
  };
  const samples = [];

  const cursor = User.find(baseQuery)
    .select('_id email companyName role serviceStates pickupStates deliveryStates deliversNationwide interstateEnabled onboarding.answers.pickup onboarding.answers.delivery')
    .lean()
    .cursor({ batchSize: BATCH });

  for await (const u of cursor) {
    counts.scanned++;
    const derived = deriveFor(u);
    counts[`from${derived.source.charAt(0).toUpperCase() + derived.source.slice(1)}`] =
      (counts[`from${derived.source.charAt(0).toUpperCase() + derived.source.slice(1)}`] || 0) + 1;

    const currentPickup   = Array.isArray(u.pickupStates)   ? u.pickupStates   : [];
    const currentDelivery = Array.isArray(u.deliveryStates) ? u.deliveryStates : [];
    const currentInter    = !!u.interstateEnabled;

    const noChange =
      arraysEqualUnsorted(currentPickup, derived.pickupStates) &&
      arraysEqualUnsorted(currentDelivery, derived.deliveryStates) &&
      currentInter === derived.interstateEnabled;

    if (noChange) {
      counts.skippedIdempotent++;
      continue;
    }
    counts.needsWrite++;

    if (samples.length < 10) {
      samples.push({
        id: String(u._id),
        email: u.email,
        source: derived.source,
        nationwide: !!u.deliversNationwide,
        prev: { pickup: currentPickup, delivery: currentDelivery, interstate: currentInter },
        next: { pickup: derived.pickupStates, delivery: derived.deliveryStates, interstate: derived.interstateEnabled },
      });
    }

    if (APPLY) {
      await User.updateOne(
        { _id: u._id },
        { $set: {
          pickupStates:      derived.pickupStates,
          deliveryStates:    derived.deliveryStates,
          interstateEnabled: derived.interstateEnabled,
        } }
      );
      counts.wrote++;
    }
  }

  console.log('\n[backfill] done');
  console.log(JSON.stringify(counts, null, 2));
  console.log('\nSample (up to 10):');
  console.log(JSON.stringify(samples, null, 2));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[backfill] FAILED:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
