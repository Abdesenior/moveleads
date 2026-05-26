/**
 * Purchase-flow cleanup — Phase B lock-in tests.
 *
 * Frontend UX rewrite. Verifies via source-level assertions that:
 *   A. ConfirmPurchaseModal component exists with the spec'd surface
 *   B. LeadFeed.jsx splits the click flow into open-confirm + execute,
 *      so no Unlock click triggers an immediate POST
 *   C. All three Unlock surfaces (desktop, mobile, preview modal) route
 *      through the confirm modal — none bypass it
 *   D. executePurchase handles race-loss (400/409) gracefully — no
 *      generic error toast; shows the friendly "already purchased"
 *      copy and removes the lead from local state
 *   E. SuccessModal CTAs are renamed and the primary CTA deep-links
 *      to /dashboard/my-leads?highlight=<leadId> (query param, not hash)
 *   F. MyLeads reads ?highlight=<id> from useSearchParams and passes
 *      it down to LeadRow which auto-expands + scrolls into view
 *
 * Pure-Node, no Mongo, no jsdom. Reads JSX files as text.
 *
 * Run: `node server/__tests__/purchaseFlowPhaseB.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.join(__dirname, '..', '..', 'client', 'src');
const confirmModalSrc = fs.readFileSync(path.join(clientRoot, 'components', 'ConfirmPurchaseModal.jsx'), 'utf8');
const leadFeedSrc     = fs.readFileSync(path.join(clientRoot, 'pages', 'dashboard', 'LeadFeed.jsx'), 'utf8');
const myLeadsSrc      = fs.readFileSync(path.join(clientRoot, 'pages', 'dashboard', 'MyLeads.jsx'), 'utf8');

// ── A. ConfirmPurchaseModal component ────────────────────────────────────

test('A1. ConfirmPurchaseModal is a default-exported function component', () => {
  assert.match(
    confirmModalSrc,
    /export\s+default\s+function\s+ConfirmPurchaseModal\s*\(/,
    'ConfirmPurchaseModal must be default-exported function'
  );
});

test('A2. ConfirmPurchaseModal accepts the spec props', () => {
  // Required props per operator's spec:
  //   lead, balance, onConfirm, onCancel, isProcessing, error, errorKind
  for (const prop of ['lead', 'balance', 'onConfirm', 'onCancel', 'isProcessing', 'error', 'errorKind']) {
    assert.match(
      confirmModalSrc,
      new RegExp(`\\b${prop}\\b`),
      `ConfirmPurchaseModal must reference \`${prop}\` (prop spec)`
    );
  }
});

test('A3. ConfirmPurchaseModal renders route + price + balance + balance-after + warning', () => {
  // Required UX surface per operator spec
  assert.match(confirmModalSrc, /Route/,             'must label Route');
  assert.match(confirmModalSrc, /Lead price/,        'must label Lead price');
  assert.match(confirmModalSrc, /Your balance/,      'must label Your balance');
  assert.match(confirmModalSrc, /After purchase/,    'must show balance-after');
  assert.match(confirmModalSrc, /deduct/i,           'must warn about deduction');
});

test('A4. Confirm + Cancel buttons present', () => {
  assert.match(confirmModalSrc, /Confirm purchase/, 'Confirm button label');
  // JSX whitespace tolerant — Cancel appears between tags with newlines + indent
  assert.match(confirmModalSrc, />\s*Cancel\s*</,   'Cancel button label');
});

test('A5. Insufficient-balance state disables Confirm + shows Add Funds CTA', () => {
  assert.match(confirmModalSrc, /\binsufficient\b/i, 'must compute insufficient flag');
  assert.match(confirmModalSrc, /Add funds/i,         'must show Add Funds path');
  // No generic browser confirm()
  assert.ok(!/window\.confirm\(/.test(confirmModalSrc),
    'ConfirmPurchaseModal must not use the native browser confirm()');
});

test('A6. Race-loss path has friendly copy (not generic error)', () => {
  // errorKind === 'race' triggers the "Lead was just purchased" banner.
  assert.match(confirmModalSrc, /raceLost/,                   'must check errorKind=race');
  assert.match(confirmModalSrc, /just purchased/i,            'must show friendly copy');
  assert.match(confirmModalSrc, /balance was not charged/i,   'must reassure user about charges');
});

// ── B. LeadFeed.jsx — split flow (open-confirm vs execute) ──────────────

test('B1. LeadFeed imports ConfirmPurchaseModal', () => {
  assert.match(
    leadFeedSrc,
    /from\s+['"]\.\.\/\.\.\/components\/ConfirmPurchaseModal['"]/,
    'LeadFeed must import the new modal component'
  );
});

test('B2. LeadFeed has openPurchaseConfirm + executePurchase as separate functions', () => {
  assert.match(leadFeedSrc, /const\s+openPurchaseConfirm\s*=/,
    'openPurchaseConfirm setter must exist');
  assert.match(leadFeedSrc, /const\s+executePurchase\s*=\s*async/,
    'executePurchase must be a separate async function');
});

test('B3. openPurchaseConfirm does NOT fire a POST — only opens the modal', () => {
  // Lift the function body and ensure it doesn't contain a fetch call.
  // The function spans from `const openPurchaseConfirm` to the matching
  // closing brace (single-line arrow-with-body form, multi-line possible).
  const start = leadFeedSrc.indexOf('const openPurchaseConfirm');
  assert.ok(start > -1, 'openPurchaseConfirm must exist');
  // Slice forward to the next `const cancelPurchaseConfirm` (or fallback)
  const end = leadFeedSrc.indexOf('const cancelPurchaseConfirm', start);
  assert.ok(end > start, 'cancelPurchaseConfirm must appear after openPurchaseConfirm');
  const body = leadFeedSrc.slice(start, end);
  assert.ok(!/fetch\s*\(/.test(body),
    'openPurchaseConfirm must not call fetch — confirmation step only');
});

test('B4. executePurchase reads confirmLead, posts to the right endpoint, never to /buy-now hardcoded', () => {
  assert.match(leadFeedSrc, /const\s+lead\s*=\s*confirmLead/,
    'executePurchase must read confirmLead state');
  assert.match(leadFeedSrc, /\/bids\/\$\{id\}\/buy-now/,
    'executePurchase must support /bids/:id/buy-now path');
  assert.match(leadFeedSrc, /\/leads\/\$\{id\}\/claim/,
    'executePurchase must support /leads/:id/claim path for legacy auction-status leads');
});

test('B5. ConfirmPurchaseModal is rendered conditionally on confirmLead', () => {
  assert.match(
    leadFeedSrc,
    /\{confirmLead\s*&&\s*\(\s*<ConfirmPurchaseModal/,
    'LeadFeed must render <ConfirmPurchaseModal> gated on confirmLead'
  );
});

// ── C. All 3 Unlock surfaces route through confirm modal ─────────────────

test('C1. handleBuyNow + handleClaim aliased to openPurchaseConfirm', () => {
  // Belt-and-suspenders for any legacy callsite. Every Unlock surface
  // must route through the confirm modal, never trigger an immediate POST.
  assert.match(leadFeedSrc, /const\s+handleBuyNow\s*=\s*openPurchaseConfirm/);
  assert.match(leadFeedSrc, /const\s+handleClaim\s*=\s*openPurchaseConfirm/);
});

test('C2. No JSX onClick triggers fetch directly anymore', () => {
  // No remaining onClick that hits fetch in the body. Direct fetch() in
  // an onClick would be a bypass of the confirm modal.
  const inlineFetchInClick =
    /onClick=\{[^}]*fetch\s*\(/;
  assert.doesNotMatch(
    leadFeedSrc, inlineFetchInClick,
    'No onClick handler may call fetch directly — must route through openPurchaseConfirm'
  );
});

// ── D. Race-loss handling ────────────────────────────────────────────────

test('D1. executePurchase detects race-loss on 400/409 + sets errorKind="race"', () => {
  // The race detection logic checks status codes AND message content.
  assert.match(leadFeedSrc, /res\.status\s*===\s*400/);
  assert.match(leadFeedSrc, /res\.status\s*===\s*409/);
  assert.match(leadFeedSrc, /setConfirmErrorKind\(['"]race['"]\)/,
    'race-loss branch must set errorKind to "race"');
  assert.match(leadFeedSrc, /no longer available|already.*(claimed|purchased|owned)/i,
    'race detection must match the server message variants');
});

test('D2. Race-loss removes the lead from local state', () => {
  // Even though the user lost the race, the lead is gone from the
  // marketplace — drop it from the local feed so they don't see a
  // dead-end Unlock button.
  assert.match(
    leadFeedSrc,
    /isRace[\s\S]*?setLeads\(\s*prev\s*=>\s*prev\.filter/,
    'race-loss branch must filter the lead out of local leads state'
  );
});

test('D3. Generic error keeps the modal open with the server message', () => {
  // Operator spec: "no generic error toast; modal stays open until the
  // user dismisses, since the user needs to read why."
  assert.match(leadFeedSrc, /setConfirmError\(/,
    'must set confirmError to surface server messages inside the modal');
});

// ── E. SuccessModal renamed + deep-link ──────────────────────────────────

test('E1. SuccessModal heading + CTAs match operator spec', () => {
  assert.match(leadFeedSrc, /Lead purchased successfully/,
    'success heading must read "Lead purchased successfully"');
  assert.match(leadFeedSrc, />\s*View lead details\s*</,
    'primary CTA must be "View lead details"');
  assert.match(leadFeedSrc, />\s*Keep browsing leads\s*</,
    'secondary CTA must be "Keep browsing leads"');
  // Old labels gone
  assert.ok(!/>\s*Go to My Customers\s*</.test(leadFeedSrc),
    'old "Go to My Customers" CTA must be removed');
  assert.ok(!/>\s*Continue Feeding\s*</.test(leadFeedSrc),
    'old "Continue Feeding" CTA must be removed');
});

test('E2. Primary CTA navigates to /dashboard/my-leads?highlight=<leadId>', () => {
  // Query param, not hash, per operator spec.
  assert.match(
    leadFeedSrc,
    /\/dashboard\/my-leads\?highlight=\$\{leadId\}/,
    'View-lead-details CTA must deep-link via ?highlight= query param'
  );
  assert.ok(!/\/dashboard\/my-leads#/.test(leadFeedSrc),
    'must use query param (not hash) for the deep-link');
});

// ── F. MyLeads picks up ?highlight= and wires LeadRow ────────────────────

test('F1. MyLeads imports useSearchParams + uses it', () => {
  assert.match(myLeadsSrc, /from\s+['"]react-router-dom['"]/);
  assert.match(myLeadsSrc, /useSearchParams/);
  assert.match(myLeadsSrc, /searchParams\.get\(['"]highlight['"]\)/);
});

test('F2. LeadRow accepts a highlight prop and uses it to auto-expand + scroll', () => {
  // highlight prop is forwarded
  assert.match(
    myLeadsSrc,
    /highlight=\{\s*!!highlightLeadId/,
    'LeadRow must receive highlight={...} from MyLeads'
  );
  // useState seeds expanded from highlight
  assert.match(
    myLeadsSrc,
    /useState\(highlight\)/,
    'expanded state must initialize from the highlight prop'
  );
  // useEffect calls scrollIntoView
  assert.match(myLeadsSrc, /scrollIntoView/,
    'highlighted row must scroll into view');
});

test('F3. Highlight match is by lead._id (string-compared)', () => {
  // Defensive equality: String(purchase.lead._id) === String(highlightLeadId)
  // covers Mongo ObjectId vs serialized-string mismatches.
  assert.match(
    myLeadsSrc,
    /String\(purchase\.lead\._id\)\s*===\s*String\(highlightLeadId\)/,
    'highlight match must compare stringified ids'
  );
});

console.log('\nPurchase-flow Phase B lock-in tests scheduled.');
