const { Resend } = require('resend');

// Lazy singleton — boots fine even if RESEND_API_KEY is missing locally
let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM     = process.env.EMAIL_FROM     || 'MoveLeads <noreply@moveleads.cloud>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'support@moveleads.cloud';
const SUPPORT  = process.env.EMAIL_SUPPORT  || 'support@moveleads.cloud';
const BILLING  = process.env.EMAIL_BILLING  || 'billing@moveleads.cloud';

/** Shared email footer HTML */
function emailFooter({ billing = false } = {}) {
  return `
    <tr>
      <td style="background:#f8fafc;padding:22px 40px;border-top:1px solid #e2e8f0;">
        <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;text-align:center;">
          Questions? Email us at
          <a href="mailto:${SUPPORT}" style="color:#f97316;text-decoration:none;">${SUPPORT}</a>
        </p>
        ${billing ? `<p style="margin:0 0 6px;font-size:12px;color:#94a3b8;text-align:center;">Billing questions?
          <a href="mailto:${BILLING}" style="color:#f97316;text-decoration:none;">${BILLING}</a>
        </p>` : ''}
        <p style="margin:0;font-size:11px;color:#cbd5e1;text-align:center;">
          © ${new Date().getFullYear()} MoveLeads.cloud ·
          <a href="https://moveleads.cloud/privacy" style="color:#94a3b8;text-decoration:none;">Privacy Policy</a> ·
          <a href="https://moveleads.cloud/terms" style="color:#94a3b8;text-decoration:none;">Terms</a>
        </p>
      </td>
    </tr>`;
}

/**
 * Send a "dispute approved — account credited" email to the mover.
 */
async function sendDisputeApprovedEmail({ toEmail, companyName, refundAmount, leadRoute }) {
  const appUrl = process.env.CLIENT_URL || 'https://moveleads.cloud';

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Dispute Approved</title>
    </head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#0b1628 0%,#1a3154 100%);padding:32px 40px;">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
                    MoveLeads<span style="color:#f97316;">.cloud</span>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#22c55e;padding:10px 40px;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#fff;letter-spacing:1px;text-transform:uppercase;">
                    ✓ Dispute Approved
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">
                    Your account has been credited!
                  </p>
                  <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">
                    Hi ${companyName},<br/><br/>
                    Your lead dispute for the <strong>${leadRoute}</strong> move has been reviewed and <strong>approved</strong> by our team. A refund of <strong>$${refundAmount.toFixed(2)}</strong> has been added directly to your MoveLeads balance — no action needed.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:32px;">
                    <tr>
                      <td style="padding:20px 24px;">
                        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.5px;">Credit Applied</p>
                        <p style="margin:0;font-size:28px;font-weight:800;color:#15803d;">+$${refundAmount.toFixed(2)}</p>
                        <p style="margin:4px 0 0;font-size:12px;color:#86efac;">Available in your account now</p>
                      </td>
                    </tr>
                  </table>
                  <a href="${appUrl}/dashboard/billing"
                     style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;letter-spacing:0.3px;">
                    View My Balance
                  </a>
                </td>
              </tr>
              ${emailFooter({ billing: true })}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const { error } = await getResend().emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: [toEmail],
    subject: `✓ Dispute Approved — $${refundAmount.toFixed(2)} credited to your MoveLeads account`,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

/**
 * Send an email-verification email to a newly registered mover.
 */
async function sendVerificationEmail({ toEmail, companyName, token }) {
  const clientUrl = process.env.CLIENT_URL || 'https://moveleads.cloud';
  const verifyUrl = `${clientUrl}/verify-email?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Verify your MoveLeads Account</title>
    </head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#0b1628 0%,#1a3154 100%);padding:32px 40px;">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
                    MoveLeads<span style="color:#f97316;">.cloud</span>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f97316;padding:10px 40px;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#fff;letter-spacing:1px;text-transform:uppercase;">
                    ✉ Email Verification Required
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">
                    Welcome to MoveLeads, ${companyName}!
                  </p>
                  <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">
                    Thanks for signing up. Please verify your email address to activate your account and start receiving moving leads.
                  </p>
                  <a href="${verifyUrl}"
                     style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:10px;letter-spacing:0.3px;">
                    Verify My Email
                  </a>
                  <p style="margin:28px 0 8px;font-size:13px;color:#64748b;">
                    Or copy and paste this link into your browser:
                  </p>
                  <p style="margin:0 0 28px;font-size:12px;color:#94a3b8;word-break:break-all;">
                    ${verifyUrl}
                  </p>
                  <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
                    This link expires in <strong>24 hours</strong>. If you didn't create a MoveLeads account, you can safely ignore this email.
                  </p>
                </td>
              </tr>
              ${emailFooter()}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const { error } = await getResend().emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: [toEmail],
    subject: 'Verify your MoveLeads Account',
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

/**
 * Send a feedback/complaint request email to the customer.
 */
async function sendFeedbackRequestEmail({ toEmail, customerName, companyName, leadId, companyId }) {
  const clientUrl = process.env.CLIENT_URL || 'https://moveleads.cloud';
  const feedbackUrl = `${clientUrl}/feedback?leadId=${leadId}&companyId=${companyId}&name=${encodeURIComponent(customerName)}&email=${encodeURIComponent(toEmail)}`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>How was your move?</title>
    </head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#0b1628 0%,#1a3154 100%);padding:32px 40px;">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
                    MoveLeads<span style="color:#f97316;">.cloud</span>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">
                    Hi ${customerName}, how was your move?
                  </p>
                  <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">
                    We hope your recent moving experience with <strong>${companyName}</strong> went smoothly! We are dedicated to ensuring the highest quality in our network.
                  </p>
                  <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">
                    If you experienced any issues (damages, lateness, or unprofessional behavior), please click the button below to open a private resolution ticket.
                  </p>
                  <a href="${feedbackUrl}"
                     style="display:inline-block;background:linear-gradient(135deg,#0a192f,#1e3a5f);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:10px;letter-spacing:0.3px;">
                    Report an Issue
                  </a>
                </td>
              </tr>
              ${emailFooter()}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const { error } = await getResend().emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: [toEmail],
    subject: `How was your move with ${companyName}?`,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

/**
 * Send an automated review request after a completed move.
 */
async function sendReviewRequestEmail({ toEmail, customerName, companyName, reviewLink }) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Leave a review for ${companyName}</title>
    </head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#0b1628 0%,#1a3154 100%);padding:32px 40px;">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
                    MoveLeads<span style="color:#f97316;">.cloud</span>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">
                    Hi ${customerName}, thanks for choosing ${companyName}!
                  </p>
                  <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">
                    We hope you are settling into your new place nicely. If you had a great experience with your move, it would mean the world to us if you left a quick review. It only takes 60 seconds and helps other families find reliable movers!
                  </p>
                  <a href="${reviewLink}"
                     style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:10px;letter-spacing:0.3px;">
                    Leave a Review
                  </a>
                </td>
              </tr>
              ${emailFooter()}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const { error } = await getResend().emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: [toEmail],
    subject: `Share your experience with ${companyName} — leave a review!`,
    html,
  });

  if (error) console.error(`[Review Email] Resend error: ${error.message}`);
}

module.exports = { sendDisputeApprovedEmail, sendVerificationEmail, sendFeedbackRequestEmail, sendReviewRequestEmail };
