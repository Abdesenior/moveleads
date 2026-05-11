const mongoose = require('mongoose');

/**
 * MoverResearchSubmission — captures intake from the public-facing
 * "Founding Mover Program" funnel (/founding-movers). This is NOT
 * presented as a survey to the user; the form is positioned as an
 * early-access application. The collected data feeds an admin
 * analytics dashboard at /admin/mover-research.
 *
 * Email is unique-sparse so duplicate submissions from the same
 * company are quietly de-duplicated by the route handler.
 */
const MoverResearchSubmissionSchema = new mongoose.Schema({
  // Step 1 — contact
  companyName:       { type: String, required: true, trim: true },
  contactName:       { type: String, trim: true },
  email:             { type: String, required: true, lowercase: true, trim: true, index: { unique: true, sparse: true } },
  phone:             { type: String, trim: true },
  mainStateOrMarket: { type: String, trim: true },

  // Step 2 — crews and move types
  desiredMoveTypes:  [String],
  preferredJobSizes: [String],

  // Step 3 — request quality
  valueSignals:          [String],
  requiredConfirmations: [String],

  // Step 4 — shared vs exclusive
  sharedExclusivePreference:  { type: String, enum: ['shared', 'exclusive', 'depends', ''], default: '' },
  sharedAcceptableConditions: [String],
  sharedMaxMovers:            String,
  exclusiveTriggers:          [String],
  exclusiveTriggersDepends:   [String],

  // Step 5 — scenario card
  priorityScenario: String,

  // Step 6 — speed + pricing
  speedExpectation:  { type: String, enum: ['5min', '15min', '1hour', 'sameday', ''], default: '' },
  overpricedSignals: [String],

  // Step 7 — marketplace preferences
  marketplacePreference: { type: String, enum: ['mostly_exclusive', 'mostly_shared', 'mixed', 'bidding', ''], default: '' },
  biddingTriggers:       [String],

  // Step 8 — experience
  leadProviderExperience:   { type: String, enum: ['regularly', 'occasionally', 'interested', 'no', ''], default: '' },
  leadProviderFrustrations: [String],
  platformWish:             String,
  paidRequestReason:        String,
  trustToTry:               String,

  // Step 9 — retention
  retentionDrivers: [String],
  biggestProblem:   String,

  // Meta
  autoTags:  [String],
  source:    String,
  utm: {
    source:   String,
    medium:   String,
    campaign: String,
    term:     String,
    content:  String,
  },
  ipAddress:             String,
  userAgent:             String,
  completionTimeSeconds: Number,
  screensSeen:           { type: Number, default: 0 },
  submittedAt:           { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model('MoverResearchSubmission', MoverResearchSubmissionSchema);
