# Phase 1 — Production Verification

**Date:** 2026-05-29
**Verifier:** Claude (no browser, no admin credentials, no production write access)
**Scope:** Verify the C1 / C3 / DRX-1 / DRX-2 fixes are live and the supporting infrastructure is healthy.

## ⚠ Honest scope note

I do NOT have:
- a browser to take screenshots
- admin JWTs to exercise admin-write endpoints
- license to create real test leads in production (would cost Twilio API + pollute pilot analytics)

What I CAN verify (and have):
- API health endpoints from outside production
- Auth gates correctly reject unauthenticated requests
- Code paths exist and pass lock-in tests
- Deploy pipeline shipped each of the four PRs

The visual + behavioral verification below is **a runbook for the operator** with explicit commands, expected results, and pass/fail criteria. Where I have evidence at the code-trace level, I cite it.

## §A — Infrastructure pulse (verified 2026-05-29 18:22 UTC)

| Check | Result |
|---|---|
| `GET https://api.moveleads.cloud/api/health` | **200** — `status:ok`, `database:connected`, `environment:production`, version `import-fix-v4` |
| `GET https://moveleads.cloud/` | **200** — 4.7 KB index, 0.35s |
| `GET https://moveleads.cloud/dashboard/deals` | **200** — SPA served (auth-gating happens client-side) |
| `GET /api/leads/deals` without token | **401** — auth middleware rejects |
| `GET /api/admin/inventory/deal-room/summary` without token | **401** — auth middleware rejects |
| Last 5 deploys | **all completed successfully** (#72 DRX-2 → #71 DRX-1 → #70 C3 → #69 C1 → #68 audit) |
| Full server test suite | **58/58 files pass, 0 failures, 0 hangs** |

## §B — C1 verification (tier_override.set silent state)

### Code-trace evidence (what I verified)

| Invariant | Evidence | Status |
|---|---|---|
| Handler writes `distributionDecision` via ternary | [server/routes/admin.js#L909-L912](../../../server/routes/admin.js#L909-L912) — `lead.distributionDecision = (requestedTier === 'rejected') ? 'admin_rejected' : 'admin_approved'` | ✅ |
| Handler writes `distributionDecisionBy/At/Reason` | [admin.js#L910-L912](../../../server/routes/admin.js#L910-L912) | ✅ |
| Handler calls `dispatchApprovedLead` with source tag | [admin.js#L932-L934](../../../server/routes/admin.js#L932-L934) — `dispatchApprovedLead(lead._id, { source: 'admin.tier_override.set' })` | ✅ |
| Audit row before/after capture `distributionDecision` | [admin.js#L915-L924](../../../server/routes/admin.js#L915-L924) | ✅ |
| 20 lock-in assertions | `dealsTableLayout.test.js` 20/20 pass | ✅ |

### Operator runbook (manual verification required)

**Setup:**
1. Open the Render dashboard for the production server log stream.
2. Open `/admin/leads` as a super_admin in browser A.
3. Open `/dashboard/deals` and `/dashboard/leads` as a non-admin mover in browser B (preferably a test mover already configured with SMS + email + coverage).

**Steps:**

```
✓ STEP 1 — Find a held lead
  In browser A, filter leads by status=PENDING_MANUAL_REVIEW.
  If none exists, create one via the public quote form
  (https://moveleads.cloud/get-quote-v6 or the v4 ingest) with a
  partially-invalid phone (e.g. mobile number that fails Twilio Verify).
  Wait ~30s for verifyLeadPhone to gate it.

  EXPECTED: at least one lead with status='PENDING_MANUAL_REVIEW'
  AND distributionDecision='system_held' OR 'system_rejected'.

✓ STEP 2 — Inspect pre-state
  In browser A, click the lead → /api/admin/leads/:id/distribution-diagnose
  (admin dashboard renders this).

  EXPECTED: { status: 'PENDING_MANUAL_REVIEW',
              distributionDecision: 'system_held' (or system_rejected),
              hiddenFromMovers: true,
              broadcastWouldSuppress: true }

  Optional: lastBroadcastAttemptAt may be set if the lead was already
  through a prior dispatch attempt.

✓ STEP 3 — Apply tier override
  In browser A, open the lead and submit a tier-override with
  tier='standard' (anything non-rejected). Provide a reason (≥3 chars).
  Click confirm.

  EXPECTED HTTP: 200 with action: 'tier-override' in the response.

✓ STEP 4 — Verify Render logs IMMEDIATELY after submit
  In Render: grep for the lead._id within the last 30 seconds.

  EXPECTED log lines (in order):
    [dispatchApprovedLead] dispatching lead=<id> source=admin.tier_override.set
    [SMS] Attempting to notify movers for lead: <id>
        (or [SMS] suppressed if notifiedAt was already set — see §F below)

✓ STEP 5 — Re-inspect distribution-diagnose
  Refresh the diagnose endpoint for the same lead.

  EXPECTED: { status: 'READY_FOR_DISTRIBUTION',
              distributionDecision: 'admin_approved',
              distributionDecisionBy: '<admin user id>',
              distributionDecisionAt: '<within last 30s>',
              distributionDecisionReason: 'admin tier-override → standard: ...',
              hiddenFromMovers: false,
              distributable: true,
              broadcastWouldSuppress: false (or 'notifiedAt' if first
              broadcast already fired) }

✓ STEP 6 — Verify mover sees the lead
  In browser B, refresh /dashboard/leads.

  EXPECTED: lead appears in the table if the mover's pickup/delivery
  coverage matches. (For movers outside coverage, lead won't render
  but they should have received the SMS/email if subscribed and
  notifiedAt was null at dispatch time.)

✓ STEP 7 — Verify the audit row
  In Render Mongo shell or via /api/admin/audit (if exposed):
    db.adminAudit.findOne({ action: 'lead.tier_override.set',
                            targetId: ObjectId('<lead._id>') })

  EXPECTED before/after:
    before: { adminTierOverride: <prev or null>,
              qualityGateCleared: <prev>,
              status: 'PENDING_MANUAL_REVIEW',
              distributionDecision: 'system_held' (or 'system_rejected') }
    after:  { adminTierOverride: { tier: 'standard', ... },
              distributionDecision: 'admin_approved' }
    metadata: { tier: 'standard', reason: '...' }
```

**Reverse-case check (tier='rejected'):**

```
✓ STEP 8 — Override with tier='rejected'
  On a DIFFERENT held lead, submit tier-override with tier='rejected'.

  EXPECTED:
    - distributionDecision flips to 'admin_rejected'
    - dispatchApprovedLead still called BUT
    - Render log shows: [dispatchApprovedLead] suppressed for <id>
                         — distributionDecision=admin_rejected
    - Lead does NOT appear in mover feed
```

**FAIL conditions:**
- No `[dispatchApprovedLead]` log line after a non-rejected tier-override → **C1 fix not deployed.** Revert PR #69? (deploy run was successful — check Render env hasn't cached an old build).
- `distributionDecision` stays `system_held` after a non-rejected tier-override → **C1 fix not effective.** Check `admin.js` HEAD matches the merged commit.
- Mover doesn't see the lead despite `admin_approved` AND coverage match AND `status='READY_FOR_DISTRIBUTION'` → check `notifiedAt` (may have already been set; lead will appear in feed but no fresh SMS/email).

### §F — notifiedAt short-circuit

For previously-broadcast held leads (where `notifiedAt` is set from a prior dispatch), the orchestrator runs but per-channel CAS short-circuits the actual send. This is documented passive-relist behavior (R5 in the audit). Movers see the lead in the feed on next refresh; no new SMS/email fires. **This is expected and correct.** Document the policy with the pilot operator: tier-override on a previously-broadcast lead is a quiet promotion, not a re-blast.

## §C — C3 verification (AdminLeads bulk-refresh URL)

### Code-trace evidence

| Invariant | Evidence | Status |
|---|---|---|
| Bulk-refresh uses `${API_URL}/leads` (real endpoint) | [client/src/pages/admin/AdminLeads.jsx#L744](../../../client/src/pages/admin/AdminLeads.jsx#L744) | ✅ |
| Bogus URL gone | grep `admin/leads?limit=500` → 0 matches | ✅ |
| Initial + bulk-refresh symmetric | both use `${API_URL}/leads` | ✅ |
| Server route exists | `routes/leads.js` admin branch | ✅ |
| 12 lock-in assertions | `adminLeadsBulkRefreshUrl.test.js` 12/12 pass | ✅ |

### Operator runbook

```
✓ STEP 1 — Set up
  Browser tab A: /admin/leads, channelFilter='main'.
  Browser tab B: DevTools → Network panel, filter "leads".

✓ STEP 2 — Select 2 leads
  Tick the checkbox of two leads in the main view.

✓ STEP 3 — Click "Move to Deal Room"
  Enter discount percent (e.g. 30) and a reason.
  Click confirm.

  EXPECTED Network tab:
    POST /api/admin/inventory/bulk → 200 with { ok:true, processed:[...], rejected:[...] }
    GET  /api/leads → 200 with the refreshed array (NOT /api/admin/leads?limit=500)

  EXPECTED UI:
    bulkResult modal renders ("Move to Deal Room — N processed, 0 rejected").
    After modal closes, the table refreshes WITHOUT manual page reload.
    The two moved leads no longer show under channelFilter='main'.
    Switching channelFilter='deal_room' shows them with inventoryChannel='deal_room'.

✓ STEP 4 — Restore one of them
  channelFilter='deal_room', tick one lead, click "Restore to Main",
  confirm.

  EXPECTED: bulk endpoint POST 200, GET /api/leads refresh 200, lead
  disappears from deal_room view, reappears in main view with the
  original price.

✓ STEP 5 — Archive scenario
  Same flow with action='archive'. Verify the lead shows under
  channelFilter='archived' and disappears from both main and
  Deal Room.
```

**FAIL conditions:**
- Network tab shows `GET /api/admin/leads?limit=500` → **C3 fix not deployed.** Check Vercel didn't cache an old build.
- Network tab shows a 404 on the refresh → check whether the URL is still wrong.
- Table doesn't refresh after the modal closes → check that the response is an array (currently the admin branch of `/api/leads` returns a raw array; the wrapper handler also exists for defense-in-depth).

## §D — DRX-1 verification (table refactor)

### Code-trace evidence

| Invariant | Evidence | Status |
|---|---|---|
| `<table className="deals-table">` renders | [client/src/pages/dashboard/Deals.jsx](../../../client/src/pages/dashboard/Deals.jsx) | ✅ |
| 7 columns (Route / Size / Move date / Listed / Was / Now / Action) | source | ✅ |
| Mobile breakpoint at 700px converts to stacked cards | [client/src/pages/dashboard/Deals.css#L67-L155](../../../client/src/pages/dashboard/Deals.css#L67-L155) | ✅ |
| PR-D1 banner + empty state testids preserved | `data-testid="deal-room-disabled-banner"` and `="deal-room-empty-state"` | ✅ |
| Buy-now POST URL unchanged | `fetch('${API_URL}/bids/${leadId}/buy-now')` no body | ✅ |
| Future-pack hook | `// Future: item.type === 'pack'` comment | ✅ |
| 31 lock-in assertions | `dealsTableLayout.test.js` 31/31 pass | ✅ |

### Operator runbook

| Breakpoint | What to verify |
|---|---|
| Desktop ≥1024px | 7-column table; "Listed" column shows "X ago"; hover row → subtle background highlight; Unlock CTA right-aligned |
| Tablet 700-1023px | Table still renders 7 columns; may overflow horizontally — acceptable |
| Mobile <700px | Each row becomes a stacked card; "Listed" column hidden; "Was / Now / discount %" inline above a full-width Unlock CTA; no horizontal scroll |
| Empty state | `data-testid="deal-room-empty-state"` — tag icon + "No deals available right now" |
| Disabled state | Set `ENABLE_DEAL_ROOM=false` in Render → `data-testid="deal-room-disabled-banner"` — alert icon + "Deal Room is currently unavailable", dashed border |
| Loading state | Refresh button shows "Loading…" with disabled state |
| Unlock flow | Click Unlock $X → confirm modal → Confirm Unlock → POST `/api/bids/:leadId/buy-now` → balance debits → success banner appears with link to `/dashboard/my-leads` → lead disappears from Deal Room |
| Console | No errors, no warnings at any breakpoint |

**Recommended browser test matrix:**
- Chrome / Safari on macOS at 1440px viewport
- Chrome on iOS (Safari for accuracy) — simulator at iPhone 15 (390px viewport) and iPad (768px)
- Firefox on macOS as a backup at 1024px

## §E — DRX-2 verification (filter bar + sort)

### Code-trace evidence

| Invariant | Evidence | Status |
|---|---|---|
| 3 filter dropdowns with documented testids | `deals-filter-distance` / `deals-filter-discount` / `deals-filter-moveDate` | ✅ |
| 4 sortable columns | `<SortableTh>` for Route / Move date / Listed / Now | ✅ |
| Defaults non-destructive | `distanceFilter='all'`, `discountFilter=0`, `moveDateFilter='all'` | ✅ |
| Default sort matches server | `sortKey='listed'`, `sortDir='desc'` | ✅ |
| Result-count quiet at default | `isFiltering` gate | ✅ |
| 41 lock-in assertions | `dealsFiltersAndSort.test.js` 41/41 pass | ✅ |

### Filter-combination matrix

For each scenario, expected behavior:

| Distance | Discount | Move date | Search | Result-count shows? | Behavior |
|---|---|---|---|---|---|
| All | All | All | empty | NO | First paint matches DRX-1 baseline |
| Local | All | All | empty | YES | Only `lead.distance` starting "local" |
| Long Distance | All | All | empty | YES | Only `lead.distance` starting "long" OR including "long distance" |
| All | ≥25% off | All | empty | YES | Only leads where `discountPercent >= 25` |
| All | ≥40% off | All | empty | YES | Only leads where `discountPercent >= 40` |
| All | ≥60% off | All | empty | YES | Only leads where `discountPercent >= 60` |
| All | All | This week | empty | YES | Only leads with `moveDate` in current 7-day window |
| All | All | This month | empty | YES | Only leads with `moveDate` ≥ today AND `<` first of next month |
| All | All | Next month | empty | YES | Only leads in next calendar month |
| Local | ≥40% | This week | "Dallas" | YES | All four filters compose; result-count summarizes |
| All | All | All | "Houston" | YES | Text search active over city/zip/size |

### Sort-toggle matrix

| Default | Click "Route" | Click "Route" again | Click "Now" | Click "Now" again |
|---|---|---|---|---|
| `listed desc` (chevron-down on Listed) | `route desc` (chevron-down on Route) | `route asc` (chevron-up on Route) | `now desc` (chevron-down on Now) | `now asc` (chevron-up on Now) |

**Verify:**
- Active column shows chevron, others don't
- `aria-sort` attribute reflects direction (a11y)
- Filter selection persists across sort clicks
- Sort selection persists across filter changes

### FAIL conditions
- Filter doesn't narrow visible rows → check `filtered` useMemo deps include the filter state var
- Sort doesn't change row order → check `sorted` useMemo runs over `filtered`, not over `leads`
- Result-count line appears when no filter is active → `isFiltering` boolean composition wrong
- Console error on filter/sort interaction → likely a regression in `useMemo` dep array

## §F — Verification report template

For the operator to fill in during pilot:

```
═══════════════════════════════════════════════════════════════════
PILOT — PRE-FLIP VERIFICATION REPORT
Date: ___________ Operator: ___________

[ ] §A pulse: API 200, FE 200, deploy success
[ ] §B C1: tier-override SET → admin_approved + dispatchApprovedLead log
[ ] §B C1: tier-override SET (rejected) → admin_rejected + suppressed log
[ ] §C C3: bulk-refresh hits /api/leads (not /admin/leads?limit=500)
[ ] §C C3: table refreshes without manual page reload
[ ] §D DRX-1: 7 columns desktop, stacked cards mobile <700px
[ ] §D DRX-1: PR-D1 banner + empty state visually distinct
[ ] §D DRX-1: Unlock flow round-trip works (debit, PurchasedLead, My Leads)
[ ] §E DRX-2: 3 filters narrow rows correctly (sample 6 combos)
[ ] §E DRX-2: 4 sortable columns toggle correctly with chevron
[ ] §E DRX-2: result-count quiet at default, accurate when filtering
[ ] Console: zero errors at any breakpoint
[ ] Network tab: no 404s, no 500s during normal flows

DEFECTS FOUND (if any):
  - ID:
    Severity:
    Reproducer:
    Recommended action:

VERIFIED BY: ___________  Time: ___________
═══════════════════════════════════════════════════════════════════
```

## Net Phase 1 status

**API + infrastructure:** verified green.
**Code-paths:** verified by 105 new lock-in tests across 4 PRs + 58 server test files all passing.
**Visual / behavioral:** **requires operator-side execution** of the §B–§E runbooks above.

Recommend the operator dedicate ~45 minutes to working through §B–§E in production before flipping `ENABLE_DEAL_ROOM=true` for the pilot cohort. The defect-found section of §F should be empty before proceeding to Phase 5 GO.
