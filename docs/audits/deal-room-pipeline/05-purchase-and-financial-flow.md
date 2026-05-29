# 05 — Purchase & Financial Flow

## Summary verdict

**Deal Room purchase reuses the canonical buy-now endpoint byte-for-byte.**
There is no shadow money path. Atomic-sequence equivalence is trivially
proven because the same handler executes for both surfaces.
**No financial-atomicity risk introduced by Deal Room.**

## Mover purchase entry point

[client/src/pages/dashboard/Deals.jsx#L80-112](../../../client/src/pages/dashboard/Deals.jsx#L80-L112):

```js
const submitConfirmedUnlock = async () => {
  if (!confirmLead) return;
  const leadId = confirmLead._id;
  // Note: `price` is computed client-side for display only and is never transmitted.
  const price = Number(confirmLead.buyNowPrice) || 0;
  setBusyId(leadId);
  setUnlockError(null);
  try {
    const res = await fetch(`${API_URL}/bids/${leadId}/buy-now`, {
      method: 'POST',
      headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
    });
    ...
```

- **Method:** `POST`
- **URL:** `${API_URL}/bids/:leadId/buy-now`
- **Body:** **none** — client sends no body
- **Same endpoint the Live Feed uses** — confirmed at [Deals.jsx#L13-15](../../../client/src/pages/dashboard/Deals.jsx#L13-L15)

## Backend handler

[server/routes/bids.js#L106-190](../../../server/routes/bids.js#L106-L190):

```js
router.post('/:leadId/buy-now', auth, async (req, res) => { ... });
```

Middleware: `auth` only (no admin gate, no deal-room-specific middleware,
no env-flag check). No request-body validation because the handler
ignores the body.

## Canonical atomic sequence (verbatim from bids.js#L113-186)

```js
// 1. Atomic lead-flip CAS (auctionStatus:'active' → 'buy_now')
const lead = await Lead.findOneAndUpdate(
  { _id: req.params.leadId,
    auctionStatus: 'active',
    ...moverVisibilityFilter() },
  { $set: { auctionStatus: 'buy_now' } },
  { returnDocument: 'after' }
);
if (!lead) return res.status(400).json({ error: 'Lead no longer available' });

const price = lead.buyNowPrice;   // SERVER-TRUSTED — read after CAS win

// 2. Atomic conditional debit (balance >= price)
const debited = await User.findOneAndUpdate(
  { _id: req.user.id, balance: { $gte: price } },
  { $inc: { balance: -price } },
  { new: true }
);
if (!debited) {
  // revert lead.auctionStatus → 'active'
  return res.status(402).json({ msg: 'Insufficient balance', error: 'Insufficient balance' });
}

// 3. PurchasedLead mutex (unique {company, lead} index trips E11000)
let purchasedLeadDoc;
try {
  purchasedLeadDoc = await new PurchasedLead({
    company: req.user.id, lead: lead._id, pricePaid: price,
  }).save();
} catch (err) {
  if (err.code === 11000) {
    // refund balance, revert lead.auctionStatus → 'active'
    return res.status(409).json({ error: 'Lead already claimed' });
  }
  throw err;
}

// 4. Finalize lead doc
lead.winnerId      = req.user.id;
lead.finalPrice    = price;
lead.auctionStatus = 'sold';
lead.status        = 'Purchased';
lead.buyers.push({ company: req.user.id, purchasedAt: new Date(), pricePaid: price });
await lead.save();

// 5. Transaction ledger
await Transaction.create({
  user:          req.user.id,
  type:          'Lead Purchase',
  amount:        price,
  description:   `Buy-now purchase: lead ${lead._id}`,
  lead:          lead._id,
  purchasedLead: purchasedLeadDoc?._id,
  status:        'Completed',
});

// 6. Socket emit
broadcastLeadSold(lead, req.user.id);

return res.json({
  success: true,
  message: 'Lead claimed!',
  pricePaid: price,
  lead,
});
```

## Side-by-side: marketplace vs Deal Room purchase

| Step | Marketplace (Live Feed → buy-now) | Deal Room (Deals.jsx → buy-now) |
|---|---|---|
| Route | `POST /api/bids/:leadId/buy-now` | **Same** |
| Lead-flip CAS | `{_id, auctionStatus:'active', ...moverVisibilityFilter()}` → `$set auctionStatus:'buy_now'` | **Same** (same handler) |
| Balance debit | `User.findOneAndUpdate({_id, balance:{$gte:price}}, {$inc:{balance:-price}})` | **Same** |
| PurchasedLead mutex | `new PurchasedLead({company, lead, pricePaid}).save()`; E11000 → refund + revert | **Same** |
| Transaction.type | `'Lead Purchase'` | `'Lead Purchase'` (no channel distinction) |
| Transaction.description | `` `Buy-now purchase: lead ${lead._id}` `` | **Same string** — no "deal_room" substring |
| Transaction.amount | `lead.buyNowPrice` (server-read after CAS) | **Same** — discounted `buyNowPrice` is what's debited |
| Lead.finalPrice | `lead.buyNowPrice` | **Same** |
| Lead.winnerId | `req.user.id` | **Same** |
| Lead.status flip | `'Available'`/`'READY_FOR_DISTRIBUTION'` → `'Purchased'` | **Same** |
| Lead.auctionStatus flip | `'active'` → `'sold'` (via `'buy_now'` intermediate) | **Same** |
| Lead.inventoryChannel | unchanged | **unchanged** — Deal Room purchases leave `inventoryChannel='deal_room'` |
| socket emit | `broadcastLeadSold(lead, req.user.id)` — emits `lead_sold` to ZIP rooms | **Same** |
| notifiedAt | not touched (preserved) | **Same** |
| claimWindow | not touched (preserved) | **Same** |
| Insufficient-balance response | 402 + revert | **Same** |
| Already-purchased response | 409 + refund + revert | **Same** |
| Lead-not-available response | 400 | **Same** |

## Why "atomic sequence equivalent" is trivially proven

Because **the same code runs**. There is no Deal Room branch inside the
handler. There is no shadow handler. The mover frontend POSTs to
`/api/bids/:leadId/buy-now` whether they unlocked from
`Deals.jsx` or `LeadFeed.jsx`. PR-S3's SMS Claim handler in
[routes/twilio.js](../../../server/routes/twilio.js) is the ONLY other
place that mirrors this sequence (and it has its own atomic-sequence
lock-in test). Deal Room does NOT need its own atomicity test because
it has no atomicity code of its own.

## Price / discount handling — no tamper vector

**Server-trusted.** The debited price is `lead.buyNowPrice` read from
Mongo AFTER the atomic CAS win ([bids.js#L120](../../../server/routes/bids.js#L120)).

**Client sends NO body** ([Deals.jsx#L87-90](../../../client/src/pages/dashboard/Deals.jsx#L87-L90)).
There is no `expectedPrice`, no `price`, nothing the client could tamper
with. The `price` variable in [Deals.jsx#L83](../../../client/src/pages/dashboard/Deals.jsx#L83)
is local display state for the confirm modal — it's never transmitted.

**The `discountPercent` injected at read time** ([leads.js#L119-126](../../../server/routes/leads.js#L119-L126))
is purely cosmetic — derived from `originalPrice` vs `buyNowPrice` at
display, never persisted, never sent back at purchase. The same
`buyNowPrice` field is:

- written by admin's `move_to_deal_room`
- read by mover's Deal Room display
- debited by mover's purchase
- stored on `PurchasedLead.pricePaid` and `Transaction.amount`

Single source of truth. No race window between display and purchase.

**No separate `lead.dealRoomPrice` field exists.** Schema comment at
[Lead.js#L307-318](../../../server/models/Lead.js#L307-L318) explicitly
documents this as a deliberate decision: "we deliberately do NOT store
dealPrice or discountPercent separately… single source of truth keeps
the buy-now / refund / Transaction paths unchanged."

## Refund / relist behavior — operator-decision gap

Searched every `inventoryChannel` writer in the codebase. Complete write set:

- [adminInventory.js#L233](../../../server/routes/adminInventory.js#L233) — `'deal_room'` (admin move)
- [adminInventory.js#L241](../../../server/routes/adminInventory.js#L241) — `'archived'`
- [adminInventory.js#L247](../../../server/routes/adminInventory.js#L247) — `'main'` (admin restore)
- [Lead.js#L300-305](../../../server/models/Lead.js#L300-L305) — schema default `'main'`

**No refund path touches `inventoryChannel`.** Verified:

- [admin.js#L409-494](../../../server/routes/admin.js#L409-L494) admin refund: writes `Transaction(type:'Lead Refund')`, bumps `User.balance`, sets `PurchasedLead.refunded=true`. Does NOT touch the Lead document.
- [billingWebhook.js#L67-130](../../../server/routes/billingWebhook.js#L67-L130) Stripe refund: writes `Transaction(type:'Stripe Refund')`, claws back balance. Does not touch Lead.
- [disputes.js#L122-134](../../../server/routes/disputes.js#L122-L134) disputes: sets `PurchasedLead.refunded=true`. Does not touch Lead.

### Consequence

A refunded Deal Room lead:

- stays `inventoryChannel='deal_room'`
- stays `status='Purchased'`
- stays `auctionStatus='sold'`
- **does not relist** — doesn't reappear in `/deals` (fails `status` filter)
- **does not relist on main feed** either

It is effectively dead inventory after refund. This is **the same
behavior as a refunded marketplace lead** (refund policy comment at
[admin.js#L399-404](../../../server/routes/admin.js#L399-L404) confirms
buyer is intentionally kept in `lead.buyers`).

**Operator action item:** If you want refunded Deal Room leads to either
(a) relist back to Deal Room or (b) auto-archive, neither happens
today. No code path covers this. Out of scope for pilot — note for
post-pilot.

## Observability gap — Transaction channel tagging

`Transaction.description` is hardcoded `` `Buy-now purchase: lead ${lead._id}` ``
in [bids.js#L178](../../../server/routes/bids.js#L178). No "deal_room"
substring, no `surface` field, no metadata distinguishing channel.

**To split finance ledger by surface today:** JOIN
`Transaction.lead → Lead.inventoryChannel`. But this is a **lossy snapshot**
because `Lead.inventoryChannel` is mutable post-purchase. If an admin
later moves a sold lead to `'archived'` (unlikely but possible if the
admin write gate is loosened), the historical ledger loses the channel
information.

**Correct shape:** snapshot `inventoryChannel` onto `Transaction` at
purchase time. Would be a one-line addition in `bids.js` + schema field.
Out of scope for pilot but worth a small post-pilot PR — see F4 in
[08-priority-fix-plan.md](08-priority-fix-plan.md).

## Concurrency / double-submit

- Client uses `busyId` state to disable button on submit ([Deals.jsx#L85](../../../client/src/pages/dashboard/Deals.jsx#L85)).
- Server `PurchasedLead` unique `{company, lead}` mutex is the real guard. A double-click that races past `busyId` produces a clean 409 + refund + revert.
- **Safe.** No double-charge vector.
