# Partners Landing Page — Design Spec

**Date:** 2026-05-07
**Author:** Brainstorming session
**Status:** Approved — ready for implementation plan
**Source mockup:** [Partner Landing.html](../../../Partner%20Landing.html) (1613 LOC, self-contained HTML/CSS prototype)

---

## 1. Context

Build a B2B marketing landing page targeting **moving companies** (the buyers in the MoveLeads marketplace), distinct from the existing consumer-facing pages (`/`, `/get-quote`, `/get-quote-v4`). The mockup pitches a credit-based pay-as-you-go lead marketplace with a 50% bonus on first purchase.

**Audience:** Moving company owners and dispatchers evaluating lead-buying platforms.
**Conversion goal:** Drive `/register` signups (and eventually credit purchases).
**Channels:** Direct ad traffic, outbound email, partner referrals — not the public marketing nav.

The existing [`/for-movers`](../../../client/src/pages/ForMovers.jsx) page (422 LOC, focused on technical features like Twilio Lookup and WebSocket) stays in place and unchanged.

---

## 2. Decisions

| # | Question | Choice | Rationale |
|---|---|---|---|
| 1 | Route | **New `/partners`** alongside `/for-movers` | Keeps existing inbound links (Landing nav, mobile menu, 3 footers) working. Allows A/B comparison. |
| 2 | CSS approach | **External `Partners.css`** | ~990 LOC of CSS is unwieldy as JS string; matches `ForMovers.css` / `GetQuote.css` convention. |
| 3 | CTA wiring | **Smart-route via `AuthContext`** | Logged-in user → `/dashboard/leads`; guest → `/register`. Logged-in user clicking "Claim bonus credits" → `/dashboard/billing`. |
| 4 | Photo strip | **Skip entirely** | Photo is decorative, no real B2B asset on hand, can be added later. |
| 5 | Phone (in FAQ sidebar + footer) | **Placeholder `+18005550199`** | One constant; swap any time. |
| 6 | Marketing nav inclusion | **Do NOT add** to the public marketing nav | `/for-movers` already lives there. Drive partners traffic directly to `/partners` from ads / email / etc. |

---

## 3. Architecture

### File layout

```
client/src/pages/
  Partners.jsx                ~700 LOC — main page, data constants, sub-components, smart-route handlers
  Partners.css                ~990 LOC — verbatim styles from mockup, scoped under .partners-page
client/src/App.jsx            +2 LOC   — lazy import + <Route path="/partners">
tests/e2e/partners.spec.js    new      — Playwright smoke (~30 LOC)
```

No changes to:
- [ForMovers.jsx](../../../client/src/pages/ForMovers.jsx)
- [MarketingLayout.jsx](../../../client/src/components/MarketingLayout.jsx)
- Any consumer-facing page

### Component boundaries

```
Partners (default export)
├── data constants (top of file)
│     STATS, STEPS, PAIN, SOLN, LEADS, WHO, FAQS
├── HLOC                — Hero Lead Opportunity Card (~80 LOC, animated, multiple pills, money grid, floating "just booked" badge)
└── LeadCard            — Sample lead card (rendered 3× from LEADS array)
```

The remaining 10 sections (offer bar, nav, hero copy column, stats strip, how-it-works, pain-vs-solution, credit-offer card, sample-leads grid, who-it's-for, FAQ, final CTA, footer) are declarative composition over their data arrays — no extracted components.

**Justification:** `HLOC` deserves isolation because it's visually dense and inlining it would obscure the hero composition. `LeadCard` is used 3× → real reuse. Everything else is one-line `data.map(...)` over a const array; extracting them would be ceremony with no payoff.

---

## 4. State, data flow, side effects

- **No local React state.** No `useState` calls.
- **CSS-only animations:** `@keyframes` for `hlocPulse`, `pulseDot`, `tickerScroll` (the live ticker is currently hidden in the mockup; we follow suit).
- **Native `<details>` / `<summary>`** for the FAQ accordion — zero JS, keyboard-accessible by default.
- **One `useContext(AuthContext)` read** to drive smart-routing.
- **One `useCanonical('/partners')`** call for SEO (existing hook, matches ForMovers pattern).
- **`useNavigate()`** from `react-router-dom` for auth-aware CTAs.

### Smart-routing handler

```js
const navigate = useNavigate();
const { user } = useContext(AuthContext);
const goToSignup = () => navigate(user ? '/dashboard/leads' : '/register');
const goToBilling = () => navigate(user ? '/dashboard/billing' : '/register');
```

Wired to:
- `goToSignup` — top nav `See live moves`, hero `See live move requests`, **sample-leads bottom `See how unlocking works in dashboard`** (the conversion CTA, not the in-page anchor), final-CTA `See live move requests`, all `Buy lead` and `Unlock this move` buttons.
- `goToBilling` — `Claim bonus credits` and `Claim now →` in the sticky offer bar.
- **Plain `<a href="/login">`** for `Partner login` (top nav + footer "Account" column).
- **Plain anchor scrolls** for in-page navigation:
  - Hero `Watch platform demo` → `#how`
  - Final-CTA `See how unlocking works` (different from the sample-leads one) → `#leads`
  - Footer `How it works` → `#how`, `Sample leads` → `#leads`, `Pricing` → `#offer`, `FAQ` → `#faq`

In-page anchors (`#how`, `#leads`, `#offer`, `#faq`) stay as plain `<a href>` for `Watch platform demo` and `See how unlocking works`.

---

## 5. CSS strategy

- All rules in `Partners.css` are scoped under `.partners-page` (the wrapping `<div>`'s class).
- Existing global rules (`.btn`, `.hero`, `.stat`, `.check`, `.pill` …) from the mockup get prefixed: `.partners-page .btn`, etc.
- Class names from the mockup (`.hloc`, `.dash-chrome`, `.lead-feature`, …) are kept identical for 1:1 mockup-to-CSS traceability.
- The CSS variables block (`:root { --orange, --navy-900, … }`) is moved inside `.partners-page` so partner-specific tokens don't leak globally.
- Google Fonts imports (`Plus Jakarta Sans`, `Manrope`, `JetBrains Mono`) go at the top of `Partners.css` via `@import` — same as the mockup. (Already loaded for other pages but cheap to deduplicate.)

---

## 6. Routing changes

`client/src/App.jsx`:

```jsx
const Partners = lazy(() => import('./pages/Partners'));
// ...
<Route path="/partners" element={<Partners />} />
```

Inserted near the existing `/for-movers` route. No other route changes.

---

## 7. Accessibility

- **Semantic landmarks:** `<header>` for offer bar + nav, `<main>` wrapping all sections, `<footer>` for the bottom region. Hero is `<section className="hero">` with `<h1>` (mockup uses `<header>` for this — fixed in the React port).
- **Headings:** Single `<h1>` (the hero headline), `<h2>` per section, `<h3>` for cards. No skipped levels.
- **Icon-only links** (e.g., social icons in footer if any) get `aria-label`.
- **Sticky offer bar** uses `position: sticky` not `fixed` — content flow stays correct, no overlap.
- **FAQ accordion** uses real `<details>`/`<summary>`, works without JS, keyboard-accessible by default.
- **Color contrast:** orange CTA on dark navy meets WCAG AA (mockup verified).
- **All CTAs** reachable via tab order matching visual order.

---

## 8. SEO

- `useCanonical('/partners')` — sets `<link rel="canonical">` dynamically, matches the existing pattern.
- Page-level `<title>` and `<meta>` via React 19's native support (no `react-helmet`):
  - Title: `MoveLeads — Buy verified moving leads. Pay-as-you-go.`
  - Description: lifted from the hero sub copy.
- `<JsonLd>` (existing component at [client/src/components/JsonLd.jsx](../../../client/src/components/JsonLd.jsx)) emits a `Service` schema describing the lead marketplace.
- Internal `<a href="#anchor">` links use proper IDs on each `<section>` (`#how`, `#leads`, `#offer`, `#faq`).

---

## 9. Performance

- **Lazy-loaded** via `React.lazy(() => import('./pages/Partners'))`. Page chunk does not affect main bundle.
- **CSS bundled with the chunk** by Vite's `import './Partners.css'` at the top of the file.
- **No external images.** All decorative shapes are SVG inline (mockup already does this, including the curved route line behind the HLOC card).
- **GPU-friendly animations only:** `transform`, `opacity`, `box-shadow`. No layout-triggering properties in animations.
- **Single Google Fonts request** at the top of `Partners.css` (Plus Jakarta Sans 400-800, Manrope 400-800, JetBrains Mono 500-700, with `display=swap`).

---

## 10. Testing

New file: `tests/e2e/partners.spec.js`. Three assertions:

```js
test('Partners landing renders for guest visitor', async ({ page }) => {
  await page.goto('/partners');
  await expect(page.locator('h1')).toContainText('Stop paying for move requests');
  await expect(page.getByRole('link', { name: /See live move requests/i })).toBeVisible();
  await expect(page.locator('.offer-bar')).toBeVisible();
});
```

Existing CI ([`tests/e2e/full-flow.spec.js`](../../../tests/e2e/full-flow.spec.js)) is currently commented out in [`ci.yml`](../../../.github/workflows/ci.yml) — this new spec will sit alongside it, ready when CI is re-enabled.

No unit tests — page is pure presentation, nothing to unit-test.

---

## 11. Out of scope (YAGNI)

Explicitly **not** doing in this work:

- **Backend bonus-credit logic.** "$100 = $150" is marketing copy. Wiring a real promo code into Stripe Checkout is a separate task with backend touchpoints.
- **A/B variant scaffolding.** This is a single new page, not a variant system.
- **Real crew/truck photo.** Q4 = A.
- **Analytics events.** Not adding `gtag('event', 'partners_page_view')` etc. yet — same recommendation logic as the GetQuoteV4 funnel analysis. Add in a follow-up.
- **`Watch platform demo` modal.** Mockup links to `#how` (anchor scroll). We keep that. Real demo video is a follow-up.
- **Updating the public marketing nav** to surface `/partners`. Q6 = no.
- **Migrating any content from existing `/for-movers`.** Q1 = B.

---

## 12. Open uncertainties

- **Phone number.** Hard-coded `+18005550199` per Q5. Will need swapping when a real partner-support line exists. Single constant in `Partners.jsx`.
- **`Claim bonus credits` for guests** currently sends them to `/register`. If the bonus is a one-time promo code, the registration flow eventually needs to capture it via URL param (e.g. `/register?promo=PARTNER150`). Out of scope here, noted for follow-up.
- **`See live moves` is identical in label to `See live move requests`** — the mockup uses both. We render both verbatim. If branding wants to converge, that's a content edit only.

---

## 13. Acceptance criteria

Done when **all** of:

1. `client/src/pages/Partners.jsx` exists and exports a default React component.
2. `client/src/pages/Partners.css` exists, all rules scoped under `.partners-page`.
3. `client/src/App.jsx` has a `<Route path="/partners">` with lazy import.
4. Visiting `/partners` in a dev build renders all 12 sections, in order, matching the mockup visually within ~5 px tolerance.
5. As a **guest**: clicking any "See live moves" / "Buy lead" / "Unlock this move" / "Claim bonus credits" / sticky-bar `Claim now` CTA navigates to `/register`.
6. As a **logged-in user** (mocked via AuthContext): clicking the same CTAs navigates to `/dashboard/leads`, and `Claim bonus credits` navigates to `/dashboard/billing`.
7. `Partner login` always goes to `/login`.
8. In-page anchor CTAs (`Watch platform demo`, `See how unlocking works`) scroll to the right section.
9. `<title>` and `<meta name="description">` are set per section 8.
10. Playwright smoke test in `tests/e2e/partners.spec.js` passes locally.
11. No CSS class from `Partners.css` matches a selector that affects any other page (manual scan of common class names: `.btn`, `.hero`, `.stat`, `.check`, `.pill`).
12. `vite build` succeeds with no new warnings.

---

## 14. Notes for implementation plan

The next step is invoking `writing-plans` to break this into ordered tasks. Suggested phases:

1. **Skeleton:** route + empty `Partners.jsx` + `Partners.css` shell with scoped tokens. Verify routing.
2. **CSS port:** scope-prefix all rules from the mockup into `Partners.css`. Verify build.
3. **JSX port — top-down:** offer bar → nav → hero → HLOC → stats → how-it-works → pain/solution → credit offer → sample leads → who-it's-for → FAQ → final CTA → footer.
4. **Auth-aware handlers:** wire `goToSignup` / `goToBilling` / `Partner login`.
5. **SEO + a11y polish:** `useCanonical`, `<JsonLd>`, semantic landmarks pass.
6. **Smoke test:** `partners.spec.js`.
7. **Build verification:** `vite build`, manual visual diff vs mockup.
