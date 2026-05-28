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

const DEFAULT_RECOMMENDED_BALANCE = 500;

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
  const a = user?.onboarding?.answers || {};
  const coverageConfigured =
    (a.coverageMode === 'states' && Array.isArray(a.coverageStates?.states) && a.coverageStates.states.length > 0) ||
    (a.coverageMode === 'nationwide') ||
    (a.coverageMode === 'same') ||
    (Array.isArray(a.additionalMarkets) && a.additionalMarkets.length > 0) ||
    !!a.primaryMarket;
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

function buildOnboardingPreview(user) {
  // 2026-05-28 — PR-C3: `alertChannels` dropped from the preview payload.
  // 2026-05-28 — PR-C4: `moveTypes` dropped from the preview payload too,
  // for the same reason: the dispatch read was retired, so surfacing the
  // stored array would imply it still influences dispatch when it doesn't.
  const a = user?.onboarding?.answers || {};
  return {
    primaryMarket:       a.primaryMarket || '',
    coverageRadius:      a.coverageRadius || '',
    coverageMode:        a.coverageMode || '',
    dispatchHoursOpen:   a.dispatchHoursOpen || '',
    dispatchHoursClose:  a.dispatchHoursClose || '',
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
      onboardingPreview:  buildOnboardingPreview(user),
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
// Body shape (all keys optional; unknown keys rejected):
//   { optInRequested?: boolean,
//     maxLeadPrice?:   number  (10..500),
//     residentialOnly?: boolean,
//     commercialOptIn?: boolean,
//     asapOnly?:       boolean,
//     dailyClaimCap?:  integer (0..100) }
//
// Status is NEVER writable by the client.
router.patch('/', async (req, res) => {
  const body = req.body || {};
  const allowed = new Set(['optInRequested', 'maxLeadPrice', 'residentialOnly', 'commercialOptIn', 'asapOnly', 'dailyClaimCap']);

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
  if ('maxLeadPrice' in body) {
    const n = Number(body.maxLeadPrice);
    if (!Number.isFinite(n) || n < 10 || n > 500) return res.status(400).json({ msg: 'maxLeadPrice must be between 10 and 500' });
    set['smsClaim.maxLeadPrice'] = n;
  }
  for (const k of ['residentialOnly', 'commercialOptIn', 'asapOnly']) {
    if (k in body) {
      if (typeof body[k] !== 'boolean') return res.status(400).json({ msg: `${k} must be a boolean` });
      set[`smsClaim.${k}`] = body[k];
    }
  }
  if ('dailyClaimCap' in body) {
    const n = Number(body.dailyClaimCap);
    if (!Number.isInteger(n) || n < 0 || n > 100) return res.status(400).json({ msg: 'dailyClaimCap must be an integer 0..100' });
    set['smsClaim.dailyClaimCap'] = n;
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
      onboardingPreview: buildOnboardingPreview(updated),
    });
  } catch (err) {
    console.error('[SmsClaim] PATCH error', err);
    return res.status(500).json({ msg: 'Could not update SMS Claim preferences.' });
  }
});

module.exports = router;
