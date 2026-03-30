const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: { type: String, enum: ['customer', 'mover', 'admin'], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const ComplaintSchema = new mongoose.Schema({
    // Linked complaints (magic link) have both populated.
    // Unlinked complaints (manual form) may have neither until admin assigns them.
    lead:    { type: mongoose.Schema.Types.ObjectId, ref: 'lead', default: null },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'user', default: null },
    // true = verified lead+company pair; false = goes to admin queue
    isLinked: { type: Boolean, default: false },
    // Customer-typed company name when no magic link
    companyNameManual: { type: String, default: '' },
    customerName:  { type: String, required: true },
    customerEmail: { type: String, required: true },
    issueType: {
        type: String,
        enum: ['Damage', 'Lateness', 'Unprofessional', 'Billing/Pricing', 'Other'],
        required: true
    },
    description: { type: String, required: true },
    status: {
        type: String,
        enum: ['Open', 'In Progress', 'Resolved', 'Escalated to Admin'],
        default: 'Open'
    },
    messages: [MessageSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('complaint', ComplaintSchema);