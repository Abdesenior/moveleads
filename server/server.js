require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db');

const http = require('http');
const socketService = require('./services/socketService');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Connect Database
connectDB();

// ── Security headers (helmet) ─────────────────────────────────────────────────
// Sets X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security,
// X-XSS-Protection, Referrer-Policy, and more in one call.
app.use(helmet({
  // Allow same-origin iframes for dashboard embeds; deny cross-origin framing
  frameguard: { action: 'sameorigin' },
  // Relax CSP only if you use inline scripts/styles; tighten further post-launch
  contentSecurityPolicy: false,
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
// In production set CLIENT_ORIGIN to a comma-separated list, e.g.:
//   CLIENT_ORIGIN=https://moveleads.cloud,https://www.moveleads.cloud
const ALLOWED_ORIGINS = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
    'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175'];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  // Restrict allowed methods to only what the API uses
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-auth-token'],
}));
// Stripe Webhook: MUST be before express.json() to get raw body for signature verification
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ extended: false }));

// Initialize WebSocket Service
socketService.init(server);

// Basic Health Check Route for Browser testing
app.get('/', (req, res) => res.send('MoveLeads Core API is Live'));

// Define Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin/settings', require('./routes/settings'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/disputes', require('./routes/disputes'));
app.use('/api/admin/pricing', require('./routes/pricing'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/routing', require('./routes/routing'));
app.use('/api/public', require('./routes/public'));
app.use('/api/voice', require('./routes/voice'));
app.use('/api/bids', require('./routes/bids'));
app.use('/api/complaints', require('./routes/complaints'));

// Auction settlement cron — must be required AFTER socketService.init()
require('./jobs/settleAuctions');
require('./jobs/requestFeedback');

const PORT = process.env.PORT || 5005;
// Bind to 0.0.0.0 so Render's load balancer (and Docker) can reach the process.
// '127.0.0.1' only works on localhost and must NOT be used in production.
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
