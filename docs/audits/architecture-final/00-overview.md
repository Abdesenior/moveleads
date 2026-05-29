# MoveLeads — Final Architecture Audit

**Date:** 2026-05-29
**Scope:** Full lead-lifecycle trace + complete visibility matrix.
**Constraint:** Read-only research. No code changes.
**Companion files:**
- [`01-readers-writers-crons.md`](01-readers-writers-crons.md) — every writer, every reader, every cron
- [`02-visibility-matrix-and-conflicts.md`](02-visibility-matrix-and-conflicts.md) — the 4-axis matrix + identified bugs

## Top-level verdict

**MoveLeads has ONE confirmed silent-state bug and TWO real stranded-lead bug classes left.** Plus a small set of latent UX/scalability issues that are not pilot-blocking but worth tracking.

| ID | Severity | Item | Pilot-blocking? |
|---|---|---|---|
| **C1** | **HIGH** | `tier-override SET` (admin.js#L879–897) writes `qualityGateCleared=true` + may upgrade `status='READY_FOR_DISTRIBUTION'`, but does NOT touch `distributionDecision` and does NOT call `dispatchApprovedLead`. A `PENDING_MANUAL_REVIEW` lead promoted via tier-override (non-rejected tier) becomes broadcast-eligible without firing SMS/email/socket. | **YES** — fixable in ~30 min |
| **C2** | **MEDIUM** | **Refunded warm-transfer leads strand at `(status='Available', auctionStatus='sold')`** — voice refund at routes/voice.js#L259-262 flips `status='Available'` but leaves `auctionStatus='sold'`. No cron picks this up. Mover-feed query `status: $in [Available, READY_FOR_DISTRIBUTION]` admits status, but `reactivateLeads` cron filter excludes `auctionStatus='sold'`. **Lead is feed-eligible by status but never re-dispatched.** | **NO** but operator should know |
| **C3** | **MEDIUM** | **`AdminLeads.jsx` bulk-refresh hits a non-existent route** (`GET /api/admin/leads?limit=500` — admin UI assumes it exists; the only `/api/leads` endpoint is in `leads.js`). After every bulk inventory action, the silent 404 leaves the admin UI staler than the operator thinks. | **NO** but very low effort to fix |
| C4 | LOW-MED | `Deal Room admin summary` (PR-D3) inlines the `distributionDecision` clause instead of calling `moverVisibilityFilter()`. Drift risk if the helper changes. | NO |
| C5 | LOW-MED | `/api/leads` admin branch returns the ENTIRE collection unpaginated. As lead count grows past ~10k, every admin dashboard load becomes a Mongo-pressure event. | NO at pilot scale |
| C6 | LOW-MED | `reactivateLeads` cron has no soft `limit()`. A single tick over ~10k eligible leads issues 10k CASes + 10k dispatch attempts. Fine for pilot; not for scale. | NO |
| C7 | LOW | `REJECTED_FAKE → READY_FOR_DISTRIBUTION` has no admin route. To undo an accidental reject, admin must delete + re-ingest OR direct-Mongo. | NO |
| C8 | LOW | `archived → deal_room` requires two bulk requests (`archived → main`, then `main → deal_room`). No single-step transition. | NO |
| C9 | LOW | Deal Room sort by `updatedAt` re-bubbles leads on any admin touch (tier-override, rescore, mark-reviewed, etc.). Not "newest into Deal Room" as the comment suggests. | NO (already documented in Deal Room R6) |
| C10 | LOW | Schema enum has dead values: `auctionStatus='pending'` (every ingest overrides to `'active'`); `Lead.status='Available'` (V5/V6 ingest produces `'Pending Verification'` + scoring → `READY_FOR_DISTRIBUTION`). Mover feed treats `Available` and `READY_FOR_DISTRIBUTION` as equivalent so functionally alive, but the duality has no documented meaning. | NO |

**No leads can disappear unexpectedly** (every read query filter is documented and consistent).
**No leads can appear twice in the same feed** (the inventoryChannel `$nin`/`$eq` clause is mutually exclusive across main feed and Deal Room).
**Two classes of leads CAN become stranded:** C2 (refunded warm-transfer) and C7 (rejected, no un-reject path).

## What's solid

These were each fully audited and verified correct:

1. **Phase 3 quality gate** — `distributionDecision` is the single visibility axis. Every mover-facing reader applies `moverVisibilityFilter()` (`{$in: ['system_approved','admin_approved']}`). Held + rejected leads are never visible.
2. **Buy-now atomic sequence** — Lead CAS → balance CAS → PurchasedLead unique mutex → finalize → Transaction → socket emit. Identical for marketplace and Deal Room (same `/api/bids/:leadId/buy-now` handler).
3. **`notifiedAt` dedup CAS** — SMS and email contend on the same `{notifiedAt: null}` filter; only one wins. Multi-callsite stable.
4. **`distributionDecision` stickiness** — every system writer (scoringPipeline, verifyLeadPhone) filters `{distributionDecision: {$in: SYSTEM_VALUES}}`, so admin verdicts (`admin_approved`/`admin_rejected`) cannot be silently clobbered.
5. **Cron isolation** — every job has per-doc try/catch around its main work + atomic CAS where state mutates. No halt-on-first-failure paths.
6. **Frontend leak guard** — LeadFeed.jsx asserts `_matchesPreferences === true` at render time and `console.error`s if a non-match slips into the matched tab.
7. **Mutual exclusion of main feed vs Deal Room** — `inventoryChannel: {$nin: ['deal_room','archived']}` vs `{$eq: 'deal_room'}` are disjoint. A lead is in exactly one feed at a time.

## How to read the audit

For the operator decisions you need to make:

| Question | Answer | Source |
|---|---|---|
| Can a lead appear in BOTH main feed and Deal Room? | No. Verified by behavioral test ([dealRoom.test.js#L143-214](../../../server/__tests__/dealRoom.test.js#L143-L214)) + filter mutual exclusion. | [02 §A](02-visibility-matrix-and-conflicts.md) |
| Can a lead disappear from the main feed unexpectedly? | Only via the `READY_FOR_DISTRIBUTION + moveDate < now` expire side-effect on every read (now-mostly-redundant after PR-6 cron, but still wired). Otherwise no. | [02 §B](02-visibility-matrix-and-conflicts.md) |
| Can a lead be stranded? | Yes. **C2** (refunded warm-transfer) and **C7** (REJECTED_FAKE without explicit unreject). | [02 §C](02-visibility-matrix-and-conflicts.md) |
| Does any frontend filter contradict any backend filter? | Yes, indirectly: **matched-tab** is client-side over a server feed that doesn't pre-filter by coverage. Socket-pushed leads arrive without `_matchesPreferences` and are invisible in the matched tab until next fetch. Documented + leak-guarded. | [02 §D](02-visibility-matrix-and-conflicts.md) |
| Are there hidden state conflicts? | Yes: **C1** (tier-override SET writes status without distributionDecision; silent state). | [02 §E](02-visibility-matrix-and-conflicts.md) |
| Are there sort inconsistencies? | Yes: 4 different "freshness" keys across surfaces (`distributionDecisionAt` / `updatedAt` / `createdAt` / `purchasedAt`). Each is defensible on its own; system-wide naming is not unified. | [02 §F](02-visibility-matrix-and-conflicts.md) |

## Confidence

This audit cross-references three independent agent investigations (writers, readers, cron+sort+transitions), plus my own targeted reads of the highest-risk files. Every finding cites a file:line. No assertions are made from memory or model intuition.

The agent runs converged on the silent-state items (C1, C2) and the stranded-state items (C2, C7). Independent agreement increases confidence these are the real exposures.
