// Matcher diagnosis — observability tool, not a matcher.
//
// `diagnoseMatch(lead, mover, opts)` returns a structured trace explaining,
// gate by gate, why a given (lead, mover) pair matches or doesn't match
// across the three production surfaces: dashboard badge, SMS broadcast,
// email broadcast.
//
// CRITICAL — this function MUST NOT replace, override, or feed back into
// any production matching path. It re-evaluates each gate using the same
// inputs the production matchers read, and the test suite enforces
// drift-safety: diagnoseMatch().final.dashboardMatch must always agree
// with doesLeadMatchMoverPreferencesStrict(). If those ever disagree, a
// test fails and the bug never reaches production.
//
// Surface:
//   - server/routes/admin/matcherDiagnose.js (admin-only endpoint)
//   - optional debug log on dispatch path, gated on
//     process.env.MATCHER_DIAGNOSE_LOG === '1'
//   - test fixtures in server/__tests__/matcherDiagnosis.test.js
//
// Pure function — no DB, no I/O. Caller pre-fetches coverage zips and
// passes them in opts. Same signature shape as the production matchers.

'use strict';

const { resolveMoverStates } = require('./leadMatching');
const { matchesMoveTypes, derivedMoveType, isWithinDispatchHours, wantsChannel } = require('./dispatchPolicy');
const { isDistributable } = require('./distributionDecision');

// ── Gate evaluators ───────────────────────────────────────────────────────
//
// Each evaluator is a small pure helper that returns:
//   { gate, pass: bool, code: 'STABLE_REASON_CODE', reason: 'human prose', evidence }
//
// Reason codes are stable identifiers — operators grep for them in logs
// and link tickets to them. Don't rename a code without a deprecation
// note; treat them as a public API surface.

// Lifecycle / availability gates.

function evalLeadStatus(lead) {
  // Dashboard query filters on { status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] } }.
  // Anything else is hidden from the mover feed regardless of preferences.
  const VISIBLE = ['Available', 'READY_FOR_DISTRIBUTION'];
  const status = lead?.status || 'Available';
  const pass = VISIBLE.includes(status);
  return {
    gate: 'leadStatus',
    pass,
    code: pass
      ? (status === 'Available' ? 'STATUS_AVAILABLE' : 'STATUS_READY_FOR_DISTRIBUTION')
      : (status === 'Purchased' ? 'STATUS_PURCHASED'
        : status === 'Expired' ? 'STATUS_EXPIRED'
        : status === 'REJECTED_FAKE' ? 'STATUS_REJECTED_FAKE'
        : 'STATUS_HIDDEN'),
    reason: pass
      ? `Lead.status='${status}' is in the visible set.`
      : `Lead.status='${status}' is not visible on the mover feed.`,
    evidence: { status },
  };
}

function evalDistributionDecision(lead) {
  // Single quality gate. Only 'system_approved' or 'admin_approved' are
  // distributable; everything else (system_pending, system_held,
  // system_rejected, admin_rejected) hides the lead.
  const decision = lead?.distributionDecision || 'system_pending';
  const pass = isDistributable(decision);
  const CODE = {
    system_approved:  'DECISION_SYSTEM_APPROVED',
    admin_approved:   'DECISION_ADMIN_APPROVED',
    system_pending:   'DECISION_SYSTEM_PENDING',
    system_held:      'DECISION_SYSTEM_HELD',
    system_rejected:  'DECISION_SYSTEM_REJECTED',
    admin_rejected:   'DECISION_ADMIN_REJECTED',
  };
  return {
    gate: 'distributionDecision',
    pass,
    code: CODE[decision] || 'DECISION_MISSING',
    reason: pass
      ? `Lead.distributionDecision='${decision}' is distributable.`
      : `Lead.distributionDecision='${decision}' is not distributable. ${lead?.distributionDecisionReason ? `(reason: ${lead.distributionDecisionReason})` : ''}`.trim(),
    evidence: {
      distributionDecision: decision,
      distributionDecisionReason: lead?.distributionDecisionReason || null,
      distributionDecisionBy: lead?.distributionDecisionBy || null,
    },
  };
}

function evalAuctionStatus(lead) {
  // Auctions are dormant in production (see auction-dormancy memory). Most
  // leads are instant-dispatch with auctionStatus='pending' or undefined,
  // and instant-buy-now leads operate independently of auction state.
  // Diagnosis treats 'sold' and 'expired' as terminal; everything else as
  // not-blocking.
  const status = lead?.auctionStatus || null;
  const BLOCKING = ['sold', 'expired'];
  const pass = !BLOCKING.includes(status);
  return {
    gate: 'auctionStatus',
    pass,
    code: status == null ? 'AUCTION_NOT_APPLICABLE'
        : status === 'sold' ? 'AUCTION_SOLD'
        : status === 'expired' ? 'AUCTION_EXPIRED'
        : status === 'active' ? 'AUCTION_ACTIVE'
        : status === 'settling' ? 'AUCTION_SETTLING'
        : 'AUCTION_PENDING',
    reason: pass
      ? (status ? `Lead.auctionStatus='${status}' does not block.` : 'No auction state on this lead (instant dispatch).')
      : `Lead.auctionStatus='${status}' is terminal — lead no longer dispatchable.`,
    evidence: { auctionStatus: status },
  };
}

function evalBuyerExclusion(lead, mover) {
  // Dashboard GET /api/leads explicitly excludes leads where this mover
  // is already a buyer ({ 'buyers.company': { $ne: req.user.id } }).
  const moverId = String(mover?._id || mover?.id || '');
  const buyers = Array.isArray(lead?.buyers) ? lead.buyers : [];
  const isOwner = !!moverId && buyers.some(b => b && b.company && String(b.company) === moverId);
  const buyersCount = buyers.length;
  return {
    gate: 'buyerExclusion',
    pass: !isOwner,
    code: isOwner ? 'ALREADY_OWNED_BY_THIS_MOVER'
        : buyersCount > 0 ? 'OWNED_BY_OTHER_MOVER_NOT_EXCLUSIVE'
        : 'NOT_YET_PURCHASED',
    reason: isOwner
      ? 'This mover already appears in Lead.buyers — dashboard hides leads they own.'
      : buyersCount > 0
        ? `Lead has ${buyersCount} other buyer(s) but this mover is not among them (multi-buyer lead still visible).`
        : 'Lead has no buyers yet.',
    evidence: { buyersCount, isOwner },
  };
}

// Coverage gates.

function evalOrigin(lead, mover, originZipSet) {
  const { pickup, usedLegacyFallback } = resolveMoverStates(mover || {});
  const originState = (lead?.originState || '').toUpperCase();
  const originZip = lead?.originZip ? String(lead.originZip) : null;
  const inPickup = !!(originState && pickup.has(originState));
  const inZipSet = !!(originZip && originZipSet instanceof Set && originZipSet.has(originZip));
  const pass = inPickup || inZipSet;
  if (!originState && !originZip) {
    return {
      gate: 'origin',
      pass: false,
      code: 'ORIGIN_NO_INFO',
      reason: 'Lead has no originState or originZip — cannot evaluate origin coverage.',
      evidence: { originState, originZip, pickupStates: Array.from(pickup).sort() },
    };
  }
  // Code-selection rule on failure: prefer the STATE-based code whenever
  // the lead has a state. ZIP fallback is only meaningful when the lead
  // lacks a state entirely. This keeps the failure reason aligned with
  // what the matcher actually evaluated first.
  return {
    gate: 'origin',
    pass,
    code: pass
      ? (inPickup
          ? (usedLegacyFallback ? 'ORIGIN_LEGACY_FALLBACK_USED' : 'ORIGIN_STATE_IN_PICKUP')
          : 'ORIGIN_ZIP_COVERED')
      : (originState ? 'ORIGIN_STATE_NOT_IN_PICKUP' : 'ORIGIN_ZIP_NOT_COVERED'),
    reason: pass
      ? (inPickup
          ? `Lead's originState='${originState}' is in mover's pickupStates${usedLegacyFallback ? ' (legacy serviceStates fallback)' : ''}.`
          : `Lead's originZip='${originZip}' is in mover's origin CoverageArea ZIPs.`)
      : `Lead's originState='${originState}'${originZip ? ` (zip ${originZip})` : ''} is not in mover's pickupStates or origin CoverageArea ZIPs.`,
    evidence: { originState, originZip, pickupStates: Array.from(pickup).sort(), inPickup, inZipSet },
  };
}

function evalDestination(lead, mover, destinationZipSet) {
  const { delivery, nationwide } = resolveMoverStates(mover || {});
  if (nationwide) {
    return {
      gate: 'destination',
      pass: true,
      code: 'DESTINATION_NATIONWIDE_PASS',
      reason: 'Mover.deliversNationwide=true — origin gate was the only destination check.',
      evidence: { deliversNationwide: true },
    };
  }
  const destState = (lead?.destinationState || '').toUpperCase();
  const destZip = lead?.destinationZip ? String(lead.destinationZip) : null;
  const inDelivery = !!(destState && delivery.has(destState));
  const inZipSet = !!(destZip && destinationZipSet instanceof Set && destinationZipSet.has(destZip));
  const pass = inDelivery || inZipSet;
  // Same code-selection rule as origin: prefer STATE-based code when the
  // lead has a state; ZIP code only when state is absent entirely.
  return {
    gate: 'destination',
    pass,
    code: pass
      ? (inDelivery ? 'DESTINATION_STATE_IN_DELIVERY' : 'DESTINATION_ZIP_COVERED')
      : (destState ? 'DESTINATION_STATE_NOT_IN_DELIVERY' : 'DESTINATION_ZIP_NOT_COVERED'),
    reason: pass
      ? (inDelivery
          ? `Lead's destinationState='${destState}' is in mover's deliveryStates.`
          : `Lead's destinationZip='${destZip}' is in mover's destination CoverageArea ZIPs.`)
      : `Lead's destinationState='${destState}'${destZip ? ` (zip ${destZip})` : ''} is not in mover's deliveryStates and mover does not deliver nationwide.`,
    evidence: { destState, destZip, deliveryStates: Array.from(delivery).sort(), deliversNationwide: false, inDelivery, inZipSet },
  };
}

// Matcher preference gates.

function evalDistance(lead, mover) {
  const distPref = (mover?.maxDistance || '').trim();
  const leadDist = lead?.distance || null;
  if (distPref !== 'Local' && distPref !== 'Long Distance') {
    return {
      gate: 'distance',
      pass: true,
      code: 'DISTANCE_NO_PREFERENCE',
      reason: "Mover.maxDistance='' (Both) — no distance filter applied.",
      evidence: { maxDistance: distPref, leadDistance: leadDist },
    };
  }
  const pass = leadDist === distPref;
  return {
    gate: 'distance',
    pass,
    code: pass
      ? (distPref === 'Local' ? 'DISTANCE_MATCHES_LOCAL' : 'DISTANCE_MATCHES_LONG')
      : (distPref === 'Local' ? 'DISTANCE_MISMATCH_WANTS_LOCAL' : 'DISTANCE_MISMATCH_WANTS_LONG'),
    reason: pass
      ? `Mover wants '${distPref}' moves and lead is '${leadDist}'.`
      : `Mover wants '${distPref}' moves but lead is '${leadDist}'.`,
    evidence: { maxDistance: distPref, leadDistance: leadDist },
  };
}

function evalHomeSize(lead, mover) {
  const sizes = Array.isArray(mover?.preferredHomeSizes) ? mover.preferredHomeSizes : [];
  if (sizes.length === 0) {
    return {
      gate: 'homeSize',
      pass: true,
      code: 'HOME_SIZE_NO_PREFERENCE',
      reason: 'Mover.preferredHomeSizes is empty — no home-size filter applied.',
      evidence: { preferredHomeSizes: sizes, leadHomeSize: lead?.homeSize || null },
    };
  }
  if (!lead?.homeSize) {
    return {
      gate: 'homeSize',
      pass: false,
      code: 'HOME_SIZE_MISSING_ON_LEAD',
      reason: 'Mover restricts by home size but lead has no homeSize field.',
      evidence: { preferredHomeSizes: sizes, leadHomeSize: null },
    };
  }
  const pass = sizes.includes(lead.homeSize);
  return {
    gate: 'homeSize',
    pass,
    code: pass ? 'HOME_SIZE_IN_PREFS' : 'HOME_SIZE_NOT_IN_PREFS',
    reason: pass
      ? `Lead homeSize='${lead.homeSize}' is in mover's preferredHomeSizes.`
      : `Lead homeSize='${lead.homeSize}' is not in mover's preferredHomeSizes [${sizes.join(', ')}].`,
    evidence: { preferredHomeSizes: sizes, leadHomeSize: lead.homeSize },
  };
}

function evalMoveType(lead, mover) {
  const prefs = mover?.onboarding?.answers?.moveTypes;
  const avoids = mover?.onboarding?.answers?.avoidMoveTypes;
  const derived = derivedMoveType(lead || {});
  if (!Array.isArray(prefs) || prefs.length === 0) {
    return {
      gate: 'moveType',
      pass: true,
      code: 'MOVE_TYPE_NO_PREFERENCE',
      reason: 'Mover.onboarding.answers.moveTypes is empty — no move-type filter applied.',
      evidence: { moveTypes: prefs || [], avoidMoveTypes: avoids || [], derived },
    };
  }
  if (!derived) {
    return {
      gate: 'moveType',
      pass: true,
      code: 'MOVE_TYPE_UNCLASSIFIED',
      reason: 'Lead cannot be classified into a moveType category — matcher treats this as permissive.',
      evidence: { moveTypes: prefs, avoidMoveTypes: avoids || [], derived: null, homeSize: lead?.homeSize || null, leadMoveType: lead?.moveType || null },
    };
  }
  if (Array.isArray(avoids) && avoids.includes(derived)) {
    return {
      gate: 'moveType',
      pass: false,
      code: 'MOVE_TYPE_IN_AVOIDS',
      reason: `Lead's derived move type '${derived}' is in mover's avoidMoveTypes.`,
      evidence: { moveTypes: prefs, avoidMoveTypes: avoids, derived },
    };
  }
  const pass = prefs.includes(derived);
  return {
    gate: 'moveType',
    pass,
    code: pass ? 'MOVE_TYPE_IN_PREFS' : 'MOVE_TYPE_NOT_IN_PREFS',
    reason: pass
      ? `Lead's derived move type '${derived}' is in mover's moveTypes preference.`
      : `Lead's derived move type '${derived}' is not in mover's moveTypes [${prefs.join(', ')}].`,
    evidence: { moveTypes: prefs, avoidMoveTypes: avoids || [], derived },
  };
}

// Channel gates.

function evalAccountStatus(mover) {
  const suspended = mover?.isSuspended === true;
  return {
    gate: 'accountStatus',
    pass: !suspended,
    code: suspended ? 'SUSPENDED' : 'ACTIVE',
    reason: suspended
      ? 'Mover.isSuspended=true — broadcasts and dispatch are blocked for this account.'
      : 'Mover account is active.',
    evidence: { isSuspended: !!suspended },
  };
}

function evalSmsChannel(mover) {
  // 2026-05-28 — PR-C3: codes simplified.
  // Before: SMS_OPTED_IN_VIA_ALERTCHANNELS / _VIA_LEGACY / SMS_NOT_IN_ALERTCHANNELS / SMS_OPTED_OUT_LEGACY.
  // After:  SMS_OPTED_IN / SMS_OPTED_OUT — since alertChannels no longer
  //         influences dispatch (PR-C3 retired the precedence in
  //         dispatchPolicy.wantsChannel), the "via X" distinction is
  //         meaningless. SMS_HARD_OPT_OUT is preserved — smsOptOut is a
  //         separate TCPA-grade gate that pre-empts the channel toggle.
  const optedOut = mover?.smsOptOut === true;
  if (optedOut) {
    return {
      gate: 'smsChannel',
      pass: false,
      code: 'SMS_HARD_OPT_OUT',
      reason: 'Mover.smsOptOut=true — SMS dispatch hard-blocked (carrier opt-out / STOP keyword).',
      evidence: { smsOptOut: true, smsNotif: !!mover?.smsNotif },
    };
  }
  const wants = wantsChannel(mover || {}, 'sms');
  return {
    gate: 'smsChannel',
    pass: wants,
    code: wants ? 'SMS_OPTED_IN' : 'SMS_OPTED_OUT',
    reason: wants
      ? 'Mover.smsNotif=true.'
      : 'Mover.smsNotif=false — SMS dispatch suppressed.',
    evidence: { wantsSms: wants, smsNotif: !!mover?.smsNotif, smsOptOut: false },
  };
}

function evalPhoneVerified(mover) {
  // TCPA-grade hard gate. broadcastLeadSMS filters on phoneVerified=true
  // (twilioService.js candidate query). A mover with phone but not verified
  // can't receive SMS broadcasts.
  const hasPhone = !!(mover?.phone && String(mover.phone).trim());
  const verified = mover?.phoneVerified === true;
  if (!hasPhone) {
    return {
      gate: 'phoneVerified',
      pass: false,
      code: 'PHONE_MISSING',
      reason: 'Mover has no phone number on file — SMS dispatch impossible.',
      evidence: { phone: null, phoneVerified: false },
    };
  }
  return {
    gate: 'phoneVerified',
    pass: verified,
    code: verified ? 'PHONE_VERIFIED' : 'PHONE_NOT_VERIFIED',
    reason: verified
      ? `Phone verified${mover?.phoneVerifiedAt ? ` at ${new Date(mover.phoneVerifiedAt).toISOString()}` : ''}.`
      : 'Mover.phoneVerified=false — SMS dispatch hard-gated by TCPA requirement.',
    evidence: { phone: redactPhone(mover.phone), phoneVerified: verified, phoneVerifiedAt: mover?.phoneVerifiedAt || null },
  };
}

function evalDispatchHours(mover, now) {
  // isWithinDispatchHours is permissive for unconfigured users (returns true).
  // Email/socket bypass; we only call this for SMS.
  const within = isWithinDispatchHours(mover || {}, 'sms', now || new Date());
  const answers = mover?.onboarding?.answers || {};
  const configured = !!answers.dispatchHoursMode;
  if (!configured) {
    return {
      gate: 'dispatchHours',
      pass: true,
      code: 'HOURS_NOT_CONFIGURED_PERMISSIVE',
      reason: 'No dispatchHoursMode set — treated as 24/7 (permissive default).',
      evidence: { dispatchHoursMode: null },
    };
  }
  return {
    gate: 'dispatchHours',
    pass: within,
    code: within ? 'WITHIN_HOURS' : 'OUTSIDE_HOURS_SMS',
    reason: within
      ? 'Current time falls within configured SMS dispatch window.'
      : 'Current time is outside the configured SMS dispatch window.',
    evidence: {
      dispatchHoursMode: answers.dispatchHoursMode,
      dispatchHoursOpen: answers.dispatchHoursOpen || null,
      dispatchHoursClose: answers.dispatchHoursClose || null,
      dispatchDays: Array.isArray(answers.dispatchDays) ? answers.dispatchDays : null,
      evaluatedAt: (now || new Date()).toISOString(),
    },
  };
}

function evalEmailChannel(mover) {
  // 2026-05-28 — PR-C3: same simplification as evalSmsChannel.
  const optedOut = mover?.emailOptOut === true;
  if (optedOut) {
    return {
      gate: 'emailChannel',
      pass: false,
      code: 'EMAIL_HARD_OPT_OUT',
      reason: 'Mover.emailOptOut=true — email dispatch hard-blocked.',
      evidence: { emailOptOut: true, emailNotif: !!mover?.emailNotif },
    };
  }
  const wants = wantsChannel(mover || {}, 'email');
  return {
    gate: 'emailChannel',
    pass: wants,
    code: wants ? 'EMAIL_OPTED_IN' : 'EMAIL_OPTED_OUT',
    reason: wants
      ? 'Mover.emailNotif=true.'
      : 'Mover.emailNotif=false — email dispatch suppressed.',
    evidence: { wantsEmail: wants, emailNotif: !!mover?.emailNotif, emailOptOut: false },
  };
}

// ── Compose ──────────────────────────────────────────────────────────────

// Gate group definitions — keep these in sync with how the production
// routes compose final decisions (see audit table in PR-D1 description).
const DASHBOARD_GATES = ['leadStatus', 'distributionDecision', 'auctionStatus', 'buyerExclusion',
                         'origin', 'destination', 'distance', 'homeSize', 'moveType'];
const SMS_GATES   = ['accountStatus', 'smsChannel', 'phoneVerified', 'dispatchHours'];
const EMAIL_GATES = ['accountStatus', 'emailChannel'];

/**
 * Diagnose a (lead, mover) pair.
 *
 * @param {Object} lead   Lead doc / lean object
 * @param {Object} mover  User doc / lean object (mover)
 * @param {Object} [opts]
 * @param {Set<string>|Array<string>} [opts.originZipSet]
 * @param {Set<string>|Array<string>} [opts.destinationZipSet]
 * @param {boolean} [opts.strictMode]  Which matcher would be authoritative
 *                                     (defaults to true — strict is on in prod)
 * @param {Date}    [opts.now]         For dispatchHours evaluation
 * @returns {object} Trace; see PR-D1 for the schema.
 */
function diagnoseMatch(lead, mover, opts = {}) {
  const evaluatedAt = (opts.now || new Date()).toISOString();
  const originZipSet      = opts.originZipSet      instanceof Set ? opts.originZipSet      : new Set(opts.originZipSet      || []);
  const destinationZipSet = opts.destinationZipSet instanceof Set ? opts.destinationZipSet : new Set(opts.destinationZipSet || []);
  const matcherMode = opts.strictMode === false ? 'legacy' : 'strict';

  // Defensive — null inputs short-circuit to a "cannot evaluate" trace.
  if (!lead || !mover) {
    return {
      leadId: lead?._id ? String(lead._id) : null,
      moverId: mover?._id ? String(mover._id) : null,
      evaluatedAt,
      matcherMode,
      inputs: { lead: null, mover: null, coverage: null },
      gates: [],
      final: {
        dashboardMatch: false,
        smsEligible: false,
        emailEligible: false,
        firstFailedGate: 'inputs',
        firstFailedCode: 'MISSING_INPUTS',
        summary: { dashboard: 'Lead or mover missing — cannot diagnose.', sms: '', email: '' },
      },
    };
  }

  const gates = [
    evalLeadStatus(lead),
    evalDistributionDecision(lead),
    evalAuctionStatus(lead),
    evalBuyerExclusion(lead, mover),
    evalOrigin(lead, mover, originZipSet),
    evalDestination(lead, mover, destinationZipSet),
    evalDistance(lead, mover),
    evalHomeSize(lead, mover),
    evalMoveType(lead, mover),
    evalAccountStatus(mover),
    evalSmsChannel(mover),
    evalPhoneVerified(mover),
    evalDispatchHours(mover, opts.now),
    evalEmailChannel(mover),
  ];
  const byGate = Object.fromEntries(gates.map(g => [g.gate, g]));

  const dashboardMatch = DASHBOARD_GATES.every(name => byGate[name]?.pass);
  const smsEligible    = dashboardMatch && SMS_GATES.every(name => byGate[name]?.pass);
  const emailEligible  = dashboardMatch && EMAIL_GATES.every(name => byGate[name]?.pass);

  const firstFailed = gates.find(g => !g.pass) || null;

  return {
    leadId: lead?._id ? String(lead._id) : null,
    moverId: mover?._id ? String(mover._id) : null,
    evaluatedAt,
    matcherMode,
    inputs: {
      lead: pickLeadInputs(lead),
      mover: pickMoverInputs(mover),
      coverage: {
        originZipsCovered: originZipSet.size > 0,
        destinationZipsCovered: destinationZipSet.size > 0,
        hasCoverageAreaDocs: originZipSet.size > 0 || destinationZipSet.size > 0,
      },
    },
    gates,
    final: {
      dashboardMatch,
      smsEligible,
      emailEligible,
      firstFailedGate: firstFailed?.gate || null,
      firstFailedCode: firstFailed?.code || null,
      summary: buildSummary({ byGate, dashboardMatch, smsEligible, emailEligible }),
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function buildSummary({ byGate, dashboardMatch, smsEligible, emailEligible }) {
  // Dashboard summary: prose chain of gates, OR the first failing reason.
  const dashboardFailed = DASHBOARD_GATES.map(n => byGate[n]).find(g => g && !g.pass);
  const dashboard = dashboardMatch
    ? [byGate.origin?.reason, byGate.destination?.reason, byGate.distance?.reason, byGate.homeSize?.reason, byGate.moveType?.reason]
        .filter(Boolean).join(' ')
    : `Rejected at ${dashboardFailed.gate} gate: ${dashboardFailed.reason}`;

  const smsFailed = SMS_GATES.map(n => byGate[n]).find(g => g && !g.pass);
  const sms = !dashboardMatch
    ? `Not an eligible dashboard match (${dashboardFailed?.gate}).`
    : smsEligible
      ? `Eligible: ${byGate.smsChannel?.reason} ${byGate.phoneVerified?.reason} ${byGate.dispatchHours?.reason}`.trim()
      : `Eligible dashboard match BUT ${smsFailed?.reason}`;

  const emailFailed = EMAIL_GATES.map(n => byGate[n]).find(g => g && !g.pass);
  const email = !dashboardMatch
    ? `Not an eligible dashboard match (${dashboardFailed?.gate}).`
    : emailEligible
      ? `Eligible: ${byGate.emailChannel?.reason}`
      : `Eligible dashboard match BUT ${emailFailed?.reason}`;

  return { dashboard, sms, email };
}

function pickLeadInputs(lead) {
  return {
    _id: lead._id ? String(lead._id) : null,
    status: lead.status || null,
    distributionDecision: lead.distributionDecision || null,
    distributionDecisionReason: lead.distributionDecisionReason || null,
    auctionStatus: lead.auctionStatus || null,
    originCity: lead.originCity || null,
    originState: lead.originState || null,
    originZip: lead.originZip || null,
    destinationCity: lead.destinationCity || null,
    destinationState: lead.destinationState || null,
    destinationZip: lead.destinationZip || null,
    distance: lead.distance || null,
    miles: lead.miles || null,
    homeSize: lead.homeSize || null,
    moveType: lead.moveType || null,
    buyersCount: Array.isArray(lead.buyers) ? lead.buyers.length : 0,
    moveDate: lead.moveDate || null,
  };
}

function pickMoverInputs(mover) {
  const answers = mover.onboarding?.answers || {};
  return {
    _id: mover._id ? String(mover._id) : null,
    pickupStates: Array.isArray(mover.pickupStates) ? mover.pickupStates : [],
    deliveryStates: Array.isArray(mover.deliveryStates) ? mover.deliveryStates : [],
    deliversNationwide: !!mover.deliversNationwide,
    interstateEnabled: !!mover.interstateEnabled,
    maxDistance: mover.maxDistance || '',
    preferredHomeSizes: Array.isArray(mover.preferredHomeSizes) ? mover.preferredHomeSizes : [],
    smsNotif: !!mover.smsNotif,
    emailNotif: !!mover.emailNotif,
    phone: redactPhone(mover.phone),
    phoneVerified: !!mover.phoneVerified,
    smsOptOut: !!mover.smsOptOut,
    emailOptOut: !!mover.emailOptOut,
    isSuspended: !!mover.isSuspended,
    onboarding: {
      moveTypes: Array.isArray(answers.moveTypes) ? answers.moveTypes : [],
      avoidMoveTypes: Array.isArray(answers.avoidMoveTypes) ? answers.avoidMoveTypes : [],
      alertChannels: Array.isArray(answers.alertChannels) ? answers.alertChannels : [],
      dispatchHoursMode: answers.dispatchHoursMode || null,
      dispatchHoursOpen: answers.dispatchHoursOpen || null,
      dispatchHoursClose: answers.dispatchHoursClose || null,
      dispatchDays: Array.isArray(answers.dispatchDays) ? answers.dispatchDays : [],
    },
  };
}

function redactPhone(phone) {
  // Keep last 4 digits visible — enough to confirm "yes, that's my number"
  // without leaking the full identifier in a trace.
  if (!phone) return null;
  const s = String(phone).replace(/\D/g, '');
  if (s.length < 4) return '***';
  return `***${s.slice(-4)}`;
}

/**
 * Convenience: short one-line trace summary for log streams.
 * Used by the optional MATCHER_DIAGNOSE_LOG=1 debug-log path.
 */
function shortLogLine(trace) {
  if (!trace) return '';
  const f = trace.final || {};
  return `[MatcherDiagnose] lead=${trace.leadId || '?'} mover=${trace.moverId || '?'} ` +
         `dashboard=${f.dashboardMatch} sms=${f.smsEligible} email=${f.emailEligible} ` +
         `firstFailed=${f.firstFailedGate || '-'} code=${f.firstFailedCode || '-'}`;
}

module.exports = {
  diagnoseMatch,
  shortLogLine,
  // Exported so tests can pin individual gate behavior without re-running
  // the whole pipeline. Not part of the public API surface for callers.
  __internals: {
    evalLeadStatus,
    evalDistributionDecision,
    evalAuctionStatus,
    evalBuyerExclusion,
    evalOrigin,
    evalDestination,
    evalDistance,
    evalHomeSize,
    evalMoveType,
    evalAccountStatus,
    evalSmsChannel,
    evalPhoneVerified,
    evalDispatchHours,
    evalEmailChannel,
    DASHBOARD_GATES,
    SMS_GATES,
    EMAIL_GATES,
  },
};
