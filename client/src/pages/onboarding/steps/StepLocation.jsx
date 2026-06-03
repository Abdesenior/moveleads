/**
 * Step 2 — Company location.
 *
 * Connects to the REAL `GET /api/onboarding/place-suggest` endpoint via the
 * production PlaceAutocomplete component. The mover types a city or ZIP;
 * the dropdown surfaces real city + ZIP suggestions from the bundled
 * 41,000+ ZIP index on the server.
 *
 * Captures {zip, city, state} atomically — no separate fields, no manual
 * state pickers. The autocomplete refuses to commit on free text, so we
 * always get a real ZIP + city + state.
 *
 * Save shape (controller dispatches):
 *   POST /api/onboarding/save-step
 *     { step: 1, answers: { dispatchBase: { input, zip, city, state }, primaryMarket } }
 *
 * The pickup-mode auto-derivation happens later on Step 3 save (see
 * personalize.js::derivePickup). This step only captures the base.
 */

import { Check } from 'lucide-react';
import PlaceAutocomplete from '../../../components/PlaceAutocomplete';

export default function StepLocation({ ctx }) {
  const { dispatchBase, setDispatchBase } = ctx;

  const onSelect = (place) => {
    // place = { zip, city, state, label }
    setDispatchBase({
      input: place.label || (place.city ? `${place.city}, ${place.state}` : place.zip),
      zip: place.zip || '',
      city: place.city || '',
      state: place.state || '',
    });
  };

  const onClear = () => {
    setDispatchBase({ input: '', zip: '', city: '', state: '' });
  };

  const ready = !!(dispatchBase && dispatchBase.zip);

  return (
    <div className="ow-content">
      <div className="ow-header">
        <h1 className="ow-h1">Where is your company based?</h1>
        <p className="ow-sub">
          We'll use this to match you with nearby opportunities.
        </p>
      </div>

      <label className="ow-label" htmlFor="ow-loc-input">Company location</label>
      <div className="ow-field">
        <PlaceAutocomplete
          id="ow-loc-input"
          value={ready ? dispatchBase : null}
          onSelect={onSelect}
          onClear={onClear}
          placeholder="Houston, TX or 77001"
          ariaLabel="Search city or ZIP"
          autoFocus
        />
      </div>

      {ready ? (
        <>
          <div className="ow-confirm-aside ow-reveal" key={dispatchBase.zip}>
            <span className="ow-aside-icon">
              <Check size={18} strokeWidth={2.5} />
            </span>
            <div>
              <p className="ow-aside-title">Company location confirmed</p>
              <p className="ow-aside-text">
                {dispatchBase.city
                  ? `${dispatchBase.city}, ${dispatchBase.state}`
                  : dispatchBase.zip}
                {dispatchBase.zip ? ` · ${dispatchBase.zip}` : ''}
              </p>
            </div>
          </div>
          <p className="ow-helper">Used to match nearby opportunities.</p>
        </>
      ) : (
        <p className="ow-helper">Used to match you with nearby requests.</p>
      )}
    </div>
  );
}
