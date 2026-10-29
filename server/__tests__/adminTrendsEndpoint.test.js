/**
 * Admin trends endpoint — lock-in suite.
 *
 * Pins: admin-gated and read-only; mounted before the generic /api/admin
 * router; revenue and sold counts exclude refunded purchases; the lookup
 * uses the PurchasedLead model's real collection name.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../routes/admin/trends.js'), 'utf8');

test('A1. admin-gated and GET-only', () => {
  assert.match(src, /router\.use\(admin\)/);
  assert.match(src, /router\.get\('\/'/);
  assert.doesNotMatch(src, /router\.(post|put|patch|delete)\(/);
});

test('A2. refunded purchases never count as sold or revenue', () => {
  const refundFilters = src.match(/refunded: \{ \$ne: true \}/g) || [];
  assert.ok(refundFilters.length >= 2, 'both the lead lookup and the sales aggregate must exclude refunds');
});

test('A3. lookup uses the model collection name, not a guessed string', () => {
  assert.match(src, /from: PurchasedLead\.collection\.name/);
});

test('A4. mounted before the generic /api/admin router', () => {
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const mount = server.indexOf("'/api/admin/trends'");
  const generic = server.indexOf("app.use('/api/admin',");
  assert.ok(mount > 0 && mount < generic);
});
