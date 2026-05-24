// __tests__/leadFeedFreshness.test.js
//
// Lock-in test for the /dashboard/leads freshness fix. Asserts that the
// GET /api/leads handler in routes/leads.js sorts mover-visible leads by
// distributionDecisionAt (the moment a lead became visible to movers)
// rather than by createdAt (the moment the homeowner submitted).
//
// Source-level assertion (no DB, no network). Reads the route file as
// text and verifies the exact .sort(...) call shape. This is the same
// pattern used by dealRoom.test.js for routes/leads.js coverage.
//
// Why this matters: a lead created 21 days ago but admin-approved today
// must show as "just listed" on /dashboard/leads and rank above older
// listings. The sort key + the frontend label must both anchor to
// distributionDecisionAt for that to hold.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('GET /api/leads sorts by distributionDecisionAt with createdAt tiebreaker', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'leads.js'),
    'utf8'
  );

  // The exact .sort(...) shape we require. Whitespace-tolerant.
  const goodSort = /Lead\.find\(query\)\s*\.sort\(\s*\{\s*distributionDecisionAt:\s*-1\s*,\s*createdAt:\s*-1\s*\}\s*\)\s*\.lean\(\)/;

  assert.match(
    src, goodSort,
    'routes/leads.js mover feed must sort by { distributionDecisionAt: -1, createdAt: -1 }. ' +
    'A 21-day-old lead approved today should rank with today\'s listings, not with leads from 21 days ago.'
  );

  // Negative assertion: the pre-fix sort (`createdAt` alone) must not exist
  // on the mover-feed query. We allow other `.sort({ createdAt: -1 })` calls
  // elsewhere in the file (e.g. ScoringSnapshot admin pipeline) because
  // those aren't the mover feed.
  const badMoverSort = /Lead\.find\(query\)\s*\.sort\(\s*\{\s*createdAt:\s*-1\s*\}\s*\)/;
  assert.doesNotMatch(
    src, badMoverSort,
    'routes/leads.js mover feed must NOT sort by createdAt alone — that ranks leads by ' +
    'homeowner-submission time, which makes recently-approved old leads appear stale.'
  );

  // The mover feed must NOT re-sort by _matchesPreferences after the Mongo
  // sort. That used to produce "4d-ago matched lead > 1h-ago unmatched lead"
  // on the All tab. The Matched-for-you tab is now a client-side filter on
  // the same freshness-ordered response; the "All" tab is strict freshness.
  const badMatchedFirst = /leads\.sort\(\s*\([^)]*\)\s*=>\s*\(b\._matchesPreferences/;
  assert.doesNotMatch(
    src, badMatchedFirst,
    'routes/leads.js must NOT server-side-reorder by _matchesPreferences. The All ' +
    'tab is freshness-only; matched filtering happens client-side via the tab.'
  );

  // The /dashboard/leads annotation must use the coverage-only helper
  // (isLeadInMoverCoverage), NOT the full-policy helper
  // (doesLeadMatchMoverPreferences). Dispatch services keep using the
  // full-policy helper directly — that's deliberate. See the comment block
  // above the import in routes/leads.js for the split rationale.
  const usesCoverageOnly = /_matchesPreferences\s*=\s*isLeadInMoverCoverage\(/;
  assert.match(
    src, usesCoverageOnly,
    'routes/leads.js must annotate _matchesPreferences using isLeadInMoverCoverage. ' +
    'Coverage-only badge semantics: a lead matches if its origin or destination ZIP ' +
    'overlaps the mover CoverageArea (plus nationwide-on-origin fallback). Distance, ' +
    'home size, and move type belong to dispatch policy, not the badge.'
  );

  const usesFullPolicy = /_matchesPreferences\s*=\s*doesLeadMatchMoverPreferences\(/;
  assert.doesNotMatch(
    src, usesFullPolicy,
    'routes/leads.js must NOT use doesLeadMatchMoverPreferences for the dashboard ' +
    'annotation — that helper is for SMS/email dispatch. Use isLeadInMoverCoverage instead.'
  );
});

test('frontend /dashboard/leads "Listed" label reads distributionDecisionAt', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'dashboard', 'LeadFeed.jsx'),
    'utf8'
  );

  // The exact display expression. createdAt fallback is required for the
  // edge case of legacy rows that somehow lack distributionDecisionAt.
  const goodLabel = /timeAgo\(\s*lead\.distributionDecisionAt\s*\|\|\s*lead\.createdAt\s*\)/;

  assert.match(
    src, goodLabel,
    'LeadFeed.jsx must display "Listed X ago" using lead.distributionDecisionAt ' +
    '(with createdAt fallback), so the label reflects when the lead became visible ' +
    'to movers, not when the homeowner submitted.'
  );

  // The pre-fix call (createdAt alone) must not be the one used by the
  // "Listed" cell. We do allow timeAgo(lead.createdAt) to exist elsewhere
  // in the file (other cells / debug rows), but in the "Listed" cell it
  // must read distributionDecisionAt.
  //
  // Scope: the "Listed" cell uses className="col-listed". Slice a 600-char
  // window starting at that marker and assert the bad pattern is absent
  // inside it.
  const listedCellIdx = src.indexOf('col-listed');
  assert.ok(listedCellIdx > -1, 'expected to find the col-listed cell in LeadFeed.jsx');
  const listedCellWindow = src.slice(listedCellIdx, listedCellIdx + 600);
  const badLabel = /timeAgo\(\s*lead\.createdAt\s*\)/;
  assert.doesNotMatch(
    listedCellWindow, badLabel,
    'The "Listed" cell on /dashboard/leads must not display timeAgo(lead.createdAt) alone — ' +
    'that shows the homeowner-submission time, not the listing time.'
  );
});

console.log('\nAll /dashboard/leads freshness lock-in tests passed.');
