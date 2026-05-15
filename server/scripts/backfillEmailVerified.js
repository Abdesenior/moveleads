/* eslint-disable no-console */
/**
 * backfillEmailVerified.js
 *
 * Grandfather pre-existing user accounts so they no longer get bounced to
 * /verify-email-pending. The email-verification feature was rolled out
 * after these accounts already existed in the DB, so they carry the
 * default `isEmailVerified: false` flag from User.js even though policy
 * says only NEW signups need to verify.
 *
 * Idempotent — safe to re-run. Filters on { isEmailVerified: { $ne: true } }
 * so any user already verified is skipped.
 *
 * USAGE
 *   Dry-run (default — no writes; shows count + sample of who would change):
 *     node server/scripts/backfillEmailVerified.js
 *
 *   Apply for every unverified user (the typical case — full grandfather):
 *     node server/scripts/backfillEmailVerified.js --apply
 *
 *   Apply only to accounts created on or before a given UTC date — useful
 *   if you want to require verification for any account younger than the
 *   cutoff (e.g. only grandfather accounts that existed before the feature
 *   shipped):
 *     node server/scripts/backfillEmailVerified.js --apply --before=2025-12-01
 *
 *   Restrict to a single account (useful for spot-fixing one user):
 *     node server/scripts/backfillEmailVerified.js --apply --email=foo@bar.com
 *
 * NOTES
 *   - Going forward, /auth/register continues to insert new users with
 *     isEmailVerified: false (routes/auth.js:109), so they still hit the
 *     verification flow. Only users already in the DB at run-time are
 *     touched.
 *   - The script does NOT clear emailVerificationToken / Expires fields.
 *     They become inert once isEmailVerified is true; cleaning them up is
 *     a separate, optional pass.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

function parseArgs(argv) {
  const args = { apply: false, before: null, email: null };
  for (const a of argv.slice(2)) {
    if (a === '--apply') args.apply = true;
    else if (a.startsWith('--before=')) args.before = a.slice('--before='.length);
    else if (a.startsWith('--email=')) args.email = a.slice('--email='.length).toLowerCase().trim();
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!process.env.MONGODB_URI) {
    console.error('[Backfill] MONGODB_URI is not set in the environment. Refusing to run.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('[Backfill] Connected to MongoDB.');

  const filter = { isEmailVerified: { $ne: true } };

  if (args.before) {
    const cutoff = new Date(args.before);
    if (isNaN(cutoff.valueOf())) {
      console.error(`[Backfill] Invalid --before date: ${args.before}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    filter.createdAt = { $lte: cutoff };
    console.log(`[Backfill] Restricting to accounts createdAt <= ${cutoff.toISOString()}`);
  }
  if (args.email) {
    filter.email = args.email;
    console.log(`[Backfill] Restricting to email = ${args.email}`);
  }

  const count = await User.countDocuments(filter);
  console.log(`[Backfill] ${count} user(s) match the filter.`);

  if (count === 0) {
    console.log('[Backfill] Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const sample = await User
    .find(filter)
    .select('email companyName role createdAt isEmailVerified')
    .sort({ createdAt: 1 })
    .limit(10)
    .lean();
  console.log('[Backfill] Sample (first 10 by createdAt):');
  for (const u of sample) {
    console.log(`  - ${u.email}  · role=${u.role}  · created=${u.createdAt?.toISOString?.() || '—'}  · company="${u.companyName || ''}"`);
  }

  if (!args.apply) {
    console.log('[Backfill] DRY RUN — pass --apply to actually update.');
    await mongoose.disconnect();
    return;
  }

  const result = await User.updateMany(filter, { $set: { isEmailVerified: true } });
  console.log(`[Backfill] Updated ${result.modifiedCount ?? result.nModified ?? 0} user(s).`);

  await mongoose.disconnect();
  console.log('[Backfill] Done.');
}

main().catch(async (err) => {
  console.error('[Backfill] Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
