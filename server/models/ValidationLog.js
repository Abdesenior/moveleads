const mongoose = require('mongoose');

// V5 Lead Quality — Phase 2.
// Audit log of every external-validation call made for a Lead (Twilio Lookup,
// Mapbox, Fingerprint). Stores normalized result for admin display PLUS a
// redacted raw response for forensics. NEVER read by mover-facing code.
//
// Retention: 90 days via TTL index on `checkedAt`. Phone numbers in raw
// responses are redacted to last 4 digits before persistence.
//
// One document per (leadId, type, checkedAt). Multiple entries per lead per
// type are expected (re-validation, retry on failure). The most recent per
// type drives the normalized result on Lead.validation.*.
const ValidationLogSchema = new mongoose.Schema({
  leadId:   { type: mongoose.Schema.Types.ObjectId, ref: 'lead', required: true, index: true },
  type:     { type: String, enum: ['phone', 'route', 'fingerprint'], required: true },
  provider: { type: String, required: true }, // e.g. 'twilio_lookup_v2', 'mapbox', 'fingerprintjs'

  // Whether the call actually went out, was served from cache, or was skipped
  // (env var missing / feature flag off / package not enabled).
  status: { type: String, enum: ['ok', 'cached', 'skipped', 'error'], required: true },

  // Normalized fields the admin UI / scoring engine read. Shape varies by type
  // but keys are admin-friendly and never contain PII.
  result: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Raw provider response, JSON-stringified after phone redaction. Useful for
  // debugging an unexpected normalized value. Capped at 8KB to bound storage.
  rawRedacted: { type: String, default: '' },

  // Populated when status='error' — message + http status only, never stack.
  error: { type: mongoose.Schema.Types.Mixed, default: null },

  // Cost tracking (USD). Twilio = $0.005-0.01/call; Mapbox geocoding free up
  // to 100k/mo. 0 for cached / skipped / error.
  costUsd: { type: Number, default: 0 },

  checkedAt: { type: Date, default: Date.now },
});

// TTL — 90 days. Mongo prunes expired docs hourly.
ValidationLogSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

// Compound index for "latest log per (lead, type)" queries.
ValidationLogSchema.index({ leadId: 1, type: 1, checkedAt: -1 });

module.exports = mongoose.model('validationLog', ValidationLogSchema);
