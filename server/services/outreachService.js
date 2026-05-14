/**
 * outreachService — strictly isolated from transactional emailService.
 *
 * Sender:  amin@hello.moveleads.cloud (subdomain `hello.moveleads.cloud`)
 * Purpose: cold founder outreach only (≤100/day target, hand-personalized).
 *
 * Why a separate module:
 *   Cold outreach has a non-trivial spam-complaint rate. Isolating it on
 *   the `hello.` subdomain protects transactional inbox placement on
 *   `moveleads.cloud` (verification, receipts, lead alerts, password reset).
 *   A spam complaint on a hello.* send hurts hello.* reputation only.
 *
 * Same Resend API key is reused (Resend supports multiple verified domains
 * per key). DO NOT mix outreach + transactional sends through emailService.js
 * — keep them in separate files so the boundary is obvious in code review.
 */
const { Resend } = require('resend');

let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM_NAME  = process.env.OUTREACH_FROM_NAME  || 'Amin from MoveLeads';
const FROM_EMAIL = process.env.OUTREACH_FROM_EMAIL || 'amin@hello.moveleads.cloud';
const REPLY_TO   = process.env.OUTREACH_REPLY_TO   || 'amin@hello.moveleads.cloud';

/**
 * Send one outreach email. Hand-driven only — no bulk loop helpers here on
 * purpose. If you find yourself wanting to send 50 in a tight loop, slow
 * down and use Resend's batch API OR move to a dedicated outreach tool.
 *
 * @param {object}  opts
 * @param {string}  opts.to        — recipient email
 * @param {string}  opts.subject   — subject line
 * @param {string}  [opts.html]    — html body
 * @param {string}  [opts.text]    — plain-text body (recommended alongside html)
 * @param {string}  [opts.replyTo] — override reply-to
 * @param {string}  [opts.tag]     — tag for Resend analytics ("founder_v1" etc.)
 * @returns {Promise<{ok:boolean, id?:string, error?:string}>}
 */
async function sendOutreach({ to, subject, html, text, replyTo, tag } = {}) {
  if (!to || !subject || (!html && !text)) {
    return { ok: false, error: 'sendOutreach requires { to, subject, html|text }' };
  }
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not set' };
  }

  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
      text,
      reply_to: replyTo || REPLY_TO,
      tags: [
        { name: 'stream',   value: 'outreach' },
        { name: 'campaign', value: tag || 'founder_v1' },
      ],
      headers: {
        // CAN-SPAM / list-unsubscribe friendliness even on 1-to-1 sends
        'List-Unsubscribe': `<mailto:${REPLY_TO}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (error) {
      console.error('[outreach] resend error:', error);
      return { ok: false, error: error.message || String(error) };
    }
    console.log(`[outreach] sent → ${to} (${data?.id || 'no-id'})`);
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[outreach] threw:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendOutreach };
