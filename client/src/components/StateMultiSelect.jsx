import { useState, useRef } from 'react';
import { US_STATES } from '../data/usStates';

/**
 * Pure-client state multi-select. Picks from the 50 + DC list.
 *
 * Behavior:
 *   • Type to filter — matches state name prefix OR 2-letter code.
 *   • Selected states show as removable chips above the input.
 *   • Suggestions drop in below the input with keyboard nav.
 *   • Mobile-friendly: chips wrap, dropdown items 44px tall.
 *
 * Props:
 *   value:     [String]            — array of selected 2-letter state codes
 *   onChange:  (next: [String]) => void
 *   placeholder?: string
 *   ariaLabel?:   string
 */
export default function StateMultiSelect({ value = [], onChange, placeholder = 'Type a state…', ariaLabel = 'Select states' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);

  const selectedSet = new Set(value);
  const q = query.trim().toLowerCase();
  const matches = US_STATES.filter(s => {
    if (selectedSet.has(s.code)) return false;
    if (!q) return true;
    return s.name.toLowerCase().startsWith(q) || s.code.toLowerCase() === q;
  }).slice(0, 8);

  function add(state) {
    if (!state || selectedSet.has(state.code)) return;
    onChange && onChange([...value, state.code]);
    setQuery('');
    // Close the suggestions list after a pick. The user can refocus the
    // input (or just click into it) to add another state — that re-opens
    // the dropdown via onFocus. Keeps the UI calm after each selection.
    setOpen(false);
    setHighlight(0);
  }

  function remove(code) {
    onChange && onChange(value.filter(c => c !== code));
  }

  function handleKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight(i => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = matches[highlight];
      if (s) add(s);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && query === '' && value.length > 0) {
      remove(value[value.length - 1]);
    }
  }

  return (
    <div className="ow-state-ms" aria-label={ariaLabel}>
      {value.length > 0 && (
        <div className="ow-state-ms-chips">
          {value.map(code => {
            const s = US_STATES.find(x => x.code === code);
            const label = s ? s.name : code;
            return (
              <span key={code} className="ow-state-ms-chip">
                {label}
                <button
                  type="button"
                  className="ow-state-ms-chip-x"
                  aria-label={`Remove ${label}`}
                  onClick={() => remove(code)}
                >×</button>
              </span>
            );
          })}
        </div>
      )}
      <div className="ow-state-ms-inputwrap">
        <input
          ref={inputRef}
          type="text"
          className="ow-input"
          placeholder={value.length ? 'Add another state…' : placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 140)}
          onKeyDown={handleKey}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
        />
        {open && matches.length > 0 && (
          <ul className="ow-state-ms-dropdown" role="listbox">
            {matches.map((s, i) => (
              <li
                key={s.code}
                role="option"
                aria-selected={i === highlight}
                className={`ow-state-ms-option${i === highlight ? ' active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); add(s); }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="ow-state-ms-option-name">{s.name}</span>
                <span className="ow-state-ms-option-code">{s.code}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
