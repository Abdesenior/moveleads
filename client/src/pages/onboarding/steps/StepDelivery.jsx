/**
 * Step 3 — Delivery coverage.
 *
 * Three mode cards (local / some / all) drive the InteractiveUSMap render.
 * When 'some' is active the map becomes interactive — clicking a state
 * toggles it in/out of the deliveryStates[] array.
 *
 * Save shape (controller dispatches on Continue):
 *   POST /api/onboarding/save-step
 *     {
 *       step: 2,
 *       answers: {
 *         delivery: { mode: 'same|states|nationwide', states: [...] },
 *         pickup:   { mode: 'near|states', states: [...] }   ← auto-derived
 *       }
 *     }
 *
 *   UI vocab is translated at save time by personalize.js::mapDeliveryUiToServer.
 *   Pickup is auto-derived by personalize.js::derivePickup using the
 *   delivery answer + dispatchBase.state captured on Step 2.
 */

import InteractiveUSMap, { US_STATE_NAMES } from '../InteractiveUSMap';
import { Check } from 'lucide-react';

const DELIVERY_MODES = [
  { id: 'local', title: 'Local moves only' },
  { id: 'some',  title: 'Some states' },
  { id: 'all',   title: 'All U.S. states' },
];

// Quick-pick chips on mobile so movers can pick without targeting small
// state outlines. These supplement the map — they don't replace it.
const QUICK_STATES = ['OK','LA','NM','AR','CO','KS','MS','TN','GA','FL'];

export default function StepDelivery({ ctx }) {
  const { deliveryMode, setDeliveryMode, deliveryStates, toggleDeliveryState,
          cityName, stateAbbr, statesPhrase } = ctx;

  const mapMode = deliveryMode === 'all' ? 'all'
    : deliveryMode === 'some' ? 'some'
    : 'local';

  const caption = {
    local: `We'll keep your leads focused ${cityName ? 'near ' + cityName : 'near you'}.`,
    some:  `We'll send leads that match these states.`,
    all:   `You'll be eligible for long-distance leads across the U.S.`,
  };

  return (
    <div className="ow-content">
      <div className="ow-header">
        <h1 className="ow-h1">Where do you deliver?</h1>
        <p className="ow-sub">
          Choose where you want to receive leads.
        </p>
      </div>

      <div className="ow-cards">
        {DELIVERY_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={'ow-card ow-card--titleonly' + (deliveryMode === m.id ? ' ow-card--active' : '')}
            onClick={() => setDeliveryMode(m.id)}
          >
            <span className="ow-card-check"><Check size={12} strokeWidth={3} /></span>
            <span className="ow-card-title">{m.title}</span>
          </button>
        ))}
      </div>

      {deliveryMode && (
        <div className="ow-coverage-map ow-reveal">
          <InteractiveUSMap
            mode={mapMode}
            baseState={stateAbbr}
            selectedStates={deliveryStates}
            onToggleState={toggleDeliveryState}
          />
          <p className="ow-coverage-caption">{caption[deliveryMode]}</p>
        </div>
      )}

      {deliveryMode === 'some' && (
        <div className="ow-state-chips ow-state-chips--mobile" aria-label="Quick state picker">
          {QUICK_STATES.map((s) => {
            const on = deliveryStates.includes(s);
            return (
              <button
                key={s}
                type="button"
                className={'ow-state-chip' + (on ? ' on' : '')}
                onClick={() => toggleDeliveryState(s)}
              >
                {on && <Check size={12} strokeWidth={3} />} {US_STATE_NAMES[s] || s}
              </button>
            );
          })}
        </div>
      )}

      {deliveryMode === 'some' && deliveryStates.length > 0 && (
        <div className="ow-coverage-summary ow-reveal" key={deliveryStates.length}>
          <span className="ow-coverage-summary-label">Serving</span>
          <span className="ow-coverage-summary-value">{statesPhrase}</span>
        </div>
      )}
    </div>
  );
}
