/**
 * InteractiveUSMap — real US state-outline selector for Step 3 (Delivery
 * Coverage). Uses us-atlas TopoJSON projected via d3-geo Albers USA.
 *
 * v2-direct-replacement (2026-06-03):
 *   - Local imports replace runtime CDN loads (d3-geo, topojson-client,
 *     us-atlas — all in node_modules; states-10m.json bundled to
 *     client/public/onboarding/states-10m.json).
 *   - Async TopoJSON fetch wrapped in a one-time module-level cache so
 *     mounting the map twice doesn't re-parse.
 *
 * Render modes (driven by `mode` prop):
 *   - 'local' : only the home state highlighted; non-interactive.
 *   - 'some'  : selected states fill orange; clicking toggles selection.
 *   - 'all'   : every state filled orange; non-interactive.
 *
 * Props:
 *   selectedStates: string[]     — array of USPS 2-letter codes
 *   baseState:      string       — home state (rendered navy, never toggleable)
 *   mode:           'local' | 'some' | 'all'
 *   onToggleState:  (code) => void
 *   disabled:       boolean
 */

import { useEffect, useState, useRef } from 'react';
import { MapPin } from 'lucide-react';
import * as topojson from 'topojson-client';
import { geoAlbersUsa, geoPath } from 'd3-geo';

// FIPS state code → USPS 2-letter postal code. The us-atlas topology
// keys states by FIPS id (e.g. "48" = Texas). Production matching uses
// USPS codes, so we translate at ingest.
const FIPS_TO_POSTAL = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE',
  '11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA',
  '20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN',
  '28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM',
  '36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
  '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA',
  '54':'WV','55':'WI','56':'WY',
};

// eslint-disable-next-line react-refresh/only-export-components -- shared name map referenced by Step components + personalize helpers
export const US_STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',
  IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
  NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',
  NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',
  RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',
  VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};

// Hide labels for small/dense states — they stay clickable but uncluttered.
// Chip rows (StepDelivery's QUICK_STATES) provide a tap surface for these.
const NO_LABEL = new Set(['RI','DE','CT','NJ','MD','MA','NH','VT','DC']);

// Module-level cache so re-mounting the map (e.g. when the mover toggles
// between 'local' and 'some') doesn't re-parse the TopoJSON.
let _statesPromise = null;

async function loadStates() {
  if (_statesPromise) return _statesPromise;
  _statesPromise = (async () => {
    const res = await fetch('/onboarding/states-10m.json');
    if (!res.ok) throw new Error(`states-10m.json fetch failed: ${res.status}`);
    const topo = await res.json();
    const feats = topojson.feature(topo, topo.objects.states).features;
    const projection = geoAlbersUsa().scale(1300).translate([487.5, 305]);
    const path = geoPath(projection);
    return feats
      .map((f) => {
        const code = FIPS_TO_POSTAL[f.id];
        if (!code) return null;
        const d = path(f);
        if (!d) return null;
        const c = path.centroid(f);
        return { code, name: f.properties.name, d, cx: c[0], cy: c[1] };
      })
      .filter(Boolean);
  })().catch((e) => {
    // Allow retry on next mount if the fetch failed (network blip).
    _statesPromise = null;
    throw e;
  });
  return _statesPromise;
}

export default function InteractiveUSMap({
  selectedStates = [],
  baseState,
  mode = 'some',
  onToggleState,
  disabled,
}) {
  const [feats, setFeats] = useState(null);
  const [err, setErr] = useState(false);
  const [hover, setHover] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    loadStates()
      .then((f) => { if (mounted.current) setFeats(f); })
      .catch(() => { if (mounted.current) setErr(true); });
    return () => { mounted.current = false; };
  }, []);

  const sel = new Set(selectedStates);
  const interactive = mode === 'some' && !disabled;
  const all = mode === 'all';

  const colorFor = (code) => {
    if (code === baseState) return { fill: 'var(--ow-navy)', stroke: '#fff', label: '#fff' };
    if (all) return { fill: 'var(--ow-orange)', stroke: '#fff', label: '#fff' };
    if (mode === 'some' && sel.has(code)) return { fill: 'var(--ow-orange)', stroke: '#fff', label: '#fff' };
    if (interactive && hover === code) return { fill: '#ffd9bf', stroke: '#fff', label: 'var(--ow-orange-800)' };
    return { fill: '#e2e8f0', stroke: '#fff', label: '#64748b' };
  };

  const click = (code) => {
    if (!interactive || code === baseState) return;
    onToggleState && onToggleState(code);
  };

  return (
    <div className="ow-usmap">
      {interactive && (
        <div className="ow-map-hint">
          <MapPin size={14} /> Click the states where you deliver moves.
        </div>
      )}

      {err ? (
        <div className="ow-usmap-fallback">
          Map unavailable — use the chips below to pick your states.
        </div>
      ) : !feats ? (
        <div className="ow-usmap-loading">Loading map…</div>
      ) : (
        <svg viewBox="0 0 975 610" className="ow-usmap-svg" role="img" aria-label="U.S. delivery coverage">
          <g>
            {feats.map((f) => {
              const c = colorFor(f.code);
              const clickable = interactive && f.code !== baseState;
              return (
                <path
                  key={f.code}
                  d={f.d}
                  className={'ow-usmap-state' + (clickable ? ' is-clickable' : '')}
                  style={{ fill: c.fill, stroke: c.stroke }}
                  onClick={() => click(f.code)}
                  onMouseEnter={clickable ? () => setHover(f.code) : undefined}
                  onMouseLeave={clickable ? () => setHover(null) : undefined}
                >
                  <title>{f.name}</title>
                </path>
              );
            })}
          </g>
          <g className="ow-usmap-labels">
            {feats.map((f) =>
              NO_LABEL.has(f.code) ? null : (
                <text
                  key={f.code}
                  x={f.cx}
                  y={f.cy + 3}
                  textAnchor="middle"
                  style={{ fill: colorFor(f.code).label }}
                  className="ow-usmap-label"
                >
                  {f.code}
                </text>
              )
            )}
          </g>
        </svg>
      )}
    </div>
  );
}
