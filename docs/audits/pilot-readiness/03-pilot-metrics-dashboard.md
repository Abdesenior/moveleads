# Phase 3 — Pilot Metrics Dashboard Plan

**Goal:** know within 5 business days whether the pilot worked, why or why not, and what to do next.

**Cadence:** daily snapshot at 23:59 UTC + end-of-pilot summary.

**Tooling assumption:** no external dashboard exists today. Recommendation is to bootstrap with a single admin endpoint that returns the metrics JSON, plus a Notion/Sheets daily-paste workflow. Move to a real dashboard (Metabase / Retool) only if pilot extends.

## §A — Metrics catalog

Each metric carries (1) event name, (2) database source, (3) query, (4) honest interpretation note.

### 1. Mover Signups

| Aspect | Value |
|---|---|
| Event | `user.created` (no explicit event today — derived from `User` document `createdAt`) |
| DB source | `users` collection |
| Query | `db.users.countDocuments({ createdAt: { $gte: pilotStart }, role: { $in: [User.MOVER_ROLES, undefined] } })` (MOVER_ROLES from User model) |
| Interpretation | Raw funnel top. Includes movers who never verified email. |
| Pilot target | ≥ 25 (assuming 5 invited × 5 word-of-mouth multiplier; adjust for the actual cohort size) |

### 2. Verified Movers

| Aspect | Value |
|---|---|
| Event | `user.email_verified` (`isEmailVerified` flag flip in routes/auth.js) |
| DB source | `users` collection |
| Query | `db.users.countDocuments({ isEmailVerified: true, createdAt: { $gte: pilotStart } })` |
| Interpretation | Signups that got past email verification. **Phone verification is capability-gated, not access-gated.** A mover can sign up, verify email, never verify phone, and still use the dashboard — they just don't get SMS alerts. |
| Pilot target | ≥ 80% of signups (≥ 20 of 25) |

### 3. Activated Movers

**Definition needed.** "Activated" is ambiguous in MoveLeads. Three candidate definitions, pick one with operator:

| Candidate definition | DB signal | Pros | Cons |
|---|---|---|---|
| Completed onboarding wizard | `User.onboarding.complete === true` | Concrete schema field | Doesn't prove the mover is engaged — they may complete to skip the wizard |
| Set service area / coverage | `User.pickupStates.length > 0 \|\| User.deliveryStates.length > 0 \|\| User.deliversNationwide === true` | Strongest "ready-to-buy" signal | Onboarding wizard already collects this; redundant with "completed" |
| Logged in 2+ times in different sessions | derive from session log (none today) | Captures repeat engagement | No infra today |

**Recommended definition for pilot:** `User.onboarding.complete === true AND (pickupStates.length > 0 OR deliveryStates.length > 0 OR deliversNationwide === true)`. Captures "completed the wizard AND set coverage."

| Query | `db.users.countDocuments({ ..., $or: [{ pickupStates: { $not: { $size: 0 } } }, { deliveryStates: { $not: { $size: 0 } } }, { deliversNationwide: true }] })` |
|---|---|
| Pilot target | ≥ 60% of verified (≥ 12 of 20) |

### 4. Funded Movers

| Aspect | Value |
|---|---|
| Event | `transaction.credit_deposit` |
| DB source | `transactions` collection (`type: 'Credit Deposit'`) |
| Query | `db.transactions.distinct('user', { type: 'Credit Deposit', date: { $gte: pilotStart }, status: 'Completed' }).length` |
| Interpretation | Movers who have at least one successful Stripe deposit. **Critical conversion gate** — no money in account → no purchase. |
| Pilot target | ≥ 50% of activated (≥ 6 of 12) |

### 5. Lead Views

**Honest caveat:** today there is no per-mover lead view tracking. Best signal:

| Aspect | Value |
|---|---|
| Event | `feed.served` (derived) |
| DB source | Render logs only — `[Dashboard]` log line + `logDashboardShadow` in routes/leads.js |
| Query | grep Render logs for `[Dashboard] count=` per mover, sum over pilot window |
| Interpretation | Counts requests, not impressions. If a mover refreshes 10 times, that's 10 "views" not 10 lead exposures. |
| Pilot target | ≥ 10 fetches/funded-mover/day |
| **Gap** | True per-lead impressions would need a `Lead.impressions` denorm or an analytics event. Out of pilot scope. |

### 6. Deal Room Views

| Aspect | Value |
|---|---|
| Event | `[Deals] mover=<id> count=<n> sort=updatedAt:-1` (PR-D3 log line) |
| DB source | Render logs |
| Query | `grep -c '\[Deals\] mover=' renders.log` per day; segment by mover id |
| Interpretation | Same caveat as #5 — counts requests, not impressions. |
| Pilot target | ≥ 3 fetches/funded-mover/day |

### 7. Lead Purchases (marketplace)

| Aspect | Value |
|---|---|
| Event | `transaction.lead_purchase` |
| DB source | `transactions` (`type: 'Lead Purchase'`) |
| Query | `db.transactions.find({ type: 'Lead Purchase', date: { $gte: pilotStart }, status: 'Completed' })` |
| Interpretation | Includes Deal Room and main marketplace. **C.f. #8 to split — see honest caveat in #8 below.** |
| Pilot target | ≥ 1 purchase per funded mover by day 3; ≥ 2 by day 5 |

### 8. Deal Room Purchases

| Aspect | Value |
|---|---|
| Event | (none distinct today) |
| DB source | `transactions` JOIN `Leads.inventoryChannel` |
| Query | `db.transactions.aggregate([{ $match: { type: 'Lead Purchase', date: { $gte: pilotStart } } }, { $lookup: { from: 'leads', localField: 'lead', foreignField: '_id', as: 'leadDoc' } }, { $match: { 'leadDoc.inventoryChannel': 'deal_room' } }, { $count: 'n' }])` |
| **Honest caveat** | The lead's `inventoryChannel` is mutable post-purchase (admin could `restore_to_main` a sold lead — admin gate refuses this today, but the data model permits drift). The above query is best-effort, not authoritative. |
| Recommended pilot workaround | Operator queries this at end-of-pilot manually; for daily granularity, manually tag pilot purchases via Render log `Buy-now purchase: lead <id>` cross-referenced to the admin Deal Room summary endpoint at the time of purchase. |
| Long-term fix | C5-class issue: add `Transaction.surfaceAtPurchase` field. Documented as DRX-4 follow-up. |
| Pilot target | ≥ 5 Deal Room purchases over 5 days (matches the 5 admin-curated leads × 1 buyer each) |

### 9. Refunds

| Aspect | Value |
|---|---|
| Event | `transaction.lead_refund` / `transaction.stripe_refund` / `transaction.stripe_chargeback` |
| DB source | `transactions` |
| Query | `db.transactions.find({ type: { $in: ['Lead Refund', 'Stripe Refund', 'Stripe Chargeback'] }, date: { $gte: pilotStart } })` |
| Interpretation | High refund rate ≥ 15% is a red flag (bad lead quality, lead-to-customer time too high, or pricing too high). |
| Pilot target | ≤ 10% of purchases |

### 10. Repurchases

| Aspect | Value |
|---|---|
| Event | derived |
| DB source | `purchased_leads` collection |
| Query | `db.purchasedleads.aggregate([{ $match: { purchasedAt: { $gte: pilotStart } } }, { $group: { _id: '$company', n: { $sum: 1 } } }, { $match: { n: { $gte: 2 } } }, { $count: 'movers_with_2_plus' }])` |
| Interpretation | Movers who bought ≥ 2 leads. **Strongest single signal of pilot success.** Repurchase = belief in the platform. |
| Pilot target | ≥ 30% of funded movers (≥ 2 of 6) |

### 11. Average Revenue Per Mover (ARPM)

| Aspect | Value |
|---|---|
| Event | derived |
| DB source | `transactions` (`type: 'Lead Purchase'`) grouped by `user` |
| Query | `db.transactions.aggregate([{ $match: { type: 'Lead Purchase', status: 'Completed', date: { $gte: pilotStart } } }, { $group: { _id: '$user', revenue: { $sum: '$amount' } } }, { $group: { _id: null, arpm: { $avg: '$revenue' } } }])` |
| Interpretation | Per-mover, not per-day. Compare to industry benchmarks (movers spending ~$200-$400/month on lead-gen is typical for SMBs). |
| Pilot target | ≥ $80 over 5 days (proportional baseline) |

### 12. Average Lead Price

| Aspect | Value |
|---|---|
| Event | derived |
| DB source | `transactions` |
| Query | `db.transactions.aggregate([{ $match: { type: 'Lead Purchase', date: { $gte: pilotStart } } }, { $group: { _id: null, avg: { $avg: '$amount' } } }])` |
| Interpretation | Useful for spotting whether Deal Room discounts skew the average down. Operator should compare to pre-pilot pricing baseline. |

### 13. Average Time To Purchase

**Definition:** for each successful purchase, time from `User.createdAt` → `Transaction.date` (for that user's FIRST purchase).

| Aspect | Value |
|---|---|
| Event | derived |
| DB source | `users` JOIN `transactions` (first lead purchase per user) |
| Query | (aggregate) match users created in pilot window → lookup first `Lead Purchase` Transaction → compute `firstPurchase.date - user.createdAt` in hours |
| Interpretation | Bimodal: some movers buy fast (≤4 hours), most never (∞). The MEDIAN of those who DID purchase is the useful number. Track also the *rate* (% who eventually purchase). |
| Pilot target | median ≤ 48 hours among purchasers |

## §B — Single endpoint proposal (post-pilot polish; not pre-pilot blocker)

For end-of-pilot, recommend a small admin endpoint that returns all 13 metrics in one JSON. Build only AFTER pilot if operator confirms the value. Shape:

```js
// GET /api/admin/metrics/pilot?from=YYYY-MM-DD&to=YYYY-MM-DD
// Auth: [auth, admin]
// Returns:
{
  window: { from: ..., to: ..., businessDays: 5 },
  signups: { count: 25 },
  verified: { count: 22, pctOfSignups: 0.88 },
  activated: { count: 14, pctOfVerified: 0.64,
               definition: 'onboarding.complete + coverage_set' },
  funded: { count: 7, pctOfActivated: 0.50 },
  views: {
    leadFeedFetches: <from log aggregation>,
    dealRoomFetches: <from log aggregation>,
  },
  purchases: {
    total: 14,
    marketplace: 9,
    dealRoom: 5,
  },
  refunds: { count: 1, pctOfPurchases: 0.07,
             breakdown: { 'Lead Refund': 1, 'Stripe Refund': 0,
                          'Stripe Chargeback': 0 } },
  repurchases: { moversWith2Plus: 3, pctOfFunded: 0.43 },
  arpm: { value: 142.35 },
  avgLeadPrice: { value: 167.50 },
  timeToPurchase: { medianHours: 31.5, p25: 14.0, p75: 72.0 },
}
```

Cost: ~3 hours engineering. Out of pilot scope; build only if operator wants a recurring report.

## §C — Daily snapshot workflow (pre-pilot ready, manual)

**Day 1 morning (pilot start):** record baseline counts of all 13 metrics with `from = today 00:00`.

**Days 1-5 evening (23:59 UTC):** operator runs 13 Mongo shell queries (or has a teammate do it), pastes into a Notion table or Google Sheet. ~10 min/day.

**End-of-pilot:** day-6 morning summary memo with the 13 metrics + qualitative notes from operator + pilot-cohort movers.

## §D — Recommended dashboard tools (post-pilot, optional)

| Tool | Cost | Pros | Cons | Recommended for MoveLeads? |
|---|---|---|---|---|
| Mongo shell + manual paste | $0 | No setup | Manual; error-prone | ✅ for pilot |
| Metabase (self-hosted) | $0 | Free; SQL-friendly; embeddable | Needs hosting; learning curve | ✅ post-pilot if growth |
| Retool | $$ | Fast to build admin tools; supports Mongo natively | Costs scale with seats | ✅ if admin-tooling becomes a real need |
| Plausible / PostHog | $ | Web analytics + funnel | Needs frontend instrumentation; out-of-scope events for back-office | ❌ not pre-pilot |
| Mixpanel / Amplitude | $$$ | Full product analytics | Enterprise pricing | ❌ not pre-pilot |

**Recommendation:** stick with the manual workflow during pilot. Reassess after.

## §E — Honest gaps

1. **No per-impression lead tracking.** Today we only know "the mover hit the feed", not "the mover saw lead X". A real impression tracker would denormalize `Lead.viewedBy[]` or write to a `LeadImpression` collection — meaningful frontend instrumentation work, **out of pilot scope**.
2. **Deal Room vs marketplace split is lossy.** See #8 honest caveat — `Transaction` doesn't carry `surfaceAtPurchase`. For pilot, manual cross-reference is acceptable.
3. **No conversion funnel chart.** Today: 13 point metrics. A real funnel chart (Signup → Verified → Activated → Funded → Purchased → Repurchased) would need event-driven instrumentation. **Out of pilot scope.** Operator should chart this manually from the daily snapshots.
4. **No A/B infrastructure.** If we want to test e.g. "5 leads in Deal Room" vs "10 leads in Deal Room" — there's no infra to randomize movers into cohorts. **Out of pilot scope.**

These gaps are documented for transparency; none are pilot-blockers. The proposed manual workflow is sufficient to answer "did pilot succeed and why."
