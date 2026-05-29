# MoveLeads — Operator Pilot Readiness Pass

**Date:** 2026-05-29
**Verdict:** **GO** for the proposed 3-5 mover / 5 deal / 5 business day pilot
**Conditional on:** operator walking the [01-production-verification.md §B-§F runbook](01-production-verification.md) before flipping `ENABLE_DEAL_ROOM=true`

## What this folder is

The five-phase operator-readiness pass requested for pre-pilot. Each phase has its own doc; this overview is the navigation index.

| Phase | Doc | What it answers |
|---|---|---|
| 1 | [01-production-verification.md](01-production-verification.md) | What's verified live + the manual runbook for what the operator must verify before flipping the flag |
| 2 | [02-mover-journey-conversion-audit.md](02-mover-journey-conversion-audit.md) | UX/copy/CTA friction from Partners landing through first lead unlock |
| 3 | [03-pilot-metrics-dashboard.md](03-pilot-metrics-dashboard.md) | The 13 metrics to track + daily Mongo queries + tooling recommendations |
| 4 | [04-deal-room-business-review.md](04-deal-room-business-review.md) | Product/business review of DRX-1+DRX-2 + 7 explicit questions answered |
| 5 | [05-pilot-go-no-go.md](05-pilot-go-no-go.md) | GO/NO-GO + execution checklist + halt criteria + revisit triggers |

## Headline findings

### What's solid
- **Architecture:** Final audit closed C1 (silent state) + C3 (admin UI bug). Remaining open items are LOW or operator-policy. No double-purchase, stranded-lead, or visibility-leak vectors that aren't documented.
- **Financial path:** Same canonical `/api/bids/:leadId/buy-now` for marketplace and Deal Room. PurchasedLead `{company, lead}` unique mutex. Server-trusted price.
- **Test coverage:** 58 server test files, 0 failures. 105 new lock-in tests across the 4 PRs shipped this session.
- **Observability:** PR-3 (claim-attempts), PR-4 (broadcast manifest), PR-5 (SMS delivery callback), PR-D3 (Deal Room summary). Operator can answer "why didn't this dispatch" without grep-by-grep.
- **DRX-1+DRX-2:** Live in production. Exchange table + filter bar + sortable columns. Mobile-responsive.

### What's open and why it's not a blocker
- **C2** (refunded warm-transfer stranded) — near-zero practical occurrence today
- **C4-C10** — LOW / cosmetic / scaling concerns; pilot scale doesn't trigger them
- **Mover funnel friction** — surfaced in Phase 2, all recoverable for a curated pilot via operator personal touch

### Optional pre-pilot polish (operator decision)

Three small fixes, ~30 minutes each, none required:

| Fix | What | Why pre-pilot |
|---|---|---|
| **F1** | Add `tel:` + `mailto:` action buttons to MyLeads rows | Pilot movers will unlock leads on mobile and want to one-tap call |
| **F2** | Rename "Manage customer feedback" → "Lead disputes & refunds" + per-row dispute link from MyLeads | Pilot movers asking for refund won't find ResolutionCenter |
| **F3** | Delete `Partner Landing.html` from repo root | Eliminates the placeholder-phone reputational landmine |

**F3 is free.** F1 and F2 are nice-to-haves the operator can pick if they have ~1 hour of bandwidth left. If not, the pilot still proceeds — operator just stays in the loop on refunds and emails phone numbers manually if a mobile mover reports friction.

## How to use this folder

If you have **10 minutes**: read this overview + [05-pilot-go-no-go.md §A and §G](05-pilot-go-no-go.md#a--whats-been-verified-solid).

If you have **30 minutes**: also read [05 §D execution checklist](05-pilot-go-no-go.md#d--pilot-execution-checklist).

If you have **2 hours**: read all five phase docs in order, fill in the [01 §F verification report template](01-production-verification.md), then walk the [05 §D checklist](05-pilot-go-no-go.md#d--pilot-execution-checklist).

## What's NOT in this folder

- New feature builds — none
- Schema changes — none
- New env flags — none
- Lead Pack implementation — explicitly deferred per the prior DRX recommendation
- Cold-funnel conversion fixes — surfaced in Phase 2; queued for post-pilot

## Final answer to the operator's question

> "Should we run the pilot?"

**Yes.** The system is in the best pre-pilot state of this engineering cycle. The pilot's small scope makes risk-of-failure recoverable without blast. The only conditional is the 45-minute production-verification runbook ([Phase 1 §B-§F](01-production-verification.md)) which the operator should walk before flipping the flag.

Pilot execution checklist: [05 §D](05-pilot-go-no-go.md#d--pilot-execution-checklist). Halt criteria: [05 §E](05-pilot-go-no-go.md#e--halt-criteria-during-pilot).
