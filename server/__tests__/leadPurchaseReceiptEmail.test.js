/**
 * Lead Purchase Receipt Email — source-pin lock-in (2026-06-07).
 *
 * Activation purchases send receipts (sendActivationReceiptEmail), top-ups
 * send receipts (sendTopupReceiptEmail), but lead purchases historically
 * did not. A mover spent $25-$150 and saw only a client-side modal — no
 * paper trail in their inbox. Closing that gap to reduce "did I really
 * buy that?" support tickets and to give the mover something to reference
 * when reconciling expenses.
 *
 * Both purchase paths now fire the email:
 *   - Dashboard buy-now    (routes/bids.js)        channel: 'dashboard'
 *   - SMS Claim winner     (routes/twilio.js)      channel: 'sms_claim'
 *
 * What this suite locks in:
 *
 *   A. emailService exports sendLeadPurchaseReceiptEmail.
 *
 *   B. The template includes every field the operator asked for:
 *      Lead ID, Purchase timestamp, Amount charged, Remaining balance,
 *      Pickup city/state, Delivery city/state, Company name, Support
 *      contact (REPLY_TO).
 *
 *   C. routes/bids.js imports sendLeadPurchaseReceiptEmail and calls it
 *      with channel: 'dashboard'.
 *
 *   D. routes/twilio.js imports sendLeadPurchaseReceiptEmail and calls
 *      it from the winner branch with channel: 'sms_claim'.
 *
 *   E. Both call sites are fire-and-forget (.catch logs but does not
 *      throw) — a Resend outage must not break the buy-now response
 *      or the TwiML claim confirmation.
 *
 *   F. The user object pulled for the SMS Claim path includes email +
 *      companyName so the winner branch doesn't need a second DB
 *      round-trip.
 *
 * Pure-Node, no Mongo, no Resend network calls. Run:
 *   node server/__tests__/leadPurchaseReceiptEmail.test.js
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const emailSrc = fs.readFileSync(path.join(repoRoot, 'server', 'services', 'emailService.js'), 'utf8');
const bidsSrc  = fs.readFileSync(path.join(repoRoot, 'server', 'routes', 'bids.js'),         'utf8');
const twilSrc  = fs.readFileSync(path.join(repoRoot, 'server', 'routes', 'twilio.js'),       'utf8');

// ── A. Export surface

test('A1. emailService exports sendLeadPurchaseReceiptEmail', () => {
  const svc = require('../services/emailService');
  assert.equal(typeof svc.sendLeadPurchaseReceiptEmail, 'function');
});

test('A2. sendLeadPurchaseReceiptEmail is listed in module.exports', () => {
  assert.match(emailSrc, /sendLeadPurchaseReceiptEmail\s*,?\s*\n?\s*[}]/);
});

// ── B. Template content — every operator-requested field

test('B1. Template body references the Lead ID', () => {
  // The template renders ${leadId}, computed from lead._id || lead.id, and
  // labels it as "Lead ID" in the receipt panel.
  assert.match(emailSrc, /Lead ID/);
  assert.match(emailSrc, /\$\{leadId\}/);
});

test('B2. Template body references the purchase timestamp', () => {
  assert.match(emailSrc, /Purchased/);
  assert.match(emailSrc, /\$\{purchasedStr\}/);
});

test('B3. Template body references the amount charged', () => {
  assert.match(emailSrc, /Amount charged/);
  assert.match(emailSrc, /\$\{amt\.toFixed\(2\)\}/);
});

test('B4. Template body references the remaining balance', () => {
  assert.match(emailSrc, /Remaining balance/);
  assert.match(emailSrc, /\$\{bal\.toFixed\(2\)\}/);
});

test('B5. Template body renders pickup city/state', () => {
  assert.match(emailSrc, /pickupLine/);
  assert.match(emailSrc, /originCity/);
  assert.match(emailSrc, /originState/);
});

test('B6. Template body renders delivery city/state', () => {
  assert.match(emailSrc, /deliveryLine/);
  assert.match(emailSrc, /destinationCity/);
  assert.match(emailSrc, /destinationState/);
});

test('B7. Template renders the mover company name', () => {
  assert.match(emailSrc, /user\.companyName/);
});

test('B8. Template surfaces the support email address (REPLY_TO)', () => {
  // The receipt closes with "contact support@... " — REPLY_TO is the
  // existing single source of truth for the support reply-to address.
  assert.match(emailSrc, /supportEmail\s*=\s*REPLY_TO/);
  assert.match(emailSrc, /\$\{supportEmail\}/);
});

test('B9. Channel discriminator (Dashboard Buy-Now vs SMS Claim) renders in the subject and body', () => {
  // channelLabel is the mover-facing variant; operator should see it in
  // the receipt heading and the subject line stamp.
  assert.match(emailSrc, /SMS Claim/);
  assert.match(emailSrc, /Dashboard Buy-Now/);
  assert.match(emailSrc, /channelLabel/);
});

// ── C. routes/bids.js wires the email

test('C1. bids.js imports sendLeadPurchaseReceiptEmail', () => {
  assert.match(bidsSrc, /require\(['"]\.\.\/services\/emailService['"]\)/);
  assert.match(bidsSrc, /sendLeadPurchaseReceiptEmail/);
});

test('C2. bids.js calls sendLeadPurchaseReceiptEmail with channel: "dashboard"', () => {
  assert.match(bidsSrc, /channel:\s*['"]dashboard['"]/);
});

test('C3. bids.js fires the receipt email fire-and-forget (.catch on the promise chain)', () => {
  // Source-scan the buy-now handler: after broadcastLeadSold, the receipt
  // call chains a .catch. No await — a Resend outage must not throw
  // out of the route.
  const buyNowBlock = bidsSrc.split("router.post('/:leadId/buy-now'")[1].split("router.post('/:leadId/settle'")[0];
  assert.match(buyNowBlock, /sendLeadPurchaseReceiptEmail/);
  // Don't allow `await sendLeadPurchaseReceiptEmail(` inside the buy-now
  // handler — that would block the success response on the email send.
  assert.doesNotMatch(buyNowBlock, /await\s+sendLeadPurchaseReceiptEmail/);
  // Must have a .catch on the chain so failures are logged not thrown.
  assert.match(buyNowBlock, /sendLeadPurchaseReceiptEmail[\s\S]{0,400}\.catch\(/);
});

// ── D. routes/twilio.js wires the email

test('D1. twilio.js imports sendLeadPurchaseReceiptEmail', () => {
  assert.match(twilSrc, /require\(['"]\.\.\/services\/emailService['"]\)/);
  assert.match(twilSrc, /sendLeadPurchaseReceiptEmail/);
});

test('D2. twilio.js calls sendLeadPurchaseReceiptEmail with channel: "sms_claim"', () => {
  assert.match(twilSrc, /channel:\s*['"]sms_claim['"]/);
});

test('D3. twilio.js fires the receipt email fire-and-forget (.catch, no await)', () => {
  // Source-scan: the winner branch must not await the email — it would
  // block the TwiML response. Must have a .catch for non-fatal logging.
  assert.doesNotMatch(twilSrc, /await\s+sendLeadPurchaseReceiptEmail/);
  assert.match(twilSrc, /sendLeadPurchaseReceiptEmail\([\s\S]{0,800}\.catch\(/);
});

// ── E. SMS Claim user lookup includes the fields the receipt needs

test('E1. twilio.js inbound user .select() includes email + companyName', () => {
  // The receipt email reads user.email and user.companyName. The select
  // at the top of the SMS handler used to only pull
  // _id/phone/isSuspended/smsOptOut/phoneVerified. The receipt fix
  // extends it so we don't need a second DB hit per claim.
  assert.match(twilSrc, /\.select\(['"][^'"]*\bemail\b[^'"]*\bcompanyName\b[^'"]*['"]\)/);
});

test('E2. SMS Claim receipt uses post-debit balance (no extra round-trip)', () => {
  // The conditional-debit CAS upstream returns `debited` with the
  // post-debit balance. Receipt call must use `debited.balance` rather
  // than re-querying.
  assert.match(twilSrc, /balanceAfter:\s*debited\.balance/);
});
