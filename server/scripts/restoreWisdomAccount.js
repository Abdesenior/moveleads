/**
 * One-time restore: recreate deleted Wisdom mover account and relink purchased leads.
 *
 * Steps performed:
 *   1. Check for orphaned purchased leads / transactions linked to old company ID
 *   2. Create new user document with hashed password
 *   3. Relink purchasedleads + transactions to new user ID
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node scripts/restoreWisdomAccount.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const OLD_COMPANY_ID = '69bf4aa7053fc6cf9d8339bf';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // ── Step 1: Audit orphaned data ────────────────────────────────────────────
  const oldOid = new mongoose.Types.ObjectId(OLD_COMPANY_ID);

  const purchasedLeads = await db.collection('purchasedleads')
    .find({ company: oldOid })
    .toArray();
  console.log(`Orphaned purchased leads linked to old ID: ${purchasedLeads.length}`);
  purchasedLeads.forEach(p =>
    console.log(`  PurchasedLead _id=${p._id}  lead=${p.lead}  pricePaid=${p.pricePaid}`)
  );

  const transactions = await db.collection('transactions')
    .find({ user: oldOid })
    .toArray();
  console.log(`\nOrphaned transactions linked to old ID: ${transactions.length}`);
  transactions.forEach(t =>
    console.log(`  Transaction _id=${t._id}  type=${t.type}  amount=${t.amount}`)
  );

  // ── Step 2: Check whether account already exists (idempotent) ─────────────
  const existing = await db.collection('users')
    .findOne({ email: 'contact@wisdomiptv.com' });
  if (existing) {
    console.log(`\nAccount contact@wisdomiptv.com already exists (_id=${existing._id}). Skipping creation.`);
    await relink(db, oldOid, existing._id);
    return;
  }

  // ── Step 3: Recreate user ──────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Wisdom2026!', 10);
  const now = new Date();
  const insertResult = await db.collection('users').insertOne({
    companyName:        'Wisdom',
    email:              'contact@wisdomiptv.com',
    password:           passwordHash,
    role:               'mover',
    balance:            0,
    isVerified:         true,
    isSuspended:        false,
    serviceArea:        [],
    notificationPrefs:  { email: true, sms: false },
    createdAt:          now,
    updatedAt:          now,
  });

  const newId = insertResult.insertedId;
  console.log(`\nUser recreated — new _id: ${newId}`);

  // ── Step 4: Relink orphaned records ───────────────────────────────────────
  await relink(db, oldOid, newId);
}

async function relink(db, oldOid, newOid) {
  const plResult = await db.collection('purchasedleads').updateMany(
    { company: oldOid },
    { $set: { company: newOid } }
  );
  console.log(`\nRelinked purchased leads:  ${plResult.modifiedCount} updated`);

  const txResult = await db.collection('transactions').updateMany(
    { user: oldOid },
    { $set: { user: newOid } }
  );
  console.log(`Relinked transactions:     ${txResult.modifiedCount} updated`);

  // Also relink any communications
  const commResult = await db.collection('communications').updateMany(
    { company: oldOid },
    { $set: { company: newOid } }
  );
  console.log(`Relinked communications:   ${commResult.modifiedCount} updated`);

  console.log('\nRestore complete.');
  console.log('  Email:    contact@wisdomiptv.com');
  console.log('  Password: Wisdom2026!');
  console.log('  Role:     mover');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Restore failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
