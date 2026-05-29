# Deal Room Pipeline — Audit Overview

**Date:** 2026-05-29
**Scope:** End-to-end audit of the Deal Room feature from admin entry to mover purchase.
**Constraint:** No code changes. Research only.
**Verdict:** **Deal Room is safe for pilot at the financial / atomic-sequence layer. The only meaningful gaps are observability and one symmetric-filter drift. Keep `ENABLE_DEAL_ROOM=false` until the four lowest-cost fixes in `08-priority-fix-plan.md` land.**

---

## What Deal Room is

A separate mover-facing surface (`/dashboard/deals`) where admins can place
slow-moving / discounted leads at a reduced `buyNowPrice`. The lead's
`inventoryChannel` field flips from `'main'` to `'deal_room'`; the main
mover feed (`GET /api/leads`) explicitly excludes it (`inventoryChannel:
{ $nin: ['deal_room', 'archived'] }`); the Deal Room read endpoint
(`GET /api/leads/deals`) explicitly requires it.

The feature is gated by the env flag `ENABLE_DEAL_ROOM` (read in
[server/utils/dealRoomFeature.js](../../../server/utils/dealRoomFeature.js)).
When off:
- Admin bulk endpoint returns `503`.
- Mover read endpoint returns `404`.
- The mover frontend treats `404` as "empty Deal Room" with no banner —
  see [`07-risks-and-bugs.md`](07-risks-and-bugs.md) item R1.

## Routing summary (one-line)

```
Admin AdminLeads.jsx → POST /api/admin/inventory/bulk (action: move_to_deal_room)
  → adminInventory.js mutates Lead.{inventoryChannel,buyNowPrice,originalPrice,auctionStatus}
  → NO orchestrator call (intentional — Deal Room is browse-only)
  → audit row via logAdminAction

Mover Deals.jsx → GET /api/leads/deals
  → leads.js #L95-133: filter {inventoryChannel:'deal_room', status:..., moveDate:..., ...moverVisibilityFilter()}
  → annotated with discountPercent, projected for PII
  → returned as array

Mover Deals.jsx UnlockConfirmModal → POST /api/bids/:leadId/buy-now
  → bids.js #L113-186: BYTE-FOR-BYTE same canonical atomic sequence as marketplace buy-now
  → finalPrice = lead.buyNowPrice (server-trusted; client sends no body)
  → Transaction({ type:'Lead Purchase', description:'Buy-now purchase: lead <id>' })
  → PurchasedLead({ company, lead, pricePaid })
  → broadcastLeadSold (socket emit)
```

## Index of audit documents

| File | Topic |
|---|---|
| [`00-overview.md`](00-overview.md) | This file — high-level summary + verdict |
| [`01-admin-entry-and-routing.md`](01-admin-entry-and-routing.md) | Admin UI → backend route trace |
| [`02-backend-state-mutations.md`](02-backend-state-mutations.md) | Every field every action writes |
| [`03-visibility-and-query-filters.md`](03-visibility-and-query-filters.md) | Why Deal Room leads are visible/hidden |
| [`04-mover-deal-room-page.md`](04-mover-deal-room-page.md) | Frontend page + read endpoint |
| [`05-purchase-and-financial-flow.md`](05-purchase-and-financial-flow.md) | Atomic sequence comparison vs marketplace |
| [`06-source-of-truth-map.md`](06-source-of-truth-map.md) | Field-by-field writer / reader map |
| [`07-risks-and-bugs.md`](07-risks-and-bugs.md) | Confirmed bugs vs design decisions |
| [`08-priority-fix-plan.md`](08-priority-fix-plan.md) | Highest-confidence pre-pilot fixes |

## Top-level findings

| ID | Severity | Item | Status |
|---|---|---|---|
| R1 | MEDIUM | Mover empty state indistinguishable from feature-off — silent fake-UI risk if `ENABLE_DEAL_ROOM` ever wrong in prod | **Open** |
| R2 | LOW-MED | Drifted query filter: `/deals` does NOT include `buyers.company !== me` self-exclusion that main feed has | **Open** (protective gate exists upstream — defense-in-depth gap) |
| R3 | LOW | `Transaction.description` does not encode `inventoryChannel` — finance cannot split Deal Room revenue from marketplace revenue without lossy join | **Open** |
| R4 | LOW | Zero read-side observability: no log line on `/deals` happy path, no admin Deal Room inventory dashboard | **Open** |
| R5 | LOW-MED | `restore_to_main` does NOT call `dispatchApprovedLead` — leads bounced back to marketplace become feed-eligible by passive polling only (no SMS / email / socket push) | **Open by design; not pilot-blocking with flag off** |
| R6 | LOW | `auctionStatus` flipped to `'expired'` on move, but `auctionEndsAt` / `bids` / `currentBid` linger as ghosts | **Cosmetic / observability concern** |
| R7 | LOW | Refunded Deal Room leads stay `inventoryChannel='deal_room'` forever — no relist, no archive automation | **Operator-decision item** |
| R8 | INFO | PR-4 broadcast manifest (`lastBroadcast*`) untouched by Deal Room mutations — diagnose endpoint can show stale reasons after channel change | **Acceptable** (manifest is "last attempted dispatch") |

**No HIGH-severity issues. No financial-atomicity issues. No silent inventory at the FORWARD path** (admin → Deal Room → mover read is correctly gated by quality + lifecycle + time + surface).

## Verdict — safe for pilot?

**Yes**, with conditions.

1. **Financial path is bullet-proof.** Deal Room purchase reuses
   `POST /api/bids/:leadId/buy-now` line-for-line — byte-identical CAS,
   debit, PurchasedLead mutex, Transaction, socket emit. No shadow money
   path. No price tamper vector (client sends no body; server reads
   `lead.buyNowPrice` after CAS win).
2. **Visibility is correct at the four-axis level.** Phase 3
   `distributionDecision` quality gate is reused; held leads do not leak
   through. Main feed and Deal Room are mutually exclusive at the
   surface clause.
3. **Empty state is the only meaningful pilot risk.** A `404` from
   `ENABLE_DEAL_ROOM=false` is silently mapped to an empty Deal Room
   with no banner. If the flag is misconfigured, every mover sees a
   normal-looking but permanently empty page. **Fix this before flag
   flip** — see [`08-priority-fix-plan.md`](08-priority-fix-plan.md) F1.
4. **`ENABLE_DEAL_ROOM` should stay `false` in production** until F1–F4
   from the fix plan land. The feature itself works; the gaps are
   pre-pilot polish.

## Important "what we did NOT find" reassurances

- **No double-purchase risk.** The same PurchasedLead `{company, lead}` unique
  mutex protects Deal Room purchases as marketplace ones — there is no
  second write path.
- **No dispatch orchestrator bypass at the forward path.** Movers reach
  Deal Room leads through a normal `GET` query that respects all four
  visibility axes. The orchestrator is intentionally NOT invoked because
  Deal Room is browse-only / pull-based — that's correct.
- **No stale role assumptions.** The mover read endpoint uses
  `verifiedGate + auth` (parity with the main feed); no `role: 'customer'`
  vs `role: 'mover'` filter exists on the Deal Room path.
- **No price mismatch / tamper.** Server reads `lead.buyNowPrice` after
  CAS win. Client sends no body to `/buy-now`. `discountPercent` is
  derived at READ time only.
- **No status/tier conflict.** Lifecycle filter (`status IN
  ['Available', 'READY_FOR_DISTRIBUTION']`) is identical to main feed;
  quality filter (`distributionDecision IN ['system_approved',
  'admin_approved']`) is identical via the same helper.
