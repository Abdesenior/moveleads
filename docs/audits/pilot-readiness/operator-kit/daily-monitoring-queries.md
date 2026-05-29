# Daily Monitoring Queries — Pilot

Copy-paste-ready Mongo shell + curl commands for daily snapshots.
Run at 23:59 UTC each pilot day; results paste into the tracking sheet.

Estimated time per day: **10 minutes**.

## §A — One-shot health checks (run first)

```bash
# Production API + flag state via admin endpoint (replace ADMIN_JWT)
curl -s https://api.moveleads.cloud/api/health
echo ""

ADMIN_JWT="paste-your-admin-jwt-here"
curl -s -H "x-auth-token: $ADMIN_JWT" \
  https://api.moveleads.cloud/api/admin/inventory/deal-room/summary
# Expected: { enabled, totalDealRoomLeads, availableDealRoomLeads,
#            purchasedDealRoomLeads, oldest, newest, generatedAt }
```

If `enabled: false` and you expected `true` — investigate Render env immediately.

## §B — The 13 pilot metrics (Mongo shell)

Set `PILOT_START` once at the top of your session, then run each block:

```js
const PILOT_START = new Date("2026-05-30T00:00:00Z");  // adjust to your pilot day-1 00:00 UTC
const NOW = new Date();
```

### 1. Mover Signups (lifetime + pilot-window)

```js
db.users.countDocuments({
  createdAt: { $gte: PILOT_START },
  role: { $in: ["customer", "mover"] }  // adjust to your User.MOVER_ROLES
});
```

### 2. Verified Movers

```js
db.users.countDocuments({
  createdAt: { $gte: PILOT_START },
  isEmailVerified: true
});
```

### 3. Activated Movers (operator-chosen definition: onboarding complete + coverage set)

```js
db.users.countDocuments({
  createdAt: { $gte: PILOT_START },
  isEmailVerified: true,
  "onboarding.complete": true,
  $or: [
    { pickupStates: { $exists: true, $not: { $size: 0 } } },
    { deliveryStates: { $exists: true, $not: { $size: 0 } } },
    { deliversNationwide: true }
  ]
});
```

### 4. Funded Movers (≥ 1 successful deposit)

```js
db.transactions.distinct("user", {
  type: "Credit Deposit",
  date: { $gte: PILOT_START },
  status: "Completed"
}).length;
```

### 5. Lead Views — derive from Render logs (manual)

```
ssh-into-render | grep "[Dashboard]" | grep -c "count="
```

Or in the Render dashboard, search the application log for `[Dashboard]` and count lines for the pilot window. Caveat in [03-pilot-metrics-dashboard.md §A.5](../03-pilot-metrics-dashboard.md).

### 6. Deal Room Views — same shape

```
ssh-into-render | grep "[Deals] mover=" | wc -l
```

Or in Render's log search interface, query `"[Deals] mover="` for the pilot window.

### 7. Lead Purchases (marketplace + Deal Room combined)

```js
db.transactions.countDocuments({
  type: "Lead Purchase",
  date: { $gte: PILOT_START },
  status: "Completed"
});
```

### 8. Deal Room Purchases — lossy join

```js
db.transactions.aggregate([
  { $match: {
      type: "Lead Purchase",
      date: { $gte: PILOT_START },
      status: "Completed"
  } },
  { $lookup: {
      from: "leads",
      localField: "lead",
      foreignField: "_id",
      as: "leadDoc"
  } },
  { $match: { "leadDoc.inventoryChannel": "deal_room" } },
  { $count: "dealRoomPurchases" }
]).toArray();
```

**Note:** lossy if any sold Deal Room lead was later moved (`restore_to_main` or `archive`). For pilot accuracy, also cross-reference the Render log lines `[Bids] Buy-now error|success` against the `oldest`/`newest` returned by `/api/admin/inventory/deal-room/summary` snapshots over the pilot window.

### 9. Refunds

```js
db.transactions.find({
  type: { $in: ["Lead Refund", "Stripe Refund", "Stripe Chargeback"] },
  date: { $gte: PILOT_START }
}).toArray();
```

Investigate each one individually — small enough volume during pilot.

### 10. Repurchases (movers with ≥ 2 lead purchases)

```js
db.transactions.aggregate([
  { $match: {
      type: "Lead Purchase",
      date: { $gte: PILOT_START },
      status: "Completed"
  } },
  { $group: { _id: "$user", n: { $sum: 1 } } },
  { $match: { n: { $gte: 2 } } },
  { $count: "moversWith2Plus" }
]).toArray();
```

### 11. Average Revenue Per Mover (ARPM)

```js
db.transactions.aggregate([
  { $match: {
      type: "Lead Purchase",
      status: "Completed",
      date: { $gte: PILOT_START }
  } },
  { $group: { _id: "$user", revenue: { $sum: "$amount" } } },
  { $group: { _id: null, arpm: { $avg: "$revenue" }, n: { $sum: 1 } } }
]).toArray();
```

### 12. Average Lead Price

```js
db.transactions.aggregate([
  { $match: {
      type: "Lead Purchase",
      date: { $gte: PILOT_START },
      status: "Completed"
  } },
  { $group: { _id: null, avgPrice: { $avg: "$amount" }, n: { $sum: 1 } } }
]).toArray();
```

### 13. Average Time To First Purchase (median, for those who purchased)

```js
db.users.aggregate([
  { $match: { createdAt: { $gte: PILOT_START } } },
  { $lookup: {
      from: "transactions",
      let: { userId: "$_id" },
      pipeline: [
        { $match: {
            $expr: { $eq: ["$user", "$$userId"] },
            type: "Lead Purchase",
            status: "Completed"
        } },
        { $sort: { date: 1 } },
        { $limit: 1 }
      ],
      as: "firstPurchase"
  } },
  { $match: { firstPurchase: { $ne: [] } } },
  { $project: {
      _id: 1,
      hoursToPurchase: {
        $divide: [
          { $subtract: [ { $arrayElemAt: ["$firstPurchase.date", 0] }, "$createdAt" ] },
          3600000
        ]
      }
  } },
  { $sort: { hoursToPurchase: 1 } }
]).toArray();
// Take the median of the resulting array of hoursToPurchase values.
```

## §C — Halt-criteria spot checks

Run each of these every day. If any returns a row, **investigate before next day starts.**

### H1 — Double-charge events

```js
db.transactions.aggregate([
  { $match: { type: "Lead Purchase", date: { $gte: PILOT_START } } },
  { $group: { _id: "$purchasedLead", n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } }
]).toArray();
// Expected: empty array. Any row = TWO charges for ONE purchase.
```

### H2 — Negative balance

```js
db.users.find({ balance: { $lt: 0 } },
  { _id: 1, email: 1, balance: 1, companyName: 1 }).toArray();
// Expected: empty. Any row = balance went negative post-purchase.
```

### H3 — Stripe idempotency failures (E11000s on Transaction)

Search Render log for `E11000` or `duplicate key` errors against the `transactions` collection. Should be zero during pilot.

### H4 — Stuck `auctionStatus='buy_now'` leads

```js
db.leads.find({
  auctionStatus: "buy_now",
  updatedAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) }  // older than 1 hour
}).toArray();
// Expected: empty. The CAS sequence flips active → buy_now → sold quickly
// (or reverts to active on failure). A lead stuck in buy_now > 1 hour means
// a sequence broke mid-flight.
```

### H5 — Refund without PurchasedLead reversion

```js
db.transactions.find({
  type: { $in: ["Lead Refund", "Stripe Refund"] },
  date: { $gte: PILOT_START }
}).forEach(t => {
  const pl = db.purchasedleads.findOne({ _id: t.purchasedLead });
  if (pl && pl.refunded !== true) {
    print(`⚠ Refund Transaction ${t._id} but PurchasedLead.refunded != true`);
    printjson({ transaction: t._id, purchasedLead: pl._id, refunded: pl.refunded });
  }
});
// Expected: silent (no prints). Any output = ledger inconsistency.
```

### H6 — `/deals` log silence during business hours

In Render log search:
```
[Deals] mover=
```
filtered to the last 6 business hours (9 AM – 9 PM local time, weekdays). If zero matches and you know pilot movers should have been active, the SPA may not be reaching the server.

## §D — Daily log review checklist (5 min)

In Render log search, scan for:

| Pattern | What it means | Action |
|---|---|---|
| `[dispatchApprovedLead] dispatching` | New lead distributed | Note count; spot-check 1-2 |
| `[dispatchApprovedLead] suppressed` | Lead held — reason in the same line | Read reason; ok if expected (e.g. `distributionDecision=system_held`) |
| `[Bids] Buy-now error` | Purchase failure | **Investigate every occurrence** |
| `[Deals] mover=` | Mover hit Deal Room | Count unique mover IDs; correlate to your pilot cohort |
| `[Admin DealRoomSummary] error` | Summary endpoint 500 | **Investigate** |
| `[SmsStatus] sid=... status=failed` | SMS delivery failure | Note for refund discussion |
| `[reactivateLeads] candidates=... reactivated=N` | Cron tick | Should run every 5 min — silence = cron stopped |
| `[twilioWebhook] signature mismatch` | Twilio webhook URL wrong | **Investigate SERVER_URL env** |
| `E11000` or `duplicate key` | Mongo unique violation | **Investigate** — usually a race-condition signal |

## §E — Quick reference

| What | URL / Command |
|---|---|
| Production API | https://api.moveleads.cloud |
| Frontend | https://moveleads.cloud |
| Admin dashboard | https://moveleads.cloud/admin/leads |
| Mover dashboard | https://moveleads.cloud/dashboard/leads |
| Deal Room (mover) | https://moveleads.cloud/dashboard/deals |
| Deal Room summary (admin) | `curl -H "x-auth-token: $ADMIN_JWT" https://api.moveleads.cloud/api/admin/inventory/deal-room/summary` |
| Bulk inventory action (admin) | `POST https://api.moveleads.cloud/api/admin/inventory/bulk` with `{leadIds, action, dealPrice|discountPercent, reason}` |
| Lead diagnose (admin) | `curl -H "x-auth-token: $ADMIN_JWT" https://api.moveleads.cloud/api/admin/leads/$LEAD_ID/distribution-diagnose` |
| Claim attempts (admin) | `curl -H "x-auth-token: $ADMIN_JWT` "https://api.moveleads.cloud/api/admin/claim-attempts?limit=20"` |
| Render flag toggle | Render dashboard → moveleads-api service → Environment → `ENABLE_DEAL_ROOM` |
