# Phase 4 — Deal Room Business Review (Post-DRX-1+2)

**Scope:** product/business review only. No code recommendations to ship today. The seven explicit questions are answered with operator-actionable recommendations.

## TL;DR

| Question | Verdict |
|---|---|
| 1. Is the table optimal for movers? | **Mostly yes** — major UX win over cards. One missing affordance: pinning a lead while comparing. |
| 2. Is it optimal for brokers? | **Not yet** — brokers aren't users today. Worth designing FOR them post-pilot. |
| 3. What fields are still missing? | Coverage-match indicator + a 1-2 line "what this lead is" preview |
| 4. Show route quality scores? | **No** for pilot — confidence in scoring isn't there yet |
| 5. Coverage match indicators? | **Yes** — single highest-impact addition. Defer to a small post-pilot PR. |
| 6. Social proof ("X movers viewed this lead")? | **No** for pilot — false-scarcity tactic + adds latency |
| 7. What would lift conversion without complexity? | (1) coverage match badge, (2) sticky filter bar on scroll, (3) "best fit" auto-sort, (4) inline `Was → Now` math on hover |

---

## §1 — Is the table optimal for movers?

**Verdict: yes for browse, weaker for compare.**

What works:

- **Route-first scanning** — exactly how movers think. The City → City hierarchy is dominant. Confirmed by the LeadFeed.jsx pattern that's been in production for months.
- **Visible savings** — "Was $250 / Now $150 / −40%" is the killer feature of Deal Room. The strikethrough + bold + percent badge is unambiguous in a way the card discount ribbon wasn't.
- **Sortable Now column** — movers can find the cheapest available lead in their range in one click.
- **Filter bar** — Distance + Discount + Move date covers ~80% of "what would I want to narrow by."
- **Mobile collapse** — same JSX, CSS-driven stacked cards. Same purchase flow.

What's weak:

1. **No way to pin a lead while comparing.** A mover scrolling 50+ deals can't say "hold these 3 routes while I check my coverage." Browser tabs are the workaround today. **Recommendation: defer. Real-world pilot will tell us if this is needed.**
2. **No "best fit" sort.** Default `listed desc` shows "most recently moved to Deal Room" — operator-curated, not mover-relevant. **Pilot risk:** mover doesn't see the deal that best matches their setup at the top.
3. **No coverage match signal on the row.** A mover with pickup states `[TX]` sees an Atlanta → Miami deal at the top and has to evaluate whether it's worth scrolling for. **High-conversion gap.** (See §5 below.)
4. **Filter bar isn't sticky.** Scrolling past 10 rows loses the filter chips from view; mover doesn't see what's active. Visual flicker if they want to change it.
5. **Result-count line is muted.** Quiet at default is correct, but at high-filter combinations it's small and gray. A clearer "12 of 47 deals — clear filters" affordance would invite re-filtering.

## §2 — Is it optimal for brokers?

**Brokers are not currently a user class.** No `User.role === 'broker'` exists in production today. The data model accommodates them via the future `LeadPack.brokerSource` field documented in the DRX redesign, but no UI surface targets them.

**If brokers do enter the system post-pilot:**

- Brokers think in COHORTS, not routes. A realtor offering 20 leads from their network thinks "what's the package price?" not "is Dallas → Houston a good route?"
- Brokers care about **revenue split visibility** — "I get $X per lead sold, platform takes $Y, mover pays $Z."
- Brokers need **batch upload** for their leads, not the customer quote form.

**Verdict:** Deal Room as built is great for movers buying singles. For brokers, the entire DRX-3/4/5 follow-up sequence (pack model + admin pack creator + broker source schema) is required. **Build only if pilot proves demand.**

## §3 — What fields are still missing?

Per the audit, the row currently shows: Route + Size + Move Date + Listed + Was + Now + Action. That's the canonical exchange table.

**Missing fields ranked by impact:**

| Rank | Field | Source | Why | Effort | Recommend? |
|---|---|---|---|---|---|
| 1 | **Coverage match indicator** (✓ in my service area) | derived from `User.pickupStates/deliveryStates/deliversNationwide` vs `Lead.originState/destinationState` | Movers scan 50+ rows; coverage match is the gate that determines "is this lead even fillable for me." Pre-DRX-1 this didn't exist on the card; DRX-1 also doesn't have it. | ~1 hour client-side (server already returns the needed fields) | **Yes — defer to post-pilot, but the highest-leverage addition** |
| 2 | **1-line "specials" preview** | `Lead.specialInstructions` or `Lead.heavyItems` | "Has piano" / "3rd floor walkup" / "30 boxes" is a value-vs-time signal. Today this is invisible in Deal Room (it's projected out for PII reasons but `heavyItems` is fine). | ~30 min if just `heavyItems` | Maybe — depends on whether pilot movers complain about insufficient info |
| 3 | **Lead age badge** (separate from "Listed") | `Lead.createdAt` | The "Listed" column shows when admin curated it. The HOMEOWNER submitted earlier. Stale homeowner = worse conversion. | ~15 min | No for pilot — added complexity for marginal info |
| 4 | **Distance miles** | `Lead.miles` | Movers price by mileage. Already shown in the meta-line; surfacing as its own column may compete with Distance label. | ~15 min | No for pilot — meta-line is enough |
| 5 | **Quality tier badge** (Hot / Premium / Standard) | `Lead.shadowTier` via `toMoverLabel()` | The modal already shows this. Surfacing on the row might help — but introduces "your tier may be system OR admin override" complexity. | ~30 min | No for pilot — risk of confusing tier semantics |

**Net recommendation:** add ONE field post-pilot: the coverage match indicator (#1). Everything else is over-engineering today.

## §4 — Should we show route quality scores?

**No, not for pilot.** Three reasons:

1. **Confidence isn't there.** The scoring engine (`leadScoringEngine.js`) produces a composite score, but its calibration against real conversion is untested. Showing a score implies confidence we don't have. A mover acting on a low-confidence score is a bad outcome both ways.
2. **It conflicts with the operator's curation.** Deal Room is admin-curated discounted inventory. If admin moved a lead in, that's the implicit "this is worth your time" signal. Adding a system score competes with the operator's judgment.
3. **It hides what matters.** Quality scores can mask the actual conversion signal — coverage match, price, urgency. Mover energy spent decoding the score is energy not spent deciding to buy.

**When to revisit:** post-pilot, if scoring engine calibration improves and the operator wants to surface a numeric signal. Not before.

## §5 — Should we show coverage match indicators?

**Yes.** This is the single most valuable addition.

**Why:**

- A mover with pickup states `[TX, OK]` and `deliversNationwide=false` scanning a Deal Room with 50 leads spends ~2 seconds per row evaluating "is this in my area." That's 100 seconds of cognitive load BEFORE they consider price.
- A ✓ green checkmark in a "Match" column converts that 100s into ~5s (scan the ✓ column).
- Increased likelihood of recognizing a high-fit deal at the top of the table → fewer scrolls before purchase.

**Why DRX-1 didn't include this:**

- DRX scope explicitly stated the original Deal Room intent is "discount catalog — all qualified leads visible to all movers." [docs/audits/deal-room-pipeline/03-visibility-and-query-filters.md S4.3](../deal-room-pipeline/03-visibility-and-query-filters.md) locked in "no coverage filter on `/deals`" as an intentional design choice.
- A coverage MATCH **indicator** (badge) does NOT filter; it annotates. Different from the "filter by my coverage" toggle that S4.3 punts on. The indicator is purely informational.

**Implementation outline** (NOT to build today; just documenting feasibility):

- Client-side: read `useContext(AuthContext).user.pickupStates / deliveryStates / deliversNationwide`. Compare to `lead.originState / destinationState`. Render a small ✓ Match / ◯ Outside coverage badge in the Route cell.
- Effort: ~1 hour including a lock-in test. Pure additive. No server change.
- Risk: very low. Same shape as the LeadFeed `_matchesPreferences` annotation, but compute client-side because Deal Room read endpoint doesn't currently include the strict matcher.

**Decision needed from operator:** is this a Day-1 pilot fix or post-pilot? My recommendation: **Day-1**, ahead of the cohort flip. Small, isolated, high-conversion-impact PR.

## §6 — Social proof ("X movers viewed this lead")?

**No.** Three reasons:

1. **False urgency = trust loss.** Movers are sophisticated buyers. A counter that doesn't reconcile against their experience ("you say 12 viewed it, but I'm the only one") trains skepticism into every other claim on the page.
2. **Latency.** A live counter needs a read-modify-write or a cached aggregation. Either costs latency or staleness. The Deal Room is a polling page; adding a per-row backend round-trip is wrong.
3. **Pilot ethics.** With 3-5 pilot movers, the count would be ≤5. Showing "1 mover viewed this" or "0 viewed" is worse than no data. Showing fake inflated counts breaks trust permanently.

**When to revisit:** never as inflated counts. Maybe post-pilot as "this lead has been in Deal Room for X days" — an honest staleness signal — but only if the schema gets a `dealRoomMovedAt` field (which it doesn't today).

## §7 — What lifts conversion without complexity?

Ranked by impact / effort. **All four are post-pilot recommendations**, not pre-pilot fixes.

### 7.1 Coverage match indicator (✓ Match badge per row)

Already discussed in §5. ~1 hour. Highest impact.

### 7.2 Sticky filter bar on scroll

The filter bar at the top of the table scrolls out of view. Movers lose track of what filters are active. Make it `position: sticky; top: 0`. ~30 min CSS-only.

### 7.3 "Best fit" sort option

Add a fifth sort option to the Listed column dropdown: "Best fit" — uses the mover's coverage match + discount + recency in a simple weighted formula. Defaults to Listed for now; only activates if mover explicitly picks Best Fit. ~2 hours including the weighting decision.

### 7.4 Inline `Was → Now` math on hover

Today the "Now" column shows "$150  −40%". On hover, show "$250 → $150 (you save $100)". Movers' mental math is the bottleneck before they commit. ~30 min CSS-only with title attribute or tooltip.

### What I'd skip

- **A/B testing infrastructure** — out of scope for pilot scale.
- **Lead-quality scores on rows** — see §4.
- **Social-proof counters** — see §6.
- **Pack rows** — already deferred per DRX recommendation.
- **Subscription discounts / mover tiers** — adds pricing complexity that should be solved by pricing iteration, not UX.

## §8 — Honest gaps in the current Deal Room (operator-decision items)

These don't affect mover UX directly but affect operations:

1. **No "what's in Deal Room right now" dashboard for operator.** The PR-D3 summary endpoint (`GET /api/admin/inventory/deal-room/summary`) returns counts. There's no UI page that shows the inventory in real-time. Operator runs the curl manually. Acceptable for pilot.
2. **No bulk-edit on Deal Room leads.** Admin can move IN but can't edit prices in-place once they're there. Has to `restore_to_main` → edit → `move_to_deal_room`. Friction; not a blocker.
3. **Sort-by-`updatedAt` ambiguity.** Documented as cosmetic R6 in the audit. Any admin touch re-bubbles. Movers may see different ordering between sessions for no apparent reason.

## §9 — Net recommendation for pilot

**Ship pilot with the current DRX-1+DRX-2 implementation as-is.** Do not add the coverage match indicator before pilot **if** the operator agrees that 5 curated leads × 3-5 movers is a tight enough cohort that everyone will inspect every row anyway. At pilot scale, the cognitive-load problem is muted.

**Post-pilot, in order:**

1. Coverage match indicator (§5)
2. Sticky filter bar (§7.2)
3. Inline `Was → Now` math on hover (§7.4)
4. Best-fit sort (§7.3)

That sequence keeps each PR under 2 hours and gives the operator real data to decide whether DRX-3/4/5 (packs) is worth building.

## §10 — What I'd ACTUALLY ship pre-pilot

If the operator has 1 hour of pre-pilot engineering bandwidth left, **the highest-leverage pre-pilot polish is the coverage match indicator (§5).** Everything else can wait.

If the operator has 0 bandwidth, **ship pilot with DRX-1+DRX-2 as-is.** The table is already a strict improvement over the card grid; the missing affordances are nice-to-have, not deal-breakers.
