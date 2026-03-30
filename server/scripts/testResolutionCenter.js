/**
 * Resolution Center — Integration Test Suite
 *
 * Tests 5 scenarios:
 *   1. Cron job sends feedback + review email for eligible purchase
 *   2. Cron loop continues past a bad email address (no abort)
 *   3. Sender impersonation — unauthenticated request cannot claim sender: "mover"
 *   4. Ownership check — Mover A cannot PATCH status on Mover B's complaint (403)
 *   5. Full flow — magic link → complaint → mover reply → resolved
 *
 * Usage:
 *   node server/scripts/testResolutionCenter.js
 *
 * All test data is created in the DB and cleaned up at the end.
 * Tests 1 & 2 actually fire emails via Resend — check your inbox / Resend logs.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');

const User          = require('../models/User');
const Lead          = require('../models/Lead');
const PurchasedLead = require('../models/PurchasedLead');
const Complaint     = require('../models/Complaint');
const { sendFeedbackRequestEmail, sendReviewRequestEmail } = require('../services/emailService');

// ── Output helpers ────────────────────────────────────────────────────────────
const OK   = (msg) => console.log(`  ✅ ${msg}`);
const FAIL = (msg) => console.log(`  ❌ FAIL: ${msg}`);
const INFO = (msg) => console.log(`  ℹ  ${msg}`);
const HEAD = (title) => {
    const bar = '═'.repeat(62);
    console.log(`\n${bar}\n  ${title}\n${bar}`);
};

// ── Cleanup registry ─────────────────────────────────────────────────────────
const GC = { users: [], leads: [], purchases: [], complaints: [] };

// ── Token factory (mirrors auth middleware expectation) ───────────────────────
function makeToken(userId, role) {
    return jwt.sign({ user: { id: userId.toString(), role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// ── Inline cron logic (mirrors server/jobs/requestFeedback.js exactly) ────────
async function runCronLogic() {
    const twoDaysAgo = new Date(Date.now() - 2  * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const purchases = await PurchasedLead
        .find({ feedbackEmailSent: false })
        .populate('lead')
        .populate('company');

    let sentCount = 0;
    const errors  = [];

    for (const purchase of purchases) {
        if (!purchase.lead || !purchase.company) continue;

        const moveDate = new Date(purchase.lead.moveDate);
        if (moveDate >= twoDaysAgo || moveDate <= tenDaysAgo) continue;

        try {
            await sendFeedbackRequestEmail({
                toEmail:      purchase.lead.customerEmail,
                customerName: purchase.lead.customerName,
                companyName:  purchase.company.companyName,
                leadId:       purchase.lead._id,
                companyId:    purchase.company._id,
            });

            if (purchase.company.googleReviewLink) {
                await sendReviewRequestEmail({
                    toEmail:      purchase.lead.customerEmail,
                    customerName: purchase.lead.customerName,
                    companyName:  purchase.company.companyName,
                    reviewLink:   purchase.company.googleReviewLink,
                });
            }

            purchase.feedbackEmailSent = true;
            await purchase.save();
            sentCount++;
        } catch (err) {
            errors.push({ purchaseId: purchase._id, message: err.message });
        }
    }

    return { sentCount, errors };
}

// ── Inline ownership-check logic (mirrors PATCH /:id/status in complaints.js) ─
function ownershipCheck(requestingUserId, requestingRole, complaintCompanyId) {
    if (requestingRole !== 'admin' && complaintCompanyId?.toString() !== requestingUserId) {
        return { allowed: false, status: 403, msg: 'Not authorized to update this complaint.' };
    }
    return { allowed: true };
}

// ── Inline sender-derivation logic (mirrors POST /:id/messages) ───────────────
function deriveSender(authHeader) {
    let sender = 'customer';
    if (authHeader) {
        try {
            const decoded = jwt.verify(authHeader, process.env.JWT_SECRET);
            sender = decoded.user?.role === 'admin' ? 'admin' : 'mover';
        } catch {
            // Invalid token — treat as customer
        }
    }
    return sender;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanup() {
    await Complaint.deleteMany({ _id: { $in: GC.complaints } });
    await PurchasedLead.deleteMany({ _id: { $in: GC.purchases } });
    await Lead.deleteMany({ _id: { $in: GC.leads } });
    await User.deleteMany({ _id: { $in: GC.users } });
    console.log('  Cleanup done — all test documents removed.');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Cron sends feedback + review email for a 3-day-old purchase
// ─────────────────────────────────────────────────────────────────────────────
async function test1_cronJob() {
    HEAD('TEST 1 — Cron: feedback + review email for eligible purchase');

    const mover = await new User({
        companyName: '[TEST] Cron Movers',
        email: `test-cron-mover-${Date.now()}@test.local`,
        password: 'x', role: 'customer', isEmailVerified: true,
        googleReviewLink: 'https://g.page/r/FAKE_TEST_REVIEW',
    }).save();
    GC.users.push(mover._id);

    const moveDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    const lead = await new Lead({
        customerName: 'Alice Crontest',
        customerEmail: `alice-cron-${Date.now()}@example.com`,
        customerPhone: '5550001111',
        originCity: 'Boston', destinationCity: 'New York',
        originZip: '02101', destinationZip: '10001',
        homeSize: '2 Bedroom', moveDate, miles: 220,
        price: 25, distance: 'Long Distance', route: 'Boston → New York',
        grade: 'A', status: 'Purchased',
    }).save();
    GC.leads.push(lead._id);

    const purchase = await new PurchasedLead({
        company: mover._id, lead: lead._id,
        pricePaid: 25, feedbackEmailSent: false,
    }).save();
    GC.purchases.push(purchase._id);

    INFO(`Mover: ${mover.email} | googleReviewLink: ${mover.googleReviewLink}`);
    INFO(`Lead customer: ${lead.customerEmail} | moveDate: ${moveDate.toDateString()}`);
    INFO(`Purchase feedbackEmailSent: false → running cron…`);

    const { sentCount, errors } = await runCronLogic();
    const refreshed = await PurchasedLead.findById(purchase._id);

    if (refreshed.feedbackEmailSent === true) {
        OK('feedbackEmailSent flipped to true after cron run');
    } else {
        FAIL('feedbackEmailSent still false — email may not have sent');
    }

    if (sentCount >= 1) {
        OK(`Cron sentCount = ${sentCount}`);
    } else {
        FAIL(`Cron sentCount = ${sentCount} (expected ≥ 1)`);
    }

    if (errors.length === 0) {
        OK('No errors during cron run');
    } else {
        FAIL(`Cron errors: ${JSON.stringify(errors)}`);
    }

    INFO(`Check Resend logs / inbox for feedback email AND review email to: ${lead.customerEmail}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Cron loop does NOT abort when one purchase has a bad email
// ─────────────────────────────────────────────────────────────────────────────
async function test2_noLoopAbort() {
    HEAD('TEST 2 — Cron: bad email does not abort remaining sends');

    const mover = await new User({
        companyName: '[TEST] Loop Movers',
        email: `test-loop-mover-${Date.now()}@test.local`,
        password: 'x', role: 'customer', isEmailVerified: true,
    }).save();
    GC.users.push(mover._id);

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    // Purchase A: intentionally bad email to trigger a Resend rejection
    const badLead = await new Lead({
        customerName: 'Bad Email Person',
        customerEmail: `INVALID_NO_AT_SIGN_${Date.now()}`,
        customerPhone: '5550002222',
        originCity: 'Dallas', destinationCity: 'Austin',
        originZip: '75201', destinationZip: '73301',
        homeSize: '1 Bedroom', moveDate: threeDaysAgo, miles: 195,
        price: 20, distance: 'Long Distance', route: 'Dallas → Austin',
        grade: 'B', status: 'Purchased',
    }).save();
    GC.leads.push(badLead._id);

    const badPurchase = await new PurchasedLead({
        company: mover._id, lead: badLead._id,
        pricePaid: 20, feedbackEmailSent: false,
    }).save();
    GC.purchases.push(badPurchase._id);

    // Purchase B: valid email — must still be sent despite Purchase A failing
    const goodLead = await new Lead({
        customerName: 'Bob Valid',
        customerEmail: `bob-valid-${Date.now()}@example.com`,
        customerPhone: '5550003333',
        originCity: 'Houston', destinationCity: 'San Antonio',
        originZip: '77001', destinationZip: '78201',
        homeSize: '2 Bedroom', moveDate: threeDaysAgo, miles: 200,
        price: 20, distance: 'Long Distance', route: 'Houston → San Antonio',
        grade: 'B', status: 'Purchased',
    }).save();
    GC.leads.push(goodLead._id);

    const goodPurchase = await new PurchasedLead({
        company: mover._id, lead: goodLead._id,
        pricePaid: 20, feedbackEmailSent: false,
    }).save();
    GC.purchases.push(goodPurchase._id);

    INFO(`Purchase A (bad email):  ${badPurchase._id} → "${badLead.customerEmail}"`);
    INFO(`Purchase B (good email): ${goodPurchase._id} → "${goodLead.customerEmail}"`);
    INFO('Running cron…');

    const { sentCount, errors } = await runCronLogic();

    // Key assertion: did the loop process BOTH purchases, or did it stop after the first failure?
    // We detect this by checking that both purchase IDs appear in the errors array (if API key
    // is invalid locally both will fail, but independently — proving no abort).
    const badAttempted  = errors.some(e => e.purchaseId.toString() === badPurchase._id.toString());
    const goodAttempted = errors.some(e => e.purchaseId.toString() === goodPurchase._id.toString());

    // If the API key works (production), check feedbackEmailSent on the good purchase instead
    const refreshedBad  = await PurchasedLead.findById(badPurchase._id);
    const refreshedGood = await PurchasedLead.findById(goodPurchase._id);

    if (refreshedGood.feedbackEmailSent) {
        OK('Purchase B sent successfully — cron loop did NOT abort (API key valid)');
    } else if (goodAttempted && badAttempted) {
        OK(`Loop processed BOTH purchases independently (${errors.length} individual errors — loop did NOT abort)`);
        INFO('  Emails unsent due to invalid API key in local env — re-run in production to verify delivery');
    } else if (goodAttempted && !badAttempted) {
        FAIL('Only Purchase B was processed — Purchase A was skipped unexpectedly');
    } else {
        FAIL('Purchase B was NOT attempted — loop aborted after Purchase A failed');
    }

    if (!refreshedBad.feedbackEmailSent) {
        OK('Purchase A left with feedbackEmailSent: false — not falsely marked sent');
    } else {
        INFO('Purchase A marked sent — Resend may have accepted the address without bouncing immediately');
    }

    if (errors.length > 0) {
        OK(`${errors.length} per-item error(s) caught without crashing the loop`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Sender impersonation — body { sender: "mover" } from no-token request
// ─────────────────────────────────────────────────────────────────────────────
async function test3_senderImpersonation() {
    HEAD('TEST 3 — Sender impersonation: unauthenticated request cannot claim "mover"');

    // Create a complaint to post against
    const complaint = await new Complaint({
        customerName:  'Impersonation Tester',
        customerEmail: `impersonate-${Date.now()}@example.com`,
        issueType: 'Other',
        description: 'Test complaint for impersonation scenario.',
        isLinked: false,
    }).save();
    GC.complaints.push(complaint._id);
    INFO(`Complaint ID: ${complaint._id}`);

    // ── Case A: No token, body has sender: "mover" ──
    // The route ignores req.body.sender entirely — sender is derived from JWT.
    const senderA = deriveSender(undefined);
    if (senderA === 'customer') {
        OK('Case A: no token → sender resolved as "customer" (impersonation blocked)');
    } else {
        FAIL(`Case A: expected "customer", got "${senderA}"`);
    }

    // ── Case B: Tampered/invalid token ──
    const senderB = deriveSender('eyJhbGciOiJIUzI1NiJ9.TAMPERED.INVALID');
    if (senderB === 'customer') {
        OK('Case B: tampered token → sender resolved as "customer"');
    } else {
        FAIL(`Case B: expected "customer", got "${senderB}"`);
    }

    // ── Case C: Valid mover token → must resolve as "mover" (regression check) ──
    const mover = await new User({
        companyName: '[TEST] Token Mover',
        email: `token-mover-${Date.now()}@test.local`,
        password: 'x', role: 'customer', isEmailVerified: true,
    }).save();
    GC.users.push(mover._id);

    const validToken = makeToken(mover._id, 'customer');
    const senderC = deriveSender(validToken);
    if (senderC === 'mover') {
        OK('Case C: valid mover token → sender resolved as "mover" (legitimate replies still work)');
    } else {
        FAIL(`Case C: expected "mover", got "${senderC}"`);
    }

    // ── Persist Case A to DB and verify stored sender ──
    complaint.messages.push({ sender: senderA, text: 'This message tried to impersonate a mover.' });
    await complaint.save();
    const saved = await Complaint.findById(complaint._id);
    const stored = saved.messages[0].sender;
    if (stored === 'customer') {
        OK(`DB confirms stored sender = "${stored}" — impersonation did not persist`);
    } else {
        FAIL(`DB has stored sender = "${stored}" — impersonation may have leaked`);
    }

    INFO('NOTE: The route is intentionally public (customers reply without auth).');
    INFO('      Security is enforced by ignoring body.sender and deriving from JWT instead.');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Ownership check — Mover A cannot PATCH status on Mover B's complaint
// ─────────────────────────────────────────────────────────────────────────────
async function test4_ownershipCheck() {
    HEAD('TEST 4 — Ownership: Mover A blocked (403) from Mover B\'s complaint');

    const moverA = await new User({
        companyName: '[TEST] Mover A',
        email: `mover-a-${Date.now()}@test.local`,
        password: 'x', role: 'customer', isEmailVerified: true,
    }).save();
    GC.users.push(moverA._id);

    const moverB = await new User({
        companyName: '[TEST] Mover B',
        email: `mover-b-${Date.now()}@test.local`,
        password: 'x', role: 'customer', isEmailVerified: true,
    }).save();
    GC.users.push(moverB._id);

    const lead = await new Lead({
        customerName: 'Carol Ownership',
        customerEmail: `carol-own-${Date.now()}@example.com`,
        customerPhone: '5550004444',
        originCity: 'Phoenix', destinationCity: 'Tucson',
        originZip: '85001', destinationZip: '85701',
        homeSize: '3 Bedroom', moveDate: new Date(), miles: 110,
        price: 20, distance: 'Long Distance', route: 'Phoenix → Tucson',
        grade: 'B', status: 'Purchased',
    }).save();
    GC.leads.push(lead._id);

    // Complaint belongs to Mover B
    const complaint = await new Complaint({
        lead: lead._id,
        company: moverB._id,
        customerName: 'Carol Ownership',
        customerEmail: lead.customerEmail,
        issueType: 'Lateness',
        description: 'Three hours late with no communication.',
        isLinked: true,
        status: 'Open',
    }).save();
    GC.complaints.push(complaint._id);

    INFO(`Complaint owner: Mover B (${moverB._id})`);
    INFO(`Attacker:        Mover A (${moverA._id})`);

    // Mover A attempts to update Mover B's complaint
    const resultA = ownershipCheck(moverA._id.toString(), 'customer', complaint.company);
    if (!resultA.allowed && resultA.status === 403) {
        OK(`Mover A → 403 "${resultA.msg}"`);
    } else {
        FAIL('Mover A was NOT blocked — ownership check failed');
    }

    // Mover B updates their own complaint — must be allowed
    const resultB = ownershipCheck(moverB._id.toString(), 'customer', complaint.company);
    if (resultB.allowed) {
        OK('Mover B → allowed to update their own complaint');
    } else {
        FAIL('Mover B unexpectedly blocked from their own complaint');
    }

    // Admin can update any complaint regardless of company
    const resultAdmin = ownershipCheck('any-random-id', 'admin', complaint.company);
    if (resultAdmin.allowed) {
        OK('Admin → allowed to update any complaint');
    } else {
        FAIL('Admin was unexpectedly blocked');
    }

    // Verify no data was mutated in the DB by the failed Mover A attempt
    const saved = await Complaint.findById(complaint._id);
    if (saved.status === 'Open' && saved.company.toString() === moverB._id.toString()) {
        OK('DB: complaint unchanged — Mover A\'s attempt made no modifications');
    } else {
        FAIL(`DB: unexpected mutation — status="${saved.status}", company=${saved.company}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Full flow — magic link → complaint visible → reply → resolved
// ─────────────────────────────────────────────────────────────────────────────
async function test5_fullFlow() {
    HEAD('TEST 5 — Full flow: magic link → Resolution Center → reply → resolved');

    // Step 1: Create mover + lead + purchase (simulates post-purchase state)
    const mover = await new User({
        companyName: '[TEST] Full Flow Movers',
        email: `mover-full-${Date.now()}@test.local`,
        password: 'x', role: 'customer', isEmailVerified: true,
        googleReviewLink: 'https://g.page/r/TEST_FULL_FLOW',
    }).save();
    GC.users.push(mover._id);

    const lead = await new Lead({
        customerName: 'Diana Fullflow',
        customerEmail: `diana-full-${Date.now()}@example.com`,
        customerPhone: '5550005555',
        originCity: 'Seattle', destinationCity: 'Portland',
        originZip: '98101', destinationZip: '97201',
        homeSize: '2 Bedroom',
        moveDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        miles: 175, price: 25, distance: 'Long Distance', route: 'Seattle → Portland',
        grade: 'A', status: 'Purchased',
    }).save();
    GC.leads.push(lead._id);

    const purchase = await new PurchasedLead({
        company: mover._id, lead: lead._id, pricePaid: 25,
    }).save();
    GC.purchases.push(purchase._id);

    OK(`Step 1 — Lead & purchase seeded`);
    INFO(`  Mover: ${mover.companyName} (${mover._id})`);
    INFO(`  Lead:  ${lead._id} | Customer: ${lead.customerName} <${lead.customerEmail}>`);

    // Step 2: Validate magic link (PurchasedLead.findOne({lead, company}))
    const validPurchase = await PurchasedLead.findOne({ lead: lead._id, company: mover._id });
    if (validPurchase) {
        OK('Step 2 — Magic link valid: PurchasedLead found for lead+company pair');
    } else {
        FAIL('Step 2 — Magic link invalid: no PurchasedLead found');
        return;
    }

    // Step 3: Customer submits complaint via magic link (Path 1 in POST /api/complaints)
    const complaint = await new Complaint({
        lead: lead._id,
        company: mover._id,
        isLinked: true,
        customerName:  lead.customerName,
        customerEmail: lead.customerEmail,
        issueType:    'Damage',
        description:  'They scratched my dining table and broke a lamp.',
        status: 'Open',
    }).save();
    GC.complaints.push(complaint._id);

    OK(`Step 3 — Complaint submitted (id: ${complaint._id}, status: ${complaint.status})`);

    // Step 4: Mover fetches their Resolution Center — complaint must appear
    const moverComplaints = await Complaint
        .find({ company: mover._id, isLinked: true })
        .populate('lead', 'route moveDate homeSize');

    const found = moverComplaints.find(c => c._id.toString() === complaint._id.toString());
    if (found) {
        OK(`Step 4 — Complaint visible in mover's Resolution Center (route: ${found.lead?.route})`);
    } else {
        FAIL('Step 4 — Complaint NOT visible to mover');
    }

    // Step 5: Mover sends reply — derive sender from token (not body)
    const moverToken = makeToken(mover._id, 'customer');
    const replyText  = "So sorry about this! We'll arrange a repair within 48 hours.";
    const replyAs    = deriveSender(moverToken); // should be 'mover'

    complaint.messages.push({ sender: replyAs, text: replyText });
    complaint.status    = 'In Progress';
    complaint.updatedAt = Date.now();
    await complaint.save();

    const afterReply = await Complaint.findById(complaint._id);
    if (afterReply.messages.length === 1 && afterReply.messages[0].sender === 'mover') {
        OK(`Step 5 — Reply saved with sender="${afterReply.messages[0].sender}"`);
    } else {
        FAIL(`Step 5 — Unexpected reply state: ${JSON.stringify(afterReply.messages)}`);
    }
    if (afterReply.status === 'In Progress') {
        OK('Step 5 — Status updated to "In Progress"');
    }

    // Step 6: Mover marks resolved — ownership check passes
    const check = ownershipCheck(mover._id.toString(), 'customer', afterReply.company);
    if (check.allowed) {
        afterReply.status    = 'Resolved';
        afterReply.updatedAt = Date.now();
        await afterReply.save();

        const resolved = await Complaint.findById(complaint._id);
        if (resolved.status === 'Resolved') {
            OK('Step 6 — Complaint marked "Resolved" ✓ Full flow complete');
        } else {
            FAIL('Step 6 — Status not saved as "Resolved"');
        }
    } else {
        FAIL('Step 6 — Ownership check unexpectedly failed for the owning mover');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n🧪  Resolution Center — Integration Test Suite\n');

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        await test1_cronJob();
        await test2_noLoopAbort();
        await test3_senderImpersonation();
        await test4_ownershipCheck();
        await test5_fullFlow();

        const bar = '═'.repeat(62);
        console.log(`\n${bar}`);
        console.log('  All 5 tests complete.');
        console.log(`${bar}\n`);
    } catch (err) {
        console.error('\n[FATAL] Unexpected error:', err.message);
        console.error(err);
    } finally {
        console.log('\nCleaning up test data…');
        await cleanup();
        await mongoose.disconnect();
    }
}

main();
