// Admin matcher-diagnosis endpoint — observability tool.
//
// GET /api/admin/matcher/diagnose?leadId=<id>&moverId=<id>
//
// Returns a full structured trace of why a given (lead, mover) pair
// matches or doesn't match across dashboard / SMS / email surfaces.
//
// Read-only. No side effects. Does NOT touch production matching paths.
//
// Mounted in server.js under /api/admin/matcher with verifiedGate + auth
// already applied; the `admin` middleware here gates non-admin verified
// users from reaching the diagnosis output.

const express = require('express');
const router = express.Router();
const { admin } = require('../../middleware/auth');
const Lead = require('../../models/Lead');
const User = require('../../models/User');
const CoverageArea = require('../../models/CoverageArea');
const { strictMatchingEnabled } = require('../../utils/strictMatchingFlag');
const { diagnoseMatch, shortLogLine } = require('../../utils/matcherDiagnosis');

router.use(admin);

// GET /api/admin/matcher/diagnose
//   ?leadId=<ObjectId>    REQUIRED
//   ?moverId=<ObjectId>   REQUIRED
//   ?log=1                also emit the short trace line to server logs
router.get('/diagnose', async (req, res) => {
  const { leadId, moverId, log } = req.query || {};
  if (!leadId || !moverId) {
    return res.status(400).json({ msg: 'leadId and moverId are required query params' });
  }

  try {
    const [lead, mover] = await Promise.all([
      Lead.findById(leadId).lean(),
      User.findById(moverId)
        // Same projection the dashboard uses, plus the channel-gate fields
        // (smsNotif/emailNotif/phone/phoneVerified/smsOptOut/emailOptOut/
        // isSuspended) so diagnoseMatch can answer SMS+email eligibility.
        .select(
          'deliversNationwide pickupStates deliveryStates serviceStates ' +
          'interstateEnabled maxDistance preferredHomeSizes onboarding.answers ' +
          'smsNotif emailNotif phone phoneVerified phoneVerifiedAt ' +
          'smsOptOut emailOptOut isSuspended'
        )
        .lean(),
    ]);

    if (!lead)  return res.status(404).json({ msg: 'Lead not found',  leadId });
    if (!mover) return res.status(404).json({ msg: 'Mover not found', moverId });

    // Pull the mover's typed coverage ZIPs — same query the dashboard
    // hydration in routes/leads.js uses. Two cheap indexed queries.
    const [originCoverageZips, destCoverageZips] = await Promise.all([
      CoverageArea.distinct('zipCode', { company: moverId, type: { $in: ['origin', 'both'] } }),
      CoverageArea.distinct('zipCode', { company: moverId, type: { $in: ['destination', 'both'] } }),
    ]);
    const originZipSet      = new Set((originCoverageZips || []).map(z => String(z)));
    const destinationZipSet = new Set((destCoverageZips   || []).map(z => String(z)));

    const trace = diagnoseMatch(lead, mover, {
      originZipSet,
      destinationZipSet,
      strictMode: strictMatchingEnabled(),
    });

    if (log === '1') {
      console.log(shortLogLine(trace));
    }

    return res.json(trace);
  } catch (err) {
    console.error('[MatcherDiagnose] error:', err.message);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
