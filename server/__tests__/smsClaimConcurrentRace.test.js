/**
 * SMS Claim — Concurrent race integration test.
 *
 * Simulates two movers replying "SEND <token>" within milliseconds for
 * the same Lead. Asserts the exactly-one-winner invariant across:
 *
 *   - PurchasedLead  (unique { company, lead } mutex)
 *   - User.balance   (winner debited, loser untouched)
 *   - ClaimAttempt   (one outcome='won', one loser outcome)
 *   - Lead state     (terminal: claimWindow.status='claimed',
 *                     auctionStatus='sold', status='Purchased')
 *
 * UNLIKE every other unit-style test in /server/__tests__/ (most are
 * source scans), this is a REAL-MONGO integration test. It requires:
 *
 *   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/moveleads_smsclaim_race_test
 *
 * If unset, the test self-skips with a clear message so CI lanes that
 * only run unit/source-scan tests stay green. Run locally:
 *
 *   TEST_MONGODB_URI='mongodb://127.0.0.1:27017/moveleads_smsclaim_race_test' \
 *     node server/__tests__/smsClaimConcurrentRace.test.js
 *
 * Caveats:
 *   - Loser SMS fan-out (sendMoverLostClaimSMS) is stubbed via
 *     require.cache BEFORE routes/twilio is loaded, so the test asserts
 *     ClaimAttempt outcomes rather than real Twilio sends.
 *   - The 'lost' outcome will most likely be 'lost_already_claimed' via
 *     the PurchasedLead E11000 path; on slow hosts the disambiguation
 *     branch can land on 'lost_window_expired'. The test accepts both.
 */

'use strict';

const { test } = require('node:test');
const assert  = require('node:assert/strict');
const http    = require('node:http');
const path    = require('node:path');

// ── SKIP GUARD ───────────────────────────────────────────────────────────
if (!process.env.TEST_MONGODB_URI) {
  console.log(
    '[smsClaimConcurrentRace] SKIPPED — TEST_MONGODB_URI not set.\n' +
    '  TEST_MONGODB_URI=mongodb://127.0.0.1:27017/moveleads_smsclaim_race_test \\\n' +
    '    node server/__tests__/smsClaimConcurrentRace.test.js'
  );
  process.exit(0);
}

// ── ENV MUTATIONS (captured for restore) ────────────────────────────────
const ORIGINAL_ENV = {
  ENABLE_SMS_CLAIM_LIVE: process.env.ENABLE_SMS_CLAIM_LIVE,
  TWILIO_AUTH_TOKEN:     process.env.TWILIO_AUTH_TOKEN,
  TWILIO_ACCOUNT_SID:    process.env.TWILIO_ACCOUNT_SID,
  TWILIO_PHONE_NUMBER:   process.env.TWILIO_PHONE_NUMBER,
};
process.env.ENABLE_SMS_CLAIM_LIVE = 'true';
delete process.env.TWILIO_AUTH_TOKEN;        // signature middleware self-skips
delete process.env.TWILIO_ACCOUNT_SID;       // smsService short-circuits
delete process.env.TWILIO_PHONE_NUMBER;

// ── MODULE STUBS (must occur BEFORE require('../routes/twilio')) ────────
const serverRoot = path.join(__dirname, '..');

function stubModule(relPath, exports) {
  const abs = require.resolve(path.join(serverRoot, relPath));
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
}

stubModule('services/smsService', {
  sendMoverLeadSMS:      async () => ({ stubbed: true }),
  sendMoverLostClaimSMS: async () => ({ stubbed: true }),
});

stubModule('services/socketService', {
  init:  () => null,
  getIo: () => null,
});

// ── DEPS (require AFTER stubs are in cache) ─────────────────────────────
const express  = require('express');
const mongoose = require('mongoose');
const User          = require('../models/User');
const Lead          = require('../models/Lead');
const PurchasedLead = require('../models/PurchasedLead');
const Transaction   = require('../models/Transaction');
const ClaimAttempt  = require('../models/ClaimAttempt');
const twilioRouter  = require('../routes/twilio');

// ── FIXTURES ────────────────────────────────────────────────────────────
const CLAIM_TOKEN   = 'TEST';
const MOVER_1_PHONE = '+15551110001';
const MOVER_2_PHONE = '+15552220002';

let httpServer;
let baseUrl;
let mover1;
let mover2;
let lead;

// ── SETUP ───────────────────────────────────────────────────────────────
test('setup — connect Mongo, drop collections, install indexes, seed, start app', async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

  await Promise.all([
    User.deleteMany({}),
    Lead.deleteMany({}),
    PurchasedLead.deleteMany({}),
    Transaction.deleteMany({}),
    ClaimAttempt.deleteMany({}),
  ]);

  // Install the unique indexes that are load-bearing for the race
  // resolution: twilioMessageSid_unique, claimWindow_token,
  // {company, lead} mutex on PurchasedLead.
  await Promise.all([
    Lead.syncIndexes(),
    ClaimAttempt.syncIndexes(),
    PurchasedLead.syncIndexes(),
    User.syncIndexes(),
  ]);

  // Two movers — both eligible, phoneVerified, balance=100, with
  // distinct last-10 phone digits so the inbound regex matches each
  // uniquely.
  mover1 = await new User({
    companyName:     'Mover One LLC',
    email:           'mover1@test.local',
    password:        'x'.repeat(12),
    phone:           MOVER_1_PHONE,
    role:            'mover',
    balance:         100,
    phoneVerified:   true,
    phoneVerifiedAt: new Date(),
    smsOptOut:       false,
    smsNotif:        true,
  }).save();

  mover2 = await new User({
    companyName:     'Mover Two LLC',
    email:           'mover2@test.local',
    password:        'x'.repeat(12),
    phone:           MOVER_2_PHONE,
    role:            'mover',
    balance:         100,
    phoneVerified:   true,
    phoneVerifiedAt: new Date(),
    smsOptOut:       false,
    smsNotif:        true,
  }).save();

  const now = new Date();
  lead = await new Lead({
    route:                'Austin, TX → Dallas, TX',
    originCity:           'Austin',
    destinationCity:      'Dallas',
    originZip:            '78701',
    destinationZip:       '75201',
    originState:          'TX',
    destinationState:     'TX',
    homeSize:             '2 BR',
    moveDate:             new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    distance:             'Local',
    price:                25,
    customerName:         'Test Customer',
    customerPhone:        '+15559990000',
    customerEmail:        'customer@test.local',
    buyNowPrice:          25,
    auctionStatus:        'active',
    distributionDecision: 'system_approved',
    claimWindow: {
      status:        'open',
      openedAt:      now,
      expiresAt:     new Date(now.getTime() + 10 * 60 * 1000),
      token:         CLAIM_TOKEN,
      windowMinutes: 10,
      broadcastTo:   [mover1._id, mover2._id],
    },
  }).save();

  const app = express();
  app.use('/api/twilio', twilioRouter);
  httpServer = http.createServer(app);
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

// ── THE RACE ─────────────────────────────────────────────────────────────
test('race — two parallel SEND <token> webhooks resolve to exactly one winner', async () => {
  const url = `${baseUrl}/api/twilio/sms/inbound`;

  function postFormUrlencoded(body) {
    return fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(body).toString(),
    });
  }

  const payloadA = {
    Body:       `SEND ${CLAIM_TOKEN}`,
    From:       MOVER_1_PHONE,
    MessageSid: 'SM_test_A_' + process.pid,
    To:         '+15550000000',
  };
  const payloadB = {
    Body:       `SEND ${CLAIM_TOKEN}`,
    From:       MOVER_2_PHONE,
    MessageSid: 'SM_test_B_' + process.pid,
    To:         '+15550000000',
  };

  const [resA, resB] = await Promise.all([
    postFormUrlencoded(payloadA),
    postFormUrlencoded(payloadB),
  ]);

  assert.equal(resA.status, 200, 'inbound A must return 200');
  assert.equal(resB.status, 200, 'inbound B must return 200');

  // 1. Exactly ONE PurchasedLead for this lead.
  const purchasedCount = await PurchasedLead.countDocuments({ lead: lead._id });
  assert.equal(purchasedCount, 1,
    'Exactly one PurchasedLead row must exist — the { company, lead } unique mutex enforces this.');

  const purchased = await PurchasedLead.findOne({ lead: lead._id });
  assert.equal(purchased.pricePaid, 25, 'PurchasedLead.pricePaid must equal buyNowPrice');

  // 2. Balance — one debited, the other untouched.
  const [u1, u2] = await Promise.all([
    User.findById(mover1._id),
    User.findById(mover2._id),
  ]);
  const balances = [u1.balance, u2.balance].sort((a, b) => a - b);
  assert.deepEqual(balances, [75, 100],
    `Exactly one mover must be debited (75) and one untouched (100). Got [${balances}]`);

  const winnerId = purchased.company.toString();
  const loserId  = winnerId === mover1._id.toString() ? mover2._id.toString() : mover1._id.toString();
  const winnerUser = winnerId === mover1._id.toString() ? u1 : u2;
  const loserUser  = winnerId === mover1._id.toString() ? u2 : u1;
  assert.equal(winnerUser.balance, 75, 'Winner balance must be 75 (100 - 25)');
  assert.equal(loserUser.balance, 100, 'Loser balance must remain 100');

  // 3. Exactly TWO ClaimAttempt rows for this lead.
  const attempts = await ClaimAttempt.find({ leadId: lead._id }).sort({ outcome: 1 }).lean();
  assert.equal(attempts.length, 2,
    `Exactly two ClaimAttempt rows expected (one per inbound). Got ${attempts.length}`);

  const outcomes = attempts.map(a => a.outcome).sort();
  const wonRow   = attempts.find(a => a.outcome === 'won');
  const loserRow = attempts.find(a => a.outcome !== 'won');
  assert.ok(wonRow, `One ClaimAttempt must have outcome='won'. Outcomes: ${outcomes.join(', ')}`);
  assert.ok(loserRow, `One ClaimAttempt must be a loser. Outcomes: ${outcomes.join(', ')}`);
  assert.ok(
    ['lost_already_claimed', 'lost_window_expired'].includes(loserRow.outcome),
    `Loser outcome must be lost_already_claimed or lost_window_expired. Got '${loserRow.outcome}'`
  );

  assert.equal(wonRow.moverId.toString(), winnerId,
    'ClaimAttempt outcome=won must point to the same mover as the PurchasedLead');
  assert.equal(loserRow.moverId.toString(), loserId,
    'Loser ClaimAttempt must point to the OTHER mover');

  // 4. Lead state — terminal.
  const finalLead = await Lead.findById(lead._id);
  assert.equal(finalLead.claimWindow.status, 'claimed',
    'Lead.claimWindow.status must be "claimed"');
  assert.equal(finalLead.claimWindow.claimedBy.toString(), winnerId,
    'Lead.claimWindow.claimedBy must equal the winner');
  assert.equal(finalLead.claimWindow.closedReason, 'claimed',
    'Lead.claimWindow.closedReason must be "claimed"');
  assert.equal(finalLead.auctionStatus, 'sold',
    'Lead.auctionStatus must be "sold"');
  assert.equal(finalLead.status, 'Purchased',
    'Lead.status must be "Purchased"');
  assert.equal(finalLead.winnerId.toString(), winnerId,
    'Lead.winnerId must equal the winner');
  assert.equal(finalLead.finalPrice, 25,
    'Lead.finalPrice must equal buyNowPrice');

  // 5. Transaction ledger row exists for the winner with the SMS-claim
  //    description discriminator.
  const txn = await Transaction.findOne({ user: winnerId, lead: lead._id });
  assert.ok(txn, 'Transaction row must exist for the winner');
  assert.equal(txn.type, 'Lead Purchase');
  assert.equal(txn.amount, 25);
  assert.match(txn.description, /^SMS claim: lead /,
    'Transaction.description must start with "SMS claim: lead " (channel discriminator)');
});

// ── TEARDOWN ─────────────────────────────────────────────────────────────
test('teardown — close server, disconnect Mongo, restore env', async () => {
  if (httpServer) {
    await new Promise(resolve => httpServer.close(resolve));
  }
  await mongoose.disconnect();

  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
