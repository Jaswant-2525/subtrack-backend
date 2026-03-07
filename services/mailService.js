/**
 * services/mailService.js
 * -----------------------
 * Thin wrapper around Nodemailer.
 *
 * Supports any SMTP provider. For Gmail, enable "App Passwords":
 *   https://support.google.com/accounts/answer/185833
 *
 * Required env vars:
 *   SMTP_HOST     – e.g. smtp.gmail.com
 *   SMTP_PORT     – 587 (STARTTLS) or 465 (SSL)
 *   SMTP_USER     – sender e-mail address
 *   SMTP_PASS     – app password / SMTP password
 *   EMAIL_FROM    – display name + address, e.g. "SubTrack <no-reply@example.com>"
 */

import nodemailer from 'nodemailer';

// Create the reusable transporter once at module load time.
// Nodemailer will pool connections so we don't open a new socket per email.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Sends a renewal-reminder email to a subscriber.
 *
 * @param {object} params
 * @param {string} params.toEmail      – recipient address
 * @param {string} params.name         – subscription name, e.g. "Netflix"
 * @param {number} params.amount       – cost, e.g. 15.99
 * @param {string} params.billingCycle – "monthly" | "yearly"
 * @param {Date}   params.dueDate      – the upcoming billing Date object
 */
export async function sendRenewalReminder({ toEmail, name, amount, billingCycle, dueDate }) {
  const formattedDate = dueDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
    timeZone: 'UTC',
  });

  const cycleLabel = billingCycle === 'yearly' ? 'year' : 'month';
  const amountStr  = `$${Number(amount).toFixed(2)}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Subscription Renewal Reminder</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0f2014;padding:28px 32px;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#3ddfa0;letter-spacing:-0.5px;">SubTrack</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">
                Renewal Reminder – 3 Days Away
              </p>
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#111827;line-height:1.3;">
                Your ${name} subscription<br/>renews on ${formattedDate}
              </h1>

              <!-- Subscription card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:13px;color:#6b7280;padding-bottom:12px;">Service</td>
                        <td align="right" style="font-size:13px;font-weight:600;color:#111827;padding-bottom:12px;">${name}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#6b7280;padding-bottom:12px;">Amount</td>
                        <td align="right" style="font-size:13px;font-weight:600;color:#111827;padding-bottom:12px;">${amountStr} / ${cycleLabel}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#6b7280;">Due date</td>
                        <td align="right" style="font-size:13px;font-weight:600;color:#111827;">${formattedDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                Make sure your payment method is up to date to avoid any service interruptions.
              </p>

              <p style="margin:0;font-size:13px;color:#9ca3af;">
                You're receiving this because you track this subscription in SubTrack.
                To stop these reminders, remove the subscription from your dashboard.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
              <span style="font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} SubTrack · Automated reminder</span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const info = await transporter.sendMail({
    from:    process.env.EMAIL_FROM || `"SubTrack" <${process.env.SMTP_USER}>`,
    to:      toEmail,
    subject: `⏰ Reminder: ${name} renews in 3 days (${amountStr})`,
    html,
  });

  return info.messageId;
}
