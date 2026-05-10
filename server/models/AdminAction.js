const mongoose = require('mongoose');

const AdminActionSchema = new mongoose.Schema({
  actor:      { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  action:     { type: String, required: true },        // e.g. 'balance.adjust', 'user.suspend', 'lead.delete', 'pricing.update', 'settings.update', 'refund.issue'
  targetType: { type: String, default: '' },           // 'user' | 'lead' | 'pricingRule' | 'platformSettings' | ...
  targetId:   { type: mongoose.Schema.Types.ObjectId, default: null },
  before:     { type: mongoose.Schema.Types.Mixed, default: null },
  after:      { type: mongoose.Schema.Types.Mixed, default: null },
  metadata:   { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt:  { type: Date, default: Date.now, index: true },
});

AdminActionSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('admin_action', AdminActionSchema);
