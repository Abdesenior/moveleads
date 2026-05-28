/**
 * Matcher Diagnosis (PR-D1) test suite.
 *
 * Two responsibilities:
 *   1. SCENARIO COVERAGE — every shape from the design doc (TX→TX,
 *      TX→FL with nationwide, NY→CA custom delivery, wrong origin,
 *      wrong destination, distance mismatches, home-size mismatch,
 *      avoided move type, phone unverified, SMS opt-out, suspended,
 *      outside dispatch hours, already purchased, held distribution,
 *      PR #30 regression).
 *   2. DRIFT SAFETY — for every scenario, the diagnosis's
 *      `final.dashboardMatch` MUST equal the production
 *      `doesLeadMatchMoverPreferencesStrict` result given the same
 *      inputs (lifecycle/buyer gates removed, since the production
 *      matcher doesn't evaluate those). If the diagnosis ever silently
 *      diverges from production, these tests go red and the bug never
 *      ships.
 *
 * Pure-Node, no Mongo. Run: `node server/__tests__/matcherDiagnosis.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { diagnoseMatch, shortLogLine, __internals } = require('../utils/matcherDiagnosis');
const { doesLeadMatchMoverPreferencesStrict } = require('../utils/leadMatching');

// ── Fixture builders ────────────────────────────────────────────────────

function mover(overrides = {}) {
  return {
    _id: 'mover-1',
    pickupStates: ['TX'],
    deliveryStates: [],
    deliversNationwide: true,
    maxDistance: '',
    preferredHomeSizes: [],
    smsNotif: true,
    emailNotif: true,
    phone: '5558675309',
    phoneVerified: true,
    smsOptOut: false,
    emailOptOut: false,
    isSuspended: false,
    onboarding: { answers: {} },
    ...overrides,
  };
}

function lead(overrides = {}) {
  return {
    _id: 'lead-1',
    status: 'Available',
    distributionDecision: 'system_approved',
    auctionStatus: null,
    buyers: [],
    originCity: 'McKinney', originState: 'TX', originZip: '75070',
    destinationCity: 'Houston', destinationState: 'TX', destinationZip: '77001',
    distance: 'Local',
    homeSize: '3 Bedroom',
    moveDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

// Helper — assert the diagnosis dashboardMatch agrees with the production
// strict matcher. Production matcher only checks coverage + preference
// gates; lifecycle/buyer gates are the diagnosis adding value over the
// raw matcher. So we test drift only when the lifecycle/buyer gates pass.
function assertDashboardMatchesProductionMatcher(L, M, opts = {}) {
  const trace = diagnoseMatch(L, M, opts);
  const lifecycleGates = ['leadStatus', 'distributionDecision', 'auctionStatus', 'buyerExclusion'];
  const lifecycleClean = trace.gates
    .filter(g => lifecycleGates.includes(g.gate))
    .every(g => g.pass);
  if (!lifecycleClean) return trace; // production matcher doesn't see this
  const prod = doesLeadMatchMoverPreferencesStrict(L, M, opts);
  assert.equal(
    trace.final.dashboardMatch, prod,
    `DRIFT: diagnosis dashboardMatch=${trace.final.dashboardMatch} but production strict matcher says ${prod}. ` +
    `firstFailedGate=${trace.final.firstFailedGate}/${trace.final.firstFailedCode}`
  );
  return trace;
}

// ── 1. TX → TX local move ───────────────────────────────────────────────

test('1. TX → TX local, nationwide mover, Both distances → match', () => {
  const M = mover();
  const L = lead();
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, true);
  assert.equal(t.final.smsEligible, true);
  assert.equal(t.final.emailEligible, true);
  assert.equal(t.final.firstFailedGate, null);
});

// ── 2. TX → FL with nationwide (the PR #30 fix in action) ──────────────

test('2. TX → FL with nationwide delivery → match', () => {
  const M = mover();
  const L = lead({
    destinationCity: 'Ocala', destinationState: 'FL', destinationZip: '34470',
    distance: 'Long Distance',
  });
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, true);
  assert.equal(t.gates.find(g => g.gate === 'destination').code, 'DESTINATION_NATIONWIDE_PASS');
});

// ── 3. NY → CA custom delivery ──────────────────────────────────────────

test('3. NY → CA, deliveryStates=[CA], not nationwide → match', () => {
  const M = mover({
    pickupStates: ['NY'],
    deliveryStates: ['CA'],
    deliversNationwide: false,
  });
  const L = lead({
    originCity: 'New York', originState: 'NY', originZip: '10001',
    destinationCity: 'Los Angeles', destinationState: 'CA', destinationZip: '90001',
    distance: 'Long Distance',
  });
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, true);
  assert.equal(t.gates.find(g => g.gate === 'destination').code, 'DESTINATION_STATE_IN_DELIVERY');
});

test('4. NY → CA, deliveryStates=[NJ,CT] (no CA), not nationwide → reject at destination', () => {
  const M = mover({
    pickupStates: ['NY'],
    deliveryStates: ['NJ', 'CT'],
    deliversNationwide: false,
  });
  const L = lead({
    originState: 'NY', originZip: '10001',
    destinationState: 'CA', destinationZip: '90001',
    distance: 'Long Distance',
  });
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedGate, 'destination');
  assert.equal(t.final.firstFailedCode, 'DESTINATION_STATE_NOT_IN_DELIVERY');
});

// ── 5. NY → NY local-only mover ─────────────────────────────────────────

test('5. NY → NY, mover maxDistance=Local → match', () => {
  const M = mover({
    pickupStates: ['NY'],
    deliveryStates: ['NY'],
    deliversNationwide: false,
    maxDistance: 'Local',
  });
  const L = lead({
    originState: 'NY', originZip: '10001',
    destinationState: 'NY', destinationZip: '10005',
    distance: 'Local',
  });
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, true);
  assert.equal(t.gates.find(g => g.gate === 'distance').code, 'DISTANCE_MATCHES_LOCAL');
});

// ── 6. Wrong origin ──────────────────────────────────────────────────────

test('6. Wrong origin state (mover NY, lead CA→FL) → reject at origin', () => {
  const M = mover({ pickupStates: ['NY'] });
  const L = lead({
    originState: 'CA', originZip: '90001',
    destinationState: 'FL', destinationZip: '34470',
    distance: 'Long Distance',
  });
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedGate, 'origin');
  assert.equal(t.final.firstFailedCode, 'ORIGIN_STATE_NOT_IN_PICKUP');
});

// ── 7. Wrong destination — see test 4 ──────────────────────────────────
// ── 8. Wrong distance (local-only mover, long lead) ────────────────────

test('8. Mover wants Local, lead is Long Distance → reject at distance', () => {
  const M = mover({ maxDistance: 'Local' });
  const L = lead({
    destinationState: 'FL', destinationZip: '34470',
    distance: 'Long Distance',
  });
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedGate, 'distance');
  assert.equal(t.final.firstFailedCode, 'DISTANCE_MISMATCH_WANTS_LOCAL');
});

test('9. Mover wants Long Distance, lead is Local → reject at distance', () => {
  const M = mover({
    pickupStates: ['NY'], deliveryStates: ['NY'], deliversNationwide: false,
    maxDistance: 'Long Distance',
  });
  const L = lead({
    originState: 'NY', originZip: '10001',
    destinationState: 'NY', destinationZip: '10005',
    distance: 'Local',
  });
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedGate, 'distance');
  assert.equal(t.final.firstFailedCode, 'DISTANCE_MISMATCH_WANTS_LONG');
});

// ── 10. Wrong home size ─────────────────────────────────────────────────

test('10. Mover preferredHomeSizes=[Studio,1 Bedroom], lead 3 Bedroom → reject at homeSize', () => {
  const M = mover({ preferredHomeSizes: ['Studio', '1 Bedroom'] });
  const L = lead({ homeSize: '3 Bedroom' });
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedGate, 'homeSize');
  assert.equal(t.final.firstFailedCode, 'HOME_SIZE_NOT_IN_PREFS');
});

// ── 11. Avoided move type ───────────────────────────────────────────────

test('11. Mover avoidMoveTypes=[home], lead 3 Bedroom (derives home) → reject at moveType', () => {
  const M = mover({
    onboarding: { answers: { moveTypes: ['apartment', 'home'], avoidMoveTypes: ['home'] } },
  });
  const L = lead({ homeSize: '3 Bedroom' });
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedGate, 'moveType');
  assert.equal(t.final.firstFailedCode, 'MOVE_TYPE_IN_AVOIDS');
});

// ── 12. PR #30 regression — stale moveTypes no longer drops long-distance ─

test('12. PR #30 regression: stale moveTypes=[apartment,home,office], TX→FL Long Distance → match', () => {
  const M = mover({
    onboarding: { answers: { moveTypes: ['apartment', 'home', 'office'] } },
  });
  const L = lead({
    destinationState: 'FL', destinationZip: '34470',
    distance: 'Long Distance',
  });
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, true);
  assert.equal(t.gates.find(g => g.gate === 'moveType').code, 'MOVE_TYPE_IN_PREFS');
  assert.equal(t.gates.find(g => g.gate === 'moveType').evidence.derived, 'home',
    'derivedMoveType should be home (from 3 Bedroom), not longDistance');
});

// ── 13. Phone not verified ──────────────────────────────────────────────

test('13. Phone not verified → dashboardMatch true, smsEligible false, emailEligible true', () => {
  const M = mover({ phoneVerified: false });
  const L = lead();
  const t = diagnoseMatch(L, M);
  assert.equal(t.final.dashboardMatch, true);
  assert.equal(t.final.smsEligible, false);
  assert.equal(t.final.emailEligible, true);
  assert.equal(t.final.firstFailedGate, 'phoneVerified');
  assert.equal(t.final.firstFailedCode, 'PHONE_NOT_VERIFIED');
});

// ── 14. SMS opted out ───────────────────────────────────────────────────

test('14. smsOptOut=true → smsEligible false (SMS_HARD_OPT_OUT)', () => {
  const M = mover({ smsOptOut: true });
  const L = lead();
  const t = diagnoseMatch(L, M);
  assert.equal(t.final.dashboardMatch, true);
  assert.equal(t.final.smsEligible, false);
  assert.equal(t.gates.find(g => g.gate === 'smsChannel').code, 'SMS_HARD_OPT_OUT');
});

// ── 15. Suspended mover ─────────────────────────────────────────────────

test('15. isSuspended=true → smsEligible AND emailEligible both false', () => {
  const M = mover({ isSuspended: true });
  const L = lead();
  const t = diagnoseMatch(L, M);
  assert.equal(t.final.dashboardMatch, true,
    'Suspension does NOT hide leads from the dashboard — it only blocks broadcasts');
  assert.equal(t.final.smsEligible, false);
  assert.equal(t.final.emailEligible, false);
  assert.equal(t.gates.find(g => g.gate === 'accountStatus').code, 'SUSPENDED');
});

// ── 16. Outside dispatch hours ──────────────────────────────────────────

test('16. Outside SMS dispatch hours → smsEligible false, emailEligible true', () => {
  // Configure 09:00–17:00 default, evaluate at 22:00 local.
  const M = mover({
    onboarding: {
      answers: {
        dispatchHoursMode: 'default',
        dispatchHoursOpen: '09:00',
        dispatchHoursClose: '17:00',
      },
    },
  });
  const L = lead();
  const at22 = new Date();
  at22.setHours(22, 0, 0, 0);
  const t = diagnoseMatch(L, M, { now: at22 });
  assert.equal(t.final.dashboardMatch, true);
  assert.equal(t.final.smsEligible, false);
  assert.equal(t.final.emailEligible, true, 'Email bypasses dispatch hours');
  const dh = t.gates.find(g => g.gate === 'dispatchHours');
  assert.equal(dh.code, 'OUTSIDE_HOURS_SMS');
});

// ── 17. Already purchased by this mover ────────────────────────────────

test('17. Mover already in lead.buyers → dashboardMatch false at buyerExclusion', () => {
  const M = mover();
  const L = lead({
    buyers: [{ company: M._id, purchasedAt: new Date(), pricePaid: 50 }],
  });
  const t = diagnoseMatch(L, M);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedGate, 'buyerExclusion');
  assert.equal(t.final.firstFailedCode, 'ALREADY_OWNED_BY_THIS_MOVER');
});

// ── 18. Held distribution decision ─────────────────────────────────────

test('18. distributionDecision=system_held → dashboardMatch false', () => {
  const M = mover();
  const L = lead({ distributionDecision: 'system_held', distributionDecisionReason: 'manual review' });
  const t = diagnoseMatch(L, M);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedGate, 'distributionDecision');
  assert.equal(t.final.firstFailedCode, 'DECISION_SYSTEM_HELD');
  assert.match(
    t.gates.find(g => g.gate === 'distributionDecision').reason,
    /manual review/,
    'reason should surface distributionDecisionReason'
  );
});

// ── 19. Rejected distribution decision ─────────────────────────────────

test('19. distributionDecision=admin_rejected → dashboardMatch false', () => {
  const M = mover();
  const L = lead({ distributionDecision: 'admin_rejected' });
  const t = diagnoseMatch(L, M);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedCode, 'DECISION_ADMIN_REJECTED');
});

// ── 20. Auction sold ───────────────────────────────────────────────────

test('20. auctionStatus=sold → dashboardMatch false at auctionStatus', () => {
  const M = mover();
  const L = lead({ auctionStatus: 'sold' });
  const t = diagnoseMatch(L, M);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedGate, 'auctionStatus');
  assert.equal(t.final.firstFailedCode, 'AUCTION_SOLD');
});

// ── 21. Lead status Expired ────────────────────────────────────────────

test('21. status=Expired → dashboardMatch false at leadStatus', () => {
  const M = mover();
  const L = lead({ status: 'Expired' });
  const t = diagnoseMatch(L, M);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedGate, 'leadStatus');
  assert.equal(t.final.firstFailedCode, 'STATUS_EXPIRED');
});

// ── 22. PR-C3 cleanup: alertChannels NO LONGER overrides legacy ────────

test('22. alertChannels is ignored after PR-C3 — legacy smsNotif/emailNotif wins', () => {
  // Before PR-C3 (2026-05-28), an alertChannels=['email'] array would
  // silently block SMS even with smsNotif=true. That precedence is gone:
  // wantsChannel reads ONLY the legacy top-level flags now (modulo
  // isSuspended + opt-outs). This test locks the new behavior in.
  const M = mover({
    smsNotif: true,            // Settings says: YES, send me SMS
    emailNotif: false,         // Settings says: NO email
    onboarding: { answers: { alertChannels: ['email'] } }, // stale field, now ignored
  });
  const L = lead();
  const t = diagnoseMatch(L, M);
  // SMS: smsNotif=true wins, alertChannels=['email'] is ignored
  assert.equal(t.gates.find(g => g.gate === 'smsChannel').code, 'SMS_OPTED_IN');
  // Email: emailNotif=false wins, alertChannels=['email'] is ignored
  assert.equal(t.gates.find(g => g.gate === 'emailChannel').code, 'EMAIL_OPTED_OUT');
  assert.equal(t.final.smsEligible, true,
    'smsNotif=true must produce SMS-eligible regardless of stale alertChannels');
  assert.equal(t.final.emailEligible, false,
    'emailNotif=false must suppress email regardless of stale alertChannels');
});

// ── 23. Legacy serviceStates fallback ──────────────────────────────────

test('23. pickupStates empty + serviceStates=[TX] → legacy fallback fires', () => {
  const M = mover({ pickupStates: [], serviceStates: ['TX'] });
  const L = lead();
  const t = assertDashboardMatchesProductionMatcher(L, M);
  assert.equal(t.final.dashboardMatch, true);
  assert.equal(t.gates.find(g => g.gate === 'origin').code, 'ORIGIN_LEGACY_FALLBACK_USED');
});

// ── 24. ZIP-based origin coverage ──────────────────────────────────────

test('24. Origin state not in pickup but originZip in coverage set → match by ZIP', () => {
  const M = mover({ pickupStates: ['NY'], deliveryStates: [], deliversNationwide: true });
  const L = lead({
    originState: 'TX', originZip: '75070',  // pickup is NY but ZIP is covered
    destinationState: 'FL', destinationZip: '34470',
    distance: 'Long Distance',
  });
  const t = assertDashboardMatchesProductionMatcher(L, M, {
    originZipSet: new Set(['75070']),
  });
  assert.equal(t.final.dashboardMatch, true);
  assert.equal(t.gates.find(g => g.gate === 'origin').code, 'ORIGIN_ZIP_COVERED');
});

// ── 25. Defensive null inputs ──────────────────────────────────────────

test('25. Null lead returns MISSING_INPUTS trace, never throws', () => {
  const t = diagnoseMatch(null, mover());
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedCode, 'MISSING_INPUTS');
});

test('26. Null mover returns MISSING_INPUTS trace, never throws', () => {
  const t = diagnoseMatch(lead(), null);
  assert.equal(t.final.dashboardMatch, false);
  assert.equal(t.final.firstFailedCode, 'MISSING_INPUTS');
});

// ── 27. shortLogLine shape ─────────────────────────────────────────────

test('27. shortLogLine produces a greppable single-line trace', () => {
  const M = mover({ phoneVerified: false });
  const L = lead();
  const line = shortLogLine(diagnoseMatch(L, M));
  assert.match(line, /^\[MatcherDiagnose\] lead=lead-1 mover=mover-1 /);
  assert.match(line, /dashboard=true sms=false email=true/);
  assert.match(line, /firstFailed=phoneVerified code=PHONE_NOT_VERIFIED/);
});

// ── 28. PII redaction: phone is masked to last 4 ───────────────────────

test('28. Phone number is redacted to last 4 digits in trace evidence', () => {
  const M = mover({ phone: '5558675309' });
  const L = lead();
  const t = diagnoseMatch(L, M);
  const phoneGate = t.gates.find(g => g.gate === 'phoneVerified');
  assert.equal(phoneGate.evidence.phone, '***5309');
  assert.equal(t.inputs.mover.phone, '***5309');
});

// ── 29. Final composition: dashboard depends only on lifecycle + matcher
// ──     gates; channels do not influence dashboard
// ─────────────────────────────────────────────────────────────────────

test('29. Channel gates do not influence dashboardMatch', () => {
  const M = mover({
    phoneVerified: false, smsOptOut: true, emailOptOut: true,
    isSuspended: false,
  });
  const L = lead();
  const t = diagnoseMatch(L, M);
  assert.equal(t.final.dashboardMatch, true, 'dashboard match is independent of channel state');
  assert.equal(t.final.smsEligible, false);
  assert.equal(t.final.emailEligible, false);
});

// ── 30. Gate set sanity ────────────────────────────────────────────────

test('30. All 14 gates are present in every trace', () => {
  const t = diagnoseMatch(lead(), mover());
  const names = t.gates.map(g => g.gate);
  for (const expected of [
    'leadStatus', 'distributionDecision', 'auctionStatus', 'buyerExclusion',
    'origin', 'destination', 'distance', 'homeSize', 'moveType',
    'accountStatus', 'smsChannel', 'phoneVerified', 'dispatchHours', 'emailChannel',
  ]) {
    assert.ok(names.includes(expected), `gate '${expected}' missing from trace`);
  }
  assert.equal(t.gates.length, 14);
});

// ── 31. Drift-safety sweep across permutations ─────────────────────────

test('31. Drift-safety: diagnosis dashboardMatch === doesLeadMatchMoverPreferencesStrict across permutations', () => {
  // Sweep a small matrix of (mover, lead) configs to confirm the
  // diagnosis never diverges from the production strict matcher.
  const configs = [];
  for (const nationwide of [true, false]) {
    for (const dist of ['', 'Local', 'Long Distance']) {
      for (const moveTypes of [[], ['apartment'], ['home'], ['apartment', 'home', 'office']]) {
        for (const leadDist of ['Local', 'Long Distance']) {
          for (const leadSize of ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom']) {
            configs.push({
              M: mover({
                pickupStates: ['TX'],
                deliveryStates: nationwide ? [] : ['FL'],
                deliversNationwide: nationwide,
                maxDistance: dist,
                onboarding: { answers: { moveTypes } },
              }),
              L: lead({
                originState: 'TX', originZip: '75070',
                destinationState: 'FL', destinationZip: '34470',
                distance: leadDist,
                homeSize: leadSize,
              }),
            });
          }
        }
      }
    }
  }
  for (const { M, L } of configs) {
    // assertDashboardMatchesProductionMatcher throws if they drift.
    assertDashboardMatchesProductionMatcher(L, M);
  }
});

console.log('matcherDiagnosis tests scheduled.');
