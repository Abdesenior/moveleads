# 01 — Admin Entry Point & Routing

## Routing diagram (admin → backend)

```
[Admin: /admin/leads]                                                  [Server]
                                                                       │
client/src/pages/admin/AdminLeads.jsx                                   │
                                                                       │
  ┌─ row checkbox → selectedIds (Set<string>)                          │
  │                                                                    │
  └─ when |selectedIds| > 0:                                           │
       ┌───────────────────────────────────────┐                       │
       │  Bulk action bar (L961-995)          │                       │
       │   ├─ "Move to Deal Room" → modal     │                       │
       │   ├─ "Archive"                       │                       │
       │   ├─ "Restore to Main"               │                       │
       │   └─ "Clear selection"               │                       │
       └───────────────────────────────────────┘                       │
                                                                       │
  Modal (L1005-1070):                                                  │
    dealMode: 'price' | 'percent'                                      │
    dealPrice OR discountPercent                                        │
    reason (optional)                                                   │
            │                                                          │
            ▼                                                          │
  submitMoveToDealRoom() → callInventoryBulk(body):                    │
                                                                       │
       fetch(`${API_URL}/admin/inventory/bulk`, POST, JSON)            │
       headers: x-auth-token: <jwt>                                    │
       body: { leadIds, action: 'move_to_deal_room',                   │
               dealPrice? | discountPercent?, reason? }                │
            │                                                          │
            └──────────────────────────────────────────────────────────▶│
                                                                       │
                                                              server.js#L173
                                                                       │
                                  app.use('/api/admin/inventory',      │
                                          verifiedGate,                │
                                          adminInventory router)       │
                                                                       │
                                  verifiedGate = [auth, requireEmailVerified]
                                                                       │
                                                                       ▼
                                  server/routes/adminInventory.js#L85
                                                                       │
                                  router.post('/bulk', [auth, admin], handler)
                                                                       │
                                  admin middleware:                    │
                                    auth.js#L29-35 — role IN {admin, super_admin}
                                                                       │
                                  Handler:                             │
                                    1. isEnabled() → 503 if flag off  │
                                    2. validate body (XOR price/pct)  │
                                    3. for each leadId:                │
                                       ├─ load Lead                    │
                                       ├─ gate (buyers / purchased / lifecycle / quality)
                                       ├─ mutate (see 02-...)          │
                                       └─ logAdminAction(before, after)
                                    4. return { processed[], rejected[] }
```

## Files & line numbers

| Surface | File | Lines |
|---|---|---|
| Admin route mount | [client/src/App.jsx](../../../client/src/App.jsx) | L122 |
| Admin page | [client/src/pages/admin/AdminLeads.jsx](../../../client/src/pages/admin/AdminLeads.jsx) | full file |
| Bulk action bar | same | L961-995 |
| Move-to-Deal-Room modal | same | L1005-1070 |
| `callInventoryBulk` (shared POST) | same | L722-768 |
| `submitMoveToDealRoom` | same | L770-794 |
| `submitArchive` | same | L796-801 |
| `submitRestoreToMain` | same | L803-818 |
| Server mount | [server/server.js](../../../server/server.js) | L173 |
| `auth` + `admin` middleware | [server/middleware/auth.js](../../../server/middleware/auth.js) | L29-35 (admin role check) |
| Backend handler | [server/routes/adminInventory.js](../../../server/routes/adminInventory.js) | L85-291 |
| Env flag util | [server/utils/dealRoomFeature.js](../../../server/utils/dealRoomFeature.js) | L18-21 |
| `isDistributable` (Phase 3 gate) | [server/utils/distributionDecision.js](../../../server/utils/distributionDecision.js) | exported helper used at adminInventory.js L62-83 |
| `logAdminAction` (audit) | [server/utils/auditLog.js](../../../server/utils/auditLog.js) | L6-13 (fire-and-forget) |

## Request payload

```http
POST /api/admin/inventory/bulk
x-auth-token: <jwt>
Content-Type: application/json

{
  "leadIds": ["6a18776331f...", "..."],
  "action": "move_to_deal_room" | "archive" | "restore_to_main",
  "dealPrice": 99,                    // mutually exclusive with discountPercent
  "discountPercent": 40,              // (XOR validated at L108-110)
  "reason": "slow-moving inventory"   // optional audit metadata
}
```

## Auth checks

- **Frontend route gate:** `<ProtectedRoute requireAdmin>` at [App.jsx#L122](../../../client/src/App.jsx#L122).
- **Frontend in-component:** none. The bulk-action bar is always rendered when selection > 0; there is no `ENABLE_DEAL_ROOM` UI guard.
- **Backend gate stack:** `verifiedGate` (auth + email verified) at the router mount, then `[auth, admin]` at the route handler. `admin` middleware accepts `role ∈ {admin, super_admin}` ([auth.js#L29-35](../../../server/middleware/auth.js#L29-L35)).
- **Feature flag gate:** `isEnabled()` → 503 if `ENABLE_DEAL_ROOM` is not exactly `'true'` or `'1'`.

## Validation (frontend)

| Check | Where | Behavior on fail |
|---|---|---|
| `dealMode='price'` → `dealPrice > 0` | AdminLeads.jsx L778-783 | inline error, no submit |
| `dealMode='percent'` → `1 < pct < 99` | L785-789 | inline error |
| `selectedIds` non-empty | L770 | button disabled |
| Archive confirms via `window.confirm` | L799 | user cancel → no-op |
| Restore confirms via `window.confirm` | L807-815 | user cancel → no-op; copy explicitly warns "does NOT auto-promote to Live Feed" |

## Validation (backend)

| Check | Lines | Behavior on fail |
|---|---|---|
| Flag on | L86-88 | 503 `Deal Room is disabled` |
| `leadIds` non-empty array, ≤ MAX_BULK=200 | L105-107 | 400 `leadIds must be a non-empty array (max 200)` |
| `action` in 3-value enum | L102-104 | 400 |
| XOR `dealPrice` vs `discountPercent` | L108-110 | 400 (only `move_to_deal_room`) |
| `dealPrice > 0` | L113 | 400 |
| `0 < discountPercent < 100` | L119 | 400 |
| Per-id `isValidObjectId` | L133 | per-id rejection (HTTP 200 with row in `rejected[]`) |
| Lead exists | L141-148 | per-id rejection |
| Purchased protection (`buyers.length > 0 || status='Purchased'`) | L153-157 | per-id rejection (all 3 actions) |
| Lifecycle gates (for `move_to_deal_room` only): | L159-171 | per-id rejection prefixed `Lifecycle:` |
|  · `moveDate > now` | L161-165 |  |
|  · `status !== 'Expired'` | L167-168 |  |
|  · `status IN {Available, READY_FOR_DISTRIBUTION}` | L170-171 |  |
| Quality precondition (Phase 3) | L173-181 | per-id rejection prefixed `Quality:` |
| `dp ≤ originalPrice` (sanity) | L225-231 | per-id rejection |

## Cross-references

The route's `require`s ([L34-41](../../../server/routes/adminInventory.js#L34-L41)):

- `mongoose`, `express` — boilerplate
- `../middleware/auth` → `{auth, admin}`
- `../models/Lead`
- `../utils/auditLog` → `{logAdminAction}`
- `../utils/dealRoomFeature` → `{isEnabled}`
- `../utils/distributionDecision` → `{isDistributable, describeSystemDecisionSource}`

**NOT imported (significant absences):**

- `services/dispatchOrchestrator` (`dispatchApprovedLead`) — **no broadcast on move or restore**. See [R5 in 07-risks-and-bugs.md](07-risks-and-bugs.md).
- `utils/leadVisibility` — admin doesn't apply `moverVisibilityFilter()` directly, but the Phase 3 `isDistributable` check is the equivalent precondition.
- No `socket.io` / `emitNewLead` / `broadcastLeadSold` — Deal Room mutations don't push.
- No `PlatformSettings` — no DB-backed defaults; admin must supply price/percent per move.

## Response shape

```json
{
  "ok": true,
  "action": "move_to_deal_room",
  "processedCount": 12,
  "rejectedCount": 3,
  "processed": [
    {
      "leadId": "6a18776331f...",
      "action": "move_to_deal_room",
      "before": {"inventoryChannel": "main", "buyNowPrice": 250, "originalPrice": null, "auctionStatus": "active"},
      "after":  {"inventoryChannel": "deal_room", "buyNowPrice": 150, "originalPrice": 250, "auctionStatus": "expired"}
    }
  ],
  "rejected": [
    {"leadId": "...", "reason": "Quality: lead is currently held for admin review"}
  ]
}
```

Always HTTP 200 on per-lead failures (caught and reported in `rejected[]`).
Flag-off → 503. Bad payload → 400. Genuine server crash → 500 (no
per-lead try/catch at L278-281 catches per-iteration faults).
