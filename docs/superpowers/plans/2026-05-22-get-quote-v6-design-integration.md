# `/get-quote-v6` Design Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin `/get-quote-v6` with the Claude Design project's visual layer while preserving the existing state machine, payload, submission contract, persistence, and backend compatibility — design is the skin, existing V6 logic is the source of truth.

**Architecture:** `GetQuoteV6.jsx` remains the orchestrator. Visual components, layouts, and screen markup are extracted from the design project into a new `client/src/pages/getQuoteV6/` directory and imported back into the orchestrator. A thin `enums.js` mapping layer translates design UI ids → backend-valid strings at `patch()` time so `answers.*` stays backend-shaped. No server-side, payload, pricing, scoring, or routing changes.

**Tech Stack:** React 19, Vite, inline `style` + CSS custom properties (no CSS-in-JS lib), zippopotam.us for ZIP enrichment, existing `/api/leads/ingest-v2` endpoint.

**Source files (READ-ONLY references):**
- Design project: `/Users/amin/Downloads/moveleads funnel v6/` (`ui.jsx`, `screens.jsx`, `layouts.jsx`, `route-preview.jsx`, `index.html`, `CHANGES.md`)
- Existing orchestrator: `client/src/pages/GetQuoteV6.jsx`
- Backend validator (read-only reference): `server/validators/leadIngestV2.js`

**Decisions locked (per user 2026-05-22):**
1. No `specialInstructions` field — keep payload stable.
2. Native `<input type="date">` — do NOT port custom calendar.
3. BucketSelect uses 4 options (`asap`, `this_week`, `this_month`, `flexible`).
4. New hero asset `family-truck.png` → optimize to webp, place as new file (do NOT overwrite `hero-moving.webp`).
5. Keep current production font (Manrope/DM Sans). Do NOT add Plus Jakarta Sans.

**Untouchable surfaces (zero edits):**
- `server/**`, scoring engine, pricing engine, tier router, Stripe, Twilio, buy-now, refund cascade, marketplace logic
- Other GetQuote pages (V1–V5), payload field names, storage key, endpoint URL, route mount in `App.jsx`

---

## File Structure (decomposition)

**New directory:**
```
client/src/pages/getQuoteV6/
├── styles.css                       Design tokens + animations (extracted from design index.html)
├── enums.js                         UI-id → backend-string maps + label helpers
├── route.js                         milesBetween, cardinal, transitDaysLabel (pure helpers)
├── components/
│   ├── Icon.jsx                     SVG icon set (30+ paths, ported from design ui.jsx)
│   ├── Logo.jsx                     Logo + LogoMark (orange isometric box)
│   ├── PrimaryButton.jsx
│   ├── SecondaryButton.jsx
│   ├── Spinner.jsx
│   ├── FieldInput.jsx
│   ├── ChoiceCard.jsx
│   ├── TileCard.jsx
│   ├── PivotCard.jsx
│   ├── FunnelHeader.jsx             Mobile sticky header with back/progress
│   ├── ScreenWrap.jsx
│   ├── Question.jsx                 eyebrow + h1 + sub
│   ├── TrustStrip.jsx
│   ├── Eyebrow.jsx
│   ├── HowCard.jsx
│   ├── RouteArc.jsx                 SVG topographic map + animated arc
│   ├── StatCell.jsx
│   ├── CityBlock.jsx
│   ├── ArrowDivider.jsx
│   └── FieldError.jsx
├── screens/
│   ├── RouteScreen.jsx              Hero landing (replaces HeroLanding)
│   ├── RoutePreviewMoment.jsx
│   ├── TimingPivotScreen.jsx
│   ├── DatePickerScreen.jsx         Wraps native <input type="date"> in design chrome
│   ├── BucketSelectScreen.jsx       4-option version
│   ├── HomeTypeScreen.jsx
│   ├── HomeSizeScreen.jsx
│   ├── StairsScreen.jsx
│   ├── HeavyPivotScreen.jsx
│   ├── HeavySelectScreen.jsx
│   ├── ContactScreen.jsx
│   └── SuccessScreen.jsx
└── shells/
    ├── MobileShell.jsx              Just `{children}` (no iOS frame in prod)
    └── DesktopShell.jsx             Two-column with persistent left rail (≥1100px)
```

**Files modified in real repo:**
- `client/src/pages/GetQuoteV6.jsx` — replace inlined components with imports; keep state machine, submit, persist, restart verbatim
- `client/public/hero-family-truck.webp` — new asset only

**Files NOT touched:**
- `client/src/App.jsx` (route mount stays)
- `client/index.html` (no font additions)
- All other pages, components, hooks
- `server/**`

---

## Bite-Sized Tasks

### Task 0: Pre-flight verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm baseline build is green**

Run: `cd /Users/amin/Downloads/MoveLeads/client && npm run build`
Expected: build succeeds. If it fails, STOP and report — this is a baseline-already-broken issue, not the scope of this plan.

- [ ] **Step 2: Confirm baseline lint is green**

Run: `cd /Users/amin/Downloads/MoveLeads/client && npm run lint`
Expected: lint passes or matches pre-existing warning count. Record the count for later comparison.

- [ ] **Step 3: Capture baseline payload**

Manual: Start dev server (`npm run dev`), navigate to `/get-quote-v6`, open DevTools Network tab, fill the funnel end-to-end with test data, submit. Save the request payload to a scratch note (NOT committed) — this is the parity reference for Task 16.

Test data to use (memorize, reuse in Task 16):
- pickupZip: `33101`, destinationZip: `75201`
- Timing: "Yes I know the date" → tomorrow + 14 days
- homeType: apartment, homeSize: `2 Bedroom`, stairs: `walk_up_2`
- Heavy: skip
- Contact: firstName=`Test`, phone=`5551234567`, email blank

---

### Task 1: Optimize hero asset

**Files:**
- Create: `client/public/hero-family-truck.webp`

- [ ] **Step 1: Convert design PNG to webp**

Run:
```
cd /Users/amin/Downloads/MoveLeads/client/public
sips -s format webp -s formatOptions 75 "/Users/amin/Downloads/moveleads funnel v6/assets/family-truck.png" --out hero-family-truck.webp
```
Expected: file created. Verify size with `ls -lh hero-family-truck.webp` — should be ≤ 400KB. If `sips` is unavailable or doesn't support webp, fall back to:
```
ffmpeg -i "/Users/amin/Downloads/moveleads funnel v6/assets/family-truck.png" -c:v libwebp -quality 75 hero-family-truck.webp
```
If neither works, report and ask the user to optimize manually.

- [ ] **Step 2: Confirm existing hero is untouched**

Run: `ls -lh /Users/amin/Downloads/MoveLeads/client/public/hero-moving.webp`
Expected: file still exists and has same mtime as before. We do not overwrite it.

- [ ] **Step 3: Commit**

```
git add client/public/hero-family-truck.webp
git commit -m "asset(get-quote-v6): add optimized hero-family-truck.webp"
```

---

### Task 2: Create design tokens CSS

**Files:**
- Create: `client/src/pages/getQuoteV6/styles.css`

- [ ] **Step 1: Create the stylesheet**

Source: extract `:root` tokens + keyframes from `/Users/amin/Downloads/moveleads funnel v6/index.html` (lines 30–154).

Write `client/src/pages/getQuoteV6/styles.css` with:
- All `:root` CSS custom properties from design (colors, shadows, radii). Use design's color tokens verbatim. DO NOT add the Plus Jakarta Sans `--font-heading` / `--font-body` declarations — instead define `--font-heading` and `--font-body` to inherit current page font (`Manrope, "DM Sans", -apple-system, system-ui, sans-serif`).
- Keyframes: `screenIn`, `popIn`, `drawArc`, `spin`
- Utility classes: `.screen-enter`, `.pop-in`, `.stagger > *` with nth-child delays, `.nostroke`, `.focusring:focus-within`, `.scroll`
- Scope all selectors under a top-level wrapper class `.glq-v6` to avoid leaking global styles. Example: `.glq-v6 .screen-enter { animation: ... }`.
- Define a single root rule `.glq-v6` that locks `font-family: var(--font-body)`.

- [ ] **Step 2: Verify CSS parses**

Run: `cd /Users/amin/Downloads/MoveLeads/client && npm run build`
Expected: build passes. CSS isn't imported anywhere yet so it just needs to parse on its own — verify by adding `import './pages/getQuoteV6/styles.css'` temporarily to `client/src/main.jsx`, building, then removing the import (the real import happens in Task 14).

- [ ] **Step 3: Commit**

```
git add client/src/pages/getQuoteV6/styles.css
git commit -m "ui(get-quote-v6): add design tokens and animations stylesheet"
```

---

### Task 3: Create enums + helpers layer

**Files:**
- Create: `client/src/pages/getQuoteV6/enums.js`
- Create: `client/src/pages/getQuoteV6/route.js`

- [ ] **Step 1: Write `enums.js`**

This is the central mapping layer. UI components use design ids; this module translates to backend-valid strings.

```js
// client/src/pages/getQuoteV6/enums.js
// UI taxonomies for the design's screens, mapped to the EXACT backend-valid
// strings that server/validators/leadIngestV2.js accepts. Values written into
// answers.* at patch() time are ALWAYS already backend-shaped. No translation
// happens inside submit().

// Home type — 1:1 with backend enum.
export const HOME_TYPES = [
  { id: 'house',     title: 'House',      sub: 'Standalone home',     icon: 'house2' },
  { id: 'apartment', title: 'Apartment',  sub: 'Multi-unit building', icon: 'bldg' },
  { id: 'condo',     title: 'Condo',      sub: 'Owned in a building', icon: 'bldg' },
  { id: 'townhouse', title: 'Townhouse',  sub: 'Attached home',       icon: 'home' },
  { id: 'storage',   title: 'Storage',    sub: 'Storage unit move',   icon: 'warehouse' },
  { id: 'other',     title: 'Other',      sub: 'Something else',      icon: 'box' },
];

// UI-side size options per home type. The `backend` field is what gets
// patched into answers.homeSize — always a string the Zod enum accepts.
// Lossy mappings (storage_*, few_items, room, small, large) collapse to
// the closest volumetric backend bucket; the richer UI label is NOT
// preserved on this pass (per user decision 2026-05-22 #1).
export const SIZE_SETS = {
  apartment: [
    { id: 'studio',   title: 'Studio',     sub: '< 500 sq ft',         backend: 'Studio' },
    { id: '1br',      title: '1-bedroom',  sub: '500–800 sq ft',       backend: '1 Bedroom' },
    { id: '2br',      title: '2-bedroom',  sub: '800–1,200 sq ft',     backend: '2 Bedroom' },
    { id: '3br',      title: '3-bedroom',  sub: '1,200–1,600 sq ft',   backend: '3 Bedroom' },
    { id: '4br',      title: '4-bedroom',  sub: '1,600–2,000 sq ft',   backend: '4 Bedroom' },
    { id: '4br_plus', title: '4+ bedrooms', sub: '2,000+ sq ft',        backend: '4+ Bedroom' },
  ],
  house: [
    { id: 'house_s',  title: 'Small house', sub: '< 1,500 sq ft · 1–2 BR', backend: 'House (Small)' },
    { id: 'house_m',  title: 'Medium house', sub: '1,500–2,500 sq ft · 2–4 BR', backend: 'House (Medium)' },
    { id: 'house_l',  title: 'Large house', sub: '2,500+ sq ft · 4+ BR',  backend: 'House (Large)' },
    { id: '5br',      title: '5-bedroom',   sub: 'Large home',            backend: '5 Bedroom' },
    { id: '5br_plus', title: '5+ bedrooms', sub: 'Estate-sized',          backend: '5+ Bedroom' },
  ],
  storage: [
    { id: 'storage_s', title: 'Small unit',  sub: '5×5 or 5×10',     backend: 'Studio' },
    { id: 'storage_m', title: 'Medium unit', sub: '10×10 or 10×15',  backend: '1 Bedroom' },
    { id: 'storage_l', title: 'Large unit',  sub: '10×20 or 10×30',  backend: '2 Bedroom' },
  ],
  other: [
    { id: 'few_items', title: 'A few items',   sub: 'Furniture, boxes only',  backend: 'Studio' },
    { id: 'room',      title: 'A single room', sub: 'Equivalent to studio',   backend: 'Studio' },
    { id: 'small',     title: 'Small place',   sub: 'Equivalent to 1–2BR',    backend: '1 Bedroom' },
    { id: 'large',     title: 'Large place',   sub: 'Equivalent to 3+BR',     backend: '3 Bedroom' },
    { id: 'office',    title: 'Office space',  sub: 'Commercial move',        backend: 'Office / Commercial' },
  ],
};
SIZE_SETS.condo = SIZE_SETS.apartment;
SIZE_SETS.townhouse = SIZE_SETS.apartment;

// stairs — 1:1 with backend enum.
export const STAIRS_OPTIONS = [
  { id: 'ground_floor',   title: 'Ground floor',                  sub: 'No stairs',                  icon: 'home' },
  { id: 'walk_up_2',      title: '2nd floor walk-up',             sub: 'One flight of stairs',       icon: 'stairs' },
  { id: 'walk_up_3plus',  title: '3rd floor or higher walk-up',   sub: 'Multiple flights of stairs', icon: 'stairs' },
  { id: 'elevator',       title: 'Elevator',                      sub: 'Building has an elevator',   icon: 'elevator' },
];

// Bucket — 4 options (user decision 2026-05-22 #3). Backend accepts all 4.
export const BUCKET_OPTIONS = [
  { id: 'asap',       title: 'As soon as possible', sub: 'Within the next 7 days' },
  { id: 'this_week',  title: 'This week',           sub: '1–2 weeks out' },
  { id: 'this_month', title: 'This month',          sub: '2–4 weeks out' },
  { id: 'flexible',   title: 'I’m flexible',   sub: 'Anytime in the next few months' },
];

// Heavy items — UI shows pretty titles, backend stores the title string itself
// (validator accepts any string up to 80 chars, max 20 items). Storing the
// title means what the user sees is what gets sent — no separate translation.
export const HEAVY_ITEMS = [
  { id: 'piano_upright',  title: 'Upright piano',      icon: 'piano' },
  { id: 'piano_grand',    title: 'Grand piano',        icon: 'piano' },
  { id: 'safe',           title: 'Safe',               icon: 'shield' },
  { id: 'gun_safe',       title: 'Gun safe',           icon: 'shield' },
  { id: 'pool_table',     title: 'Pool table',         icon: 'box' },
  { id: 'hot_tub',        title: 'Hot tub',            icon: 'box' },
  { id: 'gym_equipment',  title: 'Gym equipment',      icon: 'weight' },
  { id: 'large_appliance', title: 'Large appliance',   icon: 'box' },
  { id: 'antiques',       title: 'Antiques',           icon: 'sparkle' },
  { id: 'art',            title: 'Fine art',           icon: 'sparkle' },
  { id: 'fragile',        title: 'Fragile collection', icon: 'shield' },
  { id: 'other',          title: 'Other heavy item',   icon: 'plus' },
];

// Lookup helpers used by SuccessScreen and DesktopRouteContext summaries.
export const homeTypeLabel = (id) => HOME_TYPES.find(t => t.id === id)?.title || '—';

export const homeSizeLabelFromBackend = (backendValue) => backendValue || '—';

export const stairsLabel = (id) => STAIRS_OPTIONS.find(o => o.id === id)?.title || '—';

export const bucketLabel = (id) => BUCKET_OPTIONS.find(b => b.id === id)?.title || '—';
```

- [ ] **Step 2: Write `route.js`**

Pure helpers extracted from design's `route-preview.jsx`. The `ZIP_TABLE` and `lookupZip` are DROPPED — V6 uses zippopotam.us live enrichment. We only need pure-math helpers and the transit-days label rule.

```js
// client/src/pages/getQuoteV6/route.js
// Pure helpers. NO ZIP_TABLE — V6 uses zippopotam.us in GetQuoteV6.jsx.

const R_MILES = 3958.8;

// Great-circle distance in miles (haversine).
export function milesBetween(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R_MILES * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

// Cardinal direction string for the route preview (e.g. "NW", "—").
export function cardinal(route) {
  if (!route?.from || !route?.to) return '—';
  const dLat = (route.to.lat ?? 0) - (route.from.lat ?? 0);
  const dLng = (route.to.lng ?? 0) - (route.from.lng ?? 0);
  const ns = dLat > 0.2 ? 'N' : dLat < -0.2 ? 'S' : '';
  const ew = dLng > 0.2 ? 'E' : dLng < -0.2 ? 'W' : '';
  return (ns + ew) || '—';
}

// Transit days label (per CHANGES.md #11).
export function transitDaysLabel(miles) {
  if (miles == null) return '—';
  if (miles < 200)  return '1';
  if (miles < 800)  return '1–2';
  if (miles < 1800) return '2–3';
  return '3–5';
}
```

- [ ] **Step 3: Build & lint**

Run: `cd /Users/amin/Downloads/MoveLeads/client && npm run build && npm run lint`
Expected: passes. Both files are pure JS with no React; bundle should not change because nothing imports them yet.

- [ ] **Step 4: Commit**

```
git add client/src/pages/getQuoteV6/enums.js client/src/pages/getQuoteV6/route.js
git commit -m "feat(get-quote-v6): add enums mapping layer and pure route helpers"
```

---

### Task 4: Port `Icon` component

**Files:**
- Create: `client/src/pages/getQuoteV6/components/Icon.jsx`

- [ ] **Step 1: Port the icon set**

Source: `/Users/amin/Downloads/moveleads funnel v6/ui.jsx` lines 39–81 (`const Icon` and its `paths` object).

Convert from `window.Icon = ...` to ES module export. Keep ALL icon names from the source (`pin`, `arrow`, `phone`, `check`, `cal`, `clock`, `home`, `box`, `bldg`, `house2`, `warehouse`, `chev`, `chevL`, `chevD`, `sparkle`, `shield`, `user`, `mail`, `info`, `close`, `lock`, `plus`, `stairs`, `elevator`, `piano`, `couch`, `weight`, `truck`, `arrowRight`, `map`, `dots`, `star`, `doc`, `users`).

```jsx
// client/src/pages/getQuoteV6/components/Icon.jsx
export default function Icon({ name, size = 18, color = 'currentColor', stroke = 1.7 }) {
  const paths = {
    pin: <><path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" /><circle cx="12" cy="9" r="2.6" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    // ... paste ALL paths from /Users/amin/Downloads/moveleads funnel v6/ui.jsx lines 41-75 verbatim ...
    users: <><circle cx="9" cy="9" r="3.5" /><path d="M3 20c0-3.6 2.7-6.5 6-6.5s6 2.9 6 6.5" /><circle cx="17" cy="11" r="2.8" /><path d="M14 20c0-2.4 1.8-4.5 4-4.5s3 1.7 3 3.5" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
```

**Action:** copy the full `paths` object literal from the design file into the new module (do not abbreviate). Keep JSX `<></>` fragments for multi-element icons.

- [ ] **Step 2: Build**

Run: `cd /Users/amin/Downloads/MoveLeads/client && npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```
git add client/src/pages/getQuoteV6/components/Icon.jsx
git commit -m "ui(get-quote-v6): port Icon component with full SVG path set"
```

---

### Task 5: Port `Logo` component

**Files:**
- Create: `client/src/pages/getQuoteV6/components/Logo.jsx`

- [ ] **Step 1: Port Logo + LogoMark**

Source: design `ui.jsx` lines 3–37.

```jsx
// client/src/pages/getQuoteV6/components/Logo.jsx
export function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
      <ellipse cx="16" cy="29" rx="9" ry="1.2" fill="rgba(15,23,42,0.18)" />
      <path d="M3.5 10.2 L16 16.4 L16 29 L3.5 22.8 Z" fill="#ea6c0a" />
      <path d="M28.5 10.2 L16 16.4 L16 29 L28.5 22.8 Z" fill="#c2410c" />
      <path d="M16 3.5 L28.5 10.2 L16 16.4 L3.5 10.2 Z" fill="#f97316" />
      <path d="M16 3.5 L16 16.4" stroke="#fdba74" strokeWidth="0.9" opacity="0.7" />
      <path d="M16 3.5 L28.5 10.2 L28.5 22.8 L16 29 L3.5 22.8 L3.5 10.2 Z" stroke="#7c2d12" strokeWidth="0.8" strokeLinejoin="round" fill="none" opacity="0.35" />
      <path d="M16 16.4 L16 29" stroke="#7c2d12" strokeWidth="0.6" opacity="0.3" />
    </svg>
  );
}

export default function Logo({ size = 24, light = false, withMark = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      {withMark && <LogoMark size={Math.round(size * 1.25)} />}
      <span style={{
        fontFamily: 'var(--font-heading)',
        fontSize: Math.round(size * 0.82),
        fontWeight: 800,
        letterSpacing: '-0.02em',
        color: light ? '#ffffff' : 'var(--primary)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        MoveLeads<span style={{ color: 'var(--accent)' }}>.cloud</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Build & commit**

```
cd /Users/amin/Downloads/MoveLeads/client && npm run build
git add client/src/pages/getQuoteV6/components/Logo.jsx
git commit -m "ui(get-quote-v6): port Logo and LogoMark components"
```

---

### Task 6: Port primitive buttons + Spinner

**Files:**
- Create: `client/src/pages/getQuoteV6/components/Spinner.jsx`
- Create: `client/src/pages/getQuoteV6/components/PrimaryButton.jsx`
- Create: `client/src/pages/getQuoteV6/components/SecondaryButton.jsx`

- [ ] **Step 1: Port `Spinner.jsx`**

Source: design `ui.jsx` lines 153–159. Use `className="glq-spinner"` and define the `@keyframes spin` inside `styles.css` (already done in Task 2) instead of inline.

```jsx
// client/src/pages/getQuoteV6/components/Spinner.jsx
export default function Spinner({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 700ms linear infinite' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
```

(Confirm `@keyframes spin` is in `styles.css` — add it there if missing.)

- [ ] **Step 2: Port `PrimaryButton.jsx`**

Source: design `ui.jsx` lines 84–135. Import `Icon` and `Spinner`.

```jsx
// client/src/pages/getQuoteV6/components/PrimaryButton.jsx
import Icon from './Icon';
import Spinner from './Spinner';

export default function PrimaryButton({ children, onClick, disabled, full = true, icon = 'arrow', loading = false, size = 'lg' }) {
  const h = size === 'lg' ? 56 : 48;
  const baseGradient = 'linear-gradient(180deg, #fb923c 0%, #f97316 50%, #ea6c0a 100%)';
  const hoverGradient = 'linear-gradient(180deg, #fca15a 0%, #fb8c2a 50%, #d65d05 100%)';
  return (
    <button
      onClick={disabled || loading ? undefined : onClick}
      className="nostroke ml-cta"
      style={{
        width: full ? '100%' : 'auto',
        height: h,
        padding: full ? 0 : '0 22px',
        borderRadius: 14,
        background: disabled ? '#e2e8f0' : baseGradient,
        color: disabled ? '#94a3b8' : 'white',
        fontWeight: 700,
        fontSize: size === 'lg' ? 16 : 15,
        letterSpacing: '-0.01em',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: disabled
          ? 'none'
          : '0 14px 32px -10px rgba(249,115,22,0.55), 0 4px 12px -2px rgba(249,115,22,0.18), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(180,60,0,0.18)',
        transition: 'transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 200ms ease, background 200ms ease',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        border: 'none',
      }}
      onMouseEnter={e => {
        if (disabled || loading) return;
        e.currentTarget.style.background = hoverGradient;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        if (disabled || loading) return;
        e.currentTarget.style.background = baseGradient;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {loading ? <Spinner /> : (
        <>
          <span>{children}</span>
          {icon && <Icon name={icon} size={17} stroke={2.4} />}
        </>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Port `SecondaryButton.jsx`**

Source: design `ui.jsx` lines 137–151.

```jsx
// client/src/pages/getQuoteV6/components/SecondaryButton.jsx
export default function SecondaryButton({ children, onClick, full = true }) {
  return (
    <button
      onClick={onClick}
      className="nostroke"
      style={{
        height: 52, width: full ? '100%' : 'auto',
        padding: full ? 0 : '0 22px',
        borderRadius: 14, background: 'transparent',
        color: 'var(--ink)', fontWeight: 600, fontSize: 15,
        border: '1.5px solid var(--line-strong)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Build & commit**

```
cd /Users/amin/Downloads/MoveLeads/client && npm run build
git add client/src/pages/getQuoteV6/components/
git commit -m "ui(get-quote-v6): port PrimaryButton, SecondaryButton, Spinner"
```

---

### Task 7: Port input + card primitives

**Files:**
- Create: `client/src/pages/getQuoteV6/components/FieldInput.jsx`
- Create: `client/src/pages/getQuoteV6/components/FieldError.jsx`
- Create: `client/src/pages/getQuoteV6/components/ChoiceCard.jsx`
- Create: `client/src/pages/getQuoteV6/components/TileCard.jsx`
- Create: `client/src/pages/getQuoteV6/components/PivotCard.jsx`

- [ ] **Step 1: Port `FieldInput.jsx`**

Source: design `ui.jsx` lines 162–211. Add a `ref` forwarded prop so callers can focus programmatically (V6 currently uses a ref on the dest ZIP input).

```jsx
// client/src/pages/getQuoteV6/components/FieldInput.jsx
import { forwardRef } from 'react';
import Icon from './Icon';

const FieldInput = forwardRef(function FieldInput(
  { icon, label, value, onChange, placeholder, type = 'text', uppercase = false, maxLength, suffix, autoFocus, inputMode, autoComplete, ariaInvalid },
  ref
) {
  return (
    <label style={{ display: 'block', width: '100%' }}>
      {label && (
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--ink-2)',
          marginBottom: 8, letterSpacing: '-0.005em',
          height: 16, lineHeight: '16px',
        }}>{label}</div>
      )}
      <div className="focusring" style={{
        height: 54, width: '100%',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px',
        background: 'var(--surface)',
        border: '1.5px solid var(--line-strong)',
        borderRadius: 'var(--r-input)',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        boxSizing: 'border-box',
      }}>
        {icon && <Icon name={icon} size={18} color="var(--ink-3)" />}
        <input
          ref={ref}
          type={type}
          value={value || ''}
          onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus={autoFocus}
          inputMode={inputMode}
          autoComplete={autoComplete}
          aria-invalid={ariaInvalid}
          style={{
            flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
            padding: 0,
            fontSize: 16, fontWeight: 500, color: 'var(--ink)',
            letterSpacing: uppercase ? '0.02em' : '-0.005em',
            fontFamily: 'inherit',
          }}
        />
        {suffix && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{suffix}</span>}
        {value && value.length > 0 && !suffix && (
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'var(--good-soft)', color: 'var(--good)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="check" size={13} stroke={2.8} />
          </div>
        )}
      </div>
    </label>
  );
});

export default FieldInput;
```

- [ ] **Step 2: Port `FieldError.jsx`**

Source: design `screens.jsx` lines 983–991.

```jsx
// client/src/pages/getQuoteV6/components/FieldError.jsx
export default function FieldError({ children }) {
  return (
    <div style={{
      fontSize: 12.5, color: 'var(--danger)',
      display: 'inline-flex', alignItems: 'center', gap: 6,
      marginTop: -4, marginLeft: 4,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--danger)' }} />
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Port `ChoiceCard.jsx`**

Source: design `ui.jsx` lines 235–283.

```jsx
// client/src/pages/getQuoteV6/components/ChoiceCard.jsx
import Icon from './Icon';

export default function ChoiceCard({ icon, title, sub, selected, onClick, illustration, compact = false }) {
  return (
    <button
      onClick={onClick}
      className="nostroke"
      style={{
        width: '100%', textAlign: 'left',
        padding: compact ? 14 : 16,
        borderRadius: 'var(--r-card)',
        background: 'var(--surface)',
        border: '1.5px solid',
        borderColor: selected ? 'var(--accent)' : 'var(--line)',
        boxShadow: selected ? '0 0 0 4px var(--accent-soft), var(--shadow-sm)' : 'var(--shadow-sm)',
        display: 'flex', alignItems: 'center', gap: 14,
        transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 120ms ease',
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      {illustration || (
        <div style={{
          width: compact ? 42 : 46, height: compact ? 42 : 46, flexShrink: 0,
          borderRadius: 12,
          background: selected ? 'var(--accent-soft)' : 'var(--canvas)',
          color: selected ? 'var(--accent)' : 'var(--ink-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 160ms ease, color 160ms ease',
        }}>
          <Icon name={icon} size={compact ? 19 : 21} stroke={1.7} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: compact ? 14.5 : 15.5,
          fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.012em',
        }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        border: '1.5px solid',
        borderColor: selected ? 'var(--accent)' : 'var(--line-strong)',
        background: selected ? 'var(--accent)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', flexShrink: 0,
        transition: 'all 160ms ease',
      }}>
        {selected && <Icon name="check" size={13} stroke={3} />}
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Port `TileCard.jsx`**

Source: design `ui.jsx` lines 286–314.

```jsx
// client/src/pages/getQuoteV6/components/TileCard.jsx
import Icon from './Icon';

export default function TileCard({ icon, title, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="nostroke"
      style={{
        padding: '14px 12px',
        borderRadius: 14,
        background: 'var(--surface)',
        border: '1.5px solid',
        borderColor: selected ? 'var(--accent)' : 'var(--line)',
        boxShadow: selected ? '0 0 0 3px var(--accent-soft)' : 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        transition: 'all 160ms ease',
        minHeight: 88,
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: selected ? 'var(--accent-soft)' : 'var(--canvas)',
        color: selected ? 'var(--accent)' : 'var(--ink-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={18} />
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.005em', textAlign: 'center', lineHeight: 1.25 }}>
        {title}
      </div>
    </button>
  );
}
```

- [ ] **Step 5: Port `PivotCard.jsx`**

Source: design `ui.jsx` lines 317–352.

```jsx
// client/src/pages/getQuoteV6/components/PivotCard.jsx
import Icon from './Icon';

export default function PivotCard({ label, sub, icon, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="nostroke"
      style={{
        flex: 1, minHeight: 130,
        padding: 18,
        borderRadius: 'var(--r-card)',
        background: selected ? 'var(--accent)' : 'var(--surface)',
        color: selected ? 'white' : 'var(--ink)',
        border: '1.5px solid',
        borderColor: selected ? 'var(--accent)' : 'var(--line-strong)',
        boxShadow: selected ? '0 12px 30px -10px rgba(249,115,22,0.35)' : 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        gap: 10, textAlign: 'left',
        transition: 'all 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: selected ? 'rgba(255,255,255,0.16)' : 'var(--accent-soft)',
        color: selected ? 'white' : 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={18} />
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{label}</div>
        <div style={{
          fontSize: 13, marginTop: 4,
          color: selected ? 'rgba(255,255,255,0.78)' : 'var(--ink-3)',
          lineHeight: 1.4,
        }}>{sub}</div>
      </div>
    </button>
  );
}
```

- [ ] **Step 6: Build & commit**

```
cd /Users/amin/Downloads/MoveLeads/client && npm run build
git add client/src/pages/getQuoteV6/components/
git commit -m "ui(get-quote-v6): port FieldInput, FieldError, ChoiceCard, TileCard, PivotCard"
```

---

### Task 8: Port scaffolding components

**Files:**
- Create: `client/src/pages/getQuoteV6/components/ScreenWrap.jsx`
- Create: `client/src/pages/getQuoteV6/components/Question.jsx`
- Create: `client/src/pages/getQuoteV6/components/Eyebrow.jsx`
- Create: `client/src/pages/getQuoteV6/components/TrustStrip.jsx`
- Create: `client/src/pages/getQuoteV6/components/FunnelHeader.jsx`
- Create: `client/src/pages/getQuoteV6/components/HowCard.jsx`

- [ ] **Step 1: Port each verbatim**

For each component below, copy from the design source file (line numbers given) and convert `window.X = ...` exports to `export default`. Replace any external lookups (`var(--font)`) with `inherit`.

| Component | Source lines |
|---|---|
| `ScreenWrap` | `ui.jsx` 400–404 |
| `Question` | `ui.jsx` 406–429 |
| `Eyebrow` | `ui.jsx` 460–465 |
| `TrustStrip` | `ui.jsx` 432–457 |
| `FunnelHeader` | `ui.jsx` 355–397 |
| `HowCard` | `screens.jsx` 413–444 |

For `FunnelHeader`, the source signature is `({ section, total, label, onBack, onClose, safeTop = 16 })`. Keep this signature — the orchestrator will pass back/close handlers and section info.

For `HowCard`, the source uses `Icon` — import it. Keep the `HOW_IT_WORKS` constant outside the component (will be referenced by `RouteScreen` in Task 9).

- [ ] **Step 2: Build & commit**

```
cd /Users/amin/Downloads/MoveLeads/client && npm run build
git add client/src/pages/getQuoteV6/components/
git commit -m "ui(get-quote-v6): port scaffolding components (ScreenWrap, Question, FunnelHeader, etc.)"
```

---

### Task 9: Port route preview components

**Files:**
- Create: `client/src/pages/getQuoteV6/components/RouteArc.jsx`
- Create: `client/src/pages/getQuoteV6/components/StatCell.jsx`
- Create: `client/src/pages/getQuoteV6/components/CityBlock.jsx`
- Create: `client/src/pages/getQuoteV6/components/ArrowDivider.jsx`

- [ ] **Step 1: Port each**

| Component | Source | Notes |
|---|---|---|
| `CityBlock` | design `route-preview.jsx` 139–155 | Verbatim |
| `ArrowDivider` | design `route-preview.jsx` 157–176 | Verbatim |
| `StatCell` | design `route-preview.jsx` 178–201 | Import `Icon`; keep tooltip-via-title attribute |
| `RouteArc` | design `route-preview.jsx` 212–312 | Verbatim; **uses inline `route.from.lat/.lng` and `route.to.lat/.lng`**. Caller (`RoutePreviewMoment`) must pass a `route` object with `from: {city, st, lat, lng}` and `to: {city, st, lat, lng}` — see Task 10. |

For `RouteArc`, the `<style>{`@keyframes drawArc`...}</style>` block can stay inline (it's idempotent across mounts), OR remove it since `drawArc` is already defined in `styles.css` (Task 2). Prefer removing the inline `<style>` to avoid duplication.

- [ ] **Step 2: Build & commit**

```
cd /Users/amin/Downloads/MoveLeads/client && npm run build
git add client/src/pages/getQuoteV6/components/
git commit -m "ui(get-quote-v6): port RouteArc, StatCell, CityBlock, ArrowDivider"
```

---

### Task 10: Port `RoutePreviewMoment` screen (with V6 state-shape rewire)

**Files:**
- Create: `client/src/pages/getQuoteV6/screens/RoutePreviewMoment.jsx`

**Critical decoder:** the design's screen reads `state.fromZip/toZip` and calls `getRoute()` which uses a hardcoded ZIP table. **In V6 we already have authoritative city/state from zippopotam.us** — we must build the `route` object from `answers.originCity/originState/destinationCity/destinationState` instead.

For lat/lng (needed by `RouteArc` to render the map dots), we have two options:
1. Look up via the [`zipcodes` npm package](https://www.npmjs.com/package/zipcodes) (already in `client/package.json` dependencies).
2. Hardcode a small fallback table for top US cities and use center-of-bbox as fallback.

**Use option 1** — the package is already a dependency.

- [ ] **Step 1: Write the screen**

```jsx
// client/src/pages/getQuoteV6/screens/RoutePreviewMoment.jsx
import { useEffect, useState } from 'react';
import zipcodes from 'zipcodes';
import Logo from '../components/Logo';
import Eyebrow from '../components/Eyebrow';
import CityBlock from '../components/CityBlock';
import ArrowDivider from '../components/ArrowDivider';
import StatCell from '../components/StatCell';
import RouteArc from '../components/RouteArc';
import PrimaryButton from '../components/PrimaryButton';
import TrustStrip from '../components/TrustStrip';
import Icon from '../components/Icon';
import { transitDaysLabel, cardinal, milesBetween } from '../route';

// Build a route object the design's RouteArc expects from V6 answers shape.
// Reads city/state from answers (populated via zippopotam.us in HeroLanding)
// and resolves lat/lng via the `zipcodes` npm package.
function routeFromAnswers(answers) {
  const fromLatLng = zipcodes.lookup(answers.pickupZip) || {};
  const toLatLng = zipcodes.lookup(answers.destinationZip) || {};
  const from = {
    city: answers.originCity || fromLatLng.city || '—',
    st: answers.originState || fromLatLng.state || '',
    lat: fromLatLng.latitude ?? null,
    lng: fromLatLng.longitude ?? null,
  };
  const to = {
    city: answers.destinationCity || toLatLng.city || '—',
    st: answers.destinationState || toLatLng.state || '',
    lat: toLatLng.latitude ?? null,
    lng: toLatLng.longitude ?? null,
  };
  const miles = answers.miles || milesBetween(from, to);
  return { from, to, miles };
}

export default function RoutePreviewMoment({ answers, patch, onContinue, desktop = false }) {
  const route = routeFromAnswers(answers);

  // Persist miles back into answers so submit() carries it through.
  useEffect(() => {
    if (route.miles && route.miles !== answers.miles) {
      patch({ miles: route.miles });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [animMiles, setAnimMiles] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const dur = 1100;
    const target = route.miles;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimMiles(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route.miles]);

  const distanceLabel = animMiles.toLocaleString();
  const days = transitDaysLabel(route.miles);

  return (
    <div className="screen-enter" style={{
      padding: desktop ? 0 : '56px 22px 32px',
      display: 'flex', flexDirection: 'column',
      gap: desktop ? 28 : 32,
      minHeight: desktop ? 'auto' : '100%',
    }}>
      {!desktop && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo size={22} />
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--ink-3)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>Route confirmed</div>
        </div>
      )}

      <RouteArc route={route} desktop={desktop} />

      <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Eyebrow>Your move</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <CityBlock city={route.from.city} st={route.from.st} role="From" desktop={desktop} />
            <ArrowDivider desktop={desktop} />
            <CityBlock city={route.to.city} st={route.to.st} role="To" desktop={desktop} />
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: desktop ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
          gap: 0,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-card)',
          overflow: 'hidden',
        }}>
          <StatCell label="Distance" value={distanceLabel} suffix="miles" />
          <StatCell label="Est. transit" value={days} suffix={days === '1' ? 'day' : 'days'} border={!desktop} title="Estimate based on typical long-haul transit. Your mover will confirm the final timeline." />
          {desktop && <StatCell label="Direction" value={cardinal(route)} />}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PrimaryButton onClick={onContinue}>Continue — tell us about the move</PrimaryButton>
        <TrustStrip />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build & commit**

```
cd /Users/amin/Downloads/MoveLeads/client && npm run build
git add client/src/pages/getQuoteV6/screens/RoutePreviewMoment.jsx
git commit -m "feat(get-quote-v6): port RoutePreviewMoment with V6 answers-shape rewire"
```

---

### Task 11: Port mid-funnel screens (Timing/Date/Bucket/HomeType/HomeSize/Stairs/Heavy)

**Files:**
- Create: `client/src/pages/getQuoteV6/screens/TimingPivotScreen.jsx`
- Create: `client/src/pages/getQuoteV6/screens/DatePickerScreen.jsx`
- Create: `client/src/pages/getQuoteV6/screens/BucketSelectScreen.jsx`
- Create: `client/src/pages/getQuoteV6/screens/HomeTypeScreen.jsx`
- Create: `client/src/pages/getQuoteV6/screens/HomeSizeScreen.jsx`
- Create: `client/src/pages/getQuoteV6/screens/StairsScreen.jsx`
- Create: `client/src/pages/getQuoteV6/screens/HeavyPivotScreen.jsx`
- Create: `client/src/pages/getQuoteV6/screens/HeavySelectScreen.jsx`

**Critical rewire — each screen receives `{ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }` instead of design's `state, setState`.**

- [ ] **Step 1: `TimingPivotScreen.jsx`**

Source: design `screens.jsx` 450–485. Adapt:
- `pick(val)` → `patch({ knowsDate: val }); if (val) patch({ urgencyBucket: '' }); else patch({ moveDate: '' }); setTimeout(onContinue, 240);`
- Read `answers.knowsDate` instead of `state.knowsDate`.

```jsx
// client/src/pages/getQuoteV6/screens/TimingPivotScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import PivotCard from '../components/PivotCard';

export default function TimingPivotScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const pick = (val) => {
    if (val) patch({ knowsDate: true, urgencyBucket: '' });
    else     patch({ knowsDate: false, moveDate: '' });
    setTimeout(onContinue, 240);
  };
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Timing" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 1 · Timing' : 'Timing'}
          title="Do you know your move date yet?"
          sub="Either is fine — both options take 30 seconds."
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{ display: 'flex', flexDirection: desktop ? 'row' : 'column', gap: 12 }}>
          <PivotCard icon="cal" label="Yes, I have a date" sub="Pick the day from a calendar." selected={answers.knowsDate === true} onClick={() => pick(true)} />
          <PivotCard icon="clock" label="Not sure yet" sub="Choose a rough window instead." selected={answers.knowsDate === false} onClick={() => pick(false)} />
        </div>
      </ScreenWrap>
    </>
  );
}
```

- [ ] **Step 2: `DatePickerScreen.jsx`**

**DECISION:** Keep native `<input type="date">` (per user 2026-05-22 #2). Wrap it in design chrome.

```jsx
// client/src/pages/getQuoteV6/screens/DatePickerScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import PrimaryButton from '../components/PrimaryButton';

// Tomorrow as YYYY-MM-DD for the min attribute.
function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function fmt(iso) {
  if (!iso) return '';
  try { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

export default function DatePickerScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const value = answers.moveDate && answers.moveDate.length === 10 ? answers.moveDate : '';
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Move date" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 1 · Timing' : 'Move date'}
          title="When are you planning to move?"
          sub="Pick the closest day to your move — you can adjust later."
          size={desktop ? 'lg' : 'md'}
        />
        <div style={{
          padding: 16, borderRadius: 'var(--r-card)',
          background: 'var(--surface)', border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <input
            type="date"
            value={value}
            min={tomorrowISO()}
            onChange={e => patch({ moveDate: e.target.value, urgencyBucket: '' })}
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: 17,
              fontFamily: 'inherit',
              fontWeight: 500,
              color: 'var(--ink)',
              border: '1.5px solid var(--line-strong)',
              borderRadius: 'var(--r-input)',
              background: 'var(--surface)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <PrimaryButton onClick={onContinue} disabled={!value}>
          {value ? `Continue · ${fmt(value)}` : 'Continue'}
        </PrimaryButton>
      </ScreenWrap>
    </>
  );
}
```

- [ ] **Step 3: `BucketSelectScreen.jsx`**

**DECISION:** 4 options (per user 2026-05-22 #3). Use `BUCKET_OPTIONS` from `enums.js`.

```jsx
// client/src/pages/getQuoteV6/screens/BucketSelectScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import ChoiceCard from '../components/ChoiceCard';
import { BUCKET_OPTIONS } from '../enums';

const ICON_FOR_BUCKET = { asap: 'sparkle', this_week: 'cal', this_month: 'cal', flexible: 'clock' };

export default function BucketSelectScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const pick = (id) => {
    patch({ urgencyBucket: id, moveDate: '' });
    setTimeout(onContinue, 220);
  };
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Move window" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 1 · Timing' : 'Move window'}
          title="Roughly when are you moving?"
          sub="Pick the closest window."
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {BUCKET_OPTIONS.map(b => (
            <ChoiceCard key={b.id} icon={ICON_FOR_BUCKET[b.id]} title={b.title} sub={b.sub} selected={answers.urgencyBucket === b.id} onClick={() => pick(b.id)} />
          ))}
        </div>
      </ScreenWrap>
    </>
  );
}
```

- [ ] **Step 4: `HomeTypeScreen.jsx`**

Source: design `screens.jsx` 623–678. Read `answers.homeType`, write via `patch({ homeType: id })` (ids are already backend-valid).

```jsx
// client/src/pages/getQuoteV6/screens/HomeTypeScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import Icon from '../components/Icon';
import { HOME_TYPES } from '../enums';

export default function HomeTypeScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const pick = (id) => {
    // Reset homeSize when type changes (different size taxonomy per type).
    patch({ homeType: id, homeSize: '' });
    setTimeout(onContinue, 220);
  };
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Home type" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 2 · Property' : 'Home type'}
          title="What kind of place are you moving from?"
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{
          display: 'grid',
          gridTemplateColumns: desktop ? 'repeat(3, 1fr)' : '1fr 1fr',
          gap: 10,
        }}>
          {HOME_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className="nostroke"
              style={{
                padding: '18px 14px',
                borderRadius: 'var(--r-card)',
                background: 'var(--surface)',
                border: '1.5px solid',
                borderColor: answers.homeType === t.id ? 'var(--accent)' : 'var(--line)',
                boxShadow: answers.homeType === t.id ? '0 0 0 3px var(--accent-soft)' : 'var(--shadow-sm)',
                display: 'flex', flexDirection: 'column', gap: 12,
                textAlign: 'left',
                minHeight: 110,
                transition: 'all 160ms ease',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 11,
                background: answers.homeType === t.id ? 'var(--accent-soft)' : 'var(--canvas)',
                color: answers.homeType === t.id ? 'var(--accent)' : 'var(--ink-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={t.icon} size={20} />
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.012em' }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{t.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </ScreenWrap>
    </>
  );
}
```

- [ ] **Step 5: `HomeSizeScreen.jsx`**

Source: design `screens.jsx` 717–747. **CRITICAL:** when user picks, write `option.backend` (the mapped string) into `answers.homeSize`, NOT the UI id.

```jsx
// client/src/pages/getQuoteV6/screens/HomeSizeScreen.jsx
import { useState } from 'react';
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import ChoiceCard from '../components/ChoiceCard';
import { SIZE_SETS } from '../enums';

export default function HomeSizeScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const sizes = SIZE_SETS[answers.homeType] || SIZE_SETS.apartment;

  // Local UI-id state for selection highlight only — answers.homeSize stores
  // the backend string, which can map from multiple UI ids (e.g. 'storage_s'
  // and 'few_items' both map to 'Studio'), so we cannot reliably reverse-map.
  const [selectedId, setSelectedId] = useState('');

  const pick = (option) => {
    setSelectedId(option.id);
    patch({ homeSize: option.backend });  // Backend-valid string written.
    setTimeout(onContinue, 220);
  };

  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Size" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 2 · Property' : 'Size'}
          title="How big is your place?"
          sub="A rough estimate is fine — movers will confirm during their call."
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sizes.map(s => (
            <ChoiceCard
              key={s.id}
              icon={answers.homeType === 'storage' ? 'warehouse' : answers.homeType === 'house' ? 'house2' : 'home'}
              title={s.title}
              sub={s.sub}
              selected={selectedId === s.id}
              onClick={() => pick(s)}
              compact
            />
          ))}
        </div>
      </ScreenWrap>
    </>
  );
}
```

- [ ] **Step 6: `StairsScreen.jsx`**

Source: design `screens.jsx` 752–785. `STAIRS_OPTIONS` ids are 1:1 with backend.

```jsx
// client/src/pages/getQuoteV6/screens/StairsScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import ChoiceCard from '../components/ChoiceCard';
import { STAIRS_OPTIONS } from '../enums';

export default function StairsScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const pick = (id) => {
    patch({ stairs: id });
    setTimeout(onContinue, 220);
  };
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Access" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 2 · Property' : 'Access'}
          title="How will movers get into your place?"
          sub="Helps your movers prepare for the day."
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STAIRS_OPTIONS.map(o => (
            <ChoiceCard key={o.id} icon={o.icon} title={o.title} sub={o.sub} selected={answers.stairs === o.id} onClick={() => pick(o.id)} />
          ))}
        </div>
      </ScreenWrap>
    </>
  );
}
```

- [ ] **Step 7: `HeavyPivotScreen.jsx`**

Source: design `screens.jsx` 790–825. **State convention:** existing V6 doesn't store a `hasHeavy` flag — it just checks `heavyItems.length`. To preserve that, the Yes branch goes to `HEAVY_SELECT` (which can write items); the No/Skip branch sets `heavyItems: []` and skips to `CONTACT`.

```jsx
// client/src/pages/getQuoteV6/screens/HeavyPivotScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import PivotCard from '../components/PivotCard';

export default function HeavyPivotScreen({ patch, onYes, onSkip, onBack, onClose, section, total, desktop, safeTop }) {
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Heavy items" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 3 · Items' : 'Heavy items'}
          title="Any heavy or specialty items?"
          sub="Pianos, safes, gym equipment — anything that needs extra hands."
          size={desktop ? 'lg' : 'md'}
        />
        <div style={{ display: 'flex', flexDirection: desktop ? 'row' : 'column', gap: 12 }}>
          <PivotCard icon="weight" label="Yes, I do" sub="Tell us what's heavy or specialty." onClick={onYes} />
          <PivotCard icon="check" label="No, standard items" sub="Furniture, boxes, basic stuff." onClick={() => { patch({ heavyItems: [] }); onSkip(); }} />
        </div>
      </ScreenWrap>
    </>
  );
}
```

- [ ] **Step 8: `HeavySelectScreen.jsx`**

Source: design `screens.jsx` 844–880. **CRITICAL:** store `option.title` (human string) in `answers.heavyItems`, NOT the UI id. The selection-highlight state needs to match against the same value we're storing.

```jsx
// client/src/pages/getQuoteV6/screens/HeavySelectScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import TileCard from '../components/TileCard';
import PrimaryButton from '../components/PrimaryButton';
import { HEAVY_ITEMS } from '../enums';

export default function HeavySelectScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  // answers.heavyItems stores the human title strings (what the user sees).
  const selected = new Set(answers.heavyItems || []);
  const toggle = (item) => {
    const next = new Set(selected);
    if (next.has(item.title)) next.delete(item.title);
    else next.add(item.title);
    patch({ heavyItems: Array.from(next) });
  };
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="What's heavy?" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 3 · Items' : "What's heavy?"}
          title="Which items need extra care?"
          sub="Select any that apply — movers will plan accordingly."
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{
          display: 'grid',
          gridTemplateColumns: desktop ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
          gap: 10,
        }}>
          {HEAVY_ITEMS.map(h => (
            <TileCard key={h.id} icon={h.icon} title={h.title} selected={selected.has(h.title)} onClick={() => toggle(h)} />
          ))}
        </div>
        <PrimaryButton onClick={onContinue} disabled={selected.size === 0}>
          {selected.size ? `Continue · ${selected.size} item${selected.size === 1 ? '' : 's'}` : 'Continue'}
        </PrimaryButton>
      </ScreenWrap>
    </>
  );
}
```

- [ ] **Step 9: Build & commit**

```
cd /Users/amin/Downloads/MoveLeads/client && npm run build
git add client/src/pages/getQuoteV6/screens/
git commit -m "feat(get-quote-v6): port mid-funnel screens with V6 state rewire"
```

---

### Task 12: Port `ContactScreen` and `SuccessScreen`

**Files:**
- Create: `client/src/pages/getQuoteV6/screens/ContactScreen.jsx`
- Create: `client/src/pages/getQuoteV6/screens/SuccessScreen.jsx`

- [ ] **Step 1: `ContactScreen.jsx`**

Source: design `screens.jsx` 884–981. Adapt for V6:
- Read `answers.firstName`, `answers.customerPhone`, `answers.customerEmail` (note: real V6 stores `customerPhone` and `customerEmail`, not design's `phone`/`email`).
- Validation matches existing V6: `isValidUSPhone` + non-empty firstName + optional email shape.
- On submit, call orchestrator's `submit()` (which handles network, error states, success transition).
- Error states: read from `submitErr` (existing V6 uses a string), display via design's error banner.

```jsx
// client/src/pages/getQuoteV6/screens/ContactScreen.jsx
import { useState } from 'react';
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import FieldInput from '../components/FieldInput';
import FieldError from '../components/FieldError';
import PrimaryButton from '../components/PrimaryButton';

function isValidUSPhone(raw) {
  if (typeof raw !== 'string') return false;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits.slice(1));
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits);
}
function formatUSPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function ContactScreen({ answers, patch, submit, submitting, submitErr, onBack, onClose, section, total, desktop, safeTop }) {
  const [touched, setTouched] = useState({});
  const firstNameOk = (answers.firstName?.trim().length || 0) >= 2;
  const phoneOk = isValidUSPhone(answers.customerPhone || '');
  const emailOk = !answers.customerEmail || /^\S+@\S+\.\S+$/.test(answers.customerEmail.trim());
  const canSubmit = firstNameOk && phoneOk && emailOk && !submitting;

  const onPrimary = () => {
    setTouched({ firstName: true, phone: true, email: true });
    if (canSubmit) submit();
  };

  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Contact" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 4 · You' : 'Almost done'}
          title="Who should the movers call?"
          sub="Up to 3 vetted movers will reach out directly. Your info is never sold."
          size={desktop ? 'lg' : 'md'}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FieldInput icon="user" label="First name" placeholder="Your name" value={answers.firstName} onChange={v => patch({ firstName: v })} autoComplete="given-name" autoFocus />
          {touched.firstName && !firstNameOk && <FieldError>Please enter your first name.</FieldError>}

          <FieldInput
            icon="phone" label="Mobile number" placeholder="(555) 123-4567"
            value={formatUSPhone(answers.customerPhone)}
            onChange={v => patch({ customerPhone: v.replace(/\D/g, '').slice(0, 10) })}
            type="tel" inputMode="numeric" autoComplete="tel"
          />
          {touched.phone && !phoneOk && <FieldError>Enter a valid US mobile number.</FieldError>}

          <FieldInput icon="mail" label="Email (optional)" placeholder="you@email.com" value={answers.customerEmail} onChange={v => patch({ customerEmail: v })} type="email" autoComplete="email" />
          {touched.email && !emailOk && <FieldError>Enter a valid email or leave blank.</FieldError>}
        </div>

        {submitErr && (
          <div style={{
            padding: 14, borderRadius: 14,
            background: '#fef2f2', border: '1px solid #fecaca',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--danger)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontSize: 13, fontWeight: 700,
            }}>!</div>
            <div style={{ flex: 1, fontSize: 13.5, color: '#7f1d1d', lineHeight: 1.4 }}>
              <div style={{ fontWeight: 600 }}>Couldn't reach our movers.</div>
              <div style={{ marginTop: 2 }}>{submitErr} Your details are saved — tap below to try again.</div>
            </div>
          </div>
        )}

        <PrimaryButton onClick={onPrimary} disabled={submitting} loading={submitting}>
          {submitting ? 'Sending…' : 'See my movers'}
        </PrimaryButton>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.5, padding: '0 8px' }}>
          By continuing, you agree to receive a call or text from up to 3 licensed movers regarding your request. Standard rates apply.
        </div>
      </ScreenWrap>
    </>
  );
}
```

- [ ] **Step 2: `SuccessScreen.jsx`**

Source: design `screens.jsx` 997–1090. Adapt:
- Read V6 field names.
- Build route summary from `answers.originCity/originState/destinationCity/destinationState` instead of design's `getRoute()`.
- Use `homeSizeLabelFromBackend` (passthrough — answers.homeSize already is the display string).
- Restart button calls orchestrator's `restart`.

```jsx
// client/src/pages/getQuoteV6/screens/SuccessScreen.jsx
import Icon from '../components/Icon';
import Eyebrow from '../components/Eyebrow';
import SecondaryButton from '../components/SecondaryButton';
import { homeTypeLabel, stairsLabel, bucketLabel, homeSizeLabelFromBackend } from '../enums';

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

const SumRow = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
    <span style={{ color: 'var(--ink-3)' }}>{label}</span>
    <span style={{ color: 'var(--ink)', fontWeight: 500, textAlign: 'right', maxWidth: '65%' }}>{value || '—'}</span>
  </div>
);

export default function SuccessScreen({ answers, onRestart, desktop }) {
  const fromLabel = answers.originCity ? `${answers.originCity}, ${answers.originState}` : answers.pickupZip;
  const toLabel = answers.destinationCity ? `${answers.destinationCity}, ${answers.destinationState}` : answers.destinationZip;
  const whenLabel = answers.moveDate ? fmtDate(answers.moveDate) : bucketLabel(answers.urgencyBucket);

  return (
    <div className="screen-enter" style={{
      padding: desktop ? '0' : '56px 22px 32px',
      display: 'flex', flexDirection: 'column', gap: 24,
      minHeight: desktop ? 'auto' : '100%',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: desktop ? 6 : 12 }}>
        <div className="pop-in" style={{
          width: 88, height: 88, borderRadius: '50%',
          background: 'var(--accent-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: 'var(--accent)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="check" size={28} stroke={3} />
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          margin: 0, fontSize: desktop ? 30 : 26,
          fontWeight: 700, letterSpacing: '-0.025em',
          color: 'var(--ink)', textWrap: 'balance',
        }}>
          You're all set{answers.firstName ? `, ${answers.firstName.split(' ')[0]}` : ''}.
        </h1>
        <p style={{ margin: '10px auto 0', maxWidth: 380, fontSize: 15, lineHeight: 1.5, color: 'var(--ink-3)', textWrap: 'pretty' }}>
          We've sent your details to up to 3 vetted movers in your area. Expect a call within minutes.
        </p>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-card)', padding: 18,
        boxShadow: 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <Eyebrow>What happens next</Eyebrow>
        {[
          { i: '1', t: 'Up to 3 movers receive your request', s: 'Local, licensed, insured.' },
          { i: '2', t: 'They call you directly', s: `On the number ending ${(answers.customerPhone || '').slice(-4) || '••••'}` },
          { i: '3', t: 'You compare and pick', s: 'Talk to whoever feels right. No pressure.' },
        ].map(s => (
          <div key={s.i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              background: 'var(--accent-soft)', color: 'var(--accent)',
              fontWeight: 700, fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{s.i}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{s.t}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{s.s}</div>
            </div>
          </div>
        ))}
      </div>

      {!desktop && (
        <div style={{
          padding: 16, borderRadius: 'var(--r-card)',
          background: 'var(--canvas-2)', border: '1px solid var(--line-2)',
        }}>
          <Eyebrow>Your submission</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
            <SumRow label="Route" value={`${fromLabel} → ${toLabel}`} />
            <SumRow label="When" value={whenLabel} />
            <SumRow label="From" value={`${homeTypeLabel(answers.homeType)} · ${homeSizeLabelFromBackend(answers.homeSize)}`} />
            <SumRow label="Access" value={stairsLabel(answers.stairs)} />
            {answers.heavyItems?.length > 0 && (
              <SumRow label="Specialty" value={`${answers.heavyItems.length} item${answers.heavyItems.length === 1 ? '' : 's'}`} />
            )}
          </div>
        </div>
      )}

      <SecondaryButton onClick={onRestart}>Submit another move</SecondaryButton>
    </div>
  );
}
```

- [ ] **Step 3: Build & commit**

```
cd /Users/amin/Downloads/MoveLeads/client && npm run build
git add client/src/pages/getQuoteV6/screens/
git commit -m "feat(get-quote-v6): port ContactScreen and SuccessScreen"
```

---

### Task 13: Port `RouteScreen` (hero landing)

**Files:**
- Create: `client/src/pages/getQuoteV6/screens/RouteScreen.jsx`

This is the most visually involved screen. It replaces the existing `HeroLanding` function (currently inlined at `GetQuoteV6.jsx:445-651`). It must:
- Read V6 field names (`pickupZip`, `destinationZip`, `originCity`, `originState`, `destinationCity`, `destinationState`).
- Call the same `enrich()` logic — the orchestrator will pass it in as a prop, OR `RouteScreen` can replicate it internally (cleaner). Replicate internally.
- Use the new hero asset `/hero-family-truck.webp`.
- Render mobile vs desktop variants based on viewport (use a `useMediaQuery` hook OR just receive a `desktop` prop from the shell). **Use a media-query hook** — the route step doesn't go through `DesktopShell` (per design `layouts.jsx:32-50`), so it needs to self-determine.

- [ ] **Step 1: Add a tiny media-query hook**

Create `client/src/pages/getQuoteV6/useMedia.js`:

```js
// client/src/pages/getQuoteV6/useMedia.js
import { useEffect, useState } from 'react';

export default function useMedia(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
```

- [ ] **Step 2: Write `RouteScreen.jsx`**

Port from design `screens.jsx:20-408`. The `RouteScreen` component picks mobile vs desktop based on viewport. The enrichment logic is replicated (it's small) and writes into V6 field names. The hero image path is `/hero-family-truck.webp`.

The full code is substantial (~280 lines). Write it as a single component file that:
- Maintains local UI state: `pickupErr`, `destErr`, `enriching`, `enrichmentFailed`, `sameZip` (derived)
- Calls `fetch('https://api.zippopotam.us/us/' + zip)` matching existing logic at `GetQuoteV6.jsx:454-481` exactly
- On `enrich` success, `patch({ originCity, originState })` or `patch({ destinationCity, destinationState })` — using V6 field names
- On `enrich` failure, sets `enrichmentFailed` true but does not block continue
- `canContinue` = both ZIPs valid AND not same AND not enriching
- Renders `RouteScreenMobile` or `RouteScreenDesktop` based on `useMedia('(min-width: 1100px)')`

Both inner layouts come from design `screens.jsx` lines 27–155 (mobile) and 157–408 (desktop), with:
- `state.fromZip` → `answers.pickupZip`
- `state.toZip` → `answers.destinationZip`
- `setState({ fromZip })` → `handlePickup` (which calls `patch` + enrich)
- `HERO_IMAGE = 'assets/family-truck.png'` → `HERO_IMAGE = '/hero-family-truck.webp'`
- Inline error/banner UI for `enrichmentFailed` and same-ZIP guard (text copy from existing `GetQuoteV6.jsx:579-588`)

**Action:** Copy the full mobile + desktop layouts from design `screens.jsx`, do the find-replace above, splice in the enrich logic from existing `GetQuoteV6.jsx`. End result is one file containing `RouteScreen` + two inner layout components.

- [ ] **Step 3: Build & commit**

```
cd /Users/amin/Downloads/MoveLeads/client && npm run build
git add client/src/pages/getQuoteV6/screens/RouteScreen.jsx client/src/pages/getQuoteV6/useMedia.js
git commit -m "feat(get-quote-v6): port hero RouteScreen with V6 enrich logic and new hero asset"
```

---

### Task 14: Port shells

**Files:**
- Create: `client/src/pages/getQuoteV6/shells/MobileShell.jsx`
- Create: `client/src/pages/getQuoteV6/shells/DesktopShell.jsx`

- [ ] **Step 1: `MobileShell.jsx`**

In production, mobile shell is just `{children}` wrapping div. The iOS frame from design is review-only and stripped (per CHANGES.md #15).

```jsx
// client/src/pages/getQuoteV6/shells/MobileShell.jsx
export default function MobileShell({ children }) {
  return (
    <div style={{ width: '100%', minHeight: '100vh', background: 'var(--canvas)' }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: `DesktopShell.jsx`**

Source: design `layouts.jsx:31-321`. Strip the `ChromeWindow` browser frame (review-only). Keep:
- Two-column grid (420px left rail + 1fr right)
- `DesktopHero` (shown on `route` + `preview` steps)
- `DesktopRouteContext` (shown on funnel steps with `submitted` flag for success)
- `DesktopTopBar` (4-section progress for funnel steps)
- Bottom trust block

Adapt:
- `stepToSection` matches existing V6 grouping (timing/property/items/you).
- `state.X` reads → `answers.X` reads.
- `whenLabel(state)` → use `bucketLabel(answers.urgencyBucket)` or `fmtDate(answers.moveDate)`.
- Routes are derived from `answers.originCity/originState/destinationCity/destinationState` instead of `getRoute(state)`.

Provide the rewired version in full. Skip CityBlock/route-arc usage in the rail — just use the typographic cities + miles divider per design lines 229–245.

The shell exposes `<DesktopShell step={node} answers={answers}>{children}</DesktopShell>`.

```jsx
// client/src/pages/getQuoteV6/shells/DesktopShell.jsx
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { homeTypeLabel, stairsLabel, bucketLabel, homeSizeLabelFromBackend } from '../enums';
import { milesBetween } from '../route';
import zipcodes from 'zipcodes';

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function whenLabel(answers) {
  if (answers.moveDate) return fmtDate(answers.moveDate);
  if (answers.urgencyBucket) return bucketLabel(answers.urgencyBucket);
  return '—';
}

function deriveMiles(answers) {
  if (answers.miles) return answers.miles;
  const a = zipcodes.lookup(answers.pickupZip);
  const b = zipcodes.lookup(answers.destinationZip);
  if (!a || !b) return 0;
  return milesBetween({ lat: a.latitude, lng: a.longitude }, { lat: b.latitude, lng: b.longitude });
}

const SECTIONS = [
  { id: 1, label: 'Timing' },
  { id: 2, label: 'Property' },
  { id: 3, label: 'Items' },
  { id: 4, label: 'You' },
];

function stepToSection(step) {
  if (['timing_pivot', 'date_picker', 'bucket_select'].includes(step)) return { section: 1, total: 4 };
  if (['home_type', 'home_size', 'stairs'].includes(step))              return { section: 2, total: 4 };
  if (['heavy_pivot', 'heavy_select'].includes(step))                   return { section: 3, total: 4 };
  if (step === 'contact')                                               return { section: 4, total: 4 };
  return null;
}

function DesktopHero() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 16 }}>
      <h2 style={{
        margin: 0, fontSize: 36, fontWeight: 700,
        letterSpacing: '-0.028em', lineHeight: 1.1,
        color: 'white', textWrap: 'balance',
      }}>
        Get matched with licensed movers in your area.
      </h2>
      <p style={{
        margin: 0, fontSize: 15, lineHeight: 1.55,
        color: 'rgba(255,255,255,0.72)', textWrap: 'pretty', maxWidth: 320,
      }}>
        Tell us about your move once. Up to 3 vetted movers will reach out directly — calm, no spam, no obligation.
      </p>
      <div style={{
        marginTop: 6, padding: '14px 16px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {['Licensed & insured movers only', 'Your info is never sold', 'Calls come from real local crews'].map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'white' }}>
            <div style={{
              width: 18, height: 18, borderRadius: 5,
              background: 'var(--accent)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon name="check" size={11} stroke={3} />
            </div>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
      <span style={{ color: 'white', fontWeight: 500, textAlign: 'right', maxWidth: '65%' }}>{value || '—'}</span>
    </div>
  );
}

function DesktopRouteContext({ answers, submitted = false }) {
  const fromCity = answers.originCity || answers.pickupZip || '—';
  const fromSt   = answers.originState || '';
  const toCity   = answers.destinationCity || answers.destinationZip || '—';
  const toSt     = answers.destinationState || '';
  const miles    = deriveMiles(answers);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 6,
      opacity: submitted ? 0.7 : 1,
      transition: 'opacity 360ms cubic-bezier(0.2, 0.8, 0.2, 1)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#fb923c',
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}>
        Your move
        {submitted && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 7px', borderRadius: 999,
            background: 'rgba(34,197,94,0.18)', color: '#86efac',
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
          }}>
            <Icon name="check" size={10} stroke={3} /> Submitted
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.022em', lineHeight: 1.15, color: 'white' }}>
          {fromCity}{fromSt && <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>, {fromSt}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fb923c', fontSize: 12, fontWeight: 500 }}>
          <span style={{ width: 12, height: 1, background: '#fb923c', display: 'inline-block' }} />
          {miles ? `${miles.toLocaleString()} miles` : ''}
          <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.022em', lineHeight: 1.15, color: 'white' }}>
          {toCity}{toSt && <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>, {toSt}</span>}
        </div>
      </div>

      <div style={{
        padding: '14px 16px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <SummaryItem label="When" value={whenLabel(answers)} />
        {answers.homeType && <SummaryItem label="From" value={`${homeTypeLabel(answers.homeType)}${answers.homeSize ? ' · ' + homeSizeLabelFromBackend(answers.homeSize) : ''}`} />}
        {answers.stairs && <SummaryItem label="Access" value={stairsLabel(answers.stairs)} />}
        {answers.heavyItems?.length > 0 && (
          <SummaryItem label="Specialty" value={`${answers.heavyItems.length} item${answers.heavyItems.length === 1 ? '' : 's'}`} />
        )}
      </div>
    </div>
  );
}

function DesktopTopBar({ step }) {
  const map = stepToSection(step);
  if (!map) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {SECTIONS.map((s, i) => {
        const done = s.id < map.section;
        const active = s.id === map.section;
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: i < SECTIONS.length - 1 ? 1 : 'unset' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 7,
                background: active ? 'var(--accent)' : done ? 'var(--good-soft)' : 'var(--canvas-2)',
                color: active ? 'white' : done ? 'var(--good)' : 'var(--ink-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                transition: 'all 200ms ease',
              }}>
                {done ? <Icon name="check" size={11} stroke={3} /> : s.id}
              </div>
              <span style={{
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--ink)' : done ? 'var(--ink-2)' : 'var(--ink-3)',
                letterSpacing: '-0.005em',
              }}>{s.label}</span>
            </div>
            {i < SECTIONS.length - 1 && (
              <div style={{ flex: 1, height: 1.5, background: done ? 'var(--good)' : 'var(--line)', borderRadius: 999, opacity: done ? 0.4 : 1 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function DesktopShell({ step, answers, children }) {
  const showRoutePersistent = !['route', 'preview'].includes(step);
  const submitted = step === 'success';

  // The route step renders its own full-bleed hero — bypass the two-column shell.
  if (step === 'route') return children;

  return (
    <div style={{
      background: 'var(--canvas)',
      minHeight: 760,
      display: 'grid',
      gridTemplateColumns: '420px 1fr',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, var(--primary-darker) 0%, var(--primary) 100%)',
        color: 'white',
        padding: '32px 36px 36px',
        display: 'flex', flexDirection: 'column', gap: 32,
        position: 'relative', overflow: 'hidden',
      }}>
        <svg viewBox="0 0 400 600" style={{
          position: 'absolute', right: -120, bottom: -80,
          width: 460, height: 600, opacity: 0.5, pointerEvents: 'none',
        }}>
          <defs>
            <radialGradient id="leftGlow" cx="50%" cy="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="280" cy="380" r="240" fill="url(#leftGlow)" />
          <path d="M 30 540 Q 120 280, 280 320 T 480 200"
            stroke="var(--accent)" strokeWidth="1.2"
            strokeDasharray="3 6" fill="none" opacity="0.5" />
        </svg>

        <Logo size={26} light />

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {showRoutePersistent ? <DesktopRouteContext answers={answers} submitted={submitted} /> : <DesktopHero />}
        </div>

        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', gap: 10,
          paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.12)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
            Trusted by movers nationwide
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
            {[
              { i: 'lock',   t: 'Secure submission · TLS encrypted' },
              { i: 'shield', t: 'Licensed & insured movers only' },
              { i: 'check',  t: 'No obligation, no spam' },
            ].map(it => (
              <div key={it.t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name={it.i} size={14} color="#fdba74" stroke={2} />
                {it.t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        padding: '56px 64px 56px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        background: 'var(--canvas)',
      }}>
        <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {step !== 'route' && step !== 'preview' && step !== 'success' && <DesktopTopBar step={step} />}
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build & commit**

```
cd /Users/amin/Downloads/MoveLeads/client && npm run build
git add client/src/pages/getQuoteV6/shells/
git commit -m "feat(get-quote-v6): port MobileShell and DesktopShell (two-column ≥1100px)"
```

---

### Task 15: Wire `GetQuoteV6.jsx` orchestrator

**Files:**
- Modify: `client/src/pages/GetQuoteV6.jsx`

This is the integration moment. Replace the inlined components with imports while keeping every line of state/persist/submit/restart logic exactly as it is.

- [ ] **Step 1: Read existing file once more for context**

Run: `cd /Users/amin/Downloads/MoveLeads && wc -l client/src/pages/GetQuoteV6.jsx`
Expected: ~1471 lines. Confirm before editing.

- [ ] **Step 2: Rewrite `GetQuoteV6.jsx`**

Strategy: keep lines 1–319 (state machine, helpers, submit, restart) verbatim, then replace lines 320+ (HeroLanding through end + all styles) with screen imports and the shell wrapper. The styles are obsolete — they move to the new CSS file (Task 2) and inline `var(--*)` references.

Specifically, the new file is:

```jsx
// client/src/pages/GetQuoteV6.jsx
import { useState, useEffect, useCallback } from 'react';
import './getQuoteV6/styles.css';

// Screens
import RouteScreen from './getQuoteV6/screens/RouteScreen';
import RoutePreviewMoment from './getQuoteV6/screens/RoutePreviewMoment';
import TimingPivotScreen from './getQuoteV6/screens/TimingPivotScreen';
import DatePickerScreen from './getQuoteV6/screens/DatePickerScreen';
import BucketSelectScreen from './getQuoteV6/screens/BucketSelectScreen';
import HomeTypeScreen from './getQuoteV6/screens/HomeTypeScreen';
import HomeSizeScreen from './getQuoteV6/screens/HomeSizeScreen';
import StairsScreen from './getQuoteV6/screens/StairsScreen';
import HeavyPivotScreen from './getQuoteV6/screens/HeavyPivotScreen';
import HeavySelectScreen from './getQuoteV6/screens/HeavySelectScreen';
import ContactScreen from './getQuoteV6/screens/ContactScreen';
import SuccessScreen from './getQuoteV6/screens/SuccessScreen';

// Shells
import MobileShell from './getQuoteV6/shells/MobileShell';
import DesktopShell from './getQuoteV6/shells/DesktopShell';

import useMedia from './getQuoteV6/useMedia';

// ── Constants — unchanged from previous V6 ─────────────────────────────────
const API = import.meta.env.VITE_API_URL || 'https://api.moveleads.cloud';
const STORAGE_KEY = 'moveleads-funnel-v6';

const NODE = {
  ROUTE: 'route',
  PREVIEW: 'preview',
  TIMING_PIVOT: 'timing_pivot',
  DATE_PICKER: 'date_picker',
  BUCKET_SELECT: 'bucket_select',
  HOME_TYPE: 'home_type',
  HOME_SIZE: 'home_size',
  STAIRS: 'stairs',
  HEAVY_PIVOT: 'heavy_pivot',
  HEAVY_SELECT: 'heavy_select',
  CONTACT: 'contact',
  SUCCESS: 'success',
};

const SECTION_OF_NODE = {
  [NODE.ROUTE]: 0,
  [NODE.PREVIEW]: 0,
  [NODE.TIMING_PIVOT]: 0,
  [NODE.DATE_PICKER]: 0,
  [NODE.BUCKET_SELECT]: 0,
  [NODE.HOME_TYPE]: 1,
  [NODE.HOME_SIZE]: 1,
  [NODE.STAIRS]: 1,
  [NODE.HEAVY_PIVOT]: 2,
  [NODE.HEAVY_SELECT]: 2,
  [NODE.CONTACT]: 3,
  [NODE.SUCCESS]: 3,
};

const BUCKET_TO_DAYS = {
  asap: 5,
  this_week: 7,
  this_month: 21,
  flexible: 45,
};

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

function deriveUrgencyBucket(date) {
  if (!date) return undefined;
  const daysAway = Math.round((new Date(date).getTime() - Date.now()) / 86400000);
  if (daysAway <= 7) return 'asap';
  if (daysAway <= 14) return 'this_week';
  if (daysAway <= 30) return 'this_month';
  return 'flexible';
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const EMPTY_ANSWERS = {
  pickupZip: '',
  destinationZip: '',
  originCity: '',
  originState: '',
  destinationCity: '',
  destinationState: '',
  miles: 0,
  moveDate: '',
  urgencyBucket: '',
  knowsDate: null,
  homeType: '',
  homeSize: '',
  stairs: '',
  heavyItems: [],
  firstName: '',
  lastName: '',
  customerPhone: '',
  customerEmail: '',
  intentConfirmed: false,
  clientSubmissionId: '',
};

// ── Component ──────────────────────────────────────────────────────────────
export default function GetQuoteV6() {
  const [node, setNode] = useState(NODE.ROUTE);
  const [answers, setAnswers] = useState(EMPTY_ANSWERS);
  const [history, setHistory] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const desktop = useMedia('(min-width: 1100px)');

  // Resume from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.funnelVersion === 'v6' && saved.node && saved.answers) {
        if (saved.node !== NODE.SUCCESS) {
          setNode(saved.node);
          setAnswers({ ...EMPTY_ANSWERS, ...saved.answers });
          setHistory(Array.isArray(saved.history) ? saved.history : []);
        }
      }
    } catch (_e) { /* corrupt — start fresh */ }
  }, []);

  // Persist on every state change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        funnelVersion: 'v6',
        node, answers, history,
        savedAt: Date.now(),
      }));
    } catch (_e) { /* quota — non-fatal */ }
  }, [node, answers, history]);

  const goto = useCallback((nextNode) => {
    setHistory(h => [...h, node]);
    setNode(nextNode);
    setSubmitErr('');
  }, [node]);

  const goBack = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setNode(prev);
      setSubmitErr('');
      return h.slice(0, -1);
    });
  }, []);

  const patch = useCallback((updates) => {
    setAnswers(a => ({ ...a, ...updates }));
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitErr('');
    try {
      let moveDateISO = answers.moveDate;
      let urgencyBucket = answers.urgencyBucket;
      if (!moveDateISO && urgencyBucket) {
        const days = BUCKET_TO_DAYS[urgencyBucket] || 30;
        moveDateISO = daysFromNow(days).toISOString();
      } else if (moveDateISO && !urgencyBucket) {
        urgencyBucket = deriveUrgencyBucket(moveDateISO);
        if (moveDateISO.length === 10) {
          const d = new Date(moveDateISO + 'T12:00:00');
          moveDateISO = d.toISOString();
        }
      } else if (moveDateISO && moveDateISO.length === 10) {
        const d = new Date(moveDateISO + 'T12:00:00');
        moveDateISO = d.toISOString();
      }

      const submissionId = answers.clientSubmissionId || uuid();
      const payload = {
        firstName: answers.firstName.trim(),
        ...(answers.lastName.trim() && { lastName: answers.lastName.trim() }),
        ...(answers.customerEmail.trim() && { customerEmail: answers.customerEmail.trim() }),
        customerPhone: answers.customerPhone.replace(/\D/g, ''),
        pickupZip: answers.pickupZip,
        destinationZip: answers.destinationZip,
        moveDate: moveDateISO,
        urgencyBucket,
        homeSize: answers.homeSize,
        homeType: answers.homeType,
        ...(answers.stairs && { stairs: answers.stairs }),
        moveType: 'residential',
        heavyItems: answers.heavyItems,
        intentConfirmed: true,
        clientSubmissionId: submissionId,
        funnelVersion: 'v6',
        miles: answers.miles || 0,
      };

      const res = await fetch(`${API}/api/leads/ingest-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json.msg || json.message || `Submission failed (${res.status})`);
      }

      patch({ clientSubmissionId: submissionId, intentConfirmed: true });
      setNode(NODE.SUCCESS);
      setHistory([]);
      try { localStorage.removeItem(STORAGE_KEY); } catch (_e) {}
    } catch (err) {
      setSubmitErr(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [answers, patch]);

  const restart = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_e) {}
    setAnswers(EMPTY_ANSWERS);
    setHistory([]);
    setNode(NODE.ROUTE);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  const section = SECTION_OF_NODE[node] ?? 0;
  const safeTop = desktop ? 16 : 56;

  // Common props to every step.
  const common = {
    answers, patch,
    onBack: goBack,
    onClose: restart,
    section: section > 0 ? section : undefined,
    total: 4,
    desktop, safeTop,
  };

  let screen;
  switch (node) {
    case NODE.ROUTE:         screen = <RouteScreen answers={answers} patch={patch} onContinue={() => goto(NODE.PREVIEW)} />; break;
    case NODE.PREVIEW:       screen = <RoutePreviewMoment answers={answers} patch={patch} onContinue={() => goto(NODE.TIMING_PIVOT)} desktop={desktop} />; break;
    case NODE.TIMING_PIVOT:  screen = <TimingPivotScreen {...common} onContinue={() => goto(answers.knowsDate ? NODE.DATE_PICKER : NODE.BUCKET_SELECT)} />; break;
    case NODE.DATE_PICKER:   screen = <DatePickerScreen {...common} onContinue={() => goto(NODE.HOME_TYPE)} />; break;
    case NODE.BUCKET_SELECT: screen = <BucketSelectScreen {...common} onContinue={() => goto(NODE.HOME_TYPE)} />; break;
    case NODE.HOME_TYPE:     screen = <HomeTypeScreen {...common} onContinue={() => goto(NODE.HOME_SIZE)} />; break;
    case NODE.HOME_SIZE:     screen = <HomeSizeScreen {...common} onContinue={() => goto(NODE.STAIRS)} />; break;
    case NODE.STAIRS:        screen = <StairsScreen {...common} onContinue={() => goto(NODE.HEAVY_PIVOT)} />; break;
    case NODE.HEAVY_PIVOT:   screen = <HeavyPivotScreen {...common} onYes={() => goto(NODE.HEAVY_SELECT)} onSkip={() => goto(NODE.CONTACT)} />; break;
    case NODE.HEAVY_SELECT:  screen = <HeavySelectScreen {...common} onContinue={() => goto(NODE.CONTACT)} />; break;
    case NODE.CONTACT:       screen = <ContactScreen {...common} submit={submit} submitting={submitting} submitErr={submitErr} />; break;
    case NODE.SUCCESS:       screen = <SuccessScreen answers={answers} onRestart={restart} desktop={desktop} />; break;
    default:                 screen = null;
  }

  return (
    <div className="glq-v6">
      {desktop ? (
        <DesktopShell step={node} answers={answers}>{screen}</DesktopShell>
      ) : (
        <MobileShell>{screen}</MobileShell>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `cd /Users/amin/Downloads/MoveLeads/client && npm run build`
Expected: passes. If it fails, the error will identify which import is broken — fix and re-run.

- [ ] **Step 4: Lint**

Run: `cd /Users/amin/Downloads/MoveLeads/client && npm run lint`
Expected: passes or matches baseline. Fix any new errors.

- [ ] **Step 5: Commit**

```
git add client/src/pages/GetQuoteV6.jsx
git commit -m "feat(get-quote-v6): wire orchestrator to new design components"
```

---

### Task 16: Payload parity verification

**Files:** none (verification only)

This is the most important verification. The new funnel must produce a payload byte-identical to the old one (modulo new UX paths like the 4-bucket choice).

- [ ] **Step 1: Start dev server**

Run: `cd /Users/amin/Downloads/MoveLeads/client && npm run dev`
Background: yes. The server's URL will appear in stdout (usually `http://localhost:5173`).

- [ ] **Step 2: Capture new payload — calendar branch**

Manual:
1. Open `http://localhost:5173/get-quote-v6` in a browser with DevTools Network tab open.
2. Clear localStorage: in console, `localStorage.removeItem('moveleads-funnel-v6')`.
3. Fill exactly the Task 0 baseline test data:
   - pickupZip=`33101`, destinationZip=`75201`
   - Timing: "Yes I have a date" → pick the same date as baseline (today + 14 days from baseline capture)
   - homeType=Apartment, homeSize=`2-bedroom` (maps to `'2 Bedroom'`), stairs=`2nd floor walk-up`
   - Heavy: "No, standard items"
   - Contact: firstName=`Test`, phone=`5551234567`, email blank
4. Submit. Inspect the request body in Network tab.

- [ ] **Step 3: Diff against baseline**

Compare the new payload to the Task 0 baseline JSON. Diff using `jq`:
```
echo '<baseline payload>' > /tmp/baseline.json
echo '<new payload>' > /tmp/new.json
diff <(jq -S . /tmp/baseline.json) <(jq -S . /tmp/new.json)
```
Expected: NO differences (or only `clientSubmissionId` + `miles` numeric drift if zipcodes lib computes slightly different values than the baseline did).

If any other field differs, STOP and investigate. Common bugs:
- `homeSize` is a UI id like `'2br'` instead of `'2 Bedroom'` → mapping layer bug (Task 11 step 5)
- `heavyItems` contains UI ids like `'piano_upright'` → mapping bug (Task 11 step 8)
- `urgencyBucket` is unexpectedly populated on calendar branch → orchestrator submit logic bug
- Field is missing entirely → state shape rename leaked through

- [ ] **Step 4: Capture new payload — bucket branch**

Repeat with: Timing: "Not sure yet" → "This week" (the new 4th option). Submit. Confirm payload contains `urgencyBucket: 'this_week'` and a derived `moveDate` ~7 days out.

---

### Task 17: Manual verification checklist

**Files:** none (verification only)

- [ ] **Step 1: Run the full 10-point verification list**

Per user 2026-05-22 verification requirements:

1. **Build passes** — `npm run build` ✅ already confirmed in Task 15
2. **Both timing branches work** — calendar branch ✅ Task 16 step 3; bucket branch ✅ Task 16 step 4
3. **Same-ZIP guard works** — enter `33101` for both ZIPs. Continue must be disabled or show "Pickup and drop-off ZIPs can't be the same."
4. **Invalid ZIP guidance works** — enter `12` (under 5 digits). Continue must be disabled. Enter `00000` (zippopotam will 404). Enrichment-failed banner shows; continue still works.
5. **localStorage resume works** — fill half the funnel (say up to home_size), refresh page. Must restore at the same node with same answers.
6. **Payload parity** — done in Task 16.
7. **Submission accepted by `/api/leads/ingest-v2`** — Task 16 step 3 submission succeeded (response 200, success !== false).
8. **Desktop ≥ 1100px looks like design** — open browser at viewport ≥ 1100px; persistent navy left rail with route summary should show on funnel steps. Hero landing should match design's two-column layout.
9. **Mobile/tablet usable under 1100px** — resize browser to 800px (tablet) and 390px (mobile). Both should be single-column, no horizontal scroll, no overlapping content.
10. **Report files changed** — list goes in the final commit message:

```
Files added:
  client/public/hero-family-truck.webp
  client/src/pages/getQuoteV6/styles.css
  client/src/pages/getQuoteV6/enums.js
  client/src/pages/getQuoteV6/route.js
  client/src/pages/getQuoteV6/useMedia.js
  client/src/pages/getQuoteV6/components/Icon.jsx
  client/src/pages/getQuoteV6/components/Logo.jsx
  client/src/pages/getQuoteV6/components/PrimaryButton.jsx
  client/src/pages/getQuoteV6/components/SecondaryButton.jsx
  client/src/pages/getQuoteV6/components/Spinner.jsx
  client/src/pages/getQuoteV6/components/FieldInput.jsx
  client/src/pages/getQuoteV6/components/FieldError.jsx
  client/src/pages/getQuoteV6/components/ChoiceCard.jsx
  client/src/pages/getQuoteV6/components/TileCard.jsx
  client/src/pages/getQuoteV6/components/PivotCard.jsx
  client/src/pages/getQuoteV6/components/FunnelHeader.jsx
  client/src/pages/getQuoteV6/components/ScreenWrap.jsx
  client/src/pages/getQuoteV6/components/Question.jsx
  client/src/pages/getQuoteV6/components/Eyebrow.jsx
  client/src/pages/getQuoteV6/components/TrustStrip.jsx
  client/src/pages/getQuoteV6/components/HowCard.jsx
  client/src/pages/getQuoteV6/components/RouteArc.jsx
  client/src/pages/getQuoteV6/components/StatCell.jsx
  client/src/pages/getQuoteV6/components/CityBlock.jsx
  client/src/pages/getQuoteV6/components/ArrowDivider.jsx
  client/src/pages/getQuoteV6/screens/RouteScreen.jsx
  client/src/pages/getQuoteV6/screens/RoutePreviewMoment.jsx
  client/src/pages/getQuoteV6/screens/TimingPivotScreen.jsx
  client/src/pages/getQuoteV6/screens/DatePickerScreen.jsx
  client/src/pages/getQuoteV6/screens/BucketSelectScreen.jsx
  client/src/pages/getQuoteV6/screens/HomeTypeScreen.jsx
  client/src/pages/getQuoteV6/screens/HomeSizeScreen.jsx
  client/src/pages/getQuoteV6/screens/StairsScreen.jsx
  client/src/pages/getQuoteV6/screens/HeavyPivotScreen.jsx
  client/src/pages/getQuoteV6/screens/HeavySelectScreen.jsx
  client/src/pages/getQuoteV6/screens/ContactScreen.jsx
  client/src/pages/getQuoteV6/screens/SuccessScreen.jsx
  client/src/pages/getQuoteV6/shells/MobileShell.jsx
  client/src/pages/getQuoteV6/shells/DesktopShell.jsx

Files modified:
  client/src/pages/GetQuoteV6.jsx  (heavy edit: shed inlined components + styles, import from new dir)

Files NOT touched (deliberate):
  client/src/App.jsx                                    (route mount unchanged)
  client/index.html                                     (no font additions)
  client/public/hero-moving.webp                        (existing asset preserved)
  server/**                                             (zero changes)
  client/src/pages/GetQuote{,V2,V3,V4,V5}.{jsx,css}     (other funnels untouched)
  all other client files                                (untouched)
```

- [ ] **Step 2: Stop dev server**

Run: kill the background dev server (look up the bash id from the prior background start and `KillShell` it, OR `kill %1` in a fresh shell).

- [ ] **Step 3: Final commit (only if any tweaks were made during verification)**

If verification surfaced any bugs that needed fixing, commit those as a separate `fix(get-quote-v6): ...` commit. Otherwise no commit needed for Task 17.

---

## Verification summary (all checkpoints from user 2026-05-22)

| # | Verification | Where it's checked |
|---|---|---|
| 1 | Build passes | Task 0 step 1 (baseline), Task 15 step 3 (post-rewire), and every intermediate commit |
| 2 | Both timing branches work | Task 16 steps 3 + 4 |
| 3 | Same-ZIP guard works | Task 17 step 1, item 3 |
| 4 | Invalid ZIP guidance works | Task 17 step 1, item 4 |
| 5 | localStorage resume works | Task 17 step 1, item 5 |
| 6 | Payload parity vs old V6 | Task 16 step 3 |
| 7 | Submitted payload accepted by `/api/leads/ingest-v2` | Task 16 step 3 (200 + success !== false confirms) |
| 8 | Desktop ≥1100px looks like design | Task 17 step 1, item 8 |
| 9 | Mobile/tablet usable under 1100px | Task 17 step 1, item 9 |
| 10 | Report which files changed | Task 17 step 1, item 10 (final-commit message) |

---

## Risk recap & mitigation (locked from audit)

| Risk | Mitigation in plan |
|---|---|
| home_size taxonomy mismatch | `enums.js` `SIZE_SETS[type][i].backend` writes the backend-valid string at `patch()` time (Task 3, Task 11 step 5) |
| heavyItems shape mismatch | Store `item.title` (human string) directly in `answers.heavyItems` (Task 11 step 8) |
| DatePicker UX risk | Keep native `<input type="date">` (Task 11 step 2) |
| BucketSelect drift | Adopt 4-option design taxonomy (backend supports all 4) (Task 11 step 3) |
| Hero asset weight | Convert PNG → webp at quality 75 (Task 1) |
| Font shift | Keep current production font; alias `--font-heading`/`--font-body` to current stack (Task 2) |
| Persistent left-rail layout | DesktopShell wraps only ≥1100px viewports (Task 14, Task 15) |
| localStorage cross-pollution | Existing `{ ...EMPTY_ANSWERS, ...saved.answers }` merge drops unknown fields (preserved in Task 15) |
| Inline styles vs CSS file | CSS variables in stylesheet + inline `style={{ color: 'var(--accent)' }}` references (Task 2 + all components) |
| Animations | `screenIn`, `popIn`, `drawArc`, `spin` keyframes in `styles.css` (Task 2) |

---

## What this plan does NOT change

- **Zero server-side edits.** `server/validators/leadIngestV2.js`, all routes, all jobs, all queues.
- **Zero payload schema changes.** Every field name and type remains identical.
- **Zero endpoint changes.** Still posts to `${API}/api/leads/ingest-v2`.
- **Zero `funnelVersion` change.** Still `'v6'`.
- **Zero `STORAGE_KEY` change.** Still `'moveleads-funnel-v6'`.
- **Zero state-machine topology change.** Same 10 nodes, same fork at `timing_pivot`, same convergence at `home_type`.
- **Zero scoring/pricing/router/Stripe/Twilio/refund/marketplace touches.**
- **Zero route mount change.** `/get-quote-v6` still goes through `App.jsx:94`.
- **Zero asset overwrites.** `hero-moving.webp` preserved; new `hero-family-truck.webp` added alongside.
- **No new dependencies.** Reuses `zipcodes` package already in `package.json`.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-22-get-quote-v6-design-integration.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Useful here because Tasks 4–13 are mechanical ports that benefit from isolated context.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach?
