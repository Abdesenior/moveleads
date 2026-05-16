/**
 * Admin Analytics Router — Phase 5 (visibility-only).
 *
 * READ-ONLY endpoints that aggregate Lead / ScoringSnapshot / ValidationLog /
 * AdminAction collections for the /admin/quality-analytics dashboard. NEVER
 * mutates a Lead. Designed so a query failure returns an empty/error shape
 * rather than 500-ing the admin UI.
 *
 * Endpoints:
 *   GET /quality-analytics?days=7&funnelVersion=&source=&tier=&status=
 *      → tier distribution + distribution-readiness + cap reasons +
 *        review-queue ops + funnel breakdown
 *
 *   GET /carrier-analytics?days=30
 *      → top carriers + suspicion bucket distribution + suspicion-by-tier
 *        + suspicion-by-admin-outcome
 *
 *   GET /pricing-analytics?days=7
 *      → average legacy vs simple-engine prices + delta stats + rule
 *        frequency + per-tier / per-home-size / per-distance class
 *        breakdowns. Comparison sample is restricted to leads still priced
 *        by the legacy engine (pricingEngineVersion !== 'simple') so the
 *        delta is meaningful — simple-stamped leads have buyNowPrice ===
 *        priceShadowSimple by construction. Long-term marketplace
 *        observability surface; intentionally NOT migration-flavoured.
 *
 *   GET /validation-costs?days=7
 *      → call counts + estimated cost by provider/type
 *
 *   GET /leads/:id/action-timeline
 *      → AdminAction history for a single lead (no aggregation, just sort)
 *
 * Notes on aggregation:
 *   - Default time range is 7 days; `?days=N` clamps to [1, 365]
 *   - All endpoints are admin-only (mounted behind verifiedGate + auth + admin)
 *   - We compute distribution status per-lead in JS (not in Mongo) because
 *     computeDistributionStatus() is too complex for the aggregation pipeline.
 *     Volumes are small (a few thousand leads per week) so the JS pass is fine.
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');

const Lead = require('../models/Lead');
const ScoringSnapshot = require('../models/ScoringSnapshot');
const ValidationLog = require('../models/ValidationLog');
const AdminAction = require('../models/AdminAction');
const { computeDistributionStatus } = require('../utils/distributionStatus');
const { toMoverLabel } = require('../utils/tierLabels');

// ── Helpers ─────────────────────────────────────────────────────────────────

function clampDays(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(365, Math.floor(n)));
}

function dateRange(daysParam) {
  const days = clampDays(daysParam);
  const since = new Date(Date.now() - days * 86400000);
  return { days, since };
}

function safeBucket(map, key) {
  if (!map[key]) map[key] = 0;
  map[key] += 1;
}

function topN(map, n = 25) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function average(nums) {
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

// Fetch the latest ScoringSnapshot per lead in a given list. Snapshot-history
// may have multiple per lead (baseline + enriched); we take the freshest by
// createdAt and key by leadId. Caller passes Lead._ids; we do one Mongo round
// trip + an in-memory sort.
async function fetchLatestSnapshots(leadIds) {
  if (!leadIds.length) return new Map();
  const snaps = await ScoringSnapshot.find({ leadId: { $in: leadIds } })
    .sort({ createdAt: -1 })
    .select('leadId tier scores createdAt')
    .lean();
  const byLead = new Map();
  for (const s of snaps) {
    const key = String(s.leadId);
    if (!byLead.has(key)) byLead.set(key, s);  // first one is freshest (sorted desc)
  }
  return byLead;
}

function distanceClass(miles) {
  const m = Number(miles) || 0;
  if (m <= 0) return 'unknown';
  if (m < 100) return 'local';
  if (m < 500) return 'short';
  if (m < 1000) return 'medium';
  return 'long';
}

// ── 1. Quality Analytics ────────────────────────────────────────────────────

router.get('/quality-analytics', [auth, admin], async (req, res) => {
  try {
    const { days, since } = dateRange(req.query.days);
    const filter = { createdAt: { $gte: since } };
    if (req.query.funnelVersion) filter.funnelVersion = String(req.query.funnelVersion);
    if (req.query.source) filter.source = String(req.query.source);
    if (req.query.status) filter.status = String(req.query.status);

    // Pull leads needed for the distribution & cap-reasons computation.
    // Only the fields used by computeDistributionStatus + readability fields.
    const leads = await Lead.find(filter)
      .select('status validation intentConfirmed miles funnelVersion source adminTierOverride moveDate reviewedAt customerName originCity destinationCity createdAt')
      .lean();

    const leadIds = leads.map(l => l._id);
    const snaps = await fetchLatestSnapshots(leadIds);

    // Apply optional tier filter (post-snapshot — tier lives on snapshot)
    const tierFilter = req.query.tier ? String(req.query.tier) : null;

    const tierCounts = {};         // raw enum
    const tierMoverCounts = {};    // mover-friendly label
    const statusCounts = { Ready: 0, 'Review Required': 0, Blocked: 0, Rejected: 0 };
    const capReasonCounts = {};
    const phoneTrustCounts = { trusted: 0, voip: 0, invalid: 0, suspicious_carrier: 0, low_confidence: 0, unverified: 0, unknown: 0 };
    const routeStatusCounts = { resolved: 0, unresolved: 0, unknown: 0 };
    const fraudCounts = { high_sms_pumping: 0, medium_sms_pumping: 0, fingerprint_bot: 0, fingerprint_vpn: 0 };
    const funnelBreakdown = {};
    const sourceBreakdown = {};
    const v5VsV4 = { v4: { count: 0, ready: 0, review: 0, rejected: 0 }, v5: { count: 0, ready: 0, review: 0, rejected: 0 } };

    // Review queue ops accumulators
    const now = new Date();
    let openReviewCount = 0;
    let oldestReviewAgeMs = 0;
    const reviewAgesMs = [];
    let reviewMovingWithin7d = 0;
    let reviewMovingWithin3d = 0;

    let filteredCount = 0;

    for (const lead of leads) {
      const snap = snaps.get(String(lead._id)) || null;
      const tier = snap?.tier || lead.adminTierOverride?.tier || null;

      if (tierFilter && tier !== tierFilter) continue;
      filteredCount += 1;

      const dist = computeDistributionStatus(lead, snap);

      // Tier distribution (raw + mover-facing)
      if (tier) {
        safeBucket(tierCounts, tier);
        const friendly = toMoverLabel(tier) || tier;
        safeBucket(tierMoverCounts, friendly);
      } else {
        safeBucket(tierCounts, 'unscored');
        safeBucket(tierMoverCounts, 'Unscored');
      }

      // Distribution-readiness counts
      if (dist?.status && statusCounts[dist.status] != null) statusCounts[dist.status] += 1;

      // Cap reasons
      for (const r of (dist?.capReasons || [])) {
        safeBucket(capReasonCounts, r.code);
      }

      // Phone trust slicing (rough — based on validation.phone fields)
      const phone = lead.validation?.phone;
      if (phone?.valid === false) phoneTrustCounts.invalid += 1;
      else if (phone?.providerSuspicion === 'high') phoneTrustCounts.suspicious_carrier += 1;
      else if (phone?.isVoip === true) phoneTrustCounts.voip += 1;
      else if (phone?.validityReason === 'twilio_no_enrichment') phoneTrustCounts.low_confidence += 1;
      else if (phone?.lineType === 'mobile' && phone?.smsPumpingRisk === 'low' && !phone?.suspicionPattern) phoneTrustCounts.trusted += 1;
      else if (!phone || !phone.checkedAt) phoneTrustCounts.unverified += 1;
      else phoneTrustCounts.unknown += 1;

      // Route status
      const rs = lead.validation?.route;
      const routeSus = Array.isArray(rs?.suspicious) ? rs.suspicious : [];
      if (routeSus.includes('origin_zip_not_found') || routeSus.includes('destination_zip_not_found')) routeStatusCounts.unresolved += 1;
      else if (rs?.checkedAt) routeStatusCounts.resolved += 1;
      else routeStatusCounts.unknown += 1;

      // Fraud signal frequency
      const fraud = lead.validation?.fraud;
      if (fraud?.smsPumpingRisk === 'high') fraudCounts.high_sms_pumping += 1;
      else if (fraud?.smsPumpingRisk === 'medium') fraudCounts.medium_sms_pumping += 1;
      const fp = lead.validation?.fingerprint;
      if (fp?.bot === true) fraudCounts.fingerprint_bot += 1;
      if (fp?.vpn === true) fraudCounts.fingerprint_vpn += 1;

      // Funnel + source breakdown
      const fv = lead.funnelVersion || 'legacy';
      safeBucket(funnelBreakdown, fv);
      const src = lead.source || 'direct';
      safeBucket(sourceBreakdown, src);

      // V5 vs V4 quality bucket
      const bucket = (fv === 'v5') ? v5VsV4.v5 : v5VsV4.v4;
      bucket.count += 1;
      if (dist?.status === 'Ready') bucket.ready += 1;
      else if (dist?.status === 'Review Required' || dist?.status === 'Blocked') bucket.review += 1;
      else if (dist?.status === 'Rejected') bucket.rejected += 1;

      // Review queue ops — leads currently in Review Required and not yet reviewed
      const isOpenReview = (dist?.status === 'Review Required') && !lead.reviewedAt;
      if (isOpenReview) {
        openReviewCount += 1;
        const ageMs = now - new Date(lead.createdAt);
        reviewAgesMs.push(ageMs);
        if (ageMs > oldestReviewAgeMs) oldestReviewAgeMs = ageMs;
        if (lead.moveDate) {
          const daysToMove = (new Date(lead.moveDate) - now) / 86400000;
          if (daysToMove >= 0 && daysToMove <= 7) reviewMovingWithin7d += 1;
          if (daysToMove >= 0 && daysToMove <= 3) reviewMovingWithin3d += 1;
        }
      }
    }

    // Admin actions today (counts of approve / reject / rescore / override / mark_reviewed)
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    let actionsToday = { approved: 0, rejected: 0, rescored: 0, overrides_set: 0, overrides_cleared: 0, marked_reviewed: 0 };
    try {
      const todays = await AdminAction.find({
        createdAt: { $gte: todayStart },
        action: { $in: [
          'lead.approve', 'lead.reject', 'lead.rescore',
          'lead.tier_override.set', 'lead.tier_override.clear', 'lead.mark_reviewed',
        ]},
      }).select('action').lean();
      for (const a of todays) {
        if (a.action === 'lead.approve') actionsToday.approved += 1;
        else if (a.action === 'lead.reject') actionsToday.rejected += 1;
        else if (a.action === 'lead.rescore') actionsToday.rescored += 1;
        else if (a.action === 'lead.tier_override.set') actionsToday.overrides_set += 1;
        else if (a.action === 'lead.tier_override.clear') actionsToday.overrides_cleared += 1;
        else if (a.action === 'lead.mark_reviewed') actionsToday.marked_reviewed += 1;
      }
    } catch (err) {
      console.warn('[adminAnalytics] AdminAction query failed:', err.message);
    }

    res.json({
      ok: true,
      range: { days, since },
      filters: { funnelVersion: req.query.funnelVersion || null, source: req.query.source || null, tier: tierFilter, status: req.query.status || null },
      totalLeads: leads.length,
      filteredLeads: filteredCount,
      tierDistribution: { raw: tierCounts, moverFacing: tierMoverCounts },
      distributionStatus: statusCounts,
      capReasons: topN(capReasonCounts, 25),
      phoneTrust: phoneTrustCounts,
      routeStatus: routeStatusCounts,
      fraudSignals: fraudCounts,
      funnelBreakdown,
      sourceBreakdown,
      v5VsV4,
      reviewQueue: {
        openReviewCount,
        averageAgeHours: reviewAgesMs.length ? Math.round((average(reviewAgesMs) / 3600000) * 10) / 10 : 0,
        oldestAgeHours: Math.round((oldestReviewAgeMs / 3600000) * 10) / 10,
        movingWithin7d: reviewMovingWithin7d,
        movingWithin3d: reviewMovingWithin3d,
      },
      actionsToday,
    });
  } catch (err) {
    console.error('[quality-analytics]', err.message);
    res.status(500).json({ ok: false, msg: 'Analytics query failed', error: err.message });
  }
});

// ── 2. Carrier Analytics ────────────────────────────────────────────────────

router.get('/carrier-analytics', [auth, admin], async (req, res) => {
  try {
    const { days, since } = dateRange(req.query.days || 30);
    const leads = await Lead.find({
      createdAt: { $gte: since },
      'validation.phone.carrierName': { $exists: true, $ne: null },
    })
      .select('validation status reviewedAt adminTierOverride')
      .lean();

    const leadIds = leads.map(l => l._id);
    const snaps = await fetchLatestSnapshots(leadIds);

    const carrierCount = {};       // carrierName → count
    const suspicionCounts = { high: 0, medium: 0, low: 0, unknown: 0 };
    const suspicionByTier = {};    // tier → { high, medium, low, unknown }
    const suspicionByOutcome = { high: { reviewed: 0, rejected: 0, approved: 0, untouched: 0 } };
    const carrierTable = {};       // carrierName → { category, seen, reviewed, approved, rejected, lastSeen }

    for (const lead of leads) {
      const phone = lead.validation?.phone || {};
      const name = phone.carrierName || 'unknown';
      safeBucket(carrierCount, name);

      const susp = phone.providerSuspicion || 'unknown';
      if (suspicionCounts[susp] != null) suspicionCounts[susp] += 1;

      const snap = snaps.get(String(lead._id));
      const tier = snap?.tier || lead.adminTierOverride?.tier || 'unscored';
      if (!suspicionByTier[tier]) suspicionByTier[tier] = { high: 0, medium: 0, low: 0, unknown: 0 };
      if (suspicionByTier[tier][susp] != null) suspicionByTier[tier][susp] += 1;

      // Per-carrier table
      if (!carrierTable[name]) {
        carrierTable[name] = {
          carrierName: name,
          category: susp,
          seen: 0, reviewed: 0, approved: 0, rejected: 0,
          lastSeen: null,
        };
      }
      const row = carrierTable[name];
      row.seen += 1;
      if (lead.reviewedAt) row.reviewed += 1;
      if (lead.adminTierOverride?.tier && ['hot', 'premium', 'standard'].includes(lead.adminTierOverride.tier)) row.approved += 1;
      if (lead.status === 'REJECTED_FAKE' || lead.adminTierOverride?.tier === 'rejected') row.rejected += 1;
      if (!row.lastSeen || phone.checkedAt > row.lastSeen) row.lastSeen = phone.checkedAt || null;

      // Outcome of high-suspicion specifically (over-flag detector)
      if (susp === 'high') {
        if (lead.adminTierOverride?.tier && ['hot', 'premium', 'standard'].includes(lead.adminTierOverride.tier)) {
          suspicionByOutcome.high.approved += 1; // admin overrode our suspicion → likely false positive
        } else if (lead.status === 'REJECTED_FAKE' || lead.adminTierOverride?.tier === 'rejected') {
          suspicionByOutcome.high.rejected += 1; // admin agreed → likely true positive
        } else if (lead.reviewedAt) {
          suspicionByOutcome.high.reviewed += 1; // admin looked but didn't override
        } else {
          suspicionByOutcome.high.untouched += 1;
        }
      }
    }

    res.json({
      ok: true,
      range: { days, since },
      totalLeadsWithCarrier: leads.length,
      topCarriers: topN(carrierCount, 25),
      suspicionDistribution: suspicionCounts,
      suspicionByTier,
      suspicionByOutcome,
      carrierTable: Object.values(carrierTable).sort((a, b) => b.seen - a.seen).slice(0, 50),
    });
  } catch (err) {
    console.error('[carrier-analytics]', err.message);
    res.status(500).json({ ok: false, msg: 'Carrier analytics query failed', error: err.message });
  }
});

// ── 3. Pricing Intelligence ─────────────────────────────────────────────────
//
// Permanent marketplace observability surface. Compares the active claim
// price (Lead.buyNowPrice) against the simple-engine shadow output
// (Lead.priceShadowSimple) to surface pricing drift across tiers, home
// sizes, distance classes, and individual rules.
//
// Sample restriction: only leads where pricingEngineVersion !== 'simple'.
// Reason: simple-stamped leads have buyNowPrice === priceShadowSimple by
// construction (the live engine and the shadow are the same module), so
// their delta is always zero and would just inflate the "same" bucket.
// Filtering them out keeps the drift signal meaningful. As the legacy
// engine retires (Phase E4), this sample naturally shrinks to zero — at
// which point the tab becomes a Deal Room / next-experiment surface.

router.get('/pricing-analytics', [auth, admin], async (req, res) => {
  try {
    const { days, since } = dateRange(req.query.days);

    // Comparable sample: legacy-priced leads with simple-engine shadow data.
    // Missing pricingEngineVersion (pre-Phase-3 leads) is treated as legacy.
    const leads = await Lead.find({
      createdAt: { $gte: since },
      buyNowPrice: { $exists: true, $ne: null },
      priceShadowSimple: { $exists: true, $ne: null },
      pricingEngineVersion: { $ne: 'simple' },
    })
      .select('buyNowPrice priceShadowSimple pricingBreakdownSimple pricingEngineVersion homeSize miles funnelVersion adminTierOverride customerName originCity destinationCity createdAt')
      .lean();

    const leadIds = leads.map(l => l._id);
    const snaps = await fetchLatestSnapshots(leadIds);

    let legacySum = 0, simpleSum = 0;
    const deltas = [];
    let simpleHigher = 0, simpleLower = 0, sameCount = 0;
    let maxPosDelta = { value: -Infinity, lead: null };
    let maxNegDelta = { value: Infinity, lead: null };

    const byTier = {};        // tier → { count, legacySum, simpleSum }
    const byHomeSize = {};
    const byDistance = {};
    // Rule frequency keyed by composite (category, matchValue). pricingBreakdownSimple
    // is the canonical pricing explanation layer — keep its structure intact
    // (do not mutate the shape of breakdown entries when aggregating).
    const ruleFreq = {};

    const tableRows = [];

    for (const lead of leads) {
      const legacy = Number(lead.buyNowPrice) || 0;
      const simple = Number(lead.priceShadowSimple) || 0;
      const delta = simple - legacy;
      legacySum += legacy;
      simpleSum += simple;
      deltas.push(delta);
      if (delta > 0) simpleHigher += 1;
      else if (delta < 0) simpleLower += 1;
      else sameCount += 1;
      if (delta > maxPosDelta.value) maxPosDelta = { value: delta, lead: { _id: lead._id, route: `${lead.originCity} → ${lead.destinationCity}`, customerName: lead.customerName } };
      if (delta < maxNegDelta.value) maxNegDelta = { value: delta, lead: { _id: lead._id, route: `${lead.originCity} → ${lead.destinationCity}`, customerName: lead.customerName } };

      const snap = snaps.get(String(lead._id));
      const tier = snap?.tier || lead.adminTierOverride?.tier || 'unscored';
      const friendly = toMoverLabel(tier) || tier;
      if (!byTier[friendly]) byTier[friendly] = { count: 0, legacySum: 0, simpleSum: 0 };
      byTier[friendly].count += 1;
      byTier[friendly].legacySum += legacy;
      byTier[friendly].simpleSum += simple;

      const hs = lead.homeSize || 'unknown';
      if (!byHomeSize[hs]) byHomeSize[hs] = { count: 0, legacySum: 0, simpleSum: 0 };
      byHomeSize[hs].count += 1;
      byHomeSize[hs].legacySum += legacy;
      byHomeSize[hs].simpleSum += simple;

      const dc = distanceClass(lead.miles);
      if (!byDistance[dc]) byDistance[dc] = { count: 0, legacySum: 0, simpleSum: 0 };
      byDistance[dc].count += 1;
      byDistance[dc].legacySum += legacy;
      byDistance[dc].simpleSum += simple;

      // Rule frequency — skip the BASE row (it is the floor, not a rule fire).
      // Group by (category, matchValue) composite so e.g. DISTANCE/Long Distance
      // and DISTANCE/Cross Country are tracked separately.
      for (const line of (lead.pricingBreakdownSimple || [])) {
        if (line.category === 'BASE') continue;
        const category = line.category || 'UNKNOWN';
        const matchValue = line.matchValue || '';
        const key = `${category}::${matchValue}`;
        const amount = Number(line.amountUsd) || 0;
        const isDiscount = amount < 0;
        if (!ruleFreq[key]) {
          ruleFreq[key] = { category, matchValue, applied: 0, totalUsd: 0, type: isDiscount ? 'discount' : 'add' };
        }
        ruleFreq[key].applied += 1;
        ruleFreq[key].totalUsd += amount;
      }

      tableRows.push({
        _id: lead._id,
        route: `${lead.originCity} → ${lead.destinationCity}`,
        customerName: lead.customerName,
        tier: friendly,
        legacy,
        simple,
        delta,
        pricingEngineVersion: lead.pricingEngineVersion || 'legacy',
        surcharges: (lead.pricingBreakdownSimple || [])
          .filter(b => b.category !== 'BASE' && (Number(b.amountUsd) || 0) > 0)
          .map(b => `${b.category}/${b.matchValue || '∅'}`),
        discounts: (lead.pricingBreakdownSimple || [])
          .filter(b => (Number(b.amountUsd) || 0) < 0)
          .map(b => `${b.category}/${b.matchValue || '∅'}`),
      });
    }

    function summarize(group) {
      return Object.entries(group).map(([key, v]) => ({
        key,
        count: v.count,
        legacyAvg: v.count ? Math.round((v.legacySum  / v.count) * 100) / 100 : 0,
        simpleAvg: v.count ? Math.round((v.simpleSum  / v.count) * 100) / 100 : 0,
        deltaAvg:  v.count ? Math.round(((v.simpleSum - v.legacySum) / v.count) * 100) / 100 : 0,
      })).sort((a, b) => b.count - a.count);
    }

    res.json({
      ok: true,
      range: { days, since },
      compared: leads.length,
      legacyAvg: leads.length ? Math.round((legacySum / leads.length) * 100) / 100 : 0,
      simpleAvg: leads.length ? Math.round((simpleSum / leads.length) * 100) / 100 : 0,
      deltaAvg:  leads.length ? Math.round((average(deltas) || 0) * 100) / 100 : 0,
      deltaMedian: median(deltas),
      maxPositiveDelta: maxPosDelta.value === -Infinity ? null : maxPosDelta,
      maxNegativeDelta: maxNegDelta.value === Infinity ? null : maxNegDelta,
      counts: { simpleHigher, simpleLower, same: sameCount },
      byTier:     summarize(byTier),
      byHomeSize: summarize(byHomeSize),
      byDistance: summarize(byDistance),
      ruleFrequency: Object.values(ruleFreq).sort((a, b) => b.applied - a.applied),
      // Cap at 200 rows so the UI can render without choking on large windows.
      // Sorted by absolute delta so the most surprising rows are first.
      table: tableRows
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 200),
    });
  } catch (err) {
    console.error('[pricing-analytics]', err.message);
    res.status(500).json({ ok: false, msg: 'Pricing analytics query failed', error: err.message });
  }
});

// ── 4. Validation Cost Visibility ───────────────────────────────────────────

router.get('/validation-costs', [auth, admin], async (req, res) => {
  try {
    const { days, since } = dateRange(req.query.days);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    // Aggregate by provider + status, two windows (today + range)
    const [todayLogs, rangeLogs] = await Promise.all([
      ValidationLog.find({ checkedAt: { $gte: todayStart } })
        .select('provider type status costUsd error')
        .lean(),
      ValidationLog.find({ checkedAt: { $gte: since } })
        .select('provider type status costUsd error')
        .lean(),
    ]);

    function summarize(logs) {
      const byProvider = {};
      const byType = {};
      let totalCost = 0;
      let skipped = 0;
      let errored = 0;
      for (const log of logs) {
        const p = log.provider || 'unknown';
        if (!byProvider[p]) byProvider[p] = { calls: 0, cost: 0, errors: 0, skipped: 0 };
        byProvider[p].calls += 1;
        byProvider[p].cost += Number(log.costUsd) || 0;
        if (log.status === 'skipped') { byProvider[p].skipped += 1; skipped += 1; }
        if (log.status === 'error')   { byProvider[p].errors  += 1; errored += 1; }
        totalCost += Number(log.costUsd) || 0;

        const t = log.type || 'unknown';
        if (!byType[t]) byType[t] = 0;
        byType[t] += 1;
      }
      return { byProvider, byType, totalCost: Math.round(totalCost * 10000) / 10000, skipped, errored, totalCalls: logs.length };
    }

    res.json({
      ok: true,
      range: { days, since },
      today: summarize(todayLogs),
      window: summarize(rangeLogs),
    });
  } catch (err) {
    console.error('[validation-costs]', err.message);
    res.status(500).json({ ok: false, msg: 'Validation costs query failed', error: err.message });
  }
});

// ── 5. Action Timeline (single lead) ────────────────────────────────────────

router.get('/leads/:id/action-timeline', [auth, admin], async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, msg: 'Invalid lead id' });
    }

    const leadId = new mongoose.Types.ObjectId(req.params.id);

    // Pull the lead's intrinsic timestamps (created, validation last-checked,
    // reviewedAt) so the timeline isn't only AdminAction records.
    const lead = await Lead.findById(leadId)
      .select('createdAt updatedAt reviewedAt reviewedBy validation.phone.checkedAt validation.route.checkedAt validation.fingerprint.checkedAt status')
      .lean();
    if (!lead) return res.status(404).json({ ok: false, msg: 'Lead not found' });

    const events = [];
    events.push({ at: lead.createdAt, kind: 'lead_created', label: 'Lead created' });

    const phoneAt = lead.validation?.phone?.checkedAt;
    if (phoneAt) events.push({ at: phoneAt, kind: 'validated', label: 'Phone validated', source: 'validationPipeline' });
    const routeAt = lead.validation?.route?.checkedAt;
    if (routeAt) events.push({ at: routeAt, kind: 'validated', label: 'Route validated', source: 'validationPipeline' });
    const fpAt = lead.validation?.fingerprint?.checkedAt;
    if (fpAt) events.push({ at: fpAt, kind: 'validated', label: 'Fingerprint validated', source: 'validationPipeline' });

    // Latest scoring snapshot — count as a 'scored' event (we don't render every
    // snapshot to keep the timeline concise; admin can open the snapshot panel
    // for the full history)
    const snap = await ScoringSnapshot.findOne({ leadId }).sort({ createdAt: -1 }).select('createdAt engineVersion tier').lean();
    if (snap) events.push({ at: snap.createdAt, kind: 'scored', label: `Scored (${snap.engineVersion}) → tier=${snap.tier || 'unscored'}` });

    // Admin actions targeting this lead
    const actions = await AdminAction.find({ targetType: 'lead', targetId: leadId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('actor', 'firstName lastName email')
      .lean();

    for (const a of actions) {
      const actor = a.actor ? `${a.actor.firstName || ''} ${a.actor.lastName || ''}`.trim() || a.actor.email : 'admin';
      const map = {
        'lead.approve':              { kind: 'admin_approved',         label: 'Approved for distribution' },
        'lead.reject':               { kind: 'admin_rejected',         label: 'Rejected (REJECTED_FAKE)' },
        'lead.rescore':              { kind: 'rescored',               label: 'Manual rescore' },
        'lead.tier_override.set':    { kind: 'tier_override_set',      label: `Tier override → ${a.after?.tier || '?'}` },
        'lead.tier_override.clear':  { kind: 'tier_override_cleared',  label: 'Tier override cleared' },
        'lead.mark_reviewed':        { kind: 'marked_reviewed',        label: 'Marked reviewed' },
      };
      const m = map[a.action] || { kind: a.action, label: a.action };
      events.push({
        at: a.createdAt,
        kind: m.kind,
        label: m.label,
        actor,
        reason: a.metadata?.reason || a.before?.reason || null,
        note: a.metadata?.note || null,
      });
    }

    events.sort((a, b) => new Date(b.at) - new Date(a.at));

    res.json({ ok: true, leadId: req.params.id, events });
  } catch (err) {
    console.error('[action-timeline]', err.message);
    res.status(500).json({ ok: false, msg: 'Action timeline query failed', error: err.message });
  }
});

module.exports = router;
