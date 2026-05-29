# 01 — Readers, Writers, Crons

Reference compendium. For the verdict + 4-axis matrix see [`02-visibility-matrix-and-conflicts.md`](02-visibility-matrix-and-conflicts.md).

## A. Writers — every place Lead state changes

Grouped by field, with trigger + guard + side effects + orchestrator status.

### A.1 `Lead.status`

| ID | Writer | File:line | Trigger | Guard | Write | Orchestrator? |
|---|---|---|---|---|---|---|
| W-S1 | V4 ingest | [routes/leadIngest.js#L199](../../../server/routes/leadIngest.js#L199) | Public V4 form | Zod + dup-window | `status='Pending Verification'` + history | N/A (non-distributable) |
| W-S2 | V5/V6 ingest | [routes/leadIngestV2.js#L228](../../../server/routes/leadIngestV2.js#L228) | Public V5/V6 form | Zod + clientSubmissionId mutex | same as W-S1 + `qualityGateCleared:false` + `distributionDecision:'system_pending'` | N/A |
| W-S3 | Admin CSV import | [routes/admin.js#L365](../../../server/routes/admin.js#L365) | Admin upload | `[auth, admin]` | `status='READY_FOR_DISTRIBUTION'`, `isVerified=true`, `verifiedBy='admin'`, auction defaults | **Bypassed — socket-only by design** (emitNewLead, no SMS, no email) |
| W-S4 | `verifyLeadPhone` shape-fail | [services/twilioService.js#L501-L503](../../../server/services/twilioService.js#L501) | Malformed phone | Digit count check | `status='PENDING_MANUAL_REVIEW'`, `isVerified=false` | Bypassed (terminal) |
| W-S5 | `verifyLeadPhone` qualification-gate (Phase 6.8) | [services/twilioService.js#L587-L591](../../../server/services/twilioService.js#L587) | Post-scoring re-derivation | `shadowTier==='rejected'`/`qualityGateCleared===false`/`adminTierOverride='rejected'` | `PENDING_MANUAL_REVIEW` or `READY_FOR_DISTRIBUTION` | Calls `dispatchApprovedLead` on the not-failed branch |
| W-S6 | `verifyLeadPhone` widget exclusive | [services/twilioService.js#L636](../../../server/services/twilioService.js#L636) | `sourceCompany` set + qualification passed | `lead.sourceCompany && !qualFail` | `status='Purchased'` + PurchasedLead insert | Bypassed (sold) |
| W-S7 | `verifyLeadPhone` outer catch | [services/twilioService.js#L707-L713](../../../server/services/twilioService.js#L707) | Unhandled error | defensive | `status='PENDING_MANUAL_REVIEW'`, all prices zeroed, `auctionStatus='expired'` | Bypassed |
| W-S8 | Admin approve | [routes/admin.js#L730](../../../server/routes/admin.js#L730) | `POST /api/admin/leads/:id/approve` | `[auth, admin]`; status in `UPGRADABLE_STATUSES` | `READY_FOR_DISTRIBUTION` + `adminTierOverride` + `qualityGateCleared=true` + `distributionDecision='admin_approved'` | **Calls `dispatchApprovedLead({source:'admin.approve'})`** |
| W-S9 | Admin reject | [routes/admin.js#L784-L786](../../../server/routes/admin.js#L784) | `POST /api/admin/leads/:id/reject` | `[auth, admin]` | `status='REJECTED_FAKE'` + `distributionDecision='admin_rejected'` + audit | Bypassed (terminal) |
| **W-S10** | **Admin tier-override SET (status upgrade)** | [routes/admin.js#L895-L897](../../../server/routes/admin.js#L895) | `POST /api/admin/leads/:id/tier-override`, tier≠rejected, current=`PENDING_MANUAL_REVIEW` | `[auth, admin]` | `status='READY_FOR_DISTRIBUTION'` + `adminTierOverride` + `qualityGateCleared=true`. **Does NOT touch `distributionDecision`** | **Bypassed — SILENT STATE BUG (C1)** |
| W-S11 | `GET /api/leads` expire side-effect | [routes/leads.js#L215-L222](../../../server/routes/leads.js#L215) | Mover hits feed | `READY_FOR_DISTRIBUTION + moveDate<now + buyers empty` | `status='Expired'`, `auctionStatus='expired'` | N/A (lifecycle cleanup, mostly redundant after PR-6) |
| W-S12 | `cleanupExpiredLeads` cron | [jobs/cleanupExpiredLeads.js#L7-L13](../../../server/jobs/cleanupExpiredLeads.js#L7) | Daily 05:00 UTC | `moveDate<now`, status∉{Purchased,Expired} | `status='Expired', auctionStatus='expired'` | N/A |
| W-S13 | buy-now | [routes/bids.js#L169](../../../server/routes/bids.js#L169) | `POST /api/bids/:leadId/buy-now` | Atomic CAS `auctionStatus:'active'` → `'buy_now'` + balance CAS + PurchasedLead unique | `status='Purchased'`, auction `'sold'`, winnerId, finalPrice, buyers.push | N/A (sold) |
| W-S14 | Multi-buyer claim | [routes/leads.js#L681](../../../server/routes/leads.js#L681) | `POST /api/leads/:id/claim` | Atomic `$push` with `$size < maxBuyers` filter | `status='Purchased'` when slots filled | N/A |
| W-S15 | Twilio inbound CLAIM win | [routes/twilio.js#L529](../../../server/routes/twilio.js#L529) | Inbound SMS with valid token | `claimWindow.token + status:'open' + expiresAt:$gt:now` CAS + balance + PurchasedLead unique | Same as buy-now | N/A |
| W-S16 | Voice live-transfer accept | [routes/voice.js#L161](../../../server/routes/voice.js#L161) | Mover presses 1 | `buyers:{$size:0}` CAS | `status='Purchased'` + `isWarmTransfer=true` | N/A. **Voice path is DORMANT (Live Transfer retired)** |
| W-S17 | `settleAuctions` win | [jobs/settleAuctions.js#L138](../../../server/jobs/settleAuctions.js#L138) | Auction expiry | Atomic `'settling'` interim + balance + PurchasedLead unique | `status='Purchased'`, finalize | N/A |
| W-S18 | `settleAuctions` no-bid expire | [jobs/settleAuctions.js#L58, L128](../../../server/jobs/settleAuctions.js#L58) | No bids OR no funded bidder | (same interim) | `auctionStatus='expired'` only — leaves `status` alone | N/A. Lead now eligible for reactivate cron — **good chain integrity** |
| W-S19 | Voice refund | [routes/voice.js#L259-L262](../../../server/routes/voice.js#L259) | Dial didn't connect | (the refund path) | `status='Available'` — **does NOT touch `auctionStatus`** | Bypassed. **Strands lead at (status='Available', auctionStatus='sold')** — see **C2 in 02-...md** |
| W-S20 | User account delete | [routes/users.js#L346-L351](../../../server/routes/users.js#L346) | `DELETE /api/users/me` | account owner | `buyers.pull(userId)` + `status='Available'` if no buyers remain | N/A |

### A.2 `Lead.distributionDecision`, `qualityGateCleared`, `shadowTier`, `adminTierOverride`

| ID | Writer | File:line | Guard / stickiness | Write | Orchestrator? |
|---|---|---|---|---|---|
| W-Q1 | V5/V6 ingest | [routes/leadIngestV2.js#L262-L271](../../../server/routes/leadIngestV2.js#L262) | none (insert) | `qualityGateCleared:false, distributionDecision:'system_pending', by:'system', at, reason:'ingest'` | N/A |
| W-Q2 | scoringPipeline denorm mirror | [services/scoringPipeline.js#L110-L118](../../../server/services/scoringPipeline.js#L110) | filter by `_id` only — **no stickiness** | `shadowTier, shadowTierUpdatedAt, qualityGateCleared, structuralBlockers` | N/A |
| W-Q3 | scoringPipeline `distributionDecision` (sticky) | [services/scoringPipeline.js#L146-L155](../../../server/services/scoringPipeline.js#L146) | `{distributionDecision: {$in: SYSTEM_VALUES}}` — admin verdicts sticky | `distributionDecision` derived + by/at/reason | N/A (caller fires) |
| W-Q4 | `verifyLeadPhone` decision (sticky) | [services/twilioService.js#L619-L627](../../../server/services/twilioService.js#L619) | Same stickiness | Same shape as W-Q3 | Caller fires `dispatchApprovedLead({source:'verifyLeadPhone'})` |
| W-Q5 | Admin approve | [routes/admin.js#L709, L738-L741](../../../server/routes/admin.js#L709) | `[auth, admin]` | `qualityGateCleared=true`, `adminTierOverride={tier, reason, by, at}`, `distributionDecision='admin_approved'` + by/at/reason | **Fires `dispatchApprovedLead({source:'admin.approve'})`** |
| W-Q6 | Admin reject | [routes/admin.js#L787-L800](../../../server/routes/admin.js#L787) | `[auth, admin]` | `adminTierOverride.tier='rejected'`, `qualityGateCleared=false`, `distributionDecision='admin_rejected'` | Does NOT dispatch (correct — terminal) |
| **W-Q7** | **Admin tier-override SET** | [routes/admin.js#L879-L889](../../../server/routes/admin.js#L879) | `[auth, admin]` | `adminTierOverride`, `qualityGateCleared = (tier !== 'rejected')`. **Does NOT touch `distributionDecision`** | **Bypassed — see C1** |
| W-Q8 | Admin tier-override CLEAR | [routes/admin.js#L920, L930, L940-L943](../../../server/routes/admin.js#L920) | `[auth, admin]` | `adminTierOverride=undefined`, `qualityGateCleared = (latestSnap.tier !== 'rejected')`, `distributionDecision = deriveSystemDecision(lead)` + by/at/reason | **Fires `dispatchApprovedLead({source:'admin.tier_override.clear'})`** |
| W-Q9 | Admin rescore | [routes/admin.js#L824](../../../server/routes/admin.js#L824) | `[auth, admin]` | Delegates to scoringPipeline (W-Q2/W-Q3) | **Fires `dispatchApprovedLead({source:'admin.rescore'})`** |

### A.3 `Lead.inventoryChannel`

| ID | Writer | File:line | Trigger | Write |
|---|---|---|---|---|
| W-I1 | move_to_deal_room | [routes/adminInventory.js#L233](../../../server/routes/adminInventory.js#L233) | `POST /api/admin/inventory/bulk` | `'deal_room'` + price reset + `auctionStatus='expired'` if was active |
| W-I2 | archive | [routes/adminInventory.js#L241](../../../server/routes/adminInventory.js#L241) | same | `'archived'` |
| W-I3 | restore_to_main | [routes/adminInventory.js#L247](../../../server/routes/adminInventory.js#L247) | same | `'main'` + `buyNowPrice = originalPrice`. **Does NOT dispatch** (passive re-list via PR-6 cron). |

### A.4 `Lead.auctionStatus`

| ID | Writer | File:line | Direction |
|---|---|---|---|
| W-A1 | V4/V5/V6 ingest | [routes/leadIngestV2.js#L244](../../../server/routes/leadIngestV2.js#L244) | `→ 'active'` |
| W-A2 | Admin CSV import | [routes/admin.js#L373-L375](../../../server/routes/admin.js#L373) | `→ 'active'` |
| W-A3 | adminInventory move_to_deal_room | [routes/adminInventory.js#L237-L239](../../../server/routes/adminInventory.js#L237) | `active → expired` (cond) |
| W-A4 | bids.js buy-now | [routes/bids.js#L114-L117, L168](../../../server/routes/bids.js#L114) | `active → buy_now → sold`. Reverts to `active` on failure. |
| W-A5 | twilio inbound CLAIM | [routes/twilio.js#L401, L528](../../../server/routes/twilio.js#L401) | Same as W-A4 |
| W-A6 | `reactivateLeads` | [jobs/reactivateLeads.js#L138-L147](../../../server/jobs/reactivateLeads.js#L138) | `{expired, pending, null} → active`. **Fires `dispatchApprovedLead`** |
| W-A7 | `settleAuctions` | [jobs/settleAuctions.js#L51, L58, L128, L137](../../../server/jobs/settleAuctions.js#L51) | `active|settling → settling → sold|expired` |
| W-A8 | `cleanupExpiredLeads` | [jobs/cleanupExpiredLeads.js#L12](../../../server/jobs/cleanupExpiredLeads.js#L12) | `→ expired` |
| W-A9 | verifyLeadPhone outer catch | [services/twilioService.js#L712](../../../server/services/twilioService.js#L712) | `→ expired` |
| W-A10 | GET /api/leads expire side-effect | [routes/leads.js#L221](../../../server/routes/leads.js#L221) | `→ expired` |

### A.5 `Lead.buyers`, `Lead.winnerId`, `Lead.finalPrice`

All sale paths (W-S13, W-S14, W-S15, W-S16, W-S17) write the same trio atomically as part of the canonical buy-now / claim / settle sequences. PurchasedLead unique `{company, lead}` is the load-bearing mutex.

### A.6 `Lead.notifiedAt`, `lastBroadcast*` (PR-4 manifest)

| ID | Writer | File:line | CAS? |
|---|---|---|---|
| W-D1 | broadcastLeadSMS | [services/twilioService.js#L431-L435](../../../server/services/twilioService.js#L431) | Yes: `{_id, notifiedAt: null}` |
| W-D2 | broadcastLeadEmail | [services/emailService.js#L993-L996](../../../server/services/emailService.js#L993) | Yes: same CAS |
| W-D3 | socketService.emitNewLead | [services/socketService.js#L115](../../../server/services/socketService.js#L115) | Read-only dedup check (no write) |
| W-D4 | SMS suppress manifest variants | twilioService.js multiple | No (fire-and-forget) |
| W-D5 | dispatchOrchestrator attemptAt | [services/dispatchOrchestrator.js#L82-L86](../../../server/services/dispatchOrchestrator.js#L82) | No |
| W-D6 | dispatchOrchestrator suppress reason | [services/dispatchOrchestrator.js#L103-L107](../../../server/services/dispatchOrchestrator.js#L103) | No |

### A.7 `Lead.claimWindow`

| ID | Writer | File:line | Guard / CAS |
|---|---|---|---|
| W-C1 | openClaimWindow | [utils/claimWindow.js#L64-L82](../../../server/utils/claimWindow.js#L64) | `status: {$nin: ['open','claimed']}` CAS + unique token index |
| W-C2 | Twilio inbound CLAIM win | [routes/twilio.js#L388-L405](../../../server/routes/twilio.js#L388) | Compound CAS on token + status:open + expiresAt:$gt |
| W-C3/C4 | Twilio inbound CLAIM revert (low balance / E11000) | [routes/twilio.js#L446-L518](../../../server/routes/twilio.js#L446) | Scoped CAS `{claimedBy: user._id}` so distinct movers can't mutually revert |
| W-C5 | closeStaleClaimWindows cron | [jobs/closeStaleClaimWindows.js#L72-L83](../../../server/jobs/closeStaleClaimWindows.js#L72) | `status:'open' + expiresAt:$lte:now` |

## B. Readers — every place leads come out

Grouped by audience.

### B.1 Mover-facing

| Reader | File:line | Filter | Sort | Projection / Enrichment |
|---|---|---|---|---|
| `GET /api/leads` mover branch | [routes/leads.js#L157, L187-L205](../../../server/routes/leads.js#L157) | status: $in [Available, READY_FOR_DISTRIBUTION] + moveDate:$gte + inventoryChannel:$nin[deal_room,archived] + sourceCompany scope + `buyers.company: $ne req.user.id` + moverVisibilityFilter | `{distributionDecisionAt: -1, createdAt: -1}` | Full doc + per-doc PII deletion when not buyer + `_matchesPreferences` annotation |
| `GET /api/leads/deals` | [routes/leads.js#L95-L133](../../../server/routes/leads.js#L95) | inventoryChannel='deal_room' + status + moveDate + buyers.company $ne (PR-D2) + moverVisibilityFilter | `{updatedAt: -1}` | DB-level PII strip + `discountPercent` |
| `GET /api/purchases` (My Leads) | [routes/purchases.js#L15](../../../server/routes/purchases.js#L15) | `PurchasedLead.company = req.user.id` | `{purchasedAt: -1}` | Full lead via `.populate('lead')`; mover sees full PII (they own it) |
| `GET /api/leads/widget-analytics` | [routes/leads.js#L41-L80](../../../server/routes/leads.js#L41) | `sourceCompany = req.user.id` + moverVisibilityFilter | `{createdAt: -1}` | Hand-built 5-row payload |
| `GET /api/leads/:id` | **DOES NOT EXIST** | — | — | Movers see lead details only via list endpoints |

### B.2 Admin-facing

| Reader | File:line | Filter | Sort | Notes |
|---|---|---|---|---|
| `GET /api/leads` admin branch | [routes/leads.js#L246](../../../server/routes/leads.js#L246) | **Empty `{}` — every lead in collection** | `{distributionDecisionAt: -1}` | Unpaginated. **Scaling risk** (C5) |
| `GET /api/admin/leads?limit=500` | **DOES NOT EXIST** | — | — | **AdminLeads.jsx#L734 hits this URL after bulk actions and silently fails** (C3) |
| `GET /api/admin/quality-analytics` | [routes/adminAnalytics.js#L122](../../../server/routes/adminAnalytics.js#L122) | `createdAt:$gte` + optional funnel/source/status | none | Aggregated; admin reads PII |
| `GET /api/admin/leads/:id/scoring-snapshot` | [routes/admin.js#L500](../../../server/routes/admin.js#L500) | `findById` | — | Full doc + ScoringSnapshot + validation logs |
| `GET /api/admin/leads/:id/distribution-diagnose` | [routes/admin.js#L1044](../../../server/routes/admin.js#L1044) | `findById` | — | Selects manifest fields (PR-4) |
| `GET /api/admin/claim-attempts` | [routes/admin/claimAttempts.js#L58](../../../server/routes/admin/claimAttempts.js#L58) | optional leadId / moverId / outcome / since / SID | `{receivedAt: -1}` | `total + items` paginated |
| `GET /api/admin/inventory/deal-room/summary` | [routes/adminInventory.js#L336](../../../server/routes/adminInventory.js#L336) | 3 inline filters (total / available / purchased). **`availableFilter` inlines distributionDecision clause instead of calling helper** (C4) | `{updatedAt: ±1}` for oldest/newest | Aggregated counts + ageDays |
| `GET /api/admin/matcher/diagnose` | [routes/admin/matcherDiagnose.js#L29](../../../server/routes/admin/matcherDiagnose.js#L29) | `Lead.findById + User projection` | — | Returns gate-by-gate trace |

### B.3 Cron / system

| Reader | File:line | Filter |
|---|---|---|
| `reactivateLeads` | [jobs/reactivateLeads.js#L88](../../../server/jobs/reactivateLeads.js#L88) | auctionStatus:$nin[active,sold,buy_now] + status:$in + moveDate:$gte + buyers empty. Filter re-applied at write time. |
| `settleAuctions` | [jobs/settleAuctions.js#L184](../../../server/jobs/settleAuctions.js#L184) | auctionStatus:$in[active,settling] + auctionEndsAt:$lte + distributionModel:$ne 'instant' + inventoryChannel:$nin[deal_room,archived] |
| `cleanupExpiredLeads` | [jobs/cleanupExpiredLeads.js#L5](../../../server/jobs/cleanupExpiredLeads.js#L5) | moveDate:$lt + status:$nin[Purchased,Expired] |
| `closeStaleClaimWindows` | [jobs/closeStaleClaimWindows.js#L73](../../../server/jobs/closeStaleClaimWindows.js#L73) | claimWindow.status='open' + expiresAt:$lte |

## C. Crons — schedules + relationships

| Cron | Schedule | Reads | Writes | Race with |
|---|---|---|---|---|
| `settleAuctions` | `*/2 * * * *` | Lead, Bid candidates, User balance | Lead.status, auctionStatus, winnerId, finalPrice, buyers + PurchasedLead + Transaction | `reactivateLeads` on `auctionStatus` (mitigated by 24h `auctionEndsAt` write gap); `closeStaleClaimWindows` on `claimWindow` (mitigated by per-doc CAS) |
| `requestFeedback` | `0 10 * * *` | PurchasedLead | `PurchasedLead.feedbackEmailSent` | None |
| `cleanupExpiredLeads` | `0 5 * * *` | Lead | Lead.status, auctionStatus | `GET /api/leads` expire mutation writes the same fields (idempotent) |
| `onboardingRecovery` | `*/30 * * * *` | User | User.onboarding.recovery.* | None — User-only |
| `closeStaleClaimWindows` | `*/5 * * * *` | Lead.claimWindow | Lead.claimWindow.status='expired' | `routes/twilio.js` inbound CLAIM win — per-doc resolves; mover SMS wins ties |
| `reactivateLeads` | `*/5 * * * *` | Lead | Lead.auctionStatus, auctionEndsAt + dispatchApprovedLead | `settleAuctions` on `auctionStatus` (mitigated by `auctionEndsAt = now+24h` write); `cleanupExpiredLeads` on `moveDate < now` flipping `status='Expired'` — benign |

## D. Sort keys — full inventory

| Surface | Sort | Means | Honest semantics |
|---|---|---|---|
| Main mover feed | `{distributionDecisionAt: -1, createdAt: -1}` | When the decision was last stamped | "Newest visible" — load-bearing on the backfill having populated `distributionDecisionAt` on every legacy doc + every new writer continuing to stamp |
| Deal Room (mover) | `{updatedAt: -1}` | Last DB write | NOT "newest into Deal Room" — any admin touch re-bubbles. **C9 cosmetic.** |
| Deal Room admin summary `oldest` | `{updatedAt: 1}` | Last DB write ascending | NOT "longest in Deal Room" |
| My Leads | `{purchasedAt: -1}` | Purchase row creation | Correct |
| Widget analytics | `{createdAt: -1}` | When homeowner submitted | Correct |
| AdminLeads.jsx (client) | column toggles | client override of `distributionDecisionAt` | Per-column |
