# MoveLeads Partner Onboarding — Current Funnel (4-step) + Front-End Implementation

> Reflects the wizard as of commit `27ff33f` (split Step 1 + moved Live Transfers into activation). Replaces the older 8-step spec in `onboarding-funnel.md`.

---

## High-level shape

| Step | Phase | Purpose | Visible in progress bar | Component |
|---|---|---|---|---|
| 1 | Setup | Dispatch base + pickup coverage | yes (Stage 1: Dispatch) | `ScreenDispatchPickup` |
| 2 | Setup | Delivery coverage + live preview | yes (Stage 2: Delivery) | `ScreenDeliveryCoverage` |
| 3 | Setup | Match preferences + alerts | yes (Stage 3: Setup) | `ScreenPreferencesAndAlerts` |
| 4 | Activation | Live Transfers opt-in + balance picker → secure payment | yes (Stage 4: Activate) | `ScreenActivation` (substeps: `choose` / `pay`) |
| 5 | Terminal | Activation success | no progress bar | `ScreenActivationSuccess` |

`TOTAL_STEPS = 4` controls the progress bar fill and the global "Continue" footer. Step 5 is post-payment terminal — no progress, no footer.

The wizard is mounted from `DashboardLayout` whenever the logged-in user is non-admin and `user.onboarding.complete !== true`. It is also reopened on demand at Step 4 from:
- The `ActivationBanner` "Activate now" CTA.
- Recovery email deep-links: `?onboarding=resume` (jumps to saved step) and `?activate=1` (jumps to Step 4).
- A custom DOM event: `window.dispatchEvent(new CustomEvent('moveleads:open-activation'))`.

---

## Wizard chrome (shared across all setup steps)

**File:** [client/src/pages/onboarding/OnboardingWizard.jsx](../client/src/pages/onboarding/OnboardingWizard.jsx)

### Header

- **Progress bar** (`.ow-progress` + `.ow-progress-fill`): width = `(step / TOTAL_STEPS) * 100%`. Hidden once `step > TOTAL_STEPS` (i.e. Step 5).
- **Progress label** (`.ow-progress-label`): `Step {n} of 4 · {STEP_MICROCOPY[n]}`
  - Step 1: "Dispatch base & pickup"
  - Step 2: "Delivery coverage"
  - Step 3: "Preferences & alerts"
  - Step 4: "Activate your account"
- **Stage chips** (`.ow-stages`): four pills — Dispatch / Delivery / Setup / Activate. Each has three visual states: `done` (green ✓), `active` (orange numbered dot), `future` (grey numbered dot).

### Footer

- **Visible** only on steps 1–3 (`showFooter = step <= 3`). Step 4 has its own internal CTAs (Continue with $X balance / skip). Step 5 has its own CTA (View matching opportunities).
- **Back button** (`.ow-back`): visible from Step 2 onward. Decrements `step`.
- **Continue button** (`.ow-next`):
  - Step 1, 2 label: `Continue →`
  - Step 3 label: `Continue to activation →`
  - Disabled until `isStepValid(step, answers)` returns true.

### Body shell

- Fade-in animation on each step transition via `.ow-step-anim` re-keyed on `step`.
- Modal width: 880px desktop, full-bleed (16px gutter) on mobile, `dvh` based height to survive iOS Safari address bar.
- Backdrop: `.ow-blur` (rgba navy + backdrop-filter blur).

### Hydration on mount

```
GET /api/onboarding/status
```

Pulls `onboarding.currentStep` (clamps into 1..4) and `onboarding.answers`, hydrates the local `answers` state. If a parent passes `initialStep` (e.g. activation deep-link), that wins over the saved step.

---

## Answers state shape

```
{
  // Step 1
  dispatchBase: { input, zip, city, state },     // resolved selection from /place-suggest
  pickup:       { mode: 'near'|'state'|'states', states: ['TX', ...] },

  // Step 2
  delivery:     { mode: 'same'|'states'|'nationwide', states: [...] },

  // Step 3 (also written to top-level User on save)
  maxDistance:        '' | 'Local' | 'Long Distance',
  preferredHomeSizes: ['Studio', '2 Bedroom', ...],
  phone:              '(555) 123-4567',
  smsNotif:           boolean,

  // Step 4 (also written to top-level User; persisted on toggle)
  receiveLiveTransfers: boolean,

  // Legacy back-compat (resume only; not asked in new UI)
  primaryMarket, coverageRadius, additionalMarkets,
}
```

Saved on every "Continue" click via `POST /api/onboarding/save-step` with `{ step, answers }`. The full answers object is sent regardless of step so the server can write any present field — but the server only writes top-level User fields when the matching step number gates them (see "Backend wire-up" below).

---

## Step 1 — Dispatch base + pickup

**File reference:** [`ScreenDispatchPickup`](../client/src/pages/onboarding/OnboardingWizard.jsx#L329)

### Copy

| Slot | Text |
|---|---|
| Greeting (`.ow-greeting`) | `{companyName} — let's set up your dispatch.` (or "Let's set up your dispatch." if no companyName) |
| H1 (`.ow-h1`) | **Set up your dispatch base** |
| Sub (`.ow-sub`) | Tell us where your crews start jobs. We'll use this to route nearby pickup requests to your team. |
| FOMO note (`.ow-setup-fomo`) | We limit active mover partners per market so request quality stays protected. Your spot is held until you finish setup. |
| Field 1 label | Where are your crews based? |
| Field 1 placeholder | `Houston, TX or 77001` |
| Field 1 helper (`.ow-helper`) | Choose your main dispatch base. You can fine-tune later in Settings. |
| Field 1 confirmed feedback | `{city}, {state} confirmed as your dispatch base.` |
| Field 2 label | Where do your crews usually start jobs? |
| Reassurance (`.ow-reassurance`) | You can change this later from your dashboard. |

### Pickup options (3 cards)

| ID | Label | Description |
|---|---|---|
| `near` | Local around my base | Best for nearby pickup jobs around your dispatch base. Roughly 50 miles. |
| `state` | Anywhere in my state | `Receive pickup opportunities across {stateName}.` (or "your main state" if base not picked yet) |
| `states` | Multiple states | Choose the states where your crews can pick up moves. |

When `states` is selected, a `StateMultiSelect` component reveals beneath the card grid.

### Per-mode confirmation feedback (under the cards)

- `near` → "Local pickup coverage enabled around {city}."
- `state` → "Statewide pickup coverage enabled in {stateName(state)}."
- `states` (≥1 state) → "Pickup coverage enabled in N state(s)."

### Implementation notes

- **PlaceAutocomplete** ([client/src/components/PlaceAutocomplete.jsx](../client/src/components/PlaceAutocomplete.jsx)):
  - Debounced 300ms hits `GET /api/onboarding/place-suggest?q=&limit=8`.
  - Forced selection — typing free text never commits. User must click/Enter on a suggestion.
  - Renders as a removable orange chip once a place is selected.
  - Keyboard nav: ↑↓ Enter Esc. 44px-tall items for touch.
- **StateMultiSelect** ([client/src/components/StateMultiSelect.jsx](../client/src/components/StateMultiSelect.jsx)):
  - Pure-client typeahead over the 50 + DC list (`client/src/data/usStates.js`).
  - Match by name prefix OR exact 2-letter code.
  - Backspace on empty input removes the last chip.
- All pickup option cards are disabled (50% opacity) until `dispatchBase.zip` is set.

### Validation (`isStepValid(1, a)`)

- `dispatchBase.zip` must be set.
- If `pickup.mode === 'states'`, at least one state must be selected.

### What hits the server on Continue

- `POST /api/onboarding/save-step { step: 1, answers }`
- Server-side: regenerates `CoverageArea` docs via `regenerateCoverageForUser_v2` when `dispatchBase.zip` is set.

---

## Step 2 — Delivery coverage

**File reference:** [`ScreenDeliveryCoverage`](../client/src/pages/onboarding/OnboardingWizard.jsx#L431)

### Copy

| Slot | Text |
|---|---|
| H1 | **Set up delivery coverage** |
| Sub | Tell us where your crews can move customers to. This narrows the long-distance leads we send you. |
| Progression chips (`.ow-progression-chip`) | `✓ Dispatch base · {city}, {state}` and `✓ Pickup coverage · {short label}` |
| Field label | Where do you usually move customers to? |
| Reassurance | You can change this later from your dashboard. |

### Delivery options (3 cards)

| ID | Label | Description |
|---|---|---|
| `same` | Same as pickup | Best for local moves where pickup and delivery stay in your service area. |
| `states` | Multiple states | Choose the states where your crews can deliver moves. |
| `nationwide` | Nationwide | Receive long-distance delivery opportunities across the U.S. |

When `states` is selected, a `StateMultiSelect` reveals beneath the cards.

### Per-mode confirmation feedback

- `same` → "Local delivery coverage enabled around your service area."
- `nationwide` → "Nationwide long-distance delivery interest enabled."
- `states` (≥1) → "Delivery coverage enabled in N state(s)."

### Live coverage preview pill (`.ow-coverage-preview`)

- Debounced 400ms POST to `/api/onboarding/preview-coverage-v2` with the full `{ dispatchBase, pickup, delivery }` shape.
- Recomputes whenever any of those fields change.
- Renders one of these copy patterns:
  - Nationwide: `**{city, state}** pickup · **Nationwide** delivery interest saved`
  - near + same: `**{city, state}** local dispatch coverage ready`
  - state + same: `**{stateName}** pickup + delivery coverage ready`
  - states + same: `**{state list joined by ·}** pickup + delivery coverage ready`
  - any + states: `**{pickup label}** pickup · **{delivery state list}** delivery ready`
- Below the headline, a tiny muted line shows `Internal coverage: N ZIP areas · capped at 3,000 (if hit) · Fine-tune later in Settings.`
- Spinner state ("Checking coverage…") shown while the request is in flight.
- Error state (red): "Could not resolve service area." or whatever the API returned.

### Validation (`isStepValid(2, a)`)

- If `delivery.mode === 'states'`, at least one state must be selected.

### What hits the server on Continue

- `POST /api/onboarding/save-step { step: 2, answers }`
- Server-side: regenerates `CoverageArea` again with the now-complete origin/destination shape, flips top-level `User.deliversNationwide` based on `delivery.mode`, and derives a friendly `primaryMarket = "{city}, {state}"` for legacy email templates.

---

## Step 3 — Preferences + alerts

**File reference:** [`ScreenPreferencesAndAlerts`](../client/src/pages/onboarding/OnboardingWizard.jsx#L620)

This is two boxed sections (`.ow-section`) on one screen.

### Copy

| Slot | Text |
|---|---|
| H1 | **Match preferences & alerts** |
| Sub | Tell us which moves fit your crews and how to reach you. We'll narrow alerts to matching opportunities. |
| Section A header (`.ow-section-h`) | MATCH PREFERENCES |
| Distance label (`.ow-label`) | Distance preference |
| Sizes label | Preferred move sizes *(optional — leave empty to receive all sizes)* |
| Section B header | ALERTS |
| Phone label | Phone number |
| Phone placeholder | `(555) 123-4567` |
| Phone helper | We text + dial this number for SMS alerts and (optionally) live transfers. |
| SMS toggle copy | Text me when a request matches my setup |
| SMS helper | SMS fires only on leads matching your service area, distance, and size preferences. |

### Distance options (3 cards)

| ID | Label | Description |
|---|---|---|
| `''` (any) | Both / Any | Send me both local and long-distance moves |
| `Local` | Local moves | Same-city / under-100mi jobs only |
| `Long Distance` | Long-distance | Cross-state / 100mi+ jobs only |

### Preferred move sizes (chips, multi-select, optional)

`Studio`, `1 Bedroom`, `2 Bedroom`, `3 Bedroom`, `4+ Bedroom`, `House (Small)`, `House (Medium)`, `House (Large)`, `Office/Commercial`.

These map 1-1 to the admin lead form's `homeSize` enum, so adding/removing items here must be mirrored in [client/src/pages/admin/AdminLeads.jsx](../client/src/pages/admin/AdminLeads.jsx).

Inline feedback when ≥1 selected:
- 1 size → "{size} requests prioritized."
- 2+ sizes → "N sizes prioritized for matching."

### Phone field

- Plain `<input type="tel">` with `autoComplete="tel"`.
- No formatting/normalization on input — the server stores whatever string the user types after a `.trim()`. SMS broadcast normalizes at send-time.

### SMS toggle

- Custom `.ow-toggle` (44px tall track, accessible button with `aria-pressed`).
- Off by default unless hydration restored an existing user value.

### Validation (`isStepValid(3, a)`)

- Phone must contain exactly **10 digits** (after stripping non-digits). All other Step 3 fields are optional.

### What hits the server on Continue

- `POST /api/onboarding/save-step { step: 3, answers }`
- Server-side writes top-level User fields: `maxDistance`, `preferredHomeSizes`, `phone`, `smsNotif` (the matching helper + `broadcastLeadSMS` read these directly).
- Then the client calls `POST /api/onboarding/complete` once (idempotent guard via `completeCalledRef`) to mark `onboarding.complete = true` before transitioning to Step 4.

---

## Step 4 — Activation (Live Transfers + Balance + Payment)

**File reference:** [`ScreenActivation`](../client/src/pages/onboarding/OnboardingWizard.jsx#L730)

This step has two **internal substeps** (no progress-bar change between them):

### 4a — `choose`: [`ChooseBalance`](../client/src/pages/onboarding/OnboardingWizard.jsx#L808)

#### Copy

| Slot | Text |
|---|---|
| H1 | **Activate your account** |
| Sub | Add your starting balance and pick whether you want premium live phone transfers. You'll only be charged for what you accept. |
| FOMO notice (`.ow-fomo`) | Partner spots are limited per state so request quality stays protected. Your **$50 onboarding credit** is available while onboarding remains open in your state. |

#### Live Phone Transfers card (`.ow-live-transfer-field`)

- Title: **Live Phone Transfers**
- Pill: `$40 per accepted call` (`.ow-live-transfer-pill`)
- Body: When a premium lead requests a quote, our system calls your phone directly. Press 1 to accept and instantly connect with the customer.
- Toggle on the right (same `.ow-toggle` component as Step 3).
- Warning strip (`.ow-live-transfer-warn`): ⚠️ You're only charged $40 when you accept the call. Keep your balance above $50 to receive live transfers.
- **Persists immediately** on toggle: extra `POST /api/onboarding/save-step { step: 4, answers: { receiveLiveTransfers } }` so closing the wizard mid-activation doesn't drop the choice.

#### Balance picker (`.ow-tiers`)

Section heading: `CHOOSE YOUR STARTING BALANCE`

**Primary tier ($100 → $150 balance, recommended)**
- Pill: `Recommended` + supporting "Most partners start here"
- Amount row: `$100 → $150 balance`
- Bonus line: `+ $50 FREE onboarding credit included` (`.ow-tier-bonus-tag`)
- Selected: orange border + soft tint + "✓ Selected" badge top-right

**Secondary tier ($50 → $50 balance, starter)**
- Pill: `Starter balance`
- Amount row: `$50 → $50 balance`
- Bonus line (muted): `No bonus · Test the marketplace with a smaller balance.`

Default `tier = 100`. ARIA: `role="radio"`, `aria-checked`. Keyboard: Enter/Space activates.

#### Trust panel (`.ow-trust-panel`)

Heading: `INCLUDED WITH YOUR BALANCE`
- Refundable unused balance
- No subscription or contract
- Credits never expire
- Secure card payment

#### Primary CTA (`.ow-activate-cta`)

- Tier 100: `Continue with $150 balance →`
- Tier 50: `Continue with $50 balance →`
- Loading: `Preparing secure payment…`
- Click → `POST /api/billing/create-payment-intent { amount: tier, source: 'onboarding_activation' }`
- On success → `intent` (`{ clientSecret, selectedAmount, bonusCredits, totalCredits }`) is stored, substep flips to `pay`.
- On error → `.ow-activate-err` block above the CTA shows `data.msg` or `Could not start payment (status N).`

#### Skip CTA (`.ow-activate-skip`)

- Two-line button: top "Continue without activating", subline "Dashboard access stays limited until activation."
- Click → `POST /api/onboarding/skip` (sets `onboarding.skippedAt`, `onboarding.complete = true`). Wizard closes; `ActivationBanner` will then show on the dashboard.

### 4b — `pay`: [`ActivationPaymentForm`](../client/src/pages/onboarding/OnboardingWizard.jsx#L920)

Wrapped in `<Elements>` from `@stripe/react-stripe-js`, keyed on `intent.clientSecret` so changing tiers and re-fetching remounts cleanly with a fresh PaymentIntent.

#### Copy

| Slot | Text |
|---|---|
| Back link (`.ow-pay-back`) | ← Change balance |
| H1 | Complete secure payment |
| Sub | Your selected balance will be added immediately after payment. |
| Summary row (`.ow-pay-summary`) | `Selected · $100 → $150 balance` (or `$50 → $50 balance`) |

#### Stripe Payment Element

- Mounted via `<PaymentElement options={{ layout: 'tabs' }} />`.
- Theme: light, brand colors (`#ff6a14` primary, Plus Jakarta Sans).
- `onReady` flips `elementReady` so the submit button enables.
- Submit handler:
  - `stripe.confirmPayment({ elements, confirmParams: { return_url: `${origin}/dashboard/leads?payment=success` }, redirect: 'if_required' })`
  - On `paymentIntent.status === 'succeeded'`:
    1. `POST /api/billing/verify-payment-intent { paymentIntentId }` (idempotent — webhook is the source of truth, this is just a fast-path for UI).
    2. `refreshUser()` so `user.balance`, `user.onboarding.bonusClaimedAt` are fresh.
    3. `setStep(5)` → success screen.
  - On error → red `.ow-activate-err` block shows the Stripe-provided message.

#### CTA labels

- Idle, tier 100: `Pay $100 and activate $150 balance →`
- Idle, tier 50:  `Pay $50 and activate balance →`
- Submitting: `Processing payment…`

---

## Step 5 — Activation success (terminal)

**File reference:** [`ScreenActivationSuccess`](../client/src/pages/onboarding/OnboardingWizard.jsx#L1083)

### Copy (tier-aware)

- Headline:
  - Bonus path (`user.onboarding.bonusClaimedAt` set OR `balance >= 150`): **Your $150 balance is active**
  - Starter path: **Your ${balance || 50} balance is active**
- Bullet 1:
  - Bonus path: `Onboarding bonus applied: +$50`
  - Starter path: `Starter balance activated`
- Bullet 2 (live match count):
  - With matches: `N active request matches your setup near {city}, {state}`
  - Without matches but market known: `Market routing enabled for {city}, {state}`
  - Otherwise: `Market routing enabled`
- Bullet 3: `Notifications ready for matching requests`
- CTA: `View matching opportunities →` → closes wizard, navigates to `/dashboard/leads`.

### How the match count is computed

After mount, `GET /api/leads` is fetched once. The result is filtered client-side on `originCity` / `destinationCity` substring (state name) or word-boundary token match (2-letter code). This is intentionally loose since it's just for the social-proof bullet, not for routing.

---

## Backend wire-up (just enough for the front end to make sense)

| Client call | Server route | Purpose |
|---|---|---|
| `GET /api/onboarding/status` | [server/routes/onboarding.js](../server/routes/onboarding.js) | Hydrate wizard on mount |
| `POST /api/onboarding/save-step` | same file | Persist answers + step number, regen CoverageArea (steps 1+2), flip top-level User fields per step gating |
| `GET /api/onboarding/place-suggest?q=` | same file | City/ZIP autocomplete (in-memory `zipcodes` index) |
| `POST /api/onboarding/preview-coverage-v2` | same file | Live coverage preview pill on Step 2 |
| `POST /api/onboarding/complete` | same file | Marks `onboarding.complete = true` (called once between Step 3 and Step 4) |
| `POST /api/onboarding/skip` | same file | Soft-skip from Step 4: sets `skippedAt` + `complete = true` |
| `POST /api/billing/create-payment-intent` | server/routes/billing.js | Step 4a → Step 4b transition |
| `POST /api/billing/verify-payment-intent` | server/routes/billing.js | Step 4b post-confirm fast path |

### Step-gated User-field writes (server save-step)

| Step | Top-level User fields written |
|---|---|
| 1 | (none — only nested `onboarding.answers.*` and CoverageArea regen) |
| 2 | `deliversNationwide`, derived `onboarding.answers.primaryMarket` |
| 3 | `maxDistance`, `preferredHomeSizes`, `phone`, `smsNotif` |
| 4 | `receiveLiveTransfers` |

CoverageArea regeneration (`regenerateCoverageForUser_v2`) runs on **either** step 1 or step 2 because both phases now feed the typed origin/destination/both writes.

---

## Resume / recovery / deep-link rules

**File:** [client/src/components/DashboardLayout.jsx](../client/src/components/DashboardLayout.jsx)

| Trigger | Behavior |
|---|---|
| User logs in with `onboarding.complete !== true` | Wizard auto-mounts, hydrates from saved step (1..4). |
| `?onboarding=resume` query param (recovery email) | Wizard mounts at clamped saved step; if already `complete`, lands on Step 4. |
| `?activate=1` query param (post-skip recovery email) | Wizard mounts at Step 4. |
| `ActivationBanner` "Activate now" CTA | Wizard mounts at Step 4. |
| `window.dispatchEvent(new CustomEvent('moveleads:open-activation'))` | Same as banner — wizard mounts at Step 4. Used by deep children (e.g. `LeadFeed` PreviewModal). |
| `?onboarding=success` (Stripe redirect fallback) | Sets `showActivationSuccess` flag, runs `refreshUser`. |

---

## Validation summary (the gate behind Continue)

```
Step 1 → dispatchBase.zip set
       AND if pickup.mode === 'states', pickup.states.length >= 1

Step 2 → if delivery.mode === 'states', delivery.states.length >= 1

Step 3 → phone digits-only length === 10

Step 4 → no global validation (substep CTAs gate themselves):
         - 'choose' substep: CTA fires when not already fetching
         - 'pay' substep: requires Stripe + Elements + elementReady
```

---

## Mobile / responsive notes

- Modal switches to near-fullscreen on `(max-width: 600px)` with 8px gutters and `dvh` height (iOS Safari address-bar safe).
- Footer becomes `position: sticky; bottom: 0` so the primary CTA stays in thumb reach as content scrolls.
- All tap targets ≥ 44px (PlaceAutocomplete options, StateMultiSelect chips/options, toggle, .ow-back, .ow-skip-link, .ow-activate-skip).
- `.ow-cards` collapses from 2-col to 1-col under 600px.
- `.ow-tier-v2` cards re-flow: pill row wraps, amounts shrink slightly.
- Dropdowns (place / state) shrink to 240px max-height to leave room for the keyboard.
- `.ow-place-chip` becomes 100% wide with space-between layout on mobile.

---

## CSS modules at a glance

All styles are scoped under `.onboarding-wizard` (no shadow DOM, just a top-level class). Key selector groups:

| Group | Where |
|---|---|
| Modal shell, header, progress bar, stages | [Onboarding.css:56-149](../client/src/pages/onboarding/Onboarding.css#L56-L149) |
| Cards, chips, toggle, helper text | [Onboarding.css:198-271](../client/src/pages/onboarding/Onboarding.css#L198-L271) |
| Footer, back, next, skip-link | [Onboarding.css:273-325](../client/src/pages/onboarding/Onboarding.css#L273-L325) |
| Live Transfers card | [Onboarding.css:912-950](../client/src/pages/onboarding/Onboarding.css#L912-L950) |
| Place autocomplete + state multi-select | [Onboarding.css:953-1081](../client/src/pages/onboarding/Onboarding.css#L953-L1081) |
| Coverage preview pill | [Onboarding.css:1095-1126](../client/src/pages/onboarding/Onboarding.css#L1095-L1126) |
| FOMO note (activation) + balance tiers + trust panel | [Onboarding.css:1129-1400](../client/src/pages/onboarding/Onboarding.css#L1129-L1400) |
| Setup-phase FOMO + progression chips + boxed sections | [Onboarding.css:1513-1574](../client/src/pages/onboarding/Onboarding.css#L1513-L1574) |
| Pay substep (Stripe form + summary + back link) | [Onboarding.css:1402-1511](../client/src/pages/onboarding/Onboarding.css#L1402-L1511) |
| Success screen | [Onboarding.css:641-670](../client/src/pages/onboarding/Onboarding.css#L641-L670) |

---

## What this funnel does NOT do (intentional non-goals)

- **No hard-skip from setup steps 1-3.** The user must answer or close the tab.
- **No countdown timers / fake spot counts.** FOMO copy is operational ("limited per state") not invented.
- **No charge before the user clicks Pay.** Step 4a never touches Stripe. Step 4b is the only point where a PaymentIntent is created.
- **No re-charge of the bonus.** `User.onboarding.bonusClaimedAt` is set exactly once via the webhook + idempotent verify path; subsequent $100 top-ups go through the standard billing flow without bonus.
- **No editing of dispatch/coverage from inside the wizard after activation.** Once `onboarding.complete === true`, Settings → Coverage Areas is the source of truth and the wizard never overwrites it.
