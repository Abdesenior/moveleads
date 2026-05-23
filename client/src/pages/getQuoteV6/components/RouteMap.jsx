// client/src/pages/getQuoteV6/components/RouteMap.jsx
// Drop-in replacement for RouteArc. Renders a real Mapbox light-v11
// basemap with a great-circle line between the two ZIPs. Mapbox-gl is
// ~600KB so we MUST dynamic-import it inside useEffect to keep the
// V6 chunk small. A top-level `import mapboxgl from 'mapbox-gl'` would
// pull it into the page bundle and defeat the purpose.
import { useEffect, useRef, useState } from 'react';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function RouteMap({ route, desktop, height }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [failed, setFailed] = useState(false);

  // An explicit `height` prop wins; otherwise fall back to the legacy
  // desktop default (280) or the mobile aspect-ratio path. Used by the
  // inline route preview to render a taller (320px) cinematic map.
  const containerHeight = height ?? (desktop ? 280 : undefined);

  // Hooks come first (rules-of-hooks); endpoint validity guards the effect
  // body and the final render so a missing coord short-circuits to null.
  const hasCoords = route?.from?.lat != null && route?.from?.lng != null
    && route?.to?.lat != null && route?.to?.lng != null;
  const fromLat = hasCoords ? route.from.lat : null;
  const fromLng = hasCoords ? route.from.lng : null;
  const toLat = hasCoords ? route.to.lat : null;
  const toLng = hasCoords ? route.to.lng : null;
  const fromCity = hasCoords ? route.from.city : '';
  const toCity = hasCoords ? route.to.city : '';

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

          // Soften the underlying map so the orange route remains the hero
          // element. Apply paint-property overrides to layers that exist in
          // light-v11. Wrapped in try/catch because layer IDs / supported
          // paint properties can drift across mapbox-gl versions — we'd
          // rather render a slightly louder basemap than blow up the map.
          // The outer try absorbs failures from any individual setPaintProperty
          // call as well; forEach continues for subsequent layers.
          const setPaint = (id, prop, value) => {
            try {
              mapInstance.setPaintProperty(id, prop, value);
            } catch {
              // Property not supported on this layer in this mapbox-gl version.
            }
          };
          try {
            const style = mapInstance.getStyle();
            if (style && Array.isArray(style.layers)) {
              style.layers.forEach(layer => {
                if (!layer || !layer.id) return;
                const id = layer.id;
                // Dim road network (skip our own route layers)
                if (layer.type === 'line' && /road|bridge|tunnel/i.test(id) && !/route/i.test(id)) {
                  setPaint(id, 'line-opacity', 0.35);
                }
                // Dim symbol labels (place names, POIs) so route labels read clean
                if (layer.type === 'symbol' && /label|poi|place/i.test(id)) {
                  setPaint(id, 'text-opacity', 0.45);
                  setPaint(id, 'icon-opacity', 0.35);
                }
                // Slight saturation reduction on water (more neutral)
                if (layer.type === 'fill' && /water/i.test(id)) {
                  setPaint(id, 'fill-opacity', 0.6);
                }
              });
            }
          } catch {
            // Style introspection can fail across mapbox-gl versions — skip
          }

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

          // In-map city labels are intentionally dormant: the inline route
          // preview now overlays origin/destination cards on the map wrapper
          // (see RouteScreen.jsx), so rendering Mapbox markers for the same
          // city names would duplicate. Kept here (commented) so the labeled
          // variant can be revived without rewriting the styles.
          // const fromLabelEl = document.createElement('div');
          // fromLabelEl.style.cssText = 'background:rgba(255,255,255,0.96);color:#0f172a;font-size:11px;font-weight:600;letter-spacing:-0.005em;padding:3px 8px;border-radius:6px;box-shadow:0 2px 6px rgba(15,23,42,0.12);border:1px solid rgba(15,23,42,0.06);white-space:nowrap;pointer-events:none;transform:translateY(-22px);';
          // fromLabelEl.textContent = fromCity;
          // new mapboxgl.Marker({ element: fromLabelEl, anchor: 'bottom' })
          //   .setLngLat([fromLng, fromLat])
          //   .addTo(mapInstance);

          // const toLabelEl = document.createElement('div');
          // toLabelEl.style.cssText = 'background:#0f172a;color:#fff;font-size:11px;font-weight:600;letter-spacing:-0.005em;padding:3px 8px;border-radius:6px;box-shadow:0 2px 8px rgba(15,23,42,0.25);white-space:nowrap;pointer-events:none;transform:translateY(-22px);';
          // toLabelEl.textContent = toCity;
          // new mapboxgl.Marker({ element: toLabelEl, anchor: 'bottom' })
          //   .setLngLat([toLng, toLat])
          //   .addTo(mapInstance);

          const bounds = new mapboxgl.LngLatBounds()
            .extend([fromLng, fromLat])
            .extend([toLng, toLat]);
          // Vertical padding compressed (60/50 → 36/36) to suit the compact
          // 170px route preview — the original values left only ~60px for the
          // arc at that height, causing visible clipping on long routes.
          mapInstance.fitBounds(bounds, {
            padding: { top: 36, bottom: 36, left: 80, right: 80 },
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
  }, [hasCoords, fromLat, fromLng, toLat, toLng, fromCity, toCity]);

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
        height: containerHeight,
        aspectRatio: containerHeight ? undefined : '600/220',
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
        height: containerHeight,
        aspectRatio: containerHeight ? undefined : '600/220',
        background: '#f8fafc',
      }}
    />
  );
}
