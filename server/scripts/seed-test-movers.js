#!/usr/bin/env node
/**
 * Warm Transfer Test Setup Script
 *
 * Usage (from project root):
 *   node server/scripts/seed-test-movers.js
 *
 * What it does:
 *   1. Connects to MongoDB and wipes any previous test movers
 *   2. Creates 2 test mover accounts (balance $200, receiveLiveTransfers: true)
 *   3. Creates CoverageArea records for the test ZIP codes
 *   4. Prints a ready-to-run curl command to submit a Grade A test lead
 *   5. Starts the server and streams its logs with colour-coded highlights
 *      so you can see Grade A detection, warm transfer triggers, and refunds
 *      happening in real time.
 *
 * Expected Grade A score breakdown for the test lead:
 *   Base:          50
 *   Long Distance: +20   (Dallas TX → Beverly Hills CA ≈ 1,430 mi)
 *   3+ Bedroom:    +15   (homeSize = "3 Bedroom")
 *   High Urgency:  +15   (moveDate 7 days from now)
 *   Mobile:        +10   (mock mode assumes mobile line type)
 *   ─────────────────
 *   Total:         110  → Grade A  (threshold ≥ 85)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const { spawn } = require('child_process');
const path      = require('path');

/* ── ANSI colour helpers ─────────────────────────────────────────────────── */
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  orange: '\x1b[38;5;208m',
  gray:   '\x1b[90m',
};

function print(msg)  { process.stdout.write(msg + '\n'); }
function divider(label) {
  const pad = label ? `  ${label}  ` : '';
  print(`\n${C.bold}${C.orange}━━━━${pad}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
}

/** Colourize a single server log line based on keywords. */
function colorize(line) {
  if (/Grade:\s*A\b/i.test(line))                  return C.green  + C.bold + line + C.reset;
  if (/Warm Transfer|warm.transfer/i.test(line))    return C.yellow + C.bold + line + C.reset;
  if (/Refunded|refund/i.test(line))                return C.red    + C.bold + line + C.reset;
  if (/\[Voice\]/i.test(line))                      return C.cyan   + line + C.reset;
  if (/Mock verification SUCCESS/i.test(line))      return C.green  + line + C.reset;
  if (/REJECTED_FAKE|PENDING_MANUAL/i.test(line))   return C.yellow + line + C.reset;
  if (/error|ERROR|Error/  .test(line))             return C.red    + line + C.reset;
  return line;
}

/* ── Test data ───────────────────────────────────────────────────────────── */
const ORIGIN_ZIP = '75201'; // Dallas, TX
const DEST_ZIP   = '90210'; // Beverly Hills, CA
const PASSWORD   = 'TestMover123!';

const TEST_MOVERS = [
  {
    companyName: 'Test Mover Alpha',
    email:       'test.mover.alpha@moveleads.test',
    phone:       '+15005550001',
    balance:     200,
  },
  {
    companyName: 'Test Mover Beta',
    email:       'test.mover.beta@moveleads.test',
    phone:       '+15005550002',
    balance:     200,
  },
];

function futureDateISO(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

/* ── Main ────────────────────────────────────────────────────────────────── */
async function main() {
  divider('MoveLeads Warm Transfer Test Setup');

  /* 1. Connect ─────────────────────────────────────────────────────────── */
  print(`${C.gray}→ Connecting to MongoDB…${C.reset}`);
  await mongoose.connect(
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/moveleads',
    { serverSelectionTimeoutMS: 5000 }
  );
  print(`${C.green}✓ MongoDB connected${C.reset}`);

  const User         = require('../models/User');
  const CoverageArea = require('../models/CoverageArea');

  /* 2. Wipe previous test accounts ─────────────────────────────────────── */
  const testEmails = TEST_MOVERS.map(m => m.email);
  const existing   = await User.find({ email: { $in: testEmails } }).lean();
  if (existing.length) {
    const ids = existing.map(u => u._id);
    await User.deleteMany({ email: { $in: testEmails } });
    await CoverageArea.deleteMany({ company: { $in: ids } });
    print(`${C.gray}✓ Removed ${existing.length} stale test account(s)${C.reset}`);
  }

  /* 3. Create accounts + coverage areas ────────────────────────────────── */
  divider('Creating Test Movers');

  const hash    = await bcrypt.hash(PASSWORD, 12);
  const created = [];

  for (const m of TEST_MOVERS) {
    const user = await User.create({
      ...m,
      password:             hash,
      role:                 'customer',
      receiveLiveTransfers: true,
      serviceZips:          [ORIGIN_ZIP, DEST_ZIP],
      serviceStates:        ['TX', 'CA'],
    });
    created.push(user);

    // findEligibleMovers needs: origin doc (type='origin') + dest doc (type='destination')
    await CoverageArea.insertMany([
      { company: user._id, zipCode: ORIGIN_ZIP, type: 'origin'      },
      { company: user._id, zipCode: DEST_ZIP,   type: 'destination' },
    ]);

    print(
      `${C.green}✓${C.reset} ${C.bold}${m.companyName}${C.reset}  ` +
      `id=${C.cyan}${user._id}${C.reset}  ` +
      `balance=${C.green}$${m.balance}${C.reset}`
    );
  }

  await mongoose.disconnect();

  /* 4. Print summary + instructions ────────────────────────────────────── */
  divider('Credentials');
  print(`  Password (both accounts):  ${C.bold}${PASSWORD}${C.reset}`);
  for (const u of created) {
    print(`  ${C.bold}${u.companyName}${C.reset}: ${C.cyan}${u.email}${C.reset}`);
  }
  print(`\n  Origin ZIP : ${C.bold}${ORIGIN_ZIP}${C.reset}  (Dallas, TX)`);
  print(`  Dest ZIP   : ${C.bold}${DEST_ZIP}${C.reset}  (Beverly Hills, CA)`);

  divider('Twilio Webhook Setup');
  print(`  1. Start ngrok in another terminal:`);
  print(`     ${C.cyan}ngrok http 5005${C.reset}`);
  print(`\n  2. In Twilio Console → Phone Numbers → your number → Voice webhook:`);
  print(`     ${C.yellow}https://<ngrok-subdomain>.ngrok.io/api/voice/customer-answered${C.reset}`);
  print(`\n  3. Make sure SERVER_URL in server/.env matches your ngrok URL:`);
  print(`     ${C.gray}SERVER_URL=https://<ngrok-subdomain>.ngrok.io${C.reset}`);

  const moveDate = futureDateISO(7);
  divider('Submit a Test Lead (copy & run)');
  print(`  ${C.gray}# This lead should score ~110 → Grade A → warm transfer fires${C.reset}`);
  print(`  ${C.cyan}curl -s -X POST http://localhost:5005/api/leads/ingest \\`);
  print(`    -H "Content-Type: application/json" \\`);
  print(`    -d '${JSON.stringify({
    customerName:    'Test Customer',
    customerEmail:   'testcustomer@example.com',
    customerPhone:   '5005550010',
    originCity:      'Dallas',
    destinationCity: 'Beverly Hills',
    originZip:       ORIGIN_ZIP,
    destinationZip:  DEST_ZIP,
    homeSize:        '3 Bedroom',
    moveDate:        moveDate,
    distance:        'Long Distance',
    miles:           1432,
  })}'${C.reset}`);

  divider('Expected Log Flow');
  print(`  ${C.green}[Twilio] Mock verification SUCCESS for lead … — Grade: A (score: 110)${C.reset}`);
  print(`  ${C.yellow}[Twilio Warm Transfer] Triggering call to <phone> for lead <id>${C.reset}`);
  print(`  ${C.cyan}[Voice Routes] Gather → findEligibleMovers → 2 movers found${C.reset}`);
  print(`  ${C.cyan}[Voice Routes] mover-accept → atomic claim → charge $40${C.reset}`);
  print(`  ${C.red}[Voice] Refunded mover … (if call < 10 s or dropped)${C.reset}`);

  /* 5. Start server with colourised log streaming ──────────────────────── */
  divider('Server starting — watching logs');
  print(`  ${C.gray}Press Ctrl+C to stop${C.reset}\n`);

  const serverProcess = spawn(
    'node',
    ['server.js'],
    {
      cwd:   path.join(__dirname, '..'),
      env:   process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    }
  );

  const SERVER_PFX = `${C.gray}[server]${C.reset} `;
  const ERROR_PFX  = `${C.red}[server:err]${C.reset} `;

  serverProcess.stdout.on('data', chunk => {
    chunk.toString().split('\n').filter(Boolean).forEach(line => {
      process.stdout.write(SERVER_PFX + colorize(line) + '\n');
    });
  });

  serverProcess.stderr.on('data', chunk => {
    chunk.toString().split('\n').filter(Boolean).forEach(line => {
      process.stderr.write(ERROR_PFX + colorize(line) + '\n');
    });
  });

  serverProcess.on('exit', code => {
    print(`\n${C.red}Server exited (code ${code ?? 0})${C.reset}`);
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    print(`\n${C.gray}Shutting down…${C.reset}`);
    serverProcess.kill('SIGINT');
  });
}

main().catch(err => {
  console.error(`\n${C.red}Setup failed:${C.reset}`, err.message);
  process.exit(1);
});
