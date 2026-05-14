const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  route: { type: String, required: true },
  originCity: { type: String, required: true },
  destinationCity: { type: String, required: true },
  originZip: { type: String, default: '' },
  destinationZip: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  homeSize: { type: String, required: true },
  moveDate: { type: Date, required: true },
  distance: { type: String, enum: ['Local', 'Long Distance'], required: true },
  price: { type: Number, required: true },
  miles: { type: Number, default: 0 },
  status: { type: String, enum: ['Available', 'Purchased', 'Expired', 'Pending Verification', 'READY_FOR_DISTRIBUTION', 'REJECTED_FAKE', 'PENDING_MANUAL_REVIEW'], default: 'Available' },
  score: { type: Number, default: 0 },
  grade: { type: String, enum: ['A', 'B', 'C', 'D'] },
  scoreFactors: [String],
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerEmail: { type: String, required: true },
  specialInstructions: { type: String, default: '' },
  estimatedWeight: { type: String, default: '' },
  numberOfRooms: { type: Number, default: 0 },
  customerStatus: { 
    type: String, 
    enum: ['New', 'Contacted', 'Working On It', 'Completed', 'Not Interested'],
    default: 'New'
  },
  customerNotes: { type: String, default: '' },
  statusHistory: [
    {
      status: String,
      timestamp: { type: Date, default: Date.now }
    }
  ],
  buyers: [
    {
      company:     { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
      purchasedAt: { type: Date, default: Date.now },
      pricePaid:   { type: Number, default: 0 },
    }
  ],
  maxBuyers:      { type: Number, default: 1 },
  sourceCompany:  { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
  source:         { type: String },
  verifiedBy:     { type: String },
  isWarmTransfer: { type: Boolean, default: false },
  createdAt:      { type: Date, default: Date.now },

  // ── Auction / Dynamic pricing ──────────────────────────────────────────
  buyNowPrice:      { type: Number, default: 10 },
  startingBidPrice: { type: Number, default: 9 },
  currentBidPrice:  { type: Number, default: 0 },
  auctionEndsAt:    { type: Date },
  auctionStatus: {
    type: String,
    // 'settling' is an interim status used by the auction settlement cron so a
    // crash mid-run can be recovered on the next tick (see jobs/settleAuctions.js).
    enum: ['pending', 'active', 'sold', 'expired', 'buy_now', 'settling'],
    default: 'pending',
  },
  bids: [{
    company:  { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    amount:   Number,
    placedAt: { type: Date, default: Date.now },
  }],
  winnerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
  finalPrice: { type: Number },

  // ── Notification dedup ─────────────────────────────────────────────────
  // Set the first time SMS/email broadcast fires for this lead. Subsequent
  // broadcast callers short-circuit on this unless they pass `force: true`
  // (e.g. an admin re-pricing flow that genuinely wants to re-fire).
  // Updated atomically via `updateOne({_id, notifiedAt: null}, ...)` so two
  // parallel broadcast paths (SMS+email) only flip it once.
  notifiedAt: { type: Date, default: null },

  // ── V5 Lead Quality (Phase 1 — shadow mode) ────────────────────────────
  // All fields below are OPTIONAL and ADDITIVE. Legacy V4 leads will not
  // have them populated; nothing in production reads from them yet. The
  // authoritative score/grade/price/status remain the legacy fields above.
  // See docs/superpowers/specs/2026-05-14-moveleads-v5-lead-quality-design.md
  scores: {
    trustScore:      { type: Number },
    urgencyScore:    { type: Number },
    leadValueScore:  { type: Number },
    routeValueScore: { type: Number },
    intentScore:     { type: Number },
    fraudRiskScore:  { type: Number },
    moverMatchScore: { type: Number },
    compositeScore:  { type: Number },
  },
  tier:       { type: String, enum: ['hot', 'premium', 'standard', 'review', 'rejected'] },
  tierReason: [{ type: String }],
  validation: {
    phone:       { type: mongoose.Schema.Types.Mixed },
    route:       { type: mongoose.Schema.Types.Mixed },
    fingerprint: { type: mongoose.Schema.Types.Mixed },
    fraud:       { type: mongoose.Schema.Types.Mixed },
  },
  claimWindow: {
    status:    { type: String, enum: ['open', 'claimed', 'expired'] },
    expiresAt: { type: Date },
    offeredTo: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    claimedAt: { type: Date },
  },
  heavyItems:         [{ type: String }],
  intentConfirmed:    { type: Boolean },
  urgencyBucket:      { type: String, enum: ['asap', 'this_week', 'this_month', 'flexible'] },
  moveType:           { type: String, enum: ['residential', 'commercial', 'office', 'storage', 'other'] },
  funnelVersion:      { type: String },
  clientSubmissionId: { type: String },
  adminTierOverride: {
    tier:   { type: String, enum: ['hot', 'premium', 'standard', 'review', 'rejected'] },
    reason: { type: String },
    by:     { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    at:     { type: Date },
  },
});

// Compound index on zip fields — the core routing hot path hits these on every lead ingest.
LeadSchema.index({ originZip: 1, destinationZip: 1 });
// Status index for the dashboard GET /api/leads query (filter by status + sort by createdAt).
LeadSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('lead', LeadSchema);
