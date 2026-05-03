/**
 * Import script for FB Ads leads with:
 * - Relative move dates ("Within 30 days", "1-3 months", "3+ months")
 * - Fuzzy move sizes ("2-3 Bedrooms", "Studio / 1 Bedroom", etc.)
 * - Missing zips → looked up from city+state
 * - Messy city names (inline state, typos)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const zipcodes = require('zipcodes');
const Lead = require('../models/Lead');
const { calculateAuctionPrice } = require('../utils/pricingEngine');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('No MONGODB_URI'); process.exit(1); }

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  const headers = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return obj;
  });
}
function splitLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (const c of line) {
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

// ── Normalizers ───────────────────────────────────────────────────────────────
const SIZE_MAP = {
  'studio': 'Studio', 'studio / 1 bedroom': '1 Bedroom', '1 bedroom': '1 Bedroom',
  '2 bedroom': '2 Bedroom', '2-3 bedrooms': '2 Bedroom', '2â3 bedrooms': '2 Bedroom',
  '3 bedroom': '3 Bedroom', '3-4 bedrooms': '3 Bedroom',
  '4 bedroom': '4+ Bedroom', '4+ bedrooms': '4+ Bedroom', '4+ bedroom': '4+ Bedroom',
  '5+ bedroom': '4+ Bedroom',
};
function normalizeSize(raw) {
  if (!raw) return '2 Bedroom';
  const key = raw.toLowerCase().replace(/[^\w\s\/\+\-]/g, '').replace(/â/g, '-').trim();
  return SIZE_MAP[key] || SIZE_MAP[key.replace(/s$/, '')] || '2 Bedroom';
}

function parseFuzzyDate(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[^\w\s\+]/g, '').trim();

  // Exact date — validate it's in the future
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const todayNoon = new Date();
    todayNoon.setUTCHours(12, 0, 0, 0);
    const d = new Date(s + 'T12:00:00.000Z');
    return isNaN(d.getTime()) || d <= todayNoon ? null : d;
  }

  // Fuzzy ranges — compute relative date
  let days;
  if (s.includes('within') || s.includes('30'))   days = 20;
  else if (s.includes('1') && s.includes('3'))     days = 45;
  else if (s.includes('3') && s.includes('month')) days = 90;
  else return null; // unrecognized format — skip instead of 30-day fallback

  const d = new Date(Date.now() + days * 86400000);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

// Clean up city names like "Zephyrhills Florida" → {city:"Zephyrhills", state:"FL"}
const STATE_ABBR = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
  'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
  'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
  'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
  'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  // common abbrev/alias
  'in.':'IN', 'n.c.':'NC', 'n.j.':'NJ',
};
function parseCityState(cityRaw, stateRaw) {
  let city = cityRaw.trim();
  let state = stateRaw.trim().toUpperCase();

  // Strip inline state names from city string e.g. "Zephyrhills Florida"
  for (const [name, abbr] of Object.entries(STATE_ABBR)) {
    const rx = new RegExp('\\b' + name + '\\b', 'i');
    if (rx.test(city)) {
      city = city.replace(rx, '').trim().replace(/,\s*$/, '').trim();
      if (!state) state = abbr;
      break;
    }
  }
  // Inline abbr e.g. "Evansville, In."
  const abbrMatch = city.match(/,\s*([A-Za-z\.]+)$/);
  if (abbrMatch) {
    const candidate = STATE_ABBR[abbrMatch[1].toLowerCase()] || abbrMatch[1].replace('.','').toUpperCase();
    city = city.replace(/,\s*[A-Za-z\.]+$/, '').trim();
    if (!state) state = candidate;
  }
  // Strip trailing content after city name for junk like "Staying In Evansville"
  city = city.replace(/\s+(staying|in\.|inc\.).*$/i, '').trim();

  // Normalize state: expand full name if needed
  if (state.length > 2) {
    state = STATE_ABBR[state.toLowerCase()] || state.substring(0,2).toUpperCase();
  }

  return { city: city || '', state: state || '' };
}

function zipForCity(city, state) {
  if (!city) return '';
  try {
    const results = zipcodes.lookupByName(city, state);
    if (results && results.length > 0) return results[0].zip;
  } catch {}
  return '';
}

function milesFromZips(oz, dz) {
  const o = zipcodes.lookup(String(oz)), d = zipcodes.lookup(String(dz));
  if (!o || !d) return 0;
  const R = 3959, dLat = (d.latitude - o.latitude) * Math.PI / 180, dLon = (d.longitude - o.longitude) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(o.latitude*Math.PI/180)*Math.cos(d.latitude*Math.PI/180)*Math.sin(dLon/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function importFile(filePath) {
  const rows = parseCSV(fs.readFileSync(filePath, 'utf8'));
  let imported = 0, skipped = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const email = (row['email'] || '').trim().toLowerCase();
      if (!email) { skipped++; errors.push({ row: 'unknown', error: 'Missing email' }); continue; }

      const existing = await Lead.findOne({ customerEmail: email });
      if (existing) { skipped++; console.log(`  ~ skip duplicate: ${email}`); continue; }

      const rawPhone = (row['phone'] || '').replace(/\D/g, '');
      const digits = rawPhone.startsWith('1') && rawPhone.length === 11 ? rawPhone.slice(1) : rawPhone;
      if (digits.length !== 10) { skipped++; errors.push({ row: email, error: `Bad phone: ${row['phone']}` }); continue; }
      const customerPhone = `+1${digits}`;

      // Origin
      const { city: originCity, state: originState } = parseCityState(row['origin city'] || '', row['origin state'] || '');
      let originZip = (row['origin zip'] || '').trim();
      if (!originZip && originCity) originZip = zipForCity(originCity, originState) || '';

      // Destination
      const { city: destCity, state: destState } = parseCityState(row['destination city'] || '', row['destination state'] || '');
      let destZip = (row['destination zip'] || '').trim();
      if (!destZip && destCity) destZip = zipForCity(destCity, destState) || '';

      // Skip if we still have no workable location
      if (!originCity && !originZip) { skipped++; errors.push({ row: email, error: 'No origin location' }); continue; }

      const homeSize = normalizeSize(row['move size'] || '');
      const miles = milesFromZips(originZip, destZip);
      const distance = miles > 100 ? 'Long Distance' : (row['move type'] || '').toLowerCase().includes('long') ? 'Long Distance' : 'Local';
      const grade = miles > 500 ? 'A' : miles > 100 ? 'B' : 'C';

      const moveDate = parseFuzzyDate(row['move date'] || '');
      if (!moveDate) { skipped++; errors.push({ row: email, error: `Bad date: ${row['move date']}` }); continue; }

      const pricing = await calculateAuctionPrice({ homeSize, miles, moveDate, grade });

      const lead = new Lead({
        customerName: `${row['first name'] || ''} ${row['last name'] || ''}`.trim() || 'Unknown',
        customerEmail: email,
        customerPhone,
        originCity,
        originState,
        originZip,
        destinationCity: destCity,
        destinationState: destState,
        destinationZip: destZip,
        homeSize,
        moveDate,
        distance,
        miles,
        grade,
        route: `${originCity} → ${destCity}`,
        status: 'READY_FOR_DISTRIBUTION',
        isVerified: true,
        verifiedBy: 'admin',
        source: 'bulk_import',
        buyNowPrice: pricing.buyNowPrice,
        startingBidPrice: pricing.startingBidPrice,
        currentBidPrice: pricing.startingBidPrice,
        price: pricing.buyNowPrice,
        auctionStatus: 'active',
        auctionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        statusHistory: [{ status: 'READY_FOR_DISTRIBUTION', timestamp: new Date() }],
      });

      await lead.save();
      console.log(`  ✓ ${email} | ${originCity} → ${destCity} | ${moveDate.toISOString().split('T')[0]} | ${homeSize}`);
      imported++;
    } catch (err) {
      const email = row['email'] || 'unknown';
      errors.push({ row: email, error: err.message });
      skipped++;
    }
  }

  console.log(`\n[${path.basename(filePath)}] Imported: ${imported} | Skipped: ${skipped}`);
  if (errors.length) { console.log('Errors:'); errors.forEach(e => console.log(`  - ${e.row}: ${e.error}`)); }
}

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Usage: node importFBAds.js file.csv'); process.exit(1); }
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');
  for (const f of files) { console.log(`Importing ${f}...`); await importFile(f); }
  await mongoose.disconnect();
  console.log('\nDone.');
})();
