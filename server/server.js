require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET is not set. Refusing to start.');
  process.exit(1);
}

console.log('SERVER VERSION: import-fix-v4', new Date().toISOString());
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db');

const http = require('http');
const socketService = require('./services/socketService');
const sanitizeInput = require('./middleware/sanitize');
const { requestLogger, responseTimeMiddleware } = require('./middleware/logger');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

connectDB();

app.use(helmet({
  frameguard: { action: 'sameorigin' },
  contentSecurityPolicy: false,
}));

const ALLOWED_ORIGINS = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
    'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175'];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-auth-token'],
}));

// Stripe webhook must be mounted BEFORE the global express.json() middleware
// so the route's express.raw() handler can read the un-parsed body for
// signature verification. Also mounted BEFORE the verifiedGate-wrapped
// /api/billing router because Stripe deliveries carry no JWT.
app.use('/api/billing/webhook', require('./routes/billingWebhook'));

app.use(express.json({ limit: '100kb' }));

app.use(requestLogger);
app.use(responseTimeMiddleware());
app.use(sanitizeInput);

socketService.init(server);

app.get('/', (req, res) => res.send('MoveLeads Core API is Live'));

app.get('/api/health', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const dbState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.json({
      status: 'ok',
      version: 'import-fix-v4',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      database: dbState,
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// ── Email-verification gate ────────────────────────────────────────────────
// `auth` populates req.user (re-querying DB for role+isEmailVerified each
// request). `requireEmailVerified` then blocks any non-admin user whose
// email isn't verified. Admin / super_admin bypass — they need access to
// admin tools even if their seed account doesn't have the verified flag.
//
// Exemptions (no gate applied):
//   /api/auth         — the verification mechanism itself + /me which the
//                       client polls to discover verification status.
//   /api/twilio       — Twilio webhooks (signature verified, no JWT).
//   /api/public       — unauthenticated lead-volume + quote-ingest endpoints.
//   /api/billing/webhook — Stripe webhook (mounted above, signature verified).
const { auth, requireEmailVerified } = require('./middleware/auth');
const verifiedGate = [auth, requireEmailVerified];

app.use('/api/auth',   require('./routes/auth'));    // PUBLIC: verification mechanism
app.use('/api/public', require('./routes/public'));  // PUBLIC: lead-volume / quote ingest
app.use('/api/twilio', require('./routes/twilio'));  // PUBLIC: Twilio signature-verified webhooks
// ── Phase 2A — Warm-transfer / Live Phone Transfer surface RETIRED ──────────
// /api/voice (Twilio voice webhooks → warm-transfer flow) is intentionally
// UNMOUNTED. All paths under /api/voice/* now return 404 from Express.
//
// Kept for historical compatibility / potential future re-introduction:
//   - server/routes/voice.js                  (file remains on disk)
//   - server/utils/findEligibleMovers.js      (CoverageArea typed-zip
//                                              aggregation — used by
//                                              warm transfers when voice
//                                              ships AND by future
//                                              eligibility queries)
//   - User.receiveLiveTransfers               (schema field — permanent.
//                                              FILTER retired in PR-D7
//                                              per no-hidden-backend-prefs;
//                                              when voice ships, the next
//                                              PR decides an explicit
//                                              opt-in mechanism with UI.)
//   - Lead.isWarmTransfer                     (schema field — permanent)
//   - PurchasedLead.isLiveTransfer            (schema field — permanent)
//   - Existing Transaction rows with description 'Live Warm Transfer'
//
// Operator action required at deploy: disconnect the inbound voice webhook
// in the Twilio console (Phone Numbers → Active Numbers → Voice Config),
// otherwise Twilio will keep posting to a now-404'd URL and log retrieval
// failures. See conversation: Live Transfer Phase 2A.
//
// Do NOT delete routes/voice.js or any of the schema fields above without
// coordinating with the retirement plan. Schema removal is explicitly
// out of scope — protects historical records from Mongoose strip-on-save.
//
// app.use('/api/voice',  require('./routes/voice'));   // PUBLIC: Twilio voice webhooks
app.use('/api/founding-movers', require('./routes/foundingMovers')); // PUBLIC: Founding Mover Program intake
app.use('/api/partner-research', require('./routes/partnerResearch')); // PUBLIC: Partner validation funnels (realtors + FB groups)

// PUBLIC: Quote-form ingest. MUST be mounted BEFORE the gated /api/leads
// router below — Express dispatches by registration order, so this more
// specific path wins and the visitor never hits the auth middleware.
app.use('/api/leads/ingest', require('./routes/leadIngest'));
// PUBLIC: V5 quote-form ingest (Phase 3). Strict Zod schema, idempotent
// by clientSubmissionId, populates V5-only fields on Lead.
app.use('/api/leads/ingest-v2', require('./routes/leadIngestV2'));

// Dashboard data routes — gated on verified email
app.use('/api/leads',          verifiedGate, require('./routes/leads'));
// Mount specific user sub-paths BEFORE the generic /api/users so the static
// /api/users/me/sms-claim wins. Phase B — preview-only Instant Jobs prefs.
app.use('/api/users/me/sms-claim', verifiedGate, require('./routes/smsClaim'));
// Dispatch hours editor — mounted BEFORE /api/users so it isn't shadowed
// by the unified PUT /users/:id handler. Single-purpose endpoint:
// PATCH /api/users/me/dispatch-hours writes onboarding.answers.{
// dispatchHoursMode,dispatchHoursOpen,dispatchHoursClose,dispatchDays}.
// Read path (dispatchPolicy.isWithinDispatchHours) is unchanged.
app.use('/api/users/me/dispatch-hours', verifiedGate, require('./routes/dispatchHours'));
// Phone verification — Twilio Verify-backed OTP flow. Mounted before the
// generic /api/users router so /api/users/me/phone/* paths win. Capability
// gates SMS alerts + SMS Claim; NOT a dashboard-access gate.
app.use('/api/users/me/phone', verifiedGate, require('./routes/phoneVerification'));
app.use('/api/users',          verifiedGate, require('./routes/users'));
app.use('/api/admin/settings', verifiedGate, require('./routes/settings'));
app.use('/api/admin/mover-research', verifiedGate, require('./routes/admin/moverResearch'));
app.use('/api/admin/partner-research', verifiedGate, require('./routes/admin/partnerResearch'));
// Matcher diagnosis — read-only observability tool. Mounted BEFORE generic
// /api/admin so /diagnose isn't shadowed by admin.js wildcards.
app.use('/api/admin/matcher',  verifiedGate, require('./routes/admin/matcherDiagnose'));
// ClaimAttempt query endpoint — read-only forensics. Closes
// HIGH-CONFIDENCE-FIX-PLAN F4 (ClaimAttempt had no HTTP read path).
// Mounted BEFORE generic /api/admin so /claim-attempts wins.
app.use('/api/admin/claim-attempts', verifiedGate, require('./routes/admin/claimAttempts'));
// Analytics router — mounted BEFORE generic /api/admin so the specific
// /quality-analytics, /carrier-analytics, /pricing-v2-analytics paths and
// /leads/:id/action-timeline get first crack. Falls through to admin.js
// for unmatched paths under /api/admin.
app.use('/api/admin',          verifiedGate, require('./routes/adminAnalytics'));
// Deal Room V1 — bulk inventory actions. Mounted BEFORE generic /api/admin
// so /inventory/bulk wins over any path admin.js might define under
// /api/admin/inventory. Feature is gated internally by ENABLE_DEAL_ROOM env.
app.use('/api/admin/inventory', verifiedGate, require('./routes/adminInventory'));
app.use('/api/admin',          verifiedGate, require('./routes/admin'));
app.use('/api/disputes',       verifiedGate, require('./routes/disputes'));
app.use('/api/admin/pricing',  verifiedGate, require('./routes/pricing'));
app.use('/api/billing',        verifiedGate, require('./routes/billing'));   // webhook mounted separately above
app.use('/api/onboarding',     verifiedGate, require('./routes/onboarding'));
app.use('/api/purchases',      verifiedGate, require('./routes/purchases'));
app.use('/api/routing',        verifiedGate, require('./routes/routing'));
app.use('/api/bids',           verifiedGate, require('./routes/bids'));
app.use('/api/complaints',     verifiedGate, require('./routes/complaints'));
app.use('/api/images',         verifiedGate, require('./routes/images'));

require('./jobs/settleAuctions');
require('./jobs/requestFeedback');
require('./jobs/cleanupExpiredLeads');
require('./jobs/onboardingRecovery');
// PR-S4 — SMS Claim Pipeline pre-flip hardening. Expires stale open
// claimWindows every 5 min (flag-independent maintenance — see file header).
require('./jobs/closeStaleClaimWindows');
// PR-6 — auction reactivation moved out of the read path (was a silent
// state mutation in GET /api/leads). Runs every 5 min and dispatches
// each reactivated lead via the canonical orchestrator. See file header
// for cadence + idempotency rationale.
require('./jobs/reactivateLeads');

app.use((req, res, next) => {
  res.status(404).json({ msg: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    msg: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Surface Twilio Verify config on boot so operators can confirm at deploy
// time that the right credentials were picked up. Logs only SID prefixes —
// no auth token, no full SIDs. Quiet no-op if the wrapper isn't loaded yet.
try {
  require('./services/twilioVerifyService').logVerifyConfigOnce();
} catch (_e) { /* non-fatal */ }

const PORT = process.env.PORT || 5005;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
