# Marketplace Architecture — Source of Truth

> **Audience:** any engineer or operator about to touch the lead marketplace, the bid routes, the settle cron, or any component or schema field related to auctions.
>
> **TL;DR:** the main mover marketplace is **instant-dispatch only**. The auction/bidding system is intentionally **dormant infrastructure** — kept loaded and operational because it will power the future Deal Room (stale inventory, lead packs, regional bundles, admin-curated opportunities). **Do not delete auction code as "unused" — read this document first.**

---

## 1. Original auction architecture (before the transition)

Every lead entering MoveLeads was born into a 24-hour auction:

- `Lead.auctionStatus` was set to `'active'` at ingest
- `Lead.auctionEndsAt` was set to `now + 24h`
- `Lead.startingBidPrice` was 60% of `buyNowPrice` (computed by the legacy `pricingEngine.calculateAuctionPrice`)
- `Lead.currentBidPrice` started at `0`
- Movers could either **place bids** via `POST /api/bids/:leadId` (with anti-sniping +2 min extension if placed in the final two minutes) or **buy now** via `POST /api/bids/:leadId/buy-now` for the full `buyNowPrice`
- A node-cron job (`server/jobs/settleAuctions.js`) ran every 2 minutes, found expired auctions (`auctionStatus: 'active'` + `auctionEndsAt ≤ now`), and atomically settled them to the highest bidder who could afford it (runner-up fallback included)
- Socket events `bid_update` (on each bid), `auction_settled` (on cron settlement), and `lead_sold` (on buy-now or settle) drove real-time UI updates
- Winner received a "You Won!" email; outbid bidders saw an in-app toast

This worked correctly. But operationally, the model assumed a dense, competitive mover base bidding leads upward. We do not yet have that density.

---

## 2. Why we moved away from bidding in the main feed

The marketplace decision was made after observing real mover behavior and gathering feedback. The core reasons:

- **Low mover density.** With sparse bidders per lead, the auction window adds latency without producing competitive pricing. Bids rarely escalated; most leads sold at or near opening bid (or via buy-now anyway).
- **Cognitive friction.** Two CTAs ("Place Bid" + "Unlock Lead") on every card forced movers to mentally model an auction game where the right strategy was just "buy now". This slowed decisions and added dual-mental-model overhead.
- **Slow first-contact.** Moving leads are perishable — the first mover to call the customer wins the customer. A 24h bid window delayed the operational hand-off, hurting close rates.
- **Wrong product feel.** MoveLeads is becoming **real-time dispatch infrastructure**, not an auction platform. The bid surface communicated the wrong mental model to new movers signing up.

The conclusion: **fresh leads should be instant-claim only.** Bidding has real product value, but only for *stale inventory* or *curated batches* where deliberation makes sense. That use case becomes the future Deal Room — see §8.

---

## 3. Phase A — `distributionModel` schema stamping

**Goal:** mark new leads with the distribution channel they're sold through, without yet changing any behavior. Forward-only, env-gated.

**Shipped in commit `63918ed`.**

### Changes

- **Lead schema** ([server/models/Lead.js](../server/models/Lead.js)) added a new field:
  ```js
  distributionModel: {
    type: String,
    enum: ['auction', 'instant'],
    default: 'auction',
  }
  ```
- **Three ingest sites** stamp this field based on the `ENABLE_INSTANT_DISPATCH` env flag:
  - [server/routes/leadIngest.js](../server/routes/leadIngest.js) — V4 customer ingest
  - [server/routes/leadIngestV2.js](../server/routes/leadIngestV2.js) — V5 customer ingest
  - [server/routes/admin.js](../server/routes/admin.js) — CSV bulk import
- **Body-spread admin POST** (`POST /api/leads` in [server/routes/leads.js](../server/routes/leads.js)) falls through to the schema default `'auction'`. Scripts and test fixtures inherit the same default.

### Invariants

- Pre-existing leads have no `distributionModel` field (missing). Treat them as `'auction'`.
- The stamp is **sticky**: once a lead is stamped, it never changes — even if the env flag is flipped mid-stream.
- Phase A introduces zero behavior changes. Flipping the flag in Phase A produces `'instant'`-stamped leads that still flow through the full auction model — only the stamp value differs.

---

## 4. Phase B — instant dispatch implementation

**Goal:** make instant-stamped leads actually behave like instant leads, while leaving auction-stamped leads completely unchanged.

**Shipped in two commits:**
- Server: `78a1138`
- Client: `a5cdd06`

### Server changes (`78a1138`)

- [server/utils/instantDispatch.js](../server/utils/instantDispatch.js) — single source of truth `instantDispatchEnabled()` env helper, read on each call (no module-load caching) so operators can flip mid-stream
- **Ingest:** all three sites now omit `auctionEndsAt` when stamping `'instant'`. They still set `auctionStatus: 'active'` so the existing `/buy-now` atomic flip (active → buy_now) keeps working without route changes
- **Bid route** ([server/routes/bids.js](../server/routes/bids.js)): `POST /:leadId` now returns HTTP 409 `bidding_not_supported` before any state mutation if the lead is instant-stamped. Buy-now and settle routes are untouched
- **Settle cron** ([server/jobs/settleAuctions.js](../server/jobs/settleAuctions.js)): both queries (`settleOneLead` + the periodic finder) add `distributionModel: { $ne: 'instant' }` as belt-and-suspenders. Instant leads already lack `auctionEndsAt` so the `$lte` clause naturally skips them — the `$ne` defends against any future bug that writes `auctionEndsAt` to an instant lead
- **Socket payload** ([server/services/socketService.js](../server/services/socketService.js)): `emitNewLead` payload now includes `distributionModel` (falls back to `'auction'` for pre-Phase-A leads), so the client can render the correct CTA on first paint

### Client changes (`a5cdd06`)

- [client/src/pages/dashboard/LeadFeed.jsx](../client/src/pages/dashboard/LeadFeed.jsx) gained module-level predicates `isInstantLead(lead)` and `isAuctionLead(lead)`
- PreviewModal, desktop table action column, mobile card all branched on `isInstant` vs `isAuction` vs legacy
- Two socket handlers (`bid_update`, `auction_settled`) added defensive guards: if the event arrives for an instant lead, ignore it (server contract says they should never fire for instant leads — but the guard protects against stale events and server bugs)

### Phase B tests

- [server/__tests__/distributionModel.test.js](../server/__tests__/distributionModel.test.js) — static + pure-function coverage:
  - Schema enum, default, validation
  - Env helper parsing matrix (`true`/`TRUE`/`True`/`1` → true; everything else → false)
  - All three ingest sites stamp + gate `auctionEndsAt` via the helper
  - Bid route 409 guard ordering (must fire before any state mutation)
  - Cron queries include `$ne: 'instant'`
  - Socket payload includes `distributionModel`
  - Buy-now atomicity: `findOneAndUpdate` flip + conditional debit + unique-PurchasedLead insert + revert paths still intact

---

## 5. Instant dispatch behavior (current production model)

### How an instant lead flows

1. **Ingest** stamps `distributionModel: 'instant'`, `auctionStatus: 'active'`, **no** `auctionEndsAt`. `buyNowPrice` is computed by the pricing engine. `startingBidPrice` is still computed but ignored.
2. **Validation + scoring** run as normal — the qualification gate (quality, structural blockers, suspicion patterns) applies identically to instant and auction leads. Instant leads can be PENDING_MANUAL_REVIEW just like auction leads.
3. **Broadcast** — `NEW_LEAD_AVAILABLE` socket event fires with `distributionModel: 'instant'` in the payload. Matched movers see the lead in their feed.
4. **Claim** — mover clicks "Unlock Lead — $X" → `POST /api/bids/:leadId/buy-now`. Atomic operation chain:
   - `findOneAndUpdate` flip `auctionStatus: 'active' → 'buy_now'` (only one mover wins this race)
   - Conditional debit `User.balance` with `$gte: price` gate
   - Insert `PurchasedLead { company, lead, pricePaid }` — unique index `{company, lead}` prevents duplicates
   - On E11000: refund + revert flip
   - On insufficient balance: revert flip
   - On success: set `winnerId`, `finalPrice`, `auctionStatus: 'sold'`, `status: 'Purchased'`; create `Transaction` ledger row; emit `lead_sold` socket
5. **Refund** — admin deletes lead → existing refund cascade reads `PurchasedLead.pricePaid`, creates `Transaction` type `'Lead Refund'`, credits `User.balance`, marks `PurchasedLead.refunded = true`. Identical to auction refunds.

### What an instant lead never does

- No bid placement (route 409s)
- No `auctionEndsAt` (cron skips)
- No `bid_update` socket event (server never emits)
- No `auction_settled` socket event (server never emits)
- No anti-snipe extension (no bid path)
- No winner email (no settlement)
- No "Auction Won!" success modal

---

## 6. `distributionModel` flow diagram

```
                  Ingest (V4 / V5 / CSV bulk)
                            │
                            ▼
                ENABLE_INSTANT_DISPATCH?
                    /              \
              true /                \ false (default)
                  /                  \
                 ▼                    ▼
        distributionModel:    distributionModel:
            'instant'              'auction'
          (no auctionEndsAt)    (auctionEndsAt = +24h)
                 │                    │
                 ▼                    ▼
       ┌─────────────────┐   ┌───────────────────┐
       │  Main feed      │   │  Main feed (until │
       │  (single Unlock │   │  Phase D filter)  │
       │   CTA)          │   │                   │
       │                 │   │  Currently visible│
       │  Bid route 409  │   │  with single CTA  │
       │  Cron skips     │   │  via /buy-now     │
       │  No bid_update  │   │  (Phase D client  │
       │  No settled     │   │  cleanup unified  │
       └────────┬────────┘   │  the CTA)         │
                │            └─────────┬─────────┘
                │                      │
                ▼                      │
       ┌─────────────────┐             │
       │  Claim via      │◄────────────┘
       │  /buy-now       │  (auctionStatus='active'
       │  (atomic flip   │   → same /buy-now path)
       │   + debit +     │
       │   PurchasedLead)│
       └─────────────────┘
```

Pre-Phase-A leads (no `distributionModel` field): treat as `'auction'` everywhere. Mongo `$ne: 'instant'` matches them; positive equality `distributionModel === 'instant'` excludes them.

---

## 7. Current dormant auction infrastructure (DO NOT DELETE)

This is the **canonical list** of auction code that lives in the codebase intentionally despite being unreachable from the main feed today. Each entry is reserved for Deal Room reuse — see §8.

### Server-side (fully active, ready to engage)

| Location | Status | Reuse target |
|---|---|---|
| [server/routes/bids.js](../server/routes/bids.js) `POST /:leadId` (bid placement) | Active route, 409s instant leads; will serve Deal Room auction leads | Deal Room auctions |
| [server/routes/bids.js](../server/routes/bids.js) `POST /:leadId/buy-now` | Active for both instant + auction leads | Both surfaces |
| [server/routes/bids.js](../server/routes/bids.js) `POST /:leadId/settle` | Cron-secret manual settle endpoint | Deal Room manual settlement |
| [server/jobs/settleAuctions.js](../server/jobs/settleAuctions.js) | Cron runs every 2min, finds zero leads post-cutover (auctions drained) | Deal Room auctions |
| Anti-sniping +2 min extension in `bids.js` | Triggers on every bid in the final window | Deal Room auctions |
| `bid_update` socket emit in [server/routes/bids.js](../server/routes/bids.js#L34-L44) | Inert post-cutover (no bids placed) | Deal Room real-time UI |
| `auction_settled` socket emit in [server/jobs/settleAuctions.js](../server/jobs/settleAuctions.js#L136-L144) | Inert post-cutover (no auctions to settle) | Deal Room real-time UI |
| Winner email in `settleAuctions.js` | Inert post-cutover | Deal Room winner notification |
| **Lead schema fields**: `bids[]`, `winnerId`, `finalPrice`, `auctionEndsAt`, `currentBidPrice`, `startingBidPrice`, `auctionStatus` (all 6 enum values: `pending`, `active`, `sold`, `expired`, `buy_now`, `settling`) | All preserved on every lead | Both — historical records + Deal Room writes |
| [server/utils/pricingEngine.js](../server/utils/pricingEngine.js) `calculateAuctionPrice` — produces `startingBidPrice` as 60% of `buyNowPrice` | Still wired in legacy ingest; output inert for instant leads | Deal Room pricing |

### Client-side (dormant, marked with explicit comments)

In [client/src/pages/dashboard/LeadFeed.jsx](../client/src/pages/dashboard/LeadFeed.jsx):

| Symbol | Status | Comment marker |
|---|---|---|
| `TimeLeftTag` component | Defined, never instantiated | `DORMANT — TimeLeftTag (Deal Room reuse)` |
| `BidModal` component | Defined, never instantiated | `DORMANT — BidModal (Deal Room reuse)` |
| `isAuctionLead` predicate | Defined, no remaining call site | `DORMANT — Distribution-model predicates (Deal Room reuse)` |
| `isInstantLead` predicate | Defined, no remaining call site | Same |

Each has an `eslint-disable-next-line no-unused-vars` comment. The header comments explicitly point engineers to this document before deletion.

### Historical data (frozen)

- `lead.bids[]` arrays on all pre-Phase-A leads — frozen, never mutated
- `lead.winnerId`, `lead.finalPrice` on settled leads — frozen
- `Transaction` rows of type `'Lead Purchase'` from auction wins — untouched
- `PurchasedLead` rows from auction settlements — untouched
- Admin audit views over historical auction state — read directly from collections

---

## 8. Future Deal Room direction

Deal Room is a **separate mover-facing page** (`/dashboard/deal-room`, not yet built) that surfaces a different inventory pool with different sale mechanisms.

### Inventory sources

| Source | Mechanism | Authority |
|---|---|---|
| Aged unsold instant leads | Cron auto-move after N hours | Automated, configurable |
| Admin curation | Per-lead "Move to Deal Room" action | Manual |
| Bulk imports flagged at upload | CSV import with explicit Deal Room marker | Admin |
| Salvageable PENDING_MANUAL_REVIEW leads | Admin reviews and routes to Deal Room | Manual |

### Sale mechanisms within Deal Room

Each Deal Room lead's `distributionModel` selects the UI:

- `'instant'` → discounted instant-claim ("Bargain Bin")
- `'auction'` → re-opened bid window with fresh `auctionEndsAt`, using the existing settle cron + `BidModal` + `TimeLeftTag`
- `'pack'` *(new)* → belongs to a `LeadPack` document; claimed as a bundle, not individually

### Schema additions (when Deal Room work begins)

Add `inventoryType: 'live_feed' | 'deal_room' | 'archived'` (default `'live_feed'`) so main feed and Deal Room can query the same `Lead` collection with different filters. **Do not add this field until Deal Room work begins** — premature schema work without consumers.

### What gets reactivated

When Deal Room ships, the following becomes live again:
- `BidModal` and `TimeLeftTag` imports (from `LeadFeed.jsx` or extracted to shared component files)
- `isAuctionLead` / `isInstantLead` predicates as render-branch gates
- `bid_update` and `auction_settled` socket listeners (on the Deal Room page, not main feed)
- Outbid toast UI (Deal Room state)
- Anti-sniping extension visible to bidders

### What stays separate

- Main feed UI remains instant-only forever
- Real-time `NEW_LEAD_AVAILABLE` broadcast is for live-feed leads only (Deal Room population happens via cron/admin, not via real-time ingest)
- SMS Claim (when activated) is a live-feed channel, not a Deal Room channel

---

## 9. Rollback strategy

Each deploy is independently revertible. The interaction matrix:

| State | Behavior |
|---|---|
| Server filter live + flag ON | **Working state.** Main feed: instant only. |
| Server filter live + flag OFF | New leads stamped `'auction'` → filter excludes them → main feed empties. Until either (a) flag flipped back on or (b) filter reverted. |
| Server filter reverted + flag ON | Main feed: all distributable leads (instant + any new auction leads). Client cleanup means all render single-CTA. |
| Server filter reverted + flag OFF | Pre-Phase-D state for new leads (auction stamped, full main-feed visibility). Client still renders single-CTA — functional but visually inconsistent with the original dual-CTA. |

### Procedure to fully revert to pre-Phase-D

1. Flip `ENABLE_INSTANT_DISPATCH=false`
2. Revert server filter commit
3. Revert client cleanup commit
4. Revert Phase B server + client commits
5. Revert Phase A commit
6. Deploy

### Procedure to roll back the flag only (keep code)

1. Flip `ENABLE_INSTANT_DISPATCH=false`
2. Optionally revert server filter to avoid empty-feed (otherwise main feed empties as auction-stamped new leads accumulate)

### Side effects of any rollback

- Buy-now atomicity: untouched in any path
- Refund cascade: untouched in any path
- Sockets: `lead_sold` keeps working both directions
- PurchasedLead / Transaction: untouched
- Historical data: untouched

Each rollback layer is fully reversible without data loss.

---

## 10. Rollout sequence (Option β, current cutover)

The cutover from auction-first to instant-only is sequenced to minimize risk and avoid an empty-feed window.

1. **Phase D client cleanup deploy** — single Unlock CTA everywhere; auction leads still appear and remain claimable through the same `/buy-now` route (no behavior change while flag is OFF). *(Commit `4e409cf`.)*
2. **Production flag flip** — `ENABLE_INSTANT_DISPATCH=true`. New leads stamp `'instant'`. In-flight legacy auctions still settle via the cron.
3. **Observation window** (1–2 hours) — monitor instant lead ingest health, visibility, unlock success, PurchasedLead creation, balance debits, race-condition behavior, sockets, refunds, mover activity, time-to-claim, unsold-lead accumulation.
4. **Phase D server filter deploy** — add `distributionModel: 'instant'` to the `GET /api/leads` mover feed query in `server/routes/leads.js`. Old auction leads vanish from the main feed; only instant leads remain visible to movers.
5. **48-hour monitoring** — confirm:
   - Old auctions settle quietly in background
   - Cron health (settles in-flight ones, then idles at 0 leads)
   - No stuck `auctionStatus: 'settling'` leads
   - No socket anomalies
   - No visibility regressions in admin views

---

## 11. Intentionally dormant vs. actually deprecated

This section exists to prevent accidental deletion of "unused" code that is in fact reserved.

### Intentionally dormant (DO NOT REMOVE)

- All entries in §7 above
- Every `eslint-disable-next-line no-unused-vars` comment near auction-related symbols in `LeadFeed.jsx`
- The `distributionModel: { $ne: 'instant' }` guard in `settleAuctions.js` (belt-and-suspenders, will matter again if a bug ever writes `auctionEndsAt` to an instant lead)
- The 409 guard in the bid route (forward-compatible with Deal Room)
- The `auctionStatus` enum value `'pending'` (used for admin-imports awaiting promotion; not currently written by main ingest paths but still a valid state)

### Actually deprecated (gradually retiring)

- **`startingBidPrice` computation** in `pricingEngine.calculateAuctionPrice`: still produced at ingest but ignored on instant leads. Will be removed once no main-feed code reads it (currently no reader on instant path; auction path still uses it for opening bid display when Deal Room exists).
- **Legacy multiplier pricing engine** (`pricingEngine.calculateAuctionPrice`) for new leads: superseded by `pricingEngineSimple` when `ENABLE_PRICING_SIMPLE_LIVE=true`. Both kept wired for back-compat with pre-cutover leads. Eventual removal is a separate workstream.

### Pure dead code (safe to delete in future cleanup)

None as of this commit. If something later becomes truly unused (e.g., `Pricing V2 add-on` engine in `pricingEngineV2.js` that was shadow-only and never reached production), it can be removed in a dedicated cleanup PR — but each removal must verify no upstream consumer relies on it.

---

## 12. Operational invariants (always true)

These are the load-bearing properties that any future change must preserve:

1. **Buy-now atomicity** — the `findOneAndUpdate` flip + conditional debit + unique-PurchasedLead pattern is the single source of correctness for ownership transfer. Both instant claims and any future Deal Room claims must use this exact pattern.
2. **PurchasedLead unique index** `{ company: 1, lead: 1 }` — the final race-safe gate. Never relax.
3. **Refund cascade reads `PurchasedLead.refunded`** — the single source of truth for refund state. Never bypass.
4. **Transaction ledger** records every money movement (`'Lead Purchase'`, `'Lead Refund'`). Always created in the same atomic chain as the underlying state mutation.
5. **`auctionStatus` enum** is a state machine, not a classification — only its defined transitions are legal. Adding new states requires updating the cron, the bid route, the buy-now route, and the admin views in coordination.
6. **Per-lead `distributionModel` is sticky** once written. Reprice / mid-life flag flips never overwrite it.
7. **The settle cron is harmless when idle.** Keep it scheduled regardless of mover-facing UI changes; the moment Deal Room auctions go live, it re-engages without code changes.

---

## 13. When in doubt

- **About to delete auction code?** Re-read §7 and §11. If the symbol is listed there, it's reserved.
- **About to add a new distribution mechanism?** Add a value to the `distributionModel` enum, not a parallel flag. Schema evolution beats schema sprawl.
- **About to wire bidding back into the main feed?** Don't. That's Deal Room work — see §8.
- **About to refactor `bids.js`?** Coordinate with the Deal Room implementation plan. Surgical edits OK; restructuring is not.

Commit hashes referenced in this document:
- `63918ed` — Phase A schema stamping
- `78a1138` — Phase B server
- `a5cdd06` — Phase B client
- `4e409cf` — Phase D client cleanup
- `36d73ae` — Phase D server filter (main mover feed is instant-only)
- `2db8899` — Live Transfer UX removal
- `8614a7a` — Warm-transfer Phase 2A (/api/voice unmounted)

## Related architecture docs

- [phone-verification.md](./phone-verification.md) — Mover phone verification rollout (Twilio Verify). **Currently in HOLD pending upstream Twilio code 60238 resolution.** `User.phoneVerified` is the hard gate read by `broadcastLeadSMS` and (future) SMS Claim. The verification flow is implemented end-to-end (commits `e9d5d13`, `06aca2b`, `7d58d33`) but cannot be exercised until Twilio support clears the block. Verification is capability-gated (SMS alerts + SMS Claim only), NOT signup-gated.
