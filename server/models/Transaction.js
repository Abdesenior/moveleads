const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  type: { type: String, enum: ['Credit Deposit', 'Lead Purchase', 'Lead Dispute Refund'], required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ['Completed', 'Pending', 'Failed'], default: 'Completed' },
  stripeChargeId: { type: String },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'lead' },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('transaction', TransactionSchema);
