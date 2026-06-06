import { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';

/**
 * Local US city / ZIP autocomplete. No Google Maps. Backed by
 * GET /api/onboarding/place-suggest, which serves an in-memory prefix
 * index built from the bundled `zipcodes` package at server boot.
 *
 * Behavior:
 *   • Debounced 300ms.
 *   • Keyboard: ArrowUp / ArrowDown / Enter / Escape.
 *   • Touch-friendly: dropdown items are 44px tall.
 *   • Forced selection: free text never commits — user must pick a suggestion.
 *   • When `value` is set (parent passes a resolved place), renders as a chip
 *     with a "×" to clear and re-open the input.
 *
 * Props:
 *   value:       null | { zip, city, state }   — current resolved selection
 *   onSelect:    (place) => void               — called when user picks a suggestion
 *   onClear:     () => void                    — called when chip × is clicked
 *   placeholder: string                        — input placeholder
 *   ariaLabel:   string                        — accessibility label for the input
 *   id:          string                        — input id (for label htmlFor)
 */
export default function PlaceAutocomplete({
  value,
  onSelect,
  onClear,
  placeholder = 'Houston, TX or 77001',
  ariaLabel = 'Search city or ZIP',
  id,
  autoFocus = false,
}) {
  const { API_URL } = useContext(AuthContext);
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const fetchSuggestions = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const url = `${API_URL}/onboarding/place-suggest?q=${encodeURIComponent(q)}&limit=8`;
      const res = await fetch(url, {
        headers: { 'x-auth-token': localStorage.getItem('token') || '' },
      });
      const data = await res.json();
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      setHighlight(0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  function handleInput(e) {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 300);
  }

  function pick(s) {
    onSelect && onSelect({ zip: s.zip, city: s.city, state: s.state, label: s.label });
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setHighlight(0);
  }

  function handleKey(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = suggestions[highlight];
      if (s) pick(s);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function handleBlur() {
    // Defer so onMouseDown on a suggestion item can fire before we close.
    setTimeout(() => setOpen(false), 140);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Chip mode — parent has a resolved place.
  if (value && value.zip) {
    return (
      <div className="ow-place-chip-row">
        <span className="ow-place-chip">
          {value.city ? `${value.city}, ${value.state}` : value.zip}
          <span className="ow-place-chip-zip">· {value.zip}</span>
          <button
            type="button"
            className="ow-place-chip-x"
            aria-label="Change selection"
            onClick={() => onClear && onClear()}
          >×</button>
        </span>
      </div>
    );
  }

  return (
    <div className="ow-place-wrap">
      <input
        id={id}
        ref={inputRef}
        type="text"
        className="ow-input"
        placeholder={placeholder}
        value={query}
        onChange={handleInput}
        onFocus={() => {
          if (suggestions.length) setOpen(true);
          // Mobile: scroll the input to the top of its scroll ancestor
          // (the wizard modal body) so the soft keyboard doesn't cover
          // the dropdown that opens beneath the input. Delay one frame
          // so the keyboard has started to rise — otherwise iOS measures
          // against the pre-keyboard viewport and the scroll snaps back.
          requestAnimationFrame(() => {
            inputRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          });
        }}
        onBlur={handleBlur}
        onKeyDown={handleKey}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls="ow-place-listbox"
        aria-autocomplete="list"
        aria-label={ariaLabel}
      />
      {open && suggestions.length > 0 && (
        <ul id="ow-place-listbox" className="ow-place-dropdown" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.kind === 'zip' ? `z-${s.zip}` : `c-${s.city}-${s.state}`}
              role="option"
              aria-selected={i === highlight}
              className={`ow-place-option${i === highlight ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="ow-place-option-label">
                {s.kind === 'zip' ? (
                  <>
                    <span className="ow-place-option-zip">{s.zip}</span>
                    <span className="ow-place-option-city">— {s.city}, {s.state}</span>
                  </>
                ) : (
                  <>
                    <span className="ow-place-option-city">{s.city},</span>
                    <span className="ow-place-option-state"> {s.state}</span>
                  </>
                )}
              </span>
              <span className="ow-place-option-kind">{s.kind === 'zip' ? 'ZIP' : 'City'}</span>
            </li>
          ))}
        </ul>
      )}
      {loading && open && suggestions.length === 0 && (
        <div className="ow-place-empty">Searching…</div>
      )}
      {open && !loading && query.trim().length >= 2 && suggestions.length === 0 && (
        <div className="ow-place-empty">No matches. Try a city + state, e.g. Houston, TX</div>
      )}
    </div>
  );
}
