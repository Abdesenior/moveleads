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

  // Phase 3.1 — the dashboard badge under strict mode is the SAME matcher
  // the SMS + email broadcasts use: doesLeadMatchMoverPreferencesStrict.
  // This guarantees a "✓ Matches your setup" badge means "I qualify for
  // this lead" (coverage AND distance AND home size AND moveTypes), not
  // just "the ZIP overlaps something I configured" — which was the gap
  // that let badges leak onto leads the mover doesn't actually want.
  //
  // Legacy mode (flag off) keeps the historic coverage-only badge
  // (isLeadInMoverCoverage) for back-compat — flipping it quietly would
  // surprise existing movers.
  //
  // Rejected: the LEGACY full-policy matcher
  // (doesLeadMatchMoverPreferences without "Strict") — that was the original
  // historical concern: it bundled coverage-only + dispatch concerns in a
  // way that made the badge over-restrictive in legacy mode. The strict
  // variant (doesLeadMatchMoverPreferencesStrict) is purpose-built for the
  // strict cutover and is the new badge truth.
  const callsLegacyCoverage = /\bisLeadInMoverCoverage\(/;
  const callsStrictPolicy   = /\bdoesLeadMatchMoverPreferencesStrict\(/;
  assert.ok(callsLegacyCoverage.test(src) && callsStrictPolicy.test(src),
    'routes/leads.js must use isLeadInMoverCoverage for the legacy-mode badge ' +
    'AND doesLeadMatchMoverPreferencesStrict for the strict-mode badge. ' +
    'This is the Phase 3.1 unification: strict mode = same matcher SMS + email use.');

  const usesLegacyFullPolicy = /_matchesPreferences\s*=\s*doesLeadMatchMoverPreferences\(/;
  assert.doesNotMatch(
    src, usesLegacyFullPolicy,
    'routes/leads.js must NOT use the LEGACY doesLeadMatchMoverPreferences helper ' +
    'for the dashboard annotation — that was the historic over-restrictive path.'
  );
});

test('frontend /dashboard/leads "Listed" label reads createdAt (homeowner-submission time)', () => {
  // 2026-05-30 — Fr2 principle change. Every mover-facing freshness display
  // must answer "when did the homeowner submit this request?" — anchor on
  // Lead.createdAt. The previous version of this test locked in
  // distributionDecisionAt; that anchor is now reserved for admin/observability
  // surfaces only. See:
  //   - docs/code-review-rules.md R1
  //   - the freshness rule comment block above `timeAgo` in LeadFeed.jsx
  const raw = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'dashboard', 'LeadFeed.jsx'),
    'utf8'
  );

  // Strip JS comments before scanning so the rule-explainer comment block
  // inside the col-listed cell doesn't mask the executable expression.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX comments
    .replace(/\/\/.*$/gm, '');            // line comments

  // The "Listed" cell must display timeAgo(lead.createdAt). Scope check:
  // slice a window starting at the col-listed marker.
  const listedCellIdx = src.indexOf('col-listed');
  assert.ok(listedCellIdx > -1, 'expected to find the col-listed cell in LeadFeed.jsx');
  const listedCellWindow = src.slice(listedCellIdx, listedCellIdx + 600);
  const goodLabel = /timeAgo\(\s*lead\.createdAt\s*\)/;
  assert.match(
    listedCellWindow, goodLabel,
    'The "Listed" cell in LeadFeed.jsx must display timeAgo(lead.createdAt) ' +
    '— the homeowner submission time. updatedAt is never a freshness signal; ' +
    'distributionDecisionAt is reserved for admin surfaces.'
  );

  // Conversely: lead.updatedAt must NEVER appear inside the Listed cell.
  // It is the worst freshness anchor — admin re-pricing makes stale leads
  // look fresh.
  const badUpdatedAt = /timeAgo\(\s*lead\.updatedAt/;
  assert.doesNotMatch(
    listedCellWindow, badUpdatedAt,
    'The "Listed" cell must NEVER read lead.updatedAt — that surfaces admin ' +
    're-pricing as freshness and tanks marketplace trust.'
  );
});

console.log('\nAll /dashboard/leads freshness lock-in tests passed.');
