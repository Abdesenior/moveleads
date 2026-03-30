const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: { type: String, enum: ['customer', 'mover', 'admin'], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const ComplaintSchema = new mongoose.Schema({
    lead: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'lead',
        required: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    customerName: { type: String, required: true },
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