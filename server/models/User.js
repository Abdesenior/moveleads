const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  dotNumber: { type: String },
  mcNumber: { type: String },
  phone: { type: String },
  // 'customer' is the historical mover-account role (early codebase used the
  // word 'customer' to mean "moving company" — a confusing legacy choice we
  // have not migrated). Production also contains accounts with role='mover'
  // from out-of-band creation paths (e.g. scripts/restoreWisdomAccount.js
  // which writes via the raw db.collection driver and bypasses this enum).
  // Both values denote a mover account; every dispatch/candidate-selection
  // query MUST accept both via the exported MOVER_ROLES constant below.
  role: { type: String, enum: ['customer', 'mover', 'admin', 'super_admin'], default: 'customer' },
  balance: { type: Number, default: 0 },
  leadsPurchased: { type: Number, default: 0 },
  autoRechargeThreshold: { type: Number, default: 0 },
  autoRechargeAmount: { type: Number, default: 0 },
  stripeCustomerId: { type: String, default: '' },
  stripePaymentMethodId: { type: String, default: '' },
  dateJoined: { type: Date, default: Date.now },
  serviceAreas: [String],
  serviceZips: [String],
  // ── Legacy "operating states" list. Kept readable for back-compat through
  // Phase 3 of the mover-coverage cleanup. Existing matcher + coverage regen
  // still read from this field; new write paths mirror to it from
  // pickupStates ∪ deliveryStates via utils/serviceAreaMirror.
  serviceStates: [String],
  // ── New canonical service-area fields (Phase 1) ─────────────────────────
  // pickupStates    — 2-letter USPS codes where this mover can ORIGINATE a
  //                   move (where their trucks start from).
  // deliveryStates  — 2-letter codes where this mover can DELIVER. Force-
  //                   cleared to [] when deliversNationwide=true.
  // interstateEnabled — derived from the above; true iff the mover delivers
  //                   to any state they don't pick up from (or nationwide).
  //                   Stored for fast filtering; recomputed on every write
  //                   via utils/serviceAreaMirror.computeInterstateEnabled.
  //
  // Phase 1 INVARIANT: these fields are POPULATED by the new Settings UI
  // and onboarding mirrors, but the matching/dispatch code still reads
  // legacy `serviceStates` + `deliversNationwide`. The buildServiceAreaPatch
  // helper guarantees the legacy field stays in sync until Phase 3 cuts
  // the matcher over.
  pickupStates: { type: [String], default: undefined },
  deliveryStates: { type: [String], default: undefined },
  interstateEnabled: { type: Boolean, default: false },
  preferredHomeSizes: [String],
  maxDistance: { type: String },
  emailNotif: { type: Boolean, default: true },
  smsNotif: { type: Boolean, default: false },
  // ── TCPA compliance (Phase 1 / Block E.2) ───────────────────────────────
  // smsOptOut: partner-side STOP keyword flag. Set true when this mover's
  // phone replies STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT to our Twilio
  // number; reset false on START/UNSTOP/YES. Independent of onboarding.
  smsOptOut: { type: Boolean, default: false },
  // phoneVerified: partner-side phone verification gate. Outbound lead
  // alert SMS only fires when this is true. (Distinct from any lead-side
  // phone verification on the Lead model.)
  //
  // ── Phone-change invariant (Phase 1 verification) ───────────────────────
  // Every write site that updates User.phone MUST also reset phoneVerified
  // to false + clear phoneVerifiedAt when the new value differs from the
  // existing one. Use utils/phoneVerification.applyPhoneChange() to compute
  // the patch. Never mutate phoneVerified manually anywhere except the
  // /verify-code success branch.
  phoneVerified: { type: Boolean, default: false },
  // phoneVerifiedAt: timestamp of the most recent successful verification.
  // Set only by the /verify-code route on Twilio status='approved'. Cleared
  // whenever phoneVerified flips back to false (phone change, etc.).
  phoneVerifiedAt: { type: Date, default: null },
  // phoneVerificationLastSentAt: timestamp of the most recent OTP send.
  // Used to enforce the 60s cooldown between sends. Updated by
  // /send-verification on every successful Twilio Verify create call.
  phoneVerificationLastSentAt: { type: Date, default: null },
  // phoneVerificationSendsToday: per-user daily send counter for OTP
  // requests. dayKey is the UTC start-of-day ISO date string (YYYY-MM-DD);
  // count resets when a new UTC day rolls over. Enforces the 10-sends/24h
  // ceiling in /send-verification.
  phoneVerificationSendsToday: {
    dayKey: { type: String, default: '' },
    count:  { type: Number, default: 0 },
  },
  // smsCounters: per-mover daily Twilio SMS counter for the cap enforced
  // in twilioService.broadcastLeadSMS. `date` is the UTC start-of-day of
  // the count; resets when a new UTC day rolls over.
  smsCounters: {
    date:  { type: Date,   default: null },
    count: { type: Number, default: 0 },
  },
  isSuspended: { type: Boolean, default: false },
  receiveLiveTransfers: { type: Boolean, default: false },
  // Set true when the partner picks "Nationwide" delivery in onboarding.
  // Used by leadMatching + broadcastLeadSMS as a flag instead of writing
  // ~41k destination ZIPs into CoverageArea. Warm transfers still require
  // explicit destination CoverageArea entries (money-safety boundary).
  deliversNationwide: { type: Boolean, default: false },
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
    bonusClaimedAt: { type: Date, default: null }, // set on first $100 onboarding payment only
    activatedAt:    { type: Date, default: null }, // set on ANY successful onboarding activation payment ($50 OR $100)
    firstTopupAt:           { type: Date, default: null }, // set on the first successful dashboard top-up (any amount)
    firstTopupPopupShownAt: { type: Date, default: null }, // set when the post-first-topup reassurance popup is dismissed/seen
    // Stamped when the partner clicks "Continue without activating" on the
    // step-5 offer screen. Used by the DashboardLayout auto-mount effect to
    // STOP re-opening the wizard on subsequent logins. The persistent
    // ActivationBanner CTA still drives explicit re-engagement; this flag
    // only suppresses the *automatic* remount so the experience feels
    // guided rather than paywalled.
    activationOfferDismissedAt: { type: Date, default: null },
    recovery: {
      // Post-skip cadence (completed setup, didn't claim bonus)
      sent12h: { type: Boolean, default: false },
      sent24h: { type: Boolean, default: false },
      sent72h: { type: Boolean, default: false },
      // Mid-wizard cadence (started setup, never reached Confirm)
      sentMidwizard12h: { type: Boolean, default: false },
      sentMidwizard24h: { type: Boolean, default: false },
      sentMidwizard72h: { type: Boolean, default: false },
    },
    answers: {
      // ── New Step 1 (dispatch base + pickup + delivery) ──────────────────
      // dispatchBase is selected from the place-autocomplete only; never
      // free text. zip + city + state always populated together.
      dispatchBase: {
        input: { type: String, default: '' },   // displayed label, e.g. "Houston, TX"
        zip:   { type: String, default: '' },
        city:  { type: String, default: '' },
        state: { type: String, default: '' },   // 2-letter code
      },
      pickup: {
        mode:   { type: String, default: 'near' }, // 'near'|'state'|'states'
        states: { type: [String], default: [] },   // 2-letter codes; only used when mode==='states'
      },
      delivery: {
        mode:   { type: String, default: 'same' }, // 'same'|'states'|'nationwide'
        states: { type: [String], default: [] },   // only used when mode==='states'
      },
      // ── Legacy Step 1 fields (kept for resume back-compat) ──────────────
      primaryMarket:        { type: String, default: '' },           // legacy "Houston, TX" or "77001" free-text
      coverageRadius:       { type: String, default: '' },           // legacy '25'|'50'|'100'|'statewide'|'interstate'
      coveragePreference:   { type: String, default: '' },           // legacy single-select
      coveragePreferences:  { type: [String], default: [] },         // legacy multi-select
      additionalMarkets:    { type: [String], default: [] },         // legacy chip list
      moveTypes:            { type: [String], default: [] },         // ['apartment','home','office','longDistance','emergency','packing','laborOnly','storage']
      avoidMoveTypes:       { type: [String], default: [] },
      alertChannels:        { type: [String], default: [] },         // priority-ordered list of 'sms'|'call'|'email'
      dispatchHoursMode:    { type: String, default: 'default' },    // 'default' (same hours all days) | 'advanced' (per-day)
      dispatchDays:         { type: [String], default: [] },         // ['mon','tue','wed','thu','fri','sat','sun']
      dispatchHoursOpen:    { type: String, default: '08:00' },      // used in 'default' mode
      dispatchHoursClose:   { type: String, default: '19:00' },      // used in 'default' mode
      dispatchHours:        { type: mongoose.Schema.Types.Mixed, default: {} }, // per-day: { mon: {open,close}, ... } — used in 'advanced'
      dailyRequestCapacity: { type: String, default: '' },           // '1-3'|'4-7'|'8-15'|'15+'
      preferredTiming:      { type: [String], default: [] },         // ['sameDay','within7Days','thisMonth','any']
      crewCount:            { type: String, default: '' },           // '1'|'2-3'|'4-6'|'7+'
    },
  },

  // ── SMS Claim / Instant Jobs ─────────────────────────────────────────
  //
  // As of 2026-05-28, `smsClaim.optInRequested` IS read at dispatch time
  // in services/twilioService.broadcastLeadSMS as part of the per-mover
  // Claim-vs-Alert partition. Movers WITHOUT optInRequested=true (or with
  // balance < lead.buyNowPrice) receive the Alert variant of the SMS
  // ("Claim: moveleads.cloud/login") instead of the Claim variant
  // ("Reply SEND <token> to claim"). Both still get an SMS — the
  // partition controls which body template and whether they enter the
  // claimWindow.broadcastTo set.
  //
  // The other smsClaim.* fields (maxLeadPrice, residentialOnly,
  // commercialOptIn, asapOnly, dailyClaimCap) remain "retire-the-read"
  // — they are NOT consulted at dispatch. They survive in the schema as
  // mover-side intent the operator may surface later, but no hidden
  // dispatch filter reads them (see notification-precedence-cleanup
  // memory + PR-C3/PR-C4 lineage). If a use case returns, expose them in
  // the Settings UI first; do not silently filter on them.
  //
  // status is server-derived on every GET/PATCH:
  //   'inactive'         — optInRequested === false
  //   'needs_balance'    — optInRequested === true AND balance < recommended
  //   'preview_enabled'  — optInRequested === true AND balance >= recommended
  // The dashboard UI badge tracks `status`. The enum still says "preview"
  // because the SmsClaim feature continues to roll out on a controlled
  // mover cohort — broad marketing enablement is a separate operational
  // decision.
  smsClaim: {
    status:           { type: String, enum: ['inactive', 'needs_balance', 'preview_enabled'], default: 'inactive' },
    optInRequested:   { type: Boolean, default: false },
    maxLeadPrice:     { type: Number,  default: 100 },
    residentialOnly:  { type: Boolean, default: true },
    commercialOptIn:  { type: Boolean, default: false },
    asapOnly:         { type: Boolean, default: false },
    dailyClaimCap:    { type: Number,  default: 0 },        // 0 = unlimited
    optInAt:          { type: Date },
    lastUpdatedAt:    { type: Date },
  },
});

/**
 * Mover-account role discriminators. Every query that selects mover/dispatch
 * candidates (broadcastLeadSMS, broadcastLeadEmail, findEligibleMovers,
 * admin active-mover metrics) MUST consult this set with `{ $in: MOVER_ROLES }`,
 * NOT a hard-coded `'customer'` literal. The set exists because production
 * has a mix of legacy 'customer' and newer 'mover' role values; filtering on
 * 'customer' alone silently drops the 'mover' accounts (the bug that hid the
 * Alabama staging SMS Claim test from dispatch in 2026-05).
 */
const MOVER_ROLES = Object.freeze(['customer', 'mover']);

const User = mongoose.model('user', UserSchema);
User.MOVER_ROLES = MOVER_ROLES;
module.exports = User;
