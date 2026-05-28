/* eslint-disable no-console */
/**
 * dropOldClaimWindowTokenIndex.js
 *
 * One-shot ops maintenance script for the SMS Claim pre-flip hardening
 * (PR-S2a). Drops the legacy auto-created index `claimWindow.token_1`
 * from the `leads` collection so Mongoose can create the new named
 * unique-sparse index `claimWindow_token_unique` (defined in PR-S2 at
 * server/models/Lead.js) on next connection.
 *
 * Background:
 *   PR-S2 replaced the inline `index: true, sparse: true` on the
 *   claimWindow.token field with an explicit named unique-sparse index
 *   at the schema level. Production Mongo still has the old anonymous
 *   sparse (non-unique) index from before PR-S2. Mongoose's
 *   createIndexes() cannot replace an existing index with one of the
 *   same keys but different options — it logs a warning and skips.
 *
 *   Phase 4 has ZERO rows with claimWindow.token populated, so the
 *   swap is instant and safe — no documents to rebuild, no uniqueness
 *   violations possible at drop or create time.
 *
 * Safety properties:
 *   - Idempotent: re-running after a successful drop is a no-op (script
 *     detects the absence of the old index and exits cleanly).
 *   - Read-then-write: lists current indexes BEFORE attempting drop,
 *     prints them so operator can confirm state.
 *   - Defensive: if Phase 5 has shipped and the collection already has
 *     rows with claimWindow.token populated, the script will refuse to
 *     drop and exit with a non-zero code. (Sanity guard — Phase 4 should
 *     be zero rows.)
 *   - Does NOT touch app behavior, env flags, schema, or other indexes.
 *
 * USAGE
 *   Default (drops the old index if present):
 *     MONGODB_URI="mongodb+srv://..." node server/scripts/dropOldClaimWindowTokenIndex.js
 *
 *   Dry run (lists current state, no writes):
 *     MONGODB_URI="..." node server/scripts/dropOldClaimWindowTokenIndex.js --dry-run
 *
 *   After successful drop, restart the Render service so Mongoose
 *   creates the new `claimWindow_token_unique` index on connection.
 *
 * Verification AFTER restart:
 *   The new index should appear with both `unique: true` and `sparse: true`.
 *   You can re-run this script (now a no-op) and the AFTER state will
 *   show the new index alongside the absence of the old one.
 *
 * Exit codes:
 *   0  - success (index dropped OR already absent)
 *   1  - MONGODB_URI missing
 *   2  - connection failure
 *   3  - safety guard tripped (collection has rows with claimWindow.token)
 *   4  - unexpected error during drop
 */

require('dotenv').config();
const mongoose = require('mongoose');

const OLD_INDEX_NAME = 'claimWindow.token_1';
const NEW_INDEX_NAME = 'claimWindow_token_unique';

function parseArgs(argv) {
  return { dryRun: argv.slice(2).includes('--dry-run') };
}

function formatIndex(idx) {
  const parts = [`name=${idx.name}`, `keys=${JSON.stringify(idx.key)}`];
  if (idx.unique) parts.push('unique=true');
  if (idx.sparse) parts.push('sparse=true');
  if (idx.partialFilterExpression) {
    parts.push(`partial=${JSON.stringify(idx.partialFilterExpression)}`);
  }
  if (idx.expireAfterSeconds != null) {
    parts.push(`ttl=${idx.expireAfterSeconds}s`);
  }
  return `  - ${parts.join(' | ')}`;
}

async function main() {
  const { dryRun } = parseArgs(process.argv);

  if (!process.env.MONGODB_URI) {
    console.error('[dropOldClaimWindowTokenIndex] ERROR: MONGODB_URI env var is required.');
    process.exit(1);
  }

  console.log(`[dropOldClaimWindowTokenIndex] Connecting to Mongo${dryRun ? ' (DRY RUN)' : ''}...`);

  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  } catch (err) {
    console.error('[dropOldClaimWindowTokenIndex] Connection failed:', err.message);
    process.exit(2);
  }

  const leads = mongoose.connection.db.collection('leads');

  // 1. List current indexes (BEFORE state)
  const before = await leads.indexes();
  console.log('\n[dropOldClaimWindowTokenIndex] BEFORE — indexes on leads collection:');
  before.forEach(idx => console.log(formatIndex(idx)));

  const oldIdx = before.find(i => i.name === OLD_INDEX_NAME);
  const newIdx = before.find(i => i.name === NEW_INDEX_NAME);

  if (!oldIdx) {
    console.log(
      `\n[dropOldClaimWindowTokenIndex] OK: '${OLD_INDEX_NAME}' is not present — nothing to drop. ` +
      `${newIdx ? `New '${NEW_INDEX_NAME}' is already in place.` : `New '${NEW_INDEX_NAME}' is NOT in place yet — restart the server to trigger Mongoose createIndexes().`}`
    );
    await mongoose.disconnect();
    process.exit(0);
  }

  // 2. Safety guard: if there are existing rows with claimWindow.token set,
  //    refuse to drop. Phase 4 should be zero. If Phase 5 has shipped and
  //    docs exist, dropping the old index is still safe (we're replacing
  //    with a stricter unique-sparse), but we want an operator to confirm
  //    intent rather than silently proceed.
  const populatedCount = await leads.countDocuments({
    'claimWindow.token': { $exists: true, $ne: null }
  });

  if (populatedCount > 0) {
    console.error(
      `\n[dropOldClaimWindowTokenIndex] SAFETY GUARD: collection has ${populatedCount} ` +
      `lead(s) with claimWindow.token populated. Phase 4 should be ZERO. ` +
      `If Phase 5 has shipped, dropping the old index is still technically safe ` +
      `(the new index is stricter), but please confirm intent and re-run with ` +
      `MONGODB_URI=... node server/scripts/dropOldClaimWindowTokenIndex.js --i-checked-phase-5-is-safe ` +
      `(this flag is not yet implemented — open a follow-up if you reach this state).`
    );
    await mongoose.disconnect();
    process.exit(3);
  }

  // 3. Drop the old index
  console.log(`\n[dropOldClaimWindowTokenIndex] Dropping '${OLD_INDEX_NAME}'${dryRun ? ' (DRY RUN — would drop)' : ''}...`);

  if (dryRun) {
    console.log(`[dropOldClaimWindowTokenIndex] DRY RUN: skipping drop.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  try {
    const result = await leads.dropIndex(OLD_INDEX_NAME);
    console.log(`[dropOldClaimWindowTokenIndex] Drop result:`, result);
  } catch (err) {
    if (err.codeName === 'IndexNotFound') {
      console.log(`[dropOldClaimWindowTokenIndex] Index already absent (raced with another run?). OK.`);
    } else {
      console.error(`[dropOldClaimWindowTokenIndex] Drop failed:`, err.message);
      await mongoose.disconnect();
      process.exit(4);
    }
  }

  // 4. List indexes again (AFTER state)
  const after = await leads.indexes();
  console.log('\n[dropOldClaimWindowTokenIndex] AFTER — indexes on leads collection:');
  after.forEach(idx => console.log(formatIndex(idx)));

  // 5. Tell the operator what to do next
  const newIdxAfter = after.find(i => i.name === NEW_INDEX_NAME);
  if (newIdxAfter) {
    console.log(
      `\n[dropOldClaimWindowTokenIndex] DONE. Both states clean: ` +
      `old '${OLD_INDEX_NAME}' gone, new '${NEW_INDEX_NAME}' present ` +
      `(unique=${!!newIdxAfter.unique}, sparse=${!!newIdxAfter.sparse}).`
    );
  } else {
    console.log(
      `\n[dropOldClaimWindowTokenIndex] DONE. Old '${OLD_INDEX_NAME}' dropped. ` +
      `New '${NEW_INDEX_NAME}' is NOT yet present — RESTART the Render service ` +
      `so Mongoose createIndexes() runs on connection and creates the new ` +
      `named unique-sparse index. Then re-run this script to confirm the ` +
      `AFTER state shows '${NEW_INDEX_NAME}' with unique=true, sparse=true.`
    );
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[dropOldClaimWindowTokenIndex] Unexpected error:', err);
  process.exit(4);
});
