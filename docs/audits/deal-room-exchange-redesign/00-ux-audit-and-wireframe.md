# Deal Room — Exchange Redesign: UX Audit + Wireframe

**Date:** 2026-05-29
**Premise:** Make Deal Room an **inventory exchange** (browse → scan → buy fast), not a card marketplace. Pack-ready data model. Single-lead AND package purchases. Canonical buy-now untouched. No schema changes pre-pilot.

## §1 — UX audit of current Deals.jsx

The current implementation is a responsive grid of cards (`Deals.jsx#L188`: `display:grid; gridTemplateColumns: repeat(auto-fill, minmax(320px, 1fr))`).

| Aspect | Current state | Issue |
|---|---|---|
| **Layout** | Cards in 1-3 column responsive grid | Slow to scan. Movers must read each card to compare route + price. |
| **Information density** | One lead per card; ~120px high; 5 fields (route, distance, size, date, price) | Low density. Page shows 12 cards before requiring scroll on 1440px viewport. |
| **Comparison** | Side-by-side requires eye-tracking across cards | Hard to compare prices for similar routes. The discount badge `-X% OFF` is local; no anchor to "what's the typical price". |
| **Sort** | Server-sorted by `updatedAt desc` (not even surfaced in UI) | UI presents no sort affordance. Movers cannot re-sort by price, route, age. |
| **Filtering** | Single free-text search over city/home-size | No price filter, no distance filter, no route filter, no "matches my coverage" toggle. |
| **Action** | "Unlock $X" button per card → confirm modal → POST | Two-step purchase (button + modal) is correct UX. The button is the same per-card hot path, no bulk action. |
| **Discount affordance** | `-X% OFF` badge in red ribbon on each card | Visual nice; quantitatively imprecise. A 40%-off $400 lead and a 5%-off $50 lead look equally "discounted." |
| **Coverage match** | None on the card | Mover has no signal whether a Deal Room lead matches their pickup/delivery states. (Documented design choice per Deal Room S4.3 — but the mover doesn't know that.) |
| **Lead packs** | Not supported | No data model, no UI surface. |
| **Broker packs** | Not supported | Same. |

### Friction inventory (the 5 things a mover does today)

1. Open `/dashboard/deals`
2. Scroll the card grid
3. Skim ~3 fields per card to find a relevant route
4. Click "Unlock $X"
5. Click "Confirm" in the modal

Total clicks per purchase: 2. Total scroll-and-skim time: estimated 30-60s per lead found (subjective, based on the card layout).

The cards are the bottleneck. Movers think in **routes** (city pairs) and **prices** (under $X for a Y-bedroom move). Cards force them to read each one independently. A table lets them scan a column.

## §2 — Wireframe proposal: Exchange table

The Live Leads table at [LeadFeed.jsx#L690-L859](../../../client/src/pages/dashboard/LeadFeed.jsx#L690) is the canonical pattern. Reuse its columns + add Deal Room-specific affordances.

### 2.1 Proposed column layout (desktop ≥1024px)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Deal Room — discounted secondary inventory                                              [Refresh ↻] [Search 🔍] │
│ Filters: [Distance ▼] [Move date ▼] [Discount ≥ X% ▼] [My coverage only ▼ (default off)]                       │
├──────────────────────────────────┬──────────┬───────────┬───────────┬─────────────┬──────────────┬─────────────┤
│ Route                            │ Size     │ Move date │ Listed ↓  │ Was         │ Now (–X%)    │ Action      │
├──────────────────────────────────┼──────────┼───────────┼───────────┼─────────────┼──────────────┼─────────────┤
│ Dallas, TX  →  Houston, TX       │ 3-bed    │ Jun 12    │ 3d ago    │ ~~$250~~    │ $150 (−40%)  │ Unlock $150 │
│ 75070           77001            │          │           │           │             │ 🔴 Hot       │             │
├──────────────────────────────────┼──────────┼───────────┼───────────┼─────────────┼──────────────┼─────────────┤
│ Atlanta, GA  →  Miami, FL        │ Studio   │ Jun 8     │ 1w ago    │ ~~$320~~    │ $200 (−38%)  │ Unlock $200 │
│ 30303           33125            │ ⚠ Today  │           │           │             │              │             │
├══════════════════════════════════════════════════════════════════════════════════════════════════════════════════│
│ 📦 PACK: Long-Distance East Coast Q2 — 5 leads, sold together                                                   │
│    Coverage: NY/NJ/PA/DE/MD pickup • DC/VA/NC/SC/FL/GA delivery                                                 │
│    Was: $1,250  Now: $750 (−40% pack discount, save $500 vs buying singles)                                     │
│                                                                          [View leads ▼] [Buy pack $750 ›]     │
│    └─ Lead 1: New York, NY → Miami, FL  · 4-bed · Jul 1  · $250 (singly)                                       │
│    └─ Lead 2: Newark, NJ → Charlotte, NC · 2-bed · Jul 5  · $180 (singly)                                       │
│    └─ Lead 3: Philadelphia, PA → Atlanta, GA · 3-bed · Jul 9 · $220 (singly)                                    │
│    └─ Lead 4: Wilmington, DE → Tampa, FL · Studio · Jul 14 · $150 (singly)                                      │
│    └─ Lead 5: Baltimore, MD → Orlando, FL · 1-bed · Jul 20 · $190 (singly)                                      │
├══════════════════════════════════════════════════════════════════════════════════════════════════════════════════│
│ Houston, TX  →  Austin, TX       │ 4-bed    │ Jun 20    │ 5d ago    │ ~~$280~~    │ $175 (−38%)  │ Unlock $175 │
│ ...                                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Column rationale

| Column | Width | Why |
|---|---|---|
| **Route** | flexible, min 240px | Movers' primary scan dimension. City-first hierarchy with ZIP underneath (matches LeadFeed.jsx). |
| **Size** | 80px | Home-size pill icon (matches LeadFeed). |
| **Move date** | 90px | When fulfillment is needed. |
| **Listed** | 80px | Relative age. **Sort key.** Default desc. |
| **Was** | 90px | Strikethrough original price — anchor. |
| **Now (−X%)** | 110px | Discounted price + percentage badge. The visual hook. |
| **Action** | 130px right | Single CTA: `Unlock $X` matches LeadFeed exactly. |

### 2.3 Pack row treatment

Packs render as **expanding group rows** (table sub-rows under a pack header row). The pack header is visually distinct (pale background tint + 📦 icon + thicker borders) and contains:

- Pack name + type (`Lead Pack` or `Broker Pack — Realtor`)
- Coverage span (pickup / delivery states aggregate)
- Price savings line ("Was: $1,250 — Now: $750 (−40%, save $500)")
- Actions: `[View leads ▼]` (toggle expand) + `[Buy pack $750 ›]` (primary CTA)

When expanded, sub-rows show individual leads with their singly-priced amounts (so movers see what each lead would cost separately). Sub-rows are **not individually purchasable while the pack is intact** — sub-row Action cell shows the singly price grayed out with a note "Included in pack."

### 2.4 Filters bar (top of table)

Five compact dropdowns:
- **Distance** — `All / Local / Long Distance`
- **Move date** — `All / This week / This month / Next month / Custom`
- **Discount** — `All / ≥ 25% off / ≥ 40% off / ≥ 60% off`
- **My coverage only** — `Off (default) / On (filter by mover's pickup+delivery states)`
- **Pack type** — `All / Singles only / Lead Packs / Broker Packs`

All filters are client-side over the server-fetched list. Same `data-testid` convention as PR-D1.

### 2.5 Empty + disabled states (already in place)

PR-D1's two `data-testid`s carry over: `deal-room-disabled-banner` and `deal-room-empty-state`. The pack-aware table renders neither when packs/leads are present.

### 2.6 Mobile (<700px)

Table collapses to a single-column compact card list:
- Lead row → 2-line card (route • size · date / was → now · −X% · Unlock $X)
- Pack header → full-width banner with `Buy pack` CTA
- Expanded pack leads → indented compact card list under the header

### 2.7 Visual language differences from Live Leads

| Element | Live Leads (LeadFeed) | Deal Room Exchange |
|---|---|---|
| Header H1 | "Live Leads" | "Deal Room" + subtitle "Discounted secondary inventory" |
| Primary CTA color | Orange (#ea580c) | Teal (#0d9488) — distinct so movers know they're in a different surface |
| Discount badge | None | Prominent `−X%` next to price |
| "Was" column | None | Strikethrough anchor |
| Pack row | N/A | Expandable group with pale background tint |
| Sort | Server-sorted by `distributionDecisionAt` | Server-sorted by `updatedAt` (current); future: `dealRoomMovedAt` |
| Coverage match badge | `✓ Matches your setup` | Optional via filter; same `_matchesPreferences` annotation IF server returns it |

## §3 — Data model impact

### 3.1 Single-lead deals (existing — no change)

Already work today. `Lead.inventoryChannel='deal_room' + buyNowPrice (discounted) + originalPrice (anchor) + discountPercent (read-time)`. Buy-now uses canonical `POST /api/bids/:leadId/buy-now`.

### 3.2 Lead Packs (new — additive)

A pack is a bundle of N leads sold together at a discount over the sum of their individual prices.

#### Schema additions

```js
// server/models/LeadPack.js (new collection)
{
  _id: ObjectId,
  name: String,                    // 'Long-Distance East Coast Q2'
  type: String,                    // 'lead_pack' (future: 'broker_pack')
  brokerSource: ObjectId,          // future Broker Packs — nullable for type='lead_pack'
  leadIds: [ObjectId],             // refs to Lead
  packPrice: Number,               // what the mover pays for the whole pack
  originalTotalPrice: Number,      // sum of individual buyNowPrices at the moment of pack creation (anchor)
  status: String,                  // 'draft' | 'active' | 'sold' | 'expired' | 'cancelled'
  expiresAt: Date,                 // optional time-limited offer
  createdBy: ObjectId,             // admin who created it
  createdAt: Date,
  soldTo: ObjectId,                // mover who bought (null until sold)
  soldAt: Date,
}

// Lead schema: ONE additive field
packId: { type: ObjectId, ref: 'LeadPack', default: null, index: true }
```

That's the entire data model addition. `packId` denormalized on Lead is just for query performance (find all leads in a pack without traversing the pack); `LeadPack.leadIds[]` is the authoritative list.

#### Invariants

- A Lead can be in **zero or one** pack at a time. Index `{ packId: 1 }` partial on `packId != null` enforces nothing (a unique constraint would be wrong — many leads can share a packId; that's the point). Authoritative containment is `LeadPack.leadIds`.
- When `LeadPack.status='sold'`, all `leadIds` flip to `status='Purchased'` via the canonical buy-now sequence (one PurchasedLead row per lead).
- When `LeadPack.status='cancelled'`, all `leadIds` clear `packId` and return to singly purchasable.
- A Lead can be moved into Deal Room as a singleton OR as part of a pack. Single Deal Room leads (Lead.packId=null) work exactly as today.

### 3.3 Broker Packs (future)

Same `LeadPack` model with `type='broker_pack'` and `brokerSource` pointing to a future `BrokerSource` collection (realtor profile, FB group account, etc.). Revenue split logic would live in the pack purchase handler (Transaction split: platform fee + broker fee + mover paid). **Out of scope for current PR.** The data model accommodates it without further schema changes.

### 3.4 Pack purchase atomic sequence

Mirrors canonical buy-now byte-for-byte, scaled to N leads. New route `POST /api/bids/pack/:packId/buy-now`:

```
1. Atomic LeadPack CAS:
   findOneAndUpdate(
     { _id: packId, status: 'active', expiresAt: { $gt: now OR null } },
     { $set: { status: 'reserving', soldTo: req.user.id } }
   )
   → if no doc, return 400 'Pack no longer available'

2. Atomic balance debit:
   User.findOneAndUpdate(
     { _id: req.user.id, balance: { $gte: pack.packPrice } },
     { $inc: { balance: -pack.packPrice } }
   )
   → if no doc, revert pack to 'active', return 402

3. Per-lead atomic flip (loop with rollback):
   for leadId in pack.leadIds:
     Lead.findOneAndUpdate(
       { _id: leadId, auctionStatus: 'active', ...moverVisibilityFilter() },
       { $set: { auctionStatus: 'buy_now' } }
     )
     → if ANY fails, rollback ALL previously flipped + refund balance + revert pack to 'active', return 409

4. Per-lead PurchasedLead unique inserts (loop with rollback):
   for leadId in pack.leadIds:
     new PurchasedLead({ company: req.user.id, lead: leadId, pricePaid: <prorated> }).save()
     → E11000 → rollback ALL + refund + revert, return 409

5. Per-lead finalize (loop):
   for leadId: status='Purchased', auctionStatus='sold', winnerId, finalPrice (prorated), buyers.push

6. LeadPack finalize:
   pack.status='sold', pack.soldAt=now

7. ONE Transaction row:
   type: 'Pack Purchase',
   amount: pack.packPrice,
   description: `Pack purchase: ${pack.name} (${pack.leadIds.length} leads)`,
   leadPack: pack._id,
   user: req.user.id

8. Per-lead socket emit (broadcastLeadSold) for each leadId.

9. Return { success: true, packPrice: pack.packPrice, leadIds }.
```

**Key invariants:**

- Canonical buy-now per-lead atomic sequence preserved exactly (CAS → debit → PurchasedLead mutex). Just looped under a pack-level mutex.
- One Transaction per pack (operator-friendly ledger).
- N PurchasedLead rows (so My Leads renders each lead individually).
- Rollback is all-or-nothing — partial pack purchase is impossible.
- Per-lead `pricePaid` is prorated `pack.packPrice / N` (or could be the individual `buyNowPrice` weighted; operator decision).

### 3.5 Pack visibility (mover read endpoint)

Augment `/api/leads/deals` response to bundle pack metadata. Two approaches:

**Approach A (recommended):** keep `/api/leads/deals` as it is; add a new endpoint `GET /api/leads/deal-room/packs` returning `LeadPack` rows with embedded lead summaries. Client merges both into a single sorted list. Cleanest separation.

**Approach B:** augment `/api/leads/deals` to return a discriminated array `{ type: 'lead' | 'pack', ...}`. Single fetch, more complex shape. Backward-compat-breaking on response shape.

Approach A wins: no breaking changes, smaller PRs, easier to flag-gate packs separately from singles.

## §4 — Frontend implementation plan

5 small PRs, each isolated, additive, source-level + behavioral lock-in tests like the PR-D1/2/3 pattern.

### PR-DRX-1 — Replace cards with table (singles only)

**Scope:** `client/src/pages/dashboard/Deals.jsx` only. Replace the `<DealCard>` grid with a `<table>` mirroring LeadFeed.jsx. Keep all existing state, fetch, modal, banners.

**Files touched:**
- `client/src/pages/dashboard/Deals.jsx` (~150 line replacement)
- `server/__tests__/dealRoomExchangeTable.test.js` (new, source-level lock-in)

**Behavior changed:** Pure UX. No API changes. No data model changes. Same `data-testid` for disabled banner and empty state.

**Effort:** ~3 hours including styling responsive breakpoints + tests.

**Risk:** Very low. Reverts to current Deals.jsx by single commit revert.

### PR-DRX-2 — Filters bar

**Scope:** Add client-side filter dropdowns (Distance / Move date / Discount / My coverage / Pack type — but pack-type defaults to "All" and is hidden until DRX-4).

**Effort:** ~2 hours.

**Risk:** Very low.

### PR-DRX-3 — Schema additions for Lead Packs

**Scope:**
- New `server/models/LeadPack.js` collection.
- Additive `packId` field on Lead schema.
- Migration script: no rows in LeadPack collection on day one; existing leads have `packId=null` by default. No backfill needed.
- Admin endpoint scaffolding (NO bulk-write logic yet): `GET /api/admin/inventory/packs/list`, `POST /api/admin/inventory/packs/create` (draft only, status='draft').

**Effort:** ~3 hours.

**Risk:** Low. Schema is additive, no breaking changes.

### PR-DRX-4 — Pack purchase route + mover-side rendering

**Scope:**
- New `POST /api/bids/pack/:packId/buy-now` route in `server/routes/bids.js` (the atomic sequence in §3.4).
- New `GET /api/leads/deal-room/packs` mover read endpoint.
- Frontend: Deals.jsx renders pack rows as expanding groups; pack CTA hits the new buy-now route.
- ENV flag `ENABLE_LEAD_PACKS` (default off) gates BOTH the admin pack-create UI and the mover pack purchase. Singles work flag-on or flag-off.

**Effort:** ~6 hours including atomic-sequence test + behavioral test.

**Risk:** Medium. New financial path; needs careful all-or-nothing rollback testing. **DO THIS POST-PILOT.**

### PR-DRX-5 — Admin pack creation UI

**Scope:**
- `AdminLeads.jsx` adds "Create Pack from selection" bulk action.
- `/admin/packs` page lists draft/active/sold packs with edit / activate / cancel.
- Pack lifecycle: `draft → active` (admin clicks Activate) → `sold` (mover buys) OR `cancelled` (admin cancels; leads return to Deal Room singly) OR `expired` (expiresAt passes).

**Effort:** ~5 hours.

**Risk:** Low (admin only; new surface).

## §5 — Migration plan

Rollout sequence (zero downtime, reversible):

| Stage | What | Risk | Reversible? |
|---|---|---|---|
| 1. **PR-DRX-1 ships** | Singles render as table instead of cards | UX only, no data | Yes (revert PR) |
| 2. **PR-DRX-2 ships** | Filters bar added | Client-only | Yes |
| 3. **Pilot** | Operator runs the 3–5 mover pilot per the prior Deal Room readiness assessment, using the new table UI | Same pilot scope as before; just better UX | Yes (toggle ENABLE_DEAL_ROOM off) |
| 4. **Pilot complete** | Operator decides whether to greenlight packs | Decision point | n/a |
| 5. **PR-DRX-3 ships** | Schema additions, no logic | Schema-only; no rows | Yes (drop collection, drop field) |
| 6. **PR-DRX-4 ships** | Pack purchase route live behind `ENABLE_LEAD_PACKS=false` | Code shipped but inactive | Yes (revert) |
| 7. **PR-DRX-5 ships** | Admin pack-creation UI behind same flag | Admin-only | Yes |
| 8. **Pack pilot** | Operator creates 1-2 packs in production with `ENABLE_LEAD_PACKS=true` for a single admin account. Manual smoke. | Real money path | Flip flag off to disable purchases |
| 9. **Broker Packs** | Future PR-DRX-6/7 for broker source schema + revenue split | Future | n/a |

**No data migration required.** Existing Deal Room leads continue to work as singles. Pack rows are net-new and start at zero count.

## §6 — Build now or after pilot?

### Recommendation

**Build PR-DRX-1 and PR-DRX-2 BEFORE pilot. Park PR-DRX-3/4/5 until AFTER pilot — and only build them if pilot demonstrates pack-shaped demand.**

### Why split this way

**PR-DRX-1+2 (table + filters):** Pure UX win. Movers will get a faster, more scannable Deal Room without changing any financial code, schema, or feature flag. Total effort ~5 hours. Reverts in one commit. The risk of NOT building this is that operators run pilot on the card-based UI, get unclear conversion data because the UI is the bottleneck, and have to redo pilot post-table-redesign.

**PR-DRX-3/4/5 (packs):** Adds a new financial path (atomic sequence over N leads). Even though it byte-mirrors the canonical buy-now, the rollback semantics are non-trivial (all-or-nothing across N CAS writes). The right time to build packs is when operator has:

1. **Pilot evidence** that movers WANT to buy multiple leads at once (not just discounted singles).
2. **Curated pack inventory** ready to ship — at minimum 2-3 sample packs admin has hand-built.
3. **Operator clarity on pack pricing model** — is it `0.5 × sum(individual prices)`? A flat 40% discount? Per-pack admin-set?

These are all operator decisions that pilot will inform. Building packs before pilot is over-investment without that signal.

### What if pilot shows movers DON'T want packs

Then PR-DRX-3/4/5 doesn't ship and the operator has a polished, table-based Deal Room for singles — which is still a strict improvement over the card grid. The packs work is parked, not wasted (it's documented + designed; just dormant in the same way auction infrastructure is documented + dormant).

### What if pilot reveals other UX gaps

The table + filters foundation in DRX-1/2 makes it trivial to add columns (e.g. "Match score" if you decide to surface coverage matching), more filters (e.g. "Source funnel"), or column-sort affordances. Future Deal Room UX work bolts onto the table cleanly.

## §7 — Cumulative scope discipline check

Across all proposed PRs:

| Constraint | Status |
|---|---|
| No new features beyond table refactor (DRX-1/2 only — singles already work; packs are post-pilot) | ✅ for DRX-1/2 |
| No financial-path changes | ✅ canonical `/api/bids/:leadId/buy-now` untouched; packs use a NEW route (`/api/bids/pack/:packId/buy-now`) that mirrors the canonical sequence |
| No schema changes pre-pilot | ✅ DRX-1/2 are client-only |
| No SMS Claim changes | ✅ |
| No marketplace routing changes | ✅ Main feed at `GET /api/leads` untouched |
| Keep canonical buy-now route unchanged | ✅ Confirmed in §3.4 (pack purchase is a NEW sibling route) |
| Keep existing financial architecture unchanged | ✅ |
| Support future Lead Packs | ✅ Data model designed in §3.2 |
| Support future Broker Packs | ✅ Data model accommodates in §3.3 |
| Single lead AND package purchases | ✅ Both wired in the proposed plan |
| Faster scanning | ✅ Table layout with sortable columns + filters |
| Higher conversion | Hypothesis — to be validated in pilot |

## §8 — Closing recommendation

| Question | Answer |
|---|---|
| Should I redesign Deal Room as an inventory exchange? | **Yes.** The card layout is the right UX for one-off discovery (e.g. an Amazon Today's Deals page) and the wrong UX for a professional buy interface where movers need to compare prices across routes. |
| Should I build it now or after pilot? | **Half now, half after.** DRX-1 (table) + DRX-2 (filters) before pilot. DRX-3/4/5 (packs) only if pilot proves pack-shaped demand. |
| What's the total effort? | DRX-1+2: ~5 hours. DRX-3+4+5: ~14 hours additional. Plus tests for each. Total ~25 hours engineering if everything ships. |
| What's the risk? | DRX-1+2: very low (client-only, reversible). DRX-3: low (additive schema). DRX-4: medium (new financial path, but mirrors canonical exactly with all-or-nothing rollback). DRX-5: low (admin-only). |
| What's the alternative? | Leave Deal Room as cards. Run pilot. Get unclear conversion data because the UI is the bottleneck. Redo. **Not recommended.** |

Stopping engineering here. The next concrete actions are operator decisions: (1) build DRX-1+2 now, (2) park packs until pilot, (3) run pilot per the previously-approved 3–5 mover, 5-lead-per-cohort shape.
