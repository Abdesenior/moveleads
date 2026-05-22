// client/src/pages/getQuoteV6/components/RouteMap.jsx
// Drop-in replacement for RouteArc. Renders a real Mapbox light-v11
// basemap with a great-circle line between the two ZIPs. Mapbox-gl is
// ~600KB so we MUST dynamic-import it inside useEffect to keep the
// V6 chunk small. A top-level `import mapboxgl from 'mapbox-gl'` would
// pull it into the page bundle and defeat the purpose.
import { useEffect, useRef, useState } from 'react';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function RouteMap({ route, desktop }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [failed, setFailed] = useState(false);

  // Hooks come first (rules-of-hooks); endpoint validity guards the effect
  // body and the final render so a missing coord short-circuits to null.
  const hasCoords = route?.from?.lat != null && route?.from?.lng != null
    && route?.to?.lat != null && route?.to?.lng != null;
  const fromLat = hasCoords ? route.from.lat : null;
  const fromLng = hasCoords ? route.from.lng : null;
  const toLat = hasCoords ? route.to.lat : null;
  const toLng = hasCoords ? route.to.lng : null;

  useEffect(() => {
    if (!hasCoords) return undefined;
    let cancelled = false;
    let mapInstance;

    (async () => {
      try {
        // Both the JS and CSS are dynamic-imported so they end up in
        // their own chunk(s) — never inline in the V6 page bundle.
        await import('mapbox-gl/dist/mapbox-gl.css');
        const mapboxgl = (await import('mapbox-gl')).default;
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = TOKEN;

        mapInstance = new mapboxgl.Map({
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/light-v11',
          interactive: false,
          attributionControl: { compact: true },
          fadeDuration: 0,
        });

        mapRef.current = mapInstance;

        // Great-circle line via @turf — already a project dep.
        let arc;
        try {
          const greatCircle = (await import('@turf/great-circle')).default;
          const helpers = await import('@turf/helpers');
          arc = greatCircle(
            helpers.point([fromLng, fromLat]),
            helpers.point([toLng, toLat]),
            { properties: {}, npoints: 64 }
          );
        } catch {
          // Graceful fallback: straight-line LineString.
          arc = {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [fromLng, fromLat],
                [toLng, toLat],
              ],
            },
          };
        }

        mapInstance.on('load', () => {
          if (cancelled || !mapInstance) return;

          mapInstance.addSource('route', { type: 'geojson', data: arc });

          // Glow underlay — wide, low opacity, drawn first
          mapInstance.addLayer({
            id: 'route-glow',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#f97316',
              'line-width': 14,
              'line-opacity': 0.18,
              'line-blur': 6,
            },
          });

          // Main route line — thicker than before
          mapInstance.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#f97316',
              'line-width': 4,
              'line-opacity': 0.95,
            },
          });

          // Inject the pulse keyframes once (idempotent).
          if (!document.getElementById('glq-v6-map-pulse')) {
            const style = document.createElement('style');
            style.id = 'glq-v6-map-pulse';
            style.textContent = `
              @keyframes glq-v6-marker-pulse {
                0%   { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.55); }
                70%  { box-shadow: 0 0 0 14px rgba(249, 115, 22, 0); }
                100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
              }
            `;
            document.head.appendChild(style);
          }

          // Origin marker — white-filled with orange ring (static).
          const fromEl = document.createElement('div');
          fromEl.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid #f97316;box-shadow:0 2px 8px rgba(249,115,22,0.4);';
          new mapboxgl.Marker(fromEl)
            .setLngLat([fromLng, fromLat])
            .addTo(mapInstance);

          // Destination marker — filled orange with pulse.
          const toEl = document.createElement('div');
          toEl.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#f97316;border:3px solid #fff;box-shadow:0 2px 8px rgba(249,115,22,0.4);animation:glq-v6-marker-pulse 2.4s ease-out infinite;';
          new mapboxgl.Marker(toEl)
            .setLngLat([toLng, toLat])
            .addTo(mapInstance);

          // Origin label
          const fromLabelEl = document.createElement('div');
          fromLabelEl.style.cssText = 'background:rgba(255,255,255,0.96);color:#0f172a;font-size:11px;font-weight:600;letter-spacing:-0.005em;padding:3px 8px;border-radius:6px;box-shadow:0 2px 6px rgba(15,23,42,0.12);border:1px solid rgba(15,23,42,0.06);white-space:nowrap;pointer-events:none;transform:translateY(-22px);';
          fromLabelEl.textContent = route.from.city;
          new mapboxgl.Marker({ element: fromLabelEl, anchor: 'bottom' })
            .setLngLat([route.from.lng, route.from.lat])
            .addTo(mapInstance);

          // Destination label
          const toLabelEl = document.createElement('div');
          toLabelEl.style.cssText = 'background:#0f172a;color:#fff;font-size:11px;font-weight:600;letter-spacing:-0.005em;padding:3px 8px;border-radius:6px;box-shadow:0 2px 8px rgba(15,23,42,0.25);white-space:nowrap;pointer-events:none;transform:translateY(-22px);';
          toLabelEl.textContent = route.to.city;
          new mapboxgl.Marker({ element: toLabelEl, anchor: 'bottom' })
            .setLngLat([route.to.lng, route.to.lat])
            .addTo(mapInstance);

          const bounds = new mapboxgl.LngLatBounds()
            .extend([fromLng, fromLat])
            .extend([toLng, toLat]);
          mapInstance.fitBounds(bounds, {
            padding: { top: 60, bottom: 50, left: 80, right: 80 },
            duration: 0,
            maxZoom: 7,
          });
        });

        mapInstance.on('error', () => {
          if (!cancelled) setFailed(true);
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (mapInstance) mapInstance.remove();
    };
  }, [hasCoords, fromLat, fromLng, toLat, toLng]);

  // Bail to null if endpoints lack coords — parity with RouteArc.
  if (!hasCoords) return null;

  if (failed) {
    return (
      <div style={{
        position: 'relative',
        borderRadius: 'var(--r-card)',
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #f8fafc 0%, #eef2f7 100%)',
        border: '1px solid var(--line)',
        boxShadow: 'var(--shadow-sm)',
        aspectRatio: desktop ? '600/280' : '600/220',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--ink-3)', fontSize: 12.5,
      }}>
        Route preview unavailable
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        borderRadius: 'var(--r-card)',
        overflow: 'hidden',
        border: '1px solid var(--line)',
        boxShadow: '0 6px 24px -8px rgba(15,23,42,0.16), 0 1px 2px rgba(15,23,42,0.04)',
        aspectRatio: desktop ? '600/280' : '600/220',
        background: '#f8fafc',
      }}
    />
  );
}
