const mongoose = require('mongoose');

// Phase 1 (V5 Lead Quality) — shadow-mode output of the new deterministic
// scoring engine. NEVER read by mover-facing code, pricing, broadcast, or
// dispatch. Read only by admin tooling for side-by-side comparison vs the
// legacy `Lead.score` / `Lead.grade`.
//
// One snapshot per scoring run. We append rather than upsert so engine-version
// changes leave a comparable history per lead.
const ScoringSnapshotSchema = new mongoose.Schema({
  leadId:        { type: mongoose.Schema.Types.ObjectId, ref: 'lead', required: true, index: true },
  engineVersion: { type: String, required: true },
  mode:          { type: String, enum: ['shadow', 'live'], default: 'shadow' },

  scores: {
    trustScore:       { type: Number, default: 0 },
    urgencyScore:     { type: Number, default: 0 },
    leadValueScore:   { type: Number, default: 0 },
    routeValueScore:  { type: Number, default: 0 },
    intentScore:      { type: Number, default: 0 },
    fraudRiskScore:   { type: Number, default: 0 },
    moverMatchScore:  { type: Number, default: 0 },
    compositeScore:   { type: Number, default: 0 },
  },

  tier:       { type: String, enum: ['hot', 'premium', 'standard', 'review', 'rejected'], default: 'standard' },
  tierReason: [{ type: String }],

  // Lead.status at the moment this snapshot was taken. Phase 2 introduces
  // async validation that can fire AFTER Twilio's verifyLeadPhone flips the
  // status. Recording status-at-scoring lets us reason about which snapshot
  // reflects which state of the lead (e.g. baseline vs post-validation).
  leadStatusAtScoring: { type: String },

  // Snapshot of the legacy values at the moment the new engine ran — lets the
  // admin UI render a comparison without a second DB lookup.
  legacy: {
    score: { type: Number },
    grade: { type: String },
  },

  // Free-form per-score breakdown for debugging the rules. Mongoose Mixed so
  // we can evolve fields without a migration. Never relied on by production.
  breakdown: { type: mongoose.Schema.Types.Mixed, default: {} },

  createdAt: { type: Date, default: Date.now },
});

ScoringSnapshotSchema.index({ leadId: 1, createdAt: -1 });

module.exports = mongoose.model('scoringSnapshot', ScoringSnapshotSchema);
