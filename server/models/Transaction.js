const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  type: {
    type: String,
    enum: [
      'Credit Deposit',
      'Lead Purchase',
      'Lead Dispute Refund',
      // ── WP10 (refund-credibility sprint) ──────────────────────────────────
      // 'Stripe Refund'      → clawback for charge.refunded webhook
      // 'Stripe Chargeback'  → clawback for charge.dispute.created webhook
      // 'Lead Refund'        → admin-initiated refund OR voice auto-refund
      'Stripe Refund',
      'Stripe Chargeback',
      'Lead Refund',
      // 2026-05-29 — closes ledger drift identified by 3-agent audit
      // convergence + HIGH-CONFIDENCE-FIX-PLAN F1. Before this, the admin
      // balance-adjust route (POST /api/admin/users/:id/balance) wrote
      // $inc balance + logAdminAction but NO Transaction row. Every
      // adjustment created drift between sum(Transaction.amount) and
      // User.balance. This is also the manual remediation path for
      // chargeback overdrafts (see B4-refund-overdraft-investigation.md).
      // 'Admin Adjustment'    → operator manual balance write
      'Admin Adjustment',
    ],
    required: true,
  },
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
  purchasedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'purchased_lead' },
  date: { type: Date, default: Date.now }
});

// ── WP10.2 idempotency gate ─────────────────────────────────────────────────
// One 'Lead Refund' per PurchasedLead. The admin refund route AND the voice
// auto-refund path both write this type — the unique partial index ensures
// duplicate-key error (E11000) on any second attempt, so we never double-credit.
// Partial filter (rather than sparse-on-compound) keeps the index null-safe
// for legacy non-refund Transactions which don't carry a purchasedLead.
TransactionSchema.index(
  { purchasedLead: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'Lead Refund', purchasedLead: { $exists: true } },
    name: 'lead_refund_idempotency',
  }
);

// ── WP10.1 idempotency gate ─────────────────────────────────────────────────
// One 'Stripe Refund' / 'Stripe Chargeback' per charge.id. Sparse partial
// index keyed off stripeChargeId — pre-check + insert-on-conflict pattern
// in the webhook handlers.
TransactionSchema.index(
  { stripeChargeId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      stripeChargeId: { $exists: true },
      type: { $in: ['Stripe Refund', 'Stripe Chargeback'] },
    },
    name: 'stripe_charge_clawback_idempotency',
  }
);

module.exports = mongoose.model('transaction', TransactionSchema);
