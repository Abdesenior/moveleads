/**
 * Validation Toggles — Phase 2.5 admin-controlled kill switches.
 *
 * Reads from PlatformSettings.config.validation. Acts as the SECOND layer of
 * gating after the env flags (see validationPipeline). The two layers are
 * AND-ed together:
 *
 *     service runs only if   env_flag === true   AND   admin_toggle === true
 *
 * Why two layers:
 *   - env flag = the "safety / deploy" layer (requires a redeploy or env var
 *     change to flip). Used to control whether the feature can ever run in a
 *     given environment, regardless of admin actions.
 *   - admin toggle = the "operational" layer (changes propagate within 30s).
 *     Used for cost control, staged rollout, instant kill-switch.
 *
 * Fail-safe semantics:
 *   - If PlatformSettings cannot be read, return all OFF.
 *   - If the doc has no `config.validation` field, return all OFF.
 *   - If a specific toggle key is missing, treat as OFF.
 *
 * Caching:
 *   - 30-second in-memory TTL. After a PATCH from the admin UI, the route
 *     handler calls `invalidate()` so the new value is picked up immediately
 *     on the same worker. Other workers (if any) pick it up within 30s.
 */

const PlatformSettings = require('../models/PlatformSettings');

const TTL_MS = 30_000;
const ALL_OFF = Object.freeze({
  mapboxEnabled: false,
  twilioLookupEnabled: false,
  twilioIdentityMatchEnabled: false,
});

let cache = { value: null, expiresAt: 0 };

function fromConfig(config) {
  const v = (config && config.validation) || {};
  return {
    mapboxEnabled:              v.mapboxEnabled === true,
    twilioLookupEnabled:        v.twilioLookupEnabled === true,
    twilioIdentityMatchEnabled: v.twilioIdentityMatchEnabled === true,
  };
}

/**
 * Get the current admin toggle state. Always returns an object — never throws.
 * On DB failure, returns ALL_OFF and caches the failure for 5s so repeated
 * pipeline runs don't all retry simultaneously.
 */
async function get() {
  const now = Date.now();
  if (cache.value && now < cache.expiresAt) return cache.value;

  try {
    const ps = await PlatformSettings.findOne().lean();
    const value = fromConfig(ps && ps.config);
    cache = { value, expiresAt: now + TTL_MS };
    return value;
  } catch (err) {
    console.warn('[validationToggles] read failed, defaulting to ALL OFF:', err.message);
    // Cache the safe default briefly so we don't slam the DB during an outage,
    // but short enough that recovery is fast (5s vs 30s).
    cache = { value: ALL_OFF, expiresAt: now + 5_000 };
    return ALL_OFF;
  }
}

/**
 * Invalidate the cache. Call this after PATCH-ing the toggles so the new
 * state is reflected on the next read instead of waiting for TTL expiry.
 */
function invalidate() {
  cache = { value: null, expiresAt: 0 };
}

/**
 * Write toggles to PlatformSettings.config.validation. Upserts the singleton
 * doc if it doesn't exist. Returns the resulting toggle object.
 *
 * Each input field is independently optional — only provided keys are
 * updated, others retain their stored value.
 */
async function set(partial) {
  const current = await PlatformSettings.findOne();
  const next = {
    ...(current?.config?.validation || {}),
    ...(partial.mapboxEnabled !== undefined && { mapboxEnabled: !!partial.mapboxEnabled }),
    ...(partial.twilioLookupEnabled !== undefined && { twilioLookupEnabled: !!partial.twilioLookupEnabled }),
    ...(partial.twilioIdentityMatchEnabled !== undefined && { twilioIdentityMatchEnabled: !!partial.twilioIdentityMatchEnabled }),
  };

  // Safety: if Twilio Lookup is OFF, Identity Match must also be off — it can
  // never run without its parent. We enforce that on write so nothing in the
  // DB can express "identity_match=true while parent=false".
  if (next.twilioLookupEnabled === false) {
    next.twilioIdentityMatchEnabled = false;
  }

  await PlatformSettings.updateOne(
    {},
    { $set: { 'config.validation': next } },
    { upsert: true }
  );

  invalidate();
  return next;
}

module.exports = {
  get,
  set,
  invalidate,
  ALL_OFF,
};
