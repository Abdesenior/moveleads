import { useEffect } from 'react';
import { loadMoverPixel, trackMoverPageView } from '../utils/metaPixelMovers';

/**
 * Mount on mover-funnel surfaces ONLY. Loads the mover pixel (idempotent) and
 * fires one mover PageView on mount. Keeps the mover pixel scoped to the funnel
 * — it is never initialized anywhere else in the app.
 */
export function useMoverFunnelPixel() {
  useEffect(() => {
    loadMoverPixel();
    trackMoverPageView();
  }, []);
}
