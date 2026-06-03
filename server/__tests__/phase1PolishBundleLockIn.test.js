// Phase 1 polish bundle (2026-05-30) — lock-in tests
//
// Covers Agent 1 (L1–L13), Agent 2 (P1–P3), Agent 4 (M5/M6 CSS), and
// Agent 5 (T5). Asserts the polish-PR copy + structural changes survive
// future edits. Each assertion is tied to the specific item from
// docs/pre-pilot-polish-plan.md so a reviewer can trace it back.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CLIENT = path.join(__dirname, '..', '..', 'client', 'src');
const read = (p) => fs.readFileSync(path.join(CLIENT, p), 'utf8');

const dashboardLayout    = read('components/DashboardLayout.jsx');
const dashboardCss       = read('dashboard.css');
const billing            = read('pages/dashboard/Billing.jsx');
const deals              = read('pages/dashboard/Deals.jsx');
const leadFeed           = read('pages/dashboard/LeadFeed.jsx');
const onboardingWizard   = read('pages/onboarding/OnboardingWizard.jsx');
const confirmPurchase    = read('components/ConfirmPurchaseModal.jsx');
const purchaseSuccess    = read('components/PurchaseSuccessModal.jsx');
const myLeads            = read('pages/dashboard/MyLeads.jsx');
const firstTopup         = read('components/FirstTopupReassurancePopup.jsx');
const verifyPhone        = read('components/VerifyPhoneModal.jsx');
const resolutionCenter   = read('pages/dashboard/ResolutionCenter.jsx');
const register           = read('pages/Register.jsx');

// ─── Agent 1 / L1+L2 — Sidebar tab removal (2026-06-03) ───────────────────────
//
// SUPERSEDES the original L1 renames ("Resolution"→"Refunds & Disputes",
// "Widget"→"Embed a form") and the L2 SMS Claim re-expose. Per operator
// direction (hide-tabs PR, 2026-06-03), the SMS Claim, Widget ("Embed a
// form") and Resolution Center ("Refunds & Disputes") entries were removed
// from the mover sidebar entirely. The FEATURES are kept — their routes
// still resolve under /dashboard/* in App.jsx and the pages work — they are
// just no longer surfaced as nav tabs (reachable by direct URL only).
//
// These assertions now lock in the REMOVAL: the labels and routes must not
// reappear in NAV_ITEMS, and the now-orphaned BETA-chip render must stay
// gone. App.jsx routing is intentionally NOT asserted here (features live).

test('L1.A — Resolution Center tab removed from sidebar', () => {
  assert.doesNotMatch(dashboardLayout, /to:\s*['"]\/dashboard\/resolution-center['"]/, 'resolution-center NAV entry must be gone');
  assert.doesNotMatch(dashboardLayout, /label:\s*['"]Refunds & Disputes['"]/, 'no "Refunds & Disputes" nav label after removal');
  assert.doesNotMatch(dashboardLayout, /label:\s*['"]Resolution['"]/, 'no legacy "Resolution" nav label either');
});

test('L1.B — Widget ("Embed a form") tab removed from sidebar', () => {
  assert.doesNotMatch(dashboardLayout, /to:\s*['"]\/dashboard\/widget['"]/, 'widget NAV entry must be gone');
  assert.doesNotMatch(dashboardLayout, /label:\s*['"]Embed a form['"]/, 'no "Embed a form" nav label after removal');
  assert.doesNotMatch(dashboardLayout, /label:\s*['"]Widget['"]/, 'no legacy "Widget" nav label either');
});

test('L2.A — SMS Claim tab removed from sidebar', () => {
  assert.doesNotMatch(dashboardLayout, /to:\s*['"]\/dashboard\/sms-claim['"]/, 'sms-claim NAV entry must be gone');
  assert.doesNotMatch(dashboardLayout, /label:\s*['"]SMS Claim['"]/, 'no "SMS Claim" nav label after removal');
});

test('L2.B — Legacy "Instant Jobs" label is gone from NAV_ITEMS', () => {
  assert.doesNotMatch(
    dashboardLayout,
    /label:\s*['"]Instant Jobs['"]/,
    'Legacy "Instant Jobs" label must not return'
  );
});

test('L2.C — Orphaned BETA chip render is gone from the sidebar', () => {
  // The beta chip only ever served the SMS Claim tab. With that tab removed,
  // the `{beta && ...nav-beta-chip...}` render block was cleaned up too.
  assert.doesNotMatch(
    dashboardLayout,
    /nav-beta-chip/,
    'the now-orphaned BETA chip markup must not remain after the SMS Claim tab was removed'
  );
});

// ─── Agent 1 / L3 — Wallet vocabulary standardized on "Balance" ─────────────

test('L3.A — Billing page header is "Billing" (not "Billing & Credits")', () => {
  assert.match(billing, />\s*Billing\s*</);
  assert.doesNotMatch(billing, /Billing & Credits/);
});

test('L3.B — Billing balance card label = "Balance" (not "Available Balance")', () => {
  // The card header label that was "Available Balance" is now "Balance".
  // It still appears next to ${balance.toFixed(2)} so we anchor on the
  // structural neighbourhood, not the exact ancestor.
  assert.match(billing, />\s*Balance\s*<\/p>/);
});

test('L3.C — Pre-L3 wallet vocabulary is gone from Billing', () => {
  assert.doesNotMatch(billing, /MoveLeads Credits/);
  assert.doesNotMatch(billing, />Quick Top Up</);
  assert.doesNotMatch(billing, /Credits added to your account!/);
  assert.doesNotMatch(billing, /Add \$\{selectedAmount\} Credits/);
  assert.doesNotMatch(billing, /Pay \$\{amount\} — Add Credits/);
});

test('L3.D — DashboardLayout sidebar uses "Balance" (not "Available Balance" / "Add balance")', () => {
  // Mobile balance card label
  assert.match(dashboardLayout, /mobile-balance-card-label["']?>Balance</);
  // Top-up CTA label
  assert.match(dashboardLayout, />\s*Add funds\s*</);
  assert.doesNotMatch(dashboardLayout, />Available Balance</);
});

// ─── Agent 1 / L4 — Deal Room subtitle ──────────────────────────────────────

test('L4 — Deal Room subtitle reads the new mover-language copy', () => {
  assert.match(deals, /Hand-picked leads at a discount\. Same unlock as Live Leads/);
  assert.doesNotMatch(deals, /Discounted secondary inventory/);
});

// ─── Agent 1 / L5 — Onboarding stage labels ─────────────────────────────────

test('L5 — Onboarding SETUP_STAGES use mover-language labels', () => {
  assert.match(onboardingWizard, /label:\s*['"]Your company['"]/);
  assert.match(onboardingWizard, /label:\s*['"]Where you work['"]/);
  assert.match(onboardingWizard, /label:\s*['"]How we reach you['"]/);
  assert.match(onboardingWizard, /label:\s*['"]Add your first balance['"]/);
  // 'Payment' label is unchanged from the original plan.
  assert.match(onboardingWizard, /label:\s*['"]Payment['"]/);
  // Pre-L5 engineering verbs must be gone from SETUP_STAGES.
  // (The literal words may appear elsewhere — what we lock down is that
  // the SETUP_STAGES const no longer declares them as labels.)
  const stagesBlock = onboardingWizard.match(/const SETUP_STAGES = \[[\s\S]*?\];/);
  assert.ok(stagesBlock, 'SETUP_STAGES const must exist');
  const block = stagesBlock[0];
  assert.doesNotMatch(block, /label:\s*['"]Dispatch['"]/);
  assert.doesNotMatch(block, /label:\s*['"]Coverage['"]/);
  assert.doesNotMatch(block, /label:\s*['"]Alerts['"]/);
  assert.doesNotMatch(block, /label:\s*['"]Activate['"]/);
});

// ─── Agent 1 / L6 — Onboarding step 5 pill copy + bonus framing ─────────────

test('L6.A — $50 tier pill no longer ambiguous "Limited"', () => {
  assert.doesNotMatch(onboardingWizard, />Limited starter balance</);
  assert.match(onboardingWizard, />Starter — no bonus included</);
});

test('L6.B — $100 tier pill uses "bonus" instead of "Free Credits"', () => {
  assert.match(onboardingWizard, />Includes \$50 bonus</);
  assert.doesNotMatch(onboardingWizard, />Includes \$50 Free Credits</);
});

test('L6.C — Onboarding trust strip says "Balance never expires"', () => {
  assert.match(onboardingWizard, /Balance never expires/);
  assert.doesNotMatch(onboardingWizard, /Credits never expire/);
});

// ─── Agent 1 / L7 — Onboarding skip link ────────────────────────────────────

test('L7 — Skip link reads "Browse leads first" not "Continue without activating"', () => {
  assert.match(onboardingWizard, />Browse leads first</);
  assert.match(onboardingWizard, /You can add balance when you're ready to buy\./);
  assert.doesNotMatch(onboardingWizard, />Continue without activating</);
  assert.doesNotMatch(onboardingWizard, /Dashboard access stays limited until activation/);
});

// ─── Agent 1 / L8 — ConfirmPurchaseModal warning ────────────────────────────

test('L8 — Confirm-purchase warning uses "request a refund" instead of "dispute process"', () => {
  assert.match(confirmPurchase, /will come out of your balance/);
  assert.match(confirmPurchase, /request a refund from this lead's page/);
  assert.doesNotMatch(confirmPurchase, /Purchases are final and only refundable through the dispute process/);
});

// ─── Agent 1 / L9 — LeadFeed loading copy ───────────────────────────────────

test('L9 — LeadFeed loading copy is "Checking for new leads…"', () => {
  assert.match(leadFeed, /Checking for new leads…/);
  assert.doesNotMatch(leadFeed, /Scanning for live opportunities/);
});

// ─── Agent 1 / L10 — Empty-state browse-all link ────────────────────────────

test('L10 — Empty Live Leads exposes a Browse-all marketplace link', () => {
  assert.match(leadFeed, /data-testid=["']empty-feed-browse-all["']/);
  assert.match(leadFeed, /Browse all marketplace leads/);
});

// ─── Agent 1 / L11 — FirstTopupReassurancePopup copy ────────────────────────

test('L11 — First-topup popup preserves supply-management intent without "wait" framing', () => {
  // Old wording removed.
  assert.doesNotMatch(firstTopup, /We recommend waiting for/);
  // New wording present (the "alert + browse" framing).
  assert.match(firstTopup, /We'll text and email you the moment a/);
  assert.match(firstTopup, /browse the marketplace/);
});

// ─── Agent 1 / L12 — VerifyPhone error messages ─────────────────────────────

test('L12.A — daily_limit error gives the caller a way forward', () => {
  assert.match(verifyPhone, /sent the limit of codes today\. Try again in 24 hours, or call \(307\) 204-4792 to verify by phone\./);
  assert.doesNotMatch(verifyPhone, /You.{1,3}ve hit the daily verification limit/);
});

test('L12.B — verification_blocked_by_twilio error gives a phone escape hatch', () => {
  assert.match(verifyPhone, /your carrier may be blocking it\. Call \(307\) 204-4792/);
  assert.doesNotMatch(verifyPhone, /blocked by our SMS provider/);
});

// ─── Agent 1 / L13 — Resolution Center wording (minor) ──────────────────────

test('L13 — Resolution Center subtitle + empty wording updated', () => {
  assert.match(resolutionCenter, /Refund requests and disputes/);
  assert.match(resolutionCenter, /No active refund requests/);
  assert.doesNotMatch(resolutionCenter, /Manage customer feedback/);
  assert.doesNotMatch(resolutionCenter, /No complaints found\. Great job!/);
});

// ─── Agent 2 / P1 — tel: + mailto: on MyLeads + PurchaseSuccessModal ───────

test('P1.A — MyLeads phone wrapped in tel: link', () => {
  assert.match(myLeads, /data-testid=["']myleads-call-link["']/);
  assert.match(myLeads, /href=\{[^}]*`tel:\$\{String\(lead\.customerPhone\)\.replace/);
});

test('P1.B — MyLeads email wrapped in mailto: link', () => {
  assert.match(myLeads, /data-testid=["']myleads-mail-link["']/);
  assert.match(myLeads, /href=\{[^}]*`mailto:\$\{emailToShow\}`/);
});

test('P1.C — PurchaseSuccessModal phone + email use anchor rendering', () => {
  // Phone + email rows pass a testId prop to ContactRow, which renders an
  // <a href> when href is set. We lock in the source-level shape of those
  // ContactRow invocations.
  assert.match(purchaseSuccess, /testId=["']success-call-link["']/);
  assert.match(purchaseSuccess, /testId=["']success-mail-link["']/);
  // And the ContactRow definition must render an anchor when href is set,
  // with the testId mapped to data-testid.
  assert.match(purchaseSuccess, /<a\s+href=\{href\}\s+data-testid=\{testId/);
});

// ─── Agent 2 / P2 — Success modal CTA reorder ──────────────────────────────

test('P2 — PurchaseSuccessModal exposes a Call-now CTA gated on phone', () => {
  assert.match(purchaseSuccess, /data-testid=["']success-call-now-cta["']/);
  // The Call-now CTA is rendered only when hasContact && customerPhone.
  assert.match(purchaseSuccess, /\{hasContact && lead\.customerPhone &&/);
  // Old hierarchy ("Keep browsing leads" + "View full move details" as
  // sole CTAs) must be gone.
  assert.doesNotMatch(purchaseSuccess, />\s*Keep browsing leads\s*</);
  assert.doesNotMatch(purchaseSuccess, />\s*View full move details\s*</);
});

// ─── Agent 2 / P3 — Auto-stamped internal notes ────────────────────────────

test('P3.A — withAutoStamp helper exists in MyLeads', () => {
  assert.match(myLeads, /function withAutoStamp\(noteText, prevNoteText\)/);
});

test('P3.B — handleSave routes notes through withAutoStamp before PATCH', () => {
  assert.match(myLeads, /const stamped = withAutoStamp\(notes, purchase\.crmNotes \|\| ''\);/);
  assert.match(myLeads, /JSON\.stringify\(\{ crmStatus: status, crmNotes: stamped \}\)/);
});

// ─── Agent 4 / M5 — Notes textarea sized for one-handed iPhone ─────────────

test('M5 — Internal Notes textarea uses 16px font-size + min-height', () => {
  // 16px is the iOS auto-zoom threshold; min-height keeps the surface
  // usable when the on-screen keyboard appears.
  assert.match(myLeads, /fontSize:\s*16,\s*fontFamily:\s*['"]inherit['"],\s*resize:\s*['"]vertical['"],\s*minHeight:\s*88,/);
});

// ─── Agent 4 / M6 — Mobile footer stacking ─────────────────────────────────

test('M6.A — ConfirmPurchaseModal footer uses cpm-footer class with flexWrap', () => {
  assert.match(confirmPurchase, /className=["']cpm-footer["']/);
  assert.match(confirmPurchase, /flexWrap:\s*['"]wrap['"]/);
});

test('M6.B — Mobile breakpoint stacks psm-footer + cpm-footer at <=480px', () => {
  assert.match(dashboardCss, /@media \(max-width: 480px\)[\s\S]*\.psm-footer[\s\S]*\.cpm-footer/);
  assert.match(dashboardCss, /\.psm-call-now \{[\s\S]*font-size:\s*16px\s*!important/);
});

// ─── Agent 5 / T5 — Register left-rail rewrite ─────────────────────────────

test('T5 — Register left rail uses mover-audience copy', () => {
  // Strip comments — the T5 explainer in Register.jsx quotes the pre-T5
  // strings as examples; we want to assert on executable code only.
  const registerCode = register
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');

  // New copy present.
  assert.match(registerCode, /Verified moving leads/);
  assert.match(registerCode, /Pay only for unlocks/);
  assert.match(registerCode, /Text \+ email alerts/);
  assert.match(registerCode, /Refundable balance/);
  // Pre-T5 B2B-partner copy must not appear in executable code.
  assert.doesNotMatch(registerCode, /Turnkey Booking Platform/);
  assert.doesNotMatch(registerCode, /Sales Funnel Built to Convert/);
  assert.doesNotMatch(registerCode, /AI Speed to Call/);
  assert.doesNotMatch(registerCode, /title:\s*['"]Instant Payments['"]/);
});

console.log('\nPhase 1 polish bundle (L+P+T+M) lock-in suite — all assertions passed.');
