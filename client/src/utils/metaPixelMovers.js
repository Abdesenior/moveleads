// Mover-funnel Meta Pixel. Separate pixel id; every event uses trackSingle so
// it never receives homeowner events and vice versa. Loaded lazily on funnel
// surfaces via useMoverFunnelPixel — never global.
import { ensureFbevents, trackSingle, generateEventId } from './metaPixelCore';

const MOVER_PIXEL_ID = import.meta.env.VITE_META_MOVER_PIXEL_ID || '';

let loaded = false;

/** Boot the mover pixel. Idempotent. No-op when the id is unset (dev). */
export function loadMoverPixel() {
  if (loaded) return;
  if (typeof window === 'undefined') return;
  if (!MOVER_PIXEL_ID) return;
  loaded = true;
  ensureFbevents();
  try { window.fbq('init', MOVER_PIXEL_ID); } catch (_e) { /* ad-blocker */ }
}

export function trackMoverPageView() {
  trackSingle(MOVER_PIXEL_ID, 'PageView');
}

/**
 * Mid-funnel intent signal: mover reached the activation-offer screen.
 * Browser-only — self-generates an event_id (no CAPI counterpart to dedup with).
 */
export function trackMoverLead(params = {}) {
  trackSingle(
    MOVER_PIXEL_ID,
    'Lead',
    { content_name: 'mover_activation_offer', ...params },
    generateEventId(),
  );
}

/** eventId MUST equal the server CompleteRegistration event_id (verify-email response). */
export function trackMoverCompleteRegistration(eventId) {
  trackSingle(MOVER_PIXEL_ID, 'CompleteRegistration', {}, eventId);
}

/** eventId MUST equal the Stripe PaymentIntent id used server-side. value = cash paid. */
export function trackMoverPurchase(eventId, { value } = {}) {
  trackSingle(MOVER_PIXEL_ID, 'Purchase', { currency: 'USD', value: Number(value) || 0 }, eventId);
}
