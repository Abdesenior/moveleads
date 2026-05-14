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

/**
 * Should the pipeline even run? Cheap pre-check before reading the lead.
 * Returns true if ANY validation surface is flag-enabled.
 */
function anyValidationEnabled() {
  return twilioLookupService.isEnabled()
    || mapboxService.isEnabled()
    || fingerprintService.isEnabled();
}

/**
 * Run shadow validation for one lead. Safe to call without await.
 *
 * @param {String|ObjectId} leadId
 * @returns {Promise<Object|null>} summary of what ran, or null if skipped/failed
 */
async function runShadow(leadId) {
  // Pre-check: if all flags off, skip the whole pipeline (no DB read needed).
  if (!anyValidationEnabled()) return null;

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

  const summary = { leadId: String(lead._id), phone: null, route: null, fingerprint: null };

  // ── Phone validation (Twilio Lookup, cached) ─────────────────────────────
  if (twilioLookupService.isEnabled()) {
    const [firstName, ...rest] = String(lead.customerName || '').trim().split(/\s+/);
    const lastName = rest.join(' ');
    let phoneResult;
    try {
      phoneResult = await phoneLookupCache.lookup(lead.customerPhone, { firstName, lastName });
    } catch (err) {
      phoneResult = { available: false, status: 'error', provider: 'twilio_lookup_v2',
        packages: [], result: { reason: 'unhandled_error' }, rawRedacted: '', costUsd: 0,
        error: { message: err.message } };
    }

    await persistLog(lead._id, 'phone', phoneResult);

    // Write the normalized result onto the Lead doc so the scoring engine
    // and admin UI can read it via lead.validation.phone.* on the next pass.
    if (phoneResult.available || phoneResult.status === 'cached') {
      const update = {
        valid: phoneResult.result?.valid ?? null,
        lineType: phoneResult.result?.lineType ?? null,
        isVoip: phoneResult.result?.isVoip ?? null,
        carrierName: phoneResult.result?.carrierName ?? null,
        smsPumpingRisk: phoneResult.result?.smsPumpingRisk ?? null,
        smsPumpingScore: phoneResult.result?.smsPumpingScore ?? null,
        identityMatch: phoneResult.result?.identityMatch ?? null,
        fromCache: phoneResult.result?.fromCache ?? false,
        checkedAt: new Date(),
      };
      await safeUpdateLead(lead._id, { 'validation.phone': update, 'validation.fraud': deriveFraudFromPhone(update) });
    }
    summary.phone = { status: phoneResult.status, fromCache: phoneResult.result?.fromCache ?? false, costUsd: phoneResult.costUsd };
  }

  // ── Route validation (Mapbox) ───────────────────────────────────────────
  if (mapboxService.isEnabled()) {
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

  // ── Fingerprint (stub) ──────────────────────────────────────────────────
  if (fingerprintService.isEnabled()) {
    const fpResult = await fingerprintService.verify(lead.fingerprintVisitorId, lead.fingerprintRequestId);
    await persistLog(lead._id, 'fingerprint', fpResult);
    if (fpResult.available) {
      await safeUpdateLead(lead._id, { 'validation.fingerprint': { ...fpResult.result, checkedAt: new Date() } });
    }
    summary.fingerprint = { status: fpResult.status };
  }

  // ── Trigger enriched re-score ───────────────────────────────────────────
  // Fire-and-forget — scoringPipeline.runShadow already swallows its own errors.
  scoringPipeline.runShadow(lead._id).catch(err => {
    console.error(`[validationPipeline] re-score failed for ${leadId}:`, err.message);
  });

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
};
