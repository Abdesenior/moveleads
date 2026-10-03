/**
 * Twilio webhooks fail closed in production when TWILIO_AUTH_TOKEN is
 * missing (launch-readiness A2). Without the token, signature checks were
 * skipped, so a forged inbound SMS could reach the claim handler.
 *
 * Run: node --test server/__tests__/twilioWebhookFailClosed.test.js
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const ROUTES = path.join(__dirname, '..', 'routes');

test('source: both webhook guards reject in production without a token', () => {
  for (const file of ['twilio.js', 'voice.js']) {
    const src = fs.readFileSync(path.join(ROUTES, file), 'utf8');
    assert.match(src, /if \(!process\.env\.TWILIO_AUTH_TOKEN\) \{\s*\n[\s\S]*?NODE_ENV === 'production'[\s\S]*?status\(403\)/, file);
    assert.doesNotMatch(src, /if \(!process\.env\.TWILIO_AUTH_TOKEN\) return next\(\);/, file);
  }
});

test('behaviour: inbound SMS webhook returns 403 in production with no token', async () => {
  const saved = { env: process.env.NODE_ENV, token: process.env.TWILIO_AUTH_TOKEN };
  process.env.NODE_ENV = 'production';
  delete process.env.TWILIO_AUTH_TOKEN;
  try {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use('/api/twilio', require('../routes/twilio'));
    const server = app.listen(0);
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/twilio/sms/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'From=%2B15555550100&Body=SEND+ABC123',
    });
    server.close();
    assert.equal(res.status, 403);
  } finally {
    process.env.NODE_ENV = saved.env;
    if (saved.token !== undefined) process.env.TWILIO_AUTH_TOKEN = saved.token;
  }
});
