const mongoose = require('mongoose');

async function ensureIndexes() {
  try {
    const db = mongoose.connection.db;
    const leads = db.collection('leads');
    await Promise.all([
      leads.createIndex({ originZip: 1 }),
      leads.createIndex({ destinationZip: 1 }),
      leads.createIndex({ status: 1, auctionStatus: 1 }),
      leads.createIndex({ createdAt: -1 }),
      leads.createIndex({ auctionStatus: 1, auctionEndsAt: 1 }),
    ]);
    console.log('[DB] Indexes ensured on leads collection');
  } catch (err) {
    console.warn('[DB] Index creation warning:', err.message);
  }
}

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('MongoDB Connected...');
    ensureIndexes();
  } catch (err) {
    console.error('MongoDB Connection Error:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
