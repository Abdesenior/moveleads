/**
 * Validation Pipeline — Phase 2 orchestrator.
 *
 * Coordinates the external validation services (Twilio Lookup, Mapbox, and
 * Fingerprint stub) for a single Lead, persists results to `validation_logs`,
 * writes normalized fields onto `Lead.validation.*`, and then triggers an
 * *enriched* re-score via scoringPipeline.runShadow().
 *
 * Phase 2 invariants:
 *   - Fire-and-forget — never throws to its caller
 *   - Shadow-only — every write is to additive fields, never to legacy
 *     score/grade/buyNowPrice/status
 *   - Idempotent — re-running for the same lead overwrites validation.* with
 *     fresh results but is otherwise safe
 *   - Gracefully degrades — if Twilio creds or Mapbox token missing, the
 *     individual call returns status:'skipped' and the pipeline continues
 *     with the others
 *
 * Triggers a re-score at the end so the second (enriched) ScoringSnapshot
 * reflects the validation signals. Combined with the Phase 1 baseline
 * snapshot fired immediately after lead.save(), this gives admin two
 * snapshots per lead: pre-validation and post-validation.
 */

const Lead = require('../models/Lead');
const ValidationLog = require('../models/ValidationLog');
const phoneLookupCache = require('./phoneLookupCache');
const mapboxService = require('./mapboxService');
const fingerprintService = require('./fingerprintService');
const scoringPipeline = require('./scoringPipeline');
const twilioLookupService = require('./twilioLookupService');
const validationToggles = require('./validationToggles');
const carrierReputation = require('./carrierReputation');

/**
 * Cheap synchronous pre-check — returns true if ANY validation surface is
 * env-flag-enabled. Used as the first gate before we incur a Mongo read for
 * the admin toggles. With every env flag at its default (false), the entire
 * pipeline early-returns without DB I/O.
 */
function anyEnvFlagEnabled() {
  return twilioLookupService.isEnabled()
    || mapboxService.isEnabled()
    || fingerprintService.isEnabled()
    || carrierReputation.isEnabled();
}

/**
 * Resolve the EFFECTIVE per-service state by AND-ing env flag with admin
 * toggle. Identity Match is a sub-toggle of Twilio Lookup — both must be
 * effective for it to run, and if Twilio Lookup is off, Identity Match is
 * forced off (also enforced at write-time in validationToggles.set).
 *
 * Returns { mapbox, twilioLookup, twilioIdentityMatch, fingerprint } booleans.
 * On toggle-read failure, validationToggles.get returns ALL_OFF, so this
 * returns env-flag-off-equivalent behaviour.
 */
async function resolveEffective() {
  const toggles = await validationToggles.get();
  const env = {
    twilio:   twilioLookupService.isEnabled(),
    identity: twilioLookupService.isIdentityMatchEnabled(),
    mapbox:   mapboxService.isEnabled(),
    fp:       fingerprintService.isEnabled(),
    carrier:  carrierReputation.isEnabled(),
  };
  const mapbox       = env.mapbox && toggles.mapboxEnabled;
  const twilioLookup = env.twilio && toggles.twilioLookupEnabled;
  // Identity match: env + admin toggle + Twilio Lookup also effective
  const twilioIdentityMatch =
    env.identity && toggles.twilioIdentityMatchEnabled && twilioLookup;
  // Carrier reputation: env + admin toggle + Twilio Lookup also effective
  // (carrier name comes from line_type_intelligence; without Twilio there's
  // nothing to evaluate).
  const carrierRep =
    env.carrier && toggles.carrierReputationEnabled && twilioLookup;
  // Fingerprint has no admin toggle yet (stub still). Env-only.
  const fingerprint  = env.fp;
  return { mapbox, twilioLookup, twilioIdentityMatch, carrierRep, fingerprint };
}

/**
 * Back-compat shim: anyValidationEnabled is the original Phase 2 API. Now
 * returns the resolved EFFECTIVE-any-enabled (env AND toggle). Async.
 */
async function anyValidationEnabled() {
  if (!anyEnvFlagEnabled()) return false;
  const eff = await resolveEffective();
  return eff.mapbox || eff.twilioLookup || eff.fingerprint;
}

/**
 * Run shadow validation for one lead. Safe to call without await.
 *
 * @param {String|ObjectId} leadId
 * @returns {Promise<Object|null>} summary of what ran, or null if skipped/failed
 */
async function runShadow(leadId) {
  // ── Step 1: ALWAYS-ON local checks (free, no env gate needed) ─────────
  // Local NANP fake-pattern detection runs regardless of env flags or admin
  // toggles. Catches obviously-fake phones even when Twilio is disabled for
  // cost reasons. This is the structural defense layer.
  //
  // We read the lead unconditionally because the local check needs the
  // phone number. One Mongo read per ingest is cheap; the alternative
  // (passing phone via callsite) would couple the pipeline to its callers.
  let lead;
  try {
    lead = await Lead.findById(leadId).lean();
    if (!lead) {
      console.warn(`[validationPipeline] lead not found: ${leadId}`);
      return null;
    }
  } catch (err) {
    console.error(`[validationPipeline] lead lookup failed for ${leadId}:`, err.message);
    return null;
  }

  // ── Step 2: Resolve env+toggle effective flags for paid validations ────
  // resolveEffective handles fail-safe ALL-OFF on toggle-read failure.
  const envOn = anyEnvFlagEnabled();
  const effective = envOn
    ? await resolveEffective()
    : { mapbox: false, twilioLookup: false, twilioIdentityMatch: false, carrierRep: false, fingerprint: false };

  const summary = { leadId: String(lead._id), effective, phone: null, route: null, fingerprint: null };

  // ── Local NANP categorization (ALWAYS ON, free, no API) ───────────────
  // Two tiers (see twilioLookupService.categorizePhonePattern):
  //   hard_invalid → write valid:false, skip Twilio
  //   suspicious   → DON'T set valid:false; mark suspicionPattern and
  //                  let Twilio still run; tier router force-reviews
  // Runs regardless of any flag/toggle state.
  const e164 = twilioLookupService.normalizeE164(lead.customerPhone);
  const fakeCheck = twilioLookupService.isLikelyFakeNanpNumber(e164);
  const localSuspicionPattern = fakeCheck.suspicionPattern || null;
  if (fakeCheck.fake) {
    // pattern label e.g. 'local_nanp_rule' / 'impossible_pattern' for the
    // validityReason string the scoring engine maps to user-facing text.
    const validityReason = `${fakeCheck.label || 'fake_pattern'}:${fakeCheck.pattern}`;
    const localFakeResult = {
      available: true, status: 'ok', provider: 'local_nanp_check',
      packages: ['local_nanp_check'],
      result: {
        valid: false,
        validityReason,
        suspicionPattern: null,
        lineType: null, isVoip: null, carrierName: null,
        smsPumpingRisk: null, smsPumpingScore: null, identityMatch: null,
        fromCache: false,
      },
      rawRedacted: JSON.stringify({ local_check: 'hard_invalid', label: fakeCheck.label, pattern: fakeCheck.pattern }),
      costUsd: 0, error: null,
    };
    await persistLog(lead._id, 'phone', localFakeResult);
    await safeUpdateLead(lead._id, {
      'validation.phone': {
        valid: false,
        validityReason,
        suspicionPattern: null,
        lineType: null, isVoip: null, carrierName: null,
        smsPumpingRisk: null, smsPumpingScore: null, identityMatch: null,
        fromCache: false, provider: 'local_nanp_check',
        checkedAt: new Date(),
      },
      'validation.fraud': {},
    });
    summary.phone = { status: 'ok', provider: 'local_nanp_check', valid: false, pattern: fakeCheck.pattern };
    // Skip the paid Twilio call — we already know it's hard-invalid.
    effective.twilioLookup = false;
  } else if (localSuspicionPattern && !effective.twilioLookup) {
    // Suspicious BUT Twilio is off — still write the suspicion marker so
    // the scoring engine / tier router can act on it.
    await safeUpdateLead(lead._id, {
      'validation.phone': {
        valid: null,
        validityReason: null,
        suspicionPattern: localSuspicionPattern,
        lineType: null, isVoip: null,
        provider: 'local_nanp_check',
        checkedAt: new Date(),
      },
    });
    summary.phone = { status: 'ok', provider: 'local_nanp_check', valid: null, suspicionPattern: localSuspicionPattern };
  }

  // ── Phone validation (Twilio Lookup, cached) ─────────────────────────────
  // AND-gated: env ENABLE_TWILIO_LOOKUP AND admin toggle twilioLookupEnabled.
  // Skipped when local fake-pattern check already marked the number invalid.
  if (effective.twilioLookup) {
    const [firstName, ...rest] = String(lead.customerName || '').trim().split(/\s+/);
    const lastName = rest.join(' ');
    let phoneResult;
    try {
      // skipIdentityMatch is the FINAL gate for the sub-feature — passed even
      // if env-level identity match is enabled, the admin toggle can suppress it.
      phoneResult = await phoneLookupCache.lookup(lead.customerPhone, {
        firstName, lastName,
        skipIdentityMatch: !effective.twilioIdentityMatch,
      });
    } catch (err) {
      phoneResult = { available: false, status: 'error', provider: 'twilio_lookup_v2',
        packages: [], result: { reason: 'unhandled_error' }, rawRedacted: '', costUsd: 0,
        error: { message: err.message } };
    }

    await persistLog(lead._id, 'phone', phoneResult);

    // Write the normalized result onto the Lead doc so the scoring engine
    // and admin UI can read it via lead.validation.phone.* on the next pass.
    if (phoneResult.available || phoneResult.status === 'cached') {
      // Carrier reputation — env+toggle gated (effective.carrierRep).
      // When off, we write nulls so downstream branches stay uniform.
      const carrierEval = effective.carrierRep
        ? carrierReputation.evaluateCarrier(
            phoneResult.result?.carrierName ?? null,
            phoneResult.result?.lineType ?? null,
          )
        : null;

      const update = {
        valid: phoneResult.result?.valid ?? null,
        // validityReason — set by twilioLookupService when valid is false OR
        // when valid is true but no enrichment data came back. Lets the scoring
        // engine emit specific human-readable reasons (e.g. "fake_pattern:..."
        // vs "twilio_says_invalid" vs "twilio_no_enrichment").
        validityReason: phoneResult.result?.validityReason ?? null,
        // suspicionPattern — preferred from the lookup result (which carries
        // the local suspicion forward through the Twilio call), with the
        // pre-computed local marker as a fallback if the result didn't
        // include it (e.g. Twilio errored before normalization).
        suspicionPattern: phoneResult.result?.suspicionPattern ?? localSuspicionPattern ?? null,
        lineType: phoneResult.result?.lineType ?? null,
        isVoip: phoneResult.result?.isVoip ?? null,
        carrierName: phoneResult.result?.carrierName ?? null,
        // Phase 2 carrier reputation — written only when env flag is on.
        // 'high' forces review in the tier router; 'medium' is informational;
        // 'low'/'unknown' have no tier impact.
        providerSuspicion: carrierEval?.suspicion ?? null,
        providerSuspicionMatched: carrierEval?.matched ?? null,
        providerSuspicionReason: carrierEval?.reason ?? null,
        smsPumpingRisk: phoneResult.result?.smsPumpingRisk ?? null,
        smsPumpingScore: phoneResult.result?.smsPumpingScore ?? null,
        identityMatch: phoneResult.result?.identityMatch ?? null,
        fromCache: phoneResult.result?.fromCache ?? false,
        // provider — 'twilio_lookup_v2' for paid lookups,
        // 'local_nanp_check' for fake-pattern-blocked submissions.
        provider: phoneResult.provider ?? null,
        checkedAt: new Date(),
      };
      await safeUpdateLead(lead._id, { 'validation.phone': update, 'validation.fraud': deriveFraudFromPhone(update) });
    } else if (localSuspicionPattern) {
      // Twilio path errored/skipped before we got a normalized result.
      // Persist the local suspicion marker on its own so tier router still
      // sees it and force-reviews.
      await safeUpdateLead(lead._id, {
        'validation.phone': {
          valid: null,
          validityReason: null,
          suspicionPattern: localSuspicionPattern,
          lineType: null, isVoip: null,
          provider: 'local_nanp_check',
          checkedAt: new Date(),
        },
      });
    }
    summary.phone = { status: phoneResult.status, fromCache: phoneResult.result?.fromCache ?? false, costUsd: phoneResult.costUsd };
  }

  // ── Route validation (Mapbox) ───────────────────────────────────────────
  // AND-gated: env ENABLE_MAPBOX_VALIDATION AND admin toggle mapboxEnabled.
  if (effective.mapbox) {
    let routeResult;
    try {
      routeResult = await mapboxService.validateRoute(lead.originZip, lead.destinationZip, { claimedMiles: lead.miles });
    } catch (err) {
      routeResult = { available: false, status: 'error', provider: 'mapbox',
        result: { reason: 'unhandled_error' }, rawRedacted: '', costUsd: 0,
        error: { message: err.message } };
    }

    await persistLog(lead._id, 'route', routeResult);

    if (routeResult.available) {
      await safeUpdateLead(lead._id, { 'validation.route': { ...routeResult.result, checkedAt: new Date() } });
    }
    summary.route = { status: routeResult.status, suspicious: routeResult.result?.suspicious };
  }

  // ── Fingerprint (stub, no admin toggle yet) ─────────────────────────────
  if (effective.fingerprint) {
    const fpResult = await fingerprintService.verify(lead.fingerprintVisitorId, lead.fingerprintRequestId);
    await persistLog(lead._id, 'fingerprint', fpResult);
    if (fpResult.available) {
      await safeUpdateLead(lead._id, { 'validation.fingerprint': { ...fpResult.result, checkedAt: new Date() } });
    }
    summary.fingerprint = { status: fpResult.status };
  }

  // ── Trigger scoring at the end — ALWAYS, AWAITED (Phase 6.7) ────────
  // The sequential V5 ingest chain (leadIngestV2.js) AWAITS this entire
  // validationPipeline call. Inside, we now AWAIT the scoring run so the
  // chain is truly serial: validation finishes → scoring runs with full
  // validation data → mirrors shadowTier + qualityGateCleared +
  // structuralBlockers → validationPipeline returns to the chain → the
  // chain proceeds to pricing V2 + verifyLeadPhone.
  //
  // Why ALWAYS run scoring (no `anyWritten` gate):
  //   - With Phase 6.7 sequential ingest, validation is the ONLY scoring
  //     trigger. The previous baseline call from ingest is gone — without
  //     this trigger, leads with clean phones + env flags off would never
  //     get scored. Their qualityGateCleared would stay FALSE forever and
  //     mover-visibility would never open.
  //   - Even when no provider wrote enrichment, the engine still produces
  //     a valid tier from the raw lead fields. Running it is cheap and
  //     guarantees the gate flips correctly.
  //   - Scoring errors are caught (try/catch). A scoring failure leaves the
  //     gate at false — the lead stays hidden (safe default), and admin can
  //     rescore manually.
  try {
    await scoringPipeline.runShadow(lead._id);
  } catch (err) {
    console.error(`[validationPipeline] scoring at end failed for ${leadId}:`, err.message);
  }

  return summary;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function persistLog(leadId, type, providerResult) {
  try {
    await ValidationLog.create({
      leadId,
      type,
      provider: providerResult.provider,
      status: providerResult.status,
      result: providerResult.result,
      rawRedacted: providerResult.rawRedacted,
      error: providerResult.error,
      costUsd: providerResult.costUsd || 0,
    });
  } catch (err) {
    // Logging must never block the pipeline
    console.warn(`[validationPipeline] log write failed (${type}):`, err.message);
  }
}

async function safeUpdateLead(leadId, $set) {
  try {
    await Lead.updateOne({ _id: leadId }, { $set });
  } catch (err) {
    console.warn(`[validationPipeline] lead update failed for ${leadId}:`, err.message);
  }
}

// Translate the Twilio Lookup result into the `validation.fraud` shape that
// the scoring engine already reads (smsPumpingRisk, disposable). Defensive —
// returns a minimal object only when we have actionable signal.
function deriveFraudFromPhone(phoneNormalized) {
  const out = {};
  if (phoneNormalized.smsPumpingRisk) out.smsPumpingRisk = phoneNormalized.smsPumpingRisk;
  if (phoneNormalized.isVoip === true) out.disposable = true;
  return out;
}

module.exports = {
  runShadow,
  anyValidationEnabled,
  anyEnvFlagEnabled,
  resolveEffective,
};
