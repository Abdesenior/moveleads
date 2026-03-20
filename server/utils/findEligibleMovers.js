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
                  { $gte: ['$balance', leadPrice] },
                  { $ne: ['$isSuspended', true] },
                  { $eq: ['$role', 'customer'] }
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
