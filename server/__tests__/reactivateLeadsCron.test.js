/**
 * Reactivate-leads cron (PR-6) — lock-in suite.
 *
 * Closes HIGH-CONFIDENCE-FIX-PLAN F2. Pre-PR-6, the mover-feed handler
 * GET /api/leads ran an in-handler updateMany that re-promoted leads
 * with auctionStatus ∈ {null,'expired','pending'} back to 'active' with
 * a fresh 24h window — WITHOUT firing the canonical post-approval
 * dispatch. A read-path silent-state mutation: any mover visiting the
 * feed re-published leads to the marketplace, and no SMS / email /
 * socket ever fired.
 *
 * PR-6 moves the reactivation to a dedicated cron job (5-minute cadence,
 * matches existing cleanupExpiredLeads + closeStaleClaimWindows rhythm)
 * that calls dispatchApprovedLead(leadId, { source: 'cron.reactivate' })
 * for every lead it actually CASes. GET /api/leads is now read-only for
 * this behavior.
 *
 * This suite pins:
 *
 *   A. GET /api/leads no longer contains the reactivation updateMany.
 *      The Expire mutation (lifecycle-only, no broadcast implications)
 *      stays untouched — PR-6 scope is the reactivate path only.
 *   B. jobs/reactivateLeads.js exists, exports the worker + filter
 *      builder, schedules at '*\/5 * * * *' (cadence parity with
 *      cleanupExpiredLeads + closeStaleClaimWindows).
 *   C. Worker eligibility filter is byte-identical to the pre-PR-6
 *      read-handler filter (auctionStatus $nin / status $in / moveDate
 *      $gte / buyers empty-or-missing).
 *   D. Worker uses per-lead findOneAndUpdate atomic CAS with the same
 *      filter at write time — no double-dispatch across overlapping
 *      cron instances.
 *   E. Worker calls dispatchApprovedLead(leadId, { source:
 *      'cron.reactivate' }) for each successfully-flipped lead.
 *      Source tag is non-negotiable — log grep + drift guard.
 *   F. Worker does NOT pass { force: true } — the per-channel
 *      notifiedAt CAS in the orchestrator/broadcasters is the dedup
 *      authority, not us.
 *   G. Worker does NOT call broadcastLeadSMS / broadcastLeadEmail /
 *      emitNewLead directly — must route through the canonical
 *      orchestrator (which already wires all three channels and
 *      enforces visibility re-check).
 *   H. Worker behavior on per-lead failure — one failed dispatch / one
 *      Mongo CAS error must NOT halt the rest of the loop. Pin both
 *      try/catch shapes.
 *   I. server.js requires the new job (so the cron actually runs).
 *   J. Scope discipline — no matcher / dispatchPolicy / SMS Claim /
 *      financial imports in the worker. No new env flag. No state
 *      changes other than auctionStatus + auctionEndsAt.
 *   K. Behavioral assertions on the exported worker:
 *      K1. Calls dispatchFn once per CASed lead with the source tag.
 *      K2. Skips dispatch when the CAS returns null (race lost).
 *      K3. Continues past a dispatch throw (failure isolation).
 *      K4. Honors injected `now` for the 24h window math.
 *
 * Pure-Node, no Mongo. Source-level assertions (A-J) + behavioral
 * assertions with model stubs (K).
 *
 * Run: `node server/__tests__/reactivateLeadsCron.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot   = path.join(__dirname, '..');
const cronPath     = path.join(serverRoot, 'jobs',    'reactivateLeads.js');
const leadsRoutePath = path.join(serverRoot, 'routes', 'leads.js');
const serverPath   = path.join(serverRoot, 'server.js');

const cronSrc       = fs.readFileSync(cronPath,       'utf8');
const leadsRouteSrc = fs.readFileSync(leadsRoutePath, 'utf8');
const serverSrc     = fs.readFileSync(serverPath,     'utf8');

function stripComments(src) {
  // Strip line comments FIRST so any "/*" appearing inside a line
  // comment (e.g. URL fragments like `/api/voice/*` in server.js) is
  // gone before the greedy-block-comment pass runs. Otherwise the
  // block regex eats from line 99's `/*` to a `*/` much later in the
  // file and we strip valid code.
  return src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
const cronExec       = stripComments(cronSrc);
const leadsRouteExec = stripComments(leadsRouteSrc);
const serverExec     = stripComments(serverSrc);

// ── A. Read-path mutation removed ──────────────────────────────────────

test('A1. GET /api/leads no longer contains the reactivation updateMany', () => {
  // The signature shape of the old mutation: updateMany with
  // auctionStatus $nin and status $in (the reactivation set).
  // Confirm no such call survives anywhere in routes/leads.js.
  assert.doesNotMatch(
    leadsRouteExec,
    /Lead\.updateMany\(\s*\{[\s\S]{0,500}auctionStatus[\s\S]{0,200}\$nin[\s\S]{0,1500}auctionEndsAt/,
    'Reactivation updateMany (auctionStatus $nin → $set auctionEndsAt) must NOT exist in routes/leads.js'
  );
});

test('A2. Lifecycle Expire mutation REMAINS in GET /api/leads (out of PR-6 scope)', () => {
  // Defense-in-depth — PR-6 must NOT incidentally remove the Expire one
  // (different bug class, scoped out). Confirm it's still present:
  // status: READY_FOR_DISTRIBUTION + moveDate $lt → Expired.
  assert.match(
    leadsRouteExec,
    /Lead\.updateMany\(\s*\{[\s\S]{0,300}status\s*:\s*['"]READY_FOR_DISTRIBUTION['"][\s\S]{0,200}moveDate\s*:\s*\{\s*\$lt[\s\S]{0,400}status\s*:\s*['"]Expired['"]/,
    'Expire mutation (READY_FOR_DISTRIBUTION + moveDate $lt → Expired) must REMAIN in routes/leads.js'
  );
});

test('A3. No new in-handler dispatchApprovedLead call sneaked into the read path', () => {
  // If a contributor "fixes" the silent state by calling the orchestrator
  // from the read handler, that re-introduces the bug class (mover-feed
  // requests would trigger SMS broadcasts at request rate). PR-6's
  // explicit posture: reactivation lives in the cron, NOT the read path.
  assert.doesNotMatch(
    leadsRouteExec,
    /dispatchApprovedLead/,
    'routes/leads.js must NOT call dispatchApprovedLead — reactivation is cron-only'
  );
});

// ── B. Cron file shape ─────────────────────────────────────────────────

test('B1. jobs/reactivateLeads.js exists', () => {
  assert.ok(fs.existsSync(cronPath), 'jobs/reactivateLeads.js must exist');
});

test('B2. Exports reactivateLeads worker and buildEligibilityFilter helper', () => {
  const mod = require('../jobs/reactivateLeads');
  assert.equal(typeof mod.reactivateLeads, 'function',
    'reactivateLeads must be exported as a function');
  assert.equal(typeof mod.buildEligibilityFilter, 'function',
    'buildEligibilityFilter must be exported as a function');
});

test('B3. Schedules at every 5 minutes (cadence parity with siblings)', () => {
  // The other two operational crons (cleanupExpiredLeads,
  // closeStaleClaimWindows) run at '*/5 * * * *'. Match that.
  assert.match(
    cronExec,
    /cron\.schedule\(\s*['"]\*\/5\s+\*\s+\*\s+\*\s+\*['"]/,
    "cron.schedule must use '*/5 * * * *' (5-minute cadence, parity with closeStaleClaimWindows + cleanupExpiredLeads)"
  );
});

// ── C. Eligibility filter parity ───────────────────────────────────────

test('C1. buildEligibilityFilter returns the post-2026-06-09 narrowed shape', () => {
  // 2026-06-09 — two narrowings in one day:
  //   (1) notifiedAt: null — never re-promote previously-broadcast leads.
  //   (2) createdAt window + distributionDecision — never resurrect
  //       legacy leads predating the current qualification system.
  // See file header for the full rationale.
  const { buildEligibilityFilter, MAX_REACTIVATION_AGE_MS } = require('../jobs/reactivateLeads');
  const now = new Date('2026-05-29T00:00:00Z');
  const filter = buildEligibilityFilter(now);
  assert.deepEqual(
    filter,
    {
      auctionStatus: { $nin: ['active', 'sold', 'buy_now'] },
      status:        { $in: ['Available', 'READY_FOR_DISTRIBUTION'] },
      moveDate:      { $gte: now },
      notifiedAt:    null,
      createdAt:     { $gte: new Date(now.getTime() - MAX_REACTIVATION_AGE_MS) },
      distributionDecision: { $in: ['system_approved', 'admin_approved'] },
      $or: [
        { buyers: { $size: 0 } },
        { buyers: { $exists: false } },
      ],
    },
    'Eligibility filter must include notifiedAt + createdAt window + distributable decision'
  );
});

test('C1b. Filter explicitly gates on notifiedAt: null (regression guard for the 2026-06-09 fix)', () => {
  // Belt-and-suspenders standalone assertion. If a future refactor
  // accidentally drops the notifiedAt clause from the filter, this
  // catches it in isolation (independent of any other filter field).
  const { buildEligibilityFilter } = require('../jobs/reactivateLeads');
  const filter = buildEligibilityFilter(new Date());
  assert.ok(
    Object.prototype.hasOwnProperty.call(filter, 'notifiedAt'),
    'Filter MUST include a notifiedAt clause — without it, expired leads re-broadcast every 5 min'
  );
  assert.equal(
    filter.notifiedAt,
    null,
    'Filter notifiedAt clause MUST be exactly `null` — anything else (e.g. {$exists:false}) lets previously-broadcast leads slip through'
  );
});

test('C1c. Filter gates on createdAt within MAX_REACTIVATION_AGE_MS (legacy-lead guard)', () => {
  // A never-broadcast lead older than 7 days is presumed legacy /
  // abandoned inventory. Even if an admin retroactively flips its
  // distributionDecision, the cron must not resurrect it.
  const { buildEligibilityFilter, MAX_REACTIVATION_AGE_MS } = require('../jobs/reactivateLeads');
  assert.equal(MAX_REACTIVATION_AGE_MS, 7 * 24 * 60 * 60 * 1000,
    'MAX_REACTIVATION_AGE_MS must be exactly 7 days');
  const now = new Date('2026-06-09T12:00:00Z');
  const filter = buildEligibilityFilter(now);
  assert.ok(filter.createdAt, 'Filter MUST include a createdAt clause');
  assert.deepEqual(
    filter.createdAt,
    { $gte: new Date(now.getTime() - MAX_REACTIVATION_AGE_MS) },
    'createdAt clause must be a $gte window of exactly MAX_REACTIVATION_AGE_MS'
  );
});

test('C1d. Filter requires a distributable distributionDecision (qualification guard)', () => {
  // Aligns the cron with dispatchApprovedLead's isHiddenFromMoversById
  // check. Without this, the cron flips auctionStatus on undistributable
  // leads every 5 minutes only for the dispatch to be suppressed
  // downstream — wasted writes and a single-point-of-defense risk.
  const { buildEligibilityFilter } = require('../jobs/reactivateLeads');
  const filter = buildEligibilityFilter(new Date());
  assert.deepEqual(
    [...filter.distributionDecision.$in].sort(),
    ['admin_approved', 'system_approved'],
    'distributionDecision.$in must contain exactly system_approved + admin_approved (matches DISTRIBUTABLE_VALUES in utils/distributionDecision.js)'
  );
});

test('C1e. Legacy leads cannot match the filter — proof by Mongo-semantics simulation', () => {
  // Simulate Mongo's matching semantics on three representative legacy
  // docs against the built filter. We test the FIELDS the legacy guard
  // relies on (createdAt + distributionDecision); the in-Mongo behaviors
  // ("undefined does not match $in", "$gte on a date") are modeled
  // directly because the test lane has no mongod.
  const { buildEligibilityFilter } = require('../jobs/reactivateLeads');
  const now = new Date('2026-06-09T12:00:00Z');
  const filter = buildEligibilityFilter(now);

  const matchesLegacyGuards = (doc) => {
    // createdAt window
    if (!(doc.createdAt instanceof Date)) return false;
    if (doc.createdAt.getTime() < filter.createdAt.$gte.getTime()) return false;
    // distributionDecision $in — undefined / missing does NOT match
    if (!filter.distributionDecision.$in.includes(doc.distributionDecision)) return false;
    return true;
  };

  // Legacy lead 1 — pre-qualification-era: no distributionDecision at all.
  assert.equal(
    matchesLegacyGuards({ createdAt: new Date('2026-06-08T00:00:00Z'), distributionDecision: undefined }),
    false,
    'recent lead WITHOUT distributionDecision must not match'
  );

  // Legacy lead 2 — old lead with default system_pending.
  assert.equal(
    matchesLegacyGuards({ createdAt: new Date('2026-01-15T00:00:00Z'), distributionDecision: 'system_pending' }),
    false,
    'old system_pending lead must not match'
  );

  // Legacy lead 3 — old lead that an admin retroactively approved.
  assert.equal(
    matchesLegacyGuards({ createdAt: new Date('2026-04-01T00:00:00Z'), distributionDecision: 'admin_approved' }),
    false,
    'old lead must not match even when admin_approved — createdAt window is the hard cutoff'
  );

  // Control — fresh approved lead matches.
  assert.equal(
    matchesLegacyGuards({ createdAt: new Date('2026-06-08T00:00:00Z'), distributionDecision: 'system_approved' }),
    true,
    'fresh system_approved lead must still match (cron purpose preserved)'
  );
});

test('C2. auctionStatus $nin contains active/sold/buy_now and nothing else', () => {
  // Drift guard — if a future change adds 'expired' or 'pending' to the
  // $nin (which would invert the meaning of "currently inactive"), the
  // reactivation criteria silently change.
  const { buildEligibilityFilter } = require('../jobs/reactivateLeads');
  const filter = buildEligibilityFilter(new Date());
  assert.deepEqual(
    [...filter.auctionStatus.$nin].sort(),
    ['active', 'buy_now', 'sold'],
    'auctionStatus.$nin must contain exactly active/sold/buy_now'
  );
});

test('C3. status $in contains Available + READY_FOR_DISTRIBUTION only', () => {
  const { buildEligibilityFilter } = require('../jobs/reactivateLeads');
  const filter = buildEligibilityFilter(new Date());
  assert.deepEqual(
    [...filter.status.$in].sort(),
    ['Available', 'READY_FOR_DISTRIBUTION'],
    'status.$in must contain exactly Available + READY_FOR_DISTRIBUTION (no Purchased/Sold/Expired/etc.)'
  );
});

// ── D. Atomic CAS per lead ─────────────────────────────────────────────

test('D1. Worker uses findOneAndUpdate (not updateMany) for the flip', () => {
  // updateMany would re-introduce the silent-state shape (no per-doc
  // result, no way to know which leads were actually flipped). Lock the
  // per-lead findOneAndUpdate.
  assert.match(
    cronExec,
    /Lead\.findOneAndUpdate\(/,
    'Worker must use Lead.findOneAndUpdate for the per-lead CAS'
  );
  assert.doesNotMatch(
    cronExec,
    /Lead\.updateMany\(/,
    'Worker must NOT use Lead.updateMany (would lose per-doc dispatch granularity)'
  );
});

test('D2. CAS re-applies the eligibility filter at write time', () => {
  // The filter passed to findOneAndUpdate must include the same fields
  // (auctionStatus / status / moveDate / buyers) — protects against
  // overlapping cron instances both reactivating + dispatching the same
  // lead.
  assert.match(
    cronExec,
    /findOneAndUpdate\(\s*\{\s*_id\s*:\s*c\._id\s*,\s*\.\.\.\s*filter\s*\}/,
    'CAS must spread the filter into the findOneAndUpdate query: { _id, ...filter }'
  );
});

test('D3. CAS $set covers exactly auctionStatus + auctionEndsAt', () => {
  // PR-6 explicit posture — no other field mutations. status,
  // distributionDecision, qualityGateCleared, notifiedAt, buyers,
  // winnerId, finalPrice all stay untouched.
  const setMatch = cronExec.match(/findOneAndUpdate\([\s\S]*?\$set\s*:\s*\{([^}]*)\}/);
  assert.ok(setMatch, 'CAS $set block must be findable');
  const setBody = setMatch[1];
  assert.match(setBody, /auctionStatus\s*:\s*['"]active['"]/,
    '$set must set auctionStatus: "active"');
  assert.match(setBody, /auctionEndsAt\s*:\s*new\s+Date\(/,
    '$set must set auctionEndsAt to a new Date');
  // Forbid any non-PR-6 fields in the $set.
  for (const forbidden of ['status', 'distributionDecision',
      'qualityGateCleared', 'notifiedAt', 'buyers', 'winnerId',
      'finalPrice', 'buyNowPrice', 'currentBidPrice']) {
    assert.ok(!setBody.includes(forbidden),
      `Worker $set must NOT touch field '${forbidden}'; saw: ${setBody}`);
  }
});

test('D4. auctionEndsAt is now + 24h (window math preserved)', () => {
  // Lock the 24h constant. Pre-PR-6 read-handler used 24 * 60 * 60 *
  // 1000 ms; the cron must produce the same window.
  assert.match(
    cronExec,
    /ONE_DAY_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
    'Worker must define ONE_DAY_MS = 24 * 60 * 60 * 1000 (parity with pre-PR-6 read handler)'
  );
  assert.match(
    cronExec,
    /now\.getTime\(\)\s*\+\s*ONE_DAY_MS/,
    'auctionEndsAt must be now + ONE_DAY_MS'
  );
});

// ── E. Canonical orchestrator dispatch ─────────────────────────────────

test('E1. Worker calls dispatchApprovedLead with source: cron.reactivate', () => {
  // The source tag is a log-grep contract. Lock the literal.
  assert.match(
    cronExec,
    /dispatchFn\([\s\S]{0,80}source\s*:\s*['"]cron\.reactivate['"]/,
    "Worker must call dispatchFn(leadId, { source: 'cron.reactivate' })"
  );
});

test('E2. Worker imports dispatchApprovedLead from the canonical orchestrator', () => {
  // No bypass — the orchestrator is the only correct entry point.
  assert.match(
    cronExec,
    /require\(\s*['"]\.\.\/services\/dispatchOrchestrator['"]\s*\)/,
    'Worker must require services/dispatchOrchestrator'
  );
  assert.match(
    cronExec,
    /\.dispatchApprovedLead/,
    "Worker must read the dispatchApprovedLead export from the orchestrator module"
  );
});

// ── F. No force-bypass ─────────────────────────────────────────────────

test('F1. Worker does NOT pass { force: true } to the orchestrator', () => {
  // force: true bypasses the notifiedAt CAS — that's the operator-only
  // re-broadcast tool, not the cron's behavior.
  assert.doesNotMatch(
    cronExec,
    /force\s*:\s*true/,
    'Worker must NOT pass force: true — per-channel notifiedAt CAS is the dedup authority'
  );
});

// ── G. Worker does not call broadcasters directly ──────────────────────

test('G1. Worker does NOT call SMS / email / socket broadcasters directly', () => {
  for (const forbidden of [
    /broadcastLeadSMS/,
    /broadcastLeadEmail/,
    /emitNewLead/,
    /sendMoverLeadSMS/,
    /sendMoverLostClaimSMS/,
    /twilioClient/,
  ]) {
    assert.doesNotMatch(cronExec, forbidden,
      `Worker must NOT directly invoke ${forbidden} — route through dispatchApprovedLead`);
  }
});

// ── H. Per-lead failure isolation ──────────────────────────────────────

test('H1. CAS failures are caught and the loop continues', () => {
  // try/catch around the CAS; on catch, log and `continue` to next lead.
  assert.match(
    cronExec,
    /try\s*\{[\s\S]{0,300}findOneAndUpdate\([\s\S]*?\}\s*catch\s*\(\s*err\s*\)\s*\{[\s\S]{0,300}continue;/,
    'CAS must be in try/catch with `continue;` on error (per-lead failure must NOT halt the loop)'
  );
});

test('H2. Dispatch failures are caught and the loop continues (dispatchFailed++)', () => {
  // Dispatch try/catch increments a counter so the summary log line
  // surfaces aggregate failures to the operator.
  assert.match(
    cronExec,
    /try\s*\{[\s\S]{0,200}dispatchFn\([\s\S]*?\}\s*catch\s*\(\s*err\s*\)\s*\{[\s\S]{0,200}dispatchFailed\+\+/,
    'Dispatch must be in try/catch with dispatchFailed++ on error'
  );
});

// ── I. Cron is registered in server.js ─────────────────────────────────

test('I1. server.js requires jobs/reactivateLeads', () => {
  assert.match(
    serverExec,
    /require\(\s*['"]\.\/jobs\/reactivateLeads['"]\s*\)/,
    "server.js must require './jobs/reactivateLeads'"
  );
});

test('I2. server.js still requires the sibling crons (no incidental removal)', () => {
  for (const sibling of [
    './jobs/cleanupExpiredLeads',
    './jobs/closeStaleClaimWindows',
    './jobs/settleAuctions',
  ]) {
    const re = new RegExp(`require\\(\\s*['"]${sibling.replace(/\//g, '\\/')}['"]\\s*\\)`);
    assert.match(serverExec, re,
      `server.js must still require ${sibling}`);
  }
});

// ── J. Scope discipline ────────────────────────────────────────────────

test('J1. Worker imports no matching / dispatchPolicy / SMS Claim / financial code', () => {
  for (const forbidden of [
    /leadMatching/,
    /dispatchPolicy/,
    /openClaimWindow/,
    /ClaimAttempt/,
    /Transaction/,
    /PurchasedLead/,
    /User/,
  ]) {
    assert.doesNotMatch(cronExec, forbidden,
      `Worker must NOT import ${forbidden} — out of PR-6 scope`);
  }
});

test('J2. No new env flags introduced by PR-6', () => {
  for (const re of [
    /process\.env\.ENABLE_REACTIVATE/,
    /process\.env\.REACTIVATE_LEADS/,
    /process\.env\.AUCTION_REACTIVATION/,
  ]) {
    assert.doesNotMatch(cronExec, re,
      `Cron must NOT introduce env flag ${re}`);
  }
});

test('J3. No SMS Claim / financial side effects in the worker', () => {
  for (const forbidden of [
    /\$inc/,
    /openClaimWindow/,
    /claimWindow/,
    /buy_now/,  // appears in $nin but NOT as a write target
  ]) {
    // Special-case 'buy_now': it appears in the $nin filter, which is OK.
    // Confirm it does NOT appear in a $set position.
    if (String(forbidden) === '/buy_now/') {
      const setShapes = cronExec.match(/\$set\s*:\s*\{[^}]*\}/g) || [];
      for (const s of setShapes) {
        assert.ok(!/buy_now/.test(s),
          `$set must not write buy_now: ${s}`);
      }
      continue;
    }
    assert.doesNotMatch(cronExec, forbidden,
      `Worker must NOT contain side-effect pattern ${forbidden}`);
  }
});

// ── K. Behavioral assertions on the exported worker ────────────────────
//
// These tests exercise the exported `reactivateLeads` function directly
// by stubbing the Lead model and injecting a fake dispatcher. Mongo is
// NOT involved. This is the strongest sanity check we can do without a
// live DB.

test('K1. Worker calls dispatchFn once per CASed lead with source tag', async () => {
  const { reactivateLeads } = require('../jobs/reactivateLeads');

  // Stub Lead.find().select().lean() chain and Lead.findOneAndUpdate.
  const Lead = require('../models/Lead');
  const origFind = Lead.find;
  const origFOAU = Lead.findOneAndUpdate;
  const fakeLeads = [{ _id: 'lead-1' }, { _id: 'lead-2' }];
  Lead.find = () => ({
    select: () => ({
      lean: async () => fakeLeads.slice(),
    }),
  });
  Lead.findOneAndUpdate = async (filter) => ({ _id: filter._id });

  const calls = [];
  const dispatch = async (leadId, opts) => {
    calls.push({ leadId: String(leadId), opts });
    return { dispatched: true };
  };

  try {
    const summary = await reactivateLeads({ now: new Date('2026-05-29T12:00:00Z'), dispatch });
    assert.equal(summary.candidateCount, 2, 'candidateCount must equal stub list size');
    assert.equal(summary.reactivated, 2, 'reactivated must equal CAS-success count');
    assert.equal(summary.dispatched, 2, 'dispatched must equal successful orchestrator calls');
    assert.equal(summary.dispatchFailed, 0, 'no failures expected');
    assert.equal(calls.length, 2, 'dispatchFn must be called once per CASed lead');
    for (const c of calls) {
      assert.equal(c.opts.source, 'cron.reactivate',
        "every dispatch call must pass source: 'cron.reactivate'");
    }
  } finally {
    Lead.find = origFind;
    Lead.findOneAndUpdate = origFOAU;
  }
});

test('K2. Worker skips dispatch when CAS returns null (race lost)', async () => {
  const { reactivateLeads } = require('../jobs/reactivateLeads');
  const Lead = require('../models/Lead');
  const origFind = Lead.find;
  const origFOAU = Lead.findOneAndUpdate;

  Lead.find = () => ({
    select: () => ({
      lean: async () => [{ _id: 'lead-a' }, { _id: 'lead-b' }],
    }),
  });
  // Return null for the second lead — simulating a CAS race loss.
  let callIdx = 0;
  Lead.findOneAndUpdate = async (filter) => {
    callIdx++;
    if (callIdx === 2) return null;
    return { _id: filter._id };
  };

  const dispatchCalls = [];
  const dispatch = async (leadId, opts) => {
    dispatchCalls.push(String(leadId));
    return { dispatched: true };
  };

  try {
    const summary = await reactivateLeads({ now: new Date(), dispatch });
    assert.equal(summary.reactivated, 1, 'only the winning CAS counts');
    assert.equal(dispatchCalls.length, 1, 'dispatch called only for CAS winners');
    assert.equal(dispatchCalls[0], 'lead-a', "skipped lead-b (CAS race lost)");
  } finally {
    Lead.find = origFind;
    Lead.findOneAndUpdate = origFOAU;
  }
});

test('K3. Worker continues past a dispatch throw (failure isolation)', async () => {
  const { reactivateLeads } = require('../jobs/reactivateLeads');
  const Lead = require('../models/Lead');
  const origFind = Lead.find;
  const origFOAU = Lead.findOneAndUpdate;

  Lead.find = () => ({
    select: () => ({
      lean: async () => [{ _id: 'lead-x' }, { _id: 'lead-y' }, { _id: 'lead-z' }],
    }),
  });
  Lead.findOneAndUpdate = async (filter) => ({ _id: filter._id });

  let callIdx = 0;
  const dispatch = async () => {
    callIdx++;
    if (callIdx === 2) throw new Error('simulated Twilio outage');
    return { dispatched: true };
  };

  try {
    const summary = await reactivateLeads({ now: new Date(), dispatch });
    assert.equal(summary.reactivated, 3, 'all three CASes succeeded');
    assert.equal(summary.dispatched, 2, 'two of three dispatches succeeded');
    assert.equal(summary.dispatchFailed, 1, 'the throw is counted but not propagated');
  } finally {
    Lead.find = origFind;
    Lead.findOneAndUpdate = origFOAU;
  }
});

test('K4. Worker honors injected now for the auctionEndsAt math', async () => {
  const { reactivateLeads } = require('../jobs/reactivateLeads');
  const Lead = require('../models/Lead');
  const origFind = Lead.find;
  const origFOAU = Lead.findOneAndUpdate;

  Lead.find = () => ({
    select: () => ({
      lean: async () => [{ _id: 'lead-time' }],
    }),
  });
  // Capture the update doc to inspect auctionEndsAt.
  let capturedUpdate = null;
  Lead.findOneAndUpdate = async (filter, update) => {
    capturedUpdate = update;
    return { _id: filter._id };
  };

  const dispatch = async () => ({ dispatched: true });

  try {
    const fixed = new Date('2026-06-01T00:00:00Z');
    await reactivateLeads({ now: fixed, dispatch });
    const expectedEnd = new Date(fixed.getTime() + 24 * 60 * 60 * 1000);
    assert.ok(capturedUpdate, 'CAS update doc must be captured');
    assert.equal(
      capturedUpdate.$set.auctionEndsAt.getTime(),
      expectedEnd.getTime(),
      'auctionEndsAt must be exactly now + 24h based on injected now'
    );
    assert.equal(
      capturedUpdate.$set.auctionStatus, 'active',
      'auctionStatus must be set to "active"'
    );
  } finally {
    Lead.find = origFind;
    Lead.findOneAndUpdate = origFOAU;
  }
});

// Stop the cron's scheduled task so the test process exits cleanly.
// (Loading the module under test ran cron.schedule('*/5 * * * *', ...)
// at import time; without an explicit stop, node-cron keeps the event
// loop alive past test completion.)
test.after?.(() => {
  try {
    const { scheduledTask } = require('../jobs/reactivateLeads');
    if (scheduledTask && typeof scheduledTask.stop === 'function') {
      scheduledTask.stop();
    }
  } catch { /* best-effort */ }
});

console.log('Reactivate-leads cron (PR-6) tests scheduled.');
