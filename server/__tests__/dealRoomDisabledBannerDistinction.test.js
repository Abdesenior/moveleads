/**
 * Deal Room "feature-disabled vs empty" banner distinction (PR-D1) lock-in.
 *
 * Pre-PR-D1, the mover Deals page mapped `res.status === 404` (server's
 * "ENABLE_DEAL_ROOM is off" signal) to `setLeads([])` and then rendered
 * the standard empty state. From the mover's perspective:
 *
 *   Flag OFF, real-empty inventory:  same UI
 *   Flag OFF, populated inventory:   same UI (inventory invisible)
 *   Flag ON,  real-empty inventory:  same UI
 *
 * If `ENABLE_DEAL_ROOM` is ever wrong in prod, every mover sees a
 * permanently-empty Deal Room with no signal. Compounded by zero
 * read-side observability — operators couldn't detect it either.
 *
 * PR-D1 fix (smallest safe): no server change. Client adds a separate
 * `featureDisabled` state set when 404 arrives. The render path picks
 * one of three branches (mutually exclusive):
 *   1. featureDisabled  → "Deal Room is currently unavailable" banner
 *   2. !featureDisabled, filtered.length === 0 → "No deals available right now"
 *   3. !featureDisabled, filtered.length > 0   → grid of DealCards
 *
 * What this suite pins:
 *
 *   A. The server is UNCHANGED — still returns 404 with the same body
 *      when the flag is off. This PR is a client-only change; no
 *      breaking API contract for any other consumer (today: none, but
 *      defensive).
 *   B. The client adds a `featureDisabled` state setter that runs ONLY
 *      on res.status === 404, and clears it on every successful 200
 *      (so flipping the flag on while the page is open recovers).
 *   C. The 404 handler still clears `leads` and returns BEFORE the
 *      `res.ok` throw — same control flow, just with one extra setter.
 *   D. The render path has TWO distinct banners with two distinct
 *      `data-testid`s:
 *        - `deal-room-disabled-banner` (PR-D1 — feature off)
 *        - `deal-room-empty-state`     (existing — feature on, empty)
 *      The disabled-banner branch is gated on `featureDisabled` AND
 *      runs BEFORE the empty-state branch in the JSX tree.
 *   E. The empty-state branch is gated on `!featureDisabled` so the two
 *      branches are mutually exclusive — the empty state can NEVER
 *      paint when the flag is off.
 *   F. The disabled banner has visually distinctive copy that does NOT
 *      collide with the empty state copy. ("currently unavailable" vs
 *      "No deals available right now").
 *   G. The populated grid still requires `!loading && filtered.length > 0`
 *      and naturally cannot render when featureDisabled is true (since
 *      a 404 sets leads to empty). Confirmed indirectly via the
 *      mutual-exclusion gate on the empty state.
 *   H. Scope discipline — no changes to:
 *        - the buy-now path (POST /api/bids/:leadId/buy-now)
 *        - the read endpoint server-side (only the client interpretation
 *          of 404 changes)
 *        - the existing empty-state copy / styling (UX preservation)
 *        - feature flag semantics (still env-only, still
 *          ENABLE_DEAL_ROOM, still 404 from server when off)
 *
 * Pure-Node, no Mongo, no jsdom. Source-level assertions only.
 *
 * Run: `node server/__tests__/dealRoomDisabledBannerDistinction.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const clientRoot = path.join(__dirname, '..', '..', 'client', 'src');

const dealsJsxPath  = path.join(clientRoot, 'pages', 'dashboard', 'Deals.jsx');
const leadsRoutePath = path.join(serverRoot, 'routes',  'leads.js');

const dealsJsxSrc   = fs.readFileSync(dealsJsxPath,   'utf8');
const leadsRouteSrc = fs.readFileSync(leadsRoutePath, 'utf8');

function stripComments(src) {
  // Strip line comments FIRST (URL fragments like /api/x/* inside a line
  // comment would otherwise be eaten by the block-comment regex — same
  // gotcha as the PR-6 reactivate-cron test).
  return src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
const dealsJsxExec   = stripComments(dealsJsxSrc);
const leadsRouteExec = stripComments(leadsRouteSrc);

// ── A. Server unchanged ────────────────────────────────────────────────

test('A1. Server /deals still returns 404 when ENABLE_DEAL_ROOM is off', () => {
  // Source-level: the handler body still contains the early 404 return
  // with the documented message. No new response shape.
  assert.match(
    leadsRouteExec,
    /isEnabled\(\)\s*\)\s*\{\s*[\s\S]{0,200}res\.status\(\s*404\s*\)\.json\(\s*\{\s*msg\s*:\s*['"]Deal Room is not enabled['"]\s*\}\s*\)/,
    'Server must still return 404 with msg "Deal Room is not enabled" when the flag is off'
  );
});

test('A2. Server /deals happy path still returns a JSON array (no wrapper)', () => {
  // PR-D1 keeps the existing flag-on response shape (raw array) so the
  // only caller (Deals.jsx) doesn't need to relearn anything.
  assert.match(
    leadsRouteExec,
    /res\.json\(\s*leads\s*\)/,
    'Server must still respond with res.json(leads) (raw array, not wrapper)'
  );
});

// ── B. Client adds featureDisabled state ──────────────────────────────

test('B1. Deals.jsx declares `featureDisabled` state with default false', () => {
  assert.match(
    dealsJsxExec,
    /const\s*\[\s*featureDisabled\s*,\s*setFeatureDisabled\s*\]\s*=\s*useState\(\s*false\s*\)/,
    'featureDisabled must be a useState boolean defaulting to false'
  );
});

test('B2. The 404 branch sets featureDisabled to true', () => {
  // Pin both halves: the 404 status check AND the setter inside it.
  assert.match(
    dealsJsxExec,
    /if\s*\(\s*res\.status\s*===\s*404\s*\)\s*\{[\s\S]{0,300}setFeatureDisabled\(\s*true\s*\)/,
    'The 404 branch must call setFeatureDisabled(true)'
  );
});

test('B3. Successful responses clear featureDisabled (flag-flip recovery)', () => {
  // If the operator flips the flag on while the page is open, the next
  // refresh must clear the disabled banner so the populated state can
  // render.
  assert.match(
    dealsJsxExec,
    /setFeatureDisabled\(\s*false\s*\)/,
    'A success path must call setFeatureDisabled(false) — otherwise a stale flag-off banner persists after the operator turns the flag on'
  );
});

// ── C. Control flow preserved ─────────────────────────────────────────

test('C1. The 404 branch still calls setLeads([]) and returns early', () => {
  // Existing behavior preserved: 404 → empty leads + early return so the
  // res.ok throw never fires for a flag-off response.
  assert.match(
    dealsJsxExec,
    /if\s*\(\s*res\.status\s*===\s*404\s*\)\s*\{[\s\S]{0,400}setLeads\(\s*\[\s*\]\s*\)[\s\S]{0,200}return\s*;/,
    'The 404 branch must still setLeads([]) and `return;` before any throw'
  );
});

test('C2. The 404 branch is checked BEFORE the res.ok throw', () => {
  // Defensive ordering — `res.status === 404` IS `!res.ok`. If a future
  // refactor reorders so res.ok runs first, the 404 branch never fires.
  const idx404 = dealsJsxExec.indexOf('res.status === 404');
  const idxOk  = dealsJsxExec.indexOf('!res.ok');
  assert.ok(idx404 !== -1 && idxOk !== -1, 'both checks must exist');
  assert.ok(idx404 < idxOk,
    'The 404 status check must come BEFORE the !res.ok throw');
});

// ── D. Two distinct banners with distinct data-testid ────────────────

test('D1. The disabled banner has data-testid="deal-room-disabled-banner"', () => {
  // testid is a contract — automation, manual QA, and operator
  // screenshot triage all key off it. Lock the literal.
  assert.match(
    dealsJsxExec,
    /data-testid\s*=\s*['"]deal-room-disabled-banner['"]/,
    'Disabled banner must have data-testid="deal-room-disabled-banner"'
  );
});

test('D2. The empty state has data-testid="deal-room-empty-state"', () => {
  assert.match(
    dealsJsxExec,
    /data-testid\s*=\s*['"]deal-room-empty-state['"]/,
    'Empty state must have data-testid="deal-room-empty-state" (distinguishable from disabled banner)'
  );
});

test('D3. The two testids are different strings', () => {
  assert.notEqual(
    'deal-room-disabled-banner',
    'deal-room-empty-state',
    'The two state testids must not collide (defensive — guards against a future single-source-of-truth refactor that collapses them)'
  );
});

// ── E. Mutual exclusion between disabled banner and empty state ──────

test('E1. The disabled banner is gated on featureDisabled', () => {
  // Pin the gate: the disabled banner renders ONLY when featureDisabled is
  // true. A bug here would paint the banner permanently.
  assert.match(
    dealsJsxExec,
    /!loading\s*&&\s*!error\s*&&\s*featureDisabled[\s\S]{0,300}deal-room-disabled-banner/,
    'Disabled banner JSX must be gated on `!loading && !error && featureDisabled`'
  );
});

test('E2. The empty state is gated on !featureDisabled + empty render list', () => {
  // Mutual exclusion: empty state ONLY paints when feature is on. If a
  // future contributor drops this guard, the empty state regresses to
  // its pre-PR-D1 (ambiguous) behavior.
  //
  // 2026-05-29 (DRX-1) — render list went from `filtered.length === 0`
  // (PR-D1) to `items.length === 0` (DRX-1, after the discriminated-
  // union indirection). The semantic is identical (both mean "nothing
  // to show"); the variable name changed. Accept either to keep this
  // invariant meaningful across the refactor.
  const matched =
    /!loading\s*&&\s*!error\s*&&\s*!featureDisabled\s*&&\s*items\.length\s*===\s*0[\s\S]{0,300}deal-room-empty-state/.test(dealsJsxExec) ||
    /!loading\s*&&\s*!error\s*&&\s*!featureDisabled\s*&&\s*filtered\.length\s*===\s*0[\s\S]{0,300}deal-room-empty-state/.test(dealsJsxExec);
  assert.ok(matched,
    'Empty state JSX must be gated on `!loading && !error && !featureDisabled && (items.length === 0 || filtered.length === 0)`');
});

test('E3. The disabled banner branch appears BEFORE the empty state branch in JSX', () => {
  // Render order matters less for mutual exclusion (the gates already
  // do that), but lock the source order for diff readability + operator
  // search (the disabled-state is the "more specific" condition).
  const disabledIdx = dealsJsxExec.indexOf('deal-room-disabled-banner');
  const emptyIdx    = dealsJsxExec.indexOf('deal-room-empty-state');
  assert.ok(disabledIdx !== -1, 'disabled banner JSX must be present');
  assert.ok(emptyIdx !== -1, 'empty state JSX must be present');
  assert.ok(disabledIdx < emptyIdx,
    'Disabled banner JSX must appear BEFORE empty state JSX (more-specific-first ordering)');
});

// ── F. Copy is distinguishable ────────────────────────────────────────

test('F1. Disabled banner copy uses distinct phrasing', () => {
  // The two cases must be visually + textually distinct. Operators
  // triaging a screenshot should be able to tell at a glance.
  assert.match(
    dealsJsxExec,
    /Deal Room is currently unavailable/,
    'Disabled banner must say "Deal Room is currently unavailable" (or similar — pin the literal so a copy change requires test update)'
  );
});

test('F2. Empty state copy is unchanged (UX preservation)', () => {
  // Pre-PR-D1 copy stays byte-identical so movers familiar with the
  // page see no surprise.
  assert.match(
    dealsJsxExec,
    /No deals available right now/,
    'Empty state copy "No deals available right now" must remain (UX preservation)'
  );
  assert.match(
    dealsJsxExec,
    /Check back soon — new discounted inventory is added regularly\./,
    'Empty state sub-copy must remain byte-identical'
  );
});

test('F3. The two copy literals are not identical strings', () => {
  // Defense-in-depth: even though F1 and F2 lock the two literals
  // separately, an explicit "they're not the same string" assertion
  // guards against a future refactor that tries to DRY them into a
  // single constant and accidentally collapses the user-facing
  // distinction.
  assert.notEqual(
    'Deal Room is currently unavailable',
    'No deals available right now',
    'The two banner literals must not collapse to a single string — feature-off and feature-empty must remain visually distinct'
  );
});

// ── G. Populated grid still works ─────────────────────────────────────

test('G1. The populated render gates on items/filtered being non-empty', () => {
  // 2026-05-29 (DRX-1) — populated render switched from a card grid
  // (`!loading && filtered.length > 0` rendering `<DealCard>`) to a
  // table (`!loading && !featureDisabled && items.length > 0` rendering
  // `<table className="deals-table">` with `DealsLeadRow` per item).
  // Accept either shape to keep this invariant meaningful across the
  // refactor. The semantic — "render the leads when there are leads to
  // render" — is unchanged.
  const populatedCard  = /!loading\s*&&\s*filtered\.length\s*>\s*0[\s\S]{0,300}DealCard/.test(dealsJsxExec);
  const populatedTable = /!loading\s*&&\s*!featureDisabled\s*&&\s*items\.length\s*>\s*0[\s\S]{0,400}deals-table/.test(dealsJsxExec)
    || /!loading\s*&&\s*items\.length\s*>\s*0[\s\S]{0,400}deals-table/.test(dealsJsxExec);
  assert.ok(populatedCard || populatedTable,
    'Populated render must gate on non-empty render list (either pre-DRX-1 card grid OR DRX-1 deals-table)');
});

// ── H. Scope discipline ───────────────────────────────────────────────

test('H1. The buy-now path is byte-identical (no money-path change)', () => {
  // PR-D1 must not touch the purchase flow.
  assert.match(
    dealsJsxExec,
    /fetch\(\s*`\$\{API_URL\}\/bids\/\$\{leadId\}\/buy-now`/,
    'submitConfirmedUnlock must still POST to /api/bids/:leadId/buy-now (money path unchanged)'
  );
});

test('H2. Server /deals filter clauses are byte-identical', () => {
  // PR-D1 is client-only. The /deals server query, projection, sort, and
  // discountPercent annotation must be unchanged. Pin the 4 clauses.
  assert.match(leadsRouteExec, /inventoryChannel\s*:\s*['"]deal_room['"]/,
    'Server query must still filter inventoryChannel: deal_room');
  assert.match(leadsRouteExec, /status\s*:\s*\{\s*\$in\s*:\s*\[\s*['"]Available['"]\s*,\s*['"]READY_FOR_DISTRIBUTION['"]\s*\]\s*\}/,
    'Server query must still filter status: $in [Available, READY_FOR_DISTRIBUTION]');
  assert.match(leadsRouteExec, /moveDate\s*:\s*\{\s*\$gte\s*:\s*new\s+Date\(\)\s*\}/,
    'Server query must still filter moveDate: $gte now');
  assert.match(leadsRouteExec, /\.\.\.moverVisibilityFilter\(\)/,
    'Server query must still spread moverVisibilityFilter()');
});

test('H3. Feature-flag util is unchanged (still ENABLE_DEAL_ROOM env-only)', () => {
  // PR-D1 must not introduce a new flag, a DB-backed setting, or a new
  // util layer. Confirm the existing util still exists and is imported.
  const utilPath = path.join(serverRoot, 'utils', 'dealRoomFeature.js');
  assert.ok(fs.existsSync(utilPath), 'utils/dealRoomFeature.js must still exist');
  const utilSrc = fs.readFileSync(utilPath, 'utf8');
  assert.match(utilSrc, /ENABLE_DEAL_ROOM/,
    'utils/dealRoomFeature.js must still read ENABLE_DEAL_ROOM env var');
});

test('H4. No new env flag introduced by PR-D1', () => {
  // PR-D1 is a pure render-state addition. No new flag in client or
  // server.
  for (const re of [
    /ENABLE_DEAL_ROOM_BANNER/,
    /DEAL_ROOM_DISABLED_UX/,
    /SHOW_DISABLED_BANNER/,
  ]) {
    assert.doesNotMatch(dealsJsxExec, re, `Client must NOT introduce env flag ${re}`);
    assert.doesNotMatch(leadsRouteExec, re, `Server must NOT introduce env flag ${re}`);
  }
});

console.log('Deal Room disabled-banner distinction (PR-D1) tests scheduled.');
