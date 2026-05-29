# 06 — Source-of-Truth Map

For every field the Deal Room pipeline touches, this table lists:
the writer(s), the reader(s), whether it surfaces in any UI, and
which writer is authoritative.

## Field map

| Field | Written by | Read by | UI? | Source of truth |
|---|---|---|---|---|
| `Lead.inventoryChannel` | `adminInventory.js` (all 3 actions) [L233, L241, L247](../../../server/routes/adminInventory.js); `Lead` schema default `'main'` [L300-305](../../../server/models/Lead.js) | `GET /api/leads` ($nin), `GET /api/leads/deals` ($eq), `AdminLeads.jsx` filter dropdown, settle cron | Admin filter UI; not shown on mover cards | admin write path (`adminInventory.js`) |
| `Lead.originalPrice` | `adminInventory.js#L210-212` (snapshot once on `move_to_deal_room`); never cleared | `GET /api/leads/deals` discount calc [L119-126](../../../server/routes/leads.js); `Deals.jsx` line-through display; `adminInventory.js#L246-249` (`restore_to_main`) | line-through price on Deal Room cards | `adminInventory.js` move handler |
| `Lead.buyNowPrice` | `adminInventory.js` (move sets discounted; restore reverts to `originalPrice`); seed leads / scoring pipeline write initial value | `/buy-now` handler reads after CAS [bids.js#L120](../../../server/routes/bids.js); both feeds render | yes — primary price on every card | admin write path for Deal Room; pricing pipeline for fresh leads |
| `Lead.auctionStatus` | `adminInventory.js#L235-237` (move sets `'expired'` if was `'active'`); `bids.js` (`'buy_now'` → `'sold'`); `jobs/settleAuctions.js`; `jobs/reactivateLeads.js` | mover feed (filtered by lifecycle); `/buy-now` CAS filter | not shown directly | mixed — admin write, buy-now, settle cron, reactivate cron |
| `Lead.auctionEndsAt` | `jobs/reactivateLeads.js`; legacy seed code | settle cron; `jobs/cleanupExpiredLeads.js` | not shown | reactivate cron (canonical); **GHOST after move_to_deal_room** — never updated, never used by Deal Room |
| `Lead.status` | V5 ingest, scoring pipeline, `verifyLeadPhone`, admin approval (`admin.js`), `bids.js` ('Purchased'); not touched by Deal Room actions | both feeds (lifecycle gate); My Leads | not shown directly | upstream ingestion / approval pipeline |
| `Lead.distributionDecision` | V5 scoring pipeline; admin approval (`admin.js`) | `moverVisibilityFilter()` (both feeds); diagnose endpoint; `dealRoomMoveBlockReason` gate | not shown directly | scoring pipeline / admin approve route |
| `Lead.distributionDecisionAt/By/Reason` | same writers as `distributionDecision` | sort key on main feed; `distribution-diagnose` endpoint | admin sees in diagnose response | scoring / admin approve |
| `Lead.notifiedAt` | `broadcastLeadSMS` / `broadcastLeadEmail` (atomic CAS); never touched by Deal Room actions | dedup guard in orchestrator + broadcasters | not shown | broadcaster CAS (single-writer) |
| `Lead.claimWindow` | `openClaimWindow` (SMS Claim path); `closeStaleClaimWindows` cron; routes/twilio.js inbound CLAIM branch | inbound webhook (find by token); SMS Claim render | not shown | SMS Claim pipeline (not touched by Deal Room) |
| `Lead.buyers` | `bids.js` (`buyers.push` on buy-now); legacy claim flow | mover feed self-exclusion (main feed only); My Leads | implicit (lead disappears from feeds after purchase) | buy-now handler |
| `Lead.winnerId` | `bids.js` on buy-now | downstream reporting | not shown | buy-now handler |
| `Lead.finalPrice` | `bids.js` on buy-now | downstream reporting | not shown | buy-now handler |
| `Lead.lastBroadcastAttemptAt` (PR-4) | `dispatchApprovedLead` orchestrator | `GET /api/admin/leads/:id/distribution-diagnose` | admin diagnose page | orchestrator |
| `Lead.lastBroadcastSuppressReason` (PR-4) | orchestrator + `broadcastLeadSMS` | diagnose | admin diagnose page | orchestrator |
| `Lead.lastBroadcastMatchedCount` (PR-4) | `broadcastLeadSMS` | diagnose | admin diagnose page | broadcaster |
| `Lead.distributionModel` | V5 ingest (`'instant'` default); admin set on auction-stamped legacy leads; **NOT touched by `restore_to_main`** | feed-level visibility under Phase D | not shown | upstream ingest |
| `PurchasedLead.{company, lead, pricePaid, refunded}` | `bids.js` on buy-now (unique mutex); `admin.js` refund (sets `refunded:true`); disputes (sets `refunded:true`) | `/api/purchases` (My Leads); refund handlers | My Leads page | buy-now handler creates; refund handlers update |
| `Transaction.{type, amount, description, lead, purchasedLead, user}` | `bids.js` on buy-now (`type:'Lead Purchase'`); refund handlers (`'Lead Refund'`, `'Stripe Refund'`, etc.); admin balance adjust (`'Admin Adjustment'` — PR #58) | balance page; finance ledger; admin transaction list | yes — Transactions page | each writer is authoritative for its `type` |
| `User.balance` | Stripe webhook `payment_intent.succeeded`; `bids.js` debit; refunds; admin balance adjust | gates buy-now; displayed everywhere | yes — balance pill | mixed writers, all coordinated via `$inc` atomic ops |
| `AdminAudit` row (`logAdminAction`) | `adminInventory.js` per processed lead; `admin.js` approve/reject/refund | future admin "actions log" UI (not built yet) | not currently surfaced | each admin route that calls `logAdminAction` |

## Special cases

### `originalPrice` semantics

- Captured ONCE: only when `lead.originalPrice == null` at the moment of `move_to_deal_room`.
- Never cleared by `restore_to_main` (intentional — re-moving a previously discounted lead preserves the true pre-deal anchor).
- Lock-in test exists at [server/__tests__/dealRoom.test.js](../../../server/__tests__/dealRoom.test.js) (snapshot-once invariant).
- Implication: if a lead has been through Deal Room, its `originalPrice` carries a permanent historical anchor regardless of current channel.

### `auctionStatus = 'expired'` on Deal Room move

- Only flipped from `'active'`; other states preserved.
- `restore_to_main` does NOT flip back to `'active'`.
- The reactivation cron `jobs/reactivateLeads.js` (PR-6) flips `auctionStatus → 'active'` for any lead meeting its filter (`$nin: ['active','sold','buy_now']`, `status IN {Available, READY_FOR_DISTRIBUTION}`, future `moveDate`, no buyers).
- **Important interaction:** if a Deal Room lead has its `inventoryChannel` set to `'main'` via `restore_to_main`, the reactivation cron will pick it up within 5 minutes and:
  - Flip `auctionStatus` to `'active'`
  - Set `auctionEndsAt = now + 24h`
  - Call `dispatchApprovedLead` (which fires SMS + email + socket)
- So `restore_to_main` IS effectively re-broadcasting the lead, just with up to a 5-minute delay via the cron rather than inline.
- **This is a correction to my initial finding in R5 — `restore_to_main` is NOT silent; the reactivation cron picks it up.** Verifying this is the missing observability piece — see [07-risks-and-bugs.md](07-risks-and-bugs.md) R5 update.

### `notifiedAt` lifecycle interaction

- `notifiedAt` is set the first time SMS/email broadcasts fire for a lead.
- Subsequent broadcasts short-circuit unless `force: true` is passed to the orchestrator.
- **Deal Room move/restore does NOT touch `notifiedAt`.** This means:
  - When `restore_to_main` re-promotes a lead and the reactivation cron picks it up and calls `dispatchApprovedLead`, the broadcaster's `notifiedAt` CAS short-circuits → **NO actual SMS/email re-sent** (unless `notifiedAt` was somehow cleared between the original send and now).
  - **This IS the silent-state path** — leads bounced through Deal Room and back to main get the cron's attempt to dispatch, but the per-channel `notifiedAt` guard suppresses the actual send.
  - Movers learn about restored leads via the mover feed sort order (re-bubbled by `updatedAt` change), not push.

### `inventoryChannel` after purchase

- Buy-now does NOT touch `inventoryChannel`. A Deal Room lead bought stays `'deal_room'` in the historical record.
- Reporting query "sales by surface" must read `Lead.inventoryChannel` snapshot at purchase time — which is fine TODAY because nothing else moves a sold lead's `inventoryChannel` (admin move gate refuses `buyers.length > 0`).
- If admin later loosens that gate, the snapshot becomes lossy.

## Authoritative writer per field — quick reference

| Field | Single source of truth | Why |
|---|---|---|
| `inventoryChannel` | `adminInventory.js` | only writer (3 actions) |
| `originalPrice` | `adminInventory.js` move handler | only writer (snapshot once, never cleared) |
| `buyNowPrice` | mixed — admin Deal Room write OR upstream pricing pipeline | reset by `restore_to_main` to `originalPrice` |
| `status` | upstream ingest / approval / buy-now | NOT touched by Deal Room |
| `distributionDecision` | scoring pipeline / admin approve | NOT touched by Deal Room |
| `notifiedAt` | broadcaster CAS | NOT touched by Deal Room |
| `buyers` / `winnerId` / `finalPrice` | `bids.js` buy-now | NOT touched by Deal Room |
| `PurchasedLead.*` | `bids.js` buy-now | one writer at creation; refund handlers update `refunded` only |
| `Transaction.*` | each writer authoritative for its `type` | append-only |
| `User.balance` | mixed atomic `$inc` | coordinated via Mongo atomic ops |
