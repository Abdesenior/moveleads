// Phase 3 feature flag — controls whether the dashboard + broadcast pipelines
// use the new strict origin-AND-destination matcher or the legacy OR matcher.
//
// Default: OFF. Operator flips to true in prod only after the shadow logs
// confirm the strict candidate-count delta looks sensible (audit Phase 3
// guardrail: ≤60% drop is healthy; ≥90% drop is a config bug worth
// investigating before the cutover).
//
// Read lazily so test harnesses can mutate process.env between runs.

'use strict';

function strictMatchingEnabled() {
  const raw = String(process.env.STRICT_INTERSTATE_MATCHING || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

module.exports = { strictMatchingEnabled };
