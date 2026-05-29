# Phase 5 — Pilot GO / NO-GO

## Recommendation: **GO**

For the proposed shape: **3-5 movers, 5 admin-curated Deal Room leads, 5 business days observation window.**

Conditional on the operator-side verification runbook ([01-production-verification.md §B-§F](01-production-verification.md)) being walked through before flipping `ENABLE_DEAL_ROOM=true` and inviting the cohort. ~45 min of operator time.

## §A — What's been verified solid

| Layer | Status | Evidence |
|---|---|---|
| **Architecture** | ✅ Clean | Final architecture audit closed 1 HIGH (C1), 1 MEDIUM (C3) silent-state bugs. Remaining open items are LOW or operator-policy. No stranded-lead, double-purchase, or visibility-leak paths exist that aren't documented. |
| **Production health** | ✅ Live | API + frontend 200; database connected; 58/58 server test files pass; last 5 deploys all green |
| **Financial path** | ✅ Bulletproof | Buy-now atomic sequence is byte-identical between marketplace and Deal Room. Same `/api/bids/:leadId/buy-now` route. Server-trusted price (client sends no body). PurchasedLead `{company, lead}` unique mutex protects against double-charge. Verified by `dealRoomScenarioIntegration.test.js` (37/37 pass). |
| **Visibility** | ✅ Correct | Phase 3 quality gate (`distributionDecision: $in [system_approved, admin_approved]`) reused by every mover-facing reader. Mutual exclusion main feed ↔ Deal Room verified. |
| **Deal Room observability** | ✅ Available | PR-D3 `[Deals] mover=… count=…` log line per request + `GET /api/admin/inventory/deal-room/summary` JSON endpoint. PR-4 broadcast manifest persists "why did/didn't this lead dispatch" on every Lead. PR-5 SMS delivery-status callback wired. |
| **Silent-state coverage** | ✅ Closed | Admin write paths (approve, reject, rescore, tier-override SET, tier-override CLEAR, lead-edit allowlist) all either call `dispatchApprovedLead` or have documented (and tested) reasons not to |
| **Refund / dispute paths** | ✅ Atomicity intact | Refund handlers write Transaction + claw back balance via atomic $inc. PurchasedLead.refunded flag. Stripe webhooks signature-verified. PR #58 closed admin balance-adjustment ledger drift. |
| **Notifications** | ⚠ Capacity-limited | SMS dispatch live. Email dispatch live. Per-channel `notifiedAt` CAS dedup verified. SMS Claim still preview-only (separate pipeline; not pilot-blocking). |
| **Payments** | ✅ Live | Stripe payment intent + webhook + idempotency via `Transaction.stripePaymentIntentId` unique-sparse index |
| **Auth** | ✅ Live | JWT + email-verification gate + admin role check. Phone verification capability-gated only (does NOT block dashboard access — see verification-gating-model memory). |
| **Onboarding** | ⚠ Friction-unaudited | Code path exists; the mover-journey audit (Phase 2) will surface specific friction points |

## §B — What's open and why it's not a blocker

| ID | Severity | Item | Why not blocking |
|---|---|---|---|
| C2 | LOW-MED | Refunded warm-transfer leads strand at `(status='Available', auctionStatus='sold')` | Live Transfer documented retired (per `marketplace-transition-complete` memory). Near-zero practical occurrence today. Operator workaround documented. |
| C4 | LOW-MED | Deal Room admin summary inlines `distributionDecision` clause | Drift-risk only; works correctly today |
| C5 | LOW-MED | `/api/leads` admin branch unpaginated | Pilot scale (≤25 movers, ≤200 leads) is far below the threshold where this hurts |
| C6 | LOW-MED | `reactivateLeads` cron no soft cap | Same — pilot scale won't trigger 10k-lead ticks |
| C7 | LOW | `REJECTED_FAKE → READY_FOR_DISTRIBUTION` not an admin route | Operator workaround: delete + re-ingest. Avoid `/reject` during pilot if possible. |
| C8 | LOW | `archived → deal_room` needs two bulk requests | Operator workaround: two clicks. Acceptable. |
| C9 | LOW | Deal Room sort by `updatedAt` re-bubbles on any admin touch | Documented cosmetic. Pilot cohort sees same lead ordering between sessions if admin doesn't edit. |
| C10 | LOW | Schema dead enum values | Dormant-not-deprecated per operator preference |

**Zero HIGH-severity items remain open.**

## §C — Coverage match indicator (operator decision)

[Phase 4 §5 + §10](04-deal-room-business-review.md) recommend a coverage match indicator as the single highest-impact pre-pilot polish. ~1 hour of additive client-side work. **Operator decision required:**

| Option | What ships | Effort | Recommended? |
|---|---|---|---|
| A | DRX-1 + DRX-2 as-is (current state) | 0 | Yes if cohort is 3-5 movers — they'll inspect every row anyway |
| B | DRX-1 + DRX-2 + coverage match badge | ~1 hour client-side PR + test | Yes if cohort scales beyond 5 OR if operator wants to push for repurchase signal sooner |

**Default recommendation:** Option A. The cohort is small enough that coverage cognitive-load doesn't bite. Defer the badge to post-pilot.

If operator picks Option B: it's a small isolated PR with the same shape as PR-D1/D2/D3 — would fit comfortably in the pre-pilot window without disrupting the GO decision below.

## §D — Pilot execution checklist

Detailed runbook for the operator. Each row is a discrete action with a verification step. **Estimated total prep time: 90 minutes.**

### T-minus-2 days (pre-pilot Tuesday/Wednesday)

```
[ ] D1. Curate 5 leads in admin. Mix of:
        - 2 short-haul (within state, ≤200 mi)
        - 3 long-haul (interstate, ≥500 mi)
        Discount range: 25-40%. None ≥50%.
        Verify each:
          - moveDate ≥ 7 days out
          - status='READY_FOR_DISTRIBUTION'
          - distributionDecision='system_approved' or 'admin_approved'
          - buyers empty

[ ] D2. Identify 3-5 pilot movers. Criteria:
        - role='mover'
        - isEmailVerified=true
        - phoneVerified=true (so SMS alerts work)
        - has at least 1 successful Credit Deposit (funded)
        - pickupStates / deliveryStates set (so feed isn't empty)
        - covers at least 2 of the 5 curated leads' routes

[ ] D3. Email pilot movers individually:
        Subject: "MoveLeads Deal Room — your invitation"
        Body: 3-4 sentences explaining what Deal Room is (discounted
              inventory, hand-picked, unlock = same as Live Leads),
              when it goes live, who to contact if they hit issues,
              and a clear ask for feedback after their first unlock.
        Plain-text, no marketing chrome. Operator's voice.

[ ] D4. Set up the metrics-tracking sheet from
        03-pilot-metrics-dashboard.md §C. 13 columns, 6 rows
        (baseline + day 1-5).

[ ] D5. Walk through 01-production-verification.md §B–§F runbook.
        ~45 min. Fill in the §F report template.
        Defects found → halt and resolve before D6.
```

### T-minus-1 day (Thursday)

```
[ ] T1. Verify ENABLE_DEAL_ROOM is currently FALSE in Render. Confirm
        with GET /api/admin/inventory/deal-room/summary returning
        { enabled: false, ... }.

[ ] T2. Confirm SERVER_URL env in Render is exactly
        https://api.moveleads.cloud (no trailing slash, with api.
        subdomain). Critical for PR-5 Twilio statusCallback.

[ ] T3. Confirm STRIPE_SECRET_KEY is the live key (not test).

[ ] T4. Curate the 5 leads via the admin "Move to Deal Room" bulk
        modal. action=move_to_deal_room with discountPercent or
        dealPrice. After each move, hit
        GET /api/admin/inventory/deal-room/summary and verify the
        count increments.

[ ] T5. Record baseline metrics in the sheet:
        - Mover signups (lifetime, pre-pilot)
        - Verified, Activated, Funded movers
        - Total Lead Purchases (lifetime)
        - 0 for everything that's pilot-window-scoped
```

### Pilot Day 1 (Friday morning)

```
[ ] P0. Final smoke test. Don't flip yet.
        - Curl all 5 endpoints from §A of verification report
        - Tail Render log; should be quiet

[ ] P1. Flip ENABLE_DEAL_ROOM=true in Render.
        Wait ~30s for the env to restart the server.

[ ] P2. Verify the flag:
        GET /api/admin/inventory/deal-room/summary
        → expect { enabled: true, totalDealRoomLeads: 5, ... }

[ ] P3. As a pilot mover (browser tab):
        - Visit /dashboard/deals
        - Verify the 7-column exchange table renders
        - Verify all 5 leads appear (if your coverage matches them all)
        - Try one filter (Distance: Long Distance) — should narrow
        - Try one sort click (Now column) — should re-sort
        - Click Unlock on one lead → confirm modal → DO NOT actually
          confirm (you don't want to unlock as the operator)

[ ] P4. Send the "Deal Room is live" email to the pilot movers.
        Plain text, 2 sentences. Include the dashboard URL and your
        support contact.

[ ] P5. Tail Render logs for the first 4 hours. Look for:
        - [Deals] mover=... count=5 sort=updatedAt:-1  (mover hits the page)
        - [Bids] Buy-now error: <message>  (any error = investigate immediately)
        - [dispatchApprovedLead] suppressed for <id>  (broadcast was blocked — read the reason)
        - Any 5xx in [Deals Endpoint] error  (investigate)
```

### Pilot Days 1-5 (daily)

```
[ ] Each day 23:59 UTC:
    [ ] D-N.1 Record the 13 metrics in the sheet (~10 min Mongo shell)
    [ ] D-N.2 Read Render logs for the day. Note:
            - Any 5xx errors
            - Any [dispatchApprovedLead] suppressed lines
            - Total unique movers in [Deals] log lines
    [ ] D-N.3 If any mover has unlocked: read their My Leads. Did
              they mark contacted? Quoted? Booked? Any complaints?
    [ ] D-N.4 If any refund processed: investigate WHY. Lead quality?
              Customer changed mind? Mover unable to fulfill?
    [ ] D-N.5 30-sec qualitative note in the sheet:
              "Day N feel — what's working / what's not"
```

### End of Day 5

```
[ ] E1. Final metrics snapshot. Fill in the day-5 row.

[ ] E2. Email pilot movers individually:
        Subject: "MoveLeads Deal Room pilot — your honest read"
        Ask 3 questions:
          - What did you like?
          - What confused or frustrated you?
          - Would you keep using it if it costs you nothing extra?

[ ] E3. Collate responses + metrics. Decide:
          - GO for full rollout → flip ENABLE_DEAL_ROOM=true permanently
            + post to all movers
          - EXTEND pilot → keep flag on, invite 5-10 more movers,
            extend by 1 week
          - HOLD → flip flag off, no announcement, fix issues, retry

[ ] E4. If GO: announce broadly via email + dashboard banner. If HOLD:
        do NOT shame the operator decision in the email. Just say
        "Deal Room is in private beta — sign up to be notified when
        it opens to all."
```

## §E — Halt criteria during pilot

If ANY of these happen during the pilot, **halt and investigate before next day starts:**

1. Any **double-charge** event (two Transaction rows for the same `purchasedLead`)
2. Any **balance going negative** (`User.balance < 0` post-purchase)
3. Any **Stripe webhook idempotency failure** (E11000 on `Transaction.stripePaymentIntentId`)
4. Two or more **lead unlocks failing with 500** in a single hour
5. Any **mover reports their balance debited but no PurchasedLead row** (the canonical revert should prevent this, but verify if reported)
6. Any **stuck `auctionStatus: 'buy_now'` lead** (the CAS revert should clear this — check Mongo)
7. **`[Deals]` log lines stop appearing for 6+ hours during business hours** (the SPA may not be reaching the server)

For each halt: flip `ENABLE_DEAL_ROOM=false`, email the cohort an honest "we're pausing to investigate", investigate, fix, resume next morning.

## §F — Why I'm confident in GO

1. **The 9 PRs shipped in this session cover the entire silent-state class.** Every admin write path with mover-visibility consequences is wired. The architecture audit identified C1 + C3 as the only HIGH/MEDIUM remaining issues, and both are now closed.
2. **Financial atomicity is bullet-proof.** Same canonical buy-now path for marketplace and Deal Room. Same PurchasedLead unique mutex. Same balance CAS. No new financial code introduced this session.
3. **Test coverage is dense.** 58 server test files, 0 failures. Every new code path has source-level + behavioral lock-in tests.
4. **Observability is in place.** PR-3 (claim-attempts endpoint), PR-4 (broadcast manifest), PR-5 (SMS delivery callback), PR-D3 (Deal Room summary). Operator can answer "why didn't this dispatch" without grep-by-grep.
5. **Pilot scope is conservative.** 3-5 movers, 5 leads, 5 days. This is the MVP of "did movers like it." If something goes wrong, the blast radius is small.
6. **Rollback is instant.** `ENABLE_DEAL_ROOM=false` flips off the feature for everyone. No data migration. No support burden.
7. **The mover journey audit is still in flight** (Phase 2) — I'll integrate its findings into the GO checklist if any are pilot-blocking. **My pre-Phase-2 read is: yes go.** Phase 2 may surface 1-2 copy/CTA fixes that are quick wins; none likely to be GO-blockers.

## §G — When to revisit this decision

Re-read this Phase 5 doc on:
- End of pilot day 5 (mandatory)
- Any halt criterion firing (mandatory)
- If pilot extends to a second week (decision point)
- If operator decides to add coverage match badge or other pre-pilot polish (re-verify §D pre-flip checklist still passes)

---

**Bottom line: GO for the proposed pilot shape. The system is in the best pre-pilot state of this engineering cycle. The remaining open items are LOW-severity and documented. The pilot's small scope makes risk-of-failure recoverable without blast.**
