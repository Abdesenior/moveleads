// Shadow-comparison log helper for Phase 3 strict matcher rollout.
//
// Emits structured, grep-able log lines on EVERY match decision so the
// operator can diff legacy vs strict candidate counts on real production
// traffic BEFORE flipping STRICT_INTERSTATE_MATCHING=true.
//
// Two log shapes, depending on caller:
//
//   1. Per-candidate (broadcastLeadSMS / broadcastLeadEmail):
//      [MatchShadow] source=sms lead=<id> mover=<id> origin=<state/zip> dest=<state/zip> legacy=<bool> strict=<bool>
//
//      Use case: "for every mover we considered, did legacy match? did
//      strict match? where do they diverge?" → grep `legacy=true strict=false`
//      to count over-matches the strict cutover would eliminate.
//
//   2. Per-request summary (GET /api/leads):
//      [MatchShadow] source=dashboard user=<id> leads=<n> legacy_badge=<n> strict_badge=<n>
//
//      Use case: dashboard renders badges for every lead in the response,
//      so per-pair logging would flood logs on every page load. The summary
//      captures the same delta signal in one line per request.
//
// In both shapes the log line is emitted REGARDLESS of which mode is
// currently active, so the diff signal exists in both pre- and post-flip
// log streams.

'use strict';

/**
 * Stringify origin/destination for the shadow log. Prefer the 2-letter state
 * code if present (most useful for grep); fall back to ZIP. Returns 'unknown'
 * for missing input so the log line is always well-formed.
 */
function fmtOriginDest(lead, field) {
  if (!lead) return 'unknown';
  if (field === 'origin') {
    const st = (lead.originState || '').toUpperCase();
    if (st) return `${st}${lead.originZip ? '/' + lead.originZip : ''}`;
    if (lead.originZip) return String(lead.originZip);
    return 'unknown';
  }
  if (field === 'destination') {
    const st = (lead.destinationState || '').toUpperCase();
    if (st) return `${st}${lead.destinationZip ? '/' + lead.destinationZip : ''}`;
    if (lead.destinationZip) return String(lead.destinationZip);
    return 'unknown';
  }
  return 'unknown';
}

/**
 * Per-candidate match shadow log. Call once per (lead, mover) pair the
 * broadcaster considers.
 *
 * @param {object} args
 * @param {'sms'|'email'} args.source
 * @param {object} args.lead
 * @param {object} args.mover
 * @param {boolean} args.legacy
 * @param {boolean} args.strict
 */
function logMatchShadow({ source, lead, mover, legacy, strict }) {
  if (!lead || !mover) return;
  console.log(
    `[MatchShadow] source=${source} ` +
    `lead=${lead._id} mover=${mover._id} ` +
    `origin=${fmtOriginDest(lead, 'origin')} ` +
    `dest=${fmtOriginDest(lead, 'destination')} ` +
    `legacy=${legacy ? 'true' : 'false'} strict=${strict ? 'true' : 'false'}`
  );
}

/**
 * Per-request dashboard shadow summary. Call once per GET /api/leads
 * response after computing both badge sets.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {number} args.leadsCount
 * @param {number} args.legacyMatched   How many leads the legacy matcher flagged
 * @param {number} args.strictMatched   How many leads the strict matcher flagged
 */
function logDashboardShadow({ userId, leadsCount, legacyMatched, strictMatched }) {
  console.log(
    `[MatchShadow] source=dashboard user=${userId} ` +
    `leads=${leadsCount} legacy_badge=${legacyMatched} strict_badge=${strictMatched}`
  );
}

module.exports = {
  logMatchShadow,
  logDashboardShadow,
  fmtOriginDest,
};
