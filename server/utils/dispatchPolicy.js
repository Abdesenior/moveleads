// Dispatch-policy helpers.
//
// Single source of truth for "should we actually try to reach this mover
// through this channel right now?" — used by SMS, email, and socket
// broadcasts so onboarding answers (alertChannels, dispatchHours, moveTypes)
// finally make it to the dispatch path.
//
// Pure functions — no DB, no side effects. Caller must pass a hydrated user
// object (or lean doc) with the fields they care about. Lean-safe.

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Does the user want to receive alerts on this channel?
 *
 * Priority:
 *   1. Suspended users always return false.
 *   2. Legacy top-level flags are the SOLE source of truth:
 *        - 'sms'   → user.smsNotif
 *        - 'email' → user.emailNotif
 *        - 'call'  → always false (no user-model field; warm transfers
 *                    bypass this gate anyway — they're gated separately
 *                    in routes/voice.js)
 *
 * 2026-05-28 — PR-C3: alertChannels precedence retired.
 *   Until this PR, an `onboarding.answers.alertChannels` array took
 *   precedence over legacy smsNotif/emailNotif. No production UI ever
 *   wrote that array (the current onboarding wizard does not collect it,
 *   Settings does not write it), but legacy movers carried over from an
 *   earlier wizard version had it populated — which silently overrode
 *   their Settings toggles. Per the "no hidden backend prefs" principle
 *   (see memory: no-hidden-backend-prefs.md), the read is removed.
 *   The schema field stays dormant for historical compatibility (Mongoose
 *   would strip it on .save() if deleted, mutating historical records).
 *
 * @param {Object} user
 * @param {'sms'|'email'|'call'} channel
 * @returns {boolean}
 */
function wantsChannel(user, channel) {
  if (!user) return false;
  if (user.isSuspended === true) return false;
  if (channel === 'sms')   return user.smsNotif === true;
  if (channel === 'email') return user.emailNotif === true;
  return false;
}

/**
 * Parse 'HH:MM' → minutes-since-midnight. Returns null on bad input.
 */
function _parseHHMM(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  return h * 60 + mm;
}

/**
 * Is `now` inside the user's configured dispatch window for this channel?
 *
 * Channel semantics:
 *   - 'email' and 'socket' bypass the window entirely (don't disturb).
 *   - 'sms' and 'call' respect the window.
 *
 * TZ handling — Phase 1 limitation:
 *   The user model has no timezone field. We use the server's local clock
 *   as a stand-in for "the mover's now". This is wrong for distributed
 *   movers, but we ship it now and TODO it. When a TZ field lands on the
 *   user, pull it here.
 *   TODO(phase2): respect user.onboarding.answers.timezone once it exists.
 *
 * Defaults:
 *   - Users with no `dispatchHoursMode` at all are treated as 24/7 (legacy
 *     pre-onboarding partners — additive, not breaking).
 *   - `dispatchDays` empty → 7-day allow (don't filter on day-of-week).
 *
 * @param {Object} user
 * @param {'sms'|'call'|'email'|'socket'} channel
 * @param {Date} [now]
 * @returns {boolean}
 */
function isWithinDispatchHours(user, channel, now = new Date()) {
  // Email / socket: not "disturbing" channels — always allowed by hours.
  if (channel === 'email' || channel === 'socket') return true;

  const answers = user?.onboarding?.answers;
  // Legacy user with no onboarding payload → permissive 24/7.
  if (!answers || !answers.dispatchHoursMode) return true;

  const dowKey = DOW[now.getDay()];
  const days = Array.isArray(answers.dispatchDays) ? answers.dispatchDays : [];
  // Empty dispatchDays → 7-day allow (don't filter on day-of-week).
  if (days.length > 0 && !days.includes(dowKey)) return false;

  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (answers.dispatchHoursMode === 'advanced') {
    const slot = answers.dispatchHours?.[dowKey];
    if (!slot || !slot.open || !slot.close) return false; // no entry = closed
    const open = _parseHHMM(slot.open);
    const close = _parseHHMM(slot.close);
    if (open == null || close == null) return false;
    return nowMin >= open && nowMin < close;
  }

  // 'default' mode (same hours every day).
  const open = _parseHHMM(answers.dispatchHoursOpen);
  const close = _parseHHMM(answers.dispatchHoursClose);
  if (open == null || close == null) return true; // misconfigured — be permissive
  return nowMin >= open && nowMin < close;
}

/**
 * Map a lead to one of the onboarding moveType enum values.
 *
 * If the lead carries an explicit `moveType` field already, that wins.
 * Otherwise we derive from homeSize.
 *
 * homeSize enum in Lead.js (via validators/leadIngest.js) is currently:
 *   'Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom',
 *   '5+ Bedroom', '4+ Bedroom'
 * The onboarding mover moveTypes also includes 'office'/'commercial' and
 * other categories that the lead schema can't currently produce — those
 * cases fall through to null (which the matcher treats as "don't filter").
 *
 * 2026-05-26 — distance-as-category override removed.
 * Previously this function returned `'longDistance'` when
 * `lead.distance === 'Long Distance'`, before falling through to homeSize.
 * That conflated two orthogonal filters: distance is gated by
 * `User.maxDistance` (Settings), and `moveTypes` should only classify the
 * KIND of move (apartment/home/office), not its distance. The override
 * silently dropped long-distance leads for movers whose legacy
 * `onboarding.answers.moveTypes` array (from a prior onboarding wizard
 * version, no longer collected in the current UI) didn't include
 * `'longDistance'` — even when those movers explicitly set
 * `maxDistance=''` (Both) and `deliversNationwide=true`. The dashboard
 * "Matched for you" tab silently filtered such leads out of view.
 *
 * @param {Object} lead
 * @returns {'apartment'|'home'|'office'|'longDistance'|'packing'|'storage'|'emergency'|null}
 */
function derivedMoveType(lead) {
  if (!lead) return null;
  if (lead.moveType) return lead.moveType;

  const size = (lead.homeSize || '').toString().toLowerCase().trim();
  if (!size) return null;

  // Apartment-ish
  if (size === 'studio' || size.startsWith('1 bedroom') || size === '1_bedroom') {
    return 'apartment';
  }
  // House-ish
  if (size.startsWith('2 bedroom') ||
      size.startsWith('3 bedroom') ||
      size.startsWith('4 bedroom') ||
      size.startsWith('4+') ||
      size.startsWith('5 bedroom') ||
      size.startsWith('5+') ||
      size === 'house' ||
      size === '2_bedroom' || size === '3_bedroom' || size === '4+_bedroom') {
    return 'home';
  }
  // Office / commercial (not currently in lead enum, but defensive).
  if (size === 'office' || size === 'commercial') return 'office';

  return null;
}

/**
 * Does this lead match the mover's moveTypes preference (and not their
 * avoidMoveTypes)?
 *
 * Permissive defaults:
 *   - No moveTypes preference set → match (don't filter on unknown).
 *   - derivedMoveType is null → match (can't classify, don't filter).
 *
 * @param {Object} user
 * @param {Object} lead
 * @returns {boolean}
 */
function matchesMoveTypes(user, lead) {
  const prefs = user?.onboarding?.answers?.moveTypes;
  const avoids = user?.onboarding?.answers?.avoidMoveTypes;

  // No preference configured → no filter.
  if (!Array.isArray(prefs) || prefs.length === 0) return true;

  const derived = derivedMoveType(lead);
  if (!derived) return true;

  if (Array.isArray(avoids) && avoids.includes(derived)) return false;
  return prefs.includes(derived);
}

module.exports = {
  wantsChannel,
  isWithinDispatchHours,
  derivedMoveType,
  matchesMoveTypes,
};
