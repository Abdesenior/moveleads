# /get-quote-v6 — B2C Copy Positioning Refinement

**Date:** 2026-05-23
**Status:** Approved
**Scope:** Visual/copy refinement only. Zero touch on logic, state, payload, backend.

## Goal

Shift the `/get-quote-v6` landing page voice from "lead-gen marketplace SaaS" to **"trusted moving concierge — companion tone, you-focused."**

Customer mental state addressed: moving soon, stressed, doesn't want to call around, wants a fast simple guided path, wants trusted movers, doesn't want pressure.

## Voice direction (locked)

**Companion (you-focused).** Friendly, encouraging, you-as-subject. Less personal than "we-focused concierge", less austere than "quiet competence." MoveLeads is a helpful service that walks you through your move.

## Copy specification

### Eyebrow
- **Before:** `FREE QUOTE · 60 SECONDS`
- **After:** `MOVING MADE SIMPLE`

### Right card hero (desktop + mobile)
- **Headline:** `Plan your move in minutes.` (was "Where are you moving?")
- **Sub (desktop):** `Tell us where you're moving. We'll help you take the next step — no calling around, no pressure.`
- **Sub (mobile, shorter):** `Tell us where you're moving. We'll help you take the next step.`

### CTA
- **Active text:** `Continue — see your move details` (unchanged)
- **Disabled text:** `Enter your route to continue` (was active text shown faded)
- **Disabled style:** elegant grey — background `var(--bg-soft)` (`#F1F5F9`), text `var(--text-muted)` (`#94A3B8`), subtle inset border, **no orange glow**. Reverts the warm-cream disabled treatment from previous pass.

### Feature pills (4 items)
| Title | Subtitle | Icon |
|---|---|---|
| Free estimate | It's 100% free | receipt |
| **No pressure** | **Decide when you're ready** | heart |
| Licensed movers | Vetted & insured | lock |
| **Compare before booking** | **At your own pace** | tag |

### How it works (titles only, no subtitles)
| Step | Title |
|---|---|
| 01 | Share your route |
| 02 | Tell us about your move |
| 03 | Compare trusted movers |

Descriptions under each step REMOVED. Both desktop editorial layout and mobile HowCard rendering must respect this.

### Sidebar (left panel)
- **Headline:** `Find trusted movers without overpaying.` (unchanged)
- **Paragraph:** `Skip the endless calls. We'll help you plan your move and compare trusted movers — at your own pace.`

### Sidebar trust cards (3)
| Title | Subtitle | Icon |
|---|---|---|
| **Trusted movers near your route** | **Vetted, licensed, and local** | shield |
| **Less calling, less stress** | **We help narrow the search** | lock |
| **Compare before you book** | **At your own pace, no pressure** | phone |

### Reassurance line under CTA — unchanged
`Secure & private · Takes less than 60 seconds`

### Validation messages — unchanged
- Same ZIP: "Pickup and drop-off ZIPs can't be the same."
- Enrichment fail: "We couldn't calculate the route right now, but you can still continue."

## Files affected

1. `client/src/pages/getQuoteV6/screens/RouteScreen.jsx`
   - `RouteScreenDesktop`: eyebrow, headline, paragraph, feature pills, how-it-works rendering, sidebar paragraph, sidebar trust cards, disabled CTA text
   - `RouteScreenMobile`: eyebrow, headline, paragraph, disabled CTA text
   - `HOW_IT_WORKS` constant: titles updated, subs removed
2. `client/src/pages/getQuoteV6/components/PrimaryButton.jsx`
   - Disabled state styling reverts to elegant grey
3. `client/src/pages/getQuoteV6/components/HowCard.jsx`
   - Update to gracefully not render sub when absent (mobile uses HowCard)

## Files NOT touched (explicit guardrails)

- `client/src/pages/GetQuoteV6.jsx` (orchestrator)
- `server/**`
- `client/src/App.jsx`
- `client/package.json`
- `client/index.html`
- State machine, submit, payload, localStorage
- Mapbox/RouteMap
- `RoutePreviewMoment.jsx` (dedicated preview screen)
- All shells
- All other screens
- All typography/colors

## Implementation sequence

5 small commits, one concern each:

1. **Hero copy** — eyebrow + headline + paragraph (desktop + mobile)
2. **CTA disabled state** — `PrimaryButton.jsx` grey treatment + RouteScreen disabled text
3. **Feature pills** — 4 items refined
4. **How-it-works titles only** — update `HOW_IT_WORKS` constant + remove sub rendering on desktop + update `HowCard` to handle absent sub
5. **Sidebar copy** — paragraph + 3 trust cards

## Verification checklist

After each commit:
- `npm run build` passes
- `npm run lint` at 46 errors / 7 warnings baseline
- `git diff ea310b8..HEAD -- client/src/pages/GetQuoteV6.jsx` empty
- `git diff main..HEAD -- server/ client/src/App.jsx client/package.json client/index.html` empty

After all commits:
- Disabled CTA renders elegant grey (not warm cream)
- Disabled CTA shows "Enter your route to continue"
- Eyebrow shows "MOVING MADE SIMPLE"
- Headline shows "Plan your move in minutes."
- How-it-works shows 3 titles only, no subs
- Feature pills match the spec table exactly
- Sidebar paragraph + 3 trust cards match the spec table exactly
- Mobile copy aligns with desktop (mobile headline + sub + disabled CTA + eyebrow)

## Risks (low, manageable)

| Risk | Severity | Mitigation |
|---|---|---|
| "Plan your move in minutes." promises speed the funnel must deliver | Low | Funnel is ~60-90s; promise holds |
| Disabled grey might look "broken" | Low | Explicit copy "Enter your route to continue" explains state |
| Removing How-it-works subs reduces context | Low | Companion-tone titles are self-explanatory |
| Mobile shorter sub creates asymmetry | None | Intentional, space-constrained |
| HowCard render change might affect any other caller | Verify | grep `HowCard` usages first |

## What this DOES NOT change

Zero diff on:
- Layout structure
- Typography (fonts, sizes)
- Colors (palette tokens unchanged)
- CTA placement
- Card structure
- Mapbox / route preview
- Mobile layout structure
- Validation logic
- Backend / state / payload / submit / localStorage
