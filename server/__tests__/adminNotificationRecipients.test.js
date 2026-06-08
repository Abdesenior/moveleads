/**
 * Admin notification recipients — source-pin lock-in (2026-06-08).
 *
 * Both admin email helpers (`sendAdminLeadNotification` and
 * `sendAdminNotification`) deliver to a hardcoded list of recipients.
 * As of 2026-06-08 the list is:
 *
 *   - admin@moveleads.cloud  (original)
 *   - amine@moveleads.cloud  (added per operator request)
 *
 * Both addresses must appear in BOTH function's `to:` array so the
 * complete set of six admin notification types is delivered to both
 * recipients:
 *
 *   sendAdminLeadNotification (twilioService.js)
 *     1. New homeowner lead submitted
 *
 *   sendAdminNotification (billingWebhook.js, billingCredits.js, leads.js)
 *     2. Activation payment received
 *     3. Top-up payment received
 *     4. Stripe refund processed
 *     5. Stripe chargeback opened
 *     6. Lead purchased by a mover
 *
 * Pure-Node, no Mongo, no Resend network. Run:
 *   node server/__tests__/adminNotificationRecipients.test.js
 */

'use strict';

const { test } = require('node:test');
const assert  = require('node:assert/strict');
const fs      = require('node:fs');
const path    = require('node:path');

const emailSrc = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'emailService.js'),
  'utf8'
);

// Pattern: a `to:` field whose value is an array literal containing
// admin@moveleads.cloud first and amine@moveleads.cloud second.
const ARRAY_PATTERN = /to:\s*\[\s*['"]admin@moveleads\.cloud['"]\s*,\s*['"]amine@moveleads\.cloud['"]\s*\]/g;

// Pattern: a `to:` field whose value is a single string literal.
// Catches the old single-recipient shape `to: 'admin@moveleads.cloud'`.
const BARE_STRING_PATTERN = /to:\s*['"]admin@moveleads\.cloud['"]/g;

test('A1. emailService.js contains the two-recipient `to:` array exactly twice (once per admin function)', () => {
  // sendAdminLeadNotification + sendAdminNotification = 2 occurrences.
  const arrayHits = (emailSrc.match(ARRAY_PATTERN) || []).length;
  assert.equal(arrayHits, 2,
    `Expected exactly 2 occurrences of the two-recipient to: array (one per admin function). Got ${arrayHits}.`);
});

test('A2. No bare-string `to: "admin@moveleads.cloud"` remains in the file (regression guard)', () => {
  // The migration replaced both single-string `to:` fields with arrays.
  // If a future change accidentally drops the array (e.g. via a paste
  // mistake), this catches it.
  const stringHits = (emailSrc.match(BARE_STRING_PATTERN) || []).length;
  assert.equal(stringHits, 0,
    `No bare-string admin to: should remain. Got ${stringHits}.`);
});

test('A3. admin@moveleads.cloud appears exactly twice in emailService.js (once per function to: array)', () => {
  const adminHits = (emailSrc.match(/admin@moveleads\.cloud/g) || []).length;
  assert.equal(adminHits, 2,
    `admin@moveleads.cloud should appear in exactly 2 places. Got ${adminHits}.`);
});

test('A4. amine@moveleads.cloud appears exactly twice in emailService.js (once per function to: array)', () => {
  const amineHits = (emailSrc.match(/amine@moveleads\.cloud/g) || []).length;
  assert.equal(amineHits, 2,
    `amine@moveleads.cloud should appear in exactly 2 places. Got ${amineHits}.`);
});
