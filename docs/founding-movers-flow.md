# Founding Mover Program — Funnel Flow

Public funnel at `/founding-movers`. One question per step after the intro. No auto-advance — every selection requires Continue. Branching logic noted inline. Email + phone collected at the end as a reward-unlock moment, not upfront.

**Tone:** dispatch-native, operational, confident. We talk to dispatchers and owners, not "users." We use *crews / requests / jobs / routes*, not *leads / users / features*.

---

## Step 1 — Intro (the only multi-field step)

**Heading:** Tell us about your operation
**Subhead:** We're building MoveLeads around how real moving companies actually work.

Three stacked text inputs (all required before Continue enables):

- First name
- Company name
- Main state (e.g., Texas)

**CTA:** Continue →

---

## Step 2 — Move types

**Heading:** What jobs do your crews run most?
**Helper:** Pick up to 3 — the type of work you actually want more of.
**Type:** Multi-select cards (max 3)

- Local residential moves
- Long-distance moves
- Office / commercial moves
- Same-day / urgent moves

**CTA:** Continue →

---

## Step 3 — Job sizes

**Heading:** What size jobs fit your crews?
**Helper:** The jobs you can handle without thinking twice.
**Type:** Multi-select cards

- Studio / 1-bedroom
- 2-bedroom
- 3-bedroom
- 4+ bedroom
- Office / commercial
- Specialty-item moves

**CTA:** Continue →

---

## Step 4 — Value signals

**Heading:** What makes your dispatch team jump on a request immediately?
**Helper:** Pick what actually moves the needle for your crews.
**Type:** Multi-select cards

- Customer answers the phone
- Move date is close
- Inventory is explained properly
- Customer sounds serious about moving
- Request reaches us quickly
- Exclusive access to the request

**CTA:** Continue →

---

## Step 5 — Confirmations

**Heading:** Before your dispatch team calls a customer, what should already be confirmed?
**Helper:** The details that save your crews time and avoid bad requests.
**Type:** Multi-select cards

- Pickup location
- Delivery location
- Move date
- Move size
- Inventory / heavy items
- Customer availability
- Whether the customer is ready to move forward

**CTA:** Continue →

---

## Step 6 — Shared or exclusive?

**Heading:** Shared or exclusive — how does your company prefer to buy?
**Helper:** No wrong answer. We're figuring out the right balance.
**Type:** Single-select cards

- **Lower-cost shared requests** → branches to step 7a
- **Higher-cost exclusive requests** → branches to step 7c
- **Depends on the move** → branches to step 7d

**CTA:** Continue →

---

### Step 7a — Shared: when sharing is OK  *(only if step 6 = shared)*

**Heading:** When is sharing OK?
**Helper:** Pick everything that fits how your team thinks about it.
**Type:** Multi-select cards

- If only a few movers receive the request
- If the request cost is lower
- If the customer is verified
- If it's a long-distance move

**CTA:** Continue →

---

### Step 7b — Shared: max movers  *(only if step 6 = shared)*

**Heading:** How many movers max should see the same request?
**Type:** Single-select cards

- 2 movers max
- 3 movers max
- 4+ movers

**CTA:** Continue → (then to Step 8)

---

### Step 7c — Exclusive triggers  *(only if step 6 = exclusive)*

**Heading:** Which requests are worth paying more to get exclusively?
**Type:** Multi-select cards

- Long-distance moves
- Commercial jobs
- High-intent customers

**CTA:** Continue → (then to Step 8)

---

### Step 7d — Depends triggers  *(only if step 6 = depends)*

**Heading:** Which requests should always stay exclusive?
**Type:** Multi-select cards

- Long-distance moves
- Commercial jobs
- High-intent customers

**CTA:** Continue → (then to Step 8)

---

## Step 8 — Priority scenario

**Heading:** Which request would your dispatch grab first?
**Helper:** Pretend all three landed in your inbox right now.
**Type:** Single-select large cards (3 cards, label + detail bullets)

**Card 1 — Exclusive 4-bedroom long-distance move**
- Houston → Denver, customer ready within 7 days
- Yours alone — no other movers see it
- Verified, high-intent

**Card 2 — Verified same-day local move**
- Customer needs trucks today
- Phone-verified, ready to book
- Shared with one other crew

**Card 3 — Commercial office relocation**
- Mid-size office, weekend timeline
- Decision-maker already on the call
- Exclusive request

**CTA:** Continue →

---

## Step 9 — Speed expectation

**Heading:** How fast does your team need to hit a fresh request?
**Helper:** After the customer submits — when does it matter most?
**Type:** Single-select cards

- First 5 minutes
- First 15 minutes
- First hour
- Same day is fine

**CTA:** Continue →

---

## Step 10 — Platform quality (grouped multi-select)

**Heading:** What separates a good request platform from a bad one?
**Helper:** Pick the things that matter most to your dispatch team.
**Type:** Grouped multi-select. Two labeled groups on one screen. Each option toggles selection in its group's underlying schema field.

**Group A — What makes one great** (writes to `retentionDrivers`)

- Accurate move details
- Fair pricing
- Fast delivery
- Requests are not overshared
- Better request matching
- Customers answer the phone

**Group B — What makes one painful** (writes to `overpricedSignals`)

- Customer doesn't answer
- Move details are incomplete
- Wrong service area
- Too many movers received it
- Request delivered too slowly
- Customer is not ready to move

**Continue enables:** when at least one option from either group is selected.

**CTA:** Continue →

---

## Step 11 — Broker experience

**Heading:** Have you bought leads or worked with a broker before?
**Helper:** Honest is best — we won't sell you anything based on this.
**Type:** Single-select cards

- **Yes, regularly** → step 12a
- **Yes, occasionally** → step 12a
- **No, but we're interested** → step 13
- **No** → step 13

**CTA:** Continue →

---

### Step 12a — Broker frustrations  *(only if step 11 = regularly or occasionally)*

**Heading:** Where do lead providers usually let movers down?
**Helper:** Pick everything you've actually run into.
**Type:** Multi-select cards

- Requests sent to too many movers
- Fake or unreachable customers
- Wrong move details
- Low-quality requests
- Requests delivered too slowly
- Paying too much for small jobs

**CTA:** Continue →

---

### Step 12b — Platform wish  *(only if step 11 = regularly or occasionally)*

**Heading:** If you could fix one thing about lead providers, what would it be?
**Helper:** Optional — every answer here shapes how we route requests.
**Type:** Free text (textarea, optional)

**Placeholder:** Be as direct as you'd like…

**Actions:** Skip → or Continue →

---

## Step 13 — Biggest problem (optional)

**Heading:** What's the biggest headache your crews face with move requests today?
**Helper:** Optional — be as honest as you'd like.
**Type:** Free text (textarea, optional)

**Actions:** Skip → or Continue →

---

## Step 14 — Founding access (reward-unlock moment)

**Heading:** You're on the list 🎯
**Subhead:** Where should we send your founding access once we open your market?

Two stacked text inputs (both required):

- Work email
- Phone number

**Below the inputs, 3 bullets reinforcing what they're claiming:**

- Early marketplace access
- Priority market availability
- $50 onboarding credit

**Helper line below the bullets:** We'll only use this to contact you about founding access and your onboarding credit.

**CTA:** Lock in my founding access →

On submit → POST `/api/founding-movers/submit` → advance to Step 15.

---

## Step 15 — Thank you (terminal)

**Heading:** You're on the founding partner list
**Subhead:** Your answers help us improve request quality, matching, and pricing — before we open more markets.

**Three checkmark bullets:**

- Early marketplace access
- Priority market availability
- $50 onboarding credit when your market opens

No CTA. Soft outbound link back to `moveleads.cloud` if natural.

---

## Branching map (quick reference)

| Source step | Answer | Next step |
|---|---|---|
| 6 (shared/exclusive) | shared | 7a → 7b → 8 |
| 6 | exclusive | 7c → 8 |
| 6 | depends | 7d → 8 |
| 11 (broker exp) | regularly / occasionally | 12a → 12b → 13 |
| 11 | interested / no | 13 |

---

## Steps a user actually sees (by path)

| Path | Path key | Step count (excl. thank-you) |
|---|---|---|
| Fastest | depends + no broker history | **12** |
| Typical | exclusive + yes broker | **14** |
| Maximum | shared + yes broker | **16** |

Compare to the v2 flow before this refinement: fastest 14, typical 17, max 20. Saved 2–4 screens across every path.

---

## Copy guardrails (what every step does to tone)

The funnel must read like a conversation with someone who *runs* a moving company. Quick check before shipping any copy change:

- ✅ "What makes your dispatch team jump on a request immediately?"
- ❌ "What features do you value most in a lead?"

- ✅ "What separates a good request platform from a bad one?"
- ❌ "Rate the importance of the following platform attributes."

- ✅ "Before your dispatch team calls a customer, what should already be confirmed?"
- ❌ "Which fields should be required at intake?"

- ✅ "How fast does your team need to hit a fresh request?"
- ❌ "What is your expected response-time SLA?"

- ✅ "We won't sell you anything based on this."
- ❌ "This information will not be used for sales purposes."

**Vocabulary swaps applied throughout:**

| Use | Avoid |
|---|---|
| crews | users |
| dispatch / dispatchers | recipients |
| requests | leads (in user copy; "leads" stays in dev/admin/internal) |
| jobs | tickets |
| routes | journeys |
| customer is ready to move | customer intent score |
| move date | service window |
| markets | regions |
| trucks today | service-day availability |
| founding access | beta access |

---

## UX guardrails (applied to every step)

- **One question per screen** (except intro)
- **No auto-advance** — Continue button on every step
- **Selected cards** = `#fff7ed` background, 2px `#ff6a14` border, filled orange check
- **Progress** = 3px orange filling line at the top. No counter. No phase labels. No step names.
- **Back chevron** = top-left, 44×44 hit area, hidden on intro + thank-you
- **Skip link** = only on optional textareas (12b, 13)
- **Transitions** = 220ms fade + 12px slide-up per step
- **Mobile-first** padding: 32px horizontal, 64px+ card height, 56px Continue button
- **Persistence** = localStorage key `ml_founder_v2`, 7-day TTL, restored on mount

---

## Data captured per submission

Stored in `MoverResearchSubmission` (server) with auto-generated tags. The funnel populates:

`companyName`, `contactName` (= first name), `email`, `phone`, `mainStateOrMarket`, `desiredMoveTypes`, `preferredJobSizes`, `valueSignals`, `requiredConfirmations`, `sharedExclusivePreference`, `sharedAcceptableConditions`, `sharedMaxMovers`, `exclusiveTriggers`, `exclusiveTriggersDepends`, `priorityScenario`, `speedExpectation`, `overpricedSignals` *(from Group B of step 10)*, `retentionDrivers` *(from Group A of step 10)*, `leadProviderExperience`, `leadProviderFrustrations`, `platformWish`, `biggestProblem`, `autoTags`, `utm`, `source: 'founding-movers-v2'`, `completionTimeSeconds`, `submittedAt`.

**Schema fields no longer populated by v2 (kept on server for backward compatibility with prior submissions):** `marketplacePreference`, `biddingTriggers`, `paidRequestReason`, `trustToTry`.
