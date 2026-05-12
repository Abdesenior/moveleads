# Founding Mover Program — Funnel Flow

Public funnel at `/founding-movers`. One question per step after the intro. No auto-advance — every selection requires Continue. Branching logic noted inline. Email + phone collected at the end as a reward-unlock moment, not upfront.

**Tone:** dispatch-native, operational, confident. We talk to dispatchers and owners, not "users." We use *crews / requests / jobs / routes*, not *leads / users / features*.

**Option-label convention:** options are stored as `{ value, label, subline? }`. `value` is the stable string written to the schema (don't rename — the auto-tagger keys on it). `label` is the short visible title. `subline` (optional) is a one-line clarifier.

---

## Step 1 — Intro

**Heading:** Get early access to MoveLeads
**Subhead:** Answer a few quick questions so we can match your company with the right moving requests when we open your market.

**Three bullets visible above the inputs:**

- Founding mover access
- Request matching tailored to your crews
- $50 onboarding credit

**Three input fields below the bullets:**

- First name
- Company name
- Main operating state — **autocomplete typeahead** over the 50 US states. Match by name or two-letter abbreviation. Selected state renders as a removable chip. Keyboard support (↑ ↓ Enter Esc). No free-typed commits.

**CTA:** Continue → (disabled until all 3 fields satisfied)

---

## Step 2 — Move types

**Heading:** What jobs do your crews run most?
**Helper:** Pick up to 3.
**Type:** Multi-select cards (max 3)

| value (stored) | label (shown) |
|---|---|
| Local residential moves | Local residential |
| Long-distance moves | Long-distance |
| Office / commercial moves | Office / commercial |
| Same-day / urgent moves | Same-day / urgent |

**CTA:** Continue →

---

## Step 3 — Job sizes

**Heading:** What size jobs fit your crews?
**Type:** Multi-select cards

| value | label |
|---|---|
| Studio / 1-bedroom | Studio / 1-bedroom |
| 2-bedroom | 2-bedroom |
| 3-bedroom | 3-bedroom |
| 4+ bedroom | 4+ bedroom |
| Office / commercial | Office / commercial |
| Specialty-item moves | Specialty items |

**CTA:** Continue →

---

## Step 4 — Value signals

**Heading:** What makes your dispatch jump on a request?
**Type:** Multi-select cards

| value | label |
|---|---|
| Customer answers the phone | Customer picks up |
| Move date is close | Move date is close |
| Inventory is explained properly | Clear inventory details |
| Customer sounds serious about moving | Serious customer |
| Request reaches us quickly | Fast request delivery |
| Exclusive access to the request | Exclusive access |

**CTA:** Continue →

---

## Step 5 — Confirmations

**Heading:** Before your team calls, what should be confirmed?
**Helper:** The details that save your crews time.
**Type:** Multi-select cards

| value | label |
|---|---|
| Pickup location | Pickup location |
| Delivery location | Delivery location |
| Move date | Move date |
| Move size | Move size |
| Inventory / heavy items | Inventory / heavy items |
| Customer availability | Customer availability confirmed |
| Whether the customer is ready to move forward | Ready to book |

**CTA:** Continue →

---

## Step 6 — Shared or exclusive?

**Heading:** Shared or exclusive?
**Helper:** Pick what your company usually prefers.
**Type:** Single-select cards (with subline)

| value | label | subline |
|---|---|---|
| shared | Shared requests | Lower cost · more competition |
| exclusive | Exclusive requests | Only your company receives it |
| depends | Depends on the job | Varies by route and size |

**CTA:** Continue →

---

### Step 7a — When is sharing OK?  *(only if step 6 = shared)*

**Heading:** When is sharing OK?
**Type:** Multi-select cards

| value | label |
|---|---|
| If only a few movers receive the request | Only a few movers see it |
| If the request cost is lower | Lower request cost |
| If the customer is verified | Verified customer |
| If it's a long-distance move | Long-distance move |

**CTA:** Continue →

---

### Step 7b — Max movers per request  *(only if step 6 = shared)*

**Heading:** How many movers max per request?
**Type:** Single-select cards

- 2 movers max
- 3 movers max
- 4+ movers

**CTA:** Continue →

---

### Step 7c — Exclusive triggers  *(only if step 6 = exclusive)*

**Heading:** Which requests are worth paying more for?
**Type:** Multi-select cards

- Long-distance moves
- Commercial jobs
- High-intent customers

**CTA:** Continue →

---

### Step 7d — Depends triggers  *(only if step 6 = depends)*

**Heading:** Which should always stay exclusive?
**Type:** Multi-select cards

- Long-distance moves
- Commercial jobs
- High-intent customers

**CTA:** Continue →

---

## Step 8 — Priority scenario

**Heading:** Which request would your sales rep call first?
**Helper:** Pretend all three just landed.
**Type:** Single-select large cards (label + 3 detail bullets each)

**Card 1 — Exclusive 4-bedroom long-distance move**
- Houston → Denver, customer ready in 7 days
- Yours alone — no other movers see it
- Verified, high-intent

**Card 2 — Verified same-day local move**
- Customer needs trucks today
- Phone-verified, ready to book
- Shared with one other crew

**Card 3 — Commercial office relocation**
- Mid-size office, weekend timeline
- Decision-maker on the call
- Exclusive request

**CTA:** Continue →

---

## Step 9 — Speed expectation

**Heading:** How fast does your team need to hit a fresh request?
**Type:** Single-select cards (with subline)

| value | label | subline |
|---|---|---|
| 5min | First 5 minutes | Critical urgency |
| 15min | First 15 minutes | Still hot |
| 1hour | First hour | Solid window |
| sameday | Same day | Flexible |

**CTA:** Continue →

---

## Step 10 — Platform quality (grouped multi-select)

**Heading:** Good platform vs bad platform — what matters?
**Helper:** Pick what matters most.
**Type:** Grouped multi-select. Two labeled groups on one screen.

**Group A — What makes one great** (writes to `retentionDrivers`)

| value | label |
|---|---|
| Customers answer the phone | Customers pick up |
| Accurate move details | Accurate move details |
| Fair pricing | Fair pricing |
| Requests are not overshared | Not overshared |
| Fast delivery | Fast delivery |
| Better request matching | Better matching |

**Group B — What makes one painful** (writes to `overpricedSignals`)

| value | label |
|---|---|
| Customer doesn't answer | Customer doesn't pick up |
| Move details are incomplete | Incomplete move details |
| Wrong service area | Wrong service area |
| Too many movers received it | Sent to too many movers |
| Request delivered too slowly | Delivered too slowly |
| Customer is not ready to move | Customer not ready |

**Continue enables:** when at least one option from either group is selected.

**CTA:** Continue →

---

## Step 11 — Broker experience

**Heading:** Bought leads or used a broker before?
**Helper:** Honest is best.
**Type:** Single-select cards (with subline)

| value | label | subline |
|---|---|---|
| regularly | Yes, regularly | Multiple platforms |
| occasionally | Yes, occasionally | Tried a few |
| interested | Not yet — interested | Considering it |
| no | No | First time looking |

**CTA:** Continue →

---

### Step 12a — Broker frustrations  *(only if step 11 = regularly or occasionally)*

**Heading:** Where do lead providers let movers down?
**Helper:** Pick anything that applies.
**Type:** Multi-select cards

| value | label |
|---|---|
| Requests sent to too many movers | Sent to too many movers |
| Fake or unreachable customers | Fake or unreachable customers |
| Wrong move details | Wrong move details |
| Low-quality requests | Low-quality requests |
| Requests delivered too slowly | Delivered too slowly |
| Paying too much for small jobs | Overpaying for small jobs |

**CTA:** Continue →

---

### Step 12b — Platform wish  *(only if step 11 = regularly or occasionally)*

**Heading:** If you could fix one thing about lead providers?
**Helper:** Optional.
**Type:** Free text (textarea, optional)

**Actions:** Skip → or Continue →

---

## Step 13 — Biggest problem (optional)

**Heading:** Biggest headache with move requests today?
**Helper:** Optional.
**Type:** Free text (textarea, optional)

**Actions:** Skip → or Continue →

---

## Step 14 — Founding access (reward-unlock moment)

**Heading:** You're on the list 🎯
**Subhead:** Where should we send your founding access once we open your market?

Two stacked text inputs (both required):

- Work email
- Phone number

**Three bullets below the inputs:**

- Early marketplace access
- Priority market availability
- $50 onboarding credit

**Helper line:** We'll only use this for founding access and your onboarding credit.

**CTA:** Lock in my founding access →

---

## Step 15 — Thank you

**Heading:** You're on the founding partner list
**Subhead:** Your answers help us match your company with the right requests when we open your market.

**Three checkmark bullets:**

- Early marketplace access
- Priority market availability
- $50 onboarding credit when your market opens

---

## Branching map

| Source | Answer | Next |
|---|---|---|
| 6 | shared | 7a → 7b → 8 |
| 6 | exclusive | 7c → 8 |
| 6 | depends | 7d → 8 |
| 11 | regularly / occasionally | 12a → 12b → 13 |
| 11 | interested / no | 13 |

---

## Steps a user sees (by path)

| Path | Count |
|---|---|
| Fastest (depends + no broker) | 12 |
| Typical (exclusive + yes broker) | 14 |
| Maximum (shared + yes broker) | 16 |

---

## Copy guardrails

- ✅ "What makes your dispatch jump on a request?"
- ❌ "Which features do you value most in a lead?"
- ✅ "Shared requests / Lower cost · more competition"
- ❌ "Lower-cost shared requests"
- ✅ "Customer picks up"
- ❌ "Customer answers the phone"
- ✅ "Ready to book"
- ❌ "Whether the customer is ready to move forward"

**Vocabulary swaps:**

| Use | Avoid |
|---|---|
| crews / dispatch | users / recipients |
| requests | leads (user copy only) |
| jobs / routes | tickets / journeys |
| picks up | answers the phone |
| ready to book | ready to move forward |
| founding access | beta access |

---

## UX guardrails

- **One question per screen** (except intro)
- **No auto-advance** — Continue button on every step
- **Selected cards** = `#fff7ed` background, 2px `#ff6a14` border, filled orange check
- **Progress** = 3px orange filling line at the top
- **Back chevron** = top-left, 44×44 hit area, hidden on intro + thank-you
- **Transitions** = 220ms fade + 12px slide-up per step
- **Mobile-first** padding: 32px horizontal, 64px+ card height, 56px Continue button
- **Persistence** = localStorage key `ml_founder_v2`, 7-day TTL

---

## Data captured (schema stable)

Stored in `MoverResearchSubmission`. The funnel writes the **option `value`** strings (not the shortened labels) so the auto-tagger and admin analytics keep working unchanged. Schema fields populated by v2:

`companyName`, `contactName`, `email`, `phone`, `mainStateOrMarket` (now stored as `XX` two-letter code from autocomplete), `desiredMoveTypes`, `preferredJobSizes`, `valueSignals`, `requiredConfirmations`, `sharedExclusivePreference`, `sharedAcceptableConditions`, `sharedMaxMovers`, `exclusiveTriggers`, `exclusiveTriggersDepends`, `priorityScenario`, `speedExpectation`, `overpricedSignals`, `retentionDrivers`, `leadProviderExperience`, `leadProviderFrustrations`, `platformWish`, `biggestProblem`, `autoTags`, `utm`, `source: 'founding-movers-v2'`, `completionTimeSeconds`, `submittedAt`.

**Schema fields no longer populated by v2** (kept for v1 backward compat): `marketplacePreference`, `biddingTriggers`, `paidRequestReason`, `trustToTry`.
