import { useEffect, useRef, useState } from 'react';
import { MapPin, X, CheckCircle, AlertCircle } from 'lucide-react';
import { useGoogleMaps } from '../hooks/useGoogleMaps';

/**
 * A Google Places Autocomplete input that:
 *  - Restricts suggestions to US addresses
 *  - Extracts postal_code from the selected place
 *  - Calls onSelect({ address, zip, city, state }) when a valid address is chosen
 *  - Falls back to a plain 5-digit zip input when the API key is missing
 *
 * Props:
 *   placeholder  string       Input placeholder text
 *   onSelect     function     Called with { address, zip, city, state }
 *   error        string|null  Validation error message to display
 *   disabled     boolean
 */
export default function AddressAutocomplete({ placeholder, onSelect, error, disabled }) {
  const { ready, error: apiError } = useGoogleMaps();
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

  const [displayValue, setDisplayValue] = useState('');
  const [confirmed, setConfirmed] = useState(null); // { address, zip }
  const [noZipWarning, setNoZipWarning] = useState(false);

  // Initialise Places Autocomplete once the API is ready
  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address']
    });

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place?.address_components) return;

      const get = (type) =>
        place.address_components.find(c => c.types.includes(type))?.long_name || '';

      const zip   = get('postal_code');
      const city  = get('locality') || get('sublocality') || get('neighborhood') || get('administrative_area_level_3');
      const state = place.address_components.find(c => c.types.includes('administrative_area_level_1'))?.short_name || '';
      const address = place.formatted_address || inputRef.current.value;

      setDisplayValue(address);
      setNoZipWarning(!zip);

      if (zip) {
        setConfirmed({ address, zip });
        onSelect({ address, zip, city, state });
      }
    });

    autocompleteRef.current = ac;
  }, [ready, onSelect]);

  const clear = () => {
    setDisplayValue('');
    setConfirmed(null);
    setNoZipWarning(false);
    onSelect({ address: '', zip: '', city: '', state: '' });
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ── Graceful fallback: plain zip input when API key is absent ──
  if (apiError) {
    return (
      <ZipFallback
        placeholder={placeholder?.replace('address', 'zip code')}
        onSelect={onSelect}
        error={error}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="ac-wrapper">
      <div className={`ac-input-box ${confirmed ? 'ac-input-box--confirmed' : ''} ${error ? 'ac-input-box--error' : ''}`}>
        <MapPin size={16} className="ac-icon-pin" />

        {confirmed ? (
          // Confirmed state: show a pill with the chosen address
          <div className="ac-confirmed-pill">
            <CheckCircle size={14} className="ac-pill-check" />
            <span className="ac-pill-address">{confirmed.address}</span>
            <span className="ac-pill-zip">({confirmed.zip})</span>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={e => {
              setDisplayValue(e.target.value);
              setNoZipWarning(false);
              // If user types manually after selecting, clear the confirmed state
              if (confirmed) {
                setConfirmed(null);
                onSelect({ address: '', zip: '', city: '', state: '' });
              }
            }}
            placeholder={ready ? placeholder : 'Loading address search…'}
            disabled={disabled || !ready}
            className="ac-input"
            autoComplete="new-password" // suppress browser autocomplete
          />
        )}

        {(displayValue || confirmed) && (
          <button type="button" className="ac-clear-btn" onClick={clear} aria-label="Clear address">
            <X size={14} />
          </button>
        )}
      </div>

      {noZipWarning && (
        <p className="ac-warning">
          <AlertCircle size={12} /> Couldn't read the zip code for that address. Try selecting a more specific result.
        </p>
      )}

      {error && <p className="gq-error">{error}</p>}
    </div>
  );
}

// ── Plain zip fallback ─────────────────────────────────────────────────────
function ZipFallback({ placeholder, onSelect, error, disabled }) {
  const handleChange = (e) => {
    const zip = e.target.value.replace(/\D/g, '').slice(0, 5);
    e.target.value = zip;
    if (zip.length === 5) {
      onSelect({ address: zip, zip, city: `Area ${zip}`, state: '' });
    } else {
      onSelect({ address: '', zip: '', city: '', state: '' });
    }
  };

  return (
    <div>
      <input
        type="text"
        inputMode="numeric"
        maxLength={5}
        placeholder={placeholder || '5-digit zip code'}
        disabled={disabled}
        onChange={handleChange}
        className={`gq-input ${error ? 'gq-input--error' : ''}`}
      />
      {error && <p className="gq-error">{error}</p>}
    </div>
  );
}
