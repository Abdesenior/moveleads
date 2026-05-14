import React, { useState, useEffect, useMemo, useRef } from 'react';
import { US_STATES } from '../data/usStates';

/**
 * MarketAutocomplete — state-level market picker matching the UX of the
 * founding-movers state autocomplete. Stores the 2-letter state code.
 *
 * Uses the .fm-state-* classnames so FoundingMovers.css styles apply when
 * imported on a page that also imports FoundingMovers.css.
 */
export default function MarketAutocomplete({ value, onChange, placeholder = 'Main market' }) {
  const [query, setQuery]         = useState('');
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);

  const selected = useMemo(() => {
    if (!value) return null;
    return US_STATES.find(s => s.code === value || s.name === value) || null;
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return US_STATES.slice(0, 6);
    const matches = US_STATES.filter(s =>
      s.name.toLowerCase().includes(q) || s.code.toLowerCase().startsWith(q)
    );
    return matches.sort((a, b) => {
      const aPref = a.name.toLowerCase().startsWith(q) || a.code.toLowerCase().startsWith(q) ? 0 : 1;
      const bPref = b.name.toLowerCase().startsWith(q) || b.code.toLowerCase().startsWith(q) ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
      return a.name.localeCompare(b.name);
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

  function commit(state) {
    onChange(state.code);
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
          {selected.name} <span className="fm-state-chip-code">({selected.code})</span>
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
          {filtered.map((s, i) => (
            <button
              key={s.code}
              type="button"
              role="option"
              aria-selected={i === activeIdx}
              className={`fm-state-option${i === activeIdx ? ' active' : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => commit(s)}
            >
              <span className="fm-state-name">{s.name}</span>
              <span className="fm-state-code">({s.code})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
