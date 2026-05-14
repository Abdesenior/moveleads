import React, { useState, useEffect, useMemo, useRef } from 'react';
import { searchMarkets, findMarket } from '../data/usMarkets';

/**
 * MarketMultiSelect — multi-select cousin of MarketAutocomplete.
 * Renders selected values as chips and an autocomplete input below.
 * Stores an array of "City, ST" / "State Name" strings.
 *
 * Reuses the same .fm-state-* classes for the input + dropdown so the
 * visual language matches the founding-movers single-select exactly.
 * Chips use a slightly stronger style via inline tweaks atop fm-state-chip.
 */
export default function MarketMultiSelect({ values = [], onChange, placeholder = 'Add a market…', max = 8 }) {
  const [query, setQuery]         = useState('');
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => searchMarkets(query, values), [query, values]);
  const reachedMax = values.length >= max;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function commit(entry) {
    if (values.includes(entry.value)) return;
    if (reachedMax) return;
    onChange([...values, entry.value]);
    setQuery('');
    setActiveIdx(0);
    setOpen(true);
  }

  function remove(value) {
    onChange(values.filter(v => v !== value));
  }

  function handleKey(e) {
    if (e.key === 'Backspace' && !query && values.length) {
      e.preventDefault();
      remove(values[values.length - 1]);
      return;
    }
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

  return (
    <div className="fm-state-wrap" ref={wrapRef}>
      {values.length > 0 && (
        <div className="fm-state-chip-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {values.map(v => {
            const entry = findMarket(v);
            return (
              <span key={v} className="fm-state-chip">
                {entry.label}
                {!entry.isState && entry.state ? <span className="fm-state-chip-code">({entry.state})</span> : null}
                <button
                  type="button"
                  className="fm-state-chip-x"
                  aria-label={`Remove ${entry.label}`}
                  onClick={() => remove(v)}
                >×</button>
              </span>
            );
          })}
        </div>
      )}

      {!reachedMax && (
        <input
          className="fm-input"
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIdx(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={values.length === 0 ? placeholder : 'Add another market…'}
          aria-autocomplete="list"
          aria-expanded={open}
          autoComplete="off"
        />
      )}

      {open && filtered.length > 0 && !reachedMax && (
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
