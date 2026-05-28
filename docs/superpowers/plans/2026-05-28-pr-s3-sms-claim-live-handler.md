# PR-S3 — SMS Claim Live Handler (Inbound Webhook)

> **Status:** PLAN (awaiting operator approval). No code yet.
> **Date:** 2026-05-28
> **Author:** Claude (Opus 4.7), reviewed by operator before any implementation begins.

---

## 1. Goal

Wire the inbound SMS webhook so a mover replying `SEND <token>` actually claims a lead — debiting their balance, locking the lead to them, writing the ledger row, broadcasting to the room, and confirming back via SMS. Gated behind `ENABLE_SMS_CLAIM_LIVE` (default off). When the flag is off, the path stays in shadow mode (logs + ClaimAttempt rows with outcome `shadow_only`, no money or lead-ownership changes).

## 2. Architectural Constraint (locked, do not deviate)

- **Replicate `routes/bids.js:101-186` (the buy-now atomic pattern) verbatim.** Do not invent a new financial sequence.
- SMS claim is **another entry point** into the same financial integrity architecture, not a second purchase system.
- No clever abstractions; no shared "purchaseLead()" helper that backs both buy-now and SMS claim. Two siblings, each pinned to its own lock-in tests. A future refactor that wants to deduplicate can come later when the patterns have proven identical in production.
- Boring correctness only.

---

## 3. Files Touched

### NEW

| File | Purpose |
| --- | --- |
| `server/utils/claimWindow.js` (extend, already exists from PR-S5) | Add helper `findOpenWindow(token)` — pure read, returns the open + non-expired Lead by `claimWindow.token`. Inbound handler calls this AFTER ClaimAttempt insert. |
| `server/__tests__/smsClaimLiveHandler.test.js` | Lock-in suite for PR-S3 (test matrix in §15). Source-level + behavioral. |

### MODIFIED

| File | What changes |
| --- | --- |
| `server/routes/twilio.js` | Add the live claim branch BEFORE the existing STOP/START/HELP/UNKNOWN dispatch. Parses with `claimToken.parseClaimReply()`. Flag-gated; off path writes `shadow_only` ClaimAttempt and falls through to the existing TwiML response. |
| `docs/audits/sms-claim-pipeline/` | Add a short addendum noting PR-S3 shipped + how to verify in staging. |

### NOT TOUCHED (explicit non-goals)

- `routes/bids.js` — gold-standard pattern; no edits. PR-S3 replicates, does not refactor.
- `models/Lead.js` — schema is already complete (PR-S2). No new fields.
- `models/ClaimAttempt.js` — schema complete (PR-S1).
- `models/PurchasedLead.js` — unique mutex `{ company, lead }` is what makes this work.
- `services/smsService.js` — the confirmation SMS sends via Twilio's TwiML response on the same HTTP round-trip, **not** by issuing a separate outbound message. No new methods needed.
- `User.smsClaim.*` preferences — still retire-the-read (no `maxLeadPrice`, `residentialOnly`, `asapOnly`, `dailyClaimCap` consulted).

---

## 4. Inbound Webhook Path

| Concern | Decision |
| --- | --- |
| Route | `POST /api/twilio/sms/inbound` (the existing route, extended — NOT a new endpoint) |
| Reason | Twilio config in production already points here. Adding a second URL would require Twilio console reconfiguration and split the inbound surface into two paths that both need signature middleware. One handler, one surface. |
| Position | New claim branch sits **before** the STOP / START / HELP keyword checks. Reason: STOP wins everything (TCPA), but a claim reply like `SEND A7K2` is NOT a STOP keyword, so order matters only between claim and HELP/START. We check STOP first, then claim, then HELP/START, then UNKNOWN. |
| Middleware | Reuses `express.urlencoded({ extended: false })` + `twilioWebhook` (signature validation). No new middleware. |

### Branch order in the handler (final)

```
1. Signature validation (already present)
2. Resolve `user` by phone last-10 (already present)
3. If keyword in STOP_KEYWORDS  → existing STOP path, return
4. If parseClaimReply(body) returns a token → NEW CLAIM PATH (§5–§11)
5. If keyword in START_KEYWORDS → existing START path, return
6. If keyword in HELP_KEYWORDS  → existing HELP path, return
7. Unknown → existing empty-TwiML path, return
```

Rationale for ordering: STOP must always win (legal requirement). Claim sits before START/HELP so an accidental `SEND` reply doesn't get treated as a generic keyword.

---

## 5. Token Parsing Rules

Use `utils/claimToken.parseClaimReply(body)` — already exists, tested in PR-S5 via Phase 4 scaffolding. Returns `{ keyword, token }` where:

- `SEND A7K2` → `{ keyword: 'SEND', token: 'A7K2' }`
- `CLAIM A7K2` → `{ keyword: 'CLAIM', token: 'A7K2' }`
- `TAKE A7K2` → `{ keyword: 'TAKE', token: 'A7K2' }`  *(already in parser)*
- `A7K2` (bare) → `{ keyword: null, token: 'A7K2' }`
- `yes please` → `{ keyword: null, token: null }` → falls through, not a claim attempt

**Decision: bare tokens count as claim attempts.** Rationale: if a mover types just `A7K2`, the parser confirmed it matches the 31-char alphabet + exact length, so the intent is unambiguous. The outbound SMS instructs "Reply SEND <token>" but humans truncate. Accepting bare tokens removes one fail mode.

**Decision: case-insensitive.** Parser already uppercases (`body.toUpperCase()`). No additional handling.

---

## 6. Twilio Signature & Idempotency

### Signature
Already enforced by `twilioWebhook` middleware (returns 403 on invalid sig). No new code, no skip path.

### Idempotency (the load-bearing safety property)

Twilio retries non-2xx webhook responses up to 5 times over 24h with the same `MessageSid`. PR-S1 installed the unique-sparse index `twilioMessageSid_unique` on `ClaimAttempt.twilioMessageSid` precisely for this.

**Sequence:**

```
1. Insert ClaimAttempt { twilioMessageSid: MessageSid, outcome: 'shadow_only', ... } FIRST.
2. If insert throws E11000 (duplicate MessageSid):
     → log "[Twilio Inbound] duplicate MessageSid — already processed, returning prior TwiML"
     → return 200 with empty TwiML (Twilio stops retrying)
     → DO NOT attempt the claim again
3. Otherwise (fresh attempt), proceed to claim logic.
```

**Why `shadow_only` for the initial insert?** Because at this moment we have not yet decided the outcome. The outcome gets updated as we determine the result. Two-write strategy:

- **Write 1 (the idempotency anchor):** insert with `outcome: 'shadow_only'`, the only mandatory fields being `fromPhone`, `twilioMessageSid`, `outcome`, `body`. If this E11000s, we already processed.
- **Write 2 (the outcome stamp):** `ClaimAttempt.updateOne({ _id: insertedId }, { $set: { outcome, leadId, moverId, token, reason } })` after the claim path determines the result.

This two-write pattern means even if write 2 fails, the unique-MessageSid row still exists and prevents Twilio retry from re-running the claim. Worst case: a row with `outcome: 'shadow_only'` and missing leadId/moverId. Forensics-recoverable from the `body` field.

---

## 7. Atomic Sequence (copied from `routes/bids.js:108-179`)

The diff between buy-now and SMS claim:

- Buy-now identifies the lead by `:leadId` URL param + filters `auctionStatus: 'active'`.
- SMS claim identifies the lead by `claimWindow.token` + filters `claimWindow.status: 'open'` and `claimWindow.expiresAt > now`.

Everything after the lead-flip step is **identical**. Side-by-side:

| Step | Buy-now (`routes/bids.js`) | SMS claim (PR-S3) |
| --- | --- | --- |
| 1. Atomic lead claim | `findOneAndUpdate({_id, auctionStatus:'active', ...visibilityFilter}, {$set:{auctionStatus:'buy_now'}})` | `findOneAndUpdate({'claimWindow.token': T, 'claimWindow.status':'open', 'claimWindow.expiresAt': {$gt: now}, ...visibilityFilter}, {$set:{'claimWindow.status':'claimed', 'claimWindow.claimedBy': moverId, 'claimWindow.claimedAt': now, 'claimWindow.closedReason':'claimed', auctionStatus:'buy_now'}})` |
| 2. Read price | `lead.buyNowPrice` | `lead.buyNowPrice` (same — SMS claim is the same price as buy-now) |
| 3. Atomic conditional debit | `User.findOneAndUpdate({_id, balance:{$gte: price}}, {$inc:{balance:-price}})` | **IDENTICAL** |
| 4. On insufficient balance | Revert lead: `findOneAndUpdate({_id, auctionStatus:'buy_now'}, {$set:{auctionStatus:'active'}})` | Revert: `findOneAndUpdate({_id, 'claimWindow.status':'claimed', 'claimWindow.claimedBy': moverId}, {$set:{'claimWindow.status':'expired', 'claimWindow.closedReason':'expired', 'claimWindow.claimedBy': null, 'claimWindow.claimedAt': null, auctionStatus:'active'}})` |
| 5. Insert PurchasedLead | `new PurchasedLead({company, lead, pricePaid}).save()` | **IDENTICAL** |
| 6. On E11000 (already-claimed race) | Refund debit + revert lead | **IDENTICAL** (same refund + revert as step 4) |
| 7. Finalize lead | `winnerId`, `finalPrice`, `auctionStatus='sold'`, `status='Purchased'`, push to `buyers` | **IDENTICAL** |
| 8. Transaction ledger row | `Transaction.create({...})` with description `Buy-now purchase: lead ${id}` | **IDENTICAL** except description is `SMS claim: lead ${id}` so the ledger UI can distinguish them |
| 9. Socket emit | `broadcastLeadSold(lead, buyerId)` — emits `lead_sold` to ZIP rooms | **IDENTICAL** (same function — import it from `routes/bids.js`? No — see §11) |

### Step 1 elaboration — the SMS-claim CAS filter

The atomic find-and-update filter is the entire safety property. Lay it out explicitly:

```js
Lead.findOneAndUpdate(
  {
    'claimWindow.token': token,
    'claimWindow.status': 'open',
    'claimWindow.expiresAt': { $gt: now },
    ...moverVisibilityFilter(),  // Phase 6 — rejected leads not claimable
  },
  {
    $set: {
      'claimWindow.status': 'claimed',
      'claimWindow.claimedBy': moverId,
      'claimWindow.claimedAt': now,
      'claimWindow.closedReason': 'claimed',
      auctionStatus: 'buy_now',  // matches the buy-now interim state used downstream
    },
  },
  { new: true }
);
```

If this returns null, we cannot tell from the result alone whether it was: (a) wrong token, (b) window already claimed, or (c) window expired. We **disambiguate by re-fetching by token without filters** (read-only):

```js
const stateLead = await Lead.findOne({ 'claimWindow.token': token }).select('claimWindow').lean();
if (!stateLead) → outcome 'rejected_unmatched_token'
else if (stateLead.claimWindow.status === 'claimed') → outcome 'lost_already_claimed'
else if (stateLead.claimWindow.expiresAt <= now) → outcome 'lost_window_expired'
else → 'rejected_unmatched_token' (defensive fallback)
```

This is one extra read but it's only on the loser path — happy path is one atomic write. The information matters: forensics need to distinguish "wrong token" from "lost the race" from "too late."

### Step 4 elaboration — revert filter

The revert filter `{ 'claimWindow.status':'claimed', 'claimWindow.claimedBy': moverId }` guarantees we only undo OUR claim. If a parallel-process anomaly somehow re-claimed this window with a different mover between our flip and our revert (impossible in the normal flow, but belt-and-suspenders), we don't clobber their state.

Setting `closedReason: 'expired'` on revert is a deliberate lie-for-correctness: the window did not expire; our claim failed and we're rolling it back. From outside the system, the lead is now available again (`auctionStatus: 'active'`), and `closedReason` carries the post-mortem label. `expired` is the only non-claimed reason currently in the enum (`'claimed' | 'expired' | 'admin_revoked'`). **Decision:** for now use `expired`. If operator observability demands a `'reverted'` enum value later, that's its own PR with the schema migration.

---

## 8. Revert-on-failure Behavior (explicit cases)

| Failure point | What we revert | Why |
| --- | --- | --- |
| Step 3 debit returns null (insufficient balance) | Lead claim (Step 1) | Mover did not pay → cannot own the lead |
| Step 5 PurchasedLead `.save()` throws E11000 | Debit (Step 3) AND lead claim (Step 1) | Concurrent claim by another mover for the same lead — we lost the race after debiting |
| Step 5 PurchasedLead `.save()` throws ANY OTHER error | Debit + lead claim, then rethrow to outer catch | Unknown error — leave the lead returnable to active; outer handler returns empty TwiML (Twilio will retry; idempotency key prevents double-debit) |
| Step 7 `await lead.save()` throws | Debit + lead claim revert + delete the PurchasedLead row by `_id` | This is the only point where a partial state could leak. The `purchasedLeadDoc._id` is captured before save attempt; on failure we delete it explicitly. |
| Step 8 `Transaction.create()` throws | Log error, do NOT revert | Ledger row failure is non-fatal to ownership. The mover paid, owns the lead. A missing ledger row is a forensics gap, not a money loss. (Same posture as `routes/bids.js`.) |
| Step 9 socket emit fails | Log error, do NOT revert | Cosmetic only. |

---

## 9. Unique PurchasedLead Mutex Behavior

The `{ company: 1, lead: 1 }` unique index on `PurchasedLead` is the load-bearing race resolver. Cases:

1. **Same mover claims the same lead twice via SMS race:** Twilio MessageSid idempotency catches this BEFORE we get to PurchasedLead. The duplicate-MessageSid E11000 on `twilioMessageSid_unique` short-circuits the second invocation. PurchasedLead mutex is unused in this case.

2. **Same mover claims via buy-now while also having sent an SMS reply (different MessageSids):** The Lead's `auctionStatus` flip is the first atomic write; whichever fired first wins. The loser's lead-flip filter no longer matches → `findOneAndUpdate` returns null → loser path runs (refund logic doesn't apply because no debit happened). The PurchasedLead mutex is the third defense if some other code path debited without the lead-flip protection.

3. **Different mover claims the same lead via different channel:** Same as above. Lead-flip is the gate; PurchasedLead is the belt-and-suspenders.

4. **Same mover claims the same lead via SMS reply twice within window (typo retry, e.g. they typed `SEND A7K3` first → unmatched token, then `SEND A7K2`):** Each is a separate MessageSid. The first is an unmatched-token rejection. The second proceeds normally and succeeds. PurchasedLead unique not exercised.

5. **Edge: A mover replies to an old MoveLeads SMS (different lead, expired window) with `SEND A7K2` that happens to collide with a CURRENT lead's token:** Token namespace is 31^4 ≈ 924k. The CURRENT `claimWindow.token` is unique-sparse from PR-S2. So only one lead can have the current token. The mover claims the CURRENT lead. They probably meant the old one. From the mover's perspective: their reply matched a real open token; they paid for the wrong lead. **Acceptable.** Mitigation: 10-min default window keeps the cross-collision rate negligible (~10 min × broadcast rate × 1/924k). Not a v1 concern.

---

## 10. ClaimAttempt Write Behavior (the full state machine)

Every inbound SMS that reaches the claim branch (i.e. parser returned a token) results in exactly ONE row, with outcome reflecting the terminal state:

| Outcome | When |
| --- | --- |
| `shadow_only` | `ENABLE_SMS_CLAIM_LIVE !== 'true'` — flag-off path. No money, no lead changes. |
| `won` | Full atomic sequence completed (lead is now `'sold'`, `PurchasedLead` exists, debit + ledger row written) |
| `lost_already_claimed` | Lead-flip returned null; disambiguation read shows `status === 'claimed'` |
| `lost_window_expired` | Lead-flip returned null; disambiguation read shows `expiresAt <= now` |
| `rejected_low_balance` | Lead-flip succeeded; debit returned null. Lead reverted. |
| `rejected_unmatched_token` | Lead-flip returned null; disambiguation read returned no lead (or fell through) |
| `rejected_optout` | Sender's User row has `smsOptOut === true`. Check BEFORE any state mutation. |
| `rejected_unverified_phone` | Sender's User row has `phoneVerified !== true`. Check BEFORE any state mutation. |
| `parsed_no_token` | Body parsed but `parseClaimReply()` returned `token: null`. **Decision: do NOT log this** — every random SMS reply (e.g. "thanks", "wrong number") would write a row. We only log when the parser found a token. Outcome `parsed_no_token` stays in the enum for future use, but PR-S3 does not write it. |

### Outcome decision ordering (top-down — first match wins)

```
1. duplicate twilioMessageSid → no new row, return prior TwiML (idempotency)
2. flag off (ENABLE_SMS_CLAIM_LIVE !== 'true') → shadow_only, return empty TwiML
3. sender not found by phone → rejected_unverified_phone (treat unknown as unverified)
4. sender has smsOptOut → rejected_optout
5. sender has !phoneVerified → rejected_unverified_phone
6. lead-flip fails:
     a. lead with this token doesn't exist → rejected_unmatched_token
     b. lead.claimWindow.status === 'claimed' → lost_already_claimed
     c. lead.claimWindow.expiresAt <= now → lost_window_expired
     d. fallback → rejected_unmatched_token
7. lead-flip succeeds, debit fails → rejected_low_balance (lead reverted)
8. lead-flip + debit succeed, PurchasedLead E11000 → lost_already_claimed (lead + debit reverted)
9. all succeed → won
```

---

## 11. Insufficient Balance Behavior

- Step 3 debit returns null when `balance < price` (atomic, single Mongo op).
- Step 4 revert: undo Step 1 lead flip. The mover does NOT own the lead, was not charged.
- Confirmation SMS (§13): tells the mover their balance was insufficient and includes the price they'd need. **No outbound add-funds link** in the SMS body (160-char budget) — direct them to dashboard.
- ClaimAttempt outcome: `rejected_low_balance`.

---

## 12. Already-claimed / Expired / Invalid-token Behavior

All three are loser branches — no state mutation, only the audit row + a confirmation SMS to the sender.

| Scenario | Outcome | SMS to sender (TwiML) |
| --- | --- | --- |
| `lost_already_claimed` | `lost_already_claimed` | "MoveLeads: lead already claimed by another mover. Better luck next time." |
| `lost_window_expired` | `lost_window_expired` | "MoveLeads: this lead's claim window expired. Reply STOP to opt out." |
| `rejected_unmatched_token` | `rejected_unmatched_token` | (empty TwiML — don't confirm receipt of garbage tokens; reduces bounce-spam cost; matches existing UNKNOWN handler) |
| `rejected_low_balance` | `rejected_low_balance` | "MoveLeads: insufficient balance to claim ($X needed). Add funds at moveleads.cloud" |
| `rejected_optout` | `rejected_optout` | (empty TwiML — TCPA: we don't message opted-out users) |
| `rejected_unverified_phone` | `rejected_unverified_phone` | "MoveLeads: claim received but your phone isn't verified yet. Visit moveleads.cloud to verify." |

All SMS responses ride the same HTTP round-trip via TwiML — **we do not issue any outbound Twilio API calls.** This is critical: a separate outbound send would need its own delivery tracking, retry policy, and rate accounting. Riding the inbound response is free (Twilio sends it as the reply to the inbound message) and cannot lose.

### `broadcastLeadSold` import — decision

Two options:

- **(A)** Export `broadcastLeadSold` from `routes/bids.js` and import it in `routes/twilio.js`. Single source.
- **(B)** Duplicate the 4-line `broadcastLeadSold` helper into `routes/twilio.js`.

**Decision: (B), duplicate.** Reasons:
- "No clever abstractions" per operator constraint. The function is 4 lines; the cost of duplication is low.
- Exporting from `routes/bids.js` couples the two routes. If a future PR-S6 wants to vary the emit (e.g. SMS-claim-specific room), the export creates churn.
- Lock-in tests pin both helpers; drift becomes a test failure, not silent.

---

## 13. Confirmation SMS Behavior

All confirmations ride via TwiML `<Response><Message>...</Message></Response>` on the inbound HTTP response. **No outbound `sendMoverLeadSMS()` calls.**

### Happy path (`won`)

```
MoveLeads: lead claimed! $<price> debited.
Customer: <firstName> <lastInitial>
Phone: <PII unlocked phone>
View: moveleads.cloud/dashboard/customers
```

160-char budget — the variable-length fields (firstName, phone) force a truncation guard. If body > 160, truncate the final URL line and the rest stays. **Implementation:** build the body, check length, if over budget drop the URL line entirely (the mover knows where the dashboard is). PII fields stay non-negotiable.

### PII release on `won`

Today (Phase 4) the customer name + phone are NOT released to anyone except the mover who claimed the lead. The SMS payload includes them because the mover has already paid for the lead and is contractually entitled to the contact info. **Decision:** include first name + last initial + phone in the SMS body. Full name appears in the dashboard.

### Loser SMS (the table in §12 above)

All loser SMS bodies fit comfortably under 160 chars by design.

### Edge case: TwiML rendering when User.smsOptOut

If a mover has `smsOptOut === true`, we MUST NOT send TwiML with a Message tag — that would push an SMS to them. For `rejected_optout` the response is `<Response/>` (empty TwiML, 200 OK).

---

## 14. Logs & Audit Trail

### Log lines (operator visibility)

```
[Twilio SMS Inbound] CLAIM keyword="SEND" token=A7K2 from=+1... userId=<id> messageSid=SM...
[Twilio SMS Inbound] CLAIM duplicate MessageSid SM... — already processed, no-op
[Twilio SMS Inbound] CLAIM shadow_only token=A7K2 (ENABLE_SMS_CLAIM_LIVE off)
[Twilio SMS Inbound] CLAIM won lead=<id> mover=<id> price=$<n>
[Twilio SMS Inbound] CLAIM lost_already_claimed token=A7K2 mover=<id>
[Twilio SMS Inbound] CLAIM lost_window_expired token=A7K2 mover=<id>
[Twilio SMS Inbound] CLAIM rejected_low_balance mover=<id> price=$<n> balance=$<n>
[Twilio SMS Inbound] CLAIM rejected_unmatched_token token=A7K2 from=+1...
[Twilio SMS Inbound] CLAIM rejected_optout mover=<id>
[Twilio SMS Inbound] CLAIM rejected_unverified_phone mover=<id>
[Twilio SMS Inbound] CLAIM ERROR <stack> — returning empty TwiML, Twilio will retry
```

### Audit-trail comments

- `routes/twilio.js` claim branch: top-of-block comment with `PR-S3` tag, the flag name, "replicates routes/bids.js:101-186", and the disambiguation rationale for the lead-flip-null branch.
- `routes/bids.js`: a **single comment line** added above the buy-now atomic block referencing PR-S3 as the sibling. Reason: future contributors editing one should know the other exists.
- `utils/claimWindow.js`: `findOpenWindow()` doc references PR-S3.

### ClaimAttempt rows as forensics

Operator-facing query patterns the rows must support (all enabled by existing indexes from PR-S1):

- `{ moverId, receivedAt: { $gte: T } }` — what did this mover try in the last hour?
- `{ leadId, receivedAt: { $gte: T } }` — who tried to claim this specific lead?
- `{ outcome: 'rejected_low_balance' }` — who's running out of money?
- `{ outcome: 'lost_already_claimed' }` — how often are movers losing the race? (Phase 5 health signal)
- `{ outcome: 'won', receivedAt: {...} }` — count successful SMS claims in a window.

---

## 15. Test Matrix (lock-in suite scope)

File: `server/__tests__/smsClaimLiveHandler.test.js`. Pure-Node, no Mongo for source-level assertions. Pattern: source-only assertions + functional unit tests for the parsing/disambiguation helpers.

### A. Route surface (source-level)

- A1. `routes/twilio.js` does NOT add a new endpoint — the existing `/sms/inbound` is extended.
- A2. The claim branch sits between STOP and START/HELP (order pinned by regex on source).
- A3. `twilioWebhook` middleware still applied (signature validation).

### B. Flag gating

- B1. `ENABLE_SMS_CLAIM_LIVE` is checked with strict equality `=== 'true'`.
- B2. When flag is off, no `Lead.findOneAndUpdate` is reachable in the claim branch (source-level grep).
- B3. Flag-off ClaimAttempt outcome is exactly `'shadow_only'`.

### C. Twilio idempotency

- C1. ClaimAttempt insert with `twilioMessageSid` is the FIRST DB write in the claim branch (source-order assertion).
- C2. The insert is wrapped in try/catch that explicitly checks `err.code === 11000`.
- C3. On E11000 the handler returns empty TwiML (200) — no further DB writes.

### D. Lead-flip CAS

- D1. Filter contains exactly `'claimWindow.token'`, `'claimWindow.status': 'open'`, `'claimWindow.expiresAt': { $gt: <date> }`, AND `moverVisibilityFilter()` spread.
- D2. Update sets `'claimWindow.status': 'claimed'`, `'claimWindow.claimedBy'`, `'claimWindow.claimedAt'`, `'claimWindow.closedReason': 'claimed'`, AND `auctionStatus: 'buy_now'`.
- D3. The CAS uses `findOneAndUpdate` (not find-then-save).

### E. Atomic sequence replication

- E1. After lead-flip succeeds, the next DB op is the conditional debit `User.findOneAndUpdate({ _id, balance: { $gte: price } }, { $inc: { balance: -price } })`.
- E2. On debit null, the lead is reverted with a filter scoped to `claimedBy: moverId` (so we only undo our own claim).
- E3. PurchasedLead is created with `{ company, lead, pricePaid }` — same shape as `routes/bids.js`.
- E4. On PurchasedLead E11000, BOTH debit refund AND lead revert happen.
- E5. Transaction.create is called with description matching `/SMS claim: lead/`.
- E6. `lead.save()` finalizes with `winnerId`, `finalPrice`, `auctionStatus: 'sold'`, `status: 'Purchased'`, and pushes a `buyers` entry.

### F. Disambiguation read

- F1. On lead-flip null, the handler does a single `Lead.findOne({ 'claimWindow.token': token })` read.
- F2. The three outcome branches (`lost_already_claimed`, `lost_window_expired`, `rejected_unmatched_token`) are reachable from the disambiguation (source grep).

### G. Sender precondition checks

- G1. `smsOptOut: true` short-circuits BEFORE any state mutation.
- G2. `phoneVerified !== true` short-circuits BEFORE any state mutation.
- G3. Unknown sender (no User match) → `rejected_unverified_phone` (treat unknown as unverified).

### H. Confirmation SMS (TwiML)

- H1. Happy-path TwiML contains `lead claimed` text + the price.
- H2. Loser TwiML is the documented per-outcome string OR empty (for unmatched-token, opt-out).
- H3. No outbound `sendMoverLeadSMS` call is reachable from the handler (source grep — confirmation rides TwiML only).
- H4. Body is ≤160 chars (truncation guard if dynamic fields push it over).
- H5. On `smsOptOut`, response is empty `<Response/>` — no Message tag.

### I. Audit-trail comments

- I1. `routes/twilio.js` claim branch carries `PR-S3` audit tag.
- I2. `routes/bids.js` carries a one-line comment referencing PR-S3 as sibling.

### J. Scope discipline

- J1. `routes/bids.js` financial atomicity block (`routes/bids.js:108-179`) is byte-for-byte unchanged. Snapshot the function body via regex and assert equality against a hash committed in the test.
- J2. No new public route is added in `routes/twilio.js` (only the existing `/sms/inbound` modified).
- J3. `User.smsClaim.maxLeadPrice`, `.residentialOnly`, `.asapOnly`, `.dailyClaimCap` are NOT referenced anywhere in `routes/twilio.js` (retire-the-read principle).

### K. Helper: `findOpenWindow(token)`

- K1. Exists in `utils/claimWindow.js`.
- K2. Query is `Lead.findOne({ 'claimWindow.token': token })` with no extra filters (we want the lead so we can disambiguate; filtering would hide info).
- K3. Returns `null` for missing tokens.

### L. Behavioral unit test (in-process, no Mongo)

For one or two paths, use a Mongo mock or stub layer to assert end-to-end ordering without standing up a database. Specifically:

- L1. Happy path: mock `ClaimAttempt.create`, `Lead.findOneAndUpdate`, `User.findOneAndUpdate`, `PurchasedLead.save`, `Transaction.create`, `lead.save` — assert call order matches the documented sequence.
- L2. Insufficient-balance path: mock the debit to return null, assert the revert lead-flip is called with the moverId-scoped filter.

**Tentative L matrix size:** ~6 behavioral tests, each ~30 lines. Total estimated lock-in suite size: 35-40 assertions, ~600 lines. (PR-S1 was 14, PR-S2 was 14, PR-S5 was 24, PR-S4 was 19. PR-S3 is larger because it has more branches.)

---

## 16. Rollout Plan

1. **Merge PR-S3 with flag default OFF.** No production behavior change.
2. **Staging activation:** flip `ENABLE_SMS_CLAIM_LIVE=true` in Render staging only. Verify a controlled test claim end-to-end. Inspect ClaimAttempt rows + Lead.claimWindow + PurchasedLead + Transaction for correctness.
3. **Production canary:** flip `ENABLE_SMS_CLAIM_LIVE=true` in prod during a low-volume window. Watch the four log patterns from §14. Operator-driven, not automated.
4. **PR-S6 (loser-notification SMS path) before broad rollout:** PR-S3 confirms only to the sender of the winning reply. Losers (other broadcast recipients) get nothing today. PR-S6 closes that gap.
5. **Soak window:** ≥7 days in production with `ENABLE_SMS_CLAIM_LIVE=true` before declaring Phase 5 complete.

---

## 17. Known Limitations / Out of Scope

- **No de-dupe by mover phone across multiple inbound replies.** If a mover sends `SEND A7K2` twice (different MessageSids, e.g. quick double-tap), the second hits `lost_already_claimed`. Acceptable.
- **No rate-limit on parsed-token attempts.** A pathological mover sending hundreds of unmatched tokens generates ClaimAttempt rows but no money loss. TTL (90 days from PR-S1) caps storage.
- **No cross-channel reconciliation.** If a buy-now and an SMS claim race for the same lead, the lead-flip filter resolves it. We don't proactively cancel the other path; it simply finds the lead in the wrong state and rejects.
- **Confirmation SMS does NOT carry the customer phone for losers.** Only winners get PII. Losers get the rejection reason only.
- **No mover-facing UI surface in PR-S3.** Dashboard already shows owned leads; SMS-claimed leads appear there via the standard `PurchasedLead` query.
- **PR-S6 (loser SMS notifications, e.g. "Lead claimed by another mover, no charge") is a separate PR.** Out of scope here.

---

## 18. Open Questions (please flag if any of these need a different answer before I implement)

1. **PII in winner SMS body.** Plan says "first name + last initial + phone." Confirm — or do you want just "Lead claimed; details in dashboard"?
2. **Bare-token claims.** Plan accepts `A7K2` (no `SEND` prefix). Confirm — or strict `SEND <token>` only?
3. **Disambiguation read on lead-flip null.** Plan does one extra read to distinguish `lost_already_claimed` / `lost_window_expired` / `rejected_unmatched_token`. The cost is one indexed lookup on the loser path. Confirm or skip and lump all three as `rejected_unmatched_token`?
4. **`broadcastLeadSold` duplication vs. import.** Plan duplicates the 4-line helper into `routes/twilio.js` to avoid coupling. Confirm or import from `routes/bids.js`?
5. **`closedReason: 'expired'` for revert path.** Plan reuses the existing enum value on revert since `'reverted'` doesn't exist yet. Confirm or add the enum value in this PR?
6. **Ledger description.** Plan uses `SMS claim: lead ${id}`. Confirm wording or pick a different phrasing.

If all six match your intent, I implement as-described. If any differ, please flag and I'll revise the plan before writing code.
