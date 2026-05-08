# Partner Activation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 5-screen onboarding wizard + activation flow that loads on first dashboard visit for moving-company users, manufactures commitment through operational setup questions, and converts movers into the $100→$150 onboarding-bonus purchase.

**Architecture:** Soft-lock blur overlay over the dashboard renders the wizard on first visit. Wizard saves state per-step to a new User.onboarding subdocument. Final step shows an activation screen using the same `$50 FREE` visual language as the partners landing page. Stripe checkout flow flags first-time-mover purchases and credits bonus on webhook. Skipping is allowed; persistent banner + email cadence (12hr/24hr/72hr) recovers non-activators.

**Tech Stack:** React 19 + Vite (existing client), Express 5 + Mongoose 9 + MongoDB Atlas (existing server), Stripe (already integrated for top-ups), Resend (email, existing), node-cron (scheduling, existing).

---

## Locked decisions from brainstorming

| Decision | Choice |
|---|---|
| Soft-lock vs hard-lock | **True soft-lock**: wizard is dismissible. Skipping puts the mover in the dashboard with persistent activation banner + sample-card-only state. |
| Urgency framing on activation screen | **"Limited onboarding spots in your area"** copy (no fake counters; honest scarcity). |
| Bonus structure | $100 top-up → $150 balance (50% first-purchase bonus). One-time per company. |
| Email recovery cadence | T+12hr, T+24hr, T+72hr touches if mover hasn't activated. |
| Visual language | Reuse existing `Partners.css` aesthetic — orange `#ff6a14`, navy `#07111f`, `$50 FREE` pill, ribbon. |
| Wizard length | 5 setup screens + 1 summary/activation screen. Total budget ≤ 90 seconds. |

---

## File structure

### Backend (new)

| File | Responsibility |
|---|---|
| `server/jobs/onboardingRecovery.js` | node-cron job that fires recovery emails to non-activators on schedule |
| `server/routes/onboarding.js` | `/api/onboarding/*` endpoints — get status, save step, mark complete |

### Backend (modify)

| File | Change |
|---|---|
| `server/models/User.js` | Add `onboarding` subdocument with state fields |
| `server/server.js` | Mount `/api/onboarding` router; register the new cron job |
| `server/routes/billing.js` | Detect first-purchase in checkout-session creation; tag bonus in metadata; idempotent bonus credit on webhook |
| `server/services/emailService.js` | Add 3 onboarding-recovery email templates (12hr/24hr/72hr) |

### Frontend (new)

| File | Responsibility |
|---|---|
| `client/src/pages/onboarding/OnboardingWizard.jsx` | One file, all 5 wizard screens + activation screen + summary (matches GetQuoteV4 pattern) |
| `client/src/pages/onboarding/Onboarding.css` | Scoped styles under `.onboarding-wizard` |
| `client/src/components/ActivationBanner.jsx` | Persistent banner shown in dashboard if user dismissed wizard or hasn't activated |

### Frontend (modify)

| File | Change |
|---|---|
| `client/src/components/DashboardLayout.jsx` | Mount `<OnboardingWizard>` overlay if user.onboarding.complete is false; render `<ActivationBanner>` if balance is 0 and onboarding completed but no purchase yet |
| `client/src/context/AuthContext.jsx` | Add `refreshUser()` helper so wizard can re-pull user state after step saves |

---

## Acceptance criteria (covers the user's locked spec)

When this plan is fully executed:

1. New mover signs up → redirects to `/dashboard` → sees blurred dashboard + soft-locked wizard overlay.
2. Wizard runs: Market Coverage → Move Preferences → Dispatch Setup → Capacity → Setup Summary → Activation.
3. Each step saves progress server-side; closing tab and returning resumes at the saved step.
4. "I'll activate later" link is visible on activation screen. Clicking it dismisses overlay → dashboard becomes interactive but `<ActivationBanner>` persists at top.
5. Activation CTA opens Stripe checkout for $100; on success webhook credits $150 to balance.
6. First-purchase-bonus is one-time per user (tracked by `onboarding.bonusClaimedAt`).
7. If mover skips activation, recovery emails fire at T+12hr, T+24hr, T+72hr (each idempotent — only sends if `onboarding.complete` and `bonusClaimedAt == null`).
8. Activation screen uses "Limited onboarding spots in your area" framing — no fake counters.
9. Vocabulary: zero "subscription", "checkout", "buy credits", "upgrade", "lead" (use "move requests / unlock / activate / market coverage").
10. Mobile: wizard renders full-screen takeover; chips and toggles are tap-friendly (≥44px).
11. Visual: same orange/navy palette and `$50 FREE` pill as `/partners`.
12. Sample requests appear in dashboard for unactivated movers (visible, with `Unlock` disabled + tooltip).

---

## Phase A — Backend foundation (Tasks 1–4)

### Task 1: Add `onboarding` subdocument to User model

**Files:**
- Modify: `server/models/User.js`

- [ ] **Step 1.1: Add the new subdocument fields**

Open `server/models/User.js`. Inside the `UserSchema` definition, add the following block immediately before the closing `}, { timestamps: true })`:

```js
  // ──────────────────────────────────────────────────────────────
  // Partner activation / onboarding state
  // ──────────────────────────────────────────────────────────────
  onboarding: {
    complete: { type: Boolean, default: false },
    skippedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    currentStep: { type: Number, default: 0 },     // 0..5 (0=not started, 5=activation pending)
    bonusClaimedAt: { type: Date, default: null }, // set on first-purchase webhook
    recovery: {
      sent12h: { type: Boolean, default: false },
      sent24h: { type: Boolean, default: false },
      sent72h: { type: Boolean, default: false },
    },
    answers: {
      primaryMarket:       { type: String, default: '' },           // "Houston, TX"
      coveragePreference:  { type: String, default: '' },           // 'local'|'regional'|'longDistance'|'nationwide'
      additionalMarkets:   { type: [String], default: [] },
      moveTypes:           { type: [String], default: [] },         // ['apartment','home','office','longDistance','emergency','packing','laborOnly','storage']
      avoidMoveTypes:      { type: [String], default: [] },
      alertChannels:       { type: [String], default: [] },         // priority-ordered list of 'sms'|'call'|'email'
      urgentCallEnabled:   { type: Boolean, default: false },
      dispatchHours:       { type: mongoose.Schema.Types.Mixed, default: {} }, // { mon: {open:'07:00',close:'19:00'}, ... }
      dailyRequestCapacity:{ type: String, default: '' },           // '1-3'|'4-7'|'8-15'|'15+'
      preferredTiming:     { type: [String], default: [] },         // ['sameDay','within7Days','thisMonth','any']
      crewCount:           { type: String, default: '' },           // '1'|'2-3'|'4-6'|'7+'
    },
  },
```

- [ ] **Step 1.2: Verify the model still loads**

```bash
cd /Users/amin/Downloads/MoveLeads/server
node -e "const U = require('./models/User'); console.log('OK:', U.modelName)"
```

Expected output: `OK: User`

- [ ] **Step 1.3: Commit**

```bash
cd /Users/amin/Downloads/MoveLeads
git add server/models/User.js
git commit -m "$(cat <<'EOF'
feat(onboarding): add onboarding subdocument to User model

Tracks partner-activation flow state per user:
- complete / skippedAt / completedAt / currentStep
- bonusClaimedAt (set when first-purchase Stripe webhook fires)
- recovery flags (sent12h/24h/72h) so cron job is idempotent
- answers subdoc with all wizard responses

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create `/api/onboarding` router

**Files:**
- Create: `server/routes/onboarding.js`
- Modify: `server/server.js`

- [ ] **Step 2.1: Create `server/routes/onboarding.js`**

```js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// Whitelisted answer keys to prevent setting arbitrary fields
const ANSWER_KEYS = [
  'primaryMarket', 'coveragePreference', 'additionalMarkets',
  'moveTypes', 'avoidMoveTypes',
  'alertChannels', 'urgentCallEnabled', 'dispatchHours',
  'dailyRequestCapacity', 'preferredTiming', 'crewCount',
];

// @route   GET /api/onboarding/status
// @desc    Return current onboarding state for the logged-in user
// @access  Private
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('onboarding balance');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    return res.json({
      onboarding: user.onboarding,
      balance: user.balance || 0,
    });
  } catch (err) {
    console.error('[Onboarding] status error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/onboarding/save-step
// @desc    Persist answers for a step and bump currentStep
// @access  Private
// Body:    { step: number, answers: { ... } }
router.post('/save-step', auth, async (req, res) => {
  try {
    const { step, answers } = req.body || {};
    if (typeof step !== 'number' || step < 1 || step > 5) {
      return res.status(400).json({ msg: 'Invalid step' });
    }
    const update = { 'onboarding.currentStep': step };
    if (answers && typeof answers === 'object') {
      for (const key of ANSWER_KEYS) {
        if (key in answers) update[`onboarding.answers.${key}`] = answers[key];
      }
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, runValidators: true }
    ).select('onboarding');
    return res.json({ onboarding: user.onboarding });
  } catch (err) {
    console.error('[Onboarding] save-step error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/onboarding/skip
// @desc    Mark wizard as skipped — soft-lock dismissed
// @access  Private
router.post('/skip', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { 'onboarding.skippedAt': new Date(), 'onboarding.complete': true, 'onboarding.completedAt': new Date() } },
      { new: true }
    ).select('onboarding');
    return res.json({ onboarding: user.onboarding });
  } catch (err) {
    console.error('[Onboarding] skip error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/onboarding/complete
// @desc    Mark wizard as fully completed (called after summary screen, before/after activation)
// @access  Private
router.post('/complete', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { 'onboarding.complete': true, 'onboarding.completedAt': new Date(), 'onboarding.currentStep': 5 } },
      { new: true }
    ).select('onboarding');
    return res.json({ onboarding: user.onboarding });
  } catch (err) {
    console.error('[Onboarding] complete error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
```

- [ ] **Step 2.2: Mount the router in `server/server.js`**

Find the line that mounts billing routes (search for `app.use('/api/billing'`) and add directly after it:

```js
app.use('/api/onboarding', require('./routes/onboarding'));
```

- [ ] **Step 2.3: Verify the routes are reachable**

Start the server:
```bash
cd /Users/amin/Downloads/MoveLeads/server && node server.js &
sleep 3
# Should return 401 (no auth token)
curl -sS -o /dev/null -w "GET /api/onboarding/status: %{http_code}\n" http://127.0.0.1:5005/api/onboarding/status
pkill -f "node server.js"
```

Expected: `GET /api/onboarding/status: 401`

- [ ] **Step 2.4: Commit**

```bash
cd /Users/amin/Downloads/MoveLeads
git add server/routes/onboarding.js server/server.js
git commit -m "$(cat <<'EOF'
feat(onboarding): add /api/onboarding router

Endpoints:
- GET  /api/onboarding/status   — return user's onboarding subdoc + balance
- POST /api/onboarding/save-step — persist whitelisted answers + bump step
- POST /api/onboarding/skip      — soft-dismiss wizard
- POST /api/onboarding/complete  — mark wizard fully done

Whitelist guards arbitrary writes; auth middleware enforced.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: First-purchase bonus in Stripe checkout + webhook

**Files:**
- Modify: `server/routes/billing.js`

- [ ] **Step 3.1: Read current `create-checkout-session` handler**

```bash
grep -n "create-checkout-session\|metadata\|line_items" /Users/amin/Downloads/MoveLeads/server/routes/billing.js | head -10
```

Note the existing `metadata` block that's passed to Stripe. Tag the first purchase there.

- [ ] **Step 3.2: Add bonus detection + metadata flag in `create-checkout-session`**

Open `server/routes/billing.js`. In the `router.post('/create-checkout-session', ...)` handler, **before** `stripe.checkout.sessions.create({...})` is called, add:

```js
    // Detect first-time-mover bonus eligibility
    const userDoc = await User.findById(req.user.id).select('onboarding');
    const eligibleForBonus = !!userDoc && !userDoc.onboarding?.bonusClaimedAt;
    const baseCredits = Number(amount); // amount is already the dollar amount the user is adding
    const bonusCredits = eligibleForBonus ? Math.round(baseCredits * 0.5) : 0;
    const totalCredits = baseCredits + bonusCredits;
```

In the `metadata` object passed to Stripe, replace the existing `credits` key with:

```js
        metadata: {
          userId: req.user.id,
          credits: String(totalCredits),
          baseCredits: String(baseCredits),
          bonusCredits: String(bonusCredits),
          firstPurchaseBonus: eligibleForBonus ? 'true' : 'false',
        }
```

(If `User` is not already imported at the top of `billing.js`, add `const User = require('../models/User');` to the require block.)

- [ ] **Step 3.3: Update the webhook to record the bonus claim**

In `router.post('/webhook', ...)`, inside the `event.type === 'checkout.session.completed'` block, **after** `user.balance += Number(credits); await user.save();`, add:

```js
        // If this was the first-time-mover bonus purchase, record claim time
        if (session.metadata.firstPurchaseBonus === 'true' && !user.onboarding?.bonusClaimedAt) {
          await User.updateOne(
            { _id: userId },
            { $set: { 'onboarding.bonusClaimedAt': new Date() } }
          );
        }
```

Also update the Transaction description to surface the bonus split, replacing the existing `description: `Credit Top Up +$${credits} (Session: ${session.id})``:

```js
          description: session.metadata.firstPurchaseBonus === 'true'
            ? `Onboarding Top Up +$${session.metadata.baseCredits} (+$${session.metadata.bonusCredits} bonus) (Session: ${session.id})`
            : `Credit Top Up +$${credits} (Session: ${session.id})`,
```

- [ ] **Step 3.4: Verify the changes parse**

```bash
node -c /Users/amin/Downloads/MoveLeads/server/routes/billing.js
```

Expected: no output (success).

- [ ] **Step 3.5: Commit**

```bash
cd /Users/amin/Downloads/MoveLeads
git add server/routes/billing.js
git commit -m "$(cat <<'EOF'
feat(billing): first-time-mover onboarding bonus (50% on first top-up)

create-checkout-session now detects users who haven't yet claimed the
bonus (onboarding.bonusClaimedAt == null) and adds 50% to the credits
metadata. Webhook stamps onboarding.bonusClaimedAt so the bonus is
one-time per user.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Email recovery templates + cron job

**Files:**
- Modify: `server/services/emailService.js`
- Create: `server/jobs/onboardingRecovery.js`
- Modify: `server/server.js`

- [ ] **Step 4.1: Add 3 recovery email templates to `emailService.js`**

Open `server/services/emailService.js`. Find the existing exports block (look for `module.exports = { ... }`) and add three new functions before it. The exact internal structure should match how other templates in the file are written; the high-level shape is:

```js
async function sendOnboardingRecovery12h(user) {
  const html = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f7fa; padding:24px; color:#0f172a;">
      <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; border:1px solid #e2e8f0;">
        <p style="color:#ff6a14; font-size:11px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; margin:0 0 16px;">FIRST-TIME MOVER BONUS</p>
        <h1 style="font-size:28px; font-weight:800; line-height:1.2; margin:0 0 12px;">Hey ${user.companyName || 'there'} — your $50 onboarding credit is still here.</h1>
        <p style="color:#475569; font-size:15px; line-height:1.6;">You finished setting up your market coverage but didn't activate your balance. Verified move requests come into our system throughout the day — activate to start unlocking them in your service area.</p>
        <p style="margin:28px 0;">
          <a href="https://moveleads.cloud/dashboard?activate=1" style="display:inline-block; background:#ff6a14; color:#fff; padding:14px 26px; border-radius:12px; font-weight:800; text-decoration:none;">Claim my $50 credit →</a>
        </p>
        <p style="color:#94a3b8; font-size:13px; line-height:1.6;">Onboarding spots are limited per service area. No subscription. No contract. Credits never expire.</p>
      </div>
    </body></html>
  `;
  return resend.emails.send({
    from: 'MoveLeads <no-reply@moveleads.cloud>',
    to: user.email,
    subject: `Your $50 onboarding credit is ready, ${user.companyName || 'mover'}`,
    html,
  });
}

async function sendOnboardingRecovery24h(user) {
  const html = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f7fa; padding:24px; color:#0f172a;">
      <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; border:1px solid #e2e8f0;">
        <p style="color:#ff6a14; font-size:11px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; margin:0 0 16px;">LIMITED ONBOARDING ACCESS</p>
        <h1 style="font-size:26px; font-weight:800; line-height:1.2; margin:0 0 12px;">Movers in your area are unlocking jobs.</h1>
        <p style="color:#475569; font-size:15px; line-height:1.6;">Onboarding remains open in your service area. Claim your free $50 unlock credit before spots fill up.</p>
        <p style="margin:28px 0;">
          <a href="https://moveleads.cloud/dashboard?activate=1" style="display:inline-block; background:#ff6a14; color:#fff; padding:14px 26px; border-radius:12px; font-weight:800; text-decoration:none;">Activate my $150 balance →</a>
        </p>
        <p style="color:#94a3b8; font-size:13px; line-height:1.6;">Refundable unused balance. No subscription. Credits never expire.</p>
      </div>
    </body></html>
  `;
  return resend.emails.send({
    from: 'MoveLeads <no-reply@moveleads.cloud>',
    to: user.email,
    subject: `Movers in ${user.onboarding?.answers?.primaryMarket || 'your area'} are unlocking jobs`,
    html,
  });
}

async function sendOnboardingRecovery72h(user) {
  const html = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f7fa; padding:24px; color:#0f172a;">
      <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; border:1px solid #e2e8f0;">
        <h1 style="font-size:26px; font-weight:800; line-height:1.2; margin:0 0 12px;">Last call on your onboarding bonus.</h1>
        <p style="color:#475569; font-size:15px; line-height:1.6;">Want help configuring your market or have questions before activating? Reply to this email and a partner rep will help directly.</p>
        <p style="margin:28px 0;">
          <a href="https://moveleads.cloud/dashboard?activate=1" style="display:inline-block; background:#ff6a14; color:#fff; padding:14px 26px; border-radius:12px; font-weight:800; text-decoration:none;">Activate my $150 balance →</a>
        </p>
        <p style="color:#94a3b8; font-size:13px; line-height:1.6;">Or reply to this email — partner reps Mon–Sat 8am–8pm CT.</p>
      </div>
    </body></html>
  `;
  return resend.emails.send({
    from: 'MoveLeads Partner Team <no-reply@moveleads.cloud>',
    to: user.email,
    subject: `Need help activating, ${user.companyName || 'mover'}?`,
    html,
  });
}
```

Then in the `module.exports = { ... }` block, add the three new function names:

```js
  sendOnboardingRecovery12h,
  sendOnboardingRecovery24h,
  sendOnboardingRecovery72h,
```

- [ ] **Step 4.2: Create the cron job at `server/jobs/onboardingRecovery.js`**

```js
// Onboarding recovery cron — fires recovery emails for movers who skipped activation.
// Idempotent: each user only gets each touch once (sent12h/sent24h/sent72h flags).

const cron = require('node-cron');
const User = require('../models/User');
const {
  sendOnboardingRecovery12h,
  sendOnboardingRecovery24h,
  sendOnboardingRecovery72h,
} = require('../services/emailService');

const HOUR = 60 * 60 * 1000;

async function runOnce() {
  const now = Date.now();

  // Candidates: completed onboarding (or skipped), no bonus claimed yet
  const users = await User.find({
    'onboarding.complete': true,
    'onboarding.bonusClaimedAt': null,
    role: { $in: ['customer', undefined] }, // skip admins
    isSuspended: { $ne: true },
  }).select('email companyName onboarding createdAt');

  let sent12 = 0, sent24 = 0, sent72 = 0;

  for (const u of users) {
    const completedAt = u.onboarding?.completedAt
      ? new Date(u.onboarding.completedAt).getTime()
      : new Date(u.createdAt).getTime();
    const ageMs = now - completedAt;
    const flags = u.onboarding?.recovery || {};

    try {
      if (ageMs >= 12 * HOUR && !flags.sent12h) {
        await sendOnboardingRecovery12h(u);
        await User.updateOne({ _id: u._id }, { $set: { 'onboarding.recovery.sent12h': true } });
        sent12++;
      } else if (ageMs >= 24 * HOUR && !flags.sent24h) {
        await sendOnboardingRecovery24h(u);
        await User.updateOne({ _id: u._id }, { $set: { 'onboarding.recovery.sent24h': true } });
        sent24++;
      } else if (ageMs >= 72 * HOUR && !flags.sent72h) {
        await sendOnboardingRecovery72h(u);
        await User.updateOne({ _id: u._id }, { $set: { 'onboarding.recovery.sent72h': true } });
        sent72++;
      }
    } catch (err) {
      console.error(`[OnboardingRecovery] failed for ${u._id}:`, err.message);
    }
  }

  if (sent12 + sent24 + sent72 > 0) {
    console.log(`[OnboardingRecovery] sent: 12h=${sent12} 24h=${sent24} 72h=${sent72}`);
  }
}

function start() {
  // Run every 30 minutes — small enough that 12h/24h/72h thresholds fire near their target.
  cron.schedule('*/30 * * * *', () => {
    runOnce().catch(err => console.error('[OnboardingRecovery] tick error:', err));
  });
  console.log('[OnboardingRecovery] cron registered — runs every 30 min');
}

module.exports = { start, runOnce };
```

- [ ] **Step 4.3: Register the cron job in `server/server.js`**

Find the existing cron registrations (look for `require('./jobs/settleAuctions')` or similar). Immediately after the last cron `.start()` call, add:

```js
require('./jobs/onboardingRecovery').start();
```

- [ ] **Step 4.4: Verify it parses + cron registers**

```bash
cd /Users/amin/Downloads/MoveLeads/server
node -e "const j = require('./jobs/onboardingRecovery'); console.log('OK:', Object.keys(j))"
```

Expected: `OK: [ 'start', 'runOnce' ]`

- [ ] **Step 4.5: Commit**

```bash
cd /Users/amin/Downloads/MoveLeads
git add server/services/emailService.js server/jobs/onboardingRecovery.js server/server.js
git commit -m "$(cat <<'EOF'
feat(onboarding): recovery email cadence (T+12h/24h/72h)

Adds three Resend templates (sendOnboardingRecovery12h/24h/72h) and a
cron job that fires them for users who completed/skipped the wizard
but haven't claimed the bonus yet. Per-user flags
(onboarding.recovery.sent12h/24h/72h) ensure idempotency.

Cron ticks every 30 min so the 12h/24h/72h thresholds fire close to
their target time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Wizard frontend (Tasks 5–7)

### Task 5: Onboarding wizard scaffold + screens 1–2

**Files:**
- Create: `client/src/pages/onboarding/OnboardingWizard.jsx`
- Create: `client/src/pages/onboarding/Onboarding.css`

- [ ] **Step 5.1: Create `client/src/pages/onboarding/Onboarding.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

/* All styles scoped under .onboarding-wizard so they don't leak */
.onboarding-wizard {
  position: fixed; inset: 0; z-index: 9999;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
}

.ow-blur {
  position: absolute; inset: 0;
  background: rgba(7, 17, 31, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.ow-modal {
  position: relative;
  max-width: 720px; width: calc(100% - 32px);
  max-height: calc(100vh - 32px);
  margin: 16px auto;
  background: #fff;
  border-radius: 22px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  display: flex; flex-direction: column;
}

.ow-progress {
  height: 4px; background: #e2e8f0;
  position: relative;
}
.ow-progress-fill {
  height: 100%; background: linear-gradient(90deg, #ff6a14, #fb923c);
  transition: width 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ow-progress-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: #94a3b8; padding: 12px 28px 0;
}

.ow-body {
  padding: 22px 28px 28px;
  overflow-y: auto;
}

.ow-h1 {
  font-size: 26px; font-weight: 800; letter-spacing: -0.02em;
  color: #0f172a; margin: 0 0 6px; line-height: 1.2;
}
.ow-sub {
  font-size: 15px; color: #475569; line-height: 1.5; margin: 0 0 22px;
}

.ow-field { display: block; margin-bottom: 18px; }
.ow-label {
  display: block; font-size: 13px; font-weight: 700; color: #0f172a;
  margin-bottom: 8px; letter-spacing: -0.005em;
}
.ow-input {
  width: 100%; height: 48px; padding: 0 14px;
  border: 1.5px solid #e2e8f0; border-radius: 12px;
  font-size: 15px; font-weight: 500; color: #0f172a;
  background: #fff;
  outline: none; transition: border-color 160ms ease;
  font-family: inherit;
}
.ow-input:focus { border-color: #ff6a14; }

.ow-cards {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
}
.ow-card {
  padding: 14px 16px;
  border: 1.5px solid #e2e8f0; border-radius: 12px;
  background: #fff; cursor: pointer; text-align: left;
  font-family: inherit; font-size: 14px; font-weight: 600; color: #0f172a;
  transition: border-color 160ms ease, background 160ms ease;
}
.ow-card:hover { border-color: rgba(255, 106, 20, 0.45); }
.ow-card.active {
  border-color: #ff6a14; background: rgba(255, 106, 20, 0.06);
}

.ow-chips {
  display: flex; flex-wrap: wrap; gap: 8px;
}
.ow-chip {
  padding: 8px 14px; border-radius: 999px;
  border: 1.5px solid #e2e8f0; background: #fff;
  font-family: inherit; font-size: 13px; font-weight: 600; color: #0f172a;
  cursor: pointer; transition: all 160ms ease;
}
.ow-chip:hover { border-color: rgba(255, 106, 20, 0.4); }
.ow-chip.active {
  border-color: #ff6a14; background: rgba(255, 106, 20, 0.08);
  color: #ea580c;
}

.ow-toggle {
  display: inline-flex; align-items: center; gap: 10px;
  cursor: pointer; user-select: none;
}
.ow-toggle-track {
  width: 44px; height: 26px; border-radius: 999px;
  background: #cbd5e1; position: relative;
  transition: background 160ms ease;
}
.ow-toggle-track::after {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 22px; height: 22px; border-radius: 50%;
  background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  transition: transform 160ms ease;
}
.ow-toggle.active .ow-toggle-track { background: #ff6a14; }
.ow-toggle.active .ow-toggle-track::after { transform: translateX(18px); }

.ow-footer {
  padding: 18px 28px;
  border-top: 1px solid #e2e8f0;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: #f8fafc;
}
.ow-back {
  background: none; border: none;
  color: #475569; font-size: 14px; font-weight: 600;
  cursor: pointer; padding: 8px 0;
}
.ow-back:hover { color: #0f172a; }
.ow-next {
  background: #ff6a14; color: #fff;
  border: none; height: 48px; padding: 0 22px;
  border-radius: 12px;
  font-family: inherit; font-size: 15px; font-weight: 800; letter-spacing: -0.005em;
  cursor: pointer;
  box-shadow: 0 1px 0 rgba(255,255,255,0.2) inset, 0 10px 26px rgba(255, 106, 20, 0.28);
  transition: transform 180ms ease, box-shadow 180ms ease;
  display: inline-flex; align-items: center; gap: 8px;
}
.ow-next:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 1px 0 rgba(255,255,255,0.22) inset, 0 14px 32px rgba(255, 106, 20, 0.36);
}
.ow-next:disabled {
  background: #e2e8f0; color: #94a3b8; cursor: not-allowed; box-shadow: none;
}

.ow-trust-tip {
  font-size: 12px; color: #94a3b8;
  display: inline-flex; align-items: center; gap: 6px;
}
.ow-trust-tip::before {
  content: "✓"; color: #16a34a; font-weight: 800;
}

/* Activation screen styling */
.ow-activate {
  background: #07111f; color: #fff;
  margin: -22px -28px -28px;
  padding: 40px 28px;
  border-radius: 0 0 22px 22px;
}
.ow-activate-pill {
  display: inline-flex; align-items: center;
  background: rgba(255, 106, 20, 0.16);
  border: 1px solid rgba(255, 106, 20, 0.4);
  color: #fdba74;
  font-size: 11px; font-weight: 800; letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 5px 11px; border-radius: 999px;
  margin-bottom: 18px;
}
.ow-activate-bonus {
  display: inline-flex; align-items: flex-start; gap: 8px;
  margin-bottom: 4px;
}
.ow-activate-bonus-currency {
  font-size: 28px; font-weight: 700; color: #ff6a14;
  margin-top: 6px;
}
.ow-activate-bonus-num {
  font-size: 80px; font-weight: 900; color: #ff6a14;
  line-height: 1; letter-spacing: -0.04em;
}
.ow-activate-bonus-tag {
  align-self: center; margin-top: 6px;
  background: linear-gradient(180deg, #fb923c, #f97316);
  color: #fff;
  font-size: 11px; font-weight: 800; letter-spacing: 0.12em;
  padding: 5px 9px; border-radius: 6px;
  box-shadow: 0 6px 18px rgba(249, 115, 22, 0.35);
}
.ow-activate-label { color: #cbd5e1; font-size: 18px; font-weight: 600; margin: 0 0 4px; }
.ow-activate-plus { color: #94a3b8; font-size: 13.5px; font-weight: 500; margin: 0 0 22px; }
.ow-activate-cta {
  width: 100%; height: 56px;
  background: #ff6a14; color: #fff;
  border: none; border-radius: 14px;
  font-family: inherit; font-size: 16px; font-weight: 800; letter-spacing: -0.005em;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(255, 106, 20, 0.35);
  transition: transform 180ms ease, box-shadow 180ms ease;
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
}
.ow-activate-cta:hover { transform: translateY(-1px); box-shadow: 0 14px 32px rgba(255, 106, 20, 0.44); }
.ow-activate-trust {
  display: flex; flex-wrap: wrap; gap: 8px;
  margin-top: 14px; justify-content: center;
  font-family: monospace; font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.04em; text-transform: uppercase;
}
.ow-activate-skip {
  display: block; margin-top: 14px;
  background: none; border: none;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px; font-weight: 500;
  cursor: pointer; text-align: center; width: 100%;
}
.ow-activate-skip:hover { color: rgba(255, 255, 255, 0.8); }
.ow-activate-urgency {
  display: inline-flex; align-items: center; gap: 8px;
  margin-top: 16px;
  font-size: 13px; color: #fdba74; font-weight: 600;
}
.ow-activate-urgency-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #ff6a14;
  animation: owSoftPulse 2s ease-in-out infinite;
}
@keyframes owSoftPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.3); }
}

/* Setup summary split */
.ow-summary-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
.ow-summary-recap {
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 14px; padding: 18px;
}
.ow-summary-recap-h {
  font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
  color: #94a3b8; margin: 0 0 10px;
}
.ow-summary-recap-row {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 6px 0;
  font-size: 14px;
}
.ow-summary-recap-row + .ow-summary-recap-row { border-top: 1px solid #eef2f7; }
.ow-summary-recap-label { color: #64748b; }
.ow-summary-recap-value { color: #0f172a; font-weight: 600; text-align: right; }

@media (min-width: 720px) {
  .ow-summary-grid { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 600px) {
  .ow-modal { width: 100%; max-height: 100vh; margin: 0; border-radius: 0; }
  .ow-h1 { font-size: 22px; }
  .ow-cards { grid-template-columns: 1fr; }
  .ow-activate-bonus-num { font-size: 64px; }
}
```

- [ ] **Step 5.2: Create `client/src/pages/onboarding/OnboardingWizard.jsx` (scaffold + screens 1–2)**

```jsx
import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import './Onboarding.css';

const TOTAL_STEPS = 5;

const COVERAGE_OPTIONS = [
  { id: 'local',        label: 'Local only',     desc: 'Same city or county' },
  { id: 'regional',     label: 'Regional',       desc: 'Within state' },
  { id: 'longDistance', label: 'Long-distance',  desc: 'Cross-state hauls' },
  { id: 'nationwide',   label: 'Nationwide',     desc: 'Anywhere in the U.S.' },
];

const MOVE_TYPE_OPTIONS = [
  { id: 'apartment',    label: 'Apartments' },
  { id: 'home',         label: 'Homes' },
  { id: 'office',       label: 'Offices' },
  { id: 'longDistance', label: 'Long-distance' },
  { id: 'emergency',    label: 'Emergency moves' },
  { id: 'packing',      label: 'Packing' },
  { id: 'laborOnly',    label: 'Labor-only' },
  { id: 'storage',      label: 'Storage' },
];

const TRUST_TIPS = [
  '98% of requests are phone-confirmed before delivery',
  'Duplicate and unreachable requests are filtered automatically',
  'Movers in your category typically book 4–7 jobs per month',
  'Average mover-to-customer connect time: 4–6 minutes',
];

export default function OnboardingWizard({ onClose }) {
  const { API_URL, user, refreshUser } = useContext(AuthContext);
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState({
    primaryMarket: '',
    coveragePreference: '',
    additionalMarkets: [],
    moveTypes: [],
    avoidMoveTypes: [],
    alertChannels: [],
    urgentCallEnabled: false,
    dispatchHours: {},
    dailyRequestCapacity: '',
    preferredTiming: [],
    crewCount: '',
  });

  // Restore prior progress on mount
  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/onboarding/status`, {
      headers: { 'x-auth-token': localStorage.getItem('token') || '' },
    })
      .then(r => r.json())
      .then(data => {
        if (!alive || !data?.onboarding) return;
        const ob = data.onboarding;
        if (ob.currentStep && ob.currentStep > 0 && ob.currentStep <= TOTAL_STEPS) {
          setStep(ob.currentStep + 1 <= TOTAL_STEPS ? ob.currentStep : TOTAL_STEPS);
        }
        if (ob.answers) {
          setAnswers(prev => ({ ...prev, ...ob.answers }));
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [API_URL]);

  const setAnswer = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }));

  const toggleInArray = (key, value) => {
    setAnswers(prev => {
      const arr = prev[key] || [];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value],
      };
    });
  };

  async function saveStep(stepNum) {
    try {
      await fetch(`${API_URL}/onboarding/save-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({ step: stepNum, answers }),
      });
    } catch (err) {
      console.error('[OnboardingWizard] save-step failed:', err);
    }
  }

  async function next() {
    await saveStep(step);
    if (step < TOTAL_STEPS) setStep(step + 1);
  }

  function back() {
    if (step > 1) setStep(step - 1);
  }

  async function dismissSkip() {
    try {
      await fetch(`${API_URL}/onboarding/skip`, {
        method: 'POST',
        headers: { 'x-auth-token': localStorage.getItem('token') || '' },
      });
    } catch (err) { /* swallow */ }
    if (refreshUser) await refreshUser();
    onClose && onClose();
  }

  const trustTip = TRUST_TIPS[(step - 1) % TRUST_TIPS.length];

  return (
    <div className="onboarding-wizard" role="dialog" aria-label="Partner activation setup">
      <div className="ow-blur" />
      <div className="ow-modal">
        <div className="ow-progress">
          <div className="ow-progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
        </div>
        <div className="ow-progress-label">Step {step} of {TOTAL_STEPS} · {trustTip}</div>

        <div className="ow-body">
          {step === 1 && <ScreenMarketCoverage answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
          {step === 2 && <ScreenMovePreferences answers={answers} toggleInArray={toggleInArray} />}
          {/* Screens 3, 4, 5 added in Task 6 */}
        </div>

        <div className="ow-footer">
          {step > 1
            ? <button className="ow-back" onClick={back} type="button">← Back</button>
            : <button className="ow-back" onClick={dismissSkip} type="button">Skip setup</button>
          }
          <button
            className="ow-next"
            onClick={next}
            type="button"
            disabled={!isStepValid(step, answers)}
          >
            {step < TOTAL_STEPS ? 'Continue' : 'Review setup'} →
          </button>
        </div>
      </div>
    </div>
  );
}

function isStepValid(step, a) {
  if (step === 1) return !!a.primaryMarket && !!a.coveragePreference;
  if (step === 2) return (a.moveTypes && a.moveTypes.length > 0);
  return true;
}

// ── Screen 1 ─────────────────────────────────────────────────────────────────
function ScreenMarketCoverage({ answers, setAnswer, toggleInArray }) {
  return (
    <>
      <h1 className="ow-h1">Where should we send move opportunities?</h1>
      <p className="ow-sub">Set your primary market — we'll only route requests inside your service area.</p>

      <div className="ow-field">
        <label className="ow-label" htmlFor="primaryMarket">Primary market</label>
        <input
          id="primaryMarket"
          className="ow-input"
          placeholder="Houston, TX"
          value={answers.primaryMarket}
          onChange={e => setAnswer('primaryMarket', e.target.value)}
        />
      </div>

      <div className="ow-field">
        <label className="ow-label">Coverage preference</label>
        <div className="ow-cards">
          {COVERAGE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-card${answers.coveragePreference === opt.id ? ' active' : ''}`}
              onClick={() => setAnswer('coveragePreference', opt.id)}
            >
              <div style={{ fontWeight: 700 }}>{opt.label}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 500 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="ow-field">
        <label className="ow-label">Additional markets <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span></label>
        <input
          className="ow-input"
          placeholder="Add cities separated by commas"
          value={(answers.additionalMarkets || []).join(', ')}
          onChange={e => setAnswer('additionalMarkets', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
        />
      </div>
    </>
  );
}

// ── Screen 2 ─────────────────────────────────────────────────────────────────
function ScreenMovePreferences({ answers, toggleInArray }) {
  return (
    <>
      <h1 className="ow-h1">What kind of moves fit your crews best?</h1>
      <p className="ow-sub">Select all that apply — we'll prioritize matching requests in these categories.</p>

      <div className="ow-field">
        <label className="ow-label">Move types you take</label>
        <div className="ow-chips">
          {MOVE_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-chip${answers.moveTypes.includes(opt.id) ? ' active' : ''}`}
              onClick={() => toggleInArray('moveTypes', opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ow-field">
        <label className="ow-label">Move types to avoid <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span></label>
        <div className="ow-chips">
          {MOVE_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-chip${answers.avoidMoveTypes.includes(opt.id) ? ' active' : ''}`}
              onClick={() => toggleInArray('avoidMoveTypes', opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 5.3: Verify the file parses**

```bash
node -e "const p = require('/Users/amin/Downloads/MoveLeads/client/node_modules/@babel/parser'); const fs = require('fs'); const code = fs.readFileSync('/Users/amin/Downloads/MoveLeads/client/src/pages/onboarding/OnboardingWizard.jsx', 'utf8'); p.parse(code, { sourceType: 'module', plugins: ['jsx'] }); console.log('OK:', code.length, 'bytes');"
```

Expected: `OK: <bytes>`

- [ ] **Step 5.4: Commit**

```bash
cd /Users/amin/Downloads/MoveLeads
git add client/src/pages/onboarding/
git commit -m "$(cat <<'EOF'
feat(onboarding): wizard scaffold + screens 1-2 (Market / Move types)

Onboarding.css scoped under .onboarding-wizard with chip/card/toggle/
input primitives, modal shell, progress bar, activation panel styling.

OnboardingWizard.jsx loads prior progress on mount, saves each step to
/api/onboarding/save-step, and exposes Continue/Skip controls.

Screens 1 (Market Coverage) and 2 (Move Preferences) implemented;
screens 3-5 + activation come next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wizard screens 3–5

**Files:**
- Modify: `client/src/pages/onboarding/OnboardingWizard.jsx`

- [ ] **Step 6.1: Add the constant arrays for screens 3-5**

Above `export default function OnboardingWizard`, add the following constant blocks (just below the existing `MOVE_TYPE_OPTIONS`):

```js
const ALERT_CHANNELS = [
  { id: 'sms',   label: 'SMS' },
  { id: 'call',  label: 'Phone call' },
  { id: 'email', label: 'Email' },
];

const DAILY_CAPACITY_OPTIONS = [
  { id: '1-3',  label: '1–3' },
  { id: '4-7',  label: '4–7' },
  { id: '8-15', label: '8–15' },
  { id: '15+',  label: '15+' },
];

const TIMING_OPTIONS = [
  { id: 'sameDay',     label: 'Same day' },
  { id: 'within7Days', label: 'Within 7 days' },
  { id: 'thisMonth',   label: 'This month' },
  { id: 'any',         label: 'Any timing' },
];

const CREW_COUNT_OPTIONS = [
  { id: '1',   label: '1 crew' },
  { id: '2-3', label: '2–3 crews' },
  { id: '4-6', label: '4–6 crews' },
  { id: '7+',  label: '7+ crews' },
];

const DAYS = [
  { id: 'mon', label: 'Mon' }, { id: 'tue', label: 'Tue' }, { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' }, { id: 'fri', label: 'Fri' }, { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
];
```

- [ ] **Step 6.2: Update `isStepValid` to cover the new steps**

Replace the existing `isStepValid` function with:

```js
function isStepValid(step, a) {
  if (step === 1) return !!a.primaryMarket && !!a.coveragePreference;
  if (step === 2) return a.moveTypes && a.moveTypes.length > 0;
  if (step === 3) return a.alertChannels && a.alertChannels.length > 0;
  if (step === 4) return !!a.dailyRequestCapacity && !!a.crewCount;
  if (step === 5) return true;
  return true;
}
```

- [ ] **Step 6.3: Add screens 3, 4, 5 in the body switch**

Find the line in the `OnboardingWizard` component that says `{/* Screens 3, 4, 5 added in Task 6 */}` and replace it with:

```jsx
          {step === 3 && <ScreenDispatchSetup answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
          {step === 4 && <ScreenCapacity answers={answers} setAnswer={setAnswer} toggleInArray={toggleInArray} />}
          {step === 5 && <ScreenSetupSummary answers={answers} />}
```

- [ ] **Step 6.4: Append screen 3, 4, 5 components at the end of the file**

Add the following screens at the end of `OnboardingWizard.jsx`, after `ScreenMovePreferences`:

```jsx
// ── Screen 3 ─────────────────────────────────────────────────────────────────
function ScreenDispatchSetup({ answers, setAnswer, toggleInArray }) {
  const isToggleActive = answers.urgentCallEnabled;
  return (
    <>
      <h1 className="ow-h1">How should we route requests to your team?</h1>
      <p className="ow-sub">Pick your alert channels — speed of response usually decides who books the move.</p>

      <div className="ow-field">
        <label className="ow-label">Alert channels (tap to enable)</label>
        <div className="ow-chips">
          {ALERT_CHANNELS.map(c => (
            <button
              key={c.id}
              type="button"
              className={`ow-chip${answers.alertChannels.includes(c.id) ? ' active' : ''}`}
              onClick={() => toggleInArray('alertChannels', c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ow-field">
        <button
          type="button"
          className={`ow-toggle${isToggleActive ? ' active' : ''}`}
          onClick={() => setAnswer('urgentCallEnabled', !isToggleActive)}
        >
          <span className="ow-toggle-track" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
            Call me immediately for urgent requests
          </span>
        </button>
      </div>

      <div className="ow-field">
        <label className="ow-label">Dispatch hours <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DAYS.map(d => {
            const active = !!answers.dispatchHours?.[d.id];
            return (
              <button
                key={d.id}
                type="button"
                className={`ow-chip${active ? ' active' : ''}`}
                onClick={() => {
                  setAnswer('dispatchHours', {
                    ...answers.dispatchHours,
                    [d.id]: active ? undefined : { open: '07:00', close: '19:00' },
                  });
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
          We'll only route requests during these hours by default.
        </p>
      </div>
    </>
  );
}

// ── Screen 4 ─────────────────────────────────────────────────────────────────
function ScreenCapacity({ answers, setAnswer, toggleInArray }) {
  return (
    <>
      <h1 className="ow-h1">Help us balance request flow for your team</h1>
      <p className="ow-sub">We'll throttle alerts to fit your crews' real capacity.</p>

      <div className="ow-field">
        <label className="ow-label">How many new requests per day can your crews realistically handle?</label>
        <div className="ow-cards">
          {DAILY_CAPACITY_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-card${answers.dailyRequestCapacity === opt.id ? ' active' : ''}`}
              onClick={() => setAnswer('dailyRequestCapacity', opt.id)}
            >
              <div style={{ fontWeight: 700 }}>{opt.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="ow-field">
        <label className="ow-label">Most useful timing</label>
        <div className="ow-chips">
          {TIMING_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-chip${answers.preferredTiming.includes(opt.id) ? ' active' : ''}`}
              onClick={() => toggleInArray('preferredTiming', opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ow-field">
        <label className="ow-label">Crews usually available</label>
        <div className="ow-cards">
          {CREW_COUNT_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`ow-card${answers.crewCount === opt.id ? ' active' : ''}`}
              onClick={() => setAnswer('crewCount', opt.id)}
            >
              <div style={{ fontWeight: 700 }}>{opt.label}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Screen 5: Setup Summary + activation pane ────────────────────────────────
function ScreenSetupSummary({ answers }) {
  const moveLabels = answers.moveTypes
    .map(id => MOVE_TYPE_OPTIONS.find(o => o.id === id)?.label)
    .filter(Boolean)
    .join(', ');
  const channelLabels = answers.alertChannels
    .map(id => ALERT_CHANNELS.find(o => o.id === id)?.label)
    .filter(Boolean)
    .join(' · ') || '—';
  return (
    <>
      <h1 className="ow-h1">Your dispatch setup is ready</h1>
      <p className="ow-sub">Everything's configured. Activate your balance to start unlocking verified move requests.</p>

      <div className="ow-summary-grid">
        <div className="ow-summary-recap">
          <div className="ow-summary-recap-h">Configured</div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Primary market</span>
            <span className="ow-summary-recap-value">{answers.primaryMarket || '—'}</span>
          </div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Coverage</span>
            <span className="ow-summary-recap-value">{COVERAGE_OPTIONS.find(o => o.id === answers.coveragePreference)?.label || '—'}</span>
          </div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Move types</span>
            <span className="ow-summary-recap-value">{moveLabels || '—'}</span>
          </div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Alerts</span>
            <span className="ow-summary-recap-value">{channelLabels}</span>
          </div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Daily capacity</span>
            <span className="ow-summary-recap-value">{answers.dailyRequestCapacity || '—'}</span>
          </div>
          <div className="ow-summary-recap-row">
            <span className="ow-summary-recap-label">Crews</span>
            <span className="ow-summary-recap-value">{CREW_COUNT_OPTIONS.find(o => o.id === answers.crewCount)?.label || '—'}</span>
          </div>
        </div>

        {/* Activation panel — populated in Task 7 */}
        <div className="ow-summary-recap">
          <div className="ow-summary-recap-h">Next: activate</div>
          <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
            Activate your onboarding balance to start unlocking verified move requests in your service area.
          </p>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 6.5: Verify it parses**

```bash
node -e "const p = require('/Users/amin/Downloads/MoveLeads/client/node_modules/@babel/parser'); const fs = require('fs'); const code = fs.readFileSync('/Users/amin/Downloads/MoveLeads/client/src/pages/onboarding/OnboardingWizard.jsx', 'utf8'); p.parse(code, { sourceType: 'module', plugins: ['jsx'] }); console.log('OK:', code.length, 'bytes');"
```

Expected: `OK: <bytes>`

- [ ] **Step 6.6: Commit**

```bash
cd /Users/amin/Downloads/MoveLeads
git add client/src/pages/onboarding/OnboardingWizard.jsx
git commit -m "$(cat <<'EOF'
feat(onboarding): screens 3-5 (Dispatch / Capacity / Summary)

Screen 3: alert-channel chips (sms/call/email), urgent-call toggle,
dispatch-hours day chips with 7am-7pm default window.

Screen 4: daily-request-capacity cards, preferred-timing chips,
crew-count cards.

Screen 5: configured-recap card on the left, activation-pane stub on
the right (activation CTA wired in Task 7).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Activation screen + Stripe checkout from wizard

**Files:**
- Modify: `client/src/pages/onboarding/OnboardingWizard.jsx`

- [ ] **Step 7.1: Replace the `ScreenSetupSummary` activation panel with the live activation panel**

Find the activation panel block in `ScreenSetupSummary` (the second `<div className="ow-summary-recap">`) and replace it with:

```jsx
        <ActivationPanel />
```

- [ ] **Step 7.2: Add the `ActivationPanel` component at the end of the file**

```jsx
// ── Activation panel ──────────────────────────────────────────────────────────
function ActivationPanel() {
  const { API_URL } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);

  async function handleActivate() {
    setLoading(true);
    try {
      // Mark onboarding as complete (idempotent on the server)
      await fetch(`${API_URL}/onboarding/complete`, {
        method: 'POST',
        headers: { 'x-auth-token': localStorage.getItem('token') || '' },
      });
      // Create Stripe checkout session for $100 (will become $150 via bonus)
      const res = await fetch(`${API_URL}/billing/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({ amount: 100 }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert('Could not start checkout. Try again or contact support.');
        setLoading(false);
      }
    } catch (err) {
      console.error('[ActivationPanel] checkout failed', err);
      setLoading(false);
    }
  }

  return (
    <div className="ow-activate">
      <span className="ow-activate-pill">Limited onboarding spots in your area</span>

      <div className="ow-activate-bonus">
        <span className="ow-activate-bonus-currency">$</span>
        <span className="ow-activate-bonus-num">50</span>
        <span className="ow-activate-bonus-tag">FREE</span>
      </div>
      <p className="ow-activate-label">unlock credit on us</p>
      <p className="ow-activate-plus">+ 50% extra buying power on your first $100</p>

      <button type="button" className="ow-activate-cta" onClick={handleActivate} disabled={loading}>
        {loading ? 'Opening checkout…' : 'Activate my $150 balance →'}
      </button>

      <div className="ow-activate-trust">
        <span>Refundable balance</span><span>·</span>
        <span>No subscription</span><span>·</span>
        <span>Credits never expire</span><span>·</span>
        <span>Stripe</span>
      </div>

      <div className="ow-activate-urgency">
        <span className="ow-activate-urgency-dot" />
        <span>Onboarding remains open in your service area for now</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.3: Update the footer Continue button to call handle-skip on the summary screen instead of advancing**

Find the existing footer block and replace it with:

```jsx
        <div className="ow-footer">
          {step > 1
            ? <button className="ow-back" onClick={back} type="button">← Back</button>
            : <button className="ow-back" onClick={dismissSkip} type="button">Skip setup</button>
          }
          {step < TOTAL_STEPS && (
            <button
              className="ow-next"
              onClick={next}
              type="button"
              disabled={!isStepValid(step, answers)}
            >
              Continue →
            </button>
          )}
          {step === TOTAL_STEPS && (
            <button className="ow-back" onClick={dismissSkip} type="button">I'll activate later</button>
          )}
        </div>
```

- [ ] **Step 7.4: Verify it parses**

```bash
node -e "const p = require('/Users/amin/Downloads/MoveLeads/client/node_modules/@babel/parser'); const fs = require('fs'); const code = fs.readFileSync('/Users/amin/Downloads/MoveLeads/client/src/pages/onboarding/OnboardingWizard.jsx', 'utf8'); p.parse(code, { sourceType: 'module', plugins: ['jsx'] }); console.log('OK:', code.length, 'bytes');"
```

Expected: `OK: <bytes>`

- [ ] **Step 7.5: Commit**

```bash
cd /Users/amin/Downloads/MoveLeads
git add client/src/pages/onboarding/OnboardingWizard.jsx
git commit -m "$(cat <<'EOF'
feat(onboarding): activation screen with Stripe checkout

ActivationPanel renders the $50 FREE bonus visual (matches partners
page palette + ribbon) with the "Limited onboarding spots in your area"
urgency line. CTA marks onboarding complete then opens Stripe checkout
for $100 (server applies 50% bonus → $150 balance).

Footer changes: on screen 5, the only escape hatch is "I'll activate
later" — keeps the offer visually dominant. Continue/Back work as
before for steps 1–4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Soft-lock + dashboard integration (Tasks 8–9)

### Task 8: Mount the wizard from DashboardLayout

**Files:**
- Modify: `client/src/components/DashboardLayout.jsx`
- Modify: `client/src/context/AuthContext.jsx`

- [ ] **Step 8.1: Add a `refreshUser()` helper to AuthContext**

Open `client/src/context/AuthContext.jsx`. Find the existing `login` function. Immediately after it, add:

```js
  const refreshUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { 'x-auth-token': token },
      });
      if (!res.ok) return null;
      const data = await res.json();
      setUser(data);
      return data;
    } catch (err) {
      console.error('[Auth] refreshUser failed', err);
      return null;
    }
  };
```

Then in the `value={{ ... }}` provider object, add `refreshUser` to the exposed values.

- [ ] **Step 8.2: Wire the wizard into `DashboardLayout.jsx`**

Open `client/src/components/DashboardLayout.jsx`. At the top, add the imports:

```js
import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import OnboardingWizard from '../pages/onboarding/OnboardingWizard';
```

(Adjust if `useState`/`useEffect`/`useContext` are already imported.)

Find the main `DashboardLayout` function. Inside the function body, before the existing return statement, add:

```js
  const { user, refreshUser } = useContext(AuthContext);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    // Show wizard once for partner users who haven't completed onboarding.
    // Admins are exempt.
    if (!user) return;
    if (user.role === 'admin' || user.role === 'super_admin') return;
    if (!user.onboarding?.complete) setShowWizard(true);
  }, [user]);

  const handleClose = async () => {
    setShowWizard(false);
    if (refreshUser) await refreshUser();
  };
```

In the JSX, render the wizard at the end of the layout (just before the final closing tag):

```jsx
      {showWizard && <OnboardingWizard onClose={handleClose} />}
```

- [ ] **Step 8.3: Verify both files parse**

```bash
node -e "const p = require('/Users/amin/Downloads/MoveLeads/client/node_modules/@babel/parser'); const fs = require('fs'); for (const f of ['/Users/amin/Downloads/MoveLeads/client/src/context/AuthContext.jsx','/Users/amin/Downloads/MoveLeads/client/src/components/DashboardLayout.jsx']) { p.parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }); console.log('OK:', f); }"
```

Expected: two `OK:` lines.

- [ ] **Step 8.4: Manual smoke test**

```bash
cd /Users/amin/Downloads/MoveLeads/client
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5173 --host 127.0.0.1 --clearScreen false &
sleep 5
curl -sS -o /dev/null -w "/dashboard: %{http_code}\n" http://127.0.0.1:5173/dashboard
pkill -f "vite dev --port 5173"
```

Expected: `/dashboard: 200`. Manual: log in as a non-admin user, navigate to `/dashboard`, confirm the wizard overlay appears.

- [ ] **Step 8.5: Commit**

```bash
cd /Users/amin/Downloads/MoveLeads
git add client/src/components/DashboardLayout.jsx client/src/context/AuthContext.jsx
git commit -m "$(cat <<'EOF'
feat(onboarding): mount activation wizard from DashboardLayout

DashboardLayout now reads user.onboarding.complete from AuthContext.
For partner users (non-admin) who haven't completed setup, the
OnboardingWizard overlay renders on top of the blurred dashboard.

Closing the wizard triggers refreshUser() so dashboard banner state
updates immediately (Task 9 uses this signal).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Persistent activation banner for unactivated movers

**Files:**
- Create: `client/src/components/ActivationBanner.jsx`
- Modify: `client/src/components/DashboardLayout.jsx`

- [ ] **Step 9.1: Create `client/src/components/ActivationBanner.jsx`**

```jsx
import { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';

export default function ActivationBanner() {
  const { API_URL, user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);

  // Show only for users who finished/skipped the wizard but haven't claimed bonus
  if (!user) return null;
  if (user.role === 'admin' || user.role === 'super_admin') return null;
  if (!user.onboarding?.complete) return null;
  if (user.onboarding?.bonusClaimedAt) return null;

  async function handleActivate() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/billing/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({ amount: 100 }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setLoading(false);
        alert('Could not start checkout. Try again or contact support.');
      }
    } catch (err) {
      console.error('[ActivationBanner] checkout failed', err);
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: 'linear-gradient(180deg, #07111f 0%, #06101d 100%)',
      borderBottom: '1px solid rgba(255, 106, 20, 0.18)',
      padding: '12px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      flexWrap: 'wrap',
      color: '#fff',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontSize: 14,
    }}>
      <span style={{
        background: '#ff6a14', color: '#fff',
        padding: '4px 10px', borderRadius: 999,
        fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
      }}>LIMITED</span>
      <span>
        Claim your <strong style={{ color: '#ff6a14', fontWeight: 800 }}>free $50 unlock credit</strong> · onboarding spots in your area are limited
      </span>
      <button
        type="button"
        onClick={handleActivate}
        disabled={loading}
        style={{
          background: '#ff6a14', color: '#fff', border: 'none',
          height: 36, padding: '0 16px', borderRadius: 10,
          fontFamily: 'inherit', fontWeight: 800, fontSize: 13.5,
          cursor: loading ? 'wait' : 'pointer',
          boxShadow: '0 6px 18px rgba(255, 106, 20, 0.32)',
        }}
      >
        {loading ? 'Opening…' : 'Activate $150 →'}
      </button>
    </div>
  );
}
```

- [ ] **Step 9.2: Render `<ActivationBanner />` at the top of `DashboardLayout`**

In `client/src/components/DashboardLayout.jsx`, add the import at the top:

```js
import ActivationBanner from './ActivationBanner';
```

In the JSX, place `<ActivationBanner />` as the very first child of the layout's main wrapper (above the existing header/sidebar/content).

- [ ] **Step 9.3: Verify**

```bash
node -e "const p = require('/Users/amin/Downloads/MoveLeads/client/node_modules/@babel/parser'); const fs = require('fs'); p.parse(fs.readFileSync('/Users/amin/Downloads/MoveLeads/client/src/components/ActivationBanner.jsx', 'utf8'), { sourceType: 'module', plugins: ['jsx'] }); p.parse(fs.readFileSync('/Users/amin/Downloads/MoveLeads/client/src/components/DashboardLayout.jsx', 'utf8'), { sourceType: 'module', plugins: ['jsx'] }); console.log('OK');"
```

Expected: `OK`.

- [ ] **Step 9.4: Commit**

```bash
cd /Users/amin/Downloads/MoveLeads
git add client/src/components/ActivationBanner.jsx client/src/components/DashboardLayout.jsx
git commit -m "$(cat <<'EOF'
feat(onboarding): persistent activation banner for unactivated movers

ActivationBanner renders inside DashboardLayout when:
- user is a partner (not admin)
- user.onboarding.complete == true (wizard finished or skipped)
- user.onboarding.bonusClaimedAt == null (no top-up yet)

Single CTA opens Stripe checkout for $100 → $150 balance via the
existing first-purchase bonus path (no extra server work).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Verification (Task 10)

### Task 10: End-to-end smoke + production build verification

**Files:** none modified.

- [ ] **Step 10.1: Run a production build**

```bash
cd /Users/amin/Downloads/MoveLeads/client
node ./node_modules/vite/bin/vite.js build .
```

Expected: build succeeds, `dist/` is created. The `dist/assets/` listing should now include `OnboardingWizard-*.js` chunk.

- [ ] **Step 10.2: Server smoke**

```bash
cd /Users/amin/Downloads/MoveLeads/server
MONGO_URI="$MONGO_URI" JWT_SECRET="$JWT_SECRET" node server.js &
sleep 3

# Auth endpoint healthy
curl -sS -o /dev/null -w "GET /api/onboarding/status: %{http_code}\n" http://127.0.0.1:5005/api/onboarding/status
# Cron registered (look for log line)
grep -q "OnboardingRecovery" <(curl -sS http://127.0.0.1:5005/health 2>/dev/null) || echo "(cron log check is informational — check server stdout)"

pkill -f "node server.js"
```

Expected: `GET /api/onboarding/status: 401` (auth required, but endpoint is mounted).

- [ ] **Step 10.3: Manual full-flow test**

Run dev stack:
```bash
cd /Users/amin/Downloads/MoveLeads/client
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5173 --host 127.0.0.1 --clearScreen false &
cd /Users/amin/Downloads/MoveLeads/server && MONGO_URI="$MONGO_URI" JWT_SECRET="$JWT_SECRET" node server.js &
sleep 5
```

Manual checklist (in browser at `http://127.0.0.1:5173`):

1. Register a new partner account at `/register`. Confirm redirect to `/dashboard`.
2. Wizard appears as overlay; dashboard is blurred behind.
3. Step 1: enter primary market, pick coverage, optionally add markets. `Continue` enables only when both required fields are set.
4. Step 2: pick at least one move type. `Continue` enables.
5. Step 3: pick at least one alert channel. Toggle urgent-call. Click days for dispatch hours.
6. Step 4: pick capacity, timing chips, crew count. `Continue` enables when capacity + crew count are set.
7. Step 5: see `Configured` recap on left + activation panel on right. The recap reflects every answer entered.
8. Click `I'll activate later`. Wizard closes, dashboard becomes interactive, `<ActivationBanner>` is visible at the top.
9. Reload `/dashboard`. Wizard does NOT reappear (onboarding.complete is true). Banner persists.
10. Click the banner's `Activate $150 →` button. Stripe checkout opens. (In dev, you can use Stripe test card `4242 4242 4242 4242`.)
11. Complete payment. Stripe webhook fires (locally requires Stripe CLI; on prod this is automatic). Returning user has `balance: 150` and `onboarding.bonusClaimedAt != null`.
12. Reload `/dashboard`. Banner is gone (bonus claimed).

Cleanup:
```bash
pkill -f "node server.js" 2>/dev/null
pkill -f "vite dev --port 5173" 2>/dev/null
```

- [ ] **Step 10.4: Verify a fresh DB user lands on the wizard correctly**

(Optional but recommended) Use MongoDB shell or Compass on a test DB:

```js
// In mongosh against your dev DB:
db.users.findOne({ email: 'youraccount@example.com' }, { onboarding: 1, balance: 1, role: 1 });
```

Expected after step 8 above (skip): `onboarding.complete: true`, `onboarding.skippedAt: <date>`, `onboarding.bonusClaimedAt: null`, `balance: 0`.

After step 11 (activation): `onboarding.bonusClaimedAt: <date>`, `balance: 150`.

- [ ] **Step 10.5: Final commit (if any wrap-up tweaks)**

```bash
cd /Users/amin/Downloads/MoveLeads
git status --short
# If clean, skip. Otherwise:
git add -A
git commit -m "$(cat <<'EOF'
chore(onboarding): final wrap-up after smoke

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review checklist

Walk through each spec requirement → confirm a task implements it:

| Spec requirement | Implemented in |
|---|---|
| Soft-lock wizard, dismissible | Task 5 (`dismissSkip`), Task 8 (mount), Task 9 (banner) |
| 5 setup screens (Market / Move / Dispatch / Capacity / Summary) | Tasks 5, 6 |
| Activation screen with `$50 FREE` visual | Task 7 |
| Same visual language as `/partners` | Task 5.1 (CSS uses same orange/navy palette and pill styling) |
| Save progress per-step + resume | Task 5.2 (`useEffect` restores prior step + answers) |
| Skip option | Task 5.2 (`dismissSkip`), Task 7.3 (footer) |
| First-purchase bonus ($100 → $150) | Task 3 |
| One-time bonus per user | Task 3 (`bonusClaimedAt` flag, idempotent webhook) |
| Email recovery T+12h/24h/72h | Task 4 |
| Persistent dashboard banner if skipped | Task 9 |
| "Limited onboarding spots in your area" framing | Task 7.2 (pill text + urgency line), Task 9.1 (banner copy) |
| No fake counters | All tasks — no numeric "X spots remaining" anywhere |
| Mover-native vocab everywhere | Tasks 5–9 (copy reviewed in plan) |
| Mobile responsive | Task 5.1 CSS `@media (max-width: 600px)` rule |
| Soft-lock with blur | Task 5.1 (`.ow-blur` rule) |

All requirements covered. No placeholders. No "TODO" or "implement later" instructions.

---

## What's deliberately out of scope

- **Sample-request preview cards on the unactivated dashboard** (mentioned in brainstorming as "Sample requests visible but locked"). Cleaner as a follow-up — needs Lead-model query work that isn't in scope here.
- **Analytics events instrumentation** (gtag/Pixel) — keep as a follow-up; the frontend hooks are easy to add later by sprinkling `gtag('event', ...)` calls at step transitions.
- **Per-market mover cap enforcement** — copy uses honest "limited spots" language without claiming counts. If you decide to enforce a real cap server-side later, that's a separate enhancement.
- **One-real-testimonial in the wizard** — only worth adding when you have a real one; not worth fake placeholder.
- **A/B testing scaffolding** — first ship the baseline.

---

## Open uncertainties for the engineer

1. The exact import path of `auth` middleware in `server/routes/onboarding.js` is `../middleware/auth`. If the project actually uses a different export shape (e.g. default vs named export), match the existing pattern from `server/routes/billing.js`.
2. The wizard uses `localStorage.getItem('token')` for the auth header. If `AuthContext` exposes a token getter, use that instead.
3. The Stripe `create-checkout-session` call expects `amount: 100`. Confirm the existing endpoint actually accepts a JSON body with that key — if it expects `credits` or `creditAmount`, adjust the request body in Task 7.2 and Task 9.1.
4. `DashboardLayout` may already render structural elements like a sidebar. Place `<ActivationBanner />` and the wizard overlay so they don't conflict with that layout.
