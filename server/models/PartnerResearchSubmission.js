const mongoose = require('mongoose');

/**
 * PartnerResearchSubmission — captures intake from the two partner
 * validation funnels (/founding-realtors and /founding-groups).
 *
 * One collection, partnerType discriminator. The compound unique index
 * on (email, partnerType) lets the same person apply as both a realtor
 * and a group admin — a legitimate scenario.
 */
const PartnerResearchSubmissionSchema = new mongoose.Schema({
  partnerType: {
    type: String,
    enum: ['realtor', 'facebook_group_admin'],
    required: true,
    index: true,
  },

  // Shared identity
  fullName: { type: String, required: true, trim: true },
  email:    { type: String, required: true, lowercase: true, trim: true },

  // Realtor-specific (sparse: only set when partnerType = 'realtor')
  brokerageName:        { type: String, trim: true },
  mainMarket:           { type: String, trim: true }, // "City, ST" — picked from autocomplete
  monthlyMovingClients: { type: String, enum: ['1-4', '5-14', '15-29', '30+', ''], default: '' },

  // Facebook-group-specific (sparse: only set when partnerType = 'facebook_group_admin')
  facebookGroupUrl:     { type: String, trim: true },
  groupSize:            { type: String, enum: ['1k-5k', '5k-20k', '20k-50k', '50k+', ''], default: '' },
  movingHelpFrequency:  { type: String, enum: ['daily', 'weekly', 'occasionally', 'rarely', ''], default: '' },
  originMarket:         { type: String, trim: true }, // "City, ST" — where members move from
  destinationMarket:    { type: String, trim: true }, // "City, ST" — where members move to

  // Metadata
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
  submittedAt:           { type: Date, default: Date.now, index: true },
});

// Compound unique — same email may exist twice if partnerType differs.
PartnerResearchSubmissionSchema.index(
  { email: 1, partnerType: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('PartnerResearchSubmission', PartnerResearchSubmissionSchema);
