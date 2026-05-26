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
  // We DO allow it inside the dev-mode invariant (where it's used to log
  // leaks for diagnosis), so the assertion is anchored to the filter
  // path, which is followed by `return false;`.
  const looserFilter = /if\s*\(\s*!isMine\s*&&\s*!l\._matchesPreferences\s*\)\s*return\s*false/;
  assert.doesNotMatch(
    leadFeedSrc,
    looserFilter,
    'Old truthy check must be replaced by the strict === true predicate'
  );
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

test('feedScope promotes to "matched" when user loads with prefs (no stale lock to "all")', () => {
  // Initial state defaults to 'all' (safe when user is null on first
  // render) — then a useEffect promotes to 'matched' once the user
  // object resolves with any preference signal. Required to prevent the
  // bug where the tab badge shows "Matched (2)" but the filter never
  // engages because feedScope was locked to 'all' at mount time.
  assert.match(
    leadFeedSrc,
    /useState\(\s*['"]all['"]\s*\)/,
    'feedScope should default to "all" (then promote via effect once user loads)'
  );
  assert.match(
    leadFeedSrc,
    /scopeUserPickedRef/,
    'should track whether the user has manually picked a tab'
  );
  assert.match(
    leadFeedSrc,
    /setFeedScope\(['"]matched['"]\)/,
    'should promote feedScope to "matched" via setter (in useEffect)'
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

test('Tab click marks scope as user-picked (stops the auto-promote effect)', () => {
  // Once the user has manually chosen a tab, the effect that promotes to
  // "matched" must NOT clobber that choice on re-render. The ref flip
  // happens inside the onClick.
  assert.match(
    leadFeedSrc,
    /onClick=\{[^}]*scopeUserPickedRef\.current\s*=\s*true[^}]*setFeedScope/,
    'tab onClick must set scopeUserPickedRef.current = true before setFeedScope'
  );
});

console.log('\nLeadFeed matched-tab filter lock-in tests scheduled.');
