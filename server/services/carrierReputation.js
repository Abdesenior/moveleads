/**
 * Carrier reputation classifier — Phase 2 of marketplace quality work.
 *
 * Pure function. Takes a Twilio-reported `carrierName` (and optional lineType)
 * and returns a suspicion classification used by the tier router as a
 * "force-review" signal.
 *
 * Conservative by design:
 *   - high suspicion ≠ auto-reject. We FORCE REVIEW only.
 *   - unknown carriers map to 'unknown' (no penalty), not 'high'.
 *   - real mobile carriers (Verizon, T-Mobile, AT&T, Bell, Rogers, etc.)
 *     map to 'low'.
 *
 * The matching is keyword-based against the carrier_name string Twilio
 * returns from line_type_intelligence. It is intentionally fuzzy because
 * Twilio's carrier strings vary in punctuation/casing across CIC/OCN feeds
 * (e.g. "Twilio - SMS/MMS - SVR", "Twilio Inc.", "Bandwidth.com CLEC LLC").
 *
 * High-suspicion bucket — virtual / app-based / VoIP-resale providers
 * commonly used to evade verification or for throwaway numbers:
 *   TextNow, TextFree (Pinger), Pinger, Hushed, Burner, Vyke, Telos,
 *   2ndLine, Sideline, CoverMe, Talkatone, Numero, Nextplus, Truphone,
 *   Bandwidth (CPaaS — frequently reseller-fronted), Twilio (CPaaS),
 *   Onvoy, Inteliquent, Peerless, Voxbone, Bicom, Voipms, Plivo, Vonage,
 *   Telnyx (CPaaS), Skype/Microsoft, Google Voice.
 *
 * Medium suspicion — generic VoIP carriers that are sometimes legitimate
 * landline replacement (RingCentral, MagicJack, Ooma, 8x8) but frequently
 * used by lead-spammers. Stays neutral; we only flag if combined with
 * lineType: voip.
 *
 * Low suspicion — known mobile/landline carriers.
 */

const HIGH_SUSPICION_KEYWORDS = [
  // Pure throwaway / virtual numbers
  'textnow', 'textfree', 'pinger', 'hushed', 'burner', 'vyke', 'telos',
  '2ndline', 'second line', 'sideline', 'coverme', 'talkatone', 'numero',
  'nextplus', 'truphone',
  // CPaaS / virtual aggregators (numbers can be provisioned in seconds)
  'bandwidth.com', 'bandwidth ', 'twilio', 'onvoy', 'inteliquent',
  'peerless', 'voxbone', 'bicom', 'voip.ms', 'voipms', 'plivo', 'telnyx',
  // App-based / consumer VoIP commonly used to bypass identity
  'skype', 'google voice', 'google-voice', 'googlevoice',
];

const MEDIUM_SUSPICION_KEYWORDS = [
  // Generic VoIP — sometimes legit, sometimes not. Only flagged if
  // lineType is voip or fixedVoip. (Many small CLECs are legit landline
  // replacement and shouldn't be penalized.)
  'ringcentral', 'magicjack', 'ooma', '8x8', 'vonage', 'jive', 'nextiva',
  'grasshopper', 'dialpad',
];

const LOW_SUSPICION_KEYWORDS = [
  // Known mobile carriers (US/CA — extend as needed)
  'verizon', 'at&t', 't-mobile', 'tmobile', 'sprint', 'us cellular',
  'metropcs', 'cricket', 'boost', 'visible', 'mint mobile', 'tracfone',
  'straight talk', 'consumer cellular',
  // Canadian carriers
  'rogers', 'bell', 'telus', 'fido', 'koodo', 'virgin plus', 'freedom mobile',
  // Common landline / cable
  'comcast', 'cox', 'spectrum', 'frontier', 'centurylink', 'lumen',
  'windstream', 'consolidated', 'cincinnati bell',
];

function normalize(carrierName) {
  if (!carrierName) return '';
  return String(carrierName).toLowerCase().trim();
}

function matchesAny(haystack, keywords) {
  for (const kw of keywords) {
    if (haystack.includes(kw)) return kw;
  }
  return null;
}

/**
 * Classify a carrier name into a suspicion bucket.
 *
 * @param {string|null|undefined} carrierName  Twilio carrier_name (line_type_intelligence)
 * @param {string|null|undefined} lineType     'mobile' | 'landline' | 'voip' | 'fixedVoip' | 'nonFixedVoip' | null
 * @returns {{ suspicion: 'high'|'medium'|'low'|'unknown', matched: string|null, reason: string|null }}
 */
function evaluateCarrier(carrierName, lineType = null) {
  const name = normalize(carrierName);
  const lt = lineType ? String(lineType).toLowerCase() : null;
  const isVoipLine = lt ? /voip/.test(lt) : false;

  if (!name) {
    return { suspicion: 'unknown', matched: null, reason: 'no carrier name from telecom lookup' };
  }

  const highHit = matchesAny(name, HIGH_SUSPICION_KEYWORDS);
  if (highHit) {
    return {
      suspicion: 'high',
      matched: highHit,
      reason: `carrier "${carrierName}" matches throwaway/virtual provider keyword "${highHit}"`,
    };
  }

  const mediumHit = matchesAny(name, MEDIUM_SUSPICION_KEYWORDS);
  if (mediumHit) {
    if (isVoipLine) {
      return {
        suspicion: 'medium',
        matched: mediumHit,
        reason: `carrier "${carrierName}" is a VoIP provider ("${mediumHit}") on a VoIP line`,
      };
    }
    return {
      suspicion: 'low',
      matched: mediumHit,
      reason: `carrier "${carrierName}" is a known business VoIP provider (not on a VoIP line)`,
    };
  }

  const lowHit = matchesAny(name, LOW_SUSPICION_KEYWORDS);
  if (lowHit) {
    return {
      suspicion: 'low',
      matched: lowHit,
      reason: `carrier "${carrierName}" matches known mobile/landline keyword "${lowHit}"`,
    };
  }

  return {
    suspicion: 'unknown',
    matched: null,
    reason: `carrier "${carrierName}" not in known-good or known-bad lists`,
  };
}

function isEnabled() {
  return String(process.env.ENABLE_CARRIER_REPUTATION).toLowerCase() === 'true';
}

module.exports = {
  evaluateCarrier,
  isEnabled,
  HIGH_SUSPICION_KEYWORDS,
  MEDIUM_SUSPICION_KEYWORDS,
  LOW_SUSPICION_KEYWORDS,
};
