/**
 * Deal Room filter bar + sort affordances (DRX-2) lock-in.
 *
 * Closes DRX-2 from
 * docs/audits/deal-room-exchange-redesign/00-ux-audit-and-wireframe.md.
 *
 * Pre-DRX-2 the Deal Room page had only a free-text search input over
 * city / state / ZIP / home size. Movers had no way to:
 *   - filter by Distance (Local vs Long Distance)
 *   - filter by minimum Discount %
 *   - filter by Move date (this week / month / next month)
 *   - sort by anything other than server's default updatedAt desc
 *
 * DRX-2 adds three native <select> dropdowns next to the search input
 * + makes four column headers clickable for client-side sort. All
 * filtering + sorting is CLIENT-SIDE over the already-fetched list —
 * no server query change.
 *
 * What this suite pins:
 *
 *   A. Filter state vars exist with non-destructive defaults
 *      (distanceFilter='all', discountFilter=0, moveDateFilter='all'),
 *      so first paint is identical to DRX-1.
 *   B. Filter dropdowns rendered with `deals-filter-distance` /
 *      `deals-filter-discount` / `deals-filter-moveDate` testids and
 *      the documented option sets.
 *   C. `filtered` useMemo applies all four filters (search + 3
 *      dropdowns) in one pass, and depends on every input via
 *      useMemo deps.
 *   D. Filter logic correctness — Distance matches startsWith 'local'
 *      / 'long' (handles legacy 'long_distance'); Discount uses
 *      server `discountPercent` with client fallback; Move date
 *      bucketing uses Date arithmetic with future-bucket boundaries.
 *   E. Sort state — sortKey='listed', sortDir='desc' defaults match
 *      server's updatedAt desc. `sorted` useMemo applies after
 *      filtering.
 *   F. SortableTh component renders 4 clickable headers (Route, Move
 *      date, Listed, Now) with `deals-sort-<key>` testids; chevron
 *      indicator on the active column; aria-sort attribute reflects
 *      direction.
 *   G. onSort: click same column → toggle dir; click new column →
 *      set + default desc.
 *   H. Result-count line: renders only when at least one filter is
 *      active; shows filtered / total and "X filtered out".
 *   I. PR-D1/DRX-1 invariants preserved:
 *      - data-testid="deal-room-disabled-banner"
 *      - data-testid="deal-room-empty-state"
 *      - data-testid="deals-table-wrap"
 *      - data-testid="deals-lead-row"
 *      - data-testid="deals-search-input"
 *      - canonical buy-now route unchanged
 *      - server /api/leads/deals query unchanged
 *   J. Scope discipline — no schema changes, no server-route changes,
 *      no SMS Claim changes, no new env flags, no new fetches.
 *
 * Pure-Node, no Mongo, no jsdom. Source-level assertions only.
 *
 * Run: `node server/__tests__/dealsFiltersAndSort.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dealsJsxPath = path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'dashboard', 'Deals.jsx');
const dealsJsxSrc  = fs.readFileSync(dealsJsxPath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
const dealsJsxExec = stripComments(dealsJsxSrc);

// ── A. Filter + sort state vars ──────────────────────────────────────

test('A1. distanceFilter state with non-destructive default "all"', () => {
  assert.match(
    dealsJsxExec,
    /const\s*\[\s*distanceFilter\s*,\s*setDistanceFilter\s*\]\s*=\s*useState\(\s*['"]all['"]\s*\)/,
    'distanceFilter must default to "all" (non-destructive — first paint matches DRX-1)'
  );
});

test('A2. discountFilter state with non-destructive default 0', () => {
  assert.match(
    dealsJsxExec,
    /const\s*\[\s*discountFilter\s*,\s*setDiscountFilter\s*\]\s*=\s*useState\(\s*0\s*\)/,
    'discountFilter must default to 0 (no minimum — non-destructive)'
  );
});

test('A3. moveDateFilter state with non-destructive default "all"', () => {
  assert.match(
    dealsJsxExec,
    /const\s*\[\s*moveDateFilter\s*,\s*setMoveDateFilter\s*\]\s*=\s*useState\(\s*['"]all['"]\s*\)/,
    'moveDateFilter must default to "all"'
  );
});

test('A4. sortKey defaults to "listed" (matches server updatedAt desc default)', () => {
  assert.match(
    dealsJsxExec,
    /const\s*\[\s*sortKey\s*,\s*setSortKey\s*\]\s*=\s*useState\(\s*['"]listed['"]\s*\)/,
    'sortKey default must be "listed" — matches server first-paint order'
  );
});

test('A5. sortDir defaults to "desc"', () => {
  assert.match(
    dealsJsxExec,
    /const\s*\[\s*sortDir\s*,\s*setSortDir\s*\]\s*=\s*useState\(\s*['"]desc['"]\s*\)/,
    'sortDir default must be "desc"'
  );
});

// ── B. Filter dropdowns rendered with documented testids + options ──

test('B1. FilterSelect for distance with deals-filter-distance testid + 3 options', () => {
  assert.match(
    dealsJsxExec,
    /<FilterSelect\s+kind=['"]distance['"][\s\S]{0,400}\[\s*['"]all['"]\s*,\s*['"]All distances['"]\s*\][\s\S]{0,200}\[\s*['"]local['"]\s*,\s*['"]Local['"]\s*\][\s\S]{0,200}\[\s*['"]long['"]\s*,\s*['"]Long Distance['"]\s*\]/,
    'Distance filter must render with options All distances / Local / Long Distance'
  );
});

test('B2. FilterSelect for discount with 4 options (0 / 25 / 40 / 60)', () => {
  assert.match(
    dealsJsxExec,
    /<FilterSelect\s+kind=['"]discount['"][\s\S]{0,600}['"]0['"][\s\S]{0,100}['"]25['"][\s\S]{0,100}['"]40['"][\s\S]{0,100}['"]60['"]/,
    'Discount filter must render with options 0 / 25 / 40 / 60'
  );
});

test('B3. FilterSelect for moveDate with 4 buckets', () => {
  assert.match(
    dealsJsxExec,
    /<FilterSelect\s+kind=['"]moveDate['"][\s\S]{0,800}['"]all['"][\s\S]{0,200}['"]this_week['"][\s\S]{0,200}['"]this_month['"][\s\S]{0,200}['"]next_month['"]/,
    'Move date filter must render with options all / this_week / this_month / next_month'
  );
});

test('B4. FilterSelect component writes data-testid=`deals-filter-${kind}`', () => {
  assert.match(
    dealsJsxExec,
    /data-testid=\{\s*`deals-filter-\$\{kind\}`\s*\}/,
    'FilterSelect must emit data-testid=`deals-filter-${kind}` for behavioral hooks'
  );
});

test('B5. FilterSelect renders a native <select> (a11y + mobile)', () => {
  // Pin the implementation as native select to avoid custom-dropdown
  // accessibility regressions.
  assert.match(
    dealsJsxExec,
    /function\s+FilterSelect\(\s*\{[^}]*\}\s*\)\s*\{[\s\S]{0,500}<select/,
    'FilterSelect must render a native <select>'
  );
});

// ── C. `filtered` useMemo composes all 4 inputs ─────────────────────

test('C1. filtered useMemo dependency array includes leads + search + 3 filters', () => {
  assert.match(
    dealsJsxExec,
    /useMemo\(\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[\s*leads\s*,\s*search\s*,\s*distanceFilter\s*,\s*discountFilter\s*,\s*moveDateFilter\s*\]\s*\)/,
    'filtered useMemo deps must be [leads, search, distanceFilter, discountFilter, moveDateFilter]'
  );
});

test('C2. Single-pass filter loop (one .filter() call covering all filters)', () => {
  // Performance + readability: each lead is visited once. The filter
  // body conditions are short-circuited (returns false fast on first
  // failing gate).
  assert.match(
    dealsJsxExec,
    /leads\.filter\(\s*l\s*=>\s*\{/,
    'Filtering must be a single-pass leads.filter(l => { ... return true })'
  );
});

// ── D. Filter logic correctness ──────────────────────────────────────

test('D1. Distance filter matches startsWith on canonical Lead.distance string', () => {
  assert.match(
    dealsJsxExec,
    /distanceFilter\s*===\s*['"]local['"][\s\S]{0,200}startsWith\(\s*['"]local['"]\s*\)/,
    'Distance "local" must match by startsWith on lowercased lead.distance'
  );
  // Long Distance accepts both 'long' prefix AND 'long distance' substring
  // for legacy / underscore-form leads.
  assert.match(
    dealsJsxExec,
    /distanceFilter\s*===\s*['"]long['"][\s\S]{0,300}startsWith\(\s*['"]long['"]\s*\)[\s\S]{0,100}includes\(\s*['"]long distance['"]\s*\)/,
    'Distance "long" must accept startsWith "long" OR includes "long distance" (legacy back-compat)'
  );
});

test('D2. Discount filter uses server discountPercent with client fallback', () => {
  // The Lead.discountPercent server enrichment from /api/leads/deals is
  // preferred. Fallback derives from originalPrice + buyNowPrice. Pin
  // both halves.
  assert.match(
    dealsJsxExec,
    /Number\.isFinite\(\s*Number\(\s*l\.discountPercent\s*\)\s*\)/,
    'Discount filter must check Number.isFinite(Number(l.discountPercent)) for server-enriched value'
  );
  assert.match(
    dealsJsxExec,
    /orig\s*>\s*0\s*&&\s*price\s*<\s*orig[\s\S]{0,200}Math\.round\(\s*\(\s*1\s*-\s*price\s*\/\s*orig\s*\)\s*\*\s*100\s*\)/,
    'Discount filter fallback must derive percent client-side when server didn\'t enrich'
  );
});

test('D3. Move date bucketing handles "this_week", "this_month", "next_month"', () => {
  for (const bucket of ['this_week', 'this_month', 'next_month']) {
    assert.match(
      dealsJsxExec,
      new RegExp(`moveDateFilter\\s*===\\s*['"]${bucket}['"]`),
      `Move date filter must handle "${bucket}" bucket`
    );
  }
});

test('D4. Move date "this_week" uses 7-day window from startOfDay', () => {
  assert.match(
    dealsJsxExec,
    /endOfWeek\s*=\s*new\s+Date\(\s*startOfDay\.getTime\(\)\s*\+\s*7\s*\*\s*86400000\s*\)/,
    'this_week window must be startOfDay → startOfDay + 7 days'
  );
});

test('D5. Move date "next_month" uses start-of-month-after-this-month math', () => {
  assert.match(
    dealsJsxExec,
    /startOfNextMonth\s*=\s*new\s+Date\(\s*now\.getFullYear\(\)\s*,\s*now\.getMonth\(\)\s*\+\s*1\s*,\s*1\s*\)/,
    'next_month start must be (currentYear, currentMonth+1, 1)'
  );
  assert.match(
    dealsJsxExec,
    /startOfMonthAfter\s*=\s*new\s+Date\(\s*now\.getFullYear\(\)\s*,\s*now\.getMonth\(\)\s*\+\s*2\s*,\s*1\s*\)/,
    'next_month end must be (currentYear, currentMonth+2, 1)'
  );
});

// ── E. Sort step applies after filter; default matches server ───────

test('E1. `sorted` useMemo runs over filtered + sortKey + sortDir', () => {
  assert.match(
    dealsJsxExec,
    /const\s+sorted\s*=\s*useMemo\(\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[\s*filtered\s*,\s*sortKey\s*,\s*sortDir\s*\]\s*\)/,
    'sorted useMemo deps must be [filtered, sortKey, sortDir]'
  );
});

test('E2. items is derived from sorted, not from filtered directly', () => {
  // Sorting must apply before the discriminated-union wrap so the
  // render order respects sort.
  assert.match(
    dealsJsxExec,
    /const\s+items\s*=\s*useMemo\(\s*\(\)\s*=>\s*sorted\.map\(/,
    'items must be derived from sorted, not from filtered — otherwise sort changes do not affect render order'
  );
});

test('E3. Sort comparator handles all 4 sortable keys', () => {
  for (const key of ['route', 'move_date', 'listed', 'now']) {
    assert.match(
      dealsJsxExec,
      new RegExp(`case\\s+['"]${key}['"]`),
      `Sort comparator must handle case '${key}'`
    );
  }
});

test('E4. Move date sort sinks missing dates to bottom in desc (uses Number.MAX_SAFE_INTEGER fallback)', () => {
  // Locked because a missing-moveDate lead at the top of the list
  // would be confusing.
  assert.match(
    dealsJsxExec,
    /a\.moveDate\s*\?\s*new\s+Date\(\s*a\.moveDate\s*\)\.getTime\(\)\s*:\s*Number\.MAX_SAFE_INTEGER/,
    'Move date sort fallback must be Number.MAX_SAFE_INTEGER for missing dates'
  );
});

// ── F. SortableTh + chevron + a11y ──────────────────────────────────

test('F1. SortableTh component exists', () => {
  assert.match(
    dealsJsxExec,
    /function\s+SortableTh\(\s*\{[\s\S]{0,200}label\s*,\s*sortKey\s*,\s*active\s*,\s*dir\s*,\s*onSort/,
    'SortableTh function signature must accept { label, sortKey, active, dir, onSort }'
  );
});

test('F2. SortableTh emits data-testid=`deals-sort-${sortKey}`', () => {
  assert.match(
    dealsJsxExec,
    /data-testid=\{\s*`deals-sort-\$\{sortKey\}`\s*\}/,
    'SortableTh must emit data-testid=`deals-sort-${sortKey}`'
  );
});

test('F3. SortableTh renders chevron only on active column', () => {
  // The chevron renders only when isActive === true. Pin the gate.
  assert.match(
    dealsJsxExec,
    /const\s+isActive\s*=\s*active\s*===\s*sortKey[\s\S]{0,200}Chevron\s*=\s*isActive\s*\?/,
    'Chevron icon must be gated on isActive (active === sortKey)'
  );
});

test('F4. SortableTh sets aria-sort attribute (a11y)', () => {
  assert.match(
    dealsJsxExec,
    /aria-sort=\{[\s\S]{0,200}isActive[\s\S]{0,80}ascending[\s\S]{0,80}descending[\s\S]{0,40}none/,
    'SortableTh must set aria-sort to ascending / descending / none for screen readers'
  );
});

test('F5. Table renders 4 SortableTh — Route, Move date, Listed, Now', () => {
  for (const label of ['Route', 'Move date', 'Listed', 'Now']) {
    assert.match(
      dealsJsxExec,
      new RegExp(`<SortableTh\\s+label=['"]${label}['"]`),
      `Table head must render <SortableTh label="${label}" .../>`
    );
  }
});

test('F6. Size / Was / Action remain plain <th> (not sortable by design)', () => {
  // These columns have no defensible sort interpretation.
  for (const label of ['Size', 'Was']) {
    assert.match(
      dealsJsxExec,
      new RegExp(`<th>${label}</th>`),
      `${label} column must remain a plain non-sortable <th>`
    );
  }
});

// ── G. onSort handler toggles direction or sets new key ─────────────

test('G1. onSort toggles direction when clicking the same key', () => {
  // Same key → flip asc/desc.
  assert.match(
    dealsJsxExec,
    /if\s*\(\s*prevKey\s*===\s*key\s*\)\s*\{[\s\S]{0,200}setSortDir\(\s*d\s*=>\s*d\s*===\s*['"]asc['"]\s*\?\s*['"]desc['"]\s*:\s*['"]asc['"]\s*\)/,
    'onSort same-key path must toggle direction asc ↔ desc'
  );
});

test('G2. onSort defaults to desc when clicking a new key', () => {
  assert.match(
    dealsJsxExec,
    /setSortDir\(\s*['"]desc['"]\s*\)[\s\S]{0,100}return\s+key/,
    'onSort new-key path must reset direction to desc'
  );
});

// ── H. Result-count line ─────────────────────────────────────────────

test('H1. Result-count line has data-testid="deals-result-count"', () => {
  assert.match(
    dealsJsxExec,
    /data-testid\s*=\s*['"]deals-result-count['"]/,
    'Result-count line must have data-testid="deals-result-count"'
  );
});

test('H2. Result-count renders only when at least one filter is active', () => {
  // Quiet at default — no chrome when there are no filters.
  assert.match(
    dealsJsxExec,
    /isFiltering\s*=\s*search\.length\s*>\s*0\s*\|\|\s*distanceFilter\s*!==\s*['"]all['"]\s*\|\|\s*discountFilter\s*>\s*0\s*\|\|\s*moveDateFilter\s*!==\s*['"]all['"]/,
    'isFiltering must be the OR of (text search active) || (any dropdown not at default)'
  );
  assert.match(
    dealsJsxExec,
    /!loading\s*&&\s*!error\s*&&\s*!featureDisabled\s*&&\s*isFiltering[\s\S]{0,200}deals-result-count/,
    'Result-count must be gated on (!loading && !error && !featureDisabled && isFiltering)'
  );
});

test('H3. Result-count shows "X of Y deals" + "Z filtered out"', () => {
  assert.match(
    dealsJsxExec,
    /Showing\s+\{filteredCount\}\s+of\s+\{totalCount\}/,
    'Result-count must show "Showing {filteredCount} of {totalCount}"'
  );
  assert.match(
    dealsJsxExec,
    /\{totalCount\s*-\s*filteredCount\}\s*filtered out/,
    'Result-count must include "{N} filtered out" when some leads were excluded'
  );
});

// ── I. PR-D1 / DRX-1 invariants preserved ──────────────────────────

test('I1. PR-D1 banners preserved', () => {
  assert.match(dealsJsxExec, /data-testid\s*=\s*['"]deal-room-disabled-banner['"]/,
    'PR-D1 disabled banner data-testid preserved');
  assert.match(dealsJsxExec, /data-testid\s*=\s*['"]deal-room-empty-state['"]/,
    'PR-D1 empty state data-testid preserved');
});

test('I2. DRX-1 table testids preserved', () => {
  assert.match(dealsJsxExec, /data-testid\s*=\s*['"]deals-table-wrap['"]/,
    'deals-table-wrap testid preserved');
  assert.match(dealsJsxExec, /data-testid\s*=\s*['"]deals-lead-row['"]/,
    'deals-lead-row testid preserved');
});

test('I3. Search input gets data-testid="deals-search-input"', () => {
  assert.match(
    dealsJsxExec,
    /data-testid\s*=\s*['"]deals-search-input['"]/,
    'Search input must have data-testid="deals-search-input"'
  );
});

test('I4. Canonical buy-now route unchanged', () => {
  assert.match(
    dealsJsxExec,
    /fetch\(\s*`\$\{API_URL\}\/bids\/\$\{leadId\}\/buy-now`/,
    'buy-now POST URL must remain unchanged'
  );
});

test('I5. Server /api/leads/deals query unchanged (source pin)', () => {
  const leadsRouteSrc = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8'
  );
  assert.match(leadsRouteSrc, /router\.get\(\s*['"]\/deals['"]/,
    'GET /deals server route must remain');
});

// ── J. Scope discipline ─────────────────────────────────────────────

test('J1. No new fetch URLs introduced', () => {
  const fetches = dealsJsxExec.match(/fetch\(\s*`\$\{API_URL\}\/[^`]+`/g) || [];
  for (const f of fetches) {
    assert.ok(
      /\/leads\/deals/.test(f) || /\/bids\/\$\{leadId\}\/buy-now/.test(f),
      `Unexpected fetch URL in Deals.jsx: ${f}`
    );
  }
  assert.ok(fetches.length === 2,
    `Expected exactly 2 fetches (deals + buy-now); found ${fetches.length}`);
});

test('J2. No SMS Claim references', () => {
  for (const forbidden of [/openClaimWindow/, /claimWindow/, /ClaimAttempt/, /ENABLE_SMS_CLAIM/]) {
    assert.doesNotMatch(dealsJsxExec, forbidden,
      `Deals.jsx must NOT reference SMS Claim surface (${forbidden})`);
  }
});

test('J3. No new env flag references', () => {
  for (const re of [
    /process\.env\.ENABLE_DEAL_ROOM_FILTERS/,
    /process\.env\.DEAL_ROOM_SORT/,
    /process\.env\.ENABLE_LEAD_PACKS/,
  ]) {
    assert.doesNotMatch(dealsJsxExec, re,
      `DRX-2 must NOT introduce env flag ${re}`);
  }
});

test('J4. No backend or schema-touching references', () => {
  for (const forbidden of [
    /Lead\.updateOne/,
    /inventoryChannel\s*=/,
    /distributionDecision\s*=/,
  ]) {
    assert.doesNotMatch(dealsJsxExec, forbidden,
      `DRX-2 must NOT contain ${forbidden} — client filter/sort only`);
  }
});

console.log('Deals filter bar + sort (DRX-2) tests scheduled.');
