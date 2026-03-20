const mongoose = require('mongoose');

const CommunicationSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['SMS', 'Email', 'Call'],
    default: 'SMS'
  },
  phoneNumber: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Sent', 'Delivered', 'Failed', 'Pending'],
    default: 'Pending'
  },
  sid: {
    type: String,
    default: ''
  },
  error: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('communication', CommunicationSchema);
