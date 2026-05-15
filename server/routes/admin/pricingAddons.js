const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { admin } = require('../../middleware/auth');
const PricingAddOn = require('../../models/PricingAddOn');
const pricingEngineV2 = require('../../services/pricingEngineV2');

/*
 * Admin CRUD for the PricingAddOn collection.
 *
 * Pricing V2 stays SHADOW ONLY through this PR. Nothing in this router
 * touches buyNowPrice, the legacy multiplier engine, or the live billing
 * path. The router only manages PricingAddOn rows that pricingEngineV2
 * already reads at ingest to populate Lead.priceShadowV2 +
 * pricingBreakdownShadowV2 (shadow columns the mover never sees).
 *
 * Mounted at /api/admin/pricing-addons by server.js, sandwiched between
 * verifiedGate (auth + email-verified) and this file's router.use(admin).
 */
router.use(admin);

// Allowed predicate keys — anything else in appliesWhen is rejected so the
// stored predicate document can never grow keys that pricingEngineV2 doesn't
// recognize.
const PREDICATE_KEYS = new Set([
  'milesGte', 'milesLt',
  'daysToMoveLte', 'daysToMoveGt',
  'homeSizeIn', 'heavyItemsAny', 'tierIn', 'validationFlagsAll',
]);

const NUMERIC_KEYS    = new Set(['milesGte', 'milesLt', 'daysToMoveLte', 'daysToMoveGt']);
const STRING_ARR_KEYS = new Set(['homeSizeIn', 'heavyItemsAny', 'tierIn', 'validationFlagsAll']);

const HOME_SIZE_ENUM   = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5+ Bedroom', '4+ Bedroom'];
const TIER_ENUM        = ['hot', 'premium', 'standard', 'review', 'rejected'];
const VALIDATION_FLAGS = ['phoneVerified', 'mobileLine', 'identityMatch'];

function validatePredicate(raw) {
  if (raw == null) return { ok: true, predicate: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, msg: 'appliesWhen must be an object' };
  }
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!PREDICATE_KEYS.has(k)) {
      return { ok: false, msg: `Unknown predicate key: ${k}` };
    }
    if (NUMERIC_KEYS.has(k)) {
      if (v == null || v === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n)) return { ok: false, msg: `${k} must be a number` };
      out[k] = n;
    } else if (STRING_ARR_KEYS.has(k)) {
      if (!Array.isArray(v)) return { ok: false, msg: `${k} must be an array` };
      if (v.length === 0) continue;
      const arr = v.map(x => String(x || '').trim()).filter(Boolean);
      if (k === 'homeSizeIn'   && arr.some(x => !HOME_SIZE_ENUM.includes(x)))   return { ok: false, msg: `homeSizeIn has unknown value` };
      if (k === 'tierIn'       && arr.some(x => !TIER_ENUM.includes(x)))       return { ok: false, msg: `tierIn has unknown value` };
      if (k === 'validationFlagsAll' && arr.some(x => !VALIDATION_FLAGS.includes(x))) return { ok: false, msg: `validationFlagsAll has unknown value` };
      out[k] = arr;
    }
  }
  return { ok: true, predicate: out };
}

function validateBody(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.code !== undefined) {
    const code = String(body.code || '').trim();
    if (!partial && !code) return { ok: false, msg: 'code is required' };
    if (code && !/^[a-z0-9_-]{1,64}$/.test(code)) {
      return { ok: false, msg: 'code must be 1–64 chars, lowercase a-z, 0-9, _ or -' };
    }
    if (code) out.code = code;
  }
  if (!partial || body.label !== undefined) {
    const label = String(body.label || '').trim();
    if (!partial && !label) return { ok: false, msg: 'label is required' };
    if (label.length > 120) return { ok: false, msg: 'label is too long' };
    if (label) out.label = label;
  }
  if (!partial || body.amountUsd !== undefined) {
    if (!partial && body.amountUsd === undefined) return { ok: false, msg: 'amountUsd is required' };
    if (body.amountUsd !== undefined) {
      const n = Number(body.amountUsd);
      if (!Number.isFinite(n)) return { ok: false, msg: 'amountUsd must be a number' };
      if (n < -200 || n > 500)  return { ok: false, msg: 'amountUsd must be between -200 and 500' };
      out.amountUsd = Math.round(n * 100) / 100;
    }
  }
  if (body.appliesWhen !== undefined) {
    const r = validatePredicate(body.appliesWhen);
    if (!r.ok) return r;
    out.appliesWhen = r.predicate;
  }
  if (body.active !== undefined) out.active = Boolean(body.active);
  if (body.notes  !== undefined) out.notes  = String(body.notes || '').trim().slice(0, 500);
  if (body.order  !== undefined) {
    const n = Number(body.order);
    if (!Number.isFinite(n)) return { ok: false, msg: 'order must be a number' };
    out.order = Math.round(n);
  }
  return { ok: true, doc: out };
}

// ── GET /api/admin/pricing-addons ─────────────────────────────────────────
// Optional ?search=&active=&page=&pageSize=
router.get('/', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
    const filter = {};
    if (req.query.active === 'true')  filter.active = true;
    if (req.query.active === 'false') filter.active = false;
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      filter.$or = [{ code: rx }, { label: rx }];
    }
    const [rows, total] = await Promise.all([
      PricingAddOn.find(filter).sort({ order: 1, code: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      PricingAddOn.countDocuments(filter),
    ]);
    res.json({ rows, total, page, pageSize });
  } catch (err) {
    console.error('[AdminPricingAddOns] list error', err);
    res.status(500).json({ msg: 'Could not load add-ons.' });
  }
});

// ── POST /api/admin/pricing-addons/test ───────────────────────────────────
// Pure function. Runs pricingEngineV2's predicate logic against a synthetic
// lead and returns whether it would match. Lets operators sanity-check a
// predicate before saving it.
router.post('/test', async (req, res) => {
  const body = req.body || {};
  const pred = validatePredicate(body.appliesWhen);
  if (!pred.ok) return res.status(400).json({ msg: pred.msg });

  // Build a minimal Lead-shaped object so buildContext + evaluatePredicate
  // get realistic inputs. Missing fields default to "no constraint".
  const sample = body.sampleLead || {};
  const lead = {
    miles:      sample.miles,
    moveDate:   sample.moveDate,
    homeSize:   sample.homeSize,
    heavyItems: Array.isArray(sample.heavyItems) ? sample.heavyItems : [],
    tier:       sample.tier,
    validation: sample.validation || {},
  };
  const match = pricingEngineV2.testPredicate
    ? pricingEngineV2.testPredicate(pred.predicate, lead)
    : null;
  // Fallback (testPredicate not exported yet): reach into the engine's pure
  // pieces — kept as a safety net so this endpoint never 500s if the engine
  // is mid-refactor.
  if (match === null) {
    try {
      const ctx = {
        miles: Number(lead.miles) || 0,
        daysToMove: lead.moveDate ? Math.round((new Date(lead.moveDate) - new Date()) / 86400000) : null,
        homeSize: lead.homeSize || null,
        heavyItems: lead.heavyItems || [],
        tier: lead.tier || null,
        validationFlags: new Set(),
      };
      const phone = lead.validation && lead.validation.phone;
      if (phone) {
        if (phone.valid === true) ctx.validationFlags.add('phoneVerified');
        if (phone.lineType === 'mobile' && phone.providerSuspicion !== 'high') ctx.validationFlags.add('mobileLine');
      }
      const p = pred.predicate;
      let ok = true;
      if (p.milesGte != null && !(ctx.miles >= p.milesGte)) ok = false;
      if (p.milesLt  != null && !(ctx.miles <  p.milesLt))  ok = false;
      if (p.daysToMoveLte != null && !(ctx.daysToMove != null && ctx.daysToMove <= p.daysToMoveLte)) ok = false;
      if (p.daysToMoveGt  != null && !(ctx.daysToMove != null && ctx.daysToMove >  p.daysToMoveGt))  ok = false;
      if (Array.isArray(p.homeSizeIn)   && p.homeSizeIn.length   && !p.homeSizeIn.includes(ctx.homeSize))                                   ok = false;
      if (Array.isArray(p.tierIn)       && p.tierIn.length       && !p.tierIn.includes(ctx.tier))                                           ok = false;
      if (Array.isArray(p.heavyItemsAny)&& p.heavyItemsAny.length&& !p.heavyItemsAny.some(h => ctx.heavyItems.includes(h)))                 ok = false;
      if (Array.isArray(p.validationFlagsAll) && p.validationFlagsAll.length) {
        for (const f of p.validationFlagsAll) if (!ctx.validationFlags.has(f)) { ok = false; break; }
      }
      return res.json({ match: ok, predicate: pred.predicate, context: { ...ctx, validationFlags: Array.from(ctx.validationFlags) } });
    } catch (err) {
      console.error('[AdminPricingAddOns] test fallback failed', err);
      return res.status(500).json({ msg: 'Predicate test failed' });
    }
  }
  return res.json({ match, predicate: pred.predicate });
});

// ── GET /api/admin/pricing-addons/:id ─────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ msg: 'Add-on not found.' });
  }
  try {
    const doc = await PricingAddOn.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ msg: 'Add-on not found.' });
    res.json(doc);
  } catch (err) {
    console.error('[AdminPricingAddOns] detail error', err);
    res.status(500).json({ msg: 'Could not load add-on.' });
  }
});

// ── POST /api/admin/pricing-addons ────────────────────────────────────────
router.post('/', async (req, res) => {
  const v = validateBody(req.body || {});
  if (!v.ok) return res.status(400).json({ msg: v.msg });
  try {
    const saved = await new PricingAddOn(v.doc).save();
    res.status(201).json(saved.toObject());
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(400).json({ msg: 'An add-on with this code already exists.' });
    }
    console.error('[AdminPricingAddOns] create error', err);
    res.status(500).json({ msg: 'Could not create add-on.' });
  }
});

// ── PATCH /api/admin/pricing-addons/:id ───────────────────────────────────
router.patch('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ msg: 'Add-on not found.' });
  }
  const v = validateBody(req.body || {}, { partial: true });
  if (!v.ok) return res.status(400).json({ msg: v.msg });
  try {
    const doc = await PricingAddOn.findByIdAndUpdate(
      req.params.id,
      { $set: v.doc },
      { new: true, runValidators: true }
    ).lean();
    if (!doc) return res.status(404).json({ msg: 'Add-on not found.' });
    res.json(doc);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(400).json({ msg: 'An add-on with this code already exists.' });
    }
    console.error('[AdminPricingAddOns] update error', err);
    res.status(500).json({ msg: 'Could not update add-on.' });
  }
});

// ── PATCH /api/admin/pricing-addons/:id/active ────────────────────────────
// One-click toggle. Body: { active: boolean }.
router.patch('/:id/active', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ msg: 'Add-on not found.' });
  }
  const active = !!(req.body && req.body.active);
  try {
    const doc = await PricingAddOn.findByIdAndUpdate(
      req.params.id,
      { $set: { active } },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ msg: 'Add-on not found.' });
    res.json(doc);
  } catch (err) {
    console.error('[AdminPricingAddOns] toggle error', err);
    res.status(500).json({ msg: 'Could not toggle add-on.' });
  }
});

// ── DELETE /api/admin/pricing-addons/:id ──────────────────────────────────
// Soft delete by default (sets active=false). Pass ?hard=true to actually
// remove the row.
router.delete('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ msg: 'Add-on not found.' });
  }
  const hard = req.query.hard === 'true';
  try {
    if (hard) {
      const r = await PricingAddOn.deleteOne({ _id: req.params.id });
      if (r.deletedCount === 0) return res.status(404).json({ msg: 'Add-on not found.' });
      return res.json({ ok: true, hardDeleted: true });
    }
    const doc = await PricingAddOn.findByIdAndUpdate(
      req.params.id,
      { $set: { active: false } },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ msg: 'Add-on not found.' });
    res.json({ ok: true, softDeleted: true, doc });
  } catch (err) {
    console.error('[AdminPricingAddOns] delete error', err);
    res.status(500).json({ msg: 'Could not delete add-on.' });
  }
});

module.exports = router;
