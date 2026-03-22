const mongoose = require('mongoose');

const CRM_STATUSES = ['New', 'Contacted', 'Quoted', 'Booked', 'Lost'];

const PurchasedLeadSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'lead', required: true },
  pricePaid: { type: Number, required: true },
  purchasedAt: { type: Date, default: Date.now },
  // ── Per-buyer CRM fields ─────────────────────────────────────────────────
  crmStatus: { type: String, enum: CRM_STATUSES, default: 'New' },
  crmNotes: { type: String, default: '' },
});

PurchasedLeadSchema.statics.CRM_STATUSES = CRM_STATUSES;

// Index for per-company purchase history
PurchasedLeadSchema.index({ company: 1, purchasedAt: -1 });
// Unique constraint: one company per lead
PurchasedLeadSchema.index({ company: 1, lead: 1 }, { unique: true });

module.exports = mongoose.model('purchased_lead', PurchasedLeadSchema);
