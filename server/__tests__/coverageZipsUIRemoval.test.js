/**
 * Coverage ZIPs UI removal — PR-C1 lock-in.
 *
 * Background (2026-05-26): Settings audit determined that the mover-facing
 * "Coverage Areas" tab was vestigial. Every Service Area save already
 * triggers regenerateCoverageForUser_v2, which deletes + reinserts typed
 * CoverageArea docs derived from pickupStates / deliveryStates /
 * deliversNationwide. Any ZIPs a mover typed into the manual tab were
 * wiped on their next Service Area save. The tab was therefore a
 * conflicting control surface, not the source of truth.
 *
 * This lock-in asserts the simplification stays in place:
 *
 *   FRONTEND (Settings.jsx) — the Coverage Areas tab is gone:
 *     A1. TABS array does NOT include id 'coverage'
 *     A2. ZipTagInput component is gone
 *     A3. coverageZips / coverageMsg / coverageSaving state is gone
 *     A4. saveCoverageZips / addZip / removeZip handlers are gone
 *     A5. No fetch to /routing/coverage/mine remains
 *     A6. activeTab === 'coverage' render block is gone
 *     A7. MapPin icon import is gone (it was the tab icon)
 *     A8. Audit-trail comment is present
 *
 *   BACKEND (routes/routing.js) — the manual write route is gone:
 *     B1. PUT /coverage/mine route is gone
 *     B2. Audit-trail comment is present
 *     B3. Admin coverage routes are PRESERVED (GET, POST, POST bulk, DELETE)
 *
 *   COMPATIBILITY (unchanged load-bearing wiring):
 *     C1. routes/users.js still calls regenerateCoverageForUser_v2
 *         (auto-regen is the canonical path that keeps CoverageArea fresh)
 *     C2. services/socketService.js still reads CoverageArea on connect
 *         (ZIP-based socket rooms remain populated via auto-regen)
 *     C3. utils/findEligibleMovers.js still queries CoverageArea
 *         (warm-transfer eligibility remains a hard-gate on typed coverage)
 *     C4. services/twilioService.js still uses CoverageArea in candidate query
 *     C5. services/emailService.js still uses CoverageArea in candidate query
 *
 * Pure-Node, no Mongo, no jsdom. Source-level assertions only.
 *
 * Run: `node server/__tests__/coverageZipsUIRemoval.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot   = path.join(__dirname, '..', '..');
const clientRoot = path.join(repoRoot, 'client', 'src');
const serverRoot = path.join(repoRoot, 'server');

const settingsSrc       = fs.readFileSync(path.join(clientRoot, 'pages', 'dashboard', 'Settings.jsx'), 'utf8');
const routingSrc        = fs.readFileSync(path.join(serverRoot, 'routes', 'routing.js'), 'utf8');
const usersRouteSrc     = fs.readFileSync(path.join(serverRoot, 'routes', 'users.js'), 'utf8');
const socketServiceSrc  = fs.readFileSync(path.join(serverRoot, 'services', 'socketService.js'), 'utf8');
const findEligibleSrc   = fs.readFileSync(path.join(serverRoot, 'utils', 'findEligibleMovers.js'), 'utf8');
const twilioServiceSrc  = fs.readFileSync(path.join(serverRoot, 'services', 'twilioService.js'), 'utf8');
const emailServiceSrc   = fs.readFileSync(path.join(serverRoot, 'services', 'emailService.js'), 'utf8');

// ── A. Frontend Settings.jsx — Coverage Areas tab fully removed ─────────

test("A1. TABS array does not include id 'coverage'", () => {
  // The Coverage Areas tab must not appear in the tab navigation.
  assert.doesNotMatch(
    settingsSrc,
    /id:\s*['"]coverage['"]/,
    "Settings TABS must not include a 'coverage' entry"
  );
  // Sanity: the canonical Service Area tab IS still there.
  assert.match(
    settingsSrc,
    /id:\s*['"]serviceAreas['"]/,
    "Settings TABS must still include 'serviceAreas' — the canonical coverage surface"
  );
});

test('A2. ZipTagInput component is gone', () => {
  assert.doesNotMatch(
    settingsSrc,
    /function\s+ZipTagInput/,
    'ZipTagInput function declaration must be removed'
  );
  assert.doesNotMatch(
    settingsSrc,
    /<ZipTagInput\b/,
    'No <ZipTagInput> JSX usage may remain'
  );
});

test('A3. coverageZips / coverageMsg / coverageSaving state is gone', () => {
  assert.doesNotMatch(settingsSrc, /\bcoverageZips\b/,    'coverageZips state must be removed');
  assert.doesNotMatch(settingsSrc, /\bcoverageMsg\b/,     'coverageMsg state must be removed');
  assert.doesNotMatch(settingsSrc, /\bcoverageSaving\b/,  'coverageSaving state must be removed');
});

test('A4. saveCoverageZips / addZip / removeZip handlers are gone', () => {
  assert.doesNotMatch(settingsSrc, /\bsaveCoverageZips\b/, 'saveCoverageZips must be removed');
  assert.doesNotMatch(settingsSrc, /\bconst\s+addZip\b/,   'addZip helper must be removed');
  assert.doesNotMatch(settingsSrc, /\bconst\s+removeZip\b/,'removeZip helper must be removed');
});

test('A5. No fetch to /routing/coverage/mine remains in Settings', () => {
  assert.doesNotMatch(
    settingsSrc,
    /routing\/coverage\/mine/,
    'Settings.jsx must not call PUT /api/routing/coverage/mine anymore'
  );
});

test("A6. activeTab === 'coverage' render block is gone", () => {
  assert.doesNotMatch(
    settingsSrc,
    /activeTab\s*===\s*['"]coverage['"]/,
    "Settings.jsx must not render the 'coverage' tab block"
  );
});

test('A7. MapPin icon import is removed from Settings.jsx', () => {
  // MapPin was used only for the Coverage Areas tab. Removing it keeps the
  // import surface honest. If a future change reintroduces MapPin for some
  // other reason, this test should be updated, not the production import
  // re-added quietly.
  const importMatch = settingsSrc.match(/from\s+['"]lucide-react['"]/);
  assert.ok(importMatch, 'Settings.jsx must still import from lucide-react');
  // Pull just the import-from-lucide-react line for inspection.
  const importLine = settingsSrc
    .split('\n')
    .find(l => l.includes("from 'lucide-react'"))
    || '';
  assert.doesNotMatch(
    importLine,
    /\bMapPin\b/,
    'MapPin icon must not be imported (no remaining use after Coverage tab removal)'
  );
});

test('A8. Settings.jsx contains the PR-C1 audit-trail comment', () => {
  assert.match(
    settingsSrc,
    /PR-C1:\s*Coverage ZIPs tab \+ manual ZipTagInput removed/,
    'Audit-trail comment block explaining the removal must remain in Settings.jsx'
  );
});

// ── B. Backend routes/routing.js — manual write route gone, admin intact ─

test('B1. PUT /coverage/mine route is removed', () => {
  // No PUT handler registration targeting /coverage/mine.
  // (The audit-trail comment in routing.js legitimately mentions the path
  // by name, so a substring check would false-positive — pinning the
  // router.put() registration shape is the load-bearing assertion.)
  assert.doesNotMatch(
    routingSrc,
    /router\.put\s*\(\s*['"]\/coverage\/mine['"]/,
    'PUT /coverage/mine handler must be removed from routing.js'
  );
});

test('B2. routing.js contains the PR-C1 audit-trail comment', () => {
  assert.match(
    routingSrc,
    /PR-C1:\s*PUT \/api\/routing\/coverage\/mine removed/,
    'Audit-trail comment must remain so future contributors understand the gap'
  );
});

test('B3. Admin coverage routes are preserved', () => {
  // GET /coverage/:companyId — admin reads
  assert.match(
    routingSrc,
    /router\.get\s*\(\s*['"]\/coverage\/:companyId['"]/,
    'Admin GET /coverage/:companyId must remain'
  );
  // POST /coverage — admin single-add
  assert.match(
    routingSrc,
    /router\.post\s*\(\s*['"]\/coverage['"]/,
    'Admin POST /coverage must remain'
  );
  // POST /coverage/bulk — admin bulk import
  assert.match(
    routingSrc,
    /router\.post\s*\(\s*['"]\/coverage\/bulk['"]/,
    'Admin POST /coverage/bulk must remain'
  );
  // DELETE /coverage/:id — admin removal
  assert.match(
    routingSrc,
    /router\.delete\s*\(\s*['"]\/coverage\/:id['"]/,
    'Admin DELETE /coverage/:id must remain'
  );
  // GET /eligible — warm-transfer eligibility (depends on CoverageArea)
  assert.match(
    routingSrc,
    /router\.get\s*\(\s*['"]\/eligible['"]/,
    'Admin GET /eligible (warm-transfer) must remain'
  );
});

// ── C. Compatibility — load-bearing wiring is UNTOUCHED ─────────────────

test('C1. routes/users.js still calls regenerateCoverageForUser_v2', () => {
  // This is the canonical write path. If this regresses, CoverageArea goes
  // stale on every Service Area save and socket rooms silently drift.
  assert.match(
    usersRouteSrc,
    /require\s*\(\s*['"]\.\.\/utils\/coverageExpansion['"]\s*\)/,
    'users.js must still import coverageExpansion'
  );
  assert.match(
    usersRouteSrc,
    /regenerateCoverageForUser_v2\s*\(/,
    'users.js must still call regenerateCoverageForUser_v2 in the unified service-area handler'
  );
});

test('C2. socketService.js still reads CoverageArea on connect', () => {
  // Socket rooms are the real-time push mechanism. They are populated from
  // CoverageArea on connect. Removing this would silently break live pops
  // even though SMS/email broadcasts would continue working.
  assert.match(
    socketServiceSrc,
    /require\s*\(\s*['"]\.\.\/models\/CoverageArea['"]\s*\)/,
    'socketService.js must still import CoverageArea'
  );
  assert.match(
    socketServiceSrc,
    /CoverageArea\.find\s*\(/,
    'socketService.js must still query CoverageArea on connect to populate ZIP rooms'
  );
});

test('C3. findEligibleMovers still queries CoverageArea (warm-transfer hard-gate)', () => {
  assert.match(
    findEligibleSrc,
    /require\s*\(\s*['"]\.\.\/models\/CoverageArea['"]\s*\)/,
    'findEligibleMovers must still import CoverageArea'
  );
  assert.match(
    findEligibleSrc,
    /CoverageArea\.aggregate\s*\(/,
    'findEligibleMovers must still aggregate over CoverageArea for typed origin/destination match'
  );
});

test('C4. twilioService still uses CoverageArea in candidate query', () => {
  assert.match(
    twilioServiceSrc,
    /require\s*\(\s*['"]\.\.\/models\/CoverageArea['"]\s*\)/,
    'twilioService.js must still import CoverageArea'
  );
  assert.match(
    twilioServiceSrc,
    /CoverageArea\.distinct\s*\(/,
    'twilioService.js must still distinct-query CoverageArea for the SMS candidate set'
  );
});

test('C5. emailService still uses CoverageArea in candidate query', () => {
  assert.match(
    emailServiceSrc,
    /require\s*\(\s*['"]\.\.\/models\/CoverageArea['"]\s*\)/,
    'emailService.js must still import CoverageArea'
  );
  assert.match(
    emailServiceSrc,
    /CoverageArea\.distinct\s*\(/,
    'emailService.js must still distinct-query CoverageArea for the email candidate set'
  );
});

console.log('Coverage ZIPs UI removal (PR-C1) lock-in tests scheduled.');
