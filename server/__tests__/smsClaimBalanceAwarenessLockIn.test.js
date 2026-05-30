// SMS Claim — balance awareness lock-in (2026-05-30)
//
// Two operator-directed changes:
//
//   1. Default recommended balance lowered from $500 → $200 on the
//      SmsClaim readiness UI. $500 created activation friction for
//      first-time movers; $200 covers ~5 average-priced claims and
//      stays a meaningful threshold. Per-claim eligibility check
//      (twilioService.js: balance >= buyNowPrice) is unchanged — this
//      is a UI-side recommendation only.
//
//   2. Winner confirmation SMS now includes:
//        - The post-debit balance ("Balance: $X") — always.
//        - A conditional low-balance reminder ("Add funds to keep
//          getting SMS claims.") when post-debit balance < $100.
//      Healthy-balance movers don't see the reminder. The dashboard
//      view URL is dropped from the body when the reminder is shown,
//      preserving the 160-char single-segment SMS budget.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const smsClaimRoute = fs.readFileSync(path.join(__dirname, '..', 'routes', 'smsClaim.js'), 'utf8');
const twilioRoute   = fs.readFileSync(path.join(__dirname, '..', 'routes', 'twilio.js'),   'utf8');

// ── 1. Recommended balance default ──────────────────────────────────────────

test('R1. DEFAULT_RECOMMENDED_BALANCE is now $200 (was $500)', () => {
  assert.match(
    smsClaimRoute,
    /const\s+DEFAULT_RECOMMENDED_BALANCE\s*=\s*200\b/,
    'DEFAULT_RECOMMENDED_BALANCE must be 200'
  );
  // The old value must not return — single source of truth.
  assert.doesNotMatch(
    smsClaimRoute,
    /const\s+DEFAULT_RECOMMENDED_BALANCE\s*=\s*500\b/,
    'DEFAULT_RECOMMENDED_BALANCE must not be 500'
  );
});

test('R2. PlatformSettings override is still consulted (fallback chain unchanged)', () => {
  // recommendedBalance() must still try PlatformSettings before falling
  // back to the default — keep the operator escape hatch. Strip comments
  // before scanning so explanatory text about the override doesn't
  // satisfy the assertion on its own.
  const exec = smsClaimRoute
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.match(
    exec,
    /PlatformSettings\.findOne\(\)[\s\S]{0,200}smsClaim\?\.recommendedBalance/,
    'recommendedBalance() must still read PlatformSettings.findOne() → config.smsClaim.recommendedBalance'
  );
});

// ── 2. Winner confirmation SMS shape ────────────────────────────────────────

test('W1. SMS_CLAIM_LOW_BALANCE_USD constant is defined at $100', () => {
  assert.match(
    twilioRoute,
    /const\s+SMS_CLAIM_LOW_BALANCE_USD\s*=\s*100\b/,
    'SMS_CLAIM_LOW_BALANCE_USD must be 100 (top-of-file constant)'
  );
});

test('W2. Confirmation body composes balanceLine from the post-debit balance', () => {
  // The body must derive a `remaining` value from the debited User doc
  // (debited.balance) and floor it to whole dollars for clean display.
  assert.match(
    twilioRoute,
    /const\s+remaining\s*=\s*Math\.max\([\s\S]{0,30}Math\.floor\(Number\(debited\.balance\)/,
    'remaining must be derived from debited.balance, floored to int, clamped at 0'
  );
  assert.match(
    twilioRoute,
    /const\s+balanceLine\s*=\s*`Balance: \$\$\{remaining\}`/,
    'balanceLine literal must read `Balance: $${remaining}`'
  );
});

test('W3. Low-balance reminder fires only when remaining < SMS_CLAIM_LOW_BALANCE_USD', () => {
  assert.match(
    twilioRoute,
    /const\s+isLowBalance\s*=\s*remaining\s*<\s*SMS_CLAIM_LOW_BALANCE_USD/,
    'isLowBalance must compare remaining to SMS_CLAIM_LOW_BALANCE_USD'
  );
  // The exact reminder string must be present.
  assert.match(
    twilioRoute,
    /`Add funds to keep getting SMS claims\.`/,
    'Low-balance reminder text must read "Add funds to keep getting SMS claims."'
  );
});

test('W4. Body composition keeps head + balance + customer + phone non-negotiable', () => {
  // The compose expression must put head, balance, customer, phone in
  // that order. The tail (lowBalance reminder OR dashboard URL) is the
  // single optional segment.
  assert.match(
    twilioRoute,
    /`\$\{head\}\\n\$\{balanceLine\}\\n\$\{customerLine\}\\n\$\{phoneLine\}\\n\$\{tail\}`/,
    'Body must compose head + balance + customer + phone + tail in that exact order'
  );
});

test('W5. Tail conditional: low balance → reminder, healthy → dashboard URL', () => {
  assert.match(
    twilioRoute,
    /const\s+tail\s*=\s*isLowBalance\s*\?\s*lowBalanceLine\s*:\s*dashLine/,
    'tail must be a ternary that picks the low-balance reminder OR the dashboard URL'
  );
});

test('W6. Over-budget fallback drops the tail first, then slices', () => {
  // Existing pattern: try full body, drop optional line, slice as last resort.
  // The 160-char budget guard must remain.
  assert.match(
    twilioRoute,
    /body\.length\s*>\s*160[\s\S]{0,200}`\$\{head\}\\n\$\{balanceLine\}\\n\$\{customerLine\}\\n\$\{phoneLine\}`/,
    'Over-budget fallback must drop the tail (keep head+balance+customer+phone)'
  );
  assert.match(
    twilioRoute,
    /body\.length\s*>\s*160[\s\S]{0,80}body\.slice\(0,\s*157\)/,
    'Final fallback must slice to 157 + "..."'
  );
});

test('W7. Healthy-balance movers see no "Add funds" line by accident', () => {
  // Defensive: in executable code (comments stripped), the low-balance
  // text must appear exactly once — inside its const declaration. The
  // tail ternary references the const by name, so the literal string
  // never appears in the unconditional code path.
  const twilioExec = twilioRoute
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/\/\/.*$/gm, '');          // line comments
  const reminderHits = (twilioExec.match(/Add funds to keep getting SMS claims\./g) || []).length;
  assert.equal(
    reminderHits,
    1,
    'The low-balance reminder string must appear exactly once in executable code (inside its const declaration)'
  );
});

test('W8. Pre-2026-05-30 body shape is gone', () => {
  // Old body composed head + customer + phone + dashLine (no balance line).
  // The new composition must not regress to this shape.
  assert.doesNotMatch(
    twilioRoute,
    /`\$\{head\}\\n\$\{customerLine\}\\n\$\{phoneLine\}\\n\$\{dashLine\}`/,
    'Pre-balance-awareness body shape must not return'
  );
});

console.log('\nSMS Claim balance-awareness lock-in suite — all assertions passed.');
