const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  route: { type: String, required: true },
  originCity: { type: String, required: true },
  destinationCity: { type: String, required: true },
  originZip: { type: String, default: '' },
  destinationZip: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  homeSize: { type: String, required: true },
  moveDate: { type: Date, required: true },
  distance: { type: String, enum: ['Local', 'Long Distance'], required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ['Available', 'Purchased', 'Expired', 'Pending Verification', 'READY_FOR_DISTRIBUTION', 'REJECTED_FAKE', 'PENDING_MANUAL_REVIEW'], default: 'Available' },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerEmail: { type: String, required: true },
  specialInstructions: { type: String, default: '' },
  estimatedWeight: { type: String, default: '' },
  numberOfRooms: { type: Number, default: 0 },
  customerStatus: { 
    type: String, 
    enum: ['New', 'Contacted', 'Working On It', 'Completed', 'Not Interested'],
    default: 'New'
  },
  customerNotes: { type: String, default: '' },
  statusHistory: [
    {
      status: String,
      timestamp: { type: Date, default: Date.now }
    }
  ],
  buyers: [
    {
      company: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
      purchasedAt: { type: Date, default: Date.now }
    }
  ],
  maxBuyers: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now }
});

// Compound index on zip fields — the core routing hot path hits these on every lead ingest.
LeadSchema.index({ originZip: 1, destinationZip: 1 });
// Status index for the dashboard GET /api/leads query (filter by status + sort by createdAt).
LeadSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('lead', LeadSchema);
