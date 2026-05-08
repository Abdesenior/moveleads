const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  dotNumber: { type: String },
  mcNumber: { type: String },
  phone: { type: String },
  role: { type: String, enum: ['customer', 'admin', 'super_admin'], default: 'customer' },
  balance: { type: Number, default: 0 },
  leadsPurchased: { type: Number, default: 0 },
  autoRechargeThreshold: { type: Number, default: 0 },
  autoRechargeAmount: { type: Number, default: 0 },
  stripeCustomerId: { type: String, default: '' },
  stripePaymentMethodId: { type: String, default: '' },
  dateJoined: { type: Date, default: Date.now },
  serviceAreas: [String],
  serviceZips: [String],
  serviceStates: [String],
  preferredHomeSizes: [String],
  maxDistance: { type: String },
  emailNotif: { type: Boolean, default: true },
  smsNotif: { type: Boolean, default: false },
  isSuspended: { type: Boolean, default: false },
  receiveLiveTransfers: { type: Boolean, default: false },
  googleReviewLink: { type: String, default: '' },
  // ── Email verification ───────────────────────────────────────────────────
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },
  // ── Password reset ───────────────────────────────────────────────────────
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  // ──────────────────────────────────────────────────────────────
  // Partner activation / onboarding state
  // ──────────────────────────────────────────────────────────────
  onboarding: {
    complete: { type: Boolean, default: false },
    skippedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    currentStep: { type: Number, default: 0 },     // 0..5 (0=not started, 5=activation pending)
    bonusClaimedAt: { type: Date, default: null }, // set on first-purchase webhook
    recovery: {
      sent12h: { type: Boolean, default: false },
      sent24h: { type: Boolean, default: false },
      sent72h: { type: Boolean, default: false },
    },
    answers: {
      primaryMarket:       { type: String, default: '' },           // "Houston, TX"
      coveragePreference:  { type: String, default: '' },           // 'local'|'regional'|'longDistance'|'nationwide'
      additionalMarkets:   { type: [String], default: [] },
      moveTypes:           { type: [String], default: [] },         // ['apartment','home','office','longDistance','emergency','packing','laborOnly','storage']
      avoidMoveTypes:      { type: [String], default: [] },
      alertChannels:       { type: [String], default: [] },         // priority-ordered list of 'sms'|'call'|'email'
      urgentCallEnabled:   { type: Boolean, default: false },
      dispatchHours:       { type: mongoose.Schema.Types.Mixed, default: {} }, // { mon: {open:'07:00',close:'19:00'}, ... }
      dailyRequestCapacity:{ type: String, default: '' },           // '1-3'|'4-7'|'8-15'|'15+'
      preferredTiming:     { type: [String], default: [] },         // ['sameDay','within7Days','thisMonth','any']
      crewCount:           { type: String, default: '' },           // '1'|'2-3'|'4-6'|'7+'
    },
  },
});

module.exports = mongoose.model('user', UserSchema);
