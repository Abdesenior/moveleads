/**
 * Twilio Lookup V2 service — Phase 2 shadow validation.
 *
 * Uses the Twilio REST API to fetch enrichment packages for a phone number:
 *   - `line_type_intelligence` — landline / mobile / voip / fixedVoip / nonFixedVoip
 *   - `sms_pumping_risk` — SMS pumping risk score 0–100 + level (low/medium/high)
 *   - `identity_match` — first/last name match against carrier data (OPTIONAL,
 *      requires `ENABLE_TWILIO_IDENTITY_MATCH=true` AND prior brand approval
 *      on the Twilio account)
 *
 * Phase 2 invariants:
 *   - NEVER replaces existing Abstract API path (services/twilioService.js)
 *   - NEVER mutates Lead directly — caller (validationPipeline) does that
 *   - NEVER throws to its caller — returns `{ available, status, ... }`
 *   - Safely no-ops when env vars are missing or flag is off
 *
 * Cost note: each enabled package is billed separately by Twilio. With the
 * default two-package config (line_type + sms_pumping_risk), expect roughly
 * $0.01 per call. Identity match adds more. Caching is the caller's job.
 */

const PROVIDER = 'twilio_lookup_v2';
const DEFAULT_PACKAGES = ['line_type_intelligence', 'sms_pumping_risk'];

function isEnabled() {
  return String(process.env.ENABLE_TWILIO_LOOKUP).toLowerCase() === 'true';
}

function isIdentityMatchEnabled() {
  return String(process.env.ENABLE_TWILIO_IDENTITY_MATCH).toLowerCase() === 'true';
}

function getPackagesToFetch({ skipIdentityMatch = false } = {}) {
  const base = (process.env.TWILIO_LOOKUP_PACKAGES || DEFAULT_PACKAGES.join(','))
    .split(',').map(s => s.trim()).filter(Boolean);
  // Identity match must satisfy BOTH the env flag AND the caller's "allowed"
  // signal. The validation pipeline passes `skipIdentityMatch: true` when the
  // admin toggle is off — that suppresses it even if env says otherwise.
  const identityAllowed = isIdentityMatchEnabled() && !skipIdentityMatch;
  if (!identityAllowed) {
    return base.filter(p => p !== 'identity_match');
  }
  if (!base.includes('identity_match')) base.push('identity_match');
  return base;
}

function normalizeE164(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  // Already E.164 or unsupported shape — return as-is with +
  if (String(phone).startsWith('+')) return String(phone);
  return null;
}

/**
 * Semantic NANP (North American Numbering Plan) validation.
 *
 * Catches numbers that are structurally well-formed E.164 (so Twilio's
 * `valid: true` would pass) but cannot be a real, allocated US/Canadian
 * phone number. Run BEFORE the paid Twilio call to:
 *   1. Reject obvious fakes without spending money on a useless lookup
 *   2. Produce a definitive `valid: false` that the scoring engine treats
 *      as a hard negative trust signal
 *
 * Returns `{ fake: true, pattern: string }` if the number looks fake,
 * otherwise `{ fake: false }`.
 *
 * Only applies to NANP (+1...) numbers; non-NANP numbers pass through.
 *
 * Rules enforced (any one → fake):
 *   - NPA (area code) starts with 0 or 1 (NANP invariant — never valid)
 *   - NXX (exchange) starts with 0 or 1 (NANP invariant — never valid)
 *   - NPA is an N11 service code (211/311/411/511/611/711/811/911)
 *   - 555-01XX subscriber range (5550100-5550199 reserved for fiction)
 *   - All 10 digits the same (1111111111, 9999999999, 0000000000)
 *
 * Deliberately NOT enforced (would false-positive on real numbers):
 *   - npa_all_same_digit — would block toll-free 888-XXX-XXXX (real)
 *   - nxx_all_same_digit — would block 415-555-XXXX (real exchange)
 *   - npa_equals_nxx     — could match real numbers like 415-415-XXXX
 *   - subscriber_line_all_same — too aggressive (4444 might be real)
 *
 * Numbers that pass this local check still go to Twilio for proper carrier
 * lookup; less-obvious fakes (e.g. 415-999-9999 with unallocated NXX) are
 * caught downstream by Twilio's `line_type_intelligence: null` response,
 * which surfaces as "phone unverifiable: no carrier intelligence returned"
 * in the scoring engine.
 */
function isLikelyFakeNanpNumber(e164) {
  if (!e164 || !e164.startsWith('+1') || e164.length !== 12) {
    return { fake: false }; // non-NANP, skip semantic check
  }
  const digits = e164.slice(2); // 10 digits after +1
  const npa = digits.slice(0, 3);
  const nxx = digits.slice(3, 6);
  const subscriberLine = digits.slice(6, 10);

  // ── NANP invariants — guaranteed-invalid ────────────────────────────────
  if (/^[01]/.test(npa)) return { fake: true, pattern: 'npa_leading_0_or_1' };
  if (/^[01]/.test(nxx)) return { fake: true, pattern: 'nxx_leading_0_or_1' };

  // N11 service codes (211, 311, 411, 511, 611, 711, 811, 911) cannot be
  // NPAs for normal phone calls — they're emergency/service codes.
  if (/^[2-9]11$/.test(npa)) return { fake: true, pattern: 'npa_is_n11_service_code' };

  // 555-01XX is reserved for fiction (5550100 through 5550199)
  if (nxx === '555' && /^01/.test(subscriberLine)) {
    return { fake: true, pattern: 'reserved_fiction_555_01XX' };
  }

  // All 10 digits identical (1111111111, 9999999999, etc.)
  if (/^(\d)\1{9}$/.test(digits)) return { fake: true, pattern: 'all_same_digit' };

  return { fake: false };
}

function redactPhone(text) {
  if (!text) return text;
  // Replace any run of 7+ digits with `***NNNN` (preserve last 4)
  return String(text).replace(/\d{7,}/g, m => '***' + m.slice(-4));
}

// Normalize the raw Twilio V2 response into a stable, admin-friendly shape.
// Twilio's response is verbose; we extract the few fields scoring/admin care
// about and discard the rest.
//
// Strictness rules (tightened in Phase 3.6):
//   - `valid` is TRUE only when Twilio explicitly returns `valid: true` AND
//     `validation_errors` is empty or absent. We do NOT infer validity from
//     the presence of a guessed lineType — Twilio sometimes guesses a type
//     for structurally-formed-but-unallocated numbers.
//   - When `valid: true` but no telecom enrichment data was returned
//     (line_type_intelligence absent or { type: null }), we record this via
//     `validityReason: 'twilio_no_enrichment'` so the scoring engine can
//     treat it as suspicious rather than trusted.
function normalizeLookup(raw, identityFirstName, identityLastName) {
  const lti = raw.line_type_intelligence || raw.lineTypeIntelligence || null;
  const spr = raw.sms_pumping_risk || raw.smsPumpingRisk || null;
  const idm = raw.identity_match || raw.identityMatch || null;
  const validationErrors = Array.isArray(raw.validation_errors) ? raw.validation_errors
                          : Array.isArray(raw.validationErrors) ? raw.validationErrors
                          : [];

  const ltiTypeRaw = lti && (lti.type || lti.lineType);
  const lineType = ltiTypeRaw ? String(ltiTypeRaw).toLowerCase() : null;
  const isVoip = lineType ? /voip/.test(lineType) : null;
  const carrierName = lti && (lti.carrier_name || lti.carrierName) || null;

  // SMS Pumping Risk: numeric 0-100 + bucket
  let smsPumpingRisk = null;
  let smsPumpingScore = null;
  if (spr) {
    smsPumpingScore = Number(spr.sms_pumping_risk_score ?? spr.smsPumpingRiskScore ?? spr.score ?? -1);
    if (Number.isNaN(smsPumpingScore) || smsPumpingScore < 0) smsPumpingScore = null;
    if (smsPumpingScore !== null) {
      smsPumpingRisk = smsPumpingScore >= 70 ? 'high'
                      : smsPumpingScore >= 30 ? 'medium'
                      : 'low';
    }
  }

  let identityMatch = null;
  if (idm) {
    identityMatch = {
      firstNameMatch: idm.first_name_match === true || idm.firstNameMatch === true || idm.first_name_match === 'true',
      lastNameMatch:  idm.last_name_match  === true || idm.lastNameMatch  === true || idm.last_name_match  === 'true',
      summaryScore:   idm.summary_score ?? idm.summaryScore ?? null,
      providedFirstName: identityFirstName || null,
      providedLastName:  identityLastName  || null,
    };
  }

  // ── Strict `valid` ──────────────────────────────────────────────────────
  // Require Twilio to explicitly say `valid: true` AND have no validation
  // errors. No heuristic fallback from the presence of a guessed lineType —
  // that fallback could mark unallocated NANP numbers as valid when Twilio
  // happens to return a type guess.
  const twilioSaysValid = raw.valid === true || raw.valid === 'true';
  const noValidationErrors = validationErrors.length === 0;
  let valid = twilioSaysValid && noValidationErrors;

  // ── validityReason: why valid is false, OR why it's true-but-weak ─────
  // The scoring engine reads this to produce specific tier-router reasons.
  let validityReason = null;
  if (!valid) {
    if (!twilioSaysValid) {
      validityReason = raw.valid === false ? 'twilio_says_invalid' : 'twilio_no_valid_field';
    } else if (!noValidationErrors) {
      validityReason = `twilio_validation_errors:${validationErrors.join(',')}`.slice(0, 120);
    }
  } else {
    // valid===true but check if Twilio actually gave us anything useful.
    const hasEnrichment = lineType !== null || smsPumpingRisk !== null
                       || (identityMatch && (identityMatch.firstNameMatch || identityMatch.lastNameMatch));
    if (!hasEnrichment) {
      validityReason = 'twilio_no_enrichment';
    }
  }

  return {
    valid,
    validityReason,
    lineType,
    isVoip,
    carrierName,
    smsPumpingRisk,
    smsPumpingScore,
    identityMatch,
    countryCode: raw.country_code || raw.countryCode || null,
    nationalFormat: raw.national_format || raw.nationalFormat || null,
    validationErrors: validationErrors.length ? validationErrors : null,
  };
}

/**
 * Look up a phone number. Fire-and-forget safe — always resolves, never rejects.
 *
 * @param {string} phone - Raw phone (10/11 digit US or E.164)
 * @param {Object} opts
 * @param {string} [opts.firstName] - For identity_match (optional)
 * @param {string} [opts.lastName]  - For identity_match (optional)
 * @returns {Promise<Object>} { available, status, provider, packages, result, rawRedacted, costUsd, error }
 */
async function lookup(phone, opts = {}) {
  const e164 = normalizeE164(phone);
  if (!e164) {
    return {
      available: false, status: 'skipped', provider: PROVIDER,
      packages: [], result: { reason: 'invalid_phone_shape', valid: false, validityReason: 'invalid_shape' },
      rawRedacted: '', costUsd: 0, error: null,
    };
  }

  // ── Local NANP semantic check (BEFORE the paid API call) ────────────────
  // Catches fake-pattern numbers like (123) 123-1234, 1111111111, 9999999999.
  // These are structurally valid E.164 so Twilio's `valid` would return true,
  // but they cannot be real allocated NANP numbers. Reject locally to:
  //   1. Save $0.005-0.04 per fake submission
  //   2. Produce a definitive valid:false the scoring engine treats as a
  //      hard negative trust signal (-30 trust, force-review or hard reject
  //      depending on compounding signals)
  // The "fake" check is non-Twilio: status='ok', available=true, valid=false,
  // packages=['local_nanp_check'] so admin can tell apart from a real
  // Twilio invalid response.
  const fakeCheck = isLikelyFakeNanpNumber(e164);
  if (fakeCheck.fake) {
    console.log(`[twilioLookup] LOCAL FAKE-PATTERN BLOCK: ${e164} → pattern=${fakeCheck.pattern} (no API call)`);
    return {
      available: true, status: 'ok', provider: 'local_nanp_check',
      packages: ['local_nanp_check'],
      result: {
        valid: false,
        validityReason: `fake_pattern:${fakeCheck.pattern}`,
        lineType: null, isVoip: null, carrierName: null,
        smsPumpingRisk: null, smsPumpingScore: null,
        identityMatch: null,
        countryCode: 'US', nationalFormat: null, validationErrors: null,
      },
      rawRedacted: JSON.stringify({ local_check: 'failed', pattern: fakeCheck.pattern }),
      costUsd: 0, error: null,
    };
  }

  if (!isEnabled()) {
    return {
      available: false, status: 'skipped', provider: PROVIDER,
      packages: [], result: { reason: 'feature_flag_off' },
      rawRedacted: '', costUsd: 0, error: null,
    };
  }

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return {
      available: false, status: 'skipped', provider: PROVIDER,
      packages: [], result: { reason: 'twilio_credentials_missing' },
      rawRedacted: '', costUsd: 0, error: null,
    };
  }

  const packages = getPackagesToFetch({ skipIdentityMatch: opts.skipIdentityMatch });
  if (packages.length === 0) {
    return {
      available: false, status: 'skipped', provider: PROVIDER,
      packages: [], result: { reason: 'no_packages_enabled' },
      rawRedacted: '', costUsd: 0, error: null,
    };
  }

  // Use raw fetch instead of the Twilio SDK helper — gives us tighter control
  // over the packages query string and timeout behaviour. Twilio V2 supports
  // comma-separated `Fields` for multiple packages in one HTTP call.
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=${packages.join(',')}`;
  const auth = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

  const headers = { Authorization: auth, Accept: 'application/json' };
  // Identity match requires the names to be sent as query params.
  let fullUrl = url;
  if (packages.includes('identity_match') && (opts.firstName || opts.lastName)) {
    const qp = [];
    if (opts.firstName) qp.push(`FirstName=${encodeURIComponent(opts.firstName)}`);
    if (opts.lastName)  qp.push(`LastName=${encodeURIComponent(opts.lastName)}`);
    fullUrl = `${url}&${qp.join('&')}`;
  }

  const ctrl = new AbortController();
  const timeoutMs = Number(process.env.TWILIO_LOOKUP_TIMEOUT_MS || 5000);
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  let raw;
  try {
    const res = await fetch(fullUrl, { headers, signal: ctrl.signal });
    const text = await res.text();
    raw = text ? JSON.parse(text) : {};
    // Phase 3.6: log the redacted raw response so admin can inspect what
    // Twilio actually returned for any given number. Critical for debugging
    // false-positives on telecom trust.
    console.log(`[twilioLookup] RAW response for ${redactPhone(e164)} (status=${res.status}):`,
      redactPhone(JSON.stringify(raw)).slice(0, 1500));

    if (!res.ok) {
      // 404 = number not found, 400 = bad shape, 401 = bad creds
      return {
        available: false, status: 'error', provider: PROVIDER,
        packages, result: { reason: 'http_error', httpStatus: res.status },
        rawRedacted: redactPhone(text || '').slice(0, 8 * 1024),
        costUsd: 0,
        error: { message: raw?.message || `HTTP ${res.status}`, httpStatus: res.status },
      };
    }
  } catch (err) {
    return {
      available: false, status: 'error', provider: PROVIDER,
      packages, result: { reason: err.name === 'AbortError' ? 'timeout' : 'fetch_failed' },
      rawRedacted: '', costUsd: 0,
      error: { message: err.message },
    };
  } finally {
    clearTimeout(t);
  }

  const normalized = normalizeLookup(raw, opts.firstName, opts.lastName);
  // Cost estimate — line_type + sms_pumping ≈ $0.01; identity adds ~$0.04
  const baseCost = packages.filter(p => p !== 'identity_match').length * 0.005;
  const identityCost = packages.includes('identity_match') ? 0.04 : 0;
  const costUsd = +(baseCost + identityCost).toFixed(4);

  return {
    available: true, status: 'ok', provider: PROVIDER,
    packages, result: normalized,
    rawRedacted: redactPhone(JSON.stringify(raw)).slice(0, 8 * 1024),
    costUsd,
    error: null,
  };
}

module.exports = {
  lookup,
  normalizeE164,
  isLikelyFakeNanpNumber,
  isEnabled,
  isIdentityMatchEnabled,
  PROVIDER,
};
