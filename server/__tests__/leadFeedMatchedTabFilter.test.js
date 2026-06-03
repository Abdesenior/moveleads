/**
 * LeadFeed.jsx — Matched-for-you tab filter lock-in.
 *
 * Source-level assertions only. The dashboard renders a single
 * `displayedLeads` array — the Matched tab filter MUST exclude any lead
 * that isn't either (a) purchased by the current mover or (b) explicitly
 * flagged by the server as `_matchesPreferences === true`. Anything
 * looser leaks unmatched rows into the matched tab — the exact bug the
 * operator hit on 2026-05-26 after the Phase 3.1 server cutover.
 *
 * Pure-Node, no Jest, no jsdom. Reads LeadFeed.jsx as text.
 *
 * Run: `node server/__tests__/leadFeedMatchedTabFilter.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leadFeedSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'dashboard', 'LeadFeed.jsx'),
  'utf8'
);

test('Matched-tab filter uses strict === true (not truthy)', () => {
  // The filter predicate must compare with `=== true`, not just truthy.
  // Truthy lets non-boolean values (objects, "false" strings) through.
  assert.match(
    leadFeedSrc,
    /_matchesPreferences\s*===\s*true/,
    'Matched-tab filter must use _matchesPreferences === true (strict bool)'
  );
  // The matched-tab tab BADGE COUNT must use the SAME predicate so the
  // count never drifts from the actual rendered rows.
  const matchCountMatches = leadFeedSrc.match(/_matchesPreferences\s*===\s*true/g) || [];
  assert.ok(matchCountMatches.length >= 2,
    'Both the row filter AND the count badge must use === true');
});

test('Matched-tab filter has no looser fallback', () => {
  // Explicitly reject the older `!l._matchesPreferences` truthy check —
  // it lets undefined/null/0/"" sneak through if the field is missing.
  const looserFilter = /if\s*\(\s*!isMine\s*&&\s*!l\._matchesPreferences\s*\)\s*return\s*false/;
  assert.doesNotMatch(
    leadFeedSrc,
    looserFilter,
    'Old truthy check must be replaced by the strict === true predicate'
  );
});

test('Matched-tab filter does NOT pass purchased-but-unmatched leads', () => {
  // The operator's spec: "In Matched for you, show ONLY leads where
  // _matchesPreferences === true." Previously the filter also passed
  // leads the mover had already purchased, which produced confusing
  // pill counts (e.g. hero pill shows 6 while tab badge shows 2 because
  // 4 of those 6 were old test purchases from outside the mover's
  // current pickup/delivery). The fix is to drop the
  // `!isPurchasedByMe(l) && !isExplicitlyMatched(l)` pass-through and
  // gate strictly on the server flag.
  const passesPurchased = /if\s*\(\s*!isPurchasedByMe\(l\)\s*&&\s*!isExplicitlyMatched\(l\)\s*\)\s*return\s*false/;
  assert.doesNotMatch(
    leadFeedSrc,
    passesPurchased,
    'Matched filter must NOT have the purchased pass-through anymore; ' +
    'predicate should be `if (!isExplicitlyMatched(l)) return false;`'
  );
  // Affirmative: the strict-only filter line is present.
  const strictOnly = /if\s*\(\s*!isExplicitlyMatched\(l\)\s*\)\s*return\s*false/;
  assert.match(
    leadFeedSrc,
    strictOnly,
    'Matched filter must use `if (!isExplicitlyMatched(l)) return false;`'
  );
});

test('Dev invariant catches purchased-but-unmatched leaks too', () => {
  // The runtime invariant must mirror the new strict predicate so
  // purchased-but-unmatched leads (the bug the operator hit on
  // 2026-05-26) are flagged in browser console.
  const oldInvariant = /leaks\s*=\s*displayedLeads\.filter\(\s*l\s*=>\s*!isPurchasedByMe\(l\)\s*&&\s*!isExplicitlyMatched\(l\)\s*\)/;
  assert.doesNotMatch(leadFeedSrc, oldInvariant,
    'Dev invariant must drop the purchased pass-through to match the strict filter');
  const newInvariant = /leaks\s*=\s*displayedLeads\.filter\(\s*l\s*=>\s*!isExplicitlyMatched\(l\)\s*\)/;
  assert.match(leadFeedSrc, newInvariant,
    'Dev invariant must use `displayedLeads.filter(l => !isExplicitlyMatched(l))`');
});

test('Matched-tab filter runs through useMemo (deterministic re-compute)', () => {
  assert.match(
    leadFeedSrc,
    /const\s+visible\s*=\s*useMemo\(/,
    '`visible` must be wrapped in useMemo so its dependencies are explicit'
  );
  assert.match(
    leadFeedSrc,
    /const\s+displayedLeads\s*=\s*useMemo\(/,
    '`displayedLeads` must be wrapped in useMemo too'
  );
});

test('Matched-tab dev invariant logs any filter leak', () => {
  assert.match(
    leadFeedSrc,
    /Matched-tab filter leak:/,
    'Dev-mode runtime invariant must log `[LeadFeed] Matched-tab filter leak:` if any row violates the contract'
  );
});

test('feedScope defaults to "all" (marketplace) with no auto-promotion to "matched"', () => {
  // Product decision (2026-06-03, feat/leads-marketplace-default): the
  // marketplace tab ("All marketplace leads") is the landing default for
  // every mover. The prior useEffect that promoted feedScope 'all' →
  // 'matched' when the user had preferences was intentionally removed —
  // "Matched for you" is now opt-in via a click and is never auto-selected.
  assert.match(
    leadFeedSrc,
    /useState\(\s*['"]all['"]\s*\)/,
    'feedScope must default to "all" (the marketplace tab)'
  );
  assert.match(
    leadFeedSrc,
    /scopeUserPickedRef/,
    'should still track whether the user has manually picked a tab'
  );
  // Lock in the removal: there must be NO literal setFeedScope('matched')
  // (the auto-promotion). The Matched tab is reached only via the dynamic
  // tab onClick — setFeedScope(tab.id).
  assert.doesNotMatch(
    leadFeedSrc,
    /setFeedScope\(\s*['"]matched['"]\s*\)/,
    'there must be no auto-promotion to "matched" — marketplace is the default'
  );
});

test('hasPrefs recognizes pickupStates / deliveryStates / deliversNationwide', () => {
  // The matched-tab default must consider the new Phase 1+2 fields too —
  // a mover who only configured pickup states (no maxDistance / homeSize
  // yet) should still default to the matched tab.
  assert.match(leadFeedSrc, /pickupStates/);
  assert.match(leadFeedSrc, /deliveryStates/);
  assert.match(leadFeedSrc, /deliversNationwide/);
});

test('Tab click records an explicit user pick via scopeUserPickedRef', () => {
  // scopeUserPickedRef is flipped to true inside the tab onClick (and the
  // empty-state "browse all" CTA) to record that the user explicitly chose a
  // scope. It previously also gated the now-removed auto-promote effect; the
  // ref is retained for the explicit-pick signal (retirement deferred).
  assert.match(
    leadFeedSrc,
    /onClick=\{[^}]*scopeUserPickedRef\.current\s*=\s*true[^}]*setFeedScope/,
    'tab onClick must set scopeUserPickedRef.current = true before setFeedScope'
  );
});

console.log('\nLeadFeed matched-tab filter lock-in tests scheduled.');
