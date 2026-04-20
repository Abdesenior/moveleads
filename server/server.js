require('dotenv').config();
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

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ extended: false }));

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
app.use('/api/voice',  require('./routes/voice'));
app.use('/api/twilio', require('./routes/twilio'));
app.use('/api/bids', require('./routes/bids'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/images', require('./routes/images'));

require('./jobs/settleAuctions');
require('./jobs/requestFeedback');

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
