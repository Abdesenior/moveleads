/**
 * Lead Scoring Engine — V5 deterministic rules-based scoring.
 *
 * Phase 1 (shadow mode): output is consumed only by leadTierRouter and stored
 * in `scoring_snapshots`. NEVER mutates Lead.score / Lead.grade / Lead.price /
 * Lead.status. NEVER influences pricing, broadcast, dispatch, or auctions.
 *
 * Pure function: given a `lead` Mongoose doc (or a plain object with the same
 * shape) returns `{ scores, breakdown }`. No I/O, no clock side effects beyond
 * `Date.now()` for urgency. Deterministic for a given input.
 *
 * Each sub-score is on 0–100. compositeScore is a weighted average; weights
 * are placeholders chosen to match the spec's stated priorities and will be
 * re-tuned against historical data before SCORING_MODE flips to live.
 */

const ENGINE_VERSION = 'v5.phase1.0';

const WEIGHTS = {
  trustScore:       0.20,
  urgencyScore:     0.15,
  leadValueScore:   0.20,
  routeValueScore:  0.10,
  intentScore:      0.15,
  fraudRiskScore:   0.10,  // higher = better (lower fraud risk)
  moverMatchScore:  0.10,
};

const HOME_SIZE_VALUE = {
  'Studio':           20,
  '1 Bedroom':        35,
  '2 Bedroom':        55,
  '3 Bedroom':        75,
  '4 Bedroom':        90,
  '4+ Bedroom':       95,
  '5 Bedroom':        100,
  '5+ Bedroom':       100,
  'House (Small)':    65,
  'House (Medium)':   80,
  'House (Large)':    95,
  'Office/Commercial':70,
  'Office / Commercial':70,
};

function clamp(n, lo, hi) {
  if (Number.isNaN(n) || n == null) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function daysUntil(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/* ── Sub-scores ────────────────────────────────────────────────────────────── */

// Trust: validation signals (phone valid, line type, email present, name length).
// Phase 1 has no Twilio Lookup yet, so we lean on the legacy `isVerified` flag
// and basic shape checks. Default to 50 (neutral) when nothing is known.
function trustScore(lead) {
  let s = 50; // neutral baseline
  const reasons = [];

  // ── Phone SHAPE (neutral — does NOT contribute to trust) ────────────────
  // A correctly E.164-formatted number isn't "verified" — anyone can type 10
  // random digits in a valid shape. We only PENALIZE clearly malformed
  // shapes (defense-in-depth; Zod blocks these at ingest). Well-shaped
  // numbers contribute nothing to trust on their own.
  const phone = String(lead.customerPhone || '').replace(/\D/g, '');
  const shapeOk = phone.length === 10 || phone.length === 11;
  if (!shapeOk && phone.length > 0) {
    s -= 20; reasons.push('phone shape malformed');
  }
  // (well-shaped phone: silent — neutral. No "phone shape ok" reason logged
  // because that would falsely look like a trust signal.)

  // ── Phone TRUST (Twilio Lookup is the sole authority) ──────────────────
  // The legacy `lead.isVerified` flag is intentionally IGNORED here. After
  // Phase 3.5 removed Abstract API, that flag is auto-set to true on every
  // happy-path ingest and no longer reflects any external validation.
  // Phone trust comes ONLY from lead.validation.phone.* populated by
  // services/twilioLookupService.js, gated by env flag + admin toggle.
  // If Twilio Lookup hasn't run (flags off, admin toggled off, timeout),
  // we surface that explicitly as "phone unverified" — no trust boost.
  const phoneLookup = lead.validation && lead.validation.phone;
  const phoneLookupRan = phoneLookup && (
    phoneLookup.checkedAt != null ||
    phoneLookup.lineType != null ||
    phoneLookup.smsPumpingRisk != null ||
    phoneLookup.smsPumpingScore != null ||
    phoneLookup.valid === true ||
    phoneLookup.valid === false
  );

  if (!phoneLookupRan) {
    // No telecom validation data — phone trust is UNKNOWN.
    reasons.push('telecom unverified');
  } else if (phoneLookup.valid === false) {
    // Definitive invalid signal. Could be from local NANP rule or from
    // local impossible-pattern detection or from Twilio.
    // Heaviest single negative trust signal we apply.
    s -= 30;
    const reason = phoneLookup.validityReason || '';
    // Map validityReason → user-facing trust reason (vocabulary per spec)
    if (reason.startsWith('local_nanp_rule:')) {
      reasons.push(`phone invalid: local NANP rule (${reason.slice('local_nanp_rule:'.length)})`);
    } else if (reason.startsWith('impossible_pattern:')) {
      reasons.push(`phone invalid: impossible pattern (${reason.slice('impossible_pattern:'.length)})`);
    } else if (reason.startsWith('fake_pattern:')) {
      // Back-compat for snapshots written before the label split
      reasons.push(`phone invalid: ${reason.slice('fake_pattern:'.length)}`);
    } else if (reason === 'twilio_says_invalid') {
      reasons.push('phone invalid: telecom rejected');
    } else if (reason.startsWith('twilio_validation_errors:')) {
      reasons.push(`phone invalid: ${reason.slice('twilio_validation_errors:'.length)}`);
    } else {
      reasons.push(reason ? `phone invalid: ${reason}` : 'phone invalid');
    }
  } else {
    // Twilio Lookup ran with valid=true. Grade trust ONLY from authoritative
    // enrichment. valid===true ALONE is NOT a trust boost — Twilio reports
    // valid for any recognized phone-number FORMAT regardless of whether the
    // number is allocated/reachable.
    let trustGain = 0;
    const positiveSignals = [];

    const smsPumpingLow = phoneLookup.smsPumpingRisk === 'low';
    if (smsPumpingLow) {
      trustGain += 10; positiveSignals.push('low SMS pumping risk');
    }
    // medium/high SMS pumping risk are penalized separately in fraudRiskScore
    // to avoid double-counting.

    // Line type — Twilio LTI returns 'mobile', 'landline', 'fixedVoip',
    // 'nonFixedVoip', 'tollFree' etc. We use isVoip boolean to catch all
    // VoIP variants. "trusted mobile line" only when mobile + low SMS
    // pumping AND no local suspicionPattern — wording must align with risk
    // (don't claim "trusted" next to a "suspicious phone pattern" reason).
    const isMobile = phoneLookup.lineType === 'mobile';
    const hasSuspicion = !!phoneLookup.suspicionPattern;
    if (isMobile) {
      const trustedMobile = smsPumpingLow && !hasSuspicion;
      trustGain += trustedMobile ? 8 : 5;
      positiveSignals.push(trustedMobile ? 'trusted mobile line' : 'mobile line');
    } else if (phoneLookup.isVoip === true) {
      // User vocabulary: "voip line detected" (was "voip line (xxx)").
      s -= 10; reasons.push('voip line detected');
    } else if (phoneLookup.lineType === 'landline') {
      reasons.push('landline');
    } else if (phoneLookup.lineType === 'tollfree') {
      reasons.push('toll-free line');
    }

    // Twilio Identity Match (opt-in). User vocabulary:
    //   - positive match → "owner verified" (carrier confirms name on file)
    //   - no positive match → "identity not confirmed" (neutral, no penalty)
    if (phoneLookup.identityMatch) {
      const im = phoneLookup.identityMatch;
      if (im.firstNameMatch === true && im.lastNameMatch === true) {
        trustGain += 15; positiveSignals.push('owner verified (first + last match)');
      } else if (im.firstNameMatch === true || im.lastNameMatch === true) {
        trustGain += 8; positiveSignals.push('owner verified (partial name match)');
      } else {
        reasons.push('identity not confirmed');
      }
    }

    if (trustGain > 0) {
      // Header reason: "phone recognized by telecom lookup" (per spec).
      // Telecom recognition ≠ ownership confirmation — only "owner verified"
      // (via Identity Match) implies ownership.
      reasons.push('phone recognized by telecom lookup');
      for (const sig of positiveSignals) reasons.push(sig);
      s += trustGain;
    } else if (phoneLookup.validityReason === 'twilio_no_enrichment') {
      // Twilio confirmed format-valid but returned NO useful telecom
      // intelligence. Distinct from "telecom unverified" (no Twilio at
      // all) — Twilio actively looked at this number and couldn't find
      // anything, which is a stronger negative signal than not asking.
      // Real allocated numbers usually have at least a line type. Treat
      // as low-confidence (force-review in tier router).
      s -= 5;
      reasons.push('telecom low confidence — review required');
    } else {
      // Defensive — surface as neutral, never trusted.
      reasons.push('telecom unverified');
    }
  }

  // ── Suspicion pattern (medium-strength entropy signal, not invalidating) ──
  // Set by twilioLookupService.categorizePhonePattern when the number has a
  // patterned shape (e.g. 5-7 char alternating, monotonic run, low distinct)
  // that's suspicious but COULD still be a real allocation. The "— review
  // required" suffix makes the wording match the actual outcome (tier
  // router force-reviews on this signal — see leadTierRouter).
  if (phoneLookup && phoneLookup.suspicionPattern) {
    s -= 5;
    reasons.push(`suspicious phone pattern (${phoneLookup.suspicionPattern}) — review required`);
  }

  // ── Admin override: REJECTED_FAKE is a strong negative trust signal ────
  // Only fires now when an ADMIN manually flagged the lead (Phase 3.5
  // removed the automatic Abstract path). When it fires, it's a deliberate
  // human decision.
  if (lead.status === 'REJECTED_FAKE') {
    s -= 40; reasons.push('admin marked rejected fake');
  }

  // ── Email — small positive only if real, never for placeholders ────────
  const email = String(lead.customerEmail || '');
  const isPlaceholderEmail = email.startsWith('noemail+');
  const isValidEmailShape = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  if (isValidEmailShape && !isPlaceholderEmail) {
    s += 10; reasons.push('email shape ok');
  } else if (email && !isPlaceholderEmail) {
    s -= 10; reasons.push('email shape suspicious');
  }
  // (placeholder email: silent — neutral)

  // ── Name ──────────────────────────────────────────────────────────────
  const name = String(lead.customerName || '').trim();
  if (name.split(/\s+/).length >= 2) {
    s += 5; reasons.push('full name');
  } else if (name.length < 2) {
    s -= 10; reasons.push('name too short');
  }

  return { value: clamp(s, 0, 100), reasons };
}

// Urgency: how soon is the move? Closer = hotter (within reason).
function urgencyScore(lead) {
  const reasons = [];
  const days = daysUntil(lead.moveDate);
  if (days == null) {
    reasons.push('no move date');
    return { value: 30, reasons };
  }
  let s;
  if (days < 0)        { s = 0;   reasons.push('move date in past'); }
  else if (days <= 3)  { s = 100; reasons.push('moving in <= 3 days'); }
  else if (days <= 7)  { s = 90;  reasons.push('moving in <= 7 days'); }
  else if (days <= 14) { s = 75;  reasons.push('moving in <= 14 days'); }
  else if (days <= 30) { s = 60;  reasons.push('moving in <= 30 days'); }
  else if (days <= 60) { s = 45;  reasons.push('moving in <= 60 days'); }
  else if (days <= 90) { s = 30;  reasons.push('moving in <= 90 days'); }
  else                 { s = 15;  reasons.push('moving > 90 days out'); }

  // V5 explicit urgency bucket overrides if present (client said "ASAP"/"Flexible").
  if (lead.urgencyBucket === 'asap')      { s = Math.max(s, 95); reasons.push('client urgency: asap'); }
  if (lead.urgencyBucket === 'this_week') { s = Math.max(s, 85); reasons.push('client urgency: this week'); }
  if (lead.urgencyBucket === 'flexible')  { s = Math.min(s, 50); reasons.push('client urgency: flexible'); }

  return { value: clamp(s, 0, 100), reasons };
}

// Lead value: home size as proxy for revenue potential. Boosted by heavy items.
function leadValueScore(lead) {
  const reasons = [];
  let s = HOME_SIZE_VALUE[lead.homeSize] ?? 40;
  reasons.push(`home size: ${lead.homeSize || 'unknown'} (${s})`);

  if (Array.isArray(lead.heavyItems) && lead.heavyItems.length > 0) {
    const bonus = Math.min(15, lead.heavyItems.length * 5);
    s += bonus;
    reasons.push(`heavy items +${bonus}`);
  }

  return { value: clamp(s, 0, 100), reasons };
}

// Route value: long-distance generally pays more; very short hops penalized.
// Prefers Mapbox-geocoded distance when validation.route is populated —
// otherwise falls back to the client-submitted `miles` (V4 behaviour).
function routeValueScore(lead) {
  const reasons = [];
  const claimedMiles = Number(lead.miles) || 0;
  const geocodedMiles = lead.validation?.route?.geocodedMiles;
  const miles = (geocodedMiles && geocodedMiles > 0) ? geocodedMiles : claimedMiles;
  if (geocodedMiles && geocodedMiles > 0 && geocodedMiles !== claimedMiles) {
    reasons.push(`using geocoded miles (${geocodedMiles}) over claimed (${claimedMiles})`);
  }

  // Surface route-unresolved state explicitly so the breakdown matches risk.
  const routeSuspicious = lead.validation?.route?.suspicious || [];
  if (routeSuspicious.includes('origin_zip_not_found') || routeSuspicious.includes('destination_zip_not_found')) {
    reasons.push('route unresolved (Mapbox could not find ZIP)');
  }

  let s;
  if (miles <= 0)       { s = 30; reasons.push('unknown distance'); }
  else if (miles < 10)  { s = 35; reasons.push('< 10 miles'); }
  else if (miles < 50)  { s = 50; reasons.push('local move'); }
  else if (miles < 100) { s = 60; reasons.push('extended local'); }
  else if (miles < 500) { s = 80; reasons.push('long distance'); }
  else if (miles < 1500){ s = 90; reasons.push('cross-region'); }
  else                  { s = 100; reasons.push('cross-country'); }

  return { value: clamp(s, 0, 100), reasons };
}

// Intent: did the customer actively confirm they want quotes? V5 collects this
// explicitly via `intentConfirmed`. V4 leads default to neutral.
function intentScore(lead) {
  const reasons = [];
  let s = 60; // V4 neutral baseline
  if (lead.intentConfirmed === true)  { s = 95; reasons.push('intent confirmed'); }
  if (lead.intentConfirmed === false) { s = 25; reasons.push('intent NOT confirmed'); }

  if (lead.specialInstructions && lead.specialInstructions.length > 20) {
    s += 5; reasons.push('detailed instructions');
  }

  return { value: clamp(s, 0, 100), reasons };
}

// Fraud risk score (higher = LESS risky, to keep weighting math consistent).
// Phase 1 signals: status flags + obvious phone/email patterns. V5 will add
// fingerprint + duplicate-cluster signals in Phase 2.
function fraudRiskScore(lead) {
  const reasons = [];
  let s = 75; // assume not fraud by default

  if (lead.status === 'REJECTED_FAKE')      { s = 0;  reasons.push('marked rejected fake'); }
  if (lead.status === 'PENDING_MANUAL_REVIEW') { s -= 20; reasons.push('pending manual review'); }

  const phone = String(lead.customerPhone || '').replace(/\D/g, '');
  if (/^(\d)\1{6,}$/.test(phone)) { s -= 40; reasons.push('phone is repeated digit'); }
  if (phone.startsWith('555')) { s -= 30; reasons.push('phone starts with 555'); }

  const email = String(lead.customerEmail || '').toLowerCase();
  if (/test|fake|asdf|qwer/.test(email.split('@')[0] || '')) {
    s -= 25; reasons.push('email looks like test data');
  }

  if (lead.validation && lead.validation.fraud) {
    if (lead.validation.fraud.smsPumpingRisk === 'high')   { s -= 40; reasons.push('sms pumping risk (high)'); }
    if (lead.validation.fraud.smsPumpingRisk === 'medium') { s -= 15; reasons.push('sms pumping risk (medium)'); }
    // VoIP / disposable phone is a SINGLE-signal MEDIUM concern, not a
    // high one — many legitimate users use Google Voice / Bandwidth /
    // RingCentral etc. We lower the penalty here (-15) and let the tier
    // router send VoIP-only leads to the `review` queue rather than
    // auto-reject them. Compound signals (VoIP + high SMS + bot fp etc.)
    // still rack up enough penalty to trigger the hard-reject threshold.
    if (lead.validation.fraud.disposable === true)         { s -= 15; reasons.push('disposable / voip line'); }
  }

  // Phone-invalid is a STRONG fraud signal — local NANP check or Twilio
  // explicitly rejected the number. Penalty calibrated at -40 so the tier
  // router can compound with other mediums into a hard-reject:
  //   - invalid alone:                fraud = 35 → force-review (review)
  //   - invalid + 1 medium signal:    fraud ≈ 20 → review
  //   - invalid + 2 medium signals:   fraud ≈  5 → hard reject (rejected)
  // The tier router also has an explicit early-rule that caps phone-invalid
  // leads at 'review' regardless of composite, so even pristine V5 signals
  // can't promote an invalid phone to hot/premium.
  if (lead.validation && lead.validation.phone && lead.validation.phone.valid === false) {
    s -= 40;
    reasons.push('phone invalid (fraud impact)');
  }

  // Low telecom confidence — Twilio ran but returned NO useful enrichment.
  // Distinct from "no Twilio at all". A real allocated number usually has
  // at least a line type; an empty enrichment response is mildly suspicious.
  // -10 here keeps a lead with only this signal in 'review' (not rejected)
  // unless other fraud signals compound.
  if (lead.validation && lead.validation.phone
      && lead.validation.phone.validityReason === 'twilio_no_enrichment') {
    s -= 10;
    reasons.push('low telecom confidence');
  }

  // Mapbox-detected suspicious route signals (Phase 2).
  // Missing route validation is neutral (no penalty). Each suspicious tag
  // adds a small deduction so multiple flags compound.
  if (lead.validation && lead.validation.route && Array.isArray(lead.validation.route.suspicious)) {
    const tagPenalty = {
      origin_zip_not_found:      20,
      destination_zip_not_found: 20,
      same_origin_destination:   25,
      origin_not_us:             30,
      destination_not_us:        30,
      miles_divergence_high:     10,
    };
    for (const tag of lead.validation.route.suspicious) {
      const p = tagPenalty[tag];
      if (p) { s -= p; reasons.push(`route flag: ${tag} (-${p})`); }
    }
  }

  // Fingerprint signals (Phase 2 stub — neutral when missing, only acts on
  // explicit positive signals like bot=true / vpn=true / very low confidence).
  if (lead.validation && lead.validation.fingerprint) {
    const fp = lead.validation.fingerprint;
    if (fp.bot === true) { s -= 50; reasons.push('fingerprint flagged bot'); }
    if (fp.vpn === true) { s -= 10; reasons.push('fingerprint: vpn'); }
    if (typeof fp.confidence === 'number' && fp.confidence < 0.3) {
      s -= 15; reasons.push(`fingerprint low confidence (${fp.confidence})`);
    }
    // No penalty for missing fingerprint — ad-blockers strip ~30% of users.
  }

  return { value: clamp(s, 0, 100), reasons };
}

// Mover match: how many movers in the system can plausibly take this lead?
// Phase 1 has no coverage lookup — return a neutral 60 plus small bonuses
// based on ZIP-format sanity. Phase 6 will plug in real coverage.
//
// Wording note: "valid origin zip" used to sound like Mapbox verification.
// Renamed to "origin zip format ok" so it's clear this is just regex on the
// 5-digit shape — independent of Mapbox geocoding success (which lives in
// validation.route.suspicious). Prevents the contradictory "valid origin
// zip" + "origin_zip_not_found" pairing the user reported.
function moverMatchScore(lead) {
  const reasons = [];
  let s = 60;

  const routeSuspicious = lead.validation?.route?.suspicious || [];
  const originUnresolved = routeSuspicious.includes('origin_zip_not_found');
  const destUnresolved = routeSuspicious.includes('destination_zip_not_found');
  const distanceUnknown = !Number(lead.miles) || Number(lead.miles) <= 0;

  if (lead.originZip && /^\d{5}$/.test(lead.originZip)) {
    s += 5;
    if (originUnresolved) {
      reasons.push('origin zip format ok, Mapbox unresolved');
    } else if (lead.validation?.route?.origin) {
      reasons.push('origin zip resolved');
    } else {
      reasons.push('origin zip format ok');
    }
  }
  if (lead.destinationZip && /^\d{5}$/.test(lead.destinationZip)) {
    s += 5;
    if (destUnresolved) {
      reasons.push('destination zip format ok, Mapbox unresolved');
    } else if (lead.validation?.route?.destination) {
      reasons.push('destination zip resolved');
    } else {
      reasons.push('destination zip format ok');
    }
  }

  // "local move" only when distance is genuinely known AND route is resolved.
  // The lead.distance string is computed at ingest from possibly-incorrect
  // miles — if miles is 0 or Mapbox couldn't resolve, we can't claim local.
  const routeUnresolved = originUnresolved || destUnresolved;
  if (lead.distance === 'Local' && !routeUnresolved && !distanceUnknown) {
    s += 5; reasons.push('local move');
  } else if (routeUnresolved || distanceUnknown) {
    reasons.push('route unresolved');
  }

  return { value: clamp(s, 0, 100), reasons };
}

/* ── Composite ─────────────────────────────────────────────────────────────── */

function compositeFrom(scores) {
  let total = 0;
  let weightSum = 0;
  for (const key of Object.keys(WEIGHTS)) {
    total += (scores[key] || 0) * WEIGHTS[key];
    weightSum += WEIGHTS[key];
  }
  return Math.round(total / weightSum);
}

/* ── Public API ────────────────────────────────────────────────────────────── */

function score(lead) {
  const trust   = trustScore(lead);
  const urgency = urgencyScore(lead);
  const value   = leadValueScore(lead);
  const route   = routeValueScore(lead);
  const intent  = intentScore(lead);
  const fraud   = fraudRiskScore(lead);
  const match   = moverMatchScore(lead);

  const scores = {
    trustScore:      trust.value,
    urgencyScore:    urgency.value,
    leadValueScore:  value.value,
    routeValueScore: route.value,
    intentScore:     intent.value,
    fraudRiskScore:  fraud.value,
    moverMatchScore: match.value,
  };
  scores.compositeScore = compositeFrom(scores);

  const breakdown = {
    trust:   trust.reasons,
    urgency: urgency.reasons,
    value:   value.reasons,
    route:   route.reasons,
    intent:  intent.reasons,
    fraud:   fraud.reasons,
    match:   match.reasons,
    weights: WEIGHTS,
  };

  return { scores, breakdown, engineVersion: ENGINE_VERSION };
}

module.exports = {
  score,
  ENGINE_VERSION,
  WEIGHTS,
};
