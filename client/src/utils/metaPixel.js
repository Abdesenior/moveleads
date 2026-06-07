// Homeowner Meta Pixel. Uses the shared core; fires every event via
// trackSingle so the mover pixel (when present) never receives homeowner
// events. Behavior is identical to before: init homeowner pixel, PageView at
// boot, Lead on quote submit — all scoped to VITE_META_PIXEL_ID.
import {
  ensureFbevents,
  trackSingle,
  generateEventId,
  readFbp,
  readFbc,
  eventSourceUrl,
} from './metaPixelCore';

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '';

let loaded = false;

/** Boot the homeowner pixel + fire PageView. Idempotent. Call once from main.jsx. */
export function loadPixel() {
  if (loaded) return;
  if (typeof window === 'undefined') return;
  if (!PIXEL_ID) return;
  loaded = true;
  ensureFbevents();
  try { window.fbq('init', PIXEL_ID); } catch (_e) { /* ad-blocker */ }
  trackSingle(PIXEL_ID, 'PageView');
}

/**
 * Fire the homeowner `Lead` event. Pass the SAME eventId sent to the server so
 * Meta dedups browser vs CAPI on (event_name, event_id).
 */
export function trackLead(eventId, params = {}) {
  trackSingle(
    PIXEL_ID,
    'Lead',
    { content_name: 'moveleads_quote', currency: 'USD', value: 0, ...params },
    eventId,
  );
}

// Re-export readers so existing GetQuoteV6 imports stay unchanged.
export { generateEventId, readFbp, readFbc, eventSourceUrl };
