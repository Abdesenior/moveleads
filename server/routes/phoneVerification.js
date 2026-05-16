/**
 * Phone verification routes — Phase 1 backend capability.
 *
 * Three endpoints, all mounted under `/api/users/me/phone/*` behind the
 * standard verifiedGate (auth + requireEmailVerified). Phone verification
 * is a capability gate for SMS alerts + SMS Claim — it is NOT a dashboard-
 * access gate. Movers can use the dashboard, manage settings, claim leads
 * via the marketplace UI without phone verification; verification only
 * unlocks the SMS channel.
 *
 * Endpoints:
 *   POST /send-verification  — creates a Twilio Verify code, SMS dispatched
 *   POST /verify-code        — validates the user's typed code, flips
 *                              User.phoneVerified=true on approval
 *   GET  /status             — convenience: current verification + cooldown
 *
 * The verification flow itself is owned by Twilio Verify — we do not
 * generate codes, hash them, track attempts, or manage expiry. We only
 * own:
 *   - the resolved phone (must equal req.user.phone — never user-supplied)
 *   - cooldown between sends (60s)
 *   - daily send cap (10/24h, UTC-day-aligned)
 *   - per-IP rate limit (existing express-rate-limit pattern)
 *   - uniqueness gate (one verified phone per account, app-level)
 *   - the atomic flip of phoneVerified true in the success branch
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const User = require('../models/User');
const { auth, requireEmailVerified } = require('../middleware/auth');
const {
  toE164US,
  applyPhoneChange: _applyPhoneChange,  // eslint-disable-line no-unused-vars
  utcDayKey,
  inspectDailyCounter,
  cooldownRemainingSec,
  COOLDOWN_MS,
  DAILY_SEND_CAP,
} = require('../utils/phoneVerification');
const { sendVerification, checkVerification, isVerifyConfigured } = require('../services/twilioVerifyService');

// Per-IP rate limits. Per-user limits (cooldown + daily cap) are enforced
// in the handler against User document state — those are the real defense.
// The IP limits exist purely to absorb misbehaving clients before they hit
// the DB.
const sendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1h
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ip_rate_limit', message: 'Too many verification requests from your network.' },
});

const verifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1h
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ip_rate_limit', message: 'Too many verification attempts from your network.' },
});

// ── POST /send-verification ──────────────────────────────────────────────
//
// Triggers Twilio Verify to send a 6-digit code via SMS to the mover's
// currently-stored phone number. The phone is always taken from
// req.user.phone — clients never supply it in the body.
//
// Pre-flight order (cheap to expensive):
//   1. Phone present + parseable
//   2. Phone not already verified on a DIFFERENT account
//   3. Cooldown elapsed since last send
//   4. Daily cap not exceeded
//   5. Twilio Verify call
//   6. On success: update User.phoneVerificationLastSentAt + daily counter
router.post('/send-verification', sendLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      'phone phoneVerified phoneVerifiedAt phoneVerificationLastSentAt phoneVerificationSendsToday'
    );
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    // 1. Phone shape
    const e164 = toE164US(user.phone);
    if (!e164) {
      return res.status(400).json({
        error: 'no_phone_on_file',
        message: 'Add a valid US phone number to your profile before verifying.',
      });
    }

    // 2. Uniqueness gate. Only verified phones are unique-locked across
    //    accounts — multiple unverified accounts may share a typo, but only
    //    one account at a time can hold the verified status for a given
    //    number. We re-check inside the success branch of /verify-code so
    //    the very-rare race (two concurrent verifications of the same
    //    number) cannot leave both accounts verified.
    const conflict = await User.findOne({
      _id: { $ne: req.user.id },
      phone: user.phone,
      phoneVerified: true,
    }).select('_id').lean();
    if (conflict) {
      return res.status(409).json({
        error: 'phone_in_use',
        message: 'This number is already verified on another account.',
      });
    }

    // 3. Cooldown
    const cooldownLeft = cooldownRemainingSec(user);
    if (cooldownLeft > 0) {
      return res.status(429).json({
        error: 'cooldown_active',
        retryAfterSec: cooldownLeft,
        message: `Please wait ${cooldownLeft}s before requesting another code.`,
      });
    }

    // 4. Daily send cap
    const dailyState = inspectDailyCounter(user);
    if (dailyState.atCap) {
      return res.status(429).json({
        error: 'daily_limit',
        message: `Daily verification request limit reached (${DAILY_SEND_CAP}/day). Try again tomorrow.`,
      });
    }

    // 5. Twilio call
    const result = await sendVerification(e164);
    if (!result.ok) {
      if (result.skipped) {
        return res.status(503).json({
          error: 'verify_service_unavailable',
          message: 'Verification service is briefly unavailable. Please try again in a few minutes.',
        });
      }
      if (result.error === 'twilio_rate_limit') {
        return res.status(429).json({ error: 'twilio_rate_limit', message: 'Twilio rate limit reached. Try again later.' });
      }
      if (result.error === 'invalid_phone') {
        return res.status(400).json({ error: 'invalid_phone_format', message: 'Twilio rejected the phone number.' });
      }
      console.error('[phoneVerification] sendVerification unknown error:', result);
      return res.status(502).json({ error: 'verify_service_error', message: 'Verification service error. Please try again.' });
    }

    // 6. Update counters + cooldown timestamp atomically. Compute the new
    //    daily counter against the read-side state we already have.
    const now = new Date();
    const today = utcDayKey(now);
    const sameDay = (user.phoneVerificationSendsToday?.dayKey === today);
    const nextCount = sameDay ? (Number(user.phoneVerificationSendsToday.count || 0) + 1) : 1;

    await User.updateOne(
      { _id: req.user.id },
      { $set: {
          phoneVerificationLastSentAt: now,
          phoneVerificationSendsToday: { dayKey: today, count: nextCount },
        } }
    );

    return res.json({
      ok: true,
      nextResendAt: new Date(now.getTime() + COOLDOWN_MS).toISOString(),
      sendsToday: nextCount,
      sendsTodayCap: DAILY_SEND_CAP,
    });
  } catch (err) {
    console.error('[phoneVerification] send error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── POST /verify-code ────────────────────────────────────────────────────
//
// Validates a 6-digit code the user typed against the Twilio Verify
// service. On 'approved', atomically flips User.phoneVerified=true and
// stamps phoneVerifiedAt. On any other status, returns a clean error
// without mutating state.
router.post('/verify-code', verifyLimiter, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'invalid_code_format', message: 'Enter the 6-digit code.' });
    }

    const user = await User.findById(req.user.id).select('phone phoneVerified');
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const e164 = toE164US(user.phone);
    if (!e164) {
      return res.status(400).json({
        error: 'no_phone_on_file',
        message: 'Add a valid US phone number to your profile before verifying.',
      });
    }

    // Idempotent: if the phone is already verified, return success without
    // calling Twilio. Saves cost; harmless for the client.
    if (user.phoneVerified === true) {
      return res.json({ ok: true, phoneVerified: true, alreadyVerified: true });
    }

    const result = await checkVerification(e164, code);

    if (!result.ok) {
      if (result.skipped) {
        return res.status(503).json({ error: 'verify_service_unavailable' });
      }
      if (result.error === 'no_active_verification') {
        return res.status(400).json({
          error: 'no_active_verification',
          message: 'No active verification. Request a new code.',
        });
      }
      console.error('[phoneVerification] check unknown error:', result);
      return res.status(502).json({ error: 'verify_service_error' });
    }

    if (result.status === 'pending') {
      return res.status(400).json({ error: 'invalid_code', message: 'Code didn\'t match. Try again.' });
    }
    if (result.status === 'canceled') {
      return res.status(400).json({
        error: 'verification_expired',
        message: 'Code expired or too many attempts. Request a new code.',
      });
    }

    if (result.status === 'approved') {
      // Re-check uniqueness inside the success branch to close the race
      // window between /send-verification's check and /verify-code's flip.
      const conflict = await User.findOne({
        _id: { $ne: req.user.id },
        phone: user.phone,
        phoneVerified: true,
      }).select('_id').lean();
      if (conflict) {
        console.warn(`[phoneVerification] race: phone ${user.phone} verified on another account during check; refusing flip for ${req.user.id}`);
        return res.status(409).json({
          error: 'phone_in_use',
          message: 'This number was just verified on another account. Contact support if this seems wrong.',
        });
      }

      const now = new Date();
      await User.updateOne(
        { _id: req.user.id },
        { $set: { phoneVerified: true, phoneVerifiedAt: now } }
      );
      console.log(`[phoneVerification] approved for user ${req.user.id} phone ${user.phone}`);
      return res.json({ ok: true, phoneVerified: true, phoneVerifiedAt: now.toISOString() });
    }

    // Defensive fallthrough — should never hit. Twilio statuses are
    // approved / pending / canceled.
    console.error('[phoneVerification] unexpected Twilio status:', result.status);
    return res.status(502).json({ error: 'verify_service_error' });
  } catch (err) {
    console.error('[phoneVerification] verify error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── GET /status ──────────────────────────────────────────────────────────
//
// Cheap convenience read for the client. Returns the bits the modal needs
// to render: are we verified, when was the last verification, when is the
// next send allowed, how many sends are left today.
router.get('/status', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      'phone phoneVerified phoneVerifiedAt phoneVerificationLastSentAt phoneVerificationSendsToday'
    ).lean();
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const cooldownLeft = cooldownRemainingSec(user);
    const dailyState = inspectDailyCounter(user);

    return res.json({
      phone: user.phone || null,
      e164: toE164US(user.phone) || null,
      phoneVerified: user.phoneVerified === true,
      phoneVerifiedAt: user.phoneVerifiedAt || null,
      cooldownRemainingSec: cooldownLeft,
      sendsToday: dailyState.count,
      sendsTodayCap: dailyState.cap,
      verifyConfigured: isVerifyConfigured(),
    });
  } catch (err) {
    console.error('[phoneVerification] status error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
