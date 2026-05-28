// PATCH /api/users/me/dispatch-hours — mover's dispatch-window editor.
//
// Single-purpose endpoint that writes the four onboarding.answers fields
// the SMS dispatch path already reads via dispatchPolicy.isWithinDispatchHours:
//
//   onboarding.answers.dispatchHoursMode   'default' | null
//   onboarding.answers.dispatchHoursOpen   'HH:MM'
//   onboarding.answers.dispatchHoursClose  'HH:MM'
//   onboarding.answers.dispatchDays        ['mon','tue',...]
//
// Why dedicated:
//   - Tight, validated scope. No coupling to the unified PUT /users/:id
//     service-area handler.
//   - Mirrors the /api/users/me/phone/* and /api/users/me/sms-claim
//     structure: per-feature endpoints for per-feature concerns.
//   - Lock-in tests can pin the validator behavior directly without
//     spinning up the full users route.
//
// What this does NOT touch:
//   - The matcher (leadMatching.js, dispatchPolicy.js)
//   - The broadcasters (twilioService, emailService)
//   - The matcher diagnosis (matcherDiagnosis.js) — still reads the
//     same fields and reports OUTSIDE_HOURS_SMS as before
//   - Timezone handling — explicitly UTC for v1, future PR-C2b adds TZ
//   - The 'advanced' per-day dispatchHours schema field — left dormant,
//     v1 endpoint only writes 'default' mode
//
// Mounted by server.js at: /api/users/me/dispatch-hours
// Behind: verifiedGate (auth + requireEmailVerified)

'use strict';

const express = require('express');
const router = express.Router();
const User = require('../models/User');

// ── Validation ───────────────────────────────────────────────────────────

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const VALID_DAY_SET = new Set(VALID_DAYS);

/**
 * Parse HH:MM → minutes since midnight. Returns null on bad input.
 * Stricter than dispatchPolicy._parseHHMM (which is lenient by design for
 * legacy data) — at the write boundary we want zero garbage in storage.
 */
function _parseHHMM(s) {
  if (typeof s !== 'string' || !HHMM.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Validate a PATCH /me/dispatch-hours payload. Pure function — exported so
 * tests can drive every edge case without an HTTP layer.
 *
 * Contract:
 *   { enabled: false }
 *     - turns the dispatch-window gate OFF (24/7 SMS)
 *     - other fields ignored
 *     - patch: { 'onboarding.answers.dispatchHoursMode': null }
 *
 *   { enabled: true, open, close, days }
 *     - turns the gate ON in 'default' mode
 *     - open / close must be HH:MM and open < close (no overnight in v1)
 *     - days must be a non-empty array of valid day codes
 *     - patch: { dispatchHoursMode: 'default', dispatchHoursOpen, ...Close, dispatchDays }
 *
 * @param {object} body
 * @returns {{ ok: true, patch: object } | { ok: false, error: string, field?: string }}
 */
function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body required' };
  }
  if (typeof body.enabled !== 'boolean') {
    return { ok: false, error: 'enabled must be a boolean', field: 'enabled' };
  }

  if (body.enabled === false) {
    // Clear the gate. Leaves the configured open/close/days alone so the
    // user's prior window is preserved if they toggle back on later.
    // dispatchPolicy.isWithinDispatchHours returns permissive when mode
    // is unset, so unsetting the mode alone is sufficient.
    return {
      ok: true,
      patch: { 'onboarding.answers.dispatchHoursMode': null },
    };
  }

  // enabled === true — full window required.
  if (!HHMM.test(body.open || '')) {
    return { ok: false, error: 'open must be HH:MM (00:00–23:59)', field: 'open' };
  }
  if (!HHMM.test(body.close || '')) {
    return { ok: false, error: 'close must be HH:MM (00:00–23:59)', field: 'close' };
  }
  if (_parseHHMM(body.close) <= _parseHHMM(body.open)) {
    // Overnight windows (close < open) are not supported by the existing
    // dispatchPolicy implementation — the comparison is
    // `nowMin >= open && nowMin < close`. Rejecting at the write
    // boundary avoids storing a window that can never fire.
    return { ok: false, error: 'close must be later than open (overnight windows not supported yet)', field: 'close' };
  }
  if (!Array.isArray(body.days) || body.days.length === 0) {
    return { ok: false, error: 'days must be a non-empty array', field: 'days' };
  }
  if (body.days.length > 7) {
    return { ok: false, error: 'days has at most 7 entries', field: 'days' };
  }
  const seen = new Set();
  const cleaned = [];
  for (const d of body.days) {
    if (typeof d !== 'string') {
      return { ok: false, error: `days must contain strings`, field: 'days' };
    }
    const code = d.toLowerCase().trim();
    if (!VALID_DAY_SET.has(code)) {
      return { ok: false, error: `days contains invalid code '${d}' (expected one of: ${VALID_DAYS.join(', ')})`, field: 'days' };
    }
    if (seen.has(code)) continue; // tolerate accidental dupes from UI
    seen.add(code);
    cleaned.push(code);
  }

  return {
    ok: true,
    patch: {
      'onboarding.answers.dispatchHoursMode':  'default',
      'onboarding.answers.dispatchHoursOpen':  body.open,
      'onboarding.answers.dispatchHoursClose': body.close,
      'onboarding.answers.dispatchDays':       cleaned,
    },
  };
}

// ── Handler ──────────────────────────────────────────────────────────────

router.patch('/', async (req, res) => {
  const result = validatePayload(req.body);
  if (!result.ok) {
    return res.status(400).json({ msg: result.error, field: result.field || null });
  }

  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: result.patch },
      { new: true, runValidators: false }
    ).select('onboarding.answers');

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const a = user.onboarding?.answers || {};
    return res.json({
      msg: 'Dispatch hours updated',
      dispatchHours: {
        mode:  a.dispatchHoursMode || null,
        open:  a.dispatchHoursOpen || null,
        close: a.dispatchHoursClose || null,
        days:  Array.isArray(a.dispatchDays) ? a.dispatchDays : [],
      },
    });
  } catch (err) {
    console.error('[DispatchHours] PATCH error:', err.message);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
module.exports.validatePayload = validatePayload;
module.exports.VALID_DAYS = VALID_DAYS;
module.exports.HHMM = HHMM;
