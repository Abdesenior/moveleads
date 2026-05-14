# Partner Validation Funnels — Text Copy

Live snapshot of every visible string in both funnels.
Trust line on every screen: **No setup costs. No commitment required.**

Source files:
- Realtor funnel — `client/src/pages/FoundingRealtors.jsx`
- FB-group funnel — `client/src/pages/FoundingGroups.jsx`
- Shared form hook — `client/src/hooks/usePartnerForm.js`

---

# 1. Realtor funnel — `/founding-realtors`

## Step 1 — Hero + identity

**Hero headline (H1)**

> Help Clients Move Smarter — And Earn From Every Referral

**Hero subhead**

> Connect clients with trusted movers while unlocking a new referral revenue stream.

**Hero bullets**

- Trusted movers for your clients
- Additional revenue from referrals
- Priority partner access in your market

**Section heading (H2)** — `Tell us about yourself`
**Section subtext** — `Tell us a bit about your business.`

**Inputs (placeholders)** — `Full name`, `Email address`

**Primary CTA** — `Continue →`

---

## Step 2 — Market

**Heading (H1)** — `Tell us about your market`
**Subhead** — `We're expanding market by market.`

**Inputs** — `Brokerage name`

**Sub-section label** — `Your primary market`
**Sub-section helper** — `Search by city or state`
**Autocomplete placeholder** — `City or state…`

**Primary CTA** — `Continue →`

---

## Step 3 — Volume

**Heading (H1)** — `How many clients move each month?`
**Subhead** — `We're prioritizing active markets with strong relocation demand.`

| Label | Subline |
|---|---|
| 1–4 clients / month | Selective practice |
| 5–14 clients / month | Active practice |
| 15–29 clients / month | High-volume practice |
| 30+ clients / month | Top producer |

**Primary CTA** — `Submit application →` *(loading: `Sending…`)*

---

## Confirmation

Visual: centered green ✓ in a soft circle above the heading. All content centered.

**Heading (H1)** — `Thanks — your application has been received`
**Body** — `We're currently onboarding selected real estate partners market by market.`

*hairline divider*

**Secondary** — `Approved partners will receive early access details as MoveLeads expands into new markets.`

**Bottom** — `You can now close this page.`

---

# 2. Facebook-group funnel — `/founding-groups`

## Step 1 — Hero + community

**Hero headline (H1)**

> Help Members Find Movers — And Earn From Every Referral

**Hero subhead**

> Turn moving conversations in your community into a new revenue stream.

**Hero bullets**

- Earn from real moving requests
- Help members find trusted movers
- Priority access in your market

**Section heading (H2)** — `Tell us about your community`
**Section subtext** — `We're onboarding selected communities into the MoveLeads network.`

**Inputs (placeholders)** — `Full name`, `Email address`, `Facebook group link`

**Primary CTA** — `Continue →`

---

## Step 2 — Group activity

**Heading (H1)** — `Tell us about your group activity`
**Subhead** — `We want to understand how active your community is.`

**Sub-section label** — `Approx. group size`

| Label | Subline |
|---|---|
| 1k–5k members | Niche community |
| 5k–20k members | Growing group |
| 20k–50k members | Large community |
| 50k+ members | Major audience |

**Sub-section label** — `How often do members ask for moving help?`

| Label | Subline |
|---|---|
| Daily | Very active demand |
| Weekly | Frequent requests |
| Occasionally | Steady activity |
| Rarely | Comes up sometimes |

**Primary CTA** — `Continue →`

---

## Step 3 — Relocation

**Heading (H1)** — `Which areas do members move between most often?`
**Subhead** — `Add the cities or states most commonly mentioned in your community.`

**Multi-select empty placeholder** — `Add a city or state…`
**Placeholder after a chip exists** — `Add another market…`
**Helper tip** — `Press Enter to add another market.`

**Primary CTA** — `Submit application →` *(loading: `Sending…`)*

---

## Confirmation

Visual: same centered green ✓ as the realtor funnel.

**Heading (H1)** — `Application received`
**Body** — `We're reviewing selected communities and onboarding early partners market by market.`

*hairline divider*

**Secondary** — `Approved groups will receive early access details and partnership information soon.`

**Bottom** — `You can now close this page.`

---

# 3. System / error messages

Visible only on error.

**Client-side (form hook)**

- `Could not submit. Please try again.`
- `Network error. Please try again.`

**Server-side (rendered in the red `fm-error` pill)**

- `Invalid partner type.`
- `Full name and a valid email are required.`
- `Brokerage, market, and client volume are required.` *(realtor)*
- `Group URL, size, and frequency are required.` *(FB groups)*
- `Select at least one popular market.` *(FB groups, step 3)*
- `Too many submissions from this IP. Try again later.` *(3/hr/IP)*
- `Could not submit. Please try again.`

---

# 4. Admin dashboard — `/admin/partner-research`

**Page title** — `Partner Research`

**Stat cards** — `Total submissions` · `Realtors` · `Facebook groups`

**Filter** — `All types` / `Realtors` / `FB Groups`

**Search placeholder** — `Search name / email / market / group URL`

**Table headers** — `Date` · `Type` · `Name` · `Email` · `Signal`

**Empty / loading** — `Loading…` · `No submissions yet.`

**Drawer labels** — `Email`, `Brokerage`, `Main market`, `Monthly clients`, `Facebook group`, `Group size`, `Help frequency`, `Popular markets`, `Metadata`, `Source`, `UTM source`, `UTM medium`, `UTM campaign`, `Completion (s)`, `IP`, `User agent`

---

# Edit guide

When you change copy in this file and want me to port it back, point me at the section(s).

| Doc section | JSX block |
|---|---|
| §1 Step 1 hero/identity | `FoundingRealtors.jsx` — `{stepId === 'identity' && (…)}` |
| §1 Step 2 market | `FoundingRealtors.jsx` — `{stepId === 'market' && (…)}` |
| §1 Step 3 volume | `FoundingRealtors.jsx` — `VOLUME_OPTIONS` + `{stepId === 'volume' && (…)}` |
| §1 Confirmation | `FoundingRealtors.jsx` — `if (submitted) { … }` |
| §2 Step 1 hero/community | `FoundingGroups.jsx` — `{stepId === 'community' && (…)}` |
| §2 Step 2 activity | `FoundingGroups.jsx` — `SIZE_OPTIONS`, `FREQ_OPTIONS`, `{stepId === 'activity' && (…)}` |
| §2 Step 3 relocation | `FoundingGroups.jsx` — `{stepId === 'relocation' && (…)}` |
| §2 Confirmation | `FoundingGroups.jsx` — `if (submitted) { … }` |
| Trust line | `TRUST_LINE` constant in both files |
| Success check icon | `SuccessCheck` component at bottom of both files |
| §3 Error messages | `server/routes/partnerResearch.js` + `client/src/hooks/usePartnerForm.js` |
| §4 Admin | `client/src/pages/admin/AdminPartnerResearch.jsx` |
