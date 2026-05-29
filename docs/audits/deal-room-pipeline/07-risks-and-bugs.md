# 07 — Risks, Bugs & Open Questions

All findings classified as **CONFIRMED BUG** (broken or unsafe behavior) vs
**DESIGN DECISION** (intentional choice, possibly worth revisiting) vs
**OBSERVABILITY GAP** (not broken, but operator visibility missing).

## R1 — Mover empty state indistinguishable from feature-off **(OBSERVABILITY GAP, MEDIUM)**

**Where:** [client/src/pages/dashboard/Deals.jsx#L53-57](../../../client/src/pages/dashboard/Deals.jsx#L53-L57)

**What:** When `ENABLE_DEAL_ROOM=false`, the backend returns 404. The client maps `res.status === 404 → setLeads([])` and renders the standard empty state ("No deals available right now / Check back soon"). Same UI as genuinely-empty inventory.

**Risk:** If the flag is misconfigured in prod, every mover sees a normal-looking but permanently empty Deal Room. The sidebar nav link stays. No signal to mover or operator that the feature is unavailable. Compounded by R4 — there's no log on the read path either.

**Severity:** MEDIUM for pilot — the failure mode is silent and there's no observability to detect it.

**Status:** **Open. Pilot-blocking if `ENABLE_DEAL_ROOM` gets flipped to true.**

**Fix:** F1 in [08-priority-fix-plan.md](08-priority-fix-plan.md).

---

## R2 — Drifted query filter: `/deals` missing `buyers.company !== me` **(DEFENSE-IN-DEPTH GAP, LOW-MED)**

**Where:** [server/routes/leads.js#L105-110](../../../server/routes/leads.js#L105-L110) vs [server/routes/leads.js#L184](../../../server/routes/leads.js#L184)

**What:** The main feed has `'buyers.company': { $ne: req.user.id }` as a belt-and-suspenders self-exclusion guard. The Deal Room read endpoint does NOT carry this clause. The same goes for the `sourceCompany` widget-scoping clause.

**Risk today:** Protected by upstream gate — admin can't `move_to_deal_room` a lead with non-empty `buyers` ([adminInventory.js#L153-157](../../../server/routes/adminInventory.js#L153-L157)). So a mid-purchase lead can never enter Deal Room in the first place.

**Risk tomorrow:** If the upstream admin gate is ever loosened (e.g. operator allows partial-buyer leads into Deal Room), the read endpoint will not self-exclude the current mover — they'd see their own already-purchased lead reappear on Deal Room.

**Status:** **Open. Not pilot-blocking with current admin gate. Defense-in-depth gap.**

**Fix:** F2 in [08-priority-fix-plan.md](08-priority-fix-plan.md).

---

## R3 — `Transaction.description` does not encode channel **(OBSERVABILITY GAP, LOW)**

**Where:** [server/routes/bids.js#L178](../../../server/routes/bids.js#L178) — `description: \`Buy-now purchase: lead ${lead._id}\``

**What:** Every buy-now writes the same `Transaction.description` template regardless of whether the source was the marketplace feed or the Deal Room. No `surface` field, no metadata distinguishing channel.

**Impact:** Finance cannot answer "what % of revenue came from Deal Room this week?" without joining `Transaction.lead → Lead.inventoryChannel`, AND that join is lossy because `Lead.inventoryChannel` is mutable post-sale.

**Fix:** Either inline-snapshot `inventoryChannel` into the `Transaction.description` string, or add a `Transaction.metadata.surface` field. Either is a small, isolated PR — but out of pilot scope. F4 in [08-priority-fix-plan.md](08-priority-fix-plan.md).

**Status:** **Open. Not pilot-blocking.**

---

## R4 — Zero read-side observability **(OBSERVABILITY GAP, LOW)**

**Where:** [server/routes/leads.js#L95-133](../../../server/routes/leads.js#L95-L133), [server/routes/adminInventory.js](../../../server/routes/adminInventory.js)

**What:** No happy-path log on `/api/leads/deals`. No "[Deals] served N leads to mover X" line. No log on 404 (flag off). No admin Deal Room inventory summary endpoint or page (must filter `AdminLeads.jsx` by `channelFilter='deal_room'` and count rows manually).

**Impact:** Operator cannot tell from logs:
- Whether Deal Room is being hit at all
- How many leads are flowing on the happy path
- Whether 404s are firing because of flag misconfiguration

**Fix:** A two-line log on the happy path; an admin endpoint `GET /api/admin/inventory/deal-room/summary` returning `{count, oldest, cheapest, mostRecentMovedIn}`. F3 in [08-priority-fix-plan.md](08-priority-fix-plan.md).

**Status:** **Open. Not pilot-blocking but worth fixing before flag flip.**

---

## R5 — `restore_to_main` orchestrator wiring **(DESIGN DECISION via cron, with caveat)**

**Where:** [adminInventory.js#L242-252](../../../server/routes/adminInventory.js#L242-L252) — no direct `dispatchApprovedLead` call.

**Original finding:** I initially flagged this as "silent state — restore_to_main does not push." Then I re-checked against PR-6 cron logic.

**Corrected analysis:** PR-6 [`jobs/reactivateLeads.js`](../../../server/jobs/reactivateLeads.js) runs every 5 minutes and picks up any lead matching:

- `auctionStatus ∉ {active, sold, buy_now}`
- `status ∈ {Available, READY_FOR_DISTRIBUTION}`
- `moveDate ≥ now`
- empty `buyers`

A lead post-`restore_to_main`:

- `inventoryChannel = 'main'` ✅ (not part of the cron filter but doesn't matter since main feed is the dispatch destination)
- `auctionStatus` is whatever it was when moved into Deal Room (`'expired'` if originally `'active'`, otherwise unchanged) — typically `'expired'` ✅
- `status` is `'Available'`/`'READY_FOR_DISTRIBUTION'` ✅ (admin move requires this)
- `moveDate ≥ now` ✅ (admin move requires this; also gate at restore time would need this)
- empty `buyers` ✅ (admin move requires this)

**Therefore the reactivation cron picks it up within 5 minutes and calls `dispatchApprovedLead(leadId, { source: 'cron.reactivate' })`.**

**HOWEVER** — the broadcasters' `notifiedAt` CAS short-circuits if `notifiedAt` is set (which it usually is for any lead that previously broadcast). So:

- A NEVER-broadcast lead (`notifiedAt: null`) restored to main → cron picks up → dispatch fires SMS/email/socket ✅
- A PREVIOUSLY-broadcast lead (`notifiedAt: <date>`) restored to main → cron picks up → dispatch attempts but per-channel CAS short-circuits → **NO actual SMS/email re-sent** ⚠️

**This is the real silent-state path for Deal Room.** A lead that:
1. Was previously broadcast (got SMS, got email — `notifiedAt` set)
2. Failed to sell
3. Got moved to Deal Room with a discount
4. Failed to sell from Deal Room
5. Got `restore_to_main`'d

…ends up back on the main feed with a fresh price but no broadcast push. Movers learn about it via passive feed-poll only.

**Severity:** LOW-MEDIUM. Movers do see the lead in their feed sort (re-bubbled by `updatedAt`), and the lead is genuinely "back on sale" — it's not invisible. But the original broadcast contract said "fresh inventory = SMS + email + socket push" and a restored Deal Room lead doesn't get that fresh-push treatment.

**Status:** **Open by design.** Documented in [HIGH-CONFIDENCE-FIX-PLAN.md#L134](../launch-readiness/HIGH-CONFIDENCE-FIX-PLAN.md#L134) as out of pilot scope. Operator decision needed: do you want a `restore_to_main` to forcibly clear `notifiedAt` and trigger a fresh broadcast, or is the passive re-bubble enough?

---

## R6 — Auction ghost fields after Deal Room move **(COSMETIC, LOW)**

**Where:** [adminInventory.js#L235-237](../../../server/routes/adminInventory.js#L235-L237) — only `auctionStatus` flipped.

**What:** `move_to_deal_room` sets `auctionStatus='expired'` if was `'active'`, but `auctionEndsAt`, `bids[]`, `currentBid` are NOT cleared. They linger on the doc as stale ghost data.

**Impact:** Cosmetic. The Deal Room read endpoint doesn't render these fields. No downstream code branches on them in the Deal Room flow. But mover-side admin queries that show "this lead has bids" might show stale numbers.

**Status:** **Open, low priority, cosmetic.**

**Fix:** Not recommended pre-pilot. If addressed, would be a one-line `$unset` on the move action.

---

## R7 — Refunded Deal Room leads don't relist **(OPERATOR-DECISION ITEM)**

**Where:** All refund handlers — verified at [admin.js#L409-494](../../../server/routes/admin.js#L409-L494), [billingWebhook.js#L67-130](../../../server/routes/billingWebhook.js#L67-L130), [disputes.js#L122-134](../../../server/routes/disputes.js#L122-L134).

**What:** None of the refund paths touch `inventoryChannel`, `status`, or `auctionStatus`. A refunded Deal Room lead stays as:

- `inventoryChannel: 'deal_room'`
- `status: 'Purchased'`
- `auctionStatus: 'sold'`

Effectively dead inventory. Doesn't reappear on Deal Room (fails `status` filter), doesn't reappear on main feed (same reason).

**This is the same behavior as a refunded marketplace lead** — by policy ([admin.js#L399-404](../../../server/routes/admin.js#L399-L404)), buyers stay in `lead.buyers` for My Leads rendering.

**Status:** **Open. Operator-decision item.**

Two policy options:
1. **Accept current behavior** — refunded leads sit as dead inventory; operator manually decides per case via `archive` action.
2. **Auto-archive** — refund handlers `$set inventoryChannel='archived'` if `inventoryChannel === 'deal_room'` AND the refund is full.

Not pilot-blocking either way.

---

## R8 — PR-4 broadcast manifest unaware of channel changes **(MINOR)**

**Where:** PR #60 schema fields `lastBroadcastAttemptAt` / `lastBroadcastSuppressReason` / `lastBroadcastMatchedCount` on `Lead`.

**What:** Deal Room mutations don't touch these fields. The `/distribution-diagnose` endpoint will show whatever was written by the last real dispatch attempt — even after a `move_to_deal_room` that radically changes the lead's surface.

**Impact:** Acceptable. The manifest contract is "what we observed LAST attempted dispatch" — a Deal Room move isn't a dispatch attempt, so it shouldn't write to the manifest. A future operator reading the diagnose endpoint on a Deal-Room-resident lead will correctly see the manifest from when the lead was last on the main feed.

**Status:** **Acceptable, no action.**

---

## NOT-FOUND items — reassurances

| Risk type | Result |
|---|---|
| Double-purchase | **No vector.** Same PurchasedLead `{company, lead}` unique mutex as marketplace. |
| Price tamper | **No vector.** Client sends no body to `/buy-now`. Server reads `lead.buyNowPrice` after CAS win. |
| Status/tier conflict | **None.** Same lifecycle filter, same Phase 3 quality filter. |
| Stale role assumption | **None.** Mover read uses `verifiedGate + auth`, no `role: 'customer'` check. |
| Lead visible in both feeds | **Impossible.** `inventoryChannel: $nin` vs `: $eq` are mutually exclusive (behaviorally tested at [dealRoom.test.js#L143-214](../../../server/__tests__/dealRoom.test.js#L143-L214)). |
| Bypassed dispatch orchestrator at forward path | **N/A by design.** Deal Room is browse-only; orchestrator absence is intentional. |
| Missing Transaction rows | **None.** Every Deal Room purchase writes a `'Lead Purchase'` row via the canonical handler. |
| Wrong empty state | **YES — R1.** Same UI for "feature off" and "real zero". |
| Dead buttons | **None observed.** Every UI control in `Deals.jsx` and the admin bulk modal has a wired handler. |
| Fake UI | **One case — R1 mover empty state.** No other fake-UI surface. |
| Silent inventory at admin → Deal Room | **None.** Move requires admin click + price + reason; full audit row written. |
| Silent inventory at Deal Room → mover read | **None for visible state.** Read endpoint is straightforward. |
| Silent re-broadcast at Deal Room → main | **YES — R5 via notifiedAt CAS.** Documented above. |

## Summary table

| ID | Severity | Category | Pilot-blocking? |
|---|---|---|---|
| R1 | MEDIUM | Observability gap (fake empty) | **Yes if `ENABLE_DEAL_ROOM=true`** |
| R2 | LOW-MED | Defense-in-depth gap | No |
| R3 | LOW | Observability gap (finance) | No |
| R4 | LOW | Observability gap (operator) | No |
| R5 | LOW-MED | Design decision via cron + notifiedAt CAS | No (documented out of scope) |
| R6 | LOW | Cosmetic | No |
| R7 | LOW | Operator-decision item | No |
| R8 | INFO | Acceptable | No |
