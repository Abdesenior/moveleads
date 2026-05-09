const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  type: { type: String, enum: ['Credit Deposit', 'Lead Purchase', 'Lead Dispute Refund'], required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ['Completed', 'Pending', 'Failed'], default: 'Completed' },
  stripeChargeId: { type: String },
  // Stripe PaymentIntent id — used as the strict idempotency key for the
  // onboarding-activation flow. Sparse + unique so existing transactions
  // (which never set this field) coexist, but any new write is enforced
  // single-source-of-truth at the database level.
  stripePaymentIntentId: { type: String, index: { unique: true, sparse: true } },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'lead' },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('transaction', TransactionSchema);
