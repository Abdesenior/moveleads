# Movers Meta Pixel + Conversions API — Design Spec

**Date:** 2026-06-07
**Status:** Approved (design). Implementation plan pending.
**Scope:** Add a second, isolated Meta Pixel + CAPI for the **mover acquisition funnel only**.
Do not change the behavior of the existing homeowner / Get-Quote pixel or its CAPI.

---

## 1. Goal

Acquire **paying movers** via Facebook Ads by instrumenting the mover funnel with a dedicated Meta
Pixel (`1721087862641992`) and Conversions API, firing four events:

- **PageView** — on the mover **entry** pages only (browser only). Not fired per onboarding screen.
- **Lead** — when the mover reaches the **activation offer screen** (browser only). Mid-funnel,
  high-intent signal used for audiences / higher-volume optimization fallback.
- **CompleteRegistration** — after mover **email verification succeeds** (browser + CAPI, deduped).
- **Purchase** — only after the **activation payment succeeds and balance is credited**
  (browser + CAPI, deduped). `value` = cash paid ($50 or $100), currency USD.

**Campaign optimization guidance:** optimize future ad campaigns for **Purchase**, not
CompleteRegistration. `Lead` (activation-offer) is a mid-funnel volume/audience signal only, not the
optimization target.

Today there is **no mover-side conversion tracking** — the only Meta instrumentation is the homeowner
`Lead` event ([client/src/utils/metaPixel.js](../../../client/src/utils/metaPixel.js),
[server/services/metaCapi.js](../../../server/services/metaCapi.js), fired from
[GetQuoteV6.jsx](../../../client/src/pages/GetQuoteV6.jsx) / [leadIngestV2.js](../../../server/routes/leadIngestV2.js)).
This spec adds the mover side without touching that path.

---

## 2. Core principle — pixel isolation via `trackSingle`

Meta's `fbevents.js` exposes a single global `fbq`. A bare `fbq('track', …)` broadcasts to **every**
initialized pixel. Therefore **every event (both pixels) uses `trackSingle` / `trackSingleCustom`**
targeting an explicit pixel ID. This is the only way to run two pixels in one SPA without
cross-contamination.

Consequence: the homeowner helper's two calls (`PageView` at boot, `Lead` on quote submit) are
converted from `track` → `trackSingle(HOMEOWNER_ID, …)`. This is **behavior-preserving** (same events,
same pixel, same params, same `eventID`) and *protects* the homeowner pixel from receiving mover events.

---

## 3. Client architecture

Three small, single-purpose modules + one hook.

### 3.1 `client/src/utils/metaPixelCore.js` (NEW)
Pixel-agnostic shared layer:
- `ensureFbevents()` — idempotent injection of the stock `fbevents.js` snippet (no `init`, no track).
- `generateEventId()`, `readFbp()`, `readFbc()`, `eventSourceUrl()` — moved here (currently in `metaPixel.js`).
- `trackSingle(pixelId, eventName, params, eventId)` — guarded wrapper
  (`fbq('trackSingle', pixelId, eventName, params, { eventID })`); no-op when `fbq` absent / SSR.

### 3.2 `client/src/utils/metaPixel.js` (EDITED — isolation only)
- `loadPixel()` → `ensureFbevents()` + `fbq('init', HOMEOWNER_ID)` + `trackSingle(HOMEOWNER_ID, 'PageView')`.
- `trackLead(eventId, params)` → `trackSingle(HOMEOWNER_ID, 'Lead', params, eventId)`.
- Re-exports `generateEventId`/`readFbp`/`readFbc`/`eventSourceUrl`/`trackLead` so
  [GetQuoteV6.jsx](../../../client/src/pages/GetQuoteV6.jsx) imports are **unchanged**.
- `HOMEOWNER_ID = import.meta.env.VITE_META_PIXEL_ID`.

### 3.3 `client/src/utils/metaPixelMovers.js` (NEW)
- `MOVER_ID = import.meta.env.VITE_META_MOVER_PIXEL_ID`.
- `loadMoverPixel()` — `ensureFbevents()` + `fbq('init', MOVER_ID)` (idempotent; no-op if `MOVER_ID` unset).
- `trackMoverPageView()` — `trackSingle(MOVER_ID, 'PageView')`.
- `trackMoverLead(params)` — `trackSingle(MOVER_ID, 'Lead', { content_name:'mover_activation_offer', …params }, <generated id>)` (browser-only, self-generated event_id).
- `trackMoverCompleteRegistration(eventId)` — `trackSingle(MOVER_ID, 'CompleteRegistration', {}, eventId)`.
- `trackMoverPurchase(eventId, { value })` — `trackSingle(MOVER_ID, 'Purchase', { currency:'USD', value }, eventId)`.

### 3.4 `client/src/hooks/useMoverFunnelPixel.js` (NEW)
`useMoverFunnelPixel()` — on mount: `loadMoverPixel()` (idempotent) then `trackMoverPageView()`.
Mounted **only** on the entry pages (`/partners`, `/register`, `/verify-email`,
`/verify-email-pending`) — **not** on the onboarding wizard, so the mover pixel never PageViews each
onboarding step. Inside onboarding the pixel is initialized lazily by the activation-offer screen
(see §4.2), which also fires the single mid-funnel `Lead`.

`main.jsx` is **unchanged** — the homeowner `loadPixel()` boot call stays; the mover pixel is lazy,
hook-driven, funnel-scoped.

---

## 4. Event wiring

| Event | Browser | Server CAPI | `event_id` (dedup) |
|---|---|---|---|
| **PageView** | `useMoverFunnelPixel()` in `Partners.jsx`, `Register.jsx`, `VerifyEmail.jsx`, `VerifyEmailPending.jsx` | — (browser-only) | n/a |
| **Lead** | `StepActivate.jsx` `TierPicker` (activation-offer screen) on mount | — (browser-only) | self-generated (no CAPI counterpart) |
| **CompleteRegistration** | `VerifyEmail.jsx` on `status==='success'` | `auth.js` `GET /verify-email` handler | server-generated UUID returned in the verify-email JSON; browser fires same ID |
| **Purchase** | `StepActivate.jsx` after `verify-payment-intent` succeeds | `billingCredits.applyOnboardingActivationCredit` (`applied:true` branch) | **Stripe `paymentIntent.id`** (deterministic; both sides know it) |

### 4.1 PageView scope
The **4 entry surfaces** are `/partners`, registration, and the two email-verification pages. The mover
pixel is **not** PageView-fired per onboarding screen — onboarding emits only the single mid-funnel
`Lead` (§4.2) and `Purchase` (§4.4). This keeps the funnel signal clean and avoids PageView spam.

### 4.2 Lead (mid-funnel, browser-only)
- Fires once when `TierPicker` (the activation-offer screen) mounts
  ([StepActivate.jsx](../../../client/src/pages/onboarding/steps/StepActivate.jsx) — `TierPicker`).
- The same mount also calls `loadMoverPixel()` so the pixel is initialized for the later `Purchase`
  even if the mover never hit a public entry page this session.
- Browser-only (no clean server trigger for a client UI state); self-generated `event_id` (no dedup
  counterpart needed). `content_name:'mover_activation_offer'`.
- Purpose: a higher-volume, high-intent signal for audience building and as an optimization fallback
  while Purchase volume is thin. **Not** the campaign optimization target (that's Purchase).

### 4.3 CompleteRegistration
- **Server** ([auth.js:180-214](../../../server/routes/auth.js#L180)): after the verified flag flips
  and the token is cleared, generate `eventId = crypto.randomUUID()`, fire
  `metaCapiMovers.sendCompleteRegistration(user, { eventId, req })` fire-and-forget, and include
  `metaEventId` in the response body. `issueJWT` gains an optional `extra` param merged into the JSON
  (mover-scoped; homeowner/login callers pass nothing → unchanged).
- **Browser** ([VerifyEmail.jsx](../../../client/src/pages/VerifyEmail.jsx)): on success, read
  `data.metaEventId` and call `trackMoverCompleteRegistration(data.metaEventId)`.
- Cross-device: if verified via a link on another device, only CAPI fires — acceptable (CAPI is durable).

### 4.4 Purchase
- **Server** ([billingCredits.js:65-113](../../../server/routes/billingCredits.js#L65)): on the
  first credit application, fire
  `metaCapiMovers.sendActivationPurchase(user, { eventId: paymentIntent.id, value: selectedAmount })`
  fire-and-forget.
- **Browser** ([StepActivate.jsx:175-190](../../../client/src/pages/onboarding/steps/StepActivate.jsx#L175)):
  after `verify-payment-intent` returns success, call `trackMoverPurchase(paymentIntent.id, { value: tier })`.
- **Idempotency key = the Stripe `paymentIntent.id`** — no User guard field. `applyOnboardingActivationCredit`
  reaches its `applied:true` branch exactly once per PI (Transaction unique-sparse `stripePaymentIntentId`
  index), and Meta dedups browser↔CAPI on `event_id = paymentIntent.id`. So `sendActivationPurchase` does
  **not** do a per-user single-fire `updateOne`.
- `value` = **cash paid** (`selectedAmount` / `tier`, 50 or 100), **not** the bonus-inflated
  `totalCredits` (150).

---

## 5. Server module: `server/services/metaCapiMovers.js` (NEW)

Self-contained; **homeowner `metaCapi.js` is untouched**.
- Imports the **pure** helpers already exported by `metaCapi.js`: `hashPii`, `normalizePhoneForHash`,
  `extractRequestSignals`. Includes a small local `postEvents()` (≈20 lines, same shape as homeowner)
  so it does not depend on `metaCapi._internal`.
- `META_MOVER_PIXEL_ID`, `META_MOVER_CAPI_ACCESS_TOKEN`, `META_MOVER_CAPI_TEST_EVENT_CODE` read lazily.
- `buildUserData(user, req)` → hashed `em` (skip `noemail+…`), `ph`, `external_id` (user `_id`); plaintext
  `client_ip_address` / `client_user_agent` from `req` when present.
- `sendCompleteRegistration(user, { eventId, req })` — `event_name: 'CompleteRegistration'`,
  idempotent via `User.metaMoverCompleteRegistrationSentAt` (conditional `updateOne` BEFORE HTTP; roll
  back on HTTP failure — mirrors `metaCapi.sendLead`).
- `sendActivationPurchase(user, { eventId, value, req })` — `event_name: 'Purchase'`,
  `custom_data: { currency:'USD', value }`. **No per-user guard** — idempotency is upstream (the
  `applied:true` branch fires once per PI) plus Meta `event_id` dedup on `paymentIntent.id`.
- Degraded mode: missing pixel id/token → scaffold log + `{ sent:false, reason:'env-missing' }`, no crash.
- Fire-and-forget at every call site (`.catch`), never awaited — Meta uptime never gates user UX.

---

## 6. Data model

Add **one** single-fire guard to `User` ([server/models/User.js](../../../server/models/User.js)),
mirroring `Lead.metaCapiSentAt`:
- `metaMoverCompleteRegistrationSentAt: Date`

No `metaMoverPurchaseSentAt` — Purchase idempotency is the Stripe `paymentIntent.id` (see §4.4).

---

## 7. Environment variables

| Var | Side | Value | Notes |
|---|---|---|---|
| `VITE_META_MOVER_PIXEL_ID` | client (build-time) | `1721087862641992` | **Added** — browser pixel id must be Vite-exposed (mirrors `VITE_META_PIXEL_ID`) |
| `META_MOVER_PIXEL_ID` | server | `1721087862641992` | CAPI target |
| `META_MOVER_CAPI_ACCESS_TOKEN` | server | secret | BACKEND ONLY |
| `META_MOVER_CAPI_TEST_EVENT_CODE` | server | optional | QA → Events Manager *Test Events*; unset in prod |

All unset → graceful no-op (matches homeowner degraded behavior). Documented in `.env.example` / deploy docs.

---

## 8. Dedup & idempotency summary

- **Browser↔CAPI dedup** via shared `event_id`: CompleteRegistration (server UUID echoed to browser),
  Purchase (`paymentIntent.id`). PageView is browser-only (no dedup needed).
- **Server single-fire** via conditional `updateOne` on the two new `User` guard fields (CompleteRegistration)
  and the existing Transaction-unique credit path + `metaMoverPurchaseSentAt` (Purchase).

---

## 9. Files

**New:** `client/src/utils/metaPixelCore.js`, `client/src/utils/metaPixelMovers.js`,
`client/src/hooks/useMoverFunnelPixel.js`, `server/services/metaCapiMovers.js`,
`server/__tests__/metaCapiMovers.test.js`.

**Edited:**
- `client/src/utils/metaPixel.js` — use core + `trackSingle` (isolation only).
- `client/src/pages/Partners.jsx`, `Register.jsx`, `VerifyEmail.jsx`, `VerifyEmailPending.jsx` — add hook;
  `VerifyEmail.jsx` also fires CompleteRegistration.
- `client/src/pages/onboarding/steps/StepActivate.jsx` — `TierPicker` mount: `loadMoverPixel()` + fire
  `Lead`; `PaymentForm` success: fire `Purchase`.
- **`OnboardingWizard.jsx` is NOT modified** (no per-screen PageView).
- `server/routes/auth.js` — verify-email: generate event_id, fire CAPI CompleteRegistration, return id
  (via `issueJWT` optional `extra`).
- `server/routes/billingCredits.js` — fire CAPI Purchase on `applied:true`.
- `server/models/User.js` — two guard fields.
- `.env.example` / deploy docs — new env vars.

**Untouched (verify in review):** `server/services/metaCapi.js`, `client/src/pages/GetQuoteV6.jsx`,
`client/src/main.jsx`, `server/routes/leadIngestV2.js`.

---

## 10. Testing

- **Unit** (`metaCapiMovers.test.js`): event-entry shape (event_name, event_id, hashed user_data,
  custom_data value/currency); idempotency guard (second call → `already-sent`, no HTTP); degraded mode
  (unset env → no-op).
- **Manual QA**: set `META_MOVER_CAPI_TEST_EVENT_CODE`; walk register → verify → activate; confirm in
  Events Manager *Test Events*: PageView on entry pages only, exactly one `Lead` at the activation-offer
  screen, CompleteRegistration and Purchase each collapse browser+CAPI to one event per `event_id`,
  `Purchase.value` = cash paid, and **no PageView fires per onboarding screen**.
- **Isolation regression**: confirm homeowner `Lead` still fires only on the homeowner pixel and
  `/get-quote` does not initialize the mover pixel.

---

## 11. Non-goals / YAGNI

- No CAPI for PageView or Lead (both browser-only — standard and sufficient).
- No `InitiateCheckout`/`AddPaymentInfo` events (only PageView, Lead, CompleteRegistration, Purchase).
- No refactor of the homeowner CAPI into a shared core (explicit constraint: keep it untouched).
- No change to top-up/refund tracking.
