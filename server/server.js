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
//   /api/voice        — Twilio voice webhooks (signature verified, no JWT).
//   /api/public       — unauthenticated lead-volume + quote-ingest endpoints.
//   /api/billing/webhook — Stripe webhook (mounted above, signature verified).
const { auth, requireEmailVerified } = require('./middleware/auth');
const verifiedGate = [auth, requireEmailVerified];

app.use('/api/auth',   require('./routes/auth'));    // PUBLIC: verification mechanism
app.use('/api/public', require('./routes/public'));  // PUBLIC: lead-volume / quote ingest
app.use('/api/twilio', require('./routes/twilio'));  // PUBLIC: Twilio signature-verified webhooks
app.use('/api/voice',  require('./routes/voice'));   // PUBLIC: Twilio voice webhooks

// Dashboard data routes — gated on verified email
app.use('/api/leads',          verifiedGate, require('./routes/leads'));
app.use('/api/users',          verifiedGate, require('./routes/users'));
app.use('/api/admin/settings', verifiedGate, require('./routes/settings'));
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
