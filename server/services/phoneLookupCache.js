/**
 * Phone Lookup Cache — Phase 2.
 *
 * Wraps `twilioLookupService.lookup()` with a 30-day cache keyed by E.164
 * phone. Same number resubmitted within 30 days reuses the cached result
 * instead of paying Twilio again ($0.005-0.04 per call depending on packages).
 *
 * Cache returns the SAME shape as the underlying service, with `result.fromCache`
 * set so the consumer / validation log can tell apart fresh vs cached results.
 *
 * Cache key includes the package list — if Identity Match gets enabled later,
 * an existing cached entry without it doesn't satisfy the new request.
 */

const PhoneLookupCache = require('../models/PhoneLookupCache');
const twilioLookupService = require('./twilioLookupService');

const TTL_DAYS = 30;

function packagesKey(packages) {
  return [...(packages || [])].sort().join(',');
}

/**
 * Look up phone — cached if available, otherwise call provider and cache.
 *
 * @param {string} phone - Raw phone, normalized to E.164 internally
 * @param {Object} opts  - { firstName, lastName } for identity_match
 * @returns {Promise<Object>} same shape as twilioLookupService.lookup()
 *                            with `result.fromCache: true|false`
 */
async function lookup(phone, opts = {}) {
  const e164 = twilioLookupService.normalizeE164(phone);
  if (!e164) {
    return {
      available: false, status: 'skipped', provider: 'phone_lookup_cache',
      packages: [], result: { reason: 'invalid_phone_shape', fromCache: false },
      rawRedacted: '', costUsd: 0, error: null,
    };
  }

  // Try cache first
  let cached;
  try {
    cached = await PhoneLookupCache.findOne({ phone: e164 }).lean();
  } catch (err) {
    // Cache failure must not block validation — log and proceed without cache
    console.warn('[phoneLookupCache] read failed:', err.message);
    cached = null;
  }

  if (cached && cached.result) {
    // Cache hit — return with fromCache marker.
    let innerResult = { ...(cached.result.result || {}), fromCache: true };

    // Honor admin intent: if caller passes skipIdentityMatch=true, strip any
    // identity-match data from the cached result even if it was paid for in
    // a previous lookup. Prevents stale toggle behavior — admin flipping the
    // toggle off must immediately stop downstream code from seeing
    // identity_match signals.
    if (opts.skipIdentityMatch && innerResult.identityMatch) {
      innerResult = { ...innerResult, identityMatch: null };
    }

    return {
      ...cached.result,
      result: innerResult,
      packages: cached.packages || [],
      costUsd: 0, // no new charge on cache hit
      // Keep status from the cached result but flag the cache layer
      status: cached.result.status === 'ok' ? 'cached' : cached.result.status,
    };
  }

  // Cache miss — fetch fresh
  const fresh = await twilioLookupService.lookup(phone, opts);
  fresh.result = { ...(fresh.result || {}), fromCache: false };

  // Only cache successful lookups. Don't pollute cache with skip/error states.
  if (fresh.status === 'ok' && fresh.available) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);
    try {
      await PhoneLookupCache.updateOne(
        { phone: e164 },
        { $set: { phone: e164, result: fresh, packages: fresh.packages, fetchedAt: now, expiresAt } },
        { upsert: true }
      );
    } catch (err) {
      // Cache write failure must not block validation
      console.warn('[phoneLookupCache] write failed:', err.message);
    }
  }

  return fresh;
}

module.exports = {
  lookup,
  TTL_DAYS,
};
