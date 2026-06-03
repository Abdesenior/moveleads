const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PlatformSettings = require('../models/PlatformSettings');

/*
 * SMS Claim / Instant Jobs — preview-only activation endpoint.
 *
 * Mounted at /api/users/me/sms-claim. Lets a mover express interest in
 * future SMS Claim mode and set its preferences. The endpoint is
 * COMPLETELY DECOUPLED from the live request path:
 *
 *   - It does NOT change the live SMS broadcast (twilioService.broadcastLeadSMS).
 *     Normal SMS notifications are gated by `smsNotif` / `alertChannels`,
 *     not by smsClaim.* — that wiring is untouched.
 *   - It does NOT enable any claim window, generate any token, or write
 *     any ClaimAttempt row.
 *   - It does NOT deduct balance.
 *   - It does NOT release customer PII.
 *
 * Status is server-derived on every GET/PATCH; the client cannot set it.
 * If a mover dips below the recommended balance later, status flips back
 * to 'needs_balance' but optInRequested + preferences are preserved.
 *
 * Auth: server.js mounts under verifiedGate (auth + requireEmailVerified).
 */

// 2026-05-30 — Lowered from $500 to $200. The prior threshold created
// activation friction at the first-time-mover stage: a pilot mover with
// $50 starter + $50 bonus = $100 balance saw the "Enough balance" check
// fail on the SmsClaim page despite being eligible to claim multiple
// real leads. $200 covers ~5 average-priced claims in current pricing
// and stays a meaningful recommendation without blocking opt-in.
//
// This is a UI-side recommendation only. The per-claim eligibility check
// in twilioService.js stays `balance >= buyNowPrice` (per-lead, not
// against this threshold) — see [twilioService.js eligibility partition].
//
// Override via PlatformSettings.config.smsClaim.recommendedBalance if
// the operator wants a per-environment value.
const DEFAULT_RECOMMENDED_BALANCE = 200;

const STATUS_INACTIVE         = 'inactive';
const STATUS_NEEDS_BALANCE    = 'needs_balance';
const STATUS_PREVIEW_ENABLED  = 'preview_enabled';

function computeStatus(optInRequested, balance, recommended) {
  if (!optInRequested) return STATUS_INACTIVE;
  if (Number(balance || 0) < Number(recommended || 0)) return STATUS_NEEDS_BALANCE;
  return STATUS_PREVIEW_ENABLED;
}

async function recommendedBalance() {
  try {
    const s = await PlatformSettings.findOne().lean();
    const v = Number(s?.config?.smsClaim?.recommendedBalance);
    if (Number.isFinite(v) && v > 0) return v;
  } catch (_e) { /* fall through */ }
  return DEFAULT_RECOMMENDED_BALANCE;
}

function buildReadiness(user, balance, recommended) {
  // 2026-05-28 — Coverage source-of-truth fix.
  //
  // Previously this read `user.onboarding.answers.coverageMode` / `.coverageStates`
  // / `.additionalMarkets` / `.primaryMarket` — the legacy onboarding-wizard
  // fields. Settings → Service Areas does NOT write those; it writes the
  // top-level `pickupStates` / `deliveryStates` / `deliversNationwide` /
  // `maxDistance` fields (with a structured `onboarding.answers.pickup.*`
  // mirror, but NOT the flat legacy fields).
  //
  // Result before the fix: a mover who configured pickup=AL in Settings
  // would still see "Coverage area not set" on the SmsClaim readiness
  // checklist — because the legacy flat fields stayed empty. The dispatch
  // matcher itself read the canonical fields correctly, so this was a
  // UI fidelity bug, not a behavior bug.
  //
  // Coverage is "configured" iff the mover has at least one pickup state
  // selected. Delivery coverage can be either a state list OR nationwide;
  // either alone is fine for "set". We require BOTH legs (pickup + some
  // form of delivery) so a partially-configured mover is still flagged.
  const pickupConfigured = Array.isArray(user?.pickupStates) && user.pickupStates.length > 0;
  const deliveryConfigured = user?.deliversNationwide === true
    || (Array.isArray(user?.deliveryStates) && user.deliveryStates.length > 0);
  const coverageConfigured = pickupConfigured && deliveryConfigured;
  const a = user?.onboarding?.answers || {};
  // Dispatch hours canonical storage stayed at `onboarding.answers.*`
  // by intent (PR-C2 chose schema-compat over migration). The PATCH at
  // /api/users/me/dispatch-hours writes these. So this read is canonical;
  // unchanged from before.
  const dispatchHoursConfigured =
    !!a.dispatchHoursOpen && !!a.dispatchHoursClose;
  // 2026-05-28 — PR-C4: moveTypesConfigured dropped. The dispatch gate
  // it tracked has been retired (matchesMoveTypes is now permissive),
  // so surfacing this as a readiness condition would imply it still
  // affects SMS Claim eligibility — it doesn't.
  return {
    balance:            Number(balance || 0),
    recommendedBalance: recommended,
    balanceMet:         Number(balance || 0) >= recommended,
    phoneVerified:      user?.phoneVerified === true,
    smsOptOut:          user?.smsOptOut === true,
    // 2026-05-28 — PR-C3: alertChannels no longer influences dispatch, so
    // the readiness checklist mirrors Settings authority — legacy
    // smsNotif is the sole truth here too.
    smsNotifEnabled:    user?.smsNotif === true,
    coverageConfigured,
    dispatchHoursConfigured,
  };
}

function buildCoveragePreview(user) {
  // 2026-05-28 — Coverage source-of-truth fix. Replaces the old
  // buildOnboardingPreview() which read `user.onboarding.answers.coverageMode`
  // / `.coverageStates` / `.primaryMarket` / `.coverageRadius` — legacy
  // onboarding-wizard fields that Settings → Service Areas does NOT touch.
  //
  // Returns the CURRENT canonical Settings configuration:
  //   - pickupStates       : array of 2-letter USPS codes
  //   - deliveryStates     : array of 2-letter USPS codes
  //   - deliversNationwide : boolean (true → deliveryStates is conventionally empty)
  //   - maxDistance        : '' | 'Local' | 'Long Distance'
  //   - dispatchHoursOpen  : 'HH:MM' string (PR-C2 canonical, kept)
  //   - dispatchHoursClose : 'HH:MM' string (PR-C2 canonical, kept)
  //
  // Naming: the response key is `coveragePreview` (not `onboardingPreview`);
  // the heading on the SmsClaim page is "Current alert coverage" so the
  // operator sees the truth, not a stale onboarding snapshot.
  const a = user?.onboarding?.answers || {};
  return {
    pickupStates:       Array.isArray(user?.pickupStates) ? user.pickupStates.slice() : [],
    deliveryStates:     Array.isArray(user?.deliveryStates) ? user.deliveryStates.slice() : [],
    deliversNationwide: user?.deliversNationwide === true,
    maxDistance:        user?.maxDistance || '',
    dispatchHoursOpen:  a.dispatchHoursOpen || '',
    dispatchHoursClose: a.dispatchHoursClose || '',
  };
}

function shapeSmsClaim(user, recommended) {
  const sc = user.smsClaim || {};
  const status = computeStatus(!!sc.optInRequested, user.balance, recommended);
  return {
    status,
    optInRequested: !!sc.optInRequested,
    preferences: {
      maxLeadPrice:    Number.isFinite(sc.maxLeadPrice)    ? sc.maxLeadPrice    : 100,
      residentialOnly: sc.residentialOnly !== false,         // default true
      commercialOptIn: sc.commercialOptIn === true,
      asapOnly:        sc.asapOnly === true,
      dailyClaimCap:   Number.isFinite(sc.dailyClaimCap)   ? sc.dailyClaimCap   : 0,
    },
    optInAt:       sc.optInAt || null,
    lastUpdatedAt: sc.lastUpdatedAt || null,
  };
}

// ── GET /api/users/me/sms-claim ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const recommended = await recommendedBalance();
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ msg: 'User not found.' });

    const smsClaim = shapeSmsClaim(user, recommended);
    return res.json({
      ...smsClaim,
      readiness:          buildReadiness(user, user.balance, recommended),
      coveragePreview:    buildCoveragePreview(user),
      copy: {
        badgeText:       'Preview / Early Access',
        activationLabel: 'Activate Instant Jobs (preview)',
      },
    });
  } catch (err) {
    console.error('[SmsClaim] GET error', err);
    return res.status(500).json({ msg: 'Could not load SMS Claim state.' });
  }
});

// ── PATCH /api/users/me/sms-claim ────────────────────────────────────────
// Body shape (unknown keys rejected):
//   { optInRequested?: boolean }
//
// 2026-06-03 — the retired SMS Claim prefs (maxLeadPrice, residentialOnly,
// commercialOptIn, asapOnly, dailyClaimCap) are no longer accepted here.
// Dispatch only reads `optInRequested` (retire-the-read,
// sms-claim-prelive-hardening); this narrows the WRITE path to match so the
// schema can't accumulate prefs that nothing consumes. The schema fields
// stay defined (dormant) per dormant-vs-deprecated discipline — re-exposing
// any of them must re-add both the read AND a UI surface.
//
// Status is NEVER writable by the client.
router.patch('/', async (req, res) => {
  const body = req.body || {};
  const allowed = new Set(['optInRequested']);

  // Reject unknown keys early so accidental "status" writes are caught.
  for (const k of Object.keys(body)) {
    if (!allowed.has(k)) {
      return res.status(400).json({ msg: `Unknown field: ${k}` });
    }
  }

  // Type + range validation.
  const set = {};
  if ('optInRequested' in body) {
    if (typeof body.optInRequested !== 'boolean') return res.status(400).json({ msg: 'optInRequested must be a boolean' });
    set['smsClaim.optInRequested'] = body.optInRequested;
  }

  try {
    const recommended = await recommendedBalance();
    const existing = await User.findById(req.user.id).lean();
    if (!existing) return res.status(404).json({ msg: 'User not found.' });

    // Determine optInAt transitions before applying. If optInRequested
    // transitions false → true, stamp optInAt. true → false clears it.
    const wasOptedIn = !!existing.smsClaim?.optInRequested;
    const newOptedIn = ('optInRequested' in body) ? body.optInRequested : wasOptedIn;
    if (!wasOptedIn && newOptedIn) set['smsClaim.optInAt'] = new Date();
    if (wasOptedIn && !newOptedIn) set['smsClaim.optInAt'] = null;

    // Recompute server-derived status from the FINAL state.
    const projectedOptIn = newOptedIn;
    set['smsClaim.status']        = computeStatus(projectedOptIn, existing.balance, recommended);
    set['smsClaim.lastUpdatedAt'] = new Date();

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { $set: set },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) return res.status(404).json({ msg: 'User not found.' });

    const smsClaim = shapeSmsClaim(updated, recommended);
    return res.json({
      ...smsClaim,
      readiness:         buildReadiness(updated, updated.balance, recommended),
      coveragePreview:   buildCoveragePreview(updated),
    });
  } catch (err) {
    console.error('[SmsClaim] PATCH error', err);
    return res.status(500).json({ msg: 'Could not update SMS Claim preferences.' });
  }
});

module.exports = router;
