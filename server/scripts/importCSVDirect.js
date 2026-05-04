/**
 * Direct CSV import script — bypasses the UI, runs the same logic as the API handler.
 * Usage: node server/scripts/importCSVDirect.js path/to/file1.csv [path/to/file2.csv ...]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
// Built-in CSV parser (no extra deps)
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return obj;
  });
}
function splitCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

const Lead = require('../models/Lead');
const { calculateAuctionPrice } = require('../utils/pricingEngine');
const zipcodes = require('zipcodes');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('No MONGODB_URI'); process.exit(1); }

function milesFromZips(originZip, destinationZip) {
  const o = zipcodes.lookup(String(originZip));
  const d = zipcodes.lookup(String(destinationZip));
  if (!o || !d) return 0;
  const R = 3959, dLat = (d.latitude - o.latitude) * Math.PI / 180, dLon = (d.longitude - o.longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(o.latitude * Math.PI / 180) * Math.cos(d.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const HOME_SIZE_NORM = {
  'studio': 'Studio',
  '1 bedroom': '1 Bedroom', '1bedroom': '1 Bedroom', '1_bedroom': '1 Bedroom',
  '2 bedroom': '2 Bedroom', '2bedroom': '2 Bedroom', '2_bedroom': '2 Bedroom',
  '3 bedroom': '3 Bedroom', '3bedroom': '3 Bedroom', '3_bedroom': '3 Bedroom',
  '4 bedroom': '4 Bedroom', '4bedroom': '4 Bedroom', '4_bedroom': '4 Bedroom',
  '5 bedroom': '5+ Bedroom', '5+bedroom': '5+ Bedroom',
  '4+ bedroom': '4+ Bedroom', '4+bedroom': '4+ Bedroom',
  '4_bedroom': '4 Bedroom',
};

function parseMoveDate(dateStr) {
  // Use noon UTC as cutoff — all dates are stored at noon UTC, so "today noon <= today noon" correctly rejects today.
  const todayNoon = new Date();
  todayNoon.setUTCHours(12, 0, 0, 0);

  if (!dateStr) return null;

  const str = String(dateStr).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + 'T12:00:00.000Z');
    return isNaN(d.getTime()) || d <= todayNoon ? null : d;
  }

  // MM/DD/YYYY or MM/DD/YY
  const slashParts = str.split('/');
  if (slashParts.length === 3) {
    let [month, day, year] = slashParts;
    if (year.length <= 2) year = `20${year.padStart(2, '0')}`; // 26 → 2026
    const d = new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T12:00:00.000Z`);
    return isNaN(d.getTime()) || d <= todayNoon ? null : d;
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  d.setUTCHours(12, 0, 0, 0);
  return d <= todayNoon ? null : d;
}

async function importFile(filePath) {
  const csv = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(csv);

  let imported = 0, skipped = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const customerEmail = (row['Email'] || row['email'] || '').trim().toLowerCase();
      if (!customerEmail) { skipped++; errors.push({ row: 'unknown', error: 'Missing email' }); continue; }

      const existing = await Lead.findOne({ customerEmail });
      if (existing) { skipped++; continue; }

      const rawPhone = (row['Phone'] || row['phone'] || '').replace(/\D/g, '');
      const digits = rawPhone.startsWith('1') && rawPhone.length === 11 ? rawPhone.slice(1) : rawPhone;
      const customerPhone = digits.length === 10 ? `+1${digits}` : null;
      if (!customerPhone) { skipped++; errors.push({ row: customerEmail, error: 'Invalid phone' }); continue; }

      const moveSize = row['Move Size'] || row['move size'] || row['moveSize'] || '';
      const homeSize = HOME_SIZE_NORM[moveSize.toLowerCase().trim()] || '2 Bedroom';

      const originZip = String(row['Origin Zip'] || row['origin zip'] || '').trim();
      const destinationZip = String(row['Destination Zip'] || row['destination zip'] || '').trim();
      const miles = milesFromZips(originZip, destinationZip) || 0;
      const distance = miles > 100 ? 'Long Distance' : 'Local';
      const grade = miles > 500 ? 'A' : miles > 100 ? 'B' : 'C';

      const rawDate = row['Move Date'] || row['move date'] || row['moveDate'] || '';
      const moveDate = parseMoveDate(rawDate);
      if (!moveDate) {
        skipped++;
        errors.push({ row: customerEmail, error: `Bad/past move date: ${rawDate}` });
        continue;
      }

      const pricing = await calculateAuctionPrice({ homeSize, miles, moveDate, grade });

      const firstName = row['First Name'] || row['first name'] || '';
      const lastName = row['Last Name'] || row['last name'] || '';

      const lead = new Lead({
        customerName: `${firstName} ${lastName}`.trim() || 'Unknown',
        customerEmail,
        customerPhone,
        originCity: row['Origin City'] || row['origin city'] || '',
        originState: row['Origin State'] || row['origin state'] || '',
        originZip,
        destinationCity: row['Destination City'] || row['destination city'] || '',
        destinationState: row['Destination State'] || row['destination state'] || '',
        destinationZip,
        homeSize,
        moveDate,
        distance,
        miles,
        grade,
        route: `${row['Origin City'] || ''} → ${row['Destination City'] || ''}`,
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
      console.log(`  ✓ ${customerEmail} | ${moveDate.toISOString().split('T')[0]} | ${homeSize}`);
      imported++;
    } catch (err) {
      const email = row['Email'] || row['email'] || 'unknown';
      errors.push({ row: email, error: err.message });
      skipped++;
    }
  }

  console.log(`\n[${path.basename(filePath)}] Imported: ${imported} | Skipped: ${skipped}`);
  if (errors.length) {
    console.log('Errors:');
    errors.slice(0, 20).forEach(e => console.log(`  - ${e.row}: ${e.error}`));
  }
}

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Usage: node importCSVDirect.js file1.csv [file2.csv]'); process.exit(1); }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  for (const f of files) {
    console.log(`Importing ${f}...`);
    await importFile(f);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
})();
