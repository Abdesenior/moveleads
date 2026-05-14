// Combined market dataset for the partner-research autocomplete.
// Each entry has a stable `value` (what we store) and `label` (what we show).
//   - State entry:  value = "Florida",     state = "FL", isState = true
//   - City entry:   value = "Miami, FL",   city  = "Miami",  state = "FL"
//
// `searchAll(query, exclude)` returns ranked matches (max 6) shared between
// the single-select MarketAutocomplete and the multi-select MarketMultiSelect.

import { US_STATES } from './usStates';
import { US_CITIES } from './usCities';

const STATE_ENTRIES = US_STATES.map(s => ({
  value:   s.name,                       // "Florida"
  label:   s.name,                       // "Florida"
  state:   s.code,                       // "FL"
  isState: true,
  needle:  `${s.name} ${s.code}`.toLowerCase(),
}));

const CITY_ENTRIES = US_CITIES.map(c => ({
  value:   `${c.city}, ${c.state}`,      // "Miami, FL"
  label:   c.city,                       // "Miami"
  city:    c.city,
  state:   c.state,
  isState: false,
  needle:  `${c.city} ${c.state}`.toLowerCase(),
}));

export const MARKET_ENTRIES = [...STATE_ENTRIES, ...CITY_ENTRIES];

/**
 * Rank entries against `query`.
 *   - Score 0: state code exact match (typing "FL" surfaces "Florida")
 *   - Score 1: state name starts with query OR city name starts with query
 *   - Score 2: state matches but city doesn't start with query
 *   - Score 3: substring elsewhere
 * Within a score band, states float to the top before cities so the user
 * always sees the broader option first.
 */
function score(entry, q) {
  const stateLower = entry.state.toLowerCase();
  if (entry.isState && stateLower === q) return 0;
  if (entry.isState && entry.label.toLowerCase().startsWith(q)) return 0;
  if (!entry.isState && entry.city.toLowerCase().startsWith(q)) return 1;
  if (entry.isState && stateLower.startsWith(q)) return 1;
  if (!entry.isState && stateLower === q) return 2;
  if (!entry.isState && stateLower.startsWith(q)) return 2;
  return 3;
}

export function searchMarkets(query, exclude = []) {
  const excludeSet = new Set(exclude);
  const q = String(query || '').trim().toLowerCase();
  const pool = MARKET_ENTRIES.filter(e => !excludeSet.has(e.value));
  if (!q) {
    return pool
      .filter(e => e.isState)         // empty query → suggest states first
      .slice(0, 6);
  }
  const matches = pool.filter(e => e.needle.includes(q));
  matches.sort((a, b) => {
    const sa = score(a, q);
    const sb = score(b, q);
    if (sa !== sb) return sa - sb;
    if (a.isState !== b.isState) return a.isState ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return matches.slice(0, 6);
}

/** Resolve a stored value back to an entry (for chip rendering). */
export function findMarket(value) {
  if (!value) return null;
  return MARKET_ENTRIES.find(e => e.value === value) || { value, label: value, state: '', isState: false };
}
