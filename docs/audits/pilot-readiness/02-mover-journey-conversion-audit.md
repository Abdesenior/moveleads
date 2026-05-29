# Phase 2 — Mover-Journey Conversion Audit

**Scope:** trace the funnel from first touch to first lead unlock. Identify friction, copy issues, missing trust signals, weak CTAs. **UX/copy audit, not a code-bug audit.**

**Method:** independent agent walked the funnel as if a real mover. Findings synthesized below with my categorization for pilot relevance.

## §A — Findings by phase

Full per-phase detail at the bottom of this doc. Headline findings in priority order:

| Rank | Finding | Where | Pilot-cohort impact | Cold-funnel impact |
|---|---|---|---|---|
| 1 | **No `tel:` / `mailto:` action buttons on MyLeads** — customer phone is plain text, can't one-tap call | [MyLeads.jsx#L186-202](../../../client/src/pages/dashboard/MyLeads.jsx#L186-L202) | **HIGH** — pilot movers will unlock leads and not be able to call from mobile | HIGH |
| 2 | **USDOT required at registration** — local-only movers without USDOT bounce | [Register.jsx#L322-358](../../../client/src/pages/Register.jsx#L322-L358) | LOW — pilot cohort already registered | **HIGH** — cold sign-ups bouncing |
| 3 | **Onboarding wizard is hard-gated; ESC disabled on steps 1-4** — no preview before paying | [OnboardingWizard.jsx#L150-158](../../../client/src/pages/onboarding/OnboardingWizard.jsx#L150-L158) | LOW — pilot cohort already onboarded | **HIGH** — cold sign-ups feel trapped |
| 4 | **Partner Landing.html in repo root with placeholder `+1 (800) 555-0199` phone** — reputational risk if ever served | [Partner Landing.html](../../../Partner%20Landing.html) | None (not served) | **MEDIUM** — leak vector |
| 5 | **Two different confirm modals** — `ConfirmPurchaseModal` (Live Leads) vs `UnlockConfirmModal` (Deal Room) with materially different content | [ConfirmPurchaseModal.jsx](../../../client/src/components/ConfirmPurchaseModal.jsx) + [Deals.jsx#L572](../../../client/src/pages/dashboard/Deals.jsx#L572) | LOW-MED — pilot movers will notice the inconsistency | MED |
| 6 | **Empty LeadFeed has no coverage shortcut** — "Your markets are active" with no escape hatch | [LeadFeed.jsx#L683-687](../../../client/src/pages/dashboard/LeadFeed.jsx#L683-L687) | MED — pilot movers with narrow coverage see empty feed | HIGH |
| 7 | **"Manage customer feedback" wording in ResolutionCenter hides the refund path** | [ResolutionCenter.jsx#L99](../../../client/src/pages/dashboard/ResolutionCenter.jsx#L99) | MED — pilot movers asking for refund won't find it | MED |
| 8 | **No "best practices / call now" coaching after first purchase** — marketing promises 5-min response but product doesn't reinforce | [PurchaseSuccessModal.jsx](../../../client/src/components/PurchaseSuccessModal.jsx) | MED — pilot movers may not internalize the speed pitch | HIGH |
| 9 | **No price-vs-leads anchor at Billing** — "Add $100 in credits" with no "≈ N leads" context | [Billing.jsx#L221-273](../../../client/src/pages/dashboard/Billing.jsx#L221-L273) | LOW — pilot cohort already funded | HIGH |
| 10 | **"Discounted secondary inventory" jargon on Deal Room** — "secondary inventory" means nothing to a mover | [Deals.jsx#L295](../../../client/src/pages/dashboard/Deals.jsx#L295) | MED — pilot movers are evaluating this exact feature | MED |

**Brutal honest read from the agent:**

> Things that would make me NOT sign up:
> - USDOT required at signup. I'd bounce.
> - Forced wizard with no preview. I'm being closed by a timeshare salesman.
> - "$100 = $150 credits" headline + zero per-lead price disclosure.
> - Email verification before seeing anything (if spam-foldered, I'm done).
> - "We have nothing for you" empty state with no escape hatch.
> - **No "Call customer" button.** This is the single biggest "is this product a toy?" signal. A mover marketplace where the core action is plain text is not a serious product.

## §B — Pilot-relevance triage

The friction inventory above is severe, but **most of it does not block a curated pilot.** A 3-5 mover cohort that the operator hand-invites bypasses:

- ❌ Cold signup friction (USDOT, registration, email verification gate, post-register splash) — pilot cohort is pre-registered
- ❌ Onboarding friction (forced wizard, missing preview) — pilot cohort is pre-onboarded
- ❌ Billing friction (no per-lead price anchor, no first-deposit "what's the minimum") — pilot cohort is pre-funded
- ❌ Cold marketing friction (Partner Landing.html, conflicting credit pitches) — pilot cohort got operator-personal invite

What's left for the pilot cohort:

1. **MyLeads UX after first unlock** (Finding #1) — they will unlock a lead, want to call, and need to manually copy the phone number. **HIGH friction. Pilot-experience-degrading.**
2. **Resolution Center copy** (Finding #7) — if a pilot mover wants to dispute a lead, they may not find the path. **MED friction.**
3. **Empty LeadFeed coverage shortcut** (Finding #6) — only an issue if a pilot mover has narrow coverage and the curated Deal Room leads are outside it. The operator should pre-vet pilot movers' coverage against the 5 curated leads (Phase 5 §D D2 already calls this out).
4. **"Discounted secondary inventory" copy** (Finding #10) — pilot movers are evaluating Deal Room specifically; they'll read this and ask the operator. Operator can clarify in their pilot welcome email.

## §C — Operator-recoverable vs in-product

| Finding | Operator can recover via pilot personal touch? | Recommended action |
|---|---|---|
| #1 Missing `tel:` on MyLeads | Partial — operator can email the customer phone to the mover, but every unlock = manual ops overhead | **Defer to post-pilot polish. ~30 min fix.** |
| #2 USDOT required | N/A — cohort already registered | Defer |
| #3 Forced wizard | N/A — cohort already onboarded | Defer |
| #4 Partner Landing.html | Recoverable — delete or archive the file | **Pre-pilot, ~30 sec** |
| #5 Two confirm modals | Recoverable — operator can warn cohort | Defer |
| #6 Empty LeadFeed | Recoverable — pre-vet pilot cohort coverage matches leads | Pre-pilot, in operator runbook |
| #7 Resolution Center | Recoverable — operator stays in the loop on refunds during pilot | Defer |
| #8 No call-now coaching | Recoverable — operator's pilot welcome email can include this | Pre-pilot |
| #9 Billing anchor | N/A — cohort funded | Defer |
| #10 Deal Room jargon | Recoverable — operator's pilot welcome email clarifies | Pre-pilot |

## §D — Recommendations

### Pre-pilot operator actions (no engineering)

1. **Delete or archive `Partner Landing.html`** from repo root. ~30 seconds. Eliminates the reputational landmine.
2. **In the pilot welcome email, include:**
   - "Discounted leads" not "secondary inventory" — operator's voice, plain English
   - "Call your unlocked lead within 5 minutes" — reinforces the marketing promise the product currently doesn't
   - Direct support email for any dispute / refund (sidestep ResolutionCenter UX)
3. **Pre-vet each pilot mover's coverage** (`User.pickupStates`, `User.deliveryStates`, `User.deliversNationwide`) against the 5 curated Deal Room leads. Replace cohort if mismatch.
4. **Stay in the Render log + Mongo shell loop** during pilot Days 1-5. Manually catch the "I unlocked but can't call" friction by following up directly with each pilot mover within 1 hour of their first unlock.

### Pre-pilot engineering (optional, by impact / effort)

If operator has 1-2 hours of engineering bandwidth left:

| Fix | Effort | Why pre-pilot worth it |
|---|---|---|
| **F1** — Add `tel:` and `mailto:` action buttons to MyLeads rows | ~30 min | Removes the single worst pilot-cohort friction. Highest ROI. |
| **F2** — Rename ResolutionCenter "Manage customer feedback" → "Lead disputes & refunds" + add per-row "Dispute this lead" link from MyLeads | ~45 min | Closes the dispute-discovery gap |

Both are mover-facing copy/UX fixes, no schema/backend change. Same shape as PR-D1/D2/D3.

If operator picks F1 and/or F2: they fit comfortably in the pre-pilot window without disrupting the GO decision in [05-pilot-go-no-go.md](05-pilot-go-no-go.md).

If operator skips engineering: pilot proceeds with the operator-recoverable mitigations in §D above.

### Post-pilot priority list (all other findings)

Should be sequenced after pilot's first 5 days. Top 8:

1. Make USDOT optional at registration (closes cold-funnel bouncing)
2. Allow wizard preview-before-pay ("browse 5 sample leads first")
3. Empty LeadFeed coverage shortcut ("expand your service area")
4. Unify ConfirmPurchaseModal + UnlockConfirmModal (one modal, one verb)
5. Price-vs-leads anchor on Billing ("$100 ≈ N leads in your market")
6. First-purchase coaching modal ("call within 5 min — booked rate 3×")
7. Replace "secondary inventory" with plain-language Deal Room intro
8. Remove the duplicate landing-page artifact + reconcile credit-pitch copy

These are 15-60 minutes each. None block pilot. All worth doing if pilot succeeds.

## §E — Full agent report (verbatim)

The independent research agent's detailed per-phase audit is preserved here for reference. ~3000 words, 10 phases, every claim cites a file:line.

### Phase 1 — Partners landing page

- **Two competing artifacts:** `Partner Landing.html` (repo root, 1,613 lines, placeholder phone `+1 (800) 555-0199`, conflicting `$100 = $150` pitch) vs live React `/partners` at [Partners.jsx](../../../client/src/pages/Partners.jsx) advertising `$50 FREE + 50% bonus on first top-up` and real phone `+1 (307) 204-4792`.
- **Dishonest CTA:** "Watch platform demo" anchor-links to a 4-card SVG-icon strip; no actual demo video.
- **Sticky offer-bar urgency is unfalsifiable:** "Before onboarding closes in your area" repeated across [Partners.jsx#L304](../../../client/src/pages/Partners.jsx#L304), [ActivationBanner.jsx#L85](../../../client/src/components/ActivationBanner.jsx#L85), [Partners.jsx#L654](../../../client/src/pages/Partners.jsx#L654) with no per-ZIP capacity logic.
- **No real trust signals:** zero company logos, zero testimonials, zero booked-jobs counter.
- **Hero subhead** "Stop wasting dispatcher time on quote requests that never answer" — the word "dispatcher" assumes the reader has one; solo movers don't.

### Phase 2 — Registration

- **USDOT required at step 1** with 5-8 digit validation enforced server-side ([Register.jsx#L80](../../../client/src/pages/Register.jsx#L80)). Intrastate-only movers without USDOT cannot register.
- **Phone required at step 1** — before any trust has been built. Microcopy reads as deflection.
- **No real-time USDOT validation** — submit-time only; no FMCSA auto-fill (competitor: LeadsForCarriers).
- **"What you get" left rail is wrong for movers:** lists "Turnkey Booking Platform · Sales Funnel Built to Convert · AI Speed to Call · Instant Payments" — the realtor/agent pitch, not the mover ICP.
- **No password strength meter.**

### Phase 3 — Email + phone verification

- **Email verification is a hard gate** — `ProtectedRoute` ([ProtectedRoute.jsx#L29-33](../../../client/src/components/ProtectedRoute.jsx#L29-L33)) bounces any unverified non-admin to `/verify-email-pending`. No "preview live leads in your market while we verify" affordance.
- **Phone verification is per-feature, not at signup** — confusing surprise mid-task when mover tries to enable SMS.
- **Daily-cap copy is technically blunt:** "You've hit the daily verification limit. Try again tomorrow." ([VerifyPhoneModal.jsx#L102](../../../client/src/components/VerifyPhoneModal.jsx#L102)) — no rescue path.
- **"Click it to unlock your dashboard"** ([VerifyEmailPending.jsx#L105](../../../client/src/pages/VerifyEmailPending.jsx#L105)) sounds like a paywall, not security.

### Phase 4 — Onboarding wizard

- **ESC disabled on steps 1-4** ([OnboardingWizard.jsx#L150-158](../../../client/src/pages/onboarding/OnboardingWizard.jsx#L150-L158)); X close button only at step 5. Mover cannot browse the dashboard before committing info.
- **Step 1 requires dispatch base AND pickup-mode card** in one step.
- **Step 5 (Activate)** presents two paid tiers; "Continue without activating" link is gray-on-white beneath an orange CTA — fear-language framing.
- **No save-progress affordance UI** despite server-side persistence.
- **Step 4 "Your dispatch setup is ready" interstitial** has CTA `Claim your $50 FREE credit` that actually advances to a paid tier picker — bait-and-switch framing.

### Phase 5 — Funding the account

- **First-deposit ask happens before mover sees any live lead.**
- **No "minimum deposit" copy.** $50 is implicit from the array; not stated.
- **No "what does a lead cost" anchor on Billing.** Compare HomeAdvisor: "$100 = ~3 leads in your category."
- **"FirstTopupReassurancePopup" mistimes the message:** fires 3s after dashboard hydrates post-activation and says "We recommend waiting for fresh new moving leads entering your market" — opposite of what the mover wants to hear post-payment.
- **Three names for one thing:** "credits," "balance," "MoveLeads Credits" — inconsistent.

### Phase 6 — Lead dashboard

- **Empty-state copy is "Your markets are active"** ([LeadFeed.jsx#L685](../../../client/src/pages/dashboard/LeadFeed.jsx#L685)) — lands as "we have nothing for you" with no escape hatch.
- **"Matched for you" default tab** punishes new accounts with narrow coverage.
- **No coverage-shortcut from empty state.**
- **Filter overload up top:** 6 controls before the table even starts.
- **"Available Leads" pill ambiguous** — doesn't differentiate "in your market" vs "marketplace-wide."

### Phase 7 — Deal Room

- **"Discounted secondary inventory" raises more questions than it answers.** Why is this discounted? Did another mover return it? Is it old?
- **No coverage filter** (explicit decision per file header).
- **Discount filter ≥25% / ≥40% / ≥60%** implies a sliding scale but Deal Room never displays the typical *Live Leads* price as reference.
- **Generic empty state** with no "email me when restocked" affordance.

### Phase 8 — Purchase flow

- **Two different confirm modals.** Different content, different verbs ("Confirm purchase" vs "Confirm Unlock") for the same action.
- **"Purchase is final" warning in tiny copy beneath a friendly orange CTA** — loss-aversion language loses to gain-framed button.
- **The "lost the race" UX exists but doesn't explain WHY** — was the lead exclusive? Multi-buyer? Mover assumes you're rigging the system.
- **Live Leads modal hides discount math; Deal Room modal shows it** — inconsistency cost.
- **No "what you'll see after unlock" preview.** Mover hesitating at $32 needs to know exactly what they're buying.

### Phase 9 — My Leads (the worst phase)

- **No `tel:` or `mailto:` action buttons.** Phone and email are plain text. No one-tap call on mobile.
- **Row chevron is the only way to expand** — multi-row triage impossible.
- **No "I called, no answer" workflow.** CRM status taxonomy (New/Contacted/Quoted/Booked/Lost) doesn't match how movers actually work the phone.
- **No dispute link from MyLeads to ResolutionCenter.**
- **"Lost" CRM status ambiguous** — "we lost the deal" or "customer ghosted"?

### Phase 10 — End-of-funnel (between My Leads and first call)

- **Zero first-time-buyer guidance.** No "call within 5 minutes" coaching despite marketing promise.
- **No urgency injected on stale leads.** A 2-hour-old purchased lead looks identical to a 2-day-old one.
- **Dispute path buried.** "Manage customer feedback" wording implies customer complaints against the mover, not the mover's complaint about a bad lead.
- **No automated follow-up** despite Register.jsx#L209 bragging "AI Speed to Call · Instant contact & automated follow-up."

## §F — Net Phase 2 status

The funnel is well-engineered at the platform layer (auth, payments, ledger, atomic sequences) and underbuilt at the **conversion-craft layer**. The four screens between "credit just appeared" and "mover dialed customer" are where the next 100 hours of polish should go.

**For the curated pilot, this is recoverable via operator personal touch + 0-2 hours of optional engineering.** None of the friction is GO-blocking. The findings translate into a post-pilot work plan, not a pilot-halt list.
