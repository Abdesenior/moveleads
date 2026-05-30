# Pre-Pilot Polish Plan

Coordinated multi-agent recommendation set. Goal: mover-focused polish before pilot. Not feature development. Not architecture work.

Critical path being optimized: **purchase → customer contact → repeat purchase**.

---

## AGENT 0 — Program Manager (shared context)

### Mission

Read every prior audit, set scope boundaries, prevent conflicting recommendations, coordinate final categorization.

### Source documents consumed

- `docs/session-log-2026-05-30.md` — 18-PR session summary
- `docs/audits/pilot-readiness/00-overview.md` through `05-pilot-go-no-go.md`
- `docs/audits/pilot-readiness/operator-kit/` — daily monitoring + observation log
- `docs/audits/architecture-final/` — closing architecture audit (C1–C10)
- Mover Experience Audit (conversational, §1–§11)
- Memory: `marketplace-foundation-complete.md`, `dashboard-cleanup-complete.md`, `sms-claim-prelive-hardening.md`, `tier-override-set-now-wired.md`

### Hard scope boundaries (apply to every agent below)

| Constraint | Source |
|---|---|
| No schema changes | Operator directive 2026-05-30 |
| No marketplace routing changes | Operator directive |
| No SMS Claim changes (still parked behind 5 blockers) | `sms-claim-prelive-hardening.md` |
| No mover-dashboard architecture refactors | `dashboard-cleanup-complete.md` |
| No new features | Operator directive |
| No Lead Packs work | Research-only per prior turn |
| No onboarding wizard restructuring | Out of scope for polish phase |

### Two context corrections (override prior audit)

**Correction 1 — Resolution Center.**
The prior audit treated Resolution Center as a primary surface needing rename + empty-state + escape-hatch work. **It is not.** Resolution Center is a secondary workflow used only when a lead has an issue. It is OUT OF SCOPE for major redesign. Only minor wording is acceptable. The sidebar rename ("Resolution" → "Refunds & Disputes") is the only Resolution-related item that survives pilot-protector triage.

**Correction 2 — FirstTopupReassurancePopup.**
The prior audit flagged this popup as anti-revenue and recommended deletion. The popup is **intentional supply-management copy** — lead supply is currently limited, and the popup exists to prevent movers from spending balance on inventory that may not represent the freshest opportunities. It will NOT be deleted. It MAY be reworded to lean on "we'll alert you" framing instead of "we recommend waiting."

### Coordination rule

Where two agents touch the same string or surface, Agent 1 (Language Specialist) owns the wording, Agent 2/3/4 own structure. Agent 6 has final triage authority.

---

## AGENT 1 — Mover Language Specialist

### Mission

Rewrite software vocabulary into moving-industry vocabulary across buttons, labels, helper text, onboarding, billing, and Deal Room.

### Approved terminology map

| Surface | File | Current | Approved replacement |
|---|---|---|---|
| Sidebar | [DashboardLayout.jsx#L17-L29](client/src/components/DashboardLayout.jsx#L17-L29) | "Resolution" | **"Refunds & Disputes"** |
| Sidebar | same | "Widget" | **"Embed a form"** |
| Sidebar | same | "Instant Jobs" | **HIDE** (per Agent 3) |
| Deal Room subtitle | [Deals.jsx#L289-L298](client/src/pages/dashboard/Deals.jsx#L289-L298) | "Discounted secondary inventory. These leads are not real-time. They've been hand-picked and discounted by our team. Unlock works the same way as Live Leads." | **"Hand-picked leads at a discount. Same unlock as Live Leads — only difference is these aren't broadcasting right now."** |
| Onboarding stage | [OnboardingWizard.jsx](client/src/pages/OnboardingWizard.jsx) | "Dispatch" | **"Your company"** |
| Onboarding stage | same | "Coverage" | **"Where you work"** |
| Onboarding stage | same | "Alerts" | **"How we reach you"** |
| Onboarding stage | same | "Activate" | **"Add your first balance"** |
| Onboarding step 5 pill | same | "Limited starter balance" | **"$50 bonus included"** |
| Onboarding skip link | same | "Continue without activating · Dashboard access stays limited until activation." | **"Browse leads first — you can add balance when you're ready to buy."** |
| Confirm purchase warning | [ConfirmPurchaseModal.jsx](client/src/components/ConfirmPurchaseModal.jsx) | "Purchases are final and only refundable through the dispute process." | **"$X will come out of your balance. If the customer is unreachable, you can request a refund from this lead's page."** |
| LeadFeed loading | [LeadFeed.jsx#L680-L687](client/src/pages/dashboard/LeadFeed.jsx#L680-L687) | "Scanning for live opportunities…" | **"Checking for new leads…"** |
| LeadFeed empty (matched) | same | "Your markets are active · We'll alert you the moment a verified request matches your setup." | **Keep first line. Add second line: "Or browse all marketplace leads →"** (links to All tab) |
| FirstTopupReassurancePopup | [FirstTopupReassurancePopup.jsx](client/src/components/FirstTopupReassurancePopup.jsx) | "We recommend waiting for fresh new moving leads entering your market." | **"We'll text and email you the moment a matching move request comes in. You can also browse the marketplace anytime."** *(Preserves supply-management intent; removes the "wait" framing.)* |
| Wallet labels (everywhere) | Billing.jsx + DashboardLayout.jsx | "MoveLeads Credits" / "Available Balance" / "Credits" / "Add balance" | **Standardize on "Balance" everywhere.** Top-up button: **"Add funds"**. |
| Verify Phone daily-limit error | [VerifyPhoneModal.jsx](client/src/components/VerifyPhoneModal.jsx) | "You've hit the daily verification limit. Try again tomorrow." | **"We've sent the limit of codes today. Try again in 24 hours, or call (307) 204-4792 to verify by phone."** |
| Verify Phone carrier-block error | same | "Verification SMS was blocked by our SMS provider…" | **"Couldn't send the code — your carrier may be blocking it. Call (307) 204-4792 and we'll verify you by phone."** |
| Resolution Center subtitle | [ResolutionCenter.jsx](client/src/pages/dashboard/ResolutionCenter.jsx) | "Manage customer feedback" | **"Refund requests and disputes."** *(minor wording only — Correction 1)* |
| Resolution empty state | same | "No complaints found. Great job!" | **"No active refund requests."** *(minor wording only — Correction 1)* |

### Out of scope for Agent 1

- Resolution Center page structure (Correction 1)
- Email template bodies (operator hasn't asked; large surface)
- SMS template bodies (live system, change-risk)

---

## AGENT 2 — Purchase Flow Specialist

### Mission

Audit only Lead View → Lead Purchase → Lead Contact. Optimize the moment Mike sees a lead, pays for it, and dials the customer.

### Recommendations (in flow order)

**P1. `tel:` and `mailto:` on every phone/email field**
- Scope: `MyLeads.jsx` expanded panel, `PurchaseSuccessModal.jsx`, `MyLeads.jsx` row contact rendering
- Wrap phone in `<a href="tel:+1XXXXXXXXXX" data-testid="lead-call-link">`
- Wrap email in `<a href="mailto:...">`
- Strip non-digit characters for the `tel:` href; preserve original for display
- **No backend changes. Render-layer only.**

**P2. Reorder PurchaseSuccessModal CTAs**
- File: [PurchaseSuccessModal.jsx#L70-L209](client/src/components/PurchaseSuccessModal.jsx#L70-L209)
- Today's order: "Keep browsing leads" (primary) → "View full move details" (secondary)
- Proposed order:
  1. **PRIMARY (button-shaped tel: link): "Call {customerName} now"** — large, full-width on mobile
  2. **SECONDARY: "View in My Leads"** — keep
  3. **TERTIARY (text link, not button): "Keep browsing"**
- The phone number remains visible above the CTAs (already there); the primary CTA is the call action.

**P3. Auto-timestamp Internal Notes**
- File: [MyLeads.jsx](client/src/pages/dashboard/MyLeads.jsx)
- When the operator presses Save on the notes field, prepend `· {Today | Yesterday | Mon May 25}` to the saved string IF the note text changed since last load.
- **No schema change.** Just client-side string prepending before PATCH.
- Format: localized day label, computed at save time from `new Date()`.
- Edge case: if the operator edits twice in one day, replace the last timestamp prefix, don't stack them.

**P4. Soften "dispute process" language** (delegated to Agent 1 — see P1.ConfirmPurchase row above)

**P5. Race-loss message — keep**
- Current: *"This lead was just purchased by another mover. Your balance was not charged."*
- This is excellent. No change.

### Out of scope for Agent 2

- Lead Feed filter logic (works)
- Stripe top-up flow (works)
- Refund flow (Correction 1)
- Onboarding (Agent 5 covers trust pre-first-purchase)

---

## AGENT 3 — Navigation Specialist

### Mission

Renames, hide/show decisions, grouping. No page redesigns.

### Recommendations

| Action | Item | Reason |
|---|---|---|
| **Hide** | "Instant Jobs" sidebar entry | SMS Claim is preview-only; live phase blocked behind 5 PRs (`sms-claim-prelive-hardening.md`). An empty page erodes day-1 trust. |
| **Rename** | "Resolution" → "Refunds & Disputes" | Mike says "refund," not "resolution." |
| **Rename** | "Widget" → "Embed a form" | "Widget" is engineering vocabulary. |
| **Rename** | "Live Leads" → keep as is | "Live" reinforces freshness. Distinct from Deal Room. |
| **Rename** | "Deal Room" → keep as is | Branded. Operator has invested in the name. Subtitle copy fix (Agent 1) does the work. |
| **Investigate** | "Customers" vs "My Leads" | Both exist. Are they duplicates? If yes — hide "Customers." If no — operator decision required. **Not auto-renamed.** |
| **Keep** | Profile, Settings, Billing, Overview | Standard SaaS nav. No churn. |

### Sidebar after Agent 3 (8 items)

> Overview · Live Leads · Deal Room · My Leads · *(Customers — pending investigation)* · Billing · Profile · Settings · Embed a form · Refunds & Disputes

### Out of scope for Agent 3

- Merging Profile + Settings — that's structural, not navigational.
- Reordering the sidebar — operator has stable mental model already.

---

## AGENT 4 — Mobile Mover Specialist

### Mission

Audit assuming mover is on iPhone, in truck cab, one-handed. Surfaces: MyLeads, Deal Room, Live Leads.

### Findings

**M1. MyLeads phone/email — plain text, not tappable**
- Worst mobile miss in the codebase. Operator in truck cannot one-hand a 10-digit memorize-then-redial flow.
- Fix: same as Agent 2 P1. Single tel: wrap.
- **Highest mobile ROI in entire app.**

**M2. PurchaseSuccessModal — buttons in landscape order, primary action is "Keep browsing"**
- On a 6.1" iPhone in portrait, the thumb reaches the bottom of the screen. The primary CTA should be **at the bottom**, full-width, and labeled **"Call now."**
- Fix: same as Agent 2 P2.

**M3. Deal Room table on mobile**
- DRX-1 added @media (max-width: 700px) breakpoint. Verify on real device: do rows stack? Is the "Unlock $X" CTA thumb-reachable in the bottom third?
- **Action: 5-min QA on a real iPhone before pilot.** No code change unless QA fails.

**M4. LeadFeed mobile card list**
- Already has mobile breakpoint (LeadFeed.jsx#L908-L943). Verify the "Unlock for $X" button has a tap target of at least 44×44px per Apple HIG.
- **Action: 5-min QA. Adjust padding if button is sub-44px.**

**M5. Internal Notes editor on mobile**
- The notes textarea is likely small on mobile. Mike typing one-handed wants a bigger surface.
- Fix: bump `min-height` and `font-size: 16px` (iOS will not auto-zoom on inputs ≥ 16px).
- Risk: low. Tailwind/CSS only.

**M6. Confirm-purchase modal on mobile**
- Two buttons side-by-side ("Cancel" / "Confirm purchase – $X"). On a small screen, the dollar amount may truncate.
- **Action: 5-min QA. Stack buttons vertically on max-width: 480px if truncated.**

**M7. Top bar "Available Balance · $X.XX" pill on mobile**
- Already collapses to icon-only on small screens. Working as intended.
- No change.

### Out of scope for Agent 4

- Native app (none exists)
- Bottom-tab navigation (no operator request)
- PWA install prompts

---

## AGENT 5 — Trust Specialist

### Mission

Increase confidence BEFORE first purchase. Pre-purchase trust only — refunds are Correction 1, OUT OF SCOPE.

### Findings

**T1. Wallet vocabulary inconsistency**
- "MoveLeads Credits" / "Available Balance" / "Credits" / "Add balance" — four terms for one thing.
- New mover wonders: "is the $50 bonus a separate pot?"
- Fix: Agent 1 row 7 — standardize on "Balance."

**T2. ActivationSuccessModal copy lives in two files**
- *"Your $150 balance is active"* appears in BOTH [DashboardLayout.jsx#L419-L490](client/src/components/DashboardLayout.jsx#L419-L490) AND OnboardingWizard step 7.
- Drift risk: someone edits one. The day they diverge, the new mover thinks they were double-charged.
- Fix: extract into a single `<ActivationSuccess />` component or `ACTIVATION_HEADLINE` constant. **Internal refactor, no schema, no behavior change.**

**T3. Onboarding step 5 social-proof footer**
- *"Movers are currently activating coverage in your market."*
- Vague claim. If it's a static string with no underlying data, savvy movers notice eventually.
- Fix: either remove, or wire to a real recent-signup count for the mover's primary state. **Preference: remove until backed by real data.**

**T4. "Limited starter balance" ambiguity**
- "Limited" reads as "shitty" to half the audience and "exclusive" to the other half.
- Fix: Agent 1 row 5 — "$50 bonus included."

**T5. Register left-rail audience mismatch**
- *"Turnkey Booking Platform · Sales Funnel Built to Convert · AI Speed to Call · Instant Payments"*
- This rail was written for B2B partners (marketing agencies), not movers. A mover landing on Register reads it and bounces.
- Fix: rewrite left rail for the mover audience. Suggested:
  > **"Verified moving leads in your service area."**
  > **"Pay only for leads you unlock."**
  > **"Get alerted by text and email when a match comes in."**
  > **"Refunds available for unreachable customers."**

**T6. Email footer phone number**
- Footer claims partner reps Mon–Sat 8am–8pm CT.
- Trust hit if a mover calls and gets voicemail.
- **This is an operations problem, not code.** Flag for operator: confirm the line is answered, or rewrite the claim.

**T7. Empty Live Leads is silent**
- *"Your markets are active · We'll alert you the moment a verified request matches your setup."*
- A new mover with $150 balance and zero matched leads reads this and feels stuck.
- Fix: Agent 1 row 9 — add "Or browse all marketplace leads →" link.

### Out of scope for Agent 5

- Refunds (Correction 1)
- Post-purchase trust (Agent 2 covers contact flow)
- Stripe checkout (works; no operator concern)

---

## AGENT 7 — Freshness Perception Specialist

### Mission

Audit how the system communicates lead **recency**, **marketplace activity**, and **"this isn't picked-over"** to the mover. Goal: keep freshness signals trustworthy (so the mover believes leads are fresh when they are) without exposing data that suppresses conversion (e.g., "7 other movers already saw this").

### Why this matters for pilot

Marketplace trust at pilot scale is fragile. A pilot mover who unlocks a $25 lead and then *suspects* it was sitting around for a week (whether or not it was) writes off the product. Conversely, a mover who *believes* matched leads are minutes old is willing to buy fast — which is exactly the pilot critical path. Freshness perception is supply-side credibility.

### Findings

**Fr1. LeadFeed "Listed" column — already correct, no change**
- [LeadFeed.jsx#L792-L803](client/src/pages/dashboard/LeadFeed.jsx#L792-L803) renders `timeAgo(lead.distributionDecisionAt || lead.createdAt)` — relative format ("just now", "5m ago", "3h ago", "2d ago").
- Anchor is `distributionDecisionAt` — the moment the lead became visible to movers, not when the homeowner submitted. **This is the right anchor.**
- **No change required.** Document the choice so a future engineer doesn't "fix" it by switching to `createdAt`.

**Fr2. Deal Room "Listed" column — anchor is wrong**
- [Deals.jsx#L461](client/src/pages/dashboard/Deals.jsx#L461) renders `timeAgo(lead.updatedAt)`.
- `updatedAt` reflects the last DB mutation — if an admin re-prices a Deal Room lead that's been sitting 14 days, `updatedAt` resets to today and the mover sees **"1m ago"** when the lead is actually two weeks old.
- This misleads in the trust-positive direction. Mover unlocks expecting fresh, gets stale, blames the product.
- **Fix:** add a `dealRoomListedAt` derived from the inventory promotion event (or fall back to a deterministic field that doesn't move when an admin re-prices — `createdAt` is more honest than `updatedAt`). **Anchor-only fix; no UI change.**
- **Risk:** medium. Need to confirm which field actually tracks the promotion timestamp. If no such field exists today, the safer interim fix is `lead.createdAt` (over-states age, but never under-states it).

**Fr3. Deal Room "Listed" hidden on mobile**
- [Deals.jsx#L495-L500](client/src/pages/dashboard/Deals.jsx#L495-L500) has `col-listed` hidden via mobile CSS.
- Removing the freshness signal on the device most pilot movers will use is the worst of both worlds.
- **Fix:** show listed time on the Deal Room mobile card, even as a small footer line.

**Fr4. Connection state pill leaks transient states**
- [DashboardLayout.jsx](client/src/components/DashboardLayout.jsx) shows "Live · Reconnecting · Connecting."
- "Reconnecting" / "Connecting" expose underlying WebSocket lifecycle. A mover who sees "Reconnecting" thinks "old data showing — don't trust the feed."
- **Fix:** only render "Live" when connected; suppress transient states under 2s; show "Last updated 30s ago" only after a persistent disconnect (> 5s). **No state-machine changes — just a render-layer debounce.**

**Fr5. broadcastManifest — DO NOT surface to movers**
- PR #60 persisted `lead.broadcastManifest` (list of movers the lead was sent to).
- Tempting to display "Sent to 7 other movers" as transparency. **Do not.** Mover sees 7 = "no point, someone else got it." Conversion collapses.
- This is a **decision**, not a code change. Document it so no one ships this "feature" in a future polish PR.

**Fr6. Empty Live Leads needs a freshness anchor**
- Current empty state: *"Your markets are active · We'll alert you the moment a verified request matches your setup."*
- Promise is good but ungrounded — a mover sitting at an empty screen wonders "how often does the system check?"
- **Fix:** append a single line under the existing copy: **"We check continuously — alerts fire within seconds of a verified match."** No data dependency.

**Fr7. FirstTopupReassurancePopup — Agent 1's rewrite already covers this**
- New copy: *"We'll text and email you the moment a matching move request comes in."*
- "The moment a matching move request comes in" = freshness promise. **No additional change.**

**Fr8. Deal Room subtitle — Agent 1's rewrite already covers this**
- New copy: *"…only difference is these aren't broadcasting right now."*
- Honest about non-realtime without denigrating quality. **No additional change.**

**Fr9. Lead Feed sort default**
- [LeadFeed.jsx#L671](client/src/pages/dashboard/LeadFeed.jsx#L671) — verify default sort is "Recently Listed" (descending).
- If the default is anything else, freshness is being buried.
- **Action:** 2-min verification. If default is wrong, flip to "Recently Listed." If already correct, no change.

**Fr10. SMS body — no freshness timestamp**
- [smsService.js#L24-L72](server/services/smsService.js#L24-L72): SMS lead alert has no "just listed" wording.
- The mover's phone shows the SMS arrival time, which is a sufficient freshness signal. **No change.**

**Fr11. MyLeads — already shows purchase date**
- Post-purchase, freshness shifts from "is this lead fresh" to "is my follow-up timely." Agent 2's P3 (auto-timestamped notes) covers that. **No additional change.**

### Out of scope for Agent 7

- "Last lead matched: 2 hours ago" data display on empty Live Leads — requires query layer; defer to Phase 3.
- Animated pulse on newly-arrived rows — feature work, not polish.
- Cohort-level "X new leads today" counter — feature work; freshness *theater* not freshness *truth*.

---

## AGENT 6 — Pilot Protector (triage)

### Mission

Categorize every recommendation A (ship before pilot) / B (after pilot) / C (ignore). Reject feature creep, architecture work, unnecessary redesigns.

### Categorization

| ID | Recommendation | Source | Category | Notes |
|---|---|---|---|---|
| P1 | `tel:` + `mailto:` on MyLeads + PurchaseSuccessModal | Agent 2 / M1 | **A** | Single highest-ROI change. 30 min. |
| P2 | Reorder PurchaseSuccessModal CTAs (Call now → View in My Leads → Keep browsing) | Agent 2 / M2 | **A** | Same PR as P1. |
| P3 | Auto-timestamp Internal Notes | Agent 2 | **A** | 45 min, client-side only. |
| L1 | Sidebar rename: Resolution → Refunds & Disputes, Widget → Embed a form | Agent 1 / Agent 3 | **A** | 15 min. |
| L2 | Hide "Instant Jobs" sidebar entry | Agent 3 | **A** | 5 min. |
| L3 | Wallet vocabulary standardization → "Balance" | Agent 1 / T1 | **A** | 1 hr. Touches Billing.jsx + DashboardLayout.jsx. |
| L4 | Deal Room subtitle rewrite | Agent 1 | **A** | 5 min. |
| L5 | Onboarding stage labels (Dispatch/Coverage/Alerts/Activate) | Agent 1 | **A** | 15 min. |
| L6 | Onboarding step 5 "Limited starter balance" → "$50 bonus included" | Agent 1 / T4 | **A** | 5 min. |
| L7 | Onboarding skip link rewrite | Agent 1 | **A** | 5 min. |
| L8 | ConfirmPurchaseModal "dispute process" rewrite | Agent 1 | **A** | 5 min. |
| L9 | LeadFeed loading copy | Agent 1 | **A** | 2 min. |
| L10 | LeadFeed empty-state "Browse all marketplace leads →" link | Agent 1 / T7 | **A** | 15 min. |
| L11 | FirstTopupReassurancePopup copy improvement (preserve supply-management intent) | Agent 1 | **A** | 10 min. **Correction 2 applied — popup is NOT deleted.** |
| L12 | Verify Phone error messages | Agent 1 | **A** | 10 min. |
| L13 | Resolution Center subtitle + empty wording | Agent 1 | **A** | 5 min. **Minor only — Correction 1 applied.** |
| T5 | Register left-rail rewrite for mover audience | Agent 5 | **A** | 20 min. |
| M3 | Deal Room mobile QA (no code unless QA fails) | Agent 4 | **A** | 5 min QA. |
| M4 | LeadFeed mobile tap-target QA | Agent 4 | **A** | 5 min QA. |
| M5 | Notes textarea min-height + 16px font-size | Agent 4 | **A** | 5 min. |
| M6 | Confirm-purchase mobile button QA | Agent 4 | **A** | 5 min QA. |
| T2 | Extract ActivationSuccessModal copy to shared constant | Agent 5 | **B** | Internal refactor. Drift risk is theoretical until someone edits. Defer. |
| T3 | Onboarding step 5 social-proof footer (remove or wire to data) | Agent 5 | **B** | Defer — wait for pilot to show whether new movers notice. |
| T6 | Email footer phone-line operations check | Agent 5 | **A (ops)** | Not code. Operator action. |
| Fr1 | LeadFeed "Listed" anchor — document the choice | Agent 7 | **folded into Fr2** | Subsumed by Fr2's platform-wide freshness-anchor sweep + per-site comments. |
| Fr2 | **Deal Room freshness bug + platform-wide freshness-anchor audit** — never use `updatedAt` as a freshness signal | Agent 7 | **A (priority 1)** | Operator-approved. Top of Freshness & Trust subsection. |
| Fr3 | Restore "Listed" time on Deal Room mobile card | Agent 7 | **A (priority 2)** | Operator-approved. |
| Fr4 | Suppress transient "Reconnecting"/"Connecting" pill states (debounce) | Agent 7 | **B** | Not approved for Phase 1. Defer to Phase 2 / if time. |
| Fr5 | Permanently document `broadcastManifest` as internal-only | Agent 7 | **A (priority 5)** | Operator-approved. Inline comment + checklist line. |
| Fr6 | Empty-state reassurance — reinforce active monitoring | Agent 7 | **A (priority 4)** | Operator-approved. Live Leads + Deal Room empty states. |
| Fr9 | Verify + document "Recently Listed" as default sort | Agent 7 | **A (priority 3)** | Operator-approved. Verify, code-comment, flip only if wrong. |
| — | "Last match: 2 hours ago" data display on empty Live Leads | Agent 7 | **B** | Requires query layer; defer to post-pilot. |
| — | New-row pulse animations | Agent 7 | **C** | Feature, not polish. Reject. |
| — | Cohort-level "X new leads today" counter | Agent 7 | **C** | Freshness theater, not truth. Reject. |
| — | "Customers" vs "My Leads" disambiguation | Agent 3 | **B** | Investigation first, then operator decision. Not pilot-blocking. |
| — | Resolution Center structural redesign | Prior audit | **C** | **Correction 1.** Reject. |
| — | Delete FirstTopupReassurancePopup | Prior audit | **C** | **Correction 2.** Reject. |
| — | Lead Packs | Prior session | **C** | Operator: do not build. |
| — | SMS Claim go-live | Prior session | **C** | Parked behind 5 PRs. |
| — | Dashboard architecture refactor | Prior memory | **C** | Operator: do not touch. |
| — | Profile + Settings merge | Agent 3 evaluation | **C** | Structural change, not nav. |
| — | "Voicemail" status in MyLeads CRM | Prior audit | **B** | Schema-adjacent (enum value). Defer; let pilot data prove the gap. |
| — | Dispatch Hours TZ support | Prior memory | **B** | Parked as PR-C2b. Pilot-visible but not pilot-blocking. |

---

# UNIFIED ROADMAP

## Phase 1 — Immediate wins (under 1 day, single PR)

One PR, all string changes + tel:/mailto: + button reorder + sidebar hides + the QA tasks bundled.

| Item | Business impact | Effort | Risk | Why now |
|---|---|---|---|---|
| **P1** `tel:` + `mailto:` on MyLeads + PurchaseSuccessModal | **Very High** — first-call rate jumps. Mike in truck dials with one tap instead of memorizing 10 digits. | 30 min | Very low — render-layer only | This is THE mover unlock; without it the entire pilot conversion model is weaker than it needs to be |
| **P2** Reorder PurchaseSuccessModal CTAs ("Call now" primary) | **Very High** — moment of highest intent now points at the right action | 20 min | Very low | Same PR as P1; should ship together |
| **P3** Auto-timestamp Internal Notes | **High** — Mike's day-2 problem ("did I call yesterday?") disappears. Drives repeat purchase. | 45 min | Low — client-side only | Pilot needs movers to use My Leads to come back for purchase #2 |
| **L1** Sidebar renames (Resolution → Refunds & Disputes, Widget → Embed a form) | **Medium** — reduces day-1 confusion | 15 min | Very low | First impression matters in week 1 |
| **L2** Hide "Instant Jobs" sidebar entry | **Medium** — removes a trust-eroding empty page | 5 min | Very low — strictly hide, not delete the route | SMS Claim isn't live; the entry is a broken promise on day 1 |
| **L3** Wallet vocabulary → "Balance" everywhere | **High (trust)** — eliminates "is my $50 bonus a separate pot?" confusion | 1 hr | Low — find/replace across 2-3 files | New movers see this on day 1 |
| **L4** Deal Room subtitle rewrite | **High** — current "secondary inventory" reads as damaged goods | 5 min | Very low | Deal Room flips on at pilot day 1 |
| **L5** Onboarding stage labels (Dispatch/Coverage/Alerts/Activate → user nouns) | **High** — onboarding completion rate is gate to everything | 15 min | Very low | Pilot movers go through this in first 5 minutes |
| **L6** Onboarding step 5 "Limited" → "$50 bonus included" | **Medium** — removes activation-stage ambiguity | 5 min | Very low | Same |
| **L7** Onboarding skip link rewrite | **Medium** — keeps the door open for browsers | 5 min | Very low | Same |
| **L8** ConfirmPurchaseModal "dispute process" rewrite | **Medium** — softens the only adversarial phrase in the purchase flow | 5 min | Very low | Touches every first purchase |
| **L9** LeadFeed loading copy | **Low** — small polish | 2 min | Very low | Free with the bundle |
| **L10** LeadFeed empty-state "Browse all marketplace leads →" link | **High** — escape hatch when "Matched for you" is empty | 15 min | Low | New pilot mover with empty matched feed has somewhere to go |
| **L11** FirstTopupReassurancePopup rewrite — preserve supply-management intent | **High** — keeps the operational guardrail without dampening intent. **Correction 2 applied.** | 10 min | Low — copy only, popup logic unchanged | First top-up is the trust moment after payment |
| **L12** Verify Phone error messages | **Medium** — pilot movers hitting daily limit now have a path forward (call us) | 10 min | Very low | Pilot may surface verify edge cases |
| **L13** Resolution Center subtitle + empty wording — minor only | **Low** — secondary surface, polish for consistency. **Correction 1 applied.** | 5 min | Very low | Free with bundle |
| **T5** Register left-rail rewrite for mover audience | **High** — fixes a day-zero bounce | 20 min | Very low | Pilot recruit URL goes through Register |
| **M5** Notes textarea min-height + 16px font-size | **Medium** — Mike one-hand on iPhone | 5 min | Very low | Same PR |
| **M3 / M4 / M6** Mobile QA (Deal Room rows / LeadFeed tap targets / confirm modal stacking) | Verifies, not changes | 15 min total | None — observation only | Catches mobile breakage before pilot day 1 |
| **T6** Email footer phone-line ops check | **Medium (trust)** — confirms the support claim is true | 0 (operator action) | Not code | If line goes to voicemail, fix or remove claim |

### Phase 1 — Freshness & Trust subsection

Five approved freshness-perception items. Same PR as the rest of Phase 1. Ordered by operator-stated priority. The pilot succeeds only if movers trust the inventory and buy again — these items are the inventory-trust layer.

| # | ID | Item | Business impact | Effort | Risk | Why now |
|---|---|---|---|---|---|---|
| 1 | **Fr2** | **Deal Room freshness bug + platform-wide freshness-anchor audit.** Fix [Deals.jsx:461](client/src/pages/dashboard/Deals.jsx#L461) to stop using `lead.updatedAt` as the recency signal (admin re-pricing currently makes 14-day-old inventory display as "1m ago"). Then sweep every freshness display in the client + server (LeadFeed Listed column, Deals row, any Overview tiles, any admin freshness chips) and confirm none of them anchor on `updatedAt`. Codify the rule: **`updatedAt` is never a freshness signal — use `distributionDecisionAt`, `dealRoomListedAt`, or `createdAt`, in that preference order.** Add a code comment at each freshness display site so the rule survives future edits. | **Very High (trust)** — prevents the single failure mode that poisons marketplace credibility at pilot scale: unlocking a "fresh-looking" lead that's actually two weeks old | 45 min (10 min fix + 30 min audit sweep + 5 min comments) | Low — render-layer + comment-only changes | Deal Room flips on at pilot day 1; this is the only moment to inoculate before real movers see misleading timestamps |
| 2 | **Fr3** | **Restore freshness visibility on mobile.** [Deals.jsx:495-500](client/src/pages/dashboard/Deals.jsx#L495-L500) hides the `col-listed` column on mobile via CSS. Re-render the "Listed" timestamp as a small footer line inside the mobile card layout. | **High (mobile trust)** — most pilot movers will be on iPhone in the truck; hiding the freshness signal exactly where they need it most defeats Fr2 | 10 min CSS | Very low | Mobile-first pilot cohort |
| 3 | **Fr9** | **Verify and document default sorting behavior.** Confirm [LeadFeed.jsx#L671](client/src/pages/dashboard/LeadFeed.jsx#L671) and [Deals.jsx](client/src/pages/dashboard/Deals.jsx) both default to "Recently Listed" descending on first render. If either is wrong, flip it. Add a one-line comment at the sort-state initializer in each file documenting that **Recently Listed is the expected default** and why (mover trust + matches the freshness anchor from Fr2). | **High** — sort default is the single most influential decision the mover never makes consciously | 5 min verify + 5 min comments (+ 5 min fix only if wrong) | None | Same PR; freshness chain is incomplete without it |
| 4 | **Fr6** | **Empty-state reassurance: reinforce active monitoring.** Append a second line to the empty Live Leads state at [LeadFeed.jsx#L680-L687](client/src/pages/dashboard/LeadFeed.jsx#L680-L687): **"We check continuously — alerts fire within seconds of a verified match."** Same single line added to the Deal Room empty state below "No deals available right now": **"We restock as our team curates new inventory."** | **Medium (trust)** — grounds the alert promise; pairs with L10's "Browse all marketplace leads →" escape hatch to give the empty state both reassurance + action | 10 min | Very low | Empty states are pilot-day-1 surfaces |
| 5 | **Fr5** | **Permanently document `broadcastManifest` as internal-only.** Add a top-of-file comment in [server/models/Lead.js](server/models/Lead.js) (or wherever `broadcastManifest` is declared) stating: **"`broadcastManifest` is admin/observability-only. Do not expose mover competition counts ('Sent to N movers') to the mover UI. Surfacing this field tanks conversion — movers who see competition disengage."** Also add a code-review checklist line to `docs/audits/architecture-final/` (or equivalent) so future PRs touching client code that reads `broadcastManifest` get caught. | **Protective (forever)** — kills a class of well-intentioned future "transparency" PRs that would suppress conversion | 10 min (comment + checklist line) | None | Document while the rationale is fresh and PR #60 author context is recent |

**Phase 1 totals (updated):** ~4 hours of code + 25 min QA + 1 operator-action item + 1 platform-wide freshness audit + 2 permanent documentation decisions. **Still one PR.**

## Phase 2 — Pre-pilot improvements (this week, before pilot day 1)

Items worth doing if Phase 1 lands fast and there's time.

| Item | Business impact | Effort | Risk | Why now |
|---|---|---|---|---|
| **T2** Extract ActivationSuccessModal copy to shared constant | Low (long-term trust) | 1 hr | Low — internal refactor | Cheap to do before pilot increases the surface |
| **Customers-vs-MyLeads investigation** | Medium | 30 min audit | None | Need operator decision before pilot if the two pages overlap |
| **Pilot-cohort recruitment email rewrite** | Medium | 30 min | Low | Operator owns; coordinate with phase 1 copy direction |
| **Fr4** Suppress transient "Reconnecting/Connecting" pill states under 2s (debounce) | Low–Medium (trust) | 20 min | Low — render-layer debounce | Not approved for Phase 1; ship only if Phase 1 lands fast |

## Phase 3 — Post-pilot improvements (after 5-day pilot completes)

Items that should be validated against real mover behavior before shipping.

| Item | Business impact | Effort | Risk | Why later |
|---|---|---|---|---|
| **"Voicemail" CRM status** | Medium | 2 hr (enum + UI + tests) | Low — additive enum value | Let pilot prove the gap. If movers self-edit notes to track this, ship. If they use "Contacted" cleanly, don't. |
| **T3** Onboarding step 5 social proof — wire to real data | Low | 4 hr | Medium — touches a write surface | Wait for pilot to show whether anyone reads it |
| **Dispatch Hours TZ support (PR-C2b)** | Medium | 1 day | Medium — date math | Pilot will reveal whether UTC is causing real harm |
| **Customers/MyLeads consolidation** (if investigation confirms duplication) | Medium | 2 hr | Medium — affects routing | Operator decision after pilot data |
| **Email footer claim**: hours of operation if T6 ops check shows mismatch | Medium (trust) | 5 min copy | None | Only if T6 surfaces a real gap |
| **Resolution Center structural work** (if pilot surfaces refund volume) | Medium | 1 day | Low | Only ship if pilot shows movers using it; otherwise leave per Correction 1 |
| **"Last lead matched: 2 hours ago" data display** on empty Live Leads | Medium (trust) | 4 hr (query + cache) | Medium — adds a read path | Only ship if pilot shows movers bouncing from the empty state |

## Phase 4 — Intentionally postponed

| Item | Reason |
|---|---|
| Delete FirstTopupReassurancePopup | **Correction 2.** Popup serves supply-management goal. Copy improved in Phase 1; structure preserved. |
| Resolution Center redesign | **Correction 1.** Secondary surface; not on the critical path. |
| Lead Packs | Operator: do not build. |
| SMS Claim go-live | Parked behind 5 PRs in `sms-claim-prelive-hardening.md`. |
| Sidebar restructuring (Profile + Settings merge, reordering, etc.) | Architectural; out of scope. |
| Dashboard architecture refactor | Operator: `dashboard-cleanup-complete.md` halts this. |
| New email templates | Out of scope; large surface; risk to deliverability if churned. |
| Native mobile app | Not requested. |
| PWA install prompts | Not requested. |
| Dispatch orchestrator changes | Critical-path code; do not touch. |
| Marketplace routing changes | Critical-path code; do not touch. |
| Surfacing "Sent to N movers" / `broadcastManifest` to movers | Agent 7 Fr5. Conversion-killing transparency; data stays admin-only. |
| New-row pulse animations on Live Leads | Agent 7. Freshness theater, not truth. |
| Cohort-level "X new leads today" counter | Agent 7. Same — theater. |

---

## Mission-statement check

> **Trust the inventory.** → Phase 1 Fr2 + Fr3 + Fr9 + Fr6 + Fr5 (Freshness & Trust subsection)
> **Help movers understand faster.** → Phase 1 L1–L13 + T5
> **Help movers buy faster (speed to first purchase).** → Phase 1 L10 + L11 + Fr6 (empty state with active-monitoring promise)
> **Help movers contact customers faster (speed to contact).** → Phase 1 P1 + P2 (tel:/mailto: + Call now primary CTA)
> **Help movers buy again (speed to second purchase).** → Phase 1 P3 (timestamped notes drive return) + Fr2/Fr3/Fr9 (continued trust in feed freshness drives repeat unlocks)
> **Protect existing architecture.** → Phase 4 entirely; Agent 6 rejection column; Fr5 inoculates against future transparency regressions
> **Protect production stability.** → All Phase 1 items are copy, CSS, or render-layer; no schema, no business logic, no marketplace routing
> **Optimize for pilot success.** → Phase 1 ships as one PR before pilot day 1. The pilot succeeds if movers trust the inventory and buy again.
