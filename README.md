# MoveLeads.cloud

A lead generation platform for the moving industry. Moving companies can browse and purchase verified moving leads.

## Tech Stack

- **Frontend**: React 19, Vite, React Router, Recharts
- **Backend**: Express.js, MongoDB (Mongoose), Socket.io
- **Auth**: JWT, bcryptjs
- **Payments**: Stripe
- **SMS**: Twilio
- **Email**: Resend
- **Testing**: Playwright

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB instance (local or Atlas)
- Stripe account
- Twilio account (for SMS)
- Resend account (for email)

### Installation

```bash
# Install dependencies
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..

# Configure environment
cp server/.env.example server/.env
# Edit server/.env with your credentials

# Start development
npm run dev:server  # Starts server on port 5000
npm run dev:client  # Starts client on port 5173
```

### Environment Variables (server/.env)

```env
# Required
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/moveleads
JWT_SECRET=your-secret-key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Email (Resend)
RESEND_API_KEY=re_...

# Client URL for CORS
CLIENT_ORIGIN=http://localhost:5173
```

## Production Checklist

### Environment Variables

- [ ] `NODE_ENV=production`
- [ ] Set secure `JWT_SECRET` (min 32 characters)
- [ ] Configure `CLIENT_ORIGIN` with production domain(s)
- [ ] Set `MONGO_URI` to production MongoDB Atlas cluster
- [ ] Verify all Stripe keys are in live mode
- [ ] Verify Twilio credentials are active
- [ ] Set `RESEND_API_KEY` for production email

### Security

- [ ] Enable HTTPS (automatic on Vercel/Render/Heroku)
- [ ] Set proper CORS origins in `CLIENT_ORIGIN`
- [ ] Configure Stripe webhook endpoint in Stripe dashboard
- [ ] Set up MongoDB Atlas IP whitelist / VPC
- [ ] Enable MongoDB Atlas backup
- [ ] Review and configure rate limiting for production traffic

### SEO & Meta

- [ ] Replace `/og-image.png` placeholder with actual OG image (1200x630px)
- [ ] Update sitemap.xml `lastmod` dates
- [ ] Submit sitemap to Google Search Console
- [ ] Set up Google Analytics / PostHog / Mixpanel
- [ ] Configure custom domain SSL

### Monitoring

- [ ] Set up error tracking (Sentry, Bugsnag)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)
- [ ] Configure server logging (Winston, Morgan)

### Testing

```bash
# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug
```

## Project Structure

```
moveleads/
├── client/               # React frontend
│   ├── public/          # Static assets, robots.txt, sitemap.xml
│   └── src/
│       ├── components/  # Reusable components
│       ├── pages/      # Route pages
│       ├── context/     # React context providers
│       └── hooks/      # Custom hooks
├── server/              # Express backend
│   ├── config/         # DB config
│   ├── middleware/     # Auth middleware
│   ├── models/        # Mongoose models
│   ├── routes/        # API routes
│   ├── services/      # Business logic, external APIs
│   ├── jobs/          # Cron jobs
│   └── utils/         # Helper functions
└── tests/              # Playwright E2E tests
```

## API Routes

| Prefix | Description |
|--------|-------------|
| `/api/auth` | Authentication (login, register, verify) |
| `/api/leads` | Lead management and ingestion |
| `/api/users` | User profile management |
| `/api/billing` | Stripe billing and webhooks |
| `/api/admin` | Admin dashboard APIs |
| `/api/disputes` | Lead dispute management |
| `/api/public` | Public API (quote form, routing) |
| `/api/voice` | Twilio voice integration |

## License

Proprietary
