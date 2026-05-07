# /partners Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a B2B partner landing page at `/partners` based on [Partner Landing.html](../../../Partner%20Landing.html), with smart-route CTAs that send guests to `/register` and logged-in users to `/dashboard/leads`.

**Architecture:** Two new files — `Partners.jsx` (page + 2 inline sub-components + data constants) and `Partners.css` (mockup CSS scoped under `.partners-page`). One route addition in `App.jsx`. One Playwright smoke test. No state, no extra components. The mockup is the source of truth — class names are preserved 1:1 for traceability.

**Tech Stack:** React 19 (existing project), React Router 7 (`useNavigate`, lazy `<Route>`), `AuthContext` (existing), Vite 8 (existing), Playwright (existing).

**Source spec:** [docs/superpowers/specs/2026-05-07-partners-landing-page-design.md](../specs/2026-05-07-partners-landing-page-design.md)

---

## File Structure

| Path | Action | Purpose |
|---|---|---|
| `client/src/pages/Partners.jsx` | Create | Page component, data constants, `HLOC` + `LeadCard` sub-components, smart-route handlers |
| `client/src/pages/Partners.css` | Create | All visual styles ported from mockup, scoped under `.partners-page` |
| `client/src/App.jsx` | Modify | Add `lazy` import + `<Route path="/partners">` |
| `tests/e2e/partners.spec.js` | Create | Playwright smoke test (guest renders correctly) |

---

## Task 1 — Skeleton route, empty page, verify it serves

**Files:**
- Create: `client/src/pages/Partners.jsx`
- Create: `client/src/pages/Partners.css`
- Modify: `client/src/App.jsx`

- [ ] **Step 1.1: Create `client/src/pages/Partners.css` with the wrapper rule only**

```css
/* Partners.css — all rules scoped under .partners-page */

.partners-page {
  /* CSS variables and global rules will be filled in Task 2 */
}
```

- [ ] **Step 1.2: Create `client/src/pages/Partners.jsx` minimal skeleton**

```jsx
import './Partners.css';

export default function Partners() {
  return (
    <div className="partners-page">
      <h1>Partners (skeleton)</h1>
    </div>
  );
}
```

- [ ] **Step 1.3: Add lazy import + route to `client/src/App.jsx`**

Find this line near the existing `GetQuoteV4` import:
```jsx
const GetQuoteV4 = lazy(() => import('./pages/GetQuoteV4'));
```

Add directly after it:
```jsx
const Partners = lazy(() => import('./pages/Partners'));
```

Find this line in the `<Routes>` block near the existing `/get-quote-v4` route:
```jsx
<Route path="/get-quote-v4" element={<GetQuoteV4 />} />
```

Add directly after it:
```jsx
<Route path="/partners" element={<Partners />} />
```

- [ ] **Step 1.4: Verify the route serves**

Start vite:
```bash
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5195 --host 127.0.0.1 &
sleep 5
curl -sS -o /dev/null -w "page: %{http_code}\n" http://127.0.0.1:5195/partners
lsof -iTCP:5195 -sTCP:LISTEN -t | xargs -I{} kill {}
```

Expected output:
```
page: 200
```

- [ ] **Step 1.5: Commit**

```bash
git add client/src/pages/Partners.jsx client/src/pages/Partners.css client/src/App.jsx
git commit -m "$(cat <<'EOF'
feat(partners): scaffold /partners route with empty page

Adds lazy-loaded route, empty Partners.jsx skeleton, and Partners.css
shell. Verifies route returns 200.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Port CSS from mockup, scoped under `.partners-page`

**Files:**
- Modify: `client/src/pages/Partners.css`

The mockup CSS lives at [Partner Landing.html](../../../Partner%20Landing.html) lines **10–992** (between `<style>` and `</style>`). All rules need to be ported with these transformations.

### Scoping rules

| Mockup rule | Becomes |
|---|---|
| `:root { --orange: #f97316; ... }` | `.partners-page { --orange: #f97316; ... }` |
| `* { box-sizing: border-box; }` | `.partners-page * { box-sizing: border-box; }` |
| `html, body { margin: 0; padding: 0; }` | **SKIP** (already set by parent app) |
| `body { font-family: ... background: ... color: ... }` | `.partners-page { font-family: ... background: ... color: ... }` |
| `h1, h2, h3, h4 { ... }` | `.partners-page h1, .partners-page h2, .partners-page h3, .partners-page h4 { ... }` |
| `a { color: inherit; text-decoration: none; }` | `.partners-page a { color: inherit; text-decoration: none; }` |
| `button { font-family: inherit; cursor: pointer; }` | `.partners-page button { font-family: inherit; cursor: pointer; }` |
| `img { max-width: 100%; display: block; }` | `.partners-page img { max-width: 100%; display: block; }` |
| `.btn { ... }` | `.partners-page .btn { ... }` |
| `.btn:hover { ... }` | `.partners-page .btn:hover { ... }` |
| `.hero::before { ... }` | `.partners-page .hero::before { ... }` |
| `.faq-item[open] .plus { ... }` | `.partners-page .faq-item[open] .plus { ... }` |
| `@media (max-width: 980px) { .hero-grid { ... } }` | `@media (max-width: 980px) { .partners-page .hero-grid { ... } }` |
| `@keyframes hlocPulse { ... }` | **leave as-is** (keyframes are name-scoped, no class scoping needed) |
| `@import url('https://fonts.googleapis.com/...');` | **leave at top of file** (no scoping for at-rules) |

- [ ] **Step 2.1: Replace `Partners.css` contents**

Read [Partner Landing.html](../../../Partner%20Landing.html) lines 10–992 (the entire `<style>` block, excluding the opening/closing tags themselves).

Apply the scoping rules above to every selector. Write the result to `client/src/pages/Partners.css`. Start the file with the `@import` for fonts:

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap');

/* Design tokens & resets — scoped to .partners-page so they don't leak */
.partners-page {
  --navy-900: #070e1b;
  --navy-800: #0d1f38;
  --navy-700: #142a4a;
  --navy-600: #1B2B47;
  --navy-line: #1e3358;
  --bg: #f8fafc;
  --bg-2: #eef2f7;
  --ink: #0f172a;
  --ink-2: #475569;
  --muted: #64748b;
  --muted-2: #94a3b8;
  --rule: #e2e8f0;
  --rule-2: #eef2f7;
  --orange: #f97316;
  --orange-600: #ea580c;
  --orange-300: #fb923c;
  --orange-100: #ffedd5;
  --green: #22c55e;
  --green-trust: #005541;
  --green-100: #dcfce7;
  --hot: #dc2626;
  --hot-100: #fee2e2;
  --gold: #fbbf24;
  --gold-100: #fef3c7;
  --info: #3b82f6;
  --shadow-sm: 0 1px 0 rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.04);
  --shadow-md: 0 8px 28px -10px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.06);
  --shadow-card: 0 24px 60px -28px rgba(7,14,27,0.55), 0 4px 14px -6px rgba(7,14,27,0.25);

  font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-size: 16px;
  line-height: 1.5;
}

.partners-page * { box-sizing: border-box; }
.partners-page h1, .partners-page h2, .partners-page h3, .partners-page h4 {
  font-family: 'Plus Jakarta Sans', 'Manrope', 'DM Sans', sans-serif;
  letter-spacing: -0.025em; margin: 0; line-height: 1.05; font-weight: 700;
}
.partners-page .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.partners-page a { color: inherit; text-decoration: none; }
.partners-page button { font-family: inherit; cursor: pointer; }
.partners-page img { max-width: 100%; display: block; }

.partners-page .wrap { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

/* ---------- Sticky offer bar ---------- */
/* ... continue porting all remaining rules from mockup with .partners-page prefix ... */
```

Continue this pattern for **every** remaining rule in the mockup. The full output should be ~990 LOC. Pay attention to:

- All selectors that don't start with `@` get `.partners-page ` prepended
- Multi-selector rules like `.foo, .bar { ... }` become `.partners-page .foo, .partners-page .bar { ... }`
- Pseudo-elements stay attached: `.foo::before` → `.partners-page .foo::before`
- Media queries wrap scoped selectors: `@media (max-width: 980px) { .partners-page .foo { ... } }`
- `@keyframes` blocks stay as-is (no scoping)

**One spec-mandated addition** — the mockup labels the orange offer bar "sticky" in a comment but doesn't actually make it sticky. The spec ([section 7](../specs/2026-05-07-partners-landing-page-design.md)) calls for `position: sticky`. After porting `.offer-bar` from the mockup, append the following declarations to that rule:

```css
.partners-page .offer-bar {
  /* ...existing ported declarations from mockup... */
  position: sticky;
  top: 0;
  z-index: 100;
}
```

- [ ] **Step 2.2: Verify CSS compiles and the page still renders**

```bash
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5195 --host 127.0.0.1 &
sleep 5
curl -sS -o /dev/null -w "page: %{http_code}\n" http://127.0.0.1:5195/partners
curl -sS -o /dev/null -w "css: %{http_code}\n" "http://127.0.0.1:5195/src/pages/Partners.css"
lsof -iTCP:5195 -sTCP:LISTEN -t | xargs -I{} kill {}
```

Expected:
```
page: 200
css: 200
```

- [ ] **Step 2.3: Verify CSS isolation — open `/` (Landing) and confirm nothing visually changed**

```bash
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5195 --host 127.0.0.1 &
sleep 5
# These should all serve normally — confirms scoping didn't break anything
curl -sS -o /dev/null -w "/: %{http_code}\n" http://127.0.0.1:5195/
curl -sS -o /dev/null -w "/get-quote-v4: %{http_code}\n" http://127.0.0.1:5195/get-quote-v4
curl -sS -o /dev/null -w "/for-movers: %{http_code}\n" http://127.0.0.1:5195/for-movers
lsof -iTCP:5195 -sTCP:LISTEN -t | xargs -I{} kill {}
```

Manual check: open each in a browser and confirm visuals are unchanged from before this work began.

- [ ] **Step 2.4: Commit**

```bash
git add client/src/pages/Partners.css
git commit -m "$(cat <<'EOF'
feat(partners): port mockup CSS, scoped under .partners-page

All ~990 LOC of styles from Partner Landing.html ported. Selectors
prefixed with .partners-page; CSS variables moved into .partners-page
scope; @keyframes left at root. No global side effects.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Add data constants and smart-route handlers

**Files:**
- Modify: `client/src/pages/Partners.jsx`

- [ ] **Step 3.1: Replace `Partners.jsx` with this scaffold (data constants + handler scaffolding, page body still placeholder)**

```jsx
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import useCanonical from '../utils/useCanonical';
import './Partners.css';

// ── Data ────────────────────────────────────────────────────────────────────
const STATS = [
  { num: '240k+', accent: true,  label: 'Verified moving leads delivered' },
  { num: '1,800+', accent: false, label: 'Moving companies on the platform' },
  { num: '98%',   accent: false, label: 'Phone-verified before delivery' },
  { num: '$0',    accent: false, label: 'Pay-as-you-go. Cancel any time.', suffix: ' / month' },
];

const STEPS = [
  { n: '01', title: 'Customer requests a mover',     body: 'People looking for movers submit their move details through our ads, funnels and partner sites.' },
  { n: '02', title: 'We qualify the lead',           body: 'We check move details, timeline, and phone quality. Junk and duplicates get filtered before delivery.' },
  { n: '03', title: 'You buy the leads you want',    body: 'Use credits to unlock leads that fit your service area, job size and schedule. Skip the rest.' },
  { n: '04', title: 'You call and close the job',    body: 'Contact the customer fast and turn real moving requests into booked jobs on your calendar.' },
];

const PAIN = [
  'Same lead sold to 4–5 movers at once',
  'Wrong numbers, fake names, fake requests',
  'Customers who never pick up the phone',
  'Monthly fees before you see a single job',
  'No control over what leads you buy',
];

const SOLN = [
  'Every lead is checked before delivery',
  'See full move details before you spend a credit',
  'Fresh leads pushed to your dashboard fast',
  'Pay-as-you-go credits — no subscription',
  'You choose every single lead you unlock',
];

const LEADS = [
  {
    kind: 'Local move', pillKind: 'verified', pillText: 'Verified',
    from: 'Tampa, FL', to: 'St. Petersburg, FL',
    submitted: 'SUBMITTED 12 MIN AGO · 23 MI',
    rows: [
      ['Move size', '2 Bedroom'],
      ['Timeline',  'Within 7 days'],
      ['Service',   'Moving only'],
      ['Phone',     '✓ Verified'],
    ],
    credits: 35,
  },
  {
    kind: 'Long distance', pillKind: 'hot', pillText: 'Hot lead',
    from: 'Los Angeles, CA', to: 'Las Vegas, NV',
    submitted: 'SUBMITTED 2 MIN AGO · 270 MI',
    rows: [
      ['Move size', '3+ Bedroom'],
      ['Timeline',  'ASAP'],
      ['Service',   'Moving + packing'],
      ['Intent',    '✓ High intent'],
    ],
    credits: 75,
  },
  {
    kind: 'Small apartment', pillKind: 'new', pillText: 'Fresh',
    from: 'Brooklyn, NY', to: 'Queens, NY',
    submitted: 'SUBMITTED 18 MIN AGO · 11 MI',
    rows: [
      ['Move size', '1 Bedroom'],
      ['Timeline',  'Within 2 weeks'],
      ['Service',   'Moving only'],
      ['Request',   '✓ Verified'],
    ],
    credits: 25,
  },
];

const WHO = [
  {
    title: 'Local moving companies',
    body:  'Find customers moving inside your service area. Filter by ZIP, distance, and job size before you spend a credit.',
    tag:   '→ 25–60 credits per lead',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    title: 'Long-distance movers',
    body:  'Unlock higher-value interstate and long-haul jobs with bigger ticket sizes and longer booking windows.',
    tag:   '→ 60–120 credits per lead',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    title: 'Growing crews',
    body:  "Fill your calendar without committing to monthly contracts. Buy more credits when you have capacity, pause when you don't.",
    tag:   '→ Pay only for what fits',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

const FAQS = [
  { q: 'Do I need a monthly subscription?',     a: "No. MoveLeads runs on a simple credit system. You buy credits and use them to unlock leads — there's no recurring fee, no contract, and no minimum spend.", open: true },
  { q: 'Can I choose which leads to buy?',      a: "Yes. You preview every move's route, size, timeline, service type and verification status before unlocking the customer's contact information. You're never charged credits for a lead you don't want." },
  { q: 'Are the leads verified?',               a: 'Every lead is checked and scored before being pushed to the dashboard. Phone-verified leads are clearly marked, and high-intent or hot leads carry a separate badge so you know what you’re buying.' },
  { q: 'What do I see before buying a lead?',   a: "You see the route, move size, timeline, service type (move only / move + pack), verification status, and the credit price. The customer's phone number and email are unlocked once you spend the credits." },
  { q: 'What happens after I buy a lead?',      a: 'The customer’s contact details are unlocked instantly. You call them directly to qualify, quote, and close the job. Most partners reach the customer inside 5 minutes.' },
  { q: 'Is there a contract?',                  a: "No long-term contract. Buy a credit pack, test the platform, and walk away if it doesn't work for your business. Credits never expire." },
];

const PHONE = '+18005550199';
const PHONE_DISPLAY = '+1 (800) 555-0199';

// ── Sub-components (defined below) ──────────────────────────────────────────
// HLOC and LeadCard are added in Task 4.

// ── Main component ─────────────────────────────────────────────────────────
export default function Partners() {
  useCanonical('/partners');

  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const goToSignup  = () => navigate(user ? '/dashboard/leads'   : '/register');
  const goToBilling = () => navigate(user ? '/dashboard/billing' : '/register');

  return (
    <div className="partners-page">
      <h1>Partners (constants and handlers wired)</h1>
    </div>
  );
}
```

- [ ] **Step 3.2: Verify the page still serves and the imports resolve**

```bash
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5195 --host 127.0.0.1 &
sleep 5
curl -sS -o /dev/null -w "page: %{http_code}\n" http://127.0.0.1:5195/partners
xform=$(curl -sS http://127.0.0.1:5195/src/pages/Partners.jsx)
echo "$xform" | grep -i "error\|fail" | grep -v "//" | head -3
echo "transform bytes: $(echo "$xform" | wc -c)"
lsof -iTCP:5195 -sTCP:LISTEN -t | xargs -I{} kill {}
```

Expected: `page: 200` and no error lines.

- [ ] **Step 3.3: Commit**

```bash
git add client/src/pages/Partners.jsx
git commit -m "$(cat <<'EOF'
feat(partners): add data constants, AuthContext smart-route handlers

STATS, STEPS, PAIN, SOLN, LEADS, WHO, FAQS as module-level constants.
goToSignup and goToBilling navigate to /dashboard or /register based
on AuthContext.user. useCanonical wired.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Sub-components: `HLOC` and `LeadCard`

**Files:**
- Modify: `client/src/pages/Partners.jsx`

- [ ] **Step 4.1: Add `HLOC` and `LeadCard` definitions before the `Partners` default export**

Find the line `// ── Sub-components (defined below) ──...` from Task 3 and replace that entire commented block with the two definitions below, keeping the existing main component below it.

```jsx
// ── Sub-components ──────────────────────────────────────────────────────────

function HLOC({ onUnlock }) {
  return (
    <div className="hloc-shell">
      <div className="hloc-glow" />
      <svg className="hloc-route-bg" viewBox="0 0 500 360" fill="none" aria-hidden="true">
        <path d="M40 280 Q 180 80 460 100" stroke="#f97316" strokeWidth="2" strokeDasharray="4 8" strokeLinecap="round" opacity="0.5" />
        <circle cx="40" cy="280" r="6" fill="#f97316" opacity="0.7" />
        <circle cx="460" cy="100" r="6" fill="#4ade80" opacity="0.7" />
      </svg>

      <div className="hloc">
        <div className="hloc-top">
          <span className="hloc-pill hloc-pill-live"><span className="hloc-pulse" />Live move request</span>
          <span className="hloc-pill hloc-pill-verified">✓ Phone verified</span>
        </div>

        <div className="hloc-route">
          <span>Dallas, TX</span><span className="hloc-arr">→</span><span>Austin, TX</span>
        </div>

        <div className="hloc-grid">
          <div className="hloc-cell">
            <div className="hloc-lab">Move size</div>
            <div className="hloc-val">3 Bedroom</div>
          </div>
          <div className="hloc-cell">
            <div className="hloc-lab">Timeline</div>
            <div className="hloc-val">Needs movers this week</div>
          </div>
          <div className="hloc-cell">
            <div className="hloc-lab">Service</div>
            <div className="hloc-val">Move + packing</div>
          </div>
          <div className="hloc-cell">
            <div className="hloc-lab">Phone</div>
            <div className="hloc-val">Verified customer</div>
          </div>
        </div>

        <div className="hloc-money">
          <div className="hloc-money-est">
            <div className="hloc-lab">Estimated move value</div>
            <div className="hloc-money-val hloc-money-est-v">$4,200</div>
          </div>
          <div className="hloc-money-sep" />
          <div className="hloc-money-cost">
            <div className="hloc-lab">Unlock cost</div>
            <div className="hloc-money-val hloc-money-cost-v">$32</div>
          </div>
        </div>

        <button type="button" className="hloc-cta" onClick={onUnlock}>Unlock this move &nbsp;→</button>

        <div className="hloc-microcopy">
          <span className="hloc-livedot" />
          Customer requested quotes 2 min ago · most book the first mover that responds
        </div>

        <div className="hloc-foot">3 moving companies viewing now · only pay if you unlock</div>
      </div>

      <div className="hloc-unlocked">
        <div className="hloc-unlocked-lab">Just booked</div>
        <div className="hloc-unlocked-val">+$2.4k job</div>
      </div>
    </div>
  );
}

function LeadCard({ lead, onBuy }) {
  return (
    <div className="lead-card">
      <div className="head">
        <span className="kind">{lead.kind}</span>
        <span className={`pill-l ${lead.pillKind}`}>{lead.pillText}</span>
      </div>
      <div className="route">
        <span className="from">{lead.from}</span>
        <span className="arr">→</span>
        <span className="to">{lead.to}</span>
      </div>
      <div className="submitted">{lead.submitted}</div>
      <dl>
        {lead.rows.map(([dt, dd]) => (
          <div key={dt}>
            <dt>{dt}</dt>
            <dd>{dd.startsWith('✓ ')
              ? <><span className="ck">✓</span> {dd.slice(2)}</>
              : dd}</dd>
          </div>
        ))}
      </dl>
      <div className="cta-row">
        <div className="credits">
          <span className="num">{lead.credits}</span>
          <span className="lab">credits</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={onBuy}>Buy lead</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: Verify the page still serves**

```bash
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5195 --host 127.0.0.1 &
sleep 5
curl -sS -o /dev/null -w "page: %{http_code}\n" http://127.0.0.1:5195/partners
lsof -iTCP:5195 -sTCP:LISTEN -t | xargs -I{} kill {}
```

Expected: `page: 200`.

- [ ] **Step 4.3: Commit**

```bash
git add client/src/pages/Partners.jsx
git commit -m "$(cat <<'EOF'
feat(partners): add HLOC and LeadCard sub-components

HLOC is the hero lead-opportunity card (Dallas → Austin sample with
animated pulse and floating "just booked" badge). LeadCard renders a
single sample lead from the LEADS array.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Top-of-page sections: offer bar, nav, hero (with HLOC)

**Files:**
- Modify: `client/src/pages/Partners.jsx`

- [ ] **Step 5.1: Replace the placeholder body of the `Partners` component**

Find the body of `Partners()` that currently returns `<h1>Partners (constants and handlers wired)</h1>` and replace the entire return value with the JSX below. The existing imports, constants, sub-components, and `useNavigate`/`useContext` setup all stay the same.

```jsx
  return (
    <div className="partners-page">
      {/* ── Sticky offer bar ── */}
      <div className="offer-bar">
        <div className="inner">
          <span className="pill">LIMITED</span>
          <span><strong>$100 = $150 in credits</strong> &nbsp;·&nbsp; First-time partners get 50% bonus on their first credit purchase</span>
          <span className="dot" />
          <a href="#offer" className="cta-link" onClick={(e) => { e.preventDefault(); goToBilling(); }}>Claim now →</a>
        </div>
      </div>

      {/* ── Nav ── */}
      <div className="nav-shell">
        <div className="wrap">
          <nav className="nav">
            <div className="brand">
              <span className="mark">M</span>
              <span>Move<span className="dot-cloud">Leads</span><span style={{ color: 'var(--orange)' }}>.cloud</span></span>
            </div>
            <div className="nav-links">
              <a href="#how">How it works</a>
              <a href="#leads">Sample leads</a>
              <a href="#offer">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="nav-cta">
              <a className="btn btn-ghost-dark" href="/login">Partner login</a>
              <button type="button" className="btn btn-primary" onClick={goToSignup}>See live moves</button>
            </div>
          </nav>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div>
              <div className="badge badge-lg"><span className="pulse" />Live verified move requests · USA</div>
              <h1 className="hero-h">
                Stop paying for move requests<br />that <span className="accent">never answer.</span>
              </h1>
              <p className="hero-sub">
                Access live customers actively requesting movers in your service area. Unlock only the jobs you want, call verified customers instantly, and keep your trucks and crews booked — without wasting dispatcher time.
              </p>
              <ul className="hero-bullets">
                {[
                  'Verified move requests, real customers',
                  'Only pay for jobs you unlock',
                  'Real phone numbers with active move intent',
                  'See live move requests in your service area',
                ].map((text) => (
                  <li key={text}>
                    <span className="check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 12 10 18 20 6" />
                      </svg>
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
              <div className="hero-cta">
                <button type="button" className="btn btn-primary btn-xl" onClick={goToSignup}>See live move requests &nbsp;→</button>
                <a href="#how" className="btn btn-ghost-dark btn-lg">Watch platform demo</a>
              </div>
              <div className="hero-trust">
                <span><span className="tick">✓</span> Used by moving companies in major U.S. cities</span>
                <span><span className="tick">✓</span> Only verified move requests</span>
                <span><span className="tick">✓</span> Pay only for jobs you unlock</span>
              </div>
            </div>

            <HLOC onUnlock={goToSignup} />
          </div>
        </div>
      </section>
    </div>
  );
```

- [ ] **Step 5.2: Verify the hero renders**

```bash
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5195 --host 127.0.0.1 &
sleep 5
curl -sS -o /dev/null -w "page: %{http_code}\n" http://127.0.0.1:5195/partners
lsof -iTCP:5195 -sTCP:LISTEN -t | xargs -I{} kill {}
```

Manual check: open `http://127.0.0.1:5195/partners` in a browser. Confirm:
- Orange sticky offer bar at top
- Dark nav with brand, links, "Partner login" + "See live moves" buttons
- Dark hero with badge, headline, bullets, two CTAs, trust line
- HLOC card on the right (Dallas → Austin, $4,200 / $32, "Just booked +$2.4k job" floating badge)
- Pulsing dot animation on the live badge

- [ ] **Step 5.3: Commit**

```bash
git add client/src/pages/Partners.jsx
git commit -m "$(cat <<'EOF'
feat(partners): build offer bar, nav, hero with HLOC

Sticky orange offer bar with "Claim now" wired to goToBilling. Dark
nav with login link and goToSignup CTA. Two-column hero with copy on
the left and the animated HLOC card on the right.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Mid sections: stats strip, how-it-works, pain vs solution, credit offer

**Files:**
- Modify: `client/src/pages/Partners.jsx`

- [ ] **Step 6.1: Insert the four new sections between `</section>` (closing the hero) and the `</div>` (closing `.partners-page`)**

Locate this in the current file:
```jsx
            <HLOC onUnlock={goToSignup} />
          </div>
        </div>
      </section>
    </div>
  );
```

Insert the new sections between `</section>` and `</div>`:

```jsx
      {/* ── Stats strip ── */}
      <section className="stats-strip">
        <div className="wrap">
          <div className="stats-grid">
            {STATS.map((s) => (
              <div key={s.label} className="stat">
                <div className="num">
                  {s.accent
                    ? <span className="accent">{s.num}</span>
                    : s.num}
                  {s.suffix && <span style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 500, letterSpacing: 0 }}>{s.suffix}</span>}
                </div>
                <div className="label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="block" id="how">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">How it works</div>
            <h2 className="section-h">From lead request to booked job in 4 steps</h2>
            <p className="section-sub">Simple process. Real moving customers. You stay in control of every credit you spend.</p>
          </div>

          <div className="steps">
            {STEPS.map((step) => (
              <div key={step.n} className="step">
                <div className="num">STEP {step.n}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pain vs Solution ── */}
      <section className="block pain-bg">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">Why MoveLeads</div>
            <h2 className="section-h">Tired of paying for leads that never answer?</h2>
            <p className="section-sub">Most moving lead providers sell the same junk lead to five companies. We don't.</p>
          </div>

          <div className="compare">
            <div className="col bad">
              <h3>
                <span className="ic">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </span>
                Common lead provider problems
              </h3>
              <ul>
                {PAIN.map((item) => (
                  <li key={item}>
                    <span className="mark">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="col good">
              <h3>
                <span className="ic">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 12 10 18 20 6" />
                  </svg>
                </span>
                How MoveLeads is different
              </h3>
              <ul>
                {SOLN.map((item) => (
                  <li key={item}>
                    <span className="mark">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 12 10 18 20 6" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Credit offer ── */}
      <section className="block offer-bg" id="offer">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">Limited offer</div>
            <h2 className="section-h">Start with bonus credits</h2>
            <p className="section-sub">For a limited time, get 50% extra buying power on your first credit purchase. Use credits to unlock leads directly from your dashboard.</p>
          </div>

          <div className="offer-card">
            <div>
              <span className="ribbon">First-purchase bonus</span>
              <div className="big">
                <span className="strike">$100</span>
                <span className="new">$150</span>
              </div>
              <p className="support">Pay $100 once. Get $150 in credits dropped straight into your partner dashboard. Use them on whatever leads make sense for your crew.</p>
              <p className="trust-note">Bonus offer applies to first purchase only. No subscription. No contract. Credits never expire.</p>
            </div>
            <div className="offer-rhs">
              <ul>
                {['No monthly subscription', 'No long-term contract', 'Only pay for the leads you choose', 'Credits never expire'].map((text) => (
                  <li key={text}>
                    <span className="check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 12 10 18 20 6" />
                      </svg>
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={goToBilling}>Claim bonus credits &nbsp;→</button>
              <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12.5, color: '#64748b', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>
                SECURE CHECKOUT · STRIPE
              </div>
            </div>
          </div>
        </div>
      </section>
```

- [ ] **Step 6.2: Verify rendering**

```bash
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5195 --host 127.0.0.1 &
sleep 5
curl -sS -o /dev/null -w "page: %{http_code}\n" http://127.0.0.1:5195/partners
lsof -iTCP:5195 -sTCP:LISTEN -t | xargs -I{} kill {}
```

Manual check: scroll the page, confirm 4 stats / 4 steps / red-vs-green columns / dark credit-offer card with `$100 → $150`.

- [ ] **Step 6.3: Commit**

```bash
git add client/src/pages/Partners.jsx
git commit -m "$(cat <<'EOF'
feat(partners): add stats strip, how-it-works, pain vs solution, credit offer

Stats strip iterates STATS. How-it-works iterates STEPS. Compare section
iterates PAIN and SOLN. Credit offer card uses goToBilling for the CTA.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Bottom sections: sample leads, who-it's-for, FAQ, final CTA, footer

**Files:**
- Modify: `client/src/pages/Partners.jsx`

- [ ] **Step 7.1: Insert the bottom sections after the credit offer section, before the closing `</div>` of `.partners-page`**

```jsx
      {/* ── Sample leads ── */}
      <section className="block" id="leads">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">Sample leads</div>
            <h2 className="section-h">See the type of leads you can buy</h2>
            <p className="section-sub">Preview every job's route, size, timeline, and verification status before you unlock the customer's phone number.</p>
          </div>

          <div className="leads-grid">
            {LEADS.map((lead) => (
              <LeadCard key={`${lead.from}-${lead.to}`} lead={lead} onBuy={goToSignup} />
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 36 }}>
            <button type="button" className="btn btn-ghost-light btn-lg" onClick={goToSignup}>
              See how unlocking works in dashboard &nbsp;→
            </button>
          </div>
        </div>
      </section>

      {/* ── Who it's for ── */}
      <section className="block pain-bg">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">Who it's for</div>
            <h2 className="section-h">Built for movers who want more booked jobs</h2>
            <p className="section-sub">Whether you run a two-truck local outfit or a long-haul interstate operation, you control every dollar you spend.</p>
          </div>

          <div className="who-grid">
            {WHO.map((card) => (
              <div key={card.title} className="who-card">
                <div className="icon">{card.icon}</div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <div className="tag">{card.tag}</div>
              </div>
            ))}
          </div>

          {/* photo strip — intentionally omitted per spec Q4 = A */}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="block faq-bg" id="faq">
        <div className="wrap">
          <div className="faq-grid">
            <div className="faq-side">
              <div className="eyebrow">FAQ</div>
              <h2 className="section-h">Questions moving companies ask</h2>
              <p className="section-sub">Straight answers. No fine print.</p>
              <div className="helper">
                <span className="lab">Talk to a partner rep</span>
                <span className="val">Mon–Sat · 8am–8pm CT</span>
                <a href={`tel:${PHONE}`}>{PHONE_DISPLAY} →</a>
              </div>
            </div>

            <div className="faq-list">
              {FAQS.map((faq) => (
                <details key={faq.q} className="faq-item" open={!!faq.open}>
                  <summary>{faq.q} <span className="plus">+</span></summary>
                  <div className="answer">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="final-cta" id="signup">
        <div className="wrap">
          <div className="final-cta-inner">
            <h2>Ready to try real moving leads?</h2>
            <p>Stop losing booked moves to faster competitors. Unlock only the jobs that fit your trucks and crews. No monthly fees. No contracts. Just real moving customers.</p>
            <div className="ctas">
              <button type="button" className="btn btn-primary btn-lg" onClick={goToSignup}>See live move requests &nbsp;→</button>
              <a href="#leads" className="btn btn-ghost-dark btn-lg">See how unlocking works</a>
            </div>
            <div className="note">$100 = $150 IN CREDITS · FIRST-TIME PARTNERS ONLY</div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <div className="brand" style={{ color: '#fff' }}>
                <span className="mark">M</span>
                <span>Move<span className="dot-cloud">Leads</span><span style={{ color: 'var(--orange)' }}>.cloud</span></span>
              </div>
              <p>Verified move requests, delivered live to your dashboard. Pay-as-you-go credits. No contracts. Built for working movers.</p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li><a href="#how">How it works</a></li>
                <li><a href="#leads">Sample leads</a></li>
                <li><a href="#offer">Pricing</a></li>
                <li><a href="#faq">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4>Company</h4>
              <ul>
                <li><a href="/about">About</a></li>
                <li><a href="/contact">Contact</a></li>
                <li><a href="/privacy">Privacy</a></li>
                <li><a href="/terms">Terms</a></li>
              </ul>
            </div>
            <div>
              <h4>Account</h4>
              <ul>
                <li><a href="/login">Partner login</a></li>
                <li><button type="button" onClick={goToSignup} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}>See live moves</button></li>
                <li><a href={`tel:${PHONE}`}>{PHONE_DISPLAY}</a></li>
                <li><a href="mailto:partners@moveleads.cloud">partners@moveleads.cloud</a></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 MoveLeads.cloud · All rights reserved.</span>
            <span>Made for moving companies in the USA</span>
          </div>
        </div>
      </footer>
```

- [ ] **Step 7.2: Verify all sections render**

```bash
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5195 --host 127.0.0.1 &
sleep 5
curl -sS -o /dev/null -w "page: %{http_code}\n" http://127.0.0.1:5195/partners
lsof -iTCP:5195 -sTCP:LISTEN -t | xargs -I{} kill {}
```

Manual check: scroll to bottom, confirm 3 lead cards / 3 audience cards / 6 FAQ items (first one open) / final CTA / 4-column footer.

- [ ] **Step 7.3: Commit**

```bash
git add client/src/pages/Partners.jsx
git commit -m "$(cat <<'EOF'
feat(partners): add sample leads, who-it's-for, FAQ, final CTA, footer

Sample leads renders LeadCard 3x. Who-it's-for iterates WHO array.
FAQ uses native <details>/<summary> with FAQS data. Final CTA + dark
4-column footer complete the page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — SEO meta + JsonLd structured data

**Files:**
- Modify: `client/src/pages/Partners.jsx`

- [ ] **Step 8.1: Add JsonLd import and document title at top of `Partners` component**

Find the existing import block at the top of `Partners.jsx`:
```jsx
import useCanonical from '../utils/useCanonical';
import './Partners.css';
```

Replace with:
```jsx
import useCanonical from '../utils/useCanonical';
import JsonLd from '../components/JsonLd';
import './Partners.css';
```

Find the existing body of the `Partners` component:
```jsx
  useCanonical('/partners');

  const navigate = useNavigate();
```

Replace with:
```jsx
  useCanonical('/partners');

  // React 19 supports native <title>/<meta> rendered inside the component tree.
  // If the project's React version doesn't, this falls back gracefully — the
  // tags simply land in <head> when React 19 is present.

  const navigate = useNavigate();
```

- [ ] **Step 8.2: Add `<title>`, `<meta>`, and `<JsonLd>` as the first children of the root `.partners-page` div**

Find:
```jsx
    <div className="partners-page">
      {/* ── Sticky offer bar ── */}
```

Replace with:
```jsx
    <div className="partners-page">
      <title>MoveLeads — Buy verified moving leads. Pay-as-you-go.</title>
      <meta name="description" content="Access live move requests from real customers. Unlock only the jobs you want. Pay-as-you-go credits, no monthly subscription. Built for moving companies." />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: 'MoveLeads Partner Marketplace',
          serviceType: 'Lead generation for moving companies',
          provider: {
            '@type': 'Organization',
            name: 'MoveLeads.cloud',
            url: 'https://moveleads.cloud',
          },
          areaServed: 'United States',
          description: 'Pay-as-you-go credits for verified moving leads. No subscription. No contract.',
          offers: {
            '@type': 'Offer',
            description: 'First-purchase bonus: $100 = $150 in credits',
            priceCurrency: 'USD',
          },
        }}
      />

      {/* ── Sticky offer bar ── */}
```

- [ ] **Step 8.3: Verify `<title>` is set when navigating to `/partners`**

```bash
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5195 --host 127.0.0.1 &
sleep 5
curl -sS -o /dev/null -w "page: %{http_code}\n" http://127.0.0.1:5195/partners
lsof -iTCP:5195 -sTCP:LISTEN -t | xargs -I{} kill {}
```

Manual check: open `http://127.0.0.1:5195/partners` in a browser and check the tab title is `MoveLeads — Buy verified moving leads. Pay-as-you-go.`. Open devtools and confirm `<script type="application/ld+json">` is present in `<head>`.

- [ ] **Step 8.4: Commit**

```bash
git add client/src/pages/Partners.jsx
git commit -m "$(cat <<'EOF'
feat(partners): add page title, meta description, and JSON-LD schema

React 19 native <title>/<meta> tags set the document head. JsonLd
emits a Service schema describing the lead marketplace.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — Playwright smoke test

**Files:**
- Create: `tests/e2e/partners.spec.js`

- [ ] **Step 9.1: Check the existing Playwright config so the new test fits the project's pattern**

Run:
```bash
cat /Users/amin/Downloads/MoveLeads/playwright.config.js | head -40
```

Confirm the `baseURL` (or note it's not set — the test will use a full URL).

- [ ] **Step 9.2: Create `tests/e2e/partners.spec.js`**

```js
const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';

test.describe('/partners landing page', () => {
  test('renders for a guest visitor with the expected hero, offer bar, and CTAs', async ({ page }) => {
    await page.goto(`${BASE}/partners`);

    // Headline contains the key value-prop phrase.
    await expect(page.locator('h1')).toContainText('Stop paying for move requests');

    // Sticky offer bar visible.
    await expect(page.locator('.offer-bar')).toBeVisible();

    // Primary hero CTA visible (button, since we converted from anchor to button).
    await expect(page.getByRole('button', { name: /See live move requests/i }).first()).toBeVisible();

    // HLOC card route is the Dallas → Austin sample.
    await expect(page.locator('.hloc-route')).toContainText('Dallas, TX');
    await expect(page.locator('.hloc-route')).toContainText('Austin, TX');

    // Document title was set via React 19 native <title>.
    await expect(page).toHaveTitle(/MoveLeads — Buy verified moving leads/);
  });

  test('guest CTA on hero navigates to /register', async ({ page }) => {
    await page.goto(`${BASE}/partners`);
    await page.getByRole('button', { name: /See live move requests/i }).first().click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('Partner login link navigates to /login', async ({ page }) => {
    await page.goto(`${BASE}/partners`);
    await page.getByRole('link', { name: /Partner login/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
```

- [ ] **Step 9.3: Run the smoke test against a running dev server**

In one terminal:
```bash
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5173 --host 127.0.0.1
```

In another terminal:
```bash
cd /Users/amin/Downloads/MoveLeads
E2E_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/e2e/partners.spec.js
```

Expected:
```
3 passed
```

If Playwright prompts to install browsers, run `npx playwright install` first.

- [ ] **Step 9.4: Commit**

```bash
git add tests/e2e/partners.spec.js
git commit -m "$(cat <<'EOF'
test(partners): add Playwright smoke for /partners

Three assertions: page renders with expected hero/offer-bar/HLOC,
guest hero CTA routes to /register, Partner login routes to /login.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 — Final verification: production build + manual visual diff

**Files:** none modified.

- [ ] **Step 10.1: Run a production build**

```bash
cd /Users/amin/Downloads/MoveLeads/client
node ./node_modules/vite/bin/vite.js build .
```

Expected: build succeeds with no errors. The `dist/` directory is created.

If the build fails with a rolldown native binding error (`code signature ... not valid for use in process`), strip the macOS quarantine attribute first:
```bash
xattr -dr com.apple.quarantine /Users/amin/Downloads/MoveLeads
```

- [ ] **Step 10.2: Preview the production build and visually compare to the mockup**

```bash
node /Users/amin/Downloads/MoveLeads/client/node_modules/vite/bin/vite.js preview /Users/amin/Downloads/MoveLeads/client --port 5196 --host 127.0.0.1 &
sleep 5
curl -sS -o /dev/null -w "preview: %{http_code}\n" http://127.0.0.1:5196/partners
```

Open `http://127.0.0.1:5196/partners` and `file:///Users/amin/Downloads/MoveLeads/Partner%20Landing.html` side by side. Confirm:

1. Sticky offer bar — same orange gradient, same copy
2. Nav — same dark background, same brand mark, same links/CTAs
3. Hero — same headline, same `.accent` orange phrase, same bullets, same HLOC card
4. Stats strip — 4 numbers with `240k+` in orange
5. How it works — 4 steps with `STEP 01`–`STEP 04`
6. Pain vs solution — red column / green-bordered column
7. Credit offer — dark section with `$100 → $150`
8. Sample leads — 3 cards (Tampa, LA→Vegas, Brooklyn)
9. Who it's for — 3 cards (no photo strip — intentional)
10. FAQ — first item open, others closed, plus icon rotates on toggle
11. Final CTA — dark navy with orange glow at top
12. Footer — 4-column dark navy

Stop the preview server:
```bash
lsof -iTCP:5196 -sTCP:LISTEN -t | xargs -I{} kill {}
```

- [ ] **Step 10.3: Verify other routes still render normally (CSS isolation)**

```bash
/Users/amin/Downloads/MoveLeads/client/node_modules/.bin/vite dev --port 5197 --host 127.0.0.1 &
sleep 5
for path in "/" "/get-quote" "/get-quote-v3" "/get-quote-v4" "/for-movers" "/about" "/contact" "/login"; do
  printf "%-22s " "$path"
  curl -sS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:5197$path"
done
lsof -iTCP:5197 -sTCP:LISTEN -t | xargs -I{} kill {}
```

Expected: all `200`.

Manual: open each in a browser and confirm there are no visual regressions caused by the new CSS file.

- [ ] **Step 10.4: Final commit (no-op safeguard)**

If any uncommitted tweaks were made during verification, commit them:
```bash
git status --short
# If anything is dirty, review and commit a wrap-up:
git add -A
git commit -m "$(cat <<'EOF'
chore(partners): final verification tweaks

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If `git status --short` is clean, skip this step.

---

## Acceptance criteria check

After Task 10, walk through each acceptance criterion in [the spec, section 13](../specs/2026-05-07-partners-landing-page-design.md):

1. ✅ `Partners.jsx` exists and exports default — verified by Task 1.5 commit
2. ✅ `Partners.css` exists, scoped — verified by Task 2.4 commit
3. ✅ `App.jsx` route added — verified by Task 1.5 commit
4. ✅ All 12 sections render in order — verified by Task 7.2 manual check + Task 10.2 visual diff
5. ✅ Guest CTAs go to `/register` — verified by Task 9 Playwright test
6. ⚠️ Logged-in CTAs go to `/dashboard/leads` and `/dashboard/billing` — manual check needed (log in via existing app, navigate to `/partners`, click CTAs)
7. ✅ `Partner login` always goes to `/login` — verified by Task 9 Playwright test
8. ✅ Anchor CTAs scroll — verified by Task 10.2 manual check
9. ✅ `<title>` and `<meta>` set — verified by Task 9 Playwright test (`toHaveTitle`)
10. ✅ Playwright smoke passes — verified by Task 9.3
11. ✅ CSS isolation — verified by Task 10.3 (other routes still render normally)
12. ✅ `vite build` succeeds — verified by Task 10.1

If criterion 6 fails, add a follow-up task: log in as an existing user (or seed a user via `server/scripts/seed-test-movers.js`), navigate to `/partners`, click each CTA, confirm correct redirect.
