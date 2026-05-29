# 02 — Visibility Matrix & Conflict Inventory

The reference compendium is in [`01-readers-writers-crons.md`](01-readers-writers-crons.md). This file is the **operator-facing answer**.

## §A — The complete visibility matrix

Each row is a `(status, distributionDecision, inventoryChannel, buyers state)` combination. Columns are the four mover-facing surfaces. ✓ = visible, ✗ = hidden, **·** = irrelevant (state cannot occur).

**Buyer states:** `empty`, `mine` (current mover purchased), `other` (different mover purchased).

| # | status | distributionDecision | inventoryChannel | buyers | Main feed | Deal Room | My Leads | Widget analytics |
|---|---|---|---|---|---|---|---|---|
| 1 | Pending Verification | system_pending | main | empty | ✗ | ✗ | ✗ | ✗ |
| 2 | PENDING_MANUAL_REVIEW | system_held | main | empty | ✗ | ✗ | ✗ | ✗ |
| 3 | PENDING_MANUAL_REVIEW | system_rejected | main | empty | ✗ | ✗ | ✗ | ✗ |
| 4 | READY_FOR_DISTRIBUTION | system_approved | main | empty | **✓** | ✗ | ✗ | ✓ if widget |
| 5 | READY_FOR_DISTRIBUTION | admin_approved | main | empty | **✓** | ✗ | ✗ | ✓ if widget |
| 6 | READY_FOR_DISTRIBUTION | system_held | main | empty | ✗ | ✗ | ✗ | ✗ |
| 7 | READY_FOR_DISTRIBUTION | admin_rejected | main | empty | ✗ | ✗ | ✗ | ✗ |
| 8 | READY_FOR_DISTRIBUTION | system_approved | **deal_room** | empty | ✗ | **✓** | ✗ | ✓ if widget |
| 9 | READY_FOR_DISTRIBUTION | admin_approved | deal_room | empty | ✗ | ✓ | ✗ | ✓ if widget |
| 10 | READY_FOR_DISTRIBUTION | system_held | deal_room | empty | · | ✗ | ✗ | ✗ |
| 11 | READY_FOR_DISTRIBUTION | * | **archived** | empty | ✗ | ✗ | ✗ | ✗ |
| 12 | READY_FOR_DISTRIBUTION | * | main | **mine** | ✗ ¹ | · | (no PurchasedLead row) | ✓ if widget |
| 13 | Purchased | * | main | mine | ✗ ² | ✗ | **✓** | ✓ if widget |
| 14 | Purchased | * | deal_room | mine | ✗ | ✗ ³ | ✓ | ✓ if widget |
| 15 | Purchased | * | * | other | ✗ ⁴ | ✗ | ✗ | ✓ if widget |
| 16 | Expired | * | * | empty | ✗ | ✗ | ✗ | ✓ if widget |
| 17 | REJECTED_FAKE | admin_rejected | * | empty | ✗ | ✗ | ✗ | ✗ |
| 18 | Available ⁵ | * | main | empty | ✓ ⁶ | ✗ | ✗ | ✓ if widget |
| 19 | Available | * | main | mine | **✓** ⁷ ⁸ | · | ✓ | ✓ if widget |

**Footnotes — clarifying the subtle states:**

1. **#12** — In the main feed query, `'buyers.company': { $ne: req.user.id }` self-excludes. The mover wouldn't see this row.
2. **#13** — `status='Purchased'` fails the main feed's `status: $in [Available, READY_FOR_DISTRIBUTION]` clause.
3. **#14** — Same as #13. Deal Room also requires `status` in the live set.
4. **#15** — Other mover's purchased lead: same `status='Purchased'` exclusion.
5. **#18 — `Available` status.** Schema default. V5/V6 ingest never produces this. Legacy / admin direct write only. Mover feed treats `Available` and `READY_FOR_DISTRIBUTION` as equivalent (same `$in` clause).
6. **#18** — Visible if it carries `distributionDecision: system_approved` or `admin_approved`. Legacy seed leads may not have a decision at all, in which case `moverVisibilityFilter()` (`$in: ['system_approved','admin_approved']`) excludes them.
7. **#19** — `status='Available' + buyers=[mine]` is the **C2 stranded state**. The voice refund at routes/voice.js#L259-L262 produces this: it sets `status='Available'` but leaves `auctionStatus='sold'`. The mover-feed query admits the status, BUT…
8. **#19 again** — the **buyers self-exclusion** (`'buyers.company': $ne req.user.id`) at routes/leads.js#L184 hides this from the mover who refunded. Other movers DO see the lead (status passes, but `auctionStatus='sold'` means a buy-now CAS will fail — they see the row but can't unlock it). **This is the stranded state in C2.**

## §B — "Can a lead disappear unexpectedly?"

**No, with one explicitly-wired path.**

The `GET /api/leads` read handler runs an `updateMany` side-effect on every request:

> `Lead.updateMany({status:'READY_FOR_DISTRIBUTION', moveDate:{$lt:now}, buyers empty}, {$set:{status:'Expired', auctionStatus:'expired'}})`

A lead whose `moveDate` passes between two mover-feed loads will silently transition `READY_FOR_DISTRIBUTION → Expired` and disappear from the feed. This is documented intent — the lead can't be fulfilled anyway — and the `cleanupExpiredLeads` cron catches it daily as a safety net. The PR-6 cron (reactivateLeads) does NOT pick up Expired leads (its filter requires `status ∈ {Available, READY_FOR_DISTRIBUTION}`).

**No other unexpected-disappearance vectors found.** The Phase 3 `moverVisibilityFilter()` is consulted by every mover-facing reader. Admin tier-override CLEAR does call `dispatchApprovedLead` (PR #56). Admin reject is intentional disappearance.

## §C — "Can a lead become stranded?"

**Yes, two classes:**

### C2 — Refunded warm-transfer leads at `(status='Available', auctionStatus='sold')`

| State component | After refund |
|---|---|
| `status` | `'Available'` ([routes/voice.js#L259-L262](../../../server/routes/voice.js#L259)) |
| `auctionStatus` | `'sold'` (W-S16 left it; W-S19 didn't reset) |
| `buyers` | refunded mover still listed by policy ([routes/admin.js#L399-L404](../../../server/routes/admin.js#L399)) |
| `winnerId` | the refunded mover |
| `finalPrice` | their last paid price |

**Visibility:**
- Refunded mover: hidden by `'buyers.company': $ne req.user.id`.
- Other movers: row appears in feed (status passes); buy-now CAS fails on `auctionStatus !== 'active'`. Effectively dead-inventory shown.
- Admin: visible (no filter on admin branch).
- Reactivate cron: filter excludes `auctionStatus='sold'` → never reactivated.

**Severity:** MEDIUM. Live Transfer is documented as retired (mover-coverage memory notes). Practical occurrence rate is near-zero today, but the dead-state remains a latent landmine.

**Operator workaround:** admin manual Mongo update to either `status='Purchased' + auctionStatus='sold'` (recover the purchased state) or `status='Available' + auctionStatus='active' + clear buyers + clear winnerId/finalPrice` (un-purchase). No clean admin UI path.

### C7 — `REJECTED_FAKE` leads can't be un-rejected via any admin route

`POST /api/admin/leads/:id/approve` excludes `REJECTED_FAKE` from `UPGRADABLE_STATUSES`. There is no `POST /api/admin/leads/:id/unreject`. The `DELETE tier-override` route writes `deriveSystemDecision()` to `distributionDecision` but does NOT touch `status` — so an admin who clicked `/reject` by accident cannot recover the lead through admin UI.

**Severity:** LOW. Genuine admin mistakes are rare and recoverable by direct DB edit OR by deleting + re-ingesting.

## §D — Frontend/backend filter mismatches

### D1 — Matched tab is client-side only

`LeadFeed.jsx` filters `_matchesPreferences === true` on the client. Server returns all `moverVisibilityFilter`-passing leads regardless of mover coverage. Three implications:

1. **A mover who's never set coverage sees every lead in their feed** (the strict `=== true` check just hides the matched filter UI; no leads are excluded).
2. **Socket-pushed leads (`NEW_LEAD_AVAILABLE`)** arrive WITHOUT `_matchesPreferences` set ([LeadFeed.jsx#L308-L315](../../../client/src/pages/dashboard/LeadFeed.jsx#L308)). They are NOT renderable in the matched tab until next manual refetch.
3. There IS a defensive leak guard at [LeadFeed.jsx#L514-L525](../../../client/src/pages/dashboard/LeadFeed.jsx#L514) — `console.error` if a non-match slips into the matched render.

This is documented design (per the mover-dashboard cleanup memory). Not a bug; worth knowing.

### D2 — AdminLeads bulk refresh URL bug (C3)

After every bulk inventory action, `AdminLeads.jsx#L734` does:

```js
fetch(`${API_URL}/admin/leads?limit=500`)
```

**This endpoint does not exist.** The only `/leads` collection endpoint is the (admin-branch of) `GET /api/leads`. The fetch's `else if (Array.isArray(j.leads))` branch never fires; the UI silently keeps the stale pre-bulk list. Admins must manually refresh to see the result of their own action.

**Fix:** change the URL to `${API_URL}/leads` (admin branch). One-line client edit. ~5 min.

### D3 — `main_legacy` is a client-only triage cohort

`channelFilter='main_legacy'` is computed at [AdminLeads.jsx#L685](../../../client/src/pages/admin/AdminLeads.jsx#L685) as `inventoryChannel='main' && distributionModel !== 'instant'`. The server returns nothing differently for this — it's purely client-side bucketing for admin ops. Documented in the audit but undocumented in code.

## §E — Hidden state conflicts

### E1 (= C1) — `tier-override SET` silent state

| What it writes | What it doesn't |
|---|---|
| `adminTierOverride` | `distributionDecision` |
| `qualityGateCleared = (tier !== 'rejected')` | (no orchestrator call) |
| `status = 'READY_FOR_DISTRIBUTION'` (if was `PENDING_MANUAL_REVIEW`) | (no SMS/email/socket broadcast) |

**Path that triggers the bug:**

1. Admin reviews a `PENDING_MANUAL_REVIEW` lead (held by Phase 6.8 because scoring → `'rejected'` tier OR `qualityGateCleared = false`).
2. Admin clicks "Set tier override to 'standard'" via the tier-override modal.
3. Code at [admin.js#L894-L897](../../../server/routes/admin.js#L894) sets `lead.status = 'READY_FOR_DISTRIBUTION'`. Lead is now mover-feed-eligible.
4. **No `dispatchApprovedLead` call.** Movers who're not currently on their dashboard never get an SMS or email.

The PR-6 reactivate cron eventually picks the lead up within 5 minutes (it's auctionStatus=expired typically for a previously-rejected lead), at which point `dispatchApprovedLead` fires. But:

- `notifiedAt` may already be set (rare — these are previously-held leads). If so, broadcasters short-circuit. Silent re-list.
- If `notifiedAt` is null (typical for a lead held since ingest), the cron's dispatch fires SMS/email/socket up to 5 minutes late.

**Net:** for held-from-ingest leads, the delay is at most 5 min and the broadcast still fires. For held leads that already had a prior broadcast that got suppressed, no fresh push goes out — passive re-list only.

**This is the same architectural shape as the `restore_to_main` silent re-list (R5 in the Deal Room audit) — and the fix is identical:** add a `dispatchApprovedLead(lead._id, { source: 'admin.tier_override.set' })` call after the status save. ~10 min PR with lock-in test.

### E2 — scoringPipeline can clobber admin tier-override on `qualityGateCleared`

[scoringPipeline.js#L110-L118](../../../server/services/scoringPipeline.js#L110) writes `qualityGateCleared` via `updateOne({_id}, ...)` with NO stickiness guard. If an admin sets tier-override mid-pipeline, the next scoring tick can revert `qualityGateCleared`.

In practice this is benign because the `distributionDecision` write (W-Q3) IS sticky on `SYSTEM_VALUES`, so the visibility quality gate is protected. But `qualityGateCleared` is consulted by `verifyLeadPhone` for the Phase 6.8 status-gate, so a clobber here can cascade to a status flip back to `PENDING_MANUAL_REVIEW` on a subsequent verify pass.

**Severity:** LOW (requires concurrent admin action + scoring tick within seconds).

## §F — Sort key inconsistencies

The four mover-facing freshness keys:

| Surface | Sort | Honest meaning |
|---|---|---|
| Main feed | `distributionDecisionAt` | When decision was last stamped |
| Deal Room | `updatedAt` | When ANY field was last touched |
| My Leads | `purchasedAt` | When the purchase row was created |
| Widget analytics | `createdAt` | When homeowner submitted |

Each individually defensible. System-wide, the absence of a single "freshness" notion means an operator reading "your 5 newest leads" gets different rules per surface. **Not a bug; an inconsistency.**

The notable real-world surprise: **Deal Room sort by `updatedAt`**. Any admin touch (tier override, rescore, mark-reviewed, etc.) re-bubbles a Deal Room lead to the top, even if it's been sitting in Deal Room for two weeks. The Deal Room admin summary's "oldest by updatedAt" has the same issue (#C9; already documented in Deal Room R6).

Fix (post-pilot): add a denormalized `dealRoomMovedAt` field at the move (and `restore_to_main` clears it). Sort by that instead of `updatedAt`. Small additive schema change, lock-in test. ~30 min.

## §G — Other findings

### G1 — `/api/leads` admin branch unpaginated (C5)

[routes/leads.js#L246](../../../server/routes/leads.js#L246) returns the entire collection when `req.user.role === 'admin'`. As lead volume grows past ~10k, every admin dashboard load becomes a Mongo-pressure event. Pilot scale: irrelevant. Post-pilot: add a `?limit=N&skip=M` cursor with a sensible default.

### G2 — `reactivateLeads` cron has no soft cap (C6)

[reactivateLeads.js#L88](../../../server/jobs/reactivateLeads.js#L88) emits a CAS per eligible lead. No `.limit(N)`. A single 5-minute tick over 10k eligible leads issues 10k CASes + 10k dispatch attempts. Mitigated by per-channel `notifiedAt` short-circuits, but the orchestrator + reactivate fire-and-forget logic still runs N times. Post-pilot improvement: cap at e.g. 500 per tick.

### G3 — Deal Room admin summary inlines distributionDecision (C4)

[adminInventory.js#L349](../../../server/routes/adminInventory.js#L349) `availableFilter` writes `distributionDecision: { $in: ['system_approved','admin_approved'] }` inline instead of spreading `moverVisibilityFilter()`. If the helper expands (e.g. Phase 4 adds `system_pending_review` to the visible set), the summary silently misses it. ~5 min fix.

### G4 — Schema dead states (C10)

`auctionStatus='pending'` and `Lead.status='Available'` are schema defaults never produced by any concrete ingest. The mover feed admits `Available` (same `$in` as `READY_FOR_DISTRIBUTION`), so functionally alive — but the enum-level intent is unclear. The audit-readiness recommendation is to leave dormant-not-deprecated (matches operator preference per memory notes).

## §H — Quick verdict per question the operator asked

| Question | Answer |
|---|---|
| 1. Leads that can disappear unexpectedly | None unexpectedly. The `GET /api/leads` read-side expire mutation is intentional + cron-backed. |
| 2. Leads that can appear twice | **No.** `inventoryChannel: $nin/$eq` mutual exclusion is total. Cross-fed verified. |
| 3. Leads that can become stranded | **Yes — C2** (refunded warm-transfer; near-zero today since Live Transfer retired) and **C7** (REJECTED_FAKE has no admin un-reject). |
| 4. Sorting inconsistencies | **Yes.** Four different freshness keys (`distributionDecisionAt` / `updatedAt` / `purchasedAt` / `createdAt`). Deal Room sort is misleading (any admin touch re-bubbles). |
| 5. Frontend/backend filter mismatches | **Yes.** Matched tab is client-side over a server feed that doesn't pre-filter by coverage (intentional design). AdminLeads bulk-refresh URL doesn't exist (C3 — fixable in 5 min). |
| 6. Hidden state conflicts | **Yes — C1.** `tier-override SET` writes `status='READY_FOR_DISTRIBUTION'` without `distributionDecision` and without dispatching the orchestrator. Silent re-list of held leads through tier override. |

## §I — Recommended fix sequence (post-pilot)

Same pattern as PR-D1/D2/D3 — small isolated PRs, source-level lock-in tests, no schema changes unless explicitly required.

| Priority | ID | Fix | Effort |
|---|---|---|---|
| **High** | C1 | Add `dispatchApprovedLead(lead._id, {source: 'admin.tier_override.set'})` after status save in admin.js#L895-L897 + lock-in test | ~15 min |
| **Medium** | C3 | Change `${API_URL}/admin/leads?limit=500` → `${API_URL}/leads` in AdminLeads.jsx#L734 + ensure the response shape is unwrapped correctly | ~10 min |
| **Medium** | C2 | Decide: should refunded warm-transfer leads relist (clear auctionStatus + winnerId) OR auto-archive? Operator policy decision; small additive PR either way | ~30 min after decision |
| Low | C4 | Replace inline distributionDecision clause in `availableFilter` with `...moverVisibilityFilter()` | ~5 min |
| Low | C5 | Add pagination to `/api/leads` admin branch | ~30 min |
| Low | C6 | Add `.limit(500)` to `reactivateLeads.js#L126` find | ~5 min |
| Low | C9 | Denormalize `dealRoomMovedAt` on Lead; switch Deal Room sort to that | ~30 min + schema test |

**None of these are pilot-blockers.** C1 is the highest-confidence silent-state path remaining and is the most worth shipping pre-pilot if you have ~15 min of bandwidth.
