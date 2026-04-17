/**
 * Securely create an admin or super_admin account directly in MongoDB.
 * This is the ONLY way to create privileged accounts — there is no public endpoint.
 *
 * Usage (run from /MoveLeads/server or with MONGODB_URI env var set):
 *   MONGODB_URI="mongodb+srv://..." node scripts/createAdmin.js \
 *     --email admin@moveleads.cloud \
 *     --password "YourSecurePassword!" \
 *     --name "MoveLeads Admin" \
 *     --role admin
 *
 * --role can be 'admin' or 'super_admin' (defaults to 'admin')
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const args = process.argv.slice(2).reduce((acc, val, i, arr) => {
  if (val.startsWith('--')) acc[val.slice(2)] = arr[i + 1];
  return acc;
}, {});

const { email, password, name, role = 'admin' } = args;

if (!email || !password || !name) {
  console.error('Usage: node scripts/createAdmin.js --email <email> --password <pass> --name <name> [--role admin|super_admin]');
  process.exit(1);
}

if (!['admin', 'super_admin'].includes(role)) {
  console.error('--role must be "admin" or "super_admin"');
  process.exit(1);
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const existing = await db.collection('users').findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    console.error(`Account already exists: ${email} (role: ${existing.role})`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const now  = new Date();
  const result = await db.collection('users').insertOne({
    companyName:     name,
    email:           email.toLowerCase().trim(),
    password:        hash,
    role,
    balance:         0,
    isVerified:      true,
    isEmailVerified: true,
    isSuspended:     false,
    createdAt:       now,
    updatedAt:       now,
  });

  console.log(`\nAdmin account created:`);
  console.log(`  _id:   ${result.insertedId}`);
  console.log(`  email: ${email}`);
  console.log(`  role:  ${role}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Failed:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
