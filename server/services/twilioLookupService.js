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

function getPackagesToFetch() {
  const base = (process.env.TWILIO_LOOKUP_PACKAGES || DEFAULT_PACKAGES.join(','))
    .split(',').map(s => s.trim()).filter(Boolean);
  // Identity match is opt-in via its own flag, regardless of the package list
  // (so admins can leave it in the env list and gate purely on the flag).
  if (!isIdentityMatchEnabled()) {
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

function redactPhone(text) {
  if (!text) return text;
  // Replace any run of 7+ digits with `***NNNN` (preserve last 4)
  return String(text).replace(/\d{7,}/g, m => '***' + m.slice(-4));
}

// Normalize the raw Twilio V2 response into a stable, admin-friendly shape.
// Twilio's response is verbose; we extract the few fields scoring/admin care
// about and discard the rest.
function normalizeLookup(raw, identityFirstName, identityLastName) {
  const lti = raw.line_type_intelligence || raw.lineTypeIntelligence || null;
  const spr = raw.sms_pumping_risk || raw.smsPumpingRisk || null;
  const idm = raw.identity_match || raw.identityMatch || null;

  const lineType = lti && (lti.type || lti.lineType) ? String(lti.type || lti.lineType).toLowerCase() : null;
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
      // Twilio returns matches per-field. We compare result strings vs the
      // names we sent in the request.
      firstNameMatch: idm.first_name_match === true || idm.firstNameMatch === true || idm.first_name_match === 'true',
      lastNameMatch:  idm.last_name_match  === true || idm.lastNameMatch  === true || idm.last_name_match  === 'true',
      // Twilio may also return a confidence summary
      summaryScore:   idm.summary_score ?? idm.summaryScore ?? null,
      providedFirstName: identityFirstName || null,
      providedLastName:  identityLastName  || null,
    };
  }

  return {
    valid: raw.valid === true || raw.valid === 'true' ||
           // V2 doesn't always include `valid` — treat presence of LTI as valid
           (lineType !== null && raw.valid !== false),
    lineType,
    isVoip,
    carrierName,
    smsPumpingRisk,
    smsPumpingScore,
    identityMatch,
    countryCode: raw.country_code || raw.countryCode || null,
    nationalFormat: raw.national_format || raw.nationalFormat || null,
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
      packages: [], result: { reason: 'invalid_phone_shape' },
      rawRedacted: '', costUsd: 0, error: null,
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

  const packages = getPackagesToFetch();
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
  isEnabled,
  isIdentityMatchEnabled,
  PROVIDER,
};
