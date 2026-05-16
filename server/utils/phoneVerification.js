/**
 * Phone verification helpers — Phase 1 (backend capability).
 *
 * Pure utilities used by the verification routes and by every write site
 * that touches User.phone. The verification flow itself lives in
 * routes/phoneVerification.js; this module owns the small, mechanical
 * pieces that are easy to get wrong if duplicated inline.
 *
 * Architecture context:
 *   - User.phoneVerified is the hard gate read by broadcastLeadSMS and
 *     (future) SMS Claim. It flips true ONLY in the /verify-code success
 *     branch after Twilio Verify returns status='approved'.
 *   - Every other write site that updates User.phone must reset
 *     phoneVerified to false when the value actually changes. The
 *     applyPhoneChange() helper produces the right $set patch.
 *
 * No DB writes happen here — callers compose the patch into their own
 * Mongoose update. Keeps the helper trivially testable.
 */

const COOLDOWN_MS = 60 * 1000;          // 60s between sends
const DAILY_SEND_CAP = 10;              // max sends per UTC day per user

/**
 * Normalize a US phone to digits-only (10 chars). Returns '' for unparseable
 * input. Matches the existing onboarding/auth normalization: strips non-
 * digits, drops a leading '1' if the result is 11 digits, truncates to 10.
 */
function normalizeUSDigits(raw) {
  if (typeof raw !== 'string') return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/**
 * Convert a 10-digit US number to E.164 ('+1XXXXXXXXXX'). Twilio Verify
 * requires E.164. Returns null for anything that isn't exactly 10 digits.
 */
function toE164US(raw) {
  const digits = normalizeUSDigits(raw);
  if (digits.length !== 10) return null;
  return `+1${digits}`;
}

/**
 * Compute the $set patch fragments that a write site should apply when the
 * mover's phone is being changed. Pass the OLD value (from the loaded User
 * doc) and the NEW value (already normalized by the caller). Returns an
 * empty object when nothing should change.
 *
 * Three cases:
 *   1. newPhone is empty / unparseable     → no patch (caller decides whether
 *                                             to reject or leave phone unset)
 *   2. newPhone === oldPhone               → no patch (idempotent re-save)
 *   3. newPhone differs from oldPhone      → reset phoneVerified to false +
 *                                             clear phoneVerifiedAt
 *
 * Use the returned object via `Object.assign(update, applyPhoneChange(...))`
 * in the caller's update payload.
 */
function applyPhoneChange(oldPhone, newPhone) {
  if (!newPhone) return {};
  if (newPhone === oldPhone) return {};
  return {
    phone: newPhone,
    phoneVerified: false,
    phoneVerifiedAt: null,
  };
}

/**
 * UTC start-of-day key as 'YYYY-MM-DD'. Used as the rollover marker for the
 * daily OTP send counter. Independent of the server's local timezone.
 */
function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * Inspect a user's send counter against today's UTC day. Returns the
 * effective count (0 if the recorded dayKey is stale) and a boolean
 * indicating whether another send would breach the daily cap.
 *
 *   user.phoneVerificationSendsToday: { dayKey: 'YYYY-MM-DD', count: N }
 *
 * Caller is expected to atomically increment after a successful Twilio
 * Verify create call (see /send-verification). When dayKey is stale, the
 * counter starts fresh at 1 on the next successful send.
 */
function inspectDailyCounter(user, now = new Date()) {
  const today = utcDayKey(now);
  const stored = user?.phoneVerificationSendsToday || {};
  const sameDay = stored.dayKey === today;
  const count = sameDay ? Number(stored.count || 0) : 0;
  return {
    today,
    count,
    atCap: count >= DAILY_SEND_CAP,
    cap: DAILY_SEND_CAP,
  };
}

/**
 * How many seconds until the next /send-verification call is allowed.
 * Returns 0 when the cooldown has fully elapsed (or no prior send exists).
 * Caller surfaces this in the 429 response so the client UI can render an
 * accurate countdown.
 */
function cooldownRemainingSec(user, now = new Date()) {
  const last = user?.phoneVerificationLastSentAt;
  if (!last) return 0;
  const elapsed = now.getTime() - new Date(last).getTime();
  if (elapsed >= COOLDOWN_MS) return 0;
  return Math.ceil((COOLDOWN_MS - elapsed) / 1000);
}

module.exports = {
  COOLDOWN_MS,
  DAILY_SEND_CAP,
  normalizeUSDigits,
  toE164US,
  applyPhoneChange,
  utcDayKey,
  inspectDailyCounter,
  cooldownRemainingSec,
};
