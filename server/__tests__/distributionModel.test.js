/**
 * Phase B distribution-model smoke test.
 *
 * Verifies the four pieces of the auction → instant-dispatch transition that
 * can be tested in-process (no DB, no HTTP). Follows the static-source-check
 * pattern established by sequentialQualification.test.js: load the source
 * files and assert the critical lines are present and shaped correctly.
 *
 * What this CAN'T verify (must be checked in staging — see verification
 * matrix in the Phase B plan):
 *   - Real bid request returns 409 against a live DB
 *   - Cron actually skips instant leads during a real tick
 *   - Race condition between two simultaneous /buy-now requests resolves
 *     to exactly one PurchasedLead and one debit
 *
 * What this DOES verify:
 *   A. Schema — Lead.distributionModel default + enum
 *   B. Env helper — truthy spellings map correctly
 *   C. Ingest sites — all three branch on the helper and gate auctionEndsAt
 *   D. Bid route — has the instant-lead 409 guard before any mutation
 *   E. Cron — both queries include the distributionModel $ne 'instant' clause
 *   F. Socket — emitNewLead payload exposes distributionModel
 *   G. Buy-now atomicity (static) — the operations a race condition relies
 *      on are present, in the right order, and didn't get refactored away
 *
 * Run with: `node server/__tests__/distributionModel.test.js`
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.LEAD_VISIBILITY_REPORT_INTERVAL_MS = '0';

const ingestV1Src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leadIngest.js'),   'utf8');
const ingestV2Src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leadIngestV2.js'), 'utf8');
const adminSrc    = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'),        'utf8');
const bidsSrc     = fs.readFileSync(path.join(__dirname, '..', 'routes', 'bids.js'),         'utf8');
const cronSrc     = fs.readFileSync(path.join(__dirname, '..', 'jobs',   'settleAuctions.js'), 'utf8');
const socketSrc   = fs.readFileSync(path.join(__dirname, '..', 'services', 'socketService.js'), 'utf8');
const leadsSrc    = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'),        'utf8');

// ── A. Schema: default + enum ─────────────────────────────────────────────
{
  const Lead = require('../models/Lead');
  const path = Lead.schema.paths.distributionModel;
  assert.ok(path, 'Lead schema must define distributionModel');
  assert.strictEqual(path.instance, 'String', 'distributionModel must be a String');
  assert.deepStrictEqual([...path.enumValues].sort(), ['auction', 'instant'].sort(),
    "enum must be exactly ['auction','instant']");
  assert.strictEqual(path.defaultValue, 'auction',
    "default must be 'auction' (back-compat for body-spread admin POST + scripts)");

  const def = new Lead({});
  assert.strictEqual(def.distributionModel, 'auction', 'fresh doc defaults to auction');

  const inst = new Lead({ distributionModel: 'instant' });
  assert.strictEqual(inst.distributionModel, 'instant', 'explicit instant honored');

  const bad = new Lead({ distributionModel: 'bogus' });
  const err = bad.validateSync();
  assert.ok(err && err.errors && err.errors.distributionModel,
    'invalid enum value must be rejected by validateSync');

  console.log('  ✓ A. Lead.distributionModel schema (enum, default, validation)');
}

// ── B. Env helper parses truthy spellings consistently ────────────────────
{
  const { instantDispatchEnabled } = require('../utils/instantDispatch');
  const original = process.env.ENABLE_INSTANT_DISPATCH;

  const cases = [
    ['true',     true],
    ['TRUE',     true],
    ['True',     true],
    ['1',        true],
    ['false',    false],
    ['0',        false],
    ['',         false],
    ['garbage',  false],
  ];
  for (const [input, expected] of cases) {
    process.env.ENABLE_INSTANT_DISPATCH = input;
    assert.strictEqual(instantDispatchEnabled(), expected,
      `env='${input}' → ${expected}`);
  }
  delete process.env.ENABLE_INSTANT_DISPATCH;
  assert.strictEqual(instantDispatchEnabled(), false, 'unset → false');

  if (original !== undefined) process.env.ENABLE_INSTANT_DISPATCH = original;
  console.log('  ✓ B. instantDispatchEnabled() parses all truthy spellings');
}

// ── C. All three ingest sites gate auctionEndsAt on the helper ────────────
{
  for (const [label, src] of [
    ['leadIngest.js',   ingestV1Src],
    ['leadIngestV2.js', ingestV2Src],
    ['admin.js (CSV)',  adminSrc],
  ]) {
    assert.ok(
      /distributionModel:\s*instantDispatchEnabled\(\)\s*\?\s*'instant'\s*:\s*'auction'/.test(src),
      `${label} must stamp distributionModel via instantDispatchEnabled()`
    );
    // The auctionEndsAt assignment must be GATED by the helper — i.e. wrapped
    // in a conditional spread `...(instantDispatchEnabled() ? {} : { auctionEndsAt: ... })`
    // so instant leads never receive an expiry.
    assert.ok(
      /\.\.\.\(\s*instantDispatchEnabled\(\)\s*\?\s*\{\s*\}\s*:\s*\{\s*auctionEndsAt:/.test(src),
      `${label} must gate auctionEndsAt behind instantDispatchEnabled()`
    );
  }
  console.log('  ✓ C. Ingest sites stamp model + gate auctionEndsAt');
}

// ── D. Bid route returns 409 for instant leads before any mutation ────────
{
  // The 409 guard must (1) check distributionModel === 'instant', (2) be
  // placed BEFORE the lead.save() / lead.bids.push() lines that would
  // mutate state. We assert ordering by index in the source string.
  const guardMatch = bidsSrc.match(/lead\.distributionModel\s*===\s*'instant'/);
  assert.ok(guardMatch, 'bids.js must check lead.distributionModel === instant');

  const status409 = bidsSrc.indexOf("status(409)");
  const errorCode = bidsSrc.indexOf("bidding_not_supported");
  assert.ok(status409 > -1 && errorCode > -1, '409 + bidding_not_supported code must be present');

  const guardIdx = guardMatch.index;
  const pushIdx  = bidsSrc.indexOf('lead.bids.push(');
  const saveIdx  = bidsSrc.indexOf('await lead.save()');
  assert.ok(guardIdx < pushIdx, 'instant guard must be BEFORE lead.bids.push');
  assert.ok(guardIdx < saveIdx, 'instant guard must be BEFORE lead.save()');

  // Buy-now route must NOT be gated by distributionModel — instant leads
  // claim through buy-now. The bid-route guard is local to POST /:leadId.
  const buyNowSection = bidsSrc.slice(bidsSrc.indexOf('/buy-now'));
  assert.ok(
    !/distributionModel\s*===\s*'instant'/.test(buyNowSection),
    'buy-now route must NOT block instant leads'
  );

  console.log('  ✓ D. Bid route 409 guard present and ordered correctly');
}

// ── E. Cron queries exclude instant leads (both call sites) ───────────────
{
  // Match the $ne clause in both the per-lead settleOneLead and the
  // periodic Lead.find() in the cron callback.
  const matches = cronSrc.match(/distributionModel:\s*\{\s*\$ne:\s*'instant'\s*\}/g);
  assert.ok(matches && matches.length === 2,
    `expected 2 distributionModel $ne 'instant' clauses, got ${matches ? matches.length : 0}`);

  console.log('  ✓ E. Cron settleAuctions excludes instant leads in both queries');
}

// ── F. Socket payload exposes distributionModel ───────────────────────────
{
  assert.ok(
    /distributionModel:\s*lead\.distributionModel\s*\|\|\s*'auction'/.test(socketSrc),
    'socketService.emitNewLead payload must include distributionModel with auction fallback'
  );
  console.log('  ✓ F. emitNewLead payload includes distributionModel');
}

// ── G. Buy-now atomicity — race-condition guarantees still in place ───────
//
// Two concurrent /buy-now requests on the SAME lead must produce exactly
// one PurchasedLead and one debit. The route achieves this with three
// stacked atomic operations; if any of them is removed or reordered the
// race window reopens. This test asserts the operations are still present
// in the right order in the source — actual concurrent execution must be
// verified in staging (verification matrix row 5b).
{
  // Slice the buy-now handler. Use the route definition line as the start
  // anchor (not the comment header — that text recurs in the file-top
  // docstring); use the settle route handler line as the end anchor.
  const buyNowStart = bidsSrc.indexOf("router.post('/:leadId/buy-now'");
  const buyNowEnd   = bidsSrc.indexOf("router.post('/:leadId/settle'");
  assert.ok(buyNowStart > -1 && buyNowEnd > buyNowStart, 'must locate buy-now route block');
  const buyNow = bidsSrc.slice(buyNowStart, buyNowEnd);

  // (1) Atomic flip active → buy_now via findOneAndUpdate. Only one mover
  //     can win this for a given lead; others get null and exit early.
  const flipIdx = buyNow.search(/Lead\.findOneAndUpdate\([\s\S]*?auctionStatus:\s*'active'[\s\S]*?\$set:[\s\S]*?auctionStatus:\s*'buy_now'/);
  assert.ok(flipIdx > -1,
    'buy-now must use atomic findOneAndUpdate flipping auctionStatus active → buy_now');

  // (2) Atomic conditional debit: balance >= price. Loser leaves the user
  //     row untouched. Must come AFTER the flip so we only debit winners.
  const debitIdx = buyNow.search(/User\.findOneAndUpdate\([\s\S]*?balance:\s*\{\s*\$gte:\s*price\s*\}[\s\S]*?\$inc:[\s\S]*?balance:\s*-price/);
  assert.ok(debitIdx > -1, 'buy-now must atomically debit with balance $gte gate');
  assert.ok(debitIdx > flipIdx, 'debit must come AFTER the lead-status flip');

  // (3) Unique PurchasedLead insert is the final safety net. If two
  //     processes somehow both flipped + debited (shouldn't happen, but
  //     defense-in-depth), the unique { company, lead } index throws
  //     E11000 on the second insert and the route refunds + reverts.
  const purchaseIdx = buyNow.indexOf('new PurchasedLead(');
  const e11000Idx   = buyNow.indexOf('err.code === 11000');
  assert.ok(purchaseIdx > -1,         'buy-now must create PurchasedLead');
  assert.ok(purchaseIdx > debitIdx,   'PurchasedLead insert must come AFTER debit');
  assert.ok(e11000Idx > purchaseIdx,  'E11000 handler must follow PurchasedLead insert');

  // (4) On E11000, the route refunds the debit AND reverts the lead flip
  //     so the loser path leaves no residue.
  const refundIdx = buyNow.indexOf('$inc: { balance: price }', e11000Idx);
  const revertIdx = buyNow.search(/auctionStatus:\s*'active'.*409/s);
  assert.ok(refundIdx > -1, 'E11000 path must $inc balance (refund)');
  assert.ok(/auctionStatus:\s*'active'/.test(buyNow.slice(e11000Idx)),
    'E11000 path must revert auctionStatus to active');

  // (5) Insufficient-balance path also reverts the flip — same residue
  //     guarantee for a different failure mode.
  const insufficientSection = buyNow.match(/if\s*\(!debited\)[\s\S]*?return res\.status\(402\)/);
  assert.ok(insufficientSection,
    'insufficient-balance path must exist between debit and PurchasedLead');
  assert.ok(/auctionStatus:\s*'active'/.test(insufficientSection[0]),
    'insufficient-balance path must revert auctionStatus to active');

  console.log('  ✓ G. Buy-now atomic operations + revert paths intact');
}

// ── H. Phase D feed filter — main mover feed is instant-only ─────────────
//
// `GET /api/leads` mover-facing query must filter the available branch to
// `distributionModel: 'instant'`. Three invariants:
//   1. The clause exists inside the availableBranch object (not in the
//      purchased branch, not in widget-analytics, not in moverVisibilityFilter)
//   2. The widget-analytics route does NOT filter by distributionModel
//      (mover's own widget capture history must remain unfiltered)
//   3. moverVisibilityFilter() does NOT enforce distributionModel
//      (quality gate vs surface taxonomy are kept orthogonal)
{
  // (1) Feed query availableBranch carries the filter
  const availableBranchStart = leadsSrc.indexOf('const availableBranch = {');
  const availableBranchEnd   = leadsSrc.indexOf('};', availableBranchStart);
  assert.ok(availableBranchStart > -1 && availableBranchEnd > availableBranchStart,
    'leads.js must define availableBranch object literal');
  const availableBranch = leadsSrc.slice(availableBranchStart, availableBranchEnd);
  assert.ok(
    /distributionModel:\s*'instant'/.test(availableBranch),
    "availableBranch must filter distributionModel: 'instant'"
  );

  // (2) widget-analytics route uses moverVisibilityFilter() but must NOT
  //     filter by distributionModel — that route shows the user their own
  //     widget capture history (auction + instant alike).
  const widgetStart = leadsSrc.indexOf("router.get('/widget-analytics'");
  const widgetEnd   = leadsSrc.indexOf('});', widgetStart);
  assert.ok(widgetStart > -1 && widgetEnd > widgetStart, 'must locate widget-analytics handler');
  const widgetSrc = leadsSrc.slice(widgetStart, widgetEnd);
  assert.ok(
    !/distributionModel:\s*'instant'/.test(widgetSrc),
    'widget-analytics must NOT filter by distributionModel (own widget history)'
  );

  // (3) moverVisibilityFilter() implementation must not enforce distributionModel
  const visibilitySrc = fs.readFileSync(path.join(__dirname, '..', 'utils', 'leadVisibility.js'), 'utf8');
  // Find the moverVisibilityFilter function body
  const fnStart = visibilitySrc.indexOf('function moverVisibilityFilter()');
  assert.ok(fnStart > -1, 'must locate moverVisibilityFilter definition');
  // The function ends at the next top-level function or end-of-file marker.
  // For safety, slice a generous chunk and check.
  const fnSlice = visibilitySrc.slice(fnStart, fnStart + 4000);
  assert.ok(
    !/distributionModel/.test(fnSlice),
    'moverVisibilityFilter() must NOT reference distributionModel — quality gate stays orthogonal to surface'
  );

  // (4) Purchased branch (`buyers.company`) must NOT carry the filter —
  //     buyers can always see leads they purchased, regardless of distribution
  //     model (refunds, history, customer detail access).
  const queryStart = leadsSrc.indexOf('query = {', availableBranchEnd);
  const queryEnd   = leadsSrc.indexOf('};', queryStart);
  assert.ok(queryStart > -1, 'must locate query assignment after availableBranch');
  const querySrc = leadsSrc.slice(queryStart, queryEnd);
  // The outer $or has two children: 'buyers.company' purchased branch and
  // availableBranch. Confirm distributionModel does NOT appear here — only
  // inside availableBranch above.
  assert.ok(
    !/distributionModel/.test(querySrc),
    'outer query $or must not introduce distributionModel — purchased branch bypasses surface filter'
  );

  console.log('  ✓ H. Phase D feed filter present and scoped correctly');
}

console.log('\nAll distributionModel Phase B+D smoke tests passed.');
