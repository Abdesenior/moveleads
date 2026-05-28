/**
 * ClaimAttempt — Phase 4 SMS Claim scaffolding.
 *
 * Audit trail for every inbound SMS that LOOKS like a claim attempt
 * (matches "SEND <token>" / "CLAIM <token>" / bare token / opt-out keyword
 * the inbound webhook chooses to log). Persisted regardless of outcome —
 * winners, losers, and rejected attempts all get a row.
 *
 * Phase 4 (this commit) writes ZERO rows in production: the inbound webhook
 * is NOT yet wired to write here. The model is shipped now so Phase 5 (live
 * claim) is a one-deploy migration-free change.
 *
 * Outcome semantics:
 *   won                       — first valid SEND in window; lead is claimed
 *   lost_already_claimed      — token matched but lead.claimWindow.claimedBy already set
 *   lost_window_expired       — token matched but expiresAt has passed
 *   rejected_low_balance      — mover.balance < cost at claim time
 *   rejected_unmatched_token  — body parsed a token but no live claim window has it
 *   rejected_optout           — mover has smsOptOut === true
 *   rejected_unverified_phone — mover.phoneVerified === false
 *   parsed_no_token           — inbound SMS had no parseable token (e.g. "yes please")
 *   shadow_only               — Phase 4 default — webhook recognized the reply
 *                               but ENABLE_SMS_CLAIM_LIVE was off
 *
 * Indexes:
 *   { moverId, receivedAt }   — cooldown checks (last failed attempt window)
 *   { leadId, receivedAt }    — forensics for a specific lead's race
 *   { token }                 — debugging unmatched tokens
 *   { twilioMessageSid }      — unique sparse (PR-S1) — Twilio webhook
 *                               idempotency key. Twilio retries non-2xx
 *                               webhook responses up to 5 times over 24h
 *                               with the same MessageSid. Without this
 *                               unique constraint, a transient server
 *                               error during a successful claim would
 *                               retry on the same payload and could
 *                               double-debit the mover. The Phase 5
 *                               webhook will insert a ClaimAttempt row
 *                               FIRST (before any balance debit) — the
 *                               E11000 on this index is the dedup signal.
 *                               Sparse so existing rows with no MessageSid
 *                               (none exist in Phase 4, but defensive)
 *                               don't conflict.
 */

const mongoose = require('mongoose');

const OUTCOMES = [
  'won', 'lost_already_claimed', 'lost_window_expired',
  'rejected_low_balance', 'rejected_unmatched_token',
  'rejected_optout', 'rejected_unverified_phone',
  'parsed_no_token', 'shadow_only',
];

const ClaimAttemptSchema = new mongoose.Schema({
  leadId:    { type: mongoose.Schema.Types.ObjectId, ref: 'lead' },        // nullable — unmatched tokens have no lead
  moverId:   { type: mongoose.Schema.Types.ObjectId, ref: 'user' },        // nullable — unknown sender
  fromPhone: { type: String, required: true, trim: true },                  // E.164
  body:      { type: String, trim: true },
  parsedKeyword: { type: String, trim: true },                              // 'SEND' | 'CLAIM' | null
  token:     { type: String, trim: true, uppercase: true },                 // parsed claim token, or null
  outcome:   { type: String, enum: OUTCOMES, required: true, index: true },
  reason:    { type: String, trim: true },                                  // free-text human-readable detail
  twilioMessageSid: { type: String, trim: true },                           // ties back to Twilio's webhook payload
  receivedAt: { type: Date, default: Date.now, required: true },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

ClaimAttemptSchema.index({ moverId: 1, receivedAt: -1 });
ClaimAttemptSchema.index({ leadId: 1, receivedAt: -1 });
ClaimAttemptSchema.index({ token: 1 });
// 2026-05-28 — PR-S1: Twilio webhook idempotency key.
// Unique sparse index on twilioMessageSid. The Phase 5 inbound claim
// handler must insert a ClaimAttempt row BEFORE attempting any balance
// debit; on Twilio retry of the same MessageSid this insert throws
// E11000, which the handler treats as "already processed, no-op."
// Without this index, a non-2xx response during a successful claim
// would cause Twilio to retry (5 attempts over 24h) on the same
// payload and could double-debit the mover.
ClaimAttemptSchema.index(
  { twilioMessageSid: 1 },
  { unique: true, sparse: true, name: 'twilioMessageSid_unique' }
);
// TTL — claim attempts are operational signal, not legal record. 90 days
// matches ValidationLog retention so the admin can correlate claim drama
// with the validation context that produced it.
ClaimAttemptSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const ClaimAttempt = mongoose.model('claimAttempt', ClaimAttemptSchema);
ClaimAttempt.OUTCOMES = OUTCOMES;
module.exports = ClaimAttempt;
