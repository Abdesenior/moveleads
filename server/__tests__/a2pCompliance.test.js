/**
 * A2P 10DLC compliance — source-pin lock-in (2026-06-11).
 *
 * Twilio A2P campaign review requires: a publicly-visible opt-in flow,
 * non-pre-checked consent, full program disclosures (use cases, frequency,
 * rates, STOP/HELP), consistent legal-entity identity, and a consent
 * audit trail. This suite pins each requirement to the source so a future
 * copy edit or refactor can't silently break carrier compliance.
 *
 * Layers covered:
 *   A. User model — smsConsent / smsConsentAt / smsConsentIp fields
 *   B. Register handler — strict-boolean consent + trio storage
 *   C. Register UI — unchecked checkbox, consent language, policy links
 *   D. Privacy + Terms pages — SMS program sections + LLC identity
 *   E. /sms-consent public page — route + required disclosures
 *
 * Pure-Node, no Mongo, no network. Run:
 *   node server/__tests__/a2pCompliance.test.js
 */

'use strict';

const { test } = require('node:test');
const assert  = require('node:assert/strict');
const fs      = require('node:fs');
const path    = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');

const userSrc     = read('server/models/User.js');
const authSrc     = read('server/routes/auth.js');
const registerSrc = read('client/src/pages/Register.jsx');
const privacySrc  = read('client/src/pages/Privacy.jsx');
const termsSrc    = read('client/src/pages/Terms.jsx');
const contactSrc  = read('client/src/pages/Contact.jsx');
const consentSrc  = read('client/src/pages/SmsConsent.jsx');
const appSrc      = read('client/src/App.jsx');

// ── A. User model fields ─────────────────────────────────────────────────

test('A1. User schema defines smsConsent (Boolean, default false)', () => {
  assert.match(userSrc, /smsConsent:\s*\{\s*type:\s*Boolean,\s*default:\s*false\s*\}/);
});

test('A2. User schema defines smsConsentAt (Date, default null)', () => {
  assert.match(userSrc, /smsConsentAt:\s*\{\s*type:\s*Date,\s*default:\s*null\s*\}/);
});

test('A3. User schema defines smsConsentIp (String)', () => {
  assert.match(userSrc, /smsConsentIp:\s*\{\s*type:\s*String/);
});

// ── B. Register handler stores the consent trio ──────────────────────────

test('B1. Register handler does a strict-boolean consent check', () => {
  // `=== true` (not truthy) so a scripted POST with "false"/"yes"/1
  // cannot record consent.
  assert.match(authSrc, /req\.body\.smsConsent\s*===\s*true/);
});

test('B2. Register handler stores smsConsentAt only on opt-in', () => {
  assert.match(authSrc, /smsConsentAt:\s*smsConsent\s*\?\s*new Date\(\)\s*:\s*null/);
});

test('B3. Register handler stores the client IP only on opt-in', () => {
  assert.match(authSrc, /smsConsentIp:\s*smsConsent\s*\?\s*\(req\.ip/);
});

// ── C. Register UI ───────────────────────────────────────────────────────

test('C1. Consent checkbox starts UNCHECKED (smsConsent: false in initial state)', () => {
  assert.match(registerSrc, /smsConsent:\s*false/);
});

test('C2. Register shows the consent language with all required disclosures', () => {
  assert.match(registerSrc, /I agree to receive SMS from MoveLeads LLC/);
  assert.match(registerSrc, /Msg frequency varies/);
  assert.match(registerSrc, /Msg &amp; data rates may apply/);
  assert.match(registerSrc, /Reply STOP to opt out or HELP for help/);
  assert.match(registerSrc, /Consent not required to purchase/);
});

test('C3. Register links to Terms and Privacy below the checkbox', () => {
  assert.match(registerSrc, /to="\/terms"/);
  assert.match(registerSrc, /to="\/privacy"/);
});

test('C4. Phone helper text describes the SMS use cases', () => {
  assert.match(registerSrc, /Used for verification, lead alerts, and account updates/);
});

test('C5. SMS consent checkbox is REQUIRED to continue registration', () => {
  // Native constraint validation on the step-1 form blocks "Continue"
  // until the box is checked, so a registered user always has a consent
  // record. The `required` attribute must live on the smsConsent input.
  assert.match(registerSrc, /name="smsConsent"[\s\S]{0,300}?\brequired\b/);
});

// ── D. Privacy + Terms pages ─────────────────────────────────────────────

test('D1. Privacy policy has an SMS program section with all carrier disclosures', () => {
  assert.match(privacySrc, /SMS \/ Text Messaging Program/);
  assert.match(privacySrc, /never sold, rented, or shared with third parties for marketing purposes/);
  assert.match(privacySrc, /Message frequency varies/);
  assert.match(privacySrc, /Message and data rates may apply/);
  assert.match(privacySrc, /Reply \*\*STOP\*\*/);
  assert.match(privacySrc, /Reply \*\*HELP\*\*/);
});

test('D2. Privacy policy names MoveLeads LLC / Wyoming (no more Inc/Austin)', () => {
  assert.match(privacySrc, /MoveLeads LLC/);
  assert.match(privacySrc, /Wyoming/);
  assert.doesNotMatch(privacySrc, /MoveLeads, Inc\./);
});

test('D3. Terms has an SMS terms section with STOP/HELP + frequency + rates', () => {
  assert.match(termsSrc, /SMS \/ Text Messaging Terms/);
  assert.match(termsSrc, /Message frequency varies/);
  assert.match(termsSrc, /Message and data rates may apply/);
  assert.match(termsSrc, /\*\*STOP\*\*/);
  assert.match(termsSrc, /\*\*HELP\*\*/);
  assert.match(termsSrc, /never sold, rented, or shared/);
});

test('D4. Terms names MoveLeads LLC registered in Wyoming', () => {
  assert.match(termsSrc, /MoveLeads LLC/);
  assert.match(termsSrc, /Wyoming/);
});

test('D5. Contact page shows the legal entity', () => {
  assert.match(contactSrc, /MoveLeads LLC/);
  assert.match(contactSrc, /Wyoming/);
});

// ── E. /sms-consent public page ──────────────────────────────────────────

test('E1. /sms-consent route is registered WITHOUT ProtectedRoute (public)', () => {
  assert.match(appSrc, /path="\/sms-consent"\s+element=\{<SmsConsent \/>\}/);
});

test('E2. SmsConsent page contains the full opt-in demonstration', () => {
  // Phone field + checkbox + consent text
  assert.match(consentSrc, /type="tel"/);
  assert.match(consentSrc, /type="checkbox"/);
  assert.match(consentSrc, /I agree to receive SMS messages from MoveLeads/);
});

test('E3. SmsConsent page has all program disclosures', () => {
  assert.match(consentSrc, /Message frequency varies/);
  assert.match(consentSrc, /Message and data rates may apply/);
  assert.match(consentSrc, /Reply STOP/);
  assert.match(consentSrc, /Reply HELP/);
  assert.match(consentSrc, /never sold, rented, or shared/);
});

test('E4. SmsConsent page links to Terms + Privacy and names the company', () => {
  assert.match(consentSrc, /to="\/terms"/);
  assert.match(consentSrc, /to="\/privacy"/);
  assert.match(consentSrc, /MoveLeads LLC/);
  assert.match(consentSrc, /Wyoming/);
  assert.match(consentSrc, /support@moveleads\.cloud/);
});
