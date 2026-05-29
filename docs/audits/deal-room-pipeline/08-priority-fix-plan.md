# 08 — Priority Fix Plan (Pre-Pilot)

Highest-confidence fixes only. Ordered by pilot-blocking → defense-in-depth → polish.

Each fix is small, isolated, additive. Estimated effort and exact files to touch given for each.

## F1 — Distinguish empty Deal Room from feature-off — **PILOT-BLOCKING**

### Problem
[R1](07-risks-and-bugs.md#r1). A misconfigured `ENABLE_DEAL_ROOM=false` produces a normal-looking empty Deal Room page indistinguishable from real zero inventory. Silent fake-UI risk.

### Fix
One small change. Options:

**Option A (recommended):** Server returns 200 with explicit shape when flag off.
```js
// server/routes/leads.js GET /deals
if (!isEnabled()) {
  return res.json({ enabled: false, leads: [] });
}
return res.json({ enabled: true, leads });
```
Client checks `enabled === false` and renders a distinct "Deal Room is temporarily unavailable" banner.

**Option B (smaller):** Keep 404, but client maps it to a visibly different state.
```jsx
// Deals.jsx
if (res.status === 404) {
  setFeatureDisabled(true);
  setLeads([]);
  return;
}
// ...later in render
{featureDisabled ? <DealRoomDisabledBanner /> : leads.length === 0 ? <EmptyState /> : <Grid />}
```

### Files touched
- [server/routes/leads.js](../../../server/routes/leads.js) (handler)
- [client/src/pages/dashboard/Deals.jsx](../../../client/src/pages/dashboard/Deals.jsx) (state + banner component)
- New lock-in test in `server/__tests__/dealRoomEmptyStateDistinction.test.js`

### Effort
~30 min. Pure additive. Backward compatible.

### Test invariant pinned
"When ENABLE_DEAL_ROOM=false the response is distinguishable client-side from a genuine empty-inventory response."

---

## F2 — Add `buyers.company !== me` to Deal Room read filter — **DEFENSE-IN-DEPTH**

### Problem
[R2](07-risks-and-bugs.md#r2). Main feed has `'buyers.company': { $ne: req.user.id }` at [leads.js#L184](../../../server/routes/leads.js#L184). Deal Room read endpoint omits it. Today protected by the admin write gate, but the read-path drift is real and untested.

### Fix
Add the same self-exclusion clause to the `/deals` query.

```js
// server/routes/leads.js GET /deals — current
const query = {
  inventoryChannel: 'deal_room',
  status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] },
  moveDate: { $gte: new Date() },
  ...moverVisibilityFilter(),
};

// AFTER
const query = {
  inventoryChannel: 'deal_room',
  status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] },
  moveDate: { $gte: new Date() },
  'buyers.company': { $ne: req.user.id },   // defense-in-depth (R2)
  ...moverVisibilityFilter(),
};
```

### Files touched
- [server/routes/leads.js](../../../server/routes/leads.js) (1 line)
- Lock-in regex in [server/__tests__/dealRoom.test.js](../../../server/__tests__/dealRoom.test.js)

### Effort
~15 min. Trivially safe — additive filter clause, can only narrow results.

### Test invariant pinned
"Mover never sees their own already-purchased lead on the Deal Room page, even if the admin gate is later loosened."

---

## F3 — Add read-side observability — **PRE-PILOT POLISH**

### Problem
[R4](07-risks-and-bugs.md#r4). No log on `/api/leads/deals` happy path. No way for operator to tell if the page is being hit.

### Fix
Two complementary additions:

**Part A:** One log line on the happy path.
```js
// server/routes/leads.js GET /deals
console.log(
  `[Deals] mover=${req.user.id} count=${leads.length} ` +
  `enabled=${isEnabled()} sort=updatedAt:-1`
);
```

**Part B:** One admin endpoint for Deal Room health.
```js
// server/routes/admin.js (or new server/routes/admin/dealRoomSummary.js)
router.get('/inventory/deal-room/summary', [auth, admin], async (req, res) => {
  const filter = { inventoryChannel: 'deal_room', status: { $in: [...] }, moveDate: { $gte: new Date() } };
  const [count, oldest, cheapest, mostRecentMoved] = await Promise.all([
    Lead.countDocuments(filter),
    Lead.find(filter).sort({ updatedAt: 1 }).select('_id buyNowPrice updatedAt').limit(1).lean(),
    Lead.find(filter).sort({ buyNowPrice: 1 }).select('_id buyNowPrice originalPrice').limit(1).lean(),
    Lead.find(filter).sort({ updatedAt: -1 }).select('_id updatedAt').limit(1).lean(),
  ]);
  res.json({ count, oldest: oldest[0], cheapest: cheapest[0], mostRecentMoved: mostRecentMoved[0] });
});
```

### Files touched
- [server/routes/leads.js](../../../server/routes/leads.js) (1 log line)
- New admin endpoint (~30 lines)
- New lock-in test

### Effort
~45 min total. Both pieces are read-only, no schema changes.

### Test invariant pinned
"Operators can answer 'is Deal Room being served?' and 'how stale is the Deal Room?' from logs + a single admin GET."

---

## F4 — Snapshot `inventoryChannel` on `Transaction` — **POST-PILOT (deferred)**

### Problem
[R3](07-risks-and-bugs.md#r3). `Transaction.description` does not encode channel; finance cannot split Deal Room revenue cleanly.

### Why deferred
Schema field add + write change + revert path. More invasive than F1–F3. Not pilot-blocking.

### Outline (for after pilot)
- Add `surfaceAtPurchase: String` field to `Transaction` schema.
- Write `lead.inventoryChannel` to it at purchase time in [bids.js#L172-181](../../../server/routes/bids.js#L172-L181).
- Backfill script for historical Transactions: `surfaceAtPurchase = 'main'` (best-effort).
- Lock-in test.

### Effort
~2 hours including backfill.

---

## Out-of-scope items intentionally deferred

| Item | Why deferred |
|---|---|
| `restore_to_main` notifiedAt clearing (R5) | Operator decision required — do we want forced re-broadcast or not? |
| Auction ghost field cleanup (R6) | Cosmetic; no behavior impact |
| Refunded Deal Room lead relist (R7) | Operator policy decision; same as marketplace refund behavior |
| PR-4 manifest awareness of channel (R8) | Acceptable as-is |

## Priority + sequencing summary

| Phase | Fix | Effort | Blocking? |
|---|---|---|---|
| Pre-flag-flip | F1 (empty state distinction) | 30 min | **YES** |
| Pre-flag-flip | F2 (buyers self-exclude) | 15 min | Defense-in-depth |
| Pre-flag-flip | F3 (observability) | 45 min | Polish (operator visibility) |
| Post-pilot | F4 (Transaction channel snapshot) | 2 hr | No |

**Total pre-pilot effort: ~1.5 hours of focused work + tests + CI = ~half a day with reviews.**

## Recommended sequence

1. **F1 first.** Fixes the only MEDIUM-severity gap. Smallest blast radius.
2. **F2 next.** Trivially safe additive filter clause.
3. **F3 last.** Most valuable for operator confidence during pilot but lowest risk.

Each is a small isolated PR following the same pattern as PR-3 through PR-6 — single concern, source-level + behavioral lock-in test, CI green, squash-merge.
