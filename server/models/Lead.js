const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  route: { type: String, required: true },
  originCity: { type: String, required: true },
  destinationCity: { type: String, required: true },
  originZip: { type: String, default: '' },
  destinationZip: { type: String, default: '' },
  // 2-letter USPS state codes derived from ZIP at ingest (see V4/V5 ingest
  // routes) and backfilled for legacy docs via scripts/backfillLeadStates.js.
  // Optional — legacy leads predating this field continue to render city-only
  // via the client's fmtRoutePart fallback.
  originState: { type: String, trim: true, uppercase: true, default: '' },
  destinationState: { type: String, trim: true, uppercase: true, default: '' },
  isVerified: { type: Boolean, default: false },
  homeSize: { type: String, required: true },
  moveDate: { type: Date, required: true },
  distance: { type: String, enum: ['Local', 'Long Distance'], required: true },
  price: { type: Number, required: true },
  miles: { type: Number, default: 0 },
  status: { type: String, enum: ['Available', 'Purchased', 'Expired', 'Pending Verification', 'READY_FOR_DISTRIBUTION', 'REJECTED_FAKE', 'PENDING_MANUAL_REVIEW'], default: 'Available' },
  score: { type: Number, default: 0 },
  grade: { type: String, enum: ['A', 'B', 'C', 'D'] },
  scoreFactors: [String],
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
      company:     { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
      purchasedAt: { type: Date, default: Date.now },
      pricePaid:   { type: Number, default: 0 },
    }
  ],
  maxBuyers:      { type: Number, default: 1 },
  sourceCompany:  { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
  source:         { type: String },
  verifiedBy:     { type: String },
  isWarmTransfer: { type: Boolean, default: false },
  createdAt:      { type: Date, default: Date.now },

  // ── Auction / Dynamic pricing ──────────────────────────────────────────
  buyNowPrice:      { type: Number, default: 10 },
  startingBidPrice: { type: Number, default: 9 },
  currentBidPrice:  { type: Number, default: 0 },
  auctionEndsAt:    { type: Date },
  auctionStatus: {
    type: String,
    // 'settling' is an interim status used by the auction settlement cron so a
    // crash mid-run can be recovered on the next tick (see jobs/settleAuctions.js).
    enum: ['pending', 'active', 'sold', 'expired', 'buy_now', 'settling'],
    default: 'pending',
  },
  bids: [{
    company:  { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    amount:   Number,
    placedAt: { type: Date, default: Date.now },
  }],
  winnerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
  finalPrice: { type: Number },

  // ── Notification dedup ─────────────────────────────────────────────────
  // Set the first time SMS/email broadcast fires for this lead. Subsequent
  // broadcast callers short-circuit on this unless they pass `force: true`
  // (e.g. an admin re-pricing flow that genuinely wants to re-fire).
  // Updated atomically via `updateOne({_id, notifiedAt: null}, ...)` so two
  // parallel broadcast paths (SMS+email) only flip it once.
  notifiedAt: { type: Date, default: null },

  // ── Broadcast manifest (PR-4, 2026-05-29) ──────────────────────────────
  // Persisted observability for "why did/didn't this lead dispatch?" so
  // the answer comes from the app layer, not only Render logs. Closes
  // HIGH-CONFIDENCE-FIX-PLAN F6. All three fields are ADDITIVE; legacy
  // leads (and any lead pre-PR-4) simply have them unset, which is
  // indistinguishable from "no broadcast attempt observed."
  //
  // ▲ MOVER-FACING EXPOSURE IS PROHIBITED (Fr5, 2026-05-30) ▲
  //
  // These three fields are ADMIN/OBSERVABILITY ONLY. They MUST NOT appear
  // in any mover-facing API response, client component, email, SMS, or
  // dashboard surface — directly or transformed (e.g., "Sent to 7 other
  // movers", "Available to N companies", "Competition level: High").
  //
  // Rationale: surfacing competition counts to movers causes immediate
  // conversion collapse. A mover who sees N>1 disengages — "no point,
  // someone else got it." A mover who sees N=1 wonders why they're the
  // only candidate and assumes the lead is low-quality. There is no value
  // of N that helps; the data must stay admin-only.
  //
  // Any PR that adds a read of these fields from a non-admin route, or
  // includes them in a serialized response sent to the mover dashboard,
  // MUST be blocked at code review. See: docs/code-review-rules.md.
  //
  // Writers (single sources of truth — do not write from elsewhere):
  //   lastBroadcastAttemptAt        — dispatchApprovedLead, at fanout time
  //   lastBroadcastSuppressReason   — dispatchApprovedLead on visibility
  //                                   suppression (specific reason from
  //                                   isHiddenFromMoversById), OR
  //                                   broadcastLeadSMS when the SMS
  //                                   pipeline matches zero movers
  //                                   (refined reason: sms_no_coverage /
  //                                   sms_no_candidates / sms_no_policy_pass).
  //                                   Cleared by dispatchApprovedLead when
  //                                   the broadcast is actually proceeding
  //                                   so a previously-suppressed lead that
  //                                   later becomes distributable doesn't
  //                                   keep the stale reason.
  //   lastBroadcastMatchedCount     — broadcastLeadSMS after policy filter,
  //                                   always (including 0).
  //
  // Reader (allowed): GET /api/admin/leads/:id/distribution-diagnose.
  // Readers (PROHIBITED): any non-admin route, any client component,
  // any email/SMS template, any mover-facing aggregation.
  //
  // Writes are best-effort (fire-and-forget). A failed manifest write must
  // NEVER block the dispatch itself — observability cannot regress behavior.
  lastBroadcastAttemptAt:      { type: Date,   default: null },
  lastBroadcastSuppressReason: { type: String, default: null, trim: true, maxlength: 200 },
  lastBroadcastMatchedCount:   { type: Number, default: null },

  // ── V5 Lead Quality (Phase 1 — shadow mode) ────────────────────────────
  // All fields below are OPTIONAL and ADDITIVE. Legacy V4 leads will not
  // have them populated; nothing in production reads from them yet. The
  // authoritative score/grade/price/status remain the legacy fields above.
  // See docs/superpowers/specs/2026-05-14-moveleads-v5-lead-quality-design.md
  scores: {
    trustScore:      { type: Number },
    urgencyScore:    { type: Number },
    leadValueScore:  { type: Number },
    routeValueScore: { type: Number },
    intentScore:     { type: Number },
    fraudRiskScore:  { type: Number },
    moverMatchScore: { type: Number },
    compositeScore:  { type: Number },
  },
  tier:       { type: String, enum: ['hot', 'premium', 'standard', 'review', 'rejected'] },
  tierReason: [{ type: String }],
  // Phase 6 — denormalized mirror of the latest ScoringSnapshot.tier value.
  // Used by leadVisibility.moverVisibilityFilter() to filter rejected leads
  // from mover feeds in `rejected_only` routing mode without joining the
  // snapshot collection on every request. Written by scoringPipeline
  // immediately after each snapshot save (failure-tolerant). Missing or
  // unwritten value keeps the lead visible (safety).
  shadowTier:           { type: String, enum: ['hot', 'premium', 'standard', 'review', 'rejected'], index: true },
  shadowTierUpdatedAt:  { type: Date },
  // Phase 6.3 — quality gate flag. V5 ingest sets this to FALSE so the lead
  // is invisible to movers until scoring/validation completes. The scoring
  // pipeline flips it to TRUE in the same atomic update that mirrors
  // shadowTier (unless the resulting tier is 'rejected', in which case the
  // flag stays false and the lead is permanently hidden until admin overrides).
  //
  // Three states matter for the visibility filter:
  //   undefined → V4 lead or pre-Phase-6.3 V5 lead — passes through (back-compat)
  //   false     → V5 lead awaiting scoring OR scoring=rejected — hidden
  //   true      → scoring completed with non-rejected tier — visible
  //
  // The filter clause `{ qualityGateCleared: { $ne: false } }` lets undefined
  // and true through while blocking explicit false.
  qualityGateCleared:   { type: Boolean, index: true },
  // Phase 6.4 — denormalized list of structural-blocker codes computed at
  // scoring time by leadVisibility.computeStructuralBlockers(). Used by
  // moverVisibilityFilter() in `blocked_and_review` mode to hide review
  // leads that have ANY structural blocker. Missing/empty = no blockers
  // = lead remains visible (back-compat for pre-Phase-6.4 records).
  structuralBlockers:   [{ type: String }],
  validation: {
    phone:       { type: mongoose.Schema.Types.Mixed },
    route:       { type: mongoose.Schema.Types.Mixed },
    fingerprint: { type: mongoose.Schema.Types.Mixed },
    fraud:       { type: mongoose.Schema.Types.Mixed },
  },
  // Phase 4 SMS Claim scaffolding — schema present, NEVER WRITTEN in production
  // until ENABLE_SMS_CLAIM_SCAFFOLD=true (and even then ENABLE_SMS_CLAIM_LIVE=true
  // is required for the inbound webhook to actually claim). All fields optional.
  // claimWindow.token is the 4-char claim token (see utils/claimToken.js) used
  // by the inbound SMS handler to disambiguate "which lead is this reply for".
  // Token-based from day one — last-broadcast-wins is unsafe when one mover
  // gets multiple SMS in the window.
  claimWindow: {
    status:      { type: String, enum: ['open', 'claimed', 'expired'] },
    openedAt:    { type: Date },
    expiresAt:   { type: Date },
    // 2026-05-28 — PR-S2: token index moved to schema level + made
    // unique-sparse. Index spec is defined at the bottom of this file
    // (see LeadSchema.index calls) so the uniqueness contract is
    // explicit + named.
    token:       { type: String, trim: true, uppercase: true },
    windowMinutes: { type: Number },
    broadcastTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    offeredTo:   { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    claimedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    claimedAt:   { type: Date },
    closedReason: { type: String, enum: ['claimed', 'expired', 'admin_revoked'] },
  },
  heavyItems:         [{ type: String }],
  intentConfirmed:    { type: Boolean },
  urgencyBucket:      { type: String, enum: ['asap', 'this_week', 'this_month', 'flexible'] },
  moveType:           { type: String, enum: ['residential', 'commercial', 'office', 'storage', 'other'] },
  // V6 conversational funnel — operational difficulty signals.
  // `homeType` is the customer's physical dwelling (house/apartment/etc.);
  // distinct from `moveType` (residential/commercial classification).
  // `stairs` captures walk-up vs elevator vs ground floor — biggest
  // under-quote risk for movers per pre-V6 audit. Both fields are
  // OPTIONAL: V4/V5 leads never populate them; the scoring engine does
  // not read them yet (separate workstream).
  homeType:           { type: String, enum: ['house', 'apartment', 'condo', 'townhouse', 'storage', 'other'] },
  stairs:             { type: String, enum: ['ground_floor', 'walk_up_2', 'walk_up_3plus', 'elevator'] },
  funnelVersion:      { type: String },
  clientSubmissionId: { type: String },
  adminTierOverride: {
    tier:   { type: String, enum: ['hot', 'premium', 'standard', 'review', 'rejected'] },
    reason: { type: String },
    by:     { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    at:     { type: Date },
  },

  // Phase 4 — admin quality review workflow. Optional fields the admin sets
  // via the "Mark Reviewed" action in the scoring snapshot modal. Does NOT
  // change tier on its own; surfaces as a "Reviewed by X at T" badge.
  reviewedAt:    { type: Date },
  reviewedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
  reviewNotes:   { type: String },

  // Phase 3 marketplace pricing V2 — SHADOW ONLY. Computed at ingest by
  // pricingEngineV2.compute(); the legacy engine still owns buyNowPrice
  // and the claim/refund path. Lets admin see legacy vs V2 side-by-side.
  // No migration: optional fields, null on legacy leads.
  priceShadowV2:             { type: Number },
  pricingBreakdownShadowV2:  [{
    code:      { type: String },
    label:     { type: String },
    amountUsd: { type: Number },
    _id:       false,
  }],

  // Simplified additive USD pricing engine — Phase 1 shadow + Phase 3
  // forward-only cutover. Computed at ingest by pricingEngineSimple.compute()
  // against the unified PricingRule collection. priceShadowSimple is the
  // sum of BASE + matching DISTANCE/HOME_SIZE/URGENCY/VERIFICATION/HEAVY_ITEM
  // rows, clamped to [$10, $250].
  priceShadowSimple:         { type: Number },
  pricingBreakdownSimple:    [{
    category:   { type: String },
    matchValue: { type: String },
    amountUsd:  { type: Number },
    _id:        false,
  }],

  // Phase 3 forward-only marker: which engine wrote buyNowPrice at ingest.
  //   undefined → pre-Phase-3 lead (legacy multiplier engine; never touched)
  //   'legacy'  → created with ENABLE_PRICING_SIMPLE_LIVE off
  //   'simple'  → created with ENABLE_PRICING_SIMPLE_LIVE on
  //
  // The Twilio phone-verification reprice (services/twilioService.js)
  // dispatches by this field, so a lead never switches engines mid-life,
  // even if the operator flips the env flag mid-stream. Existing leads
  // (version=undefined) keep behaving exactly as they did before Phase 3
  // shipped — no migration, no backfill, no re-derivation.
  pricingEngineVersion:      { type: String, enum: ['legacy', 'simple'] },

  // ── Distribution model — Phase A (forward-only stamp, no behavior change) ──
  //
  // Captures HOW a lead is sold:
  //   'auction'  → 24h bid window + buy-now (legacy primary path; default for
  //                back-compat and for all leads created while the
  //                ENABLE_INSTANT_DISPATCH env flag is off)
  //   'instant'  → buy-now / SMS-claim only, first-come-first-served,
  //                no auction window, no bidding. Set when ingest sees
  //                ENABLE_INSTANT_DISPATCH=true.
  //
  // Phase A invariant: the field is WRITTEN at ingest but NOT yet read by any
  // money path. Bid routes, settlement cron, broadcast pipeline, UI — all
  // still assume the auction model. Flipping the env flag in this phase only
  // changes WHICH STRING gets stored; nothing else.
  //
  // Phase B will branch ingest defaults (skip auctionEndsAt/startingBidPrice
  // on 'instant' leads), block bid attempts on 'instant' leads, and hide
  // auction UI for them. Phase C flips the flag in prod.
  //
  // Default 'auction' so any back-compat path (admin POST body-spread,
  // CSV import scripts, test fixtures) keeps the current behavior without
  // needing an explicit value.
  distributionModel: {
    type: String,
    enum: ['auction', 'instant'],
    default: 'auction',
  },

  // ── Deal Room V1 — inventory surface taxonomy ──────────────────────────
  //
  // "WHERE the lead is surfaced." Orthogonal to distributionModel (HOW it's
  // sold). This pair of fields enables the secondary monetization surface
  // (/dashboard/deals) without touching the main feed.
  //
  //   'main'      → eligible for /dashboard/leads (subject to the existing
  //                 status/quality/distributionModel filters in routes/leads.js)
  //   'deal_room' → discounted secondary inventory, surfaced ONLY at
  //                 /dashboard/deals (admin-curated)
  //   'archived'  → permanently hidden from BOTH mover surfaces. Admin-only
  //                 view. No automatic promotion paths.
  //
  // Default 'main' so every existing lead behaves identically until admin
  // moves it. `inventoryChannel` is indexed because both feed queries hit it.
  inventoryChannel: {
    type: String,
    enum: ['main', 'deal_room', 'archived'],
    default: 'main',
    index: true,
  },

  // Snapshot of the pre-deal buyNowPrice, captured the first time admin moves
  // the lead to 'deal_room'. Lets the "Restore" admin action put the price
  // back exactly. Unset for leads that have never been in Deal Room. We
  // deliberately do NOT store dealPrice or discountPercent separately:
  //   - dealPrice    → it IS the post-move buyNowPrice (single source of
  //                    truth keeps the buy-now / refund / Transaction paths
  //                    unchanged)
  //   - discountPercent → cheap to compute at display time as
  //                       round((1 - buyNowPrice/originalPrice) * 100)
  //
  // Audit trail (who moved it, when, why) lives in the existing AdminAction
  // collection — we don't duplicate it here.
  originalPrice: { type: Number },

  // ── Phase 1: unified distribution decision layer ───────────────────────
  //
  // Single authoritative field for "is this lead distributable, by whose
  // authority?". Separates SYSTEM evidence (validation/scoring) from
  // ADMIN decisions. The mover feed will read this one field in Phase 3;
  // in Phase 1 it is WRITE-ONLY (the legacy 8-clause filter is still
  // authoritative for production reads).
  //
  // Values:
  //   system_pending   — pipeline hasn't produced a verdict yet
  //   system_approved  — pipeline cleared the lead
  //   system_held      — pipeline says hold for human review
  //   system_rejected  — pipeline says reject (shadowTier='rejected')
  //   admin_approved   — admin override: distribute regardless of system
  //   admin_rejected   — admin override: hide regardless of system
  //
  // Stickiness rule: any admin_* value is durable. Pipeline writers
  // (scoringPipeline, verifyLeadPhone) MUST use a conditional updateOne
  // filtered on { distributionDecision: { $in: SYSTEM_VALUES } } so a
  // freshly-set admin_* value never gets clobbered by a later rescore
  // or pipeline re-run. Only an admin action can move admin_* values.
  distributionDecision: {
    type: String,
    enum: [
      'system_pending',
      'system_approved',
      'system_held',
      'system_rejected',
      'admin_approved',
      'admin_rejected',
    ],
    default: 'system_pending',
    index: true,
  },
  // 'system' for pipeline writes, stringified userId for admin writes,
  // 'migration' for backfill. Kept loose (String, not ObjectId) so the
  // single field can hold either kind of actor.
  distributionDecisionBy:     { type: String, default: 'system' },
  distributionDecisionAt:     { type: Date },
  distributionDecisionReason: { type: String, maxlength: 500 },

  // ── Meta Pixel + Conversions API tracking (Commit 1 — capture only) ─────
  //
  // Captured at ingest from the V6 funnel so the same Lead event can later
  // be deduplicated across browser Pixel and server-side CAPI. Commit 1
  // PERSISTS these fields only; no CAPI calls fire yet. Commits 2/3 add
  // the browser pixel + server-side send.
  //
  //   metaEventId    Client-generated UUIDv4. Same value the browser passes
  //                  as `eventID` to `fbq('track','Lead',…,{eventID})`. The
  //                  CAPI payload uses the snake_case `event_id`. Meta
  //                  dedupes by (event_name, event_id) within ~7 days.
  //   fbp / fbc      Meta's first-party cookies (`_fbp` / `_fbc`). Client
  //                  reads them from `document.cookie` and posts them in
  //                  the body — keeps the server cookie-parser-free.
  //                  `fbc` may be reconstructed from `?fbclid` on a fresh
  //                  ad-click landing.
  //   ipAddress      Captured server-side from `req.ip` (trust proxy is
  //                  enabled, so this is the real client IP behind Vercel).
  //   userAgent      `req.headers['user-agent']` — sent to Meta as
  //                  `client_user_agent`. Plaintext, never hashed.
  //   eventSourceUrl `window.location.href` at the moment the browser
  //                  fires Lead. Must match exactly between Pixel and CAPI
  //                  or Meta won't deduplicate.
  //   metaCapiSentAt Set by metaCapi.sendLead after a successful CAPI
  //                  POST. Idempotency guard against accidental re-fires.
  //   metaQualifiedSentAt
  //                  Set after QualifiedLead fires (later commit). Mirrors
  //                  the same single-fire guarantee for the qualified event.
  //
  // All fields OPTIONAL — legacy leads and V4/V5 submissions that don't
  // send these stay valid. Absent tracking fields just mean dedup quality
  // degrades for that lead (we still fire CAPI; Meta falls back to PII
  // hashes for matching).
  metaEventId:         { type: String, index: true },
  fbp:                 { type: String },
  fbc:                 { type: String },
  ipAddress:           { type: String },
  userAgent:           { type: String },
  eventSourceUrl:      { type: String },
  metaCapiSentAt:      { type: Date },
  metaQualifiedSentAt: { type: Date },
});

// Compound index on zip fields — the core routing hot path hits these on every lead ingest.
LeadSchema.index({ originZip: 1, destinationZip: 1 });
// Status index for the dashboard GET /api/leads query (filter by status + sort by createdAt).
LeadSchema.index({ status: 1, createdAt: -1 });

// V5 idempotency — partial unique index on clientSubmissionId. Two parallel
// POSTs from a flaky mobile network with the same UUID can't both create a
// lead; the second insert hits a duplicate-key error and the route handler
// returns the existing lead instead. Partial filter so legacy V4 leads
// (which never set this field) are not affected.
LeadSchema.index(
  { clientSubmissionId: 1 },
  { unique: true, partialFilterExpression: { clientSubmissionId: { $exists: true, $type: 'string' } }, name: 'clientSubmissionId_partial_unique' }
);

// 2026-05-28 — PR-S2: SMS Claim pipeline pre-flip hardening indexes.
//
// (1) Unique sparse index on claimWindow.token.
//     The Phase 5 inbound webhook will atomically flip a claim window
//     via Lead.findOneAndUpdate({ 'claimWindow.token': T, 'claimWindow.status': 'open' }, ...).
//     This MUST be a unique token-per-lead lookup — two leads sharing
//     a token would make the findOne ambiguous and let the wrong lead
//     be claimed. The previous inline `index: true, sparse: true` on
//     the token field was non-unique; PR-S2 replaces it with this
//     named unique-sparse index.
//
//     OPERATIONAL NOTE: production Mongo already has an auto-created
//     index named `claimWindow.token_1` (anonymous, non-unique) from
//     the previous inline declaration. Phase 4 has ZERO rows with
//     this field set, so dropping the old + creating the new is
//     instant and safe. After this PR deploys, run in Mongo shell:
//         db.leads.dropIndex('claimWindow.token_1')
//     and restart the server so Mongoose creates the new named
//     unique-sparse index on connection.
//
// (2) Compound partial index on { claimWindow.status, claimWindow.expiresAt }.
//     Supports the closeStaleClaimWindows background job (PR-S4) query:
//         { 'claimWindow.status': 'open', 'claimWindow.expiresAt': { $lt: now } }
//     Partial filter keeps the index tiny — only leads with an actual
//     claim window get an index entry. The vast majority of leads have
//     no claim window in Phase 5 (only instant-dispatch claim leads).
LeadSchema.index(
  { 'claimWindow.token': 1 },
  { unique: true, sparse: true, name: 'claimWindow_token_unique' }
);
LeadSchema.index(
  { 'claimWindow.status': 1, 'claimWindow.expiresAt': 1 },
  {
    name: 'claimWindow_status_expiresAt',
    partialFilterExpression: { 'claimWindow.status': { $exists: true } }
  }
);

module.exports = mongoose.model('lead', LeadSchema);
