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
const { isDistributable, describeSystemDecisionSource } = require('../utils/distributionDecision');

const ALLOWED_ACTIONS = new Set(['move_to_deal_room', 'archive', 'restore_to_main']);
const MAX_BULK = 200; // soft cap to keep request payloads + audit volume sane

/**
 * Phase 3 — Deal Room admin write-time gate.
 *
 * Mirrors the unified mover-visibility model: a lead can only be moved to
 * the Deal Room surface if it would actually be visible there. Visibility
 * is determined by the SAME single field that gates the mover feeds
 * (distributionDecision). Each non-distributable value maps to an
 * admin-actionable rejection reason that names the corrective action.
 *
 * Lifecycle/placement issues (past moveDate, expired/non-eligible status)
 * are handled by the per-lead checks in the route handler — this helper
 * only judges the quality decision.
 *
 * Returns null when the lead is OK to move, or a single admin-actionable
 * string explaining the block. Caller pushes the string into rejected[].
 */
function dealRoomMoveBlockReason(lead) {
  if (!lead) return null;
  if (isDistributable(lead.distributionDecision)) return null;

  switch (lead.distributionDecision) {
    case 'admin_rejected':
      return 'Quality: lead was rejected by admin — restore (clear override) before moving.';
    case 'system_rejected':
      return 'Quality: lead was rejected by quality scoring — approve it via the Quality panel before moving.';
    case 'system_held': {
      const source = describeSystemDecisionSource(lead);
      return `Quality: lead is held for review (${source}) — approve via the Quality panel before moving.`;
    }
    case 'system_pending':
      return 'Quality: lead is still being qualified — wait for the pipeline to finish, then retry.';
    default:
      // distributionDecision missing or unrecognized value — safest to block
      // and tell admin to revisit. Backfill should have populated this on
      // every existing lead, so this branch should be unreachable in prod.
      return `Quality: lead has no distribution decision (value=${lead.distributionDecision || 'unset'}) — approve via the Quality panel before moving.`;
  }
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
          reason: 'Lifecycle: already purchased — inventory cannot be changed on a sold lead.',
        });
        continue;
      }

      // Per-lead gates for move_to_deal_room — each one names the axis
      // (Lifecycle / Quality) that's blocking so the operator knows whether
      // to fix the move date, change the status, or approve the lead.
      // Archive and restore_to_main are unaffected — those don't depend on
      // mover visibility.
      if (action === 'move_to_deal_room') {
        const now = new Date();
        if (lead.moveDate && new Date(lead.moveDate) < now) {
          rejected.push({
            leadId,
            reason: "Lifecycle: move date has already passed. Movers can't fulfill past moves — archive this lead instead.",
          });
          continue;
        }
        if (lead.status === 'Expired') {
          rejected.push({
            leadId,
            reason: "Lifecycle: lead is expired and won't be visible in Deal Room. Archive it, or restore an active status before moving.",
          });
          continue;
        }
        if (!['Available', 'READY_FOR_DISTRIBUTION'].includes(lead.status)) {
          rejected.push({
            leadId,
            reason: `Lifecycle: lead status "${lead.status}" is not eligible for Deal Room. Only Available / READY_FOR_DISTRIBUTION leads can be discounted.`,
          });
          continue;
        }
        // Quality-side check: distributionDecision must be distributable.
        // dealRoomMoveBlockReason returns a "Quality: …" string for each
        // non-distributable value (or null if OK to move).
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
