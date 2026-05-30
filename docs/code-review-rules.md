# Code Review Rules

Cross-cutting rules every reviewer must enforce on every PR. These exist because the same class of mistake keeps re-appearing, and "intuition" is not a reliable defense at pilot scale.

Each rule includes the **trigger** (what to grep / read), the **rationale**, and the **action** if you see a violation.

---

## R1 — `lead.updatedAt` is never a freshness signal (Fr2, 2026-05-30)

**Trigger:** any PR that touches a client-side `timeAgo` / "Listed X ago" / age display, OR adds a new freshness chip / column / pill.

**Rule:** every mover-facing freshness indicator must answer **"when did the homeowner submit this request?"** — anchor on `Lead.createdAt`. NEVER use `Lead.updatedAt`. The acceptable anchor preference order:

1. `Lead.createdAt` — homeowner submission moment (default for all mover-facing displays)
2. `Lead.distributionDecisionAt` — admin/observability surfaces only
3. `Lead.dealRoomListedAt` — reserved if/when added

**Rationale:** `updatedAt` reflects the last DB mutation (admin re-pricing, status flips, unrelated edits). Surfacing it as "Listed X ago" makes 14-day-old leads display as "1m ago" — misleading in the trust-positive direction, the failure mode that poisons marketplace credibility at pilot scale.

**Action on violation:** reject the PR. Point the author at the freshness-rule comment block near `timeAgo` in [client/src/pages/dashboard/LeadFeed.jsx](../client/src/pages/dashboard/LeadFeed.jsx) and [client/src/pages/dashboard/Deals.jsx](../client/src/pages/dashboard/Deals.jsx).

---

## R2 — `broadcastManifest` fields stay admin-only (Fr5, 2026-05-30)

**Trigger:** any PR that references `lastBroadcastAttemptAt`, `lastBroadcastSuppressReason`, or `lastBroadcastMatchedCount` outside of:

- [server/models/Lead.js](../server/models/Lead.js) (schema)
- [server/services/dispatchOrchestrator.js](../server/services/dispatchOrchestrator.js) (writer)
- [server/services/broadcastService.js](../server/services/broadcastService.js) or the SMS broadcast pipeline (writer)
- `GET /api/admin/leads/:id/distribution-diagnose` (admin-only reader)

**Rule:** these fields MUST NOT appear in any mover-facing API response, client component, email body, SMS body, or dashboard aggregation — directly or transformed. Examples of prohibited transformations:

- "Sent to 7 other movers"
- "Available to N companies"
- "Competition level: High"
- "X movers also see this lead"
- "Be the first of 4 to claim"

**Rationale:** surfacing competition counts to movers causes immediate conversion collapse. A mover who sees N>1 disengages ("no point, someone else got it"). A mover who sees N=1 assumes low quality. There is no value of N that helps the mover; the data must stay admin-only.

**Action on violation:** reject the PR. Even if the framing seems pro-mover ("transparency," "let the buyer know what they're up against"), the data must not leak.

---

## R3 — Don't reintroduce hidden dispatch / matching preferences

**Trigger:** any PR that reads a User field outside of the visible Settings tabs (Notifications, Service Areas, Lead Preferences, Profile, Danger Zone) and uses it to filter, gate, or order leads.

**Rule:** every backend preference that influences matching or dispatch must be UI-visible in Settings, or stop being read. No silent filters.

**Rationale:** PR #30, PR-C3, PR-C4 closed three landmines where stale onboarding-answers backend fields silently dropped leads from matching. Operators had no way to debug "why didn't I get matched?" — see memory: [no-hidden-backend-prefs.md](../.claude/projects/-Users-amin-Downloads-MoveLeads/memory/no-hidden-backend-prefs.md).

**Action on violation:** reject. Either surface the field in Settings or remove the read.

---

## R4 — Don't bypass the dispatch orchestrator

**Trigger:** any PR that writes `Lead.status`, `Lead.distributionDecision`, or `Lead.auctionStatus` outside of `dispatchApprovedLead()` and its known callers (admin approve, admin tier_override.set, admin rescore, admin clear-tier-override, verifyLeadPhone, scoringPipeline).

**Rule:** new writers must route through `dispatchApprovedLead` with an explicit `source` tag. Direct `Lead.findOneAndUpdate({ status: ... })` from a new code path is a silent-state bug waiting to happen.

**Rationale:** PRs #54, #56, #69 each closed a path where admin/system actions mutated lead state without flowing through the canonical orchestrator. Each one left leads in valid-looking but undistributed states.

**Action on violation:** reject. Route through `dispatchApprovedLead`.

---

## R5 — Don't make GET endpoints mutate state

**Trigger:** any PR that adds a write inside a route handler bound to `router.get(...)`.

**Rule:** GETs are read-only. Side-effecting work (reactivation, expiry sweeps, cleanup) belongs in a cron, not a request-path side-effect.

**Rationale:** PR #62 moved auction reactivation out of `GET /api/leads` into a cron after we discovered the read endpoint was silently mutating state as a function of being called. Hard to reason about, hard to test, harder to monitor.

**Action on violation:** reject. Move the mutation into a cron or an explicit POST/PATCH.

---

## How to add a new rule

If a class of bug appears twice, add a rule here. Keep each rule to: trigger, rule, rationale, action. Link to the PR that established the precedent so the rationale survives author memory.
