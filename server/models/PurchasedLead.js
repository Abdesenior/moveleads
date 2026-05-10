const mongoose = require('mongoose');

const CRM_STATUSES = ['New', 'Contacted', 'Quoted', 'Booked', 'Completed', 'Lost'];

const PurchasedLeadSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'lead', required: true },
  pricePaid: { type: Number, required: true },
  purchasedAt: { type: Date, default: Date.now },
  // ── Per-buyer CRM fields ─────────────────────────────────────────────────
  crmStatus: { type: String, enum: CRM_STATUSES, default: 'New' },
  crmNotes: { type: String, default: '' },
  isLiveTransfer: { type: Boolean, default: false },
  feedbackEmailSent: { type: Boolean, default: false },
  // ── WP10.2 / WP10.4 refund tracking ──────────────────────────────────────
  // Single source of truth for whether this purchase has been refunded.
  // Set by admin-initiated refund (admin route), voice auto-refund (call
  // failed/short), or dispute approval flow. refundedBy=null indicates a
  // system-initiated refund (voice auto-refund); otherwise it's an admin id.
  refunded:    { type: Boolean, default: false },
  refundedAt:  { type: Date,    default: null },
  refundedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'user', default: null },
});

PurchasedLeadSchema.statics.CRM_STATUSES = CRM_STATUSES;

// Index for per-company purchase history
PurchasedLeadSchema.index({ company: 1, purchasedAt: -1 });
// Unique constraint: one company per lead
PurchasedLeadSchema.index({ company: 1, lead: 1 }, { unique: true });

module.exports = mongoose.model('purchased_lead', PurchasedLeadSchema);
