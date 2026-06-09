/**
 * requirePhoneVerified — defense-in-depth gate ensuring a user has a
 * verified phone (User.phoneVerified === true) before allowing the
 * request to proceed.
 *
 * Mounts AFTER the `auth` middleware (which populates req.user.id). On
 * production we apply this to every chokepoint that ends in money,
 * marketplace participation, or onboarding completion:
 *
 *   - POST /api/billing/create-payment-intent     (activation pay)
 *   - POST /api/billing/create-topup-intent       (any top-up)
 *   - POST /api/onboarding/complete               (mark wizard done)
 *   - POST /api/onboarding/save-step (step >= 4)  (advance past Contact)
 *   - PATCH /api/users/me/sms-claim               (opt-in to SMS Claim)
 *   - POST /api/bids/:leadId/buy-now              (dashboard lead purchase)
 *
 * Closed bypass (2026-06-09):
 *   - POST /api/onboarding/skip was DELETED — it silently set
 *     onboarding.complete=true without verification. The UI never called
 *     it; deletion has no user-facing effect.
 *
 * Failure mode: 403 with a stable error code `PHONE_NOT_VERIFIED` so the
 * client can route the user back to the verify modal. The message is
 * mover-friendly; the code is the machine handle.
 *
 * What this does NOT gate:
 *   - /api/billing/verify-payment-intent + /api/billing/verify-topup-intent
 *     If Stripe already charged the card, we MUST credit the balance.
 *     Re-checking phoneVerified here would create a foot-gun where a mover
 *     pays but the credit application is blocked because they edited their
 *     phone between create-intent and confirm-intent. Stripe webhooks are
 *     the canonical credit path; the verify-* routes are a UX-instant
 *     mirror of the same idempotent apply* function.
 *   - GET routes (read-only).
 *   - /api/onboarding/save-step for steps 1, 2, 3 — the wizard MUST be
 *     able to save phone + email + toggles BEFORE the verify modal
 *     opens. The gate applies at step transition (step >= 4) only.
 *   - Webhooks (signed by Stripe/Twilio, no JWT context).
 */

'use strict';

const User = require('../models/User');

async function requirePhoneVerified(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ msg: 'Authentication required' });
    }

    const user = await User.findById(req.user.id).select('phoneVerified').lean();
    if (!user) {
      return res.status(401).json({ msg: 'User not found' });
    }

    if (user.phoneVerified !== true) {
      return res.status(403).json({
        msg: 'Please verify your phone number to continue. Open the verification modal from the Onboarding wizard or Settings → Profile.',
        code: 'PHONE_NOT_VERIFIED',
      });
    }

    return next();
  } catch (err) {
    console.error('[requirePhoneVerified]', err.message);
    return res.status(500).json({ msg: 'Server error' });
  }
}

module.exports = requirePhoneVerified;
