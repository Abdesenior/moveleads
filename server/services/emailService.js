const { Resend } = require('resend');

// Lazy singleton — boots fine even if RESEND_API_KEY is missing locally
let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM     = process.env.EMAIL_FROM     || 'MoveLeads <support@moveleads.cloud>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'support@moveleads.cloud';
const SUPPORT  = process.env.EMAIL_SUPPORT  || 'support@moveleads.cloud';
const BILLING  = process.env.EMAIL_BILLING  || 'billing@moveleads.cloud';
const SUPPORT_PHONE = process.env.EMAIL_SUPPORT_PHONE || '+1 (307) 204-4792';

/** Shared email footer HTML */
function emailFooter({ billing = false } = {}) {
  return `
    <tr>
      <td style="background:#f8fafc;padding:22px 40px;border-top:1px solid #e2e8f0;">
        <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;text-align:center;">
          Questions? Email us at
          <a href="mailto:${SUPPORT}" style="color:#f97316;text-decoration:none;">${SUPPORT}</a>
          or call <a href="tel:+13072044792" style="color:#f97316;text-decoration:none;">${SUPPORT_PHONE}</a>
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
                  <p style="margin:0 0 28px;font-size:16px;color:#0f172a;line-height:1.6;font-weight:600;">
                    Verify your email to claim your <span style="color:#ea580c;">$50 free credit</span> and start booking jobs.
                  </p>
                  <a href="${verifyUrl}"
                     style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:10px;letter-spacing:0.3px;">
                    Verify my email
                  </a>
                  <p style="margin:20px 0 8px;font-size:13px;color:#475569;line-height:1.6;">
                    If you don't see this email, please check your <strong>spam</strong> or <strong>promotions</strong> folder.
                  </p>
                  <p style="margin:20px 0 8px;font-size:13px;color:#64748b;">
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

  console.log(`[EmailService] Attempting to send verification email to: ${toEmail}`);
  const { data, error } = await getResend().emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: [toEmail],
    subject: 'Verify your MoveLeads account',
    html,
  });

  if (error) {
    console.error(`[EmailService] Resend Error for ${toEmail}:`, error);
    throw new Error(`Resend error: ${error.message}`);
  }
  
  console.log(`[EmailService] Resend Success for ${toEmail}. ID: ${data?.id}`);
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

/**
 * Send a password reset email.
 */
async function sendPasswordResetEmail({ toEmail, resetLink }) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Reset your MoveLeads password</title>
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
                    🔐 Password Reset Request
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">
                    Reset your password
                  </p>
                  <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">
                    We received a request to reset the password for your MoveLeads account. Click the button below to set a new password.
                  </p>
                  <a href="${resetLink}"
                     style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:10px;letter-spacing:0.3px;">
                    Reset My Password
                  </a>
                  <p style="margin:28px 0 8px;font-size:13px;color:#64748b;">
                    Or copy and paste this link into your browser:
                  </p>
                  <p style="margin:0 0 28px;font-size:12px;color:#94a3b8;word-break:break-all;">
                    ${resetLink}
                  </p>
                  <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
                    This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password will not change.
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
    subject: 'Reset your MoveLeads password',
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

/**
 * Notify customer when a mover or admin replies to their complaint.
 */
async function sendMoverReplyEmail({ toEmail, customerName, replyText, conversationUrl }) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Update on your complaint</title>
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
                <td style="background:#3b82f6;padding:10px 40px;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#fff;letter-spacing:1px;text-transform:uppercase;">
                    💬 New Reply on Your Complaint
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">
                    Hi ${customerName}, you have a new reply
                  </p>
                  <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
                    The moving company has responded to your complaint:
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;margin-bottom:28px;">
                    <tr>
                      <td style="padding:16px 20px;">
                        <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">${replyText}</p>
                      </td>
                    </tr>
                  </table>
                  <a href="${conversationUrl}"
                     style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;letter-spacing:0.3px;">
                    View Conversation →
                  </a>
                  <p style="margin:28px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
                    You can reply directly through the link above. If you feel the issue is not being resolved, MoveLeads admins monitor all tickets.
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
    subject: 'Update on your complaint — MoveLeads',
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

async function sendAuctionWonEmail({ toEmail, companyName, finalPrice, lead, dashboardUrl }) {
  const route = lead.route || `${lead.originCity} → ${lead.destinationCity}`;
  const moveDate = lead.moveDate
    ? new Date(lead.moveDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'TBD';

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>You won a lead auction!</title>
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
                <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:10px 40px;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#fff;letter-spacing:1px;text-transform:uppercase;">
                    🏆 Auction Won
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;">
                    Congratulations, ${companyName}!
                  </p>
                  <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">
                    You won a lead auction. Your winning bid of <strong>$${finalPrice}</strong> has been deducted from your balance and the customer's contact details are now in your dashboard.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:28px;">
                    <tr>
                      <td style="padding:20px 24px;">
                        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.05em;">Lead Summary</p>
                        <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#0f172a;">${route}</p>
                        <p style="margin:0 0 4px;font-size:14px;color:#475569;">${lead.homeSize || ''} · Move Date: ${moveDate}</p>
                        <p style="margin:12px 0 0;font-size:18px;font-weight:800;color:#16a34a;">Winning bid: $${finalPrice}</p>
                      </td>
                    </tr>
                  </table>
                  <a href="${dashboardUrl}"
                     style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;letter-spacing:0.3px;">
                    View Customer Details →
                  </a>
                  <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
                    Call the customer as soon as possible — speed to lead is key to winning the job.
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
    subject: `🏆 You won a lead auction — $${finalPrice} · MoveLeads`,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

/**
 * Notify admin when a new verified lead is ready on the marketplace.
 * Only called after phone verification PASS — failed/rejected leads never trigger this.
 */
async function sendAdminLeadNotification(lead) {
  const resend = getResend();
  const moveDateStr = lead.moveDate
    ? new Date(lead.moveDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'Not specified';

  const { error } = await resend.emails.send({
    from: 'MoveLeads <noreply@moveleads.cloud>',
    to: ['admin@moveleads.cloud', 'amine@moveleads.cloud'],
    subject: `🔥 New Lead: ${lead.homeSize} | ${lead.originCity} → ${lead.destinationCity} | $${lead.price}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a2744; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="color: #FF6B35; margin: 0; font-size: 24px;">🔥 New Lead Submitted</h1>
          <p style="color: rgba(255,255,255,0.7); margin: 8px 0 0;">MoveLeads.cloud — Live Marketplace</p>
        </div>
        <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-size: 14px; width: 40%;">Customer Name</td>
              <td style="padding: 10px 0; font-weight: 600; color: #111827;">${lead.customerName}</td>
            </tr>
            <tr style="background: #f9fafb;">
              <td style="padding: 10px 8px; color: #6b7280; font-size: 14px;">Phone</td>
              <td style="padding: 10px 8px; font-weight: 600; color: #111827;">${lead.customerPhone}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Email</td>
              <td style="padding: 10px 0; font-weight: 600; color: #111827;">${lead.customerEmail || '—'}</td>
            </tr>
            <tr style="background: #f9fafb;">
              <td style="padding: 10px 8px; color: #6b7280; font-size: 14px;">Route</td>
              <td style="padding: 10px 8px; font-weight: 600; color: #111827;">${lead.originCity} (${lead.originZip}) → ${lead.destinationCity} (${lead.destinationZip})</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Home Size</td>
              <td style="padding: 10px 0; font-weight: 600; color: #111827;">${lead.homeSize}</td>
            </tr>
            <tr style="background: #f9fafb;">
              <td style="padding: 10px 8px; color: #6b7280; font-size: 14px;">Move Date</td>
              <td style="padding: 10px 8px; font-weight: 600; color: #111827;">${moveDateStr}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Distance</td>
              <td style="padding: 10px 0; font-weight: 600; color: #111827;">${lead.distance} (${lead.miles} miles)</td>
            </tr>
            <tr style="background: #f9fafb;">
              <td style="padding: 10px 8px; color: #6b7280; font-size: 14px;">Grade</td>
              <td style="padding: 10px 8px; font-weight: 700; color: #FF6B35; font-size: 18px;">${lead.grade}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Buy Now Price</td>
              <td style="padding: 10px 0; font-weight: 700; color: #111827; font-size: 20px;">$${lead.price}</td>
            </tr>
          </table>
          <div style="margin-top: 24px; text-align: center;">
            <a href="https://moveleads.cloud/admin" style="background: #FF6B35; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">View in Admin Panel →</a>
          </div>
        </div>
      </div>
    `
  });

  if (error) console.error('[AdminNotify] Failed to send admin lead notification:', error.message);
}

async function sendAdminNotification({ subject, html }) {
  try {
    await getResend().emails.send({
      from: 'MoveLeads <noreply@moveleads.cloud>',
      to: ['admin@moveleads.cloud', 'amine@moveleads.cloud'],
      subject,
      html
    });
    console.log('[AdminEmail] Sent:', subject);
  } catch (err) {
    console.error('[AdminEmail] Failed:', err.message);
  }
}

// ── Onboarding recovery emails ─────────────────────────────────────────────
async function sendOnboardingRecovery12h(user) {
  const html = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f7fa; padding:24px; color:#0f172a;">
      <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; border:1px solid #e2e8f0;">
        <p style="color:#ff6a14; font-size:11px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; margin:0 0 16px;">FIRST-TIME MOVER BONUS</p>
        <h1 style="font-size:28px; font-weight:800; line-height:1.2; margin:0 0 12px;">Hey ${user.companyName || 'there'} — your $50 onboarding credit is still here.</h1>
        <p style="color:#475569; font-size:15px; line-height:1.6;">You finished setting up your market coverage but didn't activate your balance. Verified move requests come into our system throughout the day — activate to start unlocking them in your service area.</p>
        <p style="margin:28px 0;">
          <a href="https://moveleads.cloud/dashboard?activate=1" style="display:inline-block; background:#ff6a14; color:#fff; padding:14px 26px; border-radius:12px; font-weight:800; text-decoration:none;">Claim my $50 credit →</a>
        </p>
        <p style="color:#94a3b8; font-size:13px; line-height:1.6;">Onboarding spots are limited per service area. No subscription. No contract. Credits never expire.</p>
      </div>
    </body></html>
  `;
  return getResend().emails.send({
    from: 'MoveLeads <noreply@moveleads.cloud>',
    replyTo: REPLY_TO,
    to: user.email,
    subject: `Your $50 onboarding credit is ready, ${user.companyName || 'mover'}`,
    html,
  });
}

async function sendOnboardingRecovery24h(user) {
  const primary = user.onboarding?.answers?.primaryMarket || 'your area';
  const html = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f7fa; padding:24px; color:#0f172a;">
      <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; border:1px solid #e2e8f0;">
        <p style="color:#ff6a14; font-size:11px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; margin:0 0 16px;">LIMITED ONBOARDING ACCESS</p>
        <h1 style="font-size:26px; font-weight:800; line-height:1.2; margin:0 0 12px;">Movers in your area are unlocking jobs.</h1>
        <p style="color:#475569; font-size:15px; line-height:1.6;">Onboarding remains open in your service area. Claim your free $50 unlock credit before spots fill up.</p>
        <p style="margin:28px 0;">
          <a href="https://moveleads.cloud/dashboard?activate=1" style="display:inline-block; background:#ff6a14; color:#fff; padding:14px 26px; border-radius:12px; font-weight:800; text-decoration:none;">Activate my $150 balance →</a>
        </p>
        <p style="color:#94a3b8; font-size:13px; line-height:1.6;">Refundable unused balance. No subscription. Credits never expire.</p>
      </div>
    </body></html>
  `;
  return getResend().emails.send({
    from: 'MoveLeads <noreply@moveleads.cloud>',
    replyTo: REPLY_TO,
    to: user.email,
    subject: `Movers in ${primary} are unlocking jobs`,
    html,
  });
}

async function sendOnboardingRecovery72h(user) {
  const html = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f7fa; padding:24px; color:#0f172a;">
      <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; border:1px solid #e2e8f0;">
        <h1 style="font-size:26px; font-weight:800; line-height:1.2; margin:0 0 12px;">Last call on your onboarding bonus.</h1>
        <p style="color:#475569; font-size:15px; line-height:1.6;">Want help configuring your market or have questions before activating? Reply to this email and a partner rep will help directly.</p>
        <p style="margin:28px 0;">
          <a href="https://moveleads.cloud/dashboard?activate=1" style="display:inline-block; background:#ff6a14; color:#fff; padding:14px 26px; border-radius:12px; font-weight:800; text-decoration:none;">Activate my $150 balance →</a>
        </p>
        <p style="color:#94a3b8; font-size:13px; line-height:1.6;">Or reply to this email — partner reps Mon–Sat 8am–8pm CT.</p>
      </div>
    </body></html>
  `;
  return getResend().emails.send({
    from: 'MoveLeads Partner Team <noreply@moveleads.cloud>',
    replyTo: REPLY_TO,
    to: user.email,
    subject: `Need help activating, ${user.companyName || 'mover'}?`,
    html,
  });
}

// ── Mid-wizard abandonment recovery (registered, started wizard, never reached Confirm) ──
async function sendOnboardingMidwizard12h(user) {
  const primary = user.onboarding?.answers?.primaryMarket || 'your area';
  const html = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f7fa; padding:24px; color:#0f172a;">
      <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; border:1px solid #e2e8f0;">
        <p style="color:#ff6a14; font-size:11px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; margin:0 0 16px;">PICK UP WHERE YOU LEFT OFF</p>
        <h1 style="font-size:26px; font-weight:800; line-height:1.2; margin:0 0 12px;">Hey ${user.companyName || 'there'} — your dispatch setup is half done.</h1>
        <p style="color:#475569; font-size:15px; line-height:1.6;">You started setting up your routing for ${primary} but didn't finish. Pick up where you left off — it takes about 90 seconds, and your $50 onboarding credit is waiting at the end.</p>
        <p style="margin:28px 0;">
          <a href="https://moveleads.cloud/dashboard/leads?onboarding=resume" style="display:inline-block; background:#ff6a14; color:#fff; padding:14px 26px; border-radius:12px; font-weight:800; text-decoration:none;">Finish my setup →</a>
        </p>
        <p style="color:#94a3b8; font-size:13px; line-height:1.6;">No subscription. No contract. Credits never expire.</p>
      </div>
    </body></html>
  `;
  return getResend().emails.send({
    from: 'MoveLeads <noreply@moveleads.cloud>',
    replyTo: REPLY_TO,
    to: user.email,
    subject: `Your dispatch setup is half done, ${user.companyName || 'mover'}`,
    html,
  });
}

async function sendOnboardingMidwizard24h(user) {
  const primary = user.onboarding?.answers?.primaryMarket || 'your service area';
  const html = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f7fa; padding:24px; color:#0f172a;">
      <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; border:1px solid #e2e8f0;">
        <p style="color:#ff6a14; font-size:11px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; margin:0 0 16px;">SETUP IN PROGRESS</p>
        <h1 style="font-size:26px; font-weight:800; line-height:1.2; margin:0 0 12px;">Verified moves are happening in ${primary}.</h1>
        <p style="color:#475569; font-size:15px; line-height:1.6;">Finish your dispatch setup to start receiving alerts. Most movers complete it in under 2 minutes.</p>
        <p style="margin:28px 0;">
          <a href="https://moveleads.cloud/dashboard/leads?onboarding=resume" style="display:inline-block; background:#ff6a14; color:#fff; padding:14px 26px; border-radius:12px; font-weight:800; text-decoration:none;">Resume my setup →</a>
        </p>
        <p style="color:#94a3b8; font-size:13px; line-height:1.6;">Or start with the smaller $50 starting balance — no onboarding bonus, but a low-commitment way to test the marketplace.</p>
      </div>
    </body></html>
  `;
  return getResend().emails.send({
    from: 'MoveLeads <noreply@moveleads.cloud>',
    replyTo: REPLY_TO,
    to: user.email,
    subject: `Verified moves are happening in ${primary}`,
    html,
  });
}

async function sendOnboardingMidwizard72h(user) {
  const html = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f7fa; padding:24px; color:#0f172a;">
      <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; border:1px solid #e2e8f0;">
        <h1 style="font-size:26px; font-weight:800; line-height:1.2; margin:0 0 12px;">Anything blocking you, ${user.companyName || 'there'}?</h1>
        <p style="color:#475569; font-size:15px; line-height:1.6;">You started signing up but didn't finish your dispatch setup. If something was unclear or your service area isn't covered yet, reply to this email — a partner rep will help directly.</p>
        <p style="margin:28px 0;">
          <a href="https://moveleads.cloud/dashboard/leads?onboarding=resume" style="display:inline-block; background:#ff6a14; color:#fff; padding:14px 26px; border-radius:12px; font-weight:800; text-decoration:none;">Finish my setup →</a>
        </p>
        <p style="color:#94a3b8; font-size:13px; line-height:1.6;">Or reply to this email — partner reps Mon–Sat 8am–8pm CT.</p>
      </div>
    </body></html>
  `;
  return getResend().emails.send({
    from: 'MoveLeads Partner Team <noreply@moveleads.cloud>',
    replyTo: REPLY_TO,
    to: user.email,
    subject: `Anything blocking your setup, ${user.companyName || 'mover'}?`,
    html,
  });
}

/**
 * Send a "matching move request" email to a mover whose CoverageArea +
 * preferences cover this lead. Mirrors broadcastLeadSMS — the mover already
 * passed the coverage + preference filter before this is called, so this
 * function trusts its inputs and just renders + sends.
 */
async function sendMatchingLeadEmail({ toEmail, companyName, lead }) {
  const resend = getResend();
  const moveDateStr = lead.moveDate
    ? new Date(lead.moveDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Flexible';
  const dashUrl = `https://moveleads.cloud/dashboard/leads`;
  const greeting = companyName ? `Hi ${companyName},` : 'Hi,';

  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    replyTo: REPLY_TO,
    headers: {
      'List-Unsubscribe': `<mailto:${SUPPORT}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    subject: `New move request: ${lead.originCity} → ${lead.destinationCity} · ${moveDateStr}`,
    html: `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:24px 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;">
        <tr><td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 6px 18px rgba(15,23,42,0.06);">
            <tr><td style="background:linear-gradient(180deg,#fff7ed,#ffffff);padding:24px 28px 18px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#ea580c;">Matching move request</p>
              <h1 style="margin:0;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.01em;">${lead.originCity} → ${lead.destinationCity}</h1>
              <p style="margin:6px 0 0;font-size:14px;color:#475569;">${greeting} a new request matches your service area.</p>
            </td></tr>
            <tr><td style="padding:18px 28px 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:40%;">Move date</td><td style="padding:8px 0;font-weight:700;color:#0f172a;font-size:14px;">${moveDateStr}</td></tr>
                <tr style="background:#f8fafc;"><td style="padding:8px 10px;color:#64748b;font-size:13px;">Home size</td><td style="padding:8px 10px;font-weight:700;color:#0f172a;font-size:14px;">${lead.homeSize || '—'}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Distance</td><td style="padding:8px 0;font-weight:700;color:#0f172a;font-size:14px;">${lead.distance || ''} ${lead.miles ? `(${lead.miles} miles)` : ''}</td></tr>
                ${lead.grade ? `<tr style="background:#f8fafc;"><td style="padding:8px 10px;color:#64748b;font-size:13px;">Grade</td><td style="padding:8px 10px;font-weight:800;color:#ea580c;font-size:16px;">${lead.grade}</td></tr>` : ''}
              </table>
            </td></tr>
            <tr><td style="padding:18px 28px 24px;text-align:center;">
              <a href="${dashUrl}" style="display:inline-block;background:#ff6a14;color:#ffffff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px;letter-spacing:-0.005em;">View in dashboard →</a>
              <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">Manage email alerts in Settings.</p>
            </td></tr>
            ${emailFooter()}
          </table>
        </td></tr>
      </table>
    `,
  });

  if (error) console.error('[LeadEmail] Failed to send matching lead email:', error.message);
}

/**
 * Broadcast a matching-lead email to all movers whose CoverageArea covers
 * the lead's origin or destination AND who have emailNotif enabled. Filters
 * by the same shared preference helper used for SMS. Non-blocking — errors
 * are logged but never propagate.
 */
async function broadcastLeadEmail(lead, { force = false } = {}) {
  console.log('[LeadEmail] Attempting to notify movers for lead:', lead._id);

  // Dedup guard — skip if this lead has already been broadcast unless force.
  if (lead.notifiedAt && !force) {
    console.log(`[Broadcast] lead ${lead._id} already notified, skipping`);
    return;
  }

  // Phase 6 — suppress email broadcasts of rejected leads to mirror feed +
  // SMS behavior. Required for parity: a mover who can't see the lead in
  // the dashboard shouldn't get an email about it.
  const { isHiddenFromMovers, hiddenReason, routingMode, recordBroadcastSuppressed } = require('../utils/leadVisibility');
  if (isHiddenFromMovers(lead)) {
    console.log(`[leadVisibility] suppressed email broadcast for ${lead._id}: ${hiddenReason(lead)} (mode=${routingMode()})`);
    recordBroadcastSuppressed();
    return;
  }

  try {
    const CoverageArea = require('../models/CoverageArea');
    const User = require('../models/User');
    const Lead = require('../models/Lead');
    const { doesLeadMatchMoverPreferences, doesLeadMatchMoverPreferencesStrict } = require('../utils/leadMatching');
    const { wantsChannel, matchesMoveTypes } = require('../utils/dispatchPolicy');
    const { strictMatchingEnabled } = require('../utils/strictMatchingFlag');
    const { logMatchShadow } = require('../utils/matchShadowLog');

    // 1. Candidate selection — mirrors broadcastLeadSMS exactly.
    //    Compute BOTH legacy and strict candidate sets; hydrate the union;
    //    shadow-log every (lead, mover) decision; use whichever set the
    //    STRICT_INTERSTATE_MATCHING flag selects.
    const strictMode = strictMatchingEnabled();

    const legacyZipMatchIds = await CoverageArea.distinct('company', {
      zipCode: { $in: [lead.originZip, lead.destinationZip].filter(Boolean) },
    });
    const legacyCandidateSet = new Set(legacyZipMatchIds.map(String));

    const pickupCoverageOriginIds = lead.originZip
      ? await CoverageArea.distinct('company', {
          zipCode: lead.originZip,
          type: { $in: ['origin', 'both'] },
        })
      : [];
    const pickupStateMatchIds = lead.originState
      ? await User.distinct('_id', {
          pickupStates: String(lead.originState).toUpperCase(),
          role: { $in: User.MOVER_ROLES },
        })
      : [];
    const originStrictSet = new Set([
      ...pickupCoverageOriginIds.map(String),
      ...pickupStateMatchIds.map(String),
    ]);

    const deliveryCoverageDestIds = lead.destinationZip
      ? await CoverageArea.distinct('company', {
          zipCode: lead.destinationZip,
          type: { $in: ['destination', 'both'] },
        })
      : [];
    const deliveryStateMatchIds = lead.destinationState
      ? await User.distinct('_id', {
          deliveryStates: String(lead.destinationState).toUpperCase(),
          role: { $in: User.MOVER_ROLES },
        })
      : [];
    const nationwideIds = await User.distinct('_id', {
      deliversNationwide: true,
      role: { $in: User.MOVER_ROLES },
    });
    const destStrictSet = new Set([
      ...deliveryCoverageDestIds.map(String),
      ...deliveryStateMatchIds.map(String),
      ...nationwideIds.map(String),
    ]);
    const strictCandidateSet = new Set(
      [...originStrictSet].filter(id => destStrictSet.has(id))
    );

    const unionIds = new Set([...legacyCandidateSet, ...strictCandidateSet]);
    if (!unionIds.size) {
      console.log('[LeadEmail] No companies cover this lead (legacy+strict both empty) — no email sent');
      return;
    }

    // 2. Hydrate candidates. Drop the `emailNotif: true` Mongo filter — the
    //    dispatch-policy helper now owns the channel decision. Hard filters
    //    that remain: not suspended, email present, AND email verified
    //    (new gate — we won't blast unverified inboxes). Pull the new
    //    pickup/delivery fields so the strict matcher can read them.
    const candidates = await User.find({
      _id:             { $in: Array.from(unionIds) },
      role:            { $in: User.MOVER_ROLES },
      isSuspended:     { $ne: true },
      isEmailVerified: true,
      email:           { $exists: true, $nin: ['', null] },
    }).select('email companyName smsNotif emailNotif isSuspended isEmailVerified maxDistance preferredHomeSizes deliversNationwide pickupStates deliveryStates serviceStates onboarding.answers').lean();
    if (!candidates.length) {
      console.log('[LeadEmail] No verified email candidates');
      return;
    }

    // 3. Per-candidate match decision + shadow log.
    const emptyZipSet = new Set();
    let legacyPassCount = 0;
    let strictPassCount = 0;
    // Optional per-candidate diagnosis trace, env-gated. Off by default;
    // turn on for short debugging windows only via MATCHER_DIAGNOSE_LOG=1.
    const diagnoseLog = process.env.MATCHER_DIAGNOSE_LOG === '1';
    const matched = candidates.filter(m => {
      const inLegacySet = legacyCandidateSet.has(String(m._id));
      const inStrictSet = strictCandidateSet.has(String(m._id));
      const passesLegacy = inLegacySet && doesLeadMatchMoverPreferences(lead, m, emptyZipSet);
      const passesStrict = inStrictSet && doesLeadMatchMoverPreferencesStrict(lead, m, {});
      if (passesLegacy) legacyPassCount++;
      if (passesStrict) strictPassCount++;
      logMatchShadow({ source: 'email', lead, mover: m, legacy: passesLegacy, strict: passesStrict });
      if (diagnoseLog) {
        const { diagnoseMatch, shortLogLine } = require('../utils/matcherDiagnosis');
        console.log(shortLogLine(diagnoseMatch(lead, m, { strictMode })));
      }

      const passesActive = strictMode ? passesStrict : passesLegacy;
      if (!passesActive) return false;

      if (!wantsChannel(m, 'email')) {
        console.log(`[LeadEmail] Drop ${m.companyName || m._id}: emailNotif=false (email notifications disabled)`);
        return false;
      }
      if (!matchesMoveTypes(m, lead)) {
        // matchesMoveTypes is intentionally dormant (always true) since PR-C4
        // retired the move-type filter. This branch cannot fire today; the
        // call site is kept as a structural placeholder per the retirement
        // lock-in tests.
        console.log(`[LeadEmail] Drop ${m.companyName || m._id}: move-type gate (dormant — should not fire)`);
        return false;
      }
      return true;
    });
    console.log(`[MatchShadow] source=email lead=${lead._id} candidates=${candidates.length} legacy_pass=${legacyPassCount} strict_pass=${strictPassCount} active=${strictMode ? 'strict' : 'legacy'}`);
    console.log(`[LeadEmail] ${unionIds.size} cover this lead (union of legacy+strict), ${candidates.length} candidates after gates, ${matched.length} pass full policy under active mode`);
    if (!matched.length) return;

    for (const mover of matched) {
      sendMatchingLeadEmail({ toEmail: mover.email, companyName: mover.companyName, lead })
        .catch(err => console.error('[LeadEmail] send failed:', err?.message));
    }

    // Mark lead as notified (atomic conditional — see broadcastLeadSMS for
    // the same pattern). One of SMS/email will win the race; the loser
    // no-ops because the filter on `notifiedAt: null` matches nothing.
    try {
      await Lead.updateOne(
        { _id: lead._id, notifiedAt: null },
        { $set: { notifiedAt: new Date() } }
      );
    } catch (e) {
      console.error('[LeadEmail] Failed to set notifiedAt:', e.message);
    }
  } catch (err) {
    console.error('[LeadEmail] broadcastLeadEmail error:', err.message);
  }
}

/**
 * Send a top-up receipt to the mover after a successful PaymentIntent.
 * Mirrors the admin notification but addressed to the partner. Strictly a
 * receipt — no marketing, no upsell.
 */
async function sendTopupReceiptEmail({ user, amount, balanceAfter, transactionId }) {
  const appUrl = process.env.CLIENT_URL || 'https://moveleads.cloud';
  const amt = Number(amount || 0);
  const bal = Number(balanceAfter || 0);
  const txnLine = transactionId ? `<p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">Transaction: ${transactionId}</p>` : '';

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Top-up confirmed</title>
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
                    ✓ Top-up Confirmed
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">
                    Thanks ${user.companyName || 'there'} — your top-up is in.
                  </p>
                  <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">
                    We received your payment of <strong>$${amt.toFixed(2)}</strong> and credited it to your MoveLeads balance. Your funds are available immediately — no waiting period.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:28px;">
                    <tr>
                      <td style="padding:20px 24px;">
                        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.5px;">Amount added</p>
                        <p style="margin:0 0 12px;font-size:28px;font-weight:800;color:#15803d;">+$${amt.toFixed(2)}</p>
                        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.5px;">New balance</p>
                        <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#0f172a;">$${bal.toFixed(2)}</p>
                        ${txnLine}
                      </td>
                    </tr>
                  </table>
                  <a href="${appUrl}/dashboard/billing"
                     style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;letter-spacing:0.3px;">
                    View Billing
                  </a>
                  <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
                    This email is a receipt. Keep it for your records.
                  </p>
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
    to: [user.email],
    subject: `Top-up confirmed — $${amt.toFixed(2)} added to MoveLeads`,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

/**
 * Send an activation receipt to the mover after a successful onboarding
 * activation PaymentIntent. If isBonusPath is true, explicitly mentions the
 * $50 + $50 onboarding credit. Otherwise just the paid amount.
 */
async function sendActivationReceiptEmail({ user, amountPaid, balanceAfter, isBonusPath }) {
  const appUrl = process.env.CLIENT_URL || 'https://moveleads.cloud';
  const paid = Number(amountPaid || 0);
  const bal = Number(balanceAfter || 0);

  const bonusBlock = isBonusPath
    ? `<p style="margin:0 0 12px;font-size:14px;color:#15803d;font-weight:700;">$${paid.toFixed(2)} paid + $${paid.toFixed(2)} onboarding credit applied.</p>`
    : `<p style="margin:0 0 12px;font-size:14px;color:#15803d;font-weight:700;">$${paid.toFixed(2)} paid and credited.</p>`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Activation confirmed</title>
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
                    ✓ Account Activated
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">
                    You're activated, ${user.companyName || 'partner'}.
                  </p>
                  <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                    Your MoveLeads account is live and ready for verified move requests in your service area.
                  </p>
                  ${bonusBlock}
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:28px;">
                    <tr>
                      <td style="padding:20px 24px;">
                        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.5px;">Balance ready</p>
                        <p style="margin:0;font-size:28px;font-weight:800;color:#15803d;">$${bal.toFixed(2)}</p>
                        <p style="margin:6px 0 0;font-size:12px;color:#94a3b8;">Available now — no waiting period.</p>
                      </td>
                    </tr>
                  </table>
                  <a href="${appUrl}/dashboard/leads"
                     style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;letter-spacing:0.3px;">
                    View Lead Feed
                  </a>
                  <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
                    This email is your activation receipt. Keep it for your records.
                  </p>
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
    to: [user.email],
    subject: `Activation confirmed — $${bal.toFixed(2)} balance ready`,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

/**
 * Send a welcome email after a new mover verifies their email. Confirms
 * they're now an active partner and points them at next-step actions.
 */
async function sendWelcomeEmail(user) {
  const appUrl = process.env.CLIENT_URL || 'https://moveleads.cloud';

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Welcome to MoveLeads</title>
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
                    Welcome aboard
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">
                    Welcome to MoveLeads, ${user.companyName || 'partner'}.
                  </p>
                  <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                    Your email is verified and your partner account is live. Here is what to do next:
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                    <tr>
                      <td style="padding:10px 0;font-size:14px;color:#0f172a;line-height:1.6;">
                        <strong>1.</strong> Finish the onboarding wizard — set your service area, home-size mix, and dispatch hours.
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:10px 0;font-size:14px;color:#0f172a;line-height:1.6;">
                        <strong>2.</strong> Claim your activation credit — $50 onboarding bonus on the $100 starter tier.
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:10px 0;font-size:14px;color:#0f172a;line-height:1.6;">
                        <strong>3.</strong> Verified move requests start landing in your dashboard — first call wins.
                      </td>
                    </tr>
                  </table>
                  <a href="${appUrl}/dashboard/leads"
                     style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;letter-spacing:0.3px;">
                    Go to Dashboard →
                  </a>
                  <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
                    Partner reps respond Mon–Sat 8am–8pm CT. Reply to this email or call the number below — we're here to help you ramp up.
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
    to: [user.email],
    subject: `Welcome to MoveLeads, ${user.companyName || 'partner'}`,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

/**
 * Send a lead-purchase receipt to the mover after a successful buy.
 * Fires from both the dashboard buy-now path (routes/bids.js) AND the
 * SMS Claim winner path (routes/twilio.js). The `channel` field tells
 * the mover (and the operator looking at the receipt later) WHICH path
 * the purchase came from — useful when reconciling against transaction
 * history.
 *
 * Fields:
 *   user          — { email, companyName }
 *   lead          — { _id, originCity, originState, destinationCity, destinationState }
 *   amount        — dollars charged for this lead
 *   balanceAfter  — mover's balance immediately after the debit
 *   channel       — 'dashboard' or 'sms_claim'
 *   purchasedAt   — Date (purchase timestamp)
 */
async function sendLeadPurchaseReceiptEmail({
  user,
  lead,
  amount,
  balanceAfter,
  channel,
  purchasedAt,
}) {
  const appUrl       = process.env.CLIENT_URL || 'https://moveleads.cloud';
  const supportEmail = REPLY_TO;
  const amt          = Number(amount || 0);
  const bal          = Number(balanceAfter || 0);
  const purchasedTs  = purchasedAt instanceof Date ? purchasedAt : new Date(purchasedAt || Date.now());
  const purchasedStr = purchasedTs.toLocaleString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

  const leadId      = lead && (lead._id || lead.id) ? String(lead._id || lead.id) : '—';
  const pickupCity  = (lead && lead.originCity)       || '—';
  const pickupState = (lead && lead.originState)      || '';
  const deliveryCity  = (lead && lead.destinationCity)  || '—';
  const deliveryState = (lead && lead.destinationState) || '';
  const pickupLine    = pickupState   ? `${pickupCity}, ${pickupState}`     : pickupCity;
  const deliveryLine  = deliveryState ? `${deliveryCity}, ${deliveryState}` : deliveryCity;

  const channelLabel = channel === 'sms_claim'
    ? 'SMS Claim'
    : channel === 'dashboard'
      ? 'Dashboard Buy-Now'
      : 'Lead Purchase';

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Lead purchase receipt</title>
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
                    ✓ Lead purchased — ${channelLabel}
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">
                    Receipt for ${user.companyName || 'your move'}
                  </p>
                  <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">
                    Your purchase is complete. Customer contact details are unlocked in your dashboard now — call within the first hour for the best close rate.
                  </p>

                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:20px 24px;">
                        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Route</p>
                        <p style="margin:0 0 14px;font-size:16px;font-weight:700;color:#0f172a;">
                          ${pickupLine} <span style="color:#94a3b8;">→</span> ${deliveryLine}
                        </p>
                        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Amount charged</p>
                        <p style="margin:0 0 14px;font-size:24px;font-weight:800;color:#0f172a;">$${amt.toFixed(2)}</p>
                        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Remaining balance</p>
                        <p style="margin:0;font-size:18px;font-weight:800;color:#16a34a;">$${bal.toFixed(2)}</p>
                      </td>
                    </tr>
                  </table>

                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:28px;">
                    <tr>
                      <td style="padding:16px 24px;">
                        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Lead ID</p>
                        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#475569;font-family:'SF Mono',Menlo,monospace;">${leadId}</p>
                        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Purchased</p>
                        <p style="margin:0 0 12px;font-size:13px;color:#475569;">${purchasedStr}</p>
                        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Channel</p>
                        <p style="margin:0;font-size:13px;color:#475569;">${channelLabel}</p>
                      </td>
                    </tr>
                  </table>

                  <a href="${appUrl}/dashboard/my-leads"
                     style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;letter-spacing:0.3px;">
                    Open in My Leads
                  </a>

                  <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
                    Questions about this purchase? Reply to this email or contact <a href="mailto:${supportEmail}" style="color:#475569;text-decoration:underline;">${supportEmail}</a>. Keep this receipt for your records.
                  </p>
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
    to: [user.email],
    subject: `Lead purchase receipt — $${amt.toFixed(2)} (${pickupLine} → ${deliveryLine})`,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

module.exports = {
  sendDisputeApprovedEmail, sendVerificationEmail, sendFeedbackRequestEmail,
  sendReviewRequestEmail, sendPasswordResetEmail, sendMoverReplyEmail,
  sendAuctionWonEmail, sendAdminLeadNotification, sendAdminNotification,
  sendOnboardingRecovery12h, sendOnboardingRecovery24h, sendOnboardingRecovery72h,
  sendOnboardingMidwizard12h, sendOnboardingMidwizard24h, sendOnboardingMidwizard72h,
  sendMatchingLeadEmail, broadcastLeadEmail,
  sendTopupReceiptEmail, sendActivationReceiptEmail, sendWelcomeEmail,
  sendLeadPurchaseReceiptEmail,
};
