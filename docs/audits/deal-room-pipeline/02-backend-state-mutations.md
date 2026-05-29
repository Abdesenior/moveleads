# 02 — Backend State Mutations

Every field every Deal Room action writes to `Lead`. All mutations live in
[server/routes/adminInventory.js](../../../server/routes/adminInventory.js).
There are no other writers of `inventoryChannel='deal_room'` in the
codebase (grep-verified).

## action: `move_to_deal_room`

Mutation block: [adminInventory.js#L206-239](../../../server/routes/adminInventory.js#L206-L239)

```js
if (lead.originalPrice == null) {
  lead.originalPrice = lead.buyNowPrice;          // snapshot once
}
let dp;
if (dealPrice !== undefined && dealPrice !== null && dealPrice !== '') {
  dp = Number(dealPrice);
} else {
  const pct = Number(discountPercent);
  dp = Math.max(1, Math.round(lead.originalPrice * (1 - pct / 100)));
}
if (dp > lead.originalPrice) { rejected.push(...); continue; }
lead.buyNowPrice = dp;
lead.inventoryChannel = 'deal_room';
if (lead.auctionStatus === 'active') {
  lead.auctionStatus = 'expired';
}
await lead.save();
```

| Field | Touched? | Set to | Notes |
|---|---|---|---|
| `inventoryChannel` | ✅ | `'deal_room'` | the surface flip |
| `buyNowPrice` | ✅ | `dealPrice` OR `round(originalPrice * (1 − pct/100))` | discounted price |
| `originalPrice` | conditional | `lead.buyNowPrice` (snapshot) | only when null — repeated moves preserve the original anchor |
| `auctionStatus` | conditional | `'expired'` IFF was `'active'` | otherwise unchanged |
| `auctionEndsAt` | ❌ | unchanged | **ghost field** — see R6 in 07-risks-and-bugs.md |
| `status` | ❌ | unchanged (still `'Available'` or `'READY_FOR_DISTRIBUTION'`) | lifecycle gated as precondition only |
| `distributionDecision` | ❌ | unchanged | gated as precondition only |
| `distributionDecisionAt/By/Reason` | ❌ | unchanged | |
| `qualityGateCleared` | ❌ | unchanged | |
| `shadowTier` | ❌ | unchanged | |
| `notifiedAt` | ❌ | unchanged | dedup state preserved |
| `claimWindow` | ❌ | unchanged | |
| `buyers` | ❌ | unchanged | gated as precondition (must be empty) |
| `distributionModel` | ❌ | unchanged | |
| `lastBroadcastAttemptAt` (PR-4 manifest) | ❌ | unchanged | may show stale state from prior dispatch |
| `lastBroadcastSuppressReason` | ❌ | unchanged | same |
| `lastBroadcastMatchedCount` | ❌ | unchanged | same |
| `updatedAt` | ✅ implicit | `Date.now()` | Mongoose timestamp; drives `/deals` sort |

### Side effects

- `lead.save()` (Mongoose document save, not `findOneAndUpdate($set:)`).
- `logAdminAction(...)` audit row at [L263-275](../../../server/routes/adminInventory.js#L263-L275) — fire-and-forget.
- **NOT called:** `dispatchApprovedLead`, `broadcastLeadSMS`,
  `broadcastLeadEmail`, `emitNewLead`, `openClaimWindow`,
  `Transaction.create`, anything that touches `PurchasedLead`, `User.balance`.

### Why no orchestrator?

Intentional. Deal Room is browse-only — movers find leads by pulling
`GET /api/leads/deals`, not by being pushed. There is no SMS/email
broadcast on Deal Room moves. This is correct design for a discount-
catalog surface; mirrors a typical e-commerce promotion (you don't text
every customer when a single SKU goes on sale).

---

## action: `archive`

Mutation block: [adminInventory.js#L240-241](../../../server/routes/adminInventory.js#L240-L241)

| Field | Touched? | Set to |
|---|---|---|
| `inventoryChannel` | ✅ | `'archived'` |

Nothing else. Archived leads disappear from both the main feed (`$nin:
['deal_room', 'archived']`) and the Deal Room read (`inventoryChannel:
'deal_room'`).

---

## action: `restore_to_main`

Mutation block: [adminInventory.js#L242-252](../../../server/routes/adminInventory.js#L242-L252)

```js
case 'restore_to_main': {
  if (lead.originalPrice != null) {
    lead.buyNowPrice = lead.originalPrice;
  }
  lead.inventoryChannel = 'main';
  // distributionModel deliberately untouched — see docstring
  break;
}
```

| Field | Touched? | Set to | Notes |
|---|---|---|---|
| `inventoryChannel` | ✅ | `'main'` | back to default surface |
| `buyNowPrice` | conditional | `originalPrice` | only when `originalPrice != null` |
| `originalPrice` | ❌ | unchanged | NOT cleared — re-move retains the original anchor |
| `distributionModel` | ❌ | unchanged | **important** — see notes |
| `auctionStatus` | ❌ | unchanged | does NOT re-flip `'expired'` → `'active'` |
| `auctionEndsAt` | ❌ | unchanged | |
| everything else | ❌ | unchanged | |

### Important — distributionModel hazard

The docstring at [adminInventory.js#L8-16](../../../server/routes/adminInventory.js#L8-L16) explicitly admits:

> If a lead's `distributionModel === 'auction'`, `restore_to_main`
> returns it to `inventoryChannel='main'` BUT the main feed at
> `GET /api/leads` filters auction-stamped leads out under Phase D.
> Result: `restore_to_main` is functionally a half-action for legacy
> auction leads.

There is no admin UI to re-stamp `distributionModel='instant'`. Operator
implication: only `distributionModel='instant'` leads can be cleanly
round-tripped Deal Room → Main. Older auction-stamped leads get stuck.

### Important — no orchestrator on restore

`dispatchApprovedLead` is NOT called. A lead restored to `'main'`
becomes feed-eligible by passive polling (mover refreshes their
dashboard), not via SMS/email/socket push. This is documented as
known-issue F-11 in
[docs/audits/launch-readiness/HIGH-CONFIDENCE-FIX-PLAN.md#L134](../launch-readiness/HIGH-CONFIDENCE-FIX-PLAN.md#L134),
explicitly out of pilot scope while `ENABLE_DEAL_ROOM=false`.

---

## Audit log emission

[adminInventory.js#L263-275](../../../server/routes/adminInventory.js#L263-L275):

```js
logAdminAction({
  actor:      req.user.id,
  action:     `lead.inventory.${action}`,        // e.g. 'lead.inventory.move_to_deal_room'
  targetType: 'lead',
  targetId:   lead._id,
  before: { inventoryChannel, buyNowPrice, originalPrice, auctionStatus },
  after:  { inventoryChannel, buyNowPrice, originalPrice, auctionStatus },
  metadata: { dealPrice, discountPercent, reason }
});
```

Fire-and-forget (failures swallowed, never thrown).

Captures: channel transition + price mutation + auctionStatus side-effect.

**Does NOT capture:** which Lead.status the lead was in, the Phase 3
`distributionDecision` state, or anything about broadcast state. If you
later want to reconstruct "what was the state of this Deal Room lead at
the moment of move?", `before`/`after` give you the 4 mutated fields but
not the unchanged ones — would need a separate `ScoringSnapshot`-style
write to pin full context.

---

## Persistence shape — Mongoose save vs findOneAndUpdate

Note: the mutation uses `await lead.save()` (Mongoose document save),
NOT `findOneAndUpdate({}, {$set: ...})`. Implications:

- The full document is loaded into memory, mutated, written back.
- Mongoose pre/post-save hooks fire (none currently defined on Lead).
- Race window: another writer mutating the same lead between load and
  save will silently overwrite based on Mongoose's last-write-wins.
- The bulk loop is sequential (not `Promise.all`) so two bulk actions
  on overlapping leads race only across operators, not within one
  request.

This is acceptable for the current scope but is NOT the same atomic
shape as the canonical buy-now (which uses `findOneAndUpdate` with a
CAS filter). Operator should know: a same-lead `move_to_deal_room` and
`restore_to_main` fired simultaneously by two admins will collide and
the latter-saved write wins silently — no E11000.
