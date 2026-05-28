/* eslint-disable no-console */
/**
 * openClaimWindow — atomic claim-window opener for the SMS Claim pipeline
 * (PR-S5, Phase 4 scaffold).
 *
 * Generates a 4-char token (see utils/claimToken.js) and atomically attaches
 * an `open` claimWindow subdoc to a Lead. The write is conditional:
 *
 *   filter: { _id, 'claimWindow.status': { $nin: ['open', 'claimed'] } }
 *
 * This means we can open a window on:
 *   - a Lead with no claimWindow yet (status field absent → $nin matches)
 *   - a Lead whose previous window expired or was admin_revoked
 * but we will NOT clobber:
 *   - a window that is currently 'open' (in flight)
 *   - a window already 'claimed' (terminal — lead is locked to claimedBy)
 *
 * Token collisions are caught via E11000 on the unique-sparse index
 * `claimWindow_token_unique` (defined in models/Lead.js, installed by PR-S2
 * — see scripts/dropOldClaimWindowTokenIndex.js for the prod rollout step
 * that was required). On collision we generate a fresh token and retry,
 * up to MAX_TOKEN_RETRIES. A genuine collision in a 31^4 ≈ 924k namespace
 * is vanishingly rare even at high broadcast volume; the retry is a
 * correctness guarantee, not a hot path.
 *
 * Phase 4 contract — this function is the ONLY way Lead.claimWindow gets
 * populated. The inbound webhook (Phase 5 / PR-S3) flips status to 'claimed';
 * the cron (Phase 5 / PR-S4) flips it to 'expired'. Nothing else writes.
 *
 * @param {ObjectId|String} leadId
 * @param {Array<ObjectId|String>} recipientIds — movers being broadcast to.
 *   Stored on claimWindow.broadcastTo for forensics + the Phase 5 inbound
 *   handler's "is this sender a valid broadcast recipient?" check.
 * @param {Object} [opts]
 * @param {number} [opts.windowMinutes=10] — minutes until expiresAt.
 *   Lifted to a param so the cron job (PR-S4) and ad-hoc admin re-broadcasts
 *   can vary the window without code change.
 * @param {Function} [opts.now] — () => Date, injectable for tests.
 *
 * @returns {Promise<{ token: string, expiresAt: Date } | null>}
 *   - { token, expiresAt } on successful CAS
 *   - null if (a) the lead already has an open/claimed window, or
 *           (b) all retry attempts hit token collisions (effectively never).
 *   Callers MUST treat null as "do not include a token in the outbound SMS"
 *   and fall back to the generic broadcast body.
 */

const Lead = require('../models/Lead');
const { generateToken } = require('./claimToken');

const MAX_TOKEN_RETRIES = 5;
const DEFAULT_WINDOW_MINUTES = 10;

async function openClaimWindow(leadId, recipientIds = [], opts = {}) {
  const windowMinutes = Number(opts.windowMinutes) || DEFAULT_WINDOW_MINUTES;
  const nowFn = typeof opts.now === 'function' ? opts.now : () => new Date();

  for (let attempt = 1; attempt <= MAX_TOKEN_RETRIES; attempt++) {
    const token = generateToken();
    const openedAt = nowFn();
    const expiresAt = new Date(openedAt.getTime() + windowMinutes * 60 * 1000);

    try {
      const updated = await Lead.findOneAndUpdate(
        {
          _id: leadId,
          'claimWindow.status': { $nin: ['open', 'claimed'] },
        },
        {
          $set: {
            claimWindow: {
              status: 'open',
              openedAt,
              expiresAt,
              token,
              windowMinutes,
              broadcastTo: recipientIds,
            },
          },
        },
        { new: true, projection: { _id: 1, 'claimWindow.token': 1, 'claimWindow.expiresAt': 1 } }
      );

      if (!updated) {
        // Either the lead doesn't exist or it already has an open/claimed
        // window. Either way: not our window to open. Return null so the
        // caller falls back to a tokenless broadcast.
        return null;
      }

      return { token, expiresAt };
    } catch (err) {
      // E11000 = duplicate key on claimWindow_token_unique (token collision
      // across two parallel openClaimWindow calls on different leads).
      // Regenerate token and retry. Any other error propagates so the caller
      // can decide (broadcastLeadSMS wraps this in try/catch and continues
      // tokenless on error).
      const isDup = err && (err.code === 11000 || err.codeName === 'DuplicateKey');
      if (!isDup) throw err;
      console.warn(
        `[claimWindow] token collision attempt ${attempt}/${MAX_TOKEN_RETRIES} ` +
        `for lead ${leadId} (token=${token}). Retrying.`
      );
      // loop: regenerate token and try again
    }
  }

  // Exhausted retries. In a 31^4 namespace this is statistically near-zero;
  // log loudly because if it ever fires it means something else is wrong
  // (corrupted index, runaway broadcast loop, etc.).
  console.error(
    `[claimWindow] exhausted ${MAX_TOKEN_RETRIES} token-collision retries for lead ${leadId}. ` +
    `Returning null. Investigate claimWindow_token_unique index health.`
  );
  return null;
}

/**
 * findLeadByClaimToken — disambiguation read for PR-S3 inbound webhook.
 *
 * Returns the Lead bearing the given claim token IN ANY STATE (open,
 * claimed, expired). The inbound claim handler (routes/twilio.js) calls
 * this AFTER its atomic lead-flip CAS returns null, to disambiguate the
 * three loser outcomes:
 *
 *   - lead not found        → outcome 'rejected_unmatched_token'
 *   - status === 'claimed'  → outcome 'lost_already_claimed'
 *   - expiresAt <= now      → outcome 'lost_window_expired'
 *
 * Deliberately UNFILTERED — the disambiguation needs to see the state
 * regardless of status. Filtering by status would collapse the three
 * loser outcomes back into one and defeat the purpose.
 *
 * Cost is one indexed read on the unique-sparse `claimWindow_token_unique`
 * index from PR-S2 — only paid on the loser path. Happy-path claim does
 * not call this.
 *
 * @param {string} token
 * @returns {Promise<{ _id, claimWindow } | null>}
 */
async function findLeadByClaimToken(token) {
  if (!token) return null;
  return Lead.findOne({ 'claimWindow.token': token })
    .select('_id claimWindow')
    .lean();
}

module.exports = {
  openClaimWindow,
  findLeadByClaimToken,
  MAX_TOKEN_RETRIES,
  DEFAULT_WINDOW_MINUTES,
};
