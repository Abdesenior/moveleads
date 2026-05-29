# Pilot Observation Log

One block per pilot day. Fill in at end of business day, before running the §B Mongo queries.

Each block: 5 minutes. Total 25 minutes over 5 days. Combined with the daily metrics queries (~10 min/day), total daily operator commitment: ~15 min.

---

## Day 0 (T-minus-1, Thursday) — pre-flip baseline

**Render env state:**
- [ ] `ENABLE_DEAL_ROOM` = `false` confirmed
- [ ] `SERVER_URL` = `https://api.moveleads.cloud`
- [ ] `STRIPE_SECRET_KEY` = live key (not test)

**Curated leads in admin:**
- Lead 1: route ___ → ___ · home size ___ · move date ___ · was $___ · now $___ · discount __%
- Lead 2: route ___ → ___ · home size ___ · move date ___ · was $___ · now $___ · discount __%
- Lead 3: route ___ → ___ · home size ___ · move date ___ · was $___ · now $___ · discount __%
- Lead 4: route ___ → ___ · home size ___ · move date ___ · was $___ · now $___ · discount __%
- Lead 5: route ___ → ___ · home size ___ · move date ___ · was $___ · now $___ · discount __%

**Pilot cohort (3-5 movers):**
- Mover 1: email ___ · pickup ___ · delivery ___ · funded $___
- Mover 2: email ___ · pickup ___ · delivery ___ · funded $___
- Mover 3: email ___ · pickup ___ · delivery ___ · funded $___
- Mover 4: email ___ · pickup ___ · delivery ___ · funded $___
- Mover 5: email ___ · pickup ___ · delivery ___ · funded $___

**Coverage match check:** each pilot mover covers at least __ of the 5 leads.

**Invitations sent:** [date/time]

---

## Day 1

**Time flag flipped to true:** _______

**First-hour log review** (4 hours after flip):
- Unique pilot movers seen in `[Deals] mover=` lines: __ of 5
- Render errors in the window: __
- Any halt criterion fired? [ ] no / [ ] yes — which: __

**End-of-day:**
- Did any pilot mover unlock a lead? Y / N — which lead?
- Notable mover feedback (direct email or call):
  > ___
- Surprises / breakages:
  > ___
- Felt:
  > [one sentence — what's working / what's not]

**Halt criterion review** (run §C queries from daily-monitoring-queries.md):
- H1 double-charge: pass / FAIL
- H2 negative balance: pass / FAIL
- H3 Stripe idempotency: pass / FAIL
- H4 stuck buy_now: pass / FAIL
- H5 refund inconsistency: pass / FAIL
- H6 deals log silence: pass / FAIL

---

## Day 2

[Same template as Day 1]

---

## Day 3

[Same template as Day 1]

---

## Day 4

[Same template as Day 1]

---

## Day 5

[Same template as Day 1]

**Pilot-end notes:**
- Total purchases: __ (of which Deal Room: __)
- Movers who purchased ≥ 1: __ of 5
- Movers who purchased ≥ 2 (repurchase): __ of 5
- Refunds: __ (each one detailed below)
- Halt criteria fired: __ total
- ARPM (cohort average): $___
- Median time-to-first-purchase: __ hours (among those who purchased)

**Decision (end of day 5):**
- [ ] GO for full rollout — flip stays `true`, announce broadly
- [ ] EXTEND pilot — keep flag on, invite 5-10 more movers, repeat next week
- [ ] HOLD — flip flag off, no announcement, investigate before retrying

**Reasoning (3-5 sentences):**
> ___

---

## End-of-pilot email to cohort

**Subject:** MoveLeads Deal Room pilot — your honest read

**Body:**
> Hi [name],
>
> Thanks for being one of our first Deal Room movers this week. Three quick questions:
>
> 1. What did you like?
> 2. What confused or frustrated you?
> 3. Would you keep using it if it costs nothing extra?
>
> Five sentences each is more useful than five paragraphs.
>
> [operator signature]

---

## Refunds log (filled in as they happen)

| Date | Lead ID | Mover ID | Refund type | Amount | Reason given | Operator notes |
|---|---|---|---|---|---|---|
| | | | | | | |
