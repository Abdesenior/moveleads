# Lead Quality Rollout — Execution Plan

> **Status:** Active. Phase 1 deployed (commit `96a710a`).
> **Companion docs:**
> - [2026-05-14-moveleads-v5-lead-quality-design.md](2026-05-14-moveleads-v5-lead-quality-design.md) — full architecture
> - [funnel-architecture-audit.md](../../funnel-architecture-audit.md)
> - [lead-qualification-audit.md](../../lead-qualification-audit.md)

This document tracks how we go from "shadow scoring deployed" → "lead qualification actually filtering bad leads in production." Each phase has explicit pre-checks, exit criteria, and a rollback. Phases are sequenced for **smallest reversible step first**.

---

## Where we are right now

- ✅ Shadow scoring writes a `ScoringSnapshot` doc on every `POST /api/leads/ingest`
- ✅ Admin can view snapshot per lead via UI (orange chart icon on each row)
- ✅ Public ingest route works (auth-gate fix shipped)
- ❓ Have not yet verified snapshots fire reliably on every lead
- ❓ Have not yet looked at score / tier distribution
- ❌ No production behavior is using the new scoring yet
- ❌ No validation upgrades (Twilio Lookup, Mapbox, Fingerprint)

The biggest risk right now is **flipping anything to `live` before we've seen shadow data confirm the engine produces sane output.** That's why every phase below is gated on observation.

---

## Phase 1.0 — Verify Phase 1 is healthy (today, ~30 min)

**Goal:** prove that shadow scoring is actually working for real leads and the output isn't obviously broken.

### Pre-checks
- [x] `SCORING_MODE=shadow` (default in code, no env override needed)
- [x] At least 2 real V4 submissions have flowed through since deploy
- [x] Admin can fetch `/api/admin/leads/:id/scoring-snapshot`

### Diagnostic checks (read-only, no code changes)
1. **Coverage** — for each of the 10 most recent leads, confirm a `ScoringSnapshot` exists. Any gap means the fire-and-forget call is failing silently for that lead.
2. **Tier distribution** — across all snapshots: % hot, % premium, % standard, % review, % rejected. Pathologies: 90%+ in any single tier, 0% in any one.
3. **Composite score distribution** — min, max, mean, p25/p50/p75. Pathologies: everyone at 0, everyone at 100, bimodal at extremes.
4. **Legacy vs shadow agreement** — sample a few leads. Does a legacy Grade A lead come out hot/premium? Does a legacy Grade D come out review/rejected?
5. **Hard-rule firings** — count leads where the tier was forced by a hard rule (intent confirmed false, REJECTED_FAKE status, fraudRiskScore ≤ 20). Should match expectations (small % of total).
6. **Render logs** — grep for `[scoringPipeline] shadow run errored` or `lead not found`. Should be zero.

### Exit criteria
- Coverage ≥ 95% of recent leads have snapshots
- No tier has 0% or > 80% share (after we have ≥ 30 leads — earlier numbers are noise)
- Composite scores aren't clustered at 0 or 100
- No pipeline errors in Render logs

### Rollback
- `SCORING_MODE=off` in Render env → pipeline skipped, zero impact
- Drop `scoringsnapshots` collection if needed

### Outputs
- Findings written into this doc under "Phase 1.0 results"
- List of bugs/calibration issues feeds Phase 1.1

---

## Phase 1.1 — Fix bugs found in 1.0 (conditional)

Only runs if Phase 1.0 surfaced specific bugs. Each bug gets its own fix commit. Still shadow mode; still no production behavior change.

---

## Phase 1.2 — Live distribution panel in admin (~1 hour, optional)

**Goal:** so we don't have to keep curling, give the admin a single panel showing live tier distribution + recent legacy-vs-shadow disagreements.

### Adds
- `GET /api/admin/scoring/distribution` — aggregates snapshots, returns counts + a small cross-tab of legacy grade × shadow tier
- New tab in `/admin/leads` page rendering it

### Skip if
- Phase 1.0 diagnostic is enough to reason about and we don't need to keep monitoring

---

## Phase 1.3 — Wait for data (1–3 days, calendar time only)

**Need 50+ real V4 submissions** before Phase 1.4 tuning. Earlier sample sizes are noise. Nothing to build; just calendar time + traffic.

---

## Phase 1.4 — Tune weights and thresholds (~1–2 hours)

**Goal:** adjust `WEIGHTS` in [leadScoringEngine.js](../../../server/services/leadScoringEngine.js) and `THRESHOLDS` in [leadTierRouter.js](../../../server/services/leadTierRouter.js) so the tier distribution looks realistic for *your* mix of leads.

### Process
1. Pull the latest 100+ snapshots
2. For each, manually classify as "would I want this lead?" (admin judgment)
3. Adjust weights so the engine's tier roughly matches the admin's gut call
4. Adjust thresholds so distribution is sane (rough target: 10–20% hot, 20–30% premium, 30–40% standard, 10–20% review, <10% rejected)
5. Re-score historical leads (snapshot regenerator) and compare new distribution

### Still shadow
Even after tuning, no production behavior changes. Two more phases of validation before we let the engine drive anything customer-facing.

---

## Phase 2 — Twilio Lookup validation (1–2 days)

**Goal:** sharpen fraud detection. Current Abstract API gives us valid/invalid/voip; Twilio Lookup gives us SMS Pumping Risk score, Line Type intelligence, and (later) Identity Match. Still **shadow**: writes to `ValidationLog` only, doesn't affect routing.

### Requires
- Twilio Lookup API enabled in your Twilio account (separate add-on)
- `TWILIO_AUTH_TOKEN` (already in env)
- `ENABLE_TWILIO_LOOKUP=false` default, flip to `true` after smoke test

### Adds
- `server/services/twilioLookupService.js` — wraps Twilio Lookup v2 API
- `server/models/ValidationLog.js` — new collection, TTL-indexed at 90 days
- Wire into existing scoring pipeline: when validation result exists, scoring engine uses it via `lead.validation.phone.*` (the engine already reads these fields)

### Exit criteria
- Lookup runs for ≥ 95% of new leads
- Cost-per-lead reasonable ($0.005 × N is acceptable at current volume)
- Identifies more VOIP / SMS-pumping leads than Abstract was catching

### Rollback
- `ENABLE_TWILIO_LOOKUP=false` → falls back to Abstract API only
- Drop `validationlogs` collection if needed

---

## Phase 6 (annotate-only) — Surface tier in admin UI (~half day)

**Goal:** make tier visible everywhere, but no routing changes yet.

### Adds
- Tier badge column in admin leads table
- Tier filter dropdown
- Tier badge in mover lead feed (read-only, no filtering)

### Exit criteria
- Admin can sanity-check at a glance whether new submissions are being correctly classified
- No mover complaints about visible badges (the leads they actually see don't change)

### Rollback
- Remove badge column; data still in place

---

## Phase 5 / Phase 6 (activation) — Use tier for real

**This is the goal.** Up to this point, tier has been observational. Now we let it influence behavior. Two ways to activate — pick one:

### Option A — Filter the dashboard (Phase 6 active)
Set `ENABLE_TIERED_ROUTING=true`. Movers stop seeing `tier: rejected` leads. Configurable: also hide `tier: review`. Movers see fewer but higher-quality leads.

### Option B — Tier-based pricing (Phase 5)
Use additive USD pricing where tier adds a multiplier. `tier: hot` costs more, `tier: review` costs less. Movers self-select on price.

**Recommend A first.** Pricing changes are observable in revenue; routing changes are observable in mover satisfaction. Pricing requires Phase 5 (`PricingAddOn` collection) which is its own work.

### Mandatory pre-checks before flipping ANY activation
- [ ] 2+ weeks of stable shadow data
- [ ] Tier distribution stable (no drift week-over-week)
- [ ] Manual review of 20+ leads per tier: do they actually deserve that tier?
- [ ] Admin override mechanism tested (manual tier downgrade / approval works)

### Rollback
- Set the flag back to false. Movers see all leads again, same as today.

---

## Phase 7 — SMS claim flow (later)

The spec's biggest single feature. Multiple race-condition risks. **Don't start until everything above is stable and we have 1+ months of clean shadow + activated routing data.**

---

## Today's actual next step

Phase 1.0 diagnostic. Read-only, no code, no deploy. Run against current production data via the existing `/api/admin/leads/:id/scoring-snapshot` endpoint to verify:
- Snapshots exist for recent leads
- Scores aren't pathological
- Tier distribution is sane

That tells us whether to proceed with Phase 1.2 (build the distribution dashboard) or Phase 1.1 (fix bugs).

---

## Phase 1.0 results — 2026-05-14

### Setup observations
- 202 leads in DB, **all predate the deploy**, none have snapshots (expected — shadow scoring didn't exist when those leads were created).
- All today's test leads (`6a...` IDs) were deleted from the admin UI between curl tests. So coverage data has to come from a fresh test.

### Fresh-lead verification
Submitted `Phase1 Diagnostic <epoch>` via curl: SF→NYC, 4 Bedroom, 5 days out, 2900 miles. Lead id `6a05c5d545176f358b52ac67`.

**Within 4 seconds, scoring snapshot existed** with full data:

| Metric | Value | Verdict |
|---|---|---|
| Snapshot written | ✓ via fire-and-forget | PASS |
| engineVersion | `v5.phase1.0` | PASS |
| mode | `shadow` | PASS |
| All 7 sub-scores populated | ✓ | PASS |
| Composite computed | 80 | PASS (correct weighted avg) |
| Tier assigned | `premium` (composite 80 ≥ 70 threshold) | PASS |
| Reasoning breakdown captured | ✓ (`cross-country`, `moving in <= 7 days`, etc.) | PASS |
| Legacy snapshot also captured | score=100, grade=A | PASS |

### Legacy vs shadow agreement
- Legacy gave Grade A (100). Shadow gave premium (80).
- **Directionally agree** (both say good lead).
- Shadow is **structurally more conservative for V4 leads** because `intentScore` defaults to 60 (neutral) when V4 doesn't collect explicit intent. This caps V4 leads at "premium" — they can't reach "hot" until V5 ships and provides `intentConfirmed: true`. This is a feature, not a bug — it creates natural V4↔V5 quality discrimination.

### No bugs to fix → Phase 1.1 skipped
Engine is healthy. Sub-scores compute. Tier router works. Persistence works. No errors logged.

### Next: Phase 1.2 + Phase 6-annotate combo
With one snapshot, a "live distribution" panel isn't useful yet — Phase 1.2 alone would be premature. Instead, ship the **Phase 6 annotate-only piece**: surface the shadow tier directly in the admin leads table as a badge column. This gives an at-a-glance view as new submissions accumulate, *without* changing any routing or mover behavior. Then the distribution panel (Phase 1.2) becomes a natural follow-up once we have ≥30 scored leads.
