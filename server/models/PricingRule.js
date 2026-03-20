const mongoose = require('mongoose');

const PricingRuleSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['HOME_SIZE', 'DISTANCE', 'BASE'],
    required: true
  },
  matchValue: {
    type: String,
    required: true // e.g., '3 Bedroom House', 'Long Distance'
  },
  multiplier: {
    type: Number,
    default: 1.0
  },
  description: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('pricing_rule', PricingRuleSchema);
