/**
 * Phone verification smoke test — Phase 1 backend capability.
 *
 * Covers what can be verified in-process without a real DB or Twilio call:
 *   A. Schema — User has the four phone-verification-related fields with
 *      the expected defaults.
 *   B. Helper purity — normalizeUSDigits / toE164US / applyPhoneChange /
 *      utcDayKey / cooldownRemainingSec / inspectDailyCounter behave per
 *      the contract.
 *   C. Route shape — the verification router exposes the three endpoints
 *      and protects critical surfaces (no user-supplied `to`, returns
 *      no_phone_on_file when missing, etc.) verified by static source
 *      assertions.
 *   D. Twilio Verify wrapper — returns the SKIPPED shape when env is
 *      absent so callers can fall through to a 503.
 *   E. Phone-change wiring — onboarding.js and users.js PUT call
 *      applyPhoneChange, by static source check.
 *
 * Race/integration concerns (concurrent verifications, real Twilio
 * round-trips, Mongo atomicity) are out of scope; those must be verified
 * in staging.
 *
 * Run with: `node server/__tests__/phoneVerification.test.js`
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.LEAD_VISIBILITY_REPORT_INTERVAL_MS = '0';

// ── A. Schema fields exist with expected defaults ─────────────────────────
{
  const User = require('../models/User');
  const paths = User.schema.paths;

  assert.ok(paths.phoneVerified, 'User schema must define phoneVerified');
  assert.strictEqual(paths.phoneVerified.instance, 'Boolean');
  assert.strictEqual(paths.phoneVerified.defaultValue, false);

  assert.ok(paths.phoneVerifiedAt, 'User schema must define phoneVerifiedAt');
  assert.strictEqual(paths.phoneVerifiedAt.instance, 'Date');

  assert.ok(paths.phoneVerificationLastSentAt, 'User schema must define phoneVerificationLastSentAt');
  assert.strictEqual(paths.phoneVerificationLastSentAt.instance, 'Date');

  // Nested daily counter — confirm the two sub-paths exist
  assert.ok(paths['phoneVerificationSendsToday.dayKey'], 'phoneVerificationSendsToday.dayKey missing');
  assert.ok(paths['phoneVerificationSendsToday.count'],  'phoneVerificationSendsToday.count missing');

  // Fresh doc has expected defaults
  const u = new User({});
  assert.strictEqual(u.phoneVerified, false);
  assert.strictEqual(u.phoneVerifiedAt, null);
  assert.strictEqual(u.phoneVerificationLastSentAt, null);
  assert.strictEqual(u.phoneVerificationSendsToday.count, 0);

  console.log('  ✓ A. User schema has phone verification fields with correct defaults');
}

// ── B. Helper purity ──────────────────────────────────────────────────────
{
  const {
    normalizeUSDigits,
    toE164US,
    applyPhoneChange,
    utcDayKey,
    inspectDailyCounter,
    cooldownRemainingSec,
    COOLDOWN_MS,
    DAILY_SEND_CAP,
  } = require('../utils/phoneVerification');

  // normalizeUSDigits
  assert.strictEqual(normalizeUSDigits('(555) 123-4567'), '5551234567', 'formatted strips correctly');
  assert.strictEqual(normalizeUSDigits('+15551234567'),    '5551234567', 'E.164 strips leading 1');
  assert.strictEqual(normalizeUSDigits('15551234567'),     '5551234567', 'leading 1 dropped');
  assert.strictEqual(normalizeUSDigits('5551234567'),      '5551234567', 'raw digits pass through');
  assert.strictEqual(normalizeUSDigits('555-123-456'),     '555123456',  'short numbers truncated to whatever fits');
  assert.strictEqual(normalizeUSDigits(''),                '',            'empty stays empty');
  assert.strictEqual(normalizeUSDigits(null),              '',            'null -> empty');
  assert.strictEqual(normalizeUSDigits(undefined),         '',            'undefined -> empty');
  assert.strictEqual(normalizeUSDigits(12345),             '',            'non-string -> empty');

  // toE164US
  assert.strictEqual(toE164US('5551234567'),     '+15551234567', '10 digits to E.164');
  assert.strictEqual(toE164US('+15551234567'),   '+15551234567', 'already E.164 normalizes');
  assert.strictEqual(toE164US('(555) 123-4567'), '+15551234567', 'formatted to E.164');
  assert.strictEqual(toE164US('555-123-456'),    null,            '9 digits -> null');
  assert.strictEqual(toE164US(''),               null,            'empty -> null');
  assert.strictEqual(toE164US(null),             null,            'null -> null');

  // applyPhoneChange: empty new -> no patch
  assert.deepStrictEqual(applyPhoneChange('5551234567', ''),        {}, 'empty new = no patch');
  assert.deepStrictEqual(applyPhoneChange('5551234567', null),      {}, 'null new = no patch');
  assert.deepStrictEqual(applyPhoneChange('5551234567', undefined), {}, 'undefined new = no patch');

  // applyPhoneChange: same -> no patch (idempotent re-save protects verification)
  assert.deepStrictEqual(applyPhoneChange('5551234567', '5551234567'), {}, 'same value = no patch');

  // applyPhoneChange: different -> reset verification
  assert.deepStrictEqual(
    applyPhoneChange('5551234567', '5559876543'),
    { phone: '5559876543', phoneVerified: false, phoneVerifiedAt: null },
    'phone change resets verification'
  );

  // applyPhoneChange: no prior phone -> sets new without reset (technically still
  // a "change" since phoneVerified defaults to false for new users anyway)
  assert.deepStrictEqual(
    applyPhoneChange(null, '5551234567'),
    { phone: '5551234567', phoneVerified: false, phoneVerifiedAt: null },
    'first phone assignment still emits patch'
  );

  // utcDayKey
  const dec31 = new Date('2026-12-31T23:59:59Z');
  const jan1  = new Date('2027-01-01T00:00:00Z');
  assert.strictEqual(utcDayKey(dec31), '2026-12-31', 'UTC day key end-of-year');
  assert.strictEqual(utcDayKey(jan1),  '2027-01-01', 'rollover at UTC midnight');

  // cooldownRemainingSec
  const now = new Date('2026-05-17T12:00:00Z');
  assert.strictEqual(cooldownRemainingSec({ phoneVerificationLastSentAt: null }, now), 0, 'no prior send -> 0');
  assert.strictEqual(
    cooldownRemainingSec({ phoneVerificationLastSentAt: new Date(now.getTime() - 70_000) }, now),
    0,
    '>60s since last send -> 0'
  );
  const partial = cooldownRemainingSec(
    { phoneVerificationLastSentAt: new Date(now.getTime() - 25_000) },
    now
  );
  assert.ok(partial >= 34 && partial <= 36, `mid-cooldown ~35s remaining, got ${partial}`);

  // inspectDailyCounter
  const today = utcDayKey(now);
  assert.deepStrictEqual(
    inspectDailyCounter({ phoneVerificationSendsToday: { dayKey: today, count: 3 } }, now),
    { today, count: 3, atCap: false, cap: DAILY_SEND_CAP }
  );
  assert.deepStrictEqual(
    inspectDailyCounter({ phoneVerificationSendsToday: { dayKey: '2026-05-16', count: 99 } }, now),
    { today, count: 0, atCap: false, cap: DAILY_SEND_CAP },
    'stale dayKey resets count to 0'
  );
  assert.strictEqual(
    inspectDailyCounter({ phoneVerificationSendsToday: { dayKey: today, count: DAILY_SEND_CAP } }, now).atCap,
    true,
    'at cap = true at exact threshold'
  );

  // Cap constant sanity
  assert.strictEqual(COOLDOWN_MS, 60_000);
  assert.strictEqual(DAILY_SEND_CAP, 10);

  console.log('  ✓ B. Helper purity (normalizeUSDigits, toE164US, applyPhoneChange, counter, cooldown)');
}

// ── C. Route shape — static source assertions ─────────────────────────────
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'phoneVerification.js'), 'utf8');

  // All three endpoints are defined
  assert.ok(/router\.post\(['"]\/send-verification['"]/.test(src),  'POST /send-verification missing');
  assert.ok(/router\.post\(['"]\/verify-code['"]/.test(src),        'POST /verify-code missing');
  assert.ok(/router\.get\(['"]\/status['"]/.test(src),              'GET /status missing');

  // Critical safety: `to` is always derived from user.phone — never user-supplied.
  // i.e. there must be no `req.body.phone` read in the verification path.
  assert.ok(!/req\.body\.phone/.test(src),
    'route must NOT read req.body.phone — to-address is always req.user.phone');

  // Sends route enforces cooldown + daily cap before calling Twilio
  const sendBlock = src.slice(src.indexOf("'/send-verification'"), src.indexOf("'/verify-code'"));
  assert.ok(/cooldownRemainingSec/.test(sendBlock),  'send must check cooldown before Twilio call');
  assert.ok(/inspectDailyCounter/.test(sendBlock),  'send must check daily counter before Twilio call');
  assert.ok(/phone:\s*user\.phone[\s\S]*phoneVerified:\s*true/.test(sendBlock),
    'send must check uniqueness on phone + verified');

  // Verify route flips state ONLY on 'approved' AND re-checks uniqueness
  const verifyBlock = src.slice(src.indexOf("'/verify-code'"), src.indexOf("'/status'"));
  assert.ok(/result\.status === 'approved'/.test(verifyBlock), 'verify must gate state change on approved');
  assert.ok(/phoneVerified:\s*true/.test(verifyBlock),         'verify must set phoneVerified=true');
  assert.ok(/phoneVerifiedAt:\s*now/.test(verifyBlock),        'verify must set phoneVerifiedAt');
  // Re-check uniqueness inside the success branch (race window protection)
  const approvedSection = verifyBlock.slice(verifyBlock.indexOf("'approved'"));
  assert.ok(/findOne[\s\S]*phoneVerified:\s*true/.test(approvedSection),
    'verify must re-check uniqueness inside approved branch (race protection)');

  // Rate limiters present
  assert.ok(/sendLimiter\s*=\s*rateLimit/.test(src),    'send rate limiter missing');
  assert.ok(/verifyLimiter\s*=\s*rateLimit/.test(src),  'verify rate limiter missing');

  console.log('  ✓ C. Route shape: 3 endpoints, no user-supplied `to`, cooldown+cap+uniqueness, race re-check');
}

// ── D. Twilio Verify wrapper — graceful skip when unconfigured ────────────
{
  // Save and clear env so the wrapper sees "unconfigured"
  const savedSid   = process.env.TWILIO_ACCOUNT_SID;
  const savedToken = process.env.TWILIO_AUTH_TOKEN;
  const savedVerify = process.env.TWILIO_VERIFY_SID;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_VERIFY_SID;

  // Bust the require cache so the module re-evaluates with the cleared env
  delete require.cache[require.resolve('../services/twilioVerifyService')];
  const { isVerifyConfigured, sendVerification, checkVerification, describeVerifyConfig } = require('../services/twilioVerifyService');

  assert.strictEqual(isVerifyConfigured(), false, 'unconfigured when env vars absent');

  // describeVerifyConfig returns SID prefixes safely (no auth token)
  const cfg = describeVerifyConfig();
  assert.strictEqual(cfg.configured, false, 'describeVerifyConfig.configured=false when unconfigured');
  assert.strictEqual(cfg.accountSidPrefix, '<missing>', 'missing accountSid prefix');
  assert.strictEqual(cfg.verifySidPrefix,  '<missing>', 'missing verifySid prefix');
  // describeVerifyConfig must NEVER leak the auth token in its output
  assert.ok(!('authToken' in cfg), 'describeVerifyConfig must not expose authToken');

  (async () => {
    const sendRes = await sendVerification('+15551234567');
    assert.strictEqual(sendRes.ok, false, 'sendVerification ok=false when unconfigured');
    assert.strictEqual(sendRes.skipped, true, 'skipped=true');
    assert.strictEqual(sendRes.reason, 'verify_service_unavailable');

    const checkRes = await checkVerification('+15551234567', '123456');
    assert.strictEqual(checkRes.ok, false, 'checkVerification ok=false when unconfigured');
    assert.strictEqual(checkRes.skipped, true);

    console.log('  ✓ D. Twilio Verify wrapper returns SKIPPED shape when env absent');

    // Restore env
    if (savedSid) process.env.TWILIO_ACCOUNT_SID = savedSid;
    if (savedToken) process.env.TWILIO_AUTH_TOKEN = savedToken;
    if (savedVerify) process.env.TWILIO_VERIFY_SID = savedVerify;
  })();
}

// ── G. Block-error mapping — 60238 and family map to clean error code ─────
//
// Static source assertions: the normalizeError function in
// twilioVerifyService.js maps Twilio fraud-block codes to a clean
// `verification_blocked_by_twilio` error string rather than `unknown`.
// The route file then surfaces this with HTTP 422 + operator hint.
{
  const fs = require('fs');
  const path = require('path');
  const verifySrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'twilioVerifyService.js'), 'utf8');
  const routeSrc  = fs.readFileSync(path.join(__dirname, '..', 'routes', 'phoneVerification.js'), 'utf8');

  // 60238 must be mapped to verification_blocked_by_twilio in the wrapper
  assert.ok(/code === 60238/.test(verifySrc),
    'twilioVerifyService must explicitly handle Twilio code 60238');
  assert.ok(/verification_blocked_by_twilio/.test(verifySrc),
    'twilioVerifyService must emit verification_blocked_by_twilio error string');

  // 20003 / 20404 auth errors mapped cleanly so wrong-SID is distinguishable
  assert.ok(/code === 20003 \|\| code === 20404/.test(verifySrc),
    'twilioVerifyService must map auth-error codes (20003/20404)');
  assert.ok(/verify_auth_error/.test(verifySrc),
    'twilioVerifyService must emit verify_auth_error string');

  // Route surfaces verification_blocked_by_twilio with 422 + operator hint
  assert.ok(/'verification_blocked_by_twilio'/.test(routeSrc),
    'route must handle verification_blocked_by_twilio');
  assert.ok(/status\(422\)/.test(routeSrc),
    'blocked-by-twilio returns 422 status');

  // Diagnostic log emits PII-safe fingerprint (country prefix + last 2)
  assert.ok(/phoneFingerprint/.test(routeSrc),
    'route must compute a PII-safe phoneFingerprint for logs');
  assert.ok(/console\.warn[\s\S]*phone=\$\{phoneFingerprint\}/.test(routeSrc),
    'route must log failure with phoneFingerprint, not raw phone');
  // Diagnostic log must NOT include the raw E.164
  assert.ok(!/console\.warn[\s\S]*\$\{e164\}/.test(routeSrc.split('console.warn')[1] || ''),
    'route must not log raw e164 in failure log');

  console.log('  ✓ G. Block-error mapping (60238 family) + PII-safe logging');
}

// ── E. Phone-change wiring — onboarding.js + users.js PUT ─────────────────
{
  const onboardingSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'onboarding.js'), 'utf8');
  const usersSrc      = fs.readFileSync(path.join(__dirname, '..', 'routes', 'users.js'), 'utf8');

  // onboarding.js step 3 calls applyPhoneChange
  assert.ok(/require\(['"]\.\.\/utils\/phoneVerification['"]\)/.test(onboardingSrc),
    'onboarding.js must import phoneVerification helper');
  assert.ok(/applyPhoneChange\s*\(/.test(onboardingSrc),
    'onboarding.js must call applyPhoneChange');

  // users.js PUT calls applyPhoneChange
  assert.ok(/require\(['"]\.\.\/utils\/phoneVerification['"]\)/.test(usersSrc),
    'users.js must import phoneVerification helper');
  assert.ok(/applyPhoneChange\s*\(\s*user\.phone/.test(usersSrc),
    'users.js PUT must call applyPhoneChange against existing user.phone');

  // users.js strips phoneVerified from req.body
  assert.ok(/phoneVerified,[\s\S]*?phoneVerifiedAt/.test(usersSrc),
    'users.js must strip phoneVerified + phoneVerifiedAt from request body');

  console.log('  ✓ E. Phone-change wiring present in onboarding.js + users.js PUT');
}

// ── F. Server mounts verification router before /api/users ────────────────
{
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const phoneMountIdx = serverSrc.indexOf("'/api/users/me/phone'");
  const usersMountIdx = serverSrc.indexOf("'/api/users'");
  assert.ok(phoneMountIdx > -1, 'phoneVerification router must be mounted');
  assert.ok(phoneMountIdx < usersMountIdx,
    '/api/users/me/phone must be mounted BEFORE generic /api/users so specific path wins');
  // Behind verifiedGate
  const mountLine = serverSrc.slice(phoneMountIdx - 50, phoneMountIdx + 100);
  assert.ok(/verifiedGate/.test(mountLine),
    'phoneVerification router must be mounted behind verifiedGate');

  console.log('  ✓ F. Router mounted before /api/users, behind verifiedGate');
}

console.log('\nAll phoneVerification Phase 1 smoke tests passed.');
