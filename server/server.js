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
//   - server/utils/findEligibleMovers.js      (receiveLiveTransfers filter)
//   - User.receiveLiveTransfers               (schema field — permanent)
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
// Phone verification — Twilio Verify-backed OTP flow. Mounted before the
// generic /api/users router so /api/users/me/phone/* paths win. Capability
// gates SMS alerts + SMS Claim; NOT a dashboard-access gate.
app.use('/api/users/me/phone', verifiedGate, require('./routes/phoneVerification'));
app.use('/api/users',          verifiedGate, require('./routes/users'));
app.use('/api/admin/settings', verifiedGate, require('./routes/settings'));
app.use('/api/admin/mover-research', verifiedGate, require('./routes/admin/moverResearch'));
app.use('/api/admin/partner-research', verifiedGate, require('./routes/admin/partnerResearch'));
// Analytics router — mounted BEFORE generic /api/admin so the specific
// /quality-analytics, /carrier-analytics, /pricing-v2-analytics paths and
// /leads/:id/action-timeline get first crack. Falls through to admin.js
// for unmatched paths under /api/admin.
app.use('/api/admin',          verifiedGate, require('./routes/adminAnalytics'));
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

const PORT = process.env.PORT || 5005;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
