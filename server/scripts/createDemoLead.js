require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const Lead = require('../models/Lead');
const PurchasedLead = require('../models/PurchasedLead');

async function createDemo() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find a mover (take the first one or create one)
    let mover = await User.findOne({ role: 'customer' });
    if (!mover) {
      console.log('No mover found. Creating one...');
      mover = new User({
        companyName: 'Demo Mover',
        email: 'demo@example.com',
        password: 'password123',
        role: 'customer',
        balance: 100,
        isEmailVerified: true
      });
      await mover.save();
    }

    // Create a Grade A lead
    const lead = new Lead({
      customerName: 'Demo Customer',
      customerPhone: '+1234567890',
      customerEmail: 'customer@demo.com',
      originCity: 'Los Angeles',
      destinationCity: 'San Francisco',
      originZip: '90001',
      destinationZip: '94101',
      homeSize: '3 Bedroom',
      moveDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      miles: 400,
      price: 25,
      distance: 'Long Distance',
      route: 'LA -> SF',
      grade: 'A',
      status: 'Purchased',
      isWarmTransfer: true,
      buyers: [{ company: mover._id, purchasedAt: new Date() }]
    });
    await lead.save();

    // Create the purchase record
    const purchase = new PurchasedLead({
      company: mover._id,
      lead: lead._id,
      pricePaid: 40,
      isLiveTransfer: true // Ticket 49 field
    });
    await purchase.save();

    console.log(`Demo lead created! ID: ${lead._id}`);
    console.log(`Mover Email: ${mover.email}`);
    console.log('Check "My Leads" in the dashboard to see the 🔥 Live Transfer badge.');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

createDemo();
