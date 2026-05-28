/**
 * Email verification helpers.
 *
 * Pure utilities used by every write site that touches User.email. The
 * primary verification flow itself lives in routes/auth.js (initial
 * registration + /resend-verification); this module owns the small,
 * mechanical pieces that are easy to get wrong if duplicated inline at
 * every email-write site.
 *
 * Architecture context:
 *   - User.isEmailVerified gates the email-broadcast Mongo hard filter
 *     (see services/emailService.broadcastLeadEmail). It flips true ONLY
 *     in the /api/auth/verify-email success branch after the user clicks
 *     the magic link in their inbox.
 *   - Every other write site that updates User.email must reset
 *     isEmailVerified to false when the value actually changes — and
 *     rotate the verification token so a stale link from the prior
 *     email cannot accidentally verify the new address.
 *
 * Before this helper, the Settings PATCH route at routes/users.js wrote
 * a new email without resetting verification state. The mover's old
 * isEmailVerified=true carried over to the new address; email broadcasts
 * went to the new address even though it was unverified. If the new
 * address was a typo, the mover silently stopped receiving alerts.
 * Audit finding 08 R1 / 12 B1.
 *
 * Pattern mirrors utils/phoneVerification.applyPhoneChange exactly. No
 * DB writes happen here — callers compose the patch into their own
 * Mongoose update. Keeps the helper trivially testable.
 */

const crypto = require('crypto');

const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Generate a fresh email-verification token. 32 random bytes hex-encoded
 * — same shape as routes/auth.js (intentionally duplicated to keep the
 * helper dependency-free; the function is 1 line).
 */
function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Normalize for comparison: lowercase + trim. The User.email schema field
 * has Mongoose `lowercase: true, trim: true` modifiers, so Mongo always
 * stores normalized values. But callers may pass raw client input — we
 * normalize here so the equality check below is correct.
 */
function normalizeEmail(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

/**
 * Compute the $set patch fragments that a write site should apply when
 * the mover's email is being changed. Pass the OLD value (from the
 * loaded User doc) and the NEW value (raw client input). Returns an
 * empty object when nothing should change.
 *
 * Three cases:
 *   1. newEmail is empty / not a string      → no patch (caller decides
 *                                              whether to reject)
 *   2. newEmail (normalized) === oldEmail    → no patch (idempotent re-
 *                                              save; verification state
 *                                              preserved)
 *   3. newEmail differs from oldEmail        → reset isEmailVerified to
 *                                              false + rotate token +
 *                                              extend expiry
 *
 * Callers that want to send a verification email after the save should
 * read the returned `emailVerificationToken` from the patch and call
 * emailService.sendVerificationEmail({ toEmail, companyName, token })
 * fire-and-forget. See routes/users.js wiring.
 *
 * @param {string} oldEmail
 * @param {string} newEmail
 * @returns {Object} patch — empty object when no change, otherwise
 *   { email, isEmailVerified, emailVerificationToken, emailVerificationExpires }
 */
function applyEmailChange(oldEmail, newEmail) {
  const normalizedNew = normalizeEmail(newEmail);
  if (!normalizedNew) return {};
  const normalizedOld = normalizeEmail(oldEmail);
  if (normalizedNew === normalizedOld) return {};
  return {
    email: normalizedNew,
    isEmailVerified: false,
    emailVerificationToken: generateVerificationToken(),
    emailVerificationExpires: new Date(Date.now() + VERIFICATION_EXPIRY_MS),
  };
}

module.exports = {
  VERIFICATION_EXPIRY_MS,
  generateVerificationToken,
  normalizeEmail,
  applyEmailChange,
};
