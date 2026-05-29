/**
 * dispatchApprovedLead — canonical post-approval distribution orchestrator.
 *
 * Both the AUTO-approval path (verifyLeadPhone in services/twilioService.js)
 * and the ADMIN-approval path (POST /api/admin/leads/:id/approve in
 * routes/admin.js) MUST converge on this single helper so the channel +
 * idempotency + race semantics stay identical across paths.
 *
 * Channels fanned out (in order, fire-and-forget per channel):
 *   1. SMS broadcast      — twilioService.broadcastLeadSMS
 *   2. Email broadcast    — emailService.broadcastLeadEmail
 *   3. Socket emit        — socketService.emitNewLead (realtime dashboard
 *                           push for already-logged-in movers)
 *
 * Bug history (2026-05-28):
 *   The admin approval flow used to write the right DB state
 *   (distributionDecision='admin_approved', status='READY_FOR_DISTRIBUTION',
 *   qualityGateCleared=true) and then return immediately without firing
 *   ANY of the three channels. Suspicious / manually-reviewed leads
 *   silently entered the marketplace; movers saw them only on next
 *   refresh; no SMS, no email, no socket push, no claimWindow open.
 *   This helper exists so the two paths cannot drift again.
 *
 * Idempotency contract:
 *   Each underlying broadcaster owns its own dedup guard:
 *     - broadcastLeadSMS  : atomic notifiedAt:null → new Date() flip
 *     - broadcastLeadEmail: same notifiedAt CAS shape
 *     - emitNewLead       : checks lead.notifiedAt at emit time
 *   Calling this orchestrator twice for the same lead is therefore safe:
 *   the per-channel guards short-circuit on the second call (logged but
 *   no double send). To bypass the dedup for an explicit admin
 *   re-broadcast, pass { force: true } — each broadcaster honors it.
 *
 * Defense-in-depth visibility:
 *   Re-reads the lead via the fresh DB path (isHiddenFromMoversById).
 *   If the lead is not distributable at dispatch time, returns silently
 *   with the reason. This protects against a caller invoking us with
 *   stale state or with a lead that flipped back to a non-distributable
 *   decision between caller action and orchestrator execution.
 *
 * Failure isolation:
 *   Each per-channel call has its own .catch. A failure on one channel
 *   does NOT cascade to the others, does not surface to the orchestrator
 *   caller, and does not affect the lead's DB state.
 *
 * Scope discipline (what this orchestrator deliberately does NOT do):
 *   - NO financial writes (no Lead mutations, no User balance changes,
 *     no PurchasedLead, no Transaction)
 *   - NO claimWindow writes (openClaimWindow is invoked inside
 *     broadcastLeadSMS — already correct, do not duplicate)
 *   - NO admin-notification email (sendAdminLeadNotification is the
 *     auto-approval admin email; admin-approval doesn't need it because
 *     the admin already knows — they just clicked the button)
 *   - NO direct Twilio API calls
 *
 * @param {String|Object} leadOrId — lead _id (ObjectId or string) OR a
 *   lead document (the orchestrator extracts ._id and re-reads).
 * @param {Object} [opts]
 * @param {boolean} [opts.force=false] — bypass per-channel notifiedAt
 *   dedup. Use for explicit admin re-broadcast tooling.
 * @param {string} [opts.source='unknown'] — free-form caller tag for log
 *   lines ('verifyLeadPhone' / 'admin.approve' / future tags). Helps
 *   operator triage when a dispatch fires from an unexpected path.
 * @returns {Promise<{ dispatched: boolean, reason?: string }>}
 */
async function dispatchApprovedLead(leadOrId, { force = false, source = 'unknown' } = {}) {
  // Lazy requires to avoid the circular dep between this orchestrator and
  // services/twilioService.js (which contains verifyLeadPhone, a caller).
  // Same pattern as isHiddenFromMoversById's internal Lead require.
  const Lead = require('../models/Lead');
  const { isHiddenFromMoversById } = require('../utils/leadVisibility');

  const id = (leadOrId && leadOrId._id) ? leadOrId._id : leadOrId;
  if (!id) {
    console.warn(`[dispatchApprovedLead] no lead id provided (source=${source}); skipping`);
    return { dispatched: false, reason: 'no_id' };
  }

  // PR-4 broadcast manifest — record that an attempt happened. Best-effort:
  // a failed write here MUST NOT block dispatch (observability cannot
  // regress behavior). Single source of truth for lastBroadcastAttemptAt.
  Lead.updateOne(
    { _id: id },
    { $set: { lastBroadcastAttemptAt: new Date() } }
  ).catch(err =>
    console.error(`[dispatchApprovedLead] manifest.attemptAt write failed for ${id}: ${err.message}`)
  );

  // Defense-in-depth visibility check using the fresh DB path. If the
  // lead is not distributable at dispatch time, we silently no-op —
  // the per-channel broadcasters would short-circuit on isHiddenFromMovers
  // anyway, but this saves us three unnecessary DB reads + log noise.
  const check = await isHiddenFromMoversById(id);
  if (check.hidden) {
    console.log(
      `[dispatchApprovedLead] suppressed for ${id} — ${check.reason} ` +
      `(source=${source})`
    );
    // PR-4 — persist the visibility-level suppress reason. This is the
    // MOST SPECIFIC reason at this layer (e.g. distributionDecision=
    // system_held). The SMS path's vaguer reasons (sms_no_coverage etc.)
    // only fire when we reach the broadcaster — which doesn't happen here.
    Lead.updateOne(
      { _id: id },
      { $set: { lastBroadcastSuppressReason: check.reason } }
    ).catch(err =>
      console.error(`[dispatchApprovedLead] manifest.suppressReason write failed for ${id}: ${err.message}`)
    );
    return { dispatched: false, reason: check.reason };
  }

  // Reload the full doc for the broadcasters so they see the post-approval
  // fields (distributionDecision, status, qualityGateCleared, etc.) along
  // with all other denormalized state.
  const fresh = await Lead.findById(id).lean();
  if (!fresh) {
    console.warn(`[dispatchApprovedLead] lead ${id} not found (source=${source}); skipping`);
    return { dispatched: false, reason: 'not_found' };
  }

  // PR-4 — proceeding to broadcast. Clear any stale suppress reason from
  // a previous attempt (e.g. a lead that was system_held last time and is
  // now admin_approved). We only clear the REASON; matchedCount and
  // attemptAt are independently maintained by the SMS path and the
  // attemptAt write above.
  Lead.updateOne(
    { _id: id },
    { $set: { lastBroadcastSuppressReason: null } }
  ).catch(err =>
    console.error(`[dispatchApprovedLead] manifest.suppressReason clear failed for ${id}: ${err.message}`)
  );

  console.log(
    `[dispatchApprovedLead] dispatching lead=${id} source=${source} force=${force}`
  );

  // Lazy require the broadcasters — services/twilioService.js is allowed to
  // require this orchestrator (verifyLeadPhone is a caller).
  const { broadcastLeadSMS } = require('./twilioService');
  const { broadcastLeadEmail } = require('./emailService');
  const socketService = require('./socketService');

  // Fire-and-forget per channel. Each broadcaster has its own try/catch
  // + notifiedAt dedup; a failure on one channel does NOT cascade.
  broadcastLeadSMS(fresh, { force }).catch(err =>
    console.error(`[dispatchApprovedLead] broadcastLeadSMS error for ${id}: ${err.message}`)
  );
  broadcastLeadEmail(fresh, { force }).catch(err =>
    console.error(`[dispatchApprovedLead] broadcastLeadEmail error for ${id}: ${err.message}`)
  );
  try {
    socketService.emitNewLead(fresh, { force });
  } catch (err) {
    // emitNewLead is synchronous (returns void); a throw here is caught
    // inline so we mirror the .catch posture of the SMS/email paths.
    console.error(`[dispatchApprovedLead] emitNewLead error for ${id}: ${err.message}`);
  }

  return { dispatched: true };
}

module.exports = { dispatchApprovedLead };
