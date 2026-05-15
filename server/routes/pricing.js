const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const PricingRule = require('../models/PricingRule');
const Lead = require('../models/Lead');
const pricingEngineSimple = require('../services/pricingEngineSimple');
const { logAdminAction } = require('../utils/auditLog');

/*
 * Admin pricing CRUD.
 *
 * Phase 2 — the route now accepts the new `amountUsd` field on create +
 * update so the flat-table admin UI can manage the simplified additive
 * USD model on the same PricingRule collection the legacy multiplier
 * engine reads. Both engines coexist:
 *   - Legacy multiplier engine reads `multiplier` from BASE/HOME_SIZE/
 *     DISTANCE/MOVE_DATE rows (unchanged, still writes live buyNowPrice).
 *   - pricingEngineSimple reads `amountUsd` from BASE/DISTANCE/HOME_SIZE/
 *     URGENCY/VERIFICATION/HEAVY_ITEM rows (shadow only, writes
 *     Lead.priceShadowSimple).
 *
 * `multiplier` writes are still accepted so an operator can keep the
 * legacy engine tuned during the shadow window. It will be removed in
 * Phase 4 when the legacy engine is deleted.
 *
 * `category` + `matchValue` remain immutable after create — they're the
 * rule's identity and silently rewriting them would change which leads
 * each rule matches.
 */

const VALID_CATEGORIES = new Set([
  'BASE', 'DISTANCE', 'HOME_SIZE', 'MOVE_DATE',
  'URGENCY', 'VERIFICATION', 'HEAVY_ITEM',
]);

// Canonical default rule set for the "Seed defaults" admin button. All
// amountUsd values start as conservative anchors that operators tune. The
// list is deterministic — re-running the seed only inserts the rows that
// don't already exist (by composite { category, matchValue }).
const DEFAULT_SEED = [
  { category: 'BASE',         matchValue: '',                 amountUsd: 20, description: 'Universal base price' },

  { category: 'DISTANCE',     matchValue: 'Local',            amountUsd: 0,  description: 'Local move (under 100 miles)' },
  { category: 'DISTANCE',     matchValue: 'Long Distance',    amountUsd: 50, description: 'Long distance (100–999 miles)' },
  { category: 'DISTANCE',     matchValue: 'Cross Country',    amountUsd: 80, description: 'Cross country (1000+ miles)' },

  { category: 'HOME_SIZE',    matchValue: 'Studio',           amountUsd: 0,  description: '' },
  { category: 'HOME_SIZE',    matchValue: '1 Bedroom',        amountUsd: 5,  description: '' },
  { category: 'HOME_SIZE',    matchValue: '2 Bedroom',        amountUsd: 10, description: '' },
  { category: 'HOME_SIZE',    matchValue: '3 Bedroom',        amountUsd: 15, description: '' },
  { category: 'HOME_SIZE',    matchValue: '4 Bedroom',        amountUsd: 30, description: '' },
  { category: 'HOME_SIZE',    matchValue: '5+ Bedroom',       amountUsd: 50, description: '' },

  { category: 'URGENCY',      matchValue: 'Standard',         amountUsd: 0,  description: '15+ days away' },
  { category: 'URGENCY',      matchValue: 'Soon',             amountUsd: 8,  description: '8–14 days away' },
  { category: 'URGENCY',      matchValue: 'Urgent',           amountUsd: 15, description: '≤7 days away' },

  { category: 'VERIFICATION', matchValue: 'phone_verified',   amountUsd: 5,  description: 'Twilio Lookup confirmed phone' },
  { category: 'VERIFICATION', matchValue: 'mobile_line',      amountUsd: 3,  description: 'Cellular line (not VoIP)' },
  { category: 'VERIFICATION', matchValue: 'identity_match',   amountUsd: 5,  description: 'Name matches Twilio identity' },

  { category: 'HEAVY_ITEM',   matchValue: 'piano',            amountUsd: 10, description: '' },
  { category: 'HEAVY_ITEM',   matchValue: 'safe',             amountUsd: 15, description: '' },
  { category: 'HEAVY_ITEM',   matchValue: 'pool_table',       amountUsd: 10, description: '' },
];

// ── GET /api/admin/pricing — list all rules ──────────────────────────────
router.get('/', [auth, admin], async (req, res) => {
  try {
    const rules = await PricingRule.find().sort({ category: 1, matchValue: 1 }).lean();
    res.json(rules);
  } catch (err) {
    console.error('[AdminPricing] list error', err.message);
    res.status(500).send('Server Error');
  }
});

// ── Audit / cleanup helpers ──────────────────────────────────────────────
// Canonical match-value sets per category. Anything else in an HOME_SIZE /
// DISTANCE / URGENCY / VERIFICATION row is flagged as "suspicious" — most
// commonly a legacy mis-categorized row (e.g. category=HOME_SIZE,
// matchValue='Urgent' from years ago when the admin form had fewer guards).
const CANONICAL_MATCH = {
  HOME_SIZE:    new Set(['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5+ Bedroom', '4+ Bedroom']),
  DISTANCE:     new Set(['Local', 'Long Distance', 'Cross Country']),
  URGENCY:      new Set(['Standard', 'Soon', 'Urgent']),
  VERIFICATION: new Set(['phone_verified', 'mobile_line', 'identity_match']),
  // HEAVY_ITEM is intentionally open — operators define their own items.
};

// Patterns that indicate a description was written for the legacy
// multiplier engine ("1.5x", "costs 50% more", "stacking", etc.). Used by
// the normalize-descriptions endpoint to decide which rows to rewrite.
const LEGACY_DESCRIPTION_REGEX = /(\b\d+(?:\.\d+)?\s*x\b)|(%)|(\bstack(?:ing|ed|s)?\b)|(\bmultipli(?:er|cative|catively)\b)|(\b(?:costs?|adds?|charges?)\s+\d+%)/i;

function describeAddOrSubtract(category, matchValue, amountUsd) {
  const n = Number(amountUsd);
  const human = ({
    HOME_SIZE:    `${matchValue}`,
    DISTANCE:     `${String(matchValue).toLowerCase()} moves`,
    URGENCY:      `${String(matchValue).toLowerCase()} moves`,
    VERIFICATION: `verified ${String(matchValue).replace(/_/g, ' ')}`,
    HEAVY_ITEM:   `the ${String(matchValue).replace(/_/g, ' ')}`,
    BASE:         '',
  })[category] || matchValue;
  if (category === 'BASE') return 'Universal base price';
  if (n > 0)  return `Adds $${n} for ${human}`;
  if (n < 0)  return `Subtracts $${Math.abs(n)} for ${human}`;
  return `${human} — no surcharge`;
}

// ── GET /api/admin/pricing/audit ────────────────────────────────────────
// Read-only audit of the rule set. Surfaces:
//   - rules with no amountUsd set (still need calibration)
//   - rules whose description still uses legacy multiplier language
//   - rules whose matchValue isn't in the canonical set for its category
//     (e.g. an HOME_SIZE row whose matchValue is 'Urgent' from a legacy
//     mis-categorization)
router.get('/audit', [auth, admin], async (req, res) => {
  try {
    const rules = await PricingRule.find().lean();
    const missingAmountUsd = [];
    const legacyDescriptions = [];
    const suspiciousMatch = [];

    for (const r of rules) {
      if (!r.isActive) continue;
      if (!Number.isFinite(r.amountUsd)) missingAmountUsd.push(r);
      if (r.description && LEGACY_DESCRIPTION_REGEX.test(r.description)) {
        legacyDescriptions.push(r);
      }
      const canonical = CANONICAL_MATCH[r.category];
      if (canonical && !canonical.has(String(r.matchValue || '').trim())) {
        suspiciousMatch.push(r);
      }
    }

    res.json({
      missingAmountUsd,
      legacyDescriptions,
      suspiciousMatch,
      totalActive: rules.filter(r => r.isActive).length,
    });
  } catch (err) {
    console.error('[AdminPricing] audit error', err.message);
    res.status(500).send('Server Error');
  }
});

// ── POST /api/admin/pricing/normalize-descriptions ──────────────────────
// Idempotent rewrite of legacy-language descriptions. Only rewrites rows
// whose description matches LEGACY_DESCRIPTION_REGEX AND whose amountUsd
// is set (otherwise we don't know what value to substitute). Returns the
// list of { id, before, after } so the operator can spot-check.
router.post('/normalize-descriptions', [auth, admin], async (req, res) => {
  try {
    const rules = await PricingRule.find().lean();
    const rewritten = [];

    for (const r of rules) {
      if (!Number.isFinite(r.amountUsd)) continue;
      if (!r.description || !LEGACY_DESCRIPTION_REGEX.test(r.description)) continue;
      const next = describeAddOrSubtract(r.category, r.matchValue || '', r.amountUsd);
      if (next === r.description) continue;
      await PricingRule.updateOne({ _id: r._id }, { $set: { description: next } });
      rewritten.push({ id: String(r._id), before: r.description, after: next });
    }

    if (rewritten.length > 0) {
      logAdminAction({
        actor: req.user.id,
        action: 'pricing.normalizeDescriptions',
        targetType: 'pricingRule',
        targetId: null,
        before: null,
        after: { rewrittenCount: rewritten.length },
      });
    }

    res.json({ rewritten });
  } catch (err) {
    console.error('[AdminPricing] normalize error', err.message);
    res.status(500).send('Server Error');
  }
});

// ── POST /api/admin/pricing/simulate ────────────────────────────────────
// Live price simulator — synthesizes a Lead-shaped object from operator
// inputs and runs it through the REAL pricingEngineSimple.compute() so
// the simulator always reflects production behaviour.
//
// Body (all optional):
//   { miles, daysToMove, homeSize, verifications: [...flags], heavyItems: [...] }
//
// Returns the full engine output { total, base, breakdown, skipped }.
router.post('/simulate', [auth, admin], async (req, res) => {
  try {
    const body = req.body || {};
    const miles      = Number.isFinite(Number(body.miles))      ? Number(body.miles)      : 0;
    const daysToMove = Number.isFinite(Number(body.daysToMove)) ? Number(body.daysToMove) : 30;
    const homeSize   = String(body.homeSize || '');
    const flags      = Array.isArray(body.verifications) ? body.verifications : [];
    const heavyItems = Array.isArray(body.heavyItems) ? body.heavyItems.map(String) : [];

    // Build a synthetic lead that exercises the same classifier
    // (server/services/pricingEngineSimple.classifyLead) production uses.
    const phone = {};
    if (flags.includes('phone_verified')) phone.valid = true;
    if (flags.includes('mobile_line'))    { phone.valid = true; phone.lineType = 'mobile'; phone.providerSuspicion = 'low'; }
    if (flags.includes('identity_match')) { phone.valid = true; phone.identityMatch = { firstNameMatch: true }; }

    const moveDate = new Date(Date.now() + daysToMove * 86400000);
    const syntheticLead = { miles, moveDate, homeSize, heavyItems, validation: { phone } };

    const result   = await pricingEngineSimple.compute(syntheticLead);
    const buckets  = pricingEngineSimple.classifyLead(syntheticLead);

    res.json({ ...result, buckets });
  } catch (err) {
    console.error('[AdminPricing] simulate error', err.message);
    res.status(500).send('Server Error');
  }
});

// ── GET /api/admin/pricing/shadow-compare ────────────────────────────────
// Recent leads with both legacy buyNowPrice and shadow priceShadowSimple
// set, so operators can eyeball the divergence before cutover. Read-only.
router.get('/shadow-compare', [auth, admin], async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const rows = await Lead
      .find({ priceShadowSimple: { $exists: true, $ne: null } })
      .select('route originCity destinationCity miles homeSize moveDate buyNowPrice priceShadowSimple pricingBreakdownSimple createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ rows });
  } catch (err) {
    console.error('[AdminPricing] shadow-compare error', err.message);
    res.status(500).send('Server Error');
  }
});

// ── POST /api/admin/pricing/seed-defaults ────────────────────────────────
// Idempotently create any canonical rule that doesn't already exist by
// (category, matchValue). Re-running is safe — existing rows are skipped
// and their amounts are NOT overwritten.
router.post('/seed-defaults', [auth, admin], async (req, res) => {
  try {
    const created = [];
    const skipped = [];
    for (const def of DEFAULT_SEED) {
      const existing = await PricingRule.findOne({ category: def.category, matchValue: def.matchValue }).lean();
      if (existing) { skipped.push(def); continue; }
      const row = await new PricingRule({ ...def, isActive: true }).save();
      created.push(row.toObject());
    }
    if (created.length > 0) {
      logAdminAction({
        actor: req.user.id,
        action: 'pricing.seedDefaults',
        targetType: 'pricingRule',
        targetId: null,
        before: null,
        after: { createdCount: created.length, skippedCount: skipped.length },
      });
    }
    res.json({ created, skipped });
  } catch (err) {
    console.error('[AdminPricing] seed-defaults error', err.message);
    res.status(500).send('Server Error');
  }
});

// ── POST /api/admin/pricing — create a new rule ──────────────────────────
router.post('/', [auth, admin], async (req, res) => {
  try {
    const { category, matchValue, multiplier, amountUsd, description } = req.body;

    if (!VALID_CATEGORIES.has(category)) {
      return res.status(400).json({ msg: 'Invalid category' });
    }
    const cleanMatch = String(matchValue || '').trim();
    if (category !== 'BASE' && !cleanMatch) {
      return res.status(400).json({ msg: 'matchValue is required for this category' });
    }
    if (amountUsd !== undefined) {
      const n = Number(amountUsd);
      if (!Number.isFinite(n)) return res.status(400).json({ msg: 'amountUsd must be a number' });
      if (n < -200 || n > 500)  return res.status(400).json({ msg: 'amountUsd must be between -200 and 500' });
    }

    const existing = await PricingRule.findOne({ category, matchValue: cleanMatch });
    if (existing) return res.status(400).json({ msg: 'Rule already exists for this value' });

    const doc = { category, matchValue: cleanMatch, description: description || '' };
    if (multiplier !== undefined) doc.multiplier = Number(multiplier);
    if (amountUsd  !== undefined) doc.amountUsd  = Number(amountUsd);
    const rule = await new PricingRule(doc).save();

    logAdminAction({
      actor: req.user.id,
      action: 'pricing.create',
      targetType: 'pricingRule',
      targetId: rule._id,
      before: null,
      after: { category, matchValue: cleanMatch, multiplier: rule.multiplier, amountUsd: rule.amountUsd, description },
    });
    res.json(rule);
  } catch (err) {
    console.error('[AdminPricing] create error', err.message);
    res.status(500).send('Server Error');
  }
});

// ── PUT /api/admin/pricing/:id — update writable fields only ─────────────
// `category` + `matchValue` are immutable after create. Operators can edit
// multiplier (legacy engine), amountUsd (new engine), description, isActive.
const PRICING_RULE_WRITABLE = ['multiplier', 'amountUsd', 'description', 'isActive'];

router.put('/:id', [auth, admin], async (req, res) => {
  try {
    const before = await PricingRule.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ msg: 'Rule not found' });

    const update = {};
    for (const key of PRICING_RULE_WRITABLE) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (update.amountUsd !== undefined) {
      const n = Number(update.amountUsd);
      if (!Number.isFinite(n)) return res.status(400).json({ msg: 'amountUsd must be a number' });
      if (n < -200 || n > 500)  return res.status(400).json({ msg: 'amountUsd must be between -200 and 500' });
      update.amountUsd = n;
    }

    const rule = await PricingRule.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { returnDocument: 'after' }
    );

    logAdminAction({
      actor: req.user.id,
      action: 'pricing.update',
      targetType: 'pricingRule',
      targetId: rule._id,
      before: {
        multiplier: before.multiplier, amountUsd: before.amountUsd,
        description: before.description, isActive: before.isActive,
      },
      after: {
        multiplier: rule.multiplier, amountUsd: rule.amountUsd,
        description: rule.description, isActive: rule.isActive,
      },
    });
    res.json(rule);
  } catch (err) {
    console.error('[AdminPricing] update error', err.message);
    res.status(500).send('Server Error');
  }
});

// ── DELETE /api/admin/pricing/:id ───────────────────────────────────────
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const before = await PricingRule.findById(req.params.id).lean();
    await PricingRule.findByIdAndDelete(req.params.id);

    if (before) {
      logAdminAction({
        actor: req.user.id,
        action: 'pricing.delete',
        targetType: 'pricingRule',
        targetId: before._id,
        before: {
          category: before.category, matchValue: before.matchValue,
          multiplier: before.multiplier, amountUsd: before.amountUsd,
          description: before.description, isActive: before.isActive,
        },
        after: null,
      });
    }
    res.json({ msg: 'Rule removed' });
  } catch (err) {
    console.error('[AdminPricing] delete error', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
