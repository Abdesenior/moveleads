# Phone Verification — Source of Truth

> **Status (2026-05-17):** Rollout in **HOLD** pending Twilio support resolution of upstream Verify code `60238`. Backend + frontend implementation is complete and operational. No further phone-verification work until Twilio clears the block. See §11.
>
> **Audience:** any engineer or operator about to touch `User.phoneVerified`, the verification routes, the `VerifyPhoneModal` component, or the SMS-alert / SMS-Claim gates that depend on verification state.
>
> **TL;DR:** Mover phone verification is implemented end-to-end via Twilio Verify (managed OTP). Production has stamped `phoneVerified: false` on every existing mover — and the only path to flip it `true` is the Verify flow. Currently blocked by Twilio code `60238` "Verification Creation Attempt blocked by Twilio". Backend, frontend, schema, gating, and error handling are correct; the block is upstream.

---

## 1. Why phone verification exists

Two production gates require it:

1. **`broadcastLeadSMS` Mongo filter** ([twilioService.js:98-105](../server/services/twilioService.js#L98-L105)) — `phoneVerified: true` is a hard `find()` criterion. Unverified movers are silently excluded from SMS lead alerts.
2. **SMS Claim webhook** (future) — inbound `SEND <token>` SMS replies will be matched against `User.phone` only when `phoneVerified: true`. Without that constraint, anyone could spoof a phone number in Settings and claim leads via SMS reply.

`User.phoneVerified` was added in commit `f8d002b` (May 10, 2026) as TCPA-compliance infrastructure — the gate was shipped without the opener. Auditing on May 17 surfaced that every production mover had `phoneVerified: false` and was silently receiving zero SMS alerts.

This rollout closes that gap.

---

## 2. Gating model (decision recorded — DO NOT alter without explicit operator approval)

Phone verification is **capability-gated, not signup-gated.**

| Channel / capability | Requires `phoneVerified: true`? |
|---|---|
| **SMS lead alerts** (outbound) | ✓ Yes — enforced by `broadcastLeadSMS` filter |
| **SMS Claim** (when live, Phase 5) | ✓ Yes — strict requirement |
| **Email lead alerts** | ✗ No — only requires `isEmailVerified` |
| **In-dashboard real-time feed (socket)** | ✗ No — auth alone is sufficient |
| **Dashboard access** | ✗ No — capability-gated only |
| **Onboarding completion** | ✗ No — explicitly NOT phone-blocked |
| **Lead unlocking (`/buy-now`)** | ✗ No — balance + email-verified are the gates |
| **Refund flow / admin actions** | ✗ No |
| **Warm transfer voice (retired)** | N/A — entire surface dormant per `2db8899` |

**Operator decisions, recorded:**
- One verified phone number can belong to only one mover account. Legitimate ownership transfer requires manual admin un-verification of the old account first.
- Verification routes are protected by `verifiedGate = [auth, requireEmailVerified]` — matches the dashboard policy.
- Twilio Verify is the chosen architecture (managed OTP) — no custom OTP storage, hashing, expiry, or attempt-counting in the codebase.

---

## 3. Architecture overview

### Backend (Phase 1, commit `e9d5d13`)

```
                ┌────────────────────────────────┐
                │       Mover (signed in)        │
                │  Clicks "Verify Phone" CTA     │
                └──────────────┬─────────────────┘
                               │
                               ▼
                ┌──────────────────────────────────────────┐
                │  /api/users/me/phone/* (verifiedGate)    │
                │                                          │
                │  POST /send-verification                 │
                │    1. Resolve req.user.phone → E.164     │
                │    2. Uniqueness gate (other account     │
                │       holds phone+verified=true → 409)   │
                │    3. Cooldown (60s) check               │
                │    4. Daily cap (10/UTC-day) check       │
                │    5. Twilio Verify create               │
                │    6. Update lastSentAt + dayKey counter │
                │                                          │
                │  POST /verify-code  { code: "123456" }   │
                │    1. Format check                       │
                │    2. Twilio Verify check                │
                │    3. Re-check uniqueness on 'approved'  │
                │    4. Flip phoneVerified=true + stamp    │
                │       phoneVerifiedAt                    │
                │                                          │
                │  GET  /status                            │
                │    Returns: phoneVerified,               │
                │             cooldownRemainingSec,        │
                │             sendsToday, sendsTodayCap,   │
                │             verifyConfigured             │
                └──────────────┬───────────────────────────┘
                               │
                               ▼
                ┌────────────────────────────────┐
                │ services/twilioVerifyService   │
                │   sendVerification(e164)       │
                │   checkVerification(e164,code) │
                │   describeVerifyConfig()       │
                │   logVerifyConfigOnce()        │
                └──────────────┬─────────────────┘
                               │
                               ▼
                ┌────────────────────────────────┐
                │   Twilio Verify v2 (managed)   │
                │   Service: "MoveLeads"         │
                │   SID: TWILIO_VERIFY_SID env   │
                │   Code length: 6, TTL: 10min   │
                │   Channel: SMS                 │
                └────────────────────────────────┘
```

**Pure helpers** ([utils/phoneVerification.js](../server/utils/phoneVerification.js)):
- `normalizeUSDigits` — 10-digit canonical form
- `toE164US` — `+1XXXXXXXXXX` for Twilio
- `applyPhoneChange(oldPhone, newPhone)` — the phone-change invariant patch (resets `phoneVerified` + `phoneVerifiedAt` when value differs)
- `utcDayKey` — UTC start-of-day rollover marker
- `inspectDailyCounter` — read-side counter inspector
- `cooldownRemainingSec` — server-side countdown for the next allowed send

### Frontend (Phase 2, commit `06aca2b`)

Single reusable modal: [client/src/components/VerifyPhoneModal.jsx](../client/src/components/VerifyPhoneModal.jsx).

**Two-stage state machine:**
- `confirm` → display masked phone, "Send code" CTA, "Wrong number? Update in Settings" escape hatch
- `code` → 6 single-digit inputs (auto-advance, paste-friendly, `autocomplete="one-time-code"` for native SMS autofill), resend countdown timer
- `success` → brief green checkmark, calls `refreshUser()` + `onSuccess()` callback, auto-close

**Entry points:**
- [Settings.jsx](../client/src/pages/dashboard/Settings.jsx) → Profile tab → "SMS Alert Phone Number" row → status panel + Verify/Re-verify button
- [SmsClaim.jsx](../client/src/pages/dashboard/SmsClaim.jsx) → Readiness checklist → "Phone verified" row → `Verify →` CTA when unverified

### Diagnostic logging (commit `7d58d33`)

Boot-time line in server logs:
```
[twilioVerify] configured — accountSid=<masked-account-sid> verifySid=VA…XXXX
```
Or, when env is missing:
```
[twilioVerify] NOT CONFIGURED — accountSid=<masked-account-sid> verifySid=<missing>. /api/users/me/phone/* routes will 503.
```

Per-attempt failure log (PII-safe — country prefix + last 2 digits only):
```
[phoneVerification] send failed phone=+1 *** *** **67 user=<id> error=verification_blocked_by_twilio twilioCode=60238 msg=Verification Creation Attempt blocked by Twilio
```

No auth token, no full SID, no raw phone number is ever logged.

---

## 4. Schema fields (permanent — DO NOT delete)

In [server/models/User.js](../server/models/User.js):

| Field | Type | Default | Purpose |
|---|---|---|---|
| `phoneVerified` | Boolean | `false` | Hard gate read by `broadcastLeadSMS` and SMS Claim |
| `phoneVerifiedAt` | Date | `null` | Timestamp of most recent successful verification |
| `phoneVerificationLastSentAt` | Date | `null` | Cooldown anchor for 60s send rate limit |
| `phoneVerificationSendsToday` | `{ dayKey, count }` | `{'', 0}` | UTC-day-aligned daily send counter (cap = 10) |

**Phone-change invariant** (enforced in code, must remain enforced forever): every write to `User.phone` that changes the value MUST also reset `phoneVerified` to `false` and clear `phoneVerifiedAt`. Enforced at:
- [onboarding.js step 3 save](../server/routes/onboarding.js#L73)
- [users.js PUT /:id](../server/routes/users.js)

Both sites call `applyPhoneChange()` from the helper module. Idempotent re-saves (same number) do not reset.

**Never remove these schema field definitions** even if the verification feature is ever fully rolled back. Removing the schema causes Mongoose to silently strip the fields on `.save()`, drifting historical state.

---

## 5. Env vars

| Variable | Required for | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | All Twilio (SMS, Lookup, Verify) | Existing — used by `twilioService.js` already |
| `TWILIO_AUTH_TOKEN` | All Twilio | Existing |
| `TWILIO_VERIFY_SID` | Verify only | **Newly required** — the Verify Service SID (starts with `VA...`). Set in prod env. |
| `TWILIO_PHONE_NUMBER` | SMS sender | Existing — unrelated to Verify |

When `TWILIO_VERIFY_SID` is absent the wrapper returns `SKIPPED` and routes return `503 verify_service_unavailable` — graceful degradation; nothing crashes.

---

## 6. Twilio Console setup (one-time, completed)

1. Twilio Console → **Verify** → **Services** → **Create new**
   - Service name: `MoveLeads` (operator confirmed)
   - Code length: 6 digits (default)
   - Validity period: 10 minutes (default)
   - Channels: SMS only
   - Custom OTP message template: not used (Twilio default — operator confirmed for Phase 1)
2. Copy **Service SID** (`VA...`) into prod env as `TWILIO_VERIFY_SID`
3. Twilio Verify uses a Twilio-managed messaging service for OTP traffic — separate from MoveLeads' A2P 10DLC registration for lead-alert SMS

A2P 10DLC: Verify SMS does NOT count against MoveLeads' regular A2P throughput. Verify is a separate compliance channel under Twilio's managed registration.

Production cost: $0.05 per verification attempt (US). Negligible at current scale.

---

## 7. Frontend status

**Implemented and live in production:**
- `<VerifyPhoneModal>` reusable component
- Settings → Profile tab status row (amber unverified / green verified)
- SMS Claim Readiness row CTA
- AuthContext.refreshUser() integration so badge flips immediately after success
- Friendly error mapping for all known server error codes (cooldown, daily cap, invalid code, expired, phone in use, service unavailable, **verification_blocked_by_twilio**)
- Phone-change reset UX (Settings phone edit → server resets `phoneVerified: false` → row flips back to amber → mover re-verifies)

**Not implemented (deferred per approved rollout):**
- Phase 3: onboarding Step 3 inline verify (optional, never blocks signup)
- Phase 4: dashboard banner for unverified-with-SMS movers
- Phase 5: migration email to existing unverified-with-SMS movers

These phases are deferred regardless of the Twilio block — they're sequenced for after a successful production soak.

---

## 8. Security assumptions

- **Authentication required.** All three routes are mounted behind `verifiedGate` (auth + requireEmailVerified). Phone verification is capability-gated; the user must already be email-verified and logged in.
- **`to` is server-derived.** The Twilio Verify `to` parameter is always `req.user.phone` — never accepted from the request body. Closes the attack vector where a malicious actor could verify someone else's number.
- **`phoneVerified` is server-only.** Stripped from `req.body` in [users.js PUT /:id](../server/routes/users.js) along with `phoneVerifiedAt` and all `phoneVerification*` fields. Clients cannot flip the flag directly — only `/verify-code` can.
- **Twilio handles OTP security.** Code generation, expiry, attempt counting, replay protection, brute-force resistance are all Twilio's responsibility. No custom OTP storage, hashing, or counters in our code.
- **Race-window protection.** Uniqueness check runs twice: at `/send-verification` and inside the `/verify-code` `approved` branch. A concurrent two-account verification of the same number is detected and the second flip is refused.
- **Rate limits, multi-layer:**
  - Per-user cooldown: 60s between sends (`phoneVerificationLastSentAt`)
  - Per-user daily cap: 10 sends per UTC-day (`phoneVerificationSendsToday`)
  - Per-IP send: 20/hour (`express-rate-limit`)
  - Per-IP verify: 30/hour
  - Twilio's own per-phone limits as a final backstop
- **PII-safe logging.** Server logs include only `+1 *** *** **XX` phone fingerprint, user ID, Twilio code, Twilio message. Auth token never logged. Full SIDs never logged (only first-6 + last-4 mask).

---

## 9. Rollout plan (current state)

| Phase | Status |
|---|---|
| Phase 1 — backend capability (routes, service wrapper, helper, schema) | ✓ Complete (`e9d5d13`) |
| Phase 1.5 — internal curl testing | Skipped per operator decision — testing via real UX instead |
| Phase 2 — frontend modal + Settings CTA + SMS Claim CTA | ✓ Complete (`06aca2b`) |
| Phase 2.5 — error mapping + diagnostic logging (60238 fix) | ✓ Complete (`7d58d33`) |
| **Phase 2.6 — production verification** | ⛔ **BLOCKED** — Twilio code 60238 |
| Phase 3 — onboarding Step 3 inline verify | ⏸ Deferred (pending Phase 2.6 unblock) |
| Phase 4 — dashboard banner for unverified+SMS movers | ⏸ Deferred |
| Phase 5 — migration email to existing movers | ⏸ Deferred until soft soak |
| Phase 6 — SMS Claim live activation | Separate workstream; depends on Phase 2.6 unblock |

---

## 10. Known blocker — Twilio code `60238`

**Symptom:** Every send-verification attempt against a US mover phone returns Twilio error code `60238` "Verification Creation Attempt blocked by Twilio".

**Confirmed by operator:**
- Backend verification architecture is implemented correctly
- Verify routes are operational
- E.164 normalization confirmed for US numbers
- `TWILIO_ACCOUNT_SID` and `TWILIO_VERIFY_SID` match (same account family)
- Fraud Guard disabled at the account level
- Fraud Guard disabled at the **service** level (Verify Service → Settings)
- Allowed Countries on the Verify Service includes United States (+1)
- Multiple US numbers tested with same result

**Twilio documentation interpretation:**
Per Twilio's error reference, `60238` after Fraud Guard disabled indicates one of:
- Account under review (trial-to-production transition still pending)
- Account upgrade review in progress
- Twilio-side restriction triggered by automated abuse heuristics independent of Fraud Guard
- Geographic SMS-sending restriction not exposed in the standard "Allowed Countries" UI
- Managed A2P registration delay for Verify channel

These are all **upstream — not resolvable from the MoveLeads codebase or Twilio Console alone.** Operator must engage Twilio support.

**What the codebase does in the meantime:**
- Server logs the exact Twilio code + message on every failure (PII-safe)
- Route returns `422 verification_blocked_by_twilio` (not retryable)
- Client modal shows: *"Verification SMS was blocked by our SMS provider. Please contact support."*
- The `phoneVerified` gate stays strict — no softening, no bypass

---

## 11. HOLD status — what's pending

**Operator action required (Twilio side):**
1. Open Twilio support case referencing error code `60238` on Verify Service `<MoveLeads SID prefix from boot logs>`
2. Confirm account is in production mode (not trial)
3. Confirm there is no pending upgrade review or A2P registration delay
4. Request explicit clearance for OTP sends to US destinations from this Verify Service
5. Once Twilio responds with resolution, run a single send-verification against a known-good test number; verify SMS arrives

**Codebase action: NONE.** Do not:
- Implement a custom OTP fallback (operator decision)
- Soften the `phoneVerified` Mongo filter in `broadcastLeadSMS`
- Add bypass logic, override flags, or admin "manually-verify" routes
- Implement Phase 3-5 of the rollout
- Touch any of the verification surfaces

**When Twilio resolves the block:**
- Next send-verification attempt succeeds
- Operator's own phone receives SMS, completes verification end-to-end
- Single mover confirms the loop, then proceed to Phase 3+ at operator's discretion

---

## 12. Operational recommendations

- **Monitor Twilio dashboard** during the hold for any "Account status" updates or A2P registration changes
- **Log scan recipe:** `grep '[phoneVerification]' production.log | grep 'twilioCode'` — surfaces every Verify-side failure with the exact code and PII-safe phone fingerprint
- **When unblocked:** re-test against multiple US numbers, then on first success consider enabling Phase 4 (dashboard banner) before Phase 5 (migration email) so movers self-serve before being told to via email
- **Cost watch:** at $0.05 per verification, monitor monthly Twilio Verify spend once Phase 5 fires — bulk migration emails could drive 50-500 verifications/day in the first week
- **Support runbook entry needed:** "Mover reports not receiving SMS lead alerts" → first check `User.phoneVerified` → if `false`, instruct verification in Settings → Profile → SMS Alert Phone Number → Verify Phone

---

## 13. What stays during HOLD (do not touch)

| Component | Reason |
|---|---|
| All four schema fields (`phoneVerified`, `phoneVerifiedAt`, `phoneVerificationLastSentAt`, `phoneVerificationSendsToday`) | Mongoose strip-on-save risk; permanent |
| `applyPhoneChange()` calls in `onboarding.js` + `users.js PUT` | Phone-change invariant must hold even with rollout on hold |
| `broadcastLeadSMS` `phoneVerified: true` filter | Strict gate; no softening |
| All three verification routes (`/send-verification`, `/verify-code`, `/status`) | Operational; routes return clean errors during hold |
| `services/twilioVerifyService.js` + error mapping | Already correct |
| `VerifyPhoneModal` component + Settings + SMS Claim integration | UI is correct; will work the moment Twilio unblocks |
| Startup `logVerifyConfigOnce()` line in `server.js` | Diagnostic visibility |
| `TWILIO_VERIFY_SID` env var in production | Already set |

---

## 14. Commit history (verification work)

| Commit | Scope |
|---|---|
| `f8d002b` (May 10) | Original `phoneVerified` field + `broadcastLeadSMS` gate (Phase 1 TCPA infrastructure, no opener) |
| `e9d5d13` (May 17) | Phase 1 — backend Twilio Verify capability |
| `06aca2b` (May 17) | Phase 2 — frontend modal + Settings + SMS Claim CTAs |
| `7d58d33` (May 17) | Phase 2.5 — Twilio `60238` error mapping + diagnostic logging |

---

## 15. Cross-references to related architecture

- [docs/marketplace-architecture.md](./marketplace-architecture.md) — auction → instant-dispatch transition, Live Transfer retirement, dormant infrastructure rules
- `broadcastLeadSMS` in [server/services/twilioService.js](../server/services/twilioService.js#L48) — primary `phoneVerified` reader
- SMS Claim preview in [server/routes/smsClaim.js](../server/routes/smsClaim.js) — exposes `phoneVerified` in Readiness response
- Inbound SMS keyword handler [server/routes/twilio.js](../server/routes/twilio.js) — manages `smsOptOut` flag (STOP/START); independent of verification

---

## 16. Resume conditions for HOLD release

This HOLD is released when ALL of the following are confirmed:

1. ✅ Twilio support has confirmed in writing that account-level OTP sends to US destinations are unblocked
2. ✅ A single test send-verification from production returns Twilio status `pending` (not `60238`)
3. ✅ The test SMS arrives on a real US mobile within ~15 seconds
4. ✅ Operator's verification check succeeds (status `approved`); `User.phoneVerified` flips true in the test account

After all four: resume at Phase 3 (onboarding inline verify) or Phase 4 (dashboard banner) at operator's discretion.
