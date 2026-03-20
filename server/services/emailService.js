const nodemailer = require('nodemailer');

/**
 * Lazy-initialised transporter. Created on first use so the server
 * still boots if SMTP vars are missing (they only matter when an email fires).
 */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true for port 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return _transporter;
}

/**
 * Send a "dispute approved — account credited" email to the mover.
 *
 * @param {Object} opts
 * @param {string} opts.toEmail       - Recipient address
 * @param {string} opts.companyName   - Mover's company name
 * @param {number} opts.refundAmount  - Dollar amount refunded
 * @param {string} opts.leadRoute     - Human-readable route string, e.g. "Austin → Dallas"
 */
async function sendDisputeApprovedEmail({ toEmail, companyName, refundAmount, leadRoute }) {
  const from = process.env.EMAIL_FROM || 'MoveLeads.io <no-reply@moveleads.io>';
  const appUrl = process.env.CLIENT_ORIGIN || 'https://app.moveleads.io';

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
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#0b1628 0%,#1a3154 100%);padding:32px 40px;">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
                    MoveLeads<span style="color:#f97316;">.io</span>
                  </p>
                </td>
              </tr>
              <!-- Green status bar -->
              <tr>
                <td style="background:#22c55e;padding:10px 40px;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#fff;letter-spacing:1px;text-transform:uppercase;">
                    ✓ Dispute Approved
                  </p>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">
                    Your account has been credited!
                  </p>
                  <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">
                    Hi ${companyName},<br/><br/>
                    Your lead dispute for the <strong>${leadRoute}</strong> move has been reviewed and <strong>approved</strong> by our team. A refund of <strong>$${refundAmount.toFixed(2)}</strong> has been added directly to your MoveLeads balance — no action needed.
                  </p>

                  <!-- Credit box -->
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

                  <p style="margin:32px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
                    If you have any questions, reply to this email or contact us at
                    <a href="mailto:support@moveleads.io" style="color:#f97316;">support@moveleads.io</a>.
                  </p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;">
                    © ${new Date().getFullYear()} MoveLeads.io · You are receiving this because you have an account with us.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await getTransporter().sendMail({
    from,
    to: toEmail,
    subject: `✓ Dispute Approved — $${refundAmount.toFixed(2)} credited to your MoveLeads account`,
    html
  });
}

module.exports = { sendDisputeApprovedEmail };
