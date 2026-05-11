# MoveLeads — Production Readiness Manual Checklist

A single-source operational checklist for every non-code step required before
partner outreach. Code is in place; this file covers the dashboards, env
vars, webhook configurations, and smoke tests that can't be committed.

> **Convention.** Each item ends with a `[ ] DONE / VERIFIED` checkbox.
> Mark each one only after personally executing the verification step.
> Do not check items as "done" by inspection alone — run the verification.

> **⚠ Critical-path items** are flagged with `[CRITICAL]`. A miss breaks
> production silently (no error message, no log line) — the system continues
> serving traffic but with broken signatures, missing PII verification, or
> unreachable webhooks. Triple-check these before pushing the first deploy.

---

## 1. Render Environment Variables

**Where:** [Render Dashboard](https://dashboard.render.com) → `moveleads-api`
service → Environment.

Render reads `render.yaml` at first deploy. Subsequent updates to
`render.yaml` will sync new keys, but **values marked `sync: false` must be
filled manually** in the dashboard. The dashboard always overrides the
yaml file.

### 1.1 Public / baked values (already in render.yaml)

| Key | Value | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Enables production guards (ABSTRACT_API_KEY enforcement, removes dev mock-pass on phone verification). |
| `PORT` | `10000` | Render injects `$PORT`; this is the fallback. |
| `CLIENT_ORIGIN` | `https://moveleads.cloud,https://www.moveleads.cloud` | CORS allowlist for the API. Misconfigure → browser CORS errors on every fetch. |
| `CLIENT_URL` | `https://moveleads.cloud` | Used for email links (verify-email, password reset, redirects). |
| `SERVER_URL` | `https://api.moveleads.cloud` | **`[CRITICAL]`** — see 1.3 below. |

- [ ] **DONE / VERIFIED** — `NODE_ENV=production` confirmed in dashboard.
- [ ] **DONE / VERIFIED** — `CLIENT_ORIGIN` reflects the production domains.
- [ ] **DONE / VERIFIED** — `CLIENT_URL` is the public marketing/dashboard host.

### 1.2 Secret values (`sync: false` — set in dashboard)

#### `JWT_SECRET` `[CRITICAL]`

- **What:** signing key for all auth tokens.
- **Format:** long random string (≥ 64 chars, hex or base64).
- **How to generate:** `openssl rand -hex 64`
- **Why it matters:** server **refuses to boot** if missing (`process.exit(1)`).
  Rotating it instantly invalidates every active session (forces every user
  to re-login). Choose carefully; rotation is a blast event.
- **Verification:** look at the server boot log — first line should be a
  successful `Connected to MongoDB` message rather than `JWT_SECRET missing`.

- [ ] **DONE / VERIFIED** — `JWT_SECRET` set to a fresh random value.
- [ ] **DONE / VERIFIED** — Server boots without `JWT_SECRET missing` in log.

#### `MONGODB_URI` `[CRITICAL]`

- **What:** MongoDB Atlas connection string.
- **Format:** `mongodb+srv://<user>:<pass>@cluster.mongodb.net/moveleads?retryWrites=true&w=majority`
- **Where:** Atlas Dashboard → Database → Connect → Drivers.
- **Why it matters:** every request reads/writes this DB.
- **Verification:** `curl https://api.moveleads.cloud/` returns 200 and the server log shows `Connected to MongoDB`.

- [ ] **DONE / VERIFIED** — `MONGODB_URI` set; server connects on boot.

#### `STRIPE_SECRET_KEY` `[CRITICAL]`

- **What:** server-side Stripe API key.
- **Format:** `sk_live_...` (production) or `sk_test_...` (sandbox).
- **Where:** [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → Developers → API keys → Secret key.
- **Why it matters:** activation + top-up + refund all use this.
- **⚠ Warning:** never paste an `sk_test_...` key into production — top-ups will appear to "work" but no real money moves and Stripe Dashboard will show no charge.
- **Verification:** activate a real test partner with a real card → balance updates → charge visible in Stripe Dashboard live mode.

- [ ] **DONE / VERIFIED** — `STRIPE_SECRET_KEY` is a live key (`sk_live_...`).

#### `STRIPE_WEBHOOK_SECRET` `[CRITICAL]`

- **What:** secret used to verify incoming webhook signatures.
- **Format:** `whsec_...`
- **Where:** Stripe Dashboard → Developers → Webhooks → endpoint → Signing secret.
- **Why it matters:** webhook handler rejects requests with bad signatures. A wrong value → balance updates from webhook never apply → users pay but balance doesn't move. The verify endpoint is the fast-UX fallback so users wouldn't notice; admin reconciliation against Stripe would catch it.
- **Verification:** in Stripe Dashboard → Webhooks → endpoint → "Send test webhook". Server log should show successful event handling, not `Webhook Error: Invalid signature`.

- [ ] **DONE / VERIFIED** — `STRIPE_WEBHOOK_SECRET` matches the dashboard endpoint's signing secret.
- [ ] **DONE / VERIFIED** — Test webhook from Stripe Dashboard succeeds.

#### `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

- **What:** Twilio API credentials + sender number.
- **Format:**
  - SID: `ACxxxxxxxx...`
  - Auth token: 32-char hex
  - Phone: E.164 (e.g., `+13072044792`)
- **Where:** [Twilio Console](https://console.twilio.com) → Account → API keys & tokens.
- **Why it matters:** SMS broadcasts, lead alerts, voice routing, and inbound STOP webhook all depend on these.
- **Verification:** trigger a test SMS broadcast (covered in §8).

- [ ] **DONE / VERIFIED** — `TWILIO_ACCOUNT_SID` set.
- [ ] **DONE / VERIFIED** — `TWILIO_AUTH_TOKEN` set.
- [ ] **DONE / VERIFIED** — `TWILIO_PHONE_NUMBER` set in E.164.

#### `RESEND_API_KEY` `[CRITICAL]`

- **What:** Resend API key for transactional email.
- **Format:** `re_...`
- **Where:** [Resend Dashboard](https://resend.com/api-keys) → API Keys.
- **Why it matters:** verification email, welcome, top-up receipt, activation receipt, recovery cadence, dispute notifications all flow through Resend.
- **Verification:** register a new partner → verification email lands within a minute.

- [ ] **DONE / VERIFIED** — `RESEND_API_KEY` set; new-partner verification email arrives.

### 1.3 New secret values (added by the recent pre-outreach audit fix)

#### `SERVER_URL` `[CRITICAL]`

- **What:** the public URL of the API service, used to build the `https://api.moveleads.cloud/api/twilio/...` URL passed to Twilio's `validateRequest`.
- **Format:** `https://api.moveleads.cloud` (no trailing slash).
- **Why it matters:** Twilio signs the URL it POSTed to. If our signature check builds a different URL (e.g., the default fallback `https://moveleads.cloud`), every signature mismatch returns 403 and inbound SMS/voice webhooks silently fail. No error message in production; the partner just never receives confirmation that STOP/HELP worked.
- **⚠ Warning:** value is BAKED into `render.yaml` as a plain `value:` field (not `sync: false`). If you change the API hostname, update `render.yaml` AND the Twilio console webhooks AND redeploy.
- **Verification:** `curl -i -X POST https://api.moveleads.cloud/api/twilio/sms/inbound -d 'From=+15555550100&Body=STOP'` → should return 403 (signature missing), NOT 200.

- [ ] **DONE / VERIFIED** — `SERVER_URL=https://api.moveleads.cloud` set in render.yaml/dashboard.
- [ ] **DONE / VERIFIED** — Curl test against `/api/twilio/sms/inbound` returns 403.

#### `CRON_SECRET`

- **What:** shared secret between the cron service and the auction-settle route.
- **Format:** long random string (≥ 32 chars).
- **How to generate:** `openssl rand -hex 32`
- **Where:** Render dashboard (sync: false).
- **Why it matters:** `POST /api/bids/:leadId/settle` is gated by this; without it, the route 401s every call. The in-process node-cron (`server/jobs/settleAuctions.js`) operates via Mongoose directly and does NOT use this — only external callers do. If you never plan to call the route externally, the value just needs to exist (any string).
- **Verification:** `curl -i -X POST https://api.moveleads.cloud/api/bids/000000000000000000000000/settle` → 401.

- [ ] **DONE / VERIFIED** — `CRON_SECRET` set to a strong random value.
- [ ] **DONE / VERIFIED** — Settle route returns 401 without the header.

#### `ABSTRACT_API_KEY` `[CRITICAL]`

- **What:** API key for Abstract API phone validation (VOIP / fraud detection).
- **Where:** [Abstract API Dashboard](https://app.abstractapi.com/api/phone-validation/dashboard) → API key.
- **Why it matters:** every public lead submission runs through phone validation. In production WITHOUT this key, leads are routed to `PENDING_MANUAL_REVIEW` (production guard added in commit `05e3c53`) — they never reach paying movers. Set this BEFORE outreach, or expect zero leads to reach movers.
- **⚠ Warning:** the production guard logs `[twilioService] CRITICAL: NODE_ENV=production but ABSTRACT_API_KEY is unset` at boot. Watch for this in the Render server logs after first deploy.
- **Verification:** submit a test lead via the public quote form → confirm it reaches `READY_FOR_DISTRIBUTION` (not stuck in `PENDING_MANUAL_REVIEW`).

- [ ] **DONE / VERIFIED** — `ABSTRACT_API_KEY` set.
- [ ] **DONE / VERIFIED** — No "ABSTRACT_API_KEY is unset" CRITICAL log line after server boot.

#### `CF_API_TOKEN`, `CF_ACCOUNT_ID`

- **What:** Cloudflare Workers AI credentials for `/api/images/generate/:type`.
- **Format:**
  - Token: API token created from Cloudflare dashboard.
  - Account ID: 32-char hex from Cloudflare dashboard → Workers & Pages → Overview.
- **Where:** Cloudflare → My Profile → API Tokens → Create Token (template: "Workers AI"). Restrict by account; expiry ≤ 90 days recommended.
- **Why it matters:** lead/asset image generation in admin tools. If unset, `/api/images/generate/...` returns 503 `{ msg: 'Image generation not configured' }` — graceful degradation; UI may show a placeholder.
- **⚠ Warning:** the previous token `1988052ba6dd3454827190adde07c934` was exposed in source (committed pre-Phase 1). It has been removed from the codebase but you MUST manually rotate (delete) it in the Cloudflare dashboard before launch.
- **Verification:** hit `/api/images/generate/test` as admin → 200 with image (or 503 if intentionally not configured).

- [ ] **DONE / VERIFIED** — Previous Cloudflare token `1988052ba6dd3454827190adde07c934` **deleted** in Cloudflare dashboard.
- [ ] **DONE / VERIFIED** — New `CF_API_TOKEN` issued + set in Render.
- [ ] **DONE / VERIFIED** — `CF_ACCOUNT_ID` set.

---

## 2. Twilio Configuration

**Where:** [Twilio Console](https://console.twilio.com) → Phone Numbers → Active Numbers → your number.

The platform partner number (`+13072044792` or whichever you operate) must
have **two webhooks configured** plus messaging compliance.

### 2.1 Voice webhook

- **Endpoint:** `https://api.moveleads.cloud/api/twilio/voice/incoming`
- **HTTP method:** `POST`
- **Why:** routes incoming partner calls to warm-transfer logic + dial-complete refund handling.
- **Verification:** call the number from a test phone → log line in Render `[Voice] incoming` appears.

- [ ] **DONE / VERIFIED** — Voice webhook URL set.
- [ ] **DONE / VERIFIED** — Voice method is POST.
- [ ] **DONE / VERIFIED** — Test call routes correctly.

### 2.2 Inbound SMS webhook `[CRITICAL]`

- **Endpoint:** `https://api.moveleads.cloud/api/twilio/sms/inbound`
- **HTTP method:** `POST`
- **Field name in Twilio Console:** "A message comes in".
- **Why:** handles STOP/START/HELP keywords for TCPA compliance.
- **⚠ Warning:** without this URL set, replies of STOP to our broadcasts WILL NOT opt the partner out — they'll keep getting SMS indefinitely. Major TCPA exposure.
- **Verification:** see §2.4 below.

- [ ] **DONE / VERIFIED** — Messaging webhook URL set to `/api/twilio/sms/inbound`.
- [ ] **DONE / VERIFIED** — HTTP method POST.

### 2.3 Messaging compliance (A2P 10DLC if US)

- US shortcode/long-code messaging requires A2P 10DLC brand + campaign registration since 2023. Without it Twilio aggressively rate-limits or blocks outbound SMS.
- **Where:** Twilio Console → Messaging → Regulatory Compliance → Brand + Campaign.
- **Why:** broadcasts will silently fail or be marked spam.

- [ ] **DONE / VERIFIED** — A2P 10DLC brand registered.
- [ ] **DONE / VERIFIED** — Campaign approved (status "Approved").

### 2.4 STOP / START / HELP verification

From a test phone with a known account in MongoDB:

```bash
# Find your test partner's phone (digits-only) in MongoDB first
# Then reply to a broadcast SMS with the keyword.
```

1. Send "STOP" from the partner's phone to the Twilio number.
2. Server log shows `[SMS Inbound] STOP from userId=<id>`.
3. Database: `db.users.findOne({_id: ObjectId('<id>')}, {smsOptOut: 1})` → `smsOptOut: true`.
4. Trigger a new broadcast → that partner is skipped (server log).
5. Send "START" → `smsOptOut: false`.
6. Send "HELP" → reply with the support number `+1 (307) 204-4792`.

- [ ] **DONE / VERIFIED** — STOP flips `smsOptOut: true` and excludes from next broadcast.
- [ ] **DONE / VERIFIED** — START flips back to false.
- [ ] **DONE / VERIFIED** — HELP replies with support number.

---

## 3. Stripe Configuration

**Where:** [Stripe Dashboard](https://dashboard.stripe.com) → Developers → Webhooks.

### 3.1 Webhook endpoint `[CRITICAL]`

- **URL:** `https://api.moveleads.cloud/api/billing/webhook`
- **API version:** latest (or pin to whatever matches your `stripe` npm package).
- **Why:** asynchronous activation/top-up confirmation, refund clawback, chargeback clawback.
- **⚠ Warning:** the endpoint is mounted with `express.raw` BEFORE `express.json()` so the body bytes match Stripe's signature. Do NOT add a proxy that re-parses the body.

- [ ] **DONE / VERIFIED** — Webhook endpoint exists in Stripe Dashboard.
- [ ] **DONE / VERIFIED** — URL exactly matches `/api/billing/webhook` (no trailing slash).

### 3.2 Required events

The endpoint MUST subscribe to:

| Event | Why |
|---|---|
| `payment_intent.succeeded` | Activation + top-up credit application (fallback if client `verify` endpoint missed). |
| `charge.refunded` | Clawback when admin issues a refund directly in Stripe. |
| `charge.dispute.created` | Clawback when a partner files a chargeback. |

- [ ] **DONE / VERIFIED** — `payment_intent.succeeded` subscribed.
- [ ] **DONE / VERIFIED** — `charge.refunded` subscribed.
- [ ] **DONE / VERIFIED** — `charge.dispute.created` subscribed.

### 3.3 Test webhook resend (idempotency check)

This catches double-credit bugs that Bundle 5 fixed:

1. Make a real $50 activation with a test partner.
2. In Stripe Dashboard → Webhooks → endpoint → recent deliveries → select the `payment_intent.succeeded` event → "Resend".
3. Server log: first delivery should log `[ApplyCredit] credited`, second should log `already processed` (E11000 caught).
4. Partner balance should NOT change on resend.

- [ ] **DONE / VERIFIED** — Webhook resend does not double-credit.

### 3.4 Live mode verification

- Stripe Dashboard top-right toggle must show "Live" (not "Test").
- `STRIPE_SECRET_KEY` must be `sk_live_...`, NOT `sk_test_...`.
- `VITE_STRIPE_PUBLISHABLE_KEY` on Vercel must be `pk_live_...`, NOT `pk_test_...`.

- [ ] **DONE / VERIFIED** — All Stripe keys are live mode.

### 3.5 Apple Pay domain verification (optional but recommended)

- **Where:** Stripe Dashboard → Settings → Payment methods → Apple Pay → Add domain.
- **File:** `client/public/.well-known/apple-developer-merchantid-domain-association`
- **Why:** without verification, Apple Pay button never renders in the wallet element.
- **Verification:** `curl -sI https://moveleads.cloud/.well-known/apple-developer-merchantid-domain-association` → `Content-Type: text/plain` + 200.

- [ ] **DONE / VERIFIED** — Domain registered + verified in Stripe Apple Pay settings.
- [ ] **DONE / VERIFIED** — `.well-known` file serves text/plain.

---

## 4. Cloudflare

The previous token `1988052ba6dd3454827190adde07c934` was exposed in source
(commit history). Code-side cleanup is committed (`1616f36`); the token
itself must be rotated in the Cloudflare dashboard before outreach.

### 4.1 Rotate the leaked token

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile → API Tokens.
2. Find the existing token `1988052ba6dd3454827190adde07c934` (or whatever name it was given).
3. **Click "..." → Delete.**

- [ ] **DONE / VERIFIED** — Leaked token deleted in Cloudflare dashboard.

### 4.2 Create a new token

1. Cloudflare Dashboard → My Profile → API Tokens → Create Token.
2. Template: "Workers AI" (or custom with `Workers AI: Read`).
3. Account scope: restrict to your account.
4. Zone scope: restrict to `moveleads.cloud` if applicable.
5. TTL: 90 days (rotate quarterly).
6. Copy the token value once shown — it's only visible once.

- [ ] **DONE / VERIFIED** — New token created.
- [ ] **DONE / VERIFIED** — Token TTL set to 90 days or less.

### 4.3 Set in Render

- Set `CF_API_TOKEN` in Render dashboard → Environment.
- Find `CF_ACCOUNT_ID` at: Cloudflare → Workers & Pages → Overview → Account ID (right sidebar).
- Set `CF_ACCOUNT_ID` in Render.

- [ ] **DONE / VERIFIED** — `CF_API_TOKEN` set in Render.
- [ ] **DONE / VERIFIED** — `CF_ACCOUNT_ID` set in Render.

### 4.4 Verification

```bash
# As admin, hit any image generation endpoint
curl -sI -H "x-auth-token: <admin token>" \
  https://api.moveleads.cloud/api/images/generate/<type>
# Expect: 200 (if configured) OR 503 with msg "Image generation not configured"
# Should NOT be 500 with stack trace.
```

- [ ] **DONE / VERIFIED** — Image generation endpoint responds (200 or 503), not 500.

---

## 5. Resend / Email

**Where:** [Resend Dashboard](https://resend.com/domains).

### 5.1 Domain verification

1. Resend Dashboard → Domains → Add Domain → `moveleads.cloud`.
2. Add the 3 DNS records Resend shows:
   - **SPF:** TXT record on root (`v=spf1 include:_spf.resend.com ~all`)
   - **DKIM:** CNAME record on `resend._domainkey.moveleads.cloud`
   - **DMARC:** TXT record on `_dmarc.moveleads.cloud` (`v=DMARC1; p=none; rua=mailto:postmaster@moveleads.cloud;`)
3. Wait for DNS propagation (5–60 min).
4. Resend will show all 3 as "Verified" with green checkmarks.

- [ ] **DONE / VERIFIED** — SPF record verified.
- [ ] **DONE / VERIFIED** — DKIM record verified.
- [ ] **DONE / VERIFIED** — DMARC record verified.
- [ ] **DONE / VERIFIED** — Domain status shows "Verified" in Resend.

> **Why all three matter:** Gmail, Yahoo, and Microsoft now require SPF+DKIM
> for bulk senders. Without DMARC, your domain can be impersonated. With
> these set, deliverability to inboxes (not spam) is dramatically higher.

### 5.2 Reply-To behavior

Recovery emails are sent FROM `no-reply@moveleads.cloud` with `Reply-To: support@moveleads.cloud`. Test that replies actually route:

1. Forward a recovery email to yourself.
2. Click "Reply".
3. Confirm the To: field auto-populates to `support@moveleads.cloud`.

- [ ] **DONE / VERIFIED** — Recovery emails route replies to support@.

### 5.3 Test the full email lifecycle

Register a new test partner end-to-end:

1. Register at `https://moveleads.cloud/register` with a fresh email.
2. Verification email arrives within 1 minute.
   - Subject: "Verify your MoveLeads account"
   - Body mentions "$50 free credit"
   - Spam-folder reminder line present
   - Support phone `+1 (307) 204-4792` in footer
3. Click the verification link → welcome email arrives within 1 minute.
4. Complete onboarding through step 5 → activate $100 → receipt email arrives.
5. Top up $50 → receipt email arrives.

- [ ] **DONE / VERIFIED** — Verification email lands (with $50 hook + spam reminder).
- [ ] **DONE / VERIFIED** — Welcome email lands after verify.
- [ ] **DONE / VERIFIED** — Activation receipt lands after $100 payment.
- [ ] **DONE / VERIFIED** — Top-up receipt lands.
- [ ] **DONE / VERIFIED** — Emails land in inbox, NOT spam (check 3 different providers if possible: Gmail, Outlook, Yahoo).

---

## 6. Deployment Verification

### 6.1 Redeploy after env var changes

Both Render and Vercel respect env changes differently:

- **Render:** new env vars require a manual restart unless you redeploy.
  - Dashboard → service → Manual Deploy → Deploy latest commit.
- **Vercel:** new env vars (used at runtime) take effect on next deploy.
  Vite-style `VITE_*` vars are baked at build time — push a commit to
  trigger a rebuild.

- [ ] **DONE / VERIFIED** — Render service redeployed after env vars set.
- [ ] **DONE / VERIFIED** — Vercel client redeployed.

### 6.2 API health check

```bash
curl -s https://api.moveleads.cloud/ | head -5
# Expect: a JSON or text health response, NOT a 502 or timeout.
```

```bash
curl -sI https://api.moveleads.cloud/api/billing/balance
# Expect: 401 (auth missing) — proves route exists and auth middleware fires.
```

- [ ] **DONE / VERIFIED** — Root endpoint returns 200.
- [ ] **DONE / VERIFIED** — Auth-gated endpoint returns 401 without token.

### 6.3 Static asset MIME types

```bash
# Real asset — should be application/javascript + immutable cache
ls client/dist/assets | grep '\.js$' | head -1
# Use the filename you saw above:
curl -sI https://moveleads.cloud/assets/<filename>.js | grep -i 'content-type\|cache-control'
# Expect:
#   Content-Type: application/javascript
#   Cache-Control: public, max-age=31536000, immutable
```

```bash
# Missing asset — should be 404, NOT 200 with index.html
curl -sI https://moveleads.cloud/assets/index-DOESNOTEXIST.js
# Expect: HTTP/2 404
# If 200 with content-type text/html, the SPA rewrite is catching JS requests — DO NOT outreach until fixed.
```

```bash
# index.html should never cache
curl -sI https://moveleads.cloud/index.html | grep -i cache-control
# Expect: Cache-Control: no-store, must-revalidate
```

- [ ] **DONE / VERIFIED** — Real JS asset serves `application/javascript`.
- [ ] **DONE / VERIFIED** — Missing JS asset returns 404 (not text/html).
- [ ] **DONE / VERIFIED** — `index.html` has `no-store, must-revalidate`.

### 6.4 Apple Pay file

```bash
curl -sI https://moveleads.cloud/.well-known/apple-developer-merchantid-domain-association
# Expect: 200, Content-Type: text/plain; charset=utf-8
```

- [ ] **DONE / VERIFIED** — Apple Pay verification file serves text/plain.

---

## 7. Database / Migration Scripts

> **⚠ Always dry-run first.** Migrations run against production data.
> An incorrect filter can corrupt thousands of records in seconds.

### 7.1 `migrateLeadMaxBuyers.js`

- **Path:** `server/scripts/migrateLeadMaxBuyers.js`
- **Purpose:** collapses `Lead.maxBuyers > 1` (legacy multi-buyer auctions) to `1` for leads that have NOT been claimed yet. The default changed in Bundle 2; existing legacy data needs this migration to take effect.
- **Safety:** only touches leads with `buyers.length === 0` (untouched).

**Dry-run (read-only):**
```bash
# On the Render server (or anywhere with the right MONGODB_URI):
node server/scripts/migrateLeadMaxBuyers.js
```
> If the script has no `--apply` flag — it auto-applies. Inspect the script
> and add a flag check OR run against a staging DB first if your script
> doesn't support dry-run.

**Apply:**
```bash
node server/scripts/migrateLeadMaxBuyers.js
```

- [ ] **DONE / VERIFIED** — Migration dry-run (or staging run) reviewed.
- [ ] **DONE / VERIFIED** — Migration applied in production.
- [ ] **DONE / VERIFIED** — Spot-check: `db.leads.find({maxBuyers: {$gt: 1}, buyers: {$size: 0}}).count()` returns 0.

### 7.2 `migrateOnboardingCompleteFlag.js`

- **Path:** `server/scripts/migrateOnboardingCompleteFlag.js`
- **Purpose:** reconciles two legacy data states:
  - **Group B:** paying users missing `onboarding.activatedAt` → backfilled from first Credit Deposit transaction.
  - **Group C:** users with `complete: true` but no payment evidence → reset to `complete: false` so the new mandatory wizard remounts at the offer step.

**Dry-run (default, no writes):**
```bash
node server/scripts/migrateOnboardingCompleteFlag.js
```

Output shows:
- Group A (healthy, untouched) — count
- Group B (backfill) — full list with user IDs + emails + activatedAt timestamps
- Group C (reset) — full list with user IDs + emails + currentStep

Verbose mode (shows Group A reasoning):
```bash
node server/scripts/migrateOnboardingCompleteFlag.js --verbose
```

**Apply (after reviewing dry-run output):**
```bash
node server/scripts/migrateOnboardingCompleteFlag.js --apply
```

- [ ] **DONE / VERIFIED** — Dry-run report reviewed; counts look reasonable.
- [ ] **DONE / VERIFIED** — Group B + Group C user lists spot-checked against MongoDB.
- [ ] **DONE / VERIFIED** — Migration applied.
- [ ] **DONE / VERIFIED** — Second run finds 0 in Group B and 0 in Group C (idempotency check).

### 7.3 How to run scripts on Render

Render doesn't expose a built-in shell. Two options:

**Option A — Run from your local machine** (preferred for one-shots):
1. Get your production `MONGODB_URI` from Render dashboard → Environment.
2. Set it locally: `export MONGODB_URI='mongodb+srv://...'`
3. Run: `node server/scripts/migrateOnboardingCompleteFlag.js`
4. Unset after: `unset MONGODB_URI` (avoid leaving in shell history).

**Option B — Render Shell (paid plans):**
- Dashboard → service → Shell → `node server/scripts/...`

- [ ] **DONE / VERIFIED** — Migration approach chosen and tested in staging or with `--dry-run`.

---

## 8. Pre-Outreach Smoke Checklist

Run THE DAY OF launch, after env + dashboards are configured. Each test
verifies one critical flow end-to-end.

### 8.1 Registration + email verification

1. Open an incognito window → `https://moveleads.cloud/register`.
2. Fill: company name, fresh email, password, US phone.
3. Submit → see post-register splash with "Check your inbox" + spam reminder + Resend button.
4. Open inbox → click verification link.
5. Land on `/verify-email` → "Email verified!" → redirected to dashboard.
6. Welcome email arrives separately.

- [ ] **DONE / VERIFIED** — Full registration → verification → dashboard works.

### 8.2 Unverified mover cannot access dashboard

1. Register a NEW partner but don't click the verification link.
2. Try to navigate to `/dashboard/leads`.
3. Should redirect to `/verify-email-pending`.
4. Open DevTools → Network → look at `/api/leads` request → should return `403 EMAIL_NOT_VERIFIED`.

- [ ] **DONE / VERIFIED** — Unverified user is hard-gated client AND server side.

### 8.3 Mandatory onboarding

1. With verified-but-not-activated test user → dashboard auto-mounts wizard within 3s.
2. Verify NO X button on steps 1, 2, 3, 4.
3. Try pressing Escape on step 2 → wizard does NOT close.
4. Complete steps 1-3 → step 4 celebration → click "Claim your $50 FREE credit" → land on step 5.
5. On step 5: X button appears, ESC works, "Continue without activating" button present.

- [ ] **DONE / VERIFIED** — Wizard is non-dismissible until step 5.

### 8.4 Resume on next login

1. Test user reaches step 5 → click "Continue without activating".
2. Log out via sidebar.
3. Log back in.
4. Wizard auto-mounts at step 5 within 3s.

- [ ] **DONE / VERIFIED** — Wizard resumes at the last reached step on next login.

### 8.5 $100 activation bonus

1. On step 5 → pick $100 tier → pay with real card (`4242 4242 4242 4242` for test mode, or real card in live).
2. Land on success screen → balance shows $150.
3. Receipt email arrives.
4. Reassurance popup appears 3 seconds after activation.
5. Refresh page → popup does NOT reappear.

- [ ] **DONE / VERIFIED** — $100 → $150 bonus credited.
- [ ] **DONE / VERIFIED** — First-topup popup appears once, then never again.

### 8.6 $50 activation (no bonus)

1. Fresh test user → pick $50 tier → pay.
2. Balance shows $50.
3. After 12-13 hours, the recovery cron runs → confirm this user does NOT get a recovery email.

- [ ] **DONE / VERIFIED** — $50 activator does NOT receive recovery emails.

### 8.7 Top-up after activation

1. Already-activated user → Billing → pick $100.
2. Pay → balance += $100 (e.g., $150 → $250).
3. NO additional bonus on this top-up.
4. Receipt email arrives.

- [ ] **DONE / VERIFIED** — Top-up adds exact amount, no second bonus.

### 8.8 Buy a lead → contact details reveal

1. With test lead in marketplace → click into lead detail → contact fields show "•••••" masked.
2. Click Buy Now → confirm → balance deducted.
3. Lead detail now shows real customer name + phone + email.
4. Reload page → details persist (saved in PurchasedLead).

- [ ] **DONE / VERIFIED** — Contact details masked before purchase, revealed after.

### 8.9 Admin refund + audit trail

1. Log in as admin → AdminLeads → find a purchased lead → trigger refund.
2. Mover's balance increases.
3. `db.transactions.findOne({purchasedLead: ObjectId('...'), type: 'Lead Refund'})` → exists.
4. `db.admin_actions.findOne({action: 'refund.issue', targetId: ObjectId('...')})` → exists with before/after balance.
5. Click refund button AGAIN → 409 "Already refunded". No double-credit.

- [ ] **DONE / VERIFIED** — Admin refund works once, blocked on retry.
- [ ] **DONE / VERIFIED** — Transaction + AdminAction rows written.

### 8.10 STOP keyword

1. Pick a test partner whose phone has received broadcasts.
2. From that partner's phone, text "STOP" to the Twilio number.
3. Server log: `[SMS Inbound] STOP`.
4. `db.users.findOne({_id: ObjectId('...')}, {smsOptOut: 1})` → true.
5. Trigger another broadcast → that partner is skipped.

- [ ] **DONE / VERIFIED** — STOP keyword opts out; next broadcast skips.

### 8.11 Email-only mover

1. Test partner with `onboarding.answers.alertChannels: ['email']`.
2. Submit a matching lead.
3. Confirm partner receives email alert.
4. Confirm partner does NOT receive SMS (check Twilio logs).

- [ ] **DONE / VERIFIED** — Email-only mover gets email but NOT SMS.

### 8.12 Dispatch hours

1. Set test partner's dispatch hours to 09:00–17:00.
2. At 3am local server time (simulate by adjusting server clock OR wait), submit a matching lead.
3. Confirm SMS does NOT fire to this partner.
4. Email still fires (always allowed).

- [ ] **DONE / VERIFIED** — SMS gated by dispatch hours.

### 8.13 Multi-state coverage

1. Test partner has `User.serviceStates: ['TX', 'CA']`.
2. Submit a lead with origin in NY → confirm partner does NOT receive alert.
3. Submit a lead with origin in TX → confirm alert.

- [ ] **DONE / VERIFIED** — Coverage matching honors serviceStates.

### 8.14 Pricing rule applies

1. Admin → Pricing Rules → create a `MOVE_DATE` rule with `matchValue: 'Urgent'`, `multiplier: 1.5`.
2. Submit a lead with `moveDate` ≤ 7 days from now.
3. Wait for phone verification to complete.
4. Server log shows `[Pricing] ... urgency=Urgent | active rules: 1 | MOVE_DATE:Urgent:1.5`.
5. `db.leads.findOne(...)` → `buyNowPrice` reflects the multiplier.

- [ ] **DONE / VERIFIED** — Admin pricing rule actually affects buyNowPrice.

### 8.15 Stripe webhook resend (no double-credit)

(Already covered in §3.3 — restate here for completeness.)

- [ ] **DONE / VERIFIED** — Stripe webhook resend does NOT double-credit balance.

### 8.16 Mobile (real device)

1. Open `https://moveleads.cloud/dashboard/leads` on iPhone SE (375px) and Pixel 5 (393px) — or Chrome DevTools mobile sim.
2. No horizontal scroll on any dashboard page (Leads, MyLeads, Customers, Billing, Profile, Settings).
3. Hamburger menu opens drawer; tap outside closes.
4. Open a lead → modal fully visible, close button at least 44×44px tap target.
5. Open Settings → Service Areas → "Add state" → autocomplete works → chip lands.

- [ ] **DONE / VERIFIED** — Mobile dashboard at 375px has no horizontal overflow.
- [ ] **DONE / VERIFIED** — Lead detail modal fully visible on mobile.
- [ ] **DONE / VERIFIED** — Service Areas autocomplete usable on mobile.

---

## 9. Recommended Pilot Launch Procedure

After §1–8 are all checked, you're cleared for **controlled outreach**.
Do NOT mass-outreach until pilot metrics are reviewed.

### 9.1 Cohort size & cadence

- **First 48 hours:** invite **5 hand-picked movers** you already have a relationship with. People who will tell you when something breaks.
- **Days 3–7:** if metrics look healthy, expand to **10–15 movers**.
- **Week 2:** consider broader outreach (50–100 movers).
- **Week 3+:** if the system holds, open mass outreach.

- [ ] Pilot cohort identified (names + companies).

### 9.2 Daily metrics to track (manual or Grafana)

Track these in a spreadsheet or admin dashboard daily during the pilot:

| Metric | Healthy range | Where to check |
|---|---|---|
| New registrations | 1–5/day | `db.users.find({dateJoined: {$gte: ISODate('today')}}).count()` |
| Email verifications | ≥ 80% of registrations | `db.users.find({isEmailVerified: true, dateJoined: ...}).count()` |
| Onboarding completions | ≥ 60% of verifications | `db.users.find({'onboarding.complete': true, ...}).count()` |
| Activations ($50+$100) | ≥ 40% of onboarding completions | `db.users.find({'onboarding.activatedAt': {$gte: ...}}).count()` |
| Top-up retention | ≥ 30% return for 2nd top-up | `db.transactions.aggregate({pipeline: ... group by user})` |
| Lead unreachable rate | < 10% | dispute rate / total purchases |
| Refund rate | < 5% | `db.transactions.find({type: 'Lead Refund', date: ...}).count()` / total purchases |
| SMS delivery | ≥ 95% | Twilio dashboard → Insights → Error count |
| Email delivery | ≥ 90% in inbox | Resend dashboard → Logs → Inbox vs Spam |
| Stripe webhook errors | 0 | Stripe dashboard → Webhooks → Recent Deliveries → filter Failed |

- [ ] Daily metrics tracker spreadsheet set up.

### 9.3 Warning signs that pause expansion

If any of these appear, **stop expanding** and investigate:

- ⚠ Refund rate > 10% → leads are bad or unreachable; pause new outreach.
- ⚠ Email bounce rate > 5% → DKIM/SPF issue or list quality issue.
- ⚠ SMS error rate > 5% → 10DLC issue or carrier filtering.
- ⚠ Stripe webhook failures > 0 → reconciliation drift.
- ⚠ Any partner reports double-billing → investigate immediately.
- ⚠ Any unverified user reports access to lead PII → P0 incident, halt outreach.

- [ ] Pause criteria documented and shared with the team.

### 9.4 Communication channels for pilot partners

Set up the support paths before invites go out:

- **Email:** `support@moveleads.cloud` (replies route to a real human, not a black hole).
- **Phone:** `+1 (307) 204-4792` (verify someone is monitoring).
- **In-app:** Resolution Center page is live; complaints visible in admin.

- [ ] Support email being monitored daily.
- [ ] Support phone has voicemail or live coverage.
- [ ] Resolution Center accessible from partner dashboard.

### 9.5 Post-pilot review checklist

After 1 week of pilot:

- [ ] Review every refund issued — was it the partner's mistake or our data quality?
- [ ] Review every dispute — pattern? Specific lead source?
- [ ] Review email deliverability per provider (Gmail vs Outlook vs Yahoo).
- [ ] Review which step of onboarding partners abandon (`db.users.aggregate(... group by onboarding.currentStep where complete: false)`).
- [ ] Survey pilot partners directly: "What would have made this easier?"

---

## 10. Emergency Rollback

If a deploy breaks production:

```bash
# Find the last known good commit:
git log --oneline -20

# Roll back the live branch:
git checkout main
git reset --hard <good_commit_sha>
git push --force-with-lease origin main
```

Then on Vercel + Render dashboards, confirm the new deploy reflects the
rolled-back commit. Both auto-redeploy on push.

> **⚠ Warning:** force-push to main is destructive. Confirm the SHA twice
> before pushing. Better alternative: `git revert <bad_sha>` which creates
> a forward-moving "undo" commit instead of rewriting history.

- [ ] Rollback procedure documented and someone on the team knows how to execute it.

---

## Sign-Off

Before sending the first outreach SMS/email to a real partner:

- [ ] All checkboxes in §1 (Render env vars) are checked.
- [ ] All checkboxes in §2 (Twilio) are checked.
- [ ] All checkboxes in §3 (Stripe) are checked.
- [ ] All checkboxes in §4 (Cloudflare) are checked.
- [ ] All checkboxes in §5 (Resend) are checked.
- [ ] All checkboxes in §6 (Deployment verification) are checked.
- [ ] All checkboxes in §7 (Migrations) are checked.
- [ ] All checkboxes in §8 (Smoke tests) are checked.
- [ ] All checkboxes in §9 (Pilot setup) are checked.

**Signed off by:** _______________________
**Date:** _______________________

---

_Last updated: see `git log` on this file._
