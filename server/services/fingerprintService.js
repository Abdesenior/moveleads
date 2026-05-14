/**
 * Fingerprint service — Phase 2 placeholder.
 *
 * Stub returning a neutral result. The shape is locked in NOW so V5 ingest,
 * validation pipeline, and scoring engine can integrate against a stable
 * contract before we choose a real fingerprint provider (FingerprintJS,
 * Castle, ipQualityScore, etc).
 *
 * Treats missing data as **neutral**, not suspicious — ~30% of users run ad
 * blockers that strip fingerprint scripts; flagging them as fraud would be
 * a worse signal than the noise we'd remove.
 *
 * When a real provider is wired in, only this file changes. Callers and
 * consumers (validationPipeline, leadScoringEngine) already read the shape
 * defined below.
 */

const PROVIDER = 'fingerprint_stub';

function isEnabled() {
  return String(process.env.ENABLE_FINGERPRINT).toLowerCase() === 'true';
}

/**
 * Verify a Fingerprint visitorId/requestId pair. Fire-and-forget safe.
 *
 * @param {string} visitorId  - From the client-side Fingerprint SDK
 * @param {string} requestId  - From the SAME page load as visitorId
 * @returns {Promise<Object>} { available, status, provider, result, rawRedacted, costUsd, error }
 *
 * Returned `result` shape (consumed by leadScoringEngine):
 *   {
 *     visitorId,           // echoed
 *     confidence: number,  // 0-1 (null when missing)
 *     bot: boolean | null, // null = unknown
 *     vpn: boolean | null,
 *     incognito: boolean | null,
 *     ipCountry: string | null,
 *     reason: 'present' | 'missing_input' | 'feature_flag_off' | 'no_provider_configured'
 *   }
 */
async function verify(visitorId, requestId) {
  if (!isEnabled()) {
    return {
      available: false, status: 'skipped', provider: PROVIDER,
      result: { visitorId: null, confidence: null, bot: null, vpn: null, incognito: null, ipCountry: null, reason: 'feature_flag_off' },
      rawRedacted: '', costUsd: 0, error: null,
    };
  }

  if (!visitorId || !requestId) {
    return {
      available: false, status: 'skipped', provider: PROVIDER,
      result: { visitorId: visitorId || null, confidence: null, bot: null, vpn: null, incognito: null, ipCountry: null, reason: 'missing_input' },
      rawRedacted: '', costUsd: 0, error: null,
    };
  }

  // No provider wired yet. We return "neutral present" so the scoring engine
  // sees that we *did* get a fingerprint, but with no signal to act on.
  return {
    available: false, status: 'skipped', provider: PROVIDER,
    result: { visitorId, confidence: null, bot: null, vpn: null, incognito: null, ipCountry: null, reason: 'no_provider_configured' },
    rawRedacted: '', costUsd: 0, error: null,
  };
}

module.exports = {
  verify,
  isEnabled,
  PROVIDER,
};
