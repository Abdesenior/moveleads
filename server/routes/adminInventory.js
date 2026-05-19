/**
 * Admin Inventory Manager — V1 bulk actions.
 *
 * ONE endpoint, three actions:
 *   move_to_deal_room — mutate buyNowPrice to dealPrice, snapshot originalPrice,
 *                       expire any active auction, set inventoryChannel='deal_room'
 *   archive            — set inventoryChannel='archived' (hides from BOTH mover surfaces)
 *   restore_to_main    — set inventoryChannel='main', restore buyNowPrice from originalPrice.
 *                        IMPORTANT: this does NOT promote the lead back into the
 *                        Live Feed automatically. Legacy auction-stamped leads
 *                        (distributionModel='auction' or undefined) are still
 *                        blocked from the main feed by the Phase D
 *                        distributionModel='instant' filter. "restore_to_main"
 *                        means "return to neutral inventory state" — admin can
 *                        later re-stamp distributionModel='instant' per-lead if
 *                        they want it back in the live feed.
 *
 * Per-lead independence: each lead's mutation is its own findOneAndUpdate.
 * Bulk failure on one lead doesn't roll back others; the response lists
 * processed + rejected separately for caller transparency.
 *
 * Purchased-lead protection: any lead with buyers.length > 0 OR
 * status === 'Purchased' is rejected with reason 'lead has buyers' — admin
 * can't accidentally discount a sold lead and break refund expectations.
 *
 * Audit: every per-lead action writes an AdminAction row
 *   { actor, action: 'lead.inventory.<verb>', targetType: 'lead', targetId,
 *     before, after, metadata }
 *
 * Gating: ENABLE_DEAL_ROOM env flag. When off → 503 with explicit message
 * (NOT 404, because admin needs to know the feature exists but is disabled).
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const Lead = require('../models/Lead');
const { logAdminAction } = require('../utils/auditLog');
const { isEnabled } = require('../utils/dealRoomFeature');
const { computeStructuralBlockers, HIDE_WORTHY_STRUCTURAL_CODES } = require('../utils/leadVisibility');

const ALLOWED_ACTIONS = new Set(['move_to_deal_room', 'archive', 'restore_to_main']);
const MAX_BULK = 200; // soft cap to keep request payloads + audit volume sane

// Human-readable label per structural blocker code — used to compose admin
// rejection messages. Codes not listed fall back to the raw code.
const STRUCTURAL_LABEL = {
  invalid_phone: 'invalid phone',
  route_unresolved: 'route unresolved',
  distance_unknown: 'distance unknown',
  suspicious_carrier: 'suspicious carrier',
  suspicion_pattern: 'suspicious phone pattern',
  low_confidence_plus_pattern: 'low-confidence telecom + pattern',
  high_sms_pumping: 'high SMS-pumping risk',
  fingerprint_bot: 'confirmed bot fingerprint',
};

/**
 * Tier-1 visibility mirror — runs at admin write time, before any mutation.
 *
 * Mirrors the strict (`blocked_and_review`-equivalent) semantics of
 * server/utils/leadVisibility.moverVisibilityFilter / isHiddenFromMovers,
 * but independent of ENABLE_TIERED_ROUTING. Why force strict semantics here
 * regardless of env: if admin discounts a lead now and the env later flips
 * to a stricter mode, the lead would silently vanish from mover Deal Room
 * (the production bug this guardrail closes). Apply the strictest filter
 * at write time so the move is durable.
 *
 * Returns null when the lead is OK to move, or a single admin-actionable
 * string explaining the block. Caller pushes the string into rejected[].
 */
function dealRoomMoveBlockReason(lead) {
  if (!lead) return null;
  if (lead.status === 'REJECTED_FAKE') {
    return 'Lead is flagged as fake (status=REJECTED_FAKE) — archive it instead.';
  }
  if (lead.adminTierOverride && lead.adminTierOverride.tier === 'rejected') {
    return 'Admin rejected this lead via tier override — clear the override before moving.';
  }
  if (lead.shadowTier === 'rejected') {
    return 'Rejected by quality scoring — archive instead.';
  }
  if (lead.qualityGateCleared === false) {
    return 'Quality gate not cleared — wait for qualification to finish, then retry.';
  }
  // Structural blockers — prefer the denormalized field, then fall back to
  // computing them inline from raw validation. Either source can be
  // authoritative: denormalized arrays can lag on very old leads, and
  // computed-inline misses any code that was set by a past pipeline but
  // whose underlying signal has since been cleared. Union catches both.
  const denorm = Array.isArray(lead.structuralBlockers) ? lead.structuralBlockers : [];
  const computed = computeStructuralBlockers(lead);
  const all = Array.from(new Set([...denorm, ...computed]));
  const hits = all.filter(c => HIDE_WORTHY_STRUCTURAL_CODES.includes(c));
  if (hits.length > 0) {
    const labels = hits.map(c => STRUCTURAL_LABEL[c] || c);
    return `Structural blockers (${labels.join(', ')}) — lead cannot be shown in Deal Room.`;
  }
  return null;
}

router.post('/bulk', [auth, admin], async (req, res) => {
  if (!isEnabled()) {
    return res.status(503).json({ ok: false, msg: 'Deal Room feature is disabled (ENABLE_DEAL_ROOM=false)' });
  }

  const { leadIds, action, dealPrice, discountPercent, reason } = req.body || {};

  // ── Input validation ────────────────────────────────────────────────────
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ ok: false, msg: 'leadIds must be a non-empty array' });
  }
  if (leadIds.length > MAX_BULK) {
    return res.status(400).json({ ok: false, msg: `bulk size capped at ${MAX_BULK} leads per request` });
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    return res.status(400).json({ ok: false, msg: `action must be one of: ${[...ALLOWED_ACTIONS].join(', ')}` });
  }
  // move_to_deal_room accepts EITHER dealPrice (uniform across selection) OR
  // discountPercent (computed per-lead from each lead's pre-deal price).
  // Exactly one must be provided.
  if (action === 'move_to_deal_room') {
    const dpProvided = dealPrice !== undefined && dealPrice !== null && dealPrice !== '';
    const pctProvided = discountPercent !== undefined && discountPercent !== null && discountPercent !== '';
    if (dpProvided === pctProvided) {
      return res.status(400).json({ ok: false, msg: 'provide exactly one of dealPrice OR discountPercent for move_to_deal_room' });
    }
    if (dpProvided) {
      const dp = Number(dealPrice);
      if (!Number.isFinite(dp) || dp <= 0) {
        return res.status(400).json({ ok: false, msg: 'dealPrice must be a positive number' });
      }
    }
    if (pctProvided) {
      const pct = Number(discountPercent);
      if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
        return res.status(400).json({ ok: false, msg: 'discountPercent must be a number in (0, 100)' });
      }
    }
  }

  // De-dup + validate ObjectIds. Invalid ids land in rejected with a clear reason.
  const validIds = [];
  const rejected = [];
  const seen = new Set();
  for (const raw of leadIds) {
    const s = String(raw);
    if (seen.has(s)) continue;
    seen.add(s);
    if (!mongoose.isValidObjectId(s)) {
      rejected.push({ leadId: s, reason: 'Invalid lead id format.' });
      continue;
    }
    validIds.push(s);
  }

  // ── Per-lead processing ─────────────────────────────────────────────────
  const processed = [];
  for (const leadId of validIds) {
    try {
      const lead = await Lead.findById(leadId);
      if (!lead) {
        rejected.push({ leadId, reason: 'Lead no longer exists.' });
        continue;
      }

      // Purchased-lead protection — applies to ALL three actions. We never
      // mutate inventory on a lead that someone already paid for.
      const hasBuyers = Array.isArray(lead.buyers) && lead.buyers.length > 0;
      if (hasBuyers || lead.status === 'Purchased') {
        rejected.push({
          leadId,
          reason: 'Already purchased — inventory cannot be changed on a sold lead.',
        });
        continue;
      }

      // Phase 1.7 — move_to_deal_room must fail leads that would silently
      // disappear on the mover side. The /api/leads/deals query requires:
      //   status IN ['Available', 'READY_FOR_DISTRIBUTION']
      //   moveDate >= now
      // Without these pre-checks, admin sees "moved" but the mover Deal
      // Room shows nothing. Reject early with admin-actionable messages.
      // Archive and restore_to_main are unaffected — those don't depend on
      // mover visibility.
      if (action === 'move_to_deal_room') {
        const now = new Date();
        if (lead.moveDate && new Date(lead.moveDate) < now) {
          rejected.push({
            leadId,
            reason: "Move date has already passed. Movers can't fulfill past moves — archive this lead instead.",
          });
          continue;
        }
        if (lead.status === 'Expired') {
          rejected.push({
            leadId,
            reason: "Lead is expired and won't be visible in Deal Room. Archive it, or restore an active status before moving.",
          });
          continue;
        }
        if (!['Available', 'READY_FOR_DISTRIBUTION'].includes(lead.status)) {
          rejected.push({
            leadId,
            reason: `Lead status "${lead.status}" is not eligible for Deal Room. Only Available / READY_FOR_DISTRIBUTION leads can be discounted.`,
          });
          continue;
        }
        // Phase 1.9 — Tier 1 quality-side visibility mirror. Mirrors the
        // mover Deal Room's moverVisibilityFilter() at admin write time, so
        // a "moved" lead is guaranteed to actually be visible to movers.
        // Independent of ENABLE_TIERED_ROUTING (see helper doc-comment).
        const qualityBlockReason = dealRoomMoveBlockReason(lead);
        if (qualityBlockReason) {
          rejected.push({ leadId, reason: qualityBlockReason });
          continue;
        }
      }

      const before = {
        inventoryChannel: lead.inventoryChannel,
        buyNowPrice: lead.buyNowPrice,
        originalPrice: lead.originalPrice,
        auctionStatus: lead.auctionStatus,
      };

      if (action === 'move_to_deal_room') {
        // Snapshot the pre-deal price ONCE — re-moving a lead that's already
        // in Deal Room should NOT overwrite the original (otherwise repeated
        // moves would erase the true pre-deal anchor).
        if (lead.originalPrice == null) {
          lead.originalPrice = lead.buyNowPrice;
        }
        // Compute the per-lead deal price. With dealPrice → uniform. With
        // discountPercent → derived per-lead from each lead's originalPrice.
        let dp;
        if (dealPrice !== undefined && dealPrice !== null && dealPrice !== '') {
          dp = Number(dealPrice);
        } else {
          const pct = Number(discountPercent);
          dp = Math.max(1, Math.round(lead.originalPrice * (1 - pct / 100)));
        }
        // Sanity: deal price can't exceed the original (defines "discount").
        // Block at endpoint level — UI can already validate this, but the
        // server check is the canonical guard.
        if (dp > lead.originalPrice) {
          rejected.push({
            leadId,
            reason: `Deal price $${dp} is higher than this lead's current price $${lead.originalPrice}. Lower the deal price or deselect this lead.`,
          });
          continue;
        }
        lead.buyNowPrice = dp;
        lead.inventoryChannel = 'deal_room';
        // Park any active auction so the settle cron stops considering this
        // lead. The new inventoryChannel clause on the cron query is the
        // primary defense; this is belt-and-suspenders.
        if (lead.auctionStatus === 'active') {
          lead.auctionStatus = 'expired';
        }
      } else if (action === 'archive') {
        lead.inventoryChannel = 'archived';
      } else if (action === 'restore_to_main') {
        // Restore the pre-deal price if we have it.
        if (lead.originalPrice != null) {
          lead.buyNowPrice = lead.originalPrice;
        }
        lead.inventoryChannel = 'main';
        // NOTE: does NOT modify distributionModel. Legacy 'auction' leads
        // remain blocked from the live feed by Phase D — admin would need
        // to re-stamp distributionModel='instant' separately to surface
        // them in /dashboard/leads. By design (see route doc-comment).
      }

      await lead.save();

      const after = {
        inventoryChannel: lead.inventoryChannel,
        buyNowPrice: lead.buyNowPrice,
        originalPrice: lead.originalPrice,
        auctionStatus: lead.auctionStatus,
      };

      logAdminAction({
        actor: req.user.id,
        action: `lead.inventory.${action}`,
        targetType: 'lead',
        targetId: lead._id,
        before,
        after,
        metadata: {
          dealPrice: action === 'move_to_deal_room' ? after.buyNowPrice : undefined,
          discountPercent: action === 'move_to_deal_room' && discountPercent ? Number(discountPercent) : undefined,
          reason: reason || undefined,
        },
      });

      processed.push({ leadId: String(lead._id), action, before, after });
    } catch (err) {
      console.error(`[Admin Inventory] ${action} failed for ${leadId}:`, err.message);
      rejected.push({ leadId, reason: err.message || 'internal error' });
    }
  }

  res.json({
    ok: true,
    action,
    processedCount: processed.length,
    rejectedCount: rejected.length,
    processed,
    rejected,
  });
});

module.exports = router;
