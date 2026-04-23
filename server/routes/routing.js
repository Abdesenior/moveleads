const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const findEligibleMovers = require('../utils/findEligibleMovers');
const CoverageArea = require('../models/CoverageArea');
const User = require('../models/User');

// @route   GET /api/routing/eligible
// @desc    Find companies eligible to receive a lead based on zip coverage + balance
// @access  Private (Admin)
router.get('/eligible', [auth, admin], async (req, res) => {
  const { originZip, destinationZip } = req.query;

  if (!originZip || !destinationZip) {
    return res.status(400).json({ msg: 'originZip and destinationZip are required' });
  }

  try {
    const movers = await findEligibleMovers(originZip, destinationZip);
    res.json({
      count: movers.length,
      movers
    });
  } catch (err) {
    console.error('ROUTING ERROR:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   GET /api/routing/coverage/:companyId
// @desc    Get all coverage areas for a specific company
// @access  Private (Admin)
router.get('/coverage/:companyId', [auth, admin], async (req, res) => {
  try {
    const areas = await CoverageArea.find({ company: req.params.companyId }).sort({ zipCode: 1 });
    res.json(areas);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/routing/coverage
// @desc    Add a coverage area (zip code) for a company
// @access  Private (Admin)
router.post('/coverage', [auth, admin], async (req, res) => {
  const { companyId, zipCode, radius, type } = req.body;

  if (!companyId || !zipCode) {
    return res.status(400).json({ msg: 'companyId and zipCode are required' });
  }

  try {
    // Verify company exists
    const company = await User.findById(companyId);
    if (!company) return res.status(404).json({ msg: 'Company not found' });

    // Check for duplicate
    const existing = await CoverageArea.findOne({ company: companyId, zipCode, type: type || 'both' });
    if (existing) {
      return res.status(400).json({ msg: 'Coverage area already exists for this company and zip' });
    }

    const area = new CoverageArea({
      company: companyId,
      zipCode,
      radius: radius || 0,
      type: type || 'both'
    });

    await area.save();
    res.json(area);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/routing/coverage/bulk
// @desc    Add multiple zip codes for a company at once
// @access  Private (Admin)
router.post('/coverage/bulk', [auth, admin], async (req, res) => {
  const { companyId, zipCodes, type } = req.body;

  if (!companyId || !Array.isArray(zipCodes) || zipCodes.length === 0) {
    return res.status(400).json({ msg: 'companyId and zipCodes array are required' });
  }

  try {
    const company = await User.findById(companyId);
    if (!company) return res.status(404).json({ msg: 'Company not found' });

    const coverageType = type || 'both';
    const docs = zipCodes.map(zip => ({
      company: companyId,
      zipCode: String(zip).trim(),
      type: coverageType
    }));

    // Use insertMany with ordered:false to skip duplicates
    const result = await CoverageArea.insertMany(docs, { ordered: false }).catch(err => {
      // Filter out duplicate key errors, return what was inserted
      if (err.code === 11000 || err.insertedDocs) return err.insertedDocs || [];
      throw err;
    });

    const inserted = Array.isArray(result) ? result.length : result?.length || 0;
    res.json({ msg: `${inserted} coverage areas added`, count: inserted });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   PUT /api/routing/coverage/mine
// @desc    Mover: atomically replace own coverage zip codes (syncs serviceAreas + CoverageArea collection)
// @access  Private (any authenticated mover)
router.put('/coverage/mine', auth, async (req, res) => {
  const { zipCodes } = req.body;
  if (!Array.isArray(zipCodes)) {
    return res.status(400).json({ msg: 'zipCodes array is required' });
  }

  const companyId = req.user.id;
  const cleanZips = [...new Set(zipCodes.map(z => String(z).trim()).filter(Boolean))];

  try {
    // 1. Replace CoverageArea docs (the source of truth for socket rooms + lead routing)
    await CoverageArea.deleteMany({ company: companyId });
    if (cleanZips.length > 0) {
      await CoverageArea.insertMany(
        cleanZips.map(zip => ({ company: companyId, zipCode: zip, type: 'both', radius: 0 })),
        { ordered: false }
      );
    }

    // 2. Mirror to user.serviceAreas so the Settings UI re-hydrates correctly
    await User.findByIdAndUpdate(companyId, { $set: { serviceAreas: cleanZips } });

    console.log(`[Coverage] ${companyId} saved ${cleanZips.length} zip(s): ${cleanZips.join(', ')}`);
    res.json({ msg: 'Coverage areas updated', count: cleanZips.length, zipCodes: cleanZips });
  } catch (err) {
    console.error('[Coverage] PUT /mine error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   DELETE /api/routing/coverage/:id
// @desc    Remove a coverage area
// @access  Private (Admin)
router.delete('/coverage/:id', [auth, admin], async (req, res) => {
  try {
    const area = await CoverageArea.findById(req.params.id);
    if (!area) return res.status(404).json({ msg: 'Coverage area not found' });

    await CoverageArea.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Coverage area removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
