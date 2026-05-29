# 03 — Visibility & Query Filters

## The four visibility surfaces

| Surface | Endpoint | Filter clauses | Audience |
|---|---|---|---|
| **Admin inventory** | `GET /api/admin/...` paginated lists in [admin.js](../../../server/routes/admin.js) | none — admins see all `Lead` rows regardless of channel/decision/buyers | admin / super_admin |
| **Mover marketplace** | `GET /api/leads` (mover branch) [leads.js#L138-369](../../../server/routes/leads.js#L138-L369) | 6-clause AND (see below) | authenticated mover |
| **Mover Deal Room** | `GET /api/leads/deals` [leads.js#L95-133](../../../server/routes/leads.js#L95-L133) | 4-clause AND (see below) | authenticated user (no mover-role check) |
| **Mover "My Leads"** | `GET /api/purchases` [purchases.js](../../../server/routes/purchases.js) | `PurchasedLead.company = req.user.id` | authenticated mover |

## Side-by-side: main feed vs Deal Room query filter

| Clause | Mover marketplace (`GET /api/leads`) | Mover Deal Room (`GET /api/leads/deals`) |
|---|---|---|
| **surface** | `inventoryChannel: { $nin: ['deal_room', 'archived'] }` | `inventoryChannel: 'deal_room'` |
| **lifecycle** | `status: { $in: ['Available', 'READY_FOR_DISTRIBUTION'] }` | identical |
| **time** | `moveDate: { $gte: new Date() }` | identical |
| **quality (Phase 3)** | `...moverVisibilityFilter()` → `distributionDecision: { $in: ['system_approved','admin_approved'] }` | identical |
| **source** | `$or: [{sourceCompany: {$exists:false}}, {sourceCompany: req.user.id}]` | **MISSING** |
| **self-exclusion** | `'buyers.company': { $ne: req.user.id }` | **MISSING** |
| **sort** | `{distributionDecisionAt: -1, createdAt: -1}` | `{updatedAt: -1}` |
| **expiry sweep side-effect** | `Lead.updateMany(...)` runs every request | none |
| **per-doc annotation** | `_matchesPreferences` (strict matcher) | `discountPercent` |
| **PII redaction** | per-doc post-process keyed on `buyers.company === me` | DB-level `.select('-customerName -customerPhone -customerEmail -...')` |

### Filter-by-filter — why each gate exists

#### 1. Surface — `inventoryChannel`

| Value | Main feed | Deal Room | Why |
|---|---|---|---|
| `'main'` | ✅ visible | ❌ hidden | default channel |
| `'deal_room'` | ❌ hidden | ✅ visible | exclusive — leads belong to one surface at a time |
| `'archived'` | ❌ hidden | ❌ hidden | dead inventory |
| `undefined` / missing | ✅ visible (legacy back-compat: $nin allows missing) | ❌ hidden (`$eq` fails) | safe — legacy leads sit on main |

**No "Lead can appear in BOTH feeds" risk.** The `$nin` vs `$eq` pair
is mutually exclusive. Confirmed by behavioral test in
[server/__tests__/dealRoom.test.js#L143-214](../../../server/__tests__/dealRoom.test.js#L143-L214).

#### 2. Lifecycle — `status`

Both feeds require `status ∈ {Available, READY_FOR_DISTRIBUTION}`. This
excludes:

- `'Pending Verification'` — V5 lead pre-pipeline
- `'Purchased'` — already bought
- `'Expired'` — past moveDate
- `'PENDING_MANUAL_REVIEW'` — V5 Phase 6.8 holding state
- `'Rejected'` — admin rejected

#### 3. Time — `moveDate`

Both feeds require `moveDate ≥ now`. A move date in the past hides the
lead immediately.

**Asymmetry:** main feed ALSO runs an `updateMany` to convert
`READY_FOR_DISTRIBUTION + moveDate < now → status:'Expired',
auctionStatus:'expired'` at [leads.js#L196-203](../../../server/routes/leads.js#L196-L203).
Deal Room does NOT. Deal Room leads whose `moveDate` lapses just
disappear from the response (the `$gte` filter blocks them) but their
`status` field stays whatever it was. **R-cosmetic:** lifecycle status
on stale Deal Room leads becomes inaccurate over time. Doesn't affect
visibility downstream (everywhere else also filters by `moveDate` or
similar) but reporting queries that count `status='Available'` will
over-count.

#### 4. Quality — `distributionDecision`

Both feeds call `moverVisibilityFilter()` from
[server/utils/leadVisibility.js#L121-123](../../../server/utils/leadVisibility.js#L121-L123):

```js
function moverVisibilityFilter() {
  return { distributionDecision: { $in: ['system_approved', 'admin_approved'] } };
}
```

The Phase 3 quality gate. A lead with `distributionDecision='system_held'`
(scoring tier = review) or `'system_rejected'` (tier = rejected, hard
fail) is HIDDEN from BOTH the main feed and Deal Room. **This is the
single most important reuse** — it means admin cannot accidentally
surface a held lead by moving it into Deal Room.

The admin write-side gate (`dealRoomMoveBlockReason` at
[adminInventory.js#L62-83](../../../server/routes/adminInventory.js#L62-L83))
ALSO checks `isDistributable` as a precondition, so a held lead can't
even be moved. Defense-in-depth: even if the write gate were bypassed,
the read gate would still hide the lead from movers.

#### 5. Source — `sourceCompany` (main feed ONLY)

Main feed: `$or: [{sourceCompany: {$exists:false}}, {sourceCompany: req.user.id}]`
— a mover sees public marketplace leads AND their own widget-sourced leads.

Deal Room: clause omitted. A widget-sourced lead in Deal Room would
appear to ANY mover, not just the company that owns the widget. In
practice, widget leads probably never get demoted to Deal Room (no admin
workflow advertises this and there's no protective check), so this is a
**theoretical drift** — but worth flagging as defense-in-depth.

#### 6. Self-exclusion — `buyers.company` (main feed ONLY)

Main feed: `'buyers.company': { $ne: req.user.id }` at
[leads.js#L184](../../../server/routes/leads.js#L184).

Comment at [L176-184](../../../server/routes/leads.js#L176-L184):

> Belt-and-suspenders: explicitly exclude leads where this mover is
> already a buyer. The lifecycle filter above already excludes most
> purchased leads (they get status='Purchased' on buy-now), but
> legacy multi-buyer leads (claim flow with maxBuyers > 1) can
> remain Available after one mover has bought a slot.

Deal Room: clause omitted. **R2 drift bug** — see [07-risks-and-bugs.md](07-risks-and-bugs.md).

**Real-world impact today:** the admin write gate forbids
`move_to_deal_room` on leads with non-empty `buyers` ([L153-157](../../../server/routes/adminInventory.js#L153-L157)),
so a multi-buyer-mid-purchase lead can't enter Deal Room in the first
place. The asymmetry is therefore protected by the upstream gate. But:

- defense-in-depth is missing
- if the upstream gate is ever loosened (e.g. operator allows partial-
  buyer leads into Deal Room), self-exclusion breaks silently
- no behavioral test pins this — see [09-tests in 07-risks-and-bugs.md](07-risks-and-bugs.md)

## Why a Deal Room lead is visible

A Deal Room lead is returned to the mover IFF ALL FOUR are true:

1. `inventoryChannel === 'deal_room'`
2. `status ∈ {Available, READY_FOR_DISTRIBUTION}`
3. `moveDate ≥ now`
4. `distributionDecision ∈ {system_approved, admin_approved}`

…and `ENABLE_DEAL_ROOM` is on.

## Why a Deal Room lead is hidden

Most common reasons (in observed-frequency order):

1. **`ENABLE_DEAL_ROOM=false`** → 404, mover sees empty page
2. **Lead has been `restore_to_main`'d** — `inventoryChannel='main'` no longer matches
3. **Lead was purchased** — `status='Purchased'` fails clause 2
4. **`moveDate` lapsed** — fails clause 3
5. **Admin set `distributionDecision='system_held'`** somewhere upstream (rare; admin-write gate would refuse `move_to_deal_room` in this state, but if `restore_to_main` left a lead at `system_held`, the read gate hides it)

## My Leads visibility — out of Deal Room scope but for completeness

`GET /api/purchases` ([purchases.js](../../../server/routes/purchases.js))
returns `PurchasedLead` rows where `company = req.user.id`. The Deal
Room mover unlock writes a `PurchasedLead` row via the canonical buy-now
path (see [05-purchase-and-financial-flow.md](05-purchase-and-financial-flow.md)),
so the unlocked lead appears in My Leads automatically. No Deal Room
divergence.

## Admin inventory visibility

[admin.js](../../../server/routes/admin.js) admin lead lookups have NO
mover-side filter. Admins can see every lead regardless of channel /
decision / lifecycle. The admin Deal Room view is just `AdminLeads.jsx`
with the `channelFilter` dropdown set to `'deal_room'` — a UI-side filter
over the same paginated list endpoint.

## Conclusion — separate or reused logic?

**Reused for the four axes that matter.** Same `distributionDecision`
gate (Phase 3 quality). Same lifecycle filter. Same `moveDate` gate.
The surface clause is the only deliberate divergence.

**Drifted for two peripheral guards** that the main feed has and Deal
Room doesn't:

1. `sourceCompany` scoping (widget privacy)
2. `buyers.company` self-exclusion (multi-buyer defense)

Both are protected by upstream gates today, but the read-path drift is
real and untested. Drift candidate for a defensive PR. See R2 in
[07-risks-and-bugs.md](07-risks-and-bugs.md) and F2 in
[08-priority-fix-plan.md](08-priority-fix-plan.md).
