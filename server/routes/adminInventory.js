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

const ALLOWED_ACTIONS = new Set(['move_to_deal_room', 'archive', 'restore_to_main']);
const MAX_BULK = 200; // soft cap to keep request payloads + audit volume sane

router.post('/bulk', [auth, admin], async (req, res) => {
  if (!isEnabled()) {
    return res.status(503).json({ ok: false, msg: 'Deal Room feature is disabled (ENABLE_DEAL_ROOM=false)' });
  }

  const { leadIds, action, dealPrice, reason } = req.body || {};

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
  // dealPrice is REQUIRED for move_to_deal_room, ignored otherwise.
  if (action === 'move_to_deal_room') {
    const dp = Number(dealPrice);
    if (!Number.isFinite(dp) || dp <= 0) {
      return res.status(400).json({ ok: false, msg: 'dealPrice must be a positive number for move_to_deal_room' });
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
      rejected.push({ leadId: s, reason: 'invalid ObjectId' });
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
        rejected.push({ leadId, reason: 'lead not found' });
        continue;
      }

      // Purchased-lead protection — applies to ALL three actions. We never
      // mutate inventory on a lead that someone already paid for.
      const hasBuyers = Array.isArray(lead.buyers) && lead.buyers.length > 0;
      if (hasBuyers || lead.status === 'Purchased') {
        rejected.push({ leadId, reason: 'lead has buyers (purchased)' });
        continue;
      }

      const before = {
        inventoryChannel: lead.inventoryChannel,
        buyNowPrice: lead.buyNowPrice,
        originalPrice: lead.originalPrice,
        auctionStatus: lead.auctionStatus,
      };

      if (action === 'move_to_deal_room') {
        const dp = Number(dealPrice);
        // Snapshot the pre-deal price ONCE — re-moving a lead that's already
        // in Deal Room should NOT overwrite the original (otherwise repeated
        // moves would erase the true pre-deal anchor).
        if (lead.originalPrice == null) {
          lead.originalPrice = lead.buyNowPrice;
        }
        // Sanity: deal price can't exceed the original (defines "discount").
        // Block at endpoint level — UI can already validate this, but the
        // server check is the canonical guard.
        if (dp > lead.originalPrice) {
          rejected.push({ leadId, reason: `dealPrice ($${dp}) > originalPrice ($${lead.originalPrice})` });
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
        metadata: { dealPrice: action === 'move_to_deal_room' ? Number(dealPrice) : undefined, reason: reason || undefined },
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
