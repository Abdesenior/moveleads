const mongoose = require('mongoose');

// Simple single-row admin configuration for global platform behavior.
// We keep it intentionally minimal and safe for demo environments.
const PlatformSettingsSchema = new mongoose.Schema({
  standardLeadPrice: { type: Number, default: 10 },
  exclusiveLeadMultiplier: { type: Number, default: 2.5 },
  acceptNewUserSignups: { type: Boolean, default: true },
  automatedStripeRefunds: { type: Boolean, default: false },

  // Generic Mixed bucket for runtime-tunable settings that admins flip without
  // a redeploy. Today it holds the V5 validation toggles; future tunables
  // (claim-window seconds, tier thresholds, etc.) live here too. Each consumer
  // is responsible for safe defaults when the value is missing.
  //
  // Current shape:
  //   config.validation = {
  //     mapboxEnabled: boolean,
  //     twilioLookupEnabled: boolean,
  //     twilioIdentityMatchEnabled: boolean,
  //   }
  //
  // Defaults are ALL FALSE — env flags alone never run any provider.
  config: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('platform_settings', PlatformSettingsSchema);

