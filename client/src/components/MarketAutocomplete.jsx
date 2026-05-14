import React, { useState, useEffect, useMemo, useRef } from 'react';
import { US_CITIES } from '../data/usCities';

/**
 * MarketAutocomplete — city-level US market picker matching the UX of the
 * founding-movers state autocomplete (same .fm-state-* classes, same
 * keyboard behavior, same chip on select). Stores `${city}, ${state}` —
 * a normalized, standardized value, never free text.
 */

// Pre-derive each city's display name + searchable strings ONCE.
const ENTRIES = US_CITIES.map(c => ({
  city:  c.city,
  state: c.state,
  name:  `${c.city}, ${c.state}`,            // stored value + label
  needle: `${c.city} ${c.state}`.toLowerCase(),
}));

export default function MarketAutocomplete({ value, onChange, placeholder = 'Main market' }) {
  const [query, setQuery]         = useState('');
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);

  // Resolve the current value back to a chip. If the stored value doesn't
  // match a known entry (e.g. legacy "FL"), still render it as a chip so
  // we don't drop the data on the floor.
  const selected = useMemo(() => {
    if (!value) return null;
    return ENTRIES.find(e => e.name === value) || { name: value, state: '' };
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ENTRIES.slice(0, 6);
    const matches = ENTRIES.filter(e =>
      e.needle.includes(q) || e.state.toLowerCase().startsWith(q)
    );
    return matches.sort((a, b) => {
      const aPref = a.city.toLowerCase().startsWith(q) ? 0 : (a.state.toLowerCase().startsWith(q) ? 1 : 2);
      const bPref = b.city.toLowerCase().startsWith(q) ? 0 : (b.state.toLowerCase().startsWith(q) ? 1 : 2);
      if (aPref !== bPref) return aPref - bPref;
      return a.city.localeCompare(b.city);
    }).slice(0, 6);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function commit(entry) {
    onChange(entry.name);
    setQuery('');
    setOpen(false);
    setActiveIdx(0);
  }

  function handleKey(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[activeIdx] || filtered[0];
      if (pick) commit(pick);
    }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  if (selected) {
    return (
      <div className="fm-state-chip-row">
        <span className="fm-state-chip">
          {selected.city || selected.name}
          {selected.state ? <span className="fm-state-chip-code">({selected.state})</span> : null}
          <button
            type="button"
            className="fm-state-chip-x"
            aria-label={`Remove ${selected.name}`}
            onClick={() => onChange('')}
          >×</button>
        </span>
      </div>
    );
  }

  return (
    <div className="fm-state-wrap" ref={wrapRef}>
      <input
        className="fm-input"
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIdx(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="fm-state-dropdown" role="listbox">
          {filtered.map((e, i) => (
            <button
              key={`${e.city}-${e.state}`}
              type="button"
              role="option"
              aria-selected={i === activeIdx}
              className={`fm-state-option${i === activeIdx ? ' active' : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => commit(e)}
            >
              <span className="fm-state-name">{e.city}</span>
              <span className="fm-state-code">({e.state})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
