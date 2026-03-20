const mongoose = require('mongoose');

const DisputeSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'lead',
    required: true
  },
  purchasedLead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'purchased_lead',
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'DENIED'],
    default: 'PENDING'
  },
  adminNotes: {
    type: String,
    default: ''
  },
  resolvedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Avoid duplicate disputes for the same purchase
DisputeSchema.index({ company: 1, purchasedLead: 1 }, { unique: true });

module.exports = mongoose.model('dispute', DisputeSchema);
