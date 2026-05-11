/**
 * moverResearchTagger — deterministic tag generator for
 * MoverResearchSubmission records. No ML, no AI. Pure rules so the
 * tagger is testable, predictable, and re-runnable against the
 * collection at any time.
 *
 * Usage:
 *   const { generateTags } = require('./moverResearchTagger');
 *   const tags = generateTags(submission);   // -> string[]
 */

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function generateTags(submission = {}) {
  const tags = new Set();

  const desiredMoveTypes      = asArray(submission.desiredMoveTypes);
  const preferredJobSizes     = asArray(submission.preferredJobSizes);
  const valueSignals          = asArray(submission.valueSignals);
  const overpricedSignals     = asArray(submission.overpricedSignals);
  const retentionDrivers      = asArray(submission.retentionDrivers);
  const leadProviderFrustrations = asArray(submission.leadProviderFrustrations);

  // Shared vs exclusive preference
  if (submission.sharedExclusivePreference === 'exclusive') tags.add('prefers_exclusive');
  if (submission.sharedExclusivePreference === 'shared')    tags.add('accepts_shared');
  if (submission.sharedMaxMovers === '2 movers max')        tags.add('max_shared_2');

  // Marketplace
  if (submission.marketplacePreference === 'bidding') tags.add('bidding_interested');

  // Move-type focus
  if (desiredMoveTypes.includes('Long-distance moves'))     tags.add('long_distance_focus');
  if (desiredMoveTypes.includes('Office / commercial moves')) tags.add('commercial_focus');
  if (desiredMoveTypes.includes('Same-day / urgent moves')) tags.add('urgent_focus');

  if (
    desiredMoveTypes.includes('Large house moves') ||
    preferredJobSizes.includes('Large house moves') ||
    preferredJobSizes.includes('4+ bedroom')
  ) tags.add('large_home_focus');

  // Speed
  if (submission.speedExpectation === '5min') tags.add('speed_sensitive');

  // Quality
  if (valueSignals.length >= 4 && valueSignals.includes('Customer answers the phone')) {
    tags.add('quality_sensitive');
  }

  // Refunds
  if (retentionDrivers.includes('Easy refunds for bad requests')) tags.add('refund_sensitive');

  // Broker pain
  if (leadProviderFrustrations.length >= 4) tags.add('broker_frustrated');

  // Price
  if (retentionDrivers.includes('Fair pricing') || overpricedSignals.length >= 4) {
    tags.add('price_sensitive');
  }

  // Composite — high-value buyer
  if (
    tags.has('prefers_exclusive') &&
    tags.has('quality_sensitive') &&
    (tags.has('large_home_focus') || tags.has('commercial_focus'))
  ) {
    tags.add('high_value_buyer');
  }

  return Array.from(tags);
}

module.exports = { generateTags };
