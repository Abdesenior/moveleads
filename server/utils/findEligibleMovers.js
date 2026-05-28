const CoverageArea = require('../models/CoverageArea');
const PlatformSettings = require('../models/PlatformSettings');

/**
 * Find eligible moving companies for a given lead using a single aggregation
 * pipeline. Replaces the previous 3-query + in-memory Set intersection pattern.
 *
 * Pipeline:
 *   1. Match CoverageArea docs for the origin zip (type 'origin' | 'both')
 *   2. Self-$lookup to verify the same company also covers the destination zip
 *   3. Deduplicate companies (a mover may have multiple origin entries)
 *   4. $lookup into the users collection, filtering by balance / suspension / role
 *   5. Sort by balance descending (highest balance = most likely to convert first)
 *
 * @param {string} leadOriginZip
 * @param {string} leadDestinationZip
 * @returns {Promise<Array>} Array of eligible User documents (lean objects)
 */
async function findEligibleMovers(leadOriginZip, leadDestinationZip) {
  // Resolve current lead price (used for balance threshold filter inside pipeline)
  let leadPrice = 10;
  try {
    const settings = await PlatformSettings.findOne().lean();
    if (settings?.standardLeadPrice) leadPrice = settings.standardLeadPrice;
  } catch (_) {
    // use default
  }

  const eligibleMovers = await CoverageArea.aggregate([
    // Stage 1 — companies that cover the ORIGIN zip
    {
      $match: {
        zipCode: leadOriginZip,
        type: { $in: ['origin', 'both'] }
      }
    },

    // Stage 2 — self-join: does the same company also cover the DESTINATION zip?
    {
      $lookup: {
        from: 'coverage_areas',
        let: { companyId: '$company' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$company', '$$companyId'] },
                  { $eq: ['$zipCode', leadDestinationZip] },
                  { $in: ['$type', ['destination', 'both']] }
                ]
              }
            }
          },
          { $limit: 1 }   // existence check — we only need one match
        ],
        as: 'destCoverage'
      }
    },

    // Stage 3 — keep only companies that cover BOTH zips
    {
      $match: { 'destCoverage.0': { $exists: true } }
    },

    // Stage 4 — deduplicate (one company may have multiple origin CoverageArea docs)
    {
      $group: { _id: '$company' }
    },

    // Stage 5 — join with users, filtering for balance / suspension / role in one shot
    //
    // 2026-05-28 — PR-D7: `receiveLiveTransfers` filter retired.
    //
    // Until this PR, an `$eq: ['$receiveLiveTransfers', true]` clause
    // gated this join. The field was set only by the onboarding wizard
    // (`routes/onboarding.js:103`) — no Settings UI ever wrote it after
    // signup. Same shape as PR-C3 (alertChannels) and PR-C4 (moveTypes):
    // a backend pref that drives dispatch with no mover-facing way to
    // change it. Per [[no-hidden-backend-prefs]]: backend prefs MUST
    // be UI-editable or stop being read. Voice routes are currently
    // unmounted (server.js:98-118), so the read was effectively dormant
    // in production already — this PR makes the architectural state
    // explicit by removing the filter clause AND the projection field.
    //
    // The schema field stays dormant per the dormant-vs-deprecated
    // discipline (Mongoose would strip it on .save() if deleted,
    // silently mutating historical records).
    //
    // When voice ships in the future, the next PR decides whether to
    // re-introduce a filter (with proper Settings UI), retire it
    // permanently, or replace it with a different opt-in model.
    {
      $lookup: {
        from: 'users',
        let: { companyId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$_id', '$$companyId'] },
                  // Accept both 'customer' (legacy default) and 'mover' (newer
                  // out-of-band accounts). Filtering on 'customer' alone
                  // silently drops the 'mover' accounts (see User.MOVER_ROLES
                  // export). Aggregation $in inside $expr takes an array literal.
                  { $in: ['$role', ['customer', 'mover']] }
                ]
              }
            }
          },
          {
            $project: {
              companyName: 1,
              email: 1,
              phone: 1,
              balance: 1,
              serviceAreas: 1,
              autoRechargeThreshold: 1,
              autoRechargeAmount: 1,
              stripeCustomerId: 1
            }
          }
        ],
        as: 'userDoc'
      }
    },

    // Stage 6 — drop companies that failed the balance / suspension / role filter
    {
      $match: { 'userDoc.0': { $exists: true } }
    },

    // Stage 7 — flatten the single-element userDoc array into the root document
    {
      $replaceRoot: { newRoot: { $arrayElemAt: ['$userDoc', 0] } }
    },

    // Stage 8 — highest balance first (consistent with previous behaviour)
    {
      $sort: { balance: -1 }
    }
  ]);

  return eligibleMovers;
}

module.exports = findEligibleMovers;
