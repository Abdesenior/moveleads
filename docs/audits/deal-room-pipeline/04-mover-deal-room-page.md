# 04 — Mover Deal Room Page

## Frontend

### Route

| Item | File | Line |
|---|---|---|
| Lazy import | [client/src/App.jsx](../../../client/src/App.jsx) | L42 |
| Route mount | same | L119 |
| Auth gate | `<ProtectedRoute>` only — no mover-role check, no env-flag check | L119 |
| Sidebar nav entry | [client/src/components/DashboardLayout.jsx](../../../client/src/components/DashboardLayout.jsx) | L20 (third item, between "Live Leads" and "Instant Jobs") |

### Component

[client/src/pages/dashboard/Deals.jsx](../../../client/src/pages/dashboard/Deals.jsx)
— 430 lines, single-file page with `Deals`, `UnlockConfirmModal`, `DealCard`, `QualityTag` sub-components.

### Data fetch

[Deals.jsx#L46-66](../../../client/src/pages/dashboard/Deals.jsx#L46-L66):

```js
const res = await fetch(`${API_URL}/leads/deals`, {
  headers: { 'x-auth-token': token },
});
if (res.status === 404) {
  // Feature is gated off on the server — render the empty state, not an error.
  setLeads([]);
  return;
}
```

- Endpoint: `GET /api/leads/deals`
- No query params, no pagination
- Trigger: one `useEffect` on mount ([L68](../../../client/src/pages/dashboard/Deals.jsx#L68)) + manual refresh button ([L164-167](../../../client/src/pages/dashboard/Deals.jsx#L164-L167))
- **No polling, no socket subscription** — explicit choice (header comment [L24](../../../client/src/pages/dashboard/Deals.jsx#L24): "No socket 'new deal' emit — page is poll-on-refresh")
- 404 silently maps to "empty array" — **R1 risk**, see below

### Rendered states

| State | What renders | Distinguishable from? |
|---|---|---|
| Loading | refresh button shows `Loading…` ([L166](../../../client/src/pages/dashboard/Deals.jsx#L166)). No skeleton/spinner elsewhere | yes |
| Error | red banner with `AlertCircle` icon ([L170-174](../../../client/src/pages/dashboard/Deals.jsx#L170-L174)) | yes |
| Empty | tag icon + "No deals available right now / Check back soon — new discounted inventory is added regularly." ([L179-185](../../../client/src/pages/dashboard/Deals.jsx#L179-L185)) | **NO** — same UI for: feature off, real zero inventory, all inventory filtered out |
| Populated | grid `repeat(auto-fill, minmax(320px, 1fr))` of `<DealCard>` ([L188](../../../client/src/pages/dashboard/Deals.jsx#L188)) | yes |

### Sort / pagination / filter

- **Server-sorted.** Client does not re-sort.
- **No pagination.** Client renders every lead the server returned.
- **Single client-side filter:** free-text search over `originCity`,
  `destinationCity`, `homeSize` ([L114-119](../../../client/src/pages/dashboard/Deals.jsx#L114-L119)).

### Per-card fields (`DealCard`)

[Deals.jsx#L359-429](../../../client/src/pages/dashboard/Deals.jsx#L359-L429):

- Discount badge `−${pct}% OFF` — uses server's `lead.discountPercent`, falls back to client recompute
- Route `originCity → destinationCity`
- `distance` string + `miles`
- `homeSize`, formatted `moveDate`
- Pricing: line-through `originalPrice`, large `buyNowPrice`, teal Unlock button

**Notably NOT rendered:**
- Lead age (no `createdAt` / `distributionDecisionAt` shown)
- Tier / quality tags (those appear only inside the confirm modal at [L271-277](../../../client/src/pages/dashboard/Deals.jsx#L271-L277))
- "Matches your setup" badge

### Two-step purchase flow

1. Card "Unlock $X" button → `openConfirm(lead)` ([L417, L71-74](../../../client/src/pages/dashboard/Deals.jsx#L71-L74)) — opens `UnlockConfirmModal` (pure UI, no API).
2. Modal "Confirm Unlock" → `submitConfirmedUnlock` ([L80-112](../../../client/src/pages/dashboard/Deals.jsx#L80-L112)):
   ```js
   fetch(`${API_URL}/bids/${leadId}/buy-now`, { method: 'POST', headers: {...} })
   ```

Header comment confirms intent: *"no new money path; same atomic claim
+ balance debit + PurchasedLead + Transaction as the Live Feed."*

On success: modal closes, green banner "Unlocked $X — route is now in
your My Leads" with `<Link to="/dashboard/my-leads">` ([L134-156](../../../client/src/pages/dashboard/Deals.jsx#L134-L156)),
`refreshUser()` to update balance, `fetchDeals()` refetches list.

---

## Backend read endpoint

### Handler

[server/routes/leads.js#L95-133](../../../server/routes/leads.js#L95-L133):

```js
router.get('/deals', auth, async (req, res) => {
  const { isEnabled } = require('../utils/dealRoomFeature');
  if (!isEnabled()) {
    return res.status(404).json({ msg: 'Deal Room is not enabled' });
  }
  try {
    const query = {
      inventoryChannel: 'deal_room',
      status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] },
      moveDate: { $gte: new Date() },
      ...moverVisibilityFilter(),
    };

    let leads = await Lead.find(query)
      .select('-customerName -customerPhone -customerEmail -specialInstructions -customerNotes -notifiedAt')
      .sort({ updatedAt: -1 })
      .lean();

    leads = leads.map(l => {
      const orig = Number(l.originalPrice) || 0;
      const now = Number(l.buyNowPrice) || 0;
      const discountPercent = (orig > 0 && now < orig)
        ? Math.round((1 - now / orig) * 100)
        : 0;
      return { ...l, discountPercent };
    });

    res.json(leads);
  } catch (err) {
    console.error('[Deals Endpoint] error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});
```

### Mount + middleware

- Mount: [server.js#L140](../../../server/server.js#L140) under `verifiedGate = [auth, requireEmailVerified]`.
- Route-level: just `auth` (router-level gate already includes `requireEmailVerified`).
- Env gate: `dealRoomFeature.isEnabled()` → 404 if flag off.

### Query (filter, sort, projection)

| Clause | Value |
|---|---|
| `inventoryChannel` | `'deal_room'` |
| `status` | `{$in: ['Available', 'READY_FOR_DISTRIBUTION']}` |
| `moveDate` | `{$gte: new Date()}` |
| `distributionDecision` (via helper) | `{$in: ['system_approved', 'admin_approved']}` |
| Sort | `{updatedAt: -1}` — most recently mutated first |
| Pagination | none |
| Projection | strip `customerName`, `customerPhone`, `customerEmail`, `specialInstructions`, `customerNotes`, `notifiedAt` |

### Per-lead enrichment

`discountPercent: number` — computed at READ time from `originalPrice`
vs `buyNowPrice`. Cosmetic. The persisted authoritative price is
`buyNowPrice`. See [05-purchase-and-financial-flow.md](05-purchase-and-financial-flow.md)
for why this is not a tamper vector.

### Response shape

Raw array of lean lead docs. No wrapper object, no totals, no pagination
metadata.

```json
[
  {
    "_id": "...",
    "inventoryChannel": "deal_room",
    "buyNowPrice": 150,
    "originalPrice": 250,
    "discountPercent": 40,
    "originCity": "Dallas", "originState": "TX", ...
  },
  ...
]
```

---

## Observability gaps

| Gap | Where | Impact |
|---|---|---|
| No happy-path log on `/deals` | [leads.js#L130](../../../server/routes/leads.js#L130) only logs on `catch` | Operator can't tell from logs whether anyone is hitting Deal Room or how many leads serve |
| No "feature off" log | 404 returns silently | If someone misconfigures `ENABLE_DEAL_ROOM`, no log signal — must check responses directly |
| No admin Deal Room dashboard | None exists | To audit Deal Room inventory, admin must load `AdminLeads.jsx` and filter by `channelFilter='deal_room'` — no count/age/freshness summary anywhere |
| No `Transaction` channel tagging | [bids.js#L178](../../../server/routes/bids.js#L178) | Finance cannot split Deal Room vs marketplace revenue without joining `Transaction.lead → Lead.inventoryChannel` — lossy after subsequent `restore_to_main` |

## Frontend-side observability gap (R1)

The Deals page maps `404 → setLeads([])` with no banner / toast / nav-
hide. A mover hitting an off-flag Deal Room sees:

> Tag icon · "No deals available right now" · "Check back soon — new
> discounted inventory is added regularly."

The same message renders when:
- `ENABLE_DEAL_ROOM=false`
- inventory is genuinely empty
- all inventory was filtered out (e.g. all leads' `moveDate` lapsed)

**Pilot risk:** if the flag is misconfigured or accidentally toggled in
prod, every mover sees a normal-looking but permanently empty Deal Room.
The Deal Room nav link stays in the sidebar. There is no signal to the
mover that the feature is unavailable, and no signal to the operator
that movers are seeing empty pages.

**Recommended fix** (F1 in [08-priority-fix-plan.md](08-priority-fix-plan.md)):

- Have `/deals` return `{enabled: false, leads: []}` instead of 404 when flag off
- OR have the page show a distinct "Deal Room is currently disabled" banner on 404
- OR hide the sidebar nav link when the most recent `/deals` call returned 404
