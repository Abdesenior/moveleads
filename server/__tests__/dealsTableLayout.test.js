/**
 * Deal Room table layout (DRX-1) lock-in.
 *
 * Closes the DRX-1 fix from
 * docs/audits/deal-room-exchange-redesign/00-ux-audit-and-wireframe.md.
 *
 * Pre-DRX-1, Deals.jsx rendered a card grid (display:grid;
 * gridTemplateColumns: repeat(auto-fill, minmax(320px, 1fr))). Movers
 * had to read each card independently to compare routes + prices.
 * DRX-1 replaces the grid with a 7-column exchange-style table mirroring
 * the LeadFeed.jsx structure (Route / Size / Move date / Listed / Was /
 * Now / Action). Mobile (≤700px) collapses the table into stacked cards
 * via CSS media queries in Deals.css.
 *
 * What this suite pins:
 *
 *   A. Table renders — the wrap element exists with the documented
 *      testid, the <table className="deals-table">, the 7-column
 *      <thead>, and the discriminated-union items.map(...) render.
 *   B. Per-lead row component (DealsLeadRow) renders ALL 7 columns
 *      with the documented class names (so Deals.css can target each).
 *      Each row carries data-testid="deals-lead-row".
 *   C. PR-D1 banners + tests preserved:
 *      - data-testid="deal-room-disabled-banner" still in place
 *      - data-testid="deal-room-empty-state" still in place
 *      - both branches gated identically (mutual exclusion).
 *   D. The discriminated-union item shape is in place (future-pack-ready
 *      hook). items.map's switch on item.type === 'lead' is the
 *      extension point.
 *   E. Money path UNCHANGED:
 *      - same POST /api/bids/${leadId}/buy-now
 *      - no body sent (server-trusted price)
 *      - submitConfirmedUnlock signature unchanged
 *   F. PR-D1/D2/D3 + canonical buy-now invariants preserved:
 *      - 404 → setFeatureDisabled(true) + setLeads([])
 *      - 200 → setFeatureDisabled(false) (flag-flip recovery)
 *      - the existing UnlockConfirmModal + QualityTag rendering
 *   G. Deals.css media query exists at ≤700px and overrides
 *      `.deals-table` to block layout for mobile.
 *   H. Scope discipline — no schema, no server, no SMS Claim, no new
 *      env flags, no new fetches/routes.
 *
 * Pure-Node, no Mongo, no jsdom. Source-level assertions only.
 *
 * Run: `node server/__tests__/dealsTableLayout.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.join(__dirname, '..', '..', 'client', 'src');

const dealsJsxPath  = path.join(clientRoot, 'pages', 'dashboard', 'Deals.jsx');
const dealsCssPath  = path.join(clientRoot, 'pages', 'dashboard', 'Deals.css');

assert.ok(fs.existsSync(dealsJsxPath),  'Deals.jsx must exist');
assert.ok(fs.existsSync(dealsCssPath),  'Deals.css must exist (new file, DRX-1)');

const dealsJsxSrc = fs.readFileSync(dealsJsxPath, 'utf8');
const dealsCssSrc = fs.readFileSync(dealsCssPath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
const dealsJsxExec = stripComments(dealsJsxSrc);

// ── A. Table renders ──────────────────────────────────────────────────

test('A1. Deals.jsx imports the new Deals.css', () => {
  assert.match(
    dealsJsxSrc,
    /import\s+['"]\.\/Deals\.css['"]/,
    "Deals.jsx must import './Deals.css' (the new mobile-responsive stylesheet)"
  );
});

test('A2. The table wrap element exists with data-testid="deals-table-wrap"', () => {
  assert.match(
    dealsJsxExec,
    /data-testid\s*=\s*['"]deals-table-wrap['"]/,
    'Table wrap must carry data-testid="deals-table-wrap" for automation hooks'
  );
});

test('A3. The wrap renders a <table className="deals-table">', () => {
  assert.match(
    dealsJsxExec,
    /<table\s+className=['"]deals-table['"]>/,
    '<table className="deals-table"> must exist (anchors the CSS selectors in Deals.css)'
  );
});

test('A4. The <thead> includes all 7 documented column labels', () => {
  // Pin each column header literal so a copy refactor goes red and
  // requires explicit decision.
  //
  // 2026-05-29 (DRX-2) — sortable columns (Route, Move date, Listed,
  // Now) became <SortableTh label="..." sortKey="..." ... />. The
  // remaining columns (Size, Was, Action) stayed plain <th>. Accept
  // either shape so the label invariant survives the evolution.
  for (const label of ['Route', 'Size', 'Move date', 'Listed', 'Was', 'Now', 'Action']) {
    const plain    = new RegExp(`<th[^>]*>\\s*${label}\\s*</th>`).test(dealsJsxExec);
    const sortable = new RegExp(`<SortableTh\\s+label=['"]${label}['"]`).test(dealsJsxExec);
    assert.ok(plain || sortable,
      `Table head must include <th>${label}</th> OR <SortableTh label="${label}" .../>`);
  }
});

test('A5. items.map iterates over the items array (discriminated union)', () => {
  assert.match(
    dealsJsxExec,
    /items\.map\(\s*item\s*=>\s*\n?\s*item\.type\s*===\s*['"]lead['"]/,
    'Render path must be items.map(item => item.type === "lead" ? ... : null) — discriminated-union extension point'
  );
});

// ── B. Per-lead row component renders all 7 columns ──────────────────

test('B1. DealsLeadRow component exists and renders a <tr className="deals-row">', () => {
  // The row component is named DealsLeadRow and renders a <tr>. The
  // <tr> carries the deals-row class so the CSS mobile media query can
  // target it.
  assert.match(
    dealsJsxExec,
    /function\s+DealsLeadRow\(\s*\{[^}]*\}\s*\)\s*\{[\s\S]*?<tr\s+className=['"]deals-row['"][^>]*>/,
    'DealsLeadRow function must render a <tr className="deals-row">'
  );
});

test('B2. Each row carries data-testid="deals-lead-row"', () => {
  assert.match(
    dealsJsxExec,
    /<tr[^>]*data-testid\s*=\s*['"]deals-lead-row['"]/,
    'Lead row must carry data-testid="deals-lead-row" for behavioral tests'
  );
});

test('B3. All 7 column class names are present on <td> elements', () => {
  for (const col of ['col-route', 'col-size', 'col-date', 'col-listed', 'col-was', 'col-now', 'col-action']) {
    assert.match(
      dealsJsxExec,
      new RegExp(`<td\\s+className=['"]${col}['"]`),
      `Row must include <td className="${col}"> — anchors the column-specific CSS`
    );
  }
});

test('B4. Price discount math present: original > price → −X%', () => {
  // Discount % derived from originalPrice + buyNowPrice (server may
  // already provide discountPercent, but fallback derivation must
  // remain).
  assert.match(
    dealsJsxExec,
    /lead\.discountPercent[\s\S]{0,300}Math\.round\(\s*\(\s*1\s*-\s*price\s*\/\s*original\s*\)\s*\*\s*100\s*\)/,
    'Discount fallback math (Math.round((1 - price/original) * 100)) must remain'
  );
});

test('B5. Unlock CTA is `Unlock $${price}` with the canonical onUnlock handler', () => {
  // Pin the button copy + handler.
  assert.match(
    dealsJsxExec,
    /onClick=\{\s*\(\)\s*=>\s*onUnlock\(lead\)\s*\}/,
    'Unlock CTA must call onUnlock(lead)'
  );
  assert.match(
    dealsJsxExec,
    /Unlock\s+\$\$\{price\}/,
    'CTA label must be "Unlock $${price}"'
  );
});

// ── C. PR-D1 banners preserved ───────────────────────────────────────

test('C1. PR-D1 disabled banner data-testid preserved', () => {
  assert.match(
    dealsJsxExec,
    /data-testid\s*=\s*['"]deal-room-disabled-banner['"]/,
    'PR-D1 banner data-testid="deal-room-disabled-banner" must be preserved'
  );
});

test('C2. PR-D1 empty state data-testid preserved', () => {
  assert.match(
    dealsJsxExec,
    /data-testid\s*=\s*['"]deal-room-empty-state['"]/,
    'PR-D1 empty-state data-testid="deal-room-empty-state" must be preserved'
  );
});

test('C3. Mutual exclusion: disabled banner gated on featureDisabled, empty state on !featureDisabled', () => {
  assert.match(
    dealsJsxExec,
    /!loading\s*&&\s*!error\s*&&\s*featureDisabled[\s\S]{0,200}deal-room-disabled-banner/,
    'Disabled banner branch gated on `!loading && !error && featureDisabled`'
  );
  assert.match(
    dealsJsxExec,
    /!loading\s*&&\s*!error\s*&&\s*!featureDisabled\s*&&\s*items\.length\s*===\s*0[\s\S]{0,200}deal-room-empty-state/,
    'Empty-state branch gated on `!loading && !error && !featureDisabled && items.length === 0` — items.length replaces filtered.length now that the discriminated union is in place'
  );
});

test('C4. Disabled banner appears BEFORE the empty state in source order', () => {
  const disabledIdx = dealsJsxExec.indexOf('deal-room-disabled-banner');
  const emptyIdx    = dealsJsxExec.indexOf('deal-room-empty-state');
  assert.ok(disabledIdx !== -1 && emptyIdx !== -1);
  assert.ok(disabledIdx < emptyIdx,
    'Disabled banner branch must come before the empty-state branch (more-specific-first ordering)');
});

// ── D. Discriminated-union shape for future pack rows ────────────────

test('D1. items wraps each lead in the discriminated-union shape `{ type: "lead", lead }`', () => {
  // 2026-05-29 (DRX-2) — sort step inserted between filter and the
  // discriminated-union wrap. items is now derived from `sorted` (which
  // is filtered + sorted), not from `filtered` directly. Accept either
  // — the invariant is the union shape, not the upstream variable name.
  const fromFiltered = /filtered\.map\(\s*lead\s*=>\s*\(\s*\{\s*type:\s*['"]lead['"]\s*,\s*lead\s*\}\s*\)\s*\)/.test(dealsJsxExec);
  const fromSorted   = /sorted\.map\(\s*lead\s*=>\s*\(\s*\{\s*type:\s*['"]lead['"]\s*,\s*lead\s*\}\s*\)\s*\)/.test(dealsJsxExec);
  assert.ok(fromFiltered || fromSorted,
    'items must be (filtered|sorted).map(lead => ({ type: "lead", lead })) — discriminated union ready for future packs');
});

test('D2. items.map render path has the documented future-pack-ready hook comment', () => {
  // The comment is a load-bearing signpost for future contributors.
  assert.match(
    dealsJsxSrc,
    /Future:\s*item\.type\s*===\s*['"]pack['"]/,
    'Render path must carry the "Future: item.type === pack" comment so the extension point is obvious'
  );
});

// ── E. Money path unchanged ──────────────────────────────────────────

test('E1. submitConfirmedUnlock posts to /api/bids/:leadId/buy-now with NO body', () => {
  // Pin the canonical buy-now URL.
  assert.match(
    dealsJsxExec,
    /fetch\(\s*`\$\{API_URL\}\/bids\/\$\{leadId\}\/buy-now`\s*,\s*\{[\s\S]*?\}\s*\)/,
    'submitConfirmedUnlock must POST to `${API_URL}/bids/${leadId}/buy-now`'
  );
  // No `body:` key in the fetch options.
  const buyNowFetch = dealsJsxExec.match(
    /fetch\(\s*`\$\{API_URL\}\/bids\/\$\{leadId\}\/buy-now`\s*,\s*\{[\s\S]*?\}\s*\)/
  );
  assert.ok(buyNowFetch);
  assert.doesNotMatch(buyNowFetch[0], /\bbody\s*:/,
    'buy-now fetch must NOT include a body — price is server-trusted');
});

test('E2. submitConfirmedUnlock signature preserved', () => {
  assert.match(
    dealsJsxExec,
    /submitConfirmedUnlock\s*=\s*async\s*\(\s*\)\s*=>/,
    'submitConfirmedUnlock must remain an async () => { ... } closure'
  );
});

// ── F. Fetch + state machinery preserved ─────────────────────────────

test('F1. /api/leads/deals fetch URL unchanged', () => {
  assert.match(
    dealsJsxExec,
    /fetch\(\s*`\$\{API_URL\}\/leads\/deals`/,
    'Read endpoint must remain GET /api/leads/deals'
  );
});

test('F2. 404 branch sets featureDisabled + setLeads([])', () => {
  assert.match(
    dealsJsxExec,
    /if\s*\(\s*res\.status\s*===\s*404\s*\)\s*\{[\s\S]{0,400}setLeads\(\s*\[\s*\]\s*\)[\s\S]{0,200}setFeatureDisabled\(\s*true\s*\)/,
    '404 branch must setLeads([]) and setFeatureDisabled(true) — PR-D1 invariant'
  );
});

test('F3. 200 path clears featureDisabled (flag-flip recovery)', () => {
  // After the 404 short-circuit, the non-404 branch must call
  // setFeatureDisabled(false). Pin the line.
  assert.match(
    dealsJsxExec,
    /setFeatureDisabled\(\s*false\s*\)/,
    'Success path must clear featureDisabled — flag-flip recovery (PR-D1)'
  );
});

test('F4. UnlockConfirmModal still rendered when confirmLead is set', () => {
  assert.match(
    dealsJsxExec,
    /\{confirmLead\s*&&\s*\(\s*[\s\S]*?UnlockConfirmModal[\s\S]*?\)\s*\}/,
    'UnlockConfirmModal must still render gated on confirmLead'
  );
});

// ── G. Deals.css mobile media query ──────────────────────────────────

test('G1. Deals.css declares the `.deals-table` desktop layout', () => {
  assert.match(
    dealsCssSrc,
    /\.deals-table\s*\{[\s\S]{0,200}border-collapse\s*:\s*collapse/,
    'Deals.css must declare .deals-table with border-collapse: collapse for desktop'
  );
});

test('G2. Deals.css has a @media (max-width: 700px) block', () => {
  assert.match(
    dealsCssSrc,
    /@media\s*\(\s*max-width:\s*700px\s*\)\s*\{/,
    'Deals.css must declare the mobile breakpoint at 700px'
  );
});

test('G3. Mobile block converts table cells to block layout', () => {
  // Inside the 700px block: display: block on table | tbody | tr | td.
  // We assert presence of the documented cascade.
  assert.match(
    dealsCssSrc,
    /@media\s*\(\s*max-width:\s*700px\s*\)\s*\{[\s\S]*?\.deals-table[\s\S]*?display\s*:\s*block/,
    'Mobile block must override .deals-table display to `block` for stacked-card layout'
  );
});

test('G4. Mobile block hides the .col-listed column', () => {
  assert.match(
    dealsCssSrc,
    /@media\s*\(\s*max-width:\s*700px\s*\)\s*\{[\s\S]*?\.col-listed[\s\S]*?display\s*:\s*none/,
    'Listed column must be hidden on mobile to save space'
  );
});

test('G5. Mobile-only price block (.price-unlock-mobile) is hidden on desktop', () => {
  assert.match(
    dealsCssSrc,
    /\.price-unlock-mobile\s*\{\s*display\s*:\s*none\s*;\s*\}/,
    '.price-unlock-mobile must be hidden by default (desktop)'
  );
});

// ── H. Scope discipline ──────────────────────────────────────────────

test('H1. No new fetch URL introduced', () => {
  // Only two fetches: /leads/deals and /bids/:id/buy-now. Anything else
  // would be net-new and out of scope.
  const fetches = dealsJsxExec.match(/fetch\(\s*`\$\{API_URL\}\/[^`]+`/g) || [];
  for (const f of fetches) {
    assert.ok(
      /\/leads\/deals/.test(f) || /\/bids\/\$\{leadId\}\/buy-now/.test(f),
      `Unexpected fetch URL in Deals.jsx: ${f} — DRX-1 must NOT introduce new fetches`
    );
  }
  assert.ok(fetches.length === 2, `Expected exactly 2 fetches (deals + buy-now); found ${fetches.length}`);
});

test('H2. No SMS Claim references introduced', () => {
  for (const forbidden of [
    /openClaimWindow/,
    /claimWindow/,
    /ClaimAttempt/,
    /ENABLE_SMS_CLAIM/,
  ]) {
    assert.doesNotMatch(dealsJsxExec, forbidden,
      `Deals.jsx must NOT reference SMS Claim surface (${forbidden})`);
  }
});

test('H3. No new env flag references', () => {
  for (const re of [
    /process\.env\.ENABLE_DEAL_ROOM_TABLE/,
    /process\.env\.DEAL_ROOM_TABLE/,
    /process\.env\.ENABLE_LEAD_PACKS/,
  ]) {
    assert.doesNotMatch(dealsJsxExec, re,
      `DRX-1 must NOT introduce env flag ${re}`);
  }
});

test('H4. No backend changes — leads.js /deals handler shape pin', () => {
  // Sanity: confirm server still returns the same response shape.
  const leadsRouteSrc = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8'
  );
  assert.match(leadsRouteSrc, /router\.get\(\s*['"]\/deals['"]/,
    'GET /deals server route must remain');
  assert.match(leadsRouteSrc, /discountPercent/,
    'discountPercent server enrichment must remain');
});

console.log('Deals table layout (DRX-1) tests scheduled.');
