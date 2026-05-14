const mongoose = require('mongoose');

// V5 Lead Quality — Phase 2.
// 30-day cache of Twilio Lookup V2 results keyed by E.164 phone. Same phone
// resubmitted within 30 days reuses the cached result instead of paying for
// another lookup ($0.005-0.01 per call).
//
// Stores the normalized result only (no raw response — that lives in
// ValidationLog when the original lookup happened). Result includes a marker
// so the consumer can tell cached results from fresh ones.
const PhoneLookupCacheSchema = new mongoose.Schema({
  phone:     { type: String, required: true, unique: true }, // E.164, e.g. +14155551234
  result:    { type: mongoose.Schema.Types.Mixed, required: true }, // normalized lookup result
  packages:  [{ type: String }],                                   // which packages were fetched
  fetchedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },                       // fetchedAt + 30 days
});

// TTL — Mongo prunes when expiresAt passes. We set expiresAt explicitly
// instead of using expireAfterSeconds-from-fetchedAt so cache invalidation
// (e.g. shorten TTL for a specific phone) is possible by editing the field.
PhoneLookupCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('phoneLookupCache', PhoneLookupCacheSchema);
