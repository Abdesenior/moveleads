# MoveLeads V5 Lead Quality Architecture — Design Spec

> **Status:** Design / brainstorm — no code changes yet
> **Date:** 2026-05-14
> **Scope:** Quality-first lead intake (V5 funnel), validation, deterministic scoring, additive pricing, tiered routing, SMS claim flow
> **Companion audits:**
> - `funnel-architecture-audit.md` — every existing funnel, routes, ingest sharing
> - `lead-qualification-audit.md` — current Lead model, scoring, pricing, Twilio/Abstract, dedup, race protection

---

## Executive verdict

**This is durable and safe to implement without breaking current production — IF three rules hold:**

1. **V5 funnel lives at a new route + new ingest endpoint** (`/get-quote-v5`, `POST /api/leads/ingest-v2`). Never touch `/api/leads/ingest`, never edit `GetQuoteV4.jsx`.
2. **Every new scoring/validation/pricing path runs in shadow mode first**, writing to `scoring_snapshots` and `lead_validation_logs` without affecting `Lead.score`, `Lead.grade`, `Lead.buyNowPrice`, or `Lead.status`.
3. **Do not migrate the phone validator (Abstract → Twilio) in the same release as new scoring.** It's the only non-additive change. Keep Abstract live, add Twilio Lookup alongside, dual-write for two weeks, cut over after stability is confirmed.

Anything beyond Phase 1+2 (schema additions, shadow scoring, validation services) is optional and reversible. The SMS claim flow is the last thing — it's where every irreversible bug lives.

---

## Audits — confirmed by reading the code

- `Lead.js`, `leadIngest.js`, `scoringService.js`, `pricingEngine.js`, `leads.js`, `twilioService.js`, `leadMatching.js`, `findEligibleMovers.js`, `dispatchPolicy.js`, `CoverageArea.js`, `PurchasedLead.js` exist as the audits describe.
- `GetQuoteV4.jsx` is the production funnel; `/api/leads/ingest` is shared by every funnel.
- `verifyLeadPhone()` runs as fire-and-forget after `lead.save()` at [server/routes/leads.js:176](../../../server/routes/leads.js#L176) — the exact pattern shadow scoring should reuse.
- The atomic claim lock at [server/routes/leads.js:609-617](../../../server/routes/leads.js#L609-L617) (`findOneAndUpdate` with `$expr: $lt: [{$size: '$buyers'}, '$maxBuyers']`) is the template the SMS claim flow should clone in Phase 7.

## Three corrections the audits missed

### 1. `PricingRule` cannot store additive USD today
[server/models/PricingRule.js](../../../server/models/PricingRule.js) has only `multiplier: Number`. There is no `amountUsd`, no `mode` switch, no `priority`. The pricing engine at [server/utils/pricingEngine.js:70-74](../../../server/utils/pricingEngine.js#L70-L74) only multiplies.

**Implication:** Additive USD pricing requires either (a) extending `PricingRule` with `mode: 'multiplier' | 'flat_usd'`, `amountUsd: Number`, `priority: Number`, OR (b) a parallel `PricingAddOn` collection. **Recommend (b)** — keep the legacy engine intact and let `pricingEngineV2` add `Σ addons` on top of (or instead of) the multiplicative base, gated by a `PRICING_ENGINE_VERSION` flag.

### 2. `PlatformSettings` has a rigid 4-field schema
`PlatformSettings` only stores `standardLeadPrice`, `exclusiveLeadMultiplier`, `acceptNewUserSignups`, `automatedStripeRefunds`. It is not a key-value config store. `SCORING_MODE`, `SMS_CLAIM_WINDOW_SECONDS`, `ENABLE_*` flags cannot live here without schema migration.

**Implication:** Phase 1 should add a `config: { type: Object, default: {} }` mixed field to `PlatformSettings`, or keep flags in `.env` only. **Recommend env-only for boolean flags, `config: Mixed` for tunable values** (`smsClaimWindowSeconds`, `tierThresholds`) so admins can adjust without redeploys.

### 3. Zod silently strips unknown fields
The current ingest Zod schema at [server/validators/leadIngest.js:9-103](../../../server/validators/leadIngest.js#L9-L103) does not use `.strict()`. Zod's default behavior strips unknown keys. If V5 client mistakenly sends `heavyItems`, `intentConfirmed`, `urgencyBucket`, `fingerprintVisitorId` to the *old* endpoint, they disappear silently.

**Implication:** Safe for accidental traffic, bad for debugging. The new `ingest-v2` schema should declare every field explicitly and reject unknowns with `.strict()`. After V5 launches, retroactively apply `.strict()` to v1.

---

## Recommended architecture

### Data flow

```
Client (V5 funnel)
  └─ POST /api/leads/ingest-v2
       ├─ validateLeadPayloadV2 (new Zod schema, .strict)
       ├─ duplicateDetectorV2 (phone + route + device + IP, time-bucketed)
       ├─ Lead.create({ ...v4 fields, ...v5 fields, status: 'Pending Verification' })
       ├─ Fire-and-forget: validationPipeline(lead._id)
       │   ├─ twilioLookupService.lookup()    →  validation.phone
       │   ├─ mapboxService.validateRoute()   →  validation.route
       │   ├─ fingerprintService.verify()     →  validation.fingerprint
       │   └─ persist → lead_validation_logs (full raw responses)
       └─ Fire-and-forget: scoringPipeline(lead._id)  [shadow mode by default]
           ├─ leadScoringEngine.score()      →  scores{} object
           ├─ leadTierRouter.assign()        →  tier + tierReason[]
           ├─ pricingEngineV2.price()        →  shadow buyNow/startingBid
           └─ scoring_snapshots.create({ leadId, scores, tier, pricing, mode: 'shadow' })
```

In shadow mode: the **old** scoring/pricing still writes to `Lead.score`/`Lead.grade`/`Lead.buyNowPrice`. The new engine only writes to `scoring_snapshots`. Movers see no change. Admin can compare old vs new in a dashboard.

When ready: flip `SCORING_MODE=live`. The new engine writes to `Lead.scores{}`, `Lead.tier`, and also computes a back-compat `score`/`grade` for legacy consumers (auction pricing, current dashboard). One-direction migration; no schema rewrite.

### Why this is durable
- Every new collection (`scoring_snapshots`, `lead_validation_logs`, eventually `claim_attempts`, `PricingAddOn`) is net-new — no existing code reads from them.
- Every new field on `Lead` (`scores{}`, `tier`, `validation{}`, `claimWindow{}`, `heavyItems[]`, `intentConfirmed`, `urgencyBucket`, `moveType`, `funnelVersion`, `clientSubmissionId`, `adminTierOverride{}`) is additive — Mongoose ignores absent fields on legacy docs.
- The dashboard `GET /api/leads` filters by `status` and existing buyer rules — adding a tier field does not change visibility unless `ENABLE_TIERED_ROUTING` is on.
- Auction settlement cron, billing flow, refund cascade, CRM-status flow, SMS broadcast — all untouched.

---

## Gaps not covered by the YAML spec

| Gap | Why it matters | Default |
|---|---|---|
| **Idempotency on ingest-v2** | A retried POST shouldn't create two Leads. The current 30-day dedup is slow and lossy. | Client-generated `clientSubmissionId` UUID + unique partial index on `Lead.clientSubmissionId` |
| **Fingerprint timing** | Server can't verify a `requestId` after the page closes — signed events have short validity. | Collect on form mount, re-collect on submit, send both |
| **PII in validation logs** | `lead_validation_logs` will hold raw Twilio responses including caller name. | TTL index (90 days), redact phone to last 4 |
| **Score versioning** | Tuning thresholds requires comparing old snapshots. | `scoring_snapshots.engineVersion: String` |
| **Tier downgrade after admin action** | Admin approves a "review" lead — does it become "standard" or stay "review" with `manualApproval`? | `Lead.adminTierOverride: { tier, reason, by, at }` overlays computed tier |
| **Rejected leads** | A spam phone shouldn't pollute the Lead collection. | Insert anyway with `status: 'REJECTED_FAKE'` + `tier: 'rejected'`; never broadcast; admin can see |
| **Twilio Lookup cost** | $0.005/lookup × N × failures stings at scale. | Only call after Mapbox + duplicate-check pass; cache 30 days by phone |
| **V5 traffic strategy** | A/B vs hard cutover undecided. | Start with `/get-quote-v5` from one paid campaign; V4 stays default |
| **Sourcing analytics** | Need V4 vs V5 close-rate data or the project can't be validated. | `Lead.funnelVersion: 'v4' \| 'v5'` field, set at ingest |
| **`intentConfirmed = false` routing** | Spec captures the field but doesn't route differently. | Force `low_trust`, send to admin-review queue |
| **Office / Commercial routing** | No existing mover preference for commercial coverage; the `homeSize` enum currently rejects it. | Phase 3: add `Office / Commercial` to the `homeSize` enum (Lead.js + leadIngestV2.js) when V5 ships; Phase 4: add mover prefs |

---

## Phase-by-phase plan

Every phase has one rule: **no mover-facing behavior changes unless explicitly stated.**

### Phase 1 — Additive schema + shadow scoring (zero behavior change)

**Added:**
- `server/services/leadScoringEngine.js` — 7 deterministic scores
- `server/services/leadTierRouter.js` — composite → tier mapping
- `server/models/ScoringSnapshot.js` — new collection

**Edited (additive only):**
- `server/models/Lead.js` — append optional fields (`scores{}`, `tier`, `tierReason[]`, `validation{}`, `claimWindow{}`, `heavyItems[]`, `intentConfirmed`, `urgencyBucket`, `moveType`, `funnelVersion`, `clientSubmissionId`, `adminTierOverride{}`). No enum changes. No required-field changes.
- `server/routes/leads.js` — one line added inside `/ingest` after `lead.save()`: `scoringPipeline(lead._id).catch(...)`. Nothing else.

**Read-only consumer:**
- `client/src/pages/admin/AdminLeads.jsx` — new "Scoring Snapshot" subtab fetching from a new admin route. Strictly additive UI.

**Untouched:** `pricingEngine.js`, `scoringService.js`, `twilioService.js`, `leadIngest.js`, `GetQuoteV4.jsx`, `App.jsx`, every mover-facing page, every billing/auction/CRM file.

If Phase 1 breaks anything, it's a Lead schema typo. Rollback = revert two files.

### Phase 2 — Validation services (shadow)

**Added:**
- `server/services/twilioLookupService.js` (Line Type + SMS Pumping; Identity Match later)
- `server/services/mapboxService.js`
- `server/services/fingerprintService.js`
- `server/services/duplicateDetectorV2.js`
- `server/models/ValidationLog.js`

**Edited:** `scoringPipeline` (from Phase 1) — reads validation results when available, falls back to current Abstract API.

**Feature flags:** `ENABLE_TWILIO_LOOKUP`, `ENABLE_MAPBOX_VALIDATION`, `ENABLE_FINGERPRINT` (all default false). All write to `ValidationLog`, none affect routing.

### Phase 3 — V5 funnel + ingest-v2

**Added:**
- `client/src/pages/GetQuoteV5.jsx` — clone V4's design system, new 7-step flow (pickup ZIP, destination ZIP, move date, move size, heavy items, contact info, intent confirmation)
- `server/validators/leadIngestV2.js` — strict Zod schema with `heavyItems`, `intentConfirmed`, `urgencyBucket`, `fingerprintVisitorId`, `clientSubmissionId`, optional `customerEmail`
- `server/routes/leads.js` — `POST /ingest-v2` handler (separate function, shares only the Lead model with `/ingest`). Add unique partial index on `clientSubmissionId`.

**Edited:**
- `client/src/App.jsx` — add `/get-quote-v5` route
- `client/src/pages/Admin.jsx` — V4 vs V5 conversion rates side-by-side

**Untouched:** `GetQuoteV4.jsx`, `/api/leads/ingest`, all mover-facing pages.

**Rollout:** point one ad campaign at `/get-quote-v5`. Compare V4 baseline conversion + lead quality side-by-side for two weeks.

### Phase 4 — Admin intelligence (read-only)

Extend `client/src/pages/admin/AdminLeads.jsx` with a "Quality Review" tab. Shows:
- Tier badge per lead with `tierReason[]` tooltip
- Validation pills (phone valid / SMS-pumping risk / line type)
- Score breakdown (7 scores)
- Pricing breakdown (base + add-ons)
- Manual actions: approve / reject / downgrade / manual price override / rescore — all logged via existing `AdminAction` audit collection

**Added admin routes:** `GET /api/admin/leads/:id/scoring`, `GET /api/admin/leads/:id/validation`, `POST /api/admin/leads/:id/rescore`, `POST /api/admin/leads/:id/tier-override`.

**Untouched:** ingest pipeline, mover dashboard, pricing engine.

### Phase 5 — Additive USD pricing

**Added:**
- `server/models/PricingAddOn.js` — `{ matchType, matchValue, amountUsd, enabled, market, priority, description }`
- `server/utils/pricingEngineV2.js` — additive engine: `base ($20) + Σ enabled addons`
- `client/src/pages/admin/AdminPricingAddOns.jsx` — admin CRUD

**Edited:**
- `server/routes/leads.js` `ingest-v2` handler — when `PRICING_ENGINE_VERSION=v2`, use new engine; default `v1`
- `server/models/Lead.js` — add `pricingBreakdown: { base, addons: [{ name, amountUsd }], engineVersion }`

**Safety gate:** before flipping `PRICING_ENGINE_VERSION=v2` in production, run shadow comparison for one week — for every lead, compute both v1 and v2, store both, compare distribution. Only flip when variance is acceptable.

### Phase 6 — Tiered dashboard routing (gentle)

`GET /api/leads` at [server/routes/leads.js:239-357](../../../server/routes/leads.js#L239-L357) does not filter by quality. Phase 6 adds annotations only, not filtering:

- Annotate leads with `_tier` and `_tierBadge` in the response
- Mover dashboard renders a colored badge; mover can filter client-side
- Server-side filtering happens only when `ENABLE_TIERED_ROUTING=true`

This lets us test UX without gating leads from existing movers (who would notice volume loss immediately).

### Phase 7 — SMS claim flow (LAST)

The only phase with new race conditions. Audit's pattern is correct. Additional constraints:

- Hot leads with active claim window are **invisible** in the dashboard list (server-side filter), not just badged — otherwise two movers race the same lead via two channels
- `claimWindow.expiresAt` check is part of the atomic update, not a pre-check
- Pre-deduct a hold on balance when SMS is sent (`balanceHold: { lead, amount, expiresAt }`), release on window expiry — prevents oversold cap when multiple hot leads are out simultaneously
- One mover, one claim window at a time — don't blast SMS for 5 leads simultaneously or ACCEPT replies will race 5 atomic locks

**Added:** `server/services/smsClaimService.js`, `server/routes/twilio.js` extension (`POST /api/twilio/sms/claim-reply`), `server/models/ClaimAttempt.js`, `server/jobs/expireClaimWindows.js` (cron).

---

## Risk analysis

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| New scoring changes grade distribution → existing prices shift | High if flipped to live without comparison | Revenue swing across all movers in one day | Mandatory shadow mode for two weeks; admin side-by-side; only flip after variance < ±10% |
| Twilio Lookup outage → all V5 leads fail validation | Medium | V5 funnel rejects real leads | Fall back to Abstract API; if both fail, `validation.phone.provider = 'unavailable'`, route to admin review |
| Mapbox cost explosion | Medium | $$ | Only call after duplicate-check + Twilio-valid; cache by ZIP pair 30 days |
| `customerEmail` removed from V5 → CRM review flow breaks | High | Mover can't auto-send review request | Server injects `noemail+{phone}@moveleads.cloud` placeholder when missing; `sendReviewRequestEmail` already checks for valid email at [server/routes/leads.js:726-727](../../../server/routes/leads.js#L726-L727) |
| Adding "Office / Commercial" to homeSize enum without pricing rule | High | Pricing falls back to base $10 | Phase 3 prerequisite: seed a default `PricingRule` for `HOME_SIZE='Office / Commercial'` BEFORE the V5 client ships — enum change and seed must be in the same release |
| Fingerprint script blocked by ad-blockers (~30% of users) | High | Trust score artificially lower | Treat missing fingerprint as neutral, not suspicious |
| Two ingest endpoints diverge over time | Medium | Maintenance burden | Phase 8 cleanup: after 30 days at 100% V5 traffic, deprecate `/api/leads/ingest`, redirect V1-V4 routes to V5 |
| SMS claim race: two ACCEPT replies, balance check passes for both | Low if atomic pattern used | Double-sold lead | Atomic `findOneAndUpdate` with `claimWindow.status: 'open'` precondition is sufficient — same pattern as existing `/claim` |
| Inbound SMS keyword conflict (existing STOP/START/HELP/INFO) | Low | ACCEPT misrouted | Dedicated Twilio number for claim flow |

---

## Files affected — Phase 1 ONLY

Conservative list for the safest first slice:

**Added (new files):**
- `server/services/leadScoringEngine.js`
- `server/services/leadTierRouter.js`
- `server/models/ScoringSnapshot.js`

**Edited (additive only):**
- `server/models/Lead.js` — append new optional fields. No enum changes. No required-field changes.
- `server/routes/leads.js` — single line added inside `/ingest` after `lead.save()`: `scoringPipeline(lead._id).catch(...)`.

**Touched (read-only consumer):**
- `client/src/pages/admin/AdminLeads.jsx` — new "Scoring Snapshot" subtab + new admin route reading `ScoringSnapshot`.

**Untouched:** `pricingEngine.js`, `scoringService.js`, `twilioService.js`, `leadIngest.js`, `GetQuoteV4.jsx`, `App.jsx`, every mover-facing page, every billing/auction/CRM file.

---

## Feature flags

`.env` initially; later movable to `PlatformSettings.config`:

```
# Phase 1
SCORING_MODE=shadow                 # 'shadow' | 'live'
SCORING_ENGINE_VERSION=v2

# Phase 2
ENABLE_TWILIO_LOOKUP=false
ENABLE_MAPBOX_VALIDATION=false
ENABLE_FINGERPRINT=false

# Phase 3
INGEST_V2_ENABLED=true              # public form availability

# Phase 5
PRICING_ENGINE_VERSION=v1           # 'v1' (multiplicative) | 'v2' (additive USD)

# Phase 6
ENABLE_TIERED_ROUTING=false         # annotate-only until true

# Phase 7
ENABLE_SMS_CLAIM_FLOW=false
SMS_CLAIM_WINDOW_SECONDS=60         # 45–60 per YAML
SMS_CLAIM_DEDICATED_FROM_NUMBER=    # separate Twilio number
```

Every flag must be observable in admin's "Lead Quality Config" tab (added in Phase 4).

---

## What NOT to build yet

1. **SMS claim flow** — wait for Phase 7. Don't prototype the webhook in Phase 1.
2. **Pricing engine replacement** — wait for Phase 5. Use both engines in parallel, never replace outright.
3. **Tier-based filtering of dashboard feed** — wait for Phase 6, and only after Phase 4 admin shows tier distribution looks sane.
4. **Identity Match (Twilio premium)** — wait for Phase 2 stability; Line Type + SMS Pumping is enough signal initially.
5. **AI/ML scoring** — YAML explicitly says deterministic rules. Keep it that way until ≥10k tiered leads exist.
6. **Removing legacy `score`/`grade` fields** — keep them for at least 90 days after live cutover; the auction pricing engine depends on `grade`.
7. **Deleting V1/V2/V3 funnels** — V1 powers `/move/:from/:to` SEO. Migration is its own project.
8. **Mover-facing tier preferences** — wait until you have data on how movers actually consume the feed.
9. **Cross-customer fraud rings** — Phase 2 dedup catches most of it; graph analysis is a Phase 8+ effort.
10. **Pricing-rule `market` filter** — defer. Per-market pricing is a 2-month optimization, not a launch requirement.

---

## Durability and safety verdict

**Yes, durable and safe**, with these non-negotiables:

✅ Phase 1 is purely additive to data — Mongoose ignores missing fields
✅ V5 funnel is a separate page + endpoint — V4 traffic is untouched
✅ Shadow scoring writes only to new collections — no Lead state mutation
✅ Pricing changes go through `pricingEngineV2` in shadow before flipping
✅ Phone validator switch (Abstract → Twilio) runs dual-write for 2 weeks
✅ SMS claim flow is gated behind multiple flags and a dedicated Twilio number

❌ Do **not** add "Office / Commercial" to the homeSize enum before seeding its `PricingRule`
❌ Do **not** make `customerEmail` schema-level optional in the same release as V5 — inject placeholder server-side instead
❌ Do **not** delete the legacy `score`/`grade` fields — `calculateAuctionPrice` consumes `grade` and any premature removal breaks pricing
❌ Do **not** enable `ENABLE_TIERED_ROUTING` until at least two weeks of shadow data show stable distribution

The architecture is well-shaped. The biggest single risk is human: flipping `SCORING_MODE=live` before the shadow data confirms the new grade distribution is close to the old one. Build the side-by-side admin view in Phase 1 and *enforce* the comparison gate.

---

## Open decisions (deferred to implementation kickoff)

- **V5 traffic split percentage** for the first two weeks (suggest: 10% of one campaign)
- **Composite score weights** for the 7 sub-scores — must be tuned against historical lead quality data, not chosen blindly
- **Tier thresholds** (composite ≥ ? = hot, ≥ ? = premium, etc.) — placeholder values in Phase 1, finalized after Phase 1 shadow data
- **Whether `Lead.tier` is persisted or derived dynamically** — recommend persisted (cheaper reads, easier admin queries) with a rescore endpoint to update
- **Mapbox plan tier** — pay-as-you-go vs free; depends on expected V5 volume
