import React, { useState, useEffect, useMemo, useRef } from 'react';
import { searchMarkets, findMarket } from '../data/usMarkets';

/**
 * MarketAutocomplete — single-select city OR state picker. Same .fm-state-*
 * shell as the founding-movers state autocomplete: input, dropdown, chip
 * after selection, keyboard nav. Stores either "City, ST" or "State Name".
 */
export default function MarketAutocomplete({ value, onChange, placeholder = 'City or state…', autoFocus = false }) {
  const [query, setQuery]         = useState('');
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(() => findMarket(value), [value]);
  const filtered = useMemo(() => searchMarkets(query), [query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (autoFocus && !selected && inputRef.current) inputRef.current.focus();
  }, [autoFocus, selected]);

  function commit(entry) {
    onChange(entry.value);
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
          {selected.label}
          {!selected.isState && selected.state ? <span className="fm-state-chip-code">({selected.state})</span> : null}
          <button
            type="button"
            className="fm-state-chip-x"
            aria-label={`Remove ${selected.label}`}
            onClick={() => onChange('')}
          >×</button>
        </span>
      </div>
    );
  }

  return (
    <div className="fm-state-wrap" ref={wrapRef}>
      <input
        ref={inputRef}
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
              key={e.value}
              type="button"
              role="option"
              aria-selected={i === activeIdx}
              className={`fm-state-option${i === activeIdx ? ' active' : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => commit(e)}
            >
              <span className="fm-state-name">{e.label}</span>
              {e.isState ? null : <span className="fm-state-code">({e.state})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
