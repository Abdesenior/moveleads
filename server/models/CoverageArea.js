const mongoose = require('mongoose');

const CoverageAreaSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  zipCode: { type: String, required: true, index: true },
  radius: { type: Number, default: 0 },
  type: {
    type: String,
    enum: ['origin', 'destination', 'both'],
    default: 'both',
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

// Compound index for fast routing queries
CoverageAreaSchema.index({ zipCode: 1, type: 1 });
// Index for per-company lookups
CoverageAreaSchema.index({ company: 1 });

module.exports = mongoose.model('coverage_area', CoverageAreaSchema);
