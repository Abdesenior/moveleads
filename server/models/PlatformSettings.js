const mongoose = require('mongoose');

// Simple single-row admin configuration for global platform behavior.
// We keep it intentionally minimal and safe for demo environments.
const PlatformSettingsSchema = new mongoose.Schema({
  standardLeadPrice: { type: Number, default: 10 },
  exclusiveLeadMultiplier: { type: Number, default: 2.5 },
  acceptNewUserSignups: { type: Boolean, default: true },
  automatedStripeRefunds: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('platform_settings', PlatformSettingsSchema);

