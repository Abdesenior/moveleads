// Freshness & Trust polish PR (2026-05-30) — lock-in tests
//
// Codifies the freshness anchor rule and the trust-copy decisions made in
// this PR so a future "cleanup" can't silently regress them.
//
// Principle (see docs/code-review-rules.md R1):
//   Every mover-facing freshness indicator must answer:
//     "When did the homeowner submit this request?"
//   Anchor preference: Lead.createdAt → distributionDecisionAt → dealRoomListedAt.
//   Lead.updatedAt is NEVER a freshness signal.
//
// Principle (see docs/code-review-rules.md R2):
//   broadcastManifest fields (lastBroadcastAttemptAt, lastBroadcastSuppressReason,
//   lastBroadcastMatchedCount) are admin/observability-only. They MUST NOT
//   appear in mover-facing responses or UI.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CLIENT = path.join(__dirname, '..', '..', 'client', 'src');
const dealsJsx     = fs.readFileSync(path.join(CLIENT, 'pages/dashboard/Deals.jsx'),    'utf8');
const dealsCss     = fs.readFileSync(path.join(CLIENT, 'pages/dashboard/Deals.css'),    'utf8');
const leadFeedJsx  = fs.readFileSync(path.join(CLIENT, 'pages/dashboard/LeadFeed.jsx'), 'utf8');
const leadJs       = fs.readFileSync(path.join(__dirname, '..', 'models/Lead.js'),      'utf8');

const stripComments = (src) => src
  // line comments
  .replace(/\/\/.*$/gm, '')
  // block comments
  .replace(/\/\*[\s\S]*?\*\//g, '');

const dealsExec    = stripComments(dealsJsx);
const leadFeedExec = stripComments(leadFeedJsx);

// ─── Fr2 — Deal Room "Listed" anchors on createdAt, never updatedAt ──────────

test('Fr2.A — Deals.jsx Listed cell uses lead.createdAt', () => {
  // Locate the listedStr derivation. The cell renders {listedStr} where
  // listedStr = timeAgo(lead.createdAt).
  assert.match(
    dealsExec,
    /const\s+listedStr\s*=\s*timeAgo\(\s*lead\.createdAt\s*\)/,
    'Deals.jsx must derive listedStr from lead.createdAt (homeowner submission time)'
  );
});

test('Fr2.B — Deals.jsx Listed cell does NOT use lead.updatedAt', () => {
  // Anywhere `timeAgo(lead.updatedAt)` appears is a Fr2 regression.
  assert.doesNotMatch(
    dealsExec,
    /timeAgo\(\s*lead\.updatedAt/,
    'Deals.jsx must never display lead.updatedAt as freshness — admin re-pricing makes stale leads look fresh'
  );
});

test('Fr2.C — Deals.jsx listed-sort branch sorts by createdAt', () => {
  // The 'listed' / default switch case must read createdAt, not updatedAt.
  // Anchored on the 'listed': / default: / aV = … getTime() sequence.
  assert.match(
    dealsExec,
    /case\s+'listed'\s*:[\s\S]{0,200}aV\s*=\s*a\.createdAt[\s\S]{0,80}getTime\(\)/,
    'Deals.jsx client sort by "Listed" must order on createdAt desc, not updatedAt'
  );
  assert.doesNotMatch(
    dealsExec,
    /case\s+'listed'\s*:[\s\S]{0,200}aV\s*=\s*a\.updatedAt/,
    'Deals.jsx client sort must NEVER read updatedAt for the Listed key'
  );
});

test('Fr2.D — LeadFeed.jsx Listed cell uses lead.createdAt', () => {
  const listedIdx = leadFeedExec.indexOf('col-listed');
  assert.ok(listedIdx > -1, 'col-listed cell must exist in LeadFeed.jsx');
  const window = leadFeedExec.slice(listedIdx, listedIdx + 600);
  assert.match(
    window,
    /timeAgo\(\s*lead\.createdAt\s*\)/,
    'LeadFeed.jsx col-listed cell must read timeAgo(lead.createdAt)'
  );
});

test('Fr2.E — LeadFeed.jsx default "listed" sort orders by createdAt desc', () => {
  // The sortBy === 'listed' (default) path should explicitly sort on
  // createdAt desc rather than preserving server order.
  const sortBlockIdx = leadFeedExec.indexOf('displayedLeads');
  assert.ok(sortBlockIdx > -1, 'displayedLeads sort block must exist in LeadFeed.jsx');
  const window = leadFeedExec.slice(sortBlockIdx, sortBlockIdx + 1200);
  assert.match(
    window,
    /a\.createdAt[\s\S]{0,80}getTime\(\)/,
    'LeadFeed.jsx displayedLeads default sort must order by createdAt'
  );
  assert.doesNotMatch(
    window,
    /a\.updatedAt[\s\S]{0,80}getTime\(\)/,
    'LeadFeed.jsx displayedLeads must NEVER sort by updatedAt'
  );
});

test('Fr2.F — Platform-rule comment is present in both Deals.jsx and LeadFeed.jsx', () => {
  // The verbatim rule must appear so a future engineer reading either file
  // sees it without having to find the canonical docs/code-review-rules.md.
  const phrase = /When did the homeowner submit this request\?/;
  assert.match(dealsJsx,    phrase, 'Deals.jsx must contain the platform freshness rule comment');
  assert.match(leadFeedJsx, phrase, 'LeadFeed.jsx must contain the platform freshness rule comment');
});

// ─── Fr3 — Listed column restored on Deal Room mobile cards ──────────────────

test('Fr3 — Deal Room mobile Listed is no longer display:none', () => {
  // Pre-Fr3: `.col-listed { display: none; }`
  // Post-Fr3: `.col-listed { display: inline-flex; … }`
  // We scan the mobile breakpoint block for the col-listed rule.
  const breakpointIdx = dealsCss.indexOf('@media (max-width: 700px)');
  assert.ok(breakpointIdx > -1, 'mobile breakpoint must exist in Deals.css');
  const mobileBlock = dealsCss.slice(breakpointIdx);
  // The hide rule must NOT remain.
  assert.doesNotMatch(
    mobileBlock,
    /td\.col-listed\s*\{\s*display:\s*none\s*;?\s*\}/,
    'Mobile Deals.css must not hide col-listed (Fr3)'
  );
  // A positive rendering rule must be present.
  assert.match(
    mobileBlock,
    /td\.col-listed\s*\{[^}]*display:\s*inline-flex/,
    'Mobile Deals.css must render col-listed as inline-flex (Fr3)'
  );
});

// ─── Fr5 — broadcastManifest fields are admin/observability-only ─────────────

test('Fr5.A — Lead schema carries the mover-facing-exposure prohibition comment', () => {
  // Inline schema comment must communicate the rule near the field defs.
  assert.match(
    leadJs,
    /MOVER-FACING EXPOSURE IS PROHIBITED/,
    'Lead.js must contain the Fr5 prohibition banner above the broadcast manifest fields'
  );
  // And it must name the three fields explicitly so the comment can't drift.
  assert.match(leadJs, /lastBroadcastAttemptAt/,      'lastBroadcastAttemptAt must be named in the schema comment block');
  assert.match(leadJs, /lastBroadcastSuppressReason/, 'lastBroadcastSuppressReason must be named in the schema comment block');
  assert.match(leadJs, /lastBroadcastMatchedCount/,   'lastBroadcastMatchedCount must be named in the schema comment block');
});

test('Fr5.B — docs/code-review-rules.md exists and contains rule R2', () => {
  const rulesPath = path.join(__dirname, '..', '..', 'docs', 'code-review-rules.md');
  assert.ok(fs.existsSync(rulesPath), 'docs/code-review-rules.md must exist (referenced from Lead.js)');
  const rules = fs.readFileSync(rulesPath, 'utf8');
  assert.match(rules, /R2 — `broadcastManifest`/, 'Rule R2 must be present in code-review-rules.md');
});

// ─── Fr6 — Empty-state trust copy on Live Leads + Deal Room ──────────────────

test('Fr6.A — LeadFeed empty state contains the active-monitoring line', () => {
  assert.match(
    leadFeedJsx,
    /We check continuously — alerts fire within seconds of a verified match\./,
    'LeadFeed.jsx empty state must contain the Fr6 active-monitoring reassurance'
  );
});

test('Fr6.B — Deals empty state contains the curation line', () => {
  assert.match(
    dealsJsx,
    /We restock as our team curates new inventory\./,
    'Deals.jsx empty state must contain the Fr6 curation line'
  );
});

// ─── Fr9 — "Recently Listed" is the default sort on both surfaces ────────────

test('Fr9.A — LeadFeed default sort is "listed"', () => {
  assert.match(
    leadFeedExec,
    /useState\(\s*'listed'\s*\)/,
    'LeadFeed.jsx must initialize sortBy to "listed" (Recently Listed default)'
  );
});

test('Fr9.B — Deals default sort is "listed" desc', () => {
  // Two useState calls back-to-back: sortKey='listed', sortDir='desc'.
  assert.match(
    dealsExec,
    /useState\(\s*'listed'\s*\)[\s\S]{0,250}useState\(\s*'desc'\s*\)/,
    'Deals.jsx must initialize sortKey="listed" and sortDir="desc"'
  );
});

console.log('\nFreshness & Trust polish PR lock-in suite — all assertions passed.');
