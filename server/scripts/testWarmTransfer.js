require('dotenv').config();
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const CoverageArea = require('../models/CoverageArea');
const { verifyLeadPhone } = require('../services/twilioService');

async function runTest() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Create a dummy mover with high balance and coverage
    let mover = await User.findOne({ email: 'warm-transfer-test@example.com' });
    if (!mover) {
      mover = new User({
        companyName: 'Warm Transfer Test Mover',
        email: 'warm-transfer-test@example.com',
        password: 'password123',
        phone: '+15005550006', // Twilio test number
        role: 'customer',
        balance: 100,
        isEmailVerified: true
      });
      await mover.save();
    } else {
      mover.balance = 100;
      await mover.save();
    }

    // Ensure coverage
    const zip = '90210';
    let coverage = await CoverageArea.findOne({ company: mover._id, zipCode: zip });
    if (!coverage) {
      coverage = new CoverageArea({
        company: mover._id,
        zipCode: zip,
        type: 'both'
      });
      await coverage.save();
    }

    console.log(`Mover ${mover.email} ready with balance ${mover.balance} and coverage for ${zip}`);

    // 2. Create a "Grade A" lead
    // A lead is grade A if: (Miles > 500) AND (3+ Bedroom) AND (Within 30 days)
    // Or other combinations that yield score >= 85.
    const lead = new Lead({
      route: 'BH → BH',
      originCity: 'Beverly Hills',
      destinationCity: 'Beverly Hills',
      originZip: zip,
      destinationZip: zip,
      homeSize: '4 Bedroom',
      moveDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
      distance: 'Local',
      miles: 600, // Long distance bonus
      price: 15,
      status: 'Pending Verification',
      customerName: 'Test Customer',
      customerPhone: '+15005550006',
      customerEmail: 'test@example.com'
    });
    await lead.save();
    console.log(`Lead created: ${lead._id}`);

    // 3. Trigger verification
    console.log('Triggering verification...');
    await verifyLeadPhone(lead._id);

    // 4. Check results
    const updatedLead = await Lead.findById(lead._id);
    console.log(`Updated Lead Grade: ${updatedLead.grade}`);
    console.log(`Updated Lead Status: ${updatedLead.status}`);
    console.log(`Is Warm Transfer: ${updatedLead.isWarmTransfer}`);

    if (updatedLead.grade === 'A') {
      console.log('SUCCESS: Lead graded A as expected.');
    } else {
      console.log('FAILURE: Lead was not graded A.');
    }

    console.log('\n--- Simulating Voice Route Logic (Ticket 49) ---');
    const findEligibleMovers = require('../utils/findEligibleMovers');
    const PurchasedLead = require('../models/PurchasedLead');
    const Transaction = require('../models/Transaction');

    // Test 1: Mover selection filter (Default should be false now)
    await User.findByIdAndUpdate(mover._id, { receiveLiveTransfers: false });
    const eligible1 = await findEligibleMovers(updatedLead.originZip, updatedLead.destinationZip);
    const warmMovers1 = eligible1.filter(m => m.balance >= 50 && m.receiveLiveTransfers === true);
    console.log(`Eligible movers with receiveLiveTransfers=false: ${warmMovers1.length}`);
    
    if (warmMovers1.length === 0) {
      console.log('SUCCESS: Default opt-out (receiveLiveTransfers=false) respected.');
    } else {
      console.log('FAILURE: Mover included despite being opted out.');
    }

    // Test 2: Opt-in
    await User.findByIdAndUpdate(mover._id, { receiveLiveTransfers: true });
    const eligible2 = await findEligibleMovers(updatedLead.originZip, updatedLead.destinationZip);
    const warmMovers2 = eligible2.filter(m => m.balance >= 50 && m.receiveLiveTransfers === true);
    console.log(`Eligible movers after opt-in (receiveLiveTransfers=true): ${warmMovers2.length}`);

    if (warmMovers2.length === 1) {
      console.log('SUCCESS: Opt-in (receiveLiveTransfers=true) working correctly.');
    } else {
      console.log('FAILURE: Mover not found after opt-in.');
    }

    // Test 3: Simulated Mover Accept
    console.log('\n--- Simulating Mover Accept ---');
    const moverId = mover._id;
    const leadPrice = 40;
    
    // Simulate mover-accept endpoint logic
    const { deductLeadBalance } = require('../services/billingService');
    await deductLeadBalance(moverId, leadPrice, null, 'Live Warm Transfer');
    
    updatedLead.buyers.push({ company: moverId, purchasedAt: new Date() });
    updatedLead.status = 'Purchased';
    updatedLead.isWarmTransfer = true;
    await updatedLead.save();

    await new PurchasedLead({
      company: moverId,
      lead: updatedLead._id,
      pricePaid: leadPrice
    }).save();

    // Verify Transaction description
    const tx = await Transaction.findOne({ user: moverId, type: 'Lead Purchase' }).sort({ date: -1 });
    console.log(`Transaction Description: ${tx?.description}`);
    if (tx?.description === 'Live Warm Transfer') {
      console.log('SUCCESS: Transaction description is correct.');
    } else {
      console.log('FAILURE: Transaction description is incorrect.');
    }

    console.log('\nVerification complete.');

  } catch (err) {
    console.error('Test Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

runTest();
