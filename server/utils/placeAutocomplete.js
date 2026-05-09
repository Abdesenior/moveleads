// Local place autocomplete — no external API.
//
// At module load, we iterate the `zipcodes` package's full US dataset
// (~44k ZIP entries, already bundled — no network, no DB, no key) and build
// two in-memory indices:
//
//   • cityIndex — { "houston, tx": { city, state, zip } }
//                 Deduplicated to ONE primary ZIP per city/state pair.
//                 Used to power city prefix lookups.
//
//   • zipPrefixIndex — { "770": [zipRecord, zipRecord, ...] }
//                      First-3-digits prefix → list of full ZIP records.
//                      Used to power 5-digit ZIP prefix lookups.
//
// Lookups are O(1)+slice. Memory cost: ~1–2 MB. Build cost: ~50ms once at boot.

const zipcodes = require('zipcodes');

const cityList = []; // [{ city, state, zip, lc }, ...] — sorted alphabetically by city
const zipPrefixIndex = new Map(); // "770" → [zipRecord, zipRecord, ...]

function buildIndices() {
  const seenCity = new Map();      // key → primary ZIP record
  const cityZipCount = new Map();  // key → number of ZIPs (≈ population proxy)
  const codes = zipcodes.codes;
  const allZips = Object.keys(codes);

  for (const zip of allZips) {
    const r = codes[zip];
    if (!r || r.country !== 'US' || !r.city || !r.state) continue;

    const key = `${r.city.toLowerCase()}, ${r.state.toLowerCase()}`;
    cityZipCount.set(key, (cityZipCount.get(key) || 0) + 1);

    if (!seenCity.has(key)) {
      seenCity.set(key, r);
    } else {
      const prev = seenCity.get(key);
      if (Number(r.zip) < Number(prev.zip)) seenCity.set(key, r);
    }

    const pfx = String(zip).slice(0, 3);
    if (!zipPrefixIndex.has(pfx)) zipPrefixIndex.set(pfx, []);
    zipPrefixIndex.get(pfx).push(r);
  }

  for (const [key, r] of seenCity) {
    cityList.push({
      city: r.city,
      state: r.state,
      zip: r.zip,
      lc: r.city.toLowerCase(),
      // Higher = more ZIPs = bigger metro. Used as a population proxy when
      // ranking suggestions for short prefix queries.
      weight: cityZipCount.get(key) || 1,
    });
  }
  cityList.sort((a, b) => a.lc.localeCompare(b.lc));

  for (const [, arr] of zipPrefixIndex) arr.sort((a, b) => Number(a.zip) - Number(b.zip));

  console.log(`[PlaceAutocomplete] indexed ${cityList.length} unique cities, ${zipPrefixIndex.size} ZIP prefixes`);
}

buildIndices();

/**
 * Return up to `limit` suggestions for the user's query.
 * Returns ZIP-prefix matches if the query starts with digits, otherwise
 * city-prefix matches. Results never include free-form / unresolved entries —
 * the wizard forces the user to pick from this list.
 *
 * Result shape:
 *   { kind: 'city', label: 'Houston, TX', city, state, zip }
 *   { kind: 'zip',  label: '77001 — Houston, TX', zip, city, state }
 */
function suggestPlaces(query, limit = 8) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const max = Math.max(1, Math.min(20, Number(limit) || 8));

  // Numeric query → ZIP prefix lookup.
  if (/^\d+$/.test(q)) {
    const pfx = q.slice(0, 3);
    const bucket = zipPrefixIndex.get(pfx) || [];
    const out = [];
    for (const r of bucket) {
      if (r.zip.startsWith(q)) {
        out.push({
          kind: 'zip',
          label: `${r.zip} — ${r.city}, ${r.state}`,
          zip: r.zip,
          city: r.city,
          state: r.state,
        });
        if (out.length >= max) break;
      }
    }
    return out;
  }

  // Text query → city prefix lookup. Allow patterns like "houston" or "houston, tx".
  const parts = q.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const cityNeedle  = parts[0] || '';
  const stateNeedle = (parts[1] || '').toUpperCase();

  // Walk the alphabetically-sorted list, collect all prefix matches
  // (cap at 200 to bound the candidate pool), then rank in a separate pass.
  const candidates = [];
  for (const c of cityList) {
    if (!c.lc.startsWith(cityNeedle)) continue;
    if (stateNeedle && c.state !== stateNeedle) continue;
    candidates.push(c);
    if (candidates.length >= 200) break;
  }

  // Rank: exact city-name matches first, then by population proxy (ZIP
  // count) descending. So typing "Hou" surfaces Houston, TX (~150 ZIPs)
  // above Houck, AZ (1 ZIP).
  candidates.sort((a, b) => {
    const aExact = a.lc === cityNeedle ? 0 : 1;
    const bExact = b.lc === cityNeedle ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return (b.weight || 0) - (a.weight || 0);
  });

  return candidates.slice(0, max).map(c => ({
    kind: 'city',
    label: `${c.city}, ${c.state}`,
    city: c.city,
    state: c.state,
    zip: c.zip,
  }));
}

module.exports = { suggestPlaces };
