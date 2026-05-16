/**
 * Single source of truth for the ENABLE_INSTANT_DISPATCH env flag.
 *
 * Phase B (forward-only): when true, NEW leads are stamped
 * distributionModel='instant' at ingest and skip auctionEndsAt assignment.
 * Bid route blocks them with 409. Settle cron ignores them.
 *
 * The flag is read at each call site (no module-load caching) so operators
 * can flip it mid-stream without redeploying. Per-lead distributionModel is
 * sticky once written — flipping the flag does not retroactively change
 * existing leads' behavior.
 *
 * Accepts the same truthy spellings as the pricing-engine cutover flag:
 *   'true' / 'TRUE' / 'True' / '1' → true
 *   anything else (incl. unset)   → false
 */
function instantDispatchEnabled() {
  const raw = String(process.env.ENABLE_INSTANT_DISPATCH || '');
  return raw.toLowerCase() === 'true' || raw === '1';
}

module.exports = { instantDispatchEnabled };
