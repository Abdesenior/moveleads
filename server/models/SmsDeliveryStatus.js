/**
 * SmsDeliveryStatus — PR-5.
 *
 * Persisted Twilio Messages API delivery-status events. Closes
 * HIGH-CONFIDENCE-FIX-PLAN F7 (the gap between "Twilio accepted the SMS"
 * and "the mover device actually received / failed / undelivered").
 * Before this model, the only signal we had was the success/failure of
 * the `messages.create()` Promise — which only confirms Twilio queued
 * the message, NOT that the device received it.
 *
 * Twilio fires statusCallback as the message lifecycle progresses:
 *   queued → sent → delivered     (happy path)
 *   queued → sent → undelivered   (carrier-side failure, e.g. invalid number)
 *   queued → failed               (Twilio-side rejection, e.g. blocked)
 *   queued → sending → sent → ... (intermediate during fan-out)
 *
 * We persist EVERY callback for a given MessageSid into a single row,
 * upserting on each event. The terminal status (delivered/failed/
 * undelivered) is the last one we'll see for that SID.
 *
 * Idempotency:
 *   `messageSid` is unique (the Twilio identifier is globally unique
 *   per account). The route uses upsert-by-SID so Twilio's webhook
 *   retries on transient 5xx never produce duplicate rows.
 *
 * Forensics shape:
 *   - messageSid       : The Twilio SID we received in the Promise resolve.
 *                        Lets us correlate with smsService logs and (for
 *                        outbound CLAIM-related sends) with the ClaimAttempt
 *                        twilioMessageSid index.
 *   - messageStatus    : Last observed lifecycle status (queued / sending /
 *                        sent / delivered / failed / undelivered / read /
 *                        accepted / scheduled / canceled).
 *   - errorCode        : Twilio numeric error code on failure (e.g.
 *                        30003 = "unreachable destination handset",
 *                        30005 = "unknown destination handset"). Stored as
 *                        a number so admin filtering by code is trivial.
 *   - errorMessage     : Twilio's human-readable error explanation. Not
 *                        always present — Twilio only sets this for failed/
 *                        undelivered. Trimmed + bounded.
 *   - toPhone/fromPhone: E.164 strings as Twilio sends them. Useful for
 *                        admin "which phone got dropped" forensics without
 *                        joining to Communication / outbound logs.
 *   - rawPayload       : The full req.body Twilio posted. Bounded by mongo
 *                        document size and our route's bodyParser cap. We
 *                        save it as Mixed because Twilio adds new fields
 *                        over time (e.g. `MessagingServiceSid`,
 *                        `ApiVersion`) and we want forensics-grade fidelity.
 *   - receivedAt       : Timestamp of the FIRST callback for this SID.
 *                        Not touched on subsequent upserts (so we preserve
 *                        the lifecycle entry point).
 *   - updatedAt        : Timestamp of the most recent callback. Hands the
 *                        operator a "how stale" signal for stuck-in-queued
 *                        forensics.
 *
 * Retention:
 *   90-day TTL on `receivedAt`, matching ClaimAttempt and ValidationLog.
 *   Delivery status is operational signal, not legal record.
 *
 * NOT a side-effect surface:
 *   This model is observability-only. No downstream code branches on it
 *   today. Future work (carrier-routing intelligence, smsCounters refund
 *   on undelivered, etc.) is out of scope for PR-5.
 */

const mongoose = require('mongoose');

const SmsDeliveryStatusSchema = new mongoose.Schema({
  messageSid:    { type: String, required: true, trim: true },
  messageStatus: { type: String, trim: true },
  errorCode:     { type: Number },
  errorMessage:  { type: String, trim: true, maxlength: 500 },
  toPhone:       { type: String, trim: true },
  fromPhone:     { type: String, trim: true },
  rawPayload:    { type: mongoose.Schema.Types.Mixed },
  receivedAt:    { type: Date, default: Date.now, required: true },
  updatedAt:     { type: Date, default: Date.now, required: true },
}, { timestamps: false });

// Unique on messageSid — the upsert key. Globally unique per Twilio
// account, so a separate { messageSid } unique index is sufficient.
SmsDeliveryStatusSchema.index(
  { messageSid: 1 },
  { unique: true, name: 'messageSid_unique' }
);

// Filter by status (admin: "show me everything that's failed today").
SmsDeliveryStatusSchema.index({ messageStatus: 1, receivedAt: -1 });

// 90-day TTL — operational forensics, not legal record. Same retention as
// ClaimAttempt / ValidationLog so admins can correlate cross-collection.
SmsDeliveryStatusSchema.index(
  { receivedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 }
);

module.exports = mongoose.model('smsDeliveryStatus', SmsDeliveryStatusSchema);
